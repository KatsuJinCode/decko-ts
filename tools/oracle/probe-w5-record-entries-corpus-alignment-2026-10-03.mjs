// probe-w5-record-entries-corpus-alignment-2026-10-03.mjs -- the
// record-alignment probe leg.
//
// WHAT THIS IS
//   The five record entries (dual-lane-view:<name>:record) have no leg in
//   first-diff-named-entries-probe.mjs: that harness reads line.views[view]
//   and the record expectation is the line's `record` field, not a view.
//   This probe is the record leg.
//
//   It boots the SAME seeded storage the graded run and the first-diff probe
//   boot (tests/card/render/raw-corpus-seeding.js, the committed home), then
//   replicates the graded card-engine record handler EXACTLY -- the field
//   logic of tools/oracle/dual-lane-direct-runner-core.ts:723-762
//   (registry.register("card-engine", ...)) -- and compares the handler's
//   CapturedCardRecord FIELD BY FIELD against the shard line's `record`
//   minus id (the graded comparison's expected value,
//   dual-lane-direct-runner-core.ts:598-607).
//
//   Per target it also prints the corpus mirror row (bench-corpus-raw.sqlite3,
//   independent read) so the probe output itself carries the row's provenance.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-w5-record-entries-corpus-alignment-2026-10-03.mjs \
//     [--out tmp/record-alignment-probe]
//
//   Exit 0 always when the run could start (a measuring instrument, not a gate).

import { register } from "node:module";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(argValue("--repo", path.resolve(HERE, "..", "..")));
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/w5-record-alignment/probe"));

// The graded run's seeding module: tools/oracle/dual-lane-direct-runner-core.ts:522
// (same boot the first-diff probe uses).
const SEEDING_MODULE = path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js");
const seeding = await import(pathToFileURL(SEEDING_MODULE).href);
if (typeof seeding.createRawStructureSeededStorage !== "function") {
  console.error(`PROBE-ERROR: committed seeding lacks createRawStructureSeededStorage`);
  process.exit(2);
}
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const Database = (await import("better-sqlite3")).default;

const { structureRuleUniverseStatement, structureUniverseFromResults, structuredCardContent } =
  await import(pathToFileURL(path.join(REPO, "src", "card", "rules", "structure.js")).href);
const { jsonValue } = await import(pathToFileURL(path.join(REPO, "src", "testing", "replay.js")).href);

// The five record entries: lane, shard, card name (the shard line whose
// `record` field is the entry's expected value).
const TARGETS = [
  { lane: "view", shard: "recapture-raw-shard-000007.jsonl", name: "*input type+*right+*content options" },
  { lane: "view", shard: "recapture-raw-shard-000003.jsonl", name: "*alerts" },
  { lane: "view", shard: "recapture-raw-shard-000003.jsonl", name: "*now" },
  { lane: "view", shard: "recapture-raw-shard-000003.jsonl", name: "*version" },
  { lane: "view", shard: "recapture-raw-shard-000039.jsonl", name: "Mod" },
];

