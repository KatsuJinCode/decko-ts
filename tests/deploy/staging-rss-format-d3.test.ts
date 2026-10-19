// The rss format on the staging host (register-routes D3).
//
// Ruby carries rss the way it carries every other format: as the route's
// (.:format) suffix. engine_routes.rb:22 `get "/:mark(.:format)" => "card#read"`
// makes `/Alpha.rss` a read of Alpha in the rss format, and
// response.rb:111-113 `requested_format` reaches the same branch through
// params[:format]:
//
//     def requested_format
//       params[:format].present? ? params[:format].to_s : request.format
//     end
//
// so `?format=rss` is the same request by a different door.
//
// `rss` is REGISTERED (mod/format/lib/card/format/rss_format.rb:7
// `register :rss`), so `format_name_from_params` (response.rb:102-105)
// KEEPS it as :rss — `explicit_file_format?` is false because
// `Card::Format.registered.member?("rss")` is true. That is what makes this
// row the counter-example to D4, where an UNREGISTERED suffix folds to
// :file and send_file answers.
//
// The bytes are rss.rb:10-19's `show`: `view ||= :feed`, then
// `return "RSS feeds disabled" unless Cardio.config.rss_enabled`, which
// defaults FALSE (lib/card/mod/format.rb:4). So the stock answer to a feed
// request is that sentence at 200 — and NOT the card's HTML page, which is
// what this host answered before the row (the `.rss` suffix was stripped by
// stripFormat and the card rendered as html).
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
const DB_PATH = path.join(REPO_ROOT, "tmp", "staging-rss-format-d3.sqlite3");

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

describe("the rss format on the staging host (D3)", () => {
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

  it("GET /Welcome.rss answers the rss feed, not the card's html page", async () => {
    const response = await fetch(`${booted!.baseUrl}/Welcome.rss`);
    expect(response.status).toBe(200);
    // the feed's own content type (response.rb:17 render_response uses
    // format.mime_type; RssFormat inherits HtmlFormat's text/html only
    // where nothing overrides it — the host's registered rss content type
    // is application/rss+xml)
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    const body = await response.text();
    // rss.rb:17-19 with the stock rss_enabled default FALSE
    expect(body).toBe("RSS feeds disabled");
    // and emphatically NOT the page this host answered before the row
    expect(body).not.toContain("<html");
    expect(body).not.toContain("Welcome body prose");
  }, 30_000);

  it("GET /Welcome?format=rss is the SAME request through params[:format]", async () => {
    // response.rb:111-113 — params[:format] present wins over request.format
    const suffix = await fetch(`${booted!.baseUrl}/Welcome.rss`);
    const query = await fetch(`${booted!.baseUrl}/Welcome?format=rss`);
    expect(query.status).toBe(200);
    expect(query.headers.get("content-type")).toContain("application/rss+xml");
    expect(await query.text()).toBe(await suffix.text());
  }, 30_000);

  it("the plain read of the same card is untouched — still html", async () => {
    const response = await fetch(`${booted!.baseUrl}/Welcome`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Welcome body prose");
  }, 30_000);

  it("an rss request for a card that does not exist is NotFound (404), not a feed", async () => {
    const response = await fetch(`${booted!.baseUrl}/No_Such_Card.rss`);
    expect(response.status).toBe(404);
  }, 30_000);

  it("a DEEP path is engine_routes.rb:54's wildcard, not rss — with either door", async () => {
    // rss rides a MARK or a MARK+VIEW; anything deeper is the wildcard
    // view (bad_address) whatever its last segment or query says. The edge
    // gets there structurally (parsePath returns a `kind`, the rss wrapper
    // hands it straight back); this host gates on the segment count.
    for (const url of ["/one/two/three.rss", "/one/two/three?format=rss"]) {
      const response = await fetch(`${booted!.baseUrl}${url}`);
      expect(response.status, url).toBe(404);
      expect(await response.text(), url).not.toBe("RSS feeds disabled");
    }
  }, 30_000);
});