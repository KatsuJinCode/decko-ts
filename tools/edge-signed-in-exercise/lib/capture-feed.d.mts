// The declaration for capture-feed.mjs, so the TypeScript tests that import
// the module carry types instead of an implicit any. The shapes below are the
// module's own: the result rows the feed yields and the recorded facts it
// flattens.

/** One result row the feed yields for the grader to read. */
export interface FeedResult {
  check: string | null;
  pass: boolean;
  evidence: {
    instrument: string;
    receipt: string;
    sourceCommit: string | null;
    sourceDirty: boolean | null;
    distSha256: string | null;
    fixtureSha256: string | null;
    legs: Array<{ leg: string | null; ok: boolean }>;
    redLegs: string[];
    failures: number;
    allLegsGreen: boolean;
    facts: Record<string, boolean | null>;
    missingRubyFacts: string[];
    rubyScenario: Record<string, string>;
  };
}

/** The committed receipt the feed reads, relative to the repository root. */
export const RECEIPT_RELATIVE_PATH: string;

/** The Ruby scenario each recorded fact answers, by name. */
export const RUBY_SCENARIO: Record<string, string>;

export function captureFeedResults(repoRoot: string): FeedResult[];

export function gradedLegs(receipt: unknown): Array<Record<string, unknown>>;

export function recordedFacts(receipt: unknown): Record<string, boolean | null>;

export function missingRubyFacts(receipt: unknown): string[];

export function resultsFromProbeReceipt(receipt: unknown): FeedResult[];
