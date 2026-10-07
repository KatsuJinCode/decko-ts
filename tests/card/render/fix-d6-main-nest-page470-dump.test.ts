// tests/card/render/fix-d6-main-nest-page470-dump.test.ts — D6
// (fix-d6-layout-as-main) EVIDENCE ARM, not a pin.
//
// Renders page 470 "AsIn Layout" — the only captured page whose MAIN card's
// own content nests `{{_main}}` — through the sha-verified raw corpus copy
// and writes the bytes to an internal work log so the receipt
// can show the exact residual against the frozen oracle shard
// (expected-v2/page-lane/recapture-raw-shard-000000.jsonl entry id 470).
//
// GATE: FIX_D6_PROBE_DUMP=1. A clone without tmp/raw-ground-truth/ skips on
// the data reason, the same shape as the other env-opt-in replay suites.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "the work log", "fix-d6");
const DUMP_PATH = path.join(OUT_DIR, "page-470-rendered.html");
const ORACLE_PATH = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "page-lane",
  "recapture-raw-shard-000000.jsonl",
);

const REQUESTED = process.env.FIX_D6_PROBE_DUMP === "1";

describe("D6 evidence arm: page 470 layout-as-_main", () => {
  it(
    "dumps the rendered bytes and the normalized diff against the frozen shard",
    { timeout: 170_000 },
    async (ctx) => {
      if (!REQUESTED) {
        skipLoud(ctx, "tests/card/render/fix-d6-main-nest-page470-dump.test.ts", "REQUESTED");
        return;
      }
      expect(existsSync(RAW_CORPUS_DB), `raw corpus copy missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(existsSync(ORACLE_PATH), `oracle shard copy missing: ${ORACLE_PATH}`).toBe(true);

      const live = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        live.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
      ).map((r) => r.id);
      live.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      const actual = await storage.engine.renderPage("AsIn Layout");

      // The oracle record for page 470 (page-lane shard 0).
      const line = readFileSync(ORACLE_PATH, "utf8")
        .split("\n")
        .filter(Boolean)
        .find((l) => l.includes('"id":470,'));
      expect(line, "no page-lane oracle row for id 470").toBeDefined();
      const oracle = (JSON.parse(line as string) as { page_html: string }).page_html;

      const normOracle = normalizeSlotIds(oracle);
      const normActual = normalizeSlotIds(actual);
      const diff = byteDiff(normOracle, normActual);
      // Walk the residual: every position where the two normalized strings
      // stop agreeing, so the receipt can state the exact residue instead of
      // guessing at its source.
      const residual: Array<{ offset: number; oracle: string; actual: string }> = [];
      let cursor = 0;
      while (residual.length < 12) {
        let k = cursor;
        while (
          k < Math.max(normOracle.length, normActual.length) &&
          normOracle[k] === normActual[k]
        ) {
          k += 1;
        }
        if (k >= normOracle.length && k >= normActual.length) break;
        residual.push({
          offset: k,
          oracle: normOracle.slice(k, k + 60),
          actual: normActual.slice(k, k + 60),
        });
        cursor = k + 1;
      }

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(DUMP_PATH, actual);
      const report = {
        oracleBytes: oracle.length,
        renderedBytes: actual.length,
        normalizedOracleBytes: normOracle.length,
        normalizedRenderedBytes: normActual.length,
        normalizedEqual: diff.equal,
        firstDifference: diff.firstDifference ?? null,
        oracleSlotIdCount: (oracle.match(/data-slot-id=/g) ?? []).length,
        renderedSlotIdCount: (actual.match(/data-slot-id=/g) ?? []).length,
        oracleRawMainRegion: oracle.includes('<div id="main"><!DOCTYPE HTML>'),
        renderedRawMainRegion: actual.includes('<div id="main"><!DOCTYPE HTML>'),
        residualCount: residual.length,
        residual,
      };
      writeFileSync(path.join(OUT_DIR, "page-470-diff.json"), JSON.stringify(report, null, 2));
      console.log("[fix-d6] " + JSON.stringify({ ...report, residual: residual.length }));
    },
  );
});
