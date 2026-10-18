#!/usr/bin/env node
// two-local-engines-proof.mjs — proves the walk comparison end to end against
// two LOCAL ts-engine instances on slightly different deck states, exactly as
// the eventual live walk will run (two hosts, one journey list, byte + pixel
// verdicts) — without touching any live host:
//
//   1. copies the synthetic-v1 fixture twice (deck.json + deck/ + files/ only);
//   2. seeds side B's copy with one small content difference: Note 001's
//      db_content gains a MUTATED marker sentence (a deck-state difference,
//      not an engine difference — the stand-in for "theirs differs here");
//   3. runs walk-and-compare.mjs in ENGINE mode (--engine-a ts.json
//      --fixture-a copyA --engine-b ts.json --fixture-b copyB), which boots
//      each engine fresh per journey on its own 127.0.0.1 port;
//   4. asserts the report: both walks complete; the home page is identical
//      after the named normalizations (slot ids differ between boots -> N*;
//      each engine's own origin port -> W8; the sign-in's session cookie ->
//      W1); the Note 001 page exchange DIFFERS with the seeded text; its
//      screenshot is a pixel-delta with a bounding region whose mask image
//      lands on disk; the journey verdict is DIVERGES (bytes + pixels).
//
// Nothing here sends a request beyond 127.0.0.1 (engine mode cannot: it only
// boots loopback servers, and the browser route guard allows the walked host
// alone; --offline additionally refuses the stock CDNs).

import { spawn } from "node:child_process";
import path from "node:path";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../.."); // reference-harness/live-walk/prove -> repo root
const walkCli = path.join(here, "..", "walk-and-compare.mjs");
const fixture = path.join(repo, "reference-harness", "fixtures", "synthetic-v1");
const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "ts.json");

const MUTATION_MARKER = "SEEDED TO DIFFER for the live-walk proof";

function copyFixture(dest) {
  mkdirSync(path.join(dest, "deck"), { recursive: true });
  copyFileSync(path.join(fixture, "deck.json"), path.join(dest, "deck.json"));
  for (const name of ["deck.sqlite3", "deck.sqlite3-wal", "deck.sqlite3-shm"]) {
    if (existsSync(path.join(fixture, "deck", name))) copyFileSync(path.join(fixture, "deck", name), path.join(dest, "deck", name));
  }
  if (existsSync(path.join(fixture, "deck", "files"))) cpSync(path.join(fixture, "deck", "files"), path.join(dest, "deck", "files"), { recursive: true });
}

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [walkCli, ...args], { stdio: ["ignore", "pipe", "pipe"], cwd: repo });
  let stdout = "", stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  child.once("close", (code) => resolve({ code, stdout, stderr }));
});

const work = mkdtempSync(path.join(os.tmpdir(), "live-walk-engines-proof-"));
const fixtureA = path.join(work, "fixture-a");
const fixtureB = path.join(work, "fixture-b");
copyFixture(fixtureA);
copyFixture(fixtureB);

