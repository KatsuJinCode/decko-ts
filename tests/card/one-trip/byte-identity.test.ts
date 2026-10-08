// THE ACCEPTANCE PIN (one-trip implementation lane):
// a test render that consumes the one-trip payload produces byte-identical
// HTML to the current engine's output for the 5 probe pages — modulo the
// engine's own per-render SecureRandom slot ids, which two BASELINE renders
// of the same page also never agree on (normalizeSlotIds) — with the data
// fetch costing EXACTLY ONE round trip, the payload seating costing ZERO
// driver queries, and every further trip belonging to a NAMED residue class
// (the mission's "TRIPS=1 (or the named residue constant)").
//
// This is also the harmlessness proof the row-set pin leans on: any rows
// the bundle carries beyond the render's read set are proven harmless by
// the byte-identical output itself.
//
// The per-page measurement (baseline trips, one-trip trips, residue class
// breakdown) is written to benchmarks/one-trip-render/one-trip-harness-
// report.json — the lane receipt's terminal block cites it.
//
// The corpus tests skip when the mirror copy is absent (fresh clones).

import { writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import {
  attachDerivedStore,
  detachDerivedStore,
  fetchPageBundle,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import { seatPageBundle } from "../../../src/card/one-trip/page-bundle-adapter.js";
import {
  MIRROR_COPY_PATH,
  stampedMirrorCopyPath,
  PROBE_PAGES,
  TripCapturingDriver,
  bootEngine,
  captureBaselineRender,
  mirrorAvailable,
  normalizeSlotIds,
} from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";
import { testReportPath } from "../../support/report-output.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const hasMirror = mirrorAvailable();
const HARNESS_REPORT_PATH = testReportPath("benchmarks/one-trip-render/one-trip-harness-report.json");

interface PageMeasurement {
  name: string;
  baselineTrips: number;
  baselineHtmlBytes: number;
  oneTripTrips: number;
  dataFetchTrips: number;
  residueTrips: number;
  htmlBytes: number;
  byteIdentical: boolean;
  residueClasses: Record<string, number>;
}

describeOrSkipLoud(!hasMirror, "tests/card/one-trip/byte-identity.test.ts", "hasMirror")("one-trip byte-identity acceptance (trial-deck mirror)", () => {
  let sidePath = "";
  let corpusDriver: SQLDatabaseDriver;
  const measurements: PageMeasurement[] = [];

  beforeAll(async () => {
    const dir = scratchDir("one-trip-accept-");
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusDriver, side, pageNames: [...PROBE_PAGES] });
    await side.query("SELECT 1", []).catch(() => undefined);
  }, 180_000);

  afterAll(() => {
    if (sidePath !== "") try { rmSync(sidePath, { force: true }); } catch { /* Windows file lock: the driver holds the handle; the OS temp dir cleans up */ };
    if (measurements.length > 0) {
      writeFileSync(HARNESS_REPORT_PATH, JSON.stringify({ pages: measurements }, null, 2));
    }
  });

  for (const name of PROBE_PAGES) {
    it(`renders ${name} byte-identically from the one-trip payload`, async () => {
      // --- baseline: the current engine, untouched ---
      // The composed engine's freshness gate requires the stamp (loud
      // failure on unmigrated decks by design), so engines render from the
      // fixture's stamp-migrated mirror copy; the shared mirror is never
      // opened writable. The stamp adds no render bytes.
      const baseline = await captureBaselineRender(await stampedMirrorCopyPath(), name);

      // --- one-trip arm: fresh engine, payload fetched in ONE trip, seated, rendered ---
      const capture = new TripCapturingDriver(
        new LocalSqliteDriver({ path: await stampedMirrorCopyPath(), readonly: true }),
      );
      const { fetcher, render } = await bootEngine(capture);
      await attachDerivedStore(capture, sidePath);
      const tripsBeforeFetch = capture.trips;
      const stmtsBeforeFetch = capture.statements.length;
      const bundle = await fetchPageBundle(capture, name);
      const dataFetchTrips = capture.trips - tripsBeforeFetch;
      await seatPageBundle(fetcher, render, bundle);
      const seatingTrips = capture.trips - tripsBeforeFetch - dataFetchTrips;
      const tripsBeforeRender = capture.trips;
      const html = await render.render(name, "open", {});
      const residueTrips = capture.trips - tripsBeforeRender;
      await detachDerivedStore(capture);

      // THE PIN: byte-identical HTML modulo the engine's own per-render
      // SecureRandom slot ids (normalizeSlotIds — the same normalization two
      // BASELINE renders of one page need to agree)
      expect(normalizeSlotIds(html)).toBe(normalizeSlotIds(baseline.html));
      // THE PIN: the data fetch is exactly ONE round trip
      expect(dataFetchTrips).toBe(1);
      // THE PIN: the payload never costs driver queries to seat
      expect(seatingTrips).toBe(0);

      // every post-payload trip belongs to a named residue class
      const { classifyResidueStatement } = await import("../../../src/card/one-trip/render-plan.js");
      const residueClasses: Record<string, number> = {};
      const postPayload = capture.statements.slice(stmtsBeforeFetch + 1);
      const unclassified: string[] = [];
      for (const stmt of postPayload) {
        // ATTACH/DETACH are the harness's own connection setup, not page work
        if (/^(ATTACH|DETACH) DATABASE/i.test(stmt.sql)) continue;
        const cls = classifyResidueStatement(stmt.sql);
        if (cls === undefined) unclassified.push(stmt.sql.slice(0, 120));
        residueClasses[cls ?? "UNCLASSIFIED"] = (residueClasses[cls ?? "UNCLASSIFIED"] ?? 0) + 1;
      }
      expect(
        unclassified,
        `every residue statement must belong to a named class (unclassified: ${unclassified.slice(0, 4).join(" | ")})`,
      ).toEqual([]);

      measurements.push({
        name,
        baselineTrips: baseline.trips,
        baselineHtmlBytes: baseline.html.length,
        oneTripTrips: capture.trips,
        dataFetchTrips,
        residueTrips,
        htmlBytes: html.length,
        byteIdentical: normalizeSlotIds(html) === normalizeSlotIds(baseline.html),
        residueClasses,
      });
    });
  }
});
