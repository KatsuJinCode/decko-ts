// bunny-edge-deck-boot.ts — the corpus deck boot the Bunny edge entry runs,
// extracted from bunny-edge-engine-entry.ts's bootDeck so vitest can drive
// the REAL production boot over an in-process driver (the entry itself
// imports the Bunny Edge Scripting SDK, which the test runtime does not
// provide — the same SDK-free split as bunny-edge-engine-request.ts).
//
// p2-person-section lane (2026-10-03). This extraction is BEHAVIOR-IDENTICAL
// to the entry's bootDeck at the RED commit: it constructs the bare engines
// and nothing else. The gap this module exists to close (next commit, the
// GREEN half of the lane's RED->GREEN):
//
//   1. THE DECK INFLECTION TABLE is never applied. The Culturesmith deck
//      stores card keys under three uncountable words (s / this / anonymous
//      — src/card/name/oracle-deck-inflections.ts holds the recovered table
//      and its provenance). Origins serving this deck must apply it before
//      any name parse, exactly as a Rails deck's
//      config/initializers/inflections.rb runs at boot. Under the gem
//      defaults, parenthesized names key differently
//      ("Participant(s)" -> "participant_" vs the deck's "participant_s")
//      and every CQL plus-join against those junctions resolves the wrong
//      key (the 2026-09-25 "0 results" staging defect's boot half).
//
//   2. THE VIRTUAL-CARD RULE UNIVERSE is never wired. Compound names with
//      no db row resolve as VIRTUAL cards when a *structure rule covers
//      them (mod/core/set/all/states.rb:44-50 `virtual?` — the port is
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
//      makes them live searcher cards. Ruby renders the section; this boot
//      wires no hook, so the fetch answers "unknown", the
//      {{+Project(s) Participating|titled}} nest renders the missing-child
//      arm, and the whole section vanishes from every person page (the
//      screenshot lane's 171px person-page parity defect,
//      tmp/wrong-goal-hunt/p2-person-section-lane.md).
//
// The GREEN commit mirrors deploy/worker.ts primeCqlNameResolver and
// vm-staging-server.mjs primeEngine (the two hosts that already carry the
// wiring). The full-deck lexicon warm stays out even then: the edge isolate
// boots inside the first request, and the render path's async ensureCardId
// fallback (src/card/render.ts, the CQL queryOptions) resolves CQL name
// arguments from the database lazily — the VM host warms for latency, not
// correctness.

import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";

/** The engines a request renders through; the entry adds its own
 *  host-specific config (imageCdnHost) on top. */
export interface DeckEngines {
  fetcher: FetchEngine;
  render: RenderEngine;
}

export async function bootCorpusDeckEngines(
  driver: SQLDatabaseDriver,
): Promise<DeckEngines> {
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  return { fetcher, render };
}
