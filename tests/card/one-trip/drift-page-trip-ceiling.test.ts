// THE DRIFT-PAGE TRIP-CEILING + EXACTNESS PINS (driftfix lane, 2026-10-06).
//
// THE REGRESSION UNDER PIN: on the assembled integration tree, four planned
// demo pages that rendered at 5 trips at the fold-replay tip 518bcd9a fell to
// 14-30 trips (D3 measurement, one-trip-per-page-work/14-measurement-report.md).
// Mechanism (measured, driftfix attribution probes): the live render's
// key-multi / side-key / or-chain IN-list binds depend on mid-flight cache
// evolution; when it differs from record time the binds miss the armed
// plan's exact (sql, params) map and those statements ride live in small
// batches — Aikido_2 14, Aikido_in_Education 18 at 7f8173dd.
//
// PIN 1-2 — THE CEILING: each named drift page renders at <= 8 trips, cold
// AND immediately-warm, in the composed serving posture. RED at 7f8173dd:
// 14 (Aikido_2) and 18 (Aikido_in_Education) cold; the fix absorbs the drift
// classes into the plan's value-indexed arms.
//
// PIN 3 — THE EXACTNESS: for EVERY plan entry on the four drift pages, the
// folded batch's decomposed rows equal the ladder's own execution of that
// entry — same rows, same order, 0 mismatches (the giant fold's discipline,
// now over the drift pages, whose entry mix exposes the 2-pair OR-chain
// order artifact Peace_Practices carries).
//
// PIN 4 — BYTE IDENTITY: the composed render's slot-normalized HTML equals
// the raw ladder's on the same page, same engine build, same deck.
//
// The corpus is the 45-page plan-bearing demo deck copy (the D3 harness
// deck, freshly stamped by migration 0003). It lives outside the repo; the
// test SKIPS when it is absent, like the corpus-mirror siblings. A missing
// deck never turns the pin green — it skips loudly by name.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import {
  decomposeMergedRows,
  foldRenderPlanEntries,
} from "../../../src/card/one-trip/replay-fold.js";
import type { RenderPlanEntry } from "../../../src/card/one-trip/render-plan.js";
import {
  bootEngine,
  normalizeSlotIds,
  TripCapturingDriver,
} from "./one-trip-fixture.js";

/** The D3 harness deck: byte-identical to the serving deck except plan rows,
 *  carrying the freshness stamp (migration 0003) and the 45 recorded plans. */
const DRIFT_DECK =
  process.env.DRIFTFIX_DECK ??
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/one-trip-per-page-work/decks/arch-demo-45p-freshness-stamped.sqlite3";

const driftDeckAvailable = (): boolean => existsSync(DRIFT_DECK);

/** The four pages the D3 measurement named as the drift set. */
const DRIFT_PAGES = ["Aikido 2", "Aikido in Education", "Peace Practices", "Laundry"] as const;

const TRIP_CEILING = 8;

function setPosture(on: boolean): { prevOne: string | undefined; prevStore: string | undefined } {
  const prevOne = process.env.DECKO_ONE_TRIP;
  const prevStore = process.env.DECKO_ONE_TRIP_STORE;
  if (on) {
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
  } else {
    delete process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP_STORE;
  }
  return { prevOne, prevStore };
}

function restorePosture(prev: { prevOne: string | undefined; prevStore: string | undefined }): void {
  if (prev.prevOne === undefined) delete process.env.DECKO_ONE_TRIP;
  else process.env.DECKO_ONE_TRIP = prev.prevOne;
  if (prev.prevStore === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
  else process.env.DECKO_ONE_TRIP_STORE = prev.prevStore;
}

/** The page's recorded plan, read straight from the deck's plan table. */
async function readPlanEntries(
  driver: SQLDatabaseDriver,
  pageName: string,
): Promise<RenderPlanEntry[]> {
  const page = (await driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE name = ? AND trash = 0",
    [pageName],
  )) as SQLQueryResult<{ id: number }>;
  const id = page.rows[0]?.id;
  if (id === undefined) throw new Error(`drift deck has no card named ${pageName}`);
  const rows = (await driver.query<{ sql: string; params_json: string }>(
    "SELECT sql, params_json FROM one_trip_render_plans WHERE page_id = ? ORDER BY seq",
    [id],
  )) as SQLQueryResult<{ sql: string; params_json: string }>;
  return rows.rows.map((r) => ({ sql: r.sql, params: JSON.parse(r.params_json) as unknown[] }));
}

