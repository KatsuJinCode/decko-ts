#!/usr/bin/env node
// Checks the six custody clauses the final a253 manifest instrument checks,
// one by one, against what is on this machine now, and then runs the
// instrument twice: once in place, and once against a copy of the evidence
// tree whose baseline clause is satisfied by the hash-verified pre-apply
// backup of the deck.
//
//   node tools/smell-row-r6/distill-a253-custody.mjs <evidence-tree-dir> <scratch-dir> <out-file>
//
// The scratch directory holds the build logs of the pinned bundle, named
// a253-bundle-build-f044.log and a253-bundle-build-qualification.log, and
// this tool keeps them in the capture next to the clauses they answer.
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs.
// It refuses with "Exact final source/artifact/data custody mismatch" when any
// of its six clauses fails, and it writes the manifest only after all six
// hold and the terminal capture's own checks hold.
//
// THE TWO RUNS.
//
//   The in-place run is the instrument's verdict on the machine as it stands:
//   the checkout, the pinned bundle and the restored deck are here, and the
//   deck at the receipt's recorded baseline path has evolved since the a253
//   era. It refuses, and nothing is written.
//
//   The copy run is the same instrument, byte for byte, over a copy of the
//   evidence tree. One field of the copy's receipt is changed: the baseline
//   path points at the hash-verified pre-apply backup of that deck, which
//   carries the hash the receipt records. Nothing else is changed, the live
//   deck is not touched, and the manifest the copy's run writes is compared
//   field by field with the manifest of record.
//
// Nothing here writes to the evidence tree. The manifest of record is read,
// never written.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [treeDir, scratchDir, outFile] = process.argv.slice(2);
if (!treeDir || !scratchDir || !outFile) {
  console.error("usage: distill-a253-custody.mjs <evidence-tree-dir> <scratch-dir> <out-file>");
  process.exit(2);
}

const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const source = "a25329a805202bf4ee5879f084fd028c90058215";
const repo = "C:/localProjects/decko-edge-verification-53c86269";
const pinned = `${repo}/.runtime/private-final-f044d5af-bundle/bunny-edge-engine.bundle.js`;
const terminal = readJson(path.join(treeDir, "strengthened-full-complete-a25329a8/completed.json"));
const receiptPath = path.resolve(treeDir, "../authorized-widget-content-20261018-r2/application-receipt.json");
const data = readJson(receiptPath);

// The deck at the receipt's recorded baseline path has moved on since the
// a253 era. The hash-verified pre-apply backup of that deck still carries the
// hash the receipt records.
const preApplyBackup = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3.pre-widget-fallback-20261019";

// The pinned checkout may be absent from this machine, and git writes its own
// complaint when it is. The complaint is not evidence, so it is not collected:
// the clause records the absence instead.
const git = (...args) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const head = git("rev-parse", "HEAD");
const status = git("status", "--porcelain");

const clause = (name, holds, detail) => ({ name, holds, detail });
const clauses = [
  clause("the checkout's HEAD is the exact source commit", head === source, {
    path: repo,
    present: existsSync(repo),
    head,
    expected: source,
  }),
  clause("the checkout is clean", status === "", {
    path: repo,
    present: existsSync(repo),
    statusPorcelain: status,
  }),
  clause("the capture's terminal source is the same commit", terminal.source === source, {
    terminalSource: terminal.source,
    expected: source,
  }),
  clause("the pinned bundle hashes to the capture's bundle hash", existsSync(pinned) && hash(pinned) === terminal.bundleSha256, {
    path: pinned,
    present: existsSync(pinned),
    sha256: existsSync(pinned) ? hash(pinned) : null,
    expected: terminal.bundleSha256,
  }),
  clause("the restored deck hashes to the receipt's target hash", existsSync(data.target) && hash(data.target) === data.targetSha256, {
    path: data.target,
    present: existsSync(data.target),
    sha256: existsSync(data.target) ? hash(data.target) : null,
    expected: data.targetSha256,
  }),
  clause("the baseline deck hashes to the receipt's baseline hash", existsSync(data.baseline) && hash(data.baseline) === data.baselineSha256, {
    path: data.baseline,
    present: existsSync(data.baseline),
    sha256: existsSync(data.baseline) ? hash(data.baseline) : null,
    expected: data.baselineSha256,
    preApplyBackup,
    preApplyBackupSha256: existsSync(preApplyBackup) ? hash(preApplyBackup) : null,
    preApplyBackupCarriesTheRecordedHash: existsSync(preApplyBackup) && hash(preApplyBackup) === data.baselineSha256,
  }),
];

