// Type declarations for verify-staged-corpus-provenance.mjs (the staging-time
// provenance guard for staged capture corpora). The .mjs is the
// implementation; this file exists so tsc (NodeNext) can type imports from
// tests and seeding code.

export interface StagedCorpusVerdict {
  /** false = a provenance refusal (the caller must refuse, family exit 4). */
  ok: boolean;
  refusals: string[];
  /** non-refusal observations: "absent" / "unbound" notes. */
  notes: string[];
  /** Full sha256 the photograph manifest binds, when a manifest was readable. */
  expectedSha256: string | null;
  /** Full sha256 of the corpus actually on disk, when it exists. */
  actualSha256: string | null;
  /** The parsed capture manifest, when it parsed. */
  manifest: Record<string, unknown> | null;
  corpusFile: string;
  manifestPath: string;
}

export interface StagedCorporaReport {
  ok: boolean;
  /** Family convention: 0 verified, 4 provenance refusal. */
  exitCode: 0 | 4;
  results: Array<{ repo: string } & StagedCorpusVerdict>;
}

export function stagedCorpusPath(repoDir: string): string;
export function stagedCorpusManifestPath(repoDir: string): string;

export function verifyStagedCorpus(opts: {
  corpusFile: string;
  manifestPath: string;
  /** Pass a precomputed hash to skip re-hashing (~207 MB). */
  liveCorpusSha256?: string | null;
}): StagedCorpusVerdict;

/** NOTE: deliberately no liveCorpusSha256 passthrough -- each repo must hash
 *  its own corpus; one preset hash would be wrong for all but the first. */
export function verifyStagedCorpora(opts: {
  repos: string[];
  /** Check every repo's corpus against this photograph dir's manifest. */
  photographDir?: string | null;
}): StagedCorporaReport;
