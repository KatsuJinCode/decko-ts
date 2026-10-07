#!/usr/bin/env node
// tools/d1-trickle/cf-deploy.mjs — deploy (or check) the D1-backed Worker on
// an account named by an API token and account id from a credentials file.
//
//   node tools/d1-trickle/cf-deploy.mjs --creds-file <file> --token-key BRANDON_CF_API_TOKEN \
//        --account-key BRANDON_CF_ACCOUNT_ID --database-name decko-brandon \
//        [--worker-name decko-brandon] [--set VAR=value ...] [--dry-run]
//
// It runs `wrangler deploy` with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
// set for that one child process, so wrangler uses exactly that account and
// never its own login. The config it deploys is a copy of
// deploy/cf-brandon/wrangler.toml with the database id looked up on that
// account, the Worker name, and any --set variables filled in; the copy lives
// in a scratch folder removed on exit. The token is never printed.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, from this file, so the tool runs from any directory. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
import { tmpdir } from "node:os";
import { D1HttpExecutor, readCredsFile, maskSecrets } from "./executors.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const sets = argv.flatMap((a, i) => (a === "--set" && argv[i + 1] ? [argv[i + 1]] : []));
const need = (k) => {
  const v = arg(k);
  if (v === undefined) throw new Error(`--${k} is required`);
  return v;
};

/** The committed config with the account-specific values filled in. */
export function fillConfig(toml, { workerName, databaseName, databaseId, bundlePath, vars = {} }) {
  let out = toml
    .replace(/^name = ".*"$/m, `name = "${workerName}"`)
    .replace(/^main = ".*"$/m, `main = "${bundlePath.replace(/\\/g, "/")}"`)
    .replace(/^database_name = ".*"$/m, `database_name = "${databaseName}"`)
    .replace(/^database_id = ".*"$/m, `database_id = "${databaseId}"`);
  for (const [k, v] of Object.entries(vars)) {
    const line = `${k} = "${String(v).replace(/"/g, '\\"')}"`;
    const re = new RegExp(`^${k} = ".*"$`, "m");
    out = re.test(out) ? out.replace(re, line) : out.replace(/^\[vars\]$/m, `[vars]\n${line}`);
  }
  return out;
}

let secrets = [];
async function main() {
  const tokenKey = need("token-key");
  const accountKey = need("account-key");
  const c = readCredsFile(need("creds-file"), [tokenKey, accountKey]);
  if (!c[tokenKey] || !c[accountKey]) throw new Error(`credentials file lacks ${!c[tokenKey] ? tokenKey : accountKey}`);
  secrets = [c[tokenKey]];
  const api = new D1HttpExecutor({ accountId: c[accountKey], apiToken: c[tokenKey] });
  const databaseName = need("database-name");
  const dbs = (await api.listDatabases(databaseName)).filter((d) => d.name === databaseName);
  if (dbs.length !== 1) throw new Error(`expected one D1 database named ${databaseName} on that account, found ${dbs.length}`);
  const workerName = arg("worker-name", databaseName);
  const vars = Object.fromEntries(sets.map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]));
  const scratch = mkdtempSync(join(tmpdir(), "cf-deploy-"));
  try {
    const config = join(scratch, "wrangler.toml");
    writeFileSync(
      config,
      fillConfig(readFileSync(resolve(REPO, "deploy/cf-brandon/wrangler.toml"), "utf8"), {
        workerName,
        databaseName,
        databaseId: dbs[0].uuid,
        bundlePath: resolve(REPO, "deploy/dist/cf-edge-engine.bundle.js"),
        vars,
      }),
    );
    const args = ["deploy", "--config", config, ...(argv.includes("--dry-run") ? ["--dry-run"] : [])];
    console.log(JSON.stringify({ wrangler: args.join(" ").replace(config, "<filled config>"), worker: workerName, database: databaseName, database_id: dbs[0].uuid, vars }));
    const code = await new Promise((res) => {
      const child = spawn("wrangler", args, {
        windowsHide: true,
        shell: process.platform === "win32",
        env: { ...process.env, CLOUDFLARE_API_TOKEN: c[tokenKey], CLOUDFLARE_ACCOUNT_ID: c[accountKey], WRANGLER_SEND_METRICS: "false" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const relay = (d) => process.stdout.write(maskSecrets(d, secrets));
      child.stdout.on("data", relay);
      child.stderr.on("data", relay);
      child.on("close", res);
    });
    process.exitCode = code;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/").replace(/^\//, "")}` || process.argv[1]?.endsWith("cf-deploy.mjs")) {
  main().catch((e) => {
    console.error(maskSecrets(e?.stack ?? e, secrets));
    process.exitCode = 1;
  });
}
