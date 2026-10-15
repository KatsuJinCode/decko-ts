// Endpoint tests for the attachment HTTP surface (src/server/file-routes.ts)
// — the E4.4.a gate contract, end to end over the REAL LocalSqliteDriver +
// FetchEngine + CardActionEngine + LocalAttachmentStore:
//
//   upload (multipart POST /:mark/asset)
//     -> bytes stored at Ruby's path scheme <files_dir>/<card_id>/<action_id><ext>
//     -> action rows present via the action engine (card_acts, card_actions
//        with the original-filename comment, card_changes db_content on updates)
//     -> served byte-identical at the current /files/:card/:action.:format route
//        AND the deprecated /files/:mark-:action.:format route
//     -> anonymous denied (403, nothing written)
//   content-type detection (magic bytes + by-extension) + size capture
//   image variants: named-remainder zero-dep pass-through (original bytes)
//   save enforcement: signed-in actor with rights succeeds; the canWrite
//     denial and the read gate map to Ruby's 403/404 shapes
//
// Self-contained storage boot (mirrors tests/card/actions/actions-test-storage.ts's
// pattern but local to tests/server — the actions harness documents a stream
// boundary and is not imported across it). All fixture content is synthetic
// (DATA RULE: no real reference-deck content).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import type { Actor, CanWriteHook } from "../../src/card/actions/types.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { handleAttachmentRoute, type FileRouteDeps } from "../../src/server/file-routes.js";
import { scratchDir } from "../support/scratch-dir.mjs";

// ---------------------------------------------------------------------------
// Storage boot + synthetic fixture seeds.
// ---------------------------------------------------------------------------

/** Quote/comment-aware SQL statement splitter (the DDL is multi-statement;
 *  the driver's query() takes one statement at a time). Trigger-aware since
 *  the deck_data_version freshness stamp (db/schema.sqlite.sql,
 *  [ENGINE-FRESHNESS]): a CREATE TRIGGER body carries ";" before its closing
 *  "END;" — while inside a body, ";" does not terminate the statement and
 *  the body ends at the bare word END. Kept in lockstep with the render and
 *  fetch streams' copies. */
function splitSqliteDdlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let inTriggerBody = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i] as string;
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < ddl.length && /[A-Za-z0-9_]/.test(ddl[j])) j++;
      const word = ddl.slice(i, j).toUpperCase();
      if (!inTriggerBody && word === "BEGIN" && /CREATE\s+TRIGGER/i.test(current)) {
        inTriggerBody = true;
      } else if (inTriggerBody && word === "END") {
        inTriggerBody = false;
      }
      current += ddl.slice(i, j);
      i = j - 1;
      continue;
    }
    if (ch === ";") {
      if (inTriggerBody) {
        current += ch;
        continue;
      }
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

async function queryAll<T = Record<string, unknown>>(
  driver: SQLDatabaseDriver,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await driver.query<T>(sql, params)).rows;
}

const FIXED_TS = "2026-09-01 00:00:00.000";

/** Insert one simple cards row directly (fixture seed, not under test).
 *  name/key go through DeckoName — the canonical key is inflected
 *  ("Meeting Notes" -> "meeting_note"), and fetchByName resolves marks
 *  through it (retrieve.rb's { key: mark_value } query). */
async function seedSimpleCard(
  driver: SQLDatabaseDriver,
  opts: { id: number; name: string; codename?: string; typeId: number; dbContent?: string },
): Promise<void> {
  const { DeckoName } = await import("../../src/card/name.js");
  const name = DeckoName.parse(opts.name);
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    [
      opts.id,
      name.s,
      name.key,
      opts.codename ?? null,
      FIXED_TS,
      FIXED_TS,
      opts.typeId,
      opts.dbContent ?? null,
    ],
  );
}

/** Insert one compound cards row directly (left_id/right_id columns). */
async function seedCompoundCard(
  driver: SQLDatabaseDriver,
  opts: { id?: number; leftId: number; rightId: number; typeId: number; dbContent?: string },
): Promise<void> {
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    [opts.id ?? null, opts.leftId, opts.rightId, FIXED_TS, FIXED_TS, opts.typeId, opts.dbContent ?? null],
  );
}

