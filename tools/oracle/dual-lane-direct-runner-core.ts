// dual-lane-direct-runner-core.ts -- direct grade runner. The grading protocol,
// ported from the
// measuring instrument tools/oracle/verify-dual-lane.test.ts, with the vitest
// shell replaced by a plain main().
//
// WHAT THIS IS, AND WHY IT EXISTS
//   The whole-site grade boots one `npx vitest run` child PER PHASE (24
//   phases for the 48-shard set) and the driver runs 2 of them at a time, so
//   the 137.6 worker-minutes of render compute the pass-19 log records become
//   69.1 minutes of wall clock on a 28-core machine. Two of the costs are
//   structural rather than fundamental:
//
//     - a test-framework boot per phase, and
//     - a per-phase choice of shard GROUP, so no single child can ever take
//       more than `--group` shards even when 30 cores sit idle.
//
//   This runner takes a LIST of shards of any size, boots the engine graph
//   once, grades the whole list on that one boot, and exits. The driver
//   (dual-lane-direct-driver.mjs) hands each worker a weighted shard queue.
//
// BYTE-IDENTICAL PROTOCOL -- THE CONTRACT
//   Everything that decides a verdict is imported from the SAME modules the
//   spec imports, and nothing here reimplements a comparison:
//
//     - src/testing/replay.ts  -- replayEntries, HandlerRegistry, jsonValue,
//       renderBytes, raisedError, formatReplayFailure. This is the judge: it
//       owns the byte compare and the failure text.
//     - src/card/rules/structure.ts -- the structure rule universe.
//     - tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts --
//       createRawStructureSeededStorage and RAW_CORPUS_DB, the per-worktree
//       staging copy (the same one the spec's `./raw-corpus-seeding.js`
//       resolves to).
//
//   The load/parse/summarize/aggregate-shape code below is a transcription of
//   the spec's, function for function, and the proof is the parity gate, not
//   this comment: dual-lane-direct-parity.test.mjs runs both paths over the
//   same shard and compares the aggregate JSON byte for byte. The ONLY
//   behavioural differences, all deliberate and all visible in the spec's own
//   text:
//
//     1. The vitest `describe`/`it` wrapper is gone; the body is main().
//     2. The four `expect(...)` gate assertions (spec:640-643) become thrown
//        errors with the same conditions, because `expect` is a vitest import
//        and dropping vitest is the point of the exercise. The gate's
//        CONDITIONS are transcribed unchanged, including the report-only
//        bypass at spec:632.
//     3. REPO_ROOT is resolved from an explicit argument instead of from this
//        file's own three-levels-deep location, because this file lives in
//        tools/oracle/ and the paths it must read are the per-worktree
//        gitignored instrument tree's.
//
//   The stdout lines are the spec's lines, verbatim, including the
//   `VIEW-LANE aggregate:` / `PAGE-LANE aggregate:` labels the existing
//   driver's brace-matched scraper (tools/dual-lane-verifier-fast.mjs:436,
//   :462) reads. A direct-runner child is therefore a drop-in for the old
//   stdout contract as well as for the artifact contract.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import {
  HandlerRegistry,
  jsonValue,
  renderBytes,
  raisedError,
  replayEntries,
  formatReplayFailure,
  type ReplayEntry,
} from "../../src/testing/replay.js";
import { UnsupportedViewError } from "../../src/card/render.js";
import type { CapturedCardRecord, CardRecordWithoutId } from "../../src/testing/fixture-schema.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structuredCardContent,
} from "../../src/card/rules/structure.js";
import {
  CAPTURE_WALL_CLOCK_CAPTURE_INSTANT,
  resolveSetModuleContent,
  setCaptureWallClock,
} from "../../src/card/set-module-content-overrides.js";
import { setRaiseAllRenderingErrors } from "../../src/card/render/format.js";

// The capture-deck wall clock: the
// corpus's graded card.content answers include wall-clock surfaces
// (Self::Now — set/self/now.rb:1-3) whose captured bytes are a frozen sample
// of a time-varying answer. The capture ran at one specific wall-clock
// instant (the *now record bytes carry the rendered instant);
// grading against those bytes requires the SAME instant, so the runner pins
// the card wall clock to the capture minute — the capture-environment model
// (deck_origin precedent). Affects ONLY the card-content override path
// (set-module-content-overrides.ts's clock seam), never Date.now() timing.
//
// CAPTURE_FROZEN_CLOCK names the instant the graded corpus was photographed
// under (an ISO-8601 instant with an explicit zone, e.g. the rig's frozen
// epoch "2026-09-19T12:00:00Z", recorded in its provenance as
// invocation.frozenClock). The default is the older corpus's capture minute,
// which is right only for that older corpus.
export function captureClockFromEnv(raw: string | undefined): Date {
  if (raw === undefined || raw === "") return CAPTURE_WALL_CLOCK_CAPTURE_INSTANT;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw new Error(`CAPTURE_FROZEN_CLOCK must be an ISO-8601 instant with a zone, got ${JSON.stringify(raw)}`);
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) throw new Error(`CAPTURE_FROZEN_CLOCK is not a valid instant: ${raw}`);
  return instant;
}
const GRADE_CAPTURE_CLOCK = captureClockFromEnv(process.env.CAPTURE_FROZEN_CLOCK);
setCaptureWallClock(GRADE_CAPTURE_CLOCK);
if (process.env.CAPTURE_FROZEN_CLOCK) {
  process.stderr.write(`CAPTURE-CLOCK ${GRADE_CAPTURE_CLOCK.toISOString()} (CAPTURE_FROZEN_CLOCK)\n`);
}

