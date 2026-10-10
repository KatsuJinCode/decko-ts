// import-6.test.ts — the public, synthetic exercise of four claims about
// migrating a Ruby Decko deck into the port and about the storage the port
// runs on.
//
// Everything here is invented. DATA RULE: every card name, body, user,
// filename and upload byte in this file is synthetic text written for the
// test ("Alpha Sheet", "Manual", "Deckwright", "manual page two\n"). No real
// deck, no real account, no real upload, no network, no hosted service.
//
// What is reused, not reinvented:
//   - the dump builders            tests/migrate/synthetic-dump.ts
//   - the scratch-directory owner  tests/support/scratch-dir.mjs
//   - the shared SQL conformance   tests/server/drivers/conformance.ts
//   - the in-process Hrana v2 mock tests/server/drivers/mock-hrana-server.ts
//   - the real engine              src/card/fetch.ts + src/card/render.ts
// and the tool under test is always the shipped CLI, spawned as a child
// process exactly as the README documents it.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import {
  actionsInsert,
  actsInsert,
  cardsInsert,
  changesInsert,
  dumpFile,
  referencesInsert,
  sqlTuple,
  type SyntheticCard,
} from "../migrate/synthetic-dump.js";
import { parseTargetSchema } from "../../tools/migrate/import.mjs";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { LibSqlHttpAdapter } from "../../src/server/drivers/libsql-http.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { runDriverConformance } from "../server/drivers/conformance.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DDL_PATH = join(REPO_ROOT, "db", "schema.sqlite.sql");
const MIGRATE_CLI = join(REPO_ROOT, "tools", "migrate", "migrate.mjs");

// Cardtype ids, as a Ruby Decko dump carries them.
const SET = 2;
const BASIC = 4;
const ROLE = 9;
const USER = 11;
const FILE = 20;
const POINTER = 21;

// The deck's own rows. Ids are fixed so the assertions can name them.
const ALL_READ = 47;
const ALPHA = 48;
const BETA = 49;
const GAMMA = 50;
const GAMMA_SELF = 51;
const GAMMA_BODY = 52;
const MANUAL = 60;
const DECKWRIGHT = 53;
const FILLER = 600; // bulk, so an interrupted import stops part way through many batches

const ALPHA_BODY = "alpha sheet body";
const BETA_BODY = "beta sheet body";
const GAMMA_BODY_TEXT = "gamma sheet body";
const UPLOAD_TWO = "manual page two\n";
const UPLOAD_ONE = "manual page one\n";

/** The tables a mysqldump carries and the importer consumes: the ones the
 *  migration report compares for parity. Taken from that report rather than
 *  from the target DDL, which also lists engine-owned tables the dump never
 *  carries (auth_sessions, deck_data_version). */
const DUMP_TABLES = [
  "cards",
  "card_acts",
  "card_actions",
  "card_changes",
  "card_references",
];

/** The deck, as the rows a Ruby Decko mysqldump carries. A deck wide enough
 *  for the engine to serve it: the type cards, the default read rule, two
 *  readable pages, one compound (junction) card, and a File card whose
 *  uploads live in the files directory. */
