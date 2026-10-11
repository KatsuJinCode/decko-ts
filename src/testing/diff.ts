// Byte-diff comparator for oracle replay, plus the three normalization rules
// the Ruby recording layer applies (two of them recorded at capture time, the
// third a capture-process value the recorder could not have known to mask).
//
// 1. data-slot-id (tools/oracle/capture.rb:49-52). The capture replaces every
//    rendered slot's random DOM id with the literal placeholder
//    data-slot-id="RANDOMIZED" before writing the fixture; the replay side
//    applies the same canonicalization to BOTH sides so a TS render that
//    stamps a fresh random slot id still byte-matches the fixture, while the
//    PRESENCE of the attribute (and every other byte) stays part of the spec.
// 2. the accordion group hash (the two admin-card capture scripts, e.g.
//    tests/card/mod-loader/oracle-capture-admin-card-views.rb:39). Ruby 3.3
//    seeds String#hash per process, so the collapse id carries a value no
//    deterministic engine can reproduce. See ACCORDION_GROUP_HASH_PATTERN.
// 3. the Cardio::Mod object address (card-1.110.0 mod/core/set/self/mod.rb:4-6
//    interpolates a mod object that defines no #to_s, so Ruby prints its heap
//    address). Same class of value as 1 and 2 — a capture-process artifact.
//    See MOD_OBJECT_ADDRESS_PATTERN.
//
// Diff semantics: exact bytes, except those three values.

/**
 * The recording-layer placeholder. Every normalized slot carries exactly
 * this attribute value in the fixture bytes.
 */
export const RANDOMIZED_SLOT_ATTRIBUTE = 'data-slot-id="RANDOMIZED"';

/**
 * The normalization rule, mirrored from docs/parity-method.md:
 *
 *   data-slot-id=<quote><20 lowercase hex><quote>  ->  data-slot-id="RANDOMIZED"
 *
 * Quote style is erased (Ruby emits double quotes in most views and single
 * quotes inside search-result bars; the capture canonicalizes both). The id
 * is exactly 20 lowercase hex because Ruby emits SecureRandom.hex(10); the
 * strict length is deliberate - a TS engine emitting a different-length id
 * is a real divergence and must survive normalization so the byte diff
 * surfaces it. (capture.rb's own regex is the looser \h+; the replay gate
 * is deliberately stricter than the recorder for exactly that reason.)
 */
