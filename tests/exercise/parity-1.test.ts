// Byte-for-byte parity with Ruby Decko on the public synthetic deck.
//
// WHAT RUNS HERE. One reference-harness run over EVERY operation in
// reference-harness/fixtures/synthetic-v1, graded against the Ruby oracle's
// committed answers — the exact pair of commands the README names:
//
//   node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
//        --fixture reference-harness/fixtures/synthetic-v1 --out <dir>
//   node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
//        --actual <dir>
//
// The run happens once, in beforeAll, and the four cases below read its grade
// report: one grade, four separate claims, so the run is not repeated per
// assertion. Measured cost on this checkout: run 26 s, grade 4 s.
//
// WHAT IS COMMITTED. The deck, its files, the operations and the oracle's
// answers are all committed under reference-harness/fixtures/synthetic-v1/;
// reference-harness/adapters/ts/adapter.json runs this checkout's engine with
// Node. No Ruby, no network, no hosted service, no local data beyond the
// checkout — the same guarantee the fixture's own README gives. The deck
// itself was built by stock Ruby Decko (deck.json base: decko 0.20.0,
// card 1.110.0) and its expected/MANIFEST.json declares the stock oracle, so
// "matches Ruby" here means matches unpatched Ruby Decko.
//
// DATA RULE. Zero real content: this file names no card, user, address or
// document of its own. Every deck fact it reads comes from the committed
// synthetic fixture (synthetic names, example.test addresses, a frozen clock).
//
// TWO PUBLISHED COUNTS, ONE GRADE. README.md:23 quotes 1,754 renders and 2,389
// semantics operations; docs/coverage-inventory.md:60 quotes 1,752
// render operations and 2,388 semantics operations. They are the same grade
// counted two ways: the ops files hold 1,752 render and 2,388 semantics
// operations, and the grader also grades the render and ask steps that run
// AFTER a write, inside the scenarios. 1,752 + 2 = 1,754 and
// 2,388 + 1 = 2,389. Both cases below assert the arithmetic, so neither
// number is pinned on faith.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, expect, it } from "vitest";

import { describeOrSkipLoud } from "../support/describe-with-corpus.js";
import { scratchDir } from "../support/scratch-dir.mjs";
// @ts-expect-error plain ESM module without type declarations
import { normalizeHtml } from "../../reference-harness/runner/normalize.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const HARNESS = "reference-harness";
const FIXTURE = `${HARNESS}/fixtures/synthetic-v1`;
const FIXTURE_DIR = join(REPO, HARNESS, "fixtures", "synthetic-v1");
const DECK = join(FIXTURE_DIR, "deck", "deck.sqlite3");
const HAVE_FIXTURE =
  existsSync(DECK) &&
  existsSync(join(FIXTURE_DIR, "expected", "MANIFEST.json")) &&
  existsSync(join(FIXTURE_DIR, "ops", "render.jsonl"));

interface ResultLine {
  id: string;
  result?: unknown;
  error?: { class: string; message: string };
}
interface ScenarioStep {
  op: "render" | "ask" | "write" | "signin";
  action?: string;
  rows?: Record<string, unknown>;
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
  warnings: string[];
  summary: Record<string, Tally>;
  read_writes: { graded: number; pass: number; fail: number };
  other_tables: { graded: number; pass: number; declared: number; fail: number };
  oracle: { variant: string | null; patches: unknown[] | null };
  engine: { protocol?: number; adapter?: string } | null;
}

/** Everything the four cases read, collected once by beforeAll. */
interface Evidence {
  report: GradeReport;
  reportText: string;
  gradeStatus: number;
  /** This run's private copy of the fixture deck (see readDeckMix). */
  deckCopy: string;
  renderOps: number;
  semanticsOps: number;
  scenarios: { id: string; steps: ScenarioStep[] }[];
  writeSteps: { id: string; action: string }[];
  deckBase: { seed: string; decko: string; card: string };
  deckMix: { cards: number; cardtypes: number; mods: number; settings: number };
  coverageLines: { line: number; text: string }[];
  expectedRenders: Map<string, ResultLine>;
  actualRenders: Map<string, ResultLine>;
  expectedScenarios: ScenarioLine[];
  actualScenarios: ScenarioLine[];
}

