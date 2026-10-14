// The two halves of the parity grade of record that are counted on their own:
// the side-effect tally (19 step answers) and the read-write tally (8 reads
// that wrote only what Ruby's reads wrote), plus the non-html format
// families.
//
// WHAT RUNS HERE.
//
//   1. One reference-harness run over EVERY operation of the committed
//      synthetic-v1 fixture, through this checkout's engine, graded against
//      the Ruby oracle's committed answers -- the pair of commands
//      reference-harness/SPEC.md section 3 names:
//
//        node reference-harness/runner/run.mjs --adapter
//             reference-harness/adapters/ts/adapter.json --fixture <fixture> --out <results>
//        node reference-harness/runner/grade.mjs --fixture <fixture>
//             --actual <results> --expected <committed expected/> --report <report>
//
//      The run happens once, in beforeAll; the two grade cases below read its
//      report and its two results directories. Measured cost on this
//      checkout: run 27 s, grade 4 s.
//
//   2. The csv / rss / json format families, rendered through the engine and
//      byte-compared with the committed Ruby captures in
//      fixtures/oracle-surfaces/. Pattern-matched on
//      tests/card/render/format-families-oracle.test.ts, which pins the same
//      four captures.
//
// WHAT THE FORMAT CASE COMPARES, precisely. Twelve captures across the four
// steps: five are compared byte for byte, one (the csv Home row) is a step
// Ruby raised on and the engine raises the same error, two (the rss-enabled
// feeds) are compared to a named cut with the error element after it
// compared exactly, and four (the json :status and :atom rows) name a view
// renderFormatShow does not take, so the surface cannot be asked for them.
// The two cuts and the four unaskable views are asserted, not skipped
// quietly: each result records which comparison was made, and the case fails
// if any capture is silently reclassified.
//
// WHY THE FIXTURE IS STAGED INTO SCRATCH. The committed fixture's deck is
// WAL-mode SQLite, so opening it -- even read-only -- leaves deck.sqlite3-shm
// and deck.sqlite3-wal beside it. verifyFixture() reports those as "fixture
// file not in its manifest", the runner records them as fixture_problems, and
// the grader then refuses the run as not-a-grade. Copying exactly the files
// the fixture's own MANIFEST.json lists into a scratch directory (basename
// kept as synthetic-v1, so the digest, the fixture name and the expected
// outputs' binding all still hold) keeps the checkout clean and the grade
// valid whatever state the working tree is in.
//
// WHAT IS COMMITTED. The deck, its files, the operations and the oracle's
// answers are all committed under reference-harness/fixtures/synthetic-v1/;
// the four format captures are committed under fixtures/oracle-surfaces/;
// reference-harness/adapters/ts/adapter.json runs this checkout's engine with
// Node alone. No Ruby, no network, no hosted service, nothing local beyond
// the checkout.
//
// DATA RULE. Zero real content: this file names no card, user, address or
// document of its own. Every deck fact it reads comes from a committed
// synthetic fixture (invented names, example.test addresses, a frozen clock),
// or is an id and a timestamp the captures pin.
//
// THE DEEPER BATTERY, PUBLIC ON A SYNTHETIC DECK. The write probe
// (tests/tools/persist-write-probe.test.ts) runs on the committed synthetic
// write-battery fixture (reference-harness/fixtures/write-battery-v1) and
// diffs every operation's row delta against the Ruby oracle recordings
// committed on it: of the 67 public operations, 65 match and 2 are declared
// deliberate differences. The scenario battery's 88 public steps are recorded
// on the same deck and committed beside it, with 4 declared deliberate
// differences (tests/tools/side-effects-scenario-battery.test.ts). The third
// describe below asserts the committed recording those published counts rest
// on.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { describeOrSkipLoud } from "../support/describe-with-corpus.js";
import { scratchDir } from "../support/scratch-dir.mjs";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import {
  renderFormatShow,
  RSS_DISABLED_BYTES,
  type FormatShowOptions,
} from "../../src/card/render/format-families.js";
// @ts-expect-error plain ESM module without type declarations
import { normalizeRender, sameJson } from "../../reference-harness/runner/normalize.mjs";
// @ts-expect-error plain ESM module without type declarations
import { verifyFixture } from "../../reference-harness/runner/manifest.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const HARNESS = "reference-harness";
const FIXTURE = `${HARNESS}/fixtures/synthetic-v1`;
const FIXTURE_DIR = join(REPO, HARNESS, "fixtures", "synthetic-v1");
const EXPECTED_DIR = join(FIXTURE_DIR, "expected");
const ADAPTER = join(FIXTURE_DIR, "..", "..", "adapters", "ts", "adapter.json");
const SURFACES = join(REPO, "fixtures", "oracle-surfaces");
const HAVE_GRADE =
  existsSync(join(FIXTURE_DIR, "MANIFEST.json")) &&
  existsSync(join(FIXTURE_DIR, "deck", "deck.sqlite3")) &&
  existsSync(join(EXPECTED_DIR, "MANIFEST.json")) &&
  existsSync(join(EXPECTED_DIR, "scenarios.jsonl")) &&
  existsSync(join(SURFACES, "csv.jsonl")) &&
  existsSync(join(SURFACES, "rss.jsonl")) &&
  existsSync(join(SURFACES, "rss-enabled.jsonl")) &&
  existsSync(join(SURFACES, "json.jsonl"));

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