// Seed side B's deck-state difference through the database itself.
{
  const db = new DatabaseSync(path.join(fixtureB, "deck", "deck.sqlite3"));
  const card = db.prepare("select id, db_content from cards where key = 'note_001'").get();
  assert.ok(card, "fixture has no Note 001 card to seed the difference into");
  db.prepare("update cards set db_content = ? where id = ?").run(`${card.db_content}<p>${MUTATION_MARKER}</p>`, card.id);
  db.close();
  const verify = new DatabaseSync(path.join(fixtureB, "deck", "deck.sqlite3"), { readOnly: true });
  const after = verify.prepare("select db_content from cards where key = 'note_001'").get();
  verify.close();
  assert.ok(after.db_content.includes(MUTATION_MARKER), "seeded mutation did not land in fixture B");
  console.log(`fixtures staged: A=${fixtureA} B=${fixtureB} (Note 001 seeded on B)`);
}

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err.message.split("\n").slice(0, 6).join("\n      ")}`);
  }
};

console.log("walk: two local ts engines (A: stock deck state, B: seeded deck state)");
const walked = await run([
  "--journeys", path.join(here, "journeys.engines.json"),
  "--engine-a", engineManifest, "--fixture-a", fixtureA,
  "--engine-b", engineManifest, "--fixture-b", fixtureB,
  "--label-a", "engine A (stock deck)", "--label-b", "engine B (seeded deck)",
  "--out", path.join(work, "run"),
  "--offline",
]);
check("walk-and-compare exits 0", () => assert.equal(walked.code, 0, walked.stderr.slice(0, 3000)));

if (walked.code === 0) {
  const json = JSON.parse(readFileSync(path.join(work, "run", "report.json"), "utf8"));
  const report = readFileSync(path.join(work, "run", "report.md"), "utf8");
  const j = json.journeys[0];

  check("both walks completed the journey", () => {
    assert.equal(j.walk.a.completed, true, `A error: ${j.walk.a.error}`);
    assert.equal(j.walk.b.completed, true, `B error: ${j.walk.b.error}`);
  });

  check("home page: identical after the named normalizations (N* slot ids, W8 own-origin ports, W1 session cookie)", () => {
    const home = j.bytes.pairs.find((p) => p.key === "GET /");
    assert.ok(home, "no home exchange pair");
    assert.ok(["identical", "normalization-explained"].includes(home.verdict), `home verdict: ${home.verdict}`);
    const applied = { ...j.bytes.appliedA, ...j.bytes.appliedB };
    assert.ok((applied["N*"]?.applied ?? 0) > 0, "the borrowed N* rules never applied (two boots render different slot ids)");
    assert.ok((applied["W8"]?.applied ?? 0) > 0, "W8 never applied (the two engines boot on different ports)");
    assert.ok((applied["W1"]?.applied ?? 0) > 0, "W1 never applied (the sign-in issues a session cookie per side)");
  });

  check("Note 001 page: byte DIFFERS with the seeded mutation named", () => {
    const note = j.bytes.pairs.find((p) => p.key === "GET /Note_001");
    assert.ok(note, "no Note 001 exchange pair");
    assert.equal(note.verdict, "differs");
    assert.ok(JSON.stringify(note.bodyDiff).includes("SEEDED TO DIFFER"), "the seeded marker text not found in the body diff");
  });

  check("pixels: home identical; Note 001 a pixel-delta with a region whose mask image is on disk", () => {
    const homeShot = j.pixels.find((p) => p.name === "home, signed out");
    assert.ok(homeShot, "no home shot");
    assert.equal(homeShot.verdict, "identical", `home shot: ${homeShot.verdict} ${homeShot.reason ?? ""} delta=${homeShot.deltaCount}`);
    const noteShot = j.pixels.find((p) => p.verdict === "pixel-delta");
    assert.ok(noteShot, `no pixel-delta shot: ${JSON.stringify(j.pixels.map((p) => [p.name, p.verdict, p.deltaCount]))}`);
    assert.ok(noteShot.deltaCount > 0 && noteShot.regions.length >= 1);
    assert.ok(existsSync(path.join(work, "run", "pixels", j.id, noteShot.mask)), "mask image missing");
  });

  check("journey verdict: DIVERGES (bytes + pixels)", () => {
    assert.match(j.verdict, /DIVERGES \(bytes \+ pixels\)/);
    assert.match(report, /## Normalization table/);
    assert.match(report, /## Verdicts/);
  });

  check("the sign-in POST is captured with its password redacted (R1)", () => {
    const jsonl = readFileSync(path.join(work, "run", "a", j.id, "exchanges", "exchanges.jsonl"), "utf8");
    assert.doesNotMatch(jsonl, /Fixture member pass 1#/);
    assert.match(jsonl, /R1%23redacted/);
  });
} else {
  console.log(walked.stdout.slice(-3000), walked.stderr.slice(-3000));
  process.exitCode = 1;
}

if (failures > 0) {
  console.log(`two-local-engines-proof: ${failures} check(s) FAILED (evidence kept at ${path.join(work, "run")})`);
  process.exitCode = 1;
} else {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* tmp residue named by path */ }
  console.log("two-local-engines-proof: all checks passed");
}
