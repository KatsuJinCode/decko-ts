// The 90-step side-effects scenario battery, on the committed synthetic
// write-battery fixture. Public by default: the deck and the Ruby oracle's
// recorded trace are committed beside this checkout
// (reference-harness/fixtures/write-battery-v1), so the run needs Node, the
// engine, and the battery's own two build artifacts -- no private deck, no
// Ruby, no env vars.
//
// WHAT RUNS HERE. The battery's own machinery, unchanged, on the committed
// inputs:
//
//   node tools/parity-side-effects/ts-drive.mjs <deck.sqlite3> <work>
//        > ts.json     (the TypeScript engine driven through the 87
//                       HTTP-shaped steps tools/parity-side-effects/
//                       scenarios.json lists, trace written to stdout)
//   node tools/parity-side-effects/compare.mjs <ruby.json> ts.json report
//                     (the step-by-step verdict: status, errors, row-count
//                     deltas, actions, mail, files, image variants,
//                     virtuals, session identity)
//
// THE DIVERGENCES THIS SUITE PINS. The public scenario list is 87 steps:
// the three steps whose declared difference is withheld until disclosure live
// in the withheld set (tools/parity-side-effects/withheld/scenarios.json, excluded
// from every release package) and are announced on stderr when they are not
// run. On the clean synthetic deck the recorded verdicts are 78 pass +
// 9 declared + 0 mismatched (87 steps) in the default mode, and the
// assertions below name every one of them: four steps whose declared
// differences Ruby's own crashes or bundle naming cause, two re-stores of
// identical bundle bytes that the default mode's content addressing files
// under a name the deck already holds, and three sign-in steps declared
// against docs/SECURITY.md approved divergence 4 (the port's uniform sign-in
// and forgot-password answers). The second test runs the same battery with
// all four DECKO_STRICT_PARITY_* switches on (src/card/parity/
// strict-parity-flags.ts) and the comparator in its strict mode: the six
// differences those switches erase are gone (86 pass + 1 declared + 0
// mismatch), which is the one-to-one proof against the same recording. The
// Ruby recording is committed
// (expected/side-effects-ruby.json) over the same public list: re-recorded
// when the public list changes, or, for a withheld step, cut from the
// full-list recording with every public verdict unchanged; this suite pins the exact current
// verdicts, so any engine change here fails loudly.
//
// THE RECORDING'S ENVIRONMENT. tools/parity-side-effects/ruby/drive.rb boots the oracle under
// RAILS_ENV=production with the stock production configuration (the harness
// arrangements in drive.rb keep files, mail and network local and touch no
// rendering or asset setting): rescue_all_in_controller true and consider_all_requests_local
// false (the public error page, no backtrace), asset_refresh :cautious
// (card-1.110.0 lib/cardio/railtie.rb:34; the first request refreshes the
// asset inputs and bundles) and compress_assets true (:35; every script leaf
// minified by Uglifier, card-mod-script 00_script.rb:18-27). The trace records
// those settings in its environment field and the assertions below check
// them. ts-drive.mjs runs the port with the same configuration: the
// :cautious refresh trigger and the vendored Uglifier engine
// (src/card/assets/uglify-harmony-compile-engine.ts), so every stored script
// bundle is compared byte for byte (by sha256) with Ruby's minified one.
//
// Neither engine's
// behavior changes in this suite; the errors field is compared through
// compare.mjs's own extractors, which must agree about what an error page
// is (both engines render the same card-mod-format alert).
//
// BUILD ARTIFACTS (not committed, like node_modules): ts-drive.mjs runs the
// engine from dist/ (built here with tsc from the committed sources) and
// compiles the skin SCSS the way the Ruby oracle does (the LibSass program
// tools/libsass/build-native.mjs builds, from the vendored MIT-licensed
// LibSass 3.6.4 source in tools/libsass/libsass — a C++11 compiler must be
// on PATH). Both are built by this suite on first use, so a clean checkout
// runs everything; a failed build fails loudly with the error.
//
// DATA RULE. Zero real content: the deck, the scenarios and the recorded
// trace hold synthetic names, example.com addresses and generated fixtures
// only.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = join(REPO, "reference-harness", "fixtures", "write-battery-v1");
const DECK = join(FIXTURE, "deck", "deck.sqlite3");
const RUBY_TRACE = join(FIXTURE, "expected", "side-effects-ruby.json");
const MANIFEST = join(FIXTURE, "MANIFEST.json");
const BATTERY = join(REPO, "tools", "parity-side-effects");
const TS_DRIVE = join(BATTERY, "ts-drive.mjs");
const COMPARE = join(BATTERY, "compare.mjs");
const SCENARIOS = join(BATTERY, "scenarios.json");
// The engine ts-drive.mjs loads (dist/src/...) and the SCSS compiler it
// spawns; both are build artifacts this checkout documents but does not carry.
const DIST_ENGINE = join(REPO, "dist", "src", "server", "write-routes.js");
const SASSC = join(
  REPO,
  "tools",
  "libsass",
  "build",
  process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin",
);
// The fixture deck is Ruby-built: the drive runs with the storage policy a
// deck Ruby also serves (legacy-sha1), so sign-ins verify without upgrading
// any digest row. An operator-set value wins. PARITY_STRICT is pinned empty
// so an operator's strict-mode shell variable cannot flip the first run's
// comparator; the strict run sets it explicitly.
const CHILD_ENV = {
  ...process.env,
  ...(process.env.DECKO_PASSWORD_HASH === undefined ? { DECKO_PASSWORD_HASH: "legacy-sha1" } : {}),
  PARITY_STRICT: "",
};

