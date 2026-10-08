#!/usr/bin/env node
// Rehearse the Deploy to Cloudflare button on this machine, with no
// Cloudflare account and no network.
//
// The button (docs/deploy-cloudflare.md, "The deploy button") copies the
// repository, creates a D1 database and writes its id into the copy's
// wrangler.toml, applies deploy/migrations/, then bundles and deploys
// worker.ts. Only the copy into GitHub, the database creation and the upload
// need Cloudflare. This script runs every other step with the real wrangler:
//
//   1. copy the files the deploy reads into a scratch directory;
//   2. replace the placeholder database_id, as the button does;
//   3. `wrangler deploy --dry-run`: the same bundle the button uploads;
//   4. `wrangler d1 migrations apply DB --local` on a fresh database,
//      then again to show a re-run applies nothing;
//   5. `wrangler dev` over that database, and the routes the README promises
//      checked over HTTP;
//   6. everything removed, in a finally block.
//
// Every Node process wrangler starts loads tools/deploy/no-external-network.mjs,
// so no request leaves the machine; refused attempts are listed in the result.
// wrangler runs with an empty configuration home, no API token in its
// environment and metrics off, so it cannot see or use any signed-in session.
//
// Usage:
//   node tools/deploy/rehearse-deploy-button.mjs [--wrangler <path/to/wrangler.js>] [--json <file>]
//
// wrangler is found from --wrangler, then WRANGLER_JS, then this repository's
// node_modules, then the global npm root. Exit status 0 means every step
// passed; the result is printed as JSON.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = join(REPO, "tools/deploy/no-external-network.mjs");

/** What a button deploy reads: the root config and entry, the engine, the
 *  migrations. Anything outside these the bundle cannot reach. */
const COPY_FILES = ["worker.ts", "wrangler.toml", "package.json", "tsconfig.json"];
const COPY_DIRS = ["src/", "deploy/", "vendor/"];

/** The routes the README's "What you get" table promises, plus the
 *  read-only boundary it states. */
const ROUTE_CHECKS = [
  { path: "/", status: 200, contains: ["<html", "Home"] },
  { path: "/Hello_World", status: 200, contains: ["Hello World"] },
  { path: "/Hello_World/content", status: 200 },
  // "+" is the Decko joint: this names the compound card Hello+World, which
  // the demo deck does not have.
  { path: "/Hello+World", status: 404 },
  { path: "/About", status: 200, contains: ["About", "Hello World"] },
  { path: "/api/status", status: 200, json: true },
  { path: "/api/card/About", status: 200, json: true, contains: ["About"] },
  { path: "/No+Such+Card+Here", status: 404 },
  { path: "/Hello_World", method: "POST", status: 403 },
];

function parseArgs(argv) {
  const args = { wrangler: process.env.WRANGLER_JS, json: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--wrangler") args.wrangler = argv[++i];
    else if (argv[i] === "--json") args.json = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n") + "\n");
      process.exit(0);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

function findWrangler(explicit) {
  const candidates = [];
  if (explicit) candidates.push(resolve(explicit));
  candidates.push(join(REPO, "node_modules/wrangler/bin/wrangler.js"));
  // the global npm root, beside the running node (Windows) or under its prefix
  candidates.push(join(dirname(process.execPath), "node_modules/wrangler/bin/wrangler.js"));
  candidates.push(join(dirname(process.execPath), "../lib/node_modules/wrangler/bin/wrangler.js"));
  try {
    const globalRoot = (process.platform === "win32"
      ? execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm root -g"], { encoding: "utf8", windowsHide: true })
      : execFileSync("npm", ["root", "-g"], { encoding: "utf8" })
    ).trim();
    candidates.push(join(globalRoot, "wrangler/bin/wrangler.js"));
  } catch {
    // no npm on PATH; the other candidates still apply
  }
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(`wrangler not found (looked in: ${candidates.join(", ")}). Pass --wrangler <path/to/wrangler.js>.`);
  }
  const version = JSON.parse(readFileSync(join(dirname(found), "../package.json"), "utf8")).version;
  return { path: found, version };
}

function filesToCopy() {
  const listed = execFileSync("git", ["-C", REPO, "ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return listed.filter(
    (f) => COPY_FILES.includes(f) || COPY_DIRS.some((d) => f.startsWith(d)),
  ).filter((f) => existsSync(join(REPO, f)));
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** The environment every wrangler process runs in: an empty home, no
 *  credentials, metrics off, and the network guard preloaded. */
function isolatedEnv(scratch, blockLog) {
  const home = join(scratch, "home");
  mkdirSync(join(home, "AppData/Roaming"), { recursive: true });
  mkdirSync(join(home, "AppData/Local"), { recursive: true });
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "PATHEXT", "TEMP", "TMP", "NUMBER_OF_PROCESSORS", "OS", "PROCESSOR_ARCHITECTURE", "windir"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData/Roaming"),
    LOCALAPPDATA: join(home, "AppData/Local"),
    XDG_CONFIG_HOME: join(home, ".config"),
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: join(scratch, "wrangler-logs"),
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    DECKO_NETWORK_BLOCK_LOG: blockLog,
    NODE_OPTIONS: `--import=${pathToFileURL(GUARD).href}`,
  };
}

function runWrangler(wrangler, args, cwd, env, timeoutMs = 110_000) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => killTree(child.pid), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, out });
    });
  });
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // already gone
  }
}

