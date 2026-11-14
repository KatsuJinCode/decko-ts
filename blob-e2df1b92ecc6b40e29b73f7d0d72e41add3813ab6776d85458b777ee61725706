// one-click-bunny.mjs — THE one-click Bunny Edge Scripting + Bunny Database
// deployment command for decko-ts (tier 1 of the Bunny provider path).
//
// Companion to scripts/deploy/one-click-deck/one-click-deck.mjs (Cloudflare)
// and deploy/provisioning/provision-bunny-deck.mjs (full Bunny Database + Edge
// Scripting + Linked Pull Zone provisioning).
//
// MODES
//   (no flags)                  DRY-RUN: print every step of the Bunny edge
//                               bundle build + Bunny Database / Edge Script /
//                               Pull Zone provisioning flow. Executes nothing
//                               remote and contacts nothing.
//   --bundle-only               Build and verify the Bunny Edge Engine + Read
//                               Worker bundles locally (assertBunnyScriptBudget
//                               <= 7,600,000 bytes, raw WASM asset manifest).
//   --execute --api-key <key> --script-id <id> [--pullzone-id <zid>]
//     --i-understand-this-writes-to-my-bunny-account
//                               REAL RUN against a Bunny.net account:
//                               1. Builds the Bunny Edge Engine bundle (or uses
//                                  --bundle <path>).
//                               2. Uploads code to POST /compute/script/{id}/code
//                               3. Configures Phase 2 variables (DECKO_EDGE_CACHE=1,
//                                  DECKO_EDGE_GLOBAL_CACHE=1) via
//                                  POST /compute/script/{id}/variables/add
//                               4. Publishes script via POST /compute/script/{id}/publish
//                               5. Purges pull zone cache via POST /pullzone/{zid}/purgeCache
//                               (Or pass --payload <payload.json> to delegate full
//                               new-resource creation to deploy/provisioning/provision-bunny-deck.mjs).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBunnyScriptBudget, BUNNY_SCRIPT_LIMIT_BYTES } from "../../../tools/vendor/edge-bundle-budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const BUNNY_API_BASE = "https://api.bunny.net";
const BUNDLER_SCRIPT = join(REPO, "tools", "bundle-bunny-edge-engine.mjs");
const PROVISION_SCRIPT = join(REPO, "deploy", "provisioning", "provision-bunny-deck.mjs");

const EXIT_OK = 0;
const EXIT_GENERAL = 1;
const EXIT_REFUSED = 2;

export function maskSecret(value) {
  if (!value) return "(none)";
  return "[REDACTED]";
}

function relToRepo(p) {
  return relative(REPO, p).split(sep).join("/");
}

export function parseArgs(argv) {
  const args = {
    execute: false,
    bundleOnly: false,
    dryRun: false,
    accountWritesUnderstood: false,
    apiKey: process.env.BUNNY_API_KEY ?? process.env.BUNNY_ACCESS_KEY ?? null,
    scriptId: process.env.BUNNY_SCRIPT_ID ?? null,
    pullzoneId: process.env.BUNNY_PULLZONE_ID ?? null,
    warmupUrl: process.env.BUNNY_DECK_URL ?? null,
    wasmAssetBase: process.env.BUNNY_WASM_ASSET_BASE ?? "https://cdn.bunny.net/wasm-assets/",
    bundle: null,
    payload: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--execute": args.execute = true; break;
      case "--bundle-only": args.bundleOnly = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--i-understand-this-writes-to-my-bunny-account":
        args.accountWritesUnderstood = true; break;
      case "--api-key": args.apiKey = next(); break;
      case "--script-id": args.scriptId = next(); break;
      case "--pullzone-id": args.pullzoneId = next(); break;
      case "--warmup-url": args.warmupUrl = next(); break;
      case "--wasm-asset-base": args.wasmAssetBase = next(); break;
      case "--bundle": args.bundle = next(); break;
      case "--payload": args.payload = next(); break;
      case "--help": case "-h": args.help = true; break;
      default:
        throw new Error(`unknown argument "${a}" (see --help)`);
    }
  }
  return args;
}

