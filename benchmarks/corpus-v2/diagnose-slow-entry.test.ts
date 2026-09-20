// DIAGNOSTIC (temporary, not a landing gate): time each corpus replay entry
// on shard 0 and report the slowest, so a pathologically slow card can be
// identified and its mechanism fixed in the engine rather than guessed at.
// Run: npx vitest run benchmarks/corpus-v2/diagnose-slow-entry.test.ts

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard } from "../../tests/card/render/render-test-storage.js";
import { UnsupportedViewError } from "../../src/card/render.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_DIR = path.join(REPO_ROOT, "fixtures", "corpus");

interface ShardLine {
  id: number;
  name: string;
  record?: unknown;
  views?: Record<string, string>;
  error?: unknown;
}

describe("diagnose: per-entry corpus replay timing", () => {
  it("finds the slowest entries on the requested shard", { timeout: 1_800_000 }, async () => {
    const requested = process.env.CORPUS_SHARD;
    const shards = existsSync(SHARD_DIR) ? readdirSync(SHARD_DIR).filter((f) => /^shard-\d{6}\.jsonl$/.test(f)).sort() : [];
    const shardName = requested ?? shards[0];
    const shardPath = path.join(SHARD_DIR, shardName);
    const lines: ShardLine[] = readFileSync(shardPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l));

    const storage = await createRenderTestStorage();
    const timings: Array<{ id: string; ms: number; err?: string }> = [];
    try {
      const corpus = new Database(CORPUS_DB, { readonly: true });
      const ids = lines.map((l) => l.id);
      const rows: Array<{
        id: number; name: string | null; codename: string | null;
        left_id: number | null; right_id: number | null; trash: number;
        type_id: number; content: string | null;
      }> = [];
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        rows.push(...(corpus.prepare(
          `SELECT id, name, codename, left_id, right_id, trash, type_id, content FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`
        ).all(...chunk) as typeof rows));
      }
      const typeIds = [...new Set(rows.map((r) => r.type_id))];
      const missing = typeIds.filter((t) => !ids.includes(t));
      if (missing.length > 0) {
        rows.push(...(corpus.prepare(
          `SELECT id, name, codename, left_id, right_id, trash, type_id, content FROM cards WHERE id IN (${missing.map(() => "?").join(",")})`
        ).all(...missing) as typeof rows));
      }
      corpus.close();
      for (const row of rows) {
        await seedCard(storage, {
          id: row.id, name: row.name ?? undefined, codename: row.codename,
          leftId: row.left_id ?? undefined, rightId: row.right_id ?? undefined,
          trash: row.trash === 1, typeId: row.type_id, dbContent: row.content,
        });
      }
      console.log(`seeded ${rows.length} rows for ${shardName}`);

      const viewCount = lines.reduce((a, l) => a + (l.views ? Object.keys(l.views).length : 0), 0);
      console.log(`timing ${viewCount} render entries...`);
      let done = 0;
      for (const line of lines) {
        if (!line.views) continue;
        for (const [view] of Object.entries(line.views)) {
          const t0 = performance.now();
          let err: string | undefined;
          // 3s deadline per entry: anything past this is effectively hung —
          // log it and move on so the diagnostic finishes.
          const winner = await Promise.race([
            storage.engine.render(line.name, view).then(
              () => "ok" as const,
              (e) => "err:" + (e instanceof UnsupportedViewError ? "unsupported-view" : (e as Error).message.slice(0, 60))
            ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 3_000)),
          ]);
          if (winner === "timeout") err = "TIMEOUT>3s";
          else if (winner !== "ok") err = winner.slice(0, 80);
          const ms = performance.now() - t0;
          timings.push({ id: `${line.id}:${view}`, ms, err });
          done += 1;
          if (err?.startsWith("TIMEOUT")) {
            console.log(`  TIMEOUT ${line.id} ${JSON.stringify(line.name)} :${view}`);
          }
          if (done % 500 === 0) {
            console.log(`  ${done}/${viewCount} done`);
          }
        }
      }
      const timeouts = timings.filter((t) => t.err?.startsWith("TIMEOUT"));
      const top = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 15);
      console.log(`TIMEOUTS: ${timeouts.length}`, JSON.stringify(timeouts.slice(0, 20), null, 1));
      console.log("TOP 15 SLOWEST:", JSON.stringify(top, null, 1));
      expect(timings.length).toBeGreaterThan(0);
    } finally {
      storage.close();
    }
  });
});
