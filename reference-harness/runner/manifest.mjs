#!/usr/bin/env node
// Fixture and expected-output manifests: the identity a grade is pinned to.
//
// A fixture's MANIFEST.json lists the sha256 of every input file (deck.json,
// the built deck and its files, the upload sources, the operation lists) and
// one digest over that list. Results record the digest they were produced on;
// the grader refuses results, expectations or a fixture tree that disagree.
//
// An expected directory's MANIFEST.json names the oracle that produced it
// (stock, or an explicitly patched variant with its patches listed), the
// fixture digest it was captured on, the run record, and the sha256 of every
// stored file and of its uncompressed text.
//
//   node reference-harness/runner/manifest.mjs fixture <fixtureDir>            write MANIFEST.json
//   node reference-harness/runner/manifest.mjs check <fixtureDir>              verify it (exit 1 on mismatch)
//   node reference-harness/runner/manifest.mjs expected <fixtureDir> <expectedDir> [--variant <name>] [--patches <patches.json>] [--provenance <provenance.json>]
//
// See reference-harness/SPEC.md, "Fixture identity" and "The Ruby oracle".

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const FIXTURE_MANIFEST_FORMAT = "decko-reference-fixture-manifest/1";
export const EXPECTED_MANIFEST_FORMAT = "decko-reference-expected-manifest/1";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** SQLite's write-ahead-log sidecars, beside a WAL-mode deck. Any sqlite
 *  handle on such a database — a read-only one included — creates them, and a
 *  clean close removes them again; they are residue of a reader having had the
 *  file open, never fixture content. The runner stages a private copy of the
 *  deck before opening it (run.mjs, stageDeck), so nothing it does leaves them
 *  here; a person who has browsed the committed deck in a SQLite browser will.
 *
 *  They are excluded from the fixture identity, and an EMPTY `-wal` is
 *  excluded silently. A `-wal` that still holds bytes does carry state the
 *  manifest's copy of `deck.sqlite3` does not, so it is reported rather than
 *  ignored — with the main file stale behind it, the bytes a reader sees are
 *  not the bytes that were pinned. */
export function isDeckSidecar(name) {
  return /-shm$/.test(name) || /-wal$/.test(name);
}

/** Paths (forward slashes, relative to the fixture) of every fixture input:
 *  everything except the manifest itself, expected-output directories and
 *  SQLite's journal sidecars (see isDeckSidecar). */
export function fixtureInputPaths(fixtureDir) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(fixtureDir, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && (entry.name === "MANIFEST.json" || entry.name === "expected" || entry.name.startsWith("expected-"))) continue;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) {
        if (isDeckSidecar(entry.name)) continue;
        out.push(child);
      }
    }
  };
  walk("");
  return out.sort();
}

/** The fixture's current file hashes and the digest over them. */
export function computeFixtureIdentity(fixtureDir) {
  const files = {};
  for (const rel of fixtureInputPaths(fixtureDir)) files[rel] = sha256(readFileSync(path.join(fixtureDir, rel)));
  return { files, digest: digestOf(files) };
}

/** One digest over a {path: sha256} list, independent of key order. */
export function digestOf(files) {
  return sha256(Object.keys(files).sort().map((p) => `${p}\t${files[p]}\n`).join(""));
}

/** Verifies a fixture tree against its MANIFEST.json. Returns the manifest's
 *  digest and every disagreement found (empty when the tree is intact). */
export function verifyFixture(fixtureDir) {
  const manifestPath = path.join(fixtureDir, "MANIFEST.json");
  if (!existsSync(manifestPath)) return { digest: null, problems: [`fixture has no MANIFEST.json (${manifestPath})`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { digest: null, problems: [`fixture MANIFEST.json is not JSON: ${error.message}`] };
  }
  const problems = [];
  if (manifest.format !== FIXTURE_MANIFEST_FORMAT) problems.push(`fixture manifest format is ${manifest.format}, expected ${FIXTURE_MANIFEST_FORMAT}`);
  if (manifest.fixture !== path.basename(fixtureDir)) problems.push(`fixture manifest names "${manifest.fixture}", directory is "${path.basename(fixtureDir)}"`);
  const listed = manifest.files ?? {};
  if (digestOf(listed) !== manifest.digest) problems.push("fixture manifest digest does not match its own file list");
  const now = computeFixtureIdentity(fixtureDir);
  for (const [rel, hash] of Object.entries(listed)) {
    if (!(rel in now.files)) problems.push(`fixture file missing: ${rel}`);
    else if (now.files[rel] !== hash) problems.push(`fixture file changed since its manifest: ${rel}`);
  }
  for (const rel of Object.keys(now.files)) if (!(rel in listed)) problems.push(`fixture file not in its manifest: ${rel}`);
  problems.push(...sidecarProblems(fixtureDir));
  return { digest: manifest.digest ?? null, problems };
}

/** A `-wal` left beside the deck with bytes still in it means the main file is
 *  behind a reader's, so the deck on disk is not the deck the manifest pins.
 *  An empty `-wal`, and the `-shm` beside either, are what a clean reader
 *  leaves behind and are not worth refusing a grade over. */
function sidecarProblems(fixtureDir) {
  const problems = [];
  const walk = (rel) => {
    const abs = path.join(fixtureDir, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.isFile() || !/-wal$/.test(entry.name)) continue;
      if (statSync(path.join(abs, entry.name)).size > 0) {
        problems.push(`fixture has an uncheckpointed journal beside the deck: ${child} (open it with SQLite and close it cleanly, or remove it, before grading)`);
      }
    }
  };
  walk("");
  return problems;
}

