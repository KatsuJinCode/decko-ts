import { describe, expect, it } from "vitest";
import type { SQLStatement } from "../../../src/server/driver.js";
import { translateSqliteToPostgres } from "../../../src/server/drivers/postgres.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

describe("junction-chain widening join order", () => {
  for (const analyze of [false, true]) {
    it(`preserves all chain rows with ${analyze ? "analyzed" : "absent"} planner statistics`, async () => {
      const storage = await createRenderTestStorage();
      try {
        await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
        for (let i = 0; i < 3; i++) await seedCard(storage, { id: 1000 + i, name: `JoinPart${i}` });
        await seedCard(storage, { id: 1010, leftId: 1000, rightId: 1001 });
        await seedCard(storage, { id: 1011, leftId: 1010, rightId: 1002 });
        const names: string[] = [];
        for (let i = 0; i < 16; i++) {
          await seedCard(storage, { id: 1100 + i, name: `JoinLeaf${i}` });
          await seedCard(storage, { id: 1200 + i, leftId: 1011, rightId: 1100 + i, dbContent: `chain hit ${i}` });
          names.push(`JoinPart0+JoinPart1+JoinPart2+JoinLeaf${i}`);
        }
        await seedCard(storage, { id: 1300, name: "Join Root", dbContent: names.map(name => `{{${name}|core}}`).join("\n") });
        if (analyze) await storage.counting.query("ANALYZE", []);
        const captured: SQLStatement[] = [];
        const batch = storage.counting.batch.bind(storage.counting);
        storage.counting.batch = async statements => { captured.push(...statements); return batch(statements); };
        // Exercise the widening wave directly: ordinary nest prefetch can
        // seat these authored chains before the rule-name wave needs them.
        await (storage.engine as unknown as { seatNamesByWave(names: string[]): Promise<boolean> }).seatNamesByWave(names);
        const chains = captured.filter(s => /SELECT DISTINCT c4\.\*/.test(s.sql));
        const html = await storage.engine.render("Join Root", "core");
        for (let i = 0; i < 16; i++) expect(html).toContain(`chain hit ${i}`);
        expect(chains.length).toBeGreaterThan(0);
        let found = 0;
        for (const statement of chains) {
          expect(statement.sql.match(/CROSS JOIN/g)).toHaveLength(7);
          // PostgreSQL has no SQLite CROSS JOIN ... ON hint; its existing
          // dialect adapter must retain the constrained indexed joins.
          const pg = translateSqliteToPostgres(statement.sql).sql;
          expect(pg).not.toContain("CROSS JOIN");
          expect(pg.match(/JOIN cards/g)).toHaveLength(7);
          // Preserve the previous production statement as the differential
          // oracle, rather than deriving expected rows from the new query.
          const clause='(p0."key" COLLATE NOCASE = ? AND p1."key" COLLATE NOCASE = ? AND p2."key" COLLATE NOCASE = ? AND p3."key" COLLATE NOCASE = ?)';
          const original='SELECT DISTINCT c4.* FROM cards c4 '+
            'CROSS JOIN cards c3 ON c3.id=c4.left_id AND c3.trash=0 '+
            'CROSS JOIN cards c2 ON c2.id=c3.left_id AND c2.trash=0 '+
            'CROSS JOIN cards p0 ON p0.id=c2.left_id AND p0.trash=0 '+
            'CROSS JOIN cards p1 ON p1.id=c2.right_id AND p1.trash=0 '+
            'CROSS JOIN cards p2 ON p2.id=c3.right_id AND p2.trash=0 '+
            'CROSS JOIN cards p3 ON p3.id=c4.right_id AND p3.trash=0 '+
            'WHERE c4.trash=0 AND ('+Array.from({length:statement.params!.length/4},()=>clause).join(' OR ')+')';
          const before = await storage.counting.query<{ id: number }>(original, statement.params);
          const after = await storage.counting.query<{ id: number }>(statement.sql, statement.params);
          const sort = (rows: Array<{ id: number }>) => rows.slice().sort((a, b) => a.id - b.id);
          expect(sort(after.rows)).toEqual(sort(before.rows));
          found += after.rows.filter(r => r.id >= 1200 && r.id < 1216).length;
          const plan = await storage.counting.query<{ detail: string }>("EXPLAIN QUERY PLAN " + statement.sql, statement.params);
          for (const alias of ["c4", "c3", "c2"]) {
            expect(plan.rows.some(row => row.detail.includes(`SEARCH ${alias} USING INDEX`) && /(?:left_id|right_id)=\?/.test(row.detail)), JSON.stringify(plan.rows)).toBe(true);
          }
          for (const alias of ["p0", "p1", "p2", "p3"]) {
            expect(plan.rows.some(row => row.detail.includes(`SEARCH ${alias} USING INDEX`) && row.detail.includes("key=?"))).toBe(true);
          }
        }
        expect(found).toBe(16);
      } finally { storage.close(); }
    });
  }
});
