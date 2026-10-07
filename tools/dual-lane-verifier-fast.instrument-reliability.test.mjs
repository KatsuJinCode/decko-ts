// dual-lane-verifier-fast.instrument-reliability.test.mjs -- unit coverage
// for the runner's instrument-reliability contracts (see
// docs/dual-lane-verifier-fast-operating-contracts.md): the weight-aware
// deadline exists so a pairing whose recorded duration sits at the flat
// deadline's edge cannot fail the whole run on any slowdown.
//
//   weight math        shard weights reconstruct every recorded phase
//                      duration; the deadline is max(floor, 1.5 x weight);
//                      unknown shards fall back to the floor; --flat-deadline
//                      restores the exact flat behavior
//   pairing coverage   the balanced plan holds all 48 shards EXACTLY once, no
//                      phase carries two heavyweight shards, the max phase
//                      weight drops 1182.7s -> 621.15s, and no phase holds a
//                      31% compute share (the sorted pairing's clump)
//   subset fallback    --files subsets and group!=2 keep sorted consecutive
//                      grouping (weights outside the recorded table are
//                      unknown, so no re-pairing is honest there)
//   artifact binding   phase artifact names are bound to the phase's shard
//                      list, so a re-paired schedule cannot resume-skip
//                      against a previous schedule's per-index artifacts
//   spec staging       default-spec staging decision: missing -> stage,
//                      identical -> keep, differing -> drift (refuse)
//   append-mode logs   the test-queue runner opens job logs in APPEND mode: a
//                      same-id rerun accumulates under an attempt separator
//                      instead of destroying the previous attempt's stdout
//
// No corpus, no vitest suite of the repo, no real grade: wall clock is a few
// seconds (the append-mode test drives the real queue runner over a throwaway
// queue dir with echo jobs).

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BALANCED_PHASE_PLAN,
  PASS19_PHASE_WEIGHTS_S,
  buildPhases,
  buildShardWeights,
  defaultShardName,
  phaseArtifactPrefix,
  phaseDeadlineSec,
  phaseWeightSec,
  specStageDecision,
} from "./dual-lane-verifier-fast.mjs";
import { scratchDir } from "../tests/support/scratch-dir.mjs";

const DEFAULT_48 = Array.from({ length: 48 }, (_, i) => defaultShardName(i));
const WEIGHTS = buildShardWeights(PASS19_PHASE_WEIGHTS_S);
const TOTAL_S = PASS19_PHASE_WEIGHTS_S.reduce((a, b) => a + b, 0);

