// The type/:type route (register-routes A7) through the BOOTED staging
// server. Ruby (engine_routes.rb:23 `get "type/:type" => "card#read"`)
// renders the HOME MARK's page — load_mark's implicit_mark lands on
// home_mark (mark.rb:28-40 -> mark.rb:42-44); the :type segment only feeds
// uri_fetch_opts' new-card fallback. Before this port the staging
// :mark/:view arm parsed /type/<x> as the card "type" in view <x> (422).
//
// The fixture is the home-mark endpoint suite's deck (schema + seed + the
// layout chrome + *home -> Welcome): GET /type/Style must render Welcome,
// and bare /type (one segment, engine_routes.rb:19) stays the standard
// card arm — the card "type" does not exist here, so its page must NOT be
// Welcome's.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const SCHEMA_SQL = path.join(REPO_ROOT, "db", "schema.sqlite.sql");
const SEED_SQL = path.join(REPO_ROOT, "deploy", "seed", "seed.sql");
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-type-route-endpoint.sqlite3");

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
    const insert = db.prepare(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES
         (?, ?, ?, ?, ?, ?, NULL, '2026-10-19 10:00:00.000', '2026-10-19 10:00:00.000', 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    );
    // The layout chrome the page render resolves (see
    // staging-home-mark-endpoint.test.ts for the row-by-row rationale).
    insert.run(9000, "Html", "html", "html", null, null, 3, null);
    insert.run(9001, "*layout", "*layout", "layout", null, null, 8, null);
    insert.run(9002, null, "*all+*layout", null, 25, 9001, 8, "Default Layout");
    insert.run(9003, "Default Layout", "default_layout", null, null, null, 9000, "<body><article>{{_main|titled}}</article></body>");
    insert.run(9004, "Welcome", "welcome", null, null, null, 5, "Welcome body prose");
    insert.run(9005, "*home", "*home", "home", null, null, 8, "Welcome");
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
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/_status`);
      ready = response.status === 200;
    } catch {
      await delay(250);
    }
  }
  if (!ready) {
    throw new Error(`staging server did not become ready on port ${port}\n--- server output ---\n${output}`);
  }
  return { baseUrl, child, output };
}

let booted: BootedServer | null = null;

describe("type/:type route (A7) through the booted staging server", () => {
  beforeAll(async () => {
    makeSeededDeck(DB_PATH);
    booted = await bootStagingServer(DB_PATH);
  }, 120_000);

  afterAll(async () => {
    if (booted !== null && booted.child.exitCode === null) {
      booted.child.kill();
      await delay(300);
    }
    booted = null;
    rmSync(DB_PATH, { force: true });
  });

  it("GET /type/<x> renders the HOME MARK's page (the *home rule's card), not the 422 shape", async () => {
    const response = await fetch(`${booted!.baseUrl}/type/Style`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("<title>Welcome");
    expect(body).toContain("Welcome body prose");
  }, 30_000);

  it("bare /type stays the standard /:mark card arm (the card \"type\" is missing here)", async () => {
    const response = await fetch(`${booted!.baseUrl}/type`);
    const body = await response.text();
    expect(body).not.toContain("Welcome body prose");
  }, 30_000);
});