let evidence: Evidence;

const readJsonl = (file: string): ResultLine[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ResultLine);

const readJsonlGz = (file: string): ResultLine[] =>
  gunzipSync(readFileSync(file))
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ResultLine);

function run(args: string[]): { status: number; out: string; err: string } {
  const r = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const tail = (text: string, lines = 25) => text.trimEnd().split("\n").slice(-lines).join("\n");

/** A deck's shape, read from a COPY of the committed fixture: the "any
 *  combination of mods, cards and settings" the claim's sentence names.
 *
 *  The copy is not decoration. Opening a WAL-mode SQLite file leaves its
 *  -wal and -shm sidecars beside it, and the harness verifies the fixture
 *  directory against reference-harness/fixtures/synthetic-v1/MANIFEST.json,
 *  which lists no such files: reading the committed deck in place would leave
 *  two untracked files in the fixture and make every later grade of this
 *  fixture report "fixture file not in its manifest". The runner copies the
 *  deck per session for the same reason. */
function readDeckMix(deckPath: string): Evidence["deckMix"] {
  const db = new DatabaseSync(deckPath, { readOnly: true });
  try {
    const one = (sql: string, ...params: unknown[]) => db.prepare(sql).get(...(params as never[])) as { id: number };
    const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...(params as never[])) as { c: number }).c;
    const children = (type: string) => count("SELECT COUNT(*) AS c FROM cards WHERE type_id = ? AND trash = 0", one("SELECT id FROM cards WHERE name = ? AND trash = 0", type).id);
    return {
      cards: count("SELECT COUNT(*) AS c FROM cards WHERE trash = 0"),
      cardtypes: children("Cardtype"),
      mods: children("Mod"),
      settings: children("Setting"),
    };
  } finally {
    db.close();
  }
}

/** The card tables the 16 write steps actually left rows in, from one set of
 *  scenario results. A table no write touched cannot be compared, so it is
 *  reported as absent rather than assumed present. */
function deltaTables(lines: ScenarioLine[], scenarios: { id: string; steps: ScenarioStep[] }[]): string[] {
  const stepsOf = new Map(scenarios.map((s) => [s.id, s.steps]));
  const tables = new Set<string>();
  for (const line of lines) {
    const steps = stepsOf.get(line.id) ?? [];
    line.steps.forEach((step, i) => {
      if (steps[i]?.op !== "write") return;
      for (const table of Object.keys(step.rows ?? {})) tables.add(table);
    });
  }
  return [...tables].sort();
}

