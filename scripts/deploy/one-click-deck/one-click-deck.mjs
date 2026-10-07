// one-click-deck.mjs — THE one-click Cloudflare deployment command for
// decko-ts (tier 1 of the two-product shape: CF token in -> a fresh decko
// on a free account). Single command, three modes:
//
//   DRY-RUN (default) — prints every step of the flow with its EXACT D1
//     write count and the budget verdict, executes NOTHING remote, contacts
//     nothing. This is the mode you get by running the script bare.
//
//   --local — the local demo: provisions a local workerd D1 (via
//     `wrangler d1 execute --local`, no account, no network) with the
//     schema + the fitting-scale seed, then prints the exact `wrangler dev`
//     command. Zero remote CF calls; the child env is even stripped of
//     CLOUDFLARE_* credentials so a local run cannot accidentally reach
//     the account.
//
//   --execute --token <CF_API_TOKEN> --account-id <ACCOUNT_ID>
//       --i-understand-this-writes-to-my-cloud-account
//     — the REAL one-click run against a Cloudflare account. This mode
//     creates a D1 database and a Worker on the account you name, and writes
//     tens of thousands of rows into the account's D1 database. Every D1
//     write step goes through the write-budget gate first: the step's exact
//     row count is declared, checked against the 80,000-row guard (80% of
//     the 100,000 rows/day free tier), and the run REFUSES (exit 2,
//     "--budget-exceeded") rather than cross it.
//
//     --execute additionally REFUSES to start unless you also pass
//     --i-understand-this-writes-to-my-cloud-account. That flag is enforced:
//     it is the difference between a tool that can write to someone's
//     account and a tool that announces it and asks once. It is a real gate,
//     not a note in the output — run --execute without it and the process
//     exits before any network call.
//
// Budget rule encoded here: arithmetic BEFORE every write; the tool never
// suggests the paid plan; anything that would span multiple UTC days is
// refused rather than executed piecemeal, and the refusal is the tool's
// decision to surface, not the caller's to overrule by re-running.
//
// Platform rule: all platform-specific operations live in platform-ops.mjs
// (dual-path or a LOUD PLATFORM-OPS error — never a silent no-op).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { npxInvocation, repoRoot, outDir, PlatformOpsError } from "./platform-ops.mjs";
import {
  WriteBudgetLedger,
  D1_FREE_DAILY_ROW_WRITES,
  GUARD_ROW_LIMIT,
  ANALYZE_ROWS_ESTIMATE,
} from "./write-budget.mjs";
import { planSeed, generateSeedFiles, REMOTE_CHUNK_STATEMENTS } from "./seed-fitting-scale.mjs";

const REPO = repoRoot(import.meta.url);
const OUT = outDir(import.meta.url);
const WORKER_TS = join(REPO, "deploy", "worker.ts");
const CRYPTO_SHIM = join(REPO, "deploy", "shims", "node-crypto-shim.ts");
const SCHEMA_FILE = join(REPO, "deploy", "migrations", "0001-schema.sql");
const CONFIG_TOML = join(REPO, "scripts", "deploy", "one-click-deck", "wrangler.oneclick.toml");
const PLACEHOLDER_DB_ID = "00000000-0000-0000-0000-000000000001";
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

const EXIT_OK = 0;
const EXIT_GENERAL = 1;
const EXIT_BUDGET_EXCEEDED = 2;
const EXIT_PLATFORM_OPS = 3;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    execute: false,
    accountWritesUnderstood: false,
    local: false,
    dryRun: false,
    token: process.env.CF_API_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN ?? null,
    accountId: process.env.CF_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? null,
    cards: 6200, // the guard-fitting default; see seed-fitting-scale.mjs header
    workerName: "decko-one-click-demo",
    dbName: "decko-one-click-db",
    spentToday: 0,
    localOverBudget: false,
    serve: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--execute": args.execute = true; break;
      case "--i-understand-this-writes-to-my-cloud-account":
        args.accountWritesUnderstood = true; break;
      case "--local": args.local = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--token": args.token = next(); break;
      case "--account-id": args.accountId = next(); break;
      case "--cards": args.cards = Number(next()); break;
      case "--worker-name": args.workerName = next(); break;
      case "--db-name": args.dbName = next(); break;
      case "--spent-today": args.spentToday = Number(next()); break;
      case "--local-over-budget": args.localOverBudget = true; break;
      case "--serve": args.serve = true; break;
      case "--help": case "-h": args.help = true; break;
      default:
        fail(`unknown argument "${a}" (see --help)`);
    }
  }
  return args;
}

