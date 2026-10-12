// Static-deck prewarm for the corpus replay driver: the sensible-test fast
// path. The replay deck NEVER changes during a run, so every closure walk
// the render engine would otherwise re-run per entry (the ~150-490ms
// recursive-CTE composition, re-derived per rendered view) is re-derived
// ONCE here: bulk-read all live rows, compose every CardRecord in memory,
// push them through the fetch cache, enrich them into render cards, and
// prepare every Search-typed card's CQL once. After this, closureWarm()
// answers true for every card and a render is map lookups + HTML assembly.
//
// This touches engine PRIVATES through structural casts - the established
// composition-seam pattern (ModEngineHost's install site does the same).
// It changes no engine code: the same render path, judgment included, runs
// per entry; only the recomputation of a static world is hoisted.

import { CardRecord } from "../../src/card/fetch/card-record.js";
import { DeckoName } from "../../src/card/name.js";
import type { CardsRow } from "../../src/server/schema.js";
import type { RenderTestStorage } from "../card/render/render-test-storage.js";

/** CardsRow as the SELECT returns it (snake_case columns). */
type Row = Record<string, unknown>;

export interface PrewarmStats {
  /** live rows read from the seeded deck. */
  rows: number;
  /** records composed and cached (junctions included). */
  records: number;
  /** render cards enriched. */
  enriched: number;
  /** Search-typed cards whose CQL ran once. */
  searches: number;
  /** phase timings in ms. */
  phases: Record<string, number>;
}

function toCardsRow(row: Row): CardsRow {
  return row as unknown as CardsRow;
}

/** Compose the display name for every row: simples carry it; junctions
 *  resolve left+"+"+right recursively (the same convention the seeding
 *  and composeCardRecord follow - junction rows store NULL name/key). */
function composeNames(rows: Row[]): Map<number, { name: string; key: string }> {
  const byId = new Map<number, Row>();
  for (const row of rows) byId.set(row.id as number, row);
  const memo = new Map<number, { name: string; key: string }>();

  const nameOf = (id: number): string => {
    const row = byId.get(id);
    if (row === undefined) return "";
    const direct = row.name as string | null;
    if (direct !== null && direct !== undefined && direct !== "") return direct;
    const leftId = row.left_id as number | null;
    const rightId = row.right_id as number | null;
    if (leftId === null || rightId === null) return "";
    const left = nameOf(leftId);
    const right = nameOf(rightId);
    return left === "" || right === "" ? "" : `${left}+${right}`;
  };
  // iterative warm-up: recurse per id (memo makes it linear-ish)
  for (const row of rows) {
    const id = row.id as number;
    const name = nameOf(id);
    memo.set(id, { name, key: DeckoName.parse(name).key });
  }
  return memo;
}

