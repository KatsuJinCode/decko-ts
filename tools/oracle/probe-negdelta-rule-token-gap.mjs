// probe-negdelta-rule-token-gap.mjs -- why `*all+*all+*follow` renders its
// slot class list WITHOUT the bare `RULE` token that the oracle's list
// carries for the same card.
//
// WHAT THIS IS
//   For `*all+*all+*follow` the two slot class lists differ by one token:
//     expected  ALL ALL_PLUS TYPE-list RSTAR RULE RIGHT-Xfollow
//               TYPE_PLUS_RIGHT-rich_text-Xfollow SET
//     actual    ALL ALL_PLUS TYPE-list RSTAR       RIGHT-Xfollow
//               TYPE_PLUS_RIGHT-rich_text-Xfollow SET
//   `RULE` is the 06_rule.rb set-pattern fragment (anchorless, bare caps
//   code -- mod/core/set_pattern/class_methods.rb:16 + base.rb:70-73). It
//   is emitted only when `isRule` is true, and the render path supplies
//   that from computeIsRuleSync (src/card/render.ts:2343).
//
//   computeIsRuleSync's standard_rule? arm resolves the LEFT part through
//   `this.renderCards.get(leftKey)` and returns false when the left card
//   is not in the prefetched render-card map. Ruby (lib/card/rule/all.rb
//   :37-44) FETCHES the left part. For a 3-part preference shape the left
//   part is itself a junction card (`*all+*all`, a row with key=NULL in
//   the corpus), which the closure walk may not carry.
//
//   This probe boots the engine at the COMMITTED seeding home, renders the
//   three failing views, and prints:
//     - the RenderCard's setKeys for the card and for every name part,
//     - whether each part is present in the render-card map,
//     - the Setting/Set rule type ids the predicate needs,
//     - the exact class attribute of the rendered slot wrapper.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negdelta-rule-token-gap.mjs \
//     [--card "*all+*all+*follow"] [--out tmp/negdelta-rule-token.json]

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-rule-token.json"));
const CARD = argValue("--card", "*all+*all+*follow");
const VIEWS = argValue("--views", "closed,open").split(",").filter(Boolean);

const seeding = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const { structureRuleUniverseStatement, structureUniverseFromResults } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "rules", "structure.js")).href
);
const { DeckoName } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "name.js")).href
);
const { safeSetKeys } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "set-keys.js")).href
);

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
const ruleRows = idLister
  .prepare(
    "SELECT id, key, name, left_id, right_id, type_id FROM cards WHERE (key LIKE '*%rule' OR key LIKE '*%default') AND trash = 0",
  )
  .all();
const settingCard = idLister.prepare("SELECT id FROM cards WHERE key = '*setting'").get();
const setCard = idLister.prepare("SELECT id FROM cards WHERE key = '*set'").get();
const followCard = idLister.prepare("SELECT id FROM cards WHERE key = '*follow'").get();
const nameOfId = new Map(
  idLister.prepare("SELECT id, key, name FROM cards").all().map((r) => [r.id, r]),
);
idLister.close();

console.log(
  `CORPUS *setting=${settingCard?.id} *set=${setCard?.id} *follow=${followCard?.id} ` +
    `ruleRows=${ruleRows.length}`,
);
const junction = idLister;
void junction;

console.log(`BOOT liveIds=${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
const universeBatch = await storage.fetcher.driver.batch([structureRuleUniverseStatement()]);
const universe = structureUniverseFromResults(universeBatch[0]);
console.log(`UNIVERSE structure rules=${universe.size}`);

const row = { card: CARD, universeSize: universe.size, parts: [], renders: {} };

const name = DeckoName.parse(CARD);
row.parts = name.parts.map((p) => {
  const key = p.key;
  let rc = null;
  try {
    rc = peekRenderCard(storage, key);
  } catch (err) {
    return { key, fetched: `raised:${err?.constructor?.name ?? "Error"}` };
  }
  return {
    key,
    fetched: rc === undefined ? "absent" : "present",
    typeId: rc?.typeId ?? null,
    corpusId: corpusIdForKey(key),
    corpusName: corpusNameForKey(key),
  };
});
// DeckoName.parts for a 3-part name: the first element is the left NAME.
const leftName = name.leftName;
row.leftName = leftName === undefined ? null : { s: leftName.s, key: leftName.key };
const rightName = name.rightName;
row.rightName = rightName === undefined ? null : { s: rightName.s, key: rightName.key };
row.partCount = name.parts.length;

if (leftName !== undefined) {
  const leftRc = peekRenderCard(storage, leftName.key);
  row.leftRenderCard = leftRc === undefined ? "absent-from-render-card-map" : "present";
  row.leftTypeId = leftRc?.typeId ?? null;
}
if (rightName !== undefined) {
  const rightRc = peekRenderCard(storage, rightName.key);
  row.rightRenderCard = rightRc === undefined ? "absent-from-render-card-map" : "present";
  row.rightTypeId = rightRc?.typeId ?? null;
}

const rc = peekRenderCard(storage, name.key);
row.renderCard = rc === undefined ? "absent-from-render-card-map" : "present";
row.setKeys = rc?.setKeys ?? null;
row.safeSetKeysNoIsRule =
  rc === undefined
    ? null
    : safeSetKeys({
        name: rc.name,
        typeId: rc.typeId,
        typeName: rc.typeName,
        leftTypeName: leftName === undefined ? undefined : peekRenderCard(storage, leftName.key)?.typeName,
      });
row.safeSetKeysWithIsRule =
  rc === undefined
    ? null
    : safeSetKeys({
        name: rc.name,
        typeId: rc.typeId,
        typeName: rc.typeName,
        leftTypeName: leftName === undefined ? undefined : peekRenderCard(storage, leftName.key)?.typeName,
        isRule: true,
      });

for (const view of VIEWS) {
  try {
    const html = await storage.engine.render(CARD, view);
    const m = /class="card-slot [^"]*"/.exec(html);
    row.renders[view] = { bytes: html.length, slotClass: m === null ? null : m[0] };
    console.log(`RENDER ${view} bytes=${html.length} slot=${m === null ? "(none)" : m[0]}`);
  } catch (err) {
    row.renders[view] = { raised: `${err?.constructor?.name ?? "Error"}: ${err?.message ?? err}` };
    console.log(`RENDER ${view} RAISED ${err?.constructor?.name}: ${err?.message}`);
  }
}
console.log(
  `SETKEYS setKeys=${JSON.stringify(row.setKeys)}\n  noIsRule=${JSON.stringify(row.safeSetKeysNoIsRule)}\n  withIsRule=${JSON.stringify(row.safeSetKeysWithIsRule)}`,
);
console.log(
  `PARTS left=${JSON.stringify(row.leftRenderCard)} typeId=${row.leftTypeId} right=${JSON.stringify(row.rightRenderCard)} typeId=${row.rightTypeId} partCount=${row.partCount}`,
);

writeFileSync(OUT, JSON.stringify(row, null, 2));
console.log(`WROTE ${OUT}`);

function corpusIdForKey(key) {
  for (const r of nameOfId.values()) if (r.key === key || r.name === key) return r.id;
  return null;
}
function corpusNameForKey(key) {
  for (const r of nameOfId.values()) if (r.key === key || r.name === key) return r.name ?? null;
  return null;
}

/** RenderEngine#fetchRenderCard is `private` in TypeScript only -- the
 *  runtime method is the same one the render path reads synchronously. */
function peekRenderCard(storage, key) {
  return storage.engine.fetchRenderCard(key);
}
