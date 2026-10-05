// TRIP CENSUS INSTRUMENT (dbroundtrip-mainline lane, 2026-10-05): the exact
// per-statement census of a COLD render's database round trips, for the 5
// probe pages, in BOTH postures:
//
//   off        — the unchanged render path (the full trip body: boot folds +
//                render-path card walks, rule resolutions, per-view fetches)
//   on-inline  — the DEPLOYED posture (DECKO_ONE_TRIP=1,
//                DECKO_ONE_TRIP_STORE=inline): the seat's 2-trip fetch + the
//                render-path residue the payload does not cover
//
// MEASUREMENT ONLY — zero engine files modified. The instrument wraps the
// SQLDatabaseDriver seam the same way the one-trip fixture's
// TripCapturingDriver does, but appends one JSONL LINE PER STATEMENT
// (statement family via the module's own classifyResidueStatement + the
// census extensions below, first 200 chars of SQL, result row count, a
// cheap 2-frame caller-site stack sample, LOCAL wall ms).
//
// corpus: the SAME mirror the one-trip suite stages
// (benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3, the
// 19,482-live mirror) — read-only, never written. The on-inline posture
// needs the one_trip_* tables materialized IN the database (the serving
// shape): built ONCE by this file into
// benchmarks/trip-census/trip-census-materialized-copy.sqlite3 with the
// engine's own buildOneTripClosure + ONE_TRIP_SIDE_DDL + additive load
// (byte-for-byte the inline-chunked-fetch.test.ts recipe), gitignored,
// rebuilt on demand.
//
// RUN (explicit only — this file is NOT in tests/standing-net.json, so the
// standing net never sees it):
//   DECKO_TRIP_CENSUS_OUT=benchmarks/trip-census/census/trip-census.jsonl \
//     npx vitest run benchmarks/trip-census/trip-census-cold-render.test.ts
// Cold = fresh LocalSqliteDriver + FetchEngine + RenderEngine per page per
// posture; every page's engine boots from zero (no cross-page carryover).
// Zero live requests — local render only; the trip counts are RT-identical
// to the wire by the db-roundtrip law this boundary implements.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type {
  SQLDatabaseDriver,
  SQLQueryResult,
  SQLStatement,
} from "../../src/server/driver.js";
import { buildOneTripClosure } from "../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../src/card/one-trip/side-db-schema.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../src/card/one-trip/one-trip-fetch.js";
import { classifyResidueStatement } from "../../src/card/one-trip/render-plan.js";
import {
  MIRROR_COPY_PATH,
  PROBE_PAGES,
  bootEngine,
  mirrorAvailable,
} from "../../tests/card/one-trip/one-trip-fixture.js";

const hasMirror = mirrorAvailable();
const outPath = process.env.DECKO_TRIP_CENSUS_OUT ?? "";
const shouldRun = hasMirror && outPath !== "";

const MATERIALIZED_COPY_PATH = fileURLToPath(
  new URL("trip-census-materialized-copy.sqlite3", import.meta.url),
);

type Posture = "off" | "on-inline";

interface CensusLine {
  seq: number;
  posture: Posture;
  page: string;
  phase: "boot" | "render";
  tripKind: "query" | "batch";
  tripNo: number;
  stmtNo: number;
  /** statements carried by the trip (1 for a solo query, N for a batch) */
  tripStatements: number;
  family: string;
  rows: number;
  localMs: number;
  caller: string;
  sql: string;
  /** the statement's parameters, truncated — enough for the record-and-
   *  replay plan (recordRenderPlan keys on sql+params) to consume the
   *  census directly; never the full row payloads */
  params: string;
}

/** The census classifier: the render-plan module's own residue registry
 *  FIRST (its classes are the lane-established accounting), then the census
 *  extensions the registry does not know (the seat itself, the ATTACH
 *  setup, the `name = ?` point read the cold-latency receipt named as the
 *  registry's one real gap). Anything else stays honestly
 *  "unclassified" — never force-fitted. */
export function classifyCensusStatement(sql: string, caller = ""): string {
  // the seat FIRST: its head carries one_trip_* table names (and would
  // otherwise fall into the residue registry's /search/i fallback), and its
  // keyset slices read unqualified `cards` via json_each — only the CALLER
  // (one-trip-fetch.ts, called from the render gate) identifies them.
  if (/one_trip_/i.test(sql) || /one-trip-(fetch|render-gate)/.test(caller)) {
    return "one-trip-seat";
  }
  if (/^ATTACH DATABASE/i.test(sql.trim())) return "attach-setup";
  if (/^DETACH DATABASE/i.test(sql.trim())) return "attach-setup";
  const residue = classifyResidueStatement(sql);
  if (residue !== undefined) return residue;
  if (/SELECT id FROM cards WHERE name = \? AND trash = 0 LIMIT 1/i.test(sql)) {
    return "point-row-by-name";
  }
  return "unclassified";
}

/** 2-frame caller-site sample: the first frames outside this instrument and
 *  the driver layer. Under vitest the frames carry original file:line. */
function callerSample(): string {
  const stack = new Error().stack ?? "";
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("at ") &&
        !line.includes("trip-census-cold-render") &&
        !line.includes("local-sqlite") &&
        !line.includes("node:internal") &&
        !line.includes("CensusDriver"),
    )
    .slice(0, 2)
    .map((line) => line.replace(/^at /, ""));
  return frames.join(" <- ");
}

/** The counting wrapper: one JSONL line per STATEMENT (batch members get
 *  their own line; the batch's trip counts once with tripStatements = N). */