export async function autoWarmBunnyDeck(baseUrl, { fetchImpl = fetch, routes = ["/", "/Home"], assertOk = true } = {}) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const results = [];
  for (const route of routes) {
    const url = `${base}${route.startsWith("/") ? route : `/${route}`}`;
    const t0 = Date.now();
    const coldRes = await fetchImpl(url);
    const coldText = await coldRes.text();
    const coldMs = Date.now() - t0;

    const t1 = Date.now();
    const warmRes = await fetchImpl(url);
    const warmText = await warmRes.text();
    const warmMs = Date.now() - t1;

    const coldCacheHeader = coldRes.headers?.get?.("X-Decko-Edge-Cache") ?? null;
    const warmCacheHeader = warmRes.headers?.get?.("X-Decko-Edge-Cache") ?? null;
    if (assertOk) {
      if ((coldRes.status ?? 200) < 200 || (coldRes.status ?? 200) >= 300 || (warmRes.status ?? 200) < 200 || (warmRes.status ?? 200) >= 300) {
        throw new Error(`autoWarmBunnyDeck failed on ${url}: cold HTTP ${coldRes.status}, warm HTTP ${warmRes.status}`);
      }
      if (coldCacheHeader && /^armed\b/i.test(coldCacheHeader) && warmCacheHeader && !/\bhit\b/i.test(warmCacheHeader)) {
        throw new Error(`autoWarmBunnyDeck warm request did not hit edge cache on ${url}: X-Decko-Edge-Cache=${warmCacheHeader}`);
      }
    }

    results.push({
      route,
      url,
      coldStatus: coldRes.status,
      warmStatus: warmRes.status,
      bytes: warmText.length || coldText.length,
      coldCacheHeader,
      warmCacheHeader,
      coldMs,
      warmMs,
    });
  }
  return { baseUrl: base, routes: results };
}

function printHelp() {
  console.log(`one-click-bunny — one-click Bunny Edge Scripting + Database deployment for decko-ts

MODES
  (no flags)                  DRY-RUN: print every step of the Bunny bundle +
                              Edge Script + Pull Zone deployment flow. Executes
                              nothing remote.
  --bundle-only               Build and validate the Bunny Edge Engine + Read
                              bundles locally into a fresh package directory.
  --execute --api-key <k> --script-id <id> [--pullzone-id <zid>]
    --i-understand-this-writes-to-my-bunny-account
                              Upload the Phase 2 Bunny Edge Engine bundle, arm
                              DECKO_EDGE_CACHE=1 and DECKO_EDGE_GLOBAL_CACHE=1,
                              publish the script release, and purge the pull zone.
  --payload <file.json>       Delegate full greenfield Bunny Database + Edge Script
                              provisioning to deploy/provisioning/provision-bunny-deck.mjs.
`);
}

export function buildSteps(args) {
  const scriptTarget = args.scriptId ?? "<script-id>";
  const pzTarget = args.pullzoneId ?? "<pullzone-id>";
  const warmTarget = args.warmupUrl ?? "https://<default-hostname>.b-cdn.net";
  return [
    {
      name: "1. build Bunny Edge Engine + Read Worker bundles",
      executeOnly: false,
      describe: () =>
        `Bundles deploy/bunny-worker-src/bunny-edge-engine-entry.ts and bunny-edge-read-entry.ts ` +
        `and verifies both pass assertBunnyScriptBudget (<=${BUNNY_SCRIPT_LIMIT_BYTES} UTF-8 bytes).`,
      remoteCommands: () => [
        `node ${relToRepo(BUNDLER_SCRIPT)} --out-dir deploy/dist/bunny-pkg-<ts> --wasm-asset-base ${args.wasmAssetBase}`,
      ],
    },
    {
      name: `2. upload Edge Script code to Bunny script ${scriptTarget}`,
      executeOnly: true,
      describe: () =>
        `POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/code with {"Code": "<bundle>"}`,
      remoteCommands: () => [
        `(https) POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/code`,
      ],
    },
    {
      name: `3. arm Phase 2 edge cache variables on script ${scriptTarget}`,
      executeOnly: true,
      describe: () =>
        `Sets DECKO_EDGE_CACHE=1 and DECKO_EDGE_GLOBAL_CACHE=1 on the Bunny Edge Script ` +
        `(1-trip LiveStoreDriver + lazy rule watermarks + L1/L2/L3 render cache).`,
      remoteCommands: () => [
        `(https) POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/variables/add {"Name":"DECKO_EDGE_CACHE","DefaultValue":"1"}`,
        `(https) POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/variables/add {"Name":"DECKO_EDGE_GLOBAL_CACHE","DefaultValue":"1"}`,
      ],
    },
    {
      name: `4. publish Bunny Edge Script ${scriptTarget}`,
      executeOnly: true,
      describe: () =>
        `POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/publish — makes the uploaded Phase 2 bundle live globally.`,
      remoteCommands: () => [
        `(https) POST ${BUNNY_API_BASE}/compute/script/${scriptTarget}/publish`,
      ],
    },
    {
      name: `5. purge Bunny Pull Zone ${pzTarget} cache`,
      executeOnly: true,
      describe: () =>
        `POST ${BUNNY_API_BASE}/pullzone/${pzTarget}/purgeCache — flushes edge CDN cache after release publish.`,
      remoteCommands: () => [
        `(https) POST ${BUNNY_API_BASE}/pullzone/${pzTarget}/purgeCache`,
      ],
    },
    {
      name: `6. auto-warm Phase 2 caches (/ and /Home)`,
      executeOnly: true,
      describe: () =>
        `GET ${warmTarget}/ and ${warmTarget}/Home (twice) — pre-warms live_page_bundles (1-trip bundle index) ` +
        `and edge_render_cache (L3) + L2/L1 so Visitor #1 gets an instant cache hit.`,
      remoteCommands: () => [
        `(https) GET ${warmTarget}/ (auto-warm + HIT verify)`,
        `(https) GET ${warmTarget}/Home (auto-warm + HIT verify)`,
      ],
    },
  ];
}