function fail(message, code = EXIT_GENERAL) {
  console.error(`one-click-deck: ${message}`);
  process.exit(code);
}

function help() {
  console.log(`one-click-deck — one-click Cloudflare deployment for decko-ts

MODES
  (no flags)                  DRY-RUN: print every step + its exact D1 write
                              count and the budget verdict. Executes nothing
                              remote. This is always safe.
  --local                     LOCAL DEMO: provision local workerd D1 (schema +
                              fitting-scale seed) via 'wrangler d1 execute
                              --local' — no account, no network — then print
                              the 'wrangler dev' command. Add --serve to boot
                              the dev server in this terminal.
  --execute --token <t> --account-id <id>
                              REAL RUN against a Cloudflare account. Creates
                              a D1 database and a Worker on that account and
                              writes tens of thousands of rows into its D1
                              database. Every D1 write step passes the
                              write-budget gate (refuses at 80% of the
                              100,000 rows/day free tier, exit 2
                              '--budget-exceeded').
                              REQUIRED alongside --execute:
                              --i-understand-this-writes-to-my-cloud-account
                              Without it the run stops before any network
                              call. Pass it only when you have looked at the
                              dry-run plan and want those writes made.

OPTIONS
  --cards <n>                 Scale Pages in the fitting-scale seed
                              (default 6,200 = the largest deck that fits the
                              80% guard; 6,600 REFUSES: 85.06% of the day).
  --worker-name <name>        Worker name (default decko-one-click-demo)
  --db-name <name>            D1 database name (default decko-one-click-db)
  --spent-today <n>           Rows already written to the account today by
                              OTHER operations (counted into the guard).
  --local-over-budget         LOCAL MODE ONLY: allow a seed past the guard
                              (local writes consume no CF quota). Never valid
                              with --execute.
  --serve                     (with --local) run 'wrangler dev' in the foreground.
`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Child env for anything that must stay OFF the account: credentials are
 * REMOVED, not passed through, and metrics are off. Belt and suspenders for
 * the zero-remote-calls guarantee in --local / dry-run. */
function sanitizedEnv() {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CF_API_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.CF_ACCOUNT_ID;
  env.WRANGLER_SEND_METRICS = "false";
  env.CI = "true";
  return env;
}

function runWrangler(argsList, { cwd, label }) {
  const { command, wranglerArgsPrefix, useShell } = npxInvocation();
  const full = [...wranglerArgsPrefix, ...argsList];
  console.log(`  $ ${command} ${full.join(" ")}`);
  const result = spawnSync(command, full, {
    cwd,
    shell: useShell,
    env: sanitizedEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(result.stdout?.slice(-4000));
    console.error(result.stderr?.slice(-4000));
    fail(`wrangler step failed (${label}, exit ${result.status})`);
  }
  return result.stdout ?? "";
}

function maskToken(token) {
  if (!token) return "(none)";
  return token.length <= 8 ? "****" : `${token.slice(0, 4)}...${token.slice(-4)}`;
}

async function cfApi(method, path, token, body) {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    throw new Error(`CF API ${method} ${path} failed: HTTP ${response.status} ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.result;
}

function relToRepo(p) {
  return relative(REPO, p).split(sep).join("/");
}

// ---------------------------------------------------------------------------
// the step plan (single source of truth for dry-run AND execute)
// ---------------------------------------------------------------------------

function buildSteps({ plan, remoteChunkCount, workerName, dbName }) {
  const seedChunks = relToRepo(join(OUT, "fitting-scale-seed", "remote-800"));
  return [
    {
      name: "1. verify CF API token",
      writesRows: 0,
      executeOnly: true,
      describe: () =>
        `GET ${CF_API_BASE}/user/tokens/verify — read-only account check. Writes nothing.`,
      remoteCommands: () => [`(https) GET ${CF_API_BASE}/user/tokens/verify`],
    },
    {
      name: `2. create D1 database "${dbName}"`,
      writesRows: 0,
      executeOnly: true,
      describe: () =>
        `POST /accounts/<account>/d1/database — resource creation, 0 table rows written.`,
      remoteCommands: () => [`(https) POST ${CF_API_BASE}/accounts/<account>/d1/database {"name":"${dbName}"}`],
    },
    {
      name: "3. apply schema (deploy/migrations/0001-schema.sql)",
      writesRows: 0,
      executeOnly: false,
      describe: () =>
        `DDL only (13 CREATE TABLE + 35 CREATE INDEX): 0 DATA rows. ` +
        `Counted 0 under the table-rows convention; index entries are absorbed by headroom.`,
      remoteCommands: () => [
        `npx wrangler d1 execute ${dbName} --remote --config ${relToRepo(CONFIG_TOML)} --file ${relToRepo(SCHEMA_FILE)}`,
      ],
    },
    {
      name: `4. fitting-scale seed (${plan.cardRows} cards + ${plan.refRows} refs, ${remoteChunkCount} chunks x <=${REMOTE_CHUNK_STATEMENTS} stmts)`,
      writesRows: plan.seedRows,
      perChunk: true,
      executeOnly: false,
      describe: () =>
        `Exact: ${plan.cardRows} single-row card INSERTs + ${plan.refRows} single-row ref INSERTs ` +
        `= ${plan.seedRows} rows. Ref density = corpus ratio 1,112,560/93,700 = ` +
        `${plan.refsPerCard.toFixed(6)} refs/card. Chunked at ${REMOTE_CHUNK_STATEMENTS} statements ` +
        `(the chunk size verified against the remote D1 endpoint's per-request limits).`,
      remoteCommands: () => [
        `for f in ${seedChunks}/chunk-*.sql: npx wrangler d1 execute ${dbName} --remote --config ${relToRepo(CONFIG_TOML)} --file $f`,
      ],
    },
    {
      name: "5. ANALYZE (planner stats; REQUIRED — see deploy/README.md step 3b)",
      writesRows: ANALYZE_ROWS_ESTIMATE,
      executeOnly: false,
      describe: () =>
        `Writes sqlite_stat1 (one row per index, 35 indexes; conservatively ${ANALYZE_ROWS_ESTIMATE}). ` +
        `Without this the planner estimates every equality alike and can read far more rows per lookup.`,
      remoteCommands: () => [
        `npx wrangler d1 execute ${dbName} --remote --config ${relToRepo(CONFIG_TOML)} --command "ANALYZE"`,
      ],
    },
    {
      name: `6. deploy Worker "${workerName}"`,
      writesRows: 0,
      executeOnly: true,
      describe: () => `npx wrangler deploy — bundles deploy/worker.ts + engine. 0 D1 rows.`,
      remoteCommands: () => [`npx wrangler deploy --config ${relToRepo(CONFIG_TOML)}`],
    },
    {
      name: `7. assets`,
      writesRows: 0,
      executeOnly: false,
      describe: () =>
        `STATIC ASSETS via the wrangler [assets] directory ` +
        `(scripts/deploy/one-click-deck/demo-static-assets/, uploaded together ` +
        `with the worker bundle in step 6): all-style.css + all-script.js ` +
        `(the SassC+Uglifier-compiled skin, sha256-matched to the render VM's ` +
        `oracle-assets), decko-config.js, robots.txt. The assets layer serves ` +
        `them before the worker runs: 0 D1 rows read or written.`,
      remoteCommands: () => [],
    },
    {
      name: "8. verify URL (read-only)",
      writesRows: 0,
      executeOnly: false,
      describe: () =>
        `GET https://${workerName}.<subdomain>.workers.dev/_status then GET / — reads only ` +
        `(well inside the 5,000,000 rows-read/day free tier; the /_status COUNT reads ~${plan.cardRows} rows).`,
      remoteCommands: () => [`(https) GET https://${workerName}.<subdomain>.workers.dev/_status`],
    },
  ];
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------

function printBudgetHeader(ledger, mode) {
  const s = ledger.summary();
  console.log(`  budget: limit ${s.dailyLimit}/day (UTC), guard ${s.guardLimit} (80%), ` +
    `spent today: ${s.spentTodayExternal} external + ${s.spentByThisTool} by this tool ` +
    `= ${s.spentTodayTotal}, remaining ${s.remainingToday} [mode: ${mode}]`);
}

function printStepGuard(ledger, step, pendingRows = 0) {
  if (step.writesRows === 0) {
    console.log(`  writes 0 rows — no gate needed`);
    return true;
  }
  const verdict = ledger.check(step.name, step.writesRows, pendingRows);
  console.log(
    `  GATE: ${verdict.rows} rows -> projected ${verdict.projected}/${verdict.guardLimit} ` +
    `(${verdict.percentOfDailyLimit}% of the day) — ${verdict.pass ? "PASS" : "REFUSE"}` +
    (verdict.pass ? `, ${verdict.remainingAfterPass} rows of the day remain after` : ""),
  );
  return verdict.pass;
}

/** DRY-RUN: the whole plan, every write count, nothing executed. */
function dryRun({ args, plan, ledger, steps, remoteChunkCount }) {
  console.log(`
================ DRY RUN — executes NOTHING remote ================
mode           : dry-run (default; --execute plus --i-understand-this-writes-to-my-cloud-account makes the writes for real)
token          : ${maskToken(args.token)} (only used by --execute)
account        : ${args.accountId ?? "(none needed for dry-run)"}
worker         : ${args.workerName}
database       : ${args.dbName}
seed           : ${args.cards} Scale Pages -> ${plan.cardRows} card rows + ${plan.refRows} ref rows = ${plan.seedRows} rows
write budget   : ${D1_FREE_DAILY_ROW_WRITES}/day free tier, guard at ${GUARD_ROW_LIMIT}
`);
  printBudgetHeader(ledger, "dry-run");
  console.log(`
steps (--execute would perform these in order; dry-run prints only):
`);
  let allPass = true;
  let pendingRows = 0; // dry-run projection accumulates across the plan
  for (const step of steps) {
    console.log(`${step.name}${step.executeOnly ? "  [--execute only]" : ""}`);
    step.describe().match(/.{1,96}(\s|$)/g)?.forEach((line) => console.log(`    ${line.trim()}`));
    for (const cmd of step.remoteCommands()) console.log(`    would run: ${cmd}`);
    if (!printStepGuard(ledger, step, pendingRows)) allPass = false;
    pendingRows += step.writesRows;
  }
  console.log(`
----------------
GUARD VERDICT   : ${allPass ? "ALL STEPS PASS the 80% guard" : "REFUSED — one or more steps cross the guard (--budget-exceeded)"}
seed day cost   : ${plan.projectedWithAnalyze} rows = ${plan.percentOfDailyLimit}% of one UTC day
headroom        : ${plan.headroomRows} rows under the guard
local proof     : this repo needs no account at all — run:
                   node scripts/deploy/one-click-deck/one-click-deck.mjs --local
===================================================================
`);
  if (!allPass) {
    console.error(`--budget-exceeded`);
    process.exit(EXIT_BUDGET_EXCEEDED);
  }
}

/** Generate seed files (needed by BOTH --local and --execute). */
function ensureSeedFiles({ args, plan }) {
  mkdirSync(OUT, { recursive: true });
  const { manifest, localFiles, remoteFiles } = generateSeedFiles({ scalePages: args.cards, outDir: OUT });
  console.log(`seed files: ${localFiles.length} local chunks (5000 stmts) + ` +
    `${remoteFiles.length} remote chunks (${REMOTE_CHUNK_STATEMENTS} stmts) under ${relToRepo(join(OUT, "fitting-scale-seed"))}`);
  console.log(`manifest:   ${relToRepo(join(OUT, "fitting-scale-seed", "manifest.json"))} ` +
    `(${manifest.budget.projectedWithAnalyze} rows projected incl. ANALYZE = ${manifest.budget.percentOfDailyLimit}% of the day)`);
  return { localFiles, remoteFiles };
}

/** Ensure the wrangler.oneclick.toml exists (idempotent); returns its text. */
function ensureConfig({ args, databaseId }) {
  const rel = (p) => relative(join(REPO, "scripts", "deploy", "one-click-deck"), p).split(sep).join("/");
  const toml = `# GENERATED by scripts/deploy/one-click-deck/one-click-deck.mjs — the one-click
# deploy config. Regenerated idempotently; the database_id is rewritten once
# 'wrangler d1 create' has printed the real id (--execute mode). The placeholder
# below is fine for LOCAL use: local D1 is a workerd-side sqlite keyed by id,
# never contacted.
#
# No nodejs_compat: the worker graph is Web-standard-only; the one Node import
# in the engine graph (node:crypto) is replaced at bundle time by the [alias]
# shim (same shape as deploy/wrangler.toml).
#
# [assets] ships the compiled skin (all-style.css + all-script.js, sha256-
# matched to the render VM's oracle-assets) plus decko-config.js and
# robots.txt. The assets layer serves them BEFORE the worker runs, so asset
# requests cost zero D1 reads and zero D1 writes; crawler traffic is turned
# away by robots.txt instead of burning the read budget.

name = "${args.workerName}"
main = "${rel(WORKER_TS)}"
compatibility_date = "2026-09-01"

[alias]
"node:crypto" = "${rel(CRYPTO_SHIM)}"

[assets]
directory = "demo-static-assets"

[[d1_databases]]
binding = "DB"
database_name = "${args.dbName}"
database_id = "${databaseId}"
`;
  const existing = existsSync(CONFIG_TOML) ? readFileSync(CONFIG_TOML, "utf8") : null;
  if (existing !== toml) writeFileSync(CONFIG_TOML, toml, "utf8");
  return toml;
}

/** --local: provision local workerd D1, zero account contact. */
async function localMode({ args, plan, ledger }) {
  if (args.execute) fail("--local and --execute are mutually exclusive");
  console.log(`
========== LOCAL DEMO PROVISION — workerd + local D1, NO Cloudflare account ==========`);
  const localVerdict = ledger.check("local seed", plan.seedRows + ANALYZE_ROWS_ESTIMATE);
  if (!localVerdict.pass && !args.localOverBudget) {
    console.error(`  ${localVerdict.reason}`);
    console.error(`  Local writes consume NO CF quota; to generate a bigger LOCAL-only deck add --local-over-budget.`);
    console.error(`--budget-exceeded`);
    process.exit(EXIT_BUDGET_EXCEEDED);
  }
  console.log(`  arithmetic: ${plan.cardRows} card rows + ${plan.refRows} ref rows = ${plan.seedRows} ` +
    `(+${plan.analyzeEstimate} ANALYZE = ${plan.projectedWithAnalyze} = ${plan.percentOfDailyLimit}% of a CF day; ` +
    `local workerd consumes none of it)`);

  const { localFiles } = ensureSeedFiles({ args, plan });
  ensureConfig({ args, databaseId: PLACEHOLDER_DB_ID });

  // Schema through the REAL workerd D1 binding, locally.
  console.log(`\n-- schema (local D1) --`);
  runWrangler(
    ["d1", "execute", args.dbName, "--local", "--config", relToRepo(CONFIG_TOML),
     "--persist-to", relToRepo(join(OUT, "local-state")), "--file", relToRepo(SCHEMA_FILE)],
    { cwd: REPO, label: "local schema" },
  );

  console.log(`\n-- fitting-scale seed (${localFiles.length} local chunks) --`);
  for (const f of localFiles) {
    runWrangler(
      ["d1", "execute", args.dbName, "--local", "--config", relToRepo(CONFIG_TOML),
       "--persist-to", relToRepo(join(OUT, "local-state")), "--file", relToRepo(f.file)],
      { cwd: REPO, label: `local seed ${f.file}` },
    );
    process.stdout.write(`  applied ${f.file} (${f.rows} rows)\n`);
  }

  console.log(`\n-- ANALYZE (local D1) --`);
  runWrangler(
    ["d1", "execute", args.dbName, "--local", "--config", relToRepo(CONFIG_TOML),
     "--persist-to", relToRepo(join(OUT, "local-state")), "--command", "ANALYZE"],
    { cwd: REPO, label: "local ANALYZE" },
  );

  ledger.commit("local seed", plan.seedRows);

  const devCmd = `npx wrangler dev --config ${relToRepo(CONFIG_TOML)} --persist-to ${relToRepo(join(OUT, "local-state"))}`;
  console.log(`
LOCAL PROVISION COMPLETE (schema + ${plan.seedRows} seed rows + ANALYZE in local workerd D1).

Serve it (new terminal, from the repo root ${args.execute ? REPO : "."}):
  ${devCmd}

Then (reads only):
  curl -s http://localhost:8787/_status
  curl -s http://localhost:8787/ | grep "Fitting-scale"
  curl -s "http://localhost:8787/Scale%20Page%201x" -o /dev/null -w "%{http_code}\\n"
  curl -s -X POST http://localhost:8787/api/query -H "Content-Type: application/json" \\
       -d '{"cql":{"name":"Scale Page 173x"}}'

 NO Cloudflare account, NO network to Cloudflare. The dev server's child env
 must not carry CLOUDFLARE_API_TOKEN (this tool strips it from its own children;
 keep it out of the serve shell too).
=====================================================================`);
  if (args.serve) {
    console.log(`\n--serve: starting wrangler dev in the foreground (Ctrl+C to stop) --`);
    const { command, wranglerArgsPrefix, useShell } = npxInvocation();
    const child = spawnSync(command, [...wranglerArgsPrefix, "dev", "--config", relToRepo(CONFIG_TOML),
      "--persist-to", relToRepo(join(OUT, "local-state"))],
      { cwd: REPO, shell: useShell, env: sanitizedEnv(), stdio: "inherit" });
    process.exit(child.status ?? EXIT_GENERAL);
  }
}

/** --execute: the REAL account run.
 *
 *  Guarded by an ENFORCED confirmation, not by a note in the output. This
 *  mode creates billable-adjacent resources on someone else's Cloudflare
 *  account and writes tens of thousands of rows into its D1 database, so it
 *  refuses to start without --i-understand-this-writes-to-my-cloud-account.
 *  The check runs first, before the token is read and before any network
 *  call, so an --execute with no confirmation is a no-op that costs nothing
 *  and touches nothing. The budget gate below then bounds the writes
 *  themselves.
 */
async function executeMode({ args, plan, ledger, steps, remoteFiles }) {
  if (!args.accountWritesUnderstood) {
    fail(
      "--execute creates a D1 database and a Worker on the account you name and writes " +
        "tens of thousands of rows into its D1 database. Re-run with " +
        "--i-understand-this-writes-to-my-cloud-account to confirm that is what you want. " +
        "Run the command with no flags first to see the full plan and every write count.",
    );
  }
  if (!args.token) fail("--execute needs --token (a CF API token with D1 + Workers permissions)");
  if (!args.accountId) fail("--execute needs --account-id");
  console.log(`\n===== LIVE RUN — every D1 write step passes the budget gate first =====`);
  printBudgetHeader(ledger, "execute");

  // The gate is enforced per D1 write step, but refuse EARLY if even the
  // plan cannot fit: arithmetic before any write, always.
  let pendingRows = 0;
  for (const step of steps) {
    if (!printStepGuard(ledger, step, pendingRows)) {
      console.error(`--budget-exceeded`);
      process.exit(EXIT_BUDGET_EXCEEDED);
    }
    pendingRows += step.writesRows;
  }

  // 1-2: account actions via the API
  const verify = await cfApi("GET", "/user/tokens/verify", args.token);
  console.log(`token verified: ${verify.id} (${verify.status})`);
  const created = await cfApi("POST", `/accounts/${args.accountId}/d1/database`, args.token, { name: args.dbName });
  const dbId = created.uuid ?? created.database_id;
  if (!dbId) fail(`d1 create returned no database id: ${JSON.stringify(created)}`);
  console.log(`d1 database created: ${args.dbName} = ${dbId}`);
  ensureConfig({ args, databaseId: dbId });

  // 3: schema
  runWrangler(["d1", "execute", args.dbName, "--remote", "--config", relToRepo(CONFIG_TOML),
    "--file", relToRepo(SCHEMA_FILE)], { cwd: REPO, label: "remote schema" });

  // 4: seed, gated PER CHUNK
  for (const f of remoteFiles) {
    const verdict = ledger.check(`seed ${f.file}`, f.rows);
    if (!verdict.pass) {
      console.error(`  ${verdict.reason}`);
      console.error(`--budget-exceeded`);
      process.exit(EXIT_BUDGET_EXCEEDED);
    }
    runWrangler(["d1", "execute", args.dbName, "--remote", "--config", relToRepo(CONFIG_TOML),
      "--file", relToRepo(f.file)], { cwd: REPO, label: `remote seed ${f.file}` });
    ledger.commit(`seed ${f.file}`, f.rows);
    console.log(`  wrote ${f.rows} rows (${f.file}); day total now ${ledger.spentTodayTotal()}`);
  }

  // 5: ANALYZE
  const analyzeVerdict = ledger.check("ANALYZE", ANALYZE_ROWS_ESTIMATE);
  if (!analyzeVerdict.pass) {
    console.error(`  ${analyzeVerdict.reason}`);
    console.error(`--budget-exceeded`);
    process.exit(EXIT_BUDGET_EXCEEDED);
  }
  runWrangler(["d1", "execute", args.dbName, "--remote", "--config", relToRepo(CONFIG_TOML),
    "--command", "ANALYZE"], { cwd: REPO, label: "remote ANALYZE" });
  ledger.commit("ANALYZE", ANALYZE_ROWS_ESTIMATE);

  // 6: deploy
  runWrangler(["deploy", "--config", relToRepo(CONFIG_TOML)], { cwd: REPO, label: "worker deploy" });

  // 7: assets — the [assets] directory (demo-static-assets/) rode along with
  // the step-6 upload; the assets layer serves /assets/* and /robots.txt
  // before the worker runs.

  // 8: verify (reads only)
  const sub = await cfApi("GET", `/accounts/${args.accountId}/workers/subdomain`, args.token);
  const base = `https://${args.workerName}.${sub.subdomain}.workers.dev`;
  const status = await fetch(`${base}/_status`).then((r) => r.json());
  console.log(`verify ${base}/_status -> ${JSON.stringify(status)}`);
  const home = await fetch(base);
  const html = await home.text();
  console.log(`GET / -> HTTP ${home.status}, ${html.length} bytes, ` +
    `${html.includes("Fitting-scale") ? "home card RENDERS" : "home card content NOT FOUND — inspect before declaring success"}`);
  console.log(`\nLIVE RUN COMPLETE: ${base}`);
  console.log(`day cost: ${ledger.spentTodayTotal()} rows (${((ledger.spentTodayTotal() / D1_FREE_DAILY_ROW_WRITES) * 100).toFixed(2)}% of the free-tier day)`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(e.message);
  }
  if (args.help) { help(); process.exit(EXIT_OK); }
  if (!args.execute && !args.local) args.dryRun = true;
  if (args.execute && args.dryRun) args.execute = false;
  if (!Number.isInteger(args.cards) || args.cards < 1) {
    fail(`--cards must be a positive integer (got ${args.cards})`);
  }
  // The account-writes confirmation is checked FIRST, before the plan is
  // turned into seed files and long before any network call, so an
  // unconfirmed --execute does no work at all. executeMode re-checks it
  // because that function is the thing that actually writes.
  if (args.execute && !args.accountWritesUnderstood) {
    fail(
      "--execute creates a D1 database and a Worker on the account you name and writes " +
        "tens of thousands of rows into its D1 database. Re-run with " +
        "--i-understand-this-writes-to-my-cloud-account to confirm that is what you want. " +
        "Run the command with no flags first to see the full plan and every write count.",
    );
  }

  const plan = planSeed({ scalePages: args.cards });
  const ledger = new WriteBudgetLedger({
    ledgerPath: join(OUT, "budget-ledger.json"),
    spentTodayExternal: args.spentToday,
    mode: args.execute ? "execute" : args.local ? "local" : "dry-run",
  });
  // step table + chunk counts need no generated files (counts are arithmetic)
  const remoteChunkCount = Math.ceil(plan.seedRows / REMOTE_CHUNK_STATEMENTS);
  const steps = buildSteps({ plan, remoteChunkCount, workerName: args.workerName, dbName: args.dbName });

  try {
    if (args.local) {
      await localMode({ args, plan, ledger });
    } else if (args.execute) {
      // seed files must exist before the live pass
      const { remoteFiles } = ensureSeedFiles({ args, plan });
      await executeMode({ args, plan, ledger, steps, remoteFiles });
    } else {
      dryRun({ args, plan, ledger, steps, remoteChunkCount });
    }
  } catch (e) {
    if (e instanceof PlatformOpsError) {
      console.error(`--platform-ops-blocked`);
      fail(e.message, EXIT_PLATFORM_OPS);
    }
    fail(e.message, EXIT_GENERAL);
  }
}

main();