class CensusDriver implements SQLDatabaseDriver {
  tripNo = 0;
  stmtNo = 0;
  phase: "boot" | "render" = "boot";
  constructor(
    private readonly inner: SQLDatabaseDriver,
    private readonly posture: Posture,
    private readonly page: string,
  ) {}
  private record(
    tripKind: "query" | "batch",
    sql: string,
    params: unknown[],
    rows: number,
    localMs: number,
    tripStatements: number,
    caller: string,
  ): void {
    const line: CensusLine = {
      seq: this.stmtNo,
      posture: this.posture,
      page: this.page,
      phase: this.phase,
      tripKind,
      tripNo: this.tripNo,
      stmtNo: this.stmtNo,
      tripStatements,
      family: classifyCensusStatement(sql, caller),
      rows,
      localMs,
      caller,
      sql: sql.length > 200 ? `${sql.slice(0, 200)}...` : sql,
      params: JSON.stringify(params).slice(0, 160),
    };
    appendFileSync(outPath, `${JSON.stringify(line)}\n`);
  }
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.tripNo += 1;
    this.stmtNo += 1;
    const caller = callerSample();
    const t0 = performance.now();
    const result = await this.inner.query<T>(sql, params);
    this.record("query", sql, params, result.rows.length, performance.now() - t0, 1, caller);
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.tripNo += 1;
    const caller = callerSample();
    const t0 = performance.now();
    const results = await this.inner.batch(statements);
    const localMs = performance.now() - t0;
    results.forEach((result, i) => {
      this.stmtNo += 1;
      const stmt = statements[i] as { sql?: string; params?: unknown[] } | undefined;
      this.record(
        "batch",
        stmt?.sql ?? "",
        stmt?.params ?? [],
        result.rows.length,
        localMs,
        statements.length,
        caller,
      );
    });
    return results;
  }
}

describe.skipIf(!shouldRun)("trip census: cold render per-page per-statement JSONL", () => {
  let tmpDir = "";
  let sidePath = "";

  beforeAll(async () => {
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, ""); // one run = one census; never append across runs
    if (existsSync(MATERIALIZED_COPY_PATH)) return; // built once, reused
    tmpDir = mkdtempSync(join(tmpdir(), "trip-census-build-"));
    // 1. build the derived tables into a side file (the corpus tests' build)
    sidePath = join(tmpDir, "one-trip-side.sqlite3");
    const corpusMirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusMirror, side, pageNames: [...PROBE_PAGES] });
    side.close();
    corpusMirror.close();
    // 2. materialize the INLINE shape: writable copy + additive table load
    copyFileSync(MIRROR_COPY_PATH, MATERIALIZED_COPY_PATH);
    const inlineDb = new LocalSqliteDriver({ path: MATERIALIZED_COPY_PATH });
    for (const statement of ONE_TRIP_SIDE_DDL) {
      await inlineDb.query(statement, []);
    }
    await attachDerivedStore(inlineDb, sidePath, "side_load");
    try {
      for (const table of [
        "one_trip_meta",
        "one_trip_edges",
        "one_trip_page_closure",
        "one_trip_search_nests",
        "one_trip_search_results",
        "one_trip_page_rules",
      ]) {
        await inlineDb.query(`INSERT INTO ${table} SELECT * FROM side_load.${table}`, []);
      }
    } finally {
      await detachDerivedStore(inlineDb, "side_load");
    }
    inlineDb.close();
  }, 600_000);

  afterAll(() => {
    // temp side file only; the materialized copy PERSISTS for re-runs
    if (tmpDir !== "") {
      try {
        rmSync(tmpDir, { force: true, recursive: true });
      } catch {
        /* Windows file lock: OS temp cleans up */
      }
    }
  });

  async function censusColdRender(posture: Posture, page: string): Promise<void> {
    const dbPath = posture === "off" ? MIRROR_COPY_PATH : MATERIALIZED_COPY_PATH;
    const db = new LocalSqliteDriver({ path: dbPath, readonly: true });
    const census = new CensusDriver(db, posture, page);
    const prevOneTrip = process.env.DECKO_ONE_TRIP;
    const prevStore = process.env.DECKO_ONE_TRIP_STORE;
    try {
      // COLD BOOT: fresh engine per page per posture (the harness pattern)
      const { fetcher, render } = await bootEngine(census);
      census.phase = "render";
      if (posture === "on-inline") {
        process.env.DECKO_ONE_TRIP = "1";
        process.env.DECKO_ONE_TRIP_STORE = "inline";
      }
      const html = await render.render(page, "open", {});
      // NOTE: Taking_Stock's local body is 76 bytes ON THIS MIRROR — the
      // established local render (one-trip-harness-report.json:
      // baselineHtmlBytes 76, byteIdentical true, both arms). The census
      // counts its trips, not its bytes.
      expect(html.length, `${posture}/${page} rendered`).toBeGreaterThan(0);
    } finally {
      if (prevOneTrip === undefined) delete process.env.DECKO_ONE_TRIP;
      else process.env.DECKO_ONE_TRIP = prevOneTrip;
      if (prevStore === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
      else process.env.DECKO_ONE_TRIP_STORE = prevStore;
      db.close();
    }
  }

  for (const posture of ["off", "on-inline"] as const) {
    for (const page of PROBE_PAGES) {
      it(
        `census ${posture} ${page}`,
        () => censusColdRender(posture, page),
        300_000,
      );
    }
  }
});
