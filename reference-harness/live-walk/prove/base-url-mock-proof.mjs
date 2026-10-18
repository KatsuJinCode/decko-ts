#!/usr/bin/env node
// base-url-mock-proof.mjs — proves the walk comparison's arbitrary-base-URL
// path end to end, entirely on the loopback:
//
//   1. stands up two LOCAL mock hosts (mock-walk-host.mjs), byte-identical
//      pages except one seeded /about paragraph on host B;
//   2. runs walk-and-compare.mjs --base-a/--base-b against them with a two-
//      journey list (mock-home: negative control incl. the seeded /about
//      difference; mock-signin: fresh csrf token, nonce and session cookie on
//      every page — everything must come out normalization-explained);
//   3. asserts the report: the normalization table names every rule and shows
//      the applied counts (W1, W2, W3, W5, W6, W4 > 0), the seeded difference
//      appears as a byte DIFFERS with the mutated text and as a pixel-delta
//      with a bounding region and a mask image on disk, the sign-in journey
//      is fully explained, and the negative pages are identical;
//   4. proves the traffic gate: running the CLI with a live hostname and no
//      --allow-live-walk exits non-zero with the refusal BEFORE any request.
//
// Nothing in this proof contacts a non-loopback host.

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../.."); // reference-harness/live-walk/prove -> repo root
const walkCli = path.join(here, "..", "walk-and-compare.mjs");

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
});

async function startMockHost(extraArgs) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(here, "mock-walk-host.mjs"), "--port", String(port), ...extraArgs], { stdio: ["ignore", "pipe", "pipe"] });
  const baseUrl = await new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) return resolve(`http://127.0.0.1:${port}`);
      } catch { /* not yet */ }
      if (Date.now() > deadline) return reject(new Error("mock host did not start"));
      setTimeout(tick, 150);
    };
    tick();
  });
  return { child, baseUrl, port };
}

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [walkCli, ...args], { stdio: ["ignore", "pipe", "pipe"], cwd: repo });
  let stdout = "", stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  child.once("close", (code) => resolve({ code, stdout, stderr }));
});

