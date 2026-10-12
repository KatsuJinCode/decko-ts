// probe-search-cql-throws-instead-of-returning-rows.mjs -- show the throw
// runSearch hides.
//
// WHAT THIS IS
//   `RenderEngine#runSearch` wraps its whole read in `try { ... } catch { return
//   [] }` (src/card/render.ts:5588). Every failure mode therefore presents to
//   the grade as the SAME symptom -- a `card_list` view that renders
//   `search-no-results` -- with no record of why. Pages nesting a
//   `{{_self+*referred_to_by}}` Search card run the cql
//   `{"refer_to":"_left","sort":"name"}`; the corpus holds card_references
//   rows pointing at the referenced card, so the query has rows to return
//   and returns none.
//
//   This probe re-issues the host's OWN cql through `executeQuery` with the
//   SAME query options runSearch builds, WITHOUT the catch, so the actual
//   exception (or the real row count) is visible. It then retries with the
//   permission options removed and with each parse-option resolver stubbed in
//   turn, which localises the failure to one of: the permission filter, the
//   name->id resolver, or the query builder itself.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-search-cql-throws-instead-of-returning-rows.mjs \
//     --page PAGE_NAME [--host-key "page_key+*referred_to_by"] [--out OUT_JSON]
//
//   Exit 0 when the unguarded query reproduces a throw or a zero-row result
//   where the corpus holds reference rows, 1 when it returns rows.

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-zero/m5-search-throw.json"));
const PAGE = argValue("--page", "Family");
const HOST_KEY = argValue("--host-key", "");

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const { executeQuery } = await import(pathToFileURL(path.join(REPO, "src", "cql", "execute.ts")).href);
const { DeckoName } = await import(pathToFileURL(path.join(REPO, "src", "card", "name.js")).href);

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();

const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
const engine = storage.engine;
console.log(`BOOT corpus=${RAW_CORPUS_DB} liveIds=${everyLiveId.length}`);

await engine.renderPage(PAGE);

const keys = HOST_KEY !== "" ? [HOST_KEY] : [...engine.searchResults.keys()];
const report = { page: PAGE, hosts: [] };

for (const key of keys) {
  const card = engine.renderCards.get(key);
  if (card === undefined) {
    console.log(`HOST ${key} NOT on the render-card map`);
    continue;
  }
  const statement = JSON.parse(card.dbContent);
  statement.limit = 20;
  const perms = await engine.cqlPermissionOptions();
  const entry = {
    key,
    name: card.name.s,
    typeId: card.typeId,
    seatedItemCount: engine.searchResults.get(key)?.length ?? null,
    dbContent: card.dbContent,
    permissionOptions: perms,
  };
  console.log(`HOST ${key} name=${entry.name} seated=${entry.seatedItemCount} perms=${JSON.stringify(perms)}`);
  console.log(`  cql=${card.dbContent.replace(/\n\s*/g, " ")}`);

  const parseOptions = {
    context: card.name.s,
    ensureCardId: (nameish) => engine.fetcher.lexicon.id(nameish),
    resolveCardId: (nameish) => {
      const k = DeckoName.parse(nameish).key;
      return engine.idsByKey.get(k) ?? engine.fetcher.lexicon.peekId(nameish);
    },
  };

  const attempts = {
    "as-runSearch": { ...perms, parse: parseOptions },
    "without-permission-filter": { parse: parseOptions },
    "permission-filter-only-as-parameters": { ...perms, parse: parseOptions },
    "context-blank": { ...perms, parse: { ...parseOptions, context: "" } },
  };

  entry.attempts = {};
  for (const [label, options] of Object.entries(attempts)) {
    const t0 = Date.now();
    try {
      const result = await executeQuery(engine.fetcher.driver, structuredClone(statement), options);
      const rows = "rows" in result ? result.rows : [];
      const sql = result.sql ?? (result.query && result.query.sql) ?? null;
      const params = result.params ?? null;
      entry.attempts[label] = {
        outcome: "returned",
        rowCount: rows.length,
        firstIds: rows.slice(0, 5).map((r) => r.id),
        params,
        sql: typeof sql === "string" ? sql.slice(0, 1200) : sql,
      };
      console.log(`  ATTEMPT ${label}: rows=${rows.length} first=${entry.attempts[label].firstIds.join(",")}`);
      console.log(`    params: ${JSON.stringify(params)?.slice(0, 900)}`);

      // The first three bound params of the reference-tie subquery are the
      // reftype pair and the referee id. -999 is the parser's
      // unresolvable-name sentinel; the corpus holds card_references rows
      // for the referenced card, so anything but that card's corpus id in
      // the referee param is the defect, and naming the wrong id is the
      // whole diagnosis.
      if (Array.isArray(params)) {
        const tail = params.slice(0, 3);
        entry.attempts[label].refereeTailParams = tail;
        console.log(`    reftype+referee params: ${JSON.stringify(tail)}  (568 = Family's corpus id, -999 = unresolved sentinel)`);
      }
    } catch (error) {
      entry.attempts[label] = { outcome: "threw", errorName: error?.constructor?.name ?? "Error", errorMessage: error?.message ?? String(error), stack: (error?.stack ?? "").split("\n").slice(0, 12).join("\n") };
      console.log(`  ATTEMPT ${label}: THREW ${entry.attempts[label].errorName}: ${entry.attempts[label].errorMessage}`);
      console.log(`    ${entry.attempts[label].stack.split("\n").slice(0, 8).join("\n    ")}`);
    }
    entry.attempts[label].ms = Date.now() - t0;
  }
  report.hosts.push(entry);
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`WROTE ${OUT}`);
storage.close();
process.exit(0);
