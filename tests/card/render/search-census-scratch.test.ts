// SCRATCH census (stream R3): targeted-seed corpus replay for search-relevant
// shard-000000 entries. Converted into the final replay test after triage.
import { describe, it } from "vitest";
import Database from "better-sqlite3";
import {
  createPermissionSeededStorage,
  readShardLines,
  CORPUS_DB,
} from "./permission-corpus-seeding.js";
import { seedCard, type RenderTestStorage } from "./render-test-storage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { normalizeSlotIds } from "../../../src/testing/diff.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface CorpusRow {
  id: number; name: string | null; codename: string | null;
  left_id: number | null; right_id: number | null; trash: number;
  type_id: number; content: string | null; read_rule_id: number | null; read_rule_class: string | null;
}
const COLS = "id, name, codename, left_id, right_id, trash, type_id, content, read_rule_id, read_rule_class";

/** Bulk seed extra rows + transitive closure (permission-seeding walk shape). */
async function seedClosure(storage: RenderTestStorage, corpus: Database.Database, startIds: number[]): Promise<void> {
  const rows = new Map<number, CorpusRow>();
  const fetchRows = (idList: number[]): void => {
    for (let i = 0; i < idList.length; i += 500) {
      const chunk = idList.slice(i, i + 500);
      const got = corpus.prepare(`SELECT ${COLS} FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as CorpusRow[];
      for (const row of got) if (!rows.has(row.id)) rows.set(row.id, row);
    }
  };
  fetchRows(startIds);
  for (let round = 0; round < 40; round++) {
    const need: number[] = [];
    for (const row of rows.values()) {
      for (const side of [row.left_id, row.right_id]) if (side !== null && !rows.has(side)) need.push(side);
      if (row.type_id !== null && !rows.has(row.type_id)) need.push(row.type_id);
    }
    if (need.length === 0) break;
    fetchRows(need);
  }
  const existing = new Set<number>();
  const ids = [...rows.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const found = await storage.fetcher.driver.query<{ id: number }>(
      `SELECT id FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk);
    for (const row of found.rows) existing.add(row.id);
  }
  for (const row of rows.values()) {
    if (existing.has(row.id)) continue;
    await seedCard(storage, {
      id: row.id, name: row.name ?? undefined, codename: row.codename,
      leftId: row.left_id ?? undefined, rightId: row.right_id ?? undefined,
      trash: row.trash === 1, typeId: row.type_id, dbContent: row.content,
      readRuleId: row.read_rule_id, readRuleClass: row.read_rule_class,
    });
  }
}

describe("search census", () => {
  it("classifies search-relevant entries", { timeout: 3_600_000 }, async () => {
    const t0 = Date.now();
    const storage = await createPermissionSeededStorage();
    const corpus = new Database(CORPUS_DB, { readonly: true });
    const lines = readShardLines() as any[];

    // extra closure: *create rules (who_can chain), *content options rules and
    // the pointer/list item cards the shard's collection cards reference.
    const extra: number[] = [];
    for (const row of corpus.prepare("SELECT id FROM cards WHERE name LIKE '%+*create' AND trash = 0").all() as { id: number }[]) {
      extra.push(row.id);
    }
    for (const row of corpus.prepare("SELECT id FROM cards WHERE name LIKE '%+*content options' AND trash = 0").all() as { id: number }[]) {
      extra.push(row.id);
    }
    for (const line of lines) {
      const r = line.record;
      if (!r) continue;
      if (r.type_code === "pointer" || r.type_code === "list" || r.type_code === "search_type") {
        for (const itemName of (r.content ?? "").split("\n")) {
          const nm = itemName.trim();
          if (nm === "") continue;
          const row = (corpus.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(nm) ??
            corpus.prepare("SELECT id FROM cards WHERE \"key\" = ? AND trash = 0").get(nm.toLowerCase())) as { id: number } | undefined;
          if (row !== undefined) extra.push(row.id);
        }
      }
    }
    await seedClosure(storage, corpus, extra);
    corpus.close();
    console.log("closure seeded in", ((Date.now() - t0) / 1000).toFixed(1), "s");

    const involved = lines.filter((line) => {
      const r = line.record;
      const views = line.views ?? {};
      return r?.type_code === "search_type" || Object.entries(views).some(([, h]) =>
        h.includes("card-list") || h.includes("search-no-results") || h.startsWith("CAPTURE_ERROR"));
    });

    // map raised TS errors into the sentinel the driver would emit
    const sentinel = (cls: string, msg: string): string => `CAPTURE_ERROR: ${cls}: ${msg.slice(0, 200)}`;
    const results: any[] = [];
    for (const line of involved) {
      for (const [view, expected] of Object.entries(line.views ?? {})) {
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
            ? "pass"
            : raised
              ? `WRONG-RAISE ${raised.cls}: ${raised.msg.slice(0, 150)}`
              : "OUTPUT-EXPECTED-RAISE";
        } else if (expected.startsWith('<span class="denied"')) {
          status = "denied-expected";
        } else if (raised) {
          status = `RAISED ${raised.cls}: ${raised.msg.slice(0, 150)}`;
        } else {
          const en = normalizeSlotIds(expected), an = normalizeSlotIds(actual ?? "");
          if (en === an) status = "pass";
          else {
            const at = [...en].findIndex((ch, i) => ch !== an[i]);
            status = `DIFF@${at} exp=${JSON.stringify(en.slice(Math.max(0, at - 40), at + 40))} got=${JSON.stringify(an.slice(Math.max(0, at - 40), at + 40))}`;
          }
        }
        results.push({ id: line.id, name: line.name, type: line.record?.type_code ?? null, view, ms, status, expectedLen: expected.length });
      }
    }
    const out = path.resolve(HERE, "../../../benchmarks/results/corpus-v2/search-census.json");
    writeFileSync(out, JSON.stringify(results, null, 1));
    const byStatus: Record<string, number> = {};
    for (const r of results) byStatus[r.status.split(" ")[0]] = (byStatus[r.status.split(" ")[0]] ?? 0) + 1;
    console.log("census:", results.length, "views;", JSON.stringify(byStatus));
    console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s ->", out);
    storage.close();
  });
});
