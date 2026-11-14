// The D1 trickle copies its schema from a snapshot. A snapshot taken before an
// index joined db/schema.sqlite.sql must not hand that gap to D1: the
// importer adds every canonical index the snapshot lacks, and its write-cost
// arithmetic counts them.

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM tool modules without types
import { indexCounts, openSource, schemaStatements } from "../../../tools/d1-trickle/deck-source.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SERVING = [
  "cards_name_trash_index",
  "cards_right_id_trash_index",
  "cards_codename_present_index",
  "cards_key_last_char_index",
];

describe("D1 trickle schema carries the canonical serving-path indexes", () => {
  it("adds the indexes a snapshot lacks, and counts them in the write cost", () => {
    const dir = mkdtempSync(join(tmpdir(), "d1-trickle-indexes-"));
    try {
      const path = join(dir, "snapshot.sqlite3");
      // A snapshot built from the canonical DDL as it stood before the
      // serving-path indexes: those four lines removed, and the since-retired
      // cards_trash_index present (restore-deck-synthetic's state before 2026-10-07).
      let ddl = readFileSync(join(REPO, "db", "schema.sqlite.sql"), "utf8");
      for (const name of SERVING) ddl = ddl.replace(new RegExp(`^CREATE INDEX "${name}".*$`, "m"), "");
      const w = new DatabaseSync(path);
      w.exec(ddl);
      w.exec('CREATE INDEX "cards_trash_index" ON "cards" ("trash")');
      const before = Number((w.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND tbl_name='cards' AND sql IS NOT NULL").get() as { n: number }).n);
      w.close();

      const src = openSource(path);
      try {
        const stmts = schemaStatements(src) as { type: string; name: string; table: string; sql: string }[];
        for (const name of SERVING) {
          const s = stmts.find((x) => x.name === name);
          expect(s, `${name} missing from the trickle's schema statements`).toBeTruthy();
          expect(s!.sql).toMatch(/^CREATE INDEX IF NOT EXISTS /);
        }
        // Tables come first, so every index statement can apply.
        const lastTable = stmts.map((s) => s.type).lastIndexOf("table");
        const firstIndex = stmts.map((s) => s.type).indexOf("index");
        expect(lastTable).toBeLessThan(firstIndex);
        // No duplicate names: indexes the snapshot already has are not re-added.
        expect(new Set(stmts.map((s) => s.name)).size).toBe(stmts.length);

        // The retired index is not carried to D1.
        expect(stmts.map((s) => s.name)).not.toContain("cards_trash_index");

        // Write cost: the snapshot's cards indexes, less the retired one,
        // plus the four the import adds.
        expect((indexCounts(src) as Map<string, number>).get("cards")).toBe(before - 1 + SERVING.length);

        // The statements build a database with every serving index.
        const target = new DatabaseSync(":memory:");
        for (const s of stmts) target.exec(s.sql);
        const names = target.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r: any) => r.name);
        for (const name of SERVING) expect(names).toContain(name);
        target.close();
      } finally {
        src.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
