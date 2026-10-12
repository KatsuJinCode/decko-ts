// dual-lane-direct-driver.artifacts-reuse-guard.test.mjs -- regression
// coverage for the driver's artifacts-directory reuse guard.
//
// THE COLLISION (measured): the driver labels its workers
// w0..wN by QUEUE INDEX and the runner writes
// <label>-{aggregate,view,page}.json unconditionally, so a second driver
// invocation into the same --artifacts dir silently overwrote the first
// run's per-worker artifacts: w0-page.json's mtime moved 06:32:45 ->
// 06:58:45, only w4/w7 survived, and shard coverage collapsed 35 -> 26 of
// 48. The prior run's record was real render-hours; losing it without a
// sound is the defect. The guard refuses to spawn into a directory holding
// prior-run artifacts unless --overwrite-artifacts is passed.
//
// HOW THESE TESTS STAY UNIT-COST: a seeded artifacts dir stands in for the
// first run's output, and a barren --repo (an empty temp dir) stands in for
// the real one. The guard fires before any worker spawns and the weight
// signal degrades to the recorded-seconds fallback on an empty tree, so the
// driver reaches the refusal in milliseconds -- no corpus, no canvas, no
// engine. One test (explicit overwrite) lets the run proceed past the guard
// and spawn the real runner child against the barren repo; the child fails
// fast on the missing seeding module, which is exactly the proof that the
// guard let it through.
//
//   guard fires         second run exits 2 with the ARTIFACTS-REFUSE marker
//                       and every seeded artifact is byte-identical after
//   explicit overwrite  --overwrite-artifacts proceeds past the guard (the
//                       spawned worker then fails on the barren repo, which
//                       is the proof it got past; exit 1, marker absent)
//   report mode         --worst-shards still reads a directory full of
//                       prior artifacts -- reads never refuse
//   plan mode           --plan over a dirty directory still plans -- it
//                       writes nothing, so it cannot lose anything
//   detection set       priorRunArtifactFiles sees per-worker files, the
//                       driver's own union file, and a hand-run runner's
//                       "direct"-label files; ignores unrelated files,
//                       unrelated names, and missing directories
//   import safety       importing the driver module must not parse argv,
//                       spawn, or exit (entry guard) -- implicit: this file
//                       imports it and vitest survives

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { priorRunArtifactFiles } from "./dual-lane-direct-driver.mjs";
import { scratchDir } from "../../tests/support/scratch-dir.mjs";

const DRIVER = fileURLToPath(new URL("./dual-lane-direct-driver.mjs", import.meta.url));

/** One fresh scene: a barren repo (no ground truth at all) and an artifacts
 *  dir seeded the way a first run left it. Caller removes `root`. */
function makeScene() {
  const root = scratchDir("driver-artifacts-guard-");
  const repo = path.join(root, "repo");
  const artifacts = path.join(root, "artifacts");
  mkdirSync(repo, { recursive: true });
  mkdirSync(artifacts, { recursive: true });
  const seeded = {
    "w0-aggregate.json": JSON.stringify({ run: "first", entries: 35 }),
    "w0-view.json": JSON.stringify({ run: "first", lane: "view", entries: 20 }),
    "w0-page.json": JSON.stringify({ run: "first", lane: "page", entries: 15 }),
  };
  for (const [name, body] of Object.entries(seeded)) {
    writeFileSync(path.join(artifacts, name), body);
  }
  return { root, repo, artifacts, seeded };
}

function runDriver(args, options = {}) {
  return spawnSync(process.execPath, [DRIVER, ...args], {
    encoding: "utf8",
    timeout: 25_000,
    ...options,
  });
}