describeOrSkipLoud(!HAVE_FIXTURE, "tests/exercise/parity-1.test.ts", "HAVE_FIXTURE")(
  "byte-for-byte parity with Ruby Decko on the synthetic-v1 deck",
  () => {
    beforeAll(() => {
      const outDir = scratchDir("decko-parity-grade-");
      const resultsDir = join(outDir, "results");
      const reportFile = join(outDir, "grade-report.json");
      const deckCopy = join(outDir, "deck-copy.sqlite3");
      copyFileSync(DECK, deckCopy);

      // 1. every operation, through this checkout's engine.
      const runResult = run([
        `${HARNESS}/runner/run.mjs`,
        "--adapter",
        `${HARNESS}/adapters/ts/adapter.json`,
        "--fixture",
        FIXTURE,
        "--out",
        resultsDir,
      ]);
      if (runResult.status !== 0) {
        throw new Error(`run.mjs exited ${runResult.status}\n--- stderr tail ---\n${tail(runResult.err, 40)}`);
      }

      // 2. the grade against the committed Ruby answers.
      const gradeResult = run([
        `${HARNESS}/runner/grade.mjs`,
        "--fixture",
        FIXTURE,
        "--actual",
        resultsDir,
        "--report",
        reportFile,
      ]);
      const report = JSON.parse(readFileSync(reportFile, "utf8")) as GradeReport;

      const scenarios = (JSON.parse(readFileSync(join(FIXTURE_DIR, "ops", "scenarios.json"), "utf8")) as {
        scenarios: { id: string; steps: ScenarioStep[] }[];
      }).scenarios;
      const writeSteps: Evidence["writeSteps"] = [];
      for (const scenario of scenarios) {
        scenario.steps.forEach((step, i) => {
          if (step.op === "write") writeSteps.push({ id: `${scenario.id}#${i + 1}`, action: step.action ?? "" });
        });
      }

      const coverageLines = readFileSync(join(REPO, "docs", "coverage-inventory.md"), "utf8")
        .split("\n")
        .map((text, i) => ({ line: i + 1, text }))
        .filter(({ text }) => text.includes("2,388") || text.includes("1,752"));

      const expectedRenders = new Map(readJsonlGz(join(FIXTURE_DIR, "expected", "render.jsonl.gz")).map((l) => [l.id, l]));
      const actualRenders = new Map(readJsonl(join(resultsDir, "render.jsonl")).map((l) => [l.id, l]));

      evidence = {
        report,
        reportText: gradeResult.out,
        gradeStatus: gradeResult.status,
        deckCopy,
        renderOps: readJsonl(join(FIXTURE_DIR, "ops", "render.jsonl")).length,
        semanticsOps: readJsonl(join(FIXTURE_DIR, "ops", "semantics.jsonl")).length,
        scenarios,
        writeSteps,
        deckBase: (JSON.parse(readFileSync(join(FIXTURE_DIR, "deck.json"), "utf8")) as { base: Evidence["deckBase"] }).base,
        deckMix: readDeckMix(deckCopy),
        coverageLines,
        expectedRenders,
        actualRenders,
        expectedScenarios: readJsonl(join(FIXTURE_DIR, "expected", "scenarios.jsonl")) as ScenarioLine[],
        actualScenarios: readJsonl(join(resultsDir, "scenarios.jsonl")) as ScenarioLine[],
      };
    }, 300_000);

    it("Target: full compatibility with Ruby Decko (card 1.110.0 / decko 0.20.0) for ANY deck — any combination of mods, cards, and settings ... the acceptance criterion is byte-for-byte output parity. — every operation of a deck mixing 36 mods, 43 card types and 23 settings comes back byte-identical to the stock Ruby oracle's committed answers, and the grade reports zero failing items on every kind", () => {
      const e = evidence;
      expect(e.gradeStatus).toBe(0);
      expect(e.report.verdict).toBe("pass");
      expect(e.report.problems).toEqual([]);
      expect(e.report.partial).toEqual([]);
      // The oracle the answers came from is unpatched Ruby Decko at the two
      // versions the claim names — nothing here is parity with a changed Decko.
      expect(e.report.oracle.variant).toBe("stock");
      expect(e.report.oracle.patches).toEqual([]);
      expect(e.deckBase).toEqual({ seed: "decko setup", decko: "0.20.0", card: "1.110.0" });
      // "any combination of mods, cards and settings", as a built deck carries it.
      expect(e.deckMix).toEqual({ cards: 910, cardtypes: 43, mods: 36, settings: 23 });
      // Nothing anywhere in the four kinds failed, and nothing was left ungraded.
      expect(Object.fromEntries(Object.entries(e.report.summary).map(([kind, s]) => [kind, { graded: s.graded, pass: s.pass, fail: s.fail, missing: s.missing, rate: s.rate }]))).toEqual({
        rendering: { graded: 1754, pass: 1754, fail: 0, missing: 0, rate: 100 },
        semantics: { graded: 2389, pass: 2389, fail: 0, missing: 0, rate: 100 },
        persistence: { graded: 16, pass: 16, fail: 0, missing: 0, rate: 100 },
        side_effects: { graded: 19, pass: 19, fail: 0, missing: 0, rate: 100 },
      });
      expect({ read_writes: e.report.read_writes.fail, other_tables: e.report.other_tables.fail, declared: e.report.other_tables.declared }).toEqual({ read_writes: 0, other_tables: 0, declared: 0 });

      // The grader's own printed summary, the artifact an operator reads, ties
      // to the same numbers the report file carries.
      const printed = e.reportText.replace(/[ \t]+/g, " ").trim();
      for (const line of ["rendering 1754 / 1754", "semantics 2389 / 2389", "persistence 16 / 16", "side_effects 19 / 19", "verdict: pass"]) {
        expect(printed).toContain(line);
      }

      // The byte claim itself, read straight from the two result files rather
      // than from the grade's tally: every render op's html, character for
      // character, equals the Ruby oracle's committed html. The harness's one
      // mask (N1, Ruby's random data-slot-id) is applied to both sides; every
      // other byte, including comments, script bodies and attribute values, is
      // compared as it came back.
      const mismatched: string[] = [];
      for (const [id, expected] of e.expectedRenders) {
        const actual = e.actualRenders.get(id);
        const want = (expected.result as { html?: string } | undefined)?.html;
        const got = (actual?.result as { html?: string } | undefined)?.html;
        if (typeof want !== "string" || typeof got !== "string" || normalizeHtml(want) !== normalizeHtml(got)) {
          mismatched.push(id);
        }
      }
      expect({ ops: e.renderOps, expected: e.expectedRenders.size, actual: e.actualRenders.size, mismatched: mismatched.length }).toEqual({
        ops: 1752,
        expected: 1752,
        actual: 1752,
        mismatched: 0,
      });
    }, 120_000);

    it("rendering 1,754 of 1,754 — the grade's rendering tally is 1,754 graded and 1,754 passing, which is the fixture's 1,752 render operations plus the 2 render steps that run after a write", () => {
      const e = evidence;
      const rendering = e.report.summary.rendering;
      expect({ graded: rendering.graded, pass: rendering.pass, fail: rendering.fail, rate: rendering.rate }).toEqual({
        graded: 1754,
        pass: 1754,
        fail: 0,
        rate: 100,
      });
      // Each view/actor lane is the fixture's 292 pages of one view and actor.
      expect(Object.fromEntries(Object.entries(rendering.groups).map(([g, s]) => [g, s.pass]))).toEqual({
        "page / anonymous": 292,
        "view / anonymous": 292,
        "page / member": 292,
        "view / member": 292,
        "page / admin": 292,
        "view / admin": 292,
        "after write": 2,
      });
      expect(Object.values(rendering.groups).reduce((n, s) => n + s.graded, 0)).toBe(1754);
      // The two published counts, reconciled against the fixture rather than
      // against each other: README.md:19/23 quote 1,754 (the tally above),
      // docs/coverage-inventory.md:60 quotes 1,752 (the ops file), and the two
      // render steps inside the scenarios are exactly the difference.
      const renderSteps = e.scenarios.flatMap((s) => s.steps.filter((step) => step.op === "render")).length;
      expect({ ops_file: e.renderOps, render_steps_in_scenarios: renderSteps, sum: e.renderOps + renderSteps }).toEqual({
        ops_file: 1752,
        render_steps_in_scenarios: 2,
        sum: 1754,
      });
      expect(e.renderOps).toBe(e.expectedRenders.size);
    });

    it("semantics 2,389 of 2,389 — the grade's semantics tally is 2,389 graded and 2,389 passing; the 2,388 that docs/coverage-inventory.md:20 and :66 both publish is the ops file, and the one ask step that follows a write is the whole difference", () => {
      const e = evidence;
      const semantics = e.report.summary.semantics;
      expect({ graded: semantics.graded, pass: semantics.pass, fail: semantics.fail, rate: semantics.rate }).toEqual({
        graded: 2389,
        pass: 2389,
        fail: 0,
        rate: 100,
      });
      // Every op family the fixture carries, and the one after-write answer.
      expect(Object.fromEntries(Object.entries(semantics.groups).map(([g, s]) => [g, s.pass]))).toEqual({
        card: 292,
        sets: 290,
        rule: 870,
        perm: 876,
        search: 36,
        name: 24,
        "after write": 1,
      });
      expect(Object.values(semantics.groups).reduce((n, s) => n + s.graded, 0)).toBe(2389);

      // The reconciliation the two published counts need: the ops file holds
      // 2,388 semantics operations, and the grader adds the single ask step
      // that runs after a write. Pinning either number alone would hide the
      // other; both are pinned here, with the arithmetic that joins them.
      const askSteps = e.scenarios.flatMap((s) => s.steps.filter((step) => step.op === "ask")).length;
      expect({ ops_file: e.semanticsOps, ask_steps_in_scenarios: askSteps, sum: e.semanticsOps + askSteps }).toEqual({
        ops_file: 2388,
        ask_steps_in_scenarios: 1,
        sum: 2389,
      });
      // Both places the 2,388 figure is published, still saying 2,388.
      expect(e.coverageLines.filter(({ text }) => text.includes("2,388")).map(({ line }) => line)).toEqual([20, 66]);
      expect(e.coverageLines.filter(({ text }) => text.includes("2,388")).every(({ text }) => text.includes("2,388 semantics operations"))).toBe(true);
    });

    it("persistence 16 of 16 — each of the 16 write steps in ops/scenarios.json leaves the same raw card-table row delta as Ruby, and the deltas it is graded on cover five of the six card tables", () => {
      const e = evidence;
      const persistence = e.report.summary.persistence;
      expect({ graded: persistence.graded, pass: persistence.pass, fail: persistence.fail, rate: persistence.rate }).toEqual({
        graded: 16,
        pass: 16,
        fail: 0,
        rate: 100,
      });
      // The 16 write steps are the fixture's own: 8 create, 6 update, 2 delete.
      expect(Object.fromEntries(Object.entries(persistence.groups).map(([g, s]) => [g, s.pass]))).toEqual({
        "write create": 8,
        "write update": 6,
        "write delete": 2,
      });
      const byAction = (actions: string[]) =>
        actions.reduce<Record<string, number>>((counts, action) => ({ ...counts, [action]: (counts[action] ?? 0) + 1 }), {});
      expect(byAction(e.writeSteps.map((s) => s.action))).toEqual({ create: 8, update: 6, delete: 2 });
      expect(e.writeSteps.length).toBe(16);

      // The row deltas themselves, table by table, on both sides of the
      // comparison: the engine's deltas touch exactly the tables Ruby's do.
      const expectedTables = deltaTables(e.expectedScenarios, e.scenarios);
      const actualTables = deltaTables(e.actualScenarios, e.scenarios);
      expect({ ruby: expectedTables, engine: actualTables }).toEqual({
        ruby: ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
        engine: ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
      });
      // card_virtuals is the sixth table of the harness's card-table set
      // (reference-harness/runner/deck-state.mjs CARD_TABLES) and the deck
      // holds virtual rows, but not one of the 16 writes creates, updates or
      // deletes one: there is no virtual delta to compare, and this asserts
      // that rather than implying a sixth comparison happened.
      expect(actualTables).not.toContain("card_virtuals");
      const db = new DatabaseSync(e.deckCopy, { readOnly: true });
      try {
        expect((db.prepare("SELECT COUNT(*) AS c FROM card_virtuals").get() as { c: number }).c).toBeGreaterThan(0);
      } finally {
        db.close();
      }
    });
  },
);