function dryRun(args, steps) {
  console.log(`
================ BUNNY DRY RUN — executes NOTHING remote ================
mode           : dry-run (default; --execute plus --i-understand-this-writes-to-my-bunny-account makes the writes for real)
apiKey         : ${maskSecret(args.apiKey)} (only used by --execute)
scriptId       : ${args.scriptId ? "[REDACTED]" : "(none needed for dry-run)"}
pullzoneId     : ${args.pullzoneId ? "[REDACTED]" : "(optional)"}
bundle budget  : ${BUNNY_SCRIPT_LIMIT_BYTES} UTF-8 bytes boot-safe limit
provisioner    : ${relToRepo(PROVISION_SCRIPT)} (for greenfield DB + script + pull zone creation)

steps (--execute would perform these in order; dry-run prints only):
`);
  for (const step of steps) {
    console.log(`${step.name}${step.executeOnly ? "  [--execute only]" : ""}`);
    console.log(`    ${step.describe()}`);
    for (const cmd of step.remoteCommands()) {
      console.log(`    would run: ${cmd}`);
    }
  }
  console.log(`
----------------
STATUS          : READY (dry-run verified; 0 remote calls made)
local bundle    : node scripts/deploy/one-click-bunny/one-click-bunny.mjs --bundle-only
full provision  : node deploy/provisioning/provision-bunny-deck.mjs --payload <payload.json>
=========================================================================
`);
}

function runLocalBundle(args) {
  const pkgDir = join(tmpdir(), `decko-bunny-pkg-${Date.now()}`);
  mkdirSync(dirname(pkgDir), { recursive: true });
  const res = spawnSync(
    process.execPath,
    [BUNDLER_SCRIPT, "--out-dir", pkgDir, "--wasm-asset-base", args.wasmAssetBase],
    { cwd: REPO, encoding: "utf8", windowsHide: true },
  );
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error(`bundle-bunny-edge-engine failed (exit ${res.status})`);
  }
  const bundlePath = join(pkgDir, "bunny-edge-engine.bundle.js");
  const code = readFileSync(bundlePath, "utf8");
  const bytes = assertBunnyScriptBudget(code);
  console.log(`bunny bundle verified: ${relToRepo(bundlePath)} (${bytes} UTF-8 bytes <= ${BUNNY_SCRIPT_LIMIT_BYTES})`);
  return { pkgDir, bundlePath, code, bytes };
}

