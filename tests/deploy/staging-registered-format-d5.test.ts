// The REGISTERED-FORMAT arm on the staging host (row D5).
//
// Ruby carries every format the way it carries rss and json: as the
// route's (.:format) suffix. engine_routes.rb:22
// `get "/:mark(.:format)" => "card#read"` makes `/Style.css` a read of
// Style in the css format, and the pinned registry
// (card-1.110.0/lib/card/format/registration.rb:6-9) makes css its own
// format with its own mime type (text/css,
// card-mod-format-0.20.0/lib/card/format/css_format.rb:7-9).
//
// Before this arm the staging host STRIPPED the suffix (stripFormat) and
// rendered the card's html page, so `/Welcome.css` was the card named
// "Welcome.css" and answered 404.
//
// Driven through the BOOTED staging server, over real HTTP.

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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-registered-format-d5.sqlite3");

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
  child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
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
    throw new Error(`staging server did not become ready on port ${port}\n--- server output ---\n${output}`);
  }
  return { baseUrl, child, output };
}

let booted: BootedServer | null = null;

describe("the registered-format arm on the staging host (D5)", () => {
  beforeAll(async () => {
    makeSeededDeck(DB_PATH);
    booted = await bootStagingServer(DB_PATH);
  }, 240_000);

  afterAll(async () => {
    if (booted !== null && booted.child.exitCode === null) {
      booted.child.kill();
      await delay(300);
    }
    booted = null;
    rmSync(DB_PATH, { force: true });
  });

  it("GET /Welcome.css answers the card in the css format, not the card's html page", async () => {
    const response = await fetch(`${booted!.baseUrl}/Welcome.css`);
    expect(response.status).toBe(200);
    // The css format's own mime type (css_format.rb:7-9).
    expect(response.headers.get("content-type")).toContain("text/css");
    const body = await response.text();
    // The css format's own show default (set/all/css.rb:8-11
    // `view ||= :content`) is the card's CORE content.
    expect(body).toContain("Welcome body prose");
    // and emphatically NOT the page this host answered before the arm
    expect(body).not.toContain("<html");
  }, 30_000);

  it("the other armed names answer their own format and their own mime type", async () => {
    const cases: Array<[string, string]> = [
      ["/Welcome.js", "text/javascript"],
      ["/Welcome.txt", "text/plain"],
      ["/Welcome.xml", "text/xml"],
    ];
    for (const [path, mimeType] of cases) {
      const response = await fetch(`${booted!.baseUrl}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain(mimeType);
    }
  }, 30_000);

  it("the csv format RAISES on this card, and the raise is Ruby's own", async () => {
    // The csv format's :titled view renders the card's ITEMS as CSV rows,
    // and a card whose items are not all known cards raises: the card's
    // content is prose here, so its items are virtual (unknown) cards whose
    // :row nest renders "" and CSV.generate_line("") raises NoMethodError
    // (the port's own family module records the same raise:
    // src/card/render/format-families.ts, "CSV :titled raises NoMethodError
    // ... for any card whose items are not all known cards"). Ruby's
    // answer is the raise, so the port's 500 is the parity answer, not a
    // port defect.
    const response = await fetch(`${booted!.baseUrl}/Welcome.csv`);
    expect(response.status).toBe(500);
  }, 30_000);

  it("the plain read of the same card is untouched - still html", async () => {
    const response = await fetch(`${booted!.baseUrl}/Welcome`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Welcome body prose");
  }, 30_000);

  it("the NAMED REMAINDERS keep their suffix in the card's name", async () => {
    // yaml and yml need Ruby's `to_yaml` (the port has no YAML
    // serializer) and jsonld needs the jsonld support. Neither is split
    // off the URL, so the card "Welcome.yaml" does not exist and the
    // request is a 404 - the named remainder, measured.
    for (const path of ["/Welcome.yaml", "/Welcome.yml", "/Welcome.jsonld"]) {
      const response = await fetch(`${booted!.baseUrl}${path}`);
      expect(response.status, path).toBe(404);
    }
  }, 30_000);

  it("an UNREGISTERED suffix is not the registered arm - it is D4's file sender", async () => {
    // The pinned deck folds an unregistered suffix to the FILE sender
    // (response.rb:102-105); the port's file-sender arm is row D4's own
    // work, so the suffix stays in the card's name here and the card
    // "Welcome.bin" does not exist.
    const response = await fetch(`${booted!.baseUrl}/Welcome.bin`);
    expect(response.status).toBe(404);
  }, 30_000);
});
