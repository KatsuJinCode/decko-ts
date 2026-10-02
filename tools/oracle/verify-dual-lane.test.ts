// verify-dual-lane.test.ts -- DUAL-LANE (expected-v2) ground-truth
// verification. Grades the TWO capture lanes of the corrected byte-parity exam
// SEPARATELY (the lane shapes are defined by their capture instrument,
// tools/oracle/capture-dual-lane-page-and-view.rb):
//
//   VIEW lane  -- tmp/raw-ground-truth/expected-v2/view-lane/*.jsonl
//       Same comparison as verify-recapture-raw.test.ts: engine view-function
//       output vs the bare `card.format.render(view)` bytes (schema identical
//       to the old expected/ shards plus a lane:"view" field). This number
//       tracks the old exam (baseline ~7,001-7,002 / 10,274: 6,588 records +
//       3,686 renders). Never live-page parity.
//
//   PAGE lane  -- tmp/raw-ground-truth/expected-v2/page-lane/*.jsonl
//       Engine page-shaped output vs the live-serving page bytes
//       (`card.format(:html).show(nil, {})` through the layout resolver with
//       main! context). This measures the surface the old exam could not see:
//       layout resolution, main-nest context, default view. EXPECTED TO FAIL
//       LOW until the engine ports the layout resolver and fixes
//       defaultNestView (src/card/render/format.ts defaultNestView returns
//       "titled"; live production resolves :content) -- a first-run baseline
//       near 0% page parity is the instrument working, not an instrument
//       failure.
//
// Engine page-shaped output today: the engine has NO page renderer, so the
// page-lane handler renders the oracle's layout_main_view.effective view
// through the bare renderer (falling back to "content", the production
// default_html_view, on capture-error lines where the oracle never resolved a
// main view). Once src/card/render grows the layout module, this handler is
// the seam to swap for a real page render.
//
// MODES
//   DUAL_LANE_REPORT_ONLY=1  report-only: print totals + failure signatures
//       and the aggregate JSON, NEVER fail the vitest run. Use this while the
//       page lane is expected to fail low.
//   (unset)                  hard gate: the run FAILS unless BOTH lanes reach
//       zero failures AND both lanes have entries. This is the exam gate for
//       when the engine reaches parity.
//
// PARTIAL-TREE DISCIPLINE (the capture writes shard pairs with resume-skip):
//   missing shard files are SKIP-NOT-FAIL per lane, every shard prints a
//   coverage line, and malformed/unexpected-lane lines are counted in the
//   coverage, never silently dropped. A mid-capture run still yields numbers.
//
// BLIND-SPOT FIX: whole-line CAPTURE_ERROR entries (Card.fetch returned nil)
// are COUNTED AND REPORTED per lane (the old verifier silently skipped 26 of
// them). Lane V counts them without grading (the runbook pins lane V
// byte-identity to the old shards; its per-view sentinels ARE graded as
// today). Lane P both counts AND grades them -- an error sentinel is a valid
// expected outcome there: an engine that renders a page where the oracle
// raised (or vice versa) is a class-1 parity failure, not a skip.
//
// NOT GRADED (metadata reported instead): lane P's layout/layout_rule/
// layout_main_view/format_main pin WHICH layout produced the bytes. The
// engine has no layout resolver to grade them against yet; the aggregate JSON
// reports their expected-side distribution so the resolver work has a target,
// and layout grading switches on with the resolver.
//
// OUT-OF-SCOPE DRIFT CLASSES (never engine failures; the exam contract is
// parity against the PINNED Ruby oracle, not today's live wire): post-snapshot
// gem upgrades (class-token ordering, data-slot-id attribute quoting, Decko
// version footer) and post-snapshot live content edits. The live-wire
// comparers exist only as instrument validation.
//
// CANONICAL HOME (instrument-reliability lane, 2026-10-01): this spec is the
// ground-truth measuring instrument and is TRACKED at
// tools/oracle/verify-dual-lane.test.ts -- the same tracked-instrument home
// pattern as the Ruby capture instrument. The copy in this directory is a
// gitignored per-worktree STAGING TARGET (this tree derives REPO_ROOT from its
// own three-levels-deep location and imports sibling raw-corpus-seeding.js, so
// it cannot live anywhere else): dual-lane-verifier-fast.mjs stages the
// canonical here when the default --spec path is used -- missing -> staged,
// identical -> kept, differing -> the run REFUSES. Lane experiments: pass an
// explicit --spec; the default path always runs the tracked instrument bytes.
//
// Run (hold tmp/slice-replay.lock):
//   DUAL_LANE_REPORT_ONLY=1 npx vitest run tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts
//   DUAL_LANE_FILES=recapture-raw-shard-000047.jsonl npx vitest run ...   # one shard
//   DUAL_LANE_REPORT_ONLY= npx vitest run ...                             # hard gate

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import {
  HandlerRegistry,
  jsonValue,
  renderBytes,
  raisedError,
  replayEntries,
  formatReplayFailure,
  type ReplayEntry,
} from "../../../src/testing/replay.js";
import { UnsupportedViewError } from "../../../src/card/render.js";
import type { CapturedCardRecord } from "../../../src/testing/fixture-schema.js";
import type { CardRecordWithoutId } from "../../../src/testing/fixture-schema.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structuredCardContent,
} from "../../../src/card/rules/structure.js";
import { createRawStructureSeededStorage, RAW_CORPUS_DB } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const EXPECTED_V2_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2");
const VIEW_LANE_DIR = path.join(EXPECTED_V2_DIR, "view-lane");
const PAGE_LANE_DIR = path.join(EXPECTED_V2_DIR, "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "enumeration");
const OUT_FILE = path.join(OUT_DIR, "dual-lane-verification-aggregate.json");

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;
/** Production resolves Cardio.config.default_html_view = :content (runbook
 *  section "five production-equivalent settings", item 5). Fallback main view
 *  for page-lane capture-error lines, where the oracle never resolved a main
 *  nest view. */
const PRODUCTION_DEFAULT_MAIN_VIEW = "content";

const REPORT_ONLY =
  process.env.DUAL_LANE_REPORT_ONLY !== undefined &&
  process.env.DUAL_LANE_REPORT_ONLY !== "0" &&
  process.env.DUAL_LANE_REPORT_ONLY !== "";

interface ViewLaneLine {
  id: number;
  lane: "view";
  name: string;
  record?: CapturedCardRecord;
  views?: Record<string, string>;
  error?: unknown;
}

interface PageLaneLine {
  id: number;
  lane: "page";
  name: string;
  layout?: string | null;
  layout_rule?: string | null;
  layout_main_view?: { raw: string | null; effective: string } | null;
  format_main?: boolean;
  page_html?: string;
  record?: CapturedCardRecord;
  error?: unknown;
}

interface ShardFile {
  name: string;
  viewPath: string | undefined;
  pagePath: string | undefined;
}

interface ShardCoverage {
  shard: string;
  view: { file: boolean; lines: number; malformed: number; laneMismatches: number; entries: number };
  page: { file: boolean; lines: number; malformed: number; laneMismatches: number; entries: number };
  missing: string;
}

function shardPaths(dir: string, name: string): string | undefined {
  const p = path.join(dir, name);
  return existsSync(p) ? p : undefined;
}

/** Shard-name selection. Explicit DUAL_LANE_FILES list must resolve in at
 *  least ONE lane (typo guard); the auto-discovered union of both lanes'
 *  shard files may be a partial tree -- missing files skip per lane. */
function requestedDualLaneShards(): ShardFile[] {
  const list = process.env.DUAL_LANE_FILES;
  if (list) {
    const names = list.split(",").map((s) => s.trim()).filter((s) => s !== "");
    const shards = names.map((name) => ({
      name,
      viewPath: shardPaths(VIEW_LANE_DIR, name),
      pagePath: shardPaths(PAGE_LANE_DIR, name),
    }));
    for (const s of shards) {
      if (s.viewPath === undefined && s.pagePath === undefined) {
        throw new Error(`DUAL_LANE_FILES entry not found in either lane: ${s.name}`);
      }
    }
    return shards;
  }
  const names = new Set<string>();
  for (const dir of [VIEW_LANE_DIR, PAGE_LANE_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (SHARD_RE.test(f)) names.add(f);
    }
  }
  return [...names].sort().map((name) => ({
    name,
    viewPath: shardPaths(VIEW_LANE_DIR, name),
    pagePath: shardPaths(PAGE_LANE_DIR, name),
  }));
}

interface LoadedLane<T> {
  lines: T[];
  malformed: number;
  laneMismatches: number;
}

function loadLane<T extends { lane: string }>(p: string, lane: string): LoadedLane<T> {
  const result: LoadedLane<T> = { lines: [], malformed: 0, laneMismatches: 0 };
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      result.malformed += 1;
      continue;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.lane !== lane) {
      result.laneMismatches += 1;
      continue;
    }
    result.lines.push(parsed as T);
  }
  return result;
}

