// Enumerate every card in the corpus whose :core view goes through one of the
// two `haml` compile paths:
//
//   A) card-mod-content  set/abstract/haml_file.rb:20-22
//        view :core do
//          haml card.content, haml_locals
//        end
//      -> the template is the card's OWN content; a card only reaches this
//         view if its type's format is HamlFile.
//
//   B) card-mod-assets    set/abstract/mod_assets.rb:171-182
//        view :core do ... haml :group_list, groups: groups end
//      -> the template is the FIXED gem file group_list.haml; the cards that
//         reach it are Mod cards and the asset-group cards under them.
//
// Read-only against the corpus sqlite. Prints the count and the set.
// Usage: node tools/haml-slice/enumerate-haml-typed-cards.mjs [corpus.sqlite3]

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const DBS = (
  process.argv[2]
    ? [process.argv[2]]
    : [
        "REPO_ROOT/decko-ts/tmp/raw-ground-truth/bench-corpus-raw.sqlite3",
        "REPO_ROOT/decko-ts/tools/oracle/decko-oracle-app/db/development.sqlite3",
      ]
);

// ---------------------------------------------------------------- A: content

/** Haml-signature scan of a card body: does the stored content look like a
 *  Haml template at all? Deliberately loose - it is a candidate finder, and
 *  every hit below is printed in full for a human to judge. */