describe("instrument-reliability: weight math", () => {
  it("even-split shard weights reconstruct every recorded a work item phase duration", () => {
    expect(PASS19_PHASE_WEIGHTS_S).toHaveLength(24);
    for (let p = 0; p < 24; p++) {
      const pair = [defaultShardName(2 * p), defaultShardName(2 * p + 1)];
      expect(phaseWeightSec(pair, WEIGHTS)).toBeCloseTo(PASS19_PHASE_WEIGHTS_S[p], 6);
    }
  });

  it("the recorded weights sum to the profiler receipt's 8258.2s (137.6 worker-min)", () => {
    expect(TOTAL_S).toBeCloseTo(8258.2, 6);
    expect([...WEIGHTS.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(8258.2, 6);
  });

  it("the heavyweight shard weights match the receipt's even-split numbers", () => {
    expect(WEIGHTS.get(defaultShardName(10))).toBeCloseTo(591.35, 6); // P6 1182.7 / 2
    expect(WEIGHTS.get(defaultShardName(8))).toBeCloseTo(354.0, 6); // P5 708.0 / 2
    expect(WEIGHTS.get(defaultShardName(12))).toBeCloseTo(321.7, 6); // P7 643.4 / 2
    expect(WEIGHTS.get(defaultShardName(2))).toBeCloseTo(29.8, 6); // P2 59.6 / 2
  });

  it("deadline = max(floor, 1.5 x weight): the old phase 6 gets 1774.05s, not the 1200s it breached", () => {
    const phase6 = [defaultShardName(10), defaultShardName(11)];
    expect(phaseDeadlineSec(phase6, WEIGHTS, 20)).toBeCloseTo(1774.05, 6);
    // a light phase stays on the flat floor
    const phase2 = [defaultShardName(4), defaultShardName(5)];
    expect(phaseDeadlineSec(phase2, WEIGHTS, 20)).toBeCloseTo(1200, 6);
  });

  it("unknown shards weigh 0 (deadline falls back to the floor -- no measurement, no scaling)", () => {
    expect(phaseWeightSec(["recapture-raw-shard-000999.jsonl"], WEIGHTS)).toBe(0);
    expect(phaseDeadlineSec(["recapture-raw-shard-000999.jsonl"], WEIGHTS, 20)).toBeCloseTo(1200, 6);
    // a mixed phase: the known member contributes, the unknown does not --
    // here 1.5 x 591.35 = 887.0s is still under the floor, so the floor holds
    expect(phaseDeadlineSec([defaultShardName(10), "recapture-raw-shard-000999.jsonl"], WEIGHTS, 20)).toBeCloseTo(1200, 6);
  });

  it("--flat-deadline restores the exact pre-lane behavior (floor alone, weight ignored)", () => {
    const phase6 = [defaultShardName(10), defaultShardName(11)];
    expect(phaseDeadlineSec(phase6, WEIGHTS, 20, { flat: true })).toBeCloseTo(1200, 6);
    expect(phaseDeadlineSec(phase6, WEIGHTS, 0.03, { flat: true })).toBeCloseTo(1.8, 6);
  });
});

describe("instrument-reliability: balanced pairing", () => {
  const phases = buildPhases(DEFAULT_48, 2);

  it("the plan constant is exactly 24 pairs covering shards 0..47", () => {
    expect(BALANCED_PHASE_PLAN).toHaveLength(24);
    const flat = BALANCED_PHASE_PLAN.flat();
    expect(flat).toHaveLength(48);
    expect([...flat].sort((a, b) => a - b)).toEqual(Array.from({ length: 48 }, (_, i) => i));
    expect(new Set(flat).size).toBe(48);
  });

  it("the full default 48-shard set at group 2 builds 24 phases covering every shard EXACTLY once", () => {
    expect(phases).toHaveLength(24);
    const flat = phases.flat();
    expect(flat).toHaveLength(48);
    expect([...flat].sort()).toEqual(DEFAULT_48);
    expect(new Set(flat).size).toBe(48);
    for (const phase of phases) expect(phase).toHaveLength(2);
  });

  it("no phase pairs two heavyweight shards; each of shards 8-13 rides with a light partner", () => {
    const heavy = new Set([8, 9, 10, 11, 12, 13]);
    for (const phase of phases) {
      const heavyCount = phase.filter((n) => heavy.has(shardIdx(n))).length;
      expect(heavyCount).toBeLessThanOrEqual(1);
    }
    // every heavyweight shard is in fact paired (coverage test above) with a
    // shard OUTSIDE the heavy family
    for (const idx of heavy) {
      const phase = phases.find((p) => p.includes(defaultShardName(idx)));
      expect(phase).toBeDefined();
      expect(heavy.has(shardIdx(phase.find((n) => n !== defaultShardName(idx))))).toBe(false);
    }
  });

  it("max phase weight drops 1182.7s -> 621.15s and no phase carries 31% of compute (max 7.52%)", () => {
    const weights = phases.map((p) => phaseWeightSec(p, WEIGHTS));
    expect(Math.max(...weights)).toBeCloseTo(621.15, 6); // [10,2] = 591.35 + 29.8
    const oldMax = Math.max(...PASS19_PHASE_WEIGHTS_S);
    expect(oldMax).toBeCloseTo(1182.7, 6);
    const maxShare = Math.max(...weights) / TOTAL_S;
    expect(maxShare).toBeLessThan(0.31);
    expect(maxShare).toBeCloseTo(0.0752, 3);
    // top-3 clump: 30.7% (P5+P6+P7) -> 21.2%
    const top3 = [...weights].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    expect(top3 / TOTAL_S).toBeCloseTo(0.2121, 3);
    expect(top3).toBeLessThan(PASS19_PHASE_WEIGHTS_S.slice(4, 7).reduce((a, b) => a + b, 0));
  });

  it("every re-paired phase stays inside the flat 1200s deadline floor (1.93x headroom on the heaviest)", () => {
    for (const phase of phases) {
      expect(phaseDeadlineSec(phase, WEIGHTS, 20)).toBeCloseTo(1200, 6);
    }
    const heaviest = phases.map((p) => phaseWeightSec(p, WEIGHTS)).reduce((a, b) => Math.max(a, b), 0);
    expect(1200 / heaviest).toBeGreaterThan(1.9);
  });

  it("--files subsets and group!=2 keep the historical sorted consecutive grouping", () => {
    const subset = [defaultShardName(4), defaultShardName(5), defaultShardName(6)];
    expect(buildPhases(subset, 2)).toEqual([[defaultShardName(4), defaultShardName(5)], [defaultShardName(6)]]);
    // full set at group 3: 16 consecutive triples, NOT the balanced pairs
    const g3 = buildPhases(DEFAULT_48, 3);
    expect(g3).toHaveLength(16);
    expect(g3[0]).toEqual(DEFAULT_48.slice(0, 3));
    // shuffled full set still detects as the default set (set equality, not order)
    const shuffled = [...DEFAULT_48].reverse();
    expect(buildPhases(shuffled, 2)).toHaveLength(24);
  });
});

function shardIdx(name) {
  const m = /^recapture-raw-shard-(\d{6})\.jsonl$/.exec(name);
  if (!m) throw new Error(`not a shard name: ${name}`);
  return Number(m[1]);
}

describe("instrument-reliability: artifact binding + spec staging", () => {
  it("phase artifact names are bound to the phase's shard list, so re-pairing cannot hit old artifacts", () => {
    const oldPair = [defaultShardName(10), defaultShardName(11)];
    const newPair = [defaultShardName(10), defaultShardName(2)];
    const a = phaseArtifactPrefix(5, oldPair);
    const b = phaseArtifactPrefix(5, newPair);
    expect(a).toMatch(/^phase-005-[0-9a-f]{8}$/);
    expect(a).not.toBe(b); // same index, different shards -> different artifacts
    expect(phaseArtifactPrefix(5, [...oldPair].reverse())).toBe(a); // order-insensitive
    expect(phaseArtifactPrefix(6, oldPair)).not.toBe(a); // different index -> different name
  });

  it("spec staging decision: missing -> stage, identical -> keep, differing -> drift (refuse)", () => {
    const canonical = Buffer.from("tracked instrument bytes");
    expect(specStageDecision(null, canonical)).toBe("stage");
    expect(specStageDecision(Buffer.from("tracked instrument bytes"), canonical)).toBe("keep");
    expect(specStageDecision(Buffer.from("hand-edited experiment"), canonical)).toBe("drift");
  });
});

describe("instrument-reliability: queue runner logs append, never truncate", () => {
  it("a same-id rerun accumulates under an attempt separator instead of destroying the previous attempt's stdout", { timeout: 120_000 }, () => {
    const queue = scratchDir("instrrel-queue-");
    const sub = (d) => path.join(queue, d);
    for (const d of ["pending", "running", "results", "logs"]) fs.mkdirSync(sub(d), { recursive: true });
    const runner = path.resolve(import.meta.dirname, "test-queue", "run-test-queue-runner.mjs");
    const jobId = "job-instrrel-append-proof";

    const submit = (cmd) => {
      fs.writeFileSync(
        path.join(sub("pending"), `${jobId}.job.json`),
        JSON.stringify({ id: jobId, key: `k-${cmd}`, name: "append-proof", cwd: queue, cmd, env: {}, timeoutMin: 2, submittedAt: new Date().toISOString(), submittedBy: "test" }),
      );
    };
    const drain = () =>
      spawnSync(process.execPath, [runner, "--workers", "1"], {
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, DECKO_TEST_QUEUE_DIR: queue },
        windowsHide: true,
      });

    // attempt 1, then attempt 2 with the SAME id -- the pre-fix "w" open
    // truncated the log here; the append open must keep both.
    submit("echo instrrel-append-attempt-one");
    const r1 = drain();
    submit("echo instrrel-append-attempt-two");
    const r2 = drain();
    try {
      expect(r1.status).toBe(0);
      expect(r2.status).toBe(0);
      const log = fs.readFileSync(path.join(sub("logs"), `${jobId}.log`), "utf8");
      expect(log).toContain("instrrel-append-attempt-one");
      expect(log).toContain("instrrel-append-attempt-two");
      expect(log.match(/===== attempt /g)).toHaveLength(2);
    } finally {
      fs.rmSync(queue, { recursive: true, force: true });
    }
  });
});
