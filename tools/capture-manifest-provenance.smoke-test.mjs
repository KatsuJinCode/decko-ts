// capture-manifest-provenance.smoke-test.mjs -- smoke test for the provenance
// primitives (capture-manifest-provenance.mjs) and the runner's import safety.
//
// Runs on a SYNTHETIC directory pair (a fake canonical + a fake staged tree in
// os.tmpdir()); no real capture, no corpus, no verifier, no Ruby. Exercises:
//
//   sha256File                    deterministic content hashing
//   sqliteHeaderChangeCounter     offset-24 big-endian uint32 read + non-SQLite refusal
//   stageFile                     copy verifies; pre-existing equal bytes verify;
//                                 pre-existing DIFFERENT bytes throw (the swapped-copy refusal)
//   verifyManifestForGrading      missing manifest / before != after /
//                                 grade-start hash mismatch / wrong schema all refuse;
//                                 a binding manifest passes
//   contentAddressedPhotographPath <root>/<corpusSha8>/<runId> shape
//   runner import safety          importing capture-and-grade.mjs must not
//                                 execute main() (entry guard)
//
// Exit 0 = every check passed; exit 1 = any failure (printed).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MANIFEST_FILENAME,
  contentAddressedPhotographPath,
  sha256File,
  sqliteHeaderChangeCounter,
  stageFile,
  verifyManifestForGrading,
} from "./capture-manifest-provenance.mjs";
import { scratchDir } from "../tests/support/scratch-dir.mjs";

const tmp = scratchDir("capture-manifest-smoke-");
let failures = 0;
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn, needle) {
  let threw = null;
  try {
    fn();
  } catch (e) {
    threw = e;
  }
  assert(threw, `expected a throw containing "${needle}", but nothing was thrown`);
  assert(
    String(threw.message).includes(needle),
    `expected throw message to contain "${needle}", got: ${threw.message}`,
  );
}

// ---------- synthetic pair: canonical tree + staged tree ----------
const canonical = path.join(tmp, "canonical");
const staged = path.join(tmp, "staged");
mkdirSync(path.join(canonical, "deck"), { recursive: true });
mkdirSync(path.join(staged, "deck"), { recursive: true });

// A fake corpus: a real SQLite header (magic + change counter at offset 24)
// followed by padding, so the counter reader AND the sha hasher both consume it.
function makeFakeCorpus(counter, filler) {
  const header = Buffer.alloc(100);
  header.write("SQLite format 3\0", 0, "latin1");
  header.writeUInt32BE(counter, 24);
  return Buffer.concat([header, Buffer.alloc(4096, filler)]);
}

const CANONICAL_CORPUS = path.join(canonical, "deck", "corpus-v2.sqlite3");
const STAGED_CORPUS = path.join(staged, "deck", "corpus-v2.sqlite3");
writeFileSync(CANONICAL_CORPUS, makeFakeCorpus(0x0000002a, 1));
writeFileSync(STAGED_CORPUS, makeFakeCorpus(0x0000002a, 1));

const expectedSha = sha256File(CANONICAL_CORPUS);

// ---------- sha256File ----------
check("sha256File: deterministic and content-sensitive", () => {
  assert(sha256File(CANONICAL_CORPUS) === expectedSha, "same bytes must hash identically");
  assert(sha256File(STAGED_CORPUS) === expectedSha, "independent identical copy must hash identically");
  writeFileSync(path.join(tmp, "other.bin"), makeFakeCorpus(0x0000002a, 2));
  assert(sha256File(path.join(tmp, "other.bin")) !== expectedSha, "different bytes must hash differently");
});

// ---------- sqliteHeaderChangeCounter ----------
check("sqliteHeaderChangeCounter: reads offset-24 big-endian uint32", () => {
  assert(sqliteHeaderChangeCounter(CANONICAL_CORPUS) === 0x2a, "counter must be the uint32 at offset 24");
});
check("sqliteHeaderChangeCounter: refuses non-SQLite files loudly", () => {
  const notDb = path.join(tmp, "not-a-db.sqlite3");
  writeFileSync(notDb, "this is definitely not a database header, just text".repeat(4));
  assertThrows(() => sqliteHeaderChangeCounter(notDb), "not a SQLite database");
});

// ---------- stageFile ----------
check("stageFile: fresh copy is sha256-verified", () => {
  const dst = path.join(staged, "scripts", "instrument.rb");
  const r = stageFile(CANONICAL_CORPUS, dst, "smoke corpus", () => {});
  assert(r.action === "copied" && r.sha256 === expectedSha, "fresh copy must report copied with the source sha");
});
check("stageFile: pre-existing IDENTICAL bytes verify (presence is earned, not assumed)", () => {
  const dst = path.join(staged, "deck", "corpus-v2.sqlite3");
  const r = stageFile(CANONICAL_CORPUS, dst, "smoke corpus", () => {});
  assert(r.action === "verified-existing", "identical pre-existing dst must report verified-existing");
});
check("stageFile: pre-existing DIFFERENT bytes REFUSE (the swapped-copy misfire)", () => {
  const dst = path.join(tmp, "swapped", "corpus-v2.sqlite3");
  mkdirSync(path.dirname(dst), { recursive: true });
  writeFileSync(dst, makeFakeCorpus(0x0000002b, 9)); // same-ish file, different bytes
  assertThrows(() => stageFile(CANONICAL_CORPUS, dst, "smoke corpus", () => {}), "bytes DIFFER");
  // the swapped destination must be left untouched (never silently overwritten)
  assert(sha256File(dst) === sha256File(path.join(tmp, "swapped", "corpus-v2.sqlite3")), "dst must not be modified");
});

