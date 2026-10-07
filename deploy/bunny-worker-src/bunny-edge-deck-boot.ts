// bunny-edge-deck-boot.ts — the corpus deck boot the Bunny edge entry runs,
// extracted from bunny-edge-engine-entry.ts's bootDeck so vitest can drive
// the REAL production boot over an in-process driver (the entry itself
// imports the Bunny Edge Scripting SDK, which the test runtime does not
// provide — the same SDK-free split as bunny-edge-engine-request.ts).
//
// p2-person-section lane (2026-10-03): this boot carries the two deck-boot
// duties the engine cannot do for itself, the ones the entry previously
// skipped and the screenshot lane's person-page parity defect fell out of:
//
//   1. THE DECK INFLECTION TABLE. The Culturesmith deck stores card keys
//      under three uncountable words (s / this / anonymous — see
//      src/card/name/oracle-deck-inflections.ts for the recovered table and
//      its provenance). Origins serving this deck MUST apply the table
//      before any name parse, exactly as a Rails deck's
//      config/initializers/inflections.rb runs at boot. Under the gem
//      defaults, parenthesized names key differently ("Participant(s)" keys
//      as "participant_" under the default /s$/ strip, "participant_s" in
//      the deck) and every CQL plus-join against those junctions resolves
//      the wrong key (the 2026-09-25 "0 results" staging defect's boot
//      half).
//
//   2. THE VIRTUAL-CARD RULE UNIVERSE. Compound names with no db row
//      resolve as VIRTUAL cards when a *structure rule covers them
//      (mod/core/set/all/states.rb:44-50 `virtual?` — the port is
//      src/card/fetch/virtual-cards.ts, whose header cites the whole Ruby
//      chain). The resolution is an INJECTED hook
//      (FetchEngine.virtualCardLookup): "wired by the storage factory, not
//      by FetchEngine itself". The corpus deck carries such junctions
//      TRASHED with empty content — e.g. every "Person+Project(s)
//      Participating" junction (row 419: trash=1, RichText, empty) — while
//      the depth-3 structure rule
//      ((Person + Project(s) Participating) + *type plus right) + *structure
//      (rule 422, type Search/id 30, content
//      {"type":"project","plus":["Participant(s)",{"refer_to":"_left"}]})
//      makes them live searcher cards. Ruby renders the section; without
//      the hook the fetch answers "unknown", the
//      {{+Project(s) Participating|titled}} nest renders the missing-child
//      arm, and the whole section vanishes from every person page (the
//      screenshot lane's 171px person-page parity defect,
//      tmp/wrong-goal-hunt/p2-person-section-lane.md).
//
// The wiring mirrors deploy/worker.ts primeCqlNameResolver and
// vm-staging-server.mjs primeEngine (the two hosts that already carry it).
// The full-deck lexicon warm is deliberately NOT here: the edge isolate
// boots inside the first request, and the render path's async ensureCardId
// fallback (src/card/render.ts, the CQL queryOptions) resolves CQL name
// arguments from the database lazily — the VM host warms for latency, not
// correctness.

import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { SPACES_ASSET_HOST } from "./bunny-edge-page-shell.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../src/card/rules/structure.js";

/** The engines a request renders through; the entry adds its own
 *  host-specific config (imageCdnHost) on top. */
export interface DeckEngines {
  fetcher: FetchEngine;
  render: RenderEngine;
}

/** THE ONE-TRIP BOOT CAP (lane-one-trip-serve-2026-10-04). A one-trip
 *  deployment boots the engine with the Temporary-cache reset threshold
 *  RAISED: the Ruby-parity default is 10,000 keys
 *  (src/card/fetch/cache.ts DEFAULT_MAX_TEMPORARY_CACHE_KEYS = cardio's
 *  max_temporary_cache_keys = 10_000), and seating one page payload writes
 *  ~3.5k keys on the trial deck — a multi-page session crosses the default
 *  mid-session and the wholesale reset evicts primed state, so the ON
 *  posture re-asks what the OFF posture still had. MEASURED on the serving
 *  line at the default cap (one-trip-serving-line-posture-report.json,
 *  proof run 1): ON cold exceeded OFF cold on Aikido (+77 trips), About
 *  (+266) and Eagle (+7); the module fixture measured Eagle's 1,668
 *  seating-induced re-queries going to 0 with the raised cap
 *  (tests/card/one-trip/one-trip-fixture.ts). The cap is FetchEngine's own
 *  boot option — a boot parameter, not an engine change. The OFF-default
 *  posture never passes it: the deployed default boot is unchanged. */
