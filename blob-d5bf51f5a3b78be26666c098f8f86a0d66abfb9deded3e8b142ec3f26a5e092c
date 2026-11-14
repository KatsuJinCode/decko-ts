import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sha256, treeDigest } from "../lib/journey-provenance.mjs";
import { evaluateFollowOperations } from "../lib/follow-operation-contracts.mjs";

// Evaluator unit fixtures only. These are never presented as browser evidence.
function fixture() {
  const candidate = "a".repeat(40), hash = "b".repeat(64);
  const hashes = Object.fromEntries(["fixtureSha256", "journeysSha256", "contractsSha256", "engineSha256"].map(k => [k, hash]));
  const steps = [{ visit: "/Topic/follow_section" }, { click: { css: "a.follow-link" } }, { fresh_session: true }, { restart: true }, { signin: "admin" }, { visit: "/Topic/follow_section" }, { observe: "reloaded" }];
  const p = { format: "decko-browser-evidence/1", source: { commit: candidate, dirty: false, diffSha256: hash }, runId: "unit-only-run", artifacts: { distSha256: hash }, buildReceipt: { sourceCommit: candidate, sourceDiffSha256: hash, distSha256: hash }, ...hashes };
  const result = { id: "positive", completed: true, steps: steps.map((step, i) => ({ step, i, outcome: "ok", ...(step.restart ? { restart: { previousPid: 123, pid: 124, bootMs: 1 } } : {}) })), observations: [{ label: "reloaded", status: 200, text: "following", mainText: "following", fields: [], structure: ["a.follow-link.btn-item-delete"] }], provenance: p, runtime: { engine: "unit-only", node: "unit-only" }, browserVersion: "unit-only", network: [{ origin: "local", method: "GET", path: "/update/Topic", status: 200 }], rows: { cards: { inserted: [{ id: "new card Topic+*self+Admin+*follow", db_content: "*always" }] } }, mail: [{ to: ["fixture@example.test"], subject: "Follow saved", text: "Actual recorded mail body" }] };
  const policy = { format: "decko-follow-operation-contracts/1", journeys: { positive: { actions: [{ method: "GET", path: "/update/Topic", status: 200 }], state: { mode: "inserted", id: "new card Topic+*self+Admin+*follow", field: "db_content", value: "*always" }, notification: { count: 1, to: ["fixture@example.test"], subject: "Follow saved" }, reload: { label: "reloaded", mainTextIncludes: ["following"], mainTextExcludes: ["Problems with"], structureIncludes: ["follow-link", "btn-item-delete"] } } } };
  return { candidate, hashes, definitions: [{ id: "positive", steps }], results: { positive: result }, policy, meta: { completedAt: "2026-10-16T00:00:00Z", provenance: p, journeys: [{ id: "positive", completed: true }] } };
}
test("complete positive operation passes without mutating any input", () => {
  const f = fixture(), before = JSON.stringify(f);
  assert.equal(evaluateFollowOperations(f).verdict, "pass");
  assert.equal(JSON.stringify(f), before);
});
for (const [name, change] of [
  ["HTTP200 observation masking GET422", f => { f.results.positive.network[0].status = 422; }],
  ["GET403", f => { f.results.positive.network[0].status = 403; }],
  ["no action request", f => { f.results.positive.network = []; }],
  ["wrong action target", f => { f.results.positive.network[0].path = "/update/Other"; }],
  ["wrong action verb", f => { f.results.positive.network[0].method = "POST"; }],
  ["successful retry hides failed action", f => { f.results.positive.network.push({ ...f.results.positive.network[0], status: 422 }); }],
  ["no row mutation", f => { f.results.positive.rows = {}; }],
  ["wrong stored preference", f => { f.results.positive.rows.cards.inserted[0].db_content = "*never"; }],
  ["wrong target row", f => { f.results.positive.rows.cards.inserted[0].id = "other"; }],
  ["missing notification", f => { f.results.positive.mail = []; }],
  ["wrong notification recipient", f => { f.results.positive.mail[0].to = ["wrong@example.test"]; }],
  ["wrong notification subject", f => { f.results.positive.mail[0].subject = "Unrelated"; }],
  ["no mail body", f => { f.results.positive.mail[0].text = ""; }],
  ["stale reload", f => { f.results.positive.observations[0].mainText = "follow Problems with"; }],
  ["missing reload", f => { f.results.positive.observations = []; }],
  ["no real restart", f => { delete f.results.positive.steps[3].restart; }],
  ["same pid restart", f => { f.results.positive.steps[3].restart.pid = 123; }],
  ["incomplete steps", f => { f.results.positive.steps[2].outcome = "skipped"; }],
  ["extra result", f => { f.results.extra = structuredClone(f.results.positive); }],
  ["missing result", f => { f.results = {}; }],
  ["dirty candidate", f => { f.results.positive.provenance.source.dirty = true; }],
  ["wrong candidate", f => { f.candidate = "c".repeat(40); }],
  ["changed fixture", f => { f.hashes.fixtureSha256 = "c".repeat(64); }],
  ["changed default captured policy", f => { f.hashes.contractsSha256 = "c".repeat(64); }],
  ["stale build", f => { f.results.positive.provenance.buildReceipt.distSha256 = "c".repeat(64); }],
  ["missing complete metadata", f => { f.meta = undefined; }],
  ["required image404", f => { f.results.positive.network.push({ resourceType: "image", path: "/image", status: 404 }); }],
  ["unknown policy key", f => { f.policy.journeys.positive.skip = true; }],
  ["unknown root policy key", f => { f.policy.normalize = true; }],
  ["policy attempts to permit403", f => { f.policy.journeys.positive.actions[0].status = 403; }],
  ["additive policy cannot override step expectation", f => { f.definitions[0].steps[6].expect = { textIncludes: ["Required original assertion"] }; }],
  ["additive policy cannot override default policy", f => { f.defaultPolicy = { journeys: { positive: { reloaded: { textIncludes: ["Required default assertion"] } } } }; }],
]) test(`${name} fails closed without changing raw input`, () => {
  const f = fixture(); change(f); const before = JSON.stringify(f);
  assert.equal(evaluateFollowOperations(f).verdict, "fail");
  assert.equal(JSON.stringify(f), before);
});
test("a changed existing preference must have the actual target field mutation", () => {
  const f = fixture(); f.policy.journeys.positive.state = { mode: "updated", id: 910, field: "db_content", value: "*never" };
  f.results.positive.rows = { cards: { updated: [{ id: 910, changes: { db_content: ["*always", "*never"] } }] } };
  assert.equal(evaluateFollowOperations(f).verdict, "pass");
  f.results.positive.rows.cards.updated[0].changes.db_content[1] = "*always";
  assert.equal(evaluateFollowOperations(f).verdict, "fail");
});