interface WriteAnswer {
  saved: boolean;
  errors: { field: string; message: string }[];
  card: { name: string; id: number } | null;
  mail: { to: string[]; subject: string; text: string }[];
}
interface SigninAnswer {
  signed_in: boolean;
  actor: string;
}
interface ScenarioStep {
  op: "render" | "ask" | "write" | "signin";
  action?: string;
  result?: unknown;
  error?: { class: string; message: string };
  rows?: Record<string, unknown>;
  other_tables?: Record<string, unknown>;
}
interface ScenarioLine {
  id: string;
  steps: ScenarioStep[];
}
interface Tally {
  graded: number;
  pass: number;
  fail: number;
  oracle_errors: number;
  missing: number;
  rate: number | null;
  groups: Record<string, { graded: number; pass: number }>;
}
interface GradeReport {
  verdict: string;
  problems: string[];
  partial: string[];
  summary: Record<string, Tally>;
  read_writes: { graded: number; pass: number; fail: number; failures: { id: string; reason: string }[] };
  oracle: { variant: string | null };
}
interface RunRecord {
  session_writes?: Record<string, unknown>;
  complete?: boolean;
}

/** One step as the fixture names it, next to what both engines answered. */
interface Compared {
  id: string;
  op: ScenarioStep["op"];
  action: string;
  /** true when the two answers match under the harness's own N2 compare. */
  equal: boolean;
}

interface Evidence {
  report: GradeReport;
  gradeStatus: number;
  /** Staged fixture's own verification: [] means the grade is a grade. */
  fixtureProblems: string[];
  /** 19 side-effect steps (16 writes + 3 sign-ins) and the 8 read-writes. */
  compared: Compared[];
  counts: {
    writeSteps: number;
    writeActions: Record<string, number>;
    signinSteps: number;
    readSteps: number;
    readStepOps: Record<string, number>;
  };
  /** The raw row deltas of every read step, both engines' — {} means wrote nothing. */
  readDeltas: { id: string; same: boolean; ruby: unknown; engine: unknown }[];
  /** The two read sessions' whole-session row deltas. */
  sessionWrites: { kind: string; ruby: unknown; engine: unknown; same: boolean }[];
}

const readJsonl = (file: string): ScenarioLine[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ScenarioLine);

function runNode(args: string[]): { status: number; out: string; err: string } {
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const tail = (text: string, lines = 40) => text.trimEnd().split("\n").slice(-lines).join("\n");

/** Copy exactly the files the fixture's own MANIFEST.json lists, plus the
 *  manifest itself (the list excludes it). Anything else in the directory --
 *  a WAL sidecar left behind by a reader -- is not the fixture and would be
 *  reported as a fixture problem, so it is left behind with it. */
function stageFixture(dest: string): string[] {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "MANIFEST.json"), "utf8")) as { files: Record<string, string> };
  const rels = ["MANIFEST.json", ...Object.keys(manifest.files)];
  for (const rel of rels) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(FIXTURE_DIR, rel), to);
  }
  return rels;
}

let evidence: Evidence;

