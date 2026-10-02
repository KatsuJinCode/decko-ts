// incremental-diff-grade.test.ts -- unit tests for the delta grader
// (tools/incremental-diff-grade.mjs). ALL fixtures are synthetic (DATA RULE:
// zero real content); no rendering is performed anywhere in this file -- the
// runner's render children are NOT exercised here (real-shard rendering is
// the integration runs' job; these tests cover the grader's own logic).
// Coverage:
//
//   1. provenance refusal  -- missing manifest, swapped corpus, baseline
//      corpus mismatch, engine-input corpus mismatch, and the happy path.
//   2. changed-entry selection (planDelta) -- shard-bytes drift, source-tree
//      change (renders ALL shards), forced shards, not-in-baseline, reuse.
//   3. entry counting (measureShardFile) -- mirrors verify-dual-lane.test.ts
//      flattening rules + the full grader's capture-error line counting.
//   4. verdict emission (emitVerdict/totalsLine/floorsLine) -- full grader's
//      vocabulary: PASS/FAIL, exit codes, TOTALS/FLOORS line shapes.
//   5. fail-set diff (diffFailSets) -- per-shard replacement semantics;
//      fails on unrendered shards persist (neither new nor fixed).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_SCHEMA,
  DEFAULT_SPEC,
  FULL_RUN_FLOORS,
  SHARD_INPUT_SCHEMA,
  checkProvenance,
  diffFailSets,
  emitVerdict,
  floorsLine,
  hashSourceTree,
  measureShard,
  measureShardFile,
  planDelta,
  resolveFloors,
  shardInputHash,
  totalsLine,
  buildBaselineObject,
  engineCorpusPath,
  manifestGateCorpusPath,
  manifestPath,
} from "../../tools/incremental-diff-grade.mjs";
import { sha256File, verifyManifestForGrading } from "../../tools/capture-manifest-provenance.mjs";

// ---------- synthetic repo fixture ----------

const VIEW_SHARDS: Record<string, string> = {};
const PAGE_SHARDS: Record<string, string> = {};

function viewShardLines(name: string): string[] {
  // 1 record row with 2 views (3 view-lane entries), 1 whole-line capture
  // error (0 entries, 1 capture-error line), 1 views-only row whose value is
  // a per-view sentinel (1 entry, 1 capture-error line), 1 malformed line.
  if (name === "recapture-raw-shard-000000.jsonl") {
    return [
      JSON.stringify({ id: 1, lane: "view", name: "Alpha", record: { name: "Alpha", key: "alpha" }, views: { open: "<div>alpha open</div>", content: "<p>alpha body</p>" } }),
      JSON.stringify({ id: 2, lane: "view", name: "Ghost", error: "CAPTURE_ERROR: RuntimeError: card not found" }),
      JSON.stringify({ id: 3, lane: "view", name: "Sentinel", views: { open: "CAPTURE_ERROR: Card::Error::UserError: denied" } }),
      "{not json",
    ];
  }
  // shard 000001: 1 record row with 1 view (2 entries), clean.
  return [
    JSON.stringify({ id: 10, lane: "view", name: "Beta", record: { name: "Beta", key: "beta" }, views: { title: "<h1>Beta</h1>" } }),
  ];
}

function pageShardLines(name: string): string[] {
  if (name === "recapture-raw-shard-000000.jsonl") {
    return [
      // error row: 1 entry + capture-error line
      JSON.stringify({ id: 1, lane: "page", name: "Alpha", error: "CAPTURE_ERROR: RuntimeError: page boom" }),
      // page_html row: 1 entry
      JSON.stringify({ id: 2, lane: "page", name: "Beta", layout: "default", layout_main_view: { raw: "content", effective: "content" }, page_html: "<html>beta</html>" }),
      // neither: malformed
      JSON.stringify({ id: 3, lane: "page", name: "Empty" }),
    ];
  }
  return [
    JSON.stringify({ id: 10, lane: "page", name: "Beta", layout: "default", layout_main_view: { raw: "content", effective: "content" }, page_html: "<html>beta page</html>" }),
  ];
}

