// Corpus-v2 shard replay: replays the captured corpus fixtures
// (fixtures/corpus/shard-*.jsonl) through the LANDED engine handlers via the
// src/testing replay harness. This is the M1 corpus-scale replay driver.
//
// Registration scope (all landed):
//   - card-engine (fetch layer): replayed and judged here.
//   - render-engine: judged here against the SAME seeded deck (RenderEngine
//     over the fetch engine, exactly the production composition).
//   - name-engine / cql-engine / rules-engine: other areas; the corpus
//     capture records them only inside the card record / rendered views.
//
// Failure classification (the honest part of corpus-scale parity):
//   - structure-pending: Ruby's Card#content is structured_content ||
//     standard_content (card-1.110 content/all.rb) — a card under an
//     applicable *structure rule returns the RULE TEMPLATE, not db_content.
//     The port's rules/set-patterns layer is landed, but the replay seed
//     loads ONLY cards rows (no rule resolution context is captured), so a
//     mismatch whose expected content equals some *structure rule card's
//     stored content is classified structure-pending, never a parity bug.
//   - capture-error lines ({"error": ...}): recorded by capture-corpus.rb
//     when Ruby itself could not process the card (e.g. invalid-JSON search
//     content); they carry no expectations and are counted, not replayed.
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
// Run:
//   npx vitest run benchmarks/corpus-v2/replay-shard.test.ts           # all shards
//   CORPUS_SHARD=shard-000000.jsonl npx vitest run benchmarks/corpus-v2/replay-shard.test.ts

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  HandlerRegistry,
  jsonValue,
  renderBytes,
  raisedError,
  replayEntries,
  formatReplayFailure,
  type ReplayEntry,
} from "../../src/testing/replay.js";
import { UnsupportedViewError } from "../../src/card/render.js";
import type { CapturedCardRecord } from "../../src/testing/fixture-schema.js";
import type { CardRecordWithoutId } from "../../src/testing/fixture-schema.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../../tests/card/render/render-test-storage.js";

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
  error?: unknown;
}

