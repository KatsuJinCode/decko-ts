#!/usr/bin/env node
// Rehearse the Deploy to Cloudflare button on this machine, with no
// Cloudflare account and no network.
//
// The button (docs/deploy-cloudflare.md, "The deploy button") copies the
// repository, creates the D1 database, R2 bucket and queue wrangler.toml
// declares and writes the database id into the copy's wrangler.toml, then
// runs `npm run deploy`: apply deploy/migrations/, bundle and deploy
// worker.ts with its cron trigger, issue the first-run setup token. Only the
// copy into GitHub, the resource creation and the upload need Cloudflare.
// This script runs every other step with the real wrangler, against
// wrangler's local (miniflare/workerd) D1, R2 and queue:
//
//   1. copy the files the deploy reads into a scratch directory, and link the
//      repository's installed node_modules into the copy (offline resolution);
//   2. replace the placeholder database_id, as the button does, and check
//      every binding the button provisions is declared;
//   3. `wrangler deploy --dry-run`: the same bundle the button uploads;
//   4. `wrangler d1 migrations apply DB --local` on a fresh database,
//      then again to show a re-run applies nothing;
//   5. tools/deploy/issue-setup-token.mjs --local: the token step of
//      `npm run deploy`, through `wrangler d1 execute`;
//   6. `wrangler dev --test-scheduled` over that state, the read routes the
//      README promises checked over HTTP, then the first-owner journey:
//      /setup refused without the token, the owner created with it, the token
//      spent; sign in; create a card; upload a file and read its bytes back
//      from R2; fire the cron trigger, which enqueues the sweep on the local
//      queue for the Worker's consumer;
//   7. everything removed, in a finally block.
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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = join(REPO, "tools/deploy/no-external-network.mjs");

/** What a button deploy reads: the root config and entry, the engine, the
 *  migrations. Anything outside these the bundle cannot reach. package-lock.json
 *  records the dependency set the copy declares; the installed node_modules is
 *  linked in below so the bundle resolves @cf-wasm/photon and the other runtime
 *  dependencies without touching a registry. */
const COPY_FILES = ["worker.ts", "wrangler.toml", "package.json", "package-lock.json", "tsconfig.json", "tools/deploy/issue-setup-token.mjs"];
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
  // An anonymous write is refused: the write surface is on, and Anonymous
  // holds no update permission on the demo deck.
  { path: "/Hello_World", method: "POST", status: 403 },
];

