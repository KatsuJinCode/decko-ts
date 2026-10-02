// capture-manifest-provenance.mjs -- provenance primitives for the dual-lane
// capture.
//
// WHY THIS EXISTS: a staged corpus can be silently replaced by a same-size
// byte-variant, because Node's copyFileSync preserves mtimes on Windows
// (CopyFileW), staging checked presence instead of content, and nothing
// bound a photograph to the corpus it photographed. Every function here
// exists to make that misfire class UNCITABLE:
//
//   sha256File                  content identity, never mtime
//   sqliteHeaderChangeCounter   second canary: SQLite header offset 24,
//                               big-endian uint32, increments on every
//                               transaction (fileformat2.html fields 24-27);
//                               recorded alongside the sha256 in the manifest
//   stageFile                   copy that FAILS LOUDLY when a pre-existing
//                               destination's bytes differ from the source --
//                               presence alone is never trusted again
//   verifyManifestForGrading    the refusal gate: no manifest, no grade;
//                               before != after, no grade; live corpus at
//                               grade start differing from the recorded hash,
//                               no grade
//   contentAddressedPhotographPath
//                               <root>/<corpusSha8>/<runId>/ -- immutable
//                               photograph locations a worktree cleanup can
//                               never take with it
//
// This module is side-effect free and importable; the runner
// (capture-and-grade.mjs) and the smoke test
// (capture-manifest-provenance.smoke-test.mjs) are its only consumers.

import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import path from "node:path";

export const MANIFEST_SCHEMA = "capture-manifest/1";
export const MANIFEST_FILENAME = "capture-manifest.json";

const SQLITE_HEADER_MAGIC = "SQLite format 3\0";

// ---------- content hashing (never mtime) ----------

