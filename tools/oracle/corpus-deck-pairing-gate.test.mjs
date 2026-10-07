// corpus-deck-pairing-gate.test.mjs -- the gate refuses a corpus captured on
// another deck than the graded one, and passes a paired corpus.
//
// The defect it guards (grade-11 seam-clean, 2026-10-05): 2,555 page rows were
// captured as not-found placeholders (id nil) and 114 as "Card.fetch returned
// nil" because the capture deck lacked cards the graded deck holds; the grade
// scored them as engine byte-diffs. Each test below builds a three-card deck
// and a one-shard corpus in a temp dir (removed in finally) and runs the gate
// as the fire script does, so the exit code and marker are what is asserted.
//
// Run: node --test tools/oracle/corpus-deck-pairing-gate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyRow, checkDeckIdentity, FETCH_NIL_ERROR } from "./corpus-deck-pairing-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, "corpus-deck-pairing-gate.mjs");
const Database = createRequire(pathToFileURL(path.join(HERE, "..", "..", "package.json")).href)("better-sqlite3");

const INPUT = [
  { id: 10, name: "Alpha" },
  { id: 11, name: "Alpha+Beta" },
  { id: 12, name: "Gamma" },
];
const page = (o) => JSON.stringify({ lane: "page", page_html: "<html>x</html>", ...o });

function fixture(pageRows, { provenanceSha } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pairing-gate-"));
  const corpus = path.join(root, "raw-ground-truth");
  mkdirSync(path.join(corpus, "expected-v2", "page-lane"), { recursive: true });
  const deckPath = path.join(corpus, "bench-corpus-raw.sqlite3");
  const db = new Database(deckPath);
  db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, trash INTEGER)");
  for (const c of INPUT) db.prepare("INSERT INTO cards VALUES (?, ?, 0)").run(c.id, c.name);
  db.close();
  const shard = path.join(corpus, "expected-v2", "page-lane", "recapture-raw-shard-000000.jsonl");
  writeFileSync(shard, pageRows.join("\r\n") + "\r\n");
  const inputSet = path.join(root, "input.json");
  writeFileSync(inputSet, JSON.stringify({ cards: INPUT }));
  const sha = createHash("sha256").update(readFileSync(deckPath)).digest("hex");
  const prov = path.join(root, "prov.json");
  writeFileSync(prov, JSON.stringify({ deck: { sourceSnapshotSha256: provenanceSha ?? sha } }));
  return { root, corpus, inputSet, prov, shard };
}