/** Deterministic clock: one writer operation = one second from T0. */
const T0 = Date.parse("2026-09-20T08:00:00.000Z");
function fakeClock(): () => Date {
  let ticks = 0;
  return () => new Date(T0 + ticks++ * 1000);
}

const CARDTYPE_ID = 3;
const RICH_TEXT_ID = 2;
const FILE_TYPE_ID = 30;
const IMAGE_TYPE_ID = 31;
const JOE: Actor = { id: 9, name: "Joe User" };
const ANON_ACCOUNT: Actor = { id: 2, name: "*anonymous" };
const IP = "192.0.2.7";

let driver: LocalSqliteDriver;
let fetchEngine: FetchEngine;
let filesDir: string;
let store: LocalAttachmentStore;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqliteDdlStatements(ddl)) {
    await driver.query(statement, []);
  }
  // The synthetic minimum the routes and engine touch: the codename-bearing
  // type cards (file/image among them) + the *all+*default rule card the
  // type-assignment walk reads + two attachment-typed cards to update.
  await seedSimpleCard(driver, { id: RICH_TEXT_ID, name: "RichText", codename: "basic", typeId: CARDTYPE_ID });
  await seedSimpleCard(driver, { id: CARDTYPE_ID, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE_ID });
  // *all is TYPED SET (typeId 300) — the who_can batch joins rule rows'
  // left cards on sets.type_id = the 'set' codename card's id
  // (view-task-rules.ts viewTaskPermissionStatements), so the fallback
  // rules resolve only when the set card is typed Set (the fixture's shape)
  await seedSimpleCard(driver, { id: 7, name: "*all", codename: "all", typeId: 300 });
  await seedSimpleCard(driver, { id: 8, name: "*default", codename: "default", typeId: CARDTYPE_ID });
  await seedCompoundCard(driver, { leftId: 7, rightId: 8, typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_ID });
  await seedSimpleCard(driver, { id: IMAGE_TYPE_ID, name: "Image", codename: "image", typeId: CARDTYPE_ID });
  // the write-rule machinery every real decko deck bootstraps (mirrors
  // actions-test-storage.ts seedStandardDeck rows 300-307): under the
  // deny-by-default write gate a rule-less deck refuses every save
  // (who_can -> [] -> among? -> false, permissions.rb:47-49/:100-118) —
  // the uploads under test need the *all fallbacks -> [[Anyone]].
  await seedSimpleCard(driver, { id: 300, name: "Set", codename: "set", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 301, name: "*create", codename: "create", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 302, name: "*update", codename: "update", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 303, name: "*delete", codename: "delete", typeId: RICH_TEXT_ID });
  await seedSimpleCard(driver, { id: 304, name: "Anyone", codename: "anyone", typeId: RICH_TEXT_ID });
  await seedCompoundCard(driver, { id: 305, leftId: 7, rightId: 301, typeId: 300, dbContent: "[[Anyone]]" });
  await seedCompoundCard(driver, { id: 306, leftId: 7, rightId: 302, typeId: 300, dbContent: "[[Anyone]]" });
  await seedCompoundCard(driver, { id: 307, leftId: 7, rightId: 303, typeId: 300, dbContent: "[[Anyone]]" });
  for (const ruleId of [305, 306, 307]) {
    await driver.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, 'anyone', 304, 'L', NULL)",
      [ruleId],
    );
  }
  await seedSimpleCard(driver, { id: 50, name: "Meeting Notes", typeId: FILE_TYPE_ID });
  await seedSimpleCard(driver, { id: 51, name: "Banner Art", typeId: IMAGE_TYPE_ID });

  filesDir = scratchDir("decko-ts-file-routes-test-");
  store = new LocalAttachmentStore(filesDir);
  fetchEngine = new FetchEngine(driver);
});

