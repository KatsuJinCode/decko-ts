// Byte-diff comparator for replay, plus the normalization rules that make a
// replay comparison meaningful. Each rule masks a value that is an artifact
// of the PROCESS that produced the reference, not output the engine controls:
//
// 1. data-slot-id. Every rendered slot carries a fresh random DOM id, so the
//    reference has it replaced with the literal placeholder
//    data-slot-id="RANDOMIZED"; the replay side applies the same
//    canonicalization to BOTH sides so a render that stamps a fresh random
//    slot id still byte-matches, while the PRESENCE of the attribute (and
//    every other byte) stays part of the spec.
// 2. the accordion group hash. The collapse id embeds a per-process string
//    hash, so no deterministic engine can reproduce the recorded value. See
//    ACCORDION_GROUP_HASH_PATTERN.
// 3. the Cardio::Mod object address. A mod object with no #to_s is
//    interpolated into a string by printing its heap address — a property of
//    the process, not of the card. Same class of value as 1 and 2. See
//    MOD_OBJECT_ADDRESS_PATTERN.
// 4. the edge challenge-platform injection: a per-response script block the
//    engine can never emit. See CF_CHALLENGE_BLOCK_PATTERN.
//
// Diff semantics: exact bytes, except those values.

/**
 * The recording-layer placeholder. Every normalized slot carries exactly
 * this attribute value in the fixture bytes.
 */
export const RANDOMIZED_SLOT_ATTRIBUTE = 'data-slot-id="RANDOMIZED"';

/**
 * The normalization rule:
 *
 *   data-slot-id=<quote><20 lowercase hex><quote>  ->  data-slot-id="RANDOMIZED"
 *
 * Quote style is erased (both styles occur in the recorded output). The id
 * is exactly 20 lowercase hex because that is what SecureRandom.hex(10)
 * produces; the strict length is deliberate — an engine emitting a
 * different-length id is a real divergence and must survive normalization so
 * the byte diff surfaces it. This rule is deliberately stricter than the
 * recorder's own looser \h+ for exactly that reason.
 */
const SLOT_ID_PATTERN = /data-slot-id=(['"])([0-9a-f]{20})\1/g;

/**
 * The same slot id one level of attribute escaping down. A slot rendered
 *  INSIDE an attribute value (a link title carrying a nest: the Item+short
 *  structure's `[[_left|{{_left+image}}]]`, whose title is escaped only for
 *  quotes) keeps its random id behind `&quot;`, which the unescaped regex
 *  never saw. Same per-process value and the same strict 20-hex shape,
 *  normalized to the escaped placeholder on both sides.
 */
const ESCAPED_SLOT_ID_PATTERN = /data-slot-id=&quot;([0-9a-f]{20})&quot;/g;
const ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE = "data-slot-id=&quot;RANDOMIZED&quot;";

/**
 * The accordion group-hash rule:
 *
 *   card-<safe_key>-<signed decimal>-collapse-id -> card-<safe_key>-HASH-collapse-id
 *
 * WHY THIS IS NOT DERIVABLE. The token is a per-process string hash of the
 * accordion group title, embedded by accordion_item's collapse id
 * (`card-#{card.name.safe_key}-#{args[:context]}-collapse-id`). The hash seed
 * is randomized PER PROCESS, so the value is an artifact of the process that
 * produced the reference and not a function of the card: three consecutive
 * processes hashing the same title returned three different values. The
 * engine's stand-in (src/card/mod-loader/mods/core-mod.ts stringHash, a
 * 31-accumulator truncated to int32) is stable — repeated renders of the same
 * card in one process agree — so it is NOT a warm-state artifact; it simply
 * cannot reproduce a per-process seeded hash. No algorithm on the TypeScript
 * side can match it, and any small delta band between two runs is nothing but
 * the digit-count difference between two random tokens. The sign is part of
 * the value on BOTH sides, hence `-?[0-9]+`.
 *
 * SCOPE. `card-` prefix and `-collapse-id` suffix are both required, and the
 * middle segment must be decimal, so the word-shaped group names the engine
 * emits for non-hashed accordions survive untouched: `card-mod_format-files-
 * collapse-id` (core-mod.ts:1145), `-depends_on-collapse-id` (core-mod.ts:1152),
 * `card-<key>-closed-collapse-id` (views.ts:3796), and the rule-board groups
 * `templating` / `editing` / `event` (card-mod-edit.ts:2831).
 *
 * Without this rule every affected replay entry fails forever: the
 * references hold raw hashes and nothing downstream can produce them again.
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
 * Mask slot-id VALUES only, keeping the quote style the output was written
 * with: the reference harness's N1 (reference-harness/runner/normalize.mjs).
 * This is the rule for a reference stored as written — a Haml bar's slot id
 * is single-quoted and a content_tag wrap's double-quoted, so quote style is
 * part of the output and must be compared.
 */
export function maskSlotIdValues(html: string): string {
  return html
    .replace(SLOT_ID_PATTERN, (_m, q: string) => `data-slot-id=${q}RANDOMIZED${q}`)
    .replace(ESCAPED_SLOT_ID_PATTERN, ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE);
}

/**
 * True when a reference was stored by a recorder that rewrote every slot id
 * to data-slot-id="RANDOMIZED" (erasing quote style). Such a reference
 * cannot speak to quote style, so it is compared under normalizeSlotIds; a
 * reference stored as written holds raw ids and is compared under
 * maskSlotIdValues.
 */
export function referenceErasedSlotQuotes(expected: string): boolean {
  return expected.includes(RANDOMIZED_SLOT_ATTRIBUTE) || expected.includes(ESCAPED_RANDOMIZED_SLOT_ATTRIBUTE);
}

/**
 * The Cloudflare challenge-platform injection. Served pages carry a
 * per-response <script> block immediately before </body> whose
 * __CF$cv$params r/t tokens are rotated per response by the edge. The engine
 * can never emit it: it is not a function of the card, the deck, or the
 * deployment — it is the edge's per-request challenge bootstrap. Like the
 * accordion group hash, this is per-response noise, not engine output spec:
 * the mask removes the block from BOTH sides at the compare seam.
 *
 * The match is anchored on a <script> element whose body mentions
 * __CF$cv$params before its closing tag (tempered dot — the match cannot
 * span another script element, and the challenge block itself contains no
 * literal </script>).
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
 * WHY. A mod OBJECT is interpolated into a string ("#{mod}_mod") and
 * Cardio::Mod defines no #to_s, so Ruby falls through to Object#to_s and
 * prints the object's heap address. The address is a property of the
 * PROCESS, not of the card: it is not comparable across languages and not
 * across runs. So the engine renders the same TEMPLATE with its own genuine
 * per-process opaque id and the VALUE is canonicalized here, on BOTH sides,
 * exactly as the slot id and the group hash are.
 *
 * SCOPE - the anchoring is the whole safety argument. Surveyed over the whole
 * expected-output tree: the literal "#<Cardio::Mod:0x" occurs only where this
 * rule expects it; "#<[A-Za-z_:]+" returns "#<Cardio::Mod:" and nothing else;
 * and "0x[0-9a-f]{4,}" returns those same addresses. There is no second
 * class-shaped construct and no bare hex literal anywhere else for this rule
 * to touch, so it cannot mask a diff in any other entry. The pattern also
 * requires a well-formed 16-digit hex id (same deliberate strictness as
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
 * Every normalization the replay comparison applies, in the order the
 * recorders apply them. This is the seam src/testing/replay.ts judges every
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
