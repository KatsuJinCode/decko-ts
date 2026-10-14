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
// The prelude also carries the stored nest index's closure statement
// (prefetchInclusionClosure: a recursive walk of card_references 'I' rows
// from the root, with the sides of every reached junction). When the index
// describes the content, every closure level is answered from those rows and
// the render costs the three fixed round trips at ANY depth. Each level the
// index does not answer (no reference rows, a stale row, a nest the write
// path never recorded) costs one closure batch (driveClosure); suites whose
// seeds write no reference rows measure that per-level walk.

/** Round trips a cold render pays before any nesting. */
export const FIXED_COLD_ROUND_TRIPS = 3;

/** Round trips of a cold render whose nest closure the stored nest index
 *  answers: the fixed three, whatever the depth. */
export const INDEXED_COLD_ROUND_TRIPS = FIXED_COLD_ROUND_TRIPS;

/** The per-level walk: the round trips of a cold render nesting
 *  `levelsBelowRoot` levels that the stored nest index does not answer. */
export function coldRoundTripLaw(levelsBelowRoot: number): number {
  return FIXED_COLD_ROUND_TRIPS + Math.max(0, levelsBelowRoot);
}
