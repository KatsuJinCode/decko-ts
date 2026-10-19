// The `(.:format)` route arms of the booted staging server — GET `/<mark>.rss`,
// `/<mark>.csv`, and the `?format=` query form, through vm-staging-server.mjs
// rather than the module directly.
//
// Every expected byte here is MEASURED against the stock Ruby oracle deck
// (decko 0.20.0 / card 1.110.0, booted from reference-harness/browser/engines/
// ruby.json on this same synthetic-v1 fixture; the runs and their raw output
// are in tmp/ruby-reference-act172-act175.json and
// tmp/ruby-reference-missing-mark.json):
//
//   /Brief.rss                    200  text/html; charset=utf-8                   "RSS feeds disabled"
//   /Brief.csv                    200  text/comma-separated-values; charset=utf-8 "Name,Type\n"
//   /*search?format=rss&term=..    200  text/html; charset=utf-8                   "RSS feeds disabled"
//   /*search.rss?term=..          200  text/html; charset=utf-8                   "RSS feeds disabled"
//   /?format=rss                  200  text/html; charset=utf-8                   "RSS feeds disabled"
//   /Never_Existed_XYZ.rss        200  text/html; charset=utf-8                   ""
//   /Never_Existed_XYZ.csv        404  text/comma-separated-values; charset=utf-8 "Could not find Never Existed XYZ."
//
// The three facts that make this a real regression rather than a restatement
// of the module's own bytes:
//
//   1. `?format=rss` and `.rss` reach the SAME format. Rails merges query
//      parameters UNDER path_parameters (actionpack-7.2.4
//      http/parameters.rb:56-61) but path_parameters carries no `:format` key
//      when the route's optional `(.:format)` group is absent, so nothing
//      clobbers the query value. Before the fix this server ignored `format`
//      entirely and served the ordinary HTML results.
//   2. The RSS content type is text/html, NOT application/rss+xml.
//      `RssFormat < HtmlFormat` (mod/format/lib/card/format/rss_format.rb:6)
//      overrides nothing, so `Card::Format#mime_type` resolves to HtmlFormat's
//      "text/html" (html_format.rb:24-26) and card_controller/response.rb:17
//      renders with `format.mime_type`. The RSS MIME registration governs the
//      REQUEST side only (actionpack-7.2.4 http/mime_types.rb:40).
//   3. A mark that is not a card answers DIFFERENTLY per format: rss 200 with
//      NO bytes, csv 404 with the format's own not-found text. The old
//      behavior — folding the whole ".rss" into the card name — produced the
//      new-card page for a card literally called "Brief.rss".
//
// The deck is a DISPOSABLE COPY of the committed synthetic-v1 fixture; nothing
// outside tmp/ is written, and the fixture's actor credentials are never read
// here (this suite is anonymous).

import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const FIXTURE_DIR = path.join(REPO_ROOT, "reference-harness", "fixtures", "synthetic-v1");
const FIXTURE_DB = path.join(FIXTURE_DIR, "deck", "deck.sqlite3");
const MOD_PUBLIC_DIR = path.join(REPO_ROOT, "reference-harness", "oracle", "app", "public");

const WORK_DIR = path.join(REPO_ROOT, "tmp", "card-format-route-endpoint");
const FIXTURE_PATH = path.join(WORK_DIR, "deck.sqlite3");
const FILES_DIR = path.join(WORK_DIR, "files");

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let server: ChildProcess | null = null;
let serverOutput = "";
let baseUrl = "";

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

interface Answered {
  status: number;
  contentType: string | null;
  body: string;
}

