import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { admitJourneyOutput } from "../lib/journey-output-admission.mjs";

test("new disjoint shards are admitted; duplicate/overlapping attempts preserve evidence", () => {
  const out = mkdtempSync(path.join(os.tmpdir(), "decko-admission-test-"));
  try {
    admitJourneyOutput({ out, suffix: ".shard-0", ids: ["case-a"], runId: "same-run" });
    writeFileSync(path.join(out, "server.shard-0.log"), "failed evidence\n");
    assert.throws(() => admitJourneyOutput({ out, suffix: ".shard-0", ids: ["case-a"], runId: "retry" }), /overwrite/);
    assert.equal(readFileSync(path.join(out, "server.shard-0.log"), "utf8"), "failed evidence\n");
    assert.throws(() => admitJourneyOutput({ out, suffix: ".shard-9", ids: ["case-a"], runId: "overlap" }), /EEXIST/);
    admitJourneyOutput({ out, suffix: ".shard-1", ids: ["case-b"], runId: "same-run" });
    assert.throws(() => admitJourneyOutput({ out, suffix: ".shard-3", ids: ["../unsafe"], runId: "unsafe" }), /unsafe/);
  } finally {
    assert.equal(path.dirname(out), path.resolve(os.tmpdir()));
    assert.equal(path.basename(out).startsWith("decko-admission-test-"), true);
    rmSync(out, { recursive: true, force: true });
  }
});

// Actual runner CLI: a rejected fixture must not reserve output or start its host.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureFixtureIdentity } from "../lib/journey-provenance.mjs";
test("fixture pin rejects changed bytes, SQLite sidecars and invalid pins before launch", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "decko-fixture-pin-"));
  try {
    const fixture = path.join(root, "fixture"); mkdirSync(fixture);
    writeFileSync(path.join(fixture, "deck.json"), "{}");
    writeFileSync(path.join(fixture, "deck.sqlite3"), "immutable fixture");
    const pin = captureFixtureIdentity(fixture);
    assert.equal(captureFixtureIdentity(fixture, pin), pin);
    const sentinel = path.join(root, "host-started");
    const host = path.join(root, "host.mjs");
    writeFileSync(host, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(sentinel)},'unexpected launch');`);
    const engine = path.join(root, "engine.json");
    writeFileSync(engine, JSON.stringify({ name: "never-start", command: [process.execPath, host] }));
    const journeys = path.join(root, "journeys.json");
    writeFileSync(journeys, JSON.stringify({ journeys: [{ id: "must-not-launch", steps: [] }] }));
    function rejects(value, message) {
      const out = path.join(root, "output");
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("../run-journeys.mjs", import.meta.url)), "--engine", engine, "--fixture", fixture, "--journeys", journeys, "--out", out, "--fixture-sha256", ...(value === undefined ? [] : [value])], { encoding: "utf8", windowsHide: true, timeout: 15000 });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, message);
      assert.equal(existsSync(sentinel), false);
      assert.equal(existsSync(out), false);
    }
    rejects(undefined, /requires a value/);
    rejects("not-a-hash", /64 lowercase hexadecimal/);
    writeFileSync(path.join(fixture, "deck.sqlite3-wal"), "");
    rejects(pin, /fixture SHA-256 mismatch/);
    rmSync(path.join(fixture, "deck.sqlite3-wal"));
    writeFileSync(path.join(fixture, "deck.sqlite3"), "mutated fixture");
    rejects(pin, /fixture SHA-256 mismatch/);
    // A diagnostic caller can omit the optional pin, without changing hashing.
    assert.notEqual(captureFixtureIdentity(fixture), pin);
  } finally {
    assert.equal(path.basename(root).startsWith("decko-fixture-pin-"), true);
    rmSync(root, { recursive: true, force: true });
  }
});
