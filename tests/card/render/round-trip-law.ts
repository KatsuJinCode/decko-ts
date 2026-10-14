// The cold-render round-trip law, shared by the suites that assert it.
//
// A cold render costs THREE fixed round trips plus one per level of nesting
// below the root, however many cards each level holds:
//
//   1. the root card's key row (FetchEngine.fetchWithOptions),
//   2. the prelude batch (src/card/render/prefetch.ts
//      prefetchInclusionClosure: the root's type row together with that
//      type's own type row, the side and set-pattern anchor primes, and the
//      engine's permission, codename, structure, rule-walk and freshness
//      folds),
//   3. the first wave round (RenderEngine.seatNamesByWave: the type-card
//      prime as its preamble, the rule-candidate names of the view-time
//      settings by key, their depth-2 junctions by side keys, and their
//      depth-3 junctions through the depth-2 junction by keys).
//
// Each further level of nesting is one closure batch (driveClosure).

/** Round trips a cold render pays before any nesting. */
export const FIXED_COLD_ROUND_TRIPS = 3;

/** The law: the round trips of a cold render nesting `levelsBelowRoot` levels. */
export function coldRoundTripLaw(levelsBelowRoot: number): number {
  return FIXED_COLD_ROUND_TRIPS + Math.max(0, levelsBelowRoot);
}
