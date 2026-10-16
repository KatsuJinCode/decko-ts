// The attachment HTTP surface: file serving plus the upload endpoint.
// Composed per request by the host (worker, staging server, tests) over the
// same seams the write engine exposes.
//
// GET serving — both URL shapes, under `files` (the files web path):
//   current:   GET /files/:mark/:rev_id(-:size).:format
//   DEPRECATED GET /files/:mark(-:size)-:rev_id.:format
// `<mark>` resolves ~<card id>, :<codename>, or the card name. :rev_id
// selects the current stored identifier directly (including historyless
// asset timestamps), otherwise the owned action whose db_content change
// names the historical bytes.
// The response carries the file's own Content-Type, `Expires` a year out,
// and an inline disposition (`attachment` when the request's format is
// literally "file"). A `-size` segment selects an image VARIANT; this
// surface serves the stored original's bytes for every variant, so both the
// -medium and -original spellings resolve.
//
// POST upload — the dedicated /:card/asset grammar: a multipart form with a
// `file`/`image` part (the card[file]/card[image] spellings are accepted
// too) posted to
//   POST /:mark/asset
// Existing file/image-typed card -> attachment UPDATE; missing mark ->
// card CREATE typed file/image (type from the form's `type` field, else the
// param name, else the sniffed content type). The POST /:mark create
// grammar belongs to src/server/write-routes.ts and is deliberately not
// claimed here.
//
// Named remainder (documented, not silently missing): per-request READ
// permission on file GETs when the host provides no canReadCard;
// cloud/web/custom coded storage serving (stock coded logo/favicon and
// ~local identifiers resolve to bytes); variant RESIZE bytes; public symlink management (a filesystem
// optimization the route replaces by direct serving).

import type { SQLDatabaseDriver } from "./driver.js";
import type { FetchEngine } from "../card/fetch.js";
import { CardActionError, type Actor } from "../card/actions/types.js";
import type { CardActionEngine } from "../card/actions/card-action-engine.js";
import {
  detectAttachmentContentType,
  detectAttachmentExtension,
  parseLocalAttachmentIdentifier,
} from "../card/attachments/attachment-content.js";
import type { AttachmentStore } from "../card/attachments/attachment-store.js";
import { decodeUriComponentSafe } from "./decode-uri-component-safe.js";
import { stockCodedFile } from "../card/attachments/stock-coded-files.js";

/** The db_content change-row field code (TRACKED_FIELDS index 2). */
const DB_CONTENT_FIELD = 2;

export interface FileRouteDeps {
  driver: SQLDatabaseDriver;
  fetchEngine: FetchEngine;
  attachmentStore: AttachmentStore;
  /** Resolve the request's actor (the session-token composition,
   *  actorFromToken — the same seam engine-for-session.ts exposes).
   *  A missing resolver reads as anonymous. */
  resolveActor?: (request: Request) => Promise<Actor | null>;
  /** Bind the actor into a CardActionEngine (engine-for-session's
   *  createCardActionEngineForSession at the composition site). */
  createEngine: (actor: Actor | null) => CardActionEngine;
  /** Optional read gate for file GETs (the files route reads a card, so the
   *  card's read rule applies per request). Not provided = serve (the
   *  public-gallery default; disclosed remainder). */
  canReadCard?: (cardId: number) => Promise<boolean> | boolean;
}

/** The one card row both routes need. */
interface ResolvedMark {
  id: number;
  name: string | null;
  key: string | null;
  typeId: number;
  dbContent: string | null;
  codename?: string | null;
}

/** The attachment route entry: null = this request is not an attachment
 *  route (the host falls through to its next handler). */
export async function handleAttachmentRoute(
  request: Request,
  deps: FileRouteDeps,
): Promise<Response | null> {
  const url = new URL(request.url);
  const segments = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  if (request.method === "GET" || request.method === "HEAD") {
    if (segments[0] !== "files" || segments.length < 2 || segments.length > 3) return null;
    return handleFileGet(segments, request, deps);
  }
  if (request.method === "POST") {
    // POST /:mark/asset — the dedicated upload grammar (module header).
    if (segments.length !== 2 || segments[1] !== "asset" || segments[0] === "") return null;
    if (segments[0] === "files") return null;
    return handleAttachmentUpload(segments[0], request, deps);
  }
  return null;
}

