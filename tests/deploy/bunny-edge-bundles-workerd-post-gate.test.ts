// The Bunny edge bundles' POST paths, driven in workerd — the gate the
// 2026-10-09 demo incident showed did not exist.
//
// WHY THIS FILE IS HERE
//   The integration battery (byte gate, marker proof, decision-state proof)
//   only ever GETs, so every POST path of the deployed bundles shipped
//   unproven: the sign-in 500 that met the live demo walk on 2026-10-09 was
//   invisible to every merge gate on its way out (WP5-INTEGRATION.md,
//   "Gate-shaped lesson"). The write surface's own suites drive the handler
//   modules in-process on node; this file drives the REAL BUNDLED ARTIFACTS
//   in a real workerd over the wire, which is where the demo actually runs.
//
// WHAT EACH CASE PINS
//   1. armed cold sign-in  — the engine bundle, DECKO_WRITE_PATH=1, an
//      isolate's very first request is POST /update/*signin with valid
//      credentials: it must complete the full ladder over the real
//      BunnyDbDriver wire (deck boot, account lookup, session INSERT) and
//      answer 303 + Set-Cookie with one auth_sessions row. This is the
//      "armed cold isolate's first write POST completes" gate.
//   2. unarmed auth dispatch — without the write flag the engine bundle
//      still dispatches the sign-in action (auth is not a card write) and
//      answers the typed Ruby failure for unknown credentials; card writes
//      stay on the 403.
//   3. read bundle guard — the read-only bundle with DECKO_EDGE_FULL_URL
//      unset answers its 63-byte JSON guard (bytes pinned) instead of
//      crashing.
//   4. read bundle forward — with DECKO_EDGE_FULL_URL set, a cold write
//      POST forwards to the full script, the answer passes through (status,
//      Set-Cookie), the redirect host is rewritten to the request's host,
//      and the read edge's own server-timing shows it did no DB work.
//
// THE DATABASE IS THE REAL PROTOCOL END TO END
//   Worker -> BunnyDbDriver (bundled, real) -> HTTP Hrana v2
//   -> the protocol-faithful mock server (tests/server/drivers/
//   mock-hrana-server.ts) -> a real sqlite with the real cards DDL
//   (db/schema.sqlite.sql) and the real auth_sessions DDL
//   (deploy/migrations/0005-auth-sessions.sql). Only the far end of the
//   socket is substituted, and only the socket.
//
// DATA: synthetic (generated credentials, synthetic account) per the stream
// data rule. Nothing here reads or writes any live system.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import http from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { coffeescriptNodeBuiltinStubs } from "../../tools/vendor/coffeescript-edge-bundler-stubs.mjs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../server/drivers/mock-hrana-server.js";
import {
  generatedEmail,
  generatedPassword,
} from "../../src/testing/generated-credentials.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENGINE_ENTRY = `${REPO_ROOT}deploy/bunny-worker-src/bunny-edge-engine-entry.ts`;
const READ_ENTRY = `${REPO_ROOT}deploy/bunny-worker-src/bunny-edge-read-entry.ts`;

const SIGNIN_PATH = "/update/*signin";
const TS = "2026-10-09 12:00:00.000";
const SALT = "GATESALT";
const HOLDER = { id: 9300, name: "Gate Post User" };
const JUNCTION_ID = 9301;
const IDS = { account: 9302, email: 9303, password: 9304, salt: 9305, status: 9306 } as const;
const EMAIL = generatedEmail("bunny-edge-post-gate");
const PASSWORD = generatedPassword("bunny-edge-post-gate");
const DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");

let workDir: string;
let hrana: MockHranaServer;
let driver: BunnyDbDriver;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "decko-post-gate-"));
  hrana = await startMockHranaServer();
  driver = new BunnyDbDriver({ url: hrana.url, authToken: "post-gate-token" });
  await seedDeck();
}, 20_000);

afterAll(async () => {
  await hrana?.close();
  if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
});

/** Split a .sql file into single statements the way
 *  tests/deploy/bunny-edge-signin-session-roundtrip.test.ts does: strip
 *  `--` comments first (the core schema carries them INSIDE its DDL), keep
 *  a CREATE TRIGGER body in one piece. No string literal in these files
 *  contains a `;`, so the split is exact. */
function sqlStatements(file: string): string[] {
  const statements: string[] = [];
  let pending = "";
  for (const piece of readFileSync(join(REPO_ROOT, file), "utf8").replace(/--[^\n]*/g, "").split(";")) {
    pending = pending === "" ? piece : `${pending};${piece}`;
    const statement = pending.trim();
    if (statement === "") {
      pending = "";
      continue;
    }
    if (/^CREATE\s+TRIGGER\b/i.test(statement) && !/\bEND$/i.test(statement)) continue;
    statements.push(statement);
    pending = "";
  }
  return statements;
}

