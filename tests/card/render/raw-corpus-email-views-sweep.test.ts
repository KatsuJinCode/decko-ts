// raw-corpus-email-views-sweep.test.ts -- THIS SUITE's sweep runner (not a
// pin): renders every page of the pass-20 email-views class (the
// roleviews leftovers 1-4: the EmailTemplate `:core =
// render_read_form` family, the Abstract::TestContext / email_text
// message pages, and Shark) over the full-deck corpus seed and reports,
// per page: is the page byte-exact against the captured oracle bytes,
// and does the engine still emit any `view (X) not supported` alert?
//
//   EMAIL_SWEEP=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-email-views-sweep.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Instrument modeled on raw-corpus-roleviews-sweep.test.ts (same loader,
// same oracle source, same byteDiff/normalizeSlotIds pairing). The page
// list is the 12 notification-family pages that roleviews' sweep measured
// non-byte-exact at its tip (its sweep-results.json), plus `welcome
// email` (the fifth EmailTemplate-typed card in the corpus, id 33948,
// which has a page capture but no message-child captures) and Shark
// (roleviews leftover 4).

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "email-views-sweep");

const SWEEP_REQUESTED = process.env.EMAIL_SWEEP === "1";

/** The pass-20 email-views class population (see header). */
const CLASS_EMAIL_VIEWS = [
  "follower notification email", "follower notification email+*html message",
  "follower notification email+*text message", "password reset email",
  "password reset email+*html message", "password reset email+*text message",
  "signup alert email", "signup alert email+*html message",
  "signup alert email+*text message", "verification email",
  "verification email+*html message", "verification email+*text message",
  "welcome email",
  "Shark",
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

describe("raw-corpus email-views class sweep", () => {
  it("renders the 14-page email-views class and records byte verdicts", { timeout: 1_800_000 }, async (ctx) => {
    if (!SWEEP_REQUESTED) { ctx.skip(); return; }
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

    const oracleByPage = loadOraclePageEntries(CLASS_EMAIL_VIEWS);
    mkdirSync(OUT_DIR, { recursive: true });

    const results: Array<Record<string, unknown>> = [];
    let alertFree = 0, byteExact = 0, stillRaise = 0;
    for (const name of CLASS_EMAIL_VIEWS) {
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
      const uniq = [...new Set(unsupportedViews)];
      if (raised === null && unsupportedViews.length === 0) alertFree += 1;
      if (raised !== null) stillRaise += 1;
      if (diff.equal) byteExact += 1;
      const verdict = raised !== null
        ? `RAISE ${raised}`
        : diff.equal
          ? "BYTE-EXACT"
          : `BYTE-DIFF@${diff.firstDifference?.codeUnitOffset}${uniq.length > 0 ? ` unsupported:[${uniq.join(",")}]` : ""}`;
      results.push({ name, verdict, unsupportedViews: uniq });
      const base = name.replace(/[^\w.-]+/g, "_");
      writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
      writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actualN);
    }
    const summary = {
      total: CLASS_EMAIL_VIEWS.length,
      alertFree,
      byteExact,
      stillRaise,
    };
    writeFileSync(path.join(OUT_DIR, "sweep-results.json"), JSON.stringify({ summary, results }, null, 1));
    console.log("SWEEP SUMMARY:", JSON.stringify(summary));
    for (const r of results) console.log(`${r.verdict}  ${r.name}`);
    expect(summary.total).toBe(CLASS_EMAIL_VIEWS.length);
  });
});