/** Failure-signature classification. The first two branches and the last
 *  three mirror verify-recapture-raw.test.ts verbatim so lane-V signatures
 *  stay comparable with the old per-class-mechanisms data; the page-shape
 *  branch is new and page-lane-only. */
function classifyFailure(first: string, expectedExcerpt: string, actualExcerpt: string): string {
  if (first.includes("fixture expects a raised error (CAPTURE_ERROR sentinel)")) {
    const m = /expected excerpt: CAPTURE_ERROR: ([^:]+):/.exec(first);
    return `capture_error_still_raised:${m ? m[1] : "unknown"}`;
  }
  if (first.includes("but the fixture expects a successful result")) {
    const m = /handler raised ([^:]+):/.exec(first);
    return `handler_raised:${m ? m[1] : "unknown"}`;
  }
  if (/<!DOCTYPE/i.test(expectedExcerpt) && !/<!DOCTYPE/i.test(actualExcerpt)) {
    // The oracle page is a wrapped HTML document; the engine produced bare
    // view bytes (no layout resolver / wrap_with_html_page equivalent yet).
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

interface LaneOutcome {
  aggregate: {
    files: string[];
    captureErrorLines: number;
    entries: number;
    pass: { total: number; records: number; renders: number };
    fail: { total: number; records: number; renders: number };
  };
  failures: Array<Record<string, unknown>>;
  signatureCounts: Record<string, number>;
}

function summarize(
  laneLabel: string,
  files: string[],
  captureErrorLines: number,
  report: Awaited<ReturnType<typeof replayEntries>>,
): LaneOutcome {
  const failures: Array<Record<string, unknown>> = [];
  const signatureCounts: Record<string, number> = {};
  let passRecords = 0;
  let passRenders = 0;
  let failRecords = 0;
  let failRenders = 0;
  for (const e of report.entries) {
    if (e.status === "pass") {
      if (e.area === "card-engine") passRecords += 1;
      else passRenders += 1;
      continue;
    }
    const first = formatReplayFailure(e);
    const sig = classifyFailure(
      first,
      e.diff?.firstDifference?.expectedExcerpt ?? "",
      e.diff?.firstDifference?.actualExcerpt ?? "",
    );
    signatureCounts[sig] = (signatureCounts[sig] ?? 0) + 1;
    const off = /first difference at code-unit offset (\d+)/.exec(first);
    const sizes = /sizes: expected (\d+) bytes, actual (\d+) bytes/.exec(first);
    failures.push({
      id: e.id,
      lane: laneLabel,
      area: e.area,
      sig,
      offset: off ? Number(off[1]) : null,
      expectedBytes: sizes ? Number(sizes[1]) : null,
      actualBytes: sizes ? Number(sizes[2]) : null,
      first,
    });
    if (e.area === "card-engine") failRecords += 1;
    else failRenders += 1;
  }
  return {
    aggregate: {
      files,
      captureErrorLines,
      entries: report.summary.total,
      pass: { total: passRecords + passRenders, records: passRecords, renders: passRenders },
      fail: { total: failRecords + failRenders, records: failRecords, renders: failRenders },
    },
    failures,
    signatureCounts,
  };
}

describe("dual-lane ground-truth verification", () => {
  it(
    "judges expected-v2 view-lane and page-lane entries through the landed engine",
    { timeout: 86_400_000 },
    async () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const shards = requestedDualLaneShards();
      const coverage: ShardCoverage[] = [];
      const viewEntries: ReplayEntry[] = [];
      const pageEntries: ReplayEntry[] = [];
      let viewCaptureErrorLines = 0;
      let pageCaptureErrorLines = 0;
      const pageMetadata = {
        layoutCounts: {} as Record<string, number>,
        effectiveMainViewCounts: {} as Record<string, number>,
        formatMainTrue: 0,
        formatMainAbsentOrError: 0,
        layoutRuleNull: 0,
        errorLines: [] as Array<{ shard: string; name: string; error: string }>,
      };

      for (const shard of shards) {
        const cov: ShardCoverage = {
          shard: shard.name,
          view: { file: shard.viewPath !== undefined, lines: 0, malformed: 0, laneMismatches: 0, entries: 0 },
          page: { file: shard.pagePath !== undefined, lines: 0, malformed: 0, laneMismatches: 0, entries: 0 },
          missing: "none",
        };
        const missing: string[] = [];
        if (shard.viewPath === undefined) missing.push("view");
        if (shard.pagePath === undefined) missing.push("page");
        cov.missing = missing.length === 0 ? "none" : missing.join("+");

        if (shard.viewPath !== undefined) {
          const loaded = loadLane<ViewLaneLine>(shard.viewPath, "view");
          cov.view.lines = loaded.lines.length;
          cov.view.malformed = loaded.malformed;
          cov.view.laneMismatches = loaded.laneMismatches;
          for (const line of loaded.lines) {
            // Whole-line capture error (Card.fetch returned nil in the
            // oracle): COUNTED AND REPORTED, never silently skipped. Lane V
            // counts without grading (runbook pins lane V byte-identity to
            // the old shards; per-view sentinels below ARE graded).
            if (line.error !== undefined && line.record === undefined && line.views === undefined) {
              viewCaptureErrorLines += 1;
              continue;
            }
            if (line.record) {
              const { id, ...rest } = line.record;
              void id;
              viewEntries.push({
                id: `dual-lane-view:${line.name}:record`,
                area: "card-engine",
                input: { name: line.name },
                expected: rest as CardRecordWithoutId,
              });
              cov.view.entries += 1;
            }
            if (line.views) {
              for (const [view, html] of Object.entries(line.views)) {
                viewEntries.push({
                  id: `dual-lane-view:${line.name}:render:${view}`,
                  area: "render-engine",
                  input: { cardName: line.name, view },
                  expected: html,
                });
                cov.view.entries += 1;
              }
            }
          }
        }

        if (shard.pagePath !== undefined) {
          const loaded = loadLane<PageLaneLine>(shard.pagePath, "page");
          cov.page.lines = loaded.lines.length;
          cov.page.malformed = loaded.malformed;
          cov.page.laneMismatches = loaded.laneMismatches;
          for (const line of loaded.lines) {
            if (line.layout !== undefined && line.layout !== null) {
              pageMetadata.layoutCounts[line.layout] = (pageMetadata.layoutCounts[line.layout] ?? 0) + 1;
            }
            if (line.layout_rule === null || line.layout_rule === "") pageMetadata.layoutRuleNull += 1;
            const effective = line.layout_main_view?.effective;
            if (effective !== undefined) {
              pageMetadata.effectiveMainViewCounts[effective] =
                (pageMetadata.effectiveMainViewCounts[effective] ?? 0) + 1;
            }
            if (line.format_main === true) pageMetadata.formatMainTrue += 1;
            else pageMetadata.formatMainAbsentOrError += 1;

            if (line.error !== undefined) {
              pageCaptureErrorLines += 1;
              pageMetadata.errorLines.push({
                shard: shard.name,
                name: line.name,
                error: String(line.error),
              });
              // Capture-side error graded as a VALID expected outcome: the
              // engine must also fail here, with matching sentinel bytes. An
              // engine page where the oracle raised (or vice versa) is a
              // class-1 parity failure, not a skip.
              pageEntries.push({
                id: `dual-lane-page:${line.name}:page`,
                area: "render-engine",
                input: {
                  cardName: line.name,
                  view: effective ?? PRODUCTION_DEFAULT_MAIN_VIEW,
                },
                expected: String(line.error),
              });
              cov.page.entries += 1;
              continue;
            }
            if (typeof line.page_html === "string") {
              pageEntries.push({
                id: `dual-lane-page:${line.name}:page`,
                area: "render-engine",
                input: {
                  cardName: line.name,
                  view: effective ?? PRODUCTION_DEFAULT_MAIN_VIEW,
                },
                expected: line.page_html,
              });
              cov.page.entries += 1;
            } else {
              cov.page.malformed += 1;
            }
          }
        }

        coverage.push(cov);
        console.log(
          `coverage shard=${cov.shard} ` +
            `view(file=${cov.view.file},lines=${cov.view.lines},entries=${cov.view.entries},` +
            `malformed=${cov.view.malformed},laneMismatch=${cov.view.laneMismatches}) ` +
            `page(file=${cov.page.file},lines=${cov.page.lines},entries=${cov.page.entries},` +
            `malformed=${cov.page.malformed},laneMismatch=${cov.page.laneMismatches}) ` +
            `missing=${cov.missing}`,
        );
      }

      // instrument-reliability lane (2026-10-01): ONE Date.now() pair around
      // the per-phase seed/warm block, closing the split gap in
      // profile-full-checker-2026-10-01.md §6 -- the per-phase fixed cost
      // (full-corpus re-seed + per-id lexicon warm) was bounded <=6% of
      // compute by a kill at 21.3s, never measured. The phase wall clock is
      // the driver's DONE line; wall minus this line's ms is the render+boot
      // upper bound, and this line vs the phase START separates seed/warm
      // from boot. Printed on stdout so the driver's output relay captures it
      // verbatim in verifier-fast.log.
      const seedWarmT0 = Date.now();
      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      const viewRegistry = new HandlerRegistry();
      const pageRegistry = new HandlerRegistry();

      // Prime the name environment the render engine reads (mark strings,
      // ":codename" resolution, _main/_user). Same rationale as
      // verify-recapture-raw.test.ts.
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
      console.log(
        `SEED-WARM ms=${Date.now() - seedWarmT0} ids=${everyLiveId.length} ` +
          `shards=${shards.map((s) => s.name).join(",")}`,
      );

      const universeBatch = await storage.fetcher.driver.batch([
        structureRuleUniverseStatement(),
      ]);
      const structureUniverse = structureUniverseFromResults(universeBatch[0]);

      try {
        const registerCardEngine = (registry: HandlerRegistry): void => {
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
            const typeName = typeCard?.name;
            let leftTypeName: string | undefined;
            if (card.leftId !== undefined) {
              const leftCard = await engine.fetchById(card.leftId);
              if (leftCard?.typeId !== undefined) {
                const leftTypeCard = await engine.fetchById(leftCard.typeId);
                leftTypeName = leftTypeCard?.name;
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
              structureUniverse,
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
        registerCardEngine(viewRegistry);

        /** Lane V handler: bare view-function render, byte-identical flow to
         *  the old verifier. */
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
        viewRegistry.register("render-engine", renderHandler);

        /** Lane P handler: the engine's page-shaped output — the REAL page
         *  render (src/card/render/page.ts): *layout rule resolution, the
         *  {{_main|view}} main render with main! context, the layout body
         *  substitution, the :html_page wrapper, production default nest
         *  view + quiet nested-error semantics. The entry `view` input is
         *  informational only (Ruby's show resolves the view itself from
         *  the layout chunk / default_html_view). Errors map to the
         *  sentinel contract: UnknownLayoutError is the captured
         *  "unknown layout card" Card::Error::UserError. */
        pageRegistry.register("render-engine", async ({ cardName }: { cardName: string }) => {
          try {
            const html = await storage.engine.renderPage(cardName);
            return renderBytes(html);
          } catch (error) {
            if (
              error instanceof UnsupportedViewError ||
              (error as Error).name === "UnknownLayoutError"
            ) {
              return raisedError("Card::Error::UserError", (error as Error).message);
            }
            const err = error as Error;
            return raisedError(err?.constructor?.name ?? "Error", err?.message ?? String(error));
          }
        });

        const viewOutcome = summarize(
          "view",
          coverage.filter((c) => c.view.file).map((c) => c.shard),
          viewCaptureErrorLines,
          await replayEntries(viewEntries, viewRegistry),
        );
        const pageOutcome = summarize(
          "page",
          coverage.filter((c) => c.page.file).map((c) => c.shard),
          pageCaptureErrorLines,
          await replayEntries(pageEntries, pageRegistry),
        );

        console.log("VIEW-LANE aggregate:\n" + JSON.stringify(viewOutcome.aggregate, null, 2));
        console.log("VIEW-LANE failure signatures: " + JSON.stringify(viewOutcome.signatureCounts));
        console.log("PAGE-LANE aggregate:\n" + JSON.stringify(pageOutcome.aggregate, null, 2));
        console.log("PAGE-LANE failure signatures: " + JSON.stringify(pageOutcome.signatureCounts));
        console.log(
          "PAGE-LANE expected metadata (layout resolver target; not graded until " +
            "the engine ports the resolver):\n" +
            JSON.stringify(pageMetadata, null, 2),
        );

        writeFileSync(
          OUT_FILE,
          JSON.stringify(
            {
              reportOnly: REPORT_ONLY,
              expectedV2Dir: EXPECTED_V2_DIR,
              viewLane: viewOutcome,
              pageLane: { ...pageOutcome, expectedMetadata: pageMetadata },
              coverage,
            },
            null,
            2,
          ) + "\n",
        );
        console.log(`aggregate written: ${OUT_FILE}`);

        if (!REPORT_ONLY) {
          // Hard-gate mode: the exam. Both lanes must reach zero failures on
          // non-empty coverage. While the engine lacks the layout resolver,
          // run with DUAL_LANE_REPORT_ONLY=1 instead.
          const gate = (label: string, entries: number, failTotal: number): string =>
            `${label}: ${failTotal} failing of ${entries} entries against expected-v2. ` +
            `Aggregate: ${OUT_FILE}. While the page lane is expected to fail low ` +
            `(no engine layout resolver yet), run with DUAL_LANE_REPORT_ONLY=1.`;
          expect(viewOutcome.aggregate.entries, gate("view lane", viewOutcome.aggregate.entries, viewOutcome.aggregate.fail.total)).toBeGreaterThan(0);
          expect(pageOutcome.aggregate.entries, gate("page lane", pageOutcome.aggregate.entries, pageOutcome.aggregate.fail.total)).toBeGreaterThan(0);
          expect(viewOutcome.aggregate.fail.total, gate("view lane", viewOutcome.aggregate.entries, viewOutcome.aggregate.fail.total)).toBe(0);
          expect(pageOutcome.aggregate.fail.total, gate("page lane", pageOutcome.aggregate.entries, pageOutcome.aggregate.fail.total)).toBe(0);
        }
      } finally {
        storage.close();
      }
    }
  );
});
