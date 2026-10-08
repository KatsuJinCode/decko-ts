// The live store's widening statements, at their widest, must run on
// Cloudflare D1 (workerd's local D1 here), whose SQLite refuses a compound
// SELECT of more than five terms, and must return what SQLite returns for the
// same statement. Before the compound split, a page's first-trip widening
// (rule sets, *type plus right sets, whole lefts, whole left keys, pairs,
// side keys) put up to eleven terms in `fs` and six in `seed`: replayed on
// local D1, about a quarter of the statements of the 40 gate pages were
// rejected with "too many terms in compound SELECT".

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { RequestStore, type Widening } from "../../../src/card/live/request-store.js";
import { CARDS_COLUMNS } from "../../../src/card/live/store-row-evaluator.js";

const SCHEMA = `CREATE TABLE cards (${CARDS_COLUMNS.map((c) => (c === "id" ? "id INTEGER PRIMARY KEY" : `"${c}"`)).join(", ")})`;

// A small deck with every shape the widening reaches: simple cards, set
// cards and rules (codenames), a *type plus right set, a layout rule naming a
// layout card, junctions two levels deep.
type Row = { id: number; name: string | null; key: string | null; codename?: string; left_id?: number; right_id?: number; type_id?: number; db_content?: string };
const ROWS: Row[] = [
  { id: 1, name: "Home", key: "home", type_id: 3 },
  { id: 2, name: "Basic", key: "basic", codename: "basic", type_id: 4 },
  { id: 3, name: "RichText", key: "rich_text", codename: "rich_text", type_id: 4 },
  { id: 4, name: "Cardtype", key: "cardtype", codename: "cardtype", type_id: 4 },
  { id: 5, name: "*self", key: "*self", codename: "self", type_id: 4 },
  { id: 6, name: "*type", key: "*type", codename: "type", type_id: 4 },
  { id: 7, name: "*structure", key: "*structure", codename: "structure", type_id: 2 },
  { id: 8, name: "*default", key: "*default", codename: "default", type_id: 2 },
  { id: 9, name: "*layout", key: "*layout", codename: "layout", type_id: 2 },
  { id: 10, name: "*all", key: "*all", codename: "all", type_id: 2 },
  { id: 11, name: "*type plus right", key: "*type_plu_right", codename: "type_plus_right", type_id: 2 },
  { id: 12, name: "Default Layout", key: "default_layout", type_id: 2 },
  { id: 13, name: "Note", key: "note", type_id: 2 },
  { id: 20, name: null, key: "home+*self", left_id: 1, right_id: 5, type_id: 2 },
  { id: 21, name: null, key: "home+*self+*structure", left_id: 20, right_id: 7, type_id: 2, db_content: "{{_self}}" },
  { id: 22, name: null, key: "rich_text+*type", left_id: 3, right_id: 6, type_id: 2 },
  { id: 23, name: null, key: "rich_text+*type+*default", left_id: 22, right_id: 8, type_id: 2 },
  { id: 24, name: null, key: "*all+*layout", left_id: 10, right_id: 9, type_id: 2, db_content: "[[Default Layout]]" },
  { id: 25, name: null, key: "home+note", left_id: 1, right_id: 13, type_id: 2 },
  { id: 26, name: null, key: "rich_text+note", left_id: 3, right_id: 13, type_id: 2 },
  { id: 27, name: null, key: "rich_text+note+*type_plu_right", left_id: 26, right_id: 11, type_id: 2 },
  { id: 28, name: null, key: "rich_text+note+*type_plu_right+*structure", left_id: 27, right_id: 7, type_id: 2 },
  { id: 29, name: null, key: "home+note+note", left_id: 25, right_id: 13, type_id: 2 },
];

const WIDEST: Widening = {
  fullKeys: ["home", "note"],
  idKeys: ["basic"],
  fullIds: [12],
  idIds: [2],
  lefts: [1],
  leftKeys: ["rich_text"],
  pairs: [[1, 13]],
  sideL: ["home"],
  sideR: ["note"],
  ruleSets: [[1, "self"], [3, "type"]],
  tprSets: [[3, 13]],
  wholeLefts: [10],
  wholeLeftKeys: ["*all"],
};

let mf: Miniflare;
let dir: string;
const local = new DatabaseSync(":memory:");
const ins = (r: Row) => [r.id, r.name, r.key, r.codename ?? null, r.left_id ?? null, r.right_id ?? null, r.type_id ?? null, r.db_content ?? null];
const INSERT = `INSERT INTO cards (id, name, "key", codename, left_id, right_id, type_id, db_content, trash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`;

beforeAll(async () => {
  local.exec(SCHEMA);
  for (const r of ROWS) local.prepare(INSERT).run(...ins(r));
  dir = mkdtempSync(join(tmpdir(), "widening-d1-"));
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('') } }",
      d1Databases: { DB: "widening" },
      resourcePersistencePath: dir,
      compatibilityDate: "2026-09-01",
    }),
  );
  const d1 = await mf.getD1Database("DB");
  await d1.prepare(SCHEMA).run();
  for (const r of ROWS) await d1.prepare(INSERT).bind(...ins(r)).run();
}, 60_000);

afterAll(async () => {
  await mf?.dispose();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const ids = (rows: any[]) => rows.map((r) => Number(r.id)).sort((a, b) => a - b);

describe("live store widening statements on D1", () => {
  for (const selfMode of ["all", "filtered"]) {
    test(`the widest widening runs on D1 and matches SQLite (rule-set self mode ${selfMode})`, async () => {
      const prev = process.env.DECKO_LIVE_RULE_SETS_SELF;
      if (selfMode === "all") delete process.env.DECKO_LIVE_RULE_SETS_SELF;
      else process.env.DECKO_LIVE_RULE_SETS_SELF = selfMode;
      try {
        const w = new RequestStore().wideningStatements(WIDEST)!;
        const d1 = await mf.getD1Database("DB");
        for (const s of [w.full, w.identity]) {
          const onD1 = (await d1.prepare(s.sql).bind(...s.params).all()).results;
          const onSqlite = local.prepare(s.sql).all(...(s.params as any[]));
          expect(ids(onD1)).toEqual(ids(onSqlite));
        }
        // The deck is reached: the full statement carries the asked cards,
        // the rule cards under the rule sets, the *type plus right rule and
        // the layout card the *all+*layout rule names.
        const full = ids((await d1.prepare(w.full.sql).bind(...w.full.params).all()).results);
        for (const id of [1, 12, 13, 21, 23, 24, 28]) expect(full).toContain(id);
      } finally {
        if (prev === undefined) delete process.env.DECKO_LIVE_RULE_SETS_SELF;
        else process.env.DECKO_LIVE_RULE_SETS_SELF = prev;
      }
    });
  }

  test("a narrow widening keeps flat unions: at five terms or fewer the SQL is what libSQL always ran", () => {
    const w = new RequestStore().wideningStatements({ fullKeys: ["home"], idKeys: [], fullIds: [], idIds: [], lefts: [1], leftKeys: [], pairs: [], sideL: [], sideR: [] })!;
    expect(w.full.sql).toContain("fs(id) AS (SELECT NULL WHERE 0 UNION SELECT id FROM cards");
    expect(w.full.sql).not.toMatch(/fs_0\(id\)|seed_0\(id\)/);
  });
});
