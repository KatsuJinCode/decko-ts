#!/usr/bin/env node
// Deploys the D1-backed Worker to one specific Cloudflare account without
// any interactive `wrangler login`. The account is addressed through two
// values read out of a credentials file (an API token and an account id,
// each located by a key name given on the command line):
//
//   node tools/d1-trickle/cf-deploy.mjs --creds-file <file> \
//        --token-key <TOKEN_KEY_NAME> --account-key <ACCOUNT_ID_KEY_NAME> \
//        --database-name <db-name> [--worker-name <worker>] \
//        [--set VAR=value ...] [--dry-run]
//
// How it works: the tool resolves the named D1 database on that account to
// its id, renders a one-off wrangler.toml from the template the repo keeps
// under deploy/ (name, bundle entry, database name/id, and any --set vars
// substituted), writes it to a temp directory, and spawns `wrangler deploy`
// against it — with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exported
// into that child process only, so the host's own wrangler login state is
// never consulted. --dry-run forwards wrangler's dry-run flag. Child output
// is passed through a secret mask, the token itself is never logged, and
// the temp directory is deleted when the run ends.

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
      fillConfig(readFileSync(resolve(REPO, "deploy/cf-trial/wrangler.toml"), "utf8"), {
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
