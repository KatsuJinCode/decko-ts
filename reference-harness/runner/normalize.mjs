// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are two kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There is one: N1.
// - A canonical form compares the same value in another encoding and erases
//   nothing: N2, JSON key order.
//
// Every rule has tests (runner/test/normalize.test.mjs) that a nearby
// meaningful change still fails.

/**
 * N1. A slot id: the `data-slot-id` attribute holding exactly 20 lowercase
 * hex digits, in attribute position, quote style kept. Ruby Decko draws it at
 * random for every render, so two oracle runs of one fixture differ in it and
 * nowhere else (REFERENCE-HARNESS evidence: 9,056 slot ids in 1,350 renders).
 */
export const SLOT_ID = /(?<=\s)data-slot-id=(["'])[0-9a-f]{20}\1/g;

export function normalizeHtml(html) {
  if (typeof html !== "string") return html;
  return html.replace(SLOT_ID, (_, q) => `data-slot-id=${q}SLOT${q}`);
}

/** A render result: its HTML normalised by N1, every other field as is. */
export function normalizeRender(result) {
  return result && typeof result === "object" && typeof result.html === "string" ? { ...result, html: normalizeHtml(result.html) } : result;
}

/** N2. Stable JSON: object keys sorted, so key order never counts. Array
 *  order always counts. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

/** True when two values are equal under N2. */
export function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