/** Stock mod files do not require an upload/object-storage binding. */
export async function handleStockCodedAttachmentRoute(request: Request, deps: Pick<FileRouteDeps, "driver" | "fetchEngine" | "canReadCard">): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const segments = new URL(request.url).pathname.replace(/\/+$/, "").split("/").slice(1);
  if (segments[0] !== "files") return null;
  const parsed = parseFileRouteSegments(segments.slice(1));
  if (parsed?.revId !== "carrierwave") return null;
  const card = await resolveMark(deps, parsed.mark);
  if (!card || (deps.canReadCard && !(await deps.canReadCard(card.id)))) return fileNotFound();
  return (await codedFileResponse(request, parsed, card, deps)) ?? fileNotFound();
}

// ---------------------------------------------------------------------------
// Serving — the current + deprecated /files routes.
// ---------------------------------------------------------------------------

/** One parsed /files request: the mark, the revision selector, the
 *  optional image variant, and the request format. */
export interface ParsedFileRequest {
  mark: string;
  revId: string;
  size?: string;
  format: string;
}

/** Parse the path segments after /files:
 *  2 segments = the current route (`:mark/:rev_id(-:size).:format`),
 *  1 segment = the DEPRECATED route (`:mark(-:size)-:rev_id.:format`).
 *  Marks never contain a dash under the route constraints, so dash-splitting
 *  is unambiguous. */
export function parseFileRouteSegments(segments: string[]): ParsedFileRequest | undefined {
  const decoded = segments.map((s) => decodeUriComponentSafe(s));
  if (decoded.length === 2) {
    const [mark, file] = decoded;
    const { stem, format } = splitFormat(file);
    const dash = stem.indexOf("-");
    if (dash === -1) return { mark, revId: stem, format };
    return { mark, revId: stem.slice(0, dash), size: stem.slice(dash + 1), format };
  }
  if (decoded.length === 1) {
    const { stem, format } = splitFormat(decoded[0]);
    const revDash = stem.lastIndexOf("-");
    if (revDash <= 0) return undefined; // no rev: not a file route
    const revId = stem.slice(revDash + 1);
    const head = stem.slice(0, revDash);
    const markDash = head.indexOf("-");
    if (markDash === -1) return { mark: head, revId, format };
    return { mark: head.slice(0, markDash), size: head.slice(markDash + 1), revId, format };
  }
  return undefined;
}

function splitFormat(name: string): { stem: string; format: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, format: "" };
  return { stem: name.slice(0, dot), format: name.slice(dot + 1) };
}

