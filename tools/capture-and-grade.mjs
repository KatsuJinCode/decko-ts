// capture-and-grade.mjs -- ONE-COMMAND post-deploy recapture + grade, with
// provenance enforcement (see docs/parity-method.md).
//
// WHAT THIS IS
//   The single command the operator runs the moment a new engine build goes
//   live on the staging VM. It chains the two proven instruments with zero
//   ceremony:
//
//     1. STAGING GATE   confirm the staging origin is live and record the
//                       /_status payload (engine, card_count, deck path, and
//                       the server's booted_at field). This is the "is the new
//                       build actually up" check.
//     2. CAPTURE        the pinned Ruby dual-lane capture
//                       (capture-dual-lane-page-and-view.rb, FULL mode =
//                       all 48 shards, per-shard resume-skip; SAMPLE mode =
//                       one shard for proofs) writing
//                       <repo>/tmp/raw-ground-truth/expected-v2/{view,page}-lane/
//                       recapture-raw-shard-NNNNNN.jsonl. The corpus is staged
//                       once, sha-verified, opened READ-ONLY (?readonly=true)
//                       and asserted PRAGMA query_only=1 by the instrument;
//                       the clock is frozen for every photographed card.
//     3. MANIFEST       expected-v2/capture-manifest.json -- the photograph's
//                       provenance: corpusSha256 before AND after (both
//                       recorded, required equal), the SQLite header
//                       file-change counter (offset 24, big-endian uint32)
//                       before/after, captureScriptSha256, disputedSetSha256,
//                       railsEnv, bootPids, startedAt/finishedAt, hostOs,
//                       capture-error counts. Written by
//                       capture-manifest-provenance.mjs conventions.
//     4. GRADE          dual-lane-verifier-fast.mjs (2-worker cap, streaming
//                       per-phase progress, per-phase deadline + verified
//                       child-tree kill, restart-safe) with the floors
//                       view=8030,page=2069 and the capture-error floor
//                       captureErrors<=3 (target 0).
//     5. VERDICT        one plain-English line: PASS/FAIL, per-lane totals,
//                       floors, capture errors, and which staging deploy was
//                       measured.
//
// PROVENANCE GATES (why this runner can no longer grade "whatever is in
// expected-v2"): a re-photograph was once silently fed a swapped corpus
// because copyFileSync preserves mtimes on win32, staging checked presence
// not content, and nothing bound a photograph to the corpus it photographed.
// Therefore:
//   - the runner REFUSES to grade any expected-v2 tree whose manifest is
//     missing;
//   - ... whose two recorded corpus hashes differ (the deck moved under the
//     camera during capture);
//   - ... whose corpusSha256 differs from the live corpus hash at grade start.
// Exit code 4 = a provenance/capture-error refusal. A photograph without
// matching provenance is not a photograph.
//
// STAGING-VERIFICATION PREFLIGHT (closing the window those gates left open):
// an incident once swapped several worktrees' STAGED corpora in place —
// different bytes, identical size — in the between-runs window, where neither
// the stageFile gate nor the grade-start gate runs; the swap sat undetected
// for hours until a grade refused it. Before this runner captures (and therefore before
// ANY staging copy or grading minute is spent), it now hashes the staged
// corpus tmp/raw-ground-truth/deck-recapture/corpus-v2.sqlite3 and -- when the
// worktree already holds a capture manifest -- refuses (exit 4, full expected
// sha256 named) unless the bytes on disk still match the sha that manifest
// binds. A deliberate new corpus generation goes through --fresh, which
// archives the old photograph + manifest first, so the preflight passes on a
// declared regeneration and refuses an undeclared swap. The same check runs
// standalone against any worktree, anytime, in seconds, via the companion
// tool tools/verify-staged-corpus-provenance.mjs (no capture, no grade).
//
// CONTENT-ADDRESSED PHOTOGRAPHS: --photograph-root <dir> copies the
// graded photograph (shards + manifest) into <dir>/<corpusSha8>/<runId>/ so a
// worktree cleanup can never again take a yardstick with it. --photographs
// <dir> grades FROM such an immutable photograph: its manifest is gated
// against the live corpus, then its shards are projected (verified copies,
// never moves) into the repo's expected-v2 for the verifier. Existing trees
// are never moved; the frozen yardstick stays where it is.
//
// USAGE
//   Full post-deploy recapture + grade (the one command):
//     node capture-and-grade.mjs --repo <target-checkout>
//   Explicit fresh recapture (archives existing shards first):
//     node capture-and-grade.mjs --repo <repo> --fresh
//   One-shard proof (smallest shard, no full capture):
//     node capture-and-grade.mjs --repo <repo> --shard recapture-raw-shard-000047.jsonl
//   Re-grade only, skip the capture (offline):
//     node capture-and-grade.mjs --repo <repo> --skip-capture --skip-staging-gate
//   Preserve the photograph immutably, then grade it:
//     node capture-and-grade.mjs --repo <repo> --photograph-root C:\oracle-photographs
//   Grade a previously preserved photograph:
//     node capture-and-grade.mjs --repo <repo> --photographs C:\oracle-photographs\<sha8>\<runId>
//
// OPTIONS
//   --repo <dir>            target checkout whose expected-v2 tree is (re)captured
//                           and whose engine is graded.
//   --shard <name.jsonl>    capture + grade ONE shard only (SAMPLE mode, always
//                           rewritten; floors auto-relax to view=0,page=0 and
//                           captureErrors=unlimited unless --floors is given).
//   --floors a=N,b=M        floors for the grade. Lanes: view, page
//                           (verifier pass floors) and captureErrors (runner
//                           gate: maximum tolerated CAPTURE_ERROR rows across
//                           the photographed shards, target 0; a photograph
//                           over the floor is refused, exit 4). Defaults,
//                           full run: view=8030,page=2069,captureErrors=3.
//                           Always CLI-overridable so a specific grade can pin
//                           exact floors.
//   --workers <n>           verifier-fast concurrent vitest children (default 2
//                           -- the cap).
//   --fresh                 FULL mode only: archive existing lane shards into
//                           expected-v2/.pre-recapture-<ts>/ before capturing,
//                           forcing a true fresh recapture (without it, the
//                           capture instrument's per-shard resume-skip applies).
//   --skip-capture          grade the existing expected-v2 tree, no capture.
//                           Requires a capture-manifest.json (refused
//                           otherwise -- legacy trees must be re-photographed).
//   --photograph-root <dir> after a passing capture (or, with --skip-capture,
//                           after the gates pass on the existing tree), copy
//                           the photograph to <dir>/<corpusSha8>/<runId>/.
//                           Never overwrites an existing photograph.
//   --photographs <dir>     grade an immutable photograph directory (as written
//                           by --photograph-root): gate its manifest against
//                           the live corpus, project its shards into the repo
//                           (archiving what is there first), grade. Mutually
//                           exclusive with capture flags.
//   --skip-staging-gate     offline mode: no /_status check; artifacts keyed by
//                           --run-id (default "local-<timestamp>").
//   --run-id <id>           grading generation key (default: the gate check
//                           timestamp -- every invocation grades into a FRESH
//                           generation; after an interrupted run, re-run with
//                           the SAME --run-id to resume: verifier-fast skips
//                           phases whose artifacts already parse).
//   --staging-url <url>     staging origin for the gate (default below is the
//                           placeholder origin; set the real one per run)
//   --staging-auth <u:p>    basic auth for the direct gate; default reads env
//                           DUAL_LANE_STAGING_AUTH. When absent, the gate goes
//                           over ssh and curls 127.0.0.1:3100/_status on the VM.
//   --oracle-repo <dir>     checkout holding the Ruby oracle app + corpus
//                           (used read-only).
//   --quiet                 do not forward the capture's live output lines.
//
// EXIT CODES: 0 pass (floors met), 1 fail, 2 stalled, 3 staging gate failed
// (the deploy is not live -- do not grade a dead or mid-restart origin),
// 4 provenance/capture-error refusal (missing or contradicting manifest,
// corpus changed under the camera, capture errors over floor).
//
// PLATFORM: win32 only. The Ruby oracle app, bundle exec decko, and the ssh
// key path are machine-local Windows resources; there is no linux branch of
// this flow on this machine, so non-win32 hosts get a loud PLATFORM-OPS error,
// never a silent no-op.