interface Repo {
  repo: string;
  corpusSha: string;
  engineCorpusSha: string;
  baseline: Record<string, unknown>;
}

function makeSyntheticRepo(): Repo {
  const repo = mkdtempSync(join(tmpdir(), "decko-diffgrade-"));
  const rg = join(repo, "tmp", "raw-ground-truth");
  const viewLane = join(rg, "expected-v2", "view-lane");
  const pageLane = join(rg, "expected-v2", "page-lane");
  mkdirSync(viewLane, { recursive: true });
  mkdirSync(pageLane, { recursive: true });
  mkdirSync(join(rg, "deck-recapture"), { recursive: true });
  mkdirSync(join(rg, "scripts"), { recursive: true });
  mkdirSync(join(repo, "src", "card"), { recursive: true });

  const shardNames = ["recapture-raw-shard-000000.jsonl", "recapture-raw-shard-000001.jsonl"];
  const shardHashMap: Record<string, Record<string, string>> = { view: {}, page: {} };
  for (const name of shardNames) {
    VIEW_SHARDS[name] = viewShardLines(name).join("\n") + "\n";
    PAGE_SHARDS[name] = pageShardLines(name).join("\n") + "\n";
    writeFileSync(join(viewLane, name), VIEW_SHARDS[name]);
    writeFileSync(join(pageLane, name), PAGE_SHARDS[name]);
    shardHashMap.view[name] = sha256File(join(viewLane, name));
    shardHashMap.page[name] = sha256File(join(pageLane, name));
  }

  // small synthetic corpus files (arbitrary bytes; the gate is hash-based)
  const corpusFile = join(rg, "deck-recapture", "corpus-v2.sqlite3");
  const engineCorpusFile = join(rg, "bench-corpus-raw.sqlite3");
  writeFileSync(corpusFile, "synthetic corpus bytes v1\n");
  writeFileSync(engineCorpusFile, "synthetic engine corpus bytes v1\n");

  // capture manifest binding the synthetic corpus
  const corpusSha = sha256File(corpusFile);
  writeFileSync(
    join(rg, "expected-v2", "capture-manifest.json"),
    JSON.stringify(
      {
        schema: "capture-manifest/1",
        corpusSha256: { before: corpusSha, after: corpusSha },
        hostOs: "synthetic",
        mode: "synthetic fixture",
        shards: shardHashMap,
      },
      null,
      2,
    ) + "\n",
  );

  // engine source file whose bytes the source-tree hash covers
  writeFileSync(join(repo, "src", "card", "render.ts"), "export const x = 1;\n");
  // engine-composing helper the real verify spec imports from tests/
  // (tests/card/render/render-test-storage.ts composes the engines the
  // child renders with) -- its bytes must be covered by the source hash too
  mkdirSync(join(repo, "tests", "card", "render"), { recursive: true });
  writeFileSync(join(repo, "tests", "card", "render", "render-test-storage.ts"), "export const helper = 1;\n");
  // the verify spec must exist (the runner refuses without it)
  writeFileSync(join(rg, "scripts", "verify-dual-lane.test.ts"), "// synthetic spec placeholder\n");
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "synthetic", version: "0.0.0" }));

  const baseline = makeBaseline({ repo, corpusSha, shardHashMap });
  return {
    repo,
    corpusSha,
    engineCorpusSha: sha256File(engineCorpusFile),
    baseline,
  };
}