afterAll(() => {
  driver.close();
  rmSync(filesDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Harness: route deps over the real engine, bearer-token actor resolution.
// ---------------------------------------------------------------------------

const TOKENS = new Map<string, Actor>([
  ["joe-token", JOE],
  ["anon-acct-token", ANON_ACCOUNT],
]);

function actorResolver(request: Request): Promise<Actor | null> {
  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  return Promise.resolve(match ? (TOKENS.get(match[1] as string) ?? null) : null);
}

function makeDeps(
  opts: { canWrite?: CanWriteHook; canReadCard?: (cardId: number) => Promise<boolean> | boolean } = {},
): FileRouteDeps {
  return {
    driver,
    fetchEngine,
    attachmentStore: store,
    resolveActor: actorResolver,
    createEngine: (actor: Actor | null) =>
      new CardActionEngine(fetchEngine, {
        actor,
        ipAddress: IP,
        now: fakeClock(),
        canWrite: opts.canWrite ?? (async () => true),
        // The write path needs the SAME store the serving reads from — the
        // composition site's job (engine-for-session's opts pass-through).
        attachmentStore: store,
      }),
    canReadCard: opts.canReadCard,
  };
}

function uploadRequest(
  mark: string,
  partName: string,
  filename: string,
  bytes: Uint8Array,
  opts: { extraFields?: Record<string, string>; /** null = no Authorization header (anonymous session). */ auth?: string | null } = {},
): Request {
  const form = new FormData();
  form.append(partName, new File([bytes as BlobPart], filename));
  for (const [key, value] of Object.entries(opts.extraFields ?? {})) form.append(key, value);
  const headers: Record<string, string> = {};
  if (opts.auth !== null) headers.authorization = `Bearer ${opts.auth ?? "joe-token"}`;
  return new Request(`http://test.test/${encodeURIComponent(mark)}/asset`, {
    method: "POST",
    body: form,
    headers,
  });
}

async function bodyBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

/** Deterministic synthetic bytes: a fixed prefix + an LCG payload (binary,
 *  so byte-identity proves real storage, not string coincidence). */
function syntheticBytes(prefix: string, length: number): Uint8Array {
  const head = new TextEncoder().encode(prefix);
  const out = new Uint8Array(head.length + length);
  out.set(head);
  let state = 0x2545f491;
  for (let i = head.length; i < out.length; i++) {
    state = (Math.imul(state, 0x41c64e6d) + 0x3039) >>> 0;
    out[i] = state & 0xff;
  }
  return out;
}

const PDF_BYTES = syntheticBytes("%PDF-1.4\nsynthetic decko-ts fixture\n", 700);
// A real 64x48 RGB PNG (a deterministic gradient): an image card's upload
// is decoded and resized into its versions, so the bytes must be an image
// (a PNG signature over other bytes is refused, as the oracle refuses it).
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function gradientPng(w: number, h: number): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * (w * 3 + 1) + 1 + x * 3;
      raw[at] = (x * 4) & 255;
      raw[at + 1] = (y * 5) & 255;
      raw[at + 2] = 128;
    }
  }
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]));
}
const PNG_BYTES = gradientPng(64, 48);
const pngSize = (b: Uint8Array): [number, number] => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
};
const TXT_BYTES = new TextEncoder().encode("plain synthetic notes\nline two\n");

interface UploadBody {
  name: string;
  id: number;
  action_id: number;
  size: number;
  url: string | null;
  storage: string;
}

// ---------------------------------------------------------------------------
// The gate contract.
// ---------------------------------------------------------------------------