// GRADE_VIEWER selects the actor the engine renders for, for the permissioned
// grade: "anonymous" (the engine's default viewer, stated explicitly) or
// "signed-in:<account card id>" (read verdicts and page chrome for that
// account, as Ruby's Auth.signin gives both). Unset leaves the engine as it
// boots. When set, every render must leave the engine's resolved read state
// with alwaysOk === false (the actor is neither Decko Bot nor an
// Administrator), or the run fails, unless GRADE_VIEWER_ALLOW_ALWAYS_OK=1
// says the administrator grade is intended; the first resolved state is
// printed.
interface GradeViewer { readonly signedIn: boolean; readonly actorId?: number }
interface GradeViewerEngine {
  viewer: GradeViewer;
  pageSession: GradeViewer | undefined;
  readPermission?: { alwaysOk: boolean; parties: number[]; readableRuleIds: Set<number> };
  /** The engine's fresh-process boundary (RenderEngine.resetRequestSession):
   *  clears the prepared session chrome and the ensure_roles fill state. */
  resetRequestSession?(): void;
}
export function gradeViewerFromEnv(raw: string | undefined): GradeViewer | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw === "anonymous") return { signedIn: false };
  const m = /^signed-in:(\d+)$/.exec(raw);
  if (m === null) throw new Error(`GRADE_VIEWER must be "anonymous" or "signed-in:<id>", got ${JSON.stringify(raw)}`);
  return { signedIn: true, actorId: Number(m[1]) };
}
let gradeViewerStatePrinted = false;
function assertGradeViewerState(engine: GradeViewerEngine, viewer: GradeViewer | undefined): void {
  if (viewer === undefined) return;
  const state = engine.readPermission;
  if (state === undefined) return; // resolved lazily; checked on the next render
  // GRADE_VIEWER_ALLOW_ALWAYS_OK=1 grades an administrator on purpose (the
  // capture side signs in the same always-ok actor).
  if (state.alwaysOk && process.env.GRADE_VIEWER_ALLOW_ALWAYS_OK !== "1") {
    throw new Error("GRADE_VIEWER resolved to an always-ok actor; refusing to grade");
  }
  if (!gradeViewerStatePrinted) {
    gradeViewerStatePrinted = true;
    const line =
      `GRADE-VIEWER-STATE viewer=${JSON.stringify(viewer)} alwaysOk=${state.alwaysOk} ` +
      `parties=${JSON.stringify(state.parties)} readableRuleIds=${state.readableRuleIds.size}`;
    console.log(line);
    // The driver relays only progress lines, so the state also goes to a file.
    if (process.env.GRADE_VIEWER_LOG) appendFileSync(process.env.GRADE_VIEWER_LOG, line + "\n");
  }
}

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;
/** Bucket for a result whose entry had no recorded shard. The entry arrays
 *  and the result array are both built in this file and pushed in lockstep, so
 *  this should never fire; it is here so a future divergence shows up as a
 *  named bucket in the report rather than as a silently wrong attribution. */
const UNATTRIBUTED_SHARD = "(unattributed)";
/** Production resolves Cardio.config.default_html_view = :content. Fallback main
 *  view for page-lane capture-error lines, where the oracle never resolved a main
 *  nest view. */
const PRODUCTION_DEFAULT_MAIN_VIEW = "content";

const REPORT_ONLY =
  process.env.DUAL_LANE_REPORT_ONLY !== undefined &&
  process.env.DUAL_LANE_REPORT_ONLY !== "0" &&
  process.env.DUAL_LANE_REPORT_ONLY !== "";

interface ViewLaneLine {
  id: number;
  lane: "view";
  name: string;
  record?: CapturedCardRecord;
  views?: Record<string, string>;
  error?: unknown;
}

interface PageLaneLine {
  id: number;
  lane: "page";
  name: string;
  layout?: string | null;
  layout_rule?: string | null;
  layout_main_view?: { raw: string | null; effective: string } | null;
  format_main?: boolean;
  page_html?: string;
  record?: CapturedCardRecord;
  error?: unknown;
}

interface ShardFile {
  name: string;
  viewPath: string | undefined;
  pagePath: string | undefined;
}

interface ShardCoverage {
  shard: string;
  view: { file: boolean; lines: number; malformed: number; laneMismatches: number; entries: number };
  page: { file: boolean; lines: number; malformed: number; laneMismatches: number; entries: number };
  missing: string;
}

function shardPaths(dir: string, name: string): string | undefined {
  const p = path.join(dir, name);
  return existsSync(p) ? p : undefined;
}

/** Shard-name selection. Identical to the spec's
 *  requestedDualLaneShards(): the explicit DUAL_LANE_FILES list must resolve
 *  in at least ONE lane (typo guard); the auto-discovered union of both
 *  lanes' shard files may be a partial tree -- missing files skip per lane. */
function requestedDualLaneShards(
  viewLaneDir: string,
  pageLaneDir: string,
): ShardFile[] {
  const list = process.env.DUAL_LANE_FILES;
  if (list) {
    const names = list.split(",").map((s) => s.trim()).filter((s) => s !== "");
    const shards = names.map((name) => ({
      name,
      viewPath: shardPaths(viewLaneDir, name),
      pagePath: shardPaths(pageLaneDir, name),
    }));
    for (const s of shards) {
      if (s.viewPath === undefined && s.pagePath === undefined) {
        throw new Error(`DUAL_LANE_FILES entry not found in either lane: ${s.name}`);
      }
    }
    return shards;
  }
  const names = new Set<string>();
  for (const dir of [viewLaneDir, pageLaneDir]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (SHARD_RE.test(f)) names.add(f);
    }
  }
  return [...names].sort().map((name) => ({
    name,
    viewPath: shardPaths(viewLaneDir, name),
    pagePath: shardPaths(pageLaneDir, name),
  }));
}

