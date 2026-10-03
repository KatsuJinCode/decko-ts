// selftest-staging-graded-truth-family-and-skin.mjs -- the harness-corpus-repair
// lane's verify instrument, extended by the m8-envelope-completion lane to the
// whole M8 skin:record class: does a FRESH staging build (the committed seeding
// home + the capture-restored override table) reproduce the oracle's graded
// truth for the entry classes this lane repairs?
//
// CHECKS (exit 0 only when all pass)
//   1. Family content references reach staging: 21 card_references rows with
//      referee_id 568 (corpus parity), and the Family page's own referred_to_by
//      CQL ({"refer_to":"_left","sort":"name"}) through the runSearch-shaped
//      executeQuery (permission options + context) returns the ORACLE's item
//      set. The oracle Family page (expected-v2 page-lane id 568) renders
//      FIVE search-result items (BW 20101222+Associations+tags,
//      BW 20110109+Associations+tags, tracked item test+associations+tags,
//      WilliamsCraig Library+Associations+tags, Schema) -- the "19 items"
//      figure in the M5 narrative was the ref_type-L ROW census, not the
//      oracle's rendered item count. The page-render seating itself is
//      reported informationally: 4 of the 5 rows are junction children whose
//      name composition runs through the lexicon cache, an engine-side path
//      this lane does not own (render.ts runSearch `record.name === undefined`
//      guard; the rows themselves ARE staged).
//   2. EVERY row of the capture-restored override table
//      (tests/card/render/raw-corpus-override-capture-restored-rows.json --
//      the 20 M8 class skins + journal skin customized): the staged card's
//      dbContent is byte-equal to the override row, and the record envelope
//      rebuilt through the graded runner's own card-engine record handler
//      (dual-lane-direct-runner-core.ts:708-757) is FIELD-EQUAL to that
//      card's oracle capture record (expected-v2 view-lane shard; for 34179
//      additionally the p21 capture file, the original proven comparison).
//   3. journal skin customized+parent 1 (45365): the +parent subcard the
//      Customize-button gate reads is present in staging with its corpus
//      content ("journal skin").
//
// USAGE (from the worktree root)
//   node tools/oracle/selftest-staging-graded-truth-family-and-skin.mjs \
//     [--capture <p21 expected record html>] [--out tmp/harness-corpus-repair/selftest.json]

import { register } from "node:module";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(argValue("--repo", path.resolve(HERE, "..", "..")));
const OUT = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/harness-corpus-repair/selftest-staging-graded-truth.json"));
const CAPTURE =
  argValue("--capture", "") ||
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/p21-probe-results/nest-tip-shard-000028/html/000028-journal_skin_customized-_record_.expected.html";
const VIEW_LANE_DIR = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane");

// ---- the capture records: name -> record, from the expected-v2 view-lane shards ----
const captureRecords = new Map();
const captureShardOf = new Map();
if (existsSync(VIEW_LANE_DIR)) {
  for (const f of readdirSync(VIEW_LANE_DIR).filter((n) => n.endsWith(".jsonl"))) {
    for (const l of readFileSync(path.join(VIEW_LANE_DIR, f), "utf8").split("\n").filter(Boolean)) {
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      if (o.record && o.record.name !== undefined && !captureRecords.has(o.record.name)) {
        captureRecords.set(o.record.name, o.record);
        captureShardOf.set(o.record.name, f);
      }
    }
  }
}
console.log(`CAPTURES ${captureRecords.size} records from ${VIEW_LANE_DIR}`);

// The COMMITTED HOME -- the same module the graded runner imports
// (dual-lane-direct-runner-core.ts:522-526).
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const { executeQuery } = await import(pathToFileURL(path.join(REPO, "src", "cql", "execute.ts")).href);
const { DeckoName } = await import(pathToFileURL(path.join(REPO, "src", "card", "name.js")).href);

const corpus = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = corpus.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
corpus.close();

