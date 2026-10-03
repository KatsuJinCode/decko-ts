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

export async function bootCorpusDeckEngines(
  driver: SQLDatabaseDriver,
): Promise<DeckEngines> {
  // Inflection boot BEFORE any DeckoName.parse of deck-sourced names (the
  // Rails-initializer moment; applyDeckInflections clears the parse cache,
  // so a re-boot under amended tables cannot serve stale keys).
  applyDeckInflections(ORACLE_DECK_INFLECTIONS);

  const fetcher = new FetchEngine(driver);
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
