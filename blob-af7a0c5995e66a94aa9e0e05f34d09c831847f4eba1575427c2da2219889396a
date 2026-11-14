// audit-shard-entries-against-both-corpus-legs.mjs — three-leg provenance
// audit for the machine-local fixture shards (fixtures/corpus/shard-*.jsonl).
//
// WHAT THIS IS: the one-purpose audit the fixture-28-repair lane (2026-10-01)
// built to settle the highlighter-rework post-mortem's "fixture-vintage
// defect" claim (fixtures/corpus/shard-000028.jsonl card 33795 *Ace carries
// scrambled content while bench-corpus-raw.sqlite3 + the raw view-lane
// recapture agree on the ace-config JSON). Verdict it produced: the claim
// confused the two corpus legs. The fixture shards belong to the SANITIZED
// leg (bench-corpus-v2.sqlite3 + fixtures/corpus-v2/recapture, the committed
// recapture oracle); their scrambled content is the documented sanitization
// transform (benchmarks/corpus-v2/build_corpus_v2.py step 3, byte-length-
// preserving filler over the v1 sanitize_corpus.py transform; star-rule name
// parts and codenames preserved verbatim). The RAW leg (bench-corpus-raw
// + tmp/raw-ground-truth/expected-v2) is a DIFFERENT authority pair used by
// the dual-lane capture; a sanitized fixture entry disagreeing with it is
// the design, not damage. Regenerating fixture entries from the raw DB would
// break the fixture<->sanitized-DB<->captured-views replay contract and
// inject unsanitized bytes into a sanitized tree — so the audit REPLACES no
// bytes; it measures and reports.
//
// Per entry, over both legs:
//   premiseSignature : raw DB content == raw view-oracle content AND fixture
//                      content differs (the post-mortem's literal defect
//                      signature; corpus-wide it matches 3151/47232 entries —
//                      it selects the designed sanitization divergence, not a
//                      defect)
//   ownWorldConsistent : fixture content == sanitized DB content OR == the
//                      committed sanitized recapture content
//   ownWorldDrift    : neither (dominated by documented capture-vs-build
//                      classes: structure-pending rule cards, type-template
//                      inclusion resolution, derived skin CSS; shard-000028's
//                      one true outlier is 33898 solar skin, derived content
//                      no DB authority holds)
//
// Usage (paths are machine-local; edit LEG PATHS below for your checkout):
//   node benchmarks/corpus-v2/audit-shard-entries-against-both-corpus-legs.mjs            # 48-shard census
//   node ... audit-shard-entries-against-both-corpus-legs.mjs 28                          # single shard detail
//
// Read-only: opens both sqlite legs readonly, reads fixture + oracle JSONL,
// writes nothing but stdout.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const BetterSqlite3 = require(path.join(REPO_ROOT, "node_modules", "better-sqlite3"));

// --- leg paths (machine-local, all gitignored except the recapture) -------
const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "corpus");
const RECATURE_DIR = path.join(REPO_ROOT, "fixtures", "corpus-v2", "recapture");
const SANITIZED_DB = process.env.DECKO_TS_CORPUS_V2 ?? path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const RAW_DB = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3");
const RAW_VIEW_ORACLE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");

const readJsonl = (p) =>
  fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));

for (const p of [SANITIZED_DB, RAW_DB]) {
  if (!fs.existsSync(p)) {
    console.error(`audit requires both corpus legs on disk; missing: ${p}\n` +
      `sanitized leg: bench-corpus-v2.sqlite3 (gitignored, rebuildable via build_corpus_v2.py) or set DECKO_TS_CORPUS_V2\n` +
      `raw leg: tmp/raw-ground-truth/bench-corpus-raw.sqlite3 (machine-local raw ground truth)`);
    process.exit(2);
  }
}
const sanitizedDb = new BetterSqlite3(SANITIZED_DB, { readonly: true });
const rawDb = new BetterSqlite3(RAW_DB, { readonly: true });
const sanitizedContent = new Map();
for (const r of sanitizedDb.prepare("SELECT id, content FROM cards").iterate()) sanitizedContent.set(r.id, r.content ?? null);
const rawContent = new Map();
for (const r of rawDb.prepare("SELECT id, codename, content FROM cards").iterate()) rawContent.set(r.id, r);

function auditShard(shardIdx) {
  const shard = `shard-${String(shardIdx).padStart(6, "0")}.jsonl`;
  const fixture = readJsonl(path.join(FIXTURE_DIR, shard));
  let rawOracle = [], recapture = [];
  try { rawOracle = readJsonl(path.join(RAW_VIEW_ORACLE_DIR, `recapture-raw-${shard}`)); } catch { /* leg absent for this shard */ }
  try { recapture = readJsonl(path.join(RECATURE_DIR, `recapture-${shard}`)); } catch { /* optional */ }
  const rawOracleContent = new Map(rawOracle.map((e) => [e.id, e.record?.content ?? null]));
  const recaptureContent = new Map(recapture.map((e) => [e.id, e.record?.content ?? null]));

  const rows = { premiseSignature: [], ownWorldDrift: [], ownWorldConsistent: 0 };
  for (const e of fixture) {
    const fc = e.record?.content ?? null;
    const raw = rawContent.get(e.id);
    const dbc = raw?.content ?? null;
    const oc = rawOracleContent.has(e.id) ? rawOracleContent.get(e.id) : undefined;
    const v2c = sanitizedContent.has(e.id) ? sanitizedContent.get(e.id) : undefined;
    const scc = recaptureContent.has(e.id) ? recaptureContent.get(e.id) : undefined;
    if (dbc !== null && oc !== undefined && oc !== null && dbc === oc && fc !== dbc) {
      rows.premiseSignature.push({ id: e.id, name: e.record?.name, codenamed: raw?.codename != null });
      continue;
    }
    const consistent = (v2c !== undefined && fc === v2c) || (scc !== undefined && fc === scc);
    if (consistent) rows.ownWorldConsistent++;
    else rows.ownWorldDrift.push({ id: e.id, name: e.record?.name });
  }
  return { shard, total: fixture.length, ...rows };
}

const arg = process.argv[2];
if (arg !== undefined) {
  const r = auditShard(Number(arg));
  console.log(JSON.stringify(r, (k, v) => (k === "premiseSignature" && Array.isArray(v) ? v.slice(0, 50) : v), 1));
} else {
  let entries = 0, premise = 0, drift = 0;
  for (let s = 0; s < 48; s++) {
    let r;
    try { r = auditShard(s); } catch { continue; }
    entries += r.total; premise += r.premiseSignature.length; drift += r.ownWorldDrift.length;
    if (r.premiseSignature.length || r.ownWorldDrift.length)
      console.log(`${r.shard}: entries=${r.total} premiseSignature=${r.premiseSignature.length} ownWorldDrift=${r.ownWorldDrift.length} ownWorldConsistent=${r.ownWorldConsistent}`);
  }
  console.log(`TOTAL: entries=${entries} premiseSignature=${premise} ownWorldDrift=${drift}`);
  console.log(`legs: sanitized=${SANITIZED_DB} raw=${RAW_DB}`);
}
