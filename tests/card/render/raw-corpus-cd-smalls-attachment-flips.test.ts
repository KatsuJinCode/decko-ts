// raw-corpus-cd-smalls-attachment-flips.test.ts -- the cd-smalls lane's
// fresh-process flip measurement for the attachment-filename-case class
// (7 pages): render each page against the raw-corpus seed and compare the
// served img-src attachment URL region with the oracle page-lane bytes.
// Fresh-process protocol (the page triage's instrument hazard): this test
// is env-gated and runs in its own vitest process, so the before/after
// counts are honest per-phase numbers.
//
// RUN (explicitly; needs the machine-local raw corpus + page-lane shards):
//   CD_SMALLS_FLIPS=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-cd-smalls-attachment-flips.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine the spec skips.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const REPLAY_REQUESTED = process.env.CD_SMALLS_FLIPS === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The 7 attachment-filename-case pages (single-diff pages; the diff is the
 *  img src extension case). */
const PAGES = [
  "Iris McGinnis",
  "soul",
  "Mikaela Keepin",
  "Andrew Porter",
  "Pacifica Graduate Institute",
  "Henry Corbin",
  "Paula Craig Birthday - Dallas 2013",
] as const;

function loadOraclePageEntries(wanted: ReadonlyArray<string>): Map<string, string> {
  const byName = new Map(wanted.map((n) => [n, n]));
  const out = new Map<string, string>();
  for (const f of readdirSync(PAGE_LANE_DIR)) {
    if (!f.startsWith("recapture-raw-shard-") || !f.endsWith(".jsonl")) continue;
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, f), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const parsed = JSON.parse(line) as { lane?: string; name?: string; page_html?: string };
      if (parsed.lane !== "page" || parsed.name === undefined) continue;
      if (byName.has(parsed.name) && !out.has(parsed.name)) {
        out.set(parsed.name, parsed.page_html ?? "");
      }
    }
  }
  return out;
}

describe("raw-corpus cd-smalls attachment-filename-case flips (7 pages)", () => {
  it(
    "serves the oracle's lowercased attachment URLs on every class page",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const oracle = loadOraclePageEntries(PAGES);
      expect(oracle.size).toBe(PAGES.length);

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

      let flipped = 0;
      const report: string[] = [];
      for (const name of PAGES) {
        const expected = normalizeSlotIds(oracle.get(name) ?? "");
        const actual = normalizeSlotIds(await storage.engine.renderPage(name));
        // The class's single diff region: the img src attachment URL. The
        // page flips when the engine's served attachment URLs all appear in
        // the oracle bytes (every uppercase JPG/PNG src gone).
        const actUrls = [...actual.matchAll(/src="(http:\/\/s3\.amazonaws\.com\/\/files\/[^"]+)"/g)]
          .map((m) => m[1]);
        const missing = actUrls.filter((u) => !expected.includes(u));
        const diff = byteDiff(expected, actual);
        if (missing.length === 0) flipped += 1;
        report.push(
          `${name}: urls=${actUrls.length} missing-in-oracle=${missing.length} ` +
            `byteDiff=${diff.equal ? "EQUAL" : `first=${JSON.stringify(diff.firstDifference)}`}`,
        );
        for (const m of missing.slice(0, 3)) report.push(`    STILL-SERVED: ${m}`);
      }
      console.log(`FLIP REPORT (${flipped}/${PAGES.length} attachment-URL flips):\n${report.join("\n")}`);

      storage.close();
      // The class contract: no page serves an attachment URL the oracle
      // doesn't carry (the extension-case divergence is gone on all 7).
      expect(flipped).toBe(PAGES.length);
    },
  );
});
