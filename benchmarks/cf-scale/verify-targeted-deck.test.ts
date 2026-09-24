// verify-targeted-deck.test.ts — boot the real engine over the Cloudflare
// targeted-test deck on a scratch SQLite file and verify every dimension
// renders BEFORE the deck goes anywhere near Cloudflare. Run:
//   npx vitest run benchmarks/cf-scale/verify-targeted-deck.test.ts
// Companion deck generator: benchmarks/cf-scale/targeted-test-deck.mjs
//   (writes deploy/cf-scale-deck/seed.sql)

import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { splitSqlStatements } from "../../tools/migrate/import.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DB_PATH = join(REPO, "tmp", "cf-scale-verify.sqlite3");
const SEED = readFileSync(join(REPO, "deploy", "cf-scale-deck", "seed.sql"), "utf8");
const SCHEMA = readFileSync(join(REPO, "db", "schema.sqlite.sql"), "utf8");

rmSync(DB_PATH, { force: true });
const driver = new LocalSqliteDriver({ path: DB_PATH });
for (const statement of splitSqlStatements(SCHEMA)) await driver.query(statement, []);
for (const statement of SEED.split(";\n").map((s) => s.trim()).filter(Boolean)) {
  await driver.query(statement, []);
}

const fetcher = new FetchEngine(driver);
const render = new RenderEngine(fetcher);

afterAll(() => driver.close());

describe("targeted Cloudflare test deck — every dimension renders locally", () => {
  it("home renders", async () => {
    const html = await render.render("Home", "content");
    expect(html).toContain("Cloudflare targeted-test deck home");
  });

  it("depth-32 chain hits the Ruby max_depth guard (Card.config.max_depth = 20)", async () => {
    // Aligned 2026-09-24 with the renderer's RUBY_MAX_DEPTH (format.ts;
    // prototype/lib/cardio/railtie.rb:17). The chain was seeded 32 deep —
    // past Ruby's guard — and the adversarial probe oracle already flagged
    // it: depth 32 >= max_depth 20 raises Card::Error::UserError "Man,
    // you're too deep" in Ruby, so a Ruby-parity claim about this deck
    // could never include this dimension. The old guard (42) rendered it;
    // the aligned guard raises at Depth Level 21, exactly where Ruby's
    // does. The deck generator (targeted-test-deck.mjs) should re-seed the
    // chain to 19 inclusion levels if a RENDERABLE deep-chain dimension is
    // wanted on the remote window.
    await expect(render.render("Depth Root", "content")).rejects.toThrow(
      /nest depth exceeded \(Depth Level 21\)/,
    );
  });

  it("500-item pointer list renders all items", async () => {
    const html = await render.render("Big Pointer", "content");
    expect(html).toContain("Scale Page 500x");
    const count = (html.match(/Scale Page \d+x/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(500);
  });

  it("restricted card denies anonymous and never leaks the body", async () => {
    const html = await render.render("Restricted Page 7", "content");
    expect(html).toContain("denied");
    expect(html).not.toContain("Restricted body 7");
  });

  it("ordinary point read renders", async () => {
    const html = await render.render("Scale Page 173x", "content");
    expect(html).toContain("Scale page 173.");
  });

  it("large content card renders at size", async () => {
    const html = await render.render("Large Doc 1", "content");
    expect(html.length).toBeGreaterThan(8000);
  });

  it("compound junction renders under its compound name", async () => {
    const row = (await driver.query("SELECT left_id, right_id FROM cards WHERE db_content LIKE 'Compound body 7:%' LIMIT 1", [])).rows[0] as { left_id: number; right_id: number };
    expect(row).toBeTruthy();
    const left = (await driver.query("SELECT name FROM cards WHERE id = ?", [row.left_id])).rows[0] as { name: string };
    const right = (await driver.query("SELECT name FROM cards WHERE id = ?", [row.right_id])).rows[0] as { name: string };
    const html = await render.render(`${left.name}+${right.name}`, "content");
    expect(html).toContain("Compound body 7");
  });

  it("CQL search card renders a list", async () => {
    const html = await render.render("All Scale Page Probe", "content");
    expect(html).toMatch(/Scale Page/);
  });
});
