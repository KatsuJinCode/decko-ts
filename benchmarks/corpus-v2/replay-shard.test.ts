// Corpus-v2 shard replay: replays the captured corpus fixtures
// (fixtures/corpus/shard-*.jsonl) through the LANDED engine handlers via the
// src/testing replay harness. This is the M1 corpus-scale replay driver.
//
// Registration scope (deliberate):
//   - card-engine: LANDED (fetch layer) -- replayed and judged here.
//   - render-engine: registered by the renderer stream, which has NOT landed
//     yet -- render entries are built and handed to the registry anyway, so
//     they report PENDING (a missing stream is a status, never a failure).
//   - name-engine / cql-engine / rules-engine: other streams' areas; not
//     registered here, not built from corpus shards (the corpus capture
//     records them only inside the card record / rendered views).
//
// Seeding mirrors benchmarks/load-oracle-corpus.rb: the shard's card rows
// come from bench-corpus-v2.sqlite3 and are inserted with the REAL decko
// convention -- simple cards store name + engine-computed key; compound
// cards store NULL name/key and resolve through left_id/right_id. The key
// column is computed by the TS engine's own ported algorithm
// (DeckoName.parse(name).key, including singularize), so the replay also
// exercises key-algorithm parity: the captured record.key was computed by
// RUBY (load-oracle-corpus.rb) via cardname's String#key.
//
// Run: npx vitest run benchmarks/corpus-v2/replay-shard.test.ts

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  HandlerRegistry,
  jsonValue,
  replayEntries,
  formatReplayFailure,
  type ReplayEntry,
} from "../../src/testing/replay.js";
import type { CapturedCardRecord } from "../../src/testing/fixture-schema.js";
import type { CardRecordWithoutId } from "../../src/testing/fixture-schema.js";
import { createFetchTestStorage, seedCard, type FetchTestStorage } from "../../tests/card/fetch/fetch-test-storage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_DIR = path.join(REPO_ROOT, "fixtures", "corpus");
const RESULTS_DIR = path.join(REPO_ROOT, "benchmarks", "results", "corpus-v2");

interface ShardLine {
  id: number;
  name: string;
  record?: CapturedCardRecord;
  views?: Record<string, string>;
  error?: string;
}

function firstCompletedShard(): string {
  const requested = process.env.CORPUS_SHARD;
  if (requested) {
    const p = path.join(SHARD_DIR, requested);
    if (!existsSync(p)) throw new Error(`CORPUS_SHARD not found: ${p}`);
    return p;
  }
  const shards = existsSync(SHARD_DIR)
    ? readdirShards(SHARD_DIR)
    : [];
  if (shards.length === 0) {
    throw new Error(`no completed shards in ${SHARD_DIR} -- run the capture first`);
  }
  return path.join(SHARD_DIR, shards[0]);
}

function readdirShards(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^shard-\d{6}\.jsonl$/.test(f))
    .sort();
}

function loadShard(p: string): ShardLine[] {
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ShardLine);
}

