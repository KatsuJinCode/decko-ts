// dump-view-lane-fails-lane.test.ts -- failure-dump companion to
// tools/oracle/verify-dual-lane.test.ts (read-only analysis spec; grades the
// view lane and writes every failure's full expected/actual bytes to disk so
// fail classes can be decomposed by inspection).
//
// The judge (tools/oracle/verify-dual-lane.test.ts) keeps only per-phase
// aggregate counts on disk; its failures array lives only in memory and the
// enumeration aggregate is overwritten by every phase. This spec replays the
// IDENTICAL view-lane protocol (same loader, same seeding, same handlers,
// same classification branches) and persists per-failure detail:
//
//   $VIEW_FAIL_DUMP_DIR/view-fails.jsonl     one line per failure
//   $VIEW_FAIL_DUMP_DIR/html/<key>.expected.html / .actual.html
//
// Shard selection comes from DUAL_LANE_FILES (comma list of view-lane shard
// names); when unset, every recapture-raw-shard-*.jsonl in the view-lane
// corpus is graded. The corpus is read from
// <repo>/tmp/raw-ground-truth/expected-v2/view-lane and the output dir is
// VIEW_FAIL_DUMP_DIR (default <repo>/tmp/raw-ground-truth/enumeration/
// view-fail-dump). Both env vars must be set for the suite to run at all —
// it skips otherwise, so a plain vitest run never grades as a side effect.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it } from "vitest";
import {
  HandlerRegistry,
  jsonValue,
  renderBytes,
  raisedError,
  type ReplayEntry,
} from "../../src/testing/replay.js";
import { compareNormalized } from "../../src/testing/diff.js";
import {
  canonicalJson,
  cardRecordWithoutId,
  formatCaptureError,
  isCaptureErrorSentinel,
} from "../../src/testing/fixture-schema.js";
import { UnsupportedViewError } from "../../src/card/render.js";
import type { CapturedCardRecord } from "../../src/testing/fixture-schema.js";
import type { CardRecordWithoutId } from "../../src/testing/fixture-schema.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structuredCardContent,
} from "../../src/card/rules/structure.js";
import { createRawStructureSeededStorage, RAW_CORPUS_DB } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const EXPECTED_V2_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2");
const VIEW_LANE_DIR = path.join(EXPECTED_V2_DIR, "view-lane");
const OUT_DIR =
  process.env.VIEW_FAIL_DUMP_DIR !== undefined && process.env.VIEW_FAIL_DUMP_DIR !== ""
    ? path.resolve(process.env.VIEW_FAIL_DUMP_DIR)
    : path.join(REPO_ROOT, "tmp", "raw-ground-truth", "enumeration", "view-fail-dump");

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;
const EXCERPT_RADIUS = 400;

function requestedViewShards(): string[] {
  const list = process.env.DUAL_LANE_FILES;
  if (list) {
    const names = list.split(",").map((s) => s.trim()).filter((s) => s !== "");
    for (const name of names) {
      if (!existsSync(path.join(VIEW_LANE_DIR, name))) {
        throw new Error(`DUAL_LANE_FILES entry not found in view lane: ${name}`);
      }
    }
    return names;
  }
  const names: string[] = [];
  for (const f of readdirSync(VIEW_LANE_DIR)) {
    if (SHARD_RE.test(f)) names.push(f);
  }
  return names.sort();
}

interface ViewLaneLine {
  id: number;
  lane: "view";
  name: string;
  record?: CapturedCardRecord;
  views?: Record<string, string>;
  error?: unknown;
}

/** Failure-signature classification -- verify-dual-lane.test.ts
 *  classifyFailure verbatim (both excerpt params kept for the page-shape
 *  branch, which the judge also evaluates on view-lane entries). */
