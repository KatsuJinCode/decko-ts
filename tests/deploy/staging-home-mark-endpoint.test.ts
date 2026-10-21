// The BARE ROOT arm's home mark (register-routes B9 + C6) through the BOOTED
// staging server — before the port the "/" arm rendered the hardcoded
// HOME_CARD_NAME; Ruby (mark.rb:42-44) resolves
// `Card::Rule.global_setting(:home) || "Home"` per request, whitespace-only
// content falling back (rule.rb:5-9). The fixture boots the schema + seed
// deck (the stock *home content is "Home"), then rewrites the rule's
// content to "Hello World" — the home page must become the Hello World
// card's page (its <title>), and after a whitespace rewrite, Home's again.

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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-home-mark-endpoint.sqlite3");

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

function makeSeededDeck(dbPath: string, homeContent: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  try {
    db.exec(readFileSync(SCHEMA_SQL, "utf8"));
    db.exec(readFileSync(SEED_SQL, "utf8"));
    // The layout chrome the page render resolves (*all+*layout -> Default
    // Layout with a body) — the seed deck carries none, and without it any
    // page render 500s regardless of this port. The rows mirror the edge
    // harness's shell seeds (tests/deploy/bunny-edge-engine-request-error-
    // mapping.test.ts seedShellHeadDeck) at the seed deck's own ids.
    const insert = db.prepare(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id,
          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES
         (?, ?, ?, ?, ?, ?, NULL, '2026-10-19 10:00:00.000', '2026-10-19 10:00:00.000', 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    );
    const junctionKey = (left: string, right: string) => `${left.toLowerCase().replace(/[^a-z0-9]+/g, "_")}+${right.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    // The layout card's TYPE must carry codename html|basic|layout_type for
    // the card-layout classification (page.ts Layout.card_layout? — the
    // typeCode check); the seed deck has no Html cardtype, so one is seeded.
    insert.run(9000, "Html", "html", "html", null, null, 3, null);
    insert.run(9001, "*layout", "*layout", "layout", null, null, 8, null);
    insert.run(9002, null, "*all+*layout", null, 25, 9001, 8, "Default Layout");
    insert.run(9003, "Default Layout", "default_layout", null, null, null, 9000, "<body><article>{{_main|titled}}</article></body>");
    insert.run(9004, "Welcome", "welcome", null, null, null, 5, "Welcome body prose");
    insert.run(9005, "*home", "*home", "home", null, null, 8, homeContent);
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
let whitespaceBooted: BootedServer | null = null;

function homeTitle(): Promise<string> {
  return (async () => {
    const response = await fetch(`${booted!.baseUrl}/`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const match = /<title>([\s\S]*?)<\/title>/.exec(body);
    return match?.[1] ?? "";
  })();
}

describe("staging bare root arm — home mark from the *home rule (B9/C6)", () => {
  beforeAll(async () => {
    makeSeededDeck(DB_PATH, "Welcome");
    booted = await bootStagingServer(DB_PATH);
  }, 120_000);

  afterAll(async () => {
    for (const server of [booted, whitespaceBooted]) {
      if (server !== null && server.child.exitCode === null) {
        server.child.kill();
        await delay(300);
      }
    }
    booted = null;
    whitespaceBooted = null;
    rmSync(DB_PATH, { force: true });
    rmSync(DB_PATH.replace(".sqlite3", "-whitespace.sqlite3"), { force: true });
  });

  it("GET / follows the edited *home rule to the Welcome card", async () => {
    const title = await homeTitle();
    expect(title).toContain("Welcome");
    expect(title).not.toContain("Home");
  }, 30_000);

  it("a whitespace-only rule content falls back to the Home card", async () => {
    // A separate boot: the staging engine's fetcher caches deck state and
    // invalidates on committed writes through the port's own write path —
    // an out-of-band sqlite UPDATE moves nothing (the freshness stamp).
    const whitespacePath = DB_PATH.replace(".sqlite3", "-whitespace.sqlite3");
    makeSeededDeck(whitespacePath, "   ");
    whitespaceBooted = await bootStagingServer(whitespacePath);
    const response = await fetch(`${whitespaceBooted.baseUrl}/`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const match = /<title>([\s\S]*?)<\/title>/.exec(body);
    const title = match?.[1] ?? "";
    expect(title).toContain("Home");
    expect(title).not.toContain("Welcome");
  }, 60_000);

  it("the ?mark= query wins over the rule (Card.uri_fetch's params[:mark] first)", async () => {
    // mark.rb:10-20 - interpret_mark reads params[:mark] FIRST: a mark in
    // the query is an EXPLICIT mark, and only a request with NO mark
    // reaches implicit_mark's home fallback. The deck's rule says
    // "Welcome", so a ?mark=Home must answer the Home card and not the
    // rule-named one.
    const response = await fetch(`${booted!.baseUrl}/?mark=Home`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const match = /<title>([\s\S]*?)<\/title>/.exec(body);
    const title = match?.[1] ?? "";
    expect(title.startsWith("Home")).toBe(true);
    expect(title.startsWith("Welcome")).toBe(false);
  }, 30_000);

  it("NAMED DIVERGENCE: an empty ?mark= answers the Home card, not an empty mark", async () => {
    // The pinned capture (fixtures/captured/implicit-mark-ruby-oracle.json,
    // the explicitMarks section) records the pinned interpret_mark("") as
    // answering "" - an EXPLICIT empty mark (mark.rb:17-18), which Ruby's
    // uri_fetch then fetches as the empty name and 404s. The hosts treat
    // an empty ?mark= as no mark at all and answer the Home card. The
    // divergence is named here rather than invented into the port: both
    // hosts agree with each other, and the pinned answer is recorded
    // beside it.
    const response = await fetch(`${booted!.baseUrl}/?mark=`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const match = /<title>([\s\S]*?)<\/title>/.exec(body);
    const title = match?.[1] ?? "";
    expect(title.startsWith("Home")).toBe(true);
  }, 30_000);
});
