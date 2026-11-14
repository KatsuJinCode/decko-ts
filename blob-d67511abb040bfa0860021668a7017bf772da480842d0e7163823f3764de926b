#!/usr/bin/env node
// search-order-two-local-engines-proof.mjs — the proof for the live-walk
// search-order comparison module (lib/search-order-compare.mjs, run through
// the compare-search-order.mjs CLI as a subprocess, so the proven tool is
// exactly the tool an operator runs).
//
// Stand-in for live-vs-ours: two LOCAL ts-engine instances (reference-harness/
// browser/engines/ts.json) booted by this script on private copies of the
// synthetic-v1 fixture. No request leaves this machine.
//
// Every staged deck copy is first timestamp-normalized: each card gets a
// DISTINCT updated_at derived deterministically from its rowid, identical on
// every copy. Mechanism: the fixture's cards all share one timestamp, and the
// *search card sorts by "relevance" (= updated_at, a full tie) — SQLite gives
// no cross-instance guarantee for a tied sort tier, so the 20-item results
// window flickers at its edge between two otherwise-identical instances. The
// normalization gives the relevance sort a total order, so window membership
// is stable and every difference the walk reports is staged or injected on
// purpose. (The tie flicker itself is real engine behavior on tied data and
// is documented in the usage doc; live decks have spread timestamps.)
//
//   Phase DATA      — engine B's deck copy adds three deliberate card-set
//                     differences on top of the normalization (add
//                     "Topic 000", rename "Topic 001" -> "Topaz 001", trash
//                     "Topic 002"): the stand-in for "the live deck has cards
//                     ours lacks and some slightly edited cards". Expected:
//                     every verdict is data (order identical over the
//                     intersection, the staged cards — and ONLY the staged
//                     cards — named on the cards-only lists), and NOT ONE
//                     order-differs.
//   Phase BEHAVIOR  — the dist engine's sort compilation
//                     (dist/src/cql/sql.js, one unique ORDER BY template) is
//                     patched to flip every ORDER BY directive's direction
//                     (name sort asc->desc, relevance desc->asc), and a
//                     fresh engine C boots on a deck copy byte-identical to
//                     engine A's (sha256-proven). Expected: order-differs
//                     verdicts with EMPTY verified-absence lists — the
//                     module catches a real behavior difference and does not
//                     mistake it for data.
//   Phase REVERT    — the dist file is restored byte-exact (sha256 compared
//                     to the pre-patch digest, `git status --porcelain dist/`
//                     empty), a fresh engine D boots on a copy identical to
//                     engine B's, and the walk must reproduce phase DATA's
//                     verdict matrix exactly.
//
//   node reference-harness/live-walk/prove/search-order-two-local-engines-proof.mjs \
//     [--out tmp/search-order-lane] [--fixture synthetic-v1]
//
// The proof fails closed: any assertion failure exits non-zero after
// restoring the dist file (restoration runs regardless of where the proof
// dies, so a red run never leaves a patched engine build behind). dist/ is a
// build artifact sibling lanes rebuild; the patch refuses blind (occurrence
// count must be exactly 1) and re-reads once on a mid-write race.

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const { loadEngine, startEngine } = await import(
  pathToFileURL(path.join(repo, "reference-harness/browser/lib/engines.mjs")).href
);

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const outDir = path.resolve(repo, args.out ?? "tmp/search-order-lane");
const fixtureName = args.fixture ?? "synthetic-v1";
const fixtureDir = path.join(repo, "reference-harness/fixtures", fixtureName);
mkdirSync(outDir, { recursive: true });

const DIST_SQL = path.join(repo, "dist/src/cql/sql.js");
const PATCH_FROM = "`ORDER BY ${orderDirectives.map((d) => (d.dir ? `${d.field} ${d.dir}` : d.field)).join(\", \")}`";
const PATCH_TO = "`ORDER BY ${orderDirectives.map((d) => `${d.field} ${d.dir === \"asc\" ? \"DESC\" : \"ASC\"}`).join(\", \")}`";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// The probe terms for the proof walks: raw letters (the default list's
// staple), partial words, and exact card names — each class the live walk
// uses, chosen so the staged differences land inside the captured windows.
const PROBE_TERMS = ["t", "T", "To", "Top", "Topic", "Topic 0", "Topic 001", "Topic 002", "Topaz", "Memo", "Zebra"];