export function sha256File(file) {
  const size = statSync(file).size;
  const fd = openSync(file, "r");
  try {
    const hash = createHash("sha256");
    const CHUNK = 4 * 1024 * 1024;
    const buf = Buffer.alloc(CHUNK);
    for (let off = 0; off < size; off += CHUNK) {
      const len = Math.min(CHUNK, size - off);
      readSync(fd, buf, 0, len, off);
      hash.update(buf.subarray(0, len));
    }
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

// The SQLite file header's file change counter: bytes 24-27, big-endian
// uint32, incremented on every transaction that modifies the database.
// A canary independent of mtime (which copyFileSync fabricates on win32);
// recorded in the manifest next to the corpus sha256. Note the counter sits
// INSIDE the hashed bytes, so sha equality already implies counter equality --
// recording it separately makes the corpus generation human-checkable without
// rehashing 229 MB.
export function sqliteHeaderChangeCounter(file) {
  const fd = openSync(file, "r");
  try {
    const header = Buffer.alloc(100);
    const read = readSync(fd, header, 0, 100, 0);
    if (read < 100 || !header.subarray(0, 16).equals(Buffer.from(SQLITE_HEADER_MAGIC, "latin1"))) {
      throw new Error(
        `not a SQLite database (header magic mismatch): ${file} -- refusing to ` +
          "read a file-change counter out of a non-corpus file",
      );
    }
    return header.readUInt32BE(24);
  } finally {
    closeSync(fd);
  }
}

// ---------- staging (M5: checksum-verified, presence never trusted) ----------

// Copy src -> dst. If dst already exists, its sha256 is verified against the
// source: equal bytes pass (the copy is proven, not assumed), different bytes
// FAIL LOUDLY -- a silently swapped copy at a staging destination is exactly
// the misfire this gate exists for. Throws on any mismatch; the caller turns
// that into its own fail() convention.
export function stageFile(src, dst, label, log = (m) => console.log(m)) {
  if (!existsSync(src)) {
    throw new Error(`STAGE ${label}: source missing: ${src}`);
  }
  mkdirSync(path.dirname(dst), { recursive: true });
  if (existsSync(dst)) {
    const srcSha = sha256File(src);
    const dstSha = sha256File(dst);
    if (srcSha === dstSha) {
      log(`STAGE ${label}: already present, sha256-verified against source (${srcSha.slice(0, 12)}...)`);
      return { action: "verified-existing", sha256: srcSha };
    }
    throw new Error(
      `STAGE ${label}: destination exists but its bytes DIFFER from the source ` +
        `(dst sha256 ${dstSha.slice(0, 12)}... != src ${srcSha.slice(0, 12)}...). ` +
        `A mtime-preserving swap at the destination is the exact misfire class this ` +
        `check exists for (copyFileSync preserves mtimes on win32). Refusing to ` +
        `overwrite or proceed. Inspect and explicitly archive/remove the destination, ` +
        `then re-run. src=${src} dst=${dst}`,
    );
  }
  copyFileSync(src, dst);
  const srcSha = sha256File(src);
  const dstSha = sha256File(dst);
  if (srcSha !== dstSha) {
    throw new Error(
      `STAGE ${label}: copy verification failed (${src} -> ${dst}); ` +
        `dst sha256 ${dstSha.slice(0, 12)}... != src ${srcSha.slice(0, 12)}...`,
    );
  }
  log(
    `STAGE ${label}: copied + sha256-verified (${(statSync(dst).size / 1e6).toFixed(1)} MB, ` +
      `${srcSha.slice(0, 12)}...) -> ${dst}`,
  );
  return { action: "copied", sha256: srcSha };
}

// ---------- the refusal gate (M1: no provenance, no grade) ----------

// Returns an array of refusal reasons; empty means the manifest binds this
// grading run to the corpus currently on disk. Gates, verbatim from the fix
// recipe:
//   1. the manifest file must exist;
//   2. manifest.corpusSha256.before === manifest.corpusSha256.after
//      (the capture must not have photographed a moving deck);
//   3. sha256(<corpusFile> at grade start) === manifest.corpusSha256.after
//      (the tree being graded must hold the exact photographed bytes).
export function verifyManifestForGrading({ manifestPath, corpusFile, liveCorpusSha256 }) {
  const refusals = [];
  if (!existsSync(manifestPath)) {
    refusals.push(
      `no capture manifest at ${manifestPath}: an expected-v2 tree without a ` +
        `provenance manifest is not a photograph -- re-run the capture (or ` +
        `grade an immutable photograph via --photographs)`,
    );
    return { ok: false, refusals };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return { ok: false, refusals: [`capture manifest at ${manifestPath} does not parse: ${e.message}`] };
  }
  if (manifest.schema !== MANIFEST_SCHEMA) {
    refusals.push(
      `capture manifest schema "${manifest.schema}" is not "${MANIFEST_SCHEMA}" -- ` +
        "refusing to grade a photograph from an unknown manifest generation",
    );
  }
  const c = manifest.corpusSha256 ?? {};
  if (typeof c.before !== "string" || typeof c.after !== "string") {
    refusals.push("capture manifest is missing corpusSha256.before/after -- provenance incomplete");
  } else if (c.before !== c.after) {
    refusals.push(
      `capture manifest records a corpus that CHANGED DURING capture ` +
        `(before ${c.before.slice(0, 12)}... != after ${c.after.slice(0, 12)}...) -- ` +
        "the deck moved under the camera; this photograph is void",
    );
  } else {
    const live = liveCorpusSha256 ?? sha256File(corpusFile);
    if (live !== c.after) {
      refusals.push(
        `corpus at grade start (${live.slice(0, 12)}...) differs from the photographed ` +
          `corpus recorded in the manifest (${c.after.slice(0, 12)}...) -- refusing to ` +
          "grade a photograph against a different deck",
      );
    }
  }
  return { ok: refusals.length === 0, refusals, manifest };
}

// ---------- M6: content-addressed photograph locations ----------

// Photographs live as <root>/<corpusSha8>/<runId>/ so a photograph's location
// names the corpus bytes it photographed and the run that took it. Existing
// trees are NEVER moved by this convention (the frozen yardstick stays put);
// the runner copies into the location and grades from it via --photographs.
export function contentAddressedPhotographPath(root, corpusSha256, runId) {
  return path.join(root, corpusSha256.slice(0, 8), runId);
}