function makeBaseline({ repo, corpusSha, shardHashMap }: { repo: string; corpusSha: string; shardHashMap: Record<string, Record<string, string>> }) {
  const src = hashSourceTree(repo);
  const engineCorpusSha256 = sha256File(engineCorpusPath(repo));
  const shardInput = (name: string) =>
    shardInputHash({
      viewSha: shardHashMap.view[name],
      pageSha: shardHashMap.page[name],
      sourceTreeHash: src.hash,
      engineCorpusSha256,
      specRelPath: DEFAULT_SPEC,
    });
  return {
    schema: BASELINE_SCHEMA,
    baselineId: "baseline-fixture",
    createdAt: "2026-09-30T00:00:00.000Z",
    repo,
    gitHead: null,
    corpusSha256: corpusSha,
    manifestSha256: sha256File(manifestPath(repo)),
    engineCorpusSha256,
    sourceTreeHash: src.hash,
    sourceFiles: src.files,
    floors: { view: 9597, page: 5939, captureErrors: 16 },
    totals: {
      view: { pass: 5, fail: 1, entries: 6 },
      page: { pass: 2, fail: 1, entries: 3 },
    },
    captureErrors: { view: 2, page: 1, total: 3 },
    shards: {
      "recapture-raw-shard-000000.jsonl": {
        viewSha: shardHashMap.view["recapture-raw-shard-000000.jsonl"],
        pageSha: shardHashMap.page["recapture-raw-shard-000000.jsonl"],
        inputHash: shardInput("recapture-raw-shard-000000.jsonl"),
        view: {
          present: true,
          entries: 4,
          pass: 2,
          fail: 2,
          failIds: [
            { id: "dual-lane-view:Sentinel:render:open", sig: "capture_error_still_raised:Card" },
            { id: "dual-lane-view:Alpha:render:open", sig: "byte-diff" },
          ],
        },
        page: {
          present: true,
          entries: 3,
          pass: 2,
          fail: 1,
          failIds: [{ id: "dual-lane-page:Beta:page", sig: "byte-diff" }],
        },
        captureErrors: { view: 2, page: 1 },
      },
      "recapture-raw-shard-000001.jsonl": {
        viewSha: shardHashMap.view["recapture-raw-shard-000001.jsonl"],
        pageSha: shardHashMap.page["recapture-raw-shard-000001.jsonl"],
        inputHash: shardInput("recapture-raw-shard-000001.jsonl"),
        view: { present: true, entries: 2, pass: 2, fail: 0, failIds: [] },
        page: { present: true, entries: 1, pass: 1, fail: 0, failIds: [] },
        captureErrors: { view: 0, page: 0 },
      },
    },
  };
}

// ---------- 1. provenance refusal ----------

describe("checkProvenance", () => {
  it("refuses when the live corpus bytes no longer match the manifest binding", () => {
    const fx = makeSyntheticRepo();
    // swap the corpus AFTER the manifest bound it
    writeFileSync(manifestGateCorpusPath(fx.repo), "SWAPPED CORPUS BYTES\n");
    const manifestCheck = {
      ok: false,
      refusals: ["corpus at grade start (ab12...) differs from the photographed corpus recorded in the manifest (cd34...)"],
      manifest: null,
    };
    const r = checkProvenance({
      manifestCheck,
      baseline: fx.baseline as Record<string, unknown>,
      liveCorpusSha256: "ab12",
      liveEngineCorpusSha256: fx.engineCorpusSha,
    });
    expect(r.ok).toBe(false);
    expect(r.refusals.length).toBeGreaterThan(0);
    expect(r.refusals[0]).toContain("differs from the photographed corpus");
  });

  it("refuses when the baseline binds a different corpus than the manifest", () => {
    const fx = makeSyntheticRepo();
    const manifestCheck = { ok: true, refusals: [], manifest: { corpusSha256: { after: fx.corpusSha } } };
    const staleBaseline = { ...(fx.baseline as Record<string, unknown>), corpusSha256: "deadbeef".repeat(8) };
    const r = checkProvenance({
      manifestCheck,
      baseline: staleBaseline,
      liveCorpusSha256: fx.corpusSha,
      liveEngineCorpusSha256: fx.engineCorpusSha,
    });
    expect(r.ok).toBe(false);
    expect(r.refusals.join(" ")).toContain("the graded corpus changed since the baseline was recorded");
  });

  it("refuses when the engine-input corpus changed since the baseline", () => {
    const fx = makeSyntheticRepo();
    const manifestCheck = { ok: true, refusals: [], manifest: { corpusSha256: { after: fx.corpusSha } } };
    const r = checkProvenance({
      manifestCheck,
      baseline: fx.baseline as Record<string, unknown>,
      liveCorpusSha256: fx.corpusSha,
      liveEngineCorpusSha256: "f00dface".repeat(8),
    });
    expect(r.ok).toBe(false);
    expect(r.refusals.join(" ")).toContain("bench-corpus-raw.sqlite3");
  });

  it("passes when manifest, baseline corpus, and engine-input corpus all bind the live bytes", () => {
    const fx = makeSyntheticRepo();
    const manifestCheck = { ok: true, refusals: [], manifest: { corpusSha256: { after: fx.corpusSha } } };
    const r = checkProvenance({
      manifestCheck,
      baseline: fx.baseline as Record<string, unknown>,
      liveCorpusSha256: fx.corpusSha,
      liveEngineCorpusSha256: fx.engineCorpusSha,
    });
    expect(r.ok).toBe(true);
    expect(r.refusals).toEqual([]);
  });

  it("end-to-end: a manifest that verifyManifestForGrading refuses produces refusals", () => {
    const fx = makeSyntheticRepo();
    // corrupt the manifest's before/after equality
    const mPath = manifestPath(fx.repo);
    const m = JSON.parse(readFileSync(mPath, "utf8"));
    m.corpusSha256.before = "0".repeat(64);
    writeFileSync(mPath, JSON.stringify(m, null, 2));
    const manifestCheck = verifyManifestForGrading({
      manifestPath: mPath,
      corpusFile: manifestGateCorpusPath(fx.repo),
    });
    expect(manifestCheck.ok).toBe(false);
    const r = checkProvenance({
      manifestCheck,
      baseline: fx.baseline as Record<string, unknown>,
      liveCorpusSha256: fx.corpusSha,
      liveEngineCorpusSha256: fx.engineCorpusSha,
    });
    expect(r.ok).toBe(false);
    expect(r.refusals.join(" ")).toContain("CHANGED DURING capture");
  });
});

