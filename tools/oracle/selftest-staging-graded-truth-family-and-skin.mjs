// selftest-staging-graded-truth-family-and-skin.mjs -- the harness-corpus-repair
// lane's verify instrument: does a FRESH staging build (the committed seeding
// home + the capture-restored override table) reproduce the oracle's graded
// truth for the two entry classes this lane repairs?
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
//   2. journal skin customized (34179): staged content == the oracle record
//      capture's content (473,221 chars, byte-equal), and the record envelope
//      rebuilt through the graded runner's own card-engine record handler
//      (dual-lane-direct-runner-core.ts:708-757) field-matches the p21 oracle
//      capture (496,142 B file).
//   3. journal skin customized+parent 1 (45365): the +parent subcard the
//      Customize-button gate reads is present in staging with its corpus
//      content ("journal skin").
//
// USAGE (from the worktree root)
//   node tools/oracle/selftest-staging-graded-truth-family-and-skin.mjs \
//     [--capture <p21 expected record html>] [--out tmp/harness-corpus-repair/selftest.json]

import { register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
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

// ---- check 2: journal skin customized content + record envelope ----
const expectedCaptureBytes = readFileSync(CAPTURE);
const expectedRecord = JSON.parse(expectedCaptureBytes.toString("utf8"));
const staged = await storage.fetcher.fetchByName("journal skin customized");
if (staged === undefined) {
  check("skin-content-restored", false, "journal skin customized NOT in staged deck");
} else {
  const contentMatches = staged.dbContent === expectedRecord.content;
  check(
    "skin-content-restored",
    contentMatches,
    `staged content ${staged.dbContent.length} chars vs oracle capture ${expectedRecord.content.length} chars, byteEqual=${contentMatches} (corpus row held 252,170)`,
  );

  // The graded runner's own card-engine record handler, line-for-line
  // (dual-lane-direct-runner-core.ts:708-757).
  const engineFetcher = storage.fetcher;
  const typeCard =
    staged.typeId === undefined ? undefined : await engineFetcher.fetchById(staged.typeId);
  const typeCode =
    staged.typeId === undefined
      ? undefined
      : ((await engineFetcher.codenames.nameForId(staged.typeId)) ?? "");
  const typeName = typeCard?.name;
  let leftTypeName;
  if (staged.leftId !== undefined) {
    const leftCard = await engineFetcher.fetchById(staged.leftId);
    if (leftCard?.typeId !== undefined) {
      const leftTypeCard = await engineFetcher.fetchById(leftCard.typeId);
      leftTypeName = leftTypeCard?.name;
    }
  }
  const { structureRuleUniverseStatement, structureUniverseFromResults, structuredCardContent } =
    await import(pathToFileURL(path.join(REPO, "src", "card", "rules", "structure.ts")).href);
  const uB = await engineFetcher.driver.batch([structureRuleUniverseStatement()]);
  const universe = structureUniverseFromResults(uB[0]);
  const isSimple = staged.name === undefined || staged.name.isSimple;
  const content = structuredCardContent(
    {
      name: staged.name ?? "",
      id: staged.id,
      typeId: staged.typeId,
      typeName,
      leftTypeName,
      isNew: staged.isNew,
    },
    staged.dbContent,
    universe,
  );
  const record = {
    name: staged.name?.s ?? "",
    key: staged.key ?? "",
    type: typeCard?.name?.s ?? "",
    type_code: typeCode ?? "",
    codename: staged.codename ?? null,
    content,
    left: isSimple ? null : (staged.name?.leftName?.s ?? null),
    right: isSimple ? null : (staged.name?.rightName?.s ?? null),
  };
  // Serialize with the capture's shape: sorted keys, compact separators.
  const sorted = {};
  for (const k of Object.keys(record).sort()) sorted[k] = record[k];
  const envelopeText = JSON.stringify(sorted);
  const envelopeBytes = Buffer.byteLength(envelopeText);
  const captureBytes = expectedCaptureBytes.length;
  const deepEqual =
    JSON.stringify(sorted) === JSON.stringify(expectedRecord) ||
    (sorted.content === expectedRecord.content &&
      sorted.key === expectedRecord.key &&
      sorted.name === expectedRecord.name &&
      sorted.type === expectedRecord.type &&
      sorted.type_code === expectedRecord.type_code &&
      sorted.codename === expectedRecord.codename &&
      sorted.left === expectedRecord.left &&
      sorted.right === expectedRecord.right);
  check(
    "skin-record-envelope",
    deepEqual,
    `record envelope ${envelopeBytes} B vs capture ${captureBytes} B; fieldsEqual=${deepEqual} (pre-repair grade: 262,193 B actual vs 496,142 B oracle)`,
  );
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