test("CLI pins evaluated policy/raw bytes, preserves input and refuses to overwrite evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "decko-follow-contract-"));
  try {
    const f = fixture(), put = (name, value) => writeFileSync(path.join(root, name), JSON.stringify(value));
    mkdirSync(path.join(root, "fixture")); mkdirSync(path.join(root, "actual"));
    put("fixture/deck.json", { unitOnly: true }); put("journeys.json", { journeys: f.definitions }); put("policy.json", f.policy); put("default.json", {}); put("engine.json", { name: "unit-only" });
    Object.assign(f.results.positive.provenance, { fixtureSha256: treeDigest(path.join(root, "fixture")), journeysSha256: sha256(readFileSync(path.join(root, "journeys.json"))), contractsSha256: sha256(readFileSync(path.join(root, "default.json"))), engineSha256: sha256(readFileSync(path.join(root, "engine.json"))) });
    put("actual/positive.json", f.results.positive); put("actual/run-meta.json", f.meta);
    const rawBefore = readFileSync(path.join(root, "actual/positive.json"));
    const cli = fileURLToPath(new URL("../evaluate-follow-operations.mjs", import.meta.url));
    const args = [cli, "--actual", path.join(root, "actual"), "--fixture", path.join(root, "fixture"), "--journeys", path.join(root, "journeys.json"), "--policy", path.join(root, "policy.json"), "--contracts", path.join(root, "default.json"), "--engine", path.join(root, "engine.json"), "--candidate", f.candidate, "--report", path.join(root, "report.json")];
    const first = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
    assert.equal(first.status, 0, first.stderr);
    const receipt = readFileSync(path.join(root, "report.json")), report = JSON.parse(receipt);
    assert.equal(report.integrity.operationPolicySha256, sha256(readFileSync(path.join(root, "policy.json"))));
    assert.equal(report.rawEvidence["positive.json"], sha256(rawBefore));
    assert.deepEqual(readFileSync(path.join(root, "actual/positive.json")), rawBefore);
    const second = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true });
    assert.equal(second.status, 1); assert.match(second.stderr, /EEXIST/);
    assert.deepEqual(readFileSync(path.join(root, "report.json")), receipt);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir())); assert.ok(path.basename(root).startsWith("decko-follow-contract-"));
    rmSync(root, { recursive: true, force: true });
  }
});