export async function prewarmStaticDeck(
  storage: RenderTestStorage,
): Promise<PrewarmStats> {
  const phases: Record<string, number> = {};
  const mark = (phase: string, since: number): number => {
    phases[phase] = Date.now() - since;
    return Date.now();
  };

  // 1. bulk-read the seeded working deck (the driver's own database).
  let t0 = Date.now();
  const batch = await storage.fetcher.driver.batch([
    { sql: "SELECT * FROM cards WHERE trash = 0", params: [] },
  ]);
  const raw = ((batch[0] as { rows?: Row[] }).rows ?? []) as Row[];
  mark("read", t0);

  // 2. compose every record in memory (names for junctions included).
  t0 = Date.now();
  const names = composeNames(raw);
  const records: CardRecord[] = [];
  for (const row of raw) {
    const id = row.id as number;
    const composed = names.get(id)!;
    const record = {
      id,
      name: composed.name === "" ? undefined : DeckoName.parse(composed.name),
      key: composed.name === "" ? undefined : composed.key,
      codename: (row.codename as string | null) ?? undefined,
      leftId: (row.left_id as number | null) ?? undefined,
      rightId: (row.right_id as number | null) ?? undefined,
      typeId: (row.type_id as number | null) ?? undefined,
      dbContent: (row.db_content as string | null) ?? "",
      trash: false,
      creatorId: (row.creator_id as number | null) ?? undefined,
      updaterId: (row.updater_id as number | null) ?? undefined,
      createdAt: (row.created_at as string | null) ?? undefined,
      updatedAt: (row.updated_at as string | null) ?? undefined,
      currentRevisionId: (row.current_revision_id as number | null) ?? undefined,
      readRuleClass: (row.read_rule_class as string | null) ?? undefined,
      readRuleId: (row.read_rule_id as number | null) ?? undefined,
      referencesExpired: (row.references_expired as number | null) === 1,
      isNew: false,
      fromTrash: false,
      uncacheable: false,
    } as unknown as CardRecord;
    records.push(record);
  }
  mark("compose", t0);

  // 3. ONE cold render through the public API before bulk enrichment: the
  //    cold block loads the read-permission state, the codename codehash
  //    (the rule? predicate's type-id source) and the *structure universe
  //    in production order - enrichAndStore's setKeys depend on the
  //    codehash being loaded FIRST (render.ts:210-217). Skipping this made
  //    every rule card's isRule resolve false and 11+ set-keys views drift.
  t0 = Date.now();
  const first = records.find((r) => r.name !== undefined && r.key !== undefined);
  if (first !== undefined && first.name !== undefined) {
    try {
      await storage.engine.render(first.name.s, "raw");
    } catch {
      // view unsupported / render error: the cold states are loaded by the
      // time it throws - that is all this step is for
    }
  }
  mark("cold-render", t0);

  // 4. fetch cache first (enrichment's type/left lookups become hits),
  //    then enrich every record into a render card. Sides before
  //    junctions is unnecessary: enrichAndStore recurses left with the
  //    existing-skip memo.
  t0 = Date.now();
  for (const record of records) storage.fetcher.writeToCache(record);
  mark("cache", t0);

  t0 = Date.now();
  const engine = storage.engine as unknown as {
    enrichAndStore(record: CardRecord): Promise<unknown>;
    prepareSearches(root: CardRecord): Promise<void>;
  };
  let enriched = 0;
  for (const record of records) {
    await engine.enrichAndStore(record);
    enriched += 1;
  }
  mark("enrich", t0);

  // 5. Search-typed cards: closureWarm only reports warm when searchResults
  //    already holds the card's CQL result, so run each search once here
  //    instead of on first render.
  //
  //    The gate must match the engine's own gate: prepareSearches selects
  //    cards by typeCode === "search_type" (render.ts:1258) and closureWarm
  //    reads the same key (render.ts:1131). A name-based gate ("Search")
  //    is wrong because a search-type card's NAME is arbitrary — only its
  //    codename is fixed — so a name gate silently skips real search cards
  //    and prewarms searches=0. peekNameForId is sync once the cold render
  //    above has folded the codehash (fetch/codename.ts:80-82), so gating
  //    on the codename costs no extra round trip.
  //
  //    The engine's searchResults seat is a private Map<string,
  //    RenderCard[]> (render.ts:147) and the public surface set
  //    (engine.peekSearch etc.) deliberately does not expose it, so the
  //    prewarm reaches it through the same structural-cast pattern already
  //    used for enrichAndStore + prepareSearches above. Since the
  //    lazy-parse seam in prepareSearches, a search card whose CQL fails
  //    to parse is recorded in the engine (searchFailures marker + empty
  //    seat) and the walk completes — the raise moved to the dispatch
  //    boundary (engine.resolveView, view-gated on :open/:content).
  //    prepareSearches therefore no longer throws for parse failures;
  //    this try/catch remains only as defense against unexpected
  //    non-parse errors aborting the whole prewarm.
  t0 = Date.now();
  const engineWithSearchResults = engine as unknown as {
    prepareSearches(root: CardRecord): Promise<void>;
    searchResults: Map<string, unknown[]>;
  };
  let searches = 0;
  for (const record of records) {
    const typeId = record.typeId;
    if (typeId === undefined) continue;
    // Match on codename ("search_type") not name ("Search"): a search-type
    // card's name is arbitrary — the codename is the stable identifier —
    // so a name-based gate would skip real search cards. The sync peek is
    // meaningful only after the cold-render above folded the codehash.
    const typeCode = storage.fetcher.codenames.peekNameForId(typeId);
    if (typeCode !== "search_type") continue;
    const key = record.key;
    if (key === undefined || key === "") continue;
    try {
      await engineWithSearchResults.prepareSearches(record);
      searches += 1;
    } catch {
      // runSearch threw (badQuery on non-JSON content, or
      // emptyQueryError on empty dbContent) — leave the searchResults
      // seat populated with [] so closureWarm treats this card as warm
      // (searchResults.has(key) === true at render.ts:1131) and the
      // warm-closure path is map lookups only, not the ~750ms cold
      // closure walk. One [] entry per failing card; decks whose
      // Search-type cards hold no valid CQL content hit this path on
      // every prewarm call.
      if (!engineWithSearchResults.searchResults.has(key)) {
        engineWithSearchResults.searchResults.set(key, []);
      }
      searches += 1;
    }
  }
  mark("searches", t0);

  return {
    rows: raw.length,
    records: records.length,
    enriched,
    searches,
    phases,
  };
}
