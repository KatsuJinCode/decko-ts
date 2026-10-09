// migration-acceptance.test.ts — the packaged migration path, end to end, on
// a Ruby-shaped deck that carries every kind of data an adopter's deck has:
//
//   import -> verify -> render, with
//   - revisions:   a card edited twice (acts, actions, changes), read back
//                  through the history readers the history views use;
//   - references:  an inclusion and its card_references row, rendered and
//                  queried through CQL;
//   - permissions: a card readable only by a role, denied to Anonymous and
//                  readable by the role's member;
//   - accounts:    a Ruby account (salted SHA-1 digest) that signs in on
//                  the migrated deck, and a wrong password that does not;
//   - files:       a File card with two revisions whose uploads move with
//                  the deck and are read back through the port's own store;
//   - resumability: an import interrupted in-process and one killed as a
//                  process, both resumed to the same database an
//                  uninterrupted import produces.
//
// Everything runs on local SQLite files in a scratch directory.

import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  LocalSqliteToolDriver,
  checksumTargetTable,
  importDump,
  parseTargetSchema,
  readImportProgress,
} from "../../tools/migrate/import.mjs";
import { verifyMigration } from "../../tools/migrate/verify.mjs";
import { copyDeckFiles, verifyDeckFiles } from "../../tools/migrate/files.mjs";
import { engineChecks, deriveKeyWithEngine } from "../../tools/migrate/engine-bridge.mjs";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";
import { SessionStore, signinAccount } from "../../src/card/auth/index.js";
import { viewerFromToken } from "../../src/card/actions/render-viewer-for-session.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import {
  actionCount,
  actionPreviousValue,
  actionValue,
  nthAction,
} from "../../src/card/mod-loader/mods/card-mod-history.js";
import {
  actionsInsert,
  actsInsert,
  cardsInsert,
  changesInsert,
  dumpFile,
  referencesInsert,
  type SyntheticCard,
} from "./synthetic-dump.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DDL_PATH = join(REPO_ROOT, "db", "schema.sqlite.sql");
const MIGRATE_CLI = join(REPO_ROOT, "tools", "migrate", "migrate.mjs");

// Type cards
const SET = 2;
const BASIC = 4;
const ROLE = 9;
const USER = 11;
const FILE = 20;
const POINTER = 21;

// Content
const ALPHA = 40;
const BETA = 41;
const SECRET = 42;
const EDITORS = 43;
const EDITORS_MEMBERS = 44;
const SECRET_SELF = 45;
const SECRET_SELF_READ = 46;
const ALL_READ = 47;
const ALICE = 60;
const ALICE_ACCOUNT = 61;
const MANUAL = 70;

const ALICE_EMAIL = "alice@example.test";
const ALICE_PASSWORD = "correct horse battery staple";
const ALICE_SALT = "a1b2c3d4e5";
const FILLER_CARDS = 1500;

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

/** The deck, as rows a Ruby Decko mysqldump carries. Ids are fixed so the
 *  assertions below can name them. */