describe("POST /:mark/asset (multipart upload)", () => {
  it("create: stores bytes at Ruby's path scheme <files_dir>/<card_id>/<action_id><ext>, records action rows, captures size", async () => {
    const response = await handleAttachmentRoute(
      uploadRequest("Annual Report", "file", "quarterly-report.pdf", PDF_BYTES),
      makeDeps(),
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(201);
    const body = (await response?.json()) as UploadBody;

    // Size capture: the stored byte count, not the form's say-so.
    expect(body.size).toBe(PDF_BYTES.length);
    expect(body.storage).toBe("local");
    expect(body.id).toBeGreaterThan(0);
    expect(body.action_id).toBeGreaterThan(0);

    // The db_content identifier: ~<card_id>/<action_id><ext>
    // (file_card_uploader.rb:164-169).
    const identifier = `~${body.id}/${body.action_id}.pdf`;
    expect(body.url).toBe(`/files/~${body.id}/${body.action_id}.pdf`);
    const cardRow = await queryAll<{ db_content: string | null }>(
      driver,
      "SELECT db_content FROM cards WHERE id = ?",
      [body.id],
    );
    expect(cardRow[0]?.db_content).toBe(identifier);

    // Stored bytes at Ruby's path scheme — read straight off the filesystem
    // at files/<card_id>/<action_id><ext> and compare byte-for-byte.
    const storedPath = join(filesDir, String(body.id), `${body.action_id}.pdf`);
    expect(existsSync(storedPath)).toBe(true);
    const { readFile } = await import("node:fs/promises");
    expectBytesEqual(new Uint8Array(await readFile(storedPath)), PDF_BYTES);

    // Action rows via the action engine: one act by Joe, one create action
    // carrying the original filename as its comment (:save_original_filename,
    // attachment.rb:20-24). action_type 0 = create (action.rb:90-92).
    const actionRow = await queryAll<{
      card_id: number;
      card_act_id: number;
      action_type: number;
      draft: number;
      comment: string | null;
    }>(driver, "SELECT * FROM card_actions WHERE id = ?", [body.action_id]);
    expect(actionRow[0]?.card_id).toBe(body.id);
    expect(actionRow[0]?.action_type).toBe(0);
    expect(actionRow[0]?.draft).toBe(0);
    expect(actionRow[0]?.comment).toBe("quarterly-report.pdf");
    const actRow = await queryAll<{ actor_id: number; ip_address: string }>(
      driver,
      "SELECT actor_id, ip_address FROM card_acts WHERE id = ?",
      [actionRow[0]?.card_act_id ?? -1],
    );
    expect(actRow[0]?.actor_id).toBe(JOE.id);
    expect(actRow[0]?.ip_address).toBe(IP);

    // A create save leaves NO card_changes rows (first_create? lazy backfill,
    // history.rb:38-40 — the column IS the create's value).
    const changeRows = await queryAll(
      driver,
      "SELECT * FROM card_changes WHERE card_action_id = ?",
      [body.action_id],
    );
    expect(changeRows).toHaveLength(0);
  });

  it("update: replaces an existing file card's attachment, rewrites db_content to the new action id, records the db_content change row", async () => {
    const first = (await handleAttachmentRoute(
      uploadRequest("Meeting Notes", "file", "notes-v1.pdf", PDF_BYTES),
      makeDeps(),
    )) as Response;
    const firstBody = (await first.json()) as UploadBody;
    const secondBytes = syntheticBytes("%PDF-1.5\nreplacement fixture\n", 400);

    const second = (await handleAttachmentRoute(
      uploadRequest("Meeting Notes", "file", "notes-v2.pdf", secondBytes),
      makeDeps(),
    )) as Response;
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as UploadBody;
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.action_id).toBeGreaterThan(firstBody.action_id);

    // db_content rewritten to the FINAL action id (:correct_identifier,
    // attachment.rb:13-17).
    const identifier = `~${secondBody.id}/${secondBody.action_id}.pdf`;
    const cardRow = await queryAll<{ db_content: string | null }>(
      driver,
      "SELECT db_content FROM cards WHERE id = ?",
      [secondBody.id],
    );
    expect(cardRow[0]?.db_content).toBe(identifier);

    // The update action carries a db_content change row whose value is the
    // final identifier (field 2 = db_content per TRACKED_FIELDS, change.rb:25;
    // strings serialize as-is, change.rb serializeChangeValue).
    const changeRow = await queryAll<{ field: number; value: string }>(
      driver,
      "SELECT field, value FROM card_changes WHERE card_action_id = ? AND field = 2",
      [secondBody.action_id],
    );
    expect(changeRow[0]?.value).toBe(identifier);

    // action_type 1 = update; the comment is the NEW original filename.
    const actionRow = await queryAll<{ action_type: number; comment: string | null }>(
      driver,
      "SELECT action_type, comment FROM card_actions WHERE id = ?",
      [secondBody.action_id],
    );
    expect(actionRow[0]?.action_type).toBe(1);
    expect(actionRow[0]?.comment).toBe("notes-v2.pdf");

    // The new revision's bytes are on disk at the new path, byte-identical.
    const { readFile } = await import("node:fs/promises");
    const storedPath = join(filesDir, String(secondBody.id), `${secondBody.action_id}.pdf`);
    expectBytesEqual(new Uint8Array(await readFile(storedPath)), secondBytes);
  });
});