describeOrSkipLoud(!HAVE_GRADE, "tests/exercise/parity-2.test.ts", "HAVE_GRADE")(
  "the side-effect and read-write tallies of the synthetic-deck grade",
  () => {
    beforeAll(() => {
      const scratch = scratchDir("decko-parity-2-");
      // basename stays synthetic-v1: the grader binds the expected outputs to
      // that fixture name and to its digest.
      const staged = join(scratch, "synthetic-v1");
      const stagedFiles = stageFixture(staged);
      const fixtureProblems = verifyFixture(staged).problems as string[];
      if (fixtureProblems.length > 0) {
        throw new Error(`staged fixture does not match its manifest: ${fixtureProblems.join("; ")}`);
      }

      const resultsDir = join(scratch, "results");
      const reportFile = join(scratch, "grade-report.json");
      const runResult = runNode([
        join(REPO, HARNESS, "runner", "run.mjs"),
        "--adapter",
        ADAPTER,
        "--fixture",
        staged,
        "--out",
        resultsDir,
      ]);
      if (runResult.status !== 0) throw new Error(`run.mjs exited ${runResult.status}\n--- stderr tail ---\n${tail(runResult.err)}`);

      const gradeResult = runNode([
        join(REPO, HARNESS, "runner", "grade.mjs"),
        "--fixture",
        staged,
        "--actual",
        resultsDir,
        "--expected",
        EXPECTED_DIR,
        "--report",
        reportFile,
      ]);
      const report = JSON.parse(readFileSync(reportFile, "utf8")) as GradeReport;

      // --- recount the fixture's own steps -----------------------------------
      const scenarios = (
        JSON.parse(readFileSync(join(staged, "ops", "scenarios.json"), "utf8")) as { scenarios: { id: string; steps: ScenarioStep[] }[] }
      ).scenarios;
      const expectedSteps = new Map(readJsonl(join(EXPECTED_DIR, "scenarios.jsonl")).map((l) => [l.id, l.steps]));
      const actualSteps = new Map(readJsonl(join(resultsDir, "scenarios.jsonl")).map((l) => [l.id, l.steps]));
      const expectedManifest = JSON.parse(readFileSync(join(EXPECTED_DIR, "MANIFEST.json"), "utf8")) as {
        runs: Record<string, RunRecord>;
      };
      const actualMeta = JSON.parse(readFileSync(join(resultsDir, "run-meta.json"), "utf8")) as { runs: Record<string, RunRecord> };

      const compared: Compared[] = [];
      const readDeltas: Evidence["readDeltas"] = [];
      const writeActions: Record<string, number> = {};
      const readStepOps: Record<string, number> = {};
      let writeSteps = 0;
      let signinSteps = 0;
      let readSteps = 0;

      for (const scenario of scenarios) {
        const expected = expectedSteps.get(scenario.id) ?? [];
        const actual = actualSteps.get(scenario.id) ?? [];
        scenario.steps.forEach((step, i) => {
          const id = `${scenario.id}#${i + 1}`;
          const e = expected[i];
          const a = actual[i];
          if (step.op === "write") {
            writeSteps++;
            writeActions[step.action ?? ""] = (writeActions[step.action ?? ""] ?? 0) + 1;
          } else {
            readSteps++;
            readStepOps[step.op] = (readStepOps[step.op] ?? 0) + 1;
            if (step.op === "signin") signinSteps++;
          }
          // The grader's own comparison for this kind of item: the whole
          // answer, under N2 (object key order never counts). Renders go
          // through the one mask the harness applies -- Ruby's random
          // data-slot-id (normalizeRender); every other byte counts.
          const answerOf = (recorded: ScenarioStep | undefined) =>
            recorded?.result === undefined ? undefined : step.op === "render" ? normalizeRender(recorded.result) : recorded.result;
          compared.push({ id, op: step.op, action: step.action ?? "", equal: sameJson(answerOf(e), answerOf(a)) });
          if (step.op !== "write") {
            // What a read may leave behind: the raw row delta in every table.
            const ruby = { ...(e?.rows ?? {}), ...(e?.other_tables ?? {}) };
            const engine = { ...(a?.rows ?? {}), ...(a?.other_tables ?? {}) };
            readDeltas.push({ id, ruby, engine, same: sameJson(ruby, engine) });
          }
        });
      }

      const sessionWrites: Evidence["sessionWrites"] = (["render", "semantics"] as const).map((kind) => {
        const ruby = expectedManifest.runs[kind]?.session_writes ?? null;
        const engine = actualMeta.runs[kind]?.session_writes ?? null;
        return { kind, ruby, engine, same: sameJson(ruby, engine) };
      });

      evidence = {
        report,
        gradeStatus: gradeResult.status,
        fixtureProblems,
        compared,
        counts: {
          writeSteps,
          writeActions,
          signinSteps,
          readSteps,
          readStepOps,
        },
        readDeltas,
        sessionWrites,
      };
      // Named so a failure says which of the two fixture halves is missing.
      if (stagedFiles.length !== 16) throw new Error(`staged fixture holds ${stagedFiles.length} files, the manifest lists 15 plus itself`);
    }, 300_000);

    afterAll(() => {
      // scratchDir registers its own removal for the end of the run.
    });

    it('"side effects 19 of 19" — the grade run asserts all 16 write answers (saved or refused, the error messages, the mail sent) and all 3 sign-in answers equal the Ruby oracle answers committed beside the fixture, and the 19 is recounted from ops/scenarios.json', () => {
      const e = evidence;
      // The grade is a grade: a fixture or expected-output problem, an
      // unrun kind or a filtered run would each make it "invalid", and an
      // invalid run reports no pass rate at all.
      expect({ stagedFixtureProblems: e.fixtureProblems, verdict: e.report.verdict, problems: e.report.problems, partial: e.report.partial }).toEqual({
        stagedFixtureProblems: [],
        verdict: "pass",
        problems: [],
        partial: [],
      });
      expect({ exit: e.gradeStatus, oracleVariant: e.report.oracle.variant }).toEqual({ exit: 0, oracleVariant: "stock" });

      const sideEffects = e.report.summary.side_effects;
      expect({ graded: sideEffects.graded, pass: sideEffects.pass, fail: sideEffects.fail, missing: sideEffects.missing, oracleErrors: sideEffects.oracle_errors }).toEqual({
        graded: 19,
        pass: 19,
        fail: 0,
        missing: 0,
        oracleErrors: 0,
      });
      // The four groups the 19 splits into: 8 creates, 6 updates, 2 deletes
      // and the 3 sign-ins.
      expect(Object.fromEntries(Object.entries(sideEffects.groups).map(([g, s]) => [g, s.pass]))).toEqual({
        "write create": 8,
        "write update": 6,
        "write delete": 2,
        "sign-in": 3,
      });
      expect(Object.values(sideEffects.groups).reduce((n, s) => n + s.pass, 0)).toBe(19);

      // The count, recounted from the fixture itself rather than from the
      // grade's tally: 16 write steps (8 create, 6 update, 2 delete) and 3
      // sign-in steps make the 19 side-effect items.
      expect({ ...e.counts.writeActions, writeSteps: e.counts.writeSteps, signinSteps: e.counts.signinSteps, sideEffectSteps: e.counts.writeSteps + e.counts.signinSteps }).toEqual({
        create: 8,
        update: 6,
        delete: 2,
        writeSteps: 16,
        signinSteps: 3,
        sideEffectSteps: 19,
      });

      // Step by step, from the two results directories rather than from the
      // tally: every one of those 19 answers is the oracle's own answer.
      const sideEffectIds = e.compared.filter((c) => c.op === "write" || c.op === "signin").map((c) => c.id);
      expect({ compared: sideEffectIds.length, differing: e.compared.filter((c) => (c.op === "write" || c.op === "signin") && !c.equal).map((c) => c.id) }).toEqual({
        compared: 19,
        differing: [],
      });
    }, 120_000);

    it('"read-writes 8 of 8" — each of the 8 read-write steps returns the same card and leaves the same rows as Ruby\'s: the two whole-session reads wrote nothing, and all 6 read steps inside the scenarios (3 sign-ins, 2 renders, 1 ask) left the same raw row delta', () => {
      const e = evidence;
      expect(e.report.verdict).toBe("pass");
      expect(e.report.read_writes).toEqual({ graded: 8, pass: 8, fail: 0, failures: [] });

      // The 8, recounted from the fixture: the two read sessions (render and
      // semantics) plus every scenario step that is not a write.
      expect({ readSessions: e.sessionWrites.length, readSteps: e.counts.readSteps, total: e.sessionWrites.length + e.counts.readSteps }).toEqual({
        readSessions: 2,
        readSteps: 6,
        total: 8,
      });
      expect(e.counts.readStepOps).toEqual({ signin: 3, render: 2, ask: 1 });

      // Both read sessions wrote no row at all, and wrote exactly what the
      // oracle's read sessions wrote (nothing).
      expect(e.sessionWrites).toEqual([
        { kind: "render", ruby: {}, engine: {}, same: true },
        { kind: "semantics", ruby: {}, engine: {}, same: true },
      ]);

      // Each of the 6 read steps: the answer the oracle recorded, and the raw
      // row delta across every table -- {} on both sides, so a read wrote
      // nothing, not even an autoincrement counter.
      expect({ compared: e.readDeltas.length, differingAnswers: e.compared.filter((c) => c.op !== "write" && !c.equal).map((c) => c.id) }).toEqual({
        compared: 6,
        differingAnswers: [],
      });
      expect(e.readDeltas.map((r) => ({ id: r.id, ruby: r.ruby, engine: r.engine }))).toEqual(
        e.readDeltas.map((r) => ({ id: r.id, ruby: {}, engine: {} })),
      );
    }, 120_000);
  },
);

