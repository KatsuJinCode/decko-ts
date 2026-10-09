// persist-leftover-probe.ts -- the TYPESCRIPT half of the persistence
// LEFTOVER probe, the partner of tools/persistence/leftover-probe.rb (keep
// the op lists in lockstep). The operations the 70-step op list does not
// cover, each against the same copy of the oracle deck through the real
// CardActionEngine, dumped in the same shape and diffed by
// tools/persistence/compare-persist.mjs against the Ruby oracle's committed
// dumps (tests/fixtures/persistence-leftover-oracle/).
//
//   1  create a host card                        (setup)
//   2  create a rule card under it               (setup)
//   3  RENAME the rule card (another setting)
//   4  assign non-standard content to *recent settings
//   5  assign non-standard content to the Mod card
//   6-8  create a host, its child, delete the host (setup)
//   9  revert the delete act (REVIVES the trashed child)
//   10 create a card with a subcard              (setup)
//   11 create the subcard's own child            (NOT in act 10)
//   12 revert act 10 (trashes the subcard; its child?)
//
// The probe's scope is wider than the name prefix: *recent settings and the
// Mod card are in the dump (the two self-set list cards), so their rows are
// compared step by step. Without the oracle deck the test skips loudly;
// PERSIST_PARITY=1 turns the skip into a failure.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const SRC =
  process.env.PERSIST_SRC_DECK ??
  "C:/localProjects/decko-oracle-app-parity-fix/db/development.sqlite3";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PERSIST_DIR = path.join(REPO, "tmp/persist-leftover");
const OUT = path.join(PERSIST_DIR, "ts-state.json");
const FINAL_DECK = path.join(PERSIST_DIR, "ts-final.sqlite3");
// The Ruby oracle's per-step dumps, committed so the comparison runs without
// a Ruby install.
const RUBY_STEPS =
  process.env.PERSIST_RUBY_STEPS ?? path.join(REPO, "tests/fixtures/persistence-leftover-oracle");
const PREFIX = "PersistProbe";
const STEP_COUNT = 12;
const BOT = { id: 1, name: "Decko Bot" };
const IP = null;

type Row = Record<string, unknown>;

const PROBE_CTE = `
  WITH RECURSIVE probe(id) AS (
    SELECT id FROM cards WHERE name LIKE '${PREFIX}%' OR key IN ('*recent_setting', 'mod')
    UNION
    SELECT c.id FROM cards c JOIN probe p ON c.left_id = p.id OR c.right_id = p.id
  ) SELECT id FROM probe`;

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
    card_references: await q(
      `SELECT id, referer_id, referee_key, referee_id, ref_type, is_present
       FROM card_references
       WHERE referer_id IN (${inList}) OR referee_key LIKE '${PREFIX.toLowerCase()}%'
       ORDER BY id`,
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
    modEvents: await servingModEventRuntime(),
  });
  return { driver, engine };
}

const HAVE_DECK = existsSync(SRC);
const RUN = HAVE_DECK || process.env.PERSIST_PARITY === "1";
if (!RUN) process.stderr.write(`[persist-leftover] SKIPPED: oracle deck not found at ${SRC} (set PERSIST_SRC_DECK)\n`);

