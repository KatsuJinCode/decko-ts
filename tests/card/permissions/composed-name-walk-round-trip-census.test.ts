// WHAT DOES THE COMPOSED-NAME PATH COST THE SAVE IN ROUND TRIPS?
//
// Every report on this path has measured the walk in MILLISECONDS (1.0-1.4 ms
// per cold save-shape call) and the save in STATEMENT COUNTS. Neither is the
// currency the live host charges: on Bunny every driver call is a pipeline
// POST, so wall = round trips x hop latency. A walk can be 1 ms of SQL and
// still cost fifteen POSTs.
//
// This measures the missing unit — driver.roundTrips() — through the SHIPPED
// resolveRuleIdsByComposedKeys, on the serving deck, in the exact shape the
// graded save asks it for (five candidates, one call). It answers two
// questions the ladder cannot separate out of a mixed statement list:
//
//   1. how many round trips ONE cold save-shape walk costs, and
//   2. whether batching the seed reads could still buy anything — that is,
//      how many of those round trips are seed reads rather than arms.
//
// SEPARATE DRIVER PER CALL, for the reason the serving-deck equivalence test
// gives: a save drops the memo at every write, so each walk is paid cold, and
// one shared driver would let the first call warm the later ones.
//
// SKIPS, loudly, when the serving deck is absent rather than censusing zero.
//   C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
// Override with DECKO_SERVING_DECK.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveRuleIdsByComposedKeys } from "../../../src/card/permissions/read-rules.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import type { SQLStatement } from "../../../src/server/driver.js";

const DEFAULT_DECK =
  "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const DECK = process.env["DECKO_SERVING_DECK"] ?? DEFAULT_DECK;

/** The graded save's candidate list, verbatim from
 *  tests/card/permissions/rule-candidate-walk-equivalence-on-serving-deck.test.ts
 *  — the shape firstApplicableReadRule asks for on this deck. */
const SAVE_SHAPE_CANDIDATES = [
  "person+company+*type_plu_right+*read",
  "person+skill+*type_plu_right+*read",
  "person+project_s_participating+*type_plu_right+*read",
  "basic_c+*type+*read",
  "person+related_person+*type_plu_right+*read",
];

/** The walk's two statement shapes, so the census can split seed reads (which
 *  COULD ride one batch, being independent of each other) from arm reads (which
 *  cannot: level n+1's pairs are computed from level n's answers). */
const SEED_PREFIX = `SELECT id, "key", trash FROM cards WHERE "key" IN`;
const ARM_PREFIX = "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND +trash = 0";

interface Tally {
  queries: number;
  batches: number;
  statements: number;
  seedStatements: number;
  armStatements: number;
  /** arm statements that rode a lone query instead of a batch — should be 0. */
  loneArmStatements: number;
  /** every non-seed, non-arm statement shape the walk asked for. */
  otherShapes: Map<string, number>;
}

function classify(sql: string): "seed" | "arm" | "other" {
  const flat = sql.replace(/\s+/g, " ");
  if (flat.startsWith(SEED_PREFIX.replace(/\s+/g, " "))) return "seed";
  if (flat.startsWith(ARM_PREFIX)) return "arm";
  return "other";
}

/** A driver proxy that counts what the SHIPPED code asks the transport for.
 *  One driver.query and one driver.batch are each exactly one pipeline POST
 *  (the libsql/hrana contract the block-batching report relies on), so these
 *  two counters ARE the round trips. */
