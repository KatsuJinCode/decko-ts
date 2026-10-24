// The bad_address wildcard (register-routes A22 + C15) through the BOOTED
// staging server: the multi-segment no-route arm rendered the router's bare
// stub ("No route for <path>") before the port; Ruby (engine_routes.rb:54)
// renders the page — the bad_address view for a KNOWN card at the address,
// page_view_for_unknown's :not_found arm for an anonymous viewer over an
// unknown card (card/view/permission.rb:33-44 alter_unknown -> format/
// error.rb:17-22). The fixture deck carries a junction card
// ("deep+such+card"), so BOTH halves are pinned here: the unknown-card arm
// answers 404 with the not_found chrome page, never the bare stub, and the
// known-card arm renders the bad_address view.

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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-bad-address-wildcard-endpoint.sqlite3");

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
    // The junction a wildcard address names: "deep" + "such" -> "deep+such",
    // then "deep+such" + "card" -> "deep+such+card". A junction card name
    // comes from its sides, so its name column is empty and the KEY carries
    // the composed name; the boot composes it into the lexicon.
    insert.run(9006, "deep", "deep", null, null, null, 5, null);
    insert.run(9007, "such", "such", null, null, null, 5, null);
    insert.run(9008, "card", "card", null, null, null, 5, null);
    insert.run(9009, null, "deep+such", null, 9006, 9007, 5, null);
    insert.run(9010, null, "deep+such+card", null, 9009, 9008, 5, null);
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

describe("the bad_address wildcard (A22/C15) through the booted staging server", () => {
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

  it("a deep unmatched path answers 404 with the page chrome, not the bare stub", async () => {
    const response = await fetch(`${booted!.baseUrl}/no/such/path`);
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("No route for");
    expect(body).toContain("<!DOCTYPE");
    // the wildcard card's own name rides the page title (the render reached
    // the page assembly at the junction name)
    expect(body).toContain("no+such+path");
  }, 30_000);

  it("a malformed-% path never reaches the wildcard page (this host answers the 400 bad-request shape)", async () => {
    const response = await fetch(`${booted!.baseUrl}/bad%zz`);
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).not.toContain("no+such+path");
  }, 30_000);

  it("a KNOWN junction card at a wildcard address renders the bad_address view", async () => {
    // The KNOWN-card half of the wildcard class: the seeded deck carries
    // the junction "deep+such+card", so /deep/such/card names a card that
    // EXISTS, and the route's view requirement applies to it - the
    // bad_address view, whose body writes root.error_status = 404 and
    // returns the pinned locale text ("404: Bad Address",
    // card-mod-format-0.20.0/config/locales/en.yml:3).
    const response = await fetch(`${booted!.baseUrl}/deep/such/card`);
    const body = await response.text();
    expect(body).toContain("404: Bad Address");
    expect(body).toContain("deep+such+card");
    expect(body).not.toContain("Could not find");
    // THE STATUS, NAMED: this host carries the page's OWN error status only
    // on a STOCK deck (vm-staging-server.mjs, the render's status branch:
    // STOCK_DECK ? renderPageWithStatus(...) : { html: renderPageBytes(...),
    // status: 200 }), and the fixture deck is not the stock deck, so the
    // answer here is 200 where the pinned deck answers 404. The port's
    // engine does carry the status (the row's own test measures
    // pageErrorStatus = 404 for the same card), and the edge host carries
    // it too (the deploy wildcard suite pins the 404 there), so the
    // difference is this host's status posture on a non-stock deck, not the
    // wildcard arm's answer.
    expect(response.status).toBe(200);
  }, 30_000);
});
