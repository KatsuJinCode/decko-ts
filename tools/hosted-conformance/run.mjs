#!/usr/bin/env node
// Hosted conformance runner: runs the write-path suites against hosted
// databases, each in a scratch database the runner creates and removes.
//
//   node tools/hosted-conformance/run.mjs --target all      hosted services
//   node tools/hosted-conformance/run.mjs --target d1,turso
//   node tools/hosted-conformance/run.mjs --local           local stand-ins
//
// Credentials come from environment variables (docs/hosted-conformance.md).
// A target whose variables are absent is reported SKIPPED with the names it
// needs. --local runs the same flow against stand-ins on this machine: a
// fake Cloudflare D1 HTTP API backed by Miniflare's local D1, a fake Turso
// Platform API that starts the in-repo Hrana test server per database, and
// that Hrana server in place of a Bunny database.
//
// Exit status is 0 only when every suite of every target that ran passed.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** The suites, each run with the hosted target in its environment. A
 *  filter of "hosted" selects a shared suite's hosted cases only. */
const SUITES = [
  { name: "transaction conformance", file: "tests/hosted/hosted-transactions.test.ts" },
  { name: "atomic saves", file: "tests/card/actions/atomic-saves.test.ts", filter: "hosted" },
  { name: "concurrent saves", file: "tests/card/actions/concurrent-saves.test.ts", filter: "hosted" },
  { name: "multi-user read isolation", file: "tests/card/actions/d1-multi-user-saves.test.ts", filter: "hosted" },
];

/** Suites the task names that do not run against a hosted database yet,
 *  reported in every table so their absence is visible. */
const NOT_PORTED = [
  { name: "write probe", reason: "drives a file copy of the oracle deck through LocalSqliteDriver; not yet driver-selectable" },
  { name: "scenario battery", reason: "drives file copies of the deck in a child process; not yet driver-selectable" },
  { name: "sign-in", reason: "its test storage reads the database synchronously (better-sqlite3); not yet driver-selectable" },
];

const env = process.env;

