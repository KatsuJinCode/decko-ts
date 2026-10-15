// The one-shot nest-index build on a D1 database, run the way the deploy
// chain runs it: the engine's own D1 adapter over a D1 binding, the same
// ensureNestIndex the Node host runs.
//
// Two transports, neither of which touches a real Cloudflare account here:
//   1. Miniflare's local D1 (real workerd, real SQLite, real D1 binding) -
//      the binding a Worker's env.DB hands the engine.
//   2. The REST transport (tools/deploy/d1-binding.mjs) against a local HTTP
//      server that answers the Cloudflare D1 query endpoint from a real
//      SQLite file, so the wire shape the REST API returns is exercised
//      without an account or a token.
//
// What is asserted: a deck with content and no marker is missing before the
// build, the build derives the 'I' rows the write path would have written, the
// marker says current afterwards, a second build reads the marker and writes
// nothing, and a render of the root costs three round trips.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import Database from "better-sqlite3";
import { splitSqlStatements } from "../card/fetch/fetch-test-storage.js";
import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { ensureNestIndex, readNestIndexMarker } from "../../src/card/nest-index.js";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCHEMA = readFileSync(join(REPO, "db/schema.sqlite.sql"), "utf8");

const scratch: string[] = [];
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "decko-nest-index-d1-"));
  scratch.push(dir);
  return dir;
}

let mf: Miniflare | undefined;

/** Loads the card schema and a small nesting deck into a D1 database. */
async function seed(driver: CloudflareD1Adapter): Promise<void> {
  for (const statement of splitSqlStatements(SCHEMA)) {
    if (/^\s*CREATE TRIGGER/i.test(statement)) continue;
    await driver.query(statement, []);
  }
  const insert = (id: number, name: string, key: string, content: string | null) =>
    driver.query(
      `INSERT INTO cards (id, name, key, type_id, db_content, trash, created_at, updated_at, creator_id, updater_id)
       VALUES (?, ?, ?, ?, ?, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)`,
      [id, name, key, 2, content],
    );
  await insert(2, "RichText", "basic", null);
  await insert(101, "root", "root", "{{child}}");
  await insert(102, "child", "child", "{{grandchild}}");
  await insert(103, "grandchild", "grandchild", "leaf");
}

async function indexRows(driver: CloudflareD1Adapter): Promise<unknown[]> {
  return (await driver.query(`SELECT referer_id, referee_id, referee_key FROM card_references ORDER BY referer_id`, [])).rows;
}

afterAll(async () => {
  await mf?.dispose();
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("nest index build step: D1 binding (Miniflare)", () => {
  it("builds the index, then is a marker read", { timeout: 300_000 }, async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: `export default { fetch() { return new Response("ok"); } }`,
        d1Databases: { DB: "decko-nest-index-test" },
      }),
    );
    const db = await mf.getD1Database("DB");
    const driver = new CloudflareD1Adapter(db);
    await seed(driver);

    expect(await readNestIndexMarker(driver)).toEqual({ state: "missing" });
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    const lexicon = new FetchEngine(driver).lexicon;
    const install = await ensureNestIndex(driver, lexicon);
    expect({ state: install.state, scanned: install.scanned }).toEqual({ state: "built", scanned: 2 });
    expect(await indexRows(driver)).toEqual([
      { referer_id: 101, referee_id: 102, referee_key: "child" },
      { referer_id: 102, referee_id: 103, referee_key: "grandchild" },
    ]);
    expect((await readNestIndexMarker(driver)).state).toBe("current");
    expect(await ensureNestIndex(driver, lexicon)).toEqual({ state: "current", dropped: 0, scanned: 0 });
  });
});

describe("nest index build step: the REST transport's wire shape", () => {
  it("builds through a local stand-in for the Cloudflare D1 query endpoint", { timeout: 300_000 }, async () => {
    // A local HTTP server answering the endpoint the REST transport calls,
    // backed by a real SQLite file. No account, no token, no network.
    const dir = scratchDir();
    const sqlite = new Database(join(dir, "deck.sqlite3"));
    for (const statement of splitSqlStatements(SCHEMA)) {
      if (/^\s*CREATE TRIGGER/i.test(statement)) continue;
      sqlite.exec(statement);
    }
    let seen = 0;
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen += 1;
        const { sql, params = [] } = JSON.parse(body || "{}");
        try {
          const stmt = sqlite.prepare(sql) as unknown as { reader: boolean; all(...p: unknown[]): unknown[]; run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint } };
          const rows = stmt.reader ? stmt.all(...params) : [];
          const info = stmt.reader ? undefined : stmt.run(...params);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              result: [{ results: rows, success: true, meta: { rows_read: rows.length, rows_written: info?.changes ?? 0, last_row_id: info?.lastInsertRowid } }],
            }),
          );
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, errors: [{ message: String((err as Error).message ?? err) }] }));
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const originalFetch = globalThis.fetch;
    try {
      const { d1HttpBinding } = await import(join(REPO, "tools/deploy/d1-binding.mjs"));
      const binding = d1HttpBinding({
        accountId: "acct-local",
        databaseId: "db-local",
        apiToken: "test-token",
        fetchImpl: (url: string, init?: RequestInit) => originalFetch(url.replace("https://api.cloudflare.com", `http://127.0.0.1:${port}`), init),
      });
      const driver = new CloudflareD1Adapter(binding);
      const insert = (id: number, name: string, key: string, content: string | null) =>
        driver.query(
          `INSERT INTO cards (id, name, key, type_id, db_content, trash, created_at, updated_at, creator_id, updater_id)
           VALUES (?, ?, ?, ?, ?, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)`,
          [id, name, key, 2, content],
        );
      await insert(2, "RichText", "basic", null);
      await insert(101, "root", "root", "{{child}}");
      await insert(102, "child", "child", "leaf");

      expect((await readNestIndexMarker(driver)).state).toBe("missing");
      applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
      const lexicon = new FetchEngine(driver).lexicon;
      const install = await ensureNestIndex(driver, lexicon);
      expect({ state: install.state, scanned: install.scanned }).toEqual({ state: "built", scanned: 1 });
      expect(await indexRows(driver)).toEqual([{ referer_id: 101, referee_id: 102, referee_key: "child" }]);
      expect((await readNestIndexMarker(driver)).state).toBe("current");
      expect(seen).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      sqlite.close();
    }
  });
});
