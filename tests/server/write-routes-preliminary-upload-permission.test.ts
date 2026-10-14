// The TWO-STEP upload's permission order: the
// fileupload request carries `attachment_upload` beside the file part
// (mod/carrierwave/assets/script/upload.js.coffee:14-17 posts
// {card[type_id], attachment_upload: card_name}), and card-mod-carrierwave
// answers it from the :prepare_to_validate stage, BEFORE the :validate stage
// where the permission check lives.
//
// Ruby, step for step:
//   - card/mod/core/set/all/result.rb:24-27 (abort) +
//     card/lib/card/director/run.rb:61-65 (run_stage_callbacks) +
//     card/lib/card/director.rb:191-193 (Director#abort) — the event
//     raises Card::Error::Abort, the director is flagged aborted, and
//     `valid_next_stage?` (run.rb:94-103) refuses every later stage.
//   - mod/carrierwave/set/abstract/attachment/00_upload_cache.rb:8-25
//     `event :prepare_attachment, :prepare_to_validate, on: :save, when:
//     :preliminary_upload?` — its body runs IN FULL first:
//       :9  save_original_filename  (the draft action's comment)
//       :10 write_identifier        (the draft's db_content change row)
//       :12 store_attachment!       (carrierwave writes the BYTES)
//       :13 store_card_changes      (mod/history/set/all/history/events.rb
//                                  :102-106 — the Card::Change rows)
//       :17 @current_action.update! draft: true, card_id: ...
//     then :18-24 `success << {...}` and `abort :success`.
//   - The :success abort does NOT roll back:
//     card/mod/core/set/all/result.rb:63-71
//     `with_transaction_returning_status` rescues the abort
//     (`abortable`), gets a truthy status, and skips
//     `raise ActiveRecord::Rollback` — the file on disk and the rows in the
//     database both persist. Its own comment says so: "rescues abort makes
//     it so that :success abortions do not rollback".
//   - `event :check_permissions, :validate`
//     (mod/permissions/set/all/permissions.rb:22-26) is the :validate stage,
//     index 2; :prepare_to_validate is index 1
//     (card/lib/card/director/stages.rb:5-8). The abort means it NEVER
//     RUNS. Nor does anything else check permission first: the controller
//     only signs the session in (decko/lib/card_controller.rb:20-23
//     before_actions; rest.rb:37-40 authenticate) and loads the card
//     (rest.rb:49-55 load_card — Card.uri_fetch, a retrieval, no ok? call).
//
// So in Ruby a user WITHOUT update permission on a File card, POSTing the
// fileupload request, gets 200 + the preview_editor html, a stored file at
// <files_dir>/<card_id>/<action_id><ext>, a draft card_actions row and its
// card_changes rows, and a card_acts row — with the permission check never
// consulted. On a create the same, into the tmp upload cache
// (00_upload_cache.rb:88-91 tmp_upload_dir,
// paths.rb:10-12 upload_dir's no-id arm).
//
// That is an unauthorised write to the deck's storage, so the port's
// stricter order is a security improvement and is kept (card-action-engine.ts
// :4166-4169 records the divergence in place). It is NOT yet listed in
// docs/SECURITY.md's approved divergences: that declaration is pending with
// the lead. This file pins the port's behaviour so a future parity pass
// cannot silently walk it back.
//
// WHAT IS PINNED HERE — the port's observable outcome for a denied
// preliminary upload, and the granted counterpart that proves the gate is
// the only difference:
//   1. a denied UPDATE: 403 + the permission-denied error body, and NO file
//      on disk, NO draft action, NO card_changes row, NO card_acts row, and
//      the target card's db_content untouched;
//   2. a denied CREATE (unsigned request, the anonymous actor): the same
//      refusal, with the tmp upload cache empty;
//   3. the granted UPDATE: 200 + the preview_editor html, the bytes stored,
//      the draft action filed on the card with card_id stamped and the
//      act's card_id NULL (write-path.ts:541-549), and the card's own
//      db_content NOT yet rewritten (the real save is the second step);
//   4. the granted CREATE: the bytes filed under the store's cache key
//      tmp/<cache card id>/<action id><ext> (paths.rb:10-12 is Ruby's
//      no-id arm). The port writes that key under the files root, not
//      Ruby's sibling tmp directory: a disclosed layout divergence, not
//      pinned here (see arm 4's note).
//
// The ordinary ONE-step upload is unaffected and matches Ruby: its bytes are
// stored at the :finalize stage (card_mount.rb:32-34 `store_#{column}!`),
// which runs after the :validate-stage permission check, so port
// card-action-engine.ts:2243 (assertCanWrite) precedes
// card-action-engine.ts:2825 (finalizeAttachment) exactly as Ruby orders
// them. Arm (5) pins that ordering over HTTP so the two-step divergence
// cannot be mistaken for a general inversion.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { trackedFieldIndex } from "../../src/card/history/change.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const SET_TYPE_ID = 2;
const FILE_TYPE_ID = 30;
const CACHE_CARD_ID = 60;
const LOCKED_FILE_ID = 40;
const OPEN_FILE_ID = 50;
const JOE_ID = 90;
const ANON_CARD_ID = 14;

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BYTES = new Uint8Array(321).fill(0x42, 16);
PNG_BYTES.set(PNG_MAGIC, 0);

