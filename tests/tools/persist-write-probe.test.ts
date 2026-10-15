// persist-write-probe.ts -- TYPESCRIPT half of the persistence parity probe.
//
// Runs the SAME ordered op list as tools/persistence/persist-write-probe.rb
// against an identical copy of the real oracle deck, through the REAL
// CardActionEngine, dumping the same shape of every table Decko writes. The
// comparator diffs the two dumps.
//
// ONE PROCESS-RESET PER RUN, and every op wrapped so a throw is recorded
// rather than aborting the run: a raised op is itself a finding, and letting
// it abort would hide every operation after it.
//
// Op list (step N == the Ruby side's step N; keep them in lockstep):
//   1  create simple                    11 create with cardtype
//   2  create compound                  12 update add nest
//   3  update content                   13 update remove nest and link
//   4  update with link                 14 save draft
//   5  rename                           15 real save after draft
//   6  trash (deleteCard)               16 create parent
//   7  revive child (ROUTE path)        17 create child
//   8  revive parent (ROUTE path)       18 delete parent (trash cascade)
//   9  no-op update                     19 revive child (MODEL path)
//  10  create over existing name        20 (withheld)
//  21  create without type or content   22 (withheld)
//  23  create revert subject            28 revert to previous (last act)
//  24  update revert subject            29 delete revert subject
//  25  rename revert subject            30 restore from history
//  26  revert to this (undo rename)     31 (withheld)
//  27  revert to this (create content) 32 update a nested deck card
//  33-42 renames: descendants moved, referers rewritten or kept
//        (card[skip]=update_referer_content), compound renames creating
//        sides, simple to compound, a refused tag-to-compound rename
//  43-50 type changes: alone, with content, with a field, an unknown type,
//        a cardtype with instances
//  51-52 list content: standardized items, item references, item swaps
//  53-56 form saves with subcards (create, update, unchanged, list subcard)
//  57-60 account and role cards; 61-64 read rules created, changed, deleted
//  65-67 reverts whose act renames or trashes another card
//  68-70 file and image uploads
//
// It writes its JSON, runs tools/persistence/compare-persist.mjs against the
// committed Ruby dumps, and asserts which steps diverge. The default run is
// public: the deck is the committed synthetic write-battery fixture
// (reference-harness/fixtures/write-battery-v1, built from a stock seed by
// the oracle builder), and the committed Ruby dumps beside it were recorded
// on that same deck. PERSIST_SRC_DECK selects a private deck for the deeper
// run instead; PERSIST_RUBY_STEPS then has to name the dumps recorded on it
// (the tests/fixtures/persistence-oracle dumps are the ones for the private
// oracle deck). A missing deck file fails with the path it wanted.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import type { CreateCardInput, UpdateCardInput } from "../../src/card/actions/types.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { DeckoName } from "../../src/card/name.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { servingModEventRuntime } from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";

// Anchored to the repository, not the process cwd: the runner may be started
// from anywhere, and a cwd-relative path writes the deck copy into whatever
// directory that happens to be.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The default deck is the committed synthetic fixture; PERSIST_SRC_DECK
// selects a private deck for the deeper run.
const FIXTURE_DIR = path.join(REPO, "reference-harness", "fixtures", "write-battery-v1");
const SYNTHETIC_DECK = path.join(FIXTURE_DIR, "deck", "deck.sqlite3");
const USING_SYNTHETIC_DECK = process.env.PERSIST_SRC_DECK === undefined;
const SRC =
  process.env.PERSIST_SRC_DECK ?? SYNTHETIC_DECK;
const PERSIST_DIR = path.join(REPO, "tmp/persist");
const OUT = process.env.PERSIST_TS_OUT ?? path.join(PERSIST_DIR, "ts-state.json");
// Uploaded files (steps 68-70), removed with the deck copy.
const FILES_DIR = path.join(PERSIST_DIR, "ts-files");
// The TS deck as the op list left it, kept only for the whole-deck comparison.
const FINAL_DECK = path.join(PERSIST_DIR, "ts-final-compare.sqlite3");
// The withheld step set (reference-harness/fixtures/write-battery-v1/
// withheld/steps.json). Those steps are NOT part of the public run: the public
// material is not cleared to carry what they store, and every step after them
// would record it, so the whole run would carry it. A release package excludes
// that file, so when it is absent this run covers the remaining steps and
// announces the skipped count loudly rather than skipping silently (the
// repository forbids a silent skip). With it present the run is the full list
// again, compared against the withheld recording in the same directory.
const WITHHELD_STEPS_FILE =
  process.env.PERSIST_WITHHELD_STEPS ??
  path.join(FIXTURE_DIR, "withheld", "steps.json");
// The op list's withheld steps, as the set file declares them. ABSENT the file
// — the packaged case — the run still withholds exactly these steps: the
// numbers live here so an excluded file cannot silently widen the run to all
// 70. PRESENT it, the withheld steps run again and are compared against the
// withheld recording.
// The public record of those numbers. It carries no step content (the content
// is in the withheld set), so it is safe in the public package. When the set
// file is present the numbers are read from it, and must equal this record: a
// drifted copy here fails the run instead of silently running other steps.
const PUBLIC_WITHHELD_STEP_NUMBERS = [20, 22, 31];
const WITHHELD_SET_PRESENT = existsSync(WITHHELD_STEPS_FILE);
const WITHHELD_STEP_NUMBERS: number[] = WITHHELD_SET_PRESENT
  ? (JSON.parse(readFileSync(WITHHELD_STEPS_FILE, "utf8")) as { steps: { step: number }[] }).steps.map((s) => Number(s.step))
  : PUBLIC_WITHHELD_STEP_NUMBERS;
