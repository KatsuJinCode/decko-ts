// The attachment HTTP surface — E4.4.a's serving half plus the upload
// endpoint. Composed per request by the host (worker, staging server,
// tests) over the same seams the write engine exposes:
//
// GET serving (the P5 surface-inventory row, decko-0.20.0
// config/engine_routes.rb:9-13 — both shapes, `files` =
// config.files_web_path, default "files"):
//   current:   GET /files/:mark/:rev_id(-:size).:format
//   DEPRECATED GET /files/:mark(-:size)-:rev_id.:format
// `<mark>` resolves ~<card id>, :<codename>, or the card name (uploader
// doc, file_card_uploader.rb:114-121); :rev_id selects the ACTION whose
// db_content change names the stored file (SelectedAction revision
// semantics — the bytes of the revision, not always the card's current).
// Ruby serves through card#read with format :file (set/type/file.rb
// :66-106): Content-Type from the file, `Expires` 1 year out
// (:93-97 set_response_headers — the files routes pass explicit_file:
// true), disposition inline (`attachment` when the request's format is
// literally "file", :97-101). A `-size` segment selects an image VARIANT;
// this port serves the stored original's bytes for every variant (the
// mini_magick resize is the named remainder — variant URLs resolve, bytes
// pass through), so both the -medium and -original spellings resolve.
//
// POST upload — fork-added grammar (the dedicated /:card/asset POST):
// multipart form with a `file`/`image` part (Ruby's attachment param
// names, card[file]/card[image], accepted) to
//   POST /:mark/asset
// Existing file/image-typed card -> attachment UPDATE; missing mark ->
// card CREATE typed file/image (type from the form's `type` field, else
// the param name, else the sniffed content type). Ruby's own grammar is
// POST /:mark => card#create; that surface belongs to
// src/server/write-routes.ts and is deliberately not claimed here.
//
// Named remainder (documented, not silently missing): per-request READ
// permission on file GETs when the host provides no canReadCard; cloud/
// web/coded storage serving (only ~local identifiers resolve to bytes);
// variant RESIZE bytes; the upload-cache draft lifecycle (00_upload_cache.rb
// — the preliminary two-step editor flow); public symlink management
// (local.rb — a filesystem optimization the route replaces by direct
// serving).

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
  /** Optional read gate for file GETs (Ruby: the files route is card#read,
   *  so the card's read rule applies per request). Not provided = serve
   *  (the public-gallery default; disclosed remainder). */
  canReadCard?: (cardId: number) => Promise<boolean> | boolean;
}

/** The one card row both routes need. */
interface ResolvedMark {
  id: number;
  name: string | null;
  key: string | null;
  typeId: number;
  dbContent: string | null;
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

/** Parse the path segments after /files (engine_routes.rb:9-13):
 *  2 segments = the current route (`:mark/:rev_id(-:size).:format`),
 *  1 segment = the DEPRECATED route (`:mark(-:size)-:rev_id.:format`).
 *  Both marks are [^-]+ by the route constraints, so dash-splitting is
 *  unambiguous. */
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
  // parseFileRouteSegments parses the segments AFTER /files (its contract,
  // engine_routes.rb:9-13) — the guard above ran on the full segment list.
  const parsed = parseFileRouteSegments(segments.slice(1));
  if (parsed === undefined) return fileNotFound();
  const card = await resolveMark(deps, parsed.mark);
  if (card === undefined) return fileNotFound();

  if (deps.canReadCard !== undefined && !(await deps.canReadCard(card.id))) {
    // Ruby's read check on the card#read file route; 404 (not 403) so the
    // route never confirms the existence of a hidden card's attachments.
    return fileNotFound();
  }

  const revId = /^\d+$/.test(parsed.revId) ? Number.parseInt(parsed.revId, 10) : NaN;
  if (Number.isNaN(revId)) return fileNotFound();
  const action = await deps.driver
    .query<{ id: number }>(
      "SELECT id FROM card_actions WHERE id = ? AND card_id = ? LIMIT 1",
      [revId, card.id],
    )
    .then((r) => r.rows[0]);
  if (action === undefined) return fileNotFound();