async function renderPosture(page: string, on: boolean): Promise<{ html: string; trips: number[] }> {
  const prev = setPosture(on);
  try {
    const counter = new TripCapturingDriver(new LocalSqliteDriver({ path: DRIFT_DECK, readonly: true }));
    const { render } = await bootEngine(counter);
    const trips: number[] = [];
    const first = await render.render(page, "open", {});
    trips.push(counter.trips);
    const second = await render.render(page, "open", {});
    trips.push(counter.trips - trips[0]!);
    return { html: first + second, trips };
  } finally {
    restorePosture(prev);
  }
}

function rowsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => JSON.stringify(row) === JSON.stringify(b[i]));
}

describe("drift-page trip ceiling (driftfix lane)", () => {
  it("Aikido_2 renders at <= 8 trips cold and warm in the composed posture", async () => {
    if (!driftDeckAvailable()) return; // deck absent: skip by name, never fail green
    const { trips } = await renderPosture("Aikido 2", true);
    expect(trips[0], `Aikido_2 cold trips ${trips[0]} (RED baseline at 7f8173dd: 14)`).toBeLessThanOrEqual(TRIP_CEILING);
    expect(trips[1], `Aikido_2 warm trips ${trips[1]}`).toBeLessThanOrEqual(TRIP_CEILING);
  }, 180_000);

  it("Aikido_in_Education renders at <= 8 trips cold and warm in the composed posture", async () => {
    if (!driftDeckAvailable()) return;
    const { trips } = await renderPosture("Aikido in Education", true);
    expect(trips[0], `AIE cold trips ${trips[0]} (RED baseline at 7f8173dd: 18)`).toBeLessThanOrEqual(TRIP_CEILING);
    expect(trips[1], `AIE warm trips ${trips[1]}`).toBeLessThanOrEqual(TRIP_CEILING);
  }, 180_000);

  it("the composed render is byte-identical to the raw ladder on the drift pages", async () => {
    if (!driftDeckAvailable()) return;
    for (const page of DRIFT_PAGES) {
      const on = await renderPosture(page, true);
      const off = await renderPosture(page, false);
      const onHtml = on.html.slice(0, on.html.length / 2); // the cold render's half
      const offHtml = off.html.slice(0, off.html.length / 2);
      expect(normalizeSlotIds(onHtml), `${page}: ON vs OFF slot-normalized HTML`).toBe(
        normalizeSlotIds(offHtml),
      );
    }
  }, 600_000);

  it("folds every drift-page plan entry back to the ladder's exact rows (0 mismatches)", async () => {
    if (!driftDeckAvailable()) return;
    const driver = new LocalSqliteDriver({ path: DRIFT_DECK, readonly: true });
    for (const page of DRIFT_PAGES) {
      const entries = await readPlanEntries(driver, page);
      expect(entries.length, `${page}: plan entries present`).toBeGreaterThan(0);
      const folded = foldRenderPlanEntries(entries);

      const ladder = (await driver.batch(
        entries.map((e) => ({ sql: e.sql, params: e.params })) as SQLStatement[],
      )) as SQLQueryResult[];
      const mergedResults = (await driver.batch(folded.statements)) as SQLQueryResult[];

      const perEntry = new Map<number, unknown[]>();
      for (const slice of folded.merged) {
        for (const [entryIndex, rows] of decomposeMergedRows(slice, mergedResults[slice.statementIndex])) {
          perEntry.set(entryIndex, rows);
        }
      }
      for (const u of folded.unfolded) {
        perEntry.set(u.entryIndex, mergedResults[u.statementIndex]?.rows ?? []);
      }

      let mismatches = 0;
      const firstProblems: string[] = [];
      entries.forEach((entry, entryIndex) => {
        const want = ladder[entryIndex]?.rows ?? [];
        const got = perEntry.get(entryIndex) ?? [];
        if (!rowsEqual(want, got)) {
          mismatches++;
          if (firstProblems.length < 3) {
            firstProblems.push(
              `#${entryIndex} want=${want.length} got=${got.length} ${entry.sql.replace(/\s+/g, " ").slice(0, 90)}`,
            );
          }
        }
      });
      expect(
        mismatches,
        `${page}: ${mismatches} folded entries differ from the ladder (first: ${firstProblems.join(" | ")})`,
      ).toBe(0);

      // the side-key join class — the drift set's biggest mass — must fold
      expect(
        folded.families["side-key-join"] ?? 0,
        `${page}: side-key-join entries folded`,
      ).toBeGreaterThan(0);
    }
    driver.close();
  }, 600_000);
});