/** The bindings the button provisions, as wrangler.toml must declare them. */
const REQUIRED_BINDINGS = [
  { what: "D1 database DB", pattern: /\[\[d1_databases\]\][^[]*binding\s*=\s*"DB"/ },
  { what: "R2 bucket FILES", pattern: /\[\[r2_buckets\]\][^[]*binding\s*=\s*"FILES"/ },
  { what: "queue producer DELAYED", pattern: /\[\[queues\.producers\]\][^[]*binding\s*=\s*"DELAYED"/ },
  { what: "queue consumer", pattern: /\[\[queues\.consumers\]\]/ },
  { what: "cron trigger", pattern: /\[triggers\][^[]*crons\s*=\s*\[\s*"/ },
  { what: "write path on", pattern: /^DECKO_WRITE_PATH\s*=\s*"1"/m },
  { what: "first-run window on", pattern: /^DECKO_FIRST_RUN\s*=\s*"1"/m },
];

const OWNER = { email: "owner@example.com", password: "Rehearsal-passw0rd-2026" };

function cookieFrom(res) {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
  return all.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
}

/** The first-owner journey over a running deck. Each check records what it
 *  saw; the step passes only when every check does. */
async function ownerJourney(base, token) {
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok, ...detail });
  const origin = { origin: base };
  const form = (fields) => new URLSearchParams(fields).toString();
  const urlencoded = { "content-type": "application/x-www-form-urlencoded", ...origin };
  const tokenQuery = `token=${encodeURIComponent(token)}`;

  let res = await fetch(`${base}/`, { redirect: "manual" });
  let body = await res.text();
  record("Home renders anonymously", res.status === 200 && body.includes("Home"), { status: res.status });

  // Without the link the form asks for the token, and a POST without one
  // creates nothing.
  res = await fetch(`${base}/setup`, { redirect: "manual" });
  body = await res.text();
  record("/setup without the link asks for the token", res.status === 200 && body.includes('name="setup_token"'), { status: res.status });

  res = await fetch(`${base}/setup`, { method: "POST", redirect: "manual", headers: urlencoded, body: form(OWNER) });
  await res.text();
  record("/setup without the token is refused", res.status === 403, { status: res.status });

  res = await fetch(`${base}/setup?token=not-the-token`, { redirect: "manual" });
  await res.text();
  record("/setup with a wrong token is refused", res.status === 403, { status: res.status });

  res = await fetch(`${base}/setup?${tokenQuery}`, { redirect: "manual" });
  body = await res.text();
  record("/setup with the token renders the form", res.status === 200 && body.includes("first-run-setup-form") && body.includes("token="), { status: res.status });

  res = await fetch(`${base}/setup?${tokenQuery}`, { method: "POST", redirect: "manual", headers: urlencoded, body: form(OWNER) });
  body = await res.text();
  record("owner account created", res.status === 303, { status: res.status, ...(res.status === 303 ? {} : { body: body.slice(0, 600) }) });

  res = await fetch(`${base}/setup?${tokenQuery}`, { redirect: "manual" });
  await res.text();
  record("the token is spent once the owner exists", res.status === 403 || res.status === 404, { status: res.status });

  res = await fetch(`${base}/update/*signin`, {
    method: "POST",
    redirect: "manual",
    headers: urlencoded,
    body: form({
      _method: "patch",
      "success[redirect]": "true",
      "success[mark]": "*previous",
      "card[subcards][+*email][content]": OWNER.email,
      "card[subcards][+*password][content]": OWNER.password,
    }),
  });
  body = await res.text();
  const cookie = cookieFrom(res);
  record("sign in", res.status >= 300 && res.status < 400 && cookie !== "", { status: res.status, ...(cookie ? {} : { body: body.slice(0, 600) }) });

  res = await fetch(`${base}/`, {
    method: "POST",
    redirect: "manual",
    headers: { ...urlencoded, cookie },
    body: form({ "card[name]": "Rehearsal Card", "card[content]": "Written by the deploy rehearsal." }),
  });
  body = await res.text();
  record("create a card", res.status >= 300 && res.status < 400, { status: res.status, ...(res.status < 400 ? {} : { body: body.slice(0, 600) }) });
  res = await fetch(`${base}/Rehearsal_Card`, { redirect: "manual", headers: { cookie } });
  body = await res.text();
  record("the created card renders", res.status === 200 && body.includes("Written by the deploy rehearsal."), { status: res.status });

  const upload = new FormData();
  upload.set("card[name]", "Rehearsal Upload");
  upload.set("card[type]", "File");
  const fileBytes = `uploaded by the deploy rehearsal ${token.slice(0, 8)}`;
  upload.set("card[file]", new Blob([fileBytes], { type: "text/plain" }), "rehearsal.txt");
  res = await fetch(`${base}/`, { method: "POST", redirect: "manual", headers: { ...origin, cookie }, body: upload });
  body = await res.text();
  record("upload a file", res.status >= 300 && res.status < 400, { status: res.status, ...(res.status < 400 ? {} : { body: body.slice(0, 600) }) });

  res = await fetch(`${base}/api/card/Rehearsal_Upload`, { headers: { cookie } });
  const meta = res.status === 200 ? await res.json() : undefined;
  const identifier = /~(\d+)\/(\d+)(\.[a-z0-9]+)/.exec(meta?.db_content_preview ?? "");
  record("the upload's card names its stored file", identifier !== null, { status: res.status, content: meta?.db_content_preview ?? null });
  if (identifier !== null) {
    res = await fetch(`${base}/files/~${identifier[1]}/${identifier[2]}${identifier[3]}`, { headers: { cookie } });
    body = await res.text();
    record("the uploaded bytes come back from R2", res.status === 200 && body === fileBytes, { status: res.status, bytes: body.length });
  }

  res = await fetch(`${base}/__scheduled?cron=${encodeURIComponent("17 3 * * *")}`);
  await res.text();
  record("the cron trigger runs", res.status === 200, { status: res.status });

  return checks;
}

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
    // The installed dependencies come along as a link (a junction on Windows,
    // a symlink elsewhere), so the dry-run resolves the same packages the
    // repository resolves and no registry is contacted. Node's recursive
    // removal deletes the link itself, never its target.
    const repoNodeModules = join(REPO, "node_modules");
    if (!existsSync(join(repoNodeModules, "@cf-wasm/photon/package.json"))) {
      throw new Error(`${repoNodeModules} has no installed @cf-wasm/photon; run npm ci in the repository first (offline, from a populated cache) or point this checkout's node_modules at an existing install`);
    }
    symlinkSync(repoNodeModules, join(work, "node_modules"), "junction");
    result.steps.push({ step: "copy", ok: files.includes("worker.ts") && files.includes("wrangler.toml"), files: files.length, nodeModules: "linked" });

    // 2. The database id the button writes into the copy.
    const tomlPath = join(work, "wrangler.toml");
    const toml = readFileSync(tomlPath, "utf8");
    const placeholder = /database_id\s*=\s*"([^"]*)"/.exec(toml);
    const placeholderOk = Boolean(placeholder) && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(placeholder[1]);
    writeFileSync(tomlPath, toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${randomUUID()}"`));
    result.steps.push({ step: "database id", ok: placeholderOk, committedValue: placeholder?.[1] ?? null });
    const missing = REQUIRED_BINDINGS.filter((b) => !b.pattern.test(toml)).map((b) => b.what);
    result.steps.push({ step: "bindings the button provisions", ok: missing.length === 0, declared: REQUIRED_BINDINGS.map((b) => b.what), missing });

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

    // 5. The setup token, issued the way `npm run deploy` issues it.
    const issue = await new Promise((resolveRun) => {
      const child = spawn(
        process.execPath,
        [join(work, "tools/deploy/issue-setup-token.mjs"), "--local", "--persist-to", state, "--json", "--wrangler", wrangler.path],
        { cwd: work, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { out += d; });
      child.on("close", (code) => resolveRun({ code, out }));
    });
    const token = /"token":"([A-Za-z0-9_-]+)"/.exec(issue.out)?.[1];
    result.steps.push({
      step: "issue setup token (--local)",
      ok: issue.code === 0 && token !== undefined && token.length >= 40,
      exit: issue.code,
      ...(issue.code === 0 && token !== undefined ? {} : { output: issue.out.slice(-3000) }),
    });
    if (token === undefined) return result;

    // 6. The deployed Worker, served locally over that state.
    const port = await freePort();
    const inspector = await freePort();
    let devOut = "";
    dev = spawn(
      process.execPath,
      [wrangler.path, "dev", "--persist-to", state, "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspector), "--test-scheduled", "--show-interactive-dev-session=false"],
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
    const journey = await ownerJourney(base, token);
    result.steps.push({ step: "first owner: setup, sign in, create, upload, cron", ok: journey.every((c) => c.ok), checks: journey });
    // The queue consumer runs after the cron handler returns and the local
    // queue's batch timeout; wait for its log line.
    for (let i = 0; i < 20 && !/delayed work (done|failed)/.test(devOut); i += 1) await new Promise((r) => setTimeout(r, 500));
    const consumed = /delayed work done: (\{[^\n]*\})/.exec(devOut);
    result.steps.push({
      step: "queue consumer ran the cron's sweep",
      ok: consumed !== null && !/delayed work failed/.test(devOut),
      ...(consumed !== null ? { outcome: consumed[1] } : { output: devOut.slice(-4000) }),
    });
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