export const ONE_TRIP_BOOT_MAX_TEMPORARY_CACHE_KEYS = 200_000;

export async function bootCorpusDeckEngines(
  driver: SQLDatabaseDriver,
  opts: { maxTemporaryCacheKeys?: number } = {},
): Promise<DeckEngines> {
  // Inflection boot BEFORE any DeckoName.parse of deck-sourced names (the
  // Rails-initializer moment; applyDeckInflections clears the parse cache,
  // so a re-boot under amended tables cannot serve stale keys).
  applyDeckInflections(ORACLE_DECK_INFLECTIONS);

  // The OFF-default branch keeps the pinned boot expression verbatim
  // (deploy-origin-deck-inflection-boot.test.ts scans this file for
  // `new FetchEngine(driver)` and pins applyDeckInflections BEFORE it —
  // both branches are below that call, the guard's property holds in
  // each). The raised-cap branch is the one-trip deployment boot only.
  const fetcher = opts.maxTemporaryCacheKeys === undefined
    ? new FetchEngine(driver)
    : new FetchEngine(driver, { maxTemporaryCacheKeys: opts.maxTemporaryCacheKeys });
  const render = new RenderEngine(fetcher);

  // The sync name environment: the FetchEngine constructor installs the
  // cold-isolate default (fetch.ts, "THE COLD-ISOLATE DEFAULT"), and this
  // explicit install keeps THIS boot the owner of the process-global
  // environment even when the process constructed an earlier engine (the
  // entry constructs none; the test rigs must not either). The codename
  // codehash loads synchronously on first use, but the explicit load here
  // is one small statement at boot and keeps the first request off the
  // lazy path.
  fetcher.installNameEnvironment();
  await fetcher.codenames.ensureLoaded();

  // Virtual-card rule universe: one indexed statement, composed on the
  // driver this boot owns. Without the hook, FetchEngine.fetchByName
  // answers undefined for every missing-row + structure-rule junction and
  // the serving path renders them as missing (the person-page section
  // drop).
  const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universeResult),
    ruleTypeIds: structureRuleTypesFromResults(universeResult),
  });

  return { fetcher, render };
}

/** THE EDGE SERVING BOOT: the corpus boot above plus the two serving
 *  fields the Bunny edge handler's bootDeck has always set. One function, so
 *  the handler and the measurement harness (benchmarks/speed-ship) boot the
 *  same way.
 *
 *  The deck-wide name scan (installDeckNameEnvironment: every trash-0 row's
 *  name, about 21,700 on the trial deck, poured into the lexicon) is OFF by
 *  default. It costs round trips instead of saving them: the Temporary cache
 *  keeps only the last 10,000 keys of it, and the request re-reads the rest.
 *  Measured on the trial-deck mirror: dropping it changes no byte on the 40
 *  gate pages (benchmarks/speed-ship/gate.py) and removes its own statement
 *  plus the re-reads it caused. The corpus boot's own name-environment
 *  install and codename load (above) are what the sync name readers need.
 *  DECKO_EDGE_NAME_SCAN=1 restores the scan. */
export async function bootEdgeServingEngines(
  driver: SQLDatabaseDriver,
  opts: { maxTemporaryCacheKeys?: number; nameScan?: boolean } = {},
): Promise<DeckEngines> {
  const engines = await bootCorpusDeckEngines(
    driver,
    opts.maxTemporaryCacheKeys === undefined ? {} : { maxTemporaryCacheKeys: opts.maxTemporaryCacheKeys },
  );
  const nameScan = opts.nameScan ?? (typeof process !== "undefined" && process.env?.DECKO_EDGE_NAME_SCAN === "1");
  if (nameScan) {
    await installDeckNameEnvironment(driver, engines.fetcher);
  } else {
    // Everything the scan's caller relied on except the scan itself: this
    // boot owns the process-global name environment at the moment it
    // returns, and the codename registry is loaded (no statement when the
    // corpus boot already loaded it).
    engines.fetcher.installNameEnvironment();
    await engines.fetcher.codenames.ensureLoaded();
  }
  engines.render.imageCdnHost = SPACES_ASSET_HOST;
  return engines;
}