// ---------- 2. changed-entry selection (Bazel reuse contract) ----------

describe("planDelta", () => {
  const deltaArgs = (fx: Repo, extra?: Partial<Parameters<typeof planDelta>[0]>) =>
    planDelta({
      baseline: fx.baseline as Record<string, unknown>,
      repo: fx.repo,
      sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string,
      forceShards: null,
      onlyShards: null,
      engineCorpusSha256: fx.engineCorpusSha,
      specRelPath: DEFAULT_SPEC,
      ...extra,
    });

  /** An all-PASS copy of the fixture baseline (shard 0 carries fails in the
   *  shared fixture; PASS-only reuse needs a record whose last verdict was
   *  a full pass). */
  function allPassBaseline(fx: Repo): Record<string, unknown> {
    const b = JSON.parse(JSON.stringify(fx.baseline));
    for (const rec of Object.values(b.shards as Record<string, { view: { failIds: unknown[] }; page: { failIds: unknown[] } }>)) {
      rec.view.failIds = [];
      rec.page.failIds = [];
    }
    return b;
  }

  it("reuses every PASS shard whose input tuple is unchanged (Bazel cached hit)", () => {
    const fx = makeSyntheticRepo();
    const p = planDelta({ baseline: allPassBaseline(fx), repo: fx.repo, sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string, forceShards: null, onlyShards: null, engineCorpusSha256: fx.engineCorpusSha, specRelPath: DEFAULT_SPEC });
    expect(p.renderCount).toBe(0);
    expect(p.reuseCount).toBe(2);
    expect(p.plan.every((e) => e.action === "reuse" && e.reason === "inputs-unchanged")).toBe(true);
    expect(p.entriesReused).toBe(6 + 3); // 6 view + 3 page entries across both shards
  });

  it("re-renders a shard whose last verdict FAILED even with identical inputs (PASS-only reuse / DoNotCache)", () => {
    const fx = makeSyntheticRepo();
    // shared fixture: shard 000000 records 3 failIds, shard 000001 is all-PASS
    const p = deltaArgs(fx);
    const failed = p.plan.find((e) => e.shard === "recapture-raw-shard-000000.jsonl");
    const passed = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(failed?.action).toBe("render");
    expect(failed?.reason).toBe("last-verdict-failed");
    expect(passed?.action).toBe("reuse");
    expect(passed?.reason).toBe("inputs-unchanged");
  });

  it("refuses reuse when the recorded inputHash moved EVEN IF the shard bytes match", () => {
    const fx = makeSyntheticRepo();
    const b = allPassBaseline(fx);
    // corrupt ONLY the recorded tuple hash; bytes + source tree untouched
    const shards = b.shards as Record<string, { inputHash: string }>;
    shards["recapture-raw-shard-000001.jsonl"].inputHash = "0".repeat(64);
    const p = planDelta({ baseline: b, repo: fx.repo, sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string, forceShards: null, onlyShards: null, engineCorpusSha256: fx.engineCorpusSha, specRelPath: DEFAULT_SPEC });
    const moved = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(moved?.action).toBe("render");
    expect(moved?.reason).toBe("input-hash-moved");
  });

  it("re-renders a shard whose baseline record predates input hashing (never reuse an unprovable record)", () => {
    const fx = makeSyntheticRepo();
    const b = allPassBaseline(fx);
    const shards = b.shards as Record<string, Record<string, unknown>>;
    delete shards["recapture-raw-shard-000001.jsonl"].inputHash;
    const p = planDelta({ baseline: b, repo: fx.repo, sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string, forceShards: null, onlyShards: null, engineCorpusSha256: fx.engineCorpusSha, specRelPath: DEFAULT_SPEC });
    const rec = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(rec?.action).toBe("render");
    expect(rec?.reason).toBe("no-input-hash-in-baseline");
  });

  it("re-renders exactly the shard whose bytes moved (lane-named diagnosis kept)", () => {
    const fx = makeSyntheticRepo();
    const shardPath = join(fx.repo, "tmp", "raw-ground-truth", "expected-v2", "view-lane", "recapture-raw-shard-000000.jsonl");
    writeFileSync(shardPath, VIEW_SHARDS["recapture-raw-shard-000000.jsonl"] + JSON.stringify({ id: 99, lane: "view", name: "New", record: { name: "New" }, views: {} }) + "\n");
    const p = deltaArgs(fx);
    expect(p.renderCount).toBe(1);
    const moved = p.plan.find((e) => e.shard === "recapture-raw-shard-000000.jsonl");
    expect(moved?.action).toBe("render");
    expect(moved?.reason).toBe("view-bytes-moved");
    const untouched = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(untouched?.action).toBe("reuse");
  });

  it("re-renders ALL shards when the engine source tree changed (when in doubt, include)", () => {
    const fx = makeSyntheticRepo();
    writeFileSync(join(fx.repo, "src", "card", "render.ts"), "export const x = 2; // engine change\n");
    const src = hashSourceTree(fx.repo);
    const p = planDelta({ baseline: fx.baseline as Record<string, unknown>, repo: fx.repo, sourceHash: src.hash, forceShards: null, onlyShards: null, engineCorpusSha256: fx.engineCorpusSha, specRelPath: DEFAULT_SPEC });
    expect(p.renderCount).toBe(2);
    expect(p.plan.every((e) => e.reason === "source-tree-changed")).toBe(true);
  });

  it("honors --force-shards as an add-on render for an unchanged shard", () => {
    const fx = makeSyntheticRepo();
    const p = deltaArgs(fx, { forceShards: ["recapture-raw-shard-000001.jsonl"] });
    const forced = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(forced?.action).toBe("render");
    expect(forced?.reason).toBe("forced");
    // shard 000000 renders anyway under the new contract (its recorded
    // verdict failed -- failures always re-render), so 2 renders total
    expect(p.renderCount).toBe(2);
    const other = p.plan.find((e) => e.shard === "recapture-raw-shard-000000.jsonl");
    expect(other?.reason).toBe("last-verdict-failed");
  });

  it("renders shards absent from the baseline", () => {
    const fx = makeSyntheticRepo();
    const baselineRec = fx.baseline as Record<string, unknown>;
    const baselineShards = baselineRec.shards as Record<string, unknown>;
    const partial = { ...baselineRec, shards: { "recapture-raw-shard-000000.jsonl": baselineShards["recapture-raw-shard-000000.jsonl"] } };
    const p = planDelta({ baseline: partial, repo: fx.repo, sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string, forceShards: null, onlyShards: null, engineCorpusSha256: fx.engineCorpusSha, specRelPath: DEFAULT_SPEC });
    const missing = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    expect(missing?.action).toBe("render");
    expect(missing?.reason).toBe("not-in-baseline");
  });
});