// ---------------------------------------------------------------------------
// the non-html format families
// ---------------------------------------------------------------------------

interface CaptureLine {
  card: string;
  format: string;
  view: string;
  bytes?: string;
  error?: string;
}

/** The clock the captures were taken under; json's requested_at is the render
 *  clock, so the pin substitutes the fixed value the capture recorded. */
const FIXED_NOW = new Date("2026-09-29T12:00:00.000Z");
const CAPTURED_REQUESTED_AT = '  "requested_at": "2026-09-29 12:00:00 UTC"';

function loadCaptures(file: string): CaptureLine[] {
  return readFileSync(join(SURFACES, file), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as CaptureLine);
}

/** The captured *getting started content, read out of the committed json
 *  capture rather than typed here: it is the item content the Home molecule
 *  nests, and inventing a substitute would change the bytes it is pinned on. */
function capturedGettingStartedContent(): string {
  const home = loadCaptures("json.jsonl").find((l) => l.card === "Home" && l.view === "show_default_molecule");
  const items = (JSON.parse(home?.bytes ?? "{}") as Record<string, unknown>)["items"] as Array<Record<string, unknown>>;
  return items[0]?.["content"] as string;
}

/** One capture's outcome against the engine's answer for it. `verdict` names
 *  the comparison that was made, so nothing is silently counted as a match:
 *    - "byte-identical": every byte of the capture equals the engine's bytes;
 *    - "same-error-raised": Ruby recorded an error and the engine raises the
 *      same one;
 *    - "up-to-declared-cut": identical to a named point, then the error
 *      element is exact and the tail after it is the declared class;
 *    - "view-not-on-the-format-surface": the capture names a view the
 *      engine's format-show entry point does not take, so the engine cannot
 *      be asked for those bytes through it. */