export function classifyFailure(
  first: string,
  expectedExcerpt: string,
  actualExcerpt: string,
): string {
  if (first.includes("fixture expects a raised error (CAPTURE_ERROR sentinel)")) {
    const m = /expected excerpt: CAPTURE_ERROR: ([^:]+):/.exec(first);
    return `capture_error_still_raised:${m ? m[1] : "unknown"}`;
  }
  if (first.includes("but the fixture expects a successful result")) {
    const m = /handler raised ([^:]+):/.exec(first);
    return `handler_raised:${m ? m[1] : "unknown"}`;
  }
  if (/<!DOCTYPE/i.test(expectedExcerpt) && !/<!DOCTYPE/i.test(actualExcerpt)) {
    return "engine_output_not_page_shaped";
  }
  if (
    /expected excerpt:[^\n]*(class="denied"|Sorry, you don't have permission)/.test(first) ||
    /actual excerpt:[^\n]*(class="denied"|Sorry, you don't have permission)/.test(first)
  ) {
    return "permission_denied_mismatch";
  }
  if (first.includes("card not in seeded deck")) {
    return "name_not_in_seeded_deck";
  }
  if (first.includes("nest target not found")) {
    return "nest_target_not_found";
  }
  return "byte-diff";
}

function excerptOf(text: string, center: number, radius: number): string {
  const start = Math.max(0, center - radius);
  const end = Math.min(text.length, center + radius);
  const body = text.slice(start, end);
  const head = start > 0 ? "..." : "";
  const tail = end < text.length ? "..." : "";
  return `${head}${body}${tail}`;
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

// Env-gated: this spec replays 48 shards over the full corpus seed (30+
// minutes, 3GB processes) and must NEVER auto-run in an ordinary vitest
// sweep. The lane orchestrator (tmp/viewkeys-fresh-process-sweep.mjs) sets
// both env vars; without them the file is a no-op.
describe.skipIf(
  process.env.DUAL_LANE_FILES === undefined || process.env.VIEW_FAIL_DUMP_DIR === undefined,
)("dump-view-lane-fails", () => {
  it(
    "replays the view lane and dumps every failure's full bytes",
    { timeout: 86_400_000 },
    async () => {
      const shards = requestedViewShards();
      mkdirSync(OUT_DIR, { recursive: true });
      mkdirSync(path.join(OUT_DIR, "html"), { recursive: true });
      const jsonlPath = path.join(OUT_DIR, "view-fails.jsonl");

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));

      const registry = new HandlerRegistry();

      const registerCardEngine = (reg: HandlerRegistry): void => {
        reg.register("card-engine", async ({ name }) => {
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
          const typeName = typeCard?.name;
          let leftTypeName: string | undefined;
          if (card.leftId !== undefined) {
            const leftCard = await engine.fetchById(card.leftId);
            if (leftCard?.typeId !== undefined) {
              const leftTypeCard = await engine.fetchById(leftCard.typeId);
              leftTypeName = leftTypeCard?.name?.s;
            }
          }
          const isSimple = card.name === undefined || card.name.isSimple;
          const content = structuredCardContent(
            {
              name: card.name ?? "",
              id: card.id,
              typeId: card.typeId,
              typeName,
              leftTypeName,
              isNew: card.isNew,
            },
            card.dbContent,
            structureUniverseLocal,
          );
          const record: Omit<CapturedCardRecord, "id"> = {
            name: card.name?.s ?? "",
            key: card.key ?? "",
            type: typeCard?.name?.s ?? "",
            type_code: typeCode ?? "",
            codename: card.codename ?? null,
            content,
            left: isSimple ? null : (card.name?.leftName?.s ?? null),
            right: isSimple ? null : (card.name?.rightName?.s ?? null),
          };
          return jsonValue(record);
        });
      };

      const renderHandler = async ({ cardName, view }: { cardName: string; view: string }) => {
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
      };

      const viewEntries: ReplayEntry[] = [];
      const entryMeta = new Map<string, { name: string; view: string; shard: string; area: string }>();

      // structureUniverse is computed inside the try block of the judge; mirror
      // that order so seeding state matches exactly.
      const universeBatch = await storage.fetcher.driver.batch([
        structureRuleUniverseStatement(),
      ]);
      const structureUniverseLocal = structureUniverseFromResults(universeBatch[0]);

      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      registerCardEngine(registry);
      registry.register("render-engine", renderHandler);

      let entriesTotal = 0;
      let passTotal = 0;
      let failTotal = 0;
      const jsonlLines: string[] = [];

      for (const shard of shards) {
        const raw = readFileSync(path.join(VIEW_LANE_DIR, shard), "utf8");
        const lines: ViewLaneLine[] = [];
        for (const line of raw.split("\n")) {
          if (line.trim() === "") continue;
          const parsed = JSON.parse(line) as unknown;
          const obj = parsed as Record<string, unknown>;
          if (obj.lane !== "view") continue;
          lines.push(parsed as ViewLaneLine);
        }
        let shardEntries = 0;
        for (const line of lines) {
          if (line.error !== undefined && line.record === undefined && line.views === undefined) {
            continue; // whole-line capture error: counted by the judge, never graded
          }
          if (line.record) {
            const { id, ...rest } = line.record;
            void id;
            const eid = `dual-lane-view:${line.name}:record`;
            entryMeta.set(eid, { name: line.name, view: "(record)", shard, area: "card-engine" });
            viewEntries.push({
              id: eid,
              area: "card-engine",
              input: { name: line.name },
              expected: rest as CardRecordWithoutId,
            });
            shardEntries += 1;
          }
          if (line.views) {
            for (const [view, html] of Object.entries(line.views)) {
              const eid = `dual-lane-view:${line.name}:render:${view}`;
              entryMeta.set(eid, { name: line.name, view, shard, area: "render-engine" });
              viewEntries.push({
                id: eid,
                area: "render-engine",
                input: { cardName: line.name, view },
                expected: html,
              });
              shardEntries += 1;
            }
          }
        }

        // Replay with full-bytes capture: same handler, same normalization.
        for (const entry of viewEntries) {
          const handler = registry.get(entry.area)!;
          const outcome = await handler(entry.input as never);
          const expectedStr =
            entry.area === "render-engine"
              ? entry.expected
              : canonicalJson(entry.expected as unknown);
          let actualStr: string;
          if (outcome.kind === "error") {
            actualStr = formatCaptureError(outcome.errorClass, outcome.message);
          } else if (outcome.kind === "bytes") {
            actualStr = outcome.bytes;
          } else if (
            entry.area === "card-engine" &&
            outcome.value !== null &&
            typeof outcome.value === "object"
          ) {
            actualStr = canonicalJson(cardRecordWithoutId(outcome.value as CapturedCardRecord));
          } else {
            actualStr = canonicalJson(outcome.value);
          }
          const diff = compareNormalized(expectedStr, actualStr, EXCERPT_RADIUS);
          // Judge-identical signature: same 48-char excerpt radius the judge
          // diffs with, so regex-based sig branches see identical text.
          const diffJudge = compareNormalized(expectedStr, actualStr, 48);
          entriesTotal += 1;
          if (diff.equal) {
            passTotal += 1;
            continue;
          }
          failTotal += 1;
          const meta = entryMeta.get(entry.id)!;
          const first = diff.firstDifference!;
          const firstJudge = diffJudge.firstDifference!;
          const detailParts: string[] = [];
          const expectsSentinel =
            entry.area === "render-engine" &&
            typeof entry.expected === "string" &&
            isCaptureErrorSentinel(entry.expected);
          if (expectsSentinel && outcome.kind !== "error") {
            detailParts.push(
              "fixture expects a raised error (CAPTURE_ERROR sentinel) but the handler returned output",
            );
          }
          if (!expectsSentinel && outcome.kind === "error") {
            detailParts.push(
              `handler raised ${outcome.errorClass}: ${outcome.message} but the fixture expects a successful result`,
            );
          }
          const firstMsg =
            `FAIL ${entry.id} (${entry.area})\n` +
            (detailParts.length ? `  ${detailParts.join("; ")}\n` : "") +
            `  first difference at code-unit offset ${firstJudge.codeUnitOffset} (byte offset ${firstJudge.byteOffset}): expected ${firstJudge.expectedChar} but got ${firstJudge.actualChar}\n` +
            `  expected excerpt: ${firstJudge.expectedExcerpt}\n` +
            `  actual excerpt:   ${firstJudge.actualExcerpt}\n` +
            `  sizes: expected ${diff.expectedBytes} bytes, actual ${diff.actualBytes} bytes`;
          const sig = classifyFailure(
            firstMsg,
            firstJudge.expectedExcerpt,
            firstJudge.actualExcerpt,
          );
          const key = `${slug(shard.replace(/[^\d]/g, ""))}-${slug(meta.name)}-${slug(meta.view)}`;
          writeFileSync(path.join(OUT_DIR, "html", `${key}.expected.html`), expectedStr, "utf8");
          writeFileSync(path.join(OUT_DIR, "html", `${key}.actual.html`), actualStr, "utf8");
          jsonlLines.push(
            JSON.stringify({
              id: entry.id,
              sig,
              shard: meta.shard,
              name: meta.name,
              view: meta.view,
              area: entry.area,
              codeUnitOffset: first.codeUnitOffset,
              byteOffset: first.byteOffset,
              expectedBytes: diff.expectedBytes,
              actualBytes: diff.actualBytes,
              expectedExcerpt: first.expectedExcerpt,
              actualExcerpt: first.actualExcerpt,
              expectedChar: first.expectedChar,
              actualChar: first.actualChar,
              dumpKey: key,
            }) + "\n",
          );
        }
        viewEntries.length = 0;
        entryMeta.clear();
        console.log(
          `[dump] shard=${shard} entries=${shardEntries} running: pass=${passTotal} fail=${failTotal}`,
        );
      }

      writeFileSync(jsonlPath, jsonlLines.join(""), "utf8");
      console.log(
        `[dump] DONE shards=${shards.length} entries=${entriesTotal} pass=${passTotal} fail=${failTotal} jsonl=${jsonlPath}`,
      );

      storage.close();
    },
  );
});
