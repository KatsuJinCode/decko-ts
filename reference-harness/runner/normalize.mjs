// The harness's normalisation, stated once (reference-harness/SPEC.md,
// "Normalisation"). There are two kinds of rule, and nothing else is applied:
//
// - A mask erases a value. A mask is allowed only for a field shown to vary
//   between two runs of the same oracle on the same fixture, and it is as
//   narrow as that field's exact shape. There is one: N1.
// - A canonical form over a volatile value replaces values that are a pure
//   function of something outside the engines (a per-process hash seed, the
//   capture clock, the capture host's filesystem) with one placeholder, so
//   the comparison sees only what the engines themselves decide. The
//   surrounding bytes still count: an engine whose output differs anywhere
//   outside the volatile span still fails. There are three: N3 (collapse
//   ids), N4 (relative-time spans), N5 (capture-host debug content).
// - A plain canonical form compares the same value in another encoding and
//   erases nothing: N2, JSON key order.
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

/**
 * N4. A relative-time span: Rails `time_ago_in_words` output
 * (actionview date_helper.rb:95-165, the vocabulary the engine's
 * text-helpers.ts port carries byte-exact). The oracle's words are a pure
 * function of the capture clock the harness freezes
 * (oracle/lib/harness_env.rb freeze_clock!, travel_to the fixture clock):
 * a card built moments before the capture renders "less than a minute"
 * forever, which no engine clock can reproduce and no two engines' live
 * clocks agree on. Every phrase becomes one placeholder, so the span's
 * presence and position still count while its clock-drawn value does not.
 * The surrounding sentence must still match byte for byte ("added ... ago
 * by", the whole attribute or line around it), so a real content change
 * beside a span still fails. Measured on synthetic-v2: 22 of 2,557 oracle
 * ops carry a span (179 "less than a minute", one "2 days"); the four ops
 * whose only divergence was the span grade identical after N4, and no
 * identical op breaks (benchmarks/seconds-corpus/
 * capture-clock-and-debug-span-canonicalization-evidence.md).
 */
export const RELATIVE_TIME =
  /\b(less than a minute|half a minute|less than \d+ seconds|about (?:[1-9]|1[0-9]|2[0-4]) hours?|about (?:[1-9]|1[0-2]) months?|about [1-9][0-9]* years?|over [1-9][0-9]* years?|almost [1-9][0-9]* years?|(?:[1-9]|1[0-9]|2[0-9]|3[0-9]|4[0-4]) minutes?|(?:[1-9]|1[0-9]|2[0-4]) hours?|(?:[1-9]|[12][0-9]|30) days?|(?:[1-9]|1[0-2]) months?)\b/g;

/**
 * N5. The capture host's identity inside an admin-only render-error span's
 * title. The oracle's quiet spans (card-mod-format set/all/html/error.rb)
 * embed the Ruby debug page, whose backtrace frames carry the capturing
 * machine's absolute paths (the Ruby install, the gem home, the harness
 * checkout) and, where an object lands in the message, its heap address.
 * Those bytes are the capture machine's, not the oracle's semantics: a
 * capture from another host - or the same deck captured after a checkout
 * move - differs in them while saying the same thing. Inside a title that
 * begins with the debug page marker they become placeholders; the error
 * message itself, the frame structure and every byte outside the title
 * still count. The engine must never emit a debug page: N5 only stops the
 * comparison from demanding the capture machine's filesystem. Measured on
 * synthetic-v2: 8 oracle ops carry the page (554 path tokens, 2 heap
 * addresses); the six ops whose recorded divergence is the embedded page
 * keep their pins - the engine does not raise where the oracle raises,
 * which is a structural gap N5 does not and must not hide (same evidence
 * receipt as N4).
 */
export const ERROR_SPAN_TITLE =
  /(title=")(\s*&lt;h3&gt;Error message \(visible to admin only\)&lt;\/h3&gt;[\s\S]*?)(")/g;
// A path token ends at the frame separator: `.../signing_algorithm.rb:39:in`
// keeps its `:39:in` outside the placeholder, so the frame's line and method
// stay compared oracle semantics (no Windows path carries a colon).
const CAPTURE_HOST_PATH = /\b[A-Za-z]:[/\\][^\s<>&":]+/g;
const HEAP_ADDRESS = /0x[0-9a-fA-F]{6,16}/g;

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
    })
    .replace(RELATIVE_TIME, "N4#elapsed")
    .replace(ERROR_SPAN_TITLE, (_, open, body, close) => open + body.replace(CAPTURE_HOST_PATH, "N5#path").replace(HEAP_ADDRESS, "N5#addr") + close);
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
