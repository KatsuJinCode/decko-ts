// POST /_signin, POST /_signout and the GET /_signin form, the staging
// session surface ([Family] row E5), measured against the PINNED deck's
// own route table and the BOOTED staging server.
//
// The register's E5 row grades the port's staging session surface, and the
// register's own basis is that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis: the pinned side
// comes from the capture's fixture, and the port side is driven over real
// HTTP against the booted staging server.
//
// fixtures/captured/port-only-routes-ruby-oracle.json is what
// tests/server/oracle-capture-port-only-routes-ruby.rb recorded: the
// PINNED deck's own route table, EXECUTED, reduced for this row's probe
// paths.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   IN THE PINNED DECK, BOTH PATHS ARE CARD SURFACES. A POST to either
//   /_signin or /_signout is the bare ":mark(.:format)" arm, whose action
//   is card#create, so the pinned deck's answer to a POST at those paths
//   is a CREATE of a card named "signin" or "signout". A GET is the mark
//   arm, whose action is card#read. The pinned deck has no session
//   surface at either path.
//
//   THE PORT'S STAGING SURFACE IS THE PORT'S OWN: a form page that posts
//   to /_signin, a sign-in that answers the account ladder's own failure
//   (401 with the ladder's message), and a sign-out that is IDEMPOTENT
//   (an absent session answers revoked: false), which is Ruby's own
//   sign-out shape (signing out Anonymous is a no-op success).

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";
import { readFileSync as readFixture } from "node:fs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const SCHEMA_SQL = path.join(REPO_ROOT, "db", "schema.sqlite.sql");
const SEED_SQL = path.join(REPO_ROOT, "deploy", "seed", "seed.sql");
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-port-only-signin-routes.sqlite3");

const ORACLE = JSON.parse(
  readFixture(path.join(REPO_ROOT, "fixtures", "captured", "port-only-routes-ruby-oracle.json"), "utf8"),
) as {
  reductions: Record<
    string,
    Array<{
      path: string;
      candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
      firstRouteAdmittingGet: number | null;
      firstRouteAdmittingPost: number | null;
    }>
  >;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BootedServer {
  baseUrl: string;
  child: ChildProcess;
  output: string;
}

async function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close();
        reject(new Error("unexpected ephemeral address"));
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function makeSeededDeck(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  try {
    db.exec(readFileSync(SCHEMA_SQL, "utf8"));
    db.exec(readFileSync(SEED_SQL, "utf8"));
    // The layout chrome the page render resolves (*all+*layout -> Default
    // Layout with a body): the seed deck carries none, and without it any
    // page render 500s regardless of this port. The rows mirror the
    // staging suites' own shell seeds.
    const insert = db.prepare(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES
         (?, ?, ?, ?, ?, ?, NULL, '2026-10-22 00:00:00.000', '2026-10-22 00:00:00.000', 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    );
    insert.run(9000, "Html", "html", "html", null, null, 3, null);
    insert.run(9001, "*layout", "*layout", "layout", null, null, 8, null);
    insert.run(9002, null, "*all+*layout", null, 25, 9001, 8, "Default Layout");
    insert.run(9003, "Default Layout", "default_layout", null, null, null, 9000, "<body><article>{{_main|titled}}</article></body>");
  } finally {
    db.close();
  }
}

async function bootStagingServer(dbPath: string): Promise<BootedServer> {
  await ensureStagingServerDist();
  const port = await reserveEphemeralPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY, dbPath, String(port)], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  let ready = false;
  for (let attempt = 0; attempt < 160 && !ready; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/_status`);
      ready = response.status === 200;
    } catch {
      await delay(250);
    }
  }
  if (!ready) {
    throw new Error(
      `staging server did not become ready on port ${port}\n--- server output ---\n${output}`,
    );
  }
  return { baseUrl, child, output };
}

let booted: BootedServer | null = null;

describe("the port-only staging session surface (E5), against the pinned deck's own table", () => {
  it("a POST to /_signin or /_signout is a CARD CREATE in the pinned deck", () => {
    for (const row of ORACLE.reductions["E5"]) {
      expect(row.firstRouteAdmittingPost, row.path).toBe(16);
      const create = row.candidates.find((entry) => entry.order === 16);
      expect(create?.action, row.path).toBe("card#create");
      // And a GET at the same path is a card read.
      expect(row.firstRouteAdmittingGet, row.path).toBe(2);
    }
  });

  it("the port's own staging source carries the three session arms", () => {
    const hosts = ORACLE.portSurface["E5"].map((entry) => entry.host);
    expect(hosts).toContain("the staging server's POST arms");
    expect(hosts).toContain("the staging server's GET form arm");
    expect(hosts).toContain("the staging server's signin handler");
  });
});

describe("the port's own staging session surface (E5), over real HTTP", () => {
  beforeAll(async () => {
    makeSeededDeck(DB_PATH);
    booted = await bootStagingServer(DB_PATH);
  }, 180_000);

  afterAll(async () => {
    if (booted !== null && booted.child.exitCode === null) {
      booted.child.kill();
      await delay(300);
    }
    booted = null;
    rmSync(DB_PATH, { force: true });
  });

  it("GET /_signin serves the form page, and the form posts to /_signin", async () => {
    const response = await fetch(`${booted!.baseUrl}/_signin`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('action="/_signin"');
    expect(body).toContain('name="identifier"');
    expect(body).toContain('name="password"');
  });

  it("POST /_signin with no account answers the ladder's own failure", async () => {
    const response = await fetch(`${booted!.baseUrl}/_signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "nobody@example.test", password: "wrong" }),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect(typeof body["error"]).toBe("string");
  });

  it("POST /_signout with no session is IDEMPOTENT, and clears the cookie", async () => {
    const response = await fetch(`${booted!.baseUrl}/_signout`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["revoked"]).toBe(false);
    expect(response.headers.get("set-cookie")).toContain("decko_ts_session=");
  });
});