async function handleFileGet(
  segments: string[],
  request: Request,
  deps: FileRouteDeps,
): Promise<Response | null> {
  // parseFileRouteSegments parses the segments AFTER /files — the guard
  // above ran on the full segment list.
  const parsed = parseFileRouteSegments(segments.slice(1));
  if (parsed === undefined) return fileNotFound();
  const card = await resolveMark(deps, parsed.mark);
  if (card === undefined) return fileNotFound();

  if (deps.canReadCard !== undefined && !(await deps.canReadCard(card.id))) {
    // The read check on a file route; 404 (not 403) so the route never
    // confirms the existence of a hidden card's attachments.
    return fileNotFound();
  }

  const codedResponse = await codedFileResponse(request, parsed, card, deps);
  if (codedResponse !== undefined) return codedResponse;

  const revId = /^\d+$/.test(parsed.revId) ? Number.parseInt(parsed.revId, 10) : NaN;
  if (Number.isNaN(revId)) return fileNotFound();
  // File::SelectedAction skips history lookup for the current identifier
  // (card-mod-carrierwave set/type/file.rb:4-14). Asset outputs have no
  // history and use Time.now.to_i as this revision, not a card_actions id
  // (card-mod-assets set/right/asset_output.rb:9; card_mount.rb:71).
  const current = parseLocalAttachmentIdentifier(card.dbContent);
  let local: ReturnType<typeof parseLocalAttachmentIdentifier>;
  let actionComment: string | null = null;
  if (current?.cardId === card.id && current.actionId === revId) {
    local = current;
  } else {
    const action = await deps.driver
      .query<{ id: number; comment: string | null }>(
        "SELECT id, comment FROM card_actions WHERE id = ? AND card_id = ? LIMIT 1",
        [revId, card.id],
      )
      .then((r) => r.rows[0]);
    if (action === undefined) return fileNotFound();
    actionComment = action.comment;

    // Historical requests retain the owned action and its recorded content.
    // A create without change rows still uses the current column until its
    // first content update backfills the creation value.
    const changeRow = await deps.driver
      .query<{ value: string | null }>(
        "SELECT value FROM card_changes WHERE card_action_id = ? AND field = ? LIMIT 1",
        [revId, DB_CONTENT_FIELD],
      )
      .then((r) => r.rows[0]);
    local = parseLocalAttachmentIdentifier(changeRow?.value ?? card.dbContent);
  }
  // An identifier cannot make a readable mark address another card's bytes.
  if (local === undefined || local.cardId !== card.id) return fileNotFound();

  const bytes = await deps.attachmentStore.read(
    local.cardId,
    local.actionId,
    local.ext,
    parsed.size,
    // Stock *new file/*new image override upload_dir to tmp_upload_dir
    // (set/self/new_{file,image}.rb). Select the owning card's area;
    // never fall back across areas for an arbitrary historical identifier.
    card.codename === "new_file" || card.codename === "new_image" ? "tmp" : "files",
  );
  if (bytes === undefined) return fileNotFound();

  // Historyless assets have no action comment. Their stored extension is
  // the filename arm of CarrierWave's MIME detection (CSS/JS must not be
  // emitted as text/plain when nosniff is set).
  const contentType = detectAttachmentContentType(actionComment || safeFilename(card, local.ext), bytes, null);
  return fileResponse(request, parsed, card, local.ext, bytes, contentType);
}

function fileResponse(request: Request, parsed: ParsedFileRequest, card: ResolvedMark, ext: string, bytes: Uint8Array, contentType: string): Response {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(bytes.length));
  // The files routes serve explicit files, so the 1-year Expires header
  // ships.
  headers.set("Expires", httpDateOneYearOut());
  // Inline, except `attachment` when the request's format is literally
  // "file". The filename is the card's key plus the extension.
  headers.set(
    "Content-Disposition",
    `${parsed.format === "file" ? "attachment" : "inline"}; filename="${safeFilename(card, ext)}"`,
  );
  // UPLOADED-BYTES DEFENSES: both are response headers on this
  // one construction site, so neither can be bypassed by a route that forgot
  // them.
  //
  // X-Content-Type-Options: nosniff — the bytes here are whatever a user
  // uploaded, and the Content-Type is DERIVED from them
  // (detectAttachmentContentType). Without nosniff the browser is free to
  // ignore a declared type it considers wrong and sniff its own — which for
  // an upload is the attacker choosing the parser.
  headers.set("X-Content-Type-Options", "nosniff");
  //
  // Content-Security-Policy: sandbox — nosniff alone does NOT neutralize an
  // inline text/html or image/svg+xml body: the declared type is already
  // correct there, so there is nothing to sniff away, and script in the body
  // runs in the DECK'S OWN ORIGIN (stored XSS against every session cookie
  // and every card the visitor can read). `sandbox` with no allow-* token
  // puts the response in an opaque origin: scripts do not run, forms do not
  // submit, plugins do not load — and the SVG still renders as an image,
  // because an <img> is a passive context. Scoped to the two types that can
  // carry script; a PNG/JPEG/PDF response carries nothing to sandbox.
  if (isActiveContentType(contentType)) {
    headers.set("Content-Security-Policy", "sandbox");
  }
  return new Response(request.method === "HEAD" ? undefined : new Uint8Array(bytes), { headers });
}