function runGate(f, mode = "gate") {
  const r = spawnSync(process.execPath, [GATE, "--corpus", f.corpus, "--input-set", f.inputSet, "--provenance", f.prov, "--mode", mode], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

const allPaired = () => INPUT.map((c) => page({ id: c.id, name: c.name }));

test("a corpus captured on the graded deck passes", () => {
  const f = fixture(allPaired());
  try {
    const r = runGate(f);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /PAIRING-OK/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a not-found placeholder (captured id nil) for a card the graded deck holds is refused", () => {
  const rows = allPaired();
  rows[1] = page({ id: null, name: "Alpha+Beta" });
  const f = fixture(rows);
  try {
    const before = readFileSync(f.shard);
    const r = runGate(f);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /"page:identity-differs": 1/);
    assert.match(r.out, /PAIRING-FAULT/);
    assert.deepEqual(readFileSync(f.shard), before, "the gate never edits a shard");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a fetch-nil capture error for a card the graded deck holds is refused", () => {
  const rows = allPaired();
  rows[2] = JSON.stringify({ lane: "page", id: 12, name: "Gamma", error: FETCH_NIL_ERROR });
  const f = fixture(rows);
  try {
    const r = runGate(f);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /"page:capture-deck-missing-card": 1/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a capture provenance naming another deck is refused even when every row pairs", () => {
  const f = fixture(allPaired(), { provenanceSha: "ab".repeat(32) });
  try {
    const r = runGate(f);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /"verdict": "MISMATCH"/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("report mode prints the same faults and exits 0", () => {
  const rows = allPaired();
  rows[0] = page({ id: null, name: "Alpha" });
  const f = fixture(rows);
  try {
    const r = runGate(f, "report");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /"page:identity-differs": 1/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("classifyRow: a render error on a card both decks hold is not a pairing fault", () => {
  const live = () => true;
  assert.equal(classifyRow({ name: "X", id: 5, error: "CAPTURE_ERROR: NoMethodError: undefined method `year'" }, 5, live), null);
  assert.equal(classifyRow({ name: "X", id: 5 }, 5, live), null);
  assert.equal(classifyRow({ name: "X", id: 6 }, 5, live), "identity-differs");
  assert.equal(classifyRow({ name: "X", id: 5 }, 5, () => false), "graded-deck-missing-card");
  assert.equal(classifyRow({ name: "X", id: 5, error: FETCH_NIL_ERROR }, 5, () => false), null);
  assert.equal(classifyRow({ name: "X", id: 5 }, undefined, live), "unknown-input");
});

/** A Decko-schema capture deck built from the fixture's graded deck. */
function captureDeckFor(f, mutate) {
  const p = path.join(f.root, "corpus-v2.sqlite3");
  const db = new Database(p);
  db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, left_id INTEGER, right_id INTEGER, type_id INTEGER, trash INTEGER, read_rule_class TEXT, read_rule_id INTEGER, creator_id INTEGER, updater_id INTEGER, created_at TEXT, updated_at TEXT, db_content TEXT)");
  db.exec("CREATE TABLE card_references (id INTEGER PRIMARY KEY, referer_id INTEGER, referee_key TEXT, referee_id INTEGER, ref_type TEXT, is_present INTEGER)");
  for (const c of INPUT) db.prepare("INSERT INTO cards VALUES (?, ?, ?, NULL, NULL, NULL, 3, 0, NULL, NULL, 1, 1, 't', 't', 'body')").run(c.id, c.name, c.name.toLowerCase());
  mutate?.(db);
  db.close();
  return p;
}
function richFixture(rows, opts) {
  const f = fixture(rows, opts);
  const db = new Database(path.join(f.corpus, "bench-corpus-raw.sqlite3"));
  db.exec("DROP TABLE cards");
  db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, left_id INTEGER, right_id INTEGER, creator_id INTEGER, updater_id INTEGER, read_rule_class TEXT, read_rule_id INTEGER, trash INTEGER, type_id INTEGER, content TEXT, created_at TEXT, updated_at TEXT)");
  db.exec("CREATE TABLE card_references (id INTEGER PRIMARY KEY, referer_id INTEGER, referee_key TEXT, referee_id INTEGER, ref_type TEXT, is_present INTEGER)");
  for (const c of INPUT) db.prepare("INSERT INTO cards VALUES (?, ?, ?, NULL, NULL, NULL, 1, 1, NULL, NULL, 0, 3, 'body', 't', 't')").run(c.id, c.name, c.name);
  db.close();
  return f;
}
function runGateWithCaptureDeck(f, captureDeck, sha) {
  writeFileSync(f.prov, JSON.stringify({ deck: { capturedDeckSha256: sha } }));
  const r = spawnSync(process.execPath, [GATE, "--corpus", f.corpus, "--input-set", f.inputSet, "--provenance", f.prov, "--capture-deck", captureDeck, "--mode", "gate"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  return { code: r.status, out: r.stdout + r.stderr };
}
const fileSha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

test("a capture deck carrying the graded deck's rows (names/keys derived) pairs by content", () => {
  const f = richFixture(allPaired());
  try {
    const cap = captureDeckFor(f);
    const r = runGateWithCaptureDeck(f, cap, fileSha(cap));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /PAIRED-BY-CONTENT/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a capture deck missing one graded card is refused", () => {
  const f = richFixture(allPaired());
  try {
    const cap = captureDeckFor(f, (db) => db.exec("DELETE FROM cards WHERE id = 12"));
    const r = runGateWithCaptureDeck(f, cap, fileSha(cap));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /"cardsOnlyGraded": 1/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a capture deck whose content differs in one card is refused", () => {
  const f = richFixture(allPaired());
  try {
    const cap = captureDeckFor(f, (db) => db.exec("UPDATE cards SET db_content = 'edited' WHERE id = 11"));
    const r = runGateWithCaptureDeck(f, cap, fileSha(cap));
    assert.equal(r.code, 2, r.out);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a provenance naming another capture deck file is refused even when content pairs", () => {
  const f = richFixture(allPaired());
  try {
    const cap = captureDeckFor(f);
    const r = runGateWithCaptureDeck(f, cap, "cd".repeat(32));
    assert.equal(r.code, 2, r.out);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("checkDeckIdentity: no deck sha in the provenance is UNVERIFIED, never PAIRED", () => {
  assert.equal(checkDeckIdentity({}, "aa").verdict, "UNVERIFIED");
  assert.equal(checkDeckIdentity({ deck: { capturedDeckSha256: "aa" } }, "aa").verdict, "PAIRED");
  assert.equal(checkDeckIdentity({ deck: { sourceSnapshotSha256: "bb" } }, "aa").verdict, "MISMATCH");
});
