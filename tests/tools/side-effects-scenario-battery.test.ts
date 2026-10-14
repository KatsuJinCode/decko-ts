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
//        > ts.json     (the TypeScript engine driven through the same 90
//                       HTTP-shaped steps tools/parity-side-effects/
//                       scenarios.json lists, trace written to stdout)
//   node tools/parity-side-effects/compare.mjs <ruby.json> ts.json report
//                     (the step-by-step verdict: status, errors, row-count
//                     deltas, actions, mail, files, image variants,
//                     virtuals, session identity)
//
// THE DIVERGENCES THIS SUITE PINS. The public scenario list is 88 steps:
// the two account-holder rename steps live in the withheld set
// (tools/parity-side-effects/withheld/scenarios.json, excluded from every
// release package) and are announced on stderr when they are not run. On the
// clean synthetic deck the recorded verdicts are 78 of 88 (75 pass + 3
// declared + 10 mismatched). The Ruby recording is committed
// (expected/side-effects-ruby.json) over the same public list, re-recorded
// whenever the public list changes; this suite pins the exact current
// verdicts, so any engine change here fails loudly. Neither engine's
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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
// The generated vendor asset-source snapshots tsc does not emit (see the
// build block below); a dist carrying the engine but not these cannot run.
const VENDOR_SNAPSHOTS = [
  "edge-bootstrap-scss-snapshot.js",
  "edge-style-source-snapshot.js",
  "edge-script-source-snapshot.js",
];
const SASSC = join(
  REPO,
  "tools",
  "libsass",
  "build",
  process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin",
);
// The fixture deck is Ruby-built: the drive runs with the storage policy a
// deck Ruby also serves (legacy-sha1), so sign-ins verify without upgrading
// any digest row. An operator-set value wins.
const CHILD_ENV = {
  ...process.env,
  ...(process.env.DECKO_PASSWORD_HASH === undefined ? { DECKO_PASSWORD_HASH: "legacy-sha1" } : {}),
};

interface Trace {
  engine: string;
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

describe("side-effects scenario battery (88 public steps, committed synthetic deck)", () => {
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
  if (missing.length === 0 && distIsStale()) {
    const tsc = spawnSync(process.execPath, [join(REPO, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], {
      cwd: REPO, encoding: "utf8", timeout: 900_000, windowsHide: true,
    });
    if (!existsSync(DIST_ENGINE)) {
      throw new Error(`the engine build failed (tsc exit ${tsc.status}): ${(tsc.stderr || tsc.stdout || "").slice(-600)}`);
    }
    // tsc emits only dist/src/**. The generated asset-source snapshots the
    // engine's source readers import from vendor/ (src/card/render/
    // bootstrap-code-files.ts) must be copied alongside, or ts-drive.mjs
    // dies on ERR_MODULE_NOT_FOUND before it runs a single step — the same
    // gap tests/card/auth/staging-server-dist-bootstrap.ts:46-70 closes for
    // the staging server, with the same three files.
    const vendorDist = join(REPO, "dist", "vendor");
    mkdirSync(vendorDist, { recursive: true });
    for (const file of VENDOR_SNAPSHOTS) {
      copyFileSync(join(REPO, "vendor", file), join(vendorDist, file));
    }
  }
  if (missing.length === 0 && !existsSync(SASSC)) {
    const build = spawnSync(process.execPath, [join(REPO, "tools", "libsass", "build-native.mjs"), join(REPO, "tools", "libsass", "libsass")], {
      cwd: REPO, encoding: "utf8", timeout: 1_200_000, windowsHide: true,
    });
    if (!existsSync(SASSC)) {
      throw new Error(`the LibSass build failed (exit ${build.status}; it needs a C++11 compiler on PATH): ${(build.stderr || build.stdout || "").slice(-600)}`);
    }
  }

  it("drives the TypeScript engine through the 88 public steps and compares it with the recorded Ruby trace: 75 steps pass, the 3 steps whose reference-deck pins hold are declared, and the 10 remaining mismatches are pinned step by step", () => {
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

    // The TypeScript half: the engine through the same 90-step operation
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
      steps: 88,
    });

    // The verdict: the committed Ruby trace against the trace just produced.
    const compared = runNode([COMPARE, RUBY_TRACE, tsFile, reportFile], CHILD_ENV);
    expect(compared.status, compared.err).not.toBe(3); // 3 = a blocked network attempt
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as CompareReport;
    const ruby = JSON.parse(readFileSync(RUBY_TRACE, "utf8")) as Trace;
    expect({ engine: ruby.engine, blocked: ruby.network_blocked, steps: ruby.steps.length }).toEqual({
      engine: "ruby-decko",
      blocked: [],
      steps: 88,
    });

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
    const deliberate = report.rows.filter((r) => r.verdict === "DELIBERATE").map((r) => r.step);
    expect(deliberate.sort()).toEqual([
      "admin-create-skin-bad-parent",
      "anon-update-skin-colors",
      "restore-file-revision",
    ]);
    expect({ pass: report.pass, deliberate: report.deliberate, total: report.total }).toEqual({
      pass: 84,
      deliberate: 3,
      total: 88,
    });

    // Every mismatched step and the fields it differs on, pinned step by step.
    // A change on either side fails here.
    const mismatches = report.rows.filter((r) => r.verdict === "MISMATCH");
    expect(mismatches.map((r) => ({ step: r.step, fields: Object.keys(r.diffs).sort() }))).toEqual([
      // OUTSTANDING, not an accepted difference: the boot-time asset refresh
      // Ruby runs per request (Card::Assets.refresh, card-mod-assets
      // lib/card/assets.rb:19-26, from CardController::Rest#setup rest.rb:31-33).
      // With asset_refresh :cautious it fires once per cache clear and writes
      // the `+*asset input` virtual of every standard inputter whose source
      // changed; `style: mods` is the one inputter on this deck with no seeded
      // virtual row, so the first request creates it and, through
      // update_referers_after_input_changed, re-stores the site stylesheet and
      // script bundles. The port refreshes assets on save only, so a read
      // stores nothing. Porting the cautious refresh is the fix. Two gaps
      // feed it, and neither alone closes the step: the per-request
      // trigger, and `style: mods` not being an inputter (it is the self
      // card card-mod-style set/self/style_mods.rb:1, typed List, so the
      // typeCode arm at style-asset-events.ts:191 misses it).
      { step: "get-home", fields: ["files", "virtuals", "writes"] },
    ]);

    rmSync(work, { recursive: true, force: true });
  }, 900_000);
});