async function codedFileResponse(request: Request, parsed: ParsedFileRequest, card: ResolvedMark, deps: Pick<FileRouteDeps, "driver">): Promise<Response | undefined> {
  const coded = stockCodedFile(card.dbContent, parsed.size);
  if (!coded) return undefined;
  // The requested card must own this current coded identifier.
  const owner = await deps.driver.query<{ id: number }>("SELECT id FROM cards WHERE codename = ? AND trash = 0", [coded.codename]);
  if (owner.rows[0]?.id !== card.id || parsed.revId !== "carrierwave" || parsed.format !== coded.extension) return fileNotFound();
  return fileResponse(request, parsed, card, coded.extension, coded.bytes, coded.extension === "svg" ? "image/svg+xml" : "image/png");
}

/** The served content types that can execute script in the deck's origin if
 *  an upload puts script in them. Compared on the media type alone, so
 *  `text/html; charset=utf-8` and `image/svg+xml` both match, and nothing
 *  else does. */
function isActiveContentType(contentType: string): boolean {
  const media = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return media === "text/html" || media === "image/svg+xml";
}

function safeFilename(card: ResolvedMark, ext: string): string {
  const key = card.key ?? card.name ?? "file";
  return `${key.replace(/[^a-z0-9_]+/g, "_")}${ext}`;
}

function httpDateOneYearOut(): string {
  return new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
}

function fileNotFound(): Response {
  return new Response("", { status: 404 });
}

// ---------------------------------------------------------------------------
// Upload — POST /:mark/asset.
// ---------------------------------------------------------------------------

const FILE_PARAM_NAMES = ["file", "image", "card[file]", "card[image]"] as const;

async function handleAttachmentUpload(
  rawMark: string,
  request: Request,
  deps: FileRouteDeps,
): Promise<Response> {
  const actor = deps.resolveActor ? await deps.resolveActor(request) : null;
  if (actor === null) {
    // The engine would reject with anonymous-actor; resolve first so the
    // denial carries the same 403 shape a permission error does without
    // touching the engine.
    return jsonResponse(403, { error: "permission denied", code: "anonymous-actor" });
  }
  const engine = deps.createEngine(actor);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: "multipart form body required" });
  }
  const paramName = FILE_PARAM_NAMES.find((name) => form.get(name) instanceof File);
  const file = paramName !== undefined ? (form.get(paramName) as File) : undefined;
  if (file === undefined) {
    return jsonResponse(400, { error: `missing upload part (${FILE_PARAM_NAMES.join(" | ")})` });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const originalFilename = file.name || "upload";
  const mark = decodeUriComponentSafe(rawMark);
  // The stored extension: both the upload body's URL and the engine's
  // identifier derive from it.
  const ext = detectAttachmentExtension(originalFilename, bytes);

  const existing = await resolveMark(deps, mark);

  if (existing !== undefined) {
    const typeCode = await typeCodeOf(deps, existing.typeId);
    if (typeCode !== "file" && typeCode !== "image") {
      return jsonResponse(400, {
        error: `card is not an attachment card (type code: ${typeCode ?? "unknown"})`,
      });
    }
    try {
      const result = await engine.updateCard({
        cardId: existing.id,
        attachment: { bytes, originalFilename, declaredContentType: file.type },
      });
      return jsonResponse(200, uploadBody(existing, result?.actionId, bytes.length, ext));
    } catch (error) {
      return actionError(error);
    }
  }

  // Create: the mark is the new card's name. Type resolution: the form's
  // `type` field, else the param name (`image`), else the sniffed content
  // type.
  const formType = (form.get("type") ?? form.get("card[type]") ?? "").toString().trim();
  const sniffed = detectAttachmentContentType(originalFilename, bytes, file.type);
  const typeCode =
    formType !== ""
      ? formType
      : paramName === "image" || sniffed.startsWith("image/")
        ? "image"
        : "file";
  if (typeCode !== "file" && typeCode !== "image") {
    return jsonResponse(400, { error: `unsupported upload type: ${typeCode}` });
  }
  try {
    const result = await engine.createCard({
      name: mark,
      typeCode,
      attachment: { bytes, originalFilename, declaredContentType: file.type },
    });
    return jsonResponse(
      201,
      uploadBody(
        { id: result.cardId, name: result.name?.s ?? mark, key: null, typeId: 0, dbContent: null },
        result.actionId,
        bytes.length,
        ext,
      ),
    );
  } catch (error) {
    return actionError(error);
  }
}