function shardLines(lane, shard) {
  const p = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane", shard);
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

// ---- mirror row read (independent of the engine, for provenance) -----------
const mirror = new Database(RAW_CORPUS_DB, { readonly: true });
const rowById = new Map();
for (const r of mirror
  .prepare("SELECT id,name,key,codename,left_id,right_id,type_id,content,trash FROM cards")
  .all()) {
  rowById.set(r.id, r);
}
const cardNames = new Map();
function resolveName(id, seen = new Set()) {
  if (cardNames.has(id)) return cardNames.get(id);
  if (seen.has(id)) return null;
  seen.add(id);
  const c = rowById.get(id);
  if (!c) return null;
  let n = c.name;
  if (!n && c.left_id && c.right_id) {
    const l = resolveName(c.left_id, seen);
    const r = resolveName(c.right_id, seen);
    n = l && r ? `${l}+${r}` : null;
  }
  cardNames.set(id, n);
  return n;
}
for (const id of [...rowById.keys()]) resolveName(id);

// ---- boot (same shape as the graded runner + first-diff probe) -------------
const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();
console.log(`PROBE boot: corpus=${RAW_CORPUS_DB} seeding=tests/card/render/raw-corpus-seeding.js targets=${TARGETS.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

const universeBatch = await storage.fetcher.driver.batch([structureRuleUniverseStatement()]);
const structureUniverse = structureUniverseFromResults(universeBatch[0]);

/**
 * The graded card-engine record handler, replicated line-for-line from
 * tools/oracle/dual-lane-direct-runner-core.ts:723-762. Any divergence
 * between this function and that block is a probe defect; the source block
 * is the authority.
 */
async function gradedRecordHandler(name) {
  const card = await storage.fetcher.fetchByName(name);
  if (card === undefined) {
    throw new Error(`card not in seeded deck: ${name}`);
  }
  const engine = storage.fetcher;
  const typeCard = card.typeId === undefined ? undefined : await engine.fetchById(card.typeId);
  const typeCode =
    card.typeId === undefined
      ? undefined
      : (await engine.codenames.nameForId(card.typeId)) ?? "";
  const typeName = typeCard?.name;
  let leftTypeName;
  if (card.leftId !== undefined) {
    const leftCard = await engine.fetchById(card.leftId);
    if (leftCard?.typeId !== undefined) {
      const leftTypeCard = await engine.fetchById(leftCard.typeId);
      leftTypeName = leftTypeCard?.name;
    }
  }
  const isSimple = card.name === undefined || card.name.isSimple;
  const content = structuredCardContent(
    {
      name: card.name ?? "",
      id: card.id,
      typeId: card.typeId,
      typeName,
      leftTypeName,
      isNew: card.isNew,
    },
    card.dbContent,
    structureUniverse,
  );
  const record = {
    name: card.name?.s ?? "",
    key: card.key ?? "",
    type: typeCard?.name?.s ?? "",
    type_code: typeCode ?? "",
    codename: card.codename ?? null,
    content,
    left: isSimple ? null : (card.name?.leftName?.s ?? null),
    right: isSimple ? null : (card.name?.rightName?.s ?? null),
  };
  return record;
}

mkdirSync(OUT_DIR, { recursive: true });
const summary = [];
for (const t of TARGETS) {
  const line = shardLines(t.lane, t.shard).find((l) => l.name === t.name);
  if (line === undefined || line.record === undefined) {
    console.log(`MISSING ${t.name} (${t.shard})`);
    summary.push({ tag: `${t.name}:record`, verdict: "MISSING" });
    continue;
  }
  const expected = { ...line.record };
  delete expected.id; // the graded comparison strips id (DB-local, informational)
  const mirrorRow = [...rowById.values()].filter(
    (c) => c.trash === 0 && resolveName(c.id) === t.name,
  );
  const row = mirrorRow[0];
  const rowInfo = row
    ? `mirror id=${row.id} type_id=${row.type_id} codename=${JSON.stringify(row.codename)} clen=${row.content?.length ?? 0} content=${JSON.stringify(row.content?.slice(0, 120))}`
    : "mirror ROW ABSENT";
  console.log(`\n===== ${t.name}:record | ${t.shard} | ${rowInfo}`);

  let actual;
  try {
    actual = await gradedRecordHandler(t.name);
  } catch (error) {
    console.log(`RAISE ${t.name}:record ${error?.constructor?.name ?? "Error"}: ${error?.message ?? error}`);
    summary.push({ tag: `${t.name}:record`, verdict: "RAISE" });
    continue;
  }

  const fields = ["name", "key", "type", "type_code", "codename", "content", "left", "right"];
  const diffs = [];
  for (const f of fields) {
    if (JSON.stringify(expected[f]) !== JSON.stringify(actual[f])) {
      diffs.push({
        field: f,
        expected: expected[f],
        actual: actual[f],
      });
    }
  }
  if (diffs.length === 0) {
    console.log(`PASS ${t.name}:record (handler record == shard record, all 8 fields)`);
    summary.push({ tag: `${t.name}:record`, verdict: "PASS", delta: 0 });
    continue;
  }
  console.log(`FAIL ${t.name}:record diverging fields: ${diffs.map((d) => d.field).join(", ")}`);
  for (const d of diffs) {
    console.log(`  field ${d.field}:`);
    console.log(`    expected: ${JSON.stringify(d.expected)?.slice(0, 400)}`);
    console.log(`    actual:   ${JSON.stringify(d.actual)?.slice(0, 400)}`);
  }
  const sameBytes =
    JSON.stringify(jsonValue(actual)) === JSON.stringify(expected);
  console.log(`  whole-record JSON equal: ${sameBytes}`);
  summary.push({
    tag: `${t.name}:record`,
    verdict: "FAIL",
    divergingFields: diffs.map((d) => d.field),
  });
}

console.log("\nPROBE summary:");
for (const s of summary) console.log(`  ${s.verdict} ${s.tag}`);
writeFileSync(path.join(OUT_DIR, "record-probe-summary.json"), JSON.stringify(summary, null, 2));
console.log(`PROBE outputs in ${OUT_DIR}`);
mirror.close();
storage.close();
process.exit(0);