async function bunnyApi(method, path, apiKey, body) {
  const response = await fetch(`${BUNNY_API_BASE}${path}`, {
    method,
    headers: {
      AccessKey: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bunny API ${method} ${path} failed: HTTP ${response.status} ${text.slice(0, 400)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function executeRun(args) {
  if (!args.accountWritesUnderstood) {
    console.error(
      "one-click-bunny: --execute requires --i-understand-this-writes-to-my-bunny-account. " +
      "Run with no flags first to inspect the dry-run plan.",
    );
    process.exit(EXIT_REFUSED);
  }
  if (args.payload) {
    const forwardArgs = [PROVISION_SCRIPT, "--payload", args.payload, "--execute", "--i-understand-this-writes-to-my-bunny-account"];
    if (args.apiKey) forwardArgs.push("--api-key", args.apiKey);
    if (args.bundle) forwardArgs.push("--bundle", args.bundle);
    const res = spawnSync(process.execPath, forwardArgs, { cwd: REPO, stdio: "inherit", windowsHide: true });
    if (res.status !== 0) {
      process.exit(res.status ?? EXIT_GENERAL);
    }
    const resultPath = `${args.payload}.result.json`;
    let warmUrl = args.warmupUrl;
    if (!warmUrl && existsSync(resultPath)) {
      try {
        const resultJson = JSON.parse(readFileSync(resultPath, "utf8"));
        warmUrl = resultJson?.urls?.home ?? null;
      } catch {
        warmUrl = null;
      }
    }
    if (warmUrl) {
      const warmed = await autoWarmBunnyDeck(warmUrl);
      for (const r of warmed.routes) {
        console.log(
          `auto-warm ${r.route} -> cold HTTP ${r.coldStatus} (${r.coldMs}ms), ` +
          `warm HTTP ${r.warmStatus} (${r.warmMs}ms, X-Decko-Edge-Cache=${r.warmCacheHeader ?? "n/a"}, ${r.bytes} bytes)`,
        );
      }
    }
    process.exit(EXIT_OK);
  }
  if (!args.apiKey) {
    console.error("one-click-bunny: --execute requires --api-key (or BUNNY_API_KEY)");
    process.exit(EXIT_REFUSED);
  }
  if (!args.scriptId) {
    console.error("one-click-bunny: --execute requires --script-id (or --payload for greenfield provisioning)");
    process.exit(EXIT_REFUSED);
  }

  let code;
  if (args.bundle && existsSync(args.bundle)) {
    code = readFileSync(args.bundle, "utf8");
    assertBunnyScriptBudget(code);
  } else {
    const built = runLocalBundle(args);
    code = built.code;
  }

  const scriptInfo = await bunnyApi("GET", `/compute/script/${args.scriptId}`, args.apiKey);
  const existingVars = Array.isArray(scriptInfo?.Variables) ? scriptInfo.Variables : [];

  await bunnyApi("POST", `/compute/script/${args.scriptId}/code`, args.apiKey, { Code: code });
  console.log(`uploaded Bunny Edge Script code (${Buffer.byteLength(code, "utf8")} bytes)`);

  for (const [Name, DefaultValue] of [
    ["DECKO_EDGE_CACHE", "1"],
    ["DECKO_EDGE_GLOBAL_CACHE", "1"],
  ]) {
    const existing = existingVars.find((v) => v?.Name === Name);
    if (existing?.Id != null) {
      await bunnyApi("POST", `/compute/script/${args.scriptId}/variables/${existing.Id}`, args.apiKey, {
        Name,
        DefaultValue,
        Required: false,
      });
    } else {
      await bunnyApi("POST", `/compute/script/${args.scriptId}/variables/add`, args.apiKey, {
        Name,
        DefaultValue,
        Required: false,
      });
    }
  }

  await bunnyApi("POST", `/compute/script/${args.scriptId}/publish`, args.apiKey, {
    Note: "decko-ts Phase 2 one-click deploy",
  });
  console.log(`published Bunny Edge Script ${args.scriptId}`);

  const pullzoneId = args.pullzoneId ?? scriptInfo?.LinkedPullZones?.[0]?.Id ?? null;
  if (pullzoneId) {
    await bunnyApi("POST", `/pullzone/${pullzoneId}/purgeCache`, args.apiKey);
    console.log(`purged Bunny Pull Zone ${pullzoneId}`);
  }

  let warmBase = args.warmupUrl;
  if (!warmBase && scriptInfo?.DefaultHostname) {
    const host = String(scriptInfo.DefaultHostname).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    warmBase = `https://${host}`;
  }
  if (!warmBase) {
    throw new Error(`Unable to determine warmup URL for Bunny script ${args.scriptId}; pass --warmup-url <https://...>`);
  }
  const warmed = await autoWarmBunnyDeck(warmBase);
  for (const r of warmed.routes) {
    console.log(
      `auto-warm ${r.route} -> cold HTTP ${r.coldStatus} (${r.coldMs}ms), ` +
      `warm HTTP ${r.warmStatus} (${r.warmMs}ms, X-Decko-Edge-Cache=${r.warmCacheHeader ?? "n/a"}, ${r.bytes} bytes)`,
    );
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`one-click-bunny: ${err.message}`);
    process.exit(EXIT_GENERAL);
  }
  if (args.help) {
    printHelp();
    process.exit(EXIT_OK);
  }
  if (args.execute && !args.accountWritesUnderstood) {
    console.error(
      "one-click-bunny: --execute requires --i-understand-this-writes-to-my-bunny-account. " +
      "Run with no flags first to see the dry-run plan.",
    );
    process.exit(EXIT_REFUSED);
  }
  const steps = buildSteps(args);
  if (args.bundleOnly) {
    runLocalBundle(args);
    return;
  }
  if (args.execute) {
    await executeRun(args);
    return;
  }
  dryRun(args, steps);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`one-click-bunny: ${err.message}`);
    process.exit(EXIT_GENERAL);
  });
}