function parseArgs(argv) {
  const out = { local: false, targets: ["d1", "turso", "bunny"] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--local") out.local = true;
    else if (argv[i] === "--target") out.targets = argv[++i] === "all" ? ["d1", "turso", "bunny"] : argv[i].split(",");
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

function missing(names) {
  return names.filter((n) => !env[n]);
}

function scratchName() {
  return `decko-conformance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function call(method, url, token, body, authHeader = "authorization") {
  const headers = { "content-type": "application/json" };
  headers[authHeader] = authHeader === "authorization" ? `Bearer ${token}` : token;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url.replace(/\/accounts\/[^/]+/, "/accounts/<account>")}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text === "" ? {} : JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Targets: each create() returns { env, describe, teardown }.
// ---------------------------------------------------------------------------

const TARGETS = {
  d1: {
    needs: ["DECKO_HOSTED_D1_ACCOUNT_ID", "DECKO_HOSTED_D1_API_TOKEN"],
    async create() {
      const base = env.DECKO_HOSTED_D1_API_BASE || "https://api.cloudflare.com/client/v4";
      const root = `${base}/accounts/${env.DECKO_HOSTED_D1_ACCOUNT_ID}/d1/database`;
      const token = env.DECKO_HOSTED_D1_API_TOKEN;
      const created = await call("POST", root, token, { name: scratchName() });
      const uuid = created?.result?.uuid;
      if (!uuid) throw new Error("D1 create database: no result.uuid in the response");
      return {
        env: { DECKO_HOSTED_TARGET: "d1-http", DECKO_HOSTED_D1_QUERY_URL: `${root}/${uuid}/query`, DECKO_HOSTED_D1_API_TOKEN: token },
        teardown: () => call("DELETE", `${root}/${uuid}`, token),
      };
    },
  },
  turso: {
    needs: ["DECKO_HOSTED_TURSO_ORG", "DECKO_HOSTED_TURSO_API_TOKEN"],
    async create() {
      const base = env.DECKO_HOSTED_TURSO_API_BASE || "https://api.turso.tech";
      const root = `${base}/v1/organizations/${env.DECKO_HOSTED_TURSO_ORG}/databases`;
      const token = env.DECKO_HOSTED_TURSO_API_TOKEN;
      const name = scratchName();
      const created = await call("POST", root, token, { name, group: env.DECKO_HOSTED_TURSO_GROUP || "default" });
      const hostname = created?.database?.Hostname;
      const teardown = () => call("DELETE", `${root}/${name}`, token);
      try {
        if (!hostname) throw new Error("Turso create database: no database.Hostname in the response");
        const minted = await call("POST", `${root}/${name}/auth/tokens`, token, {});
        if (!minted?.jwt) throw new Error("Turso create token: no jwt in the response");
        const scheme = env.DECKO_HOSTED_TURSO_DB_SCHEME || "https";
        return { env: { DECKO_HOSTED_TARGET: "libsql", DECKO_HOSTED_DB_URL: `${scheme}://${hostname}`, DECKO_HOSTED_DB_TOKEN: minted.jwt }, teardown };
      } catch (error) {
        await teardown().catch(() => undefined);
        throw error;
      }
    },
  },
  bunny: {
    // Bunny's database management API is not in Bunny's own published
    // reference as of 2026-10-14, so the operator supplies an empty scratch
    // database; the runner refuses one that is not empty and empties it
    // again afterwards.
    needs: ["DECKO_HOSTED_BUNNY_URL", "DECKO_HOSTED_BUNNY_TOKEN"],
    async create() {
      const url = env.DECKO_HOSTED_BUNNY_URL.replace(/\/v2\/pipeline\/?$/, "");
      const token = env.DECKO_HOSTED_BUNNY_TOKEN;
      const names = await hranaObjects(url, token);
      if (names.length > 0) throw new Error(`refusing a non-empty Bunny database (${names.length} objects); supply an empty scratch database`);
      return {
        env: { DECKO_HOSTED_TARGET: "bunny", DECKO_HOSTED_DB_URL: url, DECKO_HOSTED_DB_TOKEN: token },
        teardown: () => emptyHranaDatabase(url, token),
      };
    },
  },
};

async function hrana(url, token, statements) {
  const requests = statements.map((sql) => ({ type: "execute", stmt: { sql } }));
  requests.push({ type: "close" });
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/v2/pipeline`, { method: "POST", headers, body: JSON.stringify({ requests }) });
  if (!response.ok) throw new Error(`Hrana pipeline: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  return body.results.slice(0, statements.length).map((r) => {
    if (r.type !== "ok") throw new Error(`Hrana statement failed: ${JSON.stringify(r.error ?? r).slice(0, 200)}`);
    return r.response.result;
  });
}

async function hranaObjects(url, token) {
  const [result] = await hrana(url, token, [
    "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND type IN ('table','view','trigger')",
  ]);
  return result.rows.map((row) => ({ type: row[0].value, name: row[1].value }));
}

async function emptyHranaDatabase(url, token) {
  const quote = (n) => `"${n.replace(/"/g, '""')}"`;
  for (let pass = 0; pass < 50; pass++) {
    const objects = await hranaObjects(url, token);
    if (objects.length === 0) return;
    const order = { trigger: 0, view: 1, table: 2 };
    objects.sort((a, b) => order[a.type] - order[b.type]);
    for (const o of objects) await hrana(url, token, [`DROP ${o.type.toUpperCase()} IF EXISTS ${quote(o.name)}`]).catch(() => undefined);
  }
  throw new Error("could not empty the Bunny scratch database");
}