function rubyDeckDump(extra: SyntheticCard[] = []): string {
  const cards: SyntheticCard[] = [
    { id: 1, name: "*all", codename: "all", typeId: SET },
    { id: 2, name: "Set", codename: "set" },
    { id: 3, name: "*read", codename: "read" },
    { id: BASIC, name: "Basic", codename: "basic" },
    { id: 5, name: "Anyone", codename: "anyone" },
    { id: 6, name: "Anonymous", codename: "anonymous" },
    { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" },
    { id: 8, name: "Administrator", codename: "administrator", typeId: ROLE },
    { id: ROLE, name: "Role", codename: "role" },
    { id: DECKWRIGHT, name: "Deckwright", codename: "deckwright", typeId: USER },
    { id: USER, name: "User", codename: "user" },
    { id: 12, name: "*account", codename: "account" },
    { id: 13, name: "*email", codename: "email" },
    { id: 14, name: "*members", codename: "members" },
    { id: 15, name: "*type", codename: "type" },
    { id: 16, name: "*self", codename: "self" },
    { id: 17, name: "*password", codename: "password" },
    { id: 18, name: "*salt", codename: "salt" },
    { id: 19, name: "*status", codename: "status" },
    { id: FILE, name: "File", codename: "file" },
    { id: POINTER, name: "Pointer", codename: "pointer" },
    // Everyone reads everything by default.
    { id: ALL_READ, name: "*all+*read", leftId: 1, rightId: 3, typeId: POINTER, dbContent: "[[Anyone]]" },
    { id: ALPHA, name: "Alpha Sheet", typeId: BASIC, dbContent: ALPHA_BODY, readRuleId: ALL_READ, readRuleClass: "*all", creatorId: DECKWRIGHT, updaterId: DECKWRIGHT },
    { id: BETA, name: "Beta Sheet", typeId: BASIC, dbContent: BETA_BODY, readRuleId: ALL_READ, readRuleClass: "*all" },
    // A compound card: the name exists only as left_id/right_id.
    { id: GAMMA, name: "Gamma Sheet", typeId: BASIC, dbContent: GAMMA_BODY_TEXT, readRuleId: ALL_READ, readRuleClass: "*all" },
    { id: GAMMA_SELF, name: "Gamma Sheet+*self", leftId: GAMMA, rightId: 16, typeId: SET, readRuleId: ALL_READ, readRuleClass: "*all" },
    { id: GAMMA_BODY, name: "Gamma Sheet+*body", leftId: GAMMA, rightId: 54, typeId: SET, dbContent: GAMMA_BODY_TEXT, readRuleId: ALL_READ, readRuleClass: "*all" },
    { id: 54, name: "*body", codename: "body", typeId: SET },
    // A File card on its second upload.
    { id: MANUAL, name: "Manual", typeId: FILE, dbContent: `~${MANUAL}/702.txt`, readRuleId: ALL_READ, readRuleClass: "*all" },
    ...extra,
  ];
  for (let i = 0; i < FILLER; i += 1) {
    cards.push({ id: 1000 + i, name: `Filler ${i}`, typeId: BASIC, dbContent: `filler body ${i}`, readRuleId: ALL_READ, readRuleClass: "*all" });
  }
  return dumpFile([
    cardsInsert(cards),
    actsInsert([
      { id: 500, cardId: ALPHA, actorId: DECKWRIGHT },
      { id: 501, cardId: MANUAL, actorId: DECKWRIGHT },
      { id: 502, cardId: MANUAL, actorId: DECKWRIGHT },
    ]),
    // id, card_id, card_act_id, super_action_id, action_type (0 create, 1 update), draft, comment
    actionsInsert([
      [600, ALPHA, 500, null, 0, 0, null],
      [701, MANUAL, 501, null, 0, 0, null],
      [702, MANUAL, 502, null, 1, 0, null],
    ]),
    // id, card_action_id, field (0 name, 1 type_id, 2 db_content), value
    changesInsert([
      [800, 600, 2, ALPHA_BODY],
      [801, 701, 2, `~${MANUAL}/701.txt`],
      [802, 702, 2, `~${MANUAL}/702.txt`],
    ]),
    // id, referer_id, referee_key, referee_id, ref_type, is_present
    referencesInsert([
      [900, GAMMA_SELF, "self", 16, "I", 1],
      [901, ALL_READ, "anyone", 5, "L", 1],
    ]),
  ]);
}

/** The Ruby deck's files directory: both uploads of Manual, plus a version
 *  file no card names (the tree moves whole). */
function writeRubyFiles(dir: string): void {
  mkdirSync(join(dir, String(MANUAL)), { recursive: true });
  writeFileSync(join(dir, String(MANUAL), "701.txt"), UPLOAD_ONE);
  writeFileSync(join(dir, String(MANUAL), "702.txt"), UPLOAD_TWO);
  writeFileSync(join(dir, String(MANUAL), "icon-702.txt"), "a version beside the original\n");
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run the shipped CLI exactly as the README documents it. */
function runMigrate(args: string[], env: NodeJS.ProcessEnv = {}): RunResult {
  const res = spawnSync(process.execPath, [MIGRATE_CLI, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
    env: { ...process.env, ...env },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** A scratch directory this run owns. tests/support/scratch-dir.mjs registers
 *  every one for removal when the file's tests finish. */
const newDir = (prefix: string): string => scratchDir(prefix);

/** Per-table row counts of a restored deck, for the tables the dump carried
 *  (the migration report names exactly those). */
function rowCounts(dbPath: string, tables: string[]): Record<string, number> {
  const db = new Database(dbPath);
  try {
    const out: Record<string, number> = {};
    for (const table of tables) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      out[table] = row.n;
    }
    return out;
  } finally {
    db.close();
  }
}

/** Per-render slot ids are fresh hex on every render — they identify a slot
 *  instance, not deck data — so they are normalized out before two renders of
 *  the same card are compared (the same normalization
 *  tests/deploy/no-caching-synthetic.test.ts makes). */
const SLOT_ID = /data-slot-id=(["'])[0-9a-f]+\1/g;
const norm = (html: string): string => html.replace(SLOT_ID, "");

/** Render named cards through the real engine and return the bytes. */
async function renderAll(dbPath: string, names: string[]): Promise<Map<string, string>> {
  const fetcher = new FetchEngine(new LocalSqliteDriver({ path: dbPath }));
  const renderer = new RenderEngine(fetcher);
  const html = new Map<string, string>();
  for (const name of names) {
    html.set(`${name}#content`, await renderer.render(name, "content"));
    html.set(`${name}#title`, await renderer.render(name, "title"));
  }
  renderer.resetCaches();
  fetcher.resetCaches();
  return html;
}

describe("migrate.mjs — a Ruby Decko backup restores into a deck the port serves", () => {
  const ws = newDir("decko-exercise-import6-");
  const dumpPath = join(ws, "ruby-deck.sql");
  const filesDir = join(ws, "ruby-files");
  const out = join(ws, "deck.sqlite");
  const filesOut = join(ws, "files");
  let happy: RunResult;
  let report: Record<string, unknown>;

  beforeAll(() => {
    writeFileSync(dumpPath, rubyDeckDump(), "utf8");
    writeRubyFiles(filesDir);
    // The documented command, verbatim:
    //   node tools/migrate/migrate.mjs --dump deck.sql --out deck.sqlite \
    //        --files <the Ruby deck's files directory> --verify --strict
    happy = runMigrate(["--dump", dumpPath, "--out", out, "--files", filesDir, "--verify", "--strict", "--quiet"]);
    if (!existsSync(`${out}.migrate-report.json`)) {
      throw new Error(`migrate wrote no report (exit ${happy.status}):\n${happy.stdout}\n${happy.stderr}`);
    }
    report = JSON.parse(readFileSync(`${out}.migrate-report.json`, "utf8"));
  }, 300_000);

  it('"An existing Ruby Decko database and `files/` directory import as is" — the documented command exits zero, and the engine serves the imported cards', async () => {
    expect(happy.status, `${happy.stdout}\n${happy.stderr}`).toBe(0);
    const r = report as unknown as {
      ok: boolean;
      allParity: boolean;
      cards: { sourceCount: number; targetCount: number; parity: boolean };
      readiness: { stampRow: boolean; sessionTable: boolean; importComplete: boolean; ok: boolean };
      files: { status: string; referenced: { current: number; history: number }; present: { current: number; history: number }; lost: number };
      import: { errors: unknown[] };
    };
    expect(r.import.errors).toEqual([]);
    expect(r.cards.parity).toBe(true);
    expect(r.cards.targetCount).toBe(r.cards.sourceCount);
    expect(r.allParity).toBe(true);
    expect(r.ok).toBe(true);
    // the deck is ready to serve: freshness stamp, session table, no half-done import
    expect(r.readiness).toMatchObject({ stampRow: true, sessionTable: true, importComplete: true, ok: true });

    // The uploads moved, and every file a card names is where the port looks.
    expect(r.files.status).toBe("ok");
    expect(r.files).toMatchObject({
      referenced: { current: 1, history: 1 },
      present: { current: 1, history: 1 },
      lost: 0,
    });
    const store = new LocalAttachmentStore(filesOut);
    expect(Buffer.from((await store.read(MANUAL, 702, ".txt"))!).toString("utf8")).toBe(UPLOAD_TWO);
    expect(Buffer.from((await store.read(MANUAL, 701, ".txt"))!).toString("utf8")).toBe(UPLOAD_ONE);

    // The engine serves what came out of the dump: simple cards by name, and
    // a compound card whose name exists only as a junction.
    const html = await renderAll(out, ["Alpha Sheet", "Beta Sheet", "Gamma Sheet+*body"]);
    expect(html.get("Alpha Sheet#content")).toContain(ALPHA_BODY);
    expect(html.get("Beta Sheet#content")).toContain(BETA_BODY);
    // A compound card, whose name exists in the dump only as left_id/right_id:
    // the engine composes the name through the junction and carries the
    // imported body with it.
    const compound = await new FetchEngine(new LocalSqliteDriver({ path: out })).fetchByName("Gamma Sheet+*body");
    expect(compound?.name?.s).toBe("Gamma Sheet+*body");
    expect(compound?.leftId).toBe(GAMMA);
    expect(compound?.rightId).toBe(54);
    expect(compound?.dbContent).toBe(GAMMA_BODY_TEXT);
    // And it serves: the page is the junction-resolved card's own page.
    expect(html.get("Gamma Sheet+*body#content")).toContain(`data-card-id="${GAMMA_BODY}"`);
    expect(html.get("Gamma Sheet+*body#content")).toContain('data-card-name="Gamma Sheet+*body"');
    expect(html.get("Alpha Sheet#title")).toContain("card-title");
  }, 120_000);

  it('"imports, copies the uploads, and fails unless every table matches the dump, the engine can serve the deck and every file a card names is in place" — one corrupt row in the dump makes --verify --strict exit nonzero, naming the table that no longer matches', () => {
    // A row the target schema cannot hold: cards.trash carries
    // CHECK (trash IN (0,1)), and this row says 7. --max-errors lets the
    // import finish past it, so the run reaches verification and reports the
    // dump/target mismatch instead of dying on the insert.
    const corruptWs = newDir("decko-exercise-import6-corrupt-");
    const corruptDump = join(corruptWs, "ruby-deck.sql");
    const corruptFiles = join(corruptWs, "ruby-files");
    writeFileSync(
      corruptDump,
      rubyDeckDump([
        { id: 9999, name: "Wrecked Row", typeId: BASIC, trash: 7 as unknown as 0, dbContent: "a row the target schema refuses" },
      ]),
      "utf8",
    );
    writeRubyFiles(corruptFiles);
    const corruptOut = join(corruptWs, "deck.sqlite");
    const res = runMigrate([
      "--dump", corruptDump,
      "--out", corruptOut,
      "--files", corruptFiles,
      "--max-errors", "5",
      "--verify", "--strict", "--quiet",
    ]);

    expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(1);
    // It names the mismatch on stdout: which table, and how far apart.
    expect(res.stdout).toContain("PARITY FAILURES: cards");
    expect(res.stdout).toMatch(/cards: source=\d+ target=\d+ parity=false/);
    expect(res.stdout).toContain("verdict: NOT OK");
    // And the JSON report names the row it could not land.
    const r = JSON.parse(readFileSync(`${corruptOut}.migrate-report.json`, "utf8")) as {
      ok: boolean;
      allParity: boolean;
      cards: { sourceCount: number; targetCount: number };
      import: { errors: { table: string; rowId: number; message: string }[] };
    };
    expect(r.ok).toBe(false);
    expect(r.allParity).toBe(false);
    expect(r.cards.targetCount).toBe(r.cards.sourceCount - 1);
    expect(r.import.errors).toHaveLength(1);
    expect(r.import.errors[0]).toMatchObject({ table: "cards", rowId: 9999 });
    expect(r.import.errors[0]!.message).toMatch(/CHECK constraint failed/);
  }, 300_000);

  it('"imports, copies the uploads, and fails unless every table matches the dump, the engine can serve the deck and every file a card names is in place; `--resume` continues an interrupted run from its last committed batch" — a killed import resumes at the batch it committed and finishes verified', () => {
    const resumeWs = newDir("decko-exercise-import6-resume-");
    const resumeDump = join(resumeWs, "ruby-deck.sql");
    const resumeFiles = join(resumeWs, "ruby-files");
    writeFileSync(resumeDump, rubyDeckDump(), "utf8");
    writeRubyFiles(resumeFiles);
    const resumeOut = join(resumeWs, "deck.sqlite");

    // Killed mid-run: the CLI's own fault-injection hook SIGKILLs the process
    // after four committed batches of 100 rows.
    const killed = runMigrate(["--dump", resumeDump, "--out", resumeOut, "--batch", "100", "--quiet"], {
      DECKO_MIGRATE_FAULT_AFTER_CHECKPOINTS: "4",
    });
    expect(killed.status, `${killed.stdout}\n${killed.stderr}`).not.toBe(0);
    // The database keeps every committed batch: 4 x 100 dump rows are in.
    const halfDone = new Database(resumeOut);
    const committed = halfDone.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number };
    halfDone.close();
    expect(committed.n).toBe(400);

    // A plain re-run refuses to mix into the half-done database...
    const plain = runMigrate(["--dump", resumeDump, "--out", resumeOut, "--quiet"]);
    expect(plain.status).toBe(1);
    expect(plain.stderr).toMatch(/interrupted import/);

    // ...and --resume continues from the last committed batch.
    const resumed = runMigrate([
      "--dump", resumeDump,
      "--out", resumeOut,
      "--resume", "--verify", "--strict", "--files", resumeFiles, "--quiet",
    ]);
    expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0);
    expect(resumed.stdout).toContain("resumed after 400 committed rows");
    const r = JSON.parse(readFileSync(`${resumeOut}.migrate-report.json`, "utf8")) as {
      ok: boolean;
      allParity: boolean;
      import: { resumedFromRow: number };
      readiness: { importComplete: boolean };
      files: { status: string };
    };
    expect(r.import.resumedFromRow).toBe(400);
    expect(r.readiness.importComplete).toBe(true);
    expect(r.allParity).toBe(true);
    expect(r.files.status).toBe("ok");
    expect(r.ok).toBe(true);

    // The resumed database is the one an uninterrupted import produces.
    const wholeWs = newDir("decko-exercise-import6-whole-");
    const wholeOut = join(wholeWs, "deck.sqlite");
    const whole = runMigrate(["--dump", resumeDump, "--out", wholeOut, "--quiet"]);
    expect(whole.status, `${whole.stdout}\n${whole.stderr}`).toBe(0);
    const resumedCounts = rowCounts(resumeOut, DUMP_TABLES);
    const wholeCounts = rowCounts(wholeOut, DUMP_TABLES);
    expect(Object.entries(resumedCounts)).toEqual(Object.entries(wholeCounts));
  }, 300_000);

  it('"Backup and restore are documented as a runbook and tested end to end" — a deck backed up in the documented format (mysqldump text + files/ tree) and restored into a fresh database has identical row counts and byte-identical rendered cards', async () => {
    // The backup of the deck restored above: its tables as a mysqldump would
    // write them (dump tables only, positional, in target DDL column order —
    // parseTargetSchema is the same column order the importer expects), and
    // its files directory copied beside the dump.
    const backupWs = newDir("decko-exercise-import6-backup-");
    const backupDump = join(backupWs, "deck-backup.sql");
    const backupFiles = join(backupWs, "deck-backup-files");
    const source = new Database(out);
    try {
      const { tableColumns } = parseTargetSchema(DDL_PATH);
      const lines: string[] = [];
      for (const table of DUMP_TABLES) {
        const columns = tableColumns[table];
        if (columns === undefined) throw new Error(`the target DDL has no ${table} table`);
        const selected = columns.map((c) => `"${c}"`).join(",");
        const order = columns.includes("id") ? `"id"` : selected;
        const rows = source.prepare(`SELECT ${selected} FROM "${table}" ORDER BY ${order}`).all() as Record<string, unknown>[];
        expect(rows.length, table).toBeGreaterThan(0);
        const tuples = rows.map((row) =>
          sqlTuple(...columns.map((c) => {
            const v = row[c];
            if (v === undefined || v === null) return null;
            if (typeof v === "number" || typeof v === "string") return v;
            throw new Error(`unexpected column type in ${table}.${c}: ${typeof v}`);
          })),
        );
        lines.push(`INSERT INTO \`${table}\` VALUES ${tuples.join(",")};`);
      }
      writeFileSync(backupDump, dumpFile(lines), "utf8");
    } finally {
      source.close();
    }
    copyDeckTree(filesOut, backupFiles);
    expect(existsSync(join(backupFiles, String(MANUAL), "702.txt"))).toBe(true);

    // The documented restore, into a fresh database.
    const restored = join(backupWs, "restored.sqlite");
    const res = runMigrate(["--dump", backupDump, "--out", restored, "--files", backupFiles, "--verify", "--strict", "--quiet"]);
    expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
    expect((JSON.parse(readFileSync(`${restored}.migrate-report.json`, "utf8")) as { ok: boolean }).ok).toBe(true);

    // Row counts, table by table, are the ones the backed-up deck had.
    const backed = rowCounts(out, DUMP_TABLES);
    const after = rowCounts(restored, DUMP_TABLES);
    expect(Object.keys(after)).toEqual(Object.keys(backed));
    const mismatched = DUMP_TABLES.filter((t) => backed[t] !== after[t]);
    expect(mismatched).toEqual([]);
    expect(backed["cards"]).toBeGreaterThan(FILLER);

    // Rendered cards are identical, byte for byte, on both decks.
    const names = ["Alpha Sheet", "Beta Sheet", "Gamma Sheet", "Gamma Sheet+*body", "Manual", "Filler 0", "Filler 299", "Filler 599"];
    const beforeHtml = await renderAll(out, names);
    const afterHtml = await renderAll(restored, names);
    expect([...afterHtml.keys()]).toEqual([...beforeHtml.keys()]);
    const differing = names.filter((n) => norm(beforeHtml.get(`${n}#content`) ?? "") !== norm(afterHtml.get(`${n}#content`) ?? "") || norm(beforeHtml.get(`${n}#title`) ?? "") !== norm(afterHtml.get(`${n}#title`) ?? ""));
    expect(differing).toEqual([]);
    expect(beforeHtml.get("Alpha Sheet#content")).toContain(ALPHA_BODY);

    // The restored deck's uploads are in place too.
    const store = new LocalAttachmentStore(join(backupWs, "files"));
    expect(Buffer.from((await store.read(MANUAL, 702, ".txt"))!).toString("utf8")).toBe(UPLOAD_TWO);
  }, 300_000);
});

/** Copy a files/ tree the way the Ruby deck carries it: whole, unchanged. */
function copyDeckTree(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) copyDeckTree(from, to);
    else copyFileSync(from, to);
  }
}

// ---------------------------------------------------------------------------
// The driver claim: one interface, one conformance suite, three providers a
// clean checkout can actually reach — a local SQLite file, Miniflare's local
// D1 (workerd runs for real, no Cloudflare account), and an in-process
// Hrana v2 server over loopback HTTP. Hosted D1, sqld, Turso and Bunny
// Database are not reachable from a public test (docs/coverage-inventory.md:
// "Nothing here was run against a hosted service"), so the fourth named
// provider is out of reach here and is not claimed.

describe("SQLDatabaseDriver — one interface, one conformance suite", () => {
  let sqlite: LocalSqliteDriver | undefined;
  let d1: CloudflareD1Adapter | undefined;
  let hrana: LibSqlHttpAdapter | undefined;
  let mf: Miniflare | undefined;
  let server: MockHranaServer | undefined;

  beforeAll(async () => {
    const dir = newDir("decko-exercise-import6-drivers-");
    sqlite = new LocalSqliteDriver({ path: join(dir, "local.sqlite") });
    // miniflare@5 moved to wrangler-config-style worker options; the package
    // exports the converter from the classic shape (the same call
    // tests/server/drivers/d1-miniflare.test.ts makes).
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: `export default { fetch() { return new Response("ok"); } }`,
        d1Databases: { DB: "decko-exercise-import6" },
      }),
    );
    d1 = new CloudflareD1Adapter(await mf.getD1Database("DB"));
    server = await startMockHranaServer();
    hrana = new LibSqlHttpAdapter({ url: server.url, authToken: "synthetic-token", timeoutMs: 10_000 });
  }, 300_000);

  afterAll(async () => {
    sqlite?.close();
    await server?.close();
    await mf?.dispose();
  });

  // The shared suite, run unmodified against each provider.
  runDriverConformance("conformance: LocalSqliteDriver (synthetic deck)", () => ({ driver: sqlite! }));
  runDriverConformance("conformance: CloudflareD1Adapter (miniflare local D1)", () => ({ driver: d1! }));
  runDriverConformance("conformance: LibSqlHttpAdapter (in-process Hrana v2)", () => ({ driver: hrana! }));

  it('"SQL drivers for SQLite, D1, libSQL and Bunny Database behind one interface and one conformance suite" — the same SQL through the one SQLDatabaseDriver interface returns identical rows on all three reachable providers', async () => {
    const drivers: [string, SQLDatabaseDriver][] = [
      ["sqlite", sqlite!],
      ["d1", d1!],
      ["libsql", hrana!],
    ];
    const transcripts: Record<string, unknown>[] = [];
    for (const [label, driver] of drivers) {
      await driver.query(
        "CREATE TABLE exercise_ident (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER, f REAL, s TEXT, z)",
        [],
      );
      await driver.query("INSERT INTO exercise_ident (n, f, s, z) VALUES (?, ?, ?, ?)", [42, 1.5, "synthetic row", null]);
      await driver.query("INSERT INTO exercise_ident (n, f, s, z) VALUES (?, ?, ?, ?)", [-7, 0.25, "second synthetic row", "x"]);
      const batched = await driver.batch([
        { sql: "UPDATE exercise_ident SET f = ? WHERE n = ?", params: [9.5, 42] },
        { sql: "SELECT COUNT(*) AS c FROM exercise_ident", params: [] },
      ]);
      expect(batched[1]!.rows, label).toEqual([{ c: 2 }]);
      const rows = await driver.query<Record<string, unknown>>(
        "SELECT id, n, f, s, z FROM exercise_ident ORDER BY id",
        [],
      );
      // And the contract's error path: a bad statement throws, it does not
      // come back as a swallowed empty result.
      await expect(driver.query("SELEC nonsense", []), label).rejects.toThrow();
      // The driver is still usable afterwards.
      const alive = await driver.query<{ c: number }>("SELECT COUNT(*) AS c FROM exercise_ident", []);
      transcripts.push({ label, rows: rows.rows, alive: alive.rows[0]!.c });
    }
    expect(transcripts[0]!.rows).toEqual([
      { id: 1, n: 42, f: 9.5, s: "synthetic row", z: null },
      { id: 2, n: -7, f: 0.25, s: "second synthetic row", z: "x" },
    ]);
    for (const t of transcripts) expect(t.rows, t.label as string).toEqual(transcripts[0]!.rows);
  }, 180_000);
});