describe("dual-lane-direct-driver artifacts-reuse guard", () => {
  it("refuses a second run into a dir holding a prior run's artifacts, leaving every seeded artifact byte-identical", { timeout: 30_000 }, () => {
    const s = makeScene();
    try {
      const r = runDriver(["--repo", s.repo, "--workers", "2", "--artifacts", s.artifacts]);
      expect(r.status).toBe(2);
      const complaint = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
      expect(complaint).toContain("ARTIFACTS-REFUSE");
      expect(complaint).toContain(s.artifacts);
      // The collision shape this test exists for: the pre-existing worker
      // artifacts must not be mutated, and nothing new may be written.
      const after = readdirSync(s.artifacts).sort();
      expect(after).toEqual(Object.keys(s.seeded).sort());
      for (const [name, body] of Object.entries(s.seeded)) {
        expect(readFileSync(path.join(s.artifacts, name), "utf8")).toBe(body);
      }
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("--overwrite-artifacts proceeds past the guard: no refusal, workers spawned", { timeout: 30_000 }, () => {
    const s = makeScene();
    try {
      const r = runDriver([
        "--repo", s.repo, "--workers", "2", "--artifacts", s.artifacts,
        "--overwrite-artifacts",
      ]);
      // Barren repo: the runner child fails on the missing seeding module,
      // the driver reports the worker failure and exits 1. Either way the
      // run got PAST the guard -- no refusal, and the post-spawn WORKER line
      // proves a child was actually started.
      expect(`${r.stdout ?? ""}\n${r.stderr ?? ""}`).not.toContain("ARTIFACTS-REFUSE");
      expect(r.stdout).toContain("WORKER w0 exit=");
      expect(r.status).toBe(1);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("report mode still reads a dir full of prior-run artifacts (reads never refuse)", { timeout: 30_000 }, () => {
    const s = makeScene();
    try {
      const r = runDriver(["--artifacts", s.artifacts, "--worst-shards", "3"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("DIRECT-DRIVER REPORT-MODE");
      expect(r.stdout).toContain("RESULT: PASS (report mode; nothing graded)");
      expect(`${r.stdout ?? ""}\n${r.stderr ?? ""}`).not.toContain("ARTIFACTS-REFUSE");
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("plan mode over a dirty dir still plans (it writes nothing, so it can lose nothing)", { timeout: 30_000 }, () => {
    const s = makeScene();
    try {
      const r = runDriver(["--repo", s.repo, "--plan", "--artifacts", s.artifacts]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("PLAN-ONLY: not spawning (--plan)");
      expect(`${r.stdout ?? ""}\n${r.stderr ?? ""}`).not.toContain("ARTIFACTS-REFUSE");
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });
});

describe("priorRunArtifactFiles detection set", () => {
  it("returns [] for a directory that does not exist", () => {
    expect(priorRunArtifactFiles(path.join(tmpdir(), "driver-artifacts-guard-no-such-dir-xyz"))).toEqual([]);
  });

  it("ignores files the pipeline never wrote", () => {
    const root = scratchDir("driver-artifacts-guard-");
    try {
      const dir = path.join(root, "artifacts");
      mkdirSync(dir);
      writeFileSync(path.join(dir, "notes.txt"), "not an artifact");
      writeFileSync(path.join(dir, "aggregate.json"), "{}"); // no label dash
      writeFileSync(path.join(dir, "view.json"), "{}"); // no label dash
      expect(priorRunArtifactFiles(dir)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sees per-worker files, the driver's union file, and a hand-run runner's direct-label files", () => {
    const root = scratchDir("driver-artifacts-guard-");
    try {
      const dir = path.join(root, "artifacts");
      mkdirSync(dir);
      const artifacts = [
        "w0-aggregate.json",
        "w3-view.json",
        "w7-page.json",
        "direct-runner-union-aggregate.json",
        "direct-view.json",
        "direct-page.json",
        "direct-aggregate.json",
      ];
      for (const f of artifacts) writeFileSync(path.join(dir, f), "{}");
      expect(priorRunArtifactFiles(dir)).toEqual([...artifacts].sort());
      expect(existsSync(path.join(dir, "w0-aggregate.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