describe("GET /files serving (current + deprecated routes)", () => {
  it("current route /files/:card/:action.:format serves the stored bytes byte-identically with the detected content type", async () => {
    const upload = (await handleAttachmentRoute(
      uploadRequest("Meeting Notes", "file", "serve-me.pdf", PDF_BYTES),
      makeDeps(),
    )) as Response;
    const { id, action_id } = (await upload.json()) as UploadBody;

    const response = (await handleAttachmentRoute(
      // Ruby's url pattern: /files/<mark>/<revision><ext> with the
      // `~<card id>` mark form (file_card_uploader.rb doc :104-121,
      // "Examples: ~22/33-medium.png").
      new Request(`http://test.test/files/~${id}/${action_id}.pdf`),
      makeDeps(),
    )) as Response;
    expect(response.status).toBe(200);
    expectBytesEqual(await bodyBytes(response), PDF_BYTES);
    // %PDF magic bytes -> application/pdf (the identified-content-type arm
    // of SanitizedFile#content_type's detection order).
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    // Ruby's files-route headers: 1-year Expires, inline disposition
    // (set/type/file.rb:93-101 with explicit_file: true).
    expect(response.headers.get("Expires")).not.toBeNull();
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    expect(response.headers.get("Content-Length")).toBe(String(PDF_BYTES.length));
  });

  it("deprecated legacy route /files/:mark-:action.:format serves the same bytes", async () => {
    const upload = (await handleAttachmentRoute(
      uploadRequest("Meeting Notes", "file", "legacy-serve.pdf", PDF_BYTES),
      makeDeps(),
    )) as Response;
    const { id, action_id } = (await upload.json()) as UploadBody;
    expect(id).toBe(50);

    const response = (await handleAttachmentRoute(
      new Request(
        `http://test.test/files/${encodeURIComponent("Meeting Notes")}-${action_id}.pdf`,
      ),
      makeDeps(),
    )) as Response;
    expect(response.status).toBe(200);
    expectBytesEqual(await bodyBytes(response), PDF_BYTES);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("serves an image card's upload with magic-byte content type: the original at its two spellings, each version resized to ImageCardUploader's geometry", async () => {
    const upload = (await handleAttachmentRoute(
      uploadRequest("Banner Art", "image", "banner.png", PNG_BYTES),
      makeDeps(),
    )) as Response;
    expect(upload.status).toBe(200);
    const { id, action_id } = (await upload.json()) as UploadBody;

    // the original: byte-identical at the un-suffixed and -original spellings
    // version geometry (image_card_uploader.rb:16-27) for a 64x48 upload:
    // large/medium resize_to_limit (no enlargement), small resize_to_fit
    // 75x75 from medium (enlarged to 75x56), icon resize_and_pad 16x16.
    const expected: [string, [number, number] | "original"][] = [
      [`${action_id}.png`, "original"],
      [`${action_id}-original.png`, "original"],
      [`${action_id}-icon.png`, [16, 16]],
      [`${action_id}-small.png`, [75, 56]],
      [`${action_id}-medium.png`, [64, 48]],
      [`${action_id}-large.png`, [64, 48]],
    ];
    for (const [spelling, want] of expected) {
      const response = (await handleAttachmentRoute(
        new Request(`http://test.test/files/~${id}/${spelling}`),
        makeDeps(),
      )) as Response;
      expect(response.status, `variant spelling ${spelling}`).toBe(200);
      const bytes = await bodyBytes(response);
      if (want === "original") expectBytesEqual(bytes, PNG_BYTES);
      else expect(pngSize(bytes), `variant spelling ${spelling}`).toEqual(want);
      expect(response.headers.get("Content-Type"), `variant spelling ${spelling}`).toBe(
        "image/png",
      );
    }
  });

  it("refuses an image upload whose bytes are not an image (the oracle's 422 IMAGE: is missing)", async () => {
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...syntheticBytes("", 64)]);
    const upload = (await handleAttachmentRoute(
      uploadRequest("Not Art", "image", "fake.png", fake),
      makeDeps(),
    )) as Response;
    expect(upload.status).toBe(422);
  });

  it("detects content type for extensionless uploads (magic bytes) and text uploads (by-path)", async () => {
    // Extensionless name + PNG magic: extension sniffs from the magic bytes,
    // content type from the same signature.
    const png = (await handleAttachmentRoute(
      uploadRequest("Sniffed Image", "image", "upload", PNG_BYTES),
      makeDeps(),
    )) as Response;
    expect(png.status).toBe(201);
    const pngBody = (await png.json()) as UploadBody;
    expect(pngBody.url).toBe(`/files/~${pngBody.id}/${pngBody.action_id}.png`);
    const pngServe = (await handleAttachmentRoute(
      new Request(`http://test.test/files/~${pngBody.id}/${pngBody.action_id}.png`),
      makeDeps(),
    )) as Response;
    expect(pngServe.status).toBe(200);
    expect(pngServe.headers.get("Content-Type")).toBe("image/png");
    expectBytesEqual(await bodyBytes(pngServe), PNG_BYTES);

    // .txt by path: the guessed_safe arm serves text/plain.
    const txt = (await handleAttachmentRoute(
      uploadRequest("Plain Notes", "file", "notes.txt", TXT_BYTES),
      makeDeps(),
    )) as Response;
    expect(txt.status).toBe(201);
    const txtBody = (await txt.json()) as UploadBody;
    const txtServe = (await handleAttachmentRoute(
      new Request(`http://test.test/files/~${txtBody.id}/${txtBody.action_id}.txt`),
      makeDeps(),
    )) as Response;
    expect(txtServe.status).toBe(200);
    expect(txtServe.headers.get("Content-Type")).toBe("text/plain");
  });

  it("404s unknown marks, unknown actions, and non-local (web/coded) identifiers", async () => {
    const missing = (await handleAttachmentRoute(
      new Request("http://test.test/files/~99999/1.pdf"),
      makeDeps(),
    )) as Response;
    expect(missing.status).toBe(404);

    const noAction = (await handleAttachmentRoute(
      new Request("http://test.test/files/~50/999999.pdf"),
      makeDeps(),
    )) as Response;
    expect(noAction.status).toBe(404);

    // A change row whose db_content value is NOT a ~local identifier (a web
    // storage reference) resolves to no local bytes — the route 404s rather
    // than guess (only ~local identifiers are served here; cloud/web/coded
    // storage is the disclosed remainder).
    await seedSimpleCard(driver, { id: 60, name: "Web Ref", typeId: FILE_TYPE_ID });
    await driver.query(
      "INSERT INTO card_actions (id, card_id, card_act_id, super_action_id, action_type, draft, comment) VALUES (90, 60, NULL, NULL, 0, 0, NULL)",
      [],
    );
    await driver.query(
      "INSERT INTO card_changes (card_action_id, field, value) VALUES (90, 2, 'web/http://example.com/x.png')",
      [],
    );
    const nonLocal = (await handleAttachmentRoute(
      new Request("http://test.test/files/~60/90.png"),
      makeDeps(),
    )) as Response;
    expect(nonLocal.status).toBe(404);
  });
});