function requestedShards(): string[] {
  const requested = process.env.CORPUS_SHARD;
  if (requested) {
    const p = path.join(SHARD_DIR, requested);
    if (!existsSync(p)) throw new Error(`CORPUS_SHARD not found: ${p}`);
    return [p];
  }
  const shards = existsSync(SHARD_DIR) ? readdirShards(SHARD_DIR) : [];
  if (shards.length === 0) {
    throw new Error(`no completed shards in ${SHARD_DIR} -- run the capture first`);
  }
  return shards.map((s) => path.join(SHARD_DIR, s));
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

interface ShardOutcome {
  shard: string;
  lines: number;
  captureErrorLines: number;
  records: { total: number; pass: number; structurePending: number; realFail: number };
  renders: { total: number; pass: number; structurePending: number; realFail: number };
}

describe("corpus v2 replay: full-payload oracle parity", () => {
  it(
    "replays card records and rendered views through the landed engine",
    { timeout: 3_600_000 },
    async () => {
      const shardPaths = requestedShards();
      const storage = await createRenderTestStorage();
      const registry = new HandlerRegistry();
      const outcomes: ShardOutcome[] = [];
      const realFailures: Array<{ shard: string; area: string; id: string; first: string }> = [];

      // *structure rule template contents, for the structure-pending class.
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

      try {
        for (const shardPath of shardPaths) {
          const lines = loadShard(shardPath);
          const shardName = path.basename(shardPath);

          // ---- seed the deck exactly like load-oracle-corpus.rb ------------
          const corpus = new Database(CORPUS_DB, { readonly: true });
          const ids = lines.map((l) => l.id);
          const rows: Array<{
            id: number;
            name: string | null;
            codename: string | null;
            left_id: number | null;
            right_id: number | null;
            trash: number;
            type_id: number;
            content: string | null;
          }> = [];
          const chunkSize = 500;
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            rows.push(
              ...(corpus
                .prepare(
                  `SELECT id, name, codename, left_id, right_id, trash, type_id, content
                   FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`
                )
                .all(...chunk) as typeof rows)
            );
          }
          // type cards may sit outside the shard: seed every referenced type card
          const typeIds = [...new Set(rows.map((r) => r.type_id))];
          const missingTypeIds = typeIds.filter((t) => !ids.includes(t));
          if (missingTypeIds.length > 0) {
            const typeRows = corpus
              .prepare(
                `SELECT id, name, codename, left_id, right_id, trash, type_id, content
                 FROM cards WHERE id IN (${missingTypeIds.map(() => "?").join(",")})`
              )
              .all(...missingTypeIds) as typeof rows;
            rows.push(...typeRows);
          }
          corpus.close();

          for (const row of rows) {
            await seedCard(storage, {
              id: row.id,
              name: row.name ?? undefined,
              codename: row.codename,
              leftId: row.left_id ?? undefined,
              rightId: row.right_id ?? undefined,
              trash: row.trash === 1,
              typeId: row.type_id,
              dbContent: row.content,
            });
          }

          // ---- handlers ------------------------------------------------------
          // card-engine: same shape as the fetch stream's own registration.
          registry.register("card-engine", async ({ name }) => {
            const card = await storage.fetcher.fetchByName(name);
            if (card === undefined) {
              return {
                kind: "error" as const,
                errorClass: "RuntimeError",
                message: `card not in seeded deck: ${name}`,
              };
            }
            const engine = storage.fetcher;
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

          // render-engine: the renderer stream's registration shape.
          registry.register("render-engine", async ({ cardName, view }) => {
            try {
              const html = await storage.engine.render(cardName, view);
              return renderBytes(html);
            } catch (error) {
              if (error instanceof UnsupportedViewError) {
                // render.rb#view_method raises Card::Error::UserError; the
                // capture records the en.yml message verbatim.
                return raisedError("Card::Error::UserError", error.message);
              }
              throw error;
            }
          });

          // ---- build corpus entries ----------------------------------------
          const entries: ReplayEntry[] = [];
          let captureErrorLines = 0;
          for (const line of lines) {
            if (line.error !== undefined && line.record === undefined && line.views === undefined) {
              captureErrorLines += 1;
              continue;
            }
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
            }
            if (line.views) {
              for (const [view, html] of Object.entries(line.views)) {
                entries.push({
                  id: `corpus:${line.id}:render:${view}`,
                  area: "render-engine",
                  input: { cardName: line.name, view },
                  expected: html,
                });
              }
            }
          }

          const report = await replayEntries(entries, registry);

          // ---- classify failures --------------------------------------------
          // A card whose Ruby content equals a *structure rule template is
          // structure-pending for BOTH areas: its captured record AND its
          // rendered views flowed from the rule template, not db_content.
          const entryById = new Map(entries.map((e) => [e.id, e]));
          const structurePendingIds = new Set(
            report.entries
              .filter((e) => e.area === "card-engine" && e.status === "fail")
              .filter((e) => {
                const entry = entryById.get(e.id);
                if (entry === undefined || entry.area !== "card-engine") return false;
                const expectedContent = (entry.expected as CardRecordWithoutId).content;
                return structureContents.has(expectedContent);
              })
              .map((e) => e.id.split(":")[1])
          );

          const cardEntries = report.entries.filter((e) => e.area === "card-engine");
          const renderEntries = report.entries.filter((e) => e.area === "render-engine");
          const cardFails = cardEntries.filter((e) => e.status === "fail");
          const renderFails = renderEntries.filter((e) => e.status === "fail");
          const cardStructurePending = cardFails.filter((e) =>
            structurePendingIds.has(e.id.split(":")[1])
          );
          const renderStructurePending = renderFails.filter((e) =>
            structurePendingIds.has(e.id.split(":")[1])
          );
          const cardReal = cardFails.filter((e) => !cardStructurePending.includes(e));
          const renderReal = renderFails.filter((e) => !renderStructurePending.includes(e));

          for (const e of cardReal) {
            realFailures.push({
              shard: shardName,
              area: "card-engine",
              id: e.id,
              first: formatReplayFailure(e),
            });
          }
          for (const e of renderReal) {
            realFailures.push({
              shard: shardName,
              area: "render-engine",
              id: e.id,
              first: formatReplayFailure(e),
            });
          }

          outcomes.push({
            shard: shardName,
            lines: lines.length,
            captureErrorLines,
            records: {
              total: cardEntries.length,
              pass: cardEntries.filter((e) => e.status === "pass").length,
              structurePending: cardStructurePending.length,
              realFail: cardReal.length,
            },
            renders: {
              total: renderEntries.length,
              pass: renderEntries.filter((e) => e.status === "pass").length,
              structurePending: renderStructurePending.length,
              realFail: renderReal.length,
            },
          });

          // cache reset between shards: the next shard's seed INSERTs must be
          // seen by the fetch engine (its Temporary cache would otherwise
          // serve the previous shard's rows for reused ids/names).
          storage.counting.reset();
        }

        // ---- aggregate + write results --------------------------------------
        const total = {
          shards: outcomes.length,
          lines: outcomes.reduce((a, o) => a + o.lines, 0),
          captureErrorLines: outcomes.reduce((a, o) => a + o.captureErrorLines, 0),
          records: {
            total: outcomes.reduce((a, o) => a + o.records.total, 0),
            pass: outcomes.reduce((a, o) => a + o.records.pass, 0),
            structurePending: outcomes.reduce((a, o) => a + o.records.structurePending, 0),
            realFail: outcomes.reduce((a, o) => a + o.records.realFail, 0),
          },
          renders: {
            total: outcomes.reduce((a, o) => a + o.renders.total, 0),
            pass: outcomes.reduce((a, o) => a + o.renders.pass, 0),
            structurePending: outcomes.reduce((a, o) => a + o.renders.structurePending, 0),
            realFail: outcomes.reduce((a, o) => a + o.renders.realFail, 0),
          },
          real_failures: realFailures.slice(0, 25),
          real_failure_count: realFailures.length,
        };
        mkdirSync(RESULTS_DIR, { recursive: true });
        writeFileSync(
          path.join(RESULTS_DIR, "replay-full-results.json"),
          JSON.stringify({ aggregate: total, shards: outcomes }, null, 2) + "\n"
        );
        console.log(JSON.stringify(total, null, 2));

        // The M1 claim: zero real failures at corpus scale. Structure-pending
        // mismatches are a status (documented dependency), never a pass.
        expect(
          total.records.realFail,
          `real card-engine failures: ${total.records.realFail} (see ${RESULTS_DIR}/replay-full-results.json)`
        ).toBe(0);
        expect(
          total.renders.realFail,
          `real render-engine failures: ${total.renders.realFail} (see ${RESULTS_DIR}/replay-full-results.json)`
        ).toBe(0);
      } finally {
        storage.close();
      }
    }
  );
});