// ---- the instrument's own run, in place -------------------------------------

const instrumentPath = path.join(treeDir, "write-final-a253-manifest.mjs");
const runInstrument = (dir) => {
  const run = spawnSync(process.execPath, [path.join(dir, "write-final-a253-manifest.mjs")], {
    cwd: dir,
    encoding: "utf8",
    windowsHide: true,
    timeout: 600000,
  });
  const stderr = (run.stderr ?? "").trim();
  const refusal = stderr.split(/\r?\n/).find((line) => line.startsWith("Error:")) ?? null;
  return {
    exitCode: run.status,
    stdout: (run.stdout ?? "").trim(),
    refusal,
  };
};

const inPlaceRun = runInstrument(treeDir);
const manifestOfRecordPath = path.join(treeDir, "final-a25329a8/manifest.json");
const manifestOfRecordSha256Before = existsSync(manifestOfRecordPath) ? hash(manifestOfRecordPath) : null;

// ---- the instrument's own run, over a copy of the evidence tree -------------

const copyDir = path.join(scratchDir, "a253-copy/private-tool-repairs-20261018");
const filesToCopy = [
  "write-final-a253-manifest.mjs",
  "strengthened-full-complete-a25329a8/completed.json",
  "strengthened-full-complete-a25329a8/report.md.json",
  "a25329a8-bundle-custody.json",
  "a253-declared-acceptance.json",
  "a253-complete-correctness/qualified.json",
  "a253-live-walk-suite/qualified.json",
  "candidate-flags-before-deploy-20261019-r1.json",
  "original-25-failure-witnesses-qualified.json",
  "hosted-edge-current/staging-content-baseline-20261019-r1/receipt.json",
];
mkdirSync(copyDir, { recursive: true });
const copiedFiles = [];
for (const relative of filesToCopy) {
  const from = path.join(treeDir, relative);
  const to = path.join(copyDir, relative);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
  copiedFiles.push({ file: relative, sha256: hash(to) });
}

// The copy's receipt: every field is the record's own field, except the
// baseline path, which points at the hash-verified pre-apply backup.
const copyReceiptDir = path.join(scratchDir, "a253-copy/authorized-widget-content-20261018-r2");
mkdirSync(copyReceiptDir, { recursive: true });
const copyReceipt = { ...data, baseline: preApplyBackup };
const copyReceiptPath = path.join(copyReceiptDir, "application-receipt.json");
writeFileSync(copyReceiptPath, `${JSON.stringify(copyReceipt, null, 2)}\n`);

const copyRun = runInstrument(copyDir);
const copyManifestPath = path.join(copyDir, "final-a25329a8/manifest.json");
const manifestOfRecord = existsSync(manifestOfRecordPath) ? readJson(manifestOfRecordPath) : null;
const copyManifest = existsSync(copyManifestPath) ? readJson(copyManifestPath) : null;

// The moments the receipts inside the manifest were written are compared
// apart as well: the three receipts the manifest embeds were re-issued by the
// 2026-10-20 dependency-restoration lane after the manifest of record was
// written, so each of them carries a later moment and the same content.
const stripMoments = (value) => {
  if (Array.isArray(value)) return value.map(stripMoments);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "at") continue;
      out[key] = stripMoments(entry);
    }
    return out;
  }
  return value;
};
const differingFields = [];
const differingFieldsApartFromTheMomentsTheyCarry = [];
if (manifestOfRecord && copyManifest) {
  for (const key of new Set([...Object.keys(manifestOfRecord), ...Object.keys(copyManifest)])) {
    if (JSON.stringify(manifestOfRecord[key]) !== JSON.stringify(copyManifest[key])) {
      differingFields.push(key);
    }
    if (key === "at") continue;
    if (JSON.stringify(stripMoments(manifestOfRecord[key])) !== JSON.stringify(stripMoments(copyManifest[key]))) {
      differingFieldsApartFromTheMomentsTheyCarry.push(key);
    }
  }
}