async function seedDeck(): Promise<void> {
  for (const file of ["db/schema.sqlite.sql", "deploy/migrations/0005-auth-sessions.sql"]) {
    for (const sql of sqlStatements(file)) await driver.query(sql, []);
  }
  const codename = (id: number, codenameName: string, name: string): Promise<unknown> =>
    driver.query(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 1, NULL)`,
      [id, name, name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), codenameName, TS, TS],
    );
  const compound = (id: number, name: string, leftId: number, rightId: number, content: string | null): Promise<unknown> =>
    driver.query(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 1, ?)`,
      [id, name, leftId, rightId, TS, TS, content],
    );
  await codename(IDS.account, "account", "*account");
  await codename(IDS.email, "email", "*email");
  await codename(IDS.password, "password", "*password");
  await codename(IDS.salt, "salt", "*salt");
  await codename(IDS.status, "status", "*status");
  await codename(HOLDER.id, "", HOLDER.name);
  await compound(JUNCTION_ID, `${HOLDER.name}+*account`, HOLDER.id, IDS.account, null);
  await compound(9307, `${HOLDER.name}+*account+*email`, JUNCTION_ID, IDS.email, EMAIL);
  await compound(9308, `${HOLDER.name}+*account+*password`, JUNCTION_ID, IDS.password, DIGEST);
  await compound(9309, `${HOLDER.name}+*account+*salt`, JUNCTION_ID, IDS.salt, SALT);
  await compound(9310, `${HOLDER.name}+*account+*status`, JUNCTION_ID, IDS.status, "active");
}

/** Bundle a REAL deploy entry exactly the way the deploy tool does
 *  (tools/bundle-bunny-edge-engine.mjs): same options, temp output so
 *  concurrent vitest forks never collide on deploy/dist. */
async function buildBundle(entry: string, name: string): Promise<string> {
  const outfile = join(workDir, name);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    // Resolution is cwd-dependent for the aliased @cf-wasm/photon entry;
    // pin it to the repo so the gate runs from any working directory.
    absWorkingDir: REPO_ROOT,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    external: [
      ...builtinModules,
      ...builtinModules.map((n) => `node:${n}`),
      "@bunny.net/edgescript-sdk",
    ],
    conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"],
    alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
    // The coffeescript subtree requires fs/vm/path for helpers compile()
    // never touches — the same stubs the deploy tool bundles with. Without
    // them the built engine bundle dies at module load in workerd.
    plugins: [coffeescriptNodeBuiltinStubs()],
    logLevel: "silent",
    banner: { js: 'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];' },
  });
  return outfile;
}

/** One fresh workerd per case: each case's request reaches a COLD isolate,
 *  the shape production serves most often (fresh isolate per request). The
 *  bundle's `BunnySDK.net.http.serve(handler)` is captured by the shim the
 *  measurement harnesses use and delegated to from the default export. */
async function coldIsolate(bundlePath: string, bindings: Record<string, string>): Promise<Miniflare> {
  const bundle = readFileSync(bundlePath, "utf8")
    .replace(/(["'])@bunny\.net\/edgescript-sdk\1/g, '"./sdk-shim.mjs"');
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: "ESModule",
          path: "main.mjs",
          contents: `import { __served } from "./sdk-shim.mjs";
import "./bundle.mjs";
export default { async fetch(request) { return await __served.fn(request); } };`,
        },
        {
          type: "ESModule",
          path: "sdk-shim.mjs",
          contents: `export const __served = { fn: undefined };
export const net = { http: { serve(a, b) { __served.fn = typeof a === "function" ? a : b; } } };
export default { net };`,
        },
        { type: "ESModule", path: "bundle.mjs", contents: bundle },
      ],
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      bindings,
    }) as never,
  );
}

function signinBody(email: string, password: string): string {
  return new URLSearchParams({
    "_method": "patch",
    "success[redirect]": "true",
    "success[mark]": "*previous",
    "card[subcards][+*email][content]": email,
    "card[subcards][+*password][content]": password,
  }).toString();
}

const FORM_HEADERS = {
  "content-type": "application/x-www-form-urlencoded",
  origin: "https://edge.test",
  referer: "https://edge.test/*signin",
};