// The verified card-set discrepancy must name EXACTLY the staged
// differences (plus the junction cards that ride a renamed/trashed card's
// structure). The walk's windowEdge buckets (cards present on both hosts,
// merely outside the other host's 20-item page) are accounting noise the
// module names separately; anything unstaged in the VERIFIED buckets fails
// the proof.
const EXPECTED_ONLY_A = new Set(["Topic 001", "Topic 001+summary", "Topic 001+related", "Topic 002", "goto:Topic 001", "goto:Topic 002"]);
const EXPECTED_ONLY_B = new Set(["Topaz 001", "Topaz 001+summary", "Topaz 001+related", "Topic 000", "goto:Topaz 001", "goto:Topic 000"]);

const receipt = [];
const say = (line) => {
  console.log(line);
  receipt.push(line);
};

let distBackup = null; // { bytes, sha } set at patch time, cleared on restore
let prePatchSha = null;
const restoreDist = () => {
  if (distBackup === null) return;
  const current = readFileSync(DIST_SQL);
  if (sha256(current) !== distBackup.sha) {
    writeFileSync(DIST_SQL, distBackup.bytes);
    const restored = sha256(readFileSync(DIST_SQL));
    say(restored === distBackup.sha
      ? `[revert] dist/src/cql/sql.js restored byte-exact (${distBackup.sha})`
      : `[revert][FATAL] dist/src/cql/sql.js sha ${restored} does not match the pre-patch digest ${distBackup.sha}`);
  } else {
    say("[revert] dist/src/cql/sql.js already byte-identical to the pre-patch digest");
  }
  distBackup = null;
};

const runCli = async (hostA, hostB, reportPath) => {
  const cli = path.join(repo, "reference-harness/live-walk/compare-search-order.mjs");
  const proc = spawn(process.execPath, [
    cli,
    "--host-a", hostA,
    "--host-b", hostB,
    "--terms", PROBE_TERMS.join(","),
    "--out", reportPath,
  ], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (b) => { out += b; });
  proc.stderr.on("data", (b) => { out += b; });
  const code = await new Promise((resolve) => proc.once("close", resolve));
  if (code !== 0) throw new Error(`compare-search-order CLI exited ${code}:\n${out}`);
  return { report: JSON.parse(readFileSync(reportPath, "utf8")), cliOutput: out };
};

/** Stage a private fixture copy: optional deliberate deck differences, then
 *  the deterministic timestamp normalization every copy gets. Returns the
 *  staged fixture dir, the deck file's sha256, and a cleanup fn. */