/** sha256 of a stored file and of its uncompressed content. */
export function storedFileHashes(file) {
  const bytes = readFileSync(file);
  const raw = file.endsWith(".gz") ? gunzipSync(bytes) : bytes;
  return { sha256: sha256(bytes), content_sha256: sha256(raw), bytes: bytes.length };
}

/** The results files of a run directory (render, semantics, scenarios, each
 *  plain or gzipped) plus its run-meta.json. */
export function resultFiles(dir) {
  return readdirSync(dir).filter((f) => /^(render|semantics|scenarios)\.jsonl(\.gz)?$/.test(f) || f === "run-meta.json").sort();
}

export function writeFixtureManifest(fixtureDir) {
  const { files, digest } = computeFixtureIdentity(fixtureDir);
  const manifest = { format: FIXTURE_MANIFEST_FORMAT, fixture: path.basename(fixtureDir), digest, files };
  writeFileSync(path.join(fixtureDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/**
 * Writes an expected directory's manifest from its run-meta.json and the
 * oracle contract. A patched variant must list its patches; the stock
 * oracle must list none.
 */
export function writeExpectedManifest(fixtureDir, expectedDir, { variant = "stock", patches = [], contractPath, provenance } = {}) {
  if (variant === "stock" && patches.length > 0) throw new Error("the stock oracle carries no patches; name a variant");
  if (variant !== "stock" && patches.length === 0) throw new Error(`variant "${variant}" must list the patches it applies`);
  const fixture = verifyFixture(fixtureDir);
  if (fixture.problems.length > 0) throw new Error(`fixture does not match its manifest:\n  ${fixture.problems.join("\n  ")}`);
  const meta = JSON.parse(readFileSync(path.join(expectedDir, "run-meta.json"), "utf8"));
  for (const [kind, run] of Object.entries(meta.runs ?? {})) {
    if (run.fixture_digest !== fixture.digest) throw new Error(`expected ${kind} was captured on fixture ${run.fixture_digest}, not ${fixture.digest}`);
    if (run.complete !== true || run.selection) throw new Error(`expected ${kind} is not a complete, unfiltered run`);
  }
  const contractFile = contractPath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "oracle", "contract.json");
  const contract = JSON.parse(readFileSync(contractFile, "utf8"));
  const files = Object.fromEntries(resultFiles(expectedDir).map((f) => [f, storedFileHashes(path.join(expectedDir, f))]));
  const manifest = {
    format: EXPECTED_MANIFEST_FORMAT,
    fixture: path.basename(fixtureDir),
    fixture_digest: fixture.digest,
    oracle: { variant, patches, contract_sha256: sha256(readFileSync(contractFile)), contract },
    engine: meta.engine,
    runs: meta.runs,
    files,
    ...(provenance ? { provenance } : {}),
  };
  writeFileSync(path.join(expectedDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const opts = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[++i];
    else positional.push(rest[i]);
  }
  if (command === "fixture") {
    const m = writeFixtureManifest(path.resolve(positional[0]));
    console.log(`${m.fixture}: ${Object.keys(m.files).length} files, digest ${m.digest}`);
  } else if (command === "check") {
    const { digest, problems } = verifyFixture(path.resolve(positional[0]));
    for (const p of problems) console.log(p);
    console.log(problems.length ? `fixture INVALID (${problems.length} problems)` : `fixture intact, digest ${digest}`);
    process.exit(problems.length ? 1 : 0);
  } else if (command === "expected") {
    const patches = opts.patches ? JSON.parse(readFileSync(opts.patches, "utf8")) : [];
    const provenance = opts.provenance ? JSON.parse(readFileSync(opts.provenance, "utf8")) : undefined;
    const m = writeExpectedManifest(path.resolve(positional[0]), path.resolve(positional[1]), { variant: opts.variant ?? "stock", patches, provenance });
    console.log(`${m.fixture} expected (${m.oracle.variant}): ${Object.keys(m.files).length} files`);
  } else {
    console.error("usage: manifest.mjs fixture <fixtureDir> | check <fixtureDir> | expected <fixtureDir> <expectedDir> [--variant <name> --patches <file>]");
    process.exit(2);
  }
}