interface Trace {
  engine: string;
  environment?: { rails_env: string; asset_refresh: string; compress_assets: boolean };
  network_blocked: string[];
  steps: unknown[];
}
interface CompareReport {
  pass: number;
  deliberate: number;
  total: number;
  rows: { step: string; mod: string; verdict: "PASS" | "DELIBERATE" | "MISMATCH"; diffs: Record<string, [unknown, unknown]> }[];
}

function runNode(args: string[], env: NodeJS.ProcessEnv): { status: number; out: string; err: string } {
  const r = spawnSync(process.execPath, args, {
    cwd: REPO,
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** The fixture's own integrity gate: every file this run consumes must hash
 *  to the value the fixture's MANIFEST.json pinned when it was recorded. */
function verifyManifestFiles(rels: string[]): string[] {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { files: Record<string, string> };
  const problems: string[] = [];
  for (const rel of rels) {
    const want = manifest.files[rel];
    if (want === undefined) {
      problems.push(`${rel} not pinned by the manifest`);
      continue;
    }
    const got = createHash("sha256").update(readFileSync(join(FIXTURE, rel))).digest("hex");
    if (got !== want) problems.push(`${rel} sha256 ${got.slice(0, 12)}... != pinned ${want.slice(0, 12)}...`);
  }
  return problems;
}

/** Every .ts/.mts source tsc would compile, newest first-included mtime. */
function newestSourceMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtime(p));
    } else if (entry.isFile() && /\.m?ts$/.test(entry.name)) {
      newest = Math.max(newest, statSync(p).mtimeMs);
    }
  }
  return newest;
}

/** Whether the built engine is older than the sources it was built from.
 *  ts-drive.mjs loads dist/src/**, so a dist left over from an earlier
 *  commit drives the OLD engine and reports its verdicts as this suite's —
 *  a parity suite silently measuring the wrong build is worse than no run.
 *  `npm run typecheck` is --noEmit and leaves dist untouched, which is
 *  exactly how a stale dist survives into a battery run. */
function distIsStale(): boolean {
  if (!existsSync(DIST_ENGINE)) return true;
  const built = statSync(DIST_ENGINE).mtimeMs;
  return newestSourceMtime(join(REPO, "src")) > built;
}