function rubyDeckDump(): string {
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
    { id: 10, name: "Decko Bot", codename: "decko_bot", typeId: USER },
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
    // Everyone reads everything by default...
    { id: ALL_READ, name: "*all+*read", leftId: 1, rightId: 3, typeId: POINTER, dbContent: "[[Anyone]]" },
    // ...except Secret, which only Editors read.
    { id: EDITORS, name: "Editors", typeId: ROLE },
    { id: EDITORS_MEMBERS, name: "Editors+*members", leftId: EDITORS, rightId: 14, typeId: POINTER, dbContent: "[[Alice]]" },
    { id: SECRET_SELF, name: "Secret+*self", leftId: SECRET, rightId: 16, typeId: SET },
    { id: SECRET_SELF_READ, name: "Secret+*self+*read", leftId: SECRET_SELF, rightId: 3, typeId: POINTER, dbContent: "[[Editors]]" },
    { id: SECRET, name: "Secret", typeId: BASIC, dbContent: "the secret plan", readRuleId: SECRET_SELF_READ, readRuleClass: "*self" },
    // Revisions and references.
    { id: ALPHA, name: "Alpha", typeId: BASIC, dbContent: "alpha second draft", readRuleId: ALL_READ, readRuleClass: "*all", updaterId: ALICE },
    { id: BETA, name: "Beta", typeId: BASIC, dbContent: "beta says: {{Alpha}}", readRuleId: ALL_READ, readRuleClass: "*all" },
    // An account Ruby created: digest = SHA1("<salt>--<password>--").
    { id: ALICE, name: "Alice", typeId: USER, readRuleId: ALL_READ, readRuleClass: "*all" },
    { id: ALICE_ACCOUNT, name: "Alice+*account", leftId: ALICE, rightId: 12 },
    { id: 62, name: "Alice+*account+*email", leftId: ALICE_ACCOUNT, rightId: 13, dbContent: ALICE_EMAIL },
    { id: 63, name: "Alice+*account+*password", leftId: ALICE_ACCOUNT, rightId: 17, dbContent: sha1(`${ALICE_SALT}--${ALICE_PASSWORD}--`) },
    { id: 64, name: "Alice+*account+*salt", leftId: ALICE_ACCOUNT, rightId: 18, dbContent: ALICE_SALT },
    { id: 65, name: "Alice+*account+*status", leftId: ALICE_ACCOUNT, rightId: 19, dbContent: "active" },
    // A file card on its second upload.
    { id: MANUAL, name: "Manual", typeId: FILE, dbContent: `~${MANUAL}/702.txt`, readRuleId: ALL_READ, readRuleClass: "*all" },
  ];
  // Bulk, so an interrupted import stops part way through many batches.
  for (let i = 0; i < FILLER_CARDS; i += 1) {
    cards.push({ id: 1000 + i, name: `Filler ${i}`, typeId: BASIC, dbContent: `filler body ${i}`, readRuleId: ALL_READ, readRuleClass: "*all" });
  }
  return dumpFile([
    cardsInsert(cards),
    actsInsert([
      { id: 500, cardId: ALPHA, actorId: ALICE },
      { id: 501, cardId: ALPHA, actorId: ALICE },
      { id: 502, cardId: MANUAL, actorId: ALICE },
      { id: 503, cardId: MANUAL, actorId: ALICE },
    ]),
    // id, card_id, card_act_id, super_action_id, action_type (0 create, 1 update), draft, comment
    actionsInsert([
      [600, ALPHA, 500, null, 0, 0, null],
      [601, ALPHA, 501, null, 1, 0, null],
      [701, MANUAL, 502, null, 0, 0, null],
      [702, MANUAL, 503, null, 1, 0, null],
    ]),
    // id, card_action_id, field (0 name, 1 type_id, 2 db_content), value
    changesInsert([
      [800, 600, 0, "Alpha"],
      [801, 600, 1, String(BASIC)],
      [802, 600, 2, "alpha first draft"],
      [803, 601, 2, "alpha second draft"],
      [804, 701, 2, `~${MANUAL}/701.txt`],
      [805, 702, 2, `~${MANUAL}/702.txt`],
    ]),
    // id, referer_id, referee_key, referee_id, ref_type, is_present
    referencesInsert([
      [900, BETA, "alpha", ALPHA, "I", 1],
      [901, EDITORS_MEMBERS, "alice", ALICE, "L", 1],
      [902, SECRET_SELF_READ, "editors", EDITORS, "L", 1],
      [903, ALL_READ, "anyone", 5, "L", 1],
    ]),
  ]);
}

/** The Ruby deck's files directory: both uploads of Manual, plus a file no
 *  card names (copied anyway: the tree moves whole). */