describe("save enforcement", () => {
  it("anonymous POST is denied 403 and writes nothing", async () => {
    const actionsBefore = (
      await queryAll<{ n: number }>(driver, "SELECT COUNT(*) AS n FROM card_actions")
    )[0]?.n;
    const cardsBefore = (
      await queryAll<{ n: number }>(driver, "SELECT COUNT(*) AS n FROM cards")
    )[0]?.n;

    const response = (await handleAttachmentRoute(
      uploadRequest("Sneaky Upload", "file", "sneaky.pdf", PDF_BYTES, { auth: null }),
      // auth: null = no Authorization header — resolveActor resolves the
      // anonymous session.
      makeDeps(),
    )) as Response;
    // uploadRequest does not set an Authorization header, so resolveActor
    // returns null — the anonymous session.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "anonymous-actor" });

    const actionsAfter = (
      await queryAll<{ n: number }>(driver, "SELECT COUNT(*) AS n FROM card_actions")
    )[0]?.n;
    const cardsAfter = (
      await queryAll<{ n: number }>(driver, "SELECT COUNT(*) AS n FROM cards")
    )[0]?.n;
    expect(actionsAfter).toBe(actionsBefore);
    expect(cardsAfter).toBe(cardsBefore);
  });

  it("a host account NAMED *anonymous carrying a real account id acts as THAT account (LOW-1: id-keyed, auth/proxy.rb:11 + auth/current.rb:43-47)", async () => {
    // Ruby keys actor identity on the id, not the name:
    // `@as_id = Card.id given_user` (auth/proxy.rb:11), signed_in? is
    // `current_id != AnonymousID` (auth/current.rb:43-47). So an account
    // NAMED *anonymous carrying a real account id is a SIGNED-IN account:
    // its upload is judged by the rules (this deck's *all fallbacks grant
    // Anyone) and attributed to id 2 itself.
    const form = new FormData();
    form.append("file", new File([PDF_BYTES as BlobPart], "anon-acct.pdf"));
    const request = new Request("http://test.test/Anon Upload/asset", {
      method: "POST",
      body: form,
      headers: { authorization: "Bearer anon-acct-token" },
    });
    const response = (await handleAttachmentRoute(request, makeDeps())) as Response;
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as UploadBody;
    const created = (
      await queryAll<{ creator_id: number }>(driver, "SELECT creator_id FROM cards WHERE id = ?", [id])
    )[0];
    expect(created?.creator_id).toBe(2); // its OWN account id — never an anonymous card's
  });

  it("a signed-in actor WITHOUT write rights is denied 403 (the canWrite seam)", async () => {
    const form = new FormData();
    form.append("file", new File([PDF_BYTES as BlobPart], "denied.pdf"));
    const request = new Request("http://test.test/Denied Upload/asset", {
      method: "POST",
      body: form,
      headers: { authorization: "Bearer joe-token" },
    });
    const response = (await handleAttachmentRoute(
      request,
      makeDeps({ canWrite: async () => false }),
    )) as Response;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "permission-denied" });
  });

  it("the file GET read gate 404s a card the actor cannot read (existence never confirmed)", async () => {
    const upload = (await handleAttachmentRoute(
      uploadRequest("Secret Notes", "file", "secret.pdf", PDF_BYTES),
      makeDeps(),
    )) as Response;
    const { id, action_id } = (await upload.json()) as UploadBody;

    const response = (await handleAttachmentRoute(
      new Request(`http://test.test/files/${id}/${action_id}.pdf`),
      makeDeps({ canReadCard: () => false }),
    )) as Response;
    expect(response.status).toBe(404);
  });
});

