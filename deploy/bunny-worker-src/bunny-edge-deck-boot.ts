// bunny-edge-deck-boot.ts — the deck boot the Bunny edge entry runs,
// extracted from bunny-edge-engine-entry.ts's bootDeck so vitest can drive
// the REAL production boot over an in-process driver (the entry itself
// imports the Bunny Edge Scripting SDK, which the test runtime does not
// provide — the same SDK-free split as bunny-edge-engine-request.ts).
//
// This boot carries two deck-boot duties the engine cannot do for itself, the
// ones a bare engine construction would skip:
//
//   1. THE DECK INFLECTION TABLE. The deck being served stores card keys
//      under three uncountable words (s / this / anonymous — see
//      src/card/name/oracle-deck-inflections.ts for the recovered table and
//      its provenance). Origins serving such a deck MUST apply the table
//      before any name parse, exactly as a Rails deck's
//      config/initializers/inflections.rb runs at boot. Under the gem
//      defaults, parenthesized names key differently ("Participant(s)" keys
//      as "participant_" under the default /s$/ strip, "participant_s" in
//      the deck) and every CQL plus-join against those junctions resolves
//      the wrong key — the boot half of the staging-side "0 results" defect.
//
//   2. THE VIRTUAL-CARD RULE UNIVERSE. Compound names with no db row
//      resolve as VIRTUAL cards when a *structure rule covers them
//      (mod/core/set/all/states.rb:44-50 `virtual?` — the port is
//      src/card/fetch/virtual-cards.ts, whose header cites the whole Ruby
//      chain). The resolution is an INJECTED hook
//      (FetchEngine.virtualCardLookup): "wired by the storage factory, not
//      by FetchEngine itself". A deck may carry such junctions TRASHED with
//      empty content while a depth-3 structure rule makes them live searcher
//      cards. Ruby renders the section; without the hook the fetch answers
//      "unknown", the {{+Item(s) Listing|titled}} nest renders the
//      missing-child arm, and the whole section vanishes from every person
//      page.
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
import { getDefaultModLoader } from "../../src/card/mod-loader.js";
import { defaultDeckLoader } from "../../src/card/mod-loader/default-mod-deck.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { setDeckTimeZone } from "../../src/card/deck-time-zone.js";
import { setDeckEnvironment } from "../../src/card/render/deck-origin.js";
import { readNestIndexMarker } from "../../src/card/nest-index.js";
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

/** THE ONE-TRIP BOOT CAP. A one-trip deployment boots the engine with the
 *  Temporary-cache reset threshold RAISED: the Ruby-parity default is 10,000
 *  keys (src/card/fetch/cache.ts DEFAULT_MAX_TEMPORARY_CACHE_KEYS =
 *  cardio's max_temporary_cache_keys = 10_000), and seating one page payload
 *  writes ~3.5k keys — a multi-page session crosses the default mid-session
 *  and the wholesale reset evicts primed state, so the ON posture re-asks
 *  what the OFF posture still had. MEASURED on the serving line at the
 *  default cap: ON cold exceeded OFF cold on three probe pages (+77, +266
 *  and +7 round trips); the module fixture measured one page's 1,668
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
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);

  // The OFF-default branch keeps the pinned boot expression verbatim
  // (deploy-origin-deck-inflection-boot.test.ts scans this file for
  // `new FetchEngine(driver)` and pins applyDeckInflections BEFORE it —
  // both branches are below that call, the guard's property holds in
  // each). The raised-cap branch is the one-trip deployment boot only.
  const fetcher = opts.maxTemporaryCacheKeys === undefined
    ? new FetchEngine(driver)
    : new FetchEngine(driver, { maxTemporaryCacheKeys: opts.maxTemporaryCacheKeys });
  // THE VIEW REGISTRY: the composed mod deck, booted once per isolate (the
  // Ruby boot's Cardio::Mod::Dirs load), before the render engine is built,
  // so the engine binds it and resolves every view through the per-set
  // chain the save path and the semantics census use, falling back to the
  // compiled base table. load() is a few milliseconds of table building.
  if (getDefaultModLoader() === undefined) defaultDeckLoader();
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

  // Virtual-card rule universe: one indexed statement, composed on the
  // driver this boot owns. Without the hook, FetchEngine.fetchByName
  // answers undefined for every missing-row + structure-rule junction and
  // the serving path renders them as missing (the person-page section
  // drop).
  //
  // The codename load and the universe statement are independent (the
  // universe is plain SQL keyed by setting name), so they go out together:
  // one dependency level instead of two on every cold isolate. Measured on
  // Bunny, the sequential pair cost about 110 ms (the first carrying the
  // connection set-up), and most requests land on a fresh isolate.
  const [, [universeResult]] = await Promise.all([
    fetcher.codenames.ensureLoaded(),
    driver.batch([structureRuleUniverseStatement()]),
  ]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universeResult),
    ruleTypeIds: structureRuleTypesFromResults(universeResult),
  });

  // The stored nest index, read-only (src/card/nest-index.ts). A request never
  // builds it: a deck whose marker is missing or stale renders by walking its
  // nest closure (the same bytes, one round trip per level) until the build
  // step (tools/deploy/build-nest-index.mjs) brings it current. Said loudly.
  {
    const marker = await readNestIndexMarker(driver);
    if (marker.state !== "current") {
      console.warn(
        `[nest-index] ${marker.state} (version ${marker.version ?? "none"}): this deck serves by walking its nest closure until tools/deploy/build-nest-index.mjs has run`,
      );
    }
  }

  return { fetcher, render };
}

/** Re-run the boot's data-dependent steps on an engine that is kept across
 *  the discovery passes of one live request (src/card/live/live-render.ts,
 *  incremental discovery): the codename registry and the virtual-card rule
 *  universe were read when the request store may not yet have held their
 *  rows, so each pass reads them again from the store. */