function uploadBody(card: ResolvedMark, actionId: number | undefined, size: number, ext: string) {
  return {
    name: card.name,
    id: card.id,
    action_id: actionId ?? null,
    size,
    // The render-side local URL: /files/<mark>/<revision><ext> with the mark
    // in the `~<card id>` form; the deprecated route serves the same file at
    // /files/<name>-<action_id><ext>.
    url: actionId !== undefined ? `/files/~${card.id}/${actionId}${ext}` : null,
    storage: "local",
  };
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Map the action engine's machine-readable rejections onto HTTP shapes:
 *  permission failures 403, validation conflicts 422, missing marks 404. */
function actionError(error: unknown): Response {
  if (error instanceof CardActionError) {
    switch (error.code) {
      case "anonymous-actor":
      case "permission-denied":
        return jsonResponse(403, { error: "permission denied", code: error.code });
      case "not-found":
        return jsonResponse(404, { error: error.message, code: error.code });
      case "name-conflict":
      case "name-illegal":
      case "rename-conflict":
      case "cycle":
      case "type-unknown":
      case "attachment-missing":
      case "protected-card":
      case "user-error":
      case "conflict": // a detected history conflict — a user error
        return jsonResponse(422, { error: error.message, code: error.code });
    }
  }
  throw error;
}

/** The type card's code (the codename registry): "file"/"image" for the
 *  attachment cardtypes, null when the type card carries no codename. */
async function typeCodeOf(deps: FileRouteDeps, typeId: number): Promise<string | null> {
  const row = await deps.driver
    .query<{ codename: string | null }>("SELECT codename FROM cards WHERE id = ?", [typeId])
    .then((r) => r.rows[0]);
  return row?.codename ?? null;
}

/** Mark resolution for both routes: `~<id>` by card id, `:<codename>` by
 *  codename, else by name. */
async function resolveMark(deps: Pick<FileRouteDeps, "driver" | "fetchEngine">, mark: string): Promise<ResolvedMark | undefined> {
  if (/^~\d+$/.test(mark)) {
    const row = await deps.driver
      .query<CardsRowLite>("SELECT * FROM cards WHERE id = ? AND trash = 0", [
        Number.parseInt(mark.slice(1), 10),
      ])
      .then((r) => r.rows[0]);
    return row === undefined ? undefined : wrapRow(row);
  }
  if (mark.startsWith(":")) {
    const row = await deps.driver
      .query<CardsRowLite>("SELECT * FROM cards WHERE codename = ? AND trash = 0", [mark.slice(1)])
      .then((r) => r.rows[0]);
    return row === undefined ? undefined : wrapRow(row);
  }
  const record = await deps.fetchEngine.fetchByName(mark);
  if (record === undefined || record.id === undefined) return undefined;
  return {
    id: record.id,
    name: record.name?.s ?? null,
    key: record.key ?? null,
    typeId: record.typeId ?? 0,
    dbContent: record.dbContent ?? null,
    codename: record.codename ?? null,
  };
}

interface CardsRowLite {
  id: number;
  name: string | null;
  key: string | null;
  type_id: number;
  db_content: string | null;
  codename?: string | null;
}

function wrapRow(row: CardsRowLite): ResolvedMark {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    typeId: row.type_id,
    dbContent: row.db_content,
    codename: row.codename ?? null,
  };
}