function counting(inner: SQLDatabaseDriver, tally: Tally): SQLDatabaseDriver {
  const note = (sql: string, inBatch: boolean): void => {
    tally.statements += 1;
    const kind = classify(sql);
    if (kind === "seed") tally.seedStatements += 1;
    else if (kind === "arm") {
      tally.armStatements += 1;
      if (!inBatch) tally.loneArmStatements += 1;
    } else {
      tally.otherShapes.set(
        sql.replace(/\s+/g, " ").slice(0, 90),
        (tally.otherShapes.get(sql.replace(/\s+/g, " ").slice(0, 90)) ?? 0) + 1,
      );
    }
  };
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return async (sql: string, params?: unknown) => {
          tally.queries += 1;
          note(sql, false);
          return (target.query as (s: string, p?: unknown) => unknown)(sql, params);
        };
      }
      if (prop === "batch") {
        return async (statements: SQLStatement[]) => {
          tally.batches += 1;
          for (const s of statements) note(s.sql, true);
          return (target.batch as (s: SQLStatement[]) => unknown)(statements);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const deckAvailable = existsSync(DECK);
const skip = deckAvailable
  ? false
  : `serving deck not present at ${DECK} (override with DECKO_SERVING_DECK)`;

describe("composed-name walk round-trip census", () => {
  it("counts the round trips one cold save-shape walk costs on the serving deck", async () => {
    if (skip !== false) {
      console.log(`SKIPPED: ${skip}`);
      return;
    }

    const perCall: Tally[] = [];
    for (let call = 0; call < 5; call += 1) {
      const cold = new LocalSqliteDriver({ path: DECK, readonly: true });
      const tally: Tally = {
        queries: 0, batches: 0, statements: 0,
        seedStatements: 0, armStatements: 0, loneArmStatements: 0,
        otherShapes: new Map(),
      };
      const got = await resolveRuleIdsByComposedKeys(counting(cold, tally), SAVE_SHAPE_CANDIDATES);
      expect(got.size).toBeGreaterThan(0);
      cold.close();
      perCall.push(tally);
    }

    const roundTrips = (t: Tally): number => t.queries + t.batches;
    const total = perCall.reduce((n, t) => n + roundTrips(t), 0);
    const sum = (pick: (t: Tally) => number): number =>
      perCall.reduce((n, t) => n + pick(t), 0);
    const others = new Map<string, number>();
    for (const t of perCall)
      for (const [k, v] of t.otherShapes) others.set(k, (others.get(k) ?? 0) + v);

    console.log(
      `cold save-shape walk, 5 calls of 5 candidates (${DECK}):\n` +
        `  round trips:        ${total} total, ${perCall.map(roundTrips).join(", ")} per call\n` +
        `  statements:         ${sum((t) => t.statements)} total\n` +
        `  seed reads:         ${sum((t) => t.seedStatements)} statements, one round trip each ` +
        `(independent of each other — one batch per call would save ` +
        `${sum((t) => t.seedStatements) - perCall.length} round trips)\n` +
        `  arm reads:          ${sum((t) => t.armStatements)} statements in ` +
        `${sum((t) => t.batches)} round trips (one batch per level; levels cannot merge, ` +
        `level n+1's pairs are computed from level n's answers)\n` +
        `  lone arm queries:   ${sum((t) => t.loneArmStatements)}\n` +
        `  other statements:\n` +
        [...others].map(([k, v]) => `      ${v}x ${k}`).join("\n"),
    );

    // Structural claims the census actually establishes on this deck, not a
    // snapshot of numbers copied from a report:
    //
    //  - every lone query is accounted for: the walk's only un-batched driver
    //    call is a level whose arm set holds exactly ONE pair, which
    //    walkComposedNames sends as a query rather than a one-statement batch
    //    (read-rules.ts, `statements.length === 1`). At most one per call.
    //  - the seed reads are the other lone queries, one round trip each,
    //    because each level reads its own run list with its own driver.query.
    //  - no other statement rides this walk at all: the whole-deck-universe
    //    ambiguity fallback does not fire on this deck, so the narrow path is
    //    genuinely narrow here.
    expect(sum((t) => t.loneArmStatements)).toBeLessThanOrEqual(perCall.length);
    expect(sum((t) => t.seedStatements) + sum((t) => t.loneArmStatements)).toBe(sum((t) => t.queries));
    expect(others.size).toBe(0);
    // Batching is doing its job: far fewer round trips than statements.
    expect(total).toBeLessThan(sum((t) => t.statements));
  }, 600000);
});
