// Autolink two-page probe: render its two pages (11251 ANGELS,
// 18560 Delia Rosenquist) over the raw corpus and dump the engine state
// the phantom-item dispatch and the autolink depend on. PROBE ONLY —
// not a gate; skipped unless AUTOLINK_TWO_PAGE_PROBE=1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { skipLoud } from "../../support/describe-with-corpus.js";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "autolink-two-page-probe");

const REQUESTED = process.env.AUTOLINK_TWO_PAGE_PROBE === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

const PAGES = [
  { shard: "recapture-raw-shard-000007.jsonl", id: 11251, name: "IT'S ALL ABOUT ANGELS by Daniel Ferreira" },
  { shard: "recapture-raw-shard-000013.jsonl", id: 18560, name: "Delia Rosenquist" },
];

function loadOracleEntry(shard: string, id: number): { page_html?: string; layout?: string | null } {
  const p = path.join(PAGE_LANE_DIR, shard);
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.lane !== "page") continue;
      if ((obj as { id?: number }).id === id) return obj as { page_html?: string };
    } catch {
      continue;
    }
  }
  throw new Error(`no page-lane entry for id ${id} in ${shard}`);
}

describe("autolink two-page probe", () => {
  it(
    "renders the two probe pages and dumps engine verdict state",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REQUESTED) {
        skipLoud(ctx, "tests/card/render/autolink-two-page-probe.test.ts", "REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      const lines: string[] = [];
      for (const entry of PAGES) {
        const oracle = loadOracleEntry(entry.shard, entry.id);
        const expected = oracle.page_html ?? "";
        const actual = await storage.engine.renderPage(entry.name);
        const expN = normalizeSlotIds(expected);
        const actN = normalizeSlotIds(actual);
        const diff = byteDiff(expN, actN);
        lines.push(
          JSON.stringify({
            id: entry.id,
            name: entry.name,
            verdict: diff.equal ? "pass" : "fail",
            expBytes: diff.expectedBytes,
            actBytes: diff.actualBytes,
            firstDiff: diff.firstDifference
              ? {
                  offset: diff.firstDifference.codeUnitOffset,
                  expectedExcerpt: diff.firstDifference.expectedExcerpt,
                  actualExcerpt: diff.firstDifference.actualExcerpt,
                }
              : null,
          }),
        );
        writeFileSync(path.join(OUT_DIR, `${entry.id}.exp.html`), expN);
        writeFileSync(path.join(OUT_DIR, `${entry.id}.act.html`), actN);
      }

      // Engine state the phantom dispatch reads: the verdict map for the
      // Kimberly item key, and whether the Anonymous readable set carries
      // the *all+*read rule id. Verdicts are keyed per (host, item) —
      // Ruby's phantom is per-nest — so the lookup names the page's own
      // +musings host.
      const phantomKey =
        "kimberly_sensei_do_not_contribute_directly_to_example.com_at_this_time";
      const phantomHostKey = "delia_rosenquist+musing";
      const engine = storage.engine as unknown as {
        pointerItemVerdict?: (
          hostKey: string,
          k: string,
        ) => { read: boolean; create: boolean | undefined } | undefined;
        pointerItemVerdicts?: Map<string, unknown>;
        readPermission?: { readableRuleIds?: Set<number>; parties?: number[] };
      };
      const verdict = engine.pointerItemVerdict?.(phantomHostKey, phantomKey);
      const verdictsDump: Array<Record<string, unknown>> = [];
      for (const [k, v] of engine.pointerItemVerdicts ?? []) {
        verdictsDump.push({ key: k, verdict: v });
      }
      const rp = engine.readPermission;
      lines.push(
        JSON.stringify({
          probe: "verdicts",
          phantomVerdict: verdict ?? null,
          verdictsCount: verdictsDump.length,
          kimberlyVerdicts: verdictsDump.filter((v) =>
            String(v.key).includes("kimberly"),
          ),
          kimberlyHostVerdict:
            verdictsDump.filter((v) => String(v.key).endsWith(`|${phantomKey}`)),
          readableRuleIdsHas6568: rp?.readableRuleIds?.has(6568) ?? null,
          readableRuleIdsSize: rp?.readableRuleIds?.size ?? null,
          parties: rp?.parties ?? null,
        }),
      );

      writeFileSync(path.join(OUT_DIR, "results.jsonl"), lines.join("\n") + "\n");
      console.log(`LANE-P20-AUTOLINK-PROBE\n${lines.join("\n")}`);
      expect(lines.length).toBe(PAGES.length + 1);
      storage.close();
    },
  );
});