/**
 * The rule deck (the multipart suite's shape, plus the two File cards and
 * the upload-cache card this arm needs):
 *   1 *all  2 Set  3 *update  4 *create  5 *delete
 *   6 Anyone  7 Anyone Signed In  8 *type  9 *self  18 *default
 *  10/11/12 *all+*update / *create / *delete -> [[Anyone Signed In]]
 *  13 *all+*default (typeId 2)
 *  14 Anonymous User codename anonymous   (the unsigned request's actor)
 *  30 File codename file                   (the attachment cardtype)
 *  40 Locked File + 41 Locked File+*self + 42 ...+*update [[Editor]]  (Joe denied)
 *  45 Editor
 *  50 Open File                            (Joe allowed by *all+*update)
 *  60 *new file codename new_file          (00_upload_cache.rb:75-78 upload_cache_card)
 *  90 Joe User
 */
async function seedPreliminaryDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 13, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(ANON_CARD_ID, "Anonymous User", { codename: "anonymous" });
  await byId(FILE_TYPE_ID, "File", { codename: "file", typeId: SET_TYPE_ID });
  await byId(45, "Editor");
  await byId(LOCKED_FILE_ID, "Locked File", { typeId: FILE_TYPE_ID, dbContent: "~40/4001.png" });
  await seedCard(s, { id: 41, leftId: LOCKED_FILE_ID, rightId: 9, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 42, leftId: 41, rightId: 3, dbContent: "[[Editor]]" });
  await seedReference(s, 42, 45, "editor");
  await byId(OPEN_FILE_ID, "Open File", { typeId: FILE_TYPE_ID, dbContent: "~50/5001.png" });
  await byId(CACHE_CARD_ID, "*new file", { codename: "new_file" });
  await byId(JOE_ID, "Joe User");
}

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  body: string | Uint8Array;
}

function buildMultipartBody(boundary: string, parts: MultipartPart[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename !== undefined ? `; filename="${part.filename}"` : "") +
      "\r\n";
    const contentType =
      part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "";
    chunks.push(encoder.encode(`--${boundary}\r\n${disposition}${contentType}\r\n`));
    chunks.push(typeof part.body === "string" ? encoder.encode(part.body) : part.body);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** The fileupload's own field set (upload.js.coffee:14-17 formData beside
 *  the file part), as the browser serializes it. */
function uploadParts(extra: MultipartPart[] = []): MultipartPart[] {
  return [
    {
      name: "card[file]",
      filename: "unauthorised.png",
      contentType: "image/png",
      body: PNG_BYTES,
    },
    { name: "card[type_id]", body: String(FILE_TYPE_ID) },
    // the .attachment_card_name input's NAME attribute — what formData
    // sends as attachment_upload (upload.js.coffee:12,16)
    { name: "attachment_upload", body: "card[file]" },
    ...extra,
  ];
}

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function call(
  base: string,
  path: string,
  parts: MultipartPart[],
  cookie?: string,
): Promise<CallResult> {
  const boundary = "----deckoTsUploadPermission";
  const headers: Record<string, string> = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
  };
  if (cookie !== undefined) headers["Cookie"] = cookie;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: buildMultipartBody(boundary, parts) as BodyInit,
    redirect: "manual",
  });
  const text = await res.text();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return { status: res.status, headers: responseHeaders, body: text };
}

/** Every stored file under the deck's files root, as the store keys it
 *  ("<card id>/<name>" for the files area, "tmp/<cache card id>/<name>" for
 *  the upload cache — attachment-store.ts keyFor). The sibling tmp
 *  directory is not walked: see the disclosed layout note at arm (4). */
function storedKeys(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(filesDir, "");
  return out.sort();
}

