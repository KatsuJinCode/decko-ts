// Integration tier: the trickle importer against workerd's own local D1
// (Miniflare), over a small synthetic deck, across simulated UTC days.
// Checks the contract end to end: each day stops within its allowance, a
// crash with a unit in flight resumes without double writes, every batch is
// verified, the manifest grows as pages complete, the whole deck verifies at
// the end, and a changed source deck is refused.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-expect-error plain ESM tool modules without types
import { makePlan, runImport, verifyAll, status } from "../../../tools/d1-trickle/importer.mjs";
// @ts-expect-error plain ESM tool modules without types
import { MiniflareD1Executor } from "../../../tools/d1-trickle/executors.mjs";

let dir: string;
let source: string;
let state: string;
let persist: string;

function buildDeck(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, "key" TEXT, codename TEXT, left_id INTEGER, right_id INTEGER, type_id INTEGER NOT NULL, trash INTEGER NOT NULL, db_content TEXT)`);
  db.exec(`CREATE INDEX cards_key ON cards ("key")`);
  db.exec(`CREATE INDEX cards_left ON cards (left_id)`);
  db.exec(`CREATE TABLE card_references (id INTEGER PRIMARY KEY AUTOINCREMENT, referer_id INTEGER NOT NULL, referee_id INTEGER, ref_type TEXT NOT NULL DEFAULT '')`);
  db.exec(`CREATE INDEX refs_referer ON card_references (referer_id)`);
  db.exec(`CREATE TABLE deck_data_version (id INTEGER PRIMARY KEY, version INTEGER)`);
  db.exec(`CREATE TABLE sessions (id INTEGER PRIMARY KEY, data TEXT)`);
  db.exec(`INSERT INTO deck_data_version VALUES (1, 7)`);
  db.exec(`INSERT INTO sessions VALUES (1, 'secret-session-token')`);
  const ins = db.prepare(`INSERT INTO cards (id, name, "key", codename, left_id, right_id, type_id, trash, db_content) VALUES (?,?,?,?,?,?,?,?,?)`);
  // 1 Cardtype, 2 Setting, 3 Set, 4 RichText, 5 *read, 6 *all, 7 *all+*read (rule)
  ins.run(1, "Cardtype", "cardtype", "cardtype", null, null, 1, 0, "");
  ins.run(2, "Setting", "setting", "setting", null, null, 1, 0, "");
  ins.run(3, "Set", "set", "set", null, null, 1, 0, "");
  ins.run(4, "RichText", "richtext", "rich_text", null, null, 1, 0, "");
  ins.run(5, "*read", "*read", "read", null, null, 2, 0, "");
  ins.run(6, "*all", "*all", "all", null, null, 3, 0, "");
  ins.run(7, null, null, null, 6, 5, 4, 0, "[[Anyone]]");
  for (let id = 8; id <= 70; id++) {
    const content = id === 30 ? "big ".repeat(1500) + "it's \"quoted\"" : `card ${id} with 'quotes' and ? marks`;
    ins.run(id, `Card ${id}`, `card_${id}`, null, null, null, 4, id % 17 === 0 ? 1 : 0, content);
  }
  const ref = db.prepare(`INSERT INTO card_references (referer_id, referee_id, ref_type) VALUES (?,?,?)`);
  ref.run(7, 6, "L");
  for (let id = 8; id <= 70; id += 3) ref.run(id, id + 1, "L");
  ref.run(9999, 8, "L"); // an orphan: its referer is no card
  db.exec("ANALYZE");
  db.close();
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "trickle-it-"));
  source = join(dir, "deck.sqlite3");
  state = join(dir, "state");
  persist = join(dir, "d1");
  buildDeck(source);
  const closures = join(dir, "closures.jsonl");
  writeFileSync(closures, JSON.stringify({ page: "/A", status: "closed", ids: [10, 11, 12], ref_ids: [11] }) + "\n");
  appendFileSync(closures, JSON.stringify({ page: "/B", status: "needs-full", ids: [] }) + "\n");
  appendFileSync(closures, JSON.stringify({ page: "/C", status: "closed", ids: [60, 61], ref_ids: [] }) + "\n");
  makePlan({ sourcePath: source, stateDir: state, closuresPath: closures, poolPages: ["/B", "/C"], fixedPages: ["/A"], unitCost: 60 });
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const day = (n: number) => () => new Date(Date.UTC(2026, 9, n, 12));

describe("trickle import into local D1", () => {
  test(
    "runs day by day within the allowance, survives a crash mid-unit, and ends verified",
    async () => {
      const plan = JSON.parse(readFileSync(join(state, "plan.json"), "utf8"));
      expect(plan.units[0].kind).toBe("schema");
      const dailyLimit = 120;
      const share = 0.9;
      const allowance = Math.floor(dailyLimit * share);
      const completeByDay: number[] = [];
      let d = 1;
      let crashed = false;
      for (; d <= 20; d++) {
        const exec = await MiniflareD1Executor.open({ persistDir: persist, dbName: "it" });
        try {
          const s = await runImport({ stateDir: state, exec, dailyLimit, share, now: day(d), maxStatementBytes: 2000 });
          expect(s.rows_written, `day ${d}`).toBeLessThanOrEqual(allowance);
          completeByDay.push(s.manifest_complete_pages);
          if (d === 2 && !crashed) {
            // Simulate a crash after a unit reached D1 but before the
            // checkpoint recorded it: rewind one unit and mark it in flight.
            const cpPath = join(state, "checkpoint.json");
            const cp = JSON.parse(readFileSync(cpPath, "utf8"));
            cp.unitsDone -= 1;
            cp.inflight = cp.unitsDone;
            writeFileSync(cpPath, JSON.stringify(cp));
            crashed = true;
          }
          if (s.stop === "deck complete") break;
          expect(s.stop).toMatch(/daily allowance reached/);
        } finally {
          await exec.close();
        }
      }
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThan(20);
      // Day 3 re-sent the rewound unit: the ledger shows no day over its allowance.
      const cp = JSON.parse(readFileSync(join(state, "checkpoint.json"), "utf8"));
      for (const [k, v] of Object.entries(cp.days) as [string, any][]) expect(v.rowsWritten, k).toBeLessThanOrEqual(allowance);
      expect(cp.inflight).toBeNull();
      // Pages appear as the import goes, /B (needs-full) only at the end.
      expect(completeByDay[completeByDay.length - 1]).toBe(3);
      expect(Math.min(...completeByDay)).toBeLessThan(3);
      const st = status(state);
      expect(st.deck_complete).toBe(true);
      expect(st.rows_written_left).toBe(0);
      const exec = await MiniflareD1Executor.open({ persistDir: persist, dbName: "it" });
      try {
        const v = await verifyAll(state, exec);
        expect(v.ok, JSON.stringify(v.checks)).toBe(true);
        expect((await exec.run("SELECT count(*) AS n FROM cards")).results[0].n).toBe(70);
        expect((await exec.run("SELECT count(*) AS n FROM card_references")).results[0].n).toBe(23);
        expect((await exec.run("SELECT db_content AS c FROM cards WHERE id = 30")).results[0].c).toBe("big ".repeat(1500) + "it's \"quoted\"");
        // Session rows are secrets: the table exists, empty.
        expect((await exec.run("SELECT count(*) AS n FROM sessions")).results[0].n).toBe(0);
        expect((await exec.run("SELECT version FROM deck_data_version")).results[0].version).toBe(7);
      } finally {
        await exec.close();
      }
    },
    120_000,
  );

  test("a changed source deck is refused instead of mixing two decks", async () => {
    const db = new DatabaseSync(source);
    db.exec("UPDATE cards SET db_content = 'changed' WHERE id = 8");
    db.close();
    const exec = await MiniflareD1Executor.open({ persistDir: persist, dbName: "it" });
    try {
      await expect(runImport({ stateDir: state, exec, now: day(25) })).rejects.toThrow(/source deck changed/);
    } finally {
      await exec.close();
    }
  }, 60_000);
});