const stageDeckCopy = async ({ withDifferences }) => {
  const root = mkdtempSync(path.join(tmpdir(), "decko-search-order-staged-"));
  const stagedFixture = path.join(root, "fixture");
  cpSync(fixtureDir, stagedFixture, { recursive: true });
  const deckPath = path.join(stagedFixture, "deck", "deck.sqlite3");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(deckPath);
  if (withDifferences) {
    const nextId = db.prepare("SELECT MAX(id) m FROM cards").get().m + 1;
    const typeId = db.prepare("SELECT id FROM cards WHERE key = 'topic'").get().id;
    // World-readability is the neighbors' denormalized read rule: the same
    // read_rule_class/read_rule_id every Topic card carries (the write path
    // derives these; a raw insert must carry them or anonymous CQL filters
    // the card out — read_rule_id IN (readable set), src/cql/sql.ts
    // implicitConditions).
    const neighbor = db.prepare("SELECT read_rule_class, read_rule_id FROM cards WHERE key = 'topic_001'").get();
    if (!neighbor?.read_rule_id) throw new Error("no read rule on topic_001 to inherit for the staged card");
    db.prepare(
      "INSERT INTO cards (id, name, key, type_id, creator_id, updater_id, created_at, updated_at, db_content, trash, references_expired, read_rule_class, read_rule_id) VALUES (?, ?, ?, ?, 1, 1, '2026-09-19 12:00:00', '2026-09-19 12:00:00', '', 0, 0, ?, ?)",
    ).run(nextId, "Topic 000", "topic_000", typeId, neighbor.read_rule_class, neighbor.read_rule_id);
    db.prepare("UPDATE cards SET name = 'Topaz 001', key = 'topaz_001' WHERE key = 'topic_001'").run();
    db.prepare("UPDATE cards SET trash = 1 WHERE key = 'topic_002'").run();
  }
  // Timestamp normalization: a distinct updated_at per row, derived from the
  // rowid, identical on every copy (same base file, same rowids). Gives the
  // relevance sort (ORDER BY updated_at) a total order so the results window
  // is stable across instances; runs last so the staged rows get theirs too.
  db.prepare("UPDATE cards SET updated_at = datetime('2026-09-19 12:00:00', '+' || (rowid % 7000) || ' seconds')").run();
  const verified = withDifferences
    ? db.prepare("SELECT name FROM cards WHERE key IN ('topic_000','topaz_001') AND trash = 0").all().map((r) => r.name).sort()
    : null;
  const trashed = withDifferences ? db.prepare("SELECT COUNT(*) n FROM cards WHERE key = 'topic_002' AND trash = 1").get().n : null;
  const distinct = db.prepare("SELECT COUNT(DISTINCT updated_at) d, COUNT(*) n FROM cards").get();
  db.close();
  if (verified && (JSON.stringify(verified) !== JSON.stringify(["Topaz 001", "Topic 000"]) || trashed !== 1)) {
    throw new Error(`staging verification failed: seen=${JSON.stringify(verified)} trashed=${trashed}`);
  }
  if (distinct.d !== distinct.n) throw new Error(`timestamp normalization left ties: ${distinct.d} distinct of ${distinct.n}`);
  return {
    stagedFixture,
    deckSha: sha256(readFileSync(deckPath)),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

const verdictsOf = (report) =>
  report.probes.flatMap((p) => Object.entries(p.surfaces).map(([surface, v]) => ({ term: p.term, surface, v })));

const collectCardsOnly = (report) => {
  const absentA = new Set();
  const absentB = new Set();
  for (const { v } of verdictsOf(report)) {
    for (const k of v.cardsAbsentA ?? []) absentA.add(k);
    for (const k of v.cardsAbsentB ?? []) absentB.add(k);
  }
  return { onlyA: [...absentA].sort(), onlyB: [...absentB].sort() };
};

const printWalk = ({ cliOutput }) => {
  for (const line of cliOutput.trimEnd().split("\n")) say(`    ${line}`);
};

const assert = (cond, message) => {
  if (!cond) throw new Error(`PROOF ASSERTION FAILED: ${message}`);
};

const gitStatusPorcelain = (gitArgs) =>
  new Promise((resolve, reject) => {
    execFile("git", gitArgs, { cwd: repo, windowsHide: true }, (err, stdout, stderr) =>
      err ? reject(new Error(`git ${gitArgs.join(" ")} failed: ${stderr}`)) : resolve(stdout));
  });

/** The surgical sort patch, with a re-read for the mid-write race on the
 *  shared dist build artifact (sibling lanes rebuild dist). */
const patchDistSort = async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const bytes = readFileSync(DIST_SQL);
    const src = bytes.toString("utf8");
    const occurrences = src.split(PATCH_FROM).length - 1;
    if (occurrences === 1) {
      prePatchSha = sha256(bytes);
      distBackup = { bytes, sha: prePatchSha };
      writeFileSync(DIST_SQL, src.replace(PATCH_FROM, PATCH_TO));
      say(`pre-patch sha256(dist/src/cql/sql.js) = ${prePatchSha}`);
      say("patched: every ORDER BY directive flips its direction (name sort asc->desc, relevance desc->asc — both surfaces reverse)");
      return;
    }
    if (attempt < 3) {
      say(`[patch] attempt ${attempt}: ORDER BY template occurrences = ${occurrences} (dist rebuilt mid-read by another lane?) — re-reading`);
      await sleep(1500);
      continue;
    }
    throw new Error(`ORDER BY template occurrence count is ${occurrences}, expected exactly 1 — refusing to patch blind`);
  }
};