async function waitForHttp(url, child, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) return false;
    try {
      const res = await fetch(url, { redirect: "manual" });
      await res.arrayBuffer();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

async function checkRoutes(base) {
  const results = [];
  for (const check of ROUTE_CHECKS) {
    const res = await fetch(`${base}${check.path}`, {
      method: check.method ?? "GET",
      redirect: "manual",
      headers: check.method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {},
      body: check.method === "POST" ? "card%5Bcontent%5D=changed" : undefined,
    });
    const body = await res.text();
    const problems = [];
    if (res.status !== check.status) problems.push(`status ${res.status}, expected ${check.status}`);
    for (const needle of check.contains ?? []) {
      if (!body.includes(needle)) problems.push(`body lacks ${JSON.stringify(needle)}`);
    }
    if (check.json) {
      try {
        JSON.parse(body);
      } catch {
        problems.push("body is not JSON");
      }
    }
    if (body.includes("process is not defined")) problems.push("body reports `process is not defined`");
    results.push({ method: check.method ?? "GET", path: check.path, status: res.status, bytes: body.length, ok: problems.length === 0, problems });
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wrangler = findWrangler(args.wrangler);
  const scratch = mkdtempSync(join(tmpdir(), "decko-deploy-rehearsal-"));
  const blockLog = join(scratch, "blocked-connections.txt");
  writeFileSync(blockLog, "");
  const result = { wrangler: wrangler.version, steps: [], ok: false };
  let dev;
  try {
    // 1. The copy.
    const work = join(scratch, "repo");
    const files = filesToCopy();
    for (const f of files) {
      mkdirSync(dirname(join(work, f)), { recursive: true });
      copyFileSync(join(REPO, f), join(work, f));
    }
    result.steps.push({ step: "copy", ok: files.includes("worker.ts") && files.includes("wrangler.toml"), files: files.length });

    // 2. The database id the button writes into the copy.
    const tomlPath = join(work, "wrangler.toml");
    const toml = readFileSync(tomlPath, "utf8");
    const placeholder = /database_id\s*=\s*"([^"]*)"/.exec(toml);
    const placeholderOk = Boolean(placeholder) && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(placeholder[1]);
    writeFileSync(tomlPath, toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${randomUUID()}"`));
    result.steps.push({ step: "database id", ok: placeholderOk, committedValue: placeholder?.[1] ?? null });

    const env = isolatedEnv(scratch, blockLog);

    // 3. The bundle the button uploads.
    const dist = join(scratch, "dist");
    const build = await runWrangler(wrangler.path, ["deploy", "--dry-run", "--outdir", dist], work, env);
    const bundleFile = existsSync(dist) ? readdirSync(dist).find((f) => /\.(m?js)$/.test(f)) : undefined;
    const bundle = bundleFile ? readFileSync(join(dist, bundleFile)) : undefined;
    result.steps.push({
      step: "wrangler deploy --dry-run",
      ok: build.code === 0 && Boolean(bundle),
      exit: build.code,
      bundleBytes: bundle?.length ?? 0,
      bundleSha256: bundle ? createHash("sha256").update(bundle).digest("hex") : null,
      ...(build.code === 0 ? {} : { output: build.out.slice(-4000) }),
    });
    if (build.code !== 0) return result;

    // 4. A fresh database, migrated twice.
    const state = join(scratch, "state");
    const migrationFiles = readdirSync(join(work, "deploy/migrations")).filter((f) => f.endsWith(".sql")).sort();
    const first = await runWrangler(wrangler.path, ["d1", "migrations", "apply", "DB", "--local", "--persist-to", state], work, env);
    const appliedAll = migrationFiles.every((f) => first.out.includes(f));
    result.steps.push({
      step: "d1 migrations apply --local (fresh)",
      ok: first.code === 0 && appliedAll,
      exit: first.code,
      migrations: migrationFiles,
      ...(first.code === 0 && appliedAll ? {} : { output: first.out.slice(-4000) }),
    });
    const second = await runWrangler(wrangler.path, ["d1", "migrations", "apply", "DB", "--local", "--persist-to", state], work, env);
    const noop = second.code === 0 && /no migrations to apply/i.test(second.out);
    result.steps.push({ step: "d1 migrations apply --local (re-run)", ok: noop, exit: second.code, ...(noop ? {} : { output: second.out.slice(-2000) }) });

    // 5. The deployed Worker, served locally over that database.
    const port = await freePort();
    const inspector = await freePort();
    let devOut = "";
    dev = spawn(
      process.execPath,
      [wrangler.path, "dev", "--persist-to", state, "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspector), "--show-interactive-dev-session=false"],
      { cwd: work, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    dev.stdout.on("data", (d) => { devOut += d; });
    dev.stderr.on("data", (d) => { devOut += d; });
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForHttp(`${base}/api/status`, dev, 90_000);
    if (!up) {
      result.steps.push({ step: "wrangler dev", ok: false, output: devOut.slice(-4000) });
      return result;
    }
    const routes = await checkRoutes(base);
    result.steps.push({ step: "routes over wrangler dev", ok: routes.every((r) => r.ok), routes });
    if (/process is not defined|Uncaught/i.test(devOut)) {
      result.steps.push({ step: "wrangler dev log", ok: false, output: devOut.slice(-4000) });
    }
    result.ok = result.steps.every((s) => s.ok);
    return result;
  } finally {
    if (dev) killTree(dev.pid);
    const blocked = existsSync(blockLog) ? readFileSync(blockLog, "utf8").split("\n").filter(Boolean) : [];
    result.externalConnectionsRefused = [...new Set(blocked)];
    // workerd can hold its database files for a moment after the kill.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(scratch, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    result.scratchRemoved = !existsSync(scratch);
    const text = JSON.stringify(result, null, 2);
    if (args.json) writeFileSync(args.json, `${text}\n`);
    process.stdout.write(`${text}\n`);
    process.exitCode = result.ok && result.scratchRemoved ? 0 : 1;
  }
}

await main();