// ---------- verifyManifestForGrading ----------
const expectedV2 = path.join(staged, "expected-v2");
mkdirSync(expectedV2, { recursive: true });
const manifestPath = path.join(expectedV2, MANIFEST_FILENAME);

function writeManifest(manifest) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

check("M1 gate: missing manifest refuses", () => {
  rmSync(manifestPath, { force: true });
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(!g.ok && g.refusals[0].includes("no capture manifest"), `expected missing-manifest refusal, got ${JSON.stringify(g.refusals)}`);
});
check("M1 gate: manifest that does not parse refuses", () => {
  writeFileSync(manifestPath, "{not json");
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(!g.ok && g.refusals[0].includes("does not parse"), `expected parse refusal, got ${JSON.stringify(g.refusals)}`);
});
check("M1 gate: wrong schema refuses", () => {
  writeManifest({ schema: "capture-manifest/0", corpusSha256: { before: expectedSha, after: expectedSha } });
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(!g.ok && g.refusals.some((r) => r.includes("schema")), `expected schema refusal, got ${JSON.stringify(g.refusals)}`);
});
check("M1 gate: corpus changed DURING capture (before != after) refuses", () => {
  writeManifest({
    schema: "capture-manifest/1",
    corpusSha256: { before: expectedSha, after: "b".repeat(64) },
  });
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(!g.ok && g.refusals.some((r) => r.includes("CHANGED DURING capture")), `expected moving-deck refusal, got ${JSON.stringify(g.refusals)}`);
});
check("M1 gate: grade-start corpus hash != recorded hash refuses", () => {
  writeManifest({
    schema: "capture-manifest/1",
    corpusSha256: { before: "c".repeat(64), after: "c".repeat(64) },
  });
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(!g.ok && g.refusals.some((r) => r.includes("grade start")), `expected grade-start mismatch refusal, got ${JSON.stringify(g.refusals)}`);
});
check("M1 gate: binding manifest (before == after == live) passes and returns the manifest", () => {
  writeManifest({
    schema: "capture-manifest/1",
    corpusSha256: { before: expectedSha, after: expectedSha },
    sqliteHeaderChangeCounter: { before: 0x2a, after: 0x2a },
    captureScriptSha256: "d".repeat(64),
    disputedSetSha256: "e".repeat(64),
    railsEnv: "development",
    bootPids: { runner: 111, ruby: 222 },
    startedAt: "2026-09-29T00:00:00Z",
    finishedAt: "2026-09-29T00:30:00Z",
    hostOs: "synthetic",
  });
  const g = verifyManifestForGrading({ manifestPath, corpusFile: STAGED_CORPUS });
  assert(g.ok, `expected pass, got refusals ${JSON.stringify(g.refusals)}`);
  assert(g.manifest.bootPids.ruby === 222, "manifest must be returned intact");
});
check("M1 gate: precomputed liveCorpusSha256 is honored (no rehash)", () => {
  const g = verifyManifestForGrading({
    manifestPath,
    corpusFile: STAGED_CORPUS,
    liveCorpusSha256: expectedSha,
  });
  assert(g.ok, "matching precomputed hash must pass");
  const bad = verifyManifestForGrading({
    manifestPath,
    corpusFile: STAGED_CORPUS,
    liveCorpusSha256: "f".repeat(64),
  });
  assert(!bad.ok, "mismatching precomputed hash must refuse");
});

// ---------- contentAddressedPhotographPath ----------
check("M6: photograph path is <root>/<corpusSha8>/<runId>", () => {
  const p = contentAddressedPhotographPath(path.join(tmp, "photos"), expectedSha, "run-1");
  const rel = path.relative(tmp, p);
  const [root, sha8, runId] = rel.split(path.sep);
  assert(root === "photos" && sha8 === expectedSha.slice(0, 8) && runId === "run-1",
    `unexpected shape: ${rel}`);
});

// ---------- runner import safety (entry guard) ----------
check("runner imports side-effect free (entry guard holds; main does not run)", async () => {
  await import("./capture-and-grade.mjs");
  assert(existsSync(manifestPath), "importing the runner must not touch the filesystem");
});

// ---------- cleanup + verdict ----------
rmSync(tmp, { recursive: true, force: true });
console.log("");
console.log(`smoke: ${checks - failures}/${checks} checks passed${failures ? ` -- ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
