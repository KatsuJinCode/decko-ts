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
//  10  create over existing name        20 update with unsafe html
//  21  create without type or content   22 create plain text with html
//  23  create revert subject            28 revert to previous (last act)
//  24  update revert subject            29 delete revert subject
//  25  rename revert subject            30 restore from history
//  26  revert to this (undo rename)     31 revert to previous of a create
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
// committed Ruby dumps, and asserts which steps diverge. Without the oracle
// deck it skips and says so on stderr; with PERSIST_PARITY=1 a missing deck
// fails with the path it wanted.

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
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { DeckoName } from "../../src/card/name.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { servingModEventRuntime } from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";

const SRC =
  process.env.PERSIST_SRC_DECK ??
  "C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3";
// Anchored to the repository, not the process cwd: the runner may be started
// from anywhere, and a cwd-relative path writes the deck copy into whatever
// directory that happens to be.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PERSIST_DIR = path.join(REPO, "tmp/persist");
const OUT = process.env.PERSIST_TS_OUT ?? path.join(PERSIST_DIR, "ts-state.json");
// Uploaded files (steps 68-70), removed with the deck copy.
const FILES_DIR = path.join(PERSIST_DIR, "ts-files");
// The TS deck as the op list left it, kept only for the whole-deck comparison.
const FINAL_DECK = path.join(PERSIST_DIR, "ts-final-compare.sqlite3");
// The Ruby oracle's per-step dumps, committed so the comparison runs without
// a Ruby install.
const RUBY_STEPS =
  process.env.PERSIST_RUBY_STEPS ?? path.join(REPO, "tests/fixtures/persistence-oracle");
// The deliberate differences, each declared with its reason and its exact
// row delta. Step 7, re-creating a junction while its left side is trashed:
// Ruby inserts a second junction row (possible only because the oracle deck
// lacks the production UNIQUE (left_id, right_id) index); the port revives
// the trashed row. Step 48, assigning a type that does not exist: Ruby loses
// its own "not a known type" error and writes an empty act; the port refuses
// the save. Step 67, reverting an act that renamed another card: Ruby
// raises after storing the reverted rows without history; the port refuses
// before writing. Steps 20, 22 and 31, stored HTML: Ruby's cleaner keeps a
// javascript: link target, the port's drops it (a security difference,
// docs/SECURITY.md). Steps 57 and 58, password storage: under the default
// policy the port stores PBKDF2 where Ruby stores salted SHA-1 (also a
// security difference); run with DECKO_PASSWORD_HASH=legacy-sha1, the
// setting for a deck Ruby also serves, the probe expects Ruby's exact rows
// there. The comparator accepts a declared step only if its delta is exactly
// the declared one.
const DECLARATIONS = path.join(REPO, "tests/fixtures/persistence-oracle/deliberate-differences.json");
const LEGACY_PASSWORDS = process.env.DECKO_PASSWORD_HASH === "legacy-sha1";
const PASSWORD_STEPS = [57, 58];
const DELIBERATE_STEPS = [7, 20, 22, 31, 48, 67, ...(LEGACY_PASSWORDS ? [] : PASSWORD_STEPS)].sort((a, b) => a - b);
// The declarations in force for this run: without the password steps in
// legacy-sha1 mode (a declaration that no longer applies would be stale).
const DELIBERATE = LEGACY_PASSWORDS ? path.join(PERSIST_DIR, "deliberate-differences-legacy-passwords.json") : DECLARATIONS;
// Steps whose row delta still differs from the oracle without a declaration.
const KNOWN_DIVERGENCES: number[] = [];
const PREFIX = "PersistProbe";
// Same string as the Ruby half's UNSAFE_HTML.
const UNSAFE_HTML =
  '<p onclick="x()">hi</p><script>bad()</script><b>ok</b>' +
  '<a href="javascript:evil()">l</a><div class="c" style="color:red">d</div>';
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
// the committed oracle dumps must agree with it.
const STEP_COUNT = 70;
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
 *  only; their bytes are the image encoder's, measured by the side-effects
 *  team). */
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

// The oracle deck is a local artifact. Without it the probe skips, and says
// so on stderr; with PERSIST_PARITY=1 a missing deck is a failure instead.
const HAVE_DECK = existsSync(SRC);
const RUN = HAVE_DECK || process.env.PERSIST_PARITY === "1";
if (!RUN) warn(`[persist] SKIPPED: oracle deck not found at ${SRC} (set PERSIST_SRC_DECK)`);

describe("persistence write probe (TS half)", () => {
  it.runIf(RUN)("runs the Ruby op list through the real CardActionEngine and dumps state", async () => {
    const dir = PERSIST_DIR;
    mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, "ts.sqlite3");
    copyFileSync(SRC, dbPath);
    rmSync(FILES_DIR, { recursive: true, force: true });
    applyDeckInflections(ORACLE_DECK_INFLECTIONS);
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
      await op(20, "update with unsafe html", "update", () =>
        engine.updateCard({ cardId: revivedId, content: UNSAFE_HTML } as UpdateCardInput),
      );
      await op(21, "create without type or content", "create", () =>
        engine.createCard({ name: `${PREFIX} Bare` } as CreateCardInput),
      );
      await op(22, "create plain text with html", "create", () =>
        engine.createCard({
          name: `${PREFIX} Plain`,
          typeName: "PlainText",
          content: UNSAFE_HTML,
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
      await op(31, "revert to previous of a create (trashes it)", "revert", async () =>
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
    // must match, except the divergences recovery/parity-team/persistence.md
    // records; a newly matching step fails here too, so the list is kept
    // honest in both directions.
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

    // The rendered result of every revert step Ruby completed equals Ruby's,
    // byte for byte.
    const renders = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-renders.mjs"), RUBY_STEPS, OUT],
      { windowsHide: true, encoding: "utf8" },
    );
    const renderSummary = JSON.parse(renders.stdout) as { compared: number; same: number };
    expect(renderSummary.compared, renders.stderr).toBe(6);
    expect(renderSummary.same, renders.stderr).toBe(6);

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
          path.join(REPO, "tests/fixtures/persistence-oracle/ruby-outside-delta.json"),
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