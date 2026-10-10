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
// THE OPEN FINDING THIS SUITE PINS. The published production-deck grade is
// 90 of 90 steps (83 pass + 7 declared deliberate). On the clean synthetic
// deck the recorded verdicts differ at 37 steps (49 pass + 4 declared +
// 37 mismatched), all traceable to ONE root difference: renaming another
// user's account holder. Ruby 0.20's guard (account_holder.rb
// validate_account_holder_name_change: `Card::Auth.as_card.account_manager?`)
// is vacuous for any signed-in actor -- account_manager? asks whether the
// actor is the actor -- so Ruby allows the rename. The port implements the
// check's evident intent and refuses it (card-action-engine.ts
// assertMayRenameAccountHolder). On the production deck that difference
// never surfaces because Ruby crashes mid-rename there (rule/all.rb:53
// valid_preferer? on a nil card -- one of the 7 declared production pins);
// the crash depends on production deck state and does not reproduce on a
// clean deck, so three of the seven production pins do not transfer
// (probe-rename-other-account, admin-rename-account-holder,
// admin-close-own-account), and Ruby's successful renames cascade: its
// later notification mails name the renamed follow rule, and its action ids
// run one ahead, which accounts for the remaining mismatched steps
// (mailText/mailHtml/stored fields). The recording is committed unchanged
// (expected/side-effects-ruby.json); this suite pins the exact current
// verdicts so any engine change here fails loudly and forces the finding to
// be re-graded. Resolving it (declaring the divergence for clean decks, or
// changing one side) is an operator decision.
//
// BUILD ARTIFACTS (not committed, like node_modules): ts-drive.mjs runs the
// engine from dist/ (npx tsc -p tsconfig.json) and compiles the skin SCSS the
// way the Ruby oracle does (the LibSass program tools/libsass/build-native.mjs
// builds). A missing artifact fails this suite with the command that builds
// it; nothing is skipped.
//
// DATA RULE. Zero real content: the deck, the scenarios and the recorded
// trace hold synthetic names, example.com addresses and generated fixtures
// only.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("side-effects scenario battery (90 steps, committed synthetic deck)", () => {
  const missing: string[] = [];
  if (!existsSync(DECK)) missing.push(`${DECK} (committed fixture deck)`);
  if (!existsSync(RUBY_TRACE)) missing.push(`${RUBY_TRACE} (committed Ruby trace)`);
  if (!existsSync(DIST_ENGINE)) {
    missing.push(`${DIST_ENGINE} — build it with: npx tsc -p tsconfig.json`);
  }
  if (!existsSync(SASSC)) {
    missing.push(
      `${SASSC} — build it with: node tools/libsass/build-native.mjs <libsass-3.6.4 source dir>`,
    );
  }

  it("drives the TypeScript engine through the 90 steps and compares it with the recorded Ruby trace: 49 steps pass, the 4 steps whose production pins still hold are declared, and the 37 steps of the open account-holder-rename finding are pinned step by step", () => {
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
      steps: 90,
    });

    // The verdict: the committed Ruby trace against the trace just produced.
    const compared = runNode([COMPARE, RUBY_TRACE, tsFile, reportFile], CHILD_ENV);
    expect(compared.status, compared.err).not.toBe(3); // 3 = a blocked network attempt
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as CompareReport;
    const ruby = JSON.parse(readFileSync(RUBY_TRACE, "utf8")) as Trace;
    expect({ engine: ruby.engine, blocked: ruby.network_blocked, steps: ruby.steps.length }).toEqual({
      engine: "ruby-decko",
      blocked: [],
      steps: 90,
    });

    // The four steps whose production pins hold on this deck, and the total.
    const deliberate = report.rows.filter((r) => r.verdict === "DELIBERATE").map((r) => r.step);
    expect(deliberate.sort()).toEqual(
      ["admin-create-skin-bad-parent", "after-admin-close-write", "anon-update-skin-colors", "restore-file-revision"].sort(),
    );
    expect({ pass: report.pass, deliberate: report.deliberate, total: report.total }).toEqual({
      pass: 49,
      deliberate: 4,
      total: 90,
    });

    // The open finding, pinned step by step: every mismatched step and the
    // fields it differs on. 36 of the 37 trace to the step-14 rename
    // (Ruby's follow-rule rename cascades into its later notification mails
    // and its action-id sequence); admin-close-own-account is the closure
    // signout's own difference. A change on either side fails here and
    // forces the finding to be re-graded.
    const mismatches = report.rows.filter((r) => r.verdict === "MISMATCH");
    expect(mismatches.map((r) => ({ step: r.step, fields: Object.keys(r.diffs).sort() }))).toEqual([
      { step: "probe-rename-other-account", fields: ["actions", "errors", "location", "mail", "mailHtml", "mailText", "stamps", "status", "stored", "writes"] },
      { step: "signed-in-create-card", fields: ["mailHtml", "mailText"] },
      { step: "create-illegal-name", fields: ["mailHtml", "mailText"] },
      { step: "create-unknown-type", fields: ["mailHtml", "mailText"] },
      { step: "create-number-valid", fields: ["mailHtml", "mailText"] },
      { step: "create-json-valid", fields: ["mailHtml", "mailText"] },
      { step: "create-compound", fields: ["mailHtml", "mailText"] },
      { step: "signed-in-update-card", fields: ["mailHtml", "mailText"] },
      { step: "upload-file", fields: ["stored"] },
      { step: "upload-cache-new-file", fields: ["stored"] },
      { step: "create-from-cached-upload", fields: ["mailHtml", "mailText", "stored"] },
      { step: "upload-cache-existing-file", fields: ["stored"] },
      { step: "update-from-cached-upload", fields: ["mailHtml", "mailText", "stored"] },
      { step: "upload-image", fields: ["stored"] },
      { step: "upload-large-image", fields: ["stored"] },
      { step: "signed-in-delete-card", fields: ["mailHtml", "mailText"] },
      { step: "rename-account-holder", fields: ["mailHtml", "mailText"] },
      { step: "update-file", fields: ["stored"] },
      { step: "delete-file", fields: ["mailHtml", "mailText", "stored"] },
      { step: "delete-image", fields: ["mailHtml", "mailText", "stored"] },
      { step: "admin-approve-without-verification", fields: ["mailHtml", "mailText"] },
      { step: "admin-deny-signup", fields: ["mailHtml", "mailText"] },
      { step: "admin-update-role-members", fields: ["actions", "location", "mail", "mailHtml", "mailText", "stamps", "status", "stored", "writes"] },
      { step: "admin-create-skin", fields: ["mailHtml", "mailText"] },
      { step: "admin-create-old-skin", fields: ["mailHtml", "mailText"] },
      { step: "admin-update-scss", fields: ["mailHtml", "mailText"] },
      { step: "admin-update-current-skin-colors", fields: ["mailHtml", "mailText"] },
      { step: "admin-update-current-skin-colors-again", fields: ["mailHtml", "mailText"] },
      { step: "admin-create-script-card", fields: ["mailHtml", "mailText"] },
      { step: "admin-edit-site-script", fields: ["mailHtml", "mailText"] },
      { step: "admin-edit-script-card", fields: ["mailHtml", "mailText"] },
      { step: "admin-delete-script-card", fields: ["mailHtml", "mailText"] },
      { step: "admin-update-layout", fields: ["mailHtml", "mailText"] },
      { step: "admin-rename-account-holder", fields: ["actions", "errors", "location", "mail", "mailHtml", "mailText", "stamps", "status", "stored", "writes"] },
      { step: "after-close-write", fields: ["mailHtml", "mailText"] },
      { step: "admin-close-account", fields: ["mail", "mailHtml", "mailText"] },
      { step: "admin-close-own-account", fields: ["mail", "mailHtml", "mailText", "session"] },
    ]);

    // The root difference, spelled out: on the rename of another user's
    // account holder, Ruby 303s and writes the rename; the port refuses with
    // the account-holder guard.
    const root = mismatches.find((r) => r.step === "probe-rename-other-account")!;
    expect(root.diffs.status).toEqual(["303", "422"]);
    expect(String(root.diffs.errors![1])).toContain("cannot rename Account Holder");

    rmSync(work, { recursive: true, force: true });
  }, 900_000);
});