function hamlSignals(body) {
  const out = [];
  const lines = body.split("\n");
  for (const [i, line] of lines.entries()) {
    const indent = line.length - line.trimStart().length;
    const t = line.trim();
    if (t === "") continue;
    if (/^%\w[\w-]*[.#]/.test(t)) out.push([i + 1, "tag", line]);
    else if (/^!!\s*\{/.test(t)) out.push([i + 1, "doctype", line]);
    else if (/^-#/.test(t)) out.push([i + 1, "silent-comment", line]);
    else if (/^-#\{/.test(t)) out.push([i + 1, "filter", line]);
    else if (/^:\w/.test(t)) out.push([i + 1, "filter/attr", line]);
    else if (indent >= 2 && /^=[^=]/.test(t)) out.push([i + 1, "output", line]);
    else if (indent >= 2 && /^-[^-]/.test(t)) out.push([i + 1, "silent", line]);
    else if (indent >= 2 && /^\/[^ ]/.test(t)) out.push([i + 1, "html-escaped", line]);
    else if (indent >= 2 && t.startsWith("&")) out.push([i + 1, "unescaped", line]);
  }
  return out;
}

for (const DB of DBS) {
  console.log(`\n${"=".repeat(78)}\nCORPUS ${DB}`);
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  const cols = db.prepare("PRAGMA table_info(cards)").all().map((c) => c.name);
  const C = cols.includes("db_content") ? "db_content" : "content";
  console.log(`  content column: ${C}; cards: ${db.prepare("SELECT COUNT(*) c FROM cards").get().c}`);

  // ---- A. which cardtypes declare a `format`, and is any of them HamlFile?
  const cardtypeId =
    db.prepare("SELECT id FROM cards WHERE codename = 'cardtype' AND trash = 0").get()
      ?.id ?? null;
  console.log(`  Cardtype card id: ${cardtypeId}`);
  const cardtypes = cardtypeId
    ? db
        .prepare(
          `SELECT id, name, key, type_id, ${C} AS content FROM cards
           WHERE type_id = ? AND trash = 0 ORDER BY name`,
        )
        .all(cardtypeId)
    : [];
  console.log(`  cardtypes: ${cardtypes.length}`);

  const formatRefs = db
    .prepare("SELECT referer_id, referee_id, ref_type FROM card_references WHERE referee_key = 'format'")
    .all();
  console.log(`  card_references rows with referee_key='format': ${formatRefs.length}`);
  for (const r of formatRefs) {
    const from = db
      .prepare("SELECT id, name, type_id FROM cards WHERE id = ?")
      .get(r.referer_id);
    const to = db
      .prepare(`SELECT id, name, key, type_id, ${C} AS content FROM cards WHERE id = ?`)
      .get(r.referee_id);
    console.log(
      `    from ${JSON.stringify(from)} -> to ${JSON.stringify(to && { id: to.id, name: to.name, key: to.key, type_id: to.type_id })}`,
    );
  }
  const cardtypeFormatRefs = formatRefs.filter((r) =>
    cardtypes.some((c) => c.id === r.referer_id),
  );
  console.log(
    `  >> cardtypes that declare a format: ${cardtypeFormatRefs.length}` +
      (cardtypeFormatRefs.length ? ` -> ${JSON.stringify(cardtypeFormatRefs)}` : ""),
  );
  console.log(
    `  >> CARDS THAT REACH content :core VIA HamlFile: ` +
      `${cardtypeFormatRefs.length === 0 ? 0 : "(see refs above)"}`,
  );

  // ---- A2. does ANY stored card body look like Haml? (candidate finder)
  const withBody = db
    .prepare(
      `SELECT id, name, key, type_id, ${C} AS content FROM cards
       WHERE trash = 0 AND ${C} IS NOT NULL AND ${C} != ''`,
    )
    .all();
  const hits = [];
  for (const c of withBody) {
    const sig = hamlSignals(String(c.content));
    if (sig.length) hits.push({ card: c, sig });
  }
  console.log(
    `\n  [A2] cards whose STORED CONTENT carries Haml syntax signals: ${hits.length}` +
      ` (of ${withBody.length} non-empty bodies)`,
  );
  for (const h of hits.slice(0, 40)) {
    console.log(`    id=${h.card.id} type_id=${h.card.type_id} key=${h.card.key}`);
    for (const [ln, kind, line] of h.sig.slice(0, 6))
      console.log(`        L${ln} [${kind}] ${JSON.stringify(line)}`);
  }
  if (hits.length > 40) console.log(`    ... ${hits.length - 40} more`);

  // ---- B. assets :core - the Mod cardtype and its asset groups
  const modCt = cardtypes.find((c) => /^(mod|mod assets|mod assets group)$/i.test(c.key ?? "") || c.name === "Mod");
  console.log(`\n  [B] Mod cardtype: ${modCt ? JSON.stringify({ id: modCt.id, name: modCt.name, key: modCt.key }) : "NOT PRESENT"}`);
  if (modCt) {
    const modCards = db
      .prepare(
        `SELECT id, name, key, ${C} AS content FROM cards
         WHERE type_id = ? AND trash = 0 ORDER BY name`,
      )
      .all(modCt.id);
    console.log(`  [B] cards of type Mod: ${modCards.length}`);
    for (const m of modCards) {
      const groups = db
        .prepare(
          `SELECT g.id, g.name, g.key, gt.name AS gtype
           FROM cards g JOIN cards gt ON gt.id = g.type_id
           WHERE g.left_id = ? AND g.trash = 0 ORDER BY g.name`,
        )
        .all(m.id);
      const assetGroups = groups.filter((g) => /group/i.test(g.gtype ?? ""));
      console.log(
        `    mod ${JSON.stringify(m.name)} id=${m.id}: ${groups.length} subcards, ` +
          `${assetGroups.length} asset groups` +
          (assetGroups.length ? ` -> ${JSON.stringify(assetGroups.map((g) => g.name))}` : ""),
      );
    }
  }

  db.close();
}

// ---------------------------------------------------------------- templates
const GEM_HOME = process.env.GEM_HOME;
const GEMS_DIR = GEM_HOME ? join(GEM_HOME, "gems") : undefined;
if (!GEMS_DIR || !existsSync(GEMS_DIR)) {
  console.error(
    "enumerate-haml-typed-cards: set GEM_HOME to the Ruby gem home " +
      "(e.g. <ruby>/lib/ruby/gems/3.3.0 -- card-mod-assets-0.20.0 lives under " +
      "its gems/ subfolder)",
  );
  process.exit(2);
}
const GROUP_LIST = join(
  GEMS_DIR,
  "card-mod-assets-0.20.0",
  "set",
  "abstract",
  "mod_assets",
  "group_list.haml",
);
console.log(`\n${"=".repeat(78)}\nTEMPLATE group_list.haml (the ONLY assets :core template):`);
console.log(readFileSync(GROUP_LIST, "utf8"));