let engineA;
const stagedCopies = [];
let exitCode = 0;
try {
  // ---- boot -----------------------------------------------------------------
  const engine = loadEngine(path.join(repo, "reference-harness/browser/engines/ts.json"));
  const copyA = await stageDeckCopy({ withDifferences: false });
  stagedCopies.push(copyA);
  engineA = await startEngine(engine, copyA.stagedFixture, { logFile: path.join(outDir, "proof-engine-a.log") });
  say(`engine A (normalized ${fixtureName} deck, sha ${copyA.deckSha.slice(0, 12)}): ${engineA.base} (boot ${engineA.bootMs} ms)`);

  // ---- phase DATA -----------------------------------------------------------
  say("\n=== PHASE DATA: engine B = same engine, deck staged with deliberate card-set differences ===");
  const copyB = await stageDeckCopy({ withDifferences: true });
  stagedCopies.push(copyB);
  say("staged deck differences: +Topic 000 (new), Topic 001 -> Topaz 001 (renamed), Topic 002 (trashed); timestamps normalized identically");
  const engineB = await startEngine(engine, copyB.stagedFixture, { logFile: path.join(outDir, "proof-engine-b.log") });
  say(`engine B (staged deck, sha ${copyB.deckSha.slice(0, 12)}): ${engineB.base} (boot ${engineB.bootMs} ms)`);
  const phaseData = await runCli(engineA.base, engineB.base, path.join(outDir, "proof-phase-data-report.json"));
  printWalk(phaseData);
  {
    const verdicts = verdictsOf(phaseData.report);
    assert(verdicts.every(({ v }) => ["order-identical", "data-only", "empty-both"].includes(v.kind)),
      `phase DATA produced non-data verdicts: ${JSON.stringify(verdicts.filter(({ v }) => !["order-identical", "data-only", "empty-both"].includes(v.kind)).map(({ term, surface, v }) => `${surface}/${term}/${v.kind}`))}`);
    assert(verdicts.some(({ v }) => v.kind === "order-identical"), "phase DATA found no order-identical verdict");
    const { onlyA, onlyB } = collectCardsOnly(phaseData.report);
    const straysA = onlyA.filter((k) => !EXPECTED_ONLY_A.has(k));
    const straysB = onlyB.filter((k) => !EXPECTED_ONLY_B.has(k));
    assert(straysA.length === 0 && straysB.length === 0,
      `phase DATA card-set discrepancy names unstaged cards (window flicker or engine surprise): A-strays=${JSON.stringify(straysA)} B-strays=${JSON.stringify(straysB)}`);
    assert(onlyA.includes("Topic 001") && onlyA.includes("Topic 002"), `phase DATA cards-only-on-A misses the staged removals/renames: ${onlyA.join(" ")}`);
    assert(onlyB.includes("Topaz 001") && onlyB.includes("Topic 000"), `phase DATA cards-only-on-B misses the staged additions/renames: ${onlyB.join(" ")}`);
    say(`[assert] every verdict is data; discrepancy names exactly the staged cards: A-only=[${onlyA.join(" ")}] B-only=[${onlyB.join(" ")}]`);
  }
  await engineB.stop();
  say("engine B stopped");

  // ---- phase BEHAVIOR -------------------------------------------------------
  say("\n=== PHASE BEHAVIOR: dist sort patched; engine C = patched engine, deck byte-identical to A's ===");
  await patchDistSort();
  const copyC = await stageDeckCopy({ withDifferences: false });
  stagedCopies.push(copyC);
  assert(copyC.deckSha === copyA.deckSha,
    `engine C's deck sha ${copyC.deckSha} differs from engine A's ${copyA.deckSha} — the behavior phase would not be pure`);
  say(`[assert] engine C deck sha ${copyC.deckSha.slice(0, 12)} identical to engine A's: any order difference is pure behavior`);
  const engineC = await startEngine(engine, copyC.stagedFixture, { logFile: path.join(outDir, "proof-engine-c.log") });
  say(`engine C (patched sort): ${engineC.base} (boot ${engineC.bootMs} ms)`);
  const phaseBehavior = await runCli(engineA.base, engineC.base, path.join(outDir, "proof-phase-behavior-report.json"));
  printWalk(phaseBehavior);
  {
    const verdicts = verdictsOf(phaseBehavior.report);
    const differs = verdicts.filter(({ v }) => v.kind === "order-differs");
    assert(differs.length > 0, "phase BEHAVIOR caught no order difference — the module would be blind to a real sort change");
    assert(verdicts.every(({ v }) => v.kind !== "capture-failed"),
      "phase BEHAVIOR had capture failures (a red engine, not a measured difference)");
    const withCards = differs.filter(({ v }) => (v.cardsAbsentA ?? []).length > 0 || (v.cardsAbsentB ?? []).length > 0);
    assert(withCards.length === 0,
      `phase BEHAVIOR order-differs verdicts carry verified deck absence (not pure behavior): ${JSON.stringify(withCards.map(({ term, surface }) => `${surface}/${term}`))}`);
    const dataVerdicts = verdicts.filter(({ v }) => v.kind === "data-only");
    assert(dataVerdicts.length === 0,
      `phase BEHAVIOR reported data-only differences between identical decks: ${JSON.stringify(dataVerdicts.map(({ term, surface }) => `${surface}/${term}`))}`);
    say(`[assert] ${differs.length} verdict(s) read order-differs with EMPTY cards-only lists and no data-only verdicts — pure behavior difference, caught`);
  }
  await engineC.stop();
  say("engine C stopped");

  // ---- phase REVERT ---------------------------------------------------------
  say("\n=== PHASE REVERT: dist restored byte-exact; engine D re-proves the DATA verdicts ===");
  restoreDist();
  const restoredSha = sha256(readFileSync(DIST_SQL));
  say(`post-restore sha256(dist/src/cql/sql.js) = ${restoredSha}`);
  assert(restoredSha === prePatchSha, `restored dist sha ${restoredSha} != pre-patch ${prePatchSha}`);
  const distStatus = await gitStatusPorcelain(["status", "--porcelain", "dist/"]);
  assert(distStatus.trim() === "", `git reports dist/ modified after restore: ${JSON.stringify(distStatus)}`);
  say("[assert] dist/src/cql/sql.js byte-exact: sha256 matches the pre-patch digest, git status --porcelain dist/ is empty");
  const copyD = await stageDeckCopy({ withDifferences: true });
  stagedCopies.push(copyD);
  assert(copyD.deckSha === copyB.deckSha,
    `engine D's deck sha ${copyD.deckSha} differs from engine B's ${copyB.deckSha}`);
  const engineD = await startEngine(engine, copyD.stagedFixture, { logFile: path.join(outDir, "proof-engine-d.log") });
  say(`engine D (restored engine, deck sha ${copyD.deckSha.slice(0, 12)} identical to B's): ${engineD.base} (boot ${engineD.bootMs} ms)`);
  const phaseRevert = await runCli(engineA.base, engineD.base, path.join(outDir, "proof-phase-revert-report.json"));
  printWalk(phaseRevert);
  {
    const key = ({ term, surface }) => `${surface}/${term}`;
    const kindsData = Object.fromEntries(verdictsOf(phaseData.report).map((x) => [key(x), x.v.kind]));
    const kindsRevert = Object.fromEntries(verdictsOf(phaseRevert.report).map((x) => [key(x), x.v.kind]));
    assert(JSON.stringify(kindsData) === JSON.stringify(kindsRevert), "phase REVERT verdict kinds differ from phase DATA");
    const cardsData = JSON.stringify(collectCardsOnly(phaseData.report));
    const cardsRevert = JSON.stringify(collectCardsOnly(phaseRevert.report));
    assert(cardsData === cardsRevert, "phase REVERT cards-only sets differ from phase DATA");
    say(`[assert] reversion proven: verdict matrix and cards-only sets identical to phase DATA (${verdictsOf(phaseRevert.report).length} verdicts)`);
  }
  await engineD.stop();
  say("engine D stopped");
  say("\nPROOF COMPLETE: data differences read as data, an injected sort change is caught as behavior, reversion restores the data-only world.");
} catch (e) {
  say(`\nPROOF FAILED: ${e.message}`);
  exitCode = 1;
} finally {
  restoreDist();
  if (engineA) await engineA.stop();
  for (const copy of stagedCopies) copy.cleanup();
  writeFileSync(path.join(outDir, "proof-receipt.txt"), `${receipt.join("\n")}\n`);
  say(`receipt written: ${path.join(outDir, "proof-receipt.txt")}`);
}
process.exit(exitCode);