interface FormatResult {
  /** Which of the four format steps this capture belongs to. */
  step: string;
  format: string;
  card: string;
  view: string;
  verdict: "byte-identical" | "same-error-raised" | "up-to-declared-cut" | "view-not-on-the-format-surface";
  ok: boolean;
  detail: string;
}

/** The four format steps the count names, each with the capture file that
 *  holds the answers Ruby gave for it and the settings that capture was
 *  taken under. */
const FORMAT_STEPS: { step: string; format: "csv" | "rss" | "json"; file: string; rssEnabled?: boolean }[] = [
  { step: "csv", format: "csv", file: "csv.jsonl" },
  { step: "rss disabled", format: "rss", file: "rss.jsonl" },
  { step: "rss enabled", format: "rss", file: "rss-enabled.jsonl", rssEnabled: true },
  { step: "json", format: "json", file: "json.jsonl" },
];

/** The one error element both rss-enabled captures carry, with the part that
 *  follows the message line -- Ruby's backtrace, whose entries are this
 *  machine's gem paths -- left out. */
const RSS_ERROR_ELEMENT_HEAD = "<error>\n\nERROR rendering RSS: #&lt;ArgumentError: wrong number of arguments (given 1, expected 0)&gt;\n\n";

/** Where each rss-enabled capture stops agreeing with the engine's answer,
 *  and why. Named, not assumed: the byte before each is compared, and the
 *  error element after it is compared exactly. */
const RSS_DECLARED_CUTS: Record<string, { at: string; why: string }> = {
  "*all+*read": {
    at: ' ["C:/Ruby33',
    why: "the Ruby backtrace inside the error element carries this machine's gem paths; the port replaces it with one labeled line naming itself",
  },
  Home: {
    at: '&lt;div&gt;&lt;div class="container text-center"',
    why: "the feed description's interior is the html :open_content render of cards on the capture's own deck, which this synthetic substrate does not carry",
  },
};

let storage: RenderTestStorage | undefined;
let formatResults: FormatResult[] = [];

function formatOpts(extra?: Partial<FormatShowOptions>): FormatShowOptions {
  const s = storage!;
  return {
    now: () => FIXED_NOW,
    resolveCodenameMark: async (mark: string) => (await s.fetcher.codenames.name(mark))?.s,
    ...extra,
  };
}

function formatEngine(s: RenderTestStorage) {
  return {
    fetchRenderCard: (name: string) => s.engine.fetchRenderCard(name),
    prepareItemForRender: (name: string) => s.engine.prepareItemForRender(name),
    render: (name: string, view: string) => s.engine.render(name, view),
    codenameById: async (id: number) => await s.fetcher.codenames.nameForId(id),
  };
}

/** json's requested_at is the render clock, so the capture's own line is
 *  replaced with the fixed-clock line on both sides before comparing. */
const withFixedClock = (text: string) => text.split("\n").map((l) => (l.includes('"requested_at"') ? CAPTURED_REQUESTED_AT : l)).join("\n");

const firstDifference = (a: string, b: string) => [...a].findIndex((ch, i) => ch !== b[i]);

/** Ask the engine for one card's bytes in one format and compare them with
 *  what the Ruby oracle recorded for the same card and view. */
