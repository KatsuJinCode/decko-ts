// SCRATCH census probe (stream R3): seed full corpus deck, render search-relevant
// captured views, write census JSON. Deleted/converted into the final replay test.
import { describe, it } from "vitest";
import Database from "better-sqlite3";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { normalizeSlotIds } from "../../../src/testing/diff.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DB = path.resolve(HERE, "../../../benchmarks/corpus-v2/bench-corpus-v2.sqlite3");
const SHARD = path.resolve(HERE, "../../../fixtures/corpus/shard-000000.jsonl");
const OUT = path.resolve(HERE, "../../../benchmarks/results/corpus-v2/search-census.json");

interface Line { id: number; name: string; record?: any; views?: Record<string, string>; error?: unknown }

describe("census", () => {
  it("renders search-relevant entries", { timeout: 3_600_000 }, async () => {
    const t0 = Date.now();
    const storage = await createRenderTestStorage();
    const corpus = new Database(CORPUS_DB, { readonly: true });
    const rows = corpus.prepare(
      "SELECT id, name, codename, left_id, right_id, trash, type_id, content, read_rule_id, read_rule_class FROM cards"
    ).all() as any[];
    for (const row of rows) {
      await seedCard(storage, {
        id: row.id, name: row.name ?? undefined, codename: row.codename,
        leftId: row.left_id ?? undefined, rightId: row.right_id ?? undefined,
        trash: row.trash === 1, typeId: row.type_id, dbContent: row.content,
        readRuleId: row.read_rule_id, readRuleClass: row.read_rule_class,
      });
    }
    corpus.close();
    console.log("seeded", rows.length, "in", ((Date.now() - t0) / 1000).toFixed(1), "s");

    const lines: Line[] = require("node:fs").readFileSync(SHARD, "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
    const results: any[] = [];
    let i = 0;
    for (const line of lines) {
      const views = line.views ?? {};
      const isSearch = line.record?.type_code === "search_type";
      const involved = isSearch || Object.entries(views).some(([, h]) =>
        h.includes("card-list") || h.includes("search-no-results") || h.startsWith("CAPTURE_ERROR"));
      if (!involved) continue;
      for (const [view, expected] of Object.entries(views)) {
        let actual: string | null = null;
        let raised: { cls: string; msg: string } | null = null;
        const t = Date.now();
        try {
          actual = await storage.engine.render(line.name, view);
        } catch (e) {
          raised = { cls: (e as Error)?.constructor?.name ?? "Error", msg: (e as Error)?.message ?? String(e) };
        }
        const ms = Date.now() - t;
        let status: string;
        if (expected.startsWith("CAPTURE_ERROR")) {
          const m = expected.match(/^CAPTURE_ERROR: ([^:]+): (.*)$/s);
          status = m && raised && raised.cls === m[1] && raised.msg === m[2]
            ? "pass" : (raised ? `wrong-raise ${raised.cls}: ${raised.msg.slice(0, 120)}` : "output-but-expected-raise");
        } else if (expected.startsWith('<span class="denied"')) {
          status = "denied-expected";
        } else if (raised) {
          status = `raised ${raised.cls}: ${raised.msg.slice(0, 120)}`;
        } else {
          const en = normalizeSlotIds(expected), an = normalizeSlotIds(actual ?? "");
          status = en === an ? "pass" : "diff";
        }
        results.push({ id: line.id, name: line.name, view, ms, status, len: expected.length });
      }
      i++;
      if (i % 100 === 0) console.log("rendered", i, "entries", ((Date.now() - t0) / 1000).toFixed(1), "s");
    }
    writeFileSync(OUT, JSON.stringify(results, null, 1));
    console.log("census done:", results.length, "views in", ((Date.now() - t0) / 1000).toFixed(1), "s");
    storage.close();
  });
});
