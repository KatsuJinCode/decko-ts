// Byte-diff comparator for oracle replay, plus the slot-id normalization
// rule that mirrors the Ruby recording layer (tools/oracle/capture.rb).
//
// Diff semantics: exact bytes, except data-slot-id values. The Ruby capture
// replaces every rendered slot's random DOM id with the literal placeholder
// data-slot-id="RANDOMIZED" before writing the fixture; the replay side
// applies the same canonicalization to BOTH sides so a TS render that
// stamps a fresh random slot id still byte-matches the fixture, while the
// PRESENCE of the attribute (and every other byte) stays part of the spec.

/**
 * The recording-layer placeholder. Every normalized slot carries exactly
 * this attribute value in the fixture bytes.
 */
export const RANDOMIZED_SLOT_ATTRIBUTE = 'data-slot-id="RANDOMIZED"';

/**
 * The normalization rule, mirrored from docs/oracle-harness.md:
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
 * Canonicalize slot ids the way the recording layer does. Idempotent: the
 * placeholder itself ("RANDOMIZED" is not hex) is never re-matched.
 * Attribute presence is preserved - this only rewrites the value.
 */
export function normalizeSlotIds(html: string): string {
  return html.replace(SLOT_ID_PATTERN, RANDOMIZED_SLOT_ATTRIBUTE);
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
 * The replay-side comparison: normalize slot ids on BOTH sides exactly as
 * the recording layer did, then diff. Everything else is exact bytes.
 */
export function compareNormalized(
  expected: string,
  actual: string,
  contextRadius: number = CONTEXT_RADIUS
): ByteDiffResult {
  return byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual), contextRadius);
}
