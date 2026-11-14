// stack.mjs — boots the local edge stack the signed-in exercise drives:
//
//   local deck copy (engine schema, Brandon's rows)  -> lib/local-hrana.mjs
//   deploy/dist/bunny-edge-engine.bundle.js          -> lib/edge-host.mjs (HTTPS)
//
// Only named noncredential render settings come from the read-only live
// configuration. Database, storage and origin settings belong to this local
// run. The bundle executes on Node with an SDK shim, not the vendor runtime.

import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from 'node:crypto';
import { startLocalHrana } from "./local-hrana.mjs";
import { startEdgeHost } from "./edge-host.mjs";
import { createDeterministicLoopbackFetch } from "./deterministic-loopback-fetch.mjs";
export { localEnv } from "./local-policy.mjs";
import { localEnv } from "./local-policy.mjs";
import { startMockBunnyStorage } from '../../../tests/server/mock-bunny-storage.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const LIVE_SCRIPT_ID = 96867;

/** Reads the live script's variables read-only. Returns name -> value (never logged). */
export async function readLiveScriptEnv(secretsPath) {
  const text = readFileSync(secretsPath, "utf8");
  const match = /^BUNNY_ACCOUNT_API_KEY=(.*)$/m.exec(text);
  if (!match) throw new Error("secrets file has no BUNNY_ACCOUNT_API_KEY");
  const response = await fetch(`https://api.bunny.net/compute/script/${LIVE_SCRIPT_ID}`, {
    headers: { AccessKey: match[1].trim(), accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Bunny script read failed: HTTP ${response.status}`);
  const script = await response.json();
  const env = {};
  for (const variable of script.EdgeScriptVariables ?? []) {
    if (typeof variable.Name === "string" && typeof variable.DefaultValue === "string") env[variable.Name] = variable.DefaultValue;
  }
  return { env, names: Object.keys(env).sort() };
}

/** Compiles the engine and vendors the asset snapshots the nest-index tool needs. */
export function ensureEngineDist() {
  execFileSync(process.execPath, [join(REPO, 'tools/dist/build-engine.mjs'), '--browser-hosts'], { cwd: REPO, stdio: 'inherit', windowsHide: true, timeout: 120_000 });
}

/** Rebuilds the bundle from source, the same build the deploy uses. */
export function buildBundle() {
  execFileSync(process.execPath, [join(REPO, "tools/bundle-bunny-edge-engine.mjs")], { cwd: REPO, stdio: "ignore", timeout: 300_000 });
  return join(REPO, "deploy/dist/bunny-edge-engine.bundle.js");
}

/**
 * Starts the stack on the given local deck file.
 * @returns {Promise<{ origin: string, hrana: any, host: any, bundlePath: string, close: () => Promise<void>, cleanup: () => void }>}
 */
export async function startStack({ deckPath, live, runtimeDir, bundlePath = buildBundle(), expectedBundleSha256, onRequest, mail }) {
  const inside = relative(join(REPO, 'tmp'), resolve(runtimeDir));
  if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw new Error('runtime must be an owned child of this repository tmp');
  if (mail !== undefined && (typeof mail.sink !== 'function' || !mail.tokenSecret || !mail.siteTitle)) throw new Error('local mail capture requires a sink, token secret and site title');
  mkdirSync(runtimeDir, { recursive: true });
  const hrana = await startLocalHrana({ dbPath: deckPath });
  let storage;
  let host;
  const originalFetch = globalThis.fetch;
  const originalSink = globalThis.__deckoLocalMailSink;
  const mailKeys=['DECKO_LOCAL_MAIL','DECKO_LOCAL_TOKEN_SECRET','DECKO_LOCAL_SITE_TITLE','DECKO_LOCAL_ORIGIN','DECKO_SMTP_PASS'];
  const previousMailEnv=new Map(mailKeys.map(key=>[key,process.env[key]]));
  const restoreMail=()=>{
    globalThis.__deckoLocalMailSink=originalSink;
    for(const [key,value] of previousMailEnv){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  };
  try {
  storage = await startMockBunnyStorage({ filesRoot: join(runtimeDir, 'storage-files') });
  const storagePrefix = `https://${storage.host}/`;
  // The engine's db/storage fetches ride the pinned loopback transport.
  // Node's global fetch dispatcher costs a process-state-dependent ~13-15 ms
  // per loopback POST on this machine, while the identical request through a
  // keep-alive agent is ~0.4-0.7 ms in every process measured — and the
  // engine's BunnyDbDriver binds fetch.bind(globalThis) at construction, so
  // the global dispatcher's bad days multiplied every db hop (the whole-
  // harness save-latency budget failed both graded nights at ~5.5 s with
  // ~94% of the wall in pipeline-POST transport, ~6% in SQLite). See
  // deterministic-loopback-fetch.mjs for the measurements.
  const engineFetch = createDeterministicLoopbackFetch({ fallback: originalFetch });
  globalThis.fetch = (input, init) => {
    const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return engineFetch(value.startsWith(storagePrefix) ? `http://${storage.host}/${value.slice(storagePrefix.length)}` : input, init);
  };
  // The origin is only known once the TLS listener binds, so start the host
  // with a placeholder, then set the trusted origin on the bundle's env.
  const mailEnv={DECKO_LOCAL_MAIL:mail===undefined?'0':'1',DECKO_SMTP_PASS:'',...(mail===undefined?{}:{
    DECKO_LOCAL_TOKEN_SECRET:mail.tokenSecret,DECKO_LOCAL_SITE_TITLE:mail.siteTitle,DECKO_LOCAL_ORIGIN:'https://127.0.0.1',
  })};
  if(mail!==undefined)globalThis.__deckoLocalMailSink=mail.sink;
  host = await startEdgeHost({
    bundlePath, expectedBundleSha256,
    runtimeDir: join(runtimeDir, "edge"),
    onRequest,
    // The database's own timing ledger, so the host can record how much SQL
    // each request actually ran. The budget reads the difference between the
    // engine's measured db wall and that SQL, and that difference is the
    // harness's own contention. See lib/server-time-budget.mjs.
    dbWorkLedger: hrana.ledger,
    env: { ...localEnv({ live, dbUrl: `${hrana.url}/v2/pipeline`, origin: "https://127.0.0.1" }),
      DECKO_STORAGE_ZONE: storage.zone, DECKO_STORAGE_PASSWORD: storage.password, DECKO_STORAGE_HOST: storage.host,...mailEnv },
  });
  const origin = host.url;
  if(mail!==undefined)process.env.DECKO_LOCAL_ORIGIN=origin;
  process.env.DECKO_TRUSTED_ORIGINS = origin;
  process.env.DECKO_ORIGIN = origin;
  process.env.DECKO_DECK_ORIGIN = origin;
  process.env.DECKO_SERVED_ROOT_URL = origin;
  const configuration = localEnv({ live, dbUrl: `${hrana.url}/v2/pipeline`, origin });
  const renderConfigurationSha256 = createHash('sha256').update(JSON.stringify(Object.entries(configuration).sort(([a],[b]) => a.localeCompare(b)))).digest('hex');
  return {
    origin,
    renderConfigurationSha256,
    hrana,
    host,
    bundlePath,
    close: async () => {
      try { await host.close(); } finally {
        try { await hrana.close(); } finally { try { await storage.stop(); } finally { globalThis.fetch = originalFetch;restoreMail(); } }
      }
    },
    cleanup: () => rmSync(runtimeDir, { recursive: true, force: true }),
  };
  } catch (error) {
    try { if (host) await host.close(); } finally {
      try { await hrana.close(); } finally { try { if (storage) await storage.stop(); } finally { globalThis.fetch = originalFetch;restoreMail(); } }
    }
    throw error;
  }
}