// ---------- 2b. the input tuple hash (Bazel cache key) ----------

describe("shardInputHash", () => {
  const fxArgs = (fx: Repo) => ({
    viewSha: "a".repeat(64),
    pageSha: "b".repeat(64),
    sourceTreeHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string,
    engineCorpusSha256: fx.engineCorpusSha,
    specRelPath: DEFAULT_SPEC,
  });

  it("is stable for an identical tuple", () => {
    const fx = makeSyntheticRepo();
    expect(shardInputHash(fxArgs(fx))).toBe(shardInputHash(fxArgs(fx)));
  });

  it("moves when ANY tuple member moves (bytes, engine tree, corpus, spec)", () => {
    const fx = makeSyntheticRepo();
    const base = shardInputHash(fxArgs(fx));
    for (const [field, value] of [
      ["viewSha", "c".repeat(64)],
      ["pageSha", "d".repeat(64)],
      ["sourceTreeHash", "e".repeat(64)],
      ["engineCorpusSha256", "f".repeat(64)],
      ["specRelPath", "some/other-spec.test.ts"],
    ] as const) {
      const moved = shardInputHash({ ...fxArgs(fx), [field]: value });
      expect(moved).not.toBe(base);
    }
  });

  it("distinguishes a null (absent lane file) from a hash", () => {
    const fx = makeSyntheticRepo();
    expect(shardInputHash({ ...fxArgs(fx), pageSha: null })).not.toBe(shardInputHash(fxArgs(fx)));
  });

  it("plan entries carry the tuple hash that a PASS reuse verified against", () => {
    const fx = makeSyntheticRepo();
    const p = planDelta({
      baseline: fx.baseline as Record<string, unknown>,
      repo: fx.repo,
      sourceHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string,
      forceShards: null,
      onlyShards: null,
      engineCorpusSha256: fx.engineCorpusSha,
      specRelPath: DEFAULT_SPEC,
    });
    const passed = p.plan.find((e) => e.shard === "recapture-raw-shard-000001.jsonl");
    const expectHash = shardInputHash({
      viewSha: ((fx.baseline as Record<string, unknown>).shards as Record<string, { viewSha: string }>)[
        "recapture-raw-shard-000001.jsonl"
      ].viewSha,
      pageSha: ((fx.baseline as Record<string, unknown>).shards as Record<string, { pageSha: string }>)[
        "recapture-raw-shard-000001.jsonl"
      ].pageSha,
      sourceTreeHash: (fx.baseline as Record<string, unknown>).sourceTreeHash as string,
      engineCorpusSha256: fx.engineCorpusSha,
      specRelPath: DEFAULT_SPEC,
    });
    expect(passed?.inputHash).toBe(expectHash);
    expect(SHARD_INPUT_SCHEMA).toBe("incremental-diff-grade-shard-input/1");
  });
});

