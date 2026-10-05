// RED-first pin, PART 2 of the inline materialized-store lane (2026-10-04):
// the inline fetch returns the bundle in CHUNKS that each respect the
// serving DB's per-value limit, assembled CLIENT-SIDE into the same document
// the single-row statement produces.
//
// THE WALL THIS PIN STANDS ON (observed verbatim, cold-latency-rig-lane.md
// MATERIALIZED-STORE §6.3 — the named remainder): even with the ATTACH
// dropped, a template-scale page cannot fetch whole on this DB class — the
// ~3,530-card single-JSON-row bundle (~5 MB) fails server-side with
// `SQLite error: string or blob too big` (probed live), while a 15-card
// page's 2.3 KB bundle fetches fine (222-429 ms). The answer: one-row-per-
// card chunked fetch (many small rows are proven fine — the materialized
// load pushed 528 multi-row statements), assembled client-side.
//
// THE CONTRACT: the assembled document must be BYTE-EQUAL to the single-row
// statement's document — the single-row shape is the thing the local harness
// proves (the committed local 5/5 byte-identity proof rides it), so the
// chunked path is pinned to reproduce it exactly, per card ROW ORDER and
// JSON text, on real corpus pages (the light Taking_Stock and the
// template-scale Aikido, which crosses several chunks).
//
// RED at base: fetchPageBundleInline / fetchPageBundleInlineRaw /
// ONE_TRIP_INLINE_CARDS_PER_CHUNK do not exist yet (import failure = red).
//
// The corpus test skips when the mirror copy is absent (fresh clones).

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { DeckoName } from "../../../src/card/name.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  ONE_TRIP_INLINE_CARDS_PER_CHUNK,
  attachDerivedStore,
  detachDerivedStore,
  fetchPageBundle,
  fetchPageBundleInline,
  fetchPageBundleInlineRaw,
  oneTripFetchSql,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  MIRROR_COPY_PATH,
  PROBE_PAGES,
  TripCapturingDriver,
  mirrorAvailable,
} from "./one-trip-fixture.js";

const hasMirror = mirrorAvailable();

// The two pin pages: the lightest probe (Taking_Stock) and the
// template-scale probe (Aikido, ~3,530 closure members locally — the page
// class whose single-row bundle trips the serving DB's value limit).
const PIN_PAGES = ["Taking_Stock", "Aikido"] as const;

describe.skipIf(!hasMirror)("inline chunked fetch: byte-equal to the single-row bundle", () => {
  let dir = "";
  let sidePath = "";
  let inlineDbPath = "";
  let corpusMirror: SQLDatabaseDriver;
  let inlineDb: SQLDatabaseDriver;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "one-trip-inline-"));
    corpusMirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });

    // 1. Build the derived tables once, into a side file (the same build the
    //    existing corpus tests run).
    sidePath = join(dir, "one-trip-side.sqlite3");
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusMirror, side, pageNames: [...PROBE_PAGES] });

    // 2. Materialize the INLINE shape: a writable copy of the corpus with the
    //    one_trip_* tables loaded INTO it — exactly the serving DB state the
    //    materialized-store lane produced (build, then additive load).
    inlineDbPath = join(dir, "deck-inline-materialized.sqlite3");
    copyFileSync(MIRROR_COPY_PATH, inlineDbPath);
    inlineDb = new LocalSqliteDriver({ path: inlineDbPath });
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
  }, 240_000);

  afterAll(() => {
    if (dir !== "") try { rmSync(dir, { force: true, recursive: true }); } catch { /* Windows file lock: the driver holds the handle; the OS temp dir cleans up */ };
  });

  /** The byte-equality REFERENCE: the single-row statement's document, read
   *  through the classic ATTACHED posture on the read-only mirror. */
  async function singleRowBundleRaw(pageName: string): Promise<string> {
    const capture = new TripCapturingDriver(corpusMirror);
    await attachDerivedStore(capture, sidePath);
    try {
      const key = DeckoName.parse(pageName).key;
      const result = await capture.query<{ bundle: string }>(oneTripFetchSql(), [key, key, key, key]);
      const raw = result.rows[0]?.bundle;
      expect(raw, `single-row reference bundle for ${pageName}`).toBeDefined();
      return raw!;
    } finally {
      await detachDerivedStore(capture);
    }
  }

  for (const pageName of PIN_PAGES) {
    it(`assembles ${pageName}'s inline bundle BYTE-EQUAL to the single-row document`, async () => {
      const inlineCapture = new TripCapturingDriver(inlineDb);
      const inlineRaw = await fetchPageBundleInlineRaw(inlineCapture, pageName);
      const singleRaw = await singleRowBundleRaw(pageName);
      expect(
        inlineRaw,
        "the client-side assembled document must be byte-for-byte the single-row " +
          "statement's document (the render-output byte-identity contract's input)",
      ).toBe(singleRaw);
    });

    it(`assembles ${pageName}'s parsed bundle equal to the single-row bundle the seat consumes`, async () => {
      const inlineBundle = await fetchPageBundleInline(inlineDb, pageName);
      const attachedCapture = new TripCapturingDriver(corpusMirror);
      await attachDerivedStore(attachedCapture, sidePath);
      try {
        const singleBundle = await fetchPageBundle(attachedCapture, pageName);
        expect(inlineBundle).toEqual(singleBundle);
      } finally {
        await detachDerivedStore(attachedCapture);
      }
    });

    it(`fetches ${pageName} in bounded chunks — no ATTACH, unqualified one_trip_* tables, chunk arithmetic exact`, async () => {
      const inlineCapture = new TripCapturingDriver(inlineDb);
      const bundle = await fetchPageBundleInline(inlineCapture, pageName);

      const issued = inlineCapture.statements;
      // the head statement + one chunk per CARDS_PER_CHUNK slice of the closure
      const expectedStatements = 1 + Math.ceil(bundle.cardIds.length / ONE_TRIP_INLINE_CARDS_PER_CHUNK);
      expect(
        issued.length,
        "the inline fetch must issue exactly 1 head statement + one card chunk per " +
          `${ONE_TRIP_INLINE_CARDS_PER_CHUNK}-card slice (${bundle.cardIds.length} closure members)`,
      ).toBe(expectedStatements);

      // every statement respects the walls: no ATTACH (wall 1), unqualified
      // one_trip_* tables (the seam note's prefix drop), and the chunked
      // shape (LIMIT/OFFSET card pages, never one giant aggregate)
      for (const stmt of issued) {
        expect(stmt.sql, "no ATTACH anywhere in the inline fetch").not.toMatch(/\bATTACH\b/i);
        expect(stmt.sql, "no ATTACH qualifier on the one_trip_* tables").not.toMatch(
          /\bone_trip\s*\./,
        );
        expect(stmt.sql, "inline statements read the materialized one_trip_* tables").toMatch(
          /\bone_trip_(edges|page_closure)\b/,
        );
      }
      expect(issued[0]!.sql, "the head statement keeps the recursive closure walk").toMatch(
        /WITH RECURSIVE/,
      );
      // the card chunks never aggregate the whole closure into one value:
      // each chunk carries at most CARDS_PER_CHUNK card rows
      for (const stmt of issued.slice(1)) {
        expect(stmt.rowCount, "a card chunk never exceeds the chunk bound").toBeLessThanOrEqual(
          ONE_TRIP_INLINE_CARDS_PER_CHUNK,
        );
      }
    });
  }
});