describe("current file identifiers without action history (stock compiled assets)", () => {
  const revision = 1789819200;
  const assets = [
    { id: 70001, name: "Compiled fixture style", fixtureId: 447, ext: ".css", mime: "text/css" },
    { id: 70002, name: "Compiled fixture script", fixtureId: 307, ext: ".js", mime: "text/javascript" },
  ];
  const fixtureBytes = (id: number, ext: string) => new Uint8Array(readFileSync(
    new URL(`../../reference-harness/fixtures/synthetic-v1/deck/files/${id}/${revision}${ext}`, import.meta.url),
  ));
  beforeAll(async () => {
    for (const asset of assets) {
      await seedSimpleCard(driver, { id: asset.id, name: asset.name, typeId: FILE_TYPE_ID, dbContent: `~${asset.id}/${revision}${asset.ext}` });
      await store.store({ cardId: asset.id, actionId: revision, ext: asset.ext, bytes: fixtureBytes(asset.fixtureId, asset.ext) });
    }
  });

  for (const asset of assets) {
    it(`serves the actual fixture ${asset.ext} bytes with browser-usable MIME and no action row`, async () => {
      expect(await queryAll(driver, "SELECT id FROM card_actions WHERE id = ?", [revision])).toEqual([]);
      const request = new Request(`http://test.test/files/~${asset.id}/${revision}${asset.ext}`);
      const response = (await handleAttachmentRoute(request, makeDeps({ canReadCard: () => true })))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(asset.mime);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expectBytesEqual(await bodyBytes(response), fixtureBytes(asset.fixtureId, asset.ext));
      const head = (await handleAttachmentRoute(new Request(request.url, { method: "HEAD" }), makeDeps()))!;
      expect(head.status).toBe(200);
      expect(head.headers.get("content-length")).toBe(String(fixtureBytes(asset.fixtureId, asset.ext).length));
      expect((await head.arrayBuffer()).byteLength).toBe(0);
    });
  }

  it("does not treat an arbitrary stored timestamp as a current or historical revision", async () => {
    await store.store({ cardId: assets[0].id, actionId: revision - 1, ext: ".css", bytes: fixtureBytes(447, ".css") });
    const response = (await handleAttachmentRoute(
      new Request(`http://test.test/files/~${assets[0].id}/${revision - 1}.css`), makeDeps(),
    ))!;
    expect(response.status).toBe(404);
  });

  it("does not let a readable card redirect local storage to another card", async () => {
    const id = 70003;
    await seedSimpleCard(driver, { id, name: "Forged local asset", typeId: FILE_TYPE_ID, dbContent: `~${assets[0].id}/${revision}.css` });
    const response = (await handleAttachmentRoute(
      new Request(`http://test.test/files/~${id}/${revision}.css`), makeDeps({ canReadCard: cardId => cardId === id }),
    ))!;
    expect(response.status).toBe(404);
  });

  it("rejects a foreign local identifier even behind a valid owned historical action", async () => {
    const upload = (await handleAttachmentRoute(uploadRequest("Owned history cannot alias private bytes", "file", "owned.pdf", PDF_BYTES), makeDeps()))!;
    const { id, action_id } = await upload.json() as UploadBody;
    const foreign = `~${assets[0].id}/${revision}.css`;
    await driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [foreign, id]);
    await driver.query("INSERT INTO card_changes (card_action_id, field, value) VALUES (?, 2, ?)", [action_id, foreign]);
    const response = (await handleAttachmentRoute(
      new Request(`http://test.test/files/~${id}/${action_id}.css`), makeDeps({ canReadCard: cardId => cardId === id }),
    ))!;
    expect(response.status).toBe(404);
  });

  it("rechecks the read gate on a previously readable current asset", async () => {
    let readable = true;
    const deps = makeDeps({ canReadCard: () => readable });
    const request = new Request(`http://test.test/files/~${assets[0].id}/${revision}.css`);
    expect((await handleAttachmentRoute(request, deps))!.status).toBe(200);
    readable = false;
    expect((await handleAttachmentRoute(request, deps))!.status).toBe(404);
  });

  it("still serves owned historical bytes after a later attachment replaces them", async () => {
    const original = (await handleAttachmentRoute(uploadRequest("History remains", "file", "history-v1.pdf", PDF_BYTES), makeDeps()))!;
    const first = await original.json() as UploadBody;
    const replacement = syntheticBytes("%PDF-1.5\nreplacement history\n", 400);
    expect((await handleAttachmentRoute(uploadRequest("History remains", "file", "history-v2.pdf", replacement), makeDeps()))!.status).toBe(200);
    const historical = (await handleAttachmentRoute(new Request(`http://test.test/files/~${first.id}/${first.action_id}.pdf`), makeDeps()))!;
    expect(historical.status).toBe(200);
    expectBytesEqual(await bodyBytes(historical), PDF_BYTES);
  });
});
