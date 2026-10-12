// RED-first pin (the inline materialized store):
// DECKO_ONE_TRIP_STORE === "inline" (the materialized shape — the one_trip_*
// tables live IN the serving database) must SKIP
// the ATTACH statement entirely and query the one_trip_* tables on the SAME
// connection.
//
// THE WALL THIS PIN STANDS ON: the serving DB's SQL parser rejects ATTACH for
// ANY value — `SQL string could not be parsed: unsupported statement: ATTACH
// DATABASE '...' AS one_trip`, code SQL_PARSE_ERROR — and the serving seat
// hardwires ATTACH-then-swallow, so no config value can make the serving
// seat fetch. The inline posture is the seam note's own answer
// (one-trip-fetch.ts:27-32): "drops the prefix and the ATTACH call; nothing
// else changes".
//
// The fake driver below reproduces the serving posture: ATTACH raises the
// parser-level rejection, every other statement passes through to the real
// deck. RED at base: the seat attempts the ATTACH (recorded before the
// throw) and swallows the failure, so NO one_trip_* statement is ever issued.
// GREEN when the inline posture fetches one_trip_* on the same connection
// without ever issuing an ATTACH.
//
// These tests skip when the shared deck database copy is absent (fresh
// clones).

import { describe, expect, it } from "vitest";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { seatOneTripPayloadForRender } from "../../../src/card/one-trip/render-gate.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";
import {
  MIRROR_COPY_PATH,
  mirrorAvailable,
  bootEngine,
} from "./one-trip-fixture.js";

const hasMirror = mirrorAvailable();

/** The one_trip_* table names, matched UNQUALIFIED in statement text. */
const ONE_TRIP_TABLE_REFERENCE =
  /\bone_trip_(edges|page_closure|page_rules|search_results|search_nests|meta)\b/;

/** Serving-DB posture: ATTACH is rejected at the parser (SQL_PARSE_ERROR,
 *  probed against the synthetic restore deck with the seat's own statement
 *  shape, both config values); everything else
 *  passes through to the deck. Every statement is recorded BEFORE the
 *  decision so the pin can see an attempted ATTACH. */
class AttachRejectingDriver implements SQLDatabaseDriver {
  readonly statements: { sql: string; params: unknown[] }[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.statements.push({ sql, params });
    if (/^\s*ATTACH\b/i.test(sql)) {
      throw new Error(
        "SQL string could not be parsed: unsupported statement: ATTACH DATABASE '...' AS one_trip " +
          "(SQL_PARSE_ERROR — the serving DB posture this lane must work under)",
      );
    }
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    return this.inner.batch(statements);
  }
}

describeOrSkipLoud(!hasMirror, "tests/card/one-trip/inline-store-seat.test.ts", "hasMirror")("inline materialized store: the seat skips ATTACH", () => {
  it(
    "with DECKO_ONE_TRIP_STORE=inline the seat issues NO ATTACH and fetches " +
      "one_trip_* on the same connection",
    async () => {
      const probe = new AttachRejectingDriver(
        new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true }),
      );
      const { fetcher } = await bootEngine(probe);

      const prevGate = process.env.DECKO_ONE_TRIP;
      const prevStore = process.env.DECKO_ONE_TRIP_STORE;
      process.env.DECKO_ONE_TRIP = "1";
      process.env.DECKO_ONE_TRIP_STORE = "inline";
      try {
        await seatOneTripPayloadForRender("Home", fetcher);
      } finally {
        if (prevGate === undefined) delete process.env.DECKO_ONE_TRIP;
        else process.env.DECKO_ONE_TRIP = prevGate;
        if (prevStore === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
        else process.env.DECKO_ONE_TRIP_STORE = prevStore;
      }

      const issued = probe.statements.map((s) => s.sql);
      const attemptedAttaches = issued.filter((sql) => /^\s*ATTACH\b/i.test(sql));

      // PIN 1: the inline posture must not issue ATTACH at all — the serving
      // DB rejects it at the parser for ANY value, and the swallow is exactly
      // the deployed failure the inline posture removes.
      expect(
        attemptedAttaches,
        "the inline posture must issue NO ATTACH statement (observed serving-DB " +
          "rejection: SQL_PARSE_ERROR for any value — MATERIALIZED-STORE §6.1)",
      ).toEqual([]);

      // PIN 2: the seat must have actually fetched — one_trip_* tables read
      // on the SAME connection (the materialized shape has no side file).
      expect(
        issued.some((sql) => ONE_TRIP_TABLE_REFERENCE.test(sql)),
        "the inline seat must query the one_trip_* tables on the same connection " +
          "(at base the swallowed ATTACH leaves the payload inert: zero one_trip_* statements)",
      ).toBe(true);

      // PIN 3: unqualified references only — the seam note drops the
      // `one_trip.` ATTACH qualifier, not merely the attach call.
      expect(
        issued.filter((sql) => /\bone_trip\s*\.\s*(one_trip_)?/.test(sql)),
        "inline statements must reference one_trip_* UNQUALIFIED (no ATTACH qualifier)",
      ).toEqual([]);
    },
    120_000,
  );
});
