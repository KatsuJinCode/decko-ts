// The GET action routes' read and asset halves (register-routes A17)
// through the BOOTED staging server: /read/<mark>, /card/read/<mark> and
// the markless /read, /card/read render card#read (show(nil) — the home
// mark for the markless shapes, per implicit_mark), and every /asset
// spelling answers card#asset's fixed installation-error 404
// (rest.rb:22-27). Before the port the staging :mark/:view arm parsed
// /read/<mark> as the card "read" in view <mark>.
//
// The create/delete halves are the recorded hardening divergence (the C16
// posture): the final leg pins that a plain GET /create/<new> mints no
// card row and GET /delete/<mark> trashes nothing.

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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-action-read-asset-endpoint.sqlite3");

const ASSET_STUB_BODY = "Decko installation error: missing public directory symlinks";

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

async function titleOf(path: string): Promise<{ status: number; title: string; body: string }> {
  const response = await fetch(`${booted!.baseUrl}${path}`);
  const body = await response.text();
  const match = /<title>([\s\S]*?)<\/title>/.exec(body);
  return { status: response.status, title: match?.[1] ?? "", body };
}

describe("the GET action routes' read and asset halves (A17) through the booted staging server", () => {
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

  it("/read/<mark> and /card/read/<mark> render that card; /read and /card/read render the home mark", async () => {
    expect((await titleOf("/read/Welcome")).title).toContain("Welcome");
    expect((await titleOf("/card/read/Welcome")).title).toContain("Welcome");
    expect((await titleOf("/read")).title).toContain("Welcome");
    expect((await titleOf("/card/read")).title).toContain("Welcome");
  }, 30_000);

  it("every /asset spelling answers card#asset's fixed installation-error 404", async () => {
    for (const path of ["/asset", "/asset/Welcome", "/card/asset", "/card/asset/Welcome"]) {
      const response = await fetch(`${booted!.baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe(ASSET_STUB_BODY);
    }
  }, 30_000);

  it("the READ-path *previous mark 302s to the visitor's last location (B8)", async () => {
    // A page read of a KNOWN card pushes the request URL onto the visitor's
    // location history (the decko_visit cookie the response sets); the
    // *previous mark then resolves that entry (mark.rb:12-14).
    // the history push gates on an HTML Accept (save_location?'s html leg)
    const first = await fetch(`${booted!.baseUrl}/Welcome`, { headers: { accept: "text/html" } });
    expect(first.status).toBe(200);
    const setCookies = first.headers.getSetCookie();
    const visitPair = setCookies
      .map((cookie) => cookie.split(";")[0]!)
      .find((pair) => pair.trim().startsWith("decko_visit="));
    expect(visitPair, "the page read sets the decko_visit cookie").toBeDefined();

    const res = await fetch(`${booted!.baseUrl}/*previous`, {
      headers: { cookie: visitPair! },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/Welcome");
  }, 30_000);

  it("the create/delete halves stay unadmitted: plain GETs mint and trash nothing", async () => {
    const createRes = await fetch(`${booted!.baseUrl}/create/Minted17`);
    expect(createRes.status).not.toBe(303);
    const deleteRes = await fetch(`${booted!.baseUrl}/delete/Welcome`);
    expect(deleteRes.status).not.toBe(303);

    const db = new Database(DB_PATH, { readonly: true });
    try {
      const minted = db.prepare("SELECT id FROM cards WHERE name = 'Minted17' AND trash = 0").all();
      expect(minted.length).toBe(0);
      const welcome = db.prepare("SELECT trash FROM cards WHERE name = 'Welcome'").get() as { trash: number };
      expect(welcome.trash).toBe(0);
    } finally {
      db.close();
    }
  }, 30_000);
});