// ---------- 3. entry counting (mirrors the verify spec) ----------

describe("measureShardFile", () => {
  it("counts view-lane entries by the spec's flattening rules", () => {
    const fx = makeSyntheticRepo();
    const m = measureShard(fx.repo, "recapture-raw-shard-000000.jsonl");
    // record+2 views = 3, views-only sentinel = 1, whole-line error = 0, malformed = 0
    expect(m.view.entries).toBe(4);
    expect(m.view.lines).toBe(4);
    expect(m.view.malformed).toBe(1);
    // capture-error lines use the full grader's substring rule: the whole-line
    // error + the per-view sentinel value both contain "CAPTURE_ERROR:"
    expect(m.view.captureErrorLines).toBe(2);
    // page lane: error row (1) + page_html row (1) = 2 entries, 1 malformed
    expect(m.page.entries).toBe(2);
    expect(m.page.malformed).toBe(1);
    expect(m.page.captureErrorLines).toBe(1);
  });

  it("reports a missing lane file as present:false with zero entries", () => {
    const fx = makeSyntheticRepo();
    const m = measureShardFile(join(fx.repo, "tmp", "raw-ground-truth", "expected-v2", "view-lane", "recapture-raw-shard-999999.jsonl"), "view");
    expect(m.present).toBe(false);
    expect(m.entries).toBe(0);
  });
});