// The steps this run withholds: none when the set file is present (it is the
// full-list run), the declared numbers when it is absent.
const WITHHELD_STEPS: number[] = WITHHELD_SET_PRESENT ? [] : WITHHELD_STEP_NUMBERS;
const PUBLIC_STEP_COUNT = 70 - WITHHELD_STEPS.length;
// The content the withheld steps feed the engine. It lives in the withheld
// set (withheld/step-content.txt) and is read only when that set is present:
// the public op list never builds this content, so the public source carries
// no copy of it. The Ruby half reads the same file.
const WITHHELD_CONTENT_FILE = path.join(FIXTURE_DIR, "withheld", "step-content.txt");
const WITHHELD_CONTENT = existsSync(WITHHELD_CONTENT_FILE)
  ? readFileSync(WITHHELD_CONTENT_FILE, "utf8").trim()
  : "";
// The Ruby oracle's per-step dumps, committed so the comparison runs without
// a Ruby install: the synthetic fixture's own dumps beside that fixture by
// default, the private oracle deck's dumps when a private deck is selected.
// The withheld steps' own recording (withheld/persist-steps). The public
// recording beside it is cut over the PUBLIC list, so when the withheld set is
// present the run needs the recording made WITH it; when it is absent the
// public recording beside the fixture is already the one that matches.
const WITHHELD_RECORDING = path.join(FIXTURE_DIR, "withheld", "persist-steps");
const RUBY_STEPS =
  process.env.PERSIST_RUBY_STEPS ??
  (USING_SYNTHETIC_DECK && WITHHELD_SET_PRESENT
    ? WITHHELD_RECORDING
    : USING_SYNTHETIC_DECK
      ? path.join(FIXTURE_DIR, "expected", "persist-steps")
      // The private oracle deck's dumps, which carry the same withheld steps
      // and are withheld for the same reason (tests/fixtures/persistence-oracle/
      // withheld/steps.json names them).
      : path.join(REPO, "tests/fixtures/persistence-oracle/withheld"));
// The deliberate differences, each declared with its reason and its exact
// row delta. Step 7, re-creating a junction while its left side is trashed:
// Ruby inserts a second junction row (possible only because the oracle deck
// lacks the upstream UNIQUE (left_id, right_id) index); the port revives
// the trashed row. Steps 20, 22 and 31 are withheld; their declaration
// travels with the withheld recording. The steps this run declares — 7 and 67
// — are the ones deliberate-differences.json carries over the public list. (This comment once also described step 48, assigning a type
// that does not exist, and steps 57 and 58, password storage. None of the
// three is declared any more, so they are gone rather than left as a claim
// nothing backs. Step 67 joined the list on 2026-10-13: it is a deliberate
// difference, the port completing a revert Ruby aborts — see
// KNOWN_DIVERGENCES below.) The comparator accepts a
// declared step only if its delta is exactly
// the declared one.
// The declarations in force for this run: each deck's own file (the 67
// declaration also pins the raw outside rows Ruby's half-applied revert
// leaves, and those ids are per deck).
const DECLARATIONS =
  USING_SYNTHETIC_DECK && WITHHELD_SET_PRESENT
    ? path.join(WITHHELD_RECORDING, "deliberate-differences.json")
    : USING_SYNTHETIC_DECK
      ? path.join(FIXTURE_DIR, "expected", "persist-steps", "deliberate-differences.json")
      : path.join(REPO, "tests/fixtures/persistence-oracle/withheld/deliberate-differences.json");
// The fixture deck is Ruby-built: every account on it stores Ruby's salted
// SHA-1 digest, so the default run stores passwords the way Ruby does (the
// deck Ruby also serves is run with legacy-sha1). An explicit
// DECKO_PASSWORD_HASH keeps its operator-set value.
if (USING_SYNTHETIC_DECK && process.env.DECKO_PASSWORD_HASH === undefined) {
  process.env.DECKO_PASSWORD_HASH = "legacy-sha1";
}
const LEGACY_PASSWORDS = process.env.DECKO_PASSWORD_HASH === "legacy-sha1";
const PASSWORD_STEPS = [57, 58];
// The declared differences this run must see: the ones the withheld set does
// not claim.
// Steps 7 and 67 are public declarations; 20, 22 and 31 are declared in the
// withheld recording and are exercised whenever the withheld set is present
// (WITHHELD_STEPS is then empty, so none of them is skipped). Derived from the
// withheld step numbers, not written out twice.
const PUBLIC_DELIBERATE_STEPS = [7, 67];
const ALL_DELIBERATE_STEPS = [...PUBLIC_DELIBERATE_STEPS, ...WITHHELD_STEP_NUMBERS].sort((a, b) => a - b);
const DELIBERATE_STEPS = ALL_DELIBERATE_STEPS.filter(
  (s) => !WITHHELD_STEPS.includes(s),
).sort((a, b) => a - b);
// The declarations in force for this run: without the password steps in
// legacy-sha1 mode (a declaration that no longer applies would be stale).
const DELIBERATE = LEGACY_PASSWORDS ? path.join(PERSIST_DIR, "deliberate-differences-legacy-passwords.json") : DECLARATIONS;
// Steps whose row delta still differs from the oracle WITHOUT a declaration
// that matches. compare-persist accepts a declared step only when its delta
// is EXACTLY the declared one, so a declaration that has fallen behind the
// port reads as no declaration at all.
//
// The rename steps (38-41, 52) are FIXED: Ruby's rename rewrites each
// referer's stored reference row to the renamed card's new name, and the
// port now does the same (update-referer-content.ts carries the referer's
// in-memory content across one rename walk, which is what makes the
// descendants' swaps compose instead of overwriting each other). They no
// longer appear here.
//
// Step 67 — the revert of an act that renamed ANOTHER card — is a
// DELIBERATE difference and is declared in deliberate-differences.json.
// Ruby stores both reverted rows, then loses the act's action rows and raises
// "stage finalize was skipped" from its after_commit integration stage (the
// nested update! in :rollback_actions opens its own act,
// card/lib/card/director/run.rb:109-114); the port stores the same rows and
// completes the revert, keeping the action rows its save created. The port
// does what the revert was meant to do instead of crashing mid-revert and
// losing the act's history rows, so the declaration pins exactly the
// action rows and changes Ruby does not keep.
const KNOWN_DIVERGENCES: number[] = [];
const PREFIX = "PersistProbe";
// Same string as the Ruby half's NESTED_DECK_CONTENT (step 32).
const NESTED_DECK_CONTENT = "<p>Number cards hold numbers. (persistence probe)</p>";
// Same string as the Ruby half's LINKER_CONTENT (step 37).
const LINKER_CONTENT =
  "[[PersistProbe Mv]] [[PersistProbe Mv+PersistProbe Kid]] " +
  "{{PersistProbe Mv+PersistProbe Kid+PersistProbe Grand}} [[PersistProbe Host+PersistProbe Mv]]";
