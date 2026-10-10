// raw-corpus-raise-leadview-sweep.test.ts -- this suite's sweep runner (not a
// pin): renders every page of the two triage classes (pass15-page-fail-
// classes.md, tips 017b182) over the full-deck corpus seed and reports the
// flip evidence per page: raise gone? lead/configs render-error gone?
// byte-exact vs the yardstick? Env-gated like the census specs.
//
//   RAISE_LEADVIEW_SWEEP=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-raise-leadview-sweep.test.ts \
//     --maxWorkers=2 --no-file-parallelism

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { skipLoud } from "../../support/describe-with-corpus.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "raise-leadview-sweep");

const SWEEP_REQUESTED = process.env.RAISE_LEADVIEW_SWEEP === "1";

/** The full triage populations (pass15-page-fail-classification.json,
 *  primary class in {engine-raise-divergence, engine-gap:unsupported-view}). */
const CLASS_RAISE = [
  "20190319", "Administrator+*members", "Shark+*members", "20220323",
  "ABC+*members", "Advisory+*members", "AiBerk+*members", "Apprentice+*members",
  "CB_role+*members", "CDKLMSW+*members", "Contributor+*members",
  "Earth House staff+*members", "Epworth UMC+*members",
  "Free Aiki Dojo Member+*members", "Gaming+*members",
  "Golden Bears Aikido Club Member+*members", "LW+*members",
  "Practicing+*members", "Private01+*members", "Private02+*members",
  "Team+*members", "Wagneer+*members", "Morgan Family+*members",
];

const CLASS_UNSUPPORTED = [
  "Administrator", "AiBerk", "Anyone", "Anyone Signed In", "CB_role",
  "Epworth UMC",
  "Free Aiki Dojo Member", "Gaming", "Golden Bears Aikido Club Member", "LW",
  "Practicing", "Private01", "Private02", "ABC", "CDKLMSW", "Contributor",
  "Team", "Morgan Family",
  "follower notification email", "follower notification email+*html message",
  "follower notification email+*text message", "password reset email",
  "password reset email+*html message", "password reset email+*text message",
  "signup alert email", "signup alert email+*html message",
  "signup alert email+*text message", "verification email",
  "verification email+*html message", "verification email+*text message",
  "Administrator+Dashboard", "Eagle", "Help Desk", "Shark",
];

function loadOraclePageEntries(wanted: string[]): Map<string, { page_html?: string; error?: string; id?: number }> {
  const set = new Set(wanted);
  const out = new Map();
  for (const f of readdirSync(PAGE_LANE_DIR)) {
    if (!f.startsWith("recapture-raw-shard-") || !f.endsWith(".jsonl")) continue;
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, f), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const parsed = JSON.parse(line) as { lane?: string; name?: string; page_html?: string; error?: string; id?: number };
      if (parsed.lane === "page" && parsed.name !== undefined && set.has(parsed.name)) {
        out.set(parsed.name, parsed);
      }
    }
  }
  return out;
}

describe("raw-corpus raise/leadview sweep", () => {
  it("renders both triage classes and records flip evidence", { timeout: 1_800_000 }, async (ctx) => {
    if (!SWEEP_REQUESTED) { skipLoud(ctx, "tests/card/render/raw-corpus-raise-leadview-sweep.test.ts", "SWEEP_REQUESTED"); return; }
    expect(existsSync(RAW_CORPUS_DB)).toBe(true);
    expect(existsSync(PAGE_LANE_DIR)).toBe(true);

    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const everyLiveId = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
    ).map((r) => r.id);
    idLister.close();
    const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(everyLiveId);

    const all = [...CLASS_RAISE, ...CLASS_UNSUPPORTED];
    const oracleByPage = loadOraclePageEntries(all);
    mkdirSync(OUT_DIR, { recursive: true });

    const results: Array<Record<string, unknown>> = [];
    let raiseGone = 0, leadGone = 0, byteExact = 0, stillRaise = 0;
    for (const name of all) {
      const oracle = oracleByPage.get(name);
      if (oracle === undefined) {
        results.push({ name, verdict: "NO-ORACLE" });
        continue;
      }
      const expected = normalizeSlotIds(oracle.error !== undefined ? String(oracle.error) : (oracle.page_html ?? ""));
      let actual: string;
      let raised: string | null = null;
      try {
        actual = await storage.engine.renderPage(name);
      } catch (error) {
        const err = error as Error;
        raised = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
        actual = `CAPTURE_ERROR: ${raised}`;
      }
      const actualN = normalizeSlotIds(actual);
      const diff = byteDiff(expected, actualN);
      const unsupportedViews = [...actualN.matchAll(/view \(([^)]*)\) not supported/g)].map((m) => m[1]);
      const hadRaise = CLASS_RAISE.includes(name);
      if (hadRaise && raised === null) raiseGone += 1;
      if (!hadRaise && unsupportedViews.length === 0) leadGone += 1;
      if (!hadRaise && unsupportedViews.includes("lead")) leadGone += 0; // still failing
      if (raised !== null) stillRaise += 1;
      if (diff.equal) byteExact += 1;
      const verdict = raised !== null
        ? `RAISE ${raised}`
        : diff.equal
          ? "BYTE-EXACT"
          : `BYTE-DIFF@${diff.firstDifference?.codeUnitOffset}${unsupportedViews.length > 0 ? ` unsupported:[${[...new Set(unsupportedViews)].join(",")}]` : ""}`;
      results.push({ name, verdict, cls: hadRaise ? "raise" : "unsupported" });
      const base = name.replace(/[^\w.-]+/g, "_");
      writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
      writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actualN);
    }
    const summary = {
      total: all.length,
      classRaise: CLASS_RAISE.length,
      classUnsupported: CLASS_UNSUPPORTED.length,
      class1_raiseGone: raiseGone,
      class2_unsupportedGone: leadGone,
      byteExact,
      stillRaise,
    };
    writeFileSync(path.join(OUT_DIR, "sweep-results.json"), JSON.stringify({ summary, results }, null, 1));
    console.log("SWEEP SUMMARY:", JSON.stringify(summary));
    for (const r of results) console.log(`${r.verdict}  ${r.name}`);
    expect(summary.total).toBe(all.length);
  });
});