function writeRubyFiles(dir: string): void {
  mkdirSync(join(dir, String(MANUAL)), { recursive: true });
  writeFileSync(join(dir, String(MANUAL), "701.txt"), "manual, first upload\n");
  writeFileSync(join(dir, String(MANUAL), "702.txt"), "manual, second upload\n");
  writeFileSync(join(dir, String(MANUAL), "icon-702.txt"), "a version beside the original\n");
}

const dirs: string[] = [];
const drivers: InstanceType<typeof LocalSqliteToolDriver>[] = [];
afterAll(() => {
  for (const driver of drivers) {
    try {
      driver.close();
    } catch {
      // already closed
    }
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function workspace(): { dir: string; dump: string; files: string } {
  const dir = scratchDir("decko-migrate-acceptance-");
  dirs.push(dir);
  const dump = join(dir, "ruby-deck.sql");
  writeFileSync(dump, rubyDeckDump(), "utf8");
  const files = join(dir, "ruby-files");
  writeRubyFiles(files);
  return { dir, dump, files };
}

function open(path: string): InstanceType<typeof LocalSqliteToolDriver> {
  const driver = new LocalSqliteToolDriver(path);
  drivers.push(driver);
  return driver;
}

/** Every dump table's checksum over a target database. */
async function targetChecksums(driver: InstanceType<typeof LocalSqliteToolDriver>): Promise<Record<string, unknown>> {
  const schema = parseTargetSchema(DDL_PATH);
  const out: Record<string, unknown> = {};
  for (const [table, columns] of Object.entries(schema.tableColumns)) {
    out[table] = await checksumTargetTable(driver, table, columns);
  }
  return out;
}

describe("the packaged migration: import -> verify -> render", () => {
  const ws = workspace();
  const target = join(ws.dir, "deck.sqlite");
  const filesOut = join(ws.dir, "files");
  let driver: InstanceType<typeof LocalSqliteToolDriver>;

  it("imports and verifies: parity, readiness, files, engine spot checks", async () => {
    driver = open(target);
    const stats = await importDump({ dumpPath: ws.dump, driver, ddlPath: DDL_PATH, deriveKey: deriveKeyWithEngine });
    expect(stats.errors).toEqual([]);
    expect(stats.engineMigrations).toEqual(["001-auth-sessions.sql"]);
    const copy = copyDeckFiles({ sourceDir: ws.files, targetDir: filesOut });
    expect(copy).toMatchObject({ files: 3, copied: 3, alreadyPresent: 0, mismatched: [] });

    const report = await verifyMigration({
      dumpPath: ws.dump,
      driver,
      ddlPath: DDL_PATH,
      importStats: stats,
      engineChecks,
      spotCount: 10,
      filesSourceDir: ws.files,
      filesTargetDir: filesOut,
      filesCopy: copy,
    });
    expect(report.allParity).toBe(true);
    expect(report.readiness).toMatchObject({ stampRow: true, sessionTable: true, importComplete: true, ok: true });
    expect(report.readiness.freshnessTriggers.present).toBe(report.readiness.freshnessTriggers.expected);
    expect(report.files).toMatchObject({
      status: "ok",
      referenced: { current: 1, history: 1 },
      present: { current: 1, history: 1 },
      lost: 0,
    });
    expect(report.engine.status).toBe("ok");
    expect(report.engine.spotRender?.renderErrors).toBe(0);
    expect(report.junction.resolved).toBe(report.junction.sampled);
    expect(report.ok).toBe(true);
    // the engine-owned stamp table is not a dump table
    expect(report.tables["deck_data_version"]).toBeUndefined();
  }, 120_000);

  it("revisions: both drafts of Alpha are in its history, in order", async () => {
    expect(await actionCount(driver, ALPHA)).toBe(2);
    const first = await nthAction(driver, ALPHA, 1);
    const second = await nthAction(driver, ALPHA, 2);
    expect(await actionValue(driver, first!, "db_content")).toBe("alpha first draft");
    expect(await actionValue(driver, second!, "db_content")).toBe("alpha second draft");
    expect(await actionPreviousValue(driver, second!, "db_content")).toBe("alpha first draft");
    // The acts carry their actor: the account that made the edits.
    const acts = await driver.query("SELECT actor_id FROM card_acts WHERE card_id = ? ORDER BY id", [ALPHA]);
    expect(acts.rows).toEqual([{ actor_id: ALICE }, { actor_id: ALICE }]);
  }, 60_000);

  it("references: Beta renders Alpha's content and CQL follows the reference", async () => {
    const engine = new RenderEngine(new FetchEngine(driver));
    expect(await engine.render("Beta", "core")).toContain("alpha second draft");
    const parse = parseOptionsWithLexicon(new FetchEngine(driver).lexicon);
    const result = await executeQuery(driver, { included_by: "Beta" }, { parse });
    if (!("rows" in result)) throw new Error("expected card rows");
    expect(result.rows.map((r) => r.id)).toEqual([ALPHA]);
  }, 60_000);

  it("accounts: the Ruby account signs in; a wrong password does not", async () => {
    const sessions = new SessionStore({ driver });
    const wrong = await signinAccount(driver, sessions, ALICE_EMAIL, "not the password");
    expect(wrong.ok).toBe(false);
    const signedIn = await signinAccount(driver, sessions, ALICE_EMAIL, ALICE_PASSWORD);
    if (!signedIn.ok) throw new Error(`sign-in failed: ${signedIn.reason}`);
    expect(signedIn.actor.id).toBe(ALICE);
    const viewer = await viewerFromToken(driver, signedIn.session.token);
    expect(viewer).toEqual({ signedIn: true, actorId: ALICE });
  }, 60_000);

  it("permissions: Secret is denied to Anonymous and readable by an Editors member", async () => {
    const anonymous = new RenderEngine(new FetchEngine(driver));
    const denied = await anonymous.render("Secret", "core");
    expect(denied).not.toContain("the secret plan");
    expect(denied).toContain('class="denied"');
    const alice = new RenderEngine(new FetchEngine(driver));
    alice.viewer = { signedIn: true, actorId: ALICE };
    expect(await alice.render("Secret", "core")).toContain("the secret plan");
    // and an ordinary card stays readable to Anonymous
    expect(await anonymous.render("Alpha", "core")).toContain("alpha second draft");
  }, 60_000);

  it("files: both uploads of Manual read back through the port's attachment store", async () => {
    const store = new LocalAttachmentStore(filesOut);
    const current = await store.read(MANUAL, 702, ".txt");
    const previous = await store.read(MANUAL, 701, ".txt");
    expect(Buffer.from(current!).toString("utf8")).toBe("manual, second upload\n");
    expect(Buffer.from(previous!).toString("utf8")).toBe("manual, first upload\n");
  });

  it("files: a file missing or changed in the target fails verification", async () => {
    const lostDir = join(ws.dir, "files-lost");
    copyDeckFiles({ sourceDir: ws.files, targetDir: lostDir });
    rmSync(join(lostDir, String(MANUAL), "701.txt"));
    writeFileSync(join(lostDir, String(MANUAL), "702.txt"), "manual, altered\n");
    const files = await verifyDeckFiles({ driver, sourceDir: ws.files, targetDir: lostDir });
    expect(files.status).toBe("failed");
    expect(files.lost).toBe(2);
    expect(files.present).toEqual({ current: 0, history: 0 });
  });

  it("files: a migration without the files directory is reported as incomplete", async () => {
    const report = await verifyMigration({
      dumpPath: ws.dump,
      driver,
      ddlPath: DDL_PATH,
      importStats: await importStatsFor(ws.dump),
    });
    expect(report.files.status).toBe("not-migrated");
    expect(report.ok).toBe(false);
  }, 60_000);
});

/** Source-side stats for a dump, from a throwaway import. */
async function importStatsFor(dump: string) {
  const dir = scratchDir("decko-migrate-acceptance-stats-");
  dirs.push(dir);
  const scratch = open(join(dir, "stats.sqlite"));
  return importDump({ dumpPath: dump, driver: scratch, ddlPath: DDL_PATH, deriveKey: deriveKeyWithEngine });
}

describe("resumability", () => {
  it("an import interrupted part way resumes to the database an uninterrupted import produces", async () => {
    const ws = workspace();
    const whole = open(join(ws.dir, "whole.sqlite"));
    await importDump({ dumpPath: ws.dump, driver: whole, ddlPath: DDL_PATH, deriveKey: deriveKeyWithEngine, batchSize: 100 });

    const path = join(ws.dir, "interrupted.sqlite");
    const first = open(path);
    const controller = new AbortController();
    let checkpoints = 0;
    await expect(
      importDump({
        dumpPath: ws.dump,
        driver: first,
        ddlPath: DDL_PATH,
        deriveKey: deriveKeyWithEngine,
        batchSize: 100,
        signal: controller.signal,
        onCheckpoint: () => {
          checkpoints += 1;
          if (checkpoints === 7) controller.abort();
        },
      }),
    ).rejects.toThrow(/interrupted/);
    const progress = await readImportProgress(first);
    expect(progress?.rowsDone).toBe(700);
    expect(Number((await first.query("SELECT COUNT(*) AS n FROM cards", [])).rows[0]!.n)).toBe(700);

    // A plain import refuses the half-done database instead of mixing into it.
    await expect(importDump({ dumpPath: ws.dump, driver: first, ddlPath: DDL_PATH })).rejects.toThrow(
      /interrupted import/,
    );
    // A resume refuses a different dump.
    const other = join(ws.dir, "other.sql");
    writeFileSync(other, `${readFileSync(ws.dump, "utf8")}\n-- one more line\n`);
    await expect(importDump({ dumpPath: other, driver: first, ddlPath: DDL_PATH, resume: true })).rejects.toThrow(
      /not the one this import started from/,
    );

    const stats = await importDump({
      dumpPath: ws.dump,
      driver: first,
      ddlPath: DDL_PATH,
      deriveKey: deriveKeyWithEngine,
      batchSize: 100,
      resume: true,
    });
    expect(stats.resumedFromRow).toBe(700);
    expect(await readImportProgress(first)).toBeUndefined();
    expect(await targetChecksums(first)).toEqual(await targetChecksums(whole));

    const report = await verifyMigration({ dumpPath: ws.dump, driver: first, ddlPath: DDL_PATH, importStats: stats });
    expect(report.allParity).toBe(true);
    expect(report.readiness.ok).toBe(true);
  }, 120_000);

  it("the command line resumes an import whose process was killed mid-run", () => {
    const ws = workspace();
    const out = join(ws.dir, "cli.sqlite");
    const killed = spawnSync(
      process.execPath,
      [MIGRATE_CLI, "--dump", ws.dump, "--out", out, "--batch", "100", "--quiet"],
      { encoding: "utf8", windowsHide: true, env: { ...process.env, DECKO_MIGRATE_FAULT_AFTER_CHECKPOINTS: "4" } },
    );
    expect(killed.status).not.toBe(0);

    const plain = spawnSync(process.execPath, [MIGRATE_CLI, "--dump", ws.dump, "--out", out, "--quiet"], {
      encoding: "utf8",
      windowsHide: true,
    });
    expect(plain.status).toBe(1);

    const resumed = spawnSync(
      process.execPath,
      [MIGRATE_CLI, "--dump", ws.dump, "--out", out, "--resume", "--verify", "--strict", "--files", ws.files, "--quiet"],
      { encoding: "utf8", windowsHide: true },
    );
    expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0);
    const report = JSON.parse(readFileSync(`${out}.migrate-report.json`, "utf8"));
    expect(report.import.resumedFromRow).toBe(400);
    expect(report.allParity).toBe(true);
    expect(report.readiness.ok).toBe(true);
    expect(report.files.status).toBe("ok");
    expect(report.ok).toBe(true);
  }, 120_000);
});
