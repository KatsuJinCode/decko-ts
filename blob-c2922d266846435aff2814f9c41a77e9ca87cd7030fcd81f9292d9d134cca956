// verify-staged-corpus-provenance.mjs -- the STAGING-time provenance guard
// for staged capture corpora.
//
// WHY THIS EXISTS (mechanism; full write-up in
// docs/parity-method.md): the photographed corpus and its
// byte-variants coexist as same-size copies across worktrees; an
// mtime-preserving staged copy can silently replace a worktree's
// tmp/raw-ground-truth/deck-recapture/corpus-v2.sqlite3. Nothing else
// checks the between-runs window -- the stageFile gate only guards
// destinations DURING a capture-and-grade run, and verifyManifestForGrading
// only runs at GRADE start. This module makes the between-runs window
// checkable in seconds: hash the staged corpus, compare against the sha256
// the photograph's capture manifest binds, and REFUSE naming the expected
// sha on any mismatch.
//
// WHAT IT CHECKS (per --repo):
//   <repo>/tmp/raw-ground-truth/deck-recapture/corpus-v2.sqlite3
//     against <repo>/tmp/raw-ground-truth/expected-v2/capture-manifest.json
//   or, with --photograph <dir>, against that directory's capture-manifest.json
//   (a content-addressed photograph). The comparison itself is the same
//   gate primitive the runner uses at grade start
//   (verifyManifestForGrading in capture-manifest-provenance.mjs) -- one
//   implementation of the semantics, two invocation windows.
//
// OUTCOMES per repo:
//   verified   manifest present, live corpus sha256 == the sha it binds
//   REFUSAL    manifest present and the corpus bytes differ from the bound
//              sha (the swap signature), or before != after (void photograph),
//              or the manifest is unparseable/wrong-schema while a corpus sits
//              staged, or the corpus is missing while a manifest binds it
//              (the photograph's corpus vanished)
//   unbound    corpus present, no manifest (never photographed here) --
//              reported, NOT a refusal: nothing recorded can be contradicted
//   absent     neither corpus nor manifest (worktree never set up) -- a note
//
// EXIT CODES: 0 every staged corpus verified or merely unbound/absent;
// 4 any provenance refusal (the capture-and-grade family convention);
// 1 usage error (bad arguments, nonexistent --repo/--photograph dir).
//
// RUNS ANYTIME -- no capture, no grade, no Ruby, no server: one sha256 over
// ~207 MB (a couple of seconds) per repo. Read-only over the trees it checks.
// The check itself is pure Node (crypto + fs + JSON), so it runs unchanged on
// any OS; there is deliberately no platform-specific operation in it to gate
// (cross-platform rule: dual-path or loud -- here there is nothing to dual-path).
//
// INTENDED CONSUMERS:
//   - an operator or lane, before staging a capture/grade into a worktree:
//       node tools/verify-staged-corpus-provenance.mjs --repo <dir> [--repo <dir> ...]
//   - a grade receipt, verifying a worktree corpus against an explicit
//     photograph directory:
//       node tools/verify-staged-corpus-provenance.mjs --repo <dir> --photograph <dir>
//   - corpus-scale vitest seeding (see docs/parity-method.md):
//     import verifyStagedCorpus from this module and refuse on !ok before
//     seeding.
//
// Importing this module is side-effect free; only running it as a program
// executes main().

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MANIFEST_FILENAME,
  sha256File,
  verifyManifestForGrading,
} from "./capture-manifest-provenance.mjs";

const RG = (root) => path.join(root, "tmp", "raw-ground-truth");

// The staged-capture corpus layout, exactly as capture-and-grade.mjs stages it
// (TARGET_DECK / TARGET_MANIFEST there).
export function stagedCorpusPath(repoDir) {
  return path.join(RG(repoDir), "deck-recapture", "corpus-v2.sqlite3");
}
export function stagedCorpusManifestPath(repoDir) {
  return path.join(RG(repoDir), "expected-v2", MANIFEST_FILENAME);
}

