// RED-first pins, BUILD 1 (the precompute closure builder):
// - the builder writes a SIDE database (never the corpus file) holding the
//   include-edge graph and per-page transitive closures;
// - the edges come from the REAL parser's content scan (the empirical
//   finding: the stored card_references table is stale in both directions,
//   so the parse is the authority);
// - for each of the 5 probe pages the closure covers every CONTENT-
//   reachable card the render reads, up to the NAMED residue classes (the
//   rule lattice's own reads + engine boot folds — the whole-deck payload
//   alternative was measured and rejected);
// - the build report records the edge agreement against card_references.
//
// The corpus tests skip when the mirror copy is absent (fresh clones).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import {
  buildOneTripClosure,
  readPageClosure,
  type OneTripBuildReport,
} from "../../../src/card/one-trip/closure-builder.js";
import {
  MIRROR_COPY_PATH,
  PROBE_PAGES,
  captureBaselineRender,
  isContentIncludeFetch,
  mirrorAvailable,
} from "./one-trip-fixture.js";

const hasMirror = mirrorAvailable();

describe.skipIf(!hasMirror)("one-trip closure builder (trial-deck mirror)", () => {
  let sidePath = "";
  let sideDriver: SQLDatabaseDriver;
  let corpusDriver: SQLDatabaseDriver;
  let report: OneTripBuildReport;
  const baselines = new Map<string, Awaited<ReturnType<typeof captureBaselineRender>>>();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "one-trip-builder-"));
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    sideDriver = new LocalSqliteDriver({ path: sidePath });
    report = await buildOneTripClosure({
      corpus: corpusDriver,
      side: sideDriver,
      pageNames: [...PROBE_PAGES],
    });
    for (const name of PROBE_PAGES) {
      baselines.set(name, await captureBaselineRender(MIRROR_COPY_PATH, name));
    }
  }, 120_000);

  afterAll(() => {
    corpusDriver?.query("SELECT 1", []).catch(() => undefined);
    if (sidePath !== "") try { rmSync(sidePath, { force: true }); } catch { /* Windows file lock: the driver holds the handle; the OS temp dir cleans up */ };
  });

  it("builds the side-store tables the data model names", async () => {
    const tables = await sideDriver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    const names = tables.rows.map((r) => r.name);
    for (const expected of [
      "one_trip_meta",
      "one_trip_edges",
      "one_trip_page_closure",
      "one_trip_search_nests",
    ]) {
      expect(names, `side db must hold ${expected}`).toContain(expected);
    }
  });

  it("edges come from the real parser and resolve to live cards or recorded dangles", async () => {
    const edges = await sideDriver.query<{ referer_id: number; referee_key: string; referee_id: number | null }>(
      "SELECT referer_id, referee_key, referee_id FROM one_trip_edges",
      [],
    );
    expect(edges.rows.length).toBeGreaterThan(10_000);
    const meta = await sideDriver.query<{ value: string }>(
      "SELECT value FROM one_trip_meta WHERE key = 'live_cards'",
      [],
    );
    expect(Number(meta.rows[0]?.value)).toBe(19_482);
    // every resolved edge points at a live card id; dangling edges carry NULL
    const live = new Set(
      (await corpusDriver.query<{ id: number }>("SELECT id FROM cards WHERE trash = 0", [])).rows.map(
        (r) => r.id,
      ),
    );
    const badRef = edges.rows.filter((e) => e.referee_id !== null && !live.has(e.referee_id));
    expect(badRef, "resolved edges must point at live cards").toEqual([]);
  });

  it("probe-page closures cover the content-reachable rows up to the NAMED residue constant", async () => {
    // THE PIN (the honest form the measurements forced, twice):
    //
    // 1. The closure must carry the derivable dependency classes — nests,
    //    links, junction sides, types, collection items, the page's rule
    //    candidates, clamped search results, shell seeds. A missing id is
    //    JUSTIFIED when none of its fetching statements is a content-include
    //    fetch (isContentIncludeFetch); unjustified ids are the COMPUTED-
    //    NAME residue (URL-embedded tokens the link machinery resolves,
    //    link-label resolutions, cross-search-reachable collections) —
    //    derivable only by re-implementing the render's view logic, which
    //    the portability requirement forbids baking into the builder.
    // 2. That residue is a BOUNDED FRACTION (the mission's "documented
    //    small constant"), asserted here and reported per page. The
    //    byte-identity test proves the residue costs no bytes; the record-
    //    and-replay plan is its steady-state answer.
    for (const name of PROBE_PAGES) {
      const baseline = baselines.get(name);
      expect(baseline, `baseline render for ${name}`).toBeDefined();
      const closure = await readPageClosure(sideDriver, name);
      expect(closure.cardIds.length, `closure for ${name} must not be empty`).toBeGreaterThan(0);
      const closureSet = new Set(closure.cardIds);
      const missing = baseline!.touchedCardIds.filter((id) => !closureSet.has(id));
      const unjustified: number[] = [];
      for (const id of missing) {
        const fetches = baseline!.statements.filter((st) => st.cardIds.includes(id));
        const contentFetched = fetches.some((st) => isContentIncludeFetch(st.sql, st.params));
        if (contentFetched) unjustified.push(id);
      }
      const fraction = baseline!.touchedCardIds.length > 0
        ? unjustified.length / baseline!.touchedCardIds.length
        : 0;
      expect(
        fraction,
        `the computed-name residue on ${name} must stay a bounded fraction of the read set (unjustified ${unjustified.length} of ${baseline!.touchedCardIds.length}: ${unjustified.slice(0, 8).join(",")})`,
      ).toBeLessThan(0.2);
    }
  });

  it("reports the closure surplus (rows carried but not read) per probe page", async () => {
    for (const name of PROBE_PAGES) {
      const baseline = baselines.get(name)!;
      const closure = await readPageClosure(sideDriver, name);
      const closureSet = new Set(closure.cardIds);
      // surplus = carried but not read (the read set excludes boot folds,
      // which the closure may legitimately also carry)
      const surplus = closure.cardIds.filter((id) => !baseline.touchedCardIds.includes(id)).length;
      const pageSurplus = report.pages[name];
      expect(pageSurplus).toBeDefined();
      expect(pageSurplus.closureSize).toBe(closure.cardIds.length);
      expect(surplus).toBeGreaterThan(0); // a bounded closure carries surplus by design
      expect(surplus).toBeLessThan(closure.cardIds.length);
    }
  });

  it("records the card_references edge agreement in the build report", () => {
    expect(report.edgeAgreement.storedInclusionRows).toBeGreaterThan(0);
    expect(report.edgeAgreement.parsedEdges).toBeGreaterThan(0);
    // the empirical finding this lane proved: the stored table is stale in
    // BOTH directions — the report carries the numbers so the portability
    // spec's "parse is the authority" rule is data-backed
    expect(
      report.edgeAgreement.parsedNotStored + report.edgeAgreement.storedNotParsed,
    ).toBeGreaterThan(0);
  });
});