async function draftRows(): Promise<{ actions: number; changes: number; acts: number }> {
  const actions = await storage!.counting.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_actions WHERE draft = 1",
    [],
  );
  const changes = await storage!.counting.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card_changes ch
     JOIN card_actions a ON a.id = ch.card_action_id
     WHERE a.draft = 1`,
    [],
  );
  const acts = await storage!.counting.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_acts",
    [],
  );
  return {
    actions: actions.rows[0]?.n ?? 0,
    changes: changes.rows[0]?.n ?? 0,
    acts: acts.rows[0]?.n ?? 0,
  };
}

async function dbContentOf(cardId: number): Promise<string | null> {
  const rows = await storage!.counting.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return rows.rows[0]?.db_content ?? null;
}

let storage: RenderTestStorage | undefined;
let filesDir: string;

let joeToken = "";
let server: http.Server;
let baseUrl = "";
/** The preview_editor render seam — a stub: these arms pin the ORDER, not
 *  the html (the view bytes are pinned in card-mod-cwwrite-output-seam). */
const previewRenders: { name: string; opts: Record<string, unknown> }[] = [];

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedPreliminaryDeck(storage);

  // The store roots are laid out as a host would: <root>/files and its
  // sibling <root>/tmp (LocalAttachmentStore: the cache area roots at the
  // files directory's PARENT, 00_upload_cache.rb:88-91).
  filesDir = join(scratchDir("decko-ts-upload-permission-"), "files");

  const ctx: WriteRouteContext = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    attachmentStore: new LocalAttachmentStore(filesDir),
    renderPreviewEditor: async ({ name, opts }) => {
      previewRenders.push({ name, opts });
      return `<!-- preview_editor ${String(opts["original_filename"])} -->`;
    },
  };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;

  const bridge = await makeServer(storage, ctx, { get: "not-found", bodyBytes: true });
  server = bridge.server;
  baseUrl = bridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  storage?.close();
});

describe("the two-step upload's permission order (00_upload_cache.rb:8-25 vs permissions.rb:22-26)", () => {
  it("(1) a DENIED preliminary update: 403, and nothing at all is written or stored", async () => {
    // Locked File+*self+*update -> [[Editor]]; Joe is not an Editor, so
    // ok_to_update? (permissions.rb:148-153) denies. Ruby would have stored
    // the file and filed the draft rows at :prepare_to_validate and aborted
    // :success before the :validate stage ran (00_upload_cache.rb:12-13,17
    // + result.rb:63-71's no-rollback). The port refuses first: the file
    // never reaches storage and no row is written.
    const before = await dbContentOf(LOCKED_FILE_ID);
    const beforeRows = await draftRows();
    expect(storedKeys()).toEqual([]);

    const res = await call(baseUrl, "/update/Locked_File", uploadParts(), `decko_ts_session=${joeToken}`);

    expect(res.status).toBe(403); // Card::Error::PermissionDenied (error.rb:104)
    expect(res.body).toContain("permission-denied");
    // no preview_editor render — the request never reached the store
    expect(previewRenders).toHaveLength(0);
    // nothing on disk, in either area
    expect(storedKeys()).toEqual([]);
    // no rows: no draft action, no change row, no act
    expect(await draftRows()).toEqual(beforeRows);
    // and the target card is untouched (the identifier still names the old revision)
    expect(await dbContentOf(LOCKED_FILE_ID)).toBe(before);
  });

  it("(2) a DENIED preliminary CREATE (unsigned request): 403, and the tmp upload cache stays empty", async () => {
    // The anonymous session's actor IS the Anonymous codename card
    // (auth/current.rb:7-9 + proxy.rb:33-35); *all+*create -> [[Anyone
    // Signed In]] refuses it, so the create verdict denies. In Ruby this
    // request would have written into tmp_upload_dir
    // (00_upload_cache.rb:88-91, paths.rb:10-12) with no permission check
    // ever run.
    const beforeRows = await draftRows();
    const res = await call(baseUrl, "/create", uploadParts([{ name: "card[name]", body: "Sneaky File" }]));

    expect(res.status).toBe(403);
    expect(res.body).toContain("permission-denied");
    expect(previewRenders).toHaveLength(0);
    expect(storedKeys()).toEqual([]);
    expect(await draftRows()).toEqual(beforeRows);
  });

  it("(3) the GRANTED preliminary update: 200 + preview_editor, the bytes stored, the draft filed, the card NOT yet rewritten", async () => {
    // The counterpart that proves the gate is the only difference. Ruby:
    // prepare_attachment's body in full (00_upload_cache.rb:9-17), then
    // `success << {...}` / `abort :success` (:18-24) — no cards-row write,
    // so the FINAL save is still owed.
    const before = await dbContentOf(OPEN_FILE_ID);
    const beforeRows = await draftRows();

    const res = await call(baseUrl, "/update/Open_File", uploadParts(), `decko_ts_session=${joeToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("preview_editor unauthorised.png");
    expect(previewRenders).toHaveLength(1);
    expect(previewRenders[0]?.name).toBe("Open File");

    // the stored bytes: one file, the plain File-card shape
    // <action_id>.png under the card's own files directory
    // (attachment-store.ts keyFor; paths.rb:10-12 upload_dir's id arm)
    const keys = storedKeys();
    expect(keys).toHaveLength(1);
    const match = /^50\/(\d+)\.png$/.exec(keys[0] ?? "");
    expect(match).not.toBeNull();
    const stored = readFileSync(join(filesDir, "50", `${match?.[1]}.png`));
    expect(stored.length).toBe(PNG_BYTES.length);
    expect(Buffer.from(stored.subarray(0, 8)).equals(Buffer.from(PNG_MAGIC))).toBe(true);

    // one draft action filed on the card, its db_content change row, one act
    // whose card_id is NULL (write-path.ts:541-549)
    const rows = await storage!.counting.query<{
      id: number;
      card_id: number | null;
      draft: number;
      action_type: number;
      comment: string | null;
    }>("SELECT id, card_id, draft, action_type, comment FROM card_actions ORDER BY id", []);
    const drafts = rows.rows.filter((r) => r.draft === 1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.card_id).toBe(OPEN_FILE_ID);
    expect(drafts[0]?.comment).toBe("unauthorised.png"); // save_original_filename
    const change = await storage!.counting.query<{ value: string }>(
      "SELECT value FROM card_changes WHERE card_action_id = ? AND field = ?",
      [drafts[0]?.id, trackedFieldIndex("db_content")],
    );
    expect(change.rows[0]?.value).toBe(`~50/${match?.[1]}.png`); // write_identifier

    // the cards row is untouched: abort :success ends the save before any
    // column write, so db_content still names the PREVIOUS revision
    expect(await dbContentOf(OPEN_FILE_ID)).toBe(before);
    expect((await draftRows()).acts).toBe((beforeRows.acts ?? 0) + 1);
  });

  it("(4) the GRANTED preliminary CREATE: the bytes land in the tmp upload cache, not the deck's files", async () => {
    // A new card has no id, so upload_dir takes its tmp_upload_dir arm
    // (paths.rb:10-12, 00_upload_cache.rb:88-91) and the draft action is
    // filed on the *new file cache card (:16-17).
    const beforeRows = await draftRows();
    const res = await call(
      baseUrl,
      "/create",
      uploadParts([{ name: "card[name]", body: "Fresh Draft File" }]),
      `decko_ts_session=${joeToken}`,
    );

    expect(res.status).toBe(200);
    // the success target is the upload-cache card (00_upload_cache.rb:19)
    expect(previewRenders[previewRenders.length - 1]?.name).toBe("*new file");

    // Disclosed layout note: Ruby keeps the cache at files_base_dir("tmp")/
    // files/<cache card id> (00_upload_cache.rb:88-91), a sibling of files/.
    // The port's store keys it tmp/<cache card id>/<action id> under the
    // files root (attachment-store.ts store(): blobsFor is never used). The
    // pin is on the store's key, the one read() resolves; the sibling
    // location is not asserted.
    const keys = storedKeys();
    expect(keys).toHaveLength(2); // arm (3)'s file + this one
    expect(keys.filter((k) => /^tmp\/60\/\d+\.png$/.test(k))).toHaveLength(1);
    // the draft is filed on the CACHE card, not on a card of the new card's name
    // arm (3)'s draft (on card 50) is still present; the NEW draft is the one
    // filed on the cache card
    const rows = await storage!.counting.query<{ card_id: number | null; draft: number }>(
      "SELECT card_id, draft FROM card_actions WHERE draft = 1",
      [],
    );
    const cacheDrafts = rows.rows.filter((r) => r.card_id === CACHE_CARD_ID);
    expect(cacheDrafts).toHaveLength(1);
    expect((await draftRows()).acts).toBe((beforeRows.acts ?? 0) + 1);
  });

  it("(5) the ORDINARY one-step upload keeps Ruby's order: the denied save stores nothing", async () => {
    // No attachment_upload param -> the direct-save grammar, whose bytes are
    // stored at the :finalize stage (card_mount.rb:32-34), AFTER the
    // :validate-stage check_permissions. Ruby's permission check therefore
    // runs first here, exactly as the port runs it (assertCanWrite at
    // card-action-engine.ts:2243, finalizeAttachment at :2825). This arm
    // keeps the two-step divergence from reading as a general inversion.
    const before = await dbContentOf(LOCKED_FILE_ID);
    const res = await call(
      baseUrl,
      "/update/Locked_File",
      [
        {
          name: "card[file]",
          filename: "direct.png",
          contentType: "image/png",
          body: PNG_BYTES,
        },
        { name: "card[type_id]", body: String(FILE_TYPE_ID) },
        { name: "_method", body: "patch" },
      ],
      `decko_ts_session=${joeToken}`,
    );
    expect(res.status).toBe(403);
    expect(await dbContentOf(LOCKED_FILE_ID)).toBe(before);
    // nothing was stored under the denied card's id (arms (3)/(4) wrote
    // under 50 and the cache key only)
    expect(storedKeys().filter((k) => k.startsWith("40/"))).toEqual([]);
  });
});