async function ask(requestPath: string): Promise<Answered> {
  const response = await fetch(`${baseUrl}${requestPath}`, { redirect: "manual" });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

describe("staging server card format route ((.:format) mark and ?format= query)", () => {
  beforeAll(async () => {
    if (!existsSync(FIXTURE_DB)) {
      throw new Error(`fixture deck missing: ${FIXTURE_DB}`);
    }
    mkdirSync(WORK_DIR, { recursive: true });
    rmSync(FIXTURE_PATH, { force: true });
    copyFileSync(FIXTURE_DB, FIXTURE_PATH);
    mkdirSync(FILES_DIR, { recursive: true });
    cpSync(path.join(FIXTURE_DIR, "deck", "files"), FILES_DIR, { recursive: true });
    // The same port-only freshness stamp ts-server.mjs puts on a fixture copy
    // before booting (the committed fixture predates the stamp; the render
    // path fails loudly by design without it).
    {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(FIXTURE_PATH);
      db.exec(
        `CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0);
         INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0);`,
      );
      db.close();
    }

    await ensureStagingServerDist();
    const port = await reserveEphemeralPort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [SERVER_ENTRY, FIXTURE_PATH, String(port)], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DECKO_WRITE_PATH: "1",
        DECKO_DECK_PROFILE: "stock",
        DECKO_ASSET_REFRESH: "never",
        DECKO_FONT_AWESOME: "local",
        DECKO_PASSWORD_HASH: "legacy-sha1",
        DECKO_MOD_PUBLIC_DIR: MOD_PUBLIC_DIR,
        DECKO_FILES_DIR: FILES_DIR,
        COMPILED_ASSETS_DIR: FILES_DIR,
        DECKO_ORIGIN: baseUrl,
        // A test-local signing secret; never read back, never printed.
        DECKO_TOKEN_SECRET: "card-format-route-endpoint-secret",
      },
    });
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    let ready = false;
    const deadline = Date.now() + 120_000;
    while (!ready && Date.now() < deadline) {
      try {
        ready = (await fetch(`${baseUrl}/_status`)).status === 200;
      } catch {
        /* not listening yet */
      }
      if (!ready) await delay(250);
    }
    if (!ready) {
      throw new Error(
        `staging server did not become ready on port ${port}\n--- server output ---\n${serverOutput}`,
      );
    }
  }, 240_000);

  afterAll(async () => {
    if (server !== null && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 3000);
        server?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    server = null;
    rmSync(WORK_DIR, { recursive: true, force: true });
  });

  it("GET /Brief.rss answers the rss format show, not a card named 'Brief.rss'", async () => {
    const answer = await ask("/Brief.rss");
    expect(answer.status).toBe(200);
    // Fact 2: RssFormat inherits HtmlFormat's mime_type.
    expect(answer.contentType).toBe("text/html; charset=utf-8");
    expect(answer.body).toBe("RSS feeds disabled");
  });

  it("GET /Brief.csv reaches the csv family (its item-name gap is named, not routed around)", async () => {
    // MEASURED Ruby: 200, "Name,Type\n" — Brief's own item list is EMPTY in
    // Ruby, so only the header renders. The port's csv family still sees
    // Brief's three nest-markup content lines as three unresolved items and
    // raises the documented CSV.generate_line NoMethodError
    // (src/card/render/format-families.ts:10-16, :183-189). That gap is in
    // the ITEM-NAME PARSE, not in the route, so this file pins that the
    // request reaches the csv family at all — it is NOT the page arm
    // answering for a card named "Brief.csv" — and the missing-mark arm pins
    // the csv bytes that ARE equal. Closing the parse is its own fix.
    const answer = await ask("/Brief.csv");
    expect(answer.status).not.toBe(200);
    expect(answer.body).not.toContain("Brief.csv</title>");
    expect(answer.body).toContain("undefined method `each' for an instance of String");
  });

  it("GET /*search?format=rss answers the same format the suffix would (fact 1)", async () => {
    const viaQuery = await ask("/*search?format=rss&term=rss%20card%20body");
    expect(viaQuery.status).toBe(200);
    expect(viaQuery.contentType).toBe("text/html; charset=utf-8");
    expect(viaQuery.body).toBe("RSS feeds disabled");
    const viaSuffix = await ask("/*search.rss?term=rss%20card%20body");
    expect(viaSuffix.status).toBe(viaQuery.status);
    expect(viaSuffix.contentType).toBe(viaQuery.contentType);
    expect(viaSuffix.body).toBe(viaQuery.body);
  });

  it("GET /?format=rss answers the home card's rss show", async () => {
    const answer = await ask("/?format=rss");
    expect(answer.status).toBe(200);
    expect(answer.contentType).toBe("text/html; charset=utf-8");
    expect(answer.body).toBe("RSS feeds disabled");
  });

  it("a mark that is not a card answers per format (fact 3): rss 200 empty, csv 404 named", async () => {
    const rss = await ask("/Never_Existed_XYZ.rss");
    expect(rss.status).toBe(200);
    expect(rss.contentType).toBe("text/html; charset=utf-8");
    expect(rss.body).toBe("");

    const csv = await ask("/Never_Existed_XYZ.csv");
    expect(csv.status).toBe(404);
    expect(csv.contentType).toBe("text/comma-separated-values; charset=utf-8");
    expect(csv.body).toBe("Could not find Never Existed XYZ.");
  });

  it("an unknown suffix stays part of the card name (the asset/file marks keep working)", async () => {
    // Ruby only treats a (.:format) suffix the format registry knows as a
    // format; this port's families are json/rss/csv, so anything else must
    // keep riding the mark rather than silently becoming a format show.
    // Measured: the port answers Ruby's not-found page for the card named
    // "Brief.pdf" — proof the suffix never became a format.
    const answer = await ask("/Brief.pdf");
    expect(answer.status).toBe(404);
    expect(answer.contentType).toContain("text/html");
    expect(answer.body).toContain("Brief.pdf");
    expect(answer.body).not.toContain("RSS feeds disabled");
  });

  it("the plain page arm is unchanged: GET /Brief still renders the card page", async () => {
    const answer = await ask("/Brief");
    expect(answer.status).toBe(200);
    expect(answer.contentType).toContain("text/html");
    expect(answer.body).toContain("Brief");
    expect(answer.body).not.toBe("RSS feeds disabled");
  });
});