// Same string as the Ruby half's LIST_CONTENT (step 51).
const LIST_CONTENT =
  "[[PersistProbe Typed]]\n\n  [[PersistProbe Typed+PersistProbe Field]]  \n~1\n:anyone\nPersistProbe Loose";
// Same bytes as the Ruby half's uploads (steps 68-70).
const UPLOAD_TEXT = "persistence probe file\n";
const UPLOAD_TEXT_2 = "persistence probe file, second version\n";
const UPLOAD_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// The op list's length; the Ruby half's step count (run-ruby-steps.sh) and
// the committed oracle dumps must agree with it. The public run covers every
// step the withheld set does not claim.
const STEP_COUNT = PUBLIC_STEP_COUNT;
// The Ruby half runs as Card::Auth.as_bot, i.e. card 1 (Decko Bot). The act's
// actor_id and every card's creator_id/updater_id come from it.
const BOT = { id: 1, name: "Decko Bot" };
// The Ruby half runs under `decko runner`, outside any request, so Env.ip is
// nil and card_acts.ip_address is NULL. The TS half is given no request IP to
// match; the column is still compared.
const IP = null;

type Row = Record<string, unknown>;

const PROBE_CTE = `
  WITH RECURSIVE probe(id) AS (
    SELECT id FROM cards WHERE name LIKE '${PREFIX}%'
    UNION
    SELECT c.id FROM cards c JOIN probe p ON c.left_id = p.id OR c.right_id = p.id
  ) SELECT id FROM probe`;

/** Composed-name -> id for the probe's cards, INCLUDING trashed rows. */
async function nameMap(driver: LocalSqliteDriver): Promise<Map<string, number>> {
  const { rows } = await driver.query("SELECT id, name, left_id, right_id FROM cards", []);
  const byId = new Map<number, Row>();
  for (const row of rows as Row[]) byId.set(Number(row.id), row);
  const memo = new Map<number, string | undefined>();
  const composed = (id: number): string | undefined => {
    const known = memo.get(id);
    if (known !== undefined || memo.has(id)) return known;
    const row = byId.get(id);
    if (row === undefined) return undefined;
    let name: string | undefined;
    if (row.left_id === null && typeof row.name === "string" && row.name !== "") {
      name = row.name;
    } else if (row.left_id !== null) {
      const left = composed(Number(row.left_id));
      const right = composed(Number(row.right_id));
      name = left === undefined || right === undefined ? undefined : `${left}+${right}`;
    }
    memo.set(id, name);
    return name;
  };
  const out = new Map<string, number>();
  for (const id of byId.keys()) {
    const name = composed(id);
    if (name !== undefined && name.startsWith(PREFIX)) out.set(name, id);
  }
  return out;
}

/** The stored files of the probe's cards, as the Ruby half lists them:
 *  card id, file name, and the SHA-1 of the bytes (image versions by name
 *  only; their bytes come from each side's own image encoder, so they are
 *  not comparable). */
function probeFiles(ids: number[]): Row[] {
  const out: Row[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const dir = path.join(FILES_DIR, String(id));
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const version = /-(icon|small|medium|large|original)\./.test(name);
      const sha1 =
        version && !name.includes("-original.")
          ? null
          : createHash("sha1").update(readFileSync(path.join(dir, name))).digest("hex");
      out.push({ card_id: id, file: name, sha1 });
    }
  }
  return out;
}

async function probeState(driver: LocalSqliteDriver): Promise<Row> {
  const ids = (await driver.query<{ id: number }>(PROBE_CTE, [])).rows.map((r) => Number(r.id));
  if (ids.length === 0) {
    return {
      probe_card_ids: [],
      cards: [],
      card_acts: [],
      card_actions: [],
      card_changes: [],
      card_references: [],
      card_virtuals: [],
    };
  }
  const inList = ids.join(",");
  const q = async (sql: string): Promise<Row[]> => (await driver.query<Row>(sql, [])).rows;
  const actions = await q(
    `SELECT id, card_id, card_act_id, super_action_id, action_type, draft, comment
     FROM card_actions WHERE card_id IN (${inList}) ORDER BY id`,
  );
  const actionIds = new Set(actions.map((a) => Number(a.id)));
  const changes = (await q("SELECT id, card_action_id, field, value FROM card_changes ORDER BY id")).filter(
    (c) => actionIds.has(Number(c.card_action_id)),
  );
  const refs = await q(
    `SELECT id, referer_id, referee_key, referee_id, ref_type, is_present
     FROM card_references ORDER BY id`,
  );
  return {
    probe_card_ids: ids,
    cards: await q(
      `SELECT id, name, key, codename, left_id, right_id, trash, type_id, db_content,
              creator_id, updater_id, read_rule_class, read_rule_id, current_revision_id,
              references_expired, created_at, updated_at
       FROM cards WHERE id IN (${inList}) ORDER BY id`,
    ),
    card_acts: await q(
      `SELECT id, card_id, actor_id, ip_address, acted_at FROM card_acts
       WHERE card_id IN (${inList}) ORDER BY id`,
    ),
    card_actions: actions,
    card_changes: changes,
    card_references: refs.filter(
      (r) =>
        ids.includes(Number(r.referer_id)) ||
        String(r.referee_key ?? "").startsWith(PREFIX.toLowerCase()),
    ),
    card_virtuals: await q(
      `SELECT id, left_id, right_id, left_key, content FROM card_virtuals
       WHERE left_id IN (${inList}) ORDER BY id`,
    ),
    files: probeFiles(ids),
  };
}