console.log(`BOOT committed-home seeding, corpus ${RAW_CORPUS_DB}, liveIds ${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
const engine = storage.engine;
const results = { checks: [] };
let allPass = true;
function check(name, pass, detail) {
  results.checks.push({ name, pass, detail });
  if (!pass) allPass = false;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

// ---- check 1: Family content references in staging + the page's own CQL ----
const driver = storage.fetcher.driver;
const stagingRefereeRows = await driver.query(
  "SELECT referer_id, ref_type FROM card_references WHERE referee_id = 568",
  [],
);
const stagingRefCount = (stagingRefereeRows.rows ?? []).length;
const refTypeCounts = {};
for (const row of stagingRefereeRows.rows ?? []) {
  refTypeCounts[row.ref_type] = (refTypeCounts[row.ref_type] ?? 0) + 1;
}
check(
  "family-content-refs-staged",
  stagingRefCount === 21,
  `staging card_references referee_id=568 rows=${stagingRefCount} (corpus 21) refTypes ${JSON.stringify(refTypeCounts)}`,
);

await engine.renderPage("Family");
const hostKeys = [...engine.searchResults.keys()];
const hostDetail = [];
let familyItems = null;
let familySeated = null;
for (const key of hostKeys) {
  const card = engine.renderCards.get(key);
  if (card === undefined) continue;
  const statement = JSON.parse(card.dbContent);
  statement.limit = 20;
  const perms = await engine.cqlPermissionOptions();
  const parseOptions = {
    context: card.name.s,
    ensureCardId: (nameish) => engine.fetcher.lexicon.id(nameish),
    resolveCardId: (nameish) => {
      const k = DeckoName.parse(nameish).key;
      return engine.idsByKey.get(k) ?? engine.fetcher.lexicon.peekId(nameish);
    },
  };
  const result = await executeQuery(engine.fetcher.driver, structuredClone(statement), {
    ...perms,
    parse: parseOptions,
  });
  const rows = "rows" in result ? result.rows : [];
  hostDetail.push(`${key}: seated=${engine.searchResults.get(key)?.length ?? null} queried=${rows.length}`);
  if (card.key === "family+*referred_to_by" || card.name.s.includes("referred_to_by")) {
    familyItems = rows.length;
    familySeated = engine.searchResults.get(key)?.length ?? null;
  }
}
check(
  "family-referred-to-by-oracle-item-count",
  familyItems === 5,
  `Family page search hosts [${hostDetail.join("; ")}] -- referred_to_by runSearch-shaped query rows=${familyItems} (oracle page renders 5 items); page-render seating=${familySeated} is the engine-side lexicon-composition residual, not a staged-rows gap`,
);

// ---- check 2: EVERY override row -- staged content + record envelope ----
// The graded runner's own card-engine record handler, line-for-line
// (dual-lane-direct-runner-core.ts:708-757); the structure universe batch is
// hoisted so it runs once for the whole loop.
const engineFetcher = storage.fetcher;
const { structureRuleUniverseStatement, structureUniverseFromResults, structuredCardContent } =
  await import(pathToFileURL(path.join(REPO, "src", "card", "rules", "structure.ts")).href);
const uB = await engineFetcher.driver.batch([structureRuleUniverseStatement()]);
const universe = structureUniverseFromResults(uB[0]);

async function runnerRecordEnvelope(card) {
  const typeCard =
    card.typeId === undefined ? undefined : await engineFetcher.fetchById(card.typeId);
  const typeCode =
    card.typeId === undefined ? undefined : (await engineFetcher.codenames.nameForId(card.typeId)) ?? "";
  const typeName = typeCard?.name;
  let leftTypeName;
  if (card.leftId !== undefined) {
    const leftCard = await engineFetcher.fetchById(card.leftId);
    if (leftCard?.typeId !== undefined) {
      const leftTypeCard = await engineFetcher.fetchById(leftCard.typeId);
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
    universe,
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
  // Serialize with the capture's shape: sorted keys, compact separators.
  const sorted = {};
  for (const k of Object.keys(record).sort()) sorted[k] = record[k];
  return sorted;
}

const RECORD_FIELDS = ["name", "key", "type", "type_code", "codename", "content", "left", "right"];

const overridePath = path.join(REPO, "tests", "card", "render", "raw-corpus-override-capture-restored-rows.json");
const override = JSON.parse(readFileSync(overridePath, "utf8"));
const nameById = new Map(override.meta.provenance.map((p) => [p.cardId, p.cardName]));
console.log(
  `OVERRIDE TABLE ${override.cards.length} cards, corpusSha ${override.meta.corpusSha256.slice(0, 12)}...`,
);
const p21Journal = JSON.parse(readFileSync(CAPTURE, "utf8"));

for (const row of override.cards) {
  const cardName = nameById.get(row.id) ?? `(unknown name for ${row.id})`;
  const label = `skin-record-envelope[${row.id} ${cardName}]`;
  const staged = await storage.fetcher.fetchById(row.id);
  if (staged === undefined) {
    check(label, false, "card NOT in staged deck");
    continue;
  }
  const nameMatches = staged.name?.s === cardName;
  const contentMatches = staged.dbContent === row.content;
  if (!contentMatches || !nameMatches) {
    check(
      label,
      false,
      `override not applied as emitted: name=${staged.name?.s} nameMatches=${nameMatches} dbContent ${staged.dbContent.length} chars vs override ${row.content.length} chars byteEqual=${contentMatches}`,
    );
    continue;
  }
  // Shard capture (expected-v2 view-lane): the graded comparison source.
  const shardRecord = captureRecords.get(cardName);
  const p21Record = row.id === 34179 ? p21Journal : undefined;
  if (shardRecord === undefined && p21Record === undefined) {
    check(label, false, `no capture record found for ${cardName}`);
    continue;
  }
  const envelope = await runnerRecordEnvelope(staged);
  const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope));
  let ok = true;
  const details = [];
  for (const [srcName, rec] of [
    ...(shardRecord ? [[`shard ${captureShardOf.get(cardName)}`, shardRecord]] : []),
    ...(p21Record ? [["p21 capture file", p21Record]] : []),
  ]) {
    const fieldsEqual = RECORD_FIELDS.every((k) => envelope[k] === rec[k]);
    const contentByteEqual = envelope.content === rec.content;
    // Full-JSON equality additionally holds when the capture has no extra keys.
    const jsonEqual = JSON.stringify(envelope) === JSON.stringify(rec);
    details.push(
      `${srcName}: envelope ${envelopeBytes} B vs capture content ${rec.content.length} chars, contentByteEqual=${contentByteEqual} fieldsEqual=${fieldsEqual}${jsonEqual ? " jsonEqual" : ""}`,
    );
    if (!fieldsEqual || !contentByteEqual) ok = false;
  }
  check(label, ok, details.join(" | ") + " (pre-repair grade: the 50-byte corpus markup rendered instead)");
}

// ---- check 3: the +parent subcard reaches staging ----
const parentCard = await storage.fetcher.fetchByName("journal skin customized+parent 1");
check(
  "skin-plus-parent-staged",
  parentCard !== undefined && parentCard.dbContent === "journal skin",
  `journal skin customized+parent 1 staged=${parentCard !== undefined} content=${JSON.stringify(parentCard?.dbContent ?? null)} (corpus id 45365)`,
);

storage.close();
results.allPass = allPass;
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`${allPass ? "SELFTEST PASS" : "SELFTEST FAIL"} -- wrote ${OUT}`);
process.exit(allPass ? 0 : 1);