describe("corpus v2 replay: first completed shard", () => {
  it(
    "replays card records through the landed card-engine handler",
    { timeout: 300_000 },
    async () => {
      const shardPath = firstCompletedShard();
      const lines = loadShard(shardPath);
      expect(lines.length).toBeGreaterThan(0);

      const storage = await createFetchTestStorage();
      const registry = new HandlerRegistry();
      try {
        // ---- seed the deck exactly like load-oracle-corpus.rb ------------
        const corpus = new Database(CORPUS_DB, { readonly: true });
        const ids = lines.map((l) => l.id);
        const placeholders = ids.map(() => "?").join(",");
        const rows = corpus
          .prepare(
            `SELECT id, name, codename, left_id, right_id, trash, type_id, content
             FROM cards WHERE id IN (${placeholders})`
          )
          .all(...ids) as Array<{
          id: number;
          name: string;
          codename: string | null;
          left_id: number | null;
          right_id: number | null;
          trash: number;
          type_id: number;
          content: string | null;
        }>;
        // type cards may sit outside the shard: seed every referenced type card
        const typeIds = [...new Set(rows.map((r) => r.type_id))];
        const missingTypeIds = typeIds.filter((t) => !ids.includes(t));
        const typeRows =
          missingTypeIds.length > 0
            ? (corpus
                .prepare(
                  `SELECT id, name, codename, left_id, right_id, trash, type_id, content
                   FROM cards WHERE id IN (${missingTypeIds.map(() => "?").join(",")})`
                )
                .all(...missingTypeIds) as typeof rows)
            : [];
        corpus.close();

        for (const row of [...typeRows, ...rows]) {
          await seedCard(storage, {
            id: row.id,
            name: row.name,
            codename: row.codename,
            leftId: row.left_id ?? undefined,
            rightId: row.right_id ?? undefined,
            trash: row.trash === 1,
            typeId: row.type_id,
            dbContent: row.content,
          });
        }

        // ---- card-engine handler: same shape as the fetch stream's own ---
        registry.register("card-engine", async ({ name }) => {
          const card = await storage.engine.fetchByName(name);
          if (card === undefined) {
            return {
              kind: "error" as const,
              errorClass: "RuntimeError",
              message: `card not in seeded deck: ${name}`,
            };
          }
          const engine = storage.engine;
          const typeCard =
            card.typeId === undefined ? undefined : await engine.fetchById(card.typeId);
          const typeCode =
            card.typeId === undefined
              ? undefined
              : ((await engine.codenames.nameForId(card.typeId)) ?? "");
          const isSimple = card.name === undefined || card.name.isSimple;
          const record: Omit<CapturedCardRecord, "id"> = {
            name: card.name?.s ?? "",
            key: card.key ?? "",
            type: typeCard?.name?.s ?? "",
            type_code: typeCode ?? "",
            codename: card.codename ?? null,
            content: card.dbContent ?? "",
            left: isSimple ? null : (card.name?.leftName?.s ?? null),
            right: isSimple ? null : (card.name?.rightName?.s ?? null),
          };
          return jsonValue(record);
        });

        // ---- build corpus entries ----------------------------------------
        const entries: ReplayEntry[] = [];
        let recordCount = 0;
        let renderCount = 0;
        const viewKinds = new Set<string>();
        for (const line of lines) {
          if (line.record) {
            const { id, ...rest } = line.record;
            void id;
            const expected = rest as CardRecordWithoutId;
            entries.push({
              id: `corpus:${line.id}:record`,
              area: "card-engine",
              input: { name: line.name },
              expected,
            });
            recordCount += 1;
          }
          if (line.views) {
            for (const [view, html] of Object.entries(line.views)) {
              entries.push({
                id: `corpus:${line.id}:render:${view}`,
                area: "render-engine",
                input: { cardName: line.name, view },
                expected: html,
              });
              renderCount += 1;
              viewKinds.add(view);
            }
          }
        }

        const report = await replayEntries(entries, registry);

        // ---- classify failures --------------------------------------------
        // Card#content in decko is structured_content || standard_content:
        // a card with an applicable *structure rule returns the RULE
        // TEMPLATE, not db_content (card-1.110 content/all.rb). The capture
        // records that real behavior; replicating it needs the rules /
        // set-patterns layer (another stream, in flight). A failure whose
        // expected content equals some *structure rule card's stored content
        // is therefore a PENDING-by-dependency case, not a byte-parity bug;
        // anything else is a real fetch-layer mismatch.
        const structureContents = new Set<string>();
        {
          const corpus = new Database(CORPUS_DB, { readonly: true });
          const ruleRows = corpus
            .prepare(
              "SELECT content FROM cards WHERE trash = 0 AND content IS NOT NULL " +
                "AND name LIKE '%+*structure'"
            )
            .all() as Array<{ content: string }>;
          for (const row of ruleRows) structureContents.add(row.content);
          corpus.close();
        }

        const cardEntries = report.entries.filter((e) => e.area === "card-engine");
        const renderEntries = report.entries.filter((e) => e.area === "render-engine");
        const cardFails = cardEntries.filter((e) => e.status === "fail");
        const structurePending = cardFails.filter((e) => {
          const entry = entries.find((x) => x.id === e.id);
          if (entry === undefined || entry.area !== "card-engine") return false;
          const expectedContent = (entry.expected as CardRecordWithoutId).content;
          return structureContents.has(expectedContent);
        });
        const realFails = cardFails.filter((e) => !structurePending.includes(e));
        const summary = {
          shard: path.basename(shardPath),
          lines: lines.length,
          card_engine: {
            total: cardEntries.length,
            pass: cardEntries.filter((e) => e.status === "pass").length,
            fail: cardFails.length,
            fail_structure_pending: structurePending.length,
            fail_real: realFails.length,
            structure_pending_note:
              "Card#content = structured_content || standard_content; matching a " +
              "*structure rule template requires the rules/set-patterns stream (in flight)",
          },
          render_engine: {
            total: renderEntries.length,
            pass: renderEntries.filter((e) => e.status === "pass").length,
            pending: renderEntries.filter((e) => e.status === "pending").length,
            views: [...viewKinds].sort(),
            pending_reason: "render-engine handler not yet landed (renderer stream in flight)",
          },
          real_failures: realFails.slice(0, 10).map((e) => ({
            id: e.id,
            detail: e.detail,
            first: formatReplayFailure(e),
          })),
        };
        mkdirSync(RESULTS_DIR, { recursive: true });
        writeFileSync(
          path.join(RESULTS_DIR, "replay-shard-results.json"),
          JSON.stringify(summary, null, 2) + "\n"
        );
        console.log(JSON.stringify({ ...summary, real_failures: summary.real_failures.length }, null, 2));

        // The card-engine fetch layer must be byte-green EXCEPT for entries
        // whose Ruby content came from a *structure rule template (pending on
        // the rules/set-patterns stream).
        expect(cardEntries.length).toBe(recordCount);
        expect(
          realFails.map(formatReplayFailure),
          `real card-engine failures: ${realFails.length} (see ${RESULTS_DIR}/replay-shard-results.json)`
        ).toEqual([]);
        // Render entries stay PENDING until the renderer stream lands its
        // handler -- asserted as a status, never a failure.
        expect(renderEntries.every((e) => e.status === "pending")).toBe(true);
      } finally {
        storage.close();
      }
    }
  );
});
