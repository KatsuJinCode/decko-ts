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
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

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
    dir = scratchDir("one-trip-inline-");
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
    // The freshness stamp (the seat head reads deck_data_version as a column
    // since the stamp-as-column lane — the same row the render entry's gate
    // reads; an unmigrated database fails loudly by the freshness lane's own
    // convention). Applied to the working copy the way a provisioned
    // database is; migration 0003 is additive and order-safe, and adds no
    // render bytes, so the byte-equality pins below compare like with like.
    await applyDeckDataVersionStampMigration(inlineDb);
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
      // the head statement + one keyset slice per CARDS_PER_CHUNK window of the
      // MATERIALIZED member id list
      const expectedStatements = 1 + Math.ceil(bundle.cardIds.length / ONE_TRIP_INLINE_CARDS_PER_CHUNK);
      expect(
        issued.length,
        "the inline fetch must issue exactly 1 head statement + one keyset slice per " +
          `${ONE_TRIP_INLINE_CARDS_PER_CHUNK}-card window (${bundle.cardIds.length} closure members)`,
      ).toBe(expectedStatements);

      // every statement respects the walls: no ATTACH (wall 1) and no ATTACH
      // qualifier on the one_trip_* tables (the seam note's prefix drop)
      for (const stmt of issued) {
        expect(stmt.sql, "no ATTACH anywhere in the inline fetch").not.toMatch(/\bATTACH\b/i);
        expect(stmt.sql, "no ATTACH qualifier on the one_trip_* tables").not.toMatch(
          /\bone_trip\s*\./,
        );
      }
      // ONLY the head statement reads the materialized one_trip_* graph tables
      // (discovery lives there); the slices are flat cards reads
      expect(issued[0]!.sql, "the head statement reads the materialized one_trip_* tables").toMatch(
        /\bone_trip_(edges|page_closure)\b/,
      );
      for (const stmt of issued.slice(1)) {
        expect(stmt.sql, "keyset slices never touch the graph tables").not.toMatch(
          /\bone_trip_(edges|page_closure)\b/,
        );
      }
      // the card slices never aggregate the whole closure into one value:
      // each slice carries at most CARDS_PER_CHUNK card rows
      for (const stmt of issued.slice(1)) {
        expect(stmt.rowCount, "a card slice never exceeds the chunk bound").toBeLessThanOrEqual(
          ONE_TRIP_INLINE_CARDS_PER_CHUNK,
        );
      }
    });

    // THE V2 PIN (inline-fetch-v2 lane, 2026-10-05): discovery ONCE per seat.
    //
    // The mechanism this pin kills (cold-latency-rig-lane.md WIRE-DIAGNOSIS §4,
    // probed verbatim on the live serving DB): the v1 chunked fetch re-ran the
    // ENTIRE discovery phase (recursive walk CTE + members CTE + DISTINCT join
    // + ORDER BY id) inside EVERY chunk statement before its LIMIT/OFFSET
    // slice — 37 full closure computations per Aikido seat, 228-1,112 ms each
    // (~18 s of seat cost). The v2 shape: the head statement materializes the
    // member id list ONCE (one small sorted JSON value), and every card slice
    // is a FLAT keyset read over one window of that list (json_each expansion,
    // no walk CTE anywhere after statement 1).
    //
    // RED at c5f7fc79: every v1 statement (head AND chunks) carries WITH
    // RECURSIVE and the head materializes nothing — walkStatements is 1+N, not
    // 1, and no slice binds a json_each window.
    it(`runs discovery EXACTLY ONCE — one walk-CTE statement, then flat keyset slices`, async () => {
      const inlineCapture = new TripCapturingDriver(inlineDb);
      await fetchPageBundleInline(inlineCapture, pageName);
      const issued = inlineCapture.statements;

      // PIN 1 — exactly ONE discovery statement per seat, and it is the head.
      const walkStatements = issued.filter((s) => /\bWITH RECURSIVE\b/.test(s.sql));
      expect(
        walkStatements.length,
        "the recursive discovery phase must run in EXACTLY ONE statement per seat " +
          "(the head); at base every chunk re-runs it (WIRE-DIAGNOSIS §4: 37 " +
          "closure walks per Aikido seat, ~18 s)",
      ).toBe(1);
      expect(issued[0]!.sql, "the single discovery statement is the head").toMatch(
        /\bWITH RECURSIVE\b/,
      );

      // PIN 2 — the head MATERIALIZES the member id list (one small sorted
      // JSON value) and binds the page key exactly four times (walk seed,
      // members page join, page_key field, rule-candidate page join); the
      // slices bind NO page key at all (they carry no discovery).
      expect(issued[0]!.sql, "the head materializes the member ids").toMatch(/member_ids_json/);
      for (const stmt of issued.slice(1)) {
        expect(stmt.sql, "a keyset slice never re-runs the walk").not.toMatch(/\bWITH RECURSIVE\b/);
        expect(stmt.sql, "a keyset slice reads its member window via json_each").toMatch(
          /\bjson_each\s*\(/,
        );
        const windowIds = JSON.parse(stmt.params[0] as string) as number[];
        expect(
          windowIds.length,
          "a keyset slice's member window never exceeds the chunk bound",
        ).toBeLessThanOrEqual(ONE_TRIP_INLINE_CARDS_PER_CHUNK);
        for (const id of windowIds) expect(id, "window members are card ids").toBeTypeOf("number");
      }

      // PIN 3 — the windows tile the materialized member list exactly: the
      // slice count is ceil(memberCount / CHUNK) against the discovery CTE's
      // own count, read here directly (the fetch's member list must equal it).
      const key = DeckoName.parse(pageName).key;
      const membersCount = await inlineDb.query<{ n: number }>(
        `WITH RECURSIVE walk(id) AS (
  SELECT id FROM cards WHERE "key" = ? AND trash = 0
  UNION
  SELECT e.referee_id FROM walk JOIN one_trip_edges e ON e.referer_id = walk.id WHERE e.referee_id IS NOT NULL
),
members(id) AS (
  SELECT id FROM walk
  UNION
  SELECT pc.card_id FROM one_trip_page_closure pc WHERE pc.page_id = (SELECT id FROM cards WHERE "key" = ? AND trash = 0)
)
SELECT COUNT(*) AS n FROM members`,
        [key, key],
      );
      expect(issued.length).toBe(
        1 + Math.ceil(membersCount.rows[0]!.n / ONE_TRIP_INLINE_CARDS_PER_CHUNK),
      );
    });

    // THE V3 PIN (inline-fetch-v3 lane, 2026-10-05): the seat's TRANSPORT
    // profile — minimum wire round trips.
    //
    // The mechanism this pin kills (cold-latency-rig-lane.md INLINE-FETCH-V2
    // §5, the seventh wire's statement trace): v2 removed the duplicated
    // discovery COMPUTE but still sent 1 head + 36 keyset slices as 37
    // SEQUENTIAL wire round trips at ~333 ms each on the ~300 ms-RTT database
    // class ≈ 13.8 s — wire RTT, not compute (even `SELECT COUNT(*) FROM
    // json_each('[1,2,3]')` cost 247-281 ms live; locally the same slices are
    // flat-fast). On that class no sequential-statement posture can reach the
    // 1,300 ms cold bar; the head + all slices must ride the driver's own
    // hrana pipeline capability — batch() is ONE pipeline POST carrying every
    // statement (BunnyDbDriver.batch → attemptPipeline, the wire shape proven
    // in materialized-store-work/hrana-client.mjs).
    //
    // THE PROFILE: exactly TWO round trips per seat — 1 head query (its
    // result builds the slice windows client-side; a single batch cannot
    // carry binds derived from its own first result) + ONE batch carrying ALL
    // N keyset slices. RED at f1d7baff: the slices ride N solo query() calls
    // — Aikido measures 37 trips (1 + 36), the mechanism number verbatim.
    it(`travels in the MINIMUM wire round trips — 1 head query + ONE pipeline batch for all slices`, async () => {
      const inlineCapture = new TripCapturingDriver(inlineDb);
      await fetchPageBundleInline(inlineCapture, pageName);
      const issued = inlineCapture.statements;
      const sliceCount = issued.length - 1;

      // PIN 1 — the whole seat is TWO wire trips regardless of slice count:
      // the head query + one batch. At base the slices ride solo query()
      // calls: 1 + N trips (Aikido: 37 = 1 + 36 sequential executes at
      // ~333 ms each ≈ 13.8 s of pure wire RTT — INLINE-FETCH-V2 §5).
      expect(
        inlineCapture.trips,
        `the seat must ride exactly 2 wire round trips (1 head query + 1 batch ` +
          `carrying all ${sliceCount} slices); at base the slices are sequential ` +
          `query() calls (Aikido: 37 trips ≈ 13 s at ~333 ms/trip on the ` +
          `~300 ms-RTT serving class)`,
      ).toBe(2);

      // PIN 2 — every slice statement rode the batch, in order, after the
      // head: the capturing driver records batch statements in request
      // order, so statements 1..N are exactly the slices, unchanged SQL and
      // binds — the batch is a transport change only, never a shape change.
      for (const stmt of issued.slice(1)) {
        expect(stmt.sql, "a slice keeps the flat keyset shape through the batch").toMatch(
          /\bjson_each\s*\(/,
        );
      }
    });
  }
});
