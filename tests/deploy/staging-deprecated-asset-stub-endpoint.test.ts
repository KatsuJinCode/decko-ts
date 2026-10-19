// The DEPRECATED asset routes (register-routes A4 + B5) through the BOOTED
// staging server — the routing-level pin, not the module shape: before the
// port, staging's :mark/:view arm parsed /assets/<mark> as the card
// "assets" in view <mark> (a 422), and there was no assets/javascripts/
// jasmine arm at all.
//
// Ruby truth (decko-0.20.0): config/engine_routes.rb:14-16
// `%w[assets javascripts jasmine].each { |prefix| get "#{prefix}/*mark" =>
// "card#asset" }`; lib/card_controller/rest.rb:22-27 answers
//   body = "Decko installation error: missing public directory symlinks"
//   render body: body, status: 404
// — with `except: [:asset]` on the setup/authenticate before_actions
// (card_controller.rb:21-22), so the answer needs no deck state; the bare
// schema-only fixture below is the point, not a shortcut. The glob needs a
// segment after the prefix: /assets alone stays the standard /:mark arm.

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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-deprecated-asset-stub-endpoint.sqlite3");

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

function makeBareDeck(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  try {
    db.exec(readFileSync(SCHEMA_SQL, "utf8"));
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

describe("deprecated asset routes (A4/B5) through the booted staging server", () => {
  beforeAll(async () => {
    makeBareDeck(DB_PATH);
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

  it("answers assets/*mark, javascripts/*mark and jasmine/*mark with card#asset's fixed 404", async () => {
    for (const path of ["/assets/whatever", "/assets/deep/glob/path", "/javascripts/decko.js", "/jasmine/suite"]) {
      const response = await fetch(`${booted!.baseUrl}${path}`);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe(ASSET_STUB_BODY);
      expect(response.headers.get("Content-Type"), path).toBe("text/html; charset=utf-8");
    }
  }, 30_000);

  it("keeps /assets alone off the stub — the single segment stays the standard /:mark arm", async () => {
    const bare = await fetch(`${booted!.baseUrl}/assets`);
    const bareBody = await bare.text();
    expect(bareBody).not.toContain(ASSET_STUB_BODY);
  }, 30_000);
});
