// Type declarations for the capture-feed reader
// (tools/edge-signed-in-exercise/lib/capture-feed.mjs).
//
// The module is plain ESM JavaScript. This sibling declaration types the
// imports that reach it (the parity pins under tests/card/mod-loader/), so
// the repository's `tsc -p tsconfig.json` build stays green; an implicit any
// there makes the build exit non-zero, which stops the staging-server dist
// bootstrap and every endpoint suite that boots the server.
//
// The receipt shapes below are the committed probe receipt's own shape, and
// they are deliberately loose where the receipt carries free-form evidence:
// the reader never invents a field, and the pins assert on what the receipt
// carries.

export interface ProbeReceipt {
  checkName?: string;
  failures?: number;
  legs?: Array<Record<string, unknown>>;
  facts?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FeedResult {
  check: string;
  pass: boolean;
  evidence: Record<string, unknown>;
}

/** The committed probe receipt's path, relative to the repository root. */
export const RECEIPT_RELATIVE_PATH: string;

export const RUBY_SCENARIO: Record<string, unknown>;

/** The feed's results for the repository, read from the committed receipt. */
export function captureFeedResults(repoRoot: string): FeedResult[];

export function gradedLegs(receipt: ProbeReceipt): Array<Record<string, unknown>>;

export function recordedFacts(receipt: ProbeReceipt): Array<Record<string, unknown>>;

export function missingRubyFacts(receipt: ProbeReceipt): Array<Record<string, unknown>>;

/** One result per graded leg; a red leg yields a result that does not pass. */
export function resultsFromProbeReceipt(receipt: ProbeReceipt): FeedResult[];
