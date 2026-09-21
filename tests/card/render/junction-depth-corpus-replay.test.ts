// Corpus proof for the depth-3+ junction closure fix (deploy-notes finding 2):
// replays the captured Ruby views of corpus entries whose content nests a
// depth-3+ junction reference (the exact class the replay driver used to
// classify as the "nest gap" - failures containing 'nest target not found')
// and requires byte-identical HTML.
//
// Entry 3360 (shard-000002) is a depth-3 junction card
// ("iimvszurewpkg+kvypbzbzhcjjwar+cfvoytpxlh") whose content nests the
// depth-5 junction "iimvszurewpkg+...+xptdirwqgothvb". Before the fix the
// prefetcher never resolved that target (NULL-key junction rows deeper than
// two parts) and the render threw where Ruby rendered.
//
// Seeding mirrors benchmarks/corpus-v2/replay-shard.test.ts: the shard's
// card rows come from bench-corpus-v2.sqlite3 and are inserted with the real
// decko convention (simple cards store name+key; junctions store NULL
// name/key + side ids). Byte comparison goes through the replay harness
// (slot-id normalization both sides, docs/replay-harness.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  HandlerRegistry,
  formatReplayFailure,
  renderBytes,
  raisedError,
  replayEntries,
} from "../../../src/testing/replay.js";
import { UnsupportedViewError } from "../../../src/card/render.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_PATH = path.join(REPO_ROOT, "fixtures", "corpus", "shard-000002.jsonl");

interface ShardLine {
  id: number;
  name: string;
  views?: Record<string, string>;
}

/** The replay entries: corpus line ids whose content nests a depth-3+
 *  junction reference, with the views their capture recorded. */
const PROOF_ENTRIES: Array<{ id: number; views: readonly string[] }> = [
  { id: 3360, views: ["closed", "content", "open", "title"] },
];

describe("corpus replay: depth-3+ junction inclusion chains render byte-identically", () => {
  it(
    "replays the captured views of junction-chain entries from shard-000002",
    { timeout: 300_000 },
    async () => {
      const lines: ShardLine[] = readFileSync(SHARD_PATH, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      const byId = new Map(lines.map((l) => [l.id, l]));

      const storage = await createRenderTestStorage();
      const registry = new HandlerRegistry();
      try {
        // Seed the shard exactly like the replay driver (cards + type cards
        // that sit outside the shard).
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

        registry.register("render-engine", async ({ cardName, view }) => {
          try {
            const html = await storage.engine.render(cardName, view);
            return renderBytes(html);
          } catch (error) {
            if (error instanceof UnsupportedViewError) {
              return raisedError("Card::Error::UserError", error.message);
            }
            const err = error as Error;
            return raisedError(err?.constructor?.name ?? "Error", err?.message ?? String(error));
          }
        });

        const entries = [];
        for (const proof of PROOF_ENTRIES) {
          const line = byId.get(proof.id);
          if (line === undefined || line.views === undefined) {
            throw new Error(`corpus entry ${proof.id} not found in shard (or has no captured views)`);
          }
          for (const view of proof.views) {
            const expected = line.views[view];
            if (expected === undefined) {
              throw new Error(`corpus entry ${proof.id} has no captured view :${view}`);
            }
            entries.push({
              id: `corpus:${proof.id}:render:${view}`,
              area: "render-engine" as const,
              input: { cardName: line.name, view },
              expected,
            });
          }
        }

        const report = await replayEntries(entries, registry);
        const failures = report.entries
          .filter((e) => e.status !== "pass")
          .map((e) => (e.status === "fail" ? formatReplayFailure(e) : `${e.id}: ${e.status}`));
        expect(failures).toEqual([]);
      } finally {
        storage.close();
      }
    },
  );
});
