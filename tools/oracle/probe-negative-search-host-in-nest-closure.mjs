// probe-negative-search-host-in-nest-closure.mjs -- why a Search card nested
// inside a page renders search-no-results.
//
// WHAT THIS IS
//   Some census pages nest a `{{_self+*referred_to_by}}` Search card. Ruby's
//   card_list view executes the CQL inside the view dispatch and renders the
//   result rows; the TS port's card_list reads ONLY the pre-executed map
//   (`executeSearch` -> `searchResults.get(key) ?? []`, src/card/render.ts:4213)
//   and this probe shows the map holds an EMPTY LIST for such a host, so the
//   view emits `<div class="search-no-results"></div>`.
//
//   There are two candidate mechanisms and they need different fixes:
//     A. the host was never SEATED (prepareNestClosureSearches' BFS never
//        reached it) -> `?? []` in executeSearch, no query ever ran;
//     B. the host was seated but the CQL returned ZERO ROWS (a name->id
//        resolution miss, a permission filter, or a wrong context) -> the
//        query ran and matched nothing.
//   The grade's byte count cannot distinguish them. This probe prints which.
//
//   It re-runs the host's OWN cql through the engine's own runSearch (the
//   private method the pre-execution passes call) with the same prepared
//   state, then prints the cql, the statement's name arguments, and the id
//   each resolves to through both resolution paths the runSearch parse
//   options install (the sync lexicon mirror and the async ensureCardId
//   fallback). A name that resolves to the -999 sentinel is the defect.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negative-search-host-in-nest-closure.mjs \
//     --page PAGE_NAME [--host "PAGE_NAME+*referred_to_by"] [--out OUT_JSON]
//
//   With no --page it probes every Search-typed card the page's nest closure
//   seats. Exit 0 when a host reproduces (empty result where rows exist),
//   1 when none do.

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-zero/m5-search-host.json"));
const PAGE = argValue("--page", "Family");
const HOST = argValue("--host", "");

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const { DeckoName } = await import(pathToFileURL(path.join(REPO, "src", "card", "name.js")).href);

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
const searchType = idLister.prepare("SELECT id FROM cards WHERE codename = 'search' AND trash = 0").get();
idLister.close();

console.log(`BOOT corpus=${RAW_CORPUS_DB} liveIds=${everyLiveId.length} searchTypeId=${searchType?.id}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log("BOOT done");

const engine = storage.engine;

// Render the page first: the pre-execution passes run INSIDE renderPage, so
// the map the card_list view reads is only populated after it.
const pageHtml = await engine.renderPage(PAGE);
console.log(`RENDER page ${PAGE} bytes=${pageHtml.length}`);
const noResultsCount = (pageHtml.match(/search-no-results/g) ?? []).length;
console.log(`  search-no-results blocks=${noResultsCount}`);

const searchResults = engine.searchResults;
const searchFailures = engine.searchFailures;
console.log(`  searchResults seats=${searchResults.size} searchFailures=${searchFailures.size}`);

const hosts = [];
if (HOST !== "") {
  hosts.push(HOST);
} else {
  for (const [key, items] of searchResults) {
    if (items.length === 0) hosts.push(key);
  }
}

const report = { page: PAGE, pageBytes: pageHtml.length, noResultsCount, hosts: [] };

for (const key of hosts) {
  const card = engine.renderCards.get(key);
  const entry = {
    key,
    seated: searchResults.has(key),
    seatedItemCount: searchResults.get(key)?.length ?? null,
    failure: searchFailures.has(key) ? String(searchFailures.get(key)) : null,
    name: card?.name?.s ?? null,
    typeId: card?.typeId ?? null,
    typeCode: card?.typeCode ?? null,
    dbContent: card?.dbContent ?? null,
    onRenderCardsMap: card !== undefined,
  };
  console.log(`HOST ${key} seated=${entry.seated} items=${entry.seatedItemCount} onMap=${entry.onRenderCardsMap}`);
  if (card !== undefined) {
    console.log(`  name=${entry.name} typeCode=${entry.typeCode} typeId=${entry.typeId}`);
    console.log(`  dbContent=${JSON.stringify(entry.dbContent)?.slice(0, 400)}`);
  }
  if (searchFailures.has(key)) {
    console.log(`  FAILURE ${entry.failure}`);
  }
  // Re-run the host's own search with the engine's own private runner and
  // report the row count, so a seated-but-empty host is distinguishable
  // from an unseated one.
  if (card !== undefined) {
    try {
      const items = await engine.runSearch(card);
      entry.rerunItemCount = items.length;
      entry.rerunFirstItems = items.slice(0, 8).map((i) => i.key);
      console.log(`  RERUN runSearch items=${items.length} first=${entry.rerunFirstItems.join(",")}`);
    } catch (err) {
      entry.rerunRaised = `${err?.constructor?.name ?? "Error"}: ${err?.message ?? err}`;
      console.log(`  RERUN RAISED ${entry.rerunRaised}`);
    }
    // Resolve every string that looks like a name in the cql through both
    // paths runSearch installs.
    const nameish = [];
    const walk = (value) => {
      if (typeof value === "string") {
        if (!/^[a-z0-9_-]+$/i.test(value)) return;
        nameish.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
    };
    try {
      walk(JSON.parse(card.dbContent));
    } catch {
      /* non-JSON content: nothing to resolve */
    }
    entry.nameResolutions = [];
    for (const n of [...new Set(nameish)]) {
      const viaLexicon = engine.fetcher.lexicon.id(n);
      let viaDb = null;
      try {
        viaDb = await engine.fetcher.lexicon.lexToId?.(n);
      } catch {
        viaDb = "raised";
      }
      entry.nameResolutions.push({ name: n, lexiconId: viaLexicon ?? null, dbFallbackId: viaDb ?? null });
      const flag = (viaLexicon === -999 || viaLexicon === undefined) ? "  <-- SYNC-MISS" : "";
      console.log(`  NAME ${n} lexiconId=${viaLexicon} dbFallbackId=${viaDb}${flag}`);
    }
  }
  report.hosts.push(entry);
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`WROTE ${OUT}`);
storage.close();
process.exit(report.hosts.some((h) => h.seated && h.seatedItemCount === 0) ? 0 : 1);
