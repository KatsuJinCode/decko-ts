// perm-allow over-deny corpus replay -- the pass-15 triage's OPPOSITE
// permission class: pages where the engine DENIES a card Ruby's mod
// set-module ok_to_read? overrides grant (tmp/wrong-goal-hunt/
// pass15-page-fail-classes.md, sig permission_denied_mismatch + the four
// over-deny pages the perm-leak lane documented).
//
// The mechanism (gem-pinned + oracle-probed, see
// tmp/wrong-goal-hunt/perm-allow-ruby-probe/): thirteen mod set files define
// their own ok_to_read? -- right::head/script are unconditional `true`, the
// account family answers own_account?/own_email?, asset_output delegates to
// the left card. The generic stored-rule hash path denies exactly these
// cards' stored rules ("Help Desk" / "Anyone Signed In" role grants) while
// the capture-deck Ruby probe returns ok?(:read)=true for every named page.
//
// Two gated blocks (the perm-leak lane's replay shape):
//   1. THE NAMED OVER-DENY PAGES (hard assert): the four perm-leak-receipt
//      pages + the FOR CHILDREN'S CLASS+*self triage exemplar render
//      byte-identical to the frozen yardstick (expected-v2 page lane,
//      normalizeSlotIds-normalized). RED while the over-deny reproduces.
//   2. THE SWEEP (report-only): the triage's 17 permission_denied_mismatch
//      pages, one JSONL line each (denial-frame markers, sizes, first-diff
//      offset) -> tmp/perm-allow-replay/sweep-results.jsonl.
//
// RUN (machine-local raw corpus; PERM_ALLOW_REPLAY=1):
//   PERM_ALLOW_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/perm-allow-overdeny-corpus-replay.test.ts \
//     --no-file-parallelism

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "perm-allow-replay");

const REPLAY_REQUESTED = process.env.PERM_ALLOW_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The over-deny exemplars: four perm-leak-receipt pages (the engine's MAIN
 *  verdict denies where the capture deck's Ruby probe answers
 *  ok?(:read)=true) plus the triage's FOR CHILDREN'S CLASS+*self exemplar
 *  (its +*self+*head virtual rule-card bar over-denies in the rule-editor
 *  nav; 21 denial spans vs the oracle's 18 at the lane base). */
const OVER_DENY_PAGES = [
  "Anonymous+*account",
  "Anonymous+*account+*email",
  "FrAi+*right+*head",
  "GBA+*right+*head",
  "FOR CHILDREN’S CLASS+*self",
];

/** The triage's 17 permission_denied_mismatch pages
 *  (pass15-page-fail-classification.json, sig=permission_denied_mismatch). */
const TRIAGE_17 = [
  "FOR CHILDREN’S CLASS+*self",
  "GBA+*right+*layout+*self",
  "*watermark+*self",
  "signup alert email+*from",
  "Message+Conversation+*type plus right",
  "Social Media Distribution+Tactics",
  "Production+design+Graphics+Tactics",
  "Intellectual Property+Unsecured+*self",
  "Learning Pool+Slack Channel naming conventions most in use+*self",
  "Dungeons and Dragons+SCarol+*self",
  "Dungeons and Dragons+SCarol+Icewind Dale+Communications+*self",
  "Artificial Intelligence+anon_exchange_02+*self",
  "Artificial Intelligence+anon_exchange_03+*self",
  "Artificial Intelligence+anon_exchange_04+*self",
  "Aikido Shusekai+Writing+*self",
  "ConocoPhillips+*self",
  "Conflict Done Well Aikido Training at SSUMC+*self",
];

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
  error?: unknown;
}

async function loadYardstick(names: Set<string>): Promise<Map<string, PageLaneLine>> {
  const found = new Map<string, PageLaneLine>();
  const files = existsSync(PAGE_LANE_DIR)
    ? readdirSync(PAGE_LANE_DIR).filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f))
    : [];
  for (const file of files) {
    const rl = readline.createInterface({
      input: createReadStream(path.join(PAGE_LANE_DIR, file)),
    });
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (!line.includes("page")) continue;
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane !== "page") continue;
      if (names.has(obj.name) && !found.has(obj.name)) found.set(obj.name, obj);
    }
  }
  return found;
}

async function seedRawCorpusStorage(): Promise<ReturnType<typeof createRawStructureSeededStorage>> {
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
  return storage;
}

describe("perm-allow over-deny corpus replay (capture-deck Ruby-allowed pages)", () => {
  it(
    "renders the five over-deny pages byte-identical to the yardstick",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const yardstick = await loadYardstick(new Set(OVER_DENY_PAGES));
      const storage = await seedRawCorpusStorage();
      try {
        for (const name of OVER_DENY_PAGES) {
          const oracle = yardstick.get(name);
          expect(oracle, `no page-lane yardstick entry for ${name}`).toBeDefined();
          const expected = oracle?.page_html ?? "";
          const actual = await storage.engine.renderPage(name);
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          expect(
            diff.equal,
            `${name}: engine page must equal the yardstick page ` +
              `(exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits} code units` +
              `${diff.firstDifference ? `, first diff at ${diff.firstDifference.codeUnitOffset}` : ""}: ` +
              `${diff.firstDifference?.expectedExcerpt ?? ""} VS ${diff.firstDifference?.actualExcerpt ?? ""})`,
          ).toBe(true);
        }
      } finally {
        storage.close();
      }
    },
  );

  it(
    "sweeps the 17 permission_denied_mismatch pages and records flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const names = new Set(TRIAGE_17);
      const yardstick = await loadYardstick(names);
      const storage = await seedRawCorpusStorage();
      const lines: string[] = [];
      let pass = 0;
      let fail = 0;
      try {
        for (const name of TRIAGE_17) {
          const oracle = yardstick.get(name);
          const expected = oracle?.page_html ?? "";
          let actual: string;
          let renderError: string | null = null;
          try {
            actual = await storage.engine.renderPage(name);
          } catch (error) {
            const err = error as Error;
            renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
            actual = "";
          }
          const expN = normalizeSlotIds(expected);
          const actN = normalizeSlotIds(actual);
          const diff = byteDiff(expN, actN);
          if (diff.equal) pass++;
          else fail++;
          lines.push(
            JSON.stringify({
              name,
              verdict: diff.equal ? "pass" : "fail",
              renderError,
              missingYardstick: oracle === undefined,
              expCodeUnits: diff.expectedCodeUnits,
              actCodeUnits: diff.actualCodeUnits,
              firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              // The over-deny marker: the engine must carry NO MORE denial
              // spans than the oracle (act denied-span count <= exp's).
              expDeniedSpans: (expN.match(/class="denied"/g) ?? []).length,
              actDeniedSpans: (actN.match(/class="denied"/g) ?? []).length,
            }),
          );
        }
      } finally {
        storage.close();
      }
      writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
      console.error(`PERM-ALLOW SWEEP: ${pass}/${TRIAGE_17.length} byte-exact (${fail} fail)`);
      expect(pass + fail).toBe(TRIAGE_17.length);
    },
  );
});