// ---------------------------------------------------------------------------
// Local stand-ins (--local)
// ---------------------------------------------------------------------------

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () =>
        handler(req, body === "" ? undefined : JSON.parse(body)).then(
          ([status, json]) => {
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(json));
          },
          (error) => {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ success: false, errors: [{ message: String(error) }] }));
          },
        ),
      );
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function startLocalStandIns() {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const { startMockHranaServer } = await import(pathToFileURL(join(REPO, "tests/server/drivers/mock-hrana-server.ts")).href);
  const D1_SLOTS = 4;
  const d1Databases = {};
  for (let i = 1; i <= D1_SLOTS; i++) d1Databases[`DB${i}`] = `conformance-stand-in-${i}`;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: `export default { fetch() { return new Response("ok"); } }`, d1Databases }));
  const d1 = new Map();
  let nextSlot = 0;
  const d1Api = await listen(async (req, body) => {
    const m = /^\/accounts\/[^/]+\/d1\/database(?:\/([^/]+)(\/query)?)?$/.exec(req.url);
    if (m === null) return [404, { success: false, errors: [{ message: "not found" }] }];
    if (req.method === "POST" && m[1] === undefined) {
      nextSlot += 1;
      if (nextSlot > D1_SLOTS) throw new Error("no free local D1 slot");
      const uuid = `local-${nextSlot}`;
      d1.set(uuid, await mf.getD1Database(`DB${nextSlot}`));
      return [200, { success: true, errors: [], result: { uuid, name: body.name } }];
    }
    const db = d1.get(m[1]);
    if (db === undefined) return [404, { success: false, errors: [{ message: "no such database" }] }];
    if (req.method === "DELETE" && m[2] === undefined) {
      d1.delete(m[1]);
      return [200, { success: true, errors: [], result: null }];
    }
    if (req.method === "POST" && m[2] === "/query") {
      const list = body.batch ?? [body];
      try {
        const prepared = list.map((s) => db.prepare(s.sql).bind(...(s.params ?? [])));
        const results = prepared.length === 1 && body.batch === undefined ? [await prepared[0].all()] : await db.batch(prepared);
        return [200, { success: true, errors: [], result: results.map((r) => ({ results: r.results, success: r.success, meta: r.meta })) }];
      } catch (error) {
        const cause = error && error.cause ? ` ${String(error.cause)}` : "";
        return [400, { success: false, errors: [{ code: 7500, message: `${String(error)}${cause}` }] }];
      }
    }
    return [405, { success: false, errors: [{ message: "method not allowed" }] }];
  });
  const turso = new Map();
  const tursoApi = await listen(async (req, body) => {
    const m = /^\/v1\/organizations\/[^/]+\/databases(?:\/([^/]+)(\/auth\/tokens)?)?$/.exec(req.url);
    if (m === null) return [404, { error: "not found" }];
    if (req.method === "POST" && m[1] === undefined) {
      const dir = mkdtempSync(join(tmpdir(), "decko-turso-stand-in-"));
      const server = await startMockHranaServer({ path: join(dir, "db.sqlite") });
      const name = body.name;
      turso.set(name, { server, dir });
      return [200, { database: { Name: name, Hostname: new URL(server.url).host } }];
    }
    const entry = turso.get(m[1]);
    if (entry === undefined) return [404, { error: "no such database" }];
    if (req.method === "POST" && m[2]) return [200, { jwt: "local-stand-in-token" }];
    if (req.method === "DELETE") {
      await entry.server.close();
      rmSync(entry.dir, { recursive: true, force: true });
      turso.delete(m[1]);
      return [200, { database: m[1] }];
    }
    return [405, { error: "method not allowed" }];
  });
  const bunnyDir = mkdtempSync(join(tmpdir(), "decko-bunny-stand-in-"));
  const bunny = await startMockHranaServer({ path: join(bunnyDir, "db.sqlite") });
  Object.assign(env, {
    DECKO_HOSTED_D1_API_BASE: `http://127.0.0.1:${d1Api.port}`,
    DECKO_HOSTED_D1_ACCOUNT_ID: "local-account",
    DECKO_HOSTED_D1_API_TOKEN: "local-stand-in-token",
    DECKO_HOSTED_TURSO_API_BASE: `http://127.0.0.1:${tursoApi.port}`,
    DECKO_HOSTED_TURSO_ORG: "local-org",
    DECKO_HOSTED_TURSO_API_TOKEN: "local-stand-in-token",
    DECKO_HOSTED_TURSO_DB_SCHEME: "http",
    DECKO_HOSTED_BUNNY_URL: bunny.url,
    DECKO_HOSTED_BUNNY_TOKEN: "local-stand-in-token",
  });
  return {
    leftovers: () => ({ d1: d1.size, turso: turso.size }),
    async close() {
      d1Api.server.close();
      tursoApi.server.close();
      for (const { server, dir } of turso.values()) {
        await server.close();
        rmSync(dir, { recursive: true, force: true });
      }
      await bunny.close();
      rmSync(bunnyDir, { recursive: true, force: true });
      await mf.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Running the suites
// ---------------------------------------------------------------------------

function runSuite(suite, targetEnv) {
  const args = [join(REPO, "node_modules/vitest/vitest.mjs"), "run", suite.file];
  if (suite.filter) args.push("-t", suite.filter);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: REPO, env: { ...env, ...targetEnv }, windowsHide: true });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("close", (code) => {
      const plain = out.replace(/\u001b\[[0-9;]*m/g, "");
      const tests = /Tests\s+([^\n]+)/.exec(plain)?.[1]?.trim() ?? "no summary";
      const passed = Number(/(\d+) passed/.exec(tests)?.[1] ?? 0);
      const ok = code === 0 && passed > 0;
      resolve({ ok, tests, log: plain });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const standIns = args.local ? await startLocalStandIns() : undefined;
  const rows = [];
  let failed = false;
  try {
    for (const name of args.targets) {
      const target = TARGETS[name];
      if (target === undefined) throw new Error(`unknown target ${name} (d1, turso, bunny)`);
      const absent = missing(target.needs);
      if (absent.length > 0) {
        for (const suite of SUITES) rows.push([name, suite.name, `SKIPPED (no credentials: ${absent.join(", ")})`]);
        continue;
      }
      let scratch;
      try {
        scratch = await target.create();
      } catch (error) {
        failed = true;
        rows.push([name, "scratch database", `FAIL: ${String(error.message ?? error)}`]);
        continue;
      }
      try {
        for (const suite of SUITES) {
          process.stderr.write(`[hosted-conformance] ${name}: ${suite.name} ...\n`);
          const result = await runSuite(suite, scratch.env);
          if (!result.ok) {
            failed = true;
            process.stderr.write(result.log.split("\n").filter((l) => /FAIL|Error|expected|×/.test(l)).slice(0, 40).join("\n") + "\n");
          }
          rows.push([name, suite.name, `${result.ok ? "PASS" : "FAIL"} (${result.tests})`]);
        }
      } finally {
        try {
          await scratch.teardown();
          rows.push([name, "scratch database removed", "PASS"]);
        } catch (error) {
          failed = true;
          rows.push([name, "scratch database removed", `FAIL: ${String(error.message ?? error)}`]);
        }
      }
      for (const n of NOT_PORTED) rows.push([name, n.name, `NOT RUN (${n.reason})`]);
    }
    if (standIns !== undefined) {
      const left = standIns.leftovers();
      const clean = left.d1 === 0 && left.turso === 0;
      if (!clean) failed = true;
      rows.push(["local", "stand-in databases left after teardown", clean ? "PASS (none)" : `FAIL (${JSON.stringify(left)})`]);
    }
  } finally {
    await standIns?.close();
  }
  const width = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`hosted conformance (${args.local ? "local stand-ins" : "hosted services"})`);
  for (const r of rows) console.log(`${r[0].padEnd(width[0])}  ${r[1].padEnd(width[1])}  ${r[2]}`);
  process.exitCode = failed ? 1 : 0;
}

await main();
