// stack.mjs — boots the local edge stack the signed-in exercise drives:
//
//   local deck copy (engine schema, Brandon's rows)  -> lib/local-hrana.mjs
//   deploy/dist/bunny-edge-engine.bundle.js          -> lib/edge-host.mjs (HTTPS)
//
// The environment the bundle sees is the LIVE script's variable set, read
// read-only from the Bunny API (GET /compute/script/96867, names and values in
// memory only, never printed), minus the database credentials, plus the local
// database endpoint and this harness's own origin.

import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { startLocalHrana } from "./local-hrana.mjs";
import { startEdgeHost } from "./edge-host.mjs";

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

/** The database and origin settings are local; everything else is the live value. */
export function localEnv({ live, dbUrl, origin }) {
  const env = { ...live };
  delete env.DECKO_DB_URL;
  delete env.DECKO_DB_TOKEN;
  delete env.DECKO_TRUSTED_ORIGINS;
  return {
    ...env,
    DECKO_DB_URL: dbUrl,
    DECKO_DB_TOKEN: "local-only-not-a-credential",
    DECKO_TRUSTED_ORIGINS: origin,
    // Local posture: the same write gate the live script arms.
    DECKO_WRITE_PATH: "1",
  };
}

/** Compiles the engine and vendors the asset snapshots the nest-index tool needs. */
export function ensureEngineDist() {
  if (!existsSync(join(REPO, "dist/src/card/nest-index.js"))) {
    execFileSync("npx", ["tsc", "-p", "tsconfig.json", "--outDir", "dist"], { cwd: REPO, stdio: "ignore", shell: true, timeout: 600_000 });
  }
  mkdirSync(join(REPO, "dist/vendor"), { recursive: true });
  for (const name of ["edge-style-source-snapshot.js", "edge-script-source-snapshot.js", "edge-bootstrap-scss-snapshot.js"]) {
    const src = join(REPO, "vendor", name);
    const dst = join(REPO, "dist/vendor", name);
    if (!existsSync(dst)) copyFileSync(src, dst);
  }
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
export async function startStack({ deckPath, live, runtimeDir }) {
  mkdirSync(runtimeDir, { recursive: true });
  const hrana = await startLocalHrana({ dbPath: deckPath });
  // The origin is only known once the TLS listener binds, so start the host
  // with a placeholder, then set the trusted origin on the bundle's env.
  const bundlePath = buildBundle();
  const host = await startEdgeHost({
    bundlePath,
    runtimeDir: join(runtimeDir, "edge"),
    env: localEnv({ live, dbUrl: `${hrana.url}/v2/pipeline`, origin: "https://127.0.0.1" }),
  });
  const origin = host.url;
  process.env.DECKO_TRUSTED_ORIGINS = origin;
  return {
    origin,
    hrana,
    host,
    bundlePath,
    close: async () => {
      await host.close();
      await hrana.close();
    },
    cleanup: () => rmSync(runtimeDir, { recursive: true, force: true }),
  };
}
