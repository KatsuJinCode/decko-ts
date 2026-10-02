// probe-negdelta-skin-record-mechanism.mjs -- WHY the 20 `skin:record`
// view-lane entries render ~217 bytes where the Ruby oracle renders ~500,000.
//
// WHAT THIS IS
//   The newest post-b8760ad graded run (artifacts-affected-rerun, 4 shards)
//   leaves 20 `dual-lane-view:<skin> skin:record` failures at ~-500,000
//   bytes each, plus `bootstrap: core:record` (-248,378) and
//   `bootstrap: functions:record` (-10,989). The expected record's
//   `content` field is 473,074 bytes of Bootstrap SCSS; the raw corpus
//   row for the same card id holds 50 bytes of wikitext
//   ("[[themeless bootstrap skin]]\n[[+bootswatch theme]]").
//
//   Oracle: tools/oracle/capture-dual-lane-page-and-view.rb:262 captures
//   `card.content`; prototype/lib/card/content/all.rb:8-10 defines
//   `content = structured_content || standard_content`, and :25-27
//   `structured_content = structure && default_content`. So the oracle's
//   record content is the STRUCTURE RULE's db_content, not this card's.
//   The engine's equivalent is structuredCardContent
//   (src/card/rules/structure.ts:263).
//
//   This probe boots the engine at the COMMITTED seeding home (the same
//   module the graded runner loads after b8760ad), then for each named
//   card prints: the candidate *structure rule names in precedence order,
//   which of them exist in the seeded universe, the winning template's
//   content length, the content the engine would emit, and whether the
//   winning rule card is reachable in the seeded deck at all.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negdelta-skin-record-mechanism.mjs \
//     --names "cerulean skin|bootstrap: core|bootstrap: functions" \
//     [--out tmp/negdelta-skin-mechanism.json]

import { register } from "node:module";
import { writeFileSync } from "node:fs";
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
  : path.join(REPO, argValue("--out", "tmp/negdelta-skin-mechanism.json"));
const NAMES = argValue(
  "--names",
  "cerulean skin|journal skin customized|bootstrap: core|bootstrap: functions|Setting",
).split("|").filter(Boolean);

const seeding = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;

const structure = await import(
  pathToFileURL(path.join(REPO, "src", "card", "rules", "structure.js")).href
);
const {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structuredCardContent,
  STRUCTURE_SETTING_NAME,
} = structure;

const ruleNames = await import(
  pathToFileURL(path.join(REPO, "src", "card", "set-patterns", "rule-names.js")).href
);
const { ruleNamesForCard } = ruleNames;

const corpus = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = corpus
  .prepare("SELECT id FROM cards WHERE trash = 0")
  .all()
  .map((r) => r.id);
const corpusRowFor = corpus.prepare(
  "SELECT id, key, codename, type_id, left_id, right_id, length(content) AS clen, content FROM cards WHERE id = ?",
);

console.log(`BOOT seeding=${path.relative(REPO, RAW_CORPUS_DB)} liveIds=${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);

const universeBatch = await storage.fetcher.driver.batch([
  structureRuleUniverseStatement(),
]);
const universe = structureUniverseFromResults(universeBatch[0]);
console.log(`UNIVERSE structure-rule rows in seeded deck = ${universe.size}`);

const rows = [];
for (const name of NAMES) {
  const card = await storage.fetcher.fetchByName(name);
  if (card === undefined) {
    rows.push({ name, error: "not in seeded deck" });
    console.log(`CARD ${name}: NOT IN SEEDED DECK`);
    continue;
  }
  const typeCard = card.typeId === undefined ? undefined : await storage.fetcher.fetchById(card.typeId);
  const typeCode =
    card.typeId === undefined ? undefined : ((await storage.fetcher.codenames.nameForId(card.typeId)) ?? "");
  const leftTypeName =
    card.leftId === undefined ? undefined : await leftTypeNameOf(storage, card.leftId);
  const patternInput = {
    name: card.name ?? "",
    id: card.id,
    typeId: card.typeId,
    typeName: typeCard?.name,
    leftTypeName,
    isNew: card.isNew,
  };
  const candidates = ruleNamesForCard(patternInput, STRUCTURE_SETTING_NAME);
  const resolved = [];
  for (const cand of candidates) {
    let key = cand;
    try {
      key = (await import(pathToFileURL(path.join(REPO, "src", "card", "name.js")).href))
        .DeckoName.parse(cand).key;
    } catch {
      /* keep the raw candidate */
    }
    const inUniverse = universe.has(key);
    const templateLen = inUniverse ? (universe.get(key) ?? "").length : null;
    // Is the rule card itself reachable through the seeded fetcher?
    let reachable = null;
    try {
      const ruleCard = await storage.fetcher.fetchByName(cand);
      reachable = ruleCard === undefined ? "absent" : "present";
    } catch (err) {
      reachable = `raised:${err?.constructor?.name ?? "Error"}`;
    }
    resolved.push({ candidate: cand, key, inUniverse, templateLen, reachable });
  }
  const content = structuredCardContent(patternInput, card.dbContent, universe);
  const corpusRow = corpusRowFor.get(card.id);
  rows.push({
    name,
    id: card.id,
    typeCode: typeCode ?? "",
    corpusContentLen: corpusRow?.clen ?? null,
    engineContentLen: content.length,
    matchesCorpusDbContent: corpusRow !== undefined && corpusRow.content === content,
    candidates: resolved,
  });
  console.log(
    `CARD ${name} id=${card.id} type=${typeCode} corpusContent=${corpusRow?.clen} engineContent=${content.length} ` +
      `candidates=${resolved.length} firstHits=${JSON.stringify(resolved.slice(0, 6))}`,
  );
}

async function leftTypeNameOf(st, leftId) {
  const leftCard = await st.fetcher.fetchById(leftId);
  if (leftCard?.typeId === undefined) return undefined;
  const t = await st.fetcher.fetchById(leftCard.typeId);
  return t?.name;
}

writeFileSync(OUT, JSON.stringify({ universeSize: universe.size, rows }, null, 2));
console.log(`WROTE ${OUT}`);