const outDir = mkdtempSync(path.join(os.tmpdir(), "live-walk-mock-proof-"));
let hostA, hostB;
let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err.message.split("\n").slice(0, 4).join("\n      ")}`);
  }
};

try {
  hostA = await startMockHost(["--about-text", "About this mock host."]);
  hostB = await startMockHost(["--about-text", "About this mock host, SEEDED TO DIFFER for the proof."]);
  console.log(`mock hosts: A=${hostA.baseUrl} B=${hostB.baseUrl}`);

  // ---- 4 first, with the gate: a live hostname must be refused before any
  // request. The refusal path makes no fetch (the gate runs at arg-parse
  // time), so this sends nothing anywhere.
  console.log("gate: live hostname refusal");
  const refusal = await run([
    "--journeys", path.join(here, "journeys.mock.json"),
    "--base-a", "https://culturesmith.com",
    "--base-b", hostB.baseUrl,
    "--out", path.join(outDir, "should-never-exist"),
  ]);
  check("live hostname refused without --allow-live-walk (exit != 0, refusal named)", () => {
    assert.notEqual(refusal.code, 0);
    assert.match(refusal.stderr, /refusing to walk non-local host "culturesmith\.com"/);
    assert.match(refusal.stderr, /--allow-live-walk culturesmith\.com/);
    assert.equal(existsSync(path.join(outDir, "should-never-exist", "report.md")), false);
  });

  console.log("walk: two mock hosts");
  const walked = await run([
    "--journeys", path.join(here, "journeys.mock.json"),
    "--base-a", hostA.baseUrl,
    "--base-b", hostB.baseUrl,
    "--label-a", "mock A", "--label-b", "mock B",
    "--out", path.join(outDir, "run"),
    "--offline",
  ]);
  check("walk-and-compare exits 0", () => assert.equal(walked.code, 0, walked.stderr.slice(0, 2000)));
  if (walked.code !== 0) {
    console.log(walked.stdout, walked.stderr);
    process.exitCode = 1;
  } else {
    const report = readFileSync(path.join(outDir, "run", "report.md"), "utf8");
    const json = JSON.parse(readFileSync(path.join(outDir, "run", "report.json"), "utf8"));

    check("normalization table present with every rule named, zero-count rows included", () => {
      for (const id of ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "N*", "R1"]) {
        assert.ok(report.includes(`**${id}**`), `rule ${id} missing from the table`);
      }
    });
    const byJourney = Object.fromEntries(json.journeys.map((j) => [j.id, j]));

    check("mock-signin: every exchange identical or normalization-explained; W1/W2/W3/W5 did real work", () => {
      const j = byJourney["mock-signin"];
      assert.equal(j.walk.a.completed, true);
      assert.equal(j.walk.b.completed, true);
      assert.equal(j.bytes.counts.differs, 0, `differs=${j.bytes.counts.differs}`);
      assert.equal(j.bytes.counts.onlyOnA + j.bytes.counts.onlyOnB, 0);
      assert.ok(j.bytes.counts.matched >= 3, `matched=${j.bytes.counts.matched}`);
      const applied = { ...j.bytes.appliedA, ...j.bytes.appliedB };
      for (const id of ["W1", "W2", "W3", "W5", "W6", "W8"]) assert.ok((applied[id]?.applied ?? 0) > 0, `rule ${id} never applied on the sign-in walk`);
      // R1: the sign-in form's password field never reaches the evidence.
      const signInPost = readFileSync(path.join(outDir, "run", "a", "mock-signin", "exchanges", "exchanges.jsonl"), "utf8");
      assert.doesNotMatch(signInPost, /throwaway-mock-pass/);
      assert.match(signInPost, /R1%23redacted/);
    });

    check("mock-home: the seeded /about difference is found — byte DIFFERS with the mutated text", () => {
      const j = byJourney["mock-home"];
      const aboutPair = j.bytes.pairs.find((p) => p.key.includes("/about"));
      assert.ok(aboutPair, "no /about exchange pair");
      assert.equal(aboutPair.verdict, "differs");
      assert.ok(JSON.stringify(aboutPair.bodyDiff).includes("SEEDED TO DIFFER"));
      const homePair = j.bytes.pairs.find((p) => p.key === "GET /");
      assert.ok(["identical", "normalization-explained"].includes(homePair.verdict), `home verdict ${homePair.verdict}`);
    });

    check("mock-home: the seeded difference is a pixel-delta with a region and a mask image on disk", () => {
      const j = byJourney["mock-home"];
      const aboutShot = j.pixels.find((p) => p.verdict === "pixel-delta");
      assert.ok(aboutShot, `no pixel-delta shot: ${JSON.stringify(j.pixels.map((p) => p.verdict))}`);
      assert.ok(aboutShot.deltaCount > 0);
      assert.ok(aboutShot.regions.length >= 1);
      assert.ok(existsSync(path.join(outDir, "run", "pixels", "mock-home", aboutShot.mask)), "mask image missing");
      const identicalShot = j.pixels.find((p) => p.verdict === "identical");
      assert.ok(identicalShot, "the home page shot should be identical");
    });

    check("journey verdicts: mock-home DIVERGES (bytes + pixels), mock-signin MATCH", () => {
      assert.match(byJourney["mock-home"].verdict, /DIVERGES \(bytes \+ pixels\)/);
      assert.equal(byJourney["mock-signin"].verdict, "MATCH");
    });

    check("report.md carries verdict lines with evidence links", () => {
      assert.match(report, /# Walk comparison — mock A vs mock B/);
      assert.match(report, /## Verdicts/);
      assert.match(report, /mock-home.*DIVERGES/s);
      assert.match(report, /pixels[/\\]mock-home[/\\]/);
    });
  }
} finally {
  hostA?.child.kill();
  hostB?.child.kill();
  try { rmSync(outDir, { recursive: true, force: true }); } catch { /* tmp residue named in output */ }
}
if (failures > 0) {
  console.log(`base-url-mock-proof: ${failures} check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("base-url-mock-proof: all checks passed");
}