// ---------- 4. verdict emission ----------

describe("verdict emission", () => {
  const totals = {
    view: { pass: 10017, fail: 257, entries: 10274 },
    page: { pass: 6182, fail: 406, entries: 6588 },
  };
  const floors = { view: 9597, page: 5939, captureErrors: 16 };
  const captureErrors = { view: 13, page: 3, total: 16 };

  it("emits PASS with exit 0 when floors are met, with the full grader's line shapes", () => {
    const v = emitVerdict({ totals, floors, captureErrors, newFails: [], fixedFails: [], renderFailures: 0, coverageCaveat: null, runMeta: "test" });
    expect(v.verdict).toBe("PASS");
    expect(v.exitCode).toBe(0);
    expect(v.oneLine).toContain("VERDICT: PASS");
    expect(v.oneLine).toContain("view: 10017/10274 (97.5%), 257 failing");
    expect(v.oneLine).toContain("captureErrors=16 (floor 16)");
    expect(totalsLine("view", totals.view)).toBe("TOTALS view: 10017/10274 (97.5%), 257 failing");
    expect(floorsLine(totals, floors)).toBe("FLOORS view: 10017 >= floor 9597; page: 6182 >= floor 5939");
  });

  it("emits FAIL with exit 1 when a floor is missed", () => {
    const v = emitVerdict({
      totals: { view: { pass: 9000, fail: 1274, entries: 10274 }, page: totals.page },
      floors,
      captureErrors,
      newFails: [], fixedFails: [], renderFailures: 0, coverageCaveat: null, runMeta: "test",
    });
    expect(v.verdict).toBe("FAIL");
    expect(v.exitCode).toBe(1);
    expect(v.oneLine).toContain("VERDICT: FAIL");
    expect(floorsLine({ view: { pass: 9000 }, page: totals.page }, floors)).toContain("view: 9000 < floor 9597");
  });

  it("emits FAIL when a render child failed (the full grader's crashed-phase arm)", () => {
    const v = emitVerdict({ totals, floors, captureErrors, newFails: [], fixedFails: [], renderFailures: 1, coverageCaveat: null, runMeta: "test" });
    expect(v.verdict).toBe("FAIL");
    expect(v.exitCode).toBe(1);
    expect(v.lines.join("\n")).toContain("RENDER-FAILURES 1");
  });

  it("emits FAIL when capture errors exceed their floor", () => {
    const v = emitVerdict({ totals, floors, captureErrors: { view: 20, page: 3, total: 23 }, newFails: [], fixedFails: [], renderFailures: 0, coverageCaveat: null, runMeta: "test" });
    expect(v.verdict).toBe("FAIL");
    expect(v.exitCode).toBe(1);
  });

  it("names new fails in the one-line verdict", () => {
    const v = emitVerdict({
      totals, floors, captureErrors,
      newFails: [{ id: "dual-lane-view:Alpha:render:open", shard: "recapture-raw-shard-000000.jsonl", lane: "view", sig: "byte-diff" }],
      fixedFails: [],
      renderFailures: 0, coverageCaveat: null, runMeta: "test",
    });
    expect(v.verdict).toBe("PASS"); // floors still met; the new fail is evidence, not a floor
    expect(v.oneLine).toContain("newFails=1");
    expect(v.lines.join("\n")).toContain("NEW-FAIL dual-lane-view:Alpha:render:open");
  });
});

// ---------- 5. fail-set diff ----------