describe("bunny edge bundles: POST paths in workerd (the battery's POST gate)", () => {
  it("an armed cold isolate's first write POST signs in: 303, session cookie, one auth_sessions row", async () => {
    const engine = await buildBundle(ENGINE_ENTRY, "engine.bundle.js");
    const mf = await coldIsolate(engine, {
      DECKO_DB_URL: hrana.url,
      DECKO_DB_TOKEN: "post-gate-token",
      DECKO_WRITE_PATH: "1",
    });
    try {
      const res = await mf.dispatchFetch(`https://edge.test${SIGNIN_PATH}`, {
        method: "POST",
        redirect: "manual",
        headers: FORM_HEADERS,
        body: signinBody(EMAIL, PASSWORD),
      });
      expect(res.status).toBe(303);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(location?.startsWith("https://edge.test/")).toBe(true);
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("decko_ts_session=");
      expect(cookie).toContain("HttpOnly");
      const sessions = await driver.query<{ n: unknown }>("SELECT COUNT(*) AS n FROM auth_sessions", []);
      expect(Number(sessions.rows[0]?.n)).toBe(1);
    } finally {
      await mf.dispose();
    }
  });

  it("without the write flag the engine bundle still dispatches the sign-in action and answers the typed failure", async () => {
    const engine = await buildBundle(ENGINE_ENTRY, "engine.bundle.js");
    const mf = await coldIsolate(engine, {
      DECKO_DB_URL: hrana.url,
      DECKO_DB_TOKEN: "post-gate-token",
    });
    try {
      const res = await mf.dispatchFetch(`https://edge.test${SIGNIN_PATH}`, {
        method: "POST",
        redirect: "manual",
        headers: FORM_HEADERS,
        body: signinBody("no-such-account@example.invalid", PASSWORD),
      });
      // The auth-only dispatch (edge-signin-form-fix lane): sign-in is not
      // a card write, so it dispatches without the flag and fails with the
      // Ruby ladder's typed outcome for an unknown email.
      expect(res.status).toBe(422);
      const body = await res.text();
      expect(body).toContain("signin-failure");
      // ...while a card write stays on the read-only 403.
      const create = await mf.dispatchFetch("https://edge.test/create/gate-probe-card", {
        method: "POST",
        redirect: "manual",
        headers: FORM_HEADERS,
        body: new URLSearchParams({ "card[name]": "gate-probe-card", "card[content]": "x" }).toString(),
      });
      expect(create.status).toBe(403);
      expect(await create.text()).toContain("read-only");
    } finally {
      await mf.dispose();
    }
  });

  it("the read bundle's cold write POST answers its 63-byte guard when no full-script URL is set", async () => {
    const read = await buildBundle(READ_ENTRY, "read.bundle.js");
    const mf = await coldIsolate(read, { DECKO_DB_URL: hrana.url, DECKO_DB_TOKEN: "post-gate-token" });
    try {
      const res = await mf.dispatchFetch(`https://edge.test${SIGNIN_PATH}`, {
        method: "POST",
        redirect: "manual",
        headers: FORM_HEADERS,
        body: signinBody(EMAIL, PASSWORD),
      });
      expect(res.status).toBe(500);
      const body = await res.text();
      // The guard's exact bytes (63 of them): the honest configuration
      // error, not a crashed isolate.
      expect(body).toBe('{\n  "error": "read-only edge: DECKO_EDGE_FULL_URL is not set"\n}');
    } finally {
      await mf.dispose();
    }
  });

  it("the read bundle forwards a cold write POST to the full script, passes the answer through, and rewrites the redirect host", async () => {
    const read = await buildBundle(READ_ENTRY, "read.bundle.js");
    const upstreamSessions: string[] = [];
    const upstream = http.createServer((_req, res) => {
      // The full script answers a successful sign-in with a redirect to its
      // OWN host — the shape the read edge's Location rewrite exists for.
      res.writeHead(303, {
        location: `${fullUrl}/after-signin`,
        "set-cookie": "decko_ts_session=fullscript-token; HttpOnly; Max-Age=172800",
      });
      res.end();
      upstreamSessions.push("hit");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const fullUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    const mf = await coldIsolate(read, {
      DECKO_DB_URL: hrana.url,
      DECKO_DB_TOKEN: "post-gate-token",
      DECKO_EDGE_FULL_URL: fullUrl,
    });
    try {
      const res = await mf.dispatchFetch(`https://edge.test${SIGNIN_PATH}`, {
        method: "POST",
        redirect: "manual",
        headers: FORM_HEADERS,
        body: signinBody(EMAIL, PASSWORD),
      });
      expect(res.status).toBe(303);
      // The Location's host is rewritten to the REQUEST's host so the
      // visitor stays on the site's own address. The harness asserts the
      // hostname rather than host: workerd's ingress reconstructs the
      // request URL with its own port appended, and the rewrite preserves
      // exactly what it saw — host-preserving is the behavior under test.
      const rewritten = new URL(res.headers.get("location") ?? "");
      expect(rewritten.hostname).toBe("edge.test");
      expect(rewritten.pathname).toBe("/after-signin");
      // The full script's Set-Cookie passes through.
      expect(res.headers.get("set-cookie")).toContain("decko_ts_session=fullscript-token");
      // The read edge did no DB work answering this (it forwarded).
      expect(res.headers.get("server-timing") ?? "").toContain("stmt=0");
      expect(upstreamSessions.length).toBe(1);
    } finally {
      await mf.dispose();
      upstream.close();
      upstream.closeAllConnections();
    }
  });
});