import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:https";
import os from "node:os";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MANIFEST_FILENAME,
  contentAddressedPhotographPath,
  sha256File,
  sqliteHeaderChangeCounter,
  stageFile,
  verifyManifestForGrading,
} from "./capture-manifest-provenance.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// dual-lane-verifier-fast.mjs is the grading engine this runner drives. It is
// not owned by this file; resolution order: explicit env override, next to
// this file (its tracked home once merged), then the working location it
// lives in today.
function resolveVerifierFast() {
  // The sibling module is the tracked home; DUAL_LANE_VERIFIER_FAST points
  // at a nonstandard layout. No machine-local fallback path is built in.
  const candidates = [
    process.env.DUAL_LANE_VERIFIER_FAST,
    path.join(SCRIPT_DIR, "dual-lane-verifier-fast.mjs"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// The Ruby instrument's canonical source: prefer the tracked home
// <oracleRepo>/tools/oracle/, fall back to the legacy untracked location in
// the oracle checkout's raw-ground-truth tree.
function resolveOracleScript(oracleRepo) {
  const rg = (root) => path.join(root, "tmp", "raw-ground-truth");
  const candidates = [
    path.join(oracleRepo, "tools", "oracle", "capture-dual-lane-page-and-view.rb"),
    path.join(rg(oracleRepo), "scripts", "capture-dual-lane-page-and-view.rb"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function parseArgs(argv) {
  const opts = {
    repo: null,
    shard: null,
    floors: null,
    workers: 2,
    fresh: false,
    skipCapture: false,
    skipStagingGate: false,
    photographRoot: null,
    photographs: null,
    runId: null,
    stagingUrl: "https://staging.example.org/staging",
    stagingAuth: process.env.DUAL_LANE_STAGING_AUTH ?? null,
    // default: this checkout, which carries tools/oracle/ itself
    oracleRepo: path.resolve(SCRIPT_DIR, ".."),
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--shard") opts.shard = next();
    else if (a === "--floors") opts.floors = next();
    else if (a === "--workers") opts.workers = Number(next());
    else if (a === "--fresh") opts.fresh = true;
    else if (a === "--skip-capture") opts.skipCapture = true;
    else if (a === "--skip-staging-gate") opts.skipStagingGate = true;
    else if (a === "--photograph-root") opts.photographRoot = path.resolve(next());
    else if (a === "--photographs") opts.photographs = path.resolve(next());
    else if (a === "--run-id") opts.runId = next();
    else if (a === "--staging-url") opts.stagingUrl = next();
    else if (a === "--staging-auth") opts.stagingAuth = next();
    else if (a === "--oracle-repo") opts.oracleRepo = path.resolve(next());
    else if (a === "--quiet") opts.quiet = true;
    else fail(`unknown argument: ${a}`);
  }
  return opts;
}

function fail(msg) {
  console.error(`capture-and-grade: ${msg}`);
  process.exit(1);
}

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ---------- floors (explicit, CLI-overridable) ----------

// Defaults: view=8030, page=2069, and a capture-error
// floor (max 3, target 0). One-shard proofs auto-relax (full-corpus floors are
// unreachable on one shard and this corpus generation legitimately renders
// hundreds of page CAPTURE_ERROR sentinels) unless pinned via --floors.
const FULL_RUN_FLOORS = { view: 8030, page: 2069, captureErrors: 3 };
const ONE_SHARD_FLOORS = { view: 0, page: 0, captureErrors: Number.POSITIVE_INFINITY };
const FLOOR_LANES = ["view", "page", "captureErrors"];

function resolveFloors(floorsArg, isOneShard, log) {
  const defaults = isOneShard ? { ...ONE_SHARD_FLOORS } : { ...FULL_RUN_FLOORS };
  if (!floorsArg) {
    if (isOneShard) {
      log(
        "floors: auto-relaxed to view=0,page=0,captureErrors=unlimited for the one-shard proof " +
          "(full-corpus floors view=8030,page=2069,captureErrors<=3 belong to the 48-shard run; " +
          "pin with --floors)",
      );
    }
    return defaults;
  }
  const parsed = {};
  for (const pair of floorsArg.split(",")) {
    const m = /^([a-zA-Z]+)=(\d+)$/.exec(pair.trim());
    if (!m) fail(`bad --floors pair: "${pair}" (expected lane=number; lanes: ${FLOOR_LANES.join(", ")})`);
    if (!FLOOR_LANES.includes(m[1])) {
      fail(`unknown --floors lane: ${m[1]} (known lanes: ${FLOOR_LANES.join(", ")})`);
    }
    parsed[m[1]] = Number(m[2]);
  }
  return { ...defaults, ...parsed };
}

// captureErrors = rows in the photograph carrying a CAPTURE_ERROR sentinel,
// counted from the photographed bytes themselves (one line = one row = the
// instrument's own per-row error semantics). This audits the tree the grade
// will consume, in capture mode and re-grade mode alike.
function countCaptureErrors(laneDirs, shardFiles) {
  const per = { view: 0, page: 0 };
  for (const [lane, dir] of Object.entries(laneDirs)) {
    for (const f of shardFiles) {
      const file = path.join(dir, f);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (line.includes("CAPTURE_ERROR:")) per[lane] += 1;
      }
    }
  }
  return { ...per, total: per.view + per.page };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (process.platform !== "win32") {
    console.error(
      "PLATFORM-OPS: capture-and-grade has no linux branch -- it drives the " +
        "machine-local Windows Ruby oracle app (bundle exec decko), the " +
        "environment-configured staging ssh key, and verifier-fast's " +
        "taskkill-based kill. Implement a linux branch " +
        "in this file before running it there.",
    );
    process.exit(1);
  }

  if (opts.photographs && (opts.shard || opts.fresh || !opts.skipCapture)) {
    fail(
      "--photographs grades an existing immutable photograph; it cannot be combined " +
        "with capture (--shard/--fresh/default capture). Use --photographs with " +
        "--skip-capture, or drop --photographs to recapture.",
    );
  }

  if (!opts.repo) fail("--repo <dir> is required (the checkout to capture into and grade)");
  if (!existsSync(opts.repo)) fail(`--repo does not exist: ${opts.repo}`);

  const REPO = opts.repo;
  const ORACLE_REPO = opts.oracleRepo;
  // The oracle app is untracked, lives only in the oracle checkout (verified:
  // worktrees have no tools/oracle/decko-oracle-app). Running it is read-only
  // use of the oracle checkout; all WRITES land under --repo.
  const ORACLE_APP = path.join(ORACLE_REPO, "tools", "oracle", "decko-oracle-app");
  const RG = (root) => path.join(root, "tmp", "raw-ground-truth");
  const TARGET_RG = RG(REPO);
  const TARGET_EXPECTED_V2 = path.join(TARGET_RG, "expected-v2");
  const TARGET_LANES = {
    view: path.join(TARGET_EXPECTED_V2, "view-lane"),
    page: path.join(TARGET_EXPECTED_V2, "page-lane"),
  };
  const TARGET_MANIFEST = path.join(TARGET_EXPECTED_V2, MANIFEST_FILENAME);
  const ORACLE_CANONICAL_DECK = path.join(RG(ORACLE_REPO), "deck", "corpus-v2.sqlite3");
  const TARGET_DECK_DIR = path.join(TARGET_RG, "deck-recapture");
  const TARGET_DECK = path.join(TARGET_DECK_DIR, "corpus-v2.sqlite3");
  const TARGET_SCRIPT = path.join(TARGET_RG, "scripts", "capture-dual-lane-page-and-view.rb");
  const DISPUTED_SET = path.join(RG(ORACLE_REPO), "scripts", "disputed-set-resolved.json");
  const VERIFIER_FAST = resolveVerifierFast();

  if (!VERIFIER_FAST) {
    fail(
      "dual-lane-verifier-fast.mjs not found (looked at $DUAL_LANE_VERIFIER_FAST, " +
        `${SCRIPT_DIR}, $RECEIPTS_REPO/tmp/verifier-fast) -- cannot grade without it`,
    );
  }

  let LOG_FILE = null;

  function log(line) {
    console.log(`${new Date().toISOString()} ${line}`);
    if (LOG_FILE) {
      try {
        appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
      } catch { /* artifacts dir not created yet */ }
    }
  }

  // Staging is checksum-verified. A pre-existing destination whose bytes
  // differ from the canonical source is a refused swap, never a skip.
  function stage(src, dst, label) {
    try {
      return stageFile(src, dst, label, log);
    } catch (e) {
      fail(e.message);
    }
  }

  // ---------- staging gate ----------

  function stagingGateViaSsh() {
    // The staging VM's ssh details are deployment facts, not tree constants:
    // they arrive through the environment and the gate refuses to guess them.
    const key = process.env.DUAL_LANE_STAGING_SSH_KEY;
    const target = process.env.DUAL_LANE_STAGING_SSH_TARGET;
    if (!key || !target) {
      return { ok: false, error: "ssh gate needs DUAL_LANE_STAGING_SSH_KEY and DUAL_LANE_STAGING_SSH_TARGET (no deployment host or key path is built in)" };
    }
    const r = spawnSync(
      "ssh",
      [
        "-i", key,
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        target,
        "curl -s --max-time 10 http://127.0.0.1:3100/_status",
      ],
      { encoding: "utf8", timeout: 30_000, windowsHide: true },
    );
    if (r.status !== 0 || !r.stdout) {
      return { ok: false, error: `ssh gate failed (status ${r.status}): ${String(r.stderr).slice(0, 200)}` };
    }
    try {
      return { ok: true, status: JSON.parse(r.stdout), via: "ssh-local-curl" };
    } catch {
      return { ok: false, error: `ssh gate returned unparseable body: ${r.stdout.slice(0, 120)}` };
    }
  }

  function stagingGateViaHttps() {
    // The origin is an IP-hosted self-signed vhost; this gate is status-only.
    // The trust bypass is scoped to THIS one request (rejectUnauthorized on
    // its own request options) -- never a process-wide env var, which every
    // other https call in this process and every spawned child would inherit.
    const auth = Buffer.from(opts.stagingAuth).toString("base64");
    return new Promise((resolveGate) => {
      const u = new URL(`${opts.stagingUrl}/_status`);
      const req = httpRequest(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: `${u.pathname}${u.search}`,
          method: "GET",
          headers: { authorization: `Basic ${auth}` },
          rejectUnauthorized: false,
          timeout: 15_000,
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            if (res.statusCode === 401) {
              resolveGate({ ok: false, error: "401 unauthorized -- check DUAL_LANE_STAGING_AUTH" });
              return;
            }
            try {
              resolveGate({ ok: res.statusCode === 200, status: JSON.parse(body), via: "https" });
            } catch {
              resolveGate({ ok: false, error: `unparseable /_status body: ${body.slice(0, 120)}` });
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("timed out after 15s")));
      req.on("error", (e) => resolveGate({ ok: false, error: `https gate failed: ${e?.message ?? e}` }));
      req.end();
    });
  }

  async function stagingGate() {
    if (opts.skipStagingGate) {
      log("STAGING GATE: skipped (--skip-staging-gate)");
      return null;
    }
    log(`STAGING GATE: checking ${opts.stagingUrl}/_status ...`);
    const r = opts.stagingAuth ? await stagingGateViaHttps() : stagingGateViaSsh();
    if (!r.ok || r.status?.ok !== true) {
      log(`STAGING GATE: FAILED -- ${r.error ?? JSON.stringify(r.status)}`);
      log(
        "The staging origin is not serving a healthy engine. If a deploy is in " +
          "flight, WAIT for it to finish and re-run this command (capture + grade " +
          "resume; nothing is re-paid). Not grading against a dead/mid-restart origin.",
      );
      process.exit(3);
    }
    const s = r.status;
    log(
      `STAGING GATE: LIVE via ${r.via} -- engine=${s.engine} cards=${s.database?.card_count} ` +
        `booted_at=${s.deck?.booted_at} db=${s.deck?.path ?? "?"}`,
    );
    return s;
  }

  // ---------- capture ----------

  function buildOneShardSample(shardName) {
    if (!SHARD_RE.test(shardName)) {
      fail(`--shard must look like recapture-raw-shard-NNNNNN.jsonl (got ${shardName}); ` +
        "the grader's SHARD_RE only consumes that shape");
    }
    if (!existsSync(DISPUTED_SET)) fail(`disputed set missing: ${DISPUTED_SET}`);
    const disputed = JSON.parse(readFileSync(DISPUTED_SET, "utf8"));
    const shardKey = shardName.replace(/^recapture-raw-shard-/, "shard-");
    const cards = disputed.cards
      .filter((c) => c.shard === shardKey && c.id != null && c.name != null)
      .map((c) => ({
        id: c.id,
        name: c.name,
        // views verbatim-in-VIEW_ORDER exactly as FULL mode would use them
        views: (c.views ?? []).filter((v) => ["title", "closed", "open", "content"].includes(v)),
      }))
      // FULL mode sorts each shard slice by [shard, name]; SAMPLE mode does
      // NOT sort -- it preserves sample-file order. Sorting here by name bytes
      // (shard is constant within one shard) makes a one-shard capture
      // byte-match the FULL-mode line order.
      .sort((a, b) =>
        Buffer.compare(Buffer.from(a.name, "utf8"), Buffer.from(b.name, "utf8")),
      );
    if (cards.length === 0) fail(`no disputed-set cards found for ${shardKey}`);
    const sample = {
      // SAMPLE mode names output files "<label>.jsonl" -- the label IS the seam
      // that makes a one-shard capture land in the grader's exact shard shape.
      label: shardName.replace(/\.jsonl$/, ""),
      note: "One-shard slice generated by capture-and-grade.mjs from disputed-set-resolved.json " +
        "(cards + views verbatim, so lane V matches FULL-mode bytes). SAMPLE mode rewrites it every run.",
      cards,
    };
    const out = path.join(TARGET_RG, "scripts", `oneshard-${shardName.replace(/\.jsonl$/, "")}-cards.json`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(sample, null, 2) + "\n");
    log(`SAMPLE: ${cards.length} cards, ${cards.reduce((a, c) => a + c.views.length, 0)} view entries -> ${out}`);
    return out;
  }

  function archiveExistingShards() {
    const ts = stamp();
    let archived = false;
    for (const [lane, dir] of Object.entries(TARGET_LANES)) {
      if (!existsSync(dir)) continue;
      const shards = readdirSync(dir).filter((f) => SHARD_RE.test(f));
      if (shards.length === 0) continue;
      const archiveDir = path.join(path.dirname(dir), `.pre-recapture-${ts}`);
      mkdirSync(archiveDir, { recursive: true });
      for (const f of shards) {
        renameSync(path.join(dir, f), path.join(archiveDir, lane + "-" + f));
      }
      log(`FRESH: archived ${shards.length} ${lane}-lane shards (content preserved) -> ${archiveDir}`);
      archived = true;
    }
    if (archived && existsSync(TARGET_MANIFEST)) {
      // A stale manifest next to an archived-away photograph is exactly the
      // mixed state the provenance gate exists to prevent. Rename it with the
      // archive (content preserved), never delete.
      const stale = path.join(path.dirname(TARGET_MANIFEST), `capture-manifest.stale-${ts}.json`);
      renameSync(TARGET_MANIFEST, stale);
      log(`FRESH: archived stale capture manifest (content preserved) -> ${stale}`);
    }
  }

  function runCapture(samplePath) {
    stage(oracleScript, TARGET_SCRIPT, "capture instrument (ruby)");
    stage(ORACLE_CANONICAL_DECK, TARGET_DECK, "oracle corpus copy");
    // The instrument clears <staged-app>/tmp/cache relative to ITS OWN location;
    // when the booted app lives in the oracle checkout (untracked, worktrees do
    // not have it), the runbook replicates the instrument's own cache-clear on
    // the app that actually boots -- same convention, right directory.
    const appCache = path.join(ORACLE_APP, "tmp", "cache");
    try {
      for (const f of readdirSync(appCache)) {
        renameSync(path.join(appCache, f), path.join(appCache, f + ".gone-" + stamp()));
        // renamed siblings are inert cache junk; the instrument's own glob-clear
        // on its next canonical-location run removes them
      }
    } catch { /* no cache dir yet -- nothing to clear */ }

    // DATABASE_URL is URI-parsed by activerecord (connection_url_resolver):
    // a backslash Windows path is mangled through the cmd.exe spawn and dies
    // with URI::InvalidURIError at boot. The proven runbook commands use
    // forward slashes -- match that shape exactly.
    //
    // The corpus is opened READ-ONLY. The verified
    // mechanism on this stack (activerecord 7.2.3.2 + sqlite3 2.9.6, both read
    // in C:/Ruby33-x64 this session) is the `readonly` connection param: the
    // resolver passes query params through verbatim into
    // SQLite3::Database.new, whose `options[:readonly]` truthiness selects
    // SQLITE_OPEN_READONLY. (A literal "?mode=ro" form does NOT
    // exist in the gem and would be silently ignored -- corrected here.)
    // The instrument additionally enforces and asserts PRAGMA query_only=1,
    // and the manifest's before/after corpus hash gates the result either way.
    const dbUrl = TARGET_DECK.split(path.sep).join("/");
    const env = {
      ...process.env,
      RAILS_ENV: "development",
      DATABASE_URL: `sqlite3:${dbUrl}?readonly=true`,
      DUAL_LANE_DB: dbUrl, // isolated-copy acknowledgement (guard requirement)
    };
    delete env.DUAL_LANE_SAMPLE;
    if (samplePath) env.DUAL_LANE_SAMPLE = samplePath;

    const args = ["exec", "decko", "runner", TARGET_SCRIPT];
    const label = samplePath ? "capture(one-shard)" : "capture(48-shard FULL)";
    log(
      `${label}: START via ${ORACLE_APP} (Rails boot ~60s amortized; ` +
        `${samplePath ? "sample mode, always rewritten" : "FULL mode, complete shard pairs resume-skip"}; ` +
        `corpus opened READ-ONLY: sqlite3:...?readonly=true + PRAGMA query_only=1)`,
    );
    const t0 = Date.now();
    return new Promise((resolve) => {
      const child = spawn("bundle " + args.join(" "), {
        cwd: ORACLE_APP,
        env,
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      log(`${label}: pid=${child.pid}`);
      let output = "";
      const collect = (chunk) => {
        const text = chunk.toString();
        output += text;
        if (LOG_FILE) {
          try {
            appendFileSync(LOG_FILE, text.endsWith("\n") ? text : text + "\n");
          } catch { /* log unavailable */ }
        }
        for (const line of text.split("\n")) {
          if (line.trim() !== "" && !opts.quiet) process.stdout.write(`[capture] ${line}\n`);
        }
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("close", (code) => {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const shardLines = output.split("\n").filter((l) => /shard=\S+ cards=\d+/.test(l));
        const done = output.split("\n").find((l) => l.startsWith("DONE dual_lane_shards="));
        const rubyPid = (output.match(/capture_boot_pid=(\d+)/) || [])[1] ?? null;
        log(`${label}: DONE exit=${code} ${secs}s shard-lines=${shardLines.length} ${done ?? ""}`);
        resolve({
          code,
          secs,
          shardLines,
          done,
          bootPids: { runner: child.pid, ruby: rubyPid ? Number(rubyPid) : null },
        });
      });
      child.on("error", (e) => {
        log(`${label}: SPAWN-ERROR ${e.message}`);
        resolve({ code: 1, secs: "0", shardLines: [], done: "", bootPids: { runner: child.pid, ruby: null } });
      });
    });
  }

  // ---------- manifest (corpus identity before/after) ----------

  function buildCaptureManifest({ corpusBefore, corpusAfter, counterBefore, counterAfter, cap, startedAt, finishedAt }) {
    return {
      schema: "capture-manifest/1",
      corpusSha256: { before: corpusBefore, after: corpusAfter },
      sqliteHeaderChangeCounter: {
        before: counterBefore,
        after: counterAfter,
        note: "SQLite header offset 24, big-endian uint32 (file format: sqlite.org/fileformat2.html); increments on every transaction",
      },
      captureScriptSha256: stagedScriptSha,
      disputedSetSha256: sha256File(DISPUTED_SET),
      sampleSha256: sampleManifestSha,
      railsEnv: "development",
      bootPids: cap.bootPids,
      startedAt,
      finishedAt,
      hostOs: `${os.platform()} ${os.release()} ${os.arch()}`,
      mode: opts.shard ? `one-shard: ${opts.shard}` : "FULL 48-shard",
      corpusPath: TARGET_DECK,
      expectedV2: TARGET_EXPECTED_V2,
      photographDir: photographDir ?? null,
    };
  }

  // ---------- grade ----------

  function runGrade(floors, artifactsDir, filesArgs) {
    mkdirSync(artifactsDir, { recursive: true });
    const args = [
      VERIFIER_FAST,
      "--repo", REPO,
      "--floors", floors,
      "--report-only",
      "--workers", String(opts.workers),
      "--artifacts", artifactsDir,
      ...filesArgs,
    ];
    log(`grade: START node ${args.join(" ")}`);
    const t0 = Date.now();
    return new Promise((resolve) => {
      const child = spawn("node " + args.join(" "), {
        cwd: path.dirname(VERIFIER_FAST),
        env: { ...process.env },
        shell: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const collect = (chunk) => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text); // verifier-fast streams its own progress lines live
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("close", (code) => {
        log(`grade: DONE exit=${code} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        resolve({ code, output });
      });
      child.on("error", (e) => {
        log(`grade: SPAWN-ERROR ${e.message}`);
        resolve({ code: 1, output: "" });
      });
    });
  }

  // ---------- verdict ----------

  function plainEnglishVerdict(grade, floors, staging, captureExit, captureErrors) {
    let verdict = null;
    if (grade.code === 0) verdict = "PASS";
    else if (grade.code === 2) verdict = "STALLED (a grading phase breached its deadline; see the artifacts log)";
    else verdict = "FAIL";
    const totals = [...grade.output.split("\n")].filter((l) => l.includes("TOTALS"));
    const floorLine = [...grade.output.split("\n")].reverse().find((l) => l.includes("FLOORS "));
    const deploy = staging
      ? `staging deploy booted ${staging.deck?.booted_at}`
      : "existing expected-v2 tree (staging gate skipped)";
    console.log("");
    console.log(
      `VERDICT: ${verdict} -- measured: ${deploy}. ` +
        `${totals.find((l) => l.includes("view"))?.replace(/^.*TOTALS /, "") ?? "view ?"} | ` +
        `${totals.find((l) => l.includes("page"))?.replace(/^.*TOTALS /, "") ?? "page ?"} | ` +
        `captureErrors=${captureErrors.total} (floor ${
          Number.isFinite(floors.captureErrors) ? floors.captureErrors : "unlimited"
        }) | ` +
        `${floorLine?.replace(/^.*FLOORS /, "floors: ") ?? `floors view=${floors.view},page=${floors.page}`}`,
    );
    writeFileSync(
      path.join(artifactsDir, "capture-and-grade-summary.json"),
      JSON.stringify(
        {
          runId,
          repo: REPO,
          mode: opts.shard ?? "FULL",
          floors,
          captureErrors,
          manifest: existsSync(TARGET_MANIFEST) ? JSON.parse(readFileSync(TARGET_MANIFEST, "utf8")) : null,
          stagingBootedAt: staging?.deck?.booted_at ?? null,
          captureExit,
          gradeExit: grade.code,
          verdict,
        },
        null,
        2,
      ) + "\n",
    );
  }

  // ---------- main flow ----------

  const staging = await stagingGate();

  // Unique per invocation on purpose (fresh grade generation; the server's
  // booted_at is a check-time stamp). Resume = re-run with the same --run-id.
  const defaultRunId = staging?.deck?.booted_at
    ? "gate-" + String(staging.deck.booted_at).replace(/[:.]/g, "-")
    : "local-" + stamp();
  const runId = opts.runId ?? defaultRunId;
  const artifactsDir = path.join(REPO, "tmp", `verifier-fast-artifacts-${runId}`);
  mkdirSync(artifactsDir, { recursive: true });
  LOG_FILE = path.join(artifactsDir, "capture-and-grade.log");
  if (staging) {
    writeFileSync(
      path.join(artifactsDir, "staging-gate.json"),
      JSON.stringify({ checkedAt: new Date().toISOString(), staging }, null, 2) + "\n",
    );
  }
  log(`run: repo=${REPO} mode=${opts.shard ? `one-shard (${opts.shard})` : "FULL 48-shard"} run-id=${runId}`);

  const floors = resolveFloors(opts.floors, Boolean(opts.shard), log);

  // The Ruby instrument to stage (the staged copy is sha-verified; the staged
  // hash is what the manifest records, so the photograph names its camera).
  const oracleScript = resolveOracleScript(ORACLE_REPO);
  if (!oracleScript) {
    fail(
      `capture-dual-lane-page-and-view.rb not found under oracle repo ${ORACLE_REPO} ` +
        "(looked in tools/oracle/ and tmp/raw-ground-truth/scripts/) -- the camera " +
        "instrument is missing",
    );
  }
  log(`instrument: ${oracleScript}`);

  // Content-addressed photograph location, computed as soon as the corpus
  // hash is known. Existing photographs are never overwritten.
  let photographDir = null;

  let sampleManifestSha = null;
  let stagedScriptSha = null;
  let capExit = "skipped";

  const captureNow = !opts.skipCapture && !opts.photographs;

  if (opts.photographs) {
    // M6 grade-from side: gate the immutable photograph's manifest against the
    // live corpus, then project its shards into the repo (verified copies).
    const photoManifest = path.join(opts.photographs, MANIFEST_FILENAME);
    log(`photographs: grading from ${opts.photographs}`);
    const gate = verifyManifestForGrading({
      manifestPath: photoManifest,
      corpusFile: TARGET_DECK,
    });
    if (!gate.ok) {
      for (const r of gate.refusals) log(`PROVENANCE REFUSAL: ${r}`);
      console.error(
        "PROVENANCE GATE: the photograph does not match the corpus in the repo -- " +
          "stage the photographed corpus (or point --oracle-repo/--repo at the right pair) and re-run. exit 4",
      );
      process.exit(4);
    }
    log(
      `photographs: manifest binds this photograph to corpus sha256 ${gate.manifest.corpusSha256.after.slice(0, 12)}... ` +
        `-- live corpus matches`,
    );
    archiveExistingShards();
    for (const [lane, dir] of Object.entries(TARGET_LANES)) {
      const srcDir = path.join(opts.photographs, `${lane}-lane`);
      if (!existsSync(srcDir)) fail(`photograph is missing its ${lane}-lane directory: ${srcDir}`);
      for (const f of readdirSync(srcDir).filter((f) => SHARD_RE.test(f))) {
        stage(path.join(srcDir, f), path.join(dir, f), `photograph ${lane}-lane/${f}`);
      }
    }
    stage(photoManifest, TARGET_MANIFEST, "photograph manifest");
  } else if (captureNow) {
    if (opts.fresh && !opts.shard) archiveExistingShards();
    const samplePath = opts.shard ? buildOneShardSample(opts.shard) : null;
    sampleManifestSha = samplePath ? sha256File(samplePath) : null;

    // STAGING-VERIFICATION PREFLIGHT (see header): hash the staged corpus
    // BEFORE any staging copy runs, and -- when this worktree already holds a
    // photograph manifest -- refuse unless the bytes still match the sha that
    // manifest binds. This is the between-runs window the past swap used:
    // previously nothing compared the staged corpus to the photograph until
    // grade start, up to hours of capture work later.
    if (!existsSync(TARGET_DECK)) {
      if (existsSync(TARGET_MANIFEST)) {
        console.error(
          `PROVENANCE REFUSAL: the photograph's staged corpus is missing at ${TARGET_DECK} ` +
            `while ${TARGET_MANIFEST} still binds it -- the corpus was removed or renamed ` +
            "out from under a photograph. Restore the corpus (exit 4).",
        );
        process.exit(4);
      }
      fail(
        `no staged corpus at ${TARGET_DECK} -- capture stages it from the oracle repo ` +
          `(${ORACLE_CANONICAL_DECK}); that source is missing too`,
      );
    }
    const corpusBefore = sha256File(TARGET_DECK);
    if (existsSync(TARGET_MANIFEST)) {
      const preflight = verifyManifestForGrading({
        manifestPath: TARGET_MANIFEST,
        corpusFile: TARGET_DECK,
        liveCorpusSha256: corpusBefore,
      });
      const boundSha = preflight.manifest?.corpusSha256?.after ?? null;
      if (!preflight.ok) {
        for (const r of preflight.refusals) log(`PROVENANCE REFUSAL: ${r}`);
        console.error(
          "PROVENANCE GATE (staging preflight): the staged corpus no longer matches the sha " +
            `this worktree's photograph manifest binds -- expected corpus sha256 ` +
            `${boundSha ?? "(manifest unreadable)"}, live corpus on disk ${corpusBefore}. ` +
            "The staged corpus was swapped since the last photograph; refusing to stage or " +
            "grade over it (exit 4). If replacing the corpus is intentional, re-run with " +
            "--fresh, which archives the old photograph + manifest first.",
        );
        process.exit(4);
      }
      log(
        `staging preflight: corpus sha256 ${corpusBefore.slice(0, 16)}... matches the existing ` +
          `photograph manifest binding (${boundSha}) -- staged corpus unchanged since that photograph`,
      );
    }

    // Identity of the corpus BEFORE the camera touches it.
    const counterBefore = sqliteHeaderChangeCounter(TARGET_DECK);
    log(
      `corpus: sha256=${corpusBefore.slice(0, 16)}... changeCounter=${counterBefore} (${TARGET_DECK})`,
    );
    photographDir = opts.photographRoot
      ? contentAddressedPhotographPath(opts.photographRoot, corpusBefore, runId)
      : null;
    const startedAt = new Date().toISOString();

    const cap = await runCapture(samplePath);
    capExit = cap.code;

    // Identity of the corpus AFTER the capture -- both recorded; they
    // must be equal for this photograph to exist.
    const corpusAfter = sha256File(TARGET_DECK);
    const counterAfter = sqliteHeaderChangeCounter(TARGET_DECK);
    const finishedAt = new Date().toISOString();
    stagedScriptSha = sha256File(TARGET_SCRIPT);

    if (cap.code !== 0) {
      // Half-rewritten shards under a stale manifest is exactly the mixed
      // state the gate exists to prevent; rename the manifest out of the way
      // (content preserved) so nothing downstream grades this tree as proven.
      if (existsSync(TARGET_MANIFEST)) {
        const stale = path.join(path.dirname(TARGET_MANIFEST), `capture-manifest.stale-${stamp()}.json`);
        renameSync(TARGET_MANIFEST, stale);
        log(`capture FAILED: renamed stale capture manifest out of the way (content preserved) -> ${stale}`);
      }
      console.log(
        `VERDICT: CAPTURE FAILED (exit ${cap.code}) -- see [capture] output above. ` +
          "If a deploy restart landed mid-run this is the expected signature; wait for the deploy to settle and re-run (resume-safe).",
      );
      process.exit(1);
    }

    const manifest = buildCaptureManifest({
      corpusBefore, corpusAfter, counterBefore, counterAfter, cap, startedAt, finishedAt,
    });
    mkdirSync(path.dirname(TARGET_MANIFEST), { recursive: true });
    writeFileSync(TARGET_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    log(`manifest: ${TARGET_MANIFEST}`);

    if (corpusBefore !== corpusAfter) {
      for (const r of [`corpus sha256 CHANGED DURING capture (before ${corpusBefore.slice(0, 12)}... != after ${corpusAfter.slice(0, 12)}...)`]) {
        log(`PROVENANCE REFUSAL: ${r}`);
      }
      console.error(
        "PROVENANCE GATE: the deck moved under the camera -- this capture photographed a moving " +
          "corpus and is void (exit 4). The manifest records the mismatch as evidence; find the writer " +
          "before re-capturing.",
      );
      process.exit(4);
    }
    log(
      `corpus: post-capture sha256 equal (${corpusAfter.slice(0, 16)}...), changeCounter before=${counterBefore} after=${counterAfter}`,
    );
  } else {
    log("capture: skipped (--skip-capture) -- grading the existing expected-v2 tree");
  }

  // The refusal gate: no manifest, no
  // grade; before != after, no grade; grade-start hash != recorded hash, no
  // grade. Runs in every mode (fresh capture, re-grade, photograph
  // projection) against the tree the verifier is about to consume.
  if (!existsSync(TARGET_DECK)) {
    fail(
      `no staged corpus at ${TARGET_DECK} -- provenance gates hash the corpus the photograph ` +
        "was taken from; stage it (capture) or point --repo at the checkout holding it",
    );
  }
  const laneDirsPresent = Object.values(TARGET_LANES).filter((d) => existsSync(d)).length;
  if (laneDirsPresent !== Object.keys(TARGET_LANES).length) {
    fail(
      `expected-v2 is incomplete (view-lane/page-lane missing under ${TARGET_EXPECTED_V2}) -- ` +
        "a manifest without both photographed lanes is not a photograph; re-capture",
    );
  }
  const gate = verifyManifestForGrading({
    manifestPath: TARGET_MANIFEST,
    corpusFile: TARGET_DECK,
  });
  if (!gate.ok) {
    for (const r of gate.refusals) log(`PROVENANCE REFUSAL: ${r}`);
    console.error(
      "PROVENANCE GATE: refusing to grade an expected-v2 tree whose provenance does not check out (exit 4). " +
        "Re-capture, or grade an immutable photograph via --photographs.",
    );
    process.exit(4);
  }
  log(
    `provenance: OK -- manifest binds expected-v2 to corpus sha256 ${gate.manifest.corpusSha256.after.slice(0, 16)}... (live corpus matches)`,
  );

  // capture-error floor: audited from the photographed bytes, gated before any
  // grading minutes are spent.
  const shardFiles = opts.shard
    ? [opts.shard]
    : readdirSync(TARGET_LANES.view).filter((f) => SHARD_RE.test(f));
  const captureErrors = countCaptureErrors(TARGET_LANES, shardFiles);
  const floorNumber = floors.captureErrors;
  if (captureErrors.total > floorNumber) {
    log(
      `CAPTURE-ERROR FLOOR: ${captureErrors.total} sentinel rows ` +
        `(view ${captureErrors.view}, page ${captureErrors.page}) over floor ${floorNumber} -- ` +
        "this photograph is not a yardstick (exit 4). If the generation legitimately renders more, " +
        "pin it explicitly: --floors captureErrors=<n>.",
    );
    process.exit(4);
  }
  log(
    `capture errors: ${captureErrors.total} (view ${captureErrors.view}, page ${captureErrors.page}; floor ${
      Number.isFinite(floorNumber) ? floorNumber : "unlimited"
    }, target 0)`,
  );

  // Write side: preserve the photograph immutably once it has passed every
  // gate. Never overwrite an existing photograph directory. The address is
  // taken from the gate-verified manifest record (gate passed, so the live
  // corpus equals it), which also makes --photograph-root work in
  // --skip-capture mode (promoting an existing tree to a photograph).
  if (opts.photographRoot) {
    const photoDir = contentAddressedPhotographPath(
      opts.photographRoot,
      gate.manifest.corpusSha256.after,
      runId,
    );
    if (existsSync(photoDir)) {
      fail(
        `photograph already exists at ${photoDir} -- photographs are immutable; ` +
          "re-run with a different --run-id to take a new photograph",
      );
    }
    mkdirSync(photoDir, { recursive: true });
    for (const [lane, dir] of Object.entries(TARGET_LANES)) {
      for (const f of readdirSync(dir).filter((f) => SHARD_RE.test(f))) {
        stage(path.join(dir, f), path.join(photoDir, `${lane}-lane`, f), `photograph ${lane}-lane/${f}`);
      }
    }
    stage(TARGET_MANIFEST, path.join(photoDir, MANIFEST_FILENAME), "photograph manifest");
    log(`photograph: preserved at ${photoDir} (content-addressed by corpus sha8 + run id)`);
  }

  // Shard proofs grade one shard: handled by the floors resolution above;
  // full-corpus floors are the default.
  const filesArgs = opts.shard ? ["--files", opts.shard] : [];
  const verifierFloors = `view=${floors.view},page=${floors.page}`;

  log(`artifacts: ${artifactsDir} (grading generation keyed to: ${runId})`);
  const grade = await runGrade(verifierFloors, artifactsDir, filesArgs);

  plainEnglishVerdict(grade, floors, staging, captureNow ? capExit : (opts.photographs ? "photograph" : "skipped"), captureErrors);
  process.exit(grade.code === 0 ? 0 : grade.code === 2 ? 2 : 1);
}

// Entry guard: running as a program executes main(); importing this module
// (tests, tooling) must stay side-effect free.
const INVOKED_DIRECTLY = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (INVOKED_DIRECTLY) {
  await main();
}