async function compareFormat(step: string, format: "csv" | "rss" | "json", capture: CaptureLine, opts: FormatShowOptions): Promise<FormatResult> {
  const base = { step, format, card: capture.card, view: capture.view };
  // The json surface takes no view argument (src/card/render/format-families.ts
  // renderFormatShow), and this substrate registers no format-mod views, so a
  // capture of :status or :atom is not something the surface can be asked.
  if (format === "json" && capture.view !== "show_default_molecule") {
    let refused = "";
    try {
      await storage!.engine.render(capture.card, capture.view);
    } catch (error) {
      refused = (error as Error).message;
    }
    return {
      ...base,
      verdict: "view-not-on-the-format-surface",
      ok: refused === `view (${capture.view}) not supported for ${capture.card}`,
      detail: refused,
    };
  }

  let out: string;
  try {
    out = await renderFormatShow(formatEngine(storage!), capture.card, format, opts);
  } catch (error) {
    const message = (error as Error).message;
    // Ruby's captured error names a class and a message; the engine raises the
    // same one, which is the answer for a step Ruby could not render either.
    const wanted = capture.error?.split(": ").slice(1).join(": ") ?? "";
    return { ...base, verdict: "same-error-raised", ok: capture.error !== undefined && message.includes(wanted), detail: message };
  }
  if (capture.error !== undefined) {
    return { ...base, verdict: "same-error-raised", ok: false, detail: `engine returned bytes where Ruby raised ${capture.error}` };
  }

  if (step === "rss enabled") {
    const cut = RSS_DECLARED_CUTS[capture.card];
    const at = (capture.bytes ?? "").indexOf(cut?.at ?? "\u0000");
    const head = (capture.bytes ?? "").slice(0, at);
    const frameMatches = at >= 0 && out.startsWith(head);
    const errorAt = out.indexOf(RSS_ERROR_ELEMENT_HEAD);
    const errorExact = errorAt >= 0 && out.endsWith("</error>");
    return {
      ...base,
      verdict: "up-to-declared-cut",
      ok: frameMatches && errorExact,
      detail: `frame of ${head.length} bytes ${frameMatches ? "identical" : "differs at " + firstDifference(head, out)}; ${
        errorExact ? "error element exact" : `error element differs at ${firstDifference(RSS_ERROR_ELEMENT_HEAD, out.slice(errorAt < 0 ? 0 : errorAt))}`
      }; cut: ${cut?.why}`,
    };
  }

  const want = format === "json" ? withFixedClock(capture.bytes ?? "") : capture.bytes ?? "";
  const got = format === "json" ? withFixedClock(out) : out;
  const matched = got === want;
  return {
    ...base,
    verdict: "byte-identical",
    ok: matched,
    detail: matched
      ? `${want.length} bytes identical`
      : `first difference at ${firstDifference(want, got)}: want ${JSON.stringify(want.slice(firstDifference(want, got), firstDifference(want, got) + 60))}, got ${JSON.stringify(got.slice(firstDifference(want, got), firstDifference(want, got) + 60))}`,
  };
}