describe("side-effects scenario battery (87 public steps, committed synthetic deck)", () => {
  // The committed inputs (deck, Ruby trace) must exist — their absence is a
  // broken checkout. The build artifacts are NOT committed (like
  // node_modules) and are built here on first use, so the suite runs on a
  // clean checkout: the engine from the committed TypeScript sources
  // (typescript is a devDependency), and the LibSass compiler from the
  // vendored MIT-licensed LibSass 3.6.4 source (tools/libsass/libsass),
  // which needs a C++11 compiler on PATH (g++/gcc, per build-native.mjs).
  // The engine is also rebuilt whenever dist/ is older than src/, so a
  // dist left over from another commit cannot drive this suite.
  const missing: string[] = [];
  if (!existsSync(DECK)) missing.push(`${DECK} (committed fixture deck)`);
  if (!existsSync(RUBY_TRACE)) missing.push(`${RUBY_TRACE} (committed Ruby trace)`);
  beforeAll(async () => {
    // Use the endpoint suites' lock for both emit and asset publication. A warm
    // tree is checked too, while the battery retains its source-freshness rule.
    if (missing.length === 0) await ensureStagingServerDist(distIsStale);
    if (missing.length === 0 && !existsSync(SASSC)) {
      const build = spawnSync(process.execPath, [join(REPO, "tools", "libsass", "build-native.mjs"), join(REPO, "tools", "libsass", "libsass")], {
        cwd: REPO, encoding: "utf8", timeout: 1_200_000, windowsHide: true,
      });
      if (!existsSync(SASSC)) {
        throw new Error(`the LibSass build failed (exit ${build.status}; it needs a C++11 compiler on PATH): ${(build.stderr || build.stdout || "").slice(-600)}`);
      }
    }
  }, 1_200_000);

  it("drives the TypeScript engine through the 87 public steps and compares it with the recorded Ruby trace: 78 steps pass, the 9 steps whose declared differences are pinned are declared, and no mismatch remains", () => {
    expect(missing, "the battery's committed inputs and build artifacts are present").toEqual([]);

    const fixtureProblems = verifyManifestFiles([
      "deck/deck.sqlite3",
      "expected/side-effects-ruby.json",
    ]);
    expect(fixtureProblems, "the fixture matches its manifest").toEqual([]);

    const work = join(REPO, "tmp", "side-effects-battery");
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const tsFile = join(work, "ts.json");
    const reportFile = join(work, "compare-report.json");

    // The TypeScript half: the engine through the same 87-step public operation
    // list, from a copy of the committed deck. Its stdout is the trace.
    const drive = runNode([TS_DRIVE, DECK, join(work, "ts-work")], CHILD_ENV);
    if (drive.status !== 0) {
      throw new Error(`ts-drive.mjs exited ${drive.status}\n--- stderr tail ---\n${drive.err.slice(-4000)}`);
    }
    writeFileSync(tsFile, drive.out);
    const ts = JSON.parse(drive.out) as Trace;
    expect({ engine: ts.engine, blocked: ts.network_blocked, steps: ts.steps.length }).toEqual({
      engine: "decko-ts",
      blocked: [],
      steps: 87,
    });

    // The verdict: the committed Ruby trace against the trace just produced.
    const compared = runNode([COMPARE, RUBY_TRACE, tsFile, reportFile], CHILD_ENV);
    expect(compared.status, compared.err).not.toBe(3); // 3 = a blocked network attempt
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as CompareReport;
    const ruby = JSON.parse(readFileSync(RUBY_TRACE, "utf8")) as Trace;
    expect({ engine: ruby.engine, blocked: ruby.network_blocked, steps: ruby.steps.length }).toEqual({
      engine: "ruby-decko",
      blocked: [],
      steps: 87,
    });
    // The deployed configuration the recording ran under (drive.rb).
    expect(ruby.environment).toEqual({ rails_env: "production", asset_refresh: "cautious", compress_assets: true });

    // The withheld step set (tools/parity-side-effects/withheld/scenarios.json)
    // is NOT part of this public run and must be excluded from a release
    // package; the drive names the count it skipped on stderr. Nothing here
    // describes those steps.
    expect(drive.err, "the withheld steps are announced, not silently skipped").toContain(
      "[withheld until disclosure] NOT RUN: ",
    );

    // The steps whose production pin holds on this deck, and the total.
    // restore-file-revision is pinned in scenarios.json (Ruby crashes on
    // restoring a File/Image revision with a 500; the port restores it and
    // answers 303), and its pin's expected status now matches the port's
    // recorded status, so it reads as the documented deliberate difference.
    // admin-deny-signup is declared as a knock-on of that step: the 500 Ruby
    // answers there renders the server_error view, which saves the page into
    // the location history, so the deny's *previous redirect resolves to it.
    // Before the recording ran under production error handling this step
    // compared equal, because the developer page never ran that save.
    // The three sign-in steps (signin-unknown, signin-wrong-password,
    // reset-unknown-email) are declared against docs/SECURITY.md approved
    // divergence 4: the port's uniform sign-in and forgot-password answers.
    // Run with DECKO_SIGNIN_UNIFORM_FAILURE=off, the same battery returns to
    // 83 pass / 4 declared, which is how this was attributed.
    // The strict-parity flags (src/card/parity/strict-parity-flags.ts) carry
    // each of these original behaviours behind a switch; the strict run is
    // pinned by the test below. admin-update-current-skin-colors and
    // admin-delete-script-card are declared against the default mode's
    // content-addressed bundle names: a re-store of bytes the deck already
    // holds lands on the name it already has, where Ruby's clock name writes
    // a fresh copy.
    const deliberate = report.rows.filter((r) => r.verdict === "DELIBERATE").map((r) => r.step);
    // get-home is declared on the bundle names: Ruby names a history-less
    // output by Time.now.to_i, its 15 script writes share 12 names in one
    // run, and its identical stylesheet re-stores each take a fresh clock
    // name. The default mode names by content (one file per distinct bundle
    // bytes), so its 15 distinct script bundles keep 15 names and the
    // identical stylesheet bytes land on one. The pin lists the exact
    // `files` entries of both engines (scenarios.json, get-home; strictTs
    // holds the strict run's list).
    expect(deliberate.sort()).toEqual([
      "admin-create-skin-bad-parent",
      "admin-delete-script-card",
      "admin-deny-signup",
      "admin-update-current-skin-colors",
      "get-home",
      "reset-unknown-email",
      "restore-file-revision",
      "signin-unknown",
      "signin-wrong-password",
    ]);
    expect({ pass: report.pass, deliberate: report.deliberate, total: report.total }).toEqual({
      pass: 78,
      deliberate: 9,
      total: 87,
    });

    // Every mismatched step and the fields it differs on, pinned step by step.
    // A change on either side fails here. None remains on this deck.
    const mismatches = report.rows.filter((r) => r.verdict === "MISMATCH");
    expect(mismatches.map((r) => ({ step: r.step, fields: Object.keys(r.diffs).sort() }))).toEqual([]);

    rmSync(work, { recursive: true, force: true });
  }, 900_000);

  // The strict-parity run: the same battery with all four
  // DECKO_STRICT_PARITY_* switches on and the comparator in its strict mode
  // (PARITY_STRICT=1). Each flag restores the recorded Ruby behaviour one
  // for one, so the six erased differences (the battery's pins name them:
  // strictErases) disappear and their steps PASS on agreement with the
  // recording; get-home keeps its mode-specific pin (strictTs) and stays
  // DELIBERATE. 86 pass + 1 declared + 0 mismatch is the one-to-one proof.
  it("with the four strict-parity flags on, the six pinned differences are erased: 86 steps pass, get-home keeps its declared difference, and no mismatch remains", () => {
    expect(missing, "the battery's committed inputs and build artifacts are present").toEqual([]);

    const fixtureProblems = verifyManifestFiles([
      "deck/deck.sqlite3",
      "expected/side-effects-ruby.json",
    ]);
    expect(fixtureProblems, "the fixture matches its manifest").toEqual([]);

    const work = join(REPO, "tmp", "side-effects-battery-strict");
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const tsFile = join(work, "ts.json");
    const reportFile = join(work, "compare-report.json");
    const strictEnv: NodeJS.ProcessEnv = {
      ...CHILD_ENV,
      DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS: "on",
      DECKO_STRICT_PARITY_REVISION_RESTORE_500: "on",
      DECKO_STRICT_PARITY_SKIN_CREATE_500: "on",
      DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES: "on",
      PARITY_STRICT: "1",
    };

    const drive = runNode([TS_DRIVE, DECK, join(work, "ts-work")], strictEnv);
    if (drive.status !== 0) {
      throw new Error(`ts-drive.mjs exited ${drive.status}\n--- stderr tail ---\n${drive.err.slice(-4000)}`);
    }
    writeFileSync(tsFile, drive.out);
    const ts = JSON.parse(drive.out) as Trace;
    expect({ engine: ts.engine, blocked: ts.network_blocked, steps: ts.steps.length }).toEqual({
      engine: "decko-ts",
      blocked: [],
      steps: 87,
    });

    const compared = runNode([COMPARE, RUBY_TRACE, tsFile, reportFile], strictEnv);
    expect(compared.status, compared.err).not.toBe(3); // 3 = a blocked network attempt
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as CompareReport;
    expect({ pass: report.pass, deliberate: report.deliberate, total: report.total }).toEqual({
      pass: 86,
      deliberate: 1,
      total: 87,
    });
    // The one difference strict mode keeps is the recording's own clock
    // shape: the drive's fixture clock never collides the way Ruby's wall
    // clock did (scenarios.json, get-home, strictTs).
    expect(report.rows.filter((r) => r.verdict === "DELIBERATE").map((r) => r.step)).toEqual(["get-home"]);
    // Every flag's recorded case reproduces the Ruby answer exactly.
    expect(
      report.rows
        .filter((r) =>
          [
            "signin-unknown",
            "signin-wrong-password",
            "reset-unknown-email",
            "restore-file-revision",
            "admin-deny-signup",
            "admin-create-skin-bad-parent",
          ].includes(r.step),
        )
        .map((r) => ({ step: r.step, verdict: r.verdict, diffs: Object.keys(r.diffs) })),
    ).toEqual([
      { step: "signin-unknown", verdict: "PASS", diffs: [] },
      { step: "signin-wrong-password", verdict: "PASS", diffs: [] },
      { step: "reset-unknown-email", verdict: "PASS", diffs: [] },
      { step: "restore-file-revision", verdict: "PASS", diffs: [] },
      { step: "admin-deny-signup", verdict: "PASS", diffs: [] },
      { step: "admin-create-skin-bad-parent", verdict: "PASS", diffs: [] },
    ]);
    const mismatches = report.rows.filter((r) => r.verdict === "MISMATCH");
    expect(mismatches.map((r) => ({ step: r.step, fields: Object.keys(r.diffs).sort() }))).toEqual([]);

    rmSync(work, { recursive: true, force: true });
  }, 900_000);
});