describe("persistence leftover probe (TS half)", () => {
  it.runIf(RUN)("runs the leftover op list through the real CardActionEngine and dumps state", async () => {
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
    const record = async (step: number, label: string, kind: string, detail: Row): Promise<void> => {
      const state = await probeState(driver);
      const render =
        kind === "revert" && detail.ok === true && typeof detail.value === "number"
          ? await renderAfter(detail.value)
          : undefined;
      out.push({ step, label, detail, state, ...(render !== undefined ? { render } : {}) });
      process.stderr.write(
        `[persist-leftover] ${step} ${label} ok=${String(detail.ok)} cards=${(state.cards as Row[]).length}\n`,
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
        process.stderr.write(`[persist-leftover] !! ${step} ${label}: ${text}\n`);
        await record(step, label, kind, { ok: false, kind, error: text });
        return null;
      }
    };
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

    try {
      const rich = { typeName: "RichText" };
      await op(1, "create rule host", "create", () =>
        engine.createCard({ name: `${PREFIX} Ruled`, ...rich, content: "r" } as CreateCardInput),
      );
      await op(2, "create rule card", "create", () =>
        engine.createCard({
          name: `${PREFIX} Ruled+*self+*read`,
          content: "[[Anyone Signed In]]",
        } as CreateCardInput),
      );
      await op(3, "rename the rule card (another setting)", "rename", async () =>
        engine.updateCard({
          cardId: await idOf(`${PREFIX} Ruled+*self+*read`),
          name: `${PREFIX} Ruled+*self+*create`,
        } as UpdateCardInput),
      );
      await op(4, "assign non-standard content to *recent settings", "update", async () => {
        const recentId = Number(
          (
            await driver.query<{ id: number }>(
              "SELECT id FROM cards WHERE key = '*recent_setting'",
              [],
            )
          ).rows[0].id,
        );
        return engine.updateCard({
          cardId: recentId,
          content: "[[*read]]\n\n  [[*create]]  \n~1\n[[*all+*layout]]",
        } as UpdateCardInput);
      });
      await op(5, "assign non-standard content to the Mod card", "update", async () => {
        const modId = Number(
          (await driver.query<{ id: number }>("SELECT id FROM cards WHERE key = 'mod'", [])).rows[0].id,
        );
        return engine.updateCard({
          cardId: modId,
          content: "[[history]]  \n\n  [[Machines]]\n:recent_settings",
        } as UpdateCardInput);
      });
      await op(6, "create revive host", "create", () =>
        engine.createCard({ name: `${PREFIX} Host`, ...rich, content: "h" } as CreateCardInput),
      );
      await op(7, "create revive host's child", "create", () =>
        engine.createCard({
          name: `${PREFIX} Host+${PREFIX} Kid`,
          ...rich,
          content: "k",
        } as CreateCardInput),
      );
      await op(8, "delete the host (trash cascade)", "delete", async () =>
        engine.deleteCard({ cardId: await idOf(`${PREFIX} Host`) }),
      );
      await op(9, "revert the delete act (revives the trashed child)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(`${PREFIX} Host`),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(`${PREFIX} Host`)).at(-1)!),
        }),
      );
      await op(10, "create cascade parent with a subcard", "create", () =>
        engine.createCard({
          name: `${PREFIX} Par`,
          ...rich,
          content: "p",
          subcards: { [`+${PREFIX} KidA`]: { content: "k" } },
        } as CreateCardInput),
      );
      await op(11, "create the subcard's own child", "create", () =>
        engine.createCard({
          name: `${PREFIX} Par+${PREFIX} KidA+${PREFIX} Grand`,
          ...rich,
          content: "g",
        } as CreateCardInput),
      );
      await op(12, "revert the create act (subcard trash; its child?)", "revert", async () =>
        engine.revertActions({
          cardId: await idOf(`${PREFIX} Par`),
          revertToPrevious: true,
          actId: await actOf((await actionIdsOf(`${PREFIX} Par`))[0]),
        }),
      );
    } finally {
      driver.close();
      const keep = process.env.PERSIST_KEEP_TS_DECK;
      if (keep !== undefined && keep !== "") copyFileSync(dbPath, keep);
      copyFileSync(dbPath, FINAL_DECK);
      for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) rmSync(f, { force: true });
    }
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    expect(out.length).toBe(STEP_COUNT);

    // Compare against the Ruby oracle's dumps for the same op list
    // (run-ruby-steps.sh with PROBE_SCRIPT=leftover-probe.rb). Every step's
    // whole-state and delta must match: the leftovers lane's bars are
    // implement-and-match or pin-as-declared, nothing in between.
    const report = path.join(PERSIST_DIR, "compare-report.json");
    const run = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-persist.mjs"), RUBY_STEPS, OUT, report],
      { windowsHide: true, encoding: "utf8" },
    );
    expect(run.status, run.stderr ?? "comparator failed").toBe(0);

    // The rendered result of every revert step Ruby completed equals Ruby's,
    // byte for byte.
    const renders = spawnSync(
      process.execPath,
      [path.join(REPO, "tools/persistence/compare-renders.mjs"), RUBY_STEPS, OUT],
      { windowsHide: true, encoding: "utf8" },
    );
    const renderSummary = JSON.parse(renders.stdout) as { compared: number; same: number };
    expect(renderSummary.compared, renders.stderr).toBe(renderSummary.same);
  }, 900000);
});
