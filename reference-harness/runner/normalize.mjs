// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are two kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There are two: N1, N3.
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

/**
 * N3. A mod-accordion collapse id's numeric context: the
 * `card-<safe-key>-<n>-collapse-id` token whose <n> is Ruby's `title.hash`
 * for the accordion section title (card/mod/core/set/all/admin.rb:96
 * `context: title.hash`, feeding mod/bootstrap accordion.rb:13
 * `collapse_id: "card-#{card.name.safe_key}-#{args[:context]}-collapse-id"`).
 * Ruby hashes strings with a per-process seed, so the digits are process
 * noise, not bytes: two stock-oracle runs of synthetic-v2 over every op that
 * carries the token (30 of 2,557, 84 tokens) differ in 84 of 84 tokens and,
 * after N1 and this rule, in nothing else (benchmarks/seconds-corpus/
 * collapse-id-nondeterminism-evidence.md). The literal contexts ("files",
 * "depends_on", view names) hold no digits and never match. Canonical form,
 * not erasure: each distinct digit run becomes N3#k in first-appearance
 * order per html string, so the accordion button's data-bs-target and its
 * panel id must still agree - an engine that emitted mismatched ids
 * normalizes to different placeholders and still fails.
 */
export const COLLAPSE_ID = /(card-[a-z0-9_]+-)(-?\d+)(-collapse-id)/g;

export function normalizeHtml(html) {
  if (typeof html !== "string") return html;
  const seen = new Map();
  return html
    .replace(SLOT_ID, (_, q) => `data-slot-id=${q}SLOT${q}`)
    .replace(COLLAPSE_ID, (_, pre, digits, post) => {
      let k = seen.get(digits);
      if (k === undefined) {
        k = `N3#${seen.size + 1}`;
        seen.set(digits, k);
      }
      return `${pre}${k}${post}`;
    });
}

/** A render result: its HTML normalised by N1, every other field as is. */
export function normalizeRender(result) {
  return result && typeof result === "object" && typeof result.html === "string" ? { ...result, html: normalizeHtml(result.html) } : result;
}

/** Stable JSON: object keys sorted, so key order never counts; leaf strings
 *  get the string-level rules (SPEC.md "Normalisation" N6: the per-journey
 *  server port, which both engines draw at random). */export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  if (typeof value === "string") return value.replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:PORT");
  return value;
}

/** True when two values are equal under N2. */
export function sameJson(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
