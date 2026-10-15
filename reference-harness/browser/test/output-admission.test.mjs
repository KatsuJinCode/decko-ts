import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
