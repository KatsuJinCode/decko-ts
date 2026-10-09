// Endpoint tests for the staging server's first-run /setup surface —
// THROUGH the booted server (vm-staging-server.mjs), not the module
// directly. The module suite (first-run-setup.test.ts) pins the census and
// the owner-create logic; THIS file pins the ROUTING: a first-run POST must
// actually reach the first-run module, and the write branch must not
// preempt it as a card-mark write. The module-only suite was blind to
// exactly that gap: with the write branch answering first, a fresh-deploy
// POST /setup died as `actor *anonymous may not create card setup` (403)
// while every module test stayed green.
//
// Ruby oracle: decko has no /setup route — the setup journey rides the
// ordinary write through mark interpretation
// (decko-0.20.0 lib/card_controller/mark.rb:28-33 `implicit_mark`:
// `when initial_setup? ... prepare_setup_card!`, :56-63). The port's
// equivalent is routing-order: under first-run conditions the write branch
// YIELDS /setup to the first-run surface, whose census
// (card-1.110.0 lib/card/auth/setup.rb:33-52 needs_setup?) is the security
// boundary — an existing deck never becomes setuptable.
//
// Fresh-deck fixture: db/schema.sqlite.sql applied to an empty sqlite file
// (0 card rows). With DECKO_FIRST_RUN=1 + DECKO_WRITE_PATH=1 the server's
// boot-seed wire seeds the deck at boot (Ruby card:setup = db:setup —
// mod/core/lib/tasks/card.rake:4-6, db/seeds.rb:3), which is what makes the
// census computable and the one-click deployment path real: schema -> seed
// -> GET the form -> POST the owner -> sign in.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "./staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const SCHEMA_SQL = path.join(REPO_ROOT, "db", "schema.sqlite.sql");

const FIRST_RUN_DB = path.join(REPO_ROOT, "tmp", "first-run-setup-endpoint-fresh.sqlite3");
const FLAG_OFF_DB = path.join(REPO_ROOT, "tmp", "first-run-setup-endpoint-flag-off.sqlite3");

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "Abcdef1!";

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

/** A FRESH deck: schema only, zero card rows — the boot-seed wire seeds it
 *  at boot when the first-run profile is armed. */
function makeFreshDeck(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  try {
    db.exec(readFileSync(SCHEMA_SQL, "utf8"));
  } finally {
    db.close();
  }
}

async function bootStagingServer(
  dbPath: string,
  env: Record<string, string | undefined>,
): Promise<BootedServer> {
  await ensureStagingServerDist();
  const port = await reserveEphemeralPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY, dbPath, String(port)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
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

async function stopStagingServer(booted: BootedServer | null): Promise<void> {
  if (booted === null) return;
  // The server process is this test's own child (fully owned).
  if (booted.child.exitCode === null) {
    booted.child.kill();
    await delay(300);
  }
}

let firstRun: BootedServer | null = null;
let flagOff: BootedServer | null = null;

describe("first-run /setup through the booted staging server (fresh-deck one-click path)", () => {
  beforeAll(async () => {
    makeFreshDeck(FIRST_RUN_DB);
    firstRun = await bootStagingServer(FIRST_RUN_DB, {
      DECKO_FIRST_RUN: "1",
      DECKO_WRITE_PATH: "1",
    });
  }, 120_000);

  afterAll(async () => {
    await stopStagingServer(firstRun);
    firstRun = null;
    // Disposable fixture only — the schema source and repo stay untouched.
    rmSync(FIRST_RUN_DB, { force: true });
  });

  it("boot-seeded the fresh deck and GET /setup serves the owner form (census open)", async () => {
    expect(firstRun?.output).toContain("[boot-seed] fresh deck seeded:");
    const response = await fetch(`${firstRun?.baseUrl}/setup`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('name="email"');
    expect(body).toContain('name="password"');
  }, 30_000);

  it("POST /setup creates the owner and answers 303 to sign-in — and the owner can then sign in", async () => {
    const post = await fetch(`${firstRun?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
      redirect: "manual",
    });
    // RED at base: the write branch answered 403
    // (`actor *anonymous may not create card setup`) before this request
    // could reach the first-run surface.
    console.log('PROBE-SETUP:', post.status, (await post.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 260));
    expect(post.status).toBe(303);
    expect(post.headers.get("location")).toBe(`${firstRun?.baseUrl}/_signin`);

    // The journey's end state is real THROUGH THE SERVER: the just-created
    // owner signs in on the slice-1 surface.
    const signin = await fetch(`${firstRun?.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
    });
    expect(signin.status).toBe(200);
    const signinBody = (await signin.json()) as { ok?: boolean };
    expect(signinBody.ok).toBe(true);
    expect(signin.headers.get("set-cookie")).toContain("decko_ts_session=");
  }, 30_000);

  it("once the deck has an owner the window is closed for good: GET and POST both 404 (never setuptable again)", async () => {
    const get = await fetch(`${firstRun?.baseUrl}/setup`);
    expect(get.status).toBe(404);
    const secondPost = await fetch(`${firstRun?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "second@example.com", password: "Abcdef2!" }).toString(),
      redirect: "manual",
    });
    expect(secondPost.status).toBe(404);
  }, 30_000);
});

describe("first-run surface absent with the env gate off (pre-existing posture preserved)", () => {
  beforeAll(async () => {
    makeFreshDeck(FLAG_OFF_DB);
    // No DECKO_FIRST_RUN, no DECKO_WRITE_PATH — the historical default boot.
    flagOff = await bootStagingServer(FLAG_OFF_DB, {
      DECKO_FIRST_RUN: undefined,
      DECKO_WRITE_PATH: undefined,
    });
  }, 120_000);

  it("GET /setup does not serve the setup form and POST /setup keeps the write-off 405", async () => {
    const get = await fetch(`${flagOff?.baseUrl}/setup`);
    const body = await get.text();
    expect(body).not.toContain('name="email"');
    const post = await fetch(`${flagOff?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
      redirect: "manual",
    });
    expect(post.status).toBe(405);
  }, 30_000);

  afterAll(async () => {
    await stopStagingServer(flagOff);
    flagOff = null;
  });
});