async function bootEngine(dbPath: string): Promise<{
  driver: LocalSqliteDriver;
  engine: CardActionEngine;
}> {
  const driver = new LocalSqliteDriver({ path: dbPath, readonly: false });
  const fetcher = new FetchEngine(driver);
  const { rows } = await driver.query("SELECT id, name, left_id, right_id FROM cards", []);
  const byId = new Map<number, Row>();
  for (const row of rows as Row[]) byId.set(Number(row.id), row);
  const memo = new Map<number, string | undefined>();
  const composed = (id: number): string | undefined => {
    const known = memo.get(id);
    if (known !== undefined || memo.has(id)) return known;
    const row = byId.get(id);
    if (row === undefined) return undefined;
    let name: string | undefined;
    if (row.left_id === null && typeof row.name === "string" && row.name !== "") {
      name = row.name;
    } else if (row.left_id !== null) {
      const left = composed(Number(row.left_id));
      const right = composed(Number(row.right_id));
      name = left === undefined || right === undefined ? undefined : `${left}+${right}`;
    }
    memo.set(id, name);
    return name;
  };
  const idToName = new Map<number, string>();
  for (const id of byId.keys()) {
    const name = composed(id);
    if (name !== undefined) idToName.set(id, name);
  }
  fetcher.installNameEnvironment();
  for (const [id, name] of idToName) {
    const row = byId.get(id)!;
    fetcher.lexicon.write(
      id,
      DeckoName.parse(name),
      row.left_id === null ? String(row.name) : [Number(row.left_id), Number(row.right_id)],
    );
  }
  const [universe] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universe),
    ruleTypeIds: structureRuleTypesFromResults(universe),
  });
  // The engine as the write routes build it: the deck's mod event runtime
  // rides every save (account, permission and reference events included).
  const engine = new CardActionEngine(fetcher, {
    actor: BOT,
    ipAddress: IP,
    now: () => new Date("2026-09-19T12:00:00.000Z"),
    modEvents: await servingModEventRuntime(),
    attachmentStore: new LocalAttachmentStore(FILES_DIR),
  });
  return { driver, engine };
}

// The deck is committed: the default run never skips. A deck that names
// itself via PERSIST_SRC_DECK is a local artifact; when it is missing the
// probe skips and says so on stderr, and PERSIST_PARITY=1 makes that a
// failure with the path it wanted.
const HAVE_DECK = existsSync(SRC);
const RUN = HAVE_DECK || process.env.PERSIST_PARITY === "1";
if (!RUN) warn(`[persist] SKIPPED: oracle deck not found at ${SRC} (set PERSIST_SRC_DECK)`);
// The withheld steps are announced by name and count whether or not the set is
// present, so an absent set reads as a deliberate skip rather than a silent one.
// With the set present the count is the declared one, not the number this run
// skipped (which is then zero).
if (WITHHELD_SET_PRESENT) {
  const declared = (
    JSON.parse(readFileSync(WITHHELD_STEPS_FILE, "utf8")) as { steps: { step: number }[] }
  ).steps.map((s) => Number(s.step));
  warn(
    `[withheld until disclosure] RUN: ${declared.length} steps (${WITHHELD_STEPS_FILE})`,
  );
} else {
  warn(
    `[withheld until disclosure] NOT RUN: ${WITHHELD_STEP_NUMBERS.length} steps (${WITHHELD_STEPS_FILE})`,
  );
}