interface LoadedLane<T> {
  lines: T[];
  malformed: number;
  laneMismatches: number;
}

function loadLane<T extends { lane: string }>(p: string, lane: string): LoadedLane<T> {
  const result: LoadedLane<T> = { lines: [], malformed: 0, laneMismatches: 0 };
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      result.malformed += 1;
      continue;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.lane !== lane) {
      result.laneMismatches += 1;
      continue;
    }
    result.lines.push(parsed as T);
  }
  return result;
}

/** Failure-signature classification. Transcribed from the spec's
 *  classifyFailure (spec:228-255) branch for branch, including the comment
 *  that the first two and last three branches mirror
 *  verify-recapture-raw.test.ts so lane-V signatures stay comparable. */
function classifyFailure(first: string, expectedExcerpt: string, actualExcerpt: string): string {
  if (first.includes("fixture expects a raised error (CAPTURE_ERROR sentinel)")) {
    const m = /expected excerpt: CAPTURE_ERROR: ([^:]+):/.exec(first);
    return `capture_error_still_raised:${m ? m[1] : "unknown"}`;
  }
  if (first.includes("but the fixture expects a successful result")) {
    const m = /handler raised ([^:]+):/.exec(first);
    return `handler_raised:${m ? m[1] : "unknown"}`;
  }
  if (/<!DOCTYPE/i.test(expectedExcerpt) && !/<!DOCTYPE/i.test(actualExcerpt)) {
    return "engine_output_not_page_shaped";
  }
  if (
    /expected excerpt:[^\n]*(class="denied"|Sorry, you don't have permission)/.test(first) ||
    /actual excerpt:[^\n]*(class="denied"|Sorry, you don't have permission)/.test(first)
  ) {
    return "permission_denied_mismatch";
  }
  if (first.includes("card not in seeded deck")) {
    return "name_not_in_seeded_deck";
  }
  if (first.includes("nest target not found")) {
    return "nest_target_not_found";
  }
  return "byte-diff";
}

interface LaneOutcome {
  aggregate: {
    files: string[];
    captureErrorLines: number;
    entries: number;
    pass: { total: number; records: number; renders: number };
    fail: { total: number; records: number; renders: number };
  };
  failures: Array<Record<string, unknown>>;
  signatureCounts: Record<string, number>;
}

/** Per-shard failure attribution -- the answer to "which shard/card failed",
 *  which nothing in the aggregate can give. `signatureCounts` is keyed by
 *  classification (`byte-diff`, `permission_denied_mismatch`, ...) and
 *  `coverage` carries only counts, and a failure `id` is
 *  `dual-lane-view:<name>:<slot>` with no shard in it, so on a multi-shard
 *  worker there is no way to attribute a failure to a shard without a
 *  separate per-shard run.
 *
 *  WHY IT IS AN OUT-PARAM AND NOT A FIELD ON LaneOutcome
 *    `pageLane: { ...pageOutcome, expectedMetadata }` (below, in the OUT_FILE
 *    write) SPREADS the whole LaneOutcome into the aggregate file, so a new
 *    field on that interface would appear in the aggregate and change the
 *    bytes the parity gate compares against the vitest spec's own output.
 *    Filling a caller-owned object keeps LaneOutcome -- and therefore every
 *    byte OUT_FILE holds -- exactly as it was, and the attribution reaches
 *    only the per-worker artifact files, which nothing compares. */
interface LaneAttribution {
  lane: string;
  entryCount: number;
  byShard: Record<
    string,
    { entries: number; pass: number; fail: number; sigs: Record<string, number> }
  >;
  failures: Array<{
    id: string;
    shard: string;
    area: string;
    sig: string;
    offset: number | null;
    expectedBytes: number | null;
    actualBytes: number | null;
  }>;
}

function newAttribution(lane: string): LaneAttribution {
  return { lane, entryCount: 0, byShard: {}, failures: [] };
}

function summarize(
  laneLabel: string,
  files: string[],
  captureErrorLines: number,
  report: Awaited<ReturnType<typeof replayEntries>>,
  /** Index-aligned with the entry list handed to replayEntries. replayEntries
   *  pushes one result per input entry in order (src/testing/replay.ts:343-345),
   *  so `entryShards[i]` is the shard `report.entries[i]` came from. */
  entryShards: string[],
  attributionOut: LaneAttribution,
): LaneOutcome {
  const failures: Array<Record<string, unknown>> = [];
  const signatureCounts: Record<string, number> = {};
  let passRecords = 0;
  let passRenders = 0;
  let failRecords = 0;
  let failRenders = 0;
  // Indexed, not `for...of`: the loop needs the position to index
  // entryShards. The branches, the counts and the pushed record are the
  // pre-existing ones unchanged; only the per-shard bookkeeping is new.
  for (let i = 0; i < report.entries.length; i += 1) {
    const e = report.entries[i];
    const shard = entryShards[i] ?? UNATTRIBUTED_SHARD;
    const bucket = attributionOut.byShard[shard] ?? (attributionOut.byShard[shard] = {
      entries: 0,
      pass: 0,
      fail: 0,
      sigs: {},
    });
    bucket.entries += 1;
    if (e.status === "pass") {
      bucket.pass += 1;
      if (e.area === "card-engine") passRecords += 1;
      else passRenders += 1;
      continue;
    }
    const first = formatReplayFailure(e);
    const sig = classifyFailure(
      first,
      e.diff?.firstDifference?.expectedExcerpt ?? "",
      e.diff?.firstDifference?.actualExcerpt ?? "",
    );
    signatureCounts[sig] = (signatureCounts[sig] ?? 0) + 1;
    const off = /first difference at code-unit offset (\d+)/.exec(first);
    const sizes = /sizes: expected (\d+) bytes, actual (\d+) bytes/.exec(first);
    const offset = off ? Number(off[1]) : null;
    const expectedBytes = sizes ? Number(sizes[1]) : null;
    const actualBytes = sizes ? Number(sizes[2]) : null;
    failures.push({
      id: e.id,
      lane: laneLabel,
      area: e.area,
      sig,
      offset,
      expectedBytes,
      actualBytes,
      first,
    });
    bucket.fail += 1;
    bucket.sigs[sig] = (bucket.sigs[sig] ?? 0) + 1;
    attributionOut.failures.push({
      id: e.id,
      shard,
      area: e.area,
      sig,
      offset,
      expectedBytes,
      actualBytes,
    });
    if (e.area === "card-engine") failRecords += 1;
    else failRenders += 1;
  }
  attributionOut.entryCount = report.entries.length;
  return {
    aggregate: {
      files,
      captureErrorLines,
      entries: report.summary.total,
      pass: { total: passRecords + passRenders, records: passRecords, renders: passRenders },
      fail: { total: failRecords + failRenders, records: failRecords, renders: failRenders },
    },
    failures,
    signatureCounts,
  };
}

export interface DirectRunOptions {
  repoRoot: string;
  /** Where the full aggregate JSON lands. Defaults to the spec's own output
   *  path so an uninstructed run is comparable with the spec's artifact. */
  aggregateOut?: string;
  /** Directory for the per-lane artifacts the driver unions. Files are named
   *  <label>-view.json / <label>-page.json and hold the lane aggregate object
   *  exactly as tools/dual-lane-verifier-fast.mjs:690 writes it.
   *
   *  SETTING THIS ALSO MOVES THE FULL AGGREGATE, to <dir>/<label>-aggregate.json.
   *  That is the multi-worker contract: artifactDir is the flag only the
   *  direct DRIVER passes (tools/oracle/dual-lane-direct-driver.mjs passes
   *  --artifacts on every worker), and it is what distinguishes a worker in a
   *  pool from a single run. Without it, W concurrent workers all resolved to
   *  the same <repo>/tmp/raw-ground-truth/enumeration/
   *  dual-lane-verification-aggregate.json and the last writer won -- measured
   *  on the W=8 probe, where 8 workers wrote one file and only w3's verdict
   *  survived. A single run -- the parity gate and both --runner direct harness
   *  seams -- passes --label but never --artifacts, so its aggregate path is
   *  unchanged and stays byte-comparable with the vitest instrument's. */
  artifactDir?: string;
  label?: string;
}

/** Peak resident set, sampled at the points where it actually grows: after
 *  the seed (the corpus is fully resident by then), after the view lane, and
 *  after the page lane. The worker count is gated on memory --
 *  "8 x 1536 MB = 12.3 GB fits the >=16 GB-free gate" --
 *  but that figure
 *  is a heap CAP, never a measured footprint. A worker that only ever needs
 *  700 MB means W=16 was gated on a number that was never true; one that
 *  needs 2.4 GB means W=8 was. Sampled, not timer-polled: the sample points
 *  are the phase boundaries, which is where the peak lives. */
let peakRssBytes = 0;
function sampleRss(): void {
  const rss = process.memoryUsage().rss;
  if (rss > peakRssBytes) peakRssBytes = rss;
}

/** Live run state, readable from outside a run that has not returned (or has
 *  thrown). `runDirectGrade` throws on the hard gate BEFORE it returns, so
 *  everything measured so far -- seed-warm, render elapsed, peak RSS, and the
 *  per-lane totals that decide the gate -- used to die with the throw: the
 *  W=8 probe ran 8 workers to the gate, lost every worker's RSS number, and
 *  recorded `grep -c RUNNER-TIMING driver.log` -> 0. These module-level
 *  bindings are the state the entry point's `finally` reads to report a run
 *  that failed. Nothing here is written to any aggregate. */
let runT0 = 0;
let runSeedWarmMs = 0;
let runRenderT0 = 0;
let runProgress: {
  shards: number;
  view: { pass: number; entries: number; fail: number } | null;
  page: { pass: number; entries: number; fail: number } | null;
} = { shards: 0, view: null, page: null };

export interface DirectRunResourceSnapshot {
  /** 0 when the run has not started, so an un-run process reports zeros
   *  rather than a wall-clock delta against a stale start. */
  started: boolean;
  seedWarmMs: number;
  renderMs: number;
  totalMs: number;
  peakRssBytes: number;
  shards: number;
  view: { pass: number; entries: number; fail: number } | null;
  page: { pass: number; entries: number; fail: number } | null;
}

const laneTotals = (a: { entries: number; pass: { total: number }; fail: { total: number } }) => ({
  pass: a.pass.total,
  entries: a.entries,
  fail: a.fail.total,
});

/** Snapshot of a run in flight or already finished. Safe to call at any time,
 *  including after runDirectGrade has thrown -- which is the point. */
export function directRunResourceSnapshot(): DirectRunResourceSnapshot {
  return {
    started: runT0 !== 0,
    seedWarmMs: runSeedWarmMs,
    renderMs: runRenderT0 === 0 ? 0 : Date.now() - runRenderT0,
    totalMs: runT0 === 0 ? 0 : Date.now() - runT0,
    peakRssBytes,
    shards: runProgress.shards,
    view: runProgress.view,
    page: runProgress.page,
  };
}

export interface DirectRunResult {
  exit: number;
  view: LaneOutcome;
  page: LaneOutcome & { expectedMetadata: unknown };
  coverage: ShardCoverage[];
  aggregatePath: string;
  /** Per-shard failure attribution, kept OFF `view`/`page` on purpose: those
   *  two are spread into the aggregate file, and the parity gate compares that
   *  file byte for byte. Reached by the per-worker artifact write only. */
  attribution: { view: LaneAttribution; page: LaneAttribution };
}

/** Grade a shard list on one boot. Mirrors the spec's single `it` body. */
export async function runDirectGrade(opts: DirectRunOptions): Promise<DirectRunResult> {
  const tStart = Date.now();
  runT0 = tStart;
  runSeedWarmMs = 0;
  runRenderT0 = 0;
  runProgress = { shards: 0, view: null, page: null };
  const REPO_ROOT = path.resolve(opts.repoRoot);
  // GRADE_EXPECTED_V2_DIR grades against another capture tree of the same
  // layout (the permissioned captures); unset keeps the instrument tree.
  const EXPECTED_V2_DIR =
    process.env.GRADE_EXPECTED_V2_DIR ?? path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2");
  const VIEW_LANE_DIR = path.join(EXPECTED_V2_DIR, "view-lane");
  const PAGE_LANE_DIR = path.join(EXPECTED_V2_DIR, "page-lane");
  const OUT_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "enumeration");
  // Aggregate path resolution, in precedence order:
  //   1. --aggregate-out            -- the caller named a file. The parity gate
  //                                   uses this to keep path A from overwriting
  //                                   path B.
  //   2. <artifactDir>/<label>-aggregate.json
  //                                -- a pooled worker. artifactDir is set only
  //                                   by the driver, so this branch is exactly
  //                                   "more than one of me is running", and it
  //                                   is what stops W workers racing for one
  //                                   path.
  //   3. <OUT_DIR>/dual-lane-verification-aggregate.json
  //                                -- a single run, byte-comparable with the
  //                                   vitest instrument's own artifact.
  // Branch 3 is the default so that no single-run caller can change shape.
  const OUT_FILE =
    opts.aggregateOut ??
    (opts.artifactDir !== undefined
      ? path.join(opts.artifactDir, `${opts.label ?? "direct"}-aggregate.json`)
      : path.join(OUT_DIR, "dual-lane-verification-aggregate.json"));

  // The corpus seeding module the spec reaches as "./raw-corpus-seeding.js".
  //
  // This pointed at the per-worktree staging copy under the gitignored
  // instrument tree (tmp/, .gitignore:45). That copy predates the reference
  // graph seeding pass, so the graded run staged 3,184 card_references
  // rows where the committed home stages 556,526. Every card a search card
  // queries therefore had no outgoing reference rows, and the engine --
  // whose generated SQL is correct -- rendered `search-no-results` where the
  // Ruby oracle renders a result list. That is the whole negative-delta page
  // family: 145 page-lane failures, 1,084,985 missing bytes.
  //
  // The fix is not in the engine and was not missing: the committed home
  // tests/card/render/raw-corpus-seeding.ts carries the pass (:699-745) and
  // its own header names this exact symptom. It simply never reached the
  // graded run. So the runner imports the committed home.
  //
  // The assertion below is the point of the change: a seeding module that
  // lacks the pass now REFUSES the run instead of silently producing a
  // clean-looking aggregate full of negative-delta pages. A silent fallback
  // to the staging copy would reinstate exactly this bug.
  const SEEDING_MODULE = path.join(REPO_ROOT, "tests", "card", "render", "raw-corpus-seeding.js");
  const seeding = await import(pathToFileURL(SEEDING_MODULE).href);
  if (typeof seeding.createRawStructureSeededStorage !== "function") {
    throw new Error(
      `corpus seeding module ${SEEDING_MODULE} does not export createRawStructureSeededStorage`,
    );
  }
  const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;

  // The graded environment's cloud asset host: the deployment serves
  // carrierwave attachments from DigitalOcean Spaces FR1, and the corpus
  // expectations carry the same prefix (the companion transform moves engine
  // config and expectations TOGETHER). Set BEFORE any storage boot so every
  // worker's render emits the deployment form. The engine DEFAULT (fog s3
  // form) stays pinned for every suite that does not set it
  // (tests/card/render/cloud-asset-host-deployment-config.test.ts).
  const { setDeploymentCloudAssetHost } = await import(
    pathToFileURL(path.join(REPO_ROOT, "src", "card", "render", "views.ts")).href
  );
  const DEPLOYMENT_CLOUD_ASSET_HOST =
    "https://production-storage.r1.cdn.objectstore.example";
  setDeploymentCloudAssetHost(DEPLOYMENT_CLOUD_ASSET_HOST);

  // The aggregate's OWN directory, which is not necessarily OUT_DIR: a pooled
  // worker's aggregate lives in artifactDir, which the driver creates on disk
  // but this process may be first to write into.
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const shards = requestedDualLaneShards(VIEW_LANE_DIR, PAGE_LANE_DIR);
  const coverage: ShardCoverage[] = [];
  const viewEntries: ReplayEntry[] = [];
  const pageEntries: ReplayEntry[] = [];
  // Index-aligned with the two arrays above, pushed in lockstep at every
  // push site below. This is the whole attribution mechanism: replayEntries
  // returns one result per input entry in input order
  // (src/testing/replay.ts:343-345), so position i in the report is position
  // i here, and the shard that entry was read from is recoverable.
  const viewEntryShards: string[] = [];
  const pageEntryShards: string[] = [];
  let viewCaptureErrorLines = 0;
  let pageCaptureErrorLines = 0;
  const pageMetadata = {
    layoutCounts: {} as Record<string, number>,
    effectiveMainViewCounts: {} as Record<string, number>,
    formatMainTrue: 0,
    formatMainAbsentOrError: 0,
    layoutRuleNull: 0,
    errorLines: [] as Array<{ shard: string; name: string; error: string }>,
  };

  for (const shard of shards) {
    const cov: ShardCoverage = {
      shard: shard.name,
      view: { file: shard.viewPath !== undefined, lines: 0, malformed: 0, laneMismatches: 0, entries: 0 },
      page: { file: shard.pagePath !== undefined, lines: 0, malformed: 0, laneMismatches: 0, entries: 0 },
      missing: "none",
    };
    const missing: string[] = [];
    if (shard.viewPath === undefined) missing.push("view");
    if (shard.pagePath === undefined) missing.push("page");
    cov.missing = missing.length === 0 ? "none" : missing.join("+");

    if (shard.viewPath !== undefined) {
      const loaded = loadLane<ViewLaneLine>(shard.viewPath, "view");
      cov.view.lines = loaded.lines.length;
      cov.view.malformed = loaded.malformed;
      cov.view.laneMismatches = loaded.laneMismatches;
      for (const line of loaded.lines) {
        // Whole-line capture error (Card.fetch returned nil in the oracle):
        // COUNTED AND REPORTED, never silently skipped.
        if (line.error !== undefined && line.record === undefined && line.views === undefined) {
          viewCaptureErrorLines += 1;
          continue;
        }
        if (line.record) {
          const { id, ...rest } = line.record;
          void id;
          viewEntries.push({
            id: `dual-lane-view:${line.name}:record`,
            area: "card-engine",
            input: { name: line.name },
            expected: rest as CardRecordWithoutId,
          });
          viewEntryShards.push(shard.name);
          cov.view.entries += 1;
        }
        if (line.views) {
          for (const [view, html] of Object.entries(line.views)) {
            viewEntries.push({
              id: `dual-lane-view:${line.name}:render:${view}`,
              area: "render-engine",
              input: { cardName: line.name, view },
              expected: html,
            });
            viewEntryShards.push(shard.name);
            cov.view.entries += 1;
          }
        }
      }
    }

    if (shard.pagePath !== undefined) {
      const loaded = loadLane<PageLaneLine>(shard.pagePath, "page");
      cov.page.lines = loaded.lines.length;
      cov.page.malformed = loaded.malformed;
      cov.page.laneMismatches = loaded.laneMismatches;
      for (const line of loaded.lines) {
        if (line.layout !== undefined && line.layout !== null) {
          pageMetadata.layoutCounts[line.layout] = (pageMetadata.layoutCounts[line.layout] ?? 0) + 1;
        }
        if (line.layout_rule === null || line.layout_rule === "") pageMetadata.layoutRuleNull += 1;
        const effective = line.layout_main_view?.effective;
        if (effective !== undefined) {
          pageMetadata.effectiveMainViewCounts[effective] =
            (pageMetadata.effectiveMainViewCounts[effective] ?? 0) + 1;
        }
        if (line.format_main === true) pageMetadata.formatMainTrue += 1;
        else pageMetadata.formatMainAbsentOrError += 1;

        if (line.error !== undefined) {
          pageCaptureErrorLines += 1;
          pageMetadata.errorLines.push({
            shard: shard.name,
            name: line.name,
            error: String(line.error),
          });
          pageEntries.push({
            id: `dual-lane-page:${line.name}:page`,
            area: "render-engine",
            input: {
              cardName: line.name,
              view: effective ?? PRODUCTION_DEFAULT_MAIN_VIEW,
            },
            expected: String(line.error),
          });
          pageEntryShards.push(shard.name);
          cov.page.entries += 1;
          continue;
        }
        if (typeof line.page_html === "string") {
          pageEntries.push({
            id: `dual-lane-page:${line.name}:page`,
            area: "render-engine",
            input: {
              cardName: line.name,
              view: effective ?? PRODUCTION_DEFAULT_MAIN_VIEW,
            },
            expected: line.page_html,
          });
          pageEntryShards.push(shard.name);
          cov.page.entries += 1;
        } else {
          cov.page.malformed += 1;
        }
      }
    }

    coverage.push(cov);
    console.log(
      `coverage shard=${cov.shard} ` +
        `view(file=${cov.view.file},lines=${cov.view.lines},entries=${cov.view.entries},` +
        `malformed=${cov.view.malformed},laneMismatch=${cov.view.laneMismatches}) ` +
        `page(file=${cov.page.file},lines=${cov.page.lines},entries=${cov.page.entries},` +
        `malformed=${cov.page.malformed},laneMismatch=${cov.page.laneMismatches}) ` +
        `missing=${cov.missing}`,
    );
  }

  runProgress.shards = coverage.length;

  // Same block, same order, same line as the spec:472-490.
  const seedWarmT0 = Date.now();
  const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
  const everyLiveId = (
    idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
  ).map((r) => r.id);
  idLister.close();
  const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  const gradeViewer = gradeViewerFromEnv(process.env.GRADE_VIEWER);
  const viewerEngine = storage.engine as unknown as GradeViewerEngine;
  if (gradeViewer !== undefined) {
    viewerEngine.viewer = gradeViewer;
    viewerEngine.pageSession = gradeViewer.signedIn ? gradeViewer : undefined;
    console.log(`GRADE-VIEWER ${JSON.stringify(gradeViewer)}`);
  }
  const viewRegistry = new HandlerRegistry();
  const pageRegistry = new HandlerRegistry();

  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  const seedWarmMs = Date.now() - seedWarmT0;
  runSeedWarmMs = seedWarmMs;
  console.log(
    `SEED-WARM ms=${seedWarmMs} ids=${everyLiveId.length} ` +
      `shards=${shards.map((s) => s.name).join(",")}`,
  );
  sampleRss();

  const universeBatch = await storage.fetcher.driver.batch([
    structureRuleUniverseStatement(),
  ]);
  const structureUniverse = structureUniverseFromResults(universeBatch[0]);

  const renderT0 = Date.now();
  runRenderT0 = renderT0;
  try {
    const registerCardEngine = (registry: HandlerRegistry): void => {
      registry.register("card-engine", async ({ name }) => {
        const card = await storage.fetcher.fetchByName(name);
        if (card === undefined) {
          return {
            kind: "error" as const,
            errorClass: "RuntimeError",
            message: `card not in seeded deck: ${name}`,
          };
        }
        const engine = storage.fetcher;
        const typeCard =
          card.typeId === undefined ? undefined : await engine.fetchById(card.typeId);
        const typeCode =
          card.typeId === undefined
            ? undefined
            : ((await engine.codenames.nameForId(card.typeId)) ?? "");
        const typeName = typeCard?.name;
        let leftCard: Awaited<ReturnType<typeof engine.fetchById>> | undefined;
        let leftTypeName: string | undefined;
        if (card.leftId !== undefined) {
          leftCard = await engine.fetchById(card.leftId);
          if (leftCard?.typeId !== undefined) {
            const leftTypeCard = await engine.fetchById(leftCard.typeId);
            leftTypeName = leftTypeCard?.name;
          }
        }
        const isSimple = card.name === undefined || card.name.isSimple;
        // The set-module content override: Ruby's
        // applicable set modules ride the card's singleton class
        // (mod/core/set/all/initialize.rb:61-74) and shadow card.content for
        // every caller — the record's content field photographs that answer.
        // Qualification needs the anchor parts' codenames (anchor_codenames,
        // set/pattern/base.rb:46-49): walk the right-spine (each name part IS
        // a card row). Loop guard mirrors composedName's cycle protection.
        const partCodenames: Array<string | null> = [];
        {
          let cur = card;
          const spineGuard = new Set<number>();
          while (cur.leftId !== undefined) {
            if (spineGuard.has(cur.id)) break;
            spineGuard.add(cur.id);
            const right = cur.rightId === undefined ? undefined : await engine.fetchById(cur.rightId);
            partCodenames.unshift(right?.codename ?? null);
            const next = await engine.fetchById(cur.leftId);
            if (next === undefined) break;
            cur = next;
          }
          if (!spineGuard.has(cur.id)) partCodenames.unshift(cur.codename ?? null);
        }
        const setModuleOverride = resolveSetModuleContent({
          key: card.key ?? "",
          name: card.name?.s ?? "",
          codename: card.codename ?? null,
          typeCode: typeCode ?? null,
          dbContent: card.dbContent,
          partCodenames,
          leftIsReal:
            leftCard !== undefined && !leftCard.isNew && !leftCard.trash,
          leftCreatedAt: leftCard?.createdAt,
          leftUpdatedAt: leftCard?.updatedAt,
        });
        const content = structuredCardContent(
          {
            name: card.name ?? "",
            id: card.id,
            typeId: card.typeId,
            typeName,
            leftTypeName,
            isNew: card.isNew,
          },
          card.dbContent,
          structureUniverse,
          setModuleOverride,
        );
        const record: Omit<CapturedCardRecord, "id"> = {
          name: card.name?.s ?? "",
          key: card.key ?? "",
          type: typeCard?.name?.s ?? "",
          type_code: typeCode ?? "",
          codename: card.codename ?? null,
          content,
          left: isSimple ? null : (card.name?.leftName?.s ?? null),
          right: isSimple ? null : (card.name?.rightName?.s ?? null),
        };
        return jsonValue(record);
      });
    };
    registerCardEngine(viewRegistry);

    /** Lane V handler: bare view-function render, byte-identical flow to the
     *  old verifier. */
    const renderHandler = async ({ cardName, view }: { cardName: string; view: string }) => {
      // The capture rig's VIEW lane ran development
      // (raise_all_rendering_errors=true): real bytes, and renders that raise
      // record as CAPTURE_ERROR sentinels. The engine's default posture is
      // that development posture; the PAGE lane below flips to production.
      setRaiseAllRenderingErrors(true);
      try {
        const html = await storage.engine.render(cardName, view);
        assertGradeViewerState(viewerEngine, gradeViewer);
        return renderBytes(html);
      } catch (error) {
        if (error instanceof UnsupportedViewError) {
          return raisedError("Card::Error::UserError", error.message);
        }
        const err = error as Error;
        return raisedError(err?.constructor?.name ?? "Error", err?.message ?? String(error));
      }
    };
    viewRegistry.register("render-engine", renderHandler);

    /** Lane P handler: the engine's page-shaped output -- the REAL page
     *  render (src/card/render/page.ts). The entry `view` input is
     *  informational only (Ruby's show resolves the view itself).
     *
     *  SHARD BOUNDARY (the capture-process model, settled live 2026-10-11):
     *  the Ruby capture rigs ran ONE process per shard file with nothing
     *  renewed inside it, so the +*enabled_roles session card's ensure_roles
     *  fill starts blank at each shard's first page and stays filled for
     *  the rest of the shard (the census: 6,537 of 6,588 member pages carry
     *  the filled navbar input; the 48 exceptions are each shard's FIRST
     *  page — the live probe confirms the fill survives Card::Env.reset and
     *  only Card::Cache.renew blanks it). The replay is sequential
     *  (src/testing/replay.ts replayEntries), so the call count maps 1:1
     *  onto pageEntryShards; at every shard change the engine's session
     *  state resets — exactly the boundary the capture process crossed. */
    let pageEntryIndex = 0;
    let pageEntryShard = "";
    pageRegistry.register("render-engine", async ({ cardName }: { cardName: string }) => {
      const shard = pageEntryShards[pageEntryIndex] ?? "";
      pageEntryIndex += 1;
      if (shard !== pageEntryShard) {
        pageEntryShard = shard;
        viewerEngine.resetRequestSession?.();
      }
      // The capture rig's PAGE lane ran production
      // (raise_all_rendering_errors=false): nested render errors render as
      // the quiet render-error span INSIDE the slot wrapper (the four
      // person-card pages' date slots pin the wrapped
      // "Error rendering: ...+Date (core view)" panel). Without this the
      // engine's development default re-raises nested errors and nest()'s
      // catch emits the bare unwrapped span labelled "(content view)".
      setRaiseAllRenderingErrors(false);
      try {
        const html = await storage.engine.renderPage(cardName);
        assertGradeViewerState(viewerEngine, gradeViewer);
        return renderBytes(html);
      } catch (error) {
        if (
          error instanceof UnsupportedViewError ||
          (error as Error).name === "UnknownLayoutError"
        ) {
          return raisedError("Card::Error::UserError", (error as Error).message);
        }
        const err = error as Error;
        return raisedError(err?.constructor?.name ?? "Error", err?.message ?? String(error));
      }
    });

    const viewAttribution = newAttribution("view");
    const viewOutcome = summarize(
      "view",
      coverage.filter((c) => c.view.file).map((c) => c.shard),
      viewCaptureErrorLines,
      await replayEntries(viewEntries, viewRegistry),
      viewEntryShards,
      viewAttribution,
    );
    sampleRss();
    runProgress.view = laneTotals(viewOutcome.aggregate);
    const pageAttribution = newAttribution("page");
    const pageOutcome = summarize(
      "page",
      coverage.filter((c) => c.page.file).map((c) => c.shard),
      pageCaptureErrorLines,
      await replayEntries(pageEntries, pageRegistry),
      pageEntryShards,
      pageAttribution,
    );
    sampleRss();
    runProgress.page = laneTotals(pageOutcome.aggregate);

    console.log("VIEW-LANE aggregate:\n" + JSON.stringify(viewOutcome.aggregate, null, 2));
    console.log("VIEW-LANE failure signatures: " + JSON.stringify(viewOutcome.signatureCounts));
    console.log("PAGE-LANE aggregate:\n" + JSON.stringify(pageOutcome.aggregate, null, 2));
    console.log("PAGE-LANE failure signatures: " + JSON.stringify(pageOutcome.signatureCounts));
    console.log(
      "PAGE-LANE expected metadata (layout resolver target; not graded until " +
        "the engine ports the resolver):\n" +
        JSON.stringify(pageMetadata, null, 2),
    );

    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          reportOnly: REPORT_ONLY,
          expectedV2Dir: EXPECTED_V2_DIR,
          viewLane: viewOutcome,
          pageLane: { ...pageOutcome, expectedMetadata: pageMetadata },
          coverage,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`aggregate written: ${OUT_FILE}`);

    // Per-lane artifacts in the driver's own shape, so the direct driver can
    // union them without re-scraping stdout. Same JSON.stringify(agg, null, 2)
    // the existing driver writes at tools/dual-lane-verifier-fast.mjs:690.
    //
    // `attribution` is appended as a SIBLING of the aggregate's own keys, not
    // wrapped around it, for two reasons. The driver's union reads
    // `a.entries` / `a.pass.total` / `a.fail.total` off the top level
    // (dual-lane-direct-driver.mjs unionLane), so the aggregate stays exactly
    // where it was and no union code has to change. And because the spread
    // writes the aggregate's keys FIRST, the new file is the old file with one
    // byte changed -- the `}` that closed the last aggregate value becomes `,`
    // -- and `,\n  "attribution": {...}\n}` appended after it. Every other byte
    // of the old artifact is preserved, which is the invariant the before/after
    // check asserts on a real run.
    if (opts.artifactDir !== undefined) {
      mkdirSync(opts.artifactDir, { recursive: true });
      const label = opts.label ?? "direct";
      writeFileSync(
        path.join(opts.artifactDir, `${label}-view.json`),
        JSON.stringify({ ...viewOutcome.aggregate, attribution: viewAttribution }, null, 2),
      );
      writeFileSync(
        path.join(opts.artifactDir, `${label}-page.json`),
        JSON.stringify({ ...pageOutcome.aggregate, attribution: pageAttribution }, null, 2),
      );
    }

    let exit = 0;
    if (!REPORT_ONLY) {
      // The spec's four gate assertions (spec:640-643) as thrown errors with
      // the same conditions and the same message text.
      const gate = (label: string, entries: number, failTotal: number): string =>
        `${label}: ${failTotal} failing of ${entries} entries against expected-v2. ` +
        `Aggregate: ${OUT_FILE}. While the page lane is expected to fail low ` +
        `(no engine layout resolver yet), run with DUAL_LANE_REPORT_ONLY=1.`;
      const violations: string[] = [];
      if (!(viewOutcome.aggregate.entries > 0)) {
        violations.push(gate("view lane", viewOutcome.aggregate.entries, viewOutcome.aggregate.fail.total));
      }
      if (!(pageOutcome.aggregate.entries > 0)) {
        violations.push(gate("page lane", pageOutcome.aggregate.entries, pageOutcome.aggregate.fail.total));
      }
      if (viewOutcome.aggregate.fail.total !== 0) {
        violations.push(gate("view lane", viewOutcome.aggregate.entries, viewOutcome.aggregate.fail.total));
      }
      if (pageOutcome.aggregate.fail.total !== 0) {
        violations.push(gate("page lane", pageOutcome.aggregate.entries, pageOutcome.aggregate.fail.total));
      }
      if (violations.length > 0) {
        throw new Error(`direct-runner gate failed: ${violations.join(" | ")}`);
      }
    }

    return {
      exit,
      view: viewOutcome,
      page: { ...pageOutcome, expectedMetadata: pageMetadata },
      coverage,
      aggregatePath: OUT_FILE,
      attribution: { view: viewAttribution, page: pageAttribution },
    };
  } finally {
    storage.close();
  }
}