const SLOT_ID_PATTERN = /data-slot-id=(['"])([0-9a-f]{20})\1/g;

/**
 * The same slot id one level of attribute escaping down. A slot rendered
 * INSIDE an attribute value (a link title carrying a nest: the Item+short
 * structure's `[[_left|{{_left+image}}]]`, whose title Rails escapes only for
 * quotes) keeps its random id behind `&quot;`, which the capture's regex never
 * saw. Same per-process value and the same strict 20-hex shape, normalized to
 * the escaped placeholder on both sides.
 */
const ESCAPED_SLOT_ID_PATTERN = /data-slot-id=&quot;([0-9a-f]{20})&quot;/g;
const ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE = "data-slot-id=&quot;RANDOMIZED&quot;";

/**
 * The accordion group-hash rule, mirrored from the two admin-card capture
 * scripts (tests/card/mod-loader/oracle-capture-admin-card-views.rb:39 and
 * oracle-capture-admin-view-pins.rb:42) and from the four TS pin suites that
 * already carry a local copy of it:
 *
 *   card-<safe_key>-<signed decimal>-collapse-id -> card-<safe_key>-HASH-collapse-id
 *
 * WHY THIS IS NOT DERIVABLE. The token is Ruby's String#hash of the accordion
 * group title, embedded by accordion_item's collapse id
 * (`card-#{card.name.safe_key}-#{args[:context]}-collapse-id`). Ruby 3.3 seeds
 * SipHash PER PROCESS, so the value is an artifact of the capture process and
 * not a function of the card. Measured on this machine: three consecutive
 * `ruby -e 'print "Admin".hash'` processes returned three different values,
 * none equal to the yardstick capture's `97674992`. The engine's stand-in
 * (src/card/mod-loader/mods/core-mod.ts stringHash, a 31-accumulator truncated
 * to int32) is stable - three renders of the same card in one process agreed -
 * so it is NOT a warm-state artifact; it simply cannot reproduce a per-process
 * SipHash. No algorithm on the TypeScript side can match it, and the -8..+4
 * delta band is nothing but the digit-count difference between two random
 * tokens. The sign is part of the value on BOTH sides (the capture's own rows
 * carry `card-mod_list--681338365-collapse-id`), hence `-?[0-9]+`.
 *
 * SCOPE. `card-` prefix and `-collapse-id` suffix are both required, and the
 * middle segment must be decimal, so the word-shaped group names the engine
 * emits for non-hashed accordions survive untouched: `card-mod_format-files-
 * collapse-id` (core-mod.ts:1145), `-depends_on-collapse-id` (core-mod.ts:1152),
 * `card-<key>-closed-collapse-id` (views.ts:3796), and the rule-board groups
 * `templating` / `editing` / `event` (card-mod-edit.ts:2831).
 *
 * The gate this corrects: tools/oracle/capture.rb:49-52 masks data-slot-id and
 * nothing else, so the recorded fixtures hold raw hashes and every affected
 * replay entry fails forever. The two capture scripts written afterwards mask
 * it, and fixtures/captured/admin-view-pins.json records
 * `normalizations: {"collapse-id": "HASH", "data-slot-id": "RANDOMIZED"}`.
 */
const ACCORDION_GROUP_HASH_PATTERN = /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g;

/**
 * The placeholder the accordion collapse id carries once masked. Same token the
 * capture scripts and the pin fixtures use, so a normalized render compares
 * equal to a capture that masked at record time and to one that did not.
 */
export const RANDOMIZED_GROUP_TOKEN = "HASH";

/**
 * Canonicalize the accordion group hash the way the admin-card capture
 * scripts do. Idempotent: "HASH" is not decimal, so the placeholder is never
 * re-matched.
 */
export function normalizeAccordionGroupIds(html: string): string {
  return html.replace(ACCORDION_GROUP_HASH_PATTERN, `$1${RANDOMIZED_GROUP_TOKEN}$2`);
}

/**
 * Canonicalize slot ids the way the recording layer does. Idempotent: the
 * placeholder itself ("RANDOMIZED" is not hex) is never re-matched.
 * Attribute presence is preserved - this only rewrites the value.
 */
export function normalizeSlotIds(html: string): string {
  return html
    .replace(SLOT_ID_PATTERN, RANDOMIZED_SLOT_ATTRIBUTE)
    .replace(ESCAPED_SLOT_ID_PATTERN, ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE);
}

/**
 * Mask slot-id VALUES only, keeping the quote style Ruby wrote: the
 * reference harness's N1 (reference-harness/runner/normalize.mjs). This is
 * the rule for a reference stored as Ruby wrote it. Ruby writes a Haml bar's
 * slot id single-quoted and a content_tag wrap's double-quoted, so quote style
 * is part of the output and must be compared.
 */
export function maskSlotIdValues(html: string): string {
  return html
    .replace(SLOT_ID_PATTERN, (_m, q: string) => `data-slot-id=${q}RANDOMIZED${q}`)
    .replace(ESCAPED_SLOT_ID_PATTERN, ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE);
}

/**
 * True when a reference was stored by an older capture that rewrote every
 * slot id to data-slot-id="RANDOMIZED" (erasing quote style). Such a
 * reference cannot speak to quote style, so it is compared under
 * normalizeSlotIds; a reference stored as Ruby wrote it holds raw ids and
 * is compared under maskSlotIdValues.
 */
export function referenceErasedSlotQuotes(expected: string): boolean {
  return expected.includes(RANDOMIZED_SLOT_ATTRIBUTE) || expected.includes(ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE);
}

/**
 * The Cloudflare challenge-platform injection. The live pages carry a
 * per-response <script> block immediately before </body> whose
 * __CF$cv$params r/t tokens are rotated per response by the edge
 * (live-check-71: present on 33 of the graded page captures; the probe-base
 * census found the block on every page-surface expectation and no view-surface
 * expectation). The engine can never emit it: it is not a function of the
 * card, the deck, or the deployment - it is Cloudflare's per-request
 * challenge bootstrap. Like the accordion group hash (9f023ce), this is
 * per-response capture noise, not engine output spec: the mask removes the
 * block from BOTH sides at the compare seam.
 *
 * The match is anchored on a <script> element whose body mentions
 * __CF$cv$params before its closing tag (tempered dot - the match cannot
 * span another script element, and the challenge block itself contains no
 * literal </script>, measured 938 bytes uniform across the carriers).
 */
const CF_CHALLENGE_BLOCK_PATTERN =
  /<script>(?:(?!<\/script>)[\s\S])*__CF\$cv\$params(?:(?!<\/script>)[\s\S])*<\/script>/g;

/**
 * Remove every Cloudflare challenge bootstrap script block. Applied to both
 * sides by normalizeForReplay; a pure deletion cannot manufacture agreement
 * on any byte outside the matched blocks.
 */
export function normalizeCloudflareChallengeBlocks(html: string): string {
  return html.replace(CF_CHALLENGE_BLOCK_PATTERN, "");
}

/**
 * The Cardio::Mod object-address rule: the third replay-legitimate
 * per-process value, alongside the slot id and the accordion group hash.
 *
 *   #<Cardio::Mod:0xADDR>  ->  #<Cardio::Mod:ADDRESS>
 *
 * WHY. card-1.110.0 mod/core/set/self/mod.rb:4-6 interpolates the mod OBJECT
 * into a string ("#{mod}_mod") and Cardio::Mod defines no #to_s
 * (lib/cardio/mod.rb; the only "def to_s" under lib/cardio/ is
 * module_template.rb:23, a different class), so Ruby falls through to
 * Object#to_s and prints the object's heap address. The address is a property
 * of the CAPTURE PROCESS, not of the card: it is not comparable across
 * languages and not across Ruby runs. The corpus holds 34 of them (card id
 * 45410, view-surface and page-surface recapture-raw-shard-000039.jsonl), all 16
 * hex digits, all distinct. So the port renders the same TEMPLATE with its
 * own genuine per-process opaque id and the VALUE is canonicalized here, on
 * BOTH sides, exactly as the slot id and the group hash are.
 *
 * SCOPE - the anchoring is the whole safety argument. Measured over the
 * whole expected-v2 tree (96 .jsonl files): the literal "#<Cardio::Mod:0x"
 * occurs 68 times in exactly 2 files, one entry each; "#<[A-Za-z_:]+"
 * corpus-wide returns "#<Cardio::Mod:" and nothing else; and
 * "0x[0-9a-f]{4,}" returns those same 68 addresses. There is no second
 * class-shaped construct and no bare hex literal anywhere else for this rule
 * to touch, so it cannot mask a diff in any other entry. The pattern also
 * requires a well-formed hex id (same deliberate strictness as
 * SLOT_ID_PATTERN above): a malformed address must SURFACE as a diff, not
 * hide behind the mask.
 */
const MOD_OBJECT_ADDRESS_PATTERN = /#<Cardio::Mod:0x[0-9a-f]{16}>/g;

/** The placeholder the address carries once canonicalized. Not hex, so the
 *  normalized text is never re-matched - the rule is idempotent. */
export const NORMALIZED_MOD_OBJECT_ADDRESS = "ADDRESS";

/** Canonicalize Cardio::Mod object addresses. Rewrites ONLY the hex span
 *  inside the template; the class name, the 0x prefix, the closing ">" and
 *  every other byte survive, so a port that dropped the address or malformed
 *  it still fails the diff. */
export function normalizeModObjectAddresses(html: string): string {
  return html.replace(
    MOD_OBJECT_ADDRESS_PATTERN,
    `#<Cardio::Mod:${NORMALIZED_MOD_OBJECT_ADDRESS}>`,
  );
}

/**
 * Every normalization the replay comparison applies, in the order the capture
 * scripts apply them. This is the seam src/testing/replay.ts judges every
 * canvas entry through, so it is the one place a replay-legitimate mask has to
 * live; `normalizeSlotIds` alone stays exactly the recording-layer rule its
 * documented contract claims, and its direct callers are unaffected.
 */
export function normalizeForReplay(html: string, keepSlotQuotes = false): string {
  const slots = keepSlotQuotes ? maskSlotIdValues(html) : normalizeSlotIds(html);
  return normalizeCloudflareChallengeBlocks(normalizeModObjectAddresses(normalizeAccordionGroupIds(slots)));
}

export interface FirstDifference {
  /** Index of the first differing UTF-16 code unit. */
  codeUnitOffset: number;
  /** UTF-8 byte offset of the same position in the expected string. */
  byteOffset: number;
  /** JSON-escaped differing character from each side; "" when that side is exhausted. */
  expectedChar: string;
  actualChar: string;
  /** Window around the divergence from each side, ellipsis-marked. */
  expectedExcerpt: string;
  actualExcerpt: string;
}

export interface ByteDiffResult {
  equal: boolean;
  expectedCodeUnits: number;
  actualCodeUnits: number;
  expectedBytes: number;
  actualBytes: number;
  firstDifference: FirstDifference | null;
}

const CONTEXT_RADIUS = 48;

function excerptOf(text: string, center: number, radius: number): string {
  const start = Math.max(0, center - radius);
  const end = Math.min(text.length, center + radius);
  const body = text.slice(start, end);
  const head = start > 0 ? "..." : "";
  const tail = end < text.length ? "..." : "";
  return `${head}${body}${tail}`;
}

/**
 * Exact byte-level diff of two strings (both are UTF-8 encoded for byte
 * accounting; comparison itself is code-unit exact). On mismatch, reports
 * the first differing position with a surrounding excerpt from each side.
 * No tolerance, no whitespace folding - fixture bytes are the spec.
 */
export function byteDiff(
  expected: string,
  actual: string,
  contextRadius: number = CONTEXT_RADIUS
): ByteDiffResult {
  const minLength = Math.min(expected.length, actual.length);
  let offset = 0;
  while (offset < minLength && expected.charCodeAt(offset) === actual.charCodeAt(offset)) {
    offset += 1;
  }

  if (offset === expected.length && offset === actual.length) {
    return {
      equal: true,
      expectedCodeUnits: expected.length,
      actualCodeUnits: actual.length,
      expectedBytes: Buffer.byteLength(expected, "utf8"),
      actualBytes: Buffer.byteLength(actual, "utf8"),
      firstDifference: null,
    };
  }

  return {
    equal: false,
    expectedCodeUnits: expected.length,
    actualCodeUnits: actual.length,
    expectedBytes: Buffer.byteLength(expected, "utf8"),
    actualBytes: Buffer.byteLength(actual, "utf8"),
    firstDifference: {
      codeUnitOffset: offset,
      byteOffset: Buffer.byteLength(expected.slice(0, offset), "utf8"),
      expectedChar: offset < expected.length ? JSON.stringify(expected[offset]) : '""',
      actualChar: offset < actual.length ? JSON.stringify(actual[offset]) : '""',
      expectedExcerpt: excerptOf(expected, offset, contextRadius),
      actualExcerpt: excerptOf(actual, offset, contextRadius),
    },
  };
}

/**
 * The replay-side comparison: apply every replay-legitimate normalization to
 * BOTH sides (data-slot-id placeholders, accordion group hashes, and
 * Cardio::Mod object addresses), then diff
 * exact bytes. src/testing/replay.ts judges every canvas entry through this
 * function, so this is where a normalization that mirrors the recording layer
 * has to land for the canvas to see it. Slot-id quote style is compared
 * whenever the reference kept it (referenceErasedSlotQuotes).
 */
export function compareNormalized(
  expected: string,
  actual: string,
  contextRadius: number = CONTEXT_RADIUS
): ByteDiffResult {
  const keepSlotQuotes = !referenceErasedSlotQuotes(expected);
  return byteDiff(
    normalizeForReplay(expected, keepSlotQuotes),
    normalizeForReplay(actual, keepSlotQuotes),
    contextRadius,
  );
}