export async function refreshEdgeServingEngines(driver: SQLDatabaseDriver, render: RenderEngine): Promise<void> {
  const fetcher = render.fetcher;
  fetcher.codenames.resetCache();
  await fetcher.reprimeBootState();
  const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universeResult),
    ruleTypeIds: structureRuleTypesFromResults(universeResult),
  });
}

/** THE EDGE SERVING BOOT: the deck boot above plus the two serving
 *  fields the Bunny edge handler's bootDeck has always set. One function, so
 *  the handler and the measurement harness (benchmarks/speed-ship) boot the
 *  same way.
 *
 *  The deck-wide name scan (installDeckNameEnvironment: every trash-0 row's
 *  name, about 21,700 on a deck of that size, poured into the lexicon) is OFF
 *  by default. It costs round trips instead of saving them: the Temporary cache
 *  keeps only the last 10,000 keys of it, and the request re-reads the rest.
 *  Measured on a deck mirror: dropping it changes no byte on the 40 gate pages
 *  (gate.py (not in the public package)) and removes its own statement plus the
 *  re-reads it caused. The deck boot's own name-environment install and
 *  codename load (above) are what the sync name readers need.
 *  DECKO_EDGE_NAME_SCAN=1 restores the scan. */
export async function bootEdgeServingEngines(
  driver: SQLDatabaseDriver,
  opts: {
    maxTemporaryCacheKeys?: number;
    nameScan?: boolean;
    /** The deployment's configured asset host.
     *  Unset = the engine's own host-relative /files/ form, which is what a
     *  deck with no CDN configured serves. Read from the deployment's
     *  DECKO_SERVED_DELTAS assetHost by bootDeck; never hard-coded. */
    assetHost?: string;
    fontAwesomeAssetMode?: "local";
    materialIconsAssetMode?: "local";
    /** The deck's phantom (unknown pointer/list item) type identity — the
     *  deck config form of Ruby's `*all+*default` template type. Unset, the
     *  deck's unknown items carry no type chip and no type attributes. */
    phantomItemType?: { typeId: number; typeName: string; typeKey: string };
    /** The deck's configured time zone (IANA name) for every timestamp the
     *  render path formats. Unset keeps the graded deck's zone. */
    timeZone?: string;
    /** The deck's configured origin — Ruby's `Cardio.config.deck_origin`.
     *  Installed through setDeckEnvironment so the engine's own bytes (the
     *  page head's decko.rootUrl, the :url views) carry the configured
     *  origin instead of the requestless relative form. Unset = relative
     *  URLs. */
    deckOrigin?: string;
  } = {},
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
    // deck boot already loaded it).
    engines.fetcher.installNameEnvironment();
    await engines.fetcher.codenames.ensureLoaded();
  }
  engines.render.imageCdnHost = opts.assetHost;
  engines.render.fontAwesomeAssetMode = opts.fontAwesomeAssetMode;
  engines.render.materialIconsAssetMode=opts.materialIconsAssetMode;
  engines.render.phantomItemType = opts.phantomItemType;
  // The DECK's time zone. The render path's
  // timestamps read it from src/card/deck-time-zone.ts rather than from a
  // hard-coded host zone, so a deployment sets it here. Unset keeps the
  // graded deck's zone, which is what leaves every graded byte intact while
  // removing the dependency on any one host's OS setting.
  if (opts.timeZone !== undefined) setDeckTimeZone(opts.timeZone);
  // THE DECK'S CONFIGURED ORIGIN: the same
  // configuration channel the reference recorder used (it assigns
  // Cardio.config.deck_origin around a page run). Unset, the engine
  // renders the requestless relative form and no byte carries an origin
  // nobody configured.
  if (opts.deckOrigin !== undefined) setDeckEnvironment({ origin: opts.deckOrigin });
  return engines;
}
