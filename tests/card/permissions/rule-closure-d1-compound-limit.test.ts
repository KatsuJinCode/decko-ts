// The render path's rule-closure statement must run on Cloudflare D1, whose
// SQLite refuses a compound SELECT of more than 5 terms ("too many terms in
// compound SELECT"; measured in workerd's local D1, which this test uses).
// At 1503be2c its `resolved` CTE had 6 terms, so every page on D1 answered
// 500. This pins both halves: the statement runs on D1, and it returns the
// same row set as the legacy reference statement on the same deck.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  RULE_KEY_RULE_CLOSURE_STATEMENT,
  LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT,
  RULE_CLOSURE_PARAMS,
} from "../../../src/card/permissions/read-rules.js";
import { CloudflareD1Adapter } from "../../../src/server/drivers/d1.js";

// A small deck: simple cards, set patterns, rules with stored and composed
// keys, a trashed rule, and a non-rule junction.
const SCHEMA = `CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, "key" TEXT, left_id INTEGER, right_id INTEGER, trash INTEGER NOT NULL DEFAULT 0)`;
const ROWS: [number, string | null, number | null, number | null, number][] = [
  [1, "a", null, null, 0],
  [2, "*self", null, null, 0],
  [3, "*read", null, null, 0],
  [4, "*all", null, null, 0],
  [5, "b", null, null, 0],
  [6, "*update", null, null, 0],
  [7, "*type", null, null, 0],
  [8, null, 1, 2, 0], // a+*self
  [9, null, 8, 3, 0], // a+*self+*read
  [10, "*all+*read", 4, 3, 0], // stored rule key
  [11, null, 5, 2, 0], // b+*self
  [12, null, 11, 6, 0], // b+*self+*update
  [13, null, 11, 3, 1], // b+*self+*read, trashed
  [14, null, 1, 5, 0], // a+b, not a rule
  [15, null, 5, 7, 0], // b+*type
  [16, null, 15, 3, 0], // b+*type+*read
  [17, "*create", null, null, 0],
  [18, "*delete", null, null, 0],
  [19, null, 4, 18, 0], // *all+*delete
];

let mf: Miniflare;
let dir: string;
const local = new DatabaseSync(":memory:");

beforeAll(async () => {
  local.exec(SCHEMA);
  const ins = local.prepare(`INSERT INTO cards (id, name, "key", left_id, right_id, trash) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const [id, key, l, r, t] of ROWS) ins.run(id, key, key, l, r, t);
  dir = mkdtempSync(join(tmpdir(), "rc-d1-"));
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('') } }",
      d1Databases: { DB: "rc" },
      resourcePersistencePath: dir,
      compatibilityDate: "2026-09-01",
    }),
  );
  const d1 = await mf.getD1Database("DB");
  await d1.prepare(SCHEMA).run();
  for (const [id, key, l, r, t] of ROWS) {
    await d1.prepare(`INSERT INTO cards (id, name, "key", left_id, right_id, trash) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, key, key, l, r, t).run();
  }
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const asSet = (rows: any[]) => new Set(rows.map((r) => `${r.ckey}\u0001${Number(r.id)}`));

describe("rule-closure statement on D1", () => {
  test("D1 really limits a compound SELECT to five terms (the constraint this pins)", async () => {
    const d1 = await mf.getD1Database("DB");
    const terms = (n: number) => Array.from({ length: n }, (_, i) => `SELECT ${i}`).join(" UNION ALL ");
    await expect(d1.prepare(terms(5)).all()).resolves.toBeDefined();
    await expect(d1.prepare(terms(6)).all()).rejects.toThrow(/too many terms in compound SELECT/);
  });

  test("D1 refuses a 150-term flat OR chain, and the adapter's regrouped form runs", async () => {
    const d1 = await mf.getD1Database("DB");
    const pairs = Array.from({ length: 150 }, (_, i) => `(left_id = ${i} AND right_id = ${i + 1})`);
    const flat = `SELECT id FROM cards WHERE trash = 0 AND (${pairs.join(" OR ")})`;
    await expect(d1.prepare(flat).all()).rejects.toThrow(/Expression tree is too large/);
    const adapter = new CloudflareD1Adapter(d1 as any);
    const r = await adapter.query<{ id: number }>(flat, []);
    expect(r.rows.map((x) => Number(x.id)).sort((a, b) => a - b)).toEqual([8]);
  });

  test("runs on D1 and returns the legacy statement's row set", async () => {
    const d1 = await mf.getD1Database("DB");
    const onD1 = (await d1.prepare(RULE_KEY_RULE_CLOSURE_STATEMENT).bind(...RULE_CLOSURE_PARAMS).all()).results;
    const legacy = local.prepare(LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT).all(...RULE_CLOSURE_PARAMS);
    expect(asSet(onD1)).toEqual(asSet(legacy));
    // Hand-checked: the live rules of this deck, by composed key.
    expect([...asSet(onD1)].sort()).toEqual(
      ["*all+*delete\u000119", "*all+*read\u000110", "a+*self+*read\u00019", "b+*self+*update\u000112", "b+*type+*read\u000116"].sort(),
    );
  });
});