describe("persistence write probe (TS half)", () => {
  it.runIf(RUN)("runs the Ruby op list through the real CardActionEngine and dumps state", async () => {
    // The withheld set names real steps of this op list and nothing else, so
    // a stale or malformed file cannot silently shrink the run.
    // Present: the set file's numbers must match the public record of them.
    if (WITHHELD_SET_PRESENT) expect(WITHHELD_STEP_NUMBERS, "the withheld set's steps match the public record").toEqual(PUBLIC_WITHHELD_STEP_NUMBERS);
    for (const step of WITHHELD_STEPS) {
      expect(step, "a withheld step is a step of the op list").toBeGreaterThanOrEqual(1);
      expect(step, "a withheld step is a step of the op list").toBeLessThanOrEqual(70);
    }
    expect(new Set(WITHHELD_STEPS).size, "the withheld steps are distinct").toBe(
      WITHHELD_STEPS.length,
    );
    const dir = PERSIST_DIR;
    mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, "ts.sqlite3");
    copyFileSync(SRC, dbPath);
    rmSync(FILES_DIR, { recursive: true, force: true });
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    const { driver, engine } = await bootEngine(dbPath);
    const out: Row[] = [];
    // The account fields whose content is random or derived from it
    // (compare-persist.mjs normalises them), as the Ruby half records them.
    const codenameId = async (code: string): Promise<number> =>
      Number((await driver.query<{ id: number }>("SELECT id FROM cards WHERE codename = ?", [code])).rows[0]?.id);
    const codenameIds = { salt: await codenameId("salt"), password: await codenameId("password") };

    const names = async (): Promise<Map<string, number>> => nameMap(driver);
    const idOf = async (name: string): Promise<number> => {
      const map = await names();
      const id = map.get(name);
      if (id === undefined) throw new Error(`probe card missing: ${name}`);
      return id;
    };
    // The rendered result of a revert: the reverted card's core view from a
    // fresh render engine over the same deck (the request's soft redirect
    // re-renders the card fresh), as the Ruby half renders it.
    const renderAfter = async (cardId: number): Promise<Row> => {
      try {
        const row = (
          await driver.query<Row>("SELECT trash, type_id FROM cards WHERE id = ?", [cardId])
        ).rows[0];
        const name = [...(await names()).entries()].find(([, id]) => id === cardId)?.[0];
        if (name === undefined) return { error: `no name for card ${cardId}` };
        const typeName = (
          await driver.query<{ name: string }>("SELECT name FROM cards WHERE id = ?", [row.type_id])
        ).rows[0]?.name;
        const trash = Number(row.trash) === 1;
        if (trash) return { name, trash, type: typeName, core: null };
        // The render engine's freshness stamp table (db/schema.sqlite.sql
        // deck_data_version); the oracle deck predates it. It is a port-only
        // table, excluded from the row comparisons.
        await driver.query(
          `CREATE TABLE IF NOT EXISTS "deck_data_version" (
             "id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0)`,
          [],
        );
        await driver.query(`INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, []);
        const renderer = new RenderEngine(new FetchEngine(driver));
        return { name, trash, type: typeName, core: await renderer.render(name, "core") };
      } catch (error) {
        return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      }
    };
    const record = async (
      step: number,
      label: string,
      kind: string,
      detail: Row,
    ): Promise<void> => {
      const state = await probeState(driver);
      const render =
        kind === "revert" && detail.ok === true && typeof detail.value === "number"
          ? await renderAfter(detail.value)
          : undefined;
      out.push({ step, label, detail, state, codename_ids: codenameIds, ...(render !== undefined ? { render } : {}) });
      warn(
        `[persist] ${step} ${label} ok=${String(detail.ok)} ` +
          `cards=${(state.cards as Row[]).length} ` +
          `acts=${(state.card_acts as Row[]).length} ` +
          `actions=${(state.card_actions as Row[]).length} ` +
          `changes=${(state.card_changes as Row[]).length} ` +
          `refs=${(state.card_references as Row[]).length}`,
      );
    };
    const op = async (
      step: number,
      label: string,
      kind: string,
      fn: () => Promise<unknown>,
    ): Promise<unknown> => {
      // A withheld step is not part of this run at all: the op is never
      // called, so it writes nothing and records no state, matching the Ruby
      // half's skip of the same steps.
      if (WITHHELD_STEPS.includes(step)) {
        warn(`[persist] step ${step} ${label} withheld until disclosure; not run`);
        return null;
      }
      try {
        const value = await fn();
        const cardId =
          value && typeof value === "object"
            ? ((value as { cardId?: number; card?: { id?: number } }).cardId ??
              (value as { card?: { id?: number } }).card?.id ??
              null)
            : null;
        await record(step, label, kind, { ok: true, kind, value: cardId });
        return value;
      } catch (error) {
        const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        warn(`[persist] !! ${step} ${label}: ${text}`);
        await record(step, label, kind, { ok: false, kind, error: text });
        return null;
      }
    };

    // Ruby's `type: "RichText"` is the engine's typeName.
    const rich = { typeName: "RichText" };
    try {
      await op(1, "create simple", "create", () =>
        engine.createCard({ name: `${PREFIX} A`, ...rich, content: "alpha" } as CreateCardInput),
      );
      await op(2, "create compound", "create", () =>
        engine.createCard({
          name: `${PREFIX} A+${PREFIX} B`,
          ...rich,
          content: "beta",
        } as CreateCardInput),
      );
      const aId = await idOf(`${PREFIX} A`);
      await op(3, "update content", "update", () =>
        engine.updateCard({ cardId: aId, content: "alpha beta" } as UpdateCardInput),
      );
      await op(4, "update with link", "update", () =>
        engine.updateCard({ cardId: aId, content: `alpha beta [[${PREFIX} B]]` } as UpdateCardInput),
      );
      await op(5, "rename", "rename", () =>
        engine.updateCard({ cardId: aId, name: `${PREFIX} Renamed` } as UpdateCardInput),
      );
      const renamedId = await idOf(`${PREFIX} Renamed`);
      // TRASH is deleteCard, not updateCard: Ruby's delete! IS an update save
      // with trash: true (trash.rb:11-21 add_to_trash -> update!), and the
      // engine models that as the delete verb with its own child cascade.
      await op(6, "trash", "trash", () => engine.deleteCard({ cardId: renamedId }));
      // 7 and 8 are the ROUTE revival path: a save whose name matches a
      // trashed row revives that row (pull_from_trash!, trash.rb:57-62).
      await op(7, "revive child (route path: create same name)", "create", () =>
        engine.createCard({
          name: `${PREFIX} Renamed+${PREFIX} B`,
          ...rich,
          content: "beta",
        } as CreateCardInput),
      );
      await op(8, "revive parent (route path: create same name)", "create", () =>
        engine.createCard({
          name: `${PREFIX} Renamed`,
          ...rich,
          content: "alpha beta [[PersistProbe B]]",
        } as CreateCardInput),
      );
      const revivedId = await idOf(`${PREFIX} Renamed`);
      await op(9, "no-op update", "noop", async () => {
        const current = (
          await driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [
            revivedId,
          ])
        ).rows[0]?.db_content;
        const before = (
          await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])
        ).rows[0].n;
        const result = await engine.updateCard({
          cardId: revivedId,
          content: current ?? "",
        } as UpdateCardInput);
        const after = (
          await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])
        ).rows[0].n;
        return { actionsBefore: before, actionsAfter: after, saved: result !== null };
      });
      await op(10, "create over existing name", "create", () =>
        engine.createCard({
          name: `${PREFIX} Renamed`,
          ...rich,
          content: "dup",
        } as CreateCardInput),
      );
      await op(11, "create with cardtype", "create", () =>
        engine.createCard({ name: `${PREFIX} Type Probe`, typeName: "Cardtype" } as CreateCardInput),
      );
      await op(12, "update add nest", "update", () =>
        engine.updateCard({
          cardId: revivedId,
          content: `alpha beta [[${PREFIX} B]] {{{${PREFIX} Renamed|rich_text}}}}`,
        } as UpdateCardInput),
      );
      await op(13, "update remove nest and link", "update", () =>
        engine.updateCard({ cardId: revivedId, content: "alpha beta" } as UpdateCardInput),
      );
      await op(14, "save draft", "draft", () =>
        engine.updateCard({
          cardId: revivedId,
          content: "drafted text",
          draft: true,
        } as UpdateCardInput),
      );
      await op(15, "real save after draft", "update", () =>
        engine.updateCard({ cardId: revivedId, content: "alpha beta final" } as UpdateCardInput),
      );
      await op(16, "create parent", "create", () =>
        engine.createCard({ name: `${PREFIX} Parent`, ...rich, content: "p" } as CreateCardInput),
      );
      await op(17, "create child", "create", () =>
        engine.createCard({
          name: `${PREFIX} Parent+${PREFIX} Child`,
          ...rich,
          content: "c",
        } as CreateCardInput),
      );
      await op(18, "delete parent (trash cascade)", "delete", async () => {
        const parentId = await idOf(`${PREFIX} Parent`);
        return engine.deleteCard({ cardId: parentId });
      });
      // 19 is the MODEL-API revival: Ruby revives with Card#update!(trash:
      // false) on the trashed row, which Card.find reaches because find has
      // no trash filter; the engine's equivalent is an update with
      // lookInTrash. Ruby leaves a live child under a trashed parent.
      await op(19, "revive child (model path: update trash=false)", "trash", async () => {
        const childId = await idOf(`${PREFIX} Parent+${PREFIX} Child`);
        return engine.updateCard({ cardId: childId, trash: false, lookInTrash: true } as UpdateCardInput);
      });
      await op(20, "withheld", "update", () =>
        engine.updateCard({ cardId: revivedId, content: WITHHELD_CONTENT } as UpdateCardInput),
      );
      await op(21, "create without type or content", "create", () =>
        engine.createCard({ name: `${PREFIX} Bare` } as CreateCardInput),
      );
      await op(22, "withheld", "create", () =>
        engine.createCard({
          name: `${PREFIX} Plain`,
          typeName: "PlainText",
          content: WITHHELD_CONTENT,
        } as CreateCardInput),
      );
      // 23-31: the history pane's revert and restore requests, through the
      // engine's revert path (the server's /update/<mark>?revert_actions[]=..
      // and ?revert_to=previous&revert_act=.. land on the same call).
      const actionIdsOf = async (name: string): Promise<number[]> =>
        (
          await driver.query<{ id: number }>(
            "SELECT id FROM card_actions WHERE card_id = ? ORDER BY id",
            [await idOf(name)],
          )
        ).rows.map((r) => Number(r.id));
      const actOf = async (actionId: number): Promise<number> =>
        Number(
          (
            await driver.query<{ card_act_id: number }>(
              "SELECT card_act_id FROM card_actions WHERE id = ?",
              [actionId],
            )
          ).rows[0].card_act_id,
        );
      const rev = `${PREFIX} Rev`;
      await op(23, "create revert subject", "create", () =>
        engine.createCard({ name: rev, ...rich, content: `one [[${PREFIX} B]]` } as CreateCardInput),
      );
      await op(24, "update revert subject", "update", async () =>
        engine.updateCard({ cardId: await idOf(rev), content: "two" } as UpdateCardInput),
      );
      await op(25, "rename revert subject", "rename", async () =>
        engine.updateCard({ cardId: await idOf(rev), name: `${rev} Renamed` } as UpdateCardInput),
      );
      await op(26, "revert to this (undoes the rename)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(`${rev} Renamed`),
          actionIds: [(await actionIdsOf(`${rev} Renamed`))[1]],
        }),
      );
      await op(27, "revert to this (the create's content)", "revert", async () =>
        engine.revertActions({ cardId: await idOf(rev), actionIds: [(await actionIdsOf(rev))[0]] }),
      );
      await op(28, "revert to previous (the last act)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(rev),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(rev)).at(-1)!),
        }),
      );
      await op(29, "delete revert subject", "delete", async () =>
        engine.deleteCard({ cardId: await idOf(rev) }),
      );
      await op(30, "restore from history (revert a trashed card)", "revert", async () =>
        engine.revertActions({ cardId: await idOf(rev), actionIds: [(await actionIdsOf(rev)).at(-2)!] }),
      );
      await op(31, "withheld", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(`${PREFIX} Plain`),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(`${PREFIX} Plain`))[0]),
        }),
      );
      // 32: a save of an existing deck card nested by another existing card
      // (Number nests Number+description). Its writes land outside the
      // probe's rows; tools/persistence/compare-decks.mjs measures them.
      await op(32, "update a nested deck card", "update", async () => {
        const nested = (
          await driver.query<{ id: number }>(
            `SELECT c.id FROM cards c JOIN cards l ON l.id = c.left_id JOIN cards r ON r.id = c.right_id
             WHERE l.key = 'number' AND r.key = 'description' AND c.trash = 0`,
            [],
          )
        ).rows[0];
        if (nested === undefined) throw new Error("deck card missing: Number+description");
        return engine.updateCard({ cardId: Number(nested.id), content: NESTED_DECK_CONTENT } as UpdateCardInput);
      });
      // 33-42: renames that move descendants, rewrite referers, create sides.
      const mv = `${PREFIX} Mv`;
      await op(33, "create rename subject", "create", () =>
        engine.createCard({ name: mv, ...rich, content: "m" } as CreateCardInput),
      );
      await op(34, "create rename subject's child", "create", () =>
        engine.createCard({ name: `${mv}+${PREFIX} Kid`, ...rich, content: "k" } as CreateCardInput),
      );
      await op(35, "create rename subject's grandchild", "create", () =>
        engine.createCard({
          name: `${mv}+${PREFIX} Kid+${PREFIX} Grand`,
          ...rich,
          content: "g",
        } as CreateCardInput),
      );
      await op(36, "create card with subject as right side", "create", () =>
        engine.createCard({ name: `${PREFIX} Host+${mv}`, ...rich, content: "h" } as CreateCardInput),
      );
      await op(37, "create referer of the subject's family", "create", () =>
        engine.createCard({ name: `${PREFIX} Linker`, ...rich, content: LINKER_CONTENT } as CreateCardInput),
      );
      await op(38, "rename with descendants (referers updated)", "rename", async () =>
        engine.updateCard({ cardId: await idOf(mv), name: `${PREFIX} Moved` } as UpdateCardInput),
      );
      await op(39, "rename with descendants (referers kept)", "rename", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Moved`),
          name: `${PREFIX} Moved Again`,
          skip: ["update_referer_content"],
        } as UpdateCardInput),
      );
      await op(40, "rename compound to new sides", "rename", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Moved Again+${PREFIX} Kid`),
          name: `${PREFIX} Far+${PREFIX} Kid2`,
        } as UpdateCardInput),
      );
      await op(41, "rename simple to compound", "rename", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Linker`),
          name: `${PREFIX} Lnk+${PREFIX} Side`,
        } as UpdateCardInput),
      );
      await op(42, "rename a tag in use to compound (refused)", "rename", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Kid2`),
          name: `${PREFIX} X+${PREFIX} Y`,
        } as UpdateCardInput),
      );
      // 43-50: type changes.
      const typed = `${PREFIX} Typed`;
      await op(43, "create type-change subject", "create", () =>
        engine.createCard({ name: typed, ...rich, content: `<p>t [[${PREFIX} B]]</p>` } as CreateCardInput),
      );
      await op(44, "change type", "update", async () =>
        engine.updateCard({ cardId: await idOf(typed), typeName: "PlainText" } as UpdateCardInput),
      );
      await op(45, "change type and content", "update", async () =>
        engine.updateCard({
          cardId: await idOf(typed),
          typeName: "Pointer",
          content: `[[${PREFIX} B]]`,
        } as UpdateCardInput),
      );
      await op(46, "create field of type-change subject", "create", () =>
        engine.createCard({ name: `${typed}+${PREFIX} Field`, ...rich, content: "f" } as CreateCardInput),
      );
      await op(47, "change type of a card with a field", "update", async () =>
        engine.updateCard({ cardId: await idOf(typed), typeName: "RichText" } as UpdateCardInput),
      );
      await op(48, "change to an unknown type", "update", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Bare`),
          typeName: `${PREFIX} No Such Type`,
        } as UpdateCardInput),
      );
      await op(49, "create instance of probe cardtype", "create", () =>
        engine.createCard({
          name: `${PREFIX} Instance`,
          typeName: `${PREFIX} Type Probe`,
          content: "i",
        } as CreateCardInput),
      );
      await op(50, "change type of a cardtype with instances", "update", async () =>
        engine.updateCard({ cardId: await idOf(`${PREFIX} Type Probe`), typeName: "RichText" } as UpdateCardInput),
      );
      // 51-52: list content (standardized items, item references, item swaps).
      await op(51, "create pointer with marks", "create", () =>
        engine.createCard({ name: `${PREFIX} List`, typeName: "Pointer", content: LIST_CONTENT } as CreateCardInput),
      );
      await op(52, "rename a card a pointer lists", "rename", async () =>
        engine.updateCard({ cardId: await idOf(typed), name: `${PREFIX} Typed2` } as UpdateCardInput),
      );
      // 53-56: form saves with subcards.
      const form = `${PREFIX} Form`;
      await op(53, "create with subcards", "create", () =>
        engine.createCard({
          name: form,
          ...rich,
          content: "main",
          subcards: {
            [`+${PREFIX} Sub`]: { content: "s" },
            [`${PREFIX} Other`]: { typeName: "PlainText", content: "o" },
          },
        } as CreateCardInput),
      );
      await op(54, "update subcards only (one changed, one new)", "update", async () =>
        engine.updateCard({
          cardId: await idOf(form),
          subcards: {
            [`+${PREFIX} Sub`]: { content: "s2" },
            [`+${PREFIX} New Sub`]: { content: "n" },
          },
        } as UpdateCardInput),
      );
      await op(55, "update main with an unchanged subcard", "update", async () =>
        engine.updateCard({
          cardId: await idOf(form),
          content: "main2",
          subcards: { [`+${PREFIX} Sub`]: { content: "s2" } },
        } as UpdateCardInput),
      );
      await op(56, "create with a list subcard", "create", () =>
        engine.createCard({
          name: `${PREFIX} Form2`,
          ...rich,
          content: "f2",
          subcards: {
            [`+${PREFIX} Tags`]: { typeName: "Pointer", content: `[[${PREFIX} B]]\n[[${PREFIX} Form]]` },
          },
        } as CreateCardInput),
      );
      // 57-60: account and role cards.
      const user = `${PREFIX} User`;
      await op(57, "create user with account", "create", () =>
        engine.createCard({
          name: user,
          typeName: "User",
          subcards: {
            "+*account": {
              subcards: {
                "+*email": { content: "persist-probe@example.com" },
                "+*password": { content: "Probe-pass-123" },
              },
            },
          },
        } as CreateCardInput),
      );
      await op(58, "change account password", "update", async () =>
        engine.updateCard({
          cardId: await idOf(`${user}+*account+*password`),
          content: "Probe-pass-456",
        } as UpdateCardInput),
      );
      await op(59, "create role", "create", () =>
        engine.createCard({ name: `${PREFIX} Role`, typeName: "Role" } as CreateCardInput),
      );
      await op(60, "add user to role", "create", () =>
        engine.createCard({ name: `${PREFIX} Role+*members`, content: `[[${user}]]` } as CreateCardInput),
      );
      // 61-64: rules that change read permissions.
      await op(61, "create *self read rule", "create", () =>
        engine.createCard({ name: `${form}+*self+*read`, content: `[[${PREFIX} Role]]` } as CreateCardInput),
      );
      await op(62, "create *type read rule", "create", () =>
        engine.createCard({
          name: `${PREFIX} Type Probe+*type+*read`,
          content: "[[Anyone Signed In]]",
        } as CreateCardInput),
      );
      await op(63, "change a read rule's content", "update", async () =>
        engine.updateCard({
          cardId: await idOf(`${form}+*self+*read`),
          content: "[[Administrator]]",
        } as UpdateCardInput),
      );
      await op(64, "delete a read rule", "delete", async () =>
        engine.deleteCard({ cardId: await idOf(`${form}+*self+*read`) }),
      );
      // 65-67: reverts whose act renames or trashes another card.
      await op(65, "update with a subcard rename", "update", async () =>
        engine.updateCard({
          cardId: await idOf(form),
          content: "main3",
          subcards: { [`${PREFIX} Other`]: { name: `${PREFIX} Other Renamed` } },
        } as UpdateCardInput),
      );
      await op(66, "revert to previous of a create act with subcards (trashes them)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(form),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(form))[0]),
        }),
      );
      // The act of step 65: the card's action before step 66's.
      await op(67, "revert to previous (act renamed another card)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(form),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(form)).at(-2)!),
        }),
      );
      // 68-70: file and image uploads.
      const upload = (name: string, bytes: Uint8Array) => ({ bytes, originalFilename: name });
      await op(68, "create file card with an upload", "create", () =>
        engine.createCard({
          name: `${PREFIX} File`,
          typeName: "File",
          attachment: upload("probe.txt", Buffer.from(UPLOAD_TEXT)),
        } as CreateCardInput),
      );
      await op(69, "replace a file card's upload", "update", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} File`),
          attachment: upload("probe-2.txt", Buffer.from(UPLOAD_TEXT_2)),
        } as UpdateCardInput),
      );
      await op(70, "create image card with an upload", "create", () =>
        engine.createCard({
          name: `${PREFIX} Image`,
          typeName: "Image",
          attachment: upload("probe.png", Buffer.from(UPLOAD_PNG_BASE64, "base64")),
        } as CreateCardInput),
      );
    } finally {
      driver.close();
      // PERSIST_KEEP_TS_DECK=<path>: keep the deck as the op list left it,
      // for the whole-deck row comparison (tools/persistence/compare-decks.mjs).
      // The caller owns that copy and removes it.
      const keep = process.env.PERSIST_KEEP_TS_DECK;
      if (keep !== undefined && keep !== "") copyFileSync(dbPath, keep);
      copyFileSync(dbPath, FINAL_DECK);
      for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) rmSync(f, { force: true });
      rmSync(FILES_DIR, { recursive: true, force: true });
    }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    expect(out.length).toBe(STEP_COUNT);

    // Compare against the Ruby oracle's dumps for the same op list
    // (tools/persistence/run-ruby-steps.sh). Each operation's own row delta
    // must match except the declared deliberate differences
    // (deliberate-differences.json is the authority); a newly matching step
    // fails here too, so the list is kept honest in both directions.
    if (LEGACY_PASSWORDS) {
      const all = JSON.parse(readFileSync(DECLARATIONS, "utf8")) as { differences: Array<{ step: number }> };
      writeFileSync(
        DELIBERATE,
        JSON.stringify({ ...all, differences: all.differences.filter((d) => !PASSWORD_STEPS.includes(d.step)) }),
      );
    }
    const report = path.join(PERSIST_DIR, "compare-report.json");
    const run = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-persist.mjs"), RUBY_STEPS, OUT, report, DELIBERATE],
      { windowsHide: true, encoding: "utf8" },
    );
    expect(run.status, run.stderr).not.toBe(2); // 2 = a missing input
    const steps = (JSON.parse(readFileSync(report, "utf8")) as { steps: Row[] }).steps;
    const diverging = steps
      .filter((s) => (s.unexpectedDeltaFaults as unknown[]).length > 0)
      .map((s) => Number(s.step));
    expect(diverging).toEqual(KNOWN_DIVERGENCES);
    const deliberate = steps
      .filter((s) => (s.deliberate as { declaredFaultsMatch?: boolean } | null)?.declaredFaultsMatch === true)
      .map((s) => Number(s.step));
    expect(deliberate).toEqual(DELIBERATE_STEPS);
    // Declared differences 20 and 22 are exercised whenever the withheld set is
    // present: the run then withholds nothing, so both must come out declared.
    if (WITHHELD_SET_PRESENT) expect(deliberate, "withheld set present: declared steps 20 and 22 are exercised").toEqual(expect.arrayContaining([20, 22]));

    // The rendered result of every revert step Ruby completed equals Ruby's,
    // byte for byte — EXCEPT step 67, whose render difference is the same
    // divergence its rows carry (the revert of an act that renamed another
    // card: Ruby loses the act's action rows and raises, so its recorded
    // page is the half-applied one; the port completes the revert and
    // renders the reverted card). Seven revert steps render in the full
    // op list; six match Ruby's bytes. The withheld set takes step 31's
    // revert out of the run with it, so the public run compares one fewer.
    const renders = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-renders.mjs"), RUBY_STEPS, OUT],
      { windowsHide: true, encoding: "utf8" },
    );
    const renderSummary = JSON.parse(renders.stdout) as { compared: number; same: number };
    expect(renderSummary.compared, renders.stderr).toBe(7 - (WITHHELD_STEPS.includes(31) ? 1 : 0));
    expect(renderSummary.same, renders.stderr).toBe(6 - (WITHHELD_STEPS.includes(31) ? 1 : 0));

    // Every row either engine wrote OUTSIDE the probe's own records, in every
    // table of the deck, matches the Ruby oracle's (its delta committed as
    // ruby-outside-delta.json): ancestor timestamps, other cards' acts,
    // actions, changes and references, and any other table.
    try {
      const decks = spawnSync(
        process.execPath,
        [
          path.join(REPO, "tools/persistence/compare-decks.mjs"),
          SRC,
          path.join(RUBY_STEPS, "ruby-outside-delta.json"),
          FINAL_DECK,
          path.join(PERSIST_DIR, "compare-decks-report.json"),
          `--deliberate=${DELIBERATE}`,
        ],
        { windowsHide: true, encoding: "utf8" },
      );
      expect(decks.status, decks.stderr).toBe(0);
    } finally {
      for (const f of [FINAL_DECK, `${FINAL_DECK}-shm`, `${FINAL_DECK}-wal`]) rmSync(f, { force: true });
    }
  }, 900000);
});

/** vitest surfaces console output only on failure; this is the run's own log. */
function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}