// BUILD 2 (the consuming half): hand the one-trip payload to the render
// path WITHOUT touching the render path.
//
// The adapter is ENGINE SEAM 6 of types.ts: it seats the bundle's rows into
// the fetch cache through the SAME composer the waves' chunked reads use
// (render/prefetch.ts composeAndCacheSqlRows — the result-identity
// invariant there: a seated record is value-identical to the record the
// point-read ladder composed, same rows, same order, same bytes). The
// render then finds every card warm: its nest fetches, rule walks, and
// enrichment answer from cache, and its remaining queries are exactly the
// NAMED RESIDUE classes (render-plan.ts).
//
// Seeding is READ-ONLY over the deck: cache writes are engine memory, no
// SQL. A negative is expressed by absence — the bundle carries only real
// rows, so names the render asks for but the closure doesn't hold still
// cost their ordinary point-query miss (a named residue class), never a
// fabricated positive (fabricating one could flip an unknown-card slot
// into rendered content and change bytes — the one seeding bug class the
// design forbids).

import type { FetchEngine } from "../fetch.js";
import type { PageBundle } from "./types.js";
import { composeAndCacheSqlRows } from "../render/prefetch.js";

export interface RenderEngineLike {
  // The adapter never calls into RenderEngine specifics: fetch-cache
  // seating is enough. The render seats cache hits into its own render-card
  // map at fetch time (render.ts's cached-result branch), which is exactly
  // the warm-cache behavior of an already-rendered page.
}

/** Seat the bundle's cards into the fetch cache (+ lexicon). Pure memory:
 *  zero driver round trips. */
export async function seatPageBundle(
  fetcher: FetchEngine,
  _render: RenderEngineLike,
  bundle: PageBundle,
): Promise<{ seated: number }> {
  const composed = await composeAndCacheSqlRows(bundle.rows, {
    driver: fetcher.driver,
    lexicon: fetcher.lexicon,
    cacheRecord: async (record) => {
      // Fetch-cache seating only. The render enriches cache hits into its
      // own maps at fetch time; the payload's closure carries the type and
      // side cards that enrichment reads, so the enrichment itself answers
      // from cache.
      fetcher.writeToCache(record);
    },
  });
  return { seated: composed.length };
}