// Verify ONE staged corpus against ONE photograph manifest. Returns:
//   { ok, refusals, notes, expectedSha256, actualSha256, manifest,
//     corpusFile, manifestPath }
// ok=false means a refusal (the caller refuses: exit 4). Full sha256s are
// surfaced -- a refusal that names only prefixes cannot be grepped against
// other worktrees' photographs, which is exactly how a same-size swap is
// chased after the fact.
export function verifyStagedCorpus({ corpusFile, manifestPath, liveCorpusSha256 = null }) {
  const result = {
    ok: true,
    refusals: [],
    notes: [],
    expectedSha256: null,
    actualSha256: null,
    manifest: null,
    corpusFile,
    manifestPath,
  };
  const corpusPresent = existsSync(corpusFile);
  const manifestPresent = existsSync(manifestPath);

  if (!corpusPresent && !manifestPresent) {
    result.notes.push(
      `absent: no staged corpus and no photograph manifest -- nothing to verify ` +
        `(worktree never staged for capture?)`,
    );
    return result;
  }
  if (corpusPresent && !manifestPresent) {
    result.notes.push(
      `unbound: staged corpus present but no photograph manifest at ${manifestPath} ` +
        `-- nothing recorded to verify against (this worktree has not photographed it)`,
    );
    return result;
  }
  if (!corpusPresent && manifestPresent) {
    result.ok = false;
    result.refusals.push(
      `photograph's corpus is MISSING at ${corpusFile} while ${manifestPath} still ` +
        `binds it -- the staged corpus was removed or renamed out from under a photograph`,
    );
    return result;
  }

  // Hash the live corpus ONCE (a couple of seconds over ~207 MB) and hand the
  // hash to the shared gate primitive so it never re-hashes.
  const live = liveCorpusSha256 ?? sha256File(corpusFile);
  result.actualSha256 = live;

  const gate = verifyManifestForGrading({ manifestPath, corpusFile, liveCorpusSha256: live });
  result.manifest = gate.manifest ?? null;
  const bound = gate.manifest?.corpusSha256?.after ?? null;
  result.expectedSha256 = bound;
  if (gate.ok) return result;
  result.ok = false;
  result.refusals = [...gate.refusals];
  // The grade gate's messages shorten hashes to 12 chars; a staging refusal
  // additionally names the FULL expected sha256 so the operator can locate the
  // photograph (and any same-size sibling copies) by grep, plus the live sha
  // actually on disk.
  if (bound) {
    result.refusals.push(
      `STAGED-CORPUS MISMATCH: expected (photograph-bound) corpus sha256 ${bound}; ` +
        `live corpus on disk is ${live}. The staged corpus was swapped after this ` +
        `photograph was taken -- find the writer before re-capturing or grading ` +
        `(see docs/parity-method.md for the swap signature and the ` +
        `grep-the-siblings procedure)`,
    );
  }
  return result;
}

// Verify a list of repos (or one repo against an explicit photograph dir).
// Returns { ok, exitCode, results } -- exitCode follows the family convention
// (4 = provenance refusal) so a caller can refuse exactly like the runner.
// NOTE: no liveCorpusSha256 passthrough here on purpose -- one preset hash
// would be wrong for all but the first repo; each repo must hash its own
// corpus. Callers needing that control use verifyStagedCorpus directly.
export function verifyStagedCorpora({ repos, photographDir = null }) {
  const results = repos.map((repoDir) => {
    const manifestPath = photographDir
      ? path.join(photographDir, MANIFEST_FILENAME)
      : stagedCorpusManifestPath(repoDir);
    const r = verifyStagedCorpus({
      corpusFile: stagedCorpusPath(repoDir),
      manifestPath,
    });
    return { repo: repoDir, ...r };
  });
  const ok = results.every((r) => r.ok);
  return { ok, exitCode: ok ? 0 : 4, results };
}

// ---------- CLI ----------

function fail(msg) {
  console.error(`verify-staged-corpus-provenance: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { repos: [], photograph: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repos.push(path.resolve(next()));
    else if (a === "--photograph") opts.photograph = path.resolve(next());
    else if (a === "--json") opts.json = true;
    else fail(`unknown argument: ${a}`);
  }
  if (opts.repos.length === 0) fail("--repo <dir> is required (repeatable)");
  return opts;
}

function describe(r) {
  const sha = (s) => (s ? s.slice(0, 16) + "..." : "(n/a)");
  if (!r.ok) return `REFUSAL -- ${r.refusals.join(" | ")}`;
  if (r.expectedSha256) {
    return `verified -- corpus sha256 ${sha(r.actualSha256)} matches the photograph manifest binding`;
  }
  return r.notes.join(" ");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  for (const dir of [...opts.repos, ...(opts.photograph ? [opts.photograph] : [])]) {
    if (!existsSync(dir)) fail(`directory does not exist: ${dir}`);
  }
  if (opts.photograph && !existsSync(path.join(opts.photograph, MANIFEST_FILENAME))) {
    fail(`--photograph dir holds no ${MANIFEST_FILENAME}: ${opts.photograph}`);
  }
  const t0 = Date.now();
  const report = verifyStagedCorpora({ repos: opts.repos, photographDir: opts.photograph });
  for (const r of report.results) {
    console.log(`STAGING VERIFY ${r.repo}: ${describe(r)}`);
    for (const n of r.notes) console.log(`STAGING VERIFY ${r.repo}: note: ${n}`);
    if (!r.ok && r.expectedSha256) {
      console.log(`STAGING VERIFY ${r.repo}: expected sha256 = ${r.expectedSha256}`);
      console.log(`STAGING VERIFY ${r.repo}: live sha256     = ${r.actualSha256 ?? "(hash unavailable)"}`);
    }
  }
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          photographDir: opts.photograph,
          ok: report.ok,
          exitCode: report.exitCode,
          results: report.results.map((r) => ({
            repo: r.repo,
            corpusFile: r.corpusFile,
            manifestPath: r.manifestPath,
            ok: r.ok,
            refusals: r.refusals,
            notes: r.notes,
            expectedSha256: r.expectedSha256,
            actualSha256: r.actualSha256,
          })),
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    `staging verification: ${report.ok ? "OK" : "REFUSED"} ` +
      `(${report.results.length} repo(s), ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  process.exit(report.exitCode);
}

// Entry guard: running as a program executes main(); importing this module
// (tests, seeding code) must stay side-effect free.
const INVOKED_DIRECTLY = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (INVOKED_DIRECTLY) {
  await main();
}