  // The revision's identifier: its db_content change row when present
  // (update saves), else the card column (create saves carry no change
  // rows — the writer's first_create? lazy backfill; the column IS the
  // create's value until the first content update).
  const changeRow = await deps.driver
    .query<{ value: string | null }>(
      "SELECT value FROM card_changes WHERE card_action_id = ? AND field = ? LIMIT 1",
      [revId, DB_CONTENT_FIELD],
    )
    .then((r) => r.rows[0]);
  const identifier = changeRow?.value ?? card.dbContent ?? "";
  const local = parseLocalAttachmentIdentifier(identifier);
  if (local === undefined) return fileNotFound(); // web/cloud/coded: not served here

  const bytes = await deps.attachmentStore.read(
    local.cardId,
    local.actionId,
    local.ext,
    parsed.size,
  );
  if (bytes === undefined) return fileNotFound();

  // Ruby serves the file's content_type (args_for_send_file, set/type/
  // file.rb:82-87): the SanitizedFile detection order over the stored
  // bytes, with the action's original filename (the action comment) as
  // the by-path arm.
  const actionComment = await deps.driver
    .query<{ comment: string | null }>("SELECT comment FROM card_actions WHERE id = ?", [revId])
    .then((r) => r.rows[0]?.comment ?? null);
  const contentType = detectAttachmentContentType(actionComment ?? "", bytes, null);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(bytes.length));
  // set_response_headers (set/type/file.rb:93-97): the files routes carry
  // explicit_file: true, so the 1-year Expires header ships.
  headers.set("Expires", httpDateOneYearOut());
  // disposition (:97-101): inline, except `attachment` when the request's
  // format is literally "file". args_for_send_file's filename:
  // card.name.safe_key + extension (:84).
  headers.set(
    "Content-Disposition",
    `${parsed.format === "file" ? "attachment" : "inline"}; filename="${safeFilename(card, local.ext)}"`,
  );
  // UPLOADED-BYTES DEFENSES (round-9 fix; both are response headers on this
  // one construction site, so neither can be bypassed by a route that forgot
  // them).
  //
  // X-Content-Type-Options: nosniff — the bytes here are whatever a user
  // uploaded, and the Content-Type is DERIVED from them
  // (detectAttachmentContentType, the SanitizedFile order). Without nosniff
  // the browser is free to ignore a declared type it considers wrong and
  // sniff its own — which for an upload is the attacker choosing the parser.
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
    // denial carries the same 403 shape Ruby's permission error does
    // without touching the engine.
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
  // The stored extension (FileCardUploader#extension): both the upload body's
  // URL and the engine's identifier derive from it.
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

  // Create: the mark is the new card's name (Ruby: POST /:mark =>
  // card#create). Type resolution: the form's `type` field, else the
  // param name (`image`), else the sniffed content type.
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
    // The render-side local URL — Ruby's url pattern
    // /files/<mark>/<revision><ext> with the mark in the `~<card id>` form
    // (file_card_uploader.rb doc :104-121, "Examples: ~22/33-medium.png");
    // the deprecated route serves the same file at
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

/** Map the action engine's machine-readable rejections onto Ruby's HTTP
 *  shapes: permission failures 403, validation conflicts 422, missing
 *  marks 404. */
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
      case "conflict": // detect_conflict (history events.rb:19-22) - a UserError
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

/** Mark resolution for both routes (uploader doc :114-121):
 *  `~<id>` by card id, `:<codename>` by codename, else by name. */
async function resolveMark(deps: FileRouteDeps, mark: string): Promise<ResolvedMark | undefined> {
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
  };
}

interface CardsRowLite {
  id: number;
  name: string | null;
  key: string | null;
  type_id: number;
  db_content: string | null;
}

function wrapRow(row: CardsRowLite): ResolvedMark {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    typeId: row.type_id,
    dbContent: row.db_content,
  };
}