describeOrSkipLoud(!HAVE_GRADE, "tests/exercise/parity-2.test.ts", "HAVE_GRADE")(
  "json, csv and rss byte identity on the captured test cards",
  () => {
    beforeAll(async () => {
      storage = await createRenderTestStorage();
      const s = storage;
      const gettingStarted = capturedGettingStartedContent();
      // The captured substrate: the card types, the setting and set rows, the
      // *all+*read read rule with its single referee, and the two cards the
      // format captures were taken on.
      await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 13, name: "Set", codename: "set", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 14, name: "Setting", codename: "setting", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 4, name: "List", codename: "list", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 39, name: "HTML", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 177, name: "Role", codename: "role", typeName: "Cardtype", typeId: 5 });
      await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 13, typeName: "Set" });
      await seedCard(s, { id: 9, name: "*read", codename: "read", typeId: 14, typeName: "Setting" });
      await seedCard(s, { id: 12, name: "*title", codename: "title", typeId: 14, typeName: "Setting" });
      await seedCard(s, { id: 1013, name: "*all+*title", leftId: 7, rightId: 12, typeId: 14, typeName: "Setting", dbContent: "My Deck" });
      await seedCard(s, { id: 180, name: "Anyone", codename: "anyone", typeId: 177, typeName: "Role", dbContent: "", readRuleId: 10, readRuleClass: "*all" });
      await seedCard(s, { id: 10, name: "*all+*read", leftId: 7, rightId: 9, typeId: 4, typeName: "List", dbContent: "Anyone", createdAt: "2025-07-01 17:29:22", updatedAt: "2025-07-01 17:29:34" });
      await seedReference(s, 10, 180, "anyone");
      await seedCard(s, {
        id: 521,
        name: "Home",
        codename: "default_home",
        typeId: 2,
        typeName: "RichText",
        dbContent: '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n',
        createdAt: "2025-07-01 17:31:51",
        updatedAt: "2025-07-01 17:31:51",
        readRuleId: 10,
        readRuleClass: "*all",
      });
      await seedCard(s, { id: 534, name: "*getting started", codename: "getting_started", typeId: 39, typeName: "HTML", dbContent: gettingStarted, readRuleId: 10, readRuleClass: "*all" });
      s.fetcher.installNameEnvironment();
      await s.fetcher.codenames.ensureLoaded();

      // The four format steps, each over every capture the Ruby oracle
      // recorded for it.
      for (const { step, format, file, rssEnabled } of FORMAT_STEPS) {
        for (const capture of loadCaptures(file)) {
          formatResults.push(await compareFormat(step, format, capture, formatOpts({ rssEnabled })));
        }
      }
    }, 60_000);

    afterAll(() => {
      storage?.close();
    });

    it('"JSON, CSV and RSS are byte-identical on the test cards (4 of 4 format steps)" — all four captured format steps (csv, rss disabled, rss enabled, json) answer exactly as the Ruby oracle recorded them: every capture the engine\'s format-show surface can be asked for matches byte for byte, the capture Ruby raised on raises the same error, and the two named exclusions are stated rather than counted as matches', () => {
      // The four steps the count names, and every capture under each -- all
      // twelve are listed, so nothing is quietly dropped.
      const byStep = new Map<string, FormatResult[]>();
      for (const result of formatResults) byStep.set(result.step, [...(byStep.get(result.step) ?? []), result]);
      expect([...byStep.keys()]).toEqual(["csv", "rss disabled", "rss enabled", "json"]);
      expect(formatResults.map((r) => ({ step: r.step, card: r.card, view: r.view }))).toEqual([
        { step: "csv", card: "*all+*read", view: "show_default_titled" },
        { step: "csv", card: "Home", view: "show_default_titled" },
        { step: "rss disabled", card: "*all+*read", view: "show_default_feed" },
        { step: "rss disabled", card: "Home", view: "show_default_feed" },
        { step: "rss enabled", card: "*all+*read", view: "show_default_feed" },
        { step: "rss enabled", card: "Home", view: "show_default_feed" },
        { step: "json", card: "*all+*read", view: "show_default_molecule" },
        { step: "json", card: "*all+*read", view: "status" },
        { step: "json", card: "*all+*read", view: "atom" },
        { step: "json", card: "Home", view: "show_default_molecule" },
        { step: "json", card: "Home", view: "status" },
        { step: "json", card: "Home", view: "atom" },
      ]);

      // 4 of 4 steps; 8 captures the surface can answer, 5 of them
      // byte-identical outright (1 csv, 2 rss disabled, 2 json molecule); 1
      // raised on both sides; 2 identical to a declared cut with the error
      // element exact; 4 name a view the format-show surface does not take.
      const verdicts = formatResults.reduce<Record<string, number>>((counts, r) => ({ ...counts, [r.verdict]: (counts[r.verdict] ?? 0) + 1 }), {});
      expect({ steps: byStep.size, captures: formatResults.length, verdicts }).toEqual({
        steps: 4,
        captures: 12,
        verdicts: { "byte-identical": 5, "same-error-raised": 1, "up-to-declared-cut": 2, "view-not-on-the-format-surface": 4 },
      });
      expect(formatResults.filter((r) => !r.ok)).toEqual([]);

      // The two declared exclusions, stated with their reason. They are the
      // only bytes in these twelve captures that are not compared, and both
      // are named rather than assumed: the Ruby backtrace (this machine's gem
      // paths) and the Home feed's description interior (cards on the
      // capture's own deck, not on this synthetic substrate).
      expect(Object.fromEntries(Object.entries(RSS_DECLARED_CUTS).map(([card, cut]) => [card, (loadCaptures("rss-enabled.jsonl").find((l) => l.card === card)?.bytes ?? "").includes(cut.at)]))).toEqual({
        "*all+*read": true,
        Home: true,
      });
    }, 120_000);
  },
);

// ---------------------------------------------------------------------------
// the write-battery recording the published 70/70 + 90/90 counts rest on
// ---------------------------------------------------------------------------

interface BatteryManifest {
  files: Record<string, string>;
  provenance?: Record<string, unknown>;
}

