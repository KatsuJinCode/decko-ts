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
//
// It is a driver, not an assertion: it writes its JSON and asserts only that
// the op list completed. Nothing skips silently — a missing source deck
// FAILS with the path it wanted.

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
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

const SRC =
  process.env.PERSIST_SRC_DECK ??
  "C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3";
// Anchored to the repository, not the process cwd: the runner may be started
// from anywhere, and a cwd-relative path writes the deck copy into whatever
// directory that happens to be.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PERSIST_DIR = path.join(REPO, "tmp/persist");
const OUT = process.env.PERSIST_TS_OUT ?? path.join(PERSIST_DIR, "ts-state.json");
const PREFIX = "PersistProbe";
// Same string as the Ruby half's UNSAFE_HTML.
const UNSAFE_HTML =
  '<p onclick="x()">hi</p><script>bad()</script><b>ok</b>' +
  '<a href="javascript:evil()">l</a><div class="c" style="color:red">d</div>';
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
  const engine = new CardActionEngine(fetcher, {
    actor: BOT,
    ipAddress: IP,
    now: () => new Date("2026-09-19T12:00:00.000Z"),
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
    applyDeckInflections(ORACLE_DECK_INFLECTIONS);
    const { driver, engine } = await bootEngine(dbPath);
    const out: Row[] = [];

    const names = async (): Promise<Map<string, number>> => nameMap(driver);
    const idOf = async (name: string): Promise<number> => {
      const map = await names();
      const id = map.get(name);
      if (id === undefined) throw new Error(`probe card missing: ${name}`);
      return id;
    };
    const record = async (
      step: number,
      label: string,
      kind: string,
      detail: Row,
    ): Promise<void> => {
      const state = await probeState(driver);
      out.push({ step, label, detail, state });
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
      // no trash filter. The engine's update has no trash field and resolves
      // its row through the retrieval seam, which filters trash. Last on
      // purpose: Ruby leaves a live child under a trashed parent, and every
      // later op would inherit that state.
      await op(19, "revive child (model path: update trash=false)", "trash", async () => {
        const childId = await idOf(`${PREFIX} Parent+${PREFIX} Child`);
        return engine.updateCard({ cardId: childId, trash: false } as unknown as UpdateCardInput);
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
    } finally {
      driver.close();
      for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) rmSync(f, { force: true });
    }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    expect(out.length).toBe(22);
  }, 900000);
});

/** vitest surfaces console output only on failure; this is the run's own log. */
function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}