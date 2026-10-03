// THE ACCEPTANCE PIN (one-trip implementation lane):
// a test render that consumes the one-trip payload produces byte-identical
// HTML to the current engine's output for the 5 probe pages, with the data
// fetch costing EXACTLY ONE round trip and every further trip belonging to
// a NAMED residue class (the mission's "TRIPS=1 (or the named residue
// constant)").
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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  PROBE_PAGES,
  TripCapturingDriver,
  bootEngine,
  captureBaselineRender,
  mirrorAvailable,
} from "./one-trip-fixture.js";

const hasMirror = mirrorAvailable();
const HARNESS_REPORT_PATH = fileURLToPath(
  new URL("../../../benchmarks/one-trip-render/one-trip-harness-report.json", import.meta.url),
);

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

describe.skipIf(!hasMirror)("one-trip byte-identity acceptance (trial-deck mirror)", () => {
  let sidePath = "";
  let corpusDriver: SQLDatabaseDriver;
  const measurements: PageMeasurement[] = [];

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "one-trip-accept-"));
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusDriver, side, pageNames: [...PROBE_PAGES] });
    await side.query("SELECT 1", []).catch(() => undefined);
  }, 180_000);

  afterAll(() => {
    if (sidePath !== "") rmSync(sidePath, { force: true });
    if (measurements.length > 0) {
      if (!existsSync(join(HARNESS_REPORT_PATH, ".."))) mkdirSync(join(HARNESS_REPORT_PATH, ".."), { recursive: true });
      writeFileSync(HARNESS_REPORT_PATH, JSON.stringify({ pages: measurements }, null, 2));
    }
  });

  for (const name of PROBE_PAGES) {
    it(`renders ${name} byte-identically from the one-trip payload`, async () => {
      // --- baseline: the current engine, untouched ---
      const baseline = await captureBaselineRender(MIRROR_COPY_PATH, name);

      // --- one-trip arm: fresh engine, payload fetched in ONE trip, seated, rendered ---
      const capture = new TripCapturingDriver(new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true }));
      const { fetcher, render } = await bootEngine(capture);
      await attachDerivedStore(capture, sidePath);
      const tripsBeforeFetch = capture.trips;
      const stmtsBeforeFetch = capture.statements.length;
      const bundle = await fetchPageBundle(capture, name);
      const dataFetchTrips = capture.trips - tripsBeforeFetch;
      await seatPageBundle(fetcher, render, bundle);
      const tripsBeforeRender = capture.trips;
      const html = await render.render(name, "open", {});
      const residueTrips = capture.trips - tripsBeforeRender;
      await detachDerivedStore(capture);

      // THE PIN: byte-identical HTML
      expect(html).toBe(baseline.html);
      // THE PIN: the data fetch is exactly ONE round trip
      expect(dataFetchTrips).toBe(1);

      // every post-payload trip belongs to a named residue class
      const { classifyResidueStatement } = await import("../../../src/card/one-trip/render-plan.js");
      const residueClasses: Record<string, number> = {};
      const postPayload = capture.statements.slice(stmtsBeforeFetch + 1);
      const unclassified: string[] = [];
      for (const stmt of postPayload) {
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
        byteIdentical: html === baseline.html,
        residueClasses,
      });
    });
  }
});
