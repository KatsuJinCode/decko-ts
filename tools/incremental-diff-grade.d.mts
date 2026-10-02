// Type declarations for incremental-diff-grade.mjs (the delta grader against
// a recorded per-shard baseline; companion to capture-and-grade.mjs). The
// .mjs is the implementation; this file exists so tsc (NodeNext) can type
// imports from tests and tooling. Same convention as
// verify-staged-corpus-provenance.d.mts.

export const BASELINE_SCHEMA: string;
export const SHARD_INPUT_SCHEMA: string;
export const SHARD_RE: RegExp;
export const FULL_RUN_FLOORS: { view: number; page: number; captureErrors: number };
export const FLOOR_LANES: string[];
export const DEFAULT_SPEC: string;
export const DEFAULT_BASELINE_ROOT_SEGMENT: string;

/** Which child grades a shard (--runner). See the .mjs header. */
export const RUNNER_VITEST: string;
export const RUNNER_DIRECT: string;
export const DIRECT_RUNNER_REL: string;
export const DIRECT_RUNNER_DEPS_REL: string[];

export function engineCorpusPath(repo: string): string;
export function manifestGateCorpusPath(repo: string): string;
export function expectedV2Dir(repo: string): string;
export function laneDir(repo: string, lane: "view" | "page"): string;
export function manifestPath(repo: string): string;
export function enumerationOutFile(repo: string): string;

export interface ShardLaneFacts {
  present: boolean;
  lines: number;
  entries: number;
  malformed: number;
  captureErrorLines: number;
}

/** Count a shard's facts by the SAME rules the verify spec flattens entries
 *  (verify-dual-lane.test.ts) and the full grader counts capture errors. */
export function measureShardFile(file: string, lane: "view" | "page"): ShardLaneFacts;
export function measureShard(
  repo: string,
  name: string,
): { view: ShardLaneFacts; page: ShardLaneFacts };
export function discoverShards(repo: string): string[];

/** {hash, files: {relPath: sha256}} over the working-tree bytes (src/** plus
 *  tests/** -- the engine-composing helpers the verify spec imports -- plus
 *  the spec/seeding/build-seam files). */
export function hashSourceTree(repo: string): {
  hash: string;
  files: Record<string, string>;
};

export function resolveFloors(
  floorsArg: string | null,
  defaults?: { view?: number; page?: number; captureErrors?: number } | null,
): { view: number; page: number; captureErrors: number };

/** sha256 over the shard's Bazel INPUT TUPLE: per-lane shard bytes (entry
 *  list + input content + frozen-capture bytes), the source-tree hash
 *  (engine version + dependency closure), the engine-input corpus hash, the
 *  grading-spec path (verifier config), and -- only when the verdict came from
 *  the direct grade runner -- the direct protocol's own source hash
 *  (protocolSha256). Omitting the member (null) reproduces the pre-direct
 *  tuple byte for byte; supplying it makes a direct baseline structurally
 *  unreusable by a vitest run and moves the hash when the core changes. */
export function shardInputHash(args: {
  viewSha: string | null;
  pageSha: string | null;
  sourceTreeHash: string | null;
  engineCorpusSha256: string | null;
  specRelPath: string;
  protocolSha256?: string | null;
}): string;

/** sha256 over the direct protocol's own source (runner entry + core +
 *  transform loader), keyed by repo-relative path. Null when a file is
 *  missing; never called under --runner vitest. */
export function directProtocolSha256(repo: string): string | null;

/** The child's spawn shape for one shard render, as data. vitest: the
 *  historical shell `npx vitest run <spec>`. direct: this node binary running
 *  the direct grade runner with no shell. Pure -- spawn nothing. */
export function renderCommand(args: {
  repo: string;
  shard: string;
  spec: string;
  runner: string;
}): { shell: boolean; file: string; args: string[]; describe: string };

export interface PlanEntry {
  shard: string;
  action: "render" | "reuse";
  reason:
    | "requested"
    | "forced"
    | "not-in-baseline"
    | "source-tree-changed"
    | "no-input-hash-in-baseline"
    | "view-bytes-moved"
    | "page-bytes-moved"
    | "input-hash-moved"
    | "last-verdict-failed"
    | "inputs-unchanged";
  inputHash: string;
  entries: number;
  view: ShardLaneFacts;
  page: ShardLaneFacts;
}

export function planDelta(args: {
  baseline: Record<string, unknown> | null;
  repo: string;
  sourceHash: string | null;
  forceShards: string[] | null;
  onlyShards: string[] | null;
  engineCorpusSha256: string | null;
  specRelPath: string;
  protocolSha256?: string | null;
}): {
  plan: PlanEntry[];
  renderCount: number;
  reuseCount: number;
  entriesToRender: number;
  entriesReused: number;
};

export interface FailRecord {
  id: string;
  shard: string;
  lane: "view" | "page";
  sig: string;
}

/** Fresh results replace the baseline's fail records per rendered shard.
 *  Fails on unrendered shards persist: neither new nor fixed. */
export function diffFailSets(
  baselineShards: Record<string, unknown> | null | undefined,
  freshByShard: Record<string, unknown>,
): { newFails: FailRecord[]; fixedFails: FailRecord[] };

export function totalsLine(lane: string, totals: { pass: number; fail: number; entries: number }): string;
export function floorsLine(
  totals: Record<string, { pass: number }>,
  floors: { view: number; page: number },
): string;

export function emitVerdict(args: {
  totals: Record<"view" | "page", { pass: number; fail: number; entries: number }>;
  floors: { view: number; page: number; captureErrors: number };
  captureErrors: { view: number; page: number; total: number };
  newFails: FailRecord[];
  fixedFails: FailRecord[];
  renderFailures: number;
  coverageCaveat: string | null;
  runMeta: string;
}): {
  verdict: "PASS" | "FAIL";
  exitCode: 0 | 1;
  lines: string[];
  oneLine: string;
};

/** Refusal check over precomputed inputs; refusals non-empty = exit 4. */
export function checkProvenance(args: {
  manifestCheck: { ok: boolean; refusals: string[]; manifest?: Record<string, unknown> | null };
  baseline: Record<string, unknown> | null;
  liveCorpusSha256: string;
  liveEngineCorpusSha256: string;
}): { ok: boolean; refusals: string[] };

export function buildBaselineObject(args: {
  baselineId: string;
  repo: string;
  runMeta: Record<string, unknown>;
}): { baseline?: Record<string, unknown>; corpusSha256?: string; refusal?: { ok: false; refusals: string[] } };

export function baselineRootFor(repo: string, override: string | null, corpusSha8: string): string;