/** The committed synthetic write-battery fixture: the deck the write probe's
 *  70 operations and the scenario battery's 90 steps run against, and the
 *  Ruby oracle's recordings beside it. The two suites that exercise the
 *  claims live in tests/tools/ (persist-write-probe.test.ts and
 *  side-effects-scenario-battery.test.ts); this case pins the committed
 *  recording those published counts rest on: its shape, its integrity, and
 *  the differences it declares. The write probe's public recording is the
 *  67 steps the withheld set does not claim; the withheld set's own
 *  recordings live under withheld/ and are excluded from a release
 *  package, so nothing here pins them. */
describe("the committed write-battery recording behind the published write counts", () => {
  const BATTERY_FIXTURE = join(REPO, "reference-harness", "fixtures", "write-battery-v1");
  const BATTERY_MANIFEST = join(BATTERY_FIXTURE, "MANIFEST.json");
  const PERSIST_STEPS = join(BATTERY_FIXTURE, "expected", "persist-steps");

  it("holds one committed synthetic deck with the public 67-step Ruby probe recording and an 88-step Ruby scenario trace on it, integrity-gated by its manifest, with the 2 public probe differences declared", () => {
    // Integrity: the fixture's own manifest pins the sha256 of the deck and
    // of both recordings, exactly as the reference-harness fixtures do.
    expect(existsSync(BATTERY_MANIFEST), "the fixture has a MANIFEST.json").toBe(true);
    const manifest = JSON.parse(readFileSync(BATTERY_MANIFEST, "utf8")) as BatteryManifest;
    const pinned = Object.keys(manifest.files);
    for (const required of [
      "deck.json",
      "deck/deck.sqlite3",
      "expected/persist-steps/deliberate-differences.json",
      "expected/persist-steps/ruby-outside-delta.json",
      "expected/side-effects-ruby.json",
    ]) {
      expect(pinned, `${required} is pinned by the manifest`).toContain(required);
    }
    // The public probe recording: every step of the 70-step op list the
    // withheld set does not claim (withheld/steps.json, excluded from a
    // release package). Its own full-list recording lives beside it under
    // withheld/persist-steps/ and is not pinned by this manifest.
    expect(pinned.filter((rel) => /^expected\/persist-steps\/step-\d+\.json$/.test(rel)).length).toBe(67);
    const drifted = pinned.filter((rel) => {
      const file = join(BATTERY_FIXTURE, rel);
      return !existsSync(file) || createHash("sha256").update(readFileSync(file)).digest("hex") !== manifest.files[rel];
    });
    expect(drifted, "every pinned file hashes to its manifest value").toEqual([]);

    // The write probe's Ruby truth: one recorded state per operation, plus
    // the deliberate differences the recording declares — every engine/Ruby
    // divergence stated with its step number and reason rather than hidden.
    const steps = readdirSync(PERSIST_STEPS).filter((f) => /^step-\d+\.json$/.test(f));
    expect(steps.length).toBe(67);
    // The withheld steps' declarations and recordings are NOT public: the
    // public set declares only the differences the public run can still see.
    const declarations = JSON.parse(
      readFileSync(join(PERSIST_STEPS, "deliberate-differences.json"), "utf8"),
    ) as { differences: { step: number; reason: string }[] };
    expect(declarations.differences.map((d) => d.step).sort((a, b) => a - b)).toEqual([7, 67]);
    expect(declarations.differences.every((d) => d.reason.length > 40)).toBe(true);

    // The scenario battery's Ruby truth: the PUBLIC scenario list (the
    // withheld step set is excluded from a release package), no blocked
    // network attempt. Its verdicts are pinned step by step in
    // tests/tools/side-effects-scenario-battery.test.ts.
    const ruby = JSON.parse(readFileSync(join(BATTERY_FIXTURE, "expected", "side-effects-ruby.json"), "utf8")) as {
      engine: string;
      network_blocked: string[];
      steps: unknown[];
    };
    expect({ engine: ruby.engine, blocked: ruby.network_blocked, steps: ruby.steps.length }).toEqual({
      engine: "ruby-decko",
      blocked: [],
      steps: 88,
    });
    const battery = JSON.parse(readFileSync(join(REPO, "tools", "parity-side-effects", "scenarios.json"), "utf8")) as {
      steps: { name: string; deliberate?: unknown }[];
    };
    const pins = battery.steps.filter((s) => s.deliberate).map((s) => s.name);
    expect(pins.length).toBe(4);

    // The provenance: how the recordings were made, in the manifest itself.
    const provenance = manifest.provenance as Record<string, string> | undefined;
    expect(provenance?.deck_builder ?? "").toMatch(/build-deck\.sh/);
    expect(provenance?.scenario_recording ?? "").toMatch(/drive\.rb/);
    expect(provenance?.probe_recording ?? "").toMatch(/run-ruby-steps\.sh/);
  });
});