describe("diffFailSets", () => {
  const baseShards = {
    "recapture-raw-shard-000000.jsonl": {
      view: { failIds: [{ id: "f1", sig: "byte-diff" }, { id: "f2", sig: "permission_denied_mismatch" }] },
      page: { failIds: [{ id: "p1", sig: "byte-diff" }] },
    },
    "recapture-raw-shard-000001.jsonl": {
      view: { failIds: [{ id: "f4", sig: "byte-diff" }] },
      page: { failIds: [] },
    },
  };

  it("replaces rendered shards' fail records and reports new + fixed", () => {
    const fresh = {
      "recapture-raw-shard-000000.jsonl": {
        view: { failIds: [{ id: "f2", sig: "permission_denied_mismatch" }, { id: "f3", sig: "byte-diff" }] },
        page: { failIds: [] },
      },
    };
    const { newFails, fixedFails } = diffFailSets(baseShards, fresh);
    expect(newFails.map((f) => f.id)).toEqual(["f3"]);
    expect(fixedFails.map((f) => f.id).sort()).toEqual(["f1", "p1"]);
  });

  it("a fail on an UNRENDERED shard persists: neither new nor fixed", () => {
    const fresh = {
      "recapture-raw-shard-000000.jsonl": {
        view: { failIds: [{ id: "f1", sig: "byte-diff" }, { id: "f2", sig: "permission_denied_mismatch" }] },
        page: { failIds: [{ id: "p1", sig: "byte-diff" }] },
      },
    };
    const { newFails, fixedFails } = diffFailSets(baseShards, fresh);
    expect(newFails).toEqual([]);
    expect(fixedFails).toEqual([]); // f4 lives on the unrendered shard 000001
  });
});

// ---------- floors resolution + baseline build ----------

describe("resolveFloors", () => {
  it("defaults to the full-run floors when no baseline floors exist", () => {
    expect(resolveFloors(null, null)).toEqual(FULL_RUN_FLOORS);
  });
  it("defaults to the recorded baseline floors (the ratchet)", () => {
    expect(resolveFloors(null, { view: 9597, page: 5939, captureErrors: 16 })).toEqual({ view: 9597, page: 5939, captureErrors: 16 });
  });
  it("CLI pairs overlay the defaults lane-by-lane", () => {
    expect(resolveFloors("view=10000", { view: 9597, page: 5939, captureErrors: 16 })).toEqual({ view: 10000, page: 5939, captureErrors: 16 });
  });
});

describe("buildBaselineObject", () => {
  it("binds the synthetic manifest corpus + engine corpus + source tree", () => {
    const fx = makeSyntheticRepo();
    const out = buildBaselineObject({
      baselineId: "b1",
      repo: fx.repo,
      runMeta: { floors: FULL_RUN_FLOORS, totals: {}, captureErrors: {}, shards: {}, specRelPath: "tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts" },
    });
    expect(out.refusal).toBeUndefined();
    expect(out.corpusSha256).toBe(fx.corpusSha);
    expect(out.baseline?.schema).toBe(BASELINE_SCHEMA);
    expect(out.baseline?.engineCorpusSha256).toBe(fx.engineCorpusSha);
    expect(out.baseline?.gitHead).toBeNull(); // tmp dir is not a git repo
    const files = (out.baseline as Record<string, unknown>).sourceFiles as Record<string, string>;
    expect(Object.keys(files).some((f) => f.startsWith("src/"))).toBe(true);
    expect(existsSync(manifestPath(fx.repo))).toBe(true);
  });
});

describe("source-tree inventory covers tests/**", () => {
  it("inventories engine-composing helpers under tests/ (a tests-only edit must re-render)", () => {
    // The real verify spec's seeding import composes FetchEngine /
    // RenderEngine / ModLoader from tests/card/render/render-test-storage.ts;
    // if tests/ bytes were not hashed, a tests-only merge would reuse every
    // cached verdict while changing what renders (two-engine poison).
    const fx = makeSyntheticRepo();
    const helper = join(fx.repo, "tests", "card", "render", "render-test-storage.ts");
    expect(existsSync(helper)).toBe(true);
    const before = hashSourceTree(fx.repo);
    expect(Object.keys(before.files).some((f) => f.startsWith("tests/"))).toBe(true);
    writeFileSync(helper, "export const helper = 2; // engine-behavior change via tests/\n");
    const after = hashSourceTree(fx.repo);
    expect(after.hash).not.toBe(before.hash);
    expect(after.files["tests/card/render/render-test-storage.ts"]).not.toBe(
      before.files["tests/card/render/render-test-storage.ts"],
    );
  });
});