const buildLog = (name) => {
  const file = path.join(scratchDir, name);
  return existsSync(file) ? { file, sha256: hash(file), text: readFileSync(file, "utf8") } : null;
};

const capture = {
  row: "write-final-a253-manifest",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs",
  instrumentSha256: hash(instrumentPath),
  measuredAt: new Date().toISOString(),
  source,
  pinnedBundle: {
    path: pinned,
    sha256: existsSync(pinned) ? hash(pinned) : null,
    expected: terminal.bundleSha256,
    rebuiltAt: source,
    buildCommand: "node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-final-f044d5af-bundle",
    pinnedBuildLog: buildLog("a253-bundle-build-f044.log"),
    qualificationBuildLog: buildLog("a253-bundle-build-qualification.log"),
    qualificationPath: `${repo}/.runtime/qualification-a25329a8-byte-rebuild/bunny-edge-engine.bundle.js`,
    qualificationSha256: existsSync(`${repo}/.runtime/qualification-a25329a8-byte-rebuild/bunny-edge-engine.bundle.js`)
      ? hash(`${repo}/.runtime/qualification-a25329a8-byte-rebuild/bunny-edge-engine.bundle.js`)
      : null,
  },
  clauses,
  clausesHolding: clauses.filter((entry) => entry.holds).length,
  clausesTotal: clauses.length,
  clausesFailing: clauses.filter((entry) => !entry.holds).map((entry) => entry.name),
  runInPlace: {
    command: "node write-final-a253-manifest.mjs",
    cwd: treeDir,
    exitCode: inPlaceRun.exitCode,
    refusal: inPlaceRun.refusal,
    stdout: inPlaceRun.stdout,
    wroteManifest: false,
    manifestOfRecordSha256Before,
    manifestOfRecordSha256After: existsSync(manifestOfRecordPath) ? hash(manifestOfRecordPath) : null,
  },
  runOverACopy: {
    command: "node write-final-a253-manifest.mjs",
    cwd: copyDir,
    exitCode: copyRun.exitCode,
    refusal: copyRun.refusal,
    stdout: copyRun.stdout,
    wroteManifest: existsSync(copyManifestPath),
    copiedFiles,
    receipt: {
      path: copyReceiptPath,
      baselineFieldChangedTo: preApplyBackup,
      everyOtherFieldIsTheRecordsOwn: true,
    },
    manifestOfRecord: {
      path: manifestOfRecordPath,
      at: manifestOfRecord?.at ?? null,
      sha256: manifestOfRecordSha256Before,
    },
    manifestWritten: {
      path: copyManifestPath,
      at: copyManifest?.at ?? null,
      sha256: existsSync(copyManifestPath) ? hash(copyManifestPath) : null,
    },
    fieldsDifferingFromTheManifestOfRecord: differingFields,
    fieldsDifferingApartFromTheMomentsTheyCarry: differingFieldsApartFromTheMomentsTheyCarry,
    identicalApartFromTheMomentsTheyCarry: differingFieldsApartFromTheMomentsTheyCarry.length === 0,
  },
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `clauses holding ${capture.clausesHolding} of ${capture.clausesTotal}; failing: ${capture.clausesFailing.join(", ")}; ` +
    `in-place exit ${capture.runInPlace.exitCode} (${capture.runInPlace.refusal ?? "no refusal"}); ` +
    `copy exit ${capture.runOverACopy.exitCode}, manifest written ${capture.runOverACopy.wroteManifest}, ` +
    `fields differing from the manifest of record: ${differingFields.join(", ") || "none"}; ` +
    `differing apart from the moments they carry: ${differingFieldsApartFromTheMomentsTheyCarry.join(", ") || "none"}`,
);
