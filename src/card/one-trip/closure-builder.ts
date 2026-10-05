// BUILD 1 of the one-trip lane: THE PRECOMPUTE CLOSURE BUILDER.
//
// Given a deck (a read-only corpus driver) it derives the dependency graph
// AS DATA — every card's include/link references parsed with the render's
// own parser, plus junction-side and type edges — and materializes per-page
// transitive closures, the search-nest enumeration, and the per-page rule
// candidates into a SIDE database (never the corpus file).
//
// This is the MediaWiki LinksUpdate shape (research verdict §1.7): the
// graph becomes data once, computed at write time, so reads never
// re-discover it. The algorithm is language-neutral (see
// deliverables/one-trip-PORTABILITY.md); the engine-specific bits sit
// behind the seams named in types.ts (edge derivation, rule candidate
// enumeration, search execution).
//
// EMPIRICAL FOUNDATION (this lane's fact probe, committed with the RED
// tests): the corpus's stored card_references table is STALE IN BOTH
// DIRECTIONS (3,941 derived edges with no stored row; 8,187 stored rows the
// current parse does not derive — references_expired content, trashed
// referers, renames). So the builder's parse is the authority; the stored
// table is only corroborated against, and the agreement numbers ride the
// build report. A deck whose write path maintains its reference table
// freshly can skip the parse for edge reads — the spec names that option.
//
// READ-SCOPE: the corpus driver is only ever read here. The side store is
// only ever written here (and by invalidation.ts's recompute). The A2 rule
// (derived caches never consulted by the write path) is typed in
// invalidation.ts, not here.

import { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { patternsForCard } from "../set-patterns/card-patterns.js";
import { ruleName } from "../set-patterns/rule-names.js";
import { HEAD_READ_SET_KEYS } from "../render/head-views.js";
import { stripTags } from "../render/nest-syntax.js";
import {
  deriveReferenceEdges,
  deriveLinkEdges,
} from "./edge-deriver.js";
import { ONE_TRIP_SIDE_DDL } from "./side-db-schema.js";
import {
  DEFAULT_SEARCH_NEST_POSTURE,
  executeSearchNestNow,
  type SearchNestPosture,
} from "./search-nest-store.js";
import { recordRenderPlansForPages } from "./render-plan-recorder.js";
import type {
  OneTripBuildReport,
  OneTripEdge,
  OneTripEdgeKind,
  RuleCandidateEnumerator,
} from "./types.js";

export type { OneTripBuildReport, OneTripEdgeKind };

/** The settings whose rule candidates the render consults per card: the
 *  DECK-DERIVED universe (every card name that appears as the right side of
 *  a live compound junction — i.e. every setting a stored rule actually
 *  uses). No render-code coupling: a deck that grows a new setting grows
 *  the candidate universe with it. The derivation query lives in
 *  deriveDeckSettings below (dialect seam). */
export async function deriveDeckSettings(corpus: SQLDatabaseDriver): Promise<string[]> {
  const result = await corpus.query<{ name: string }>(
    `SELECT DISTINCT r.name AS name FROM cards j
       JOIN cards r ON r.id = j.right_id
      WHERE j.left_id IS NOT NULL AND j.trash = 0 AND r.name LIKE '*%'
      ORDER BY r.name`,
    [],
  );
  return result.rows.map((r) => r.name);
}

/** The default rule candidate enumerator (ENGINE SEAM 3): this engine's
 *  set-pattern algebra over composed names, fanned out over the deck's
 *  settings. Patterns compute ONCE per card (the algebra is per-card, the
 *  fan is per-setting); each candidate is `set_name + setting_name`
 *  (rule-names.ts ruleName). */
export function defaultRuleCandidateEnumerator(deckSettings: readonly string[]): RuleCandidateEnumerator {
  return {
    candidatesForCard(cardName: string): { settingCode: string; candidateKeys: string[] }[] {
      let setNames: string[];
      try {
        setNames = patternsForCard({ name: DeckoName.parse(cardName) }).map((p) => p.setName);
      } catch {
        return [];
      }
      return deckSettings.map((settingName) => ({
        settingCode: settingName.replace(/^\*/, ""),
        candidateKeys: setNames.map((setName) => ruleName(setName, settingName)),
      }));
    },
  };
}

export interface OneTripBuildOptions {
  /** The corpus (the deck) — READ-ONLY by contract. */
  corpus: SQLDatabaseDriver;
  /** The derived side store — written by this function. */
  side: SQLDatabaseDriver;
  /** Page names to materialize closures for (any live card can be a page
   *  root; callers pass the rendered pages). */
  pageNames: readonly string[];
  /** ENGINE SEAM 2 override (default: this engine's nest/link parser). */
  edgeDeriver?: {
    referenceEdges(content: string, referencingCardName: string): { key: string; view?: string }[];
    linkEdges(content: string, referencingCardName: string): { key: string }[];
  };
  /** ENGINE SEAM 3 override (default: this engine's rule-name algebra). */
  ruleCandidates?: RuleCandidateEnumerator;
  /** Search-nest posture for the build (default: DEFAULT_SEARCH_NEST_POSTURE
   *  = "write-time"; "live" skips execution, leaving the store empty until
   *  the serving lane's live path fills it). */
  searchNestPosture?: SearchNestPosture;
  /** Record each page's RENDER PLAN into one_trip_render_plans after the
   *  closure materializes (renderplan-replay lane). The recording renders
   *  every page once through the real engine (gate ON against this side
   *  store) and stores the exact pipeline-able statements + params the
   *  cold render asked — the serve side replays them as ONE batch (the
   *  census's 5-trip floor). Requires `sidePath` (the gate's
   *  DECKO_ONE_TRIP_STORE during recording). Default off: builds without
   *  it stay byte-identical to the pre-replay-line builds. */
  recordRenderPlans?: boolean;
  /** The side store's file path — required when recordRenderPlans is set
   *  (the side driver alone cannot give the gate its ATTACH path). */
  sidePath?: string;
}

interface DeckCardRow {
  row: CardsRow;
  composedName: string | undefined;
}

/** Derive the whole-deck edge graph and materialize per-page closures.
 *  Returns the auditable build report. */
export async function buildOneTripClosure(options: OneTripBuildOptions): Promise<OneTripBuildReport> {
  const { corpus, side, pageNames } = options;
  const deriver = options.edgeDeriver ?? {
    referenceEdges: deriveReferenceEdges,
    linkEdges: deriveLinkEdges,
  };
  const deckSettings = await deriveDeckSettings(corpus);
  const ruleSeam = options.ruleCandidates ?? defaultRuleCandidateEnumerator(deckSettings);
  const posture = options.searchNestPosture ?? DEFAULT_SEARCH_NEST_POSTURE;

  // --- side store schema ---------------------------------------------------
  for (const statement of ONE_TRIP_SIDE_DDL) {
    await side.query(statement, []);
  }

  // --- corpus load ---------------------------------------------------------
  // The codename registry must be loaded before any DeckoName.parse of a
  // ":codename" mark; bootstrapping it through the fetch engine gives the
  // same registry the render uses.
  const bootstrap = new FetchEngine(corpus);
  await bootstrap.codenames.ensureLoaded();
  bootstrap.installNameEnvironment();

  const cardsResult = await corpus.query<CardsRow>("SELECT * FROM cards WHERE trash = 0", []);
  const liveRows = cardsResult.rows;
  const byId = new Map<number, DeckCardRow>();
  for (const row of liveRows) byId.set(row.id, { row, composedName: undefined });

  // --- name composition (sides first, multi-pass) --------------------------
  let composedCount = 0;
  {
    let pending = [...byId.values()];
    for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
      const still: DeckCardRow[] = [];
      for (const entry of pending) {
        const { row } = entry;
        if (row.name !== null && row.name !== undefined) {
          entry.composedName = row.name;
        } else if (row.left_id !== null && row.left_id !== undefined && row.right_id !== null && row.right_id !== undefined) {
          const left = byId.get(row.left_id)?.composedName;
          const right = byId.get(row.right_id)?.composedName;
          if (left !== undefined && right !== undefined) entry.composedName = `${left}+${right}`;
        }
        if (entry.composedName !== undefined) composedCount += 1;
        else still.push(entry);
      }
      if (still.length === pending.length) break;
      pending = still;
    }
  }

  const keyToId = new Map<string, number>();
  for (const entry of byId.values()) {
    if (entry.composedName === undefined) continue;
    try {
      keyToId.set(DeckoName.parse(entry.composedName).key, entry.row.id);
    } catch {
      // unparseable composed name: no key, no edge can name it
    }
  }

  // --- edge derivation -----------------------------------------------------
  const edges = new Map<string, OneTripEdge>();
  const addEdge = (edge: OneTripEdge): void => {
    const mapKey = `${edge.refererId}->${edge.refereeKey}->${edge.kind}`;
    const existing = edges.get(mapKey);
    if (existing === undefined) {
      edges.set(mapKey, edge);
      return;
    }
    // keep the id when any derivation resolved it; merge views
    if (existing.refereeId === null && edge.refereeId !== null) existing.refereeId = edge.refereeId;
    if (edge.refView !== undefined && existing.refView !== edge.refView) {
      // one edge row per view would fragment the graph; the closure's views
      // array carries the multiplicity instead (first view wins here)
      if (existing.refView === undefined) existing.refView = edge.refView;
    }
  };

  let parseDerived = 0;
  for (const entry of byId.values()) {
    const { row } = entry;
    const content = row.db_content;
    if (entry.composedName !== undefined && content !== null && content !== "") {
      for (const ref of deriver.referenceEdges(content, entry.composedName)) {
        if (ref.key === entry.composedName) continue; // self-reference skip (all.rb)
        parseDerived += 1;
        addEdge({
          refererId: row.id,
          refereeKey: ref.key,
          refereeId: keyToId.get(ref.key) ?? null,
          kind: "include",
          refView: ref.view,
        });
      }
      for (const ref of deriver.linkEdges(content, entry.composedName)) {
        addEdge({
          refererId: row.id,
          refereeKey: ref.key,
          refereeId: keyToId.get(ref.key) ?? null,
          kind: "link",
        });
      }
    }
    // side edges: a junction's sides join the closure (name composition and
    // the render's sync side reads need them)
    for (const sideId of [row.left_id, row.right_id]) {
      if (sideId === null || sideId === undefined) continue;
      const sideEntry = byId.get(sideId);
      if (sideEntry === undefined || sideEntry.composedName === undefined) continue;
      const sideKey = DeckoName.parse(sideEntry.composedName).key;
      addEdge({ refererId: row.id, refereeKey: sideKey, refereeId: sideId, kind: "side" });
    }
    // item edges (the collection closure): pointer/list/skin cards render
    // their CONTENT LINES as item cards (the render's own collection check
    // — render/pointer-list.ts:96 `code === "pointer" || code === "list" ||
    // code === "skin"`); each non-empty content line is a card name the
    // item machinery resolves at render time, so it is a data-derivable
    // dependency of the collection card. Deck-data rule, no render-code
    // coupling: the type's codename is in the deck.
    if (content !== null && content !== "" && entry.composedName !== undefined) {
      const typeEntry = row.type_id !== null && row.type_id !== undefined
        ? byId.get(row.type_id)
        : undefined;
      const typeCode = typeEntry?.row.codename ?? null;
      if (typeCode === "pointer" || typeCode === "list" || typeCode === "skin") {
        for (const rawLine of content.split("\n")) {
          const line = stripTags(rawLine.trim());
          if (line === "") continue;
          let itemKey: string | undefined;
          try {
            const parsed = DeckoName.parse(line);
            if (parsed.s === "" || parsed.isRelative) continue;
            itemKey = parsed.isAbsolute
              ? parsed.key
              : parsed.absoluteName(DeckoName.parse(entry.composedName)).key;
          } catch {
            continue; // unresolvable line: the render's item path reports it
          }
          if (itemKey === undefined || itemKey === "") continue;
          addEdge({
            refererId: row.id,
            refereeKey: itemKey,
            refereeId: keyToId.get(itemKey) ?? null,
            kind: "item",
          });
        }
      }
    }
    // type edge: the enrichment fold reads the type card's row
    if (row.type_id !== null && row.type_id !== undefined && row.type_id > 0) {
      const typeEntry = byId.get(row.type_id);
      if (typeEntry !== undefined && typeEntry.composedName !== undefined) {
        addEdge({
          refererId: row.id,
          refereeKey: DeckoName.parse(typeEntry.composedName).key,
          refereeId: typeEntry.row.id,
          kind: "type",
        });
      }
    }
  }

  // --- edge agreement vs the stored card_references table ------------------
  const storedResult = await corpus.query<{ referer_id: number; referee_key: string; ref_type: string }>(
    "SELECT referer_id, referee_key, ref_type FROM card_references",
    [],
  );
  const storedInclusion = storedResult.rows.filter((r) => r.ref_type === "I");
  const storedSet = new Set(storedInclusion.map((r) => `${r.referer_id}->${r.referee_key}`));
  const derivedIncludeSet = new Set(
    [...edges.values()].filter((e) => e.kind === "include").map((e) => `${e.refererId}->${e.refereeKey}`),
  );
  let parsedNotStored = 0;
  for (const key of derivedIncludeSet) if (!storedSet.has(key)) parsedNotStored += 1;
  let storedNotParsed = 0;
  for (const key of storedSet) if (!derivedIncludeSet.has(key)) storedNotParsed += 1;

  // --- write edges + meta --------------------------------------------------
  await side.query("DELETE FROM one_trip_edges", []);
  const edgeRows = [...edges.values()];
  for (let i = 0; i < edgeRows.length; i += 500) {
    const chunk = edgeRows.slice(i, i + 500);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((e) => [e.refererId, e.refereeKey, e.refereeId, e.kind, e.refView ?? null]);
    await side.query(
      `INSERT INTO one_trip_edges (referer_id, referee_key, referee_id, kind, ref_view) VALUES ${placeholders}`,
      params,
    );
  }

  // --- search-nest enumeration ---------------------------------------------
  await side.query("DELETE FROM one_trip_search_nests", []);
  await side.query("DELETE FROM one_trip_search_results", []);
  const searchResultsByNest = new Map<number, number[]>();
  const nests: { searchCardId: number; cqlText: string }[] = [];
  for (const entry of byId.values()) {
    const typeEntry = entry.row.type_id !== null && entry.row.type_id !== undefined
      ? byId.get(entry.row.type_id)
      : undefined;
    if (typeEntry?.row.codename !== "search_type") continue;
    if (entry.row.db_content === null || entry.row.db_content === "") continue;
    nests.push({ searchCardId: entry.row.id, cqlText: entry.row.db_content });
  }
  for (let i = 0; i < nests.length; i += 500) {
    const chunk = nests.slice(i, i + 500);
    const placeholders = chunk.map(() => "(?, ?)").join(", ");
    await side.query(
      `INSERT INTO one_trip_search_nests (search_card_id, cql_text) VALUES ${placeholders}`,
      chunk.flatMap((n) => [n.searchCardId, n.cqlText]),
    );
  }
  if (posture === "write-time") {
    for (const nest of nests) {
      const resultIds = await executeSearchNestNow(corpus, side, nest.searchCardId);
      searchResultsByNest.set(nest.searchCardId, resultIds);
    }
  }

  // --- per-page closures + rule candidates ---------------------------------
  // Pages are rebuilt PER PAGE (delete + insert under the page id): a
  // recompute rebuilds the affected pages only and leaves every other
  // page's stored closure untouched — the fan-out property the invalidation
  // design pins. A fresh build finds empty tables, so per-page deletes are
  // equivalent there.
  const adjacency = new Map<number, OneTripEdge[]>();
  for (const edge of edgeRows) {
    if (edge.refereeId === null) continue;
    const list = adjacency.get(edge.refererId);
    if (list === undefined) adjacency.set(edge.refererId, [edge]);
    else list.push(edge);
  }

  // The page closure is a WORKLIST FIXPOINT over four member classes (the
  // SPEC's "page → transitive row set"):
  //   1. content edges (include/link/side/type) walked transitively;
  //   2. RULE CANDIDATE TARGETS of every member card (a rule card is a card
  //      the render reads; its own content joins the walk — the *layout
  //      rule pulls the layout card whose navbar links pull the menu cards);
  //   3. SEARCH RESULT rows of any member card that is a search nest
  //      (write-time posture);
  //   4. the SHELL SEED set (below): the shell's fixed reads — the head
  //      read-set keys (head-views.ts HEAD_READ_SET_KEYS, the engine's own
  //      constant so the seam cannot drift) and the signed-out session
  //      identity card the shell folds read. Engine-declared, versioned
  //      with the shell code; the SPEC names this the "shell seed" engine
  //      configuration.
  const SHELL_SEED_KEYS: readonly string[] = [...HEAD_READ_SET_KEYS, "Anonymous"];
  const shellSeedIds = (): number[] => {
    const ids: number[] = [];
    for (const seed of SHELL_SEED_KEYS) {
      // seeds are CARD NAMES; resolve through the same key algebra as every
      // other lookup ("Anonymous" -> key "anonymou", "*recent settings" ->
      // "*recent_setting")
      try {
        const id = keyToId.get(DeckoName.parse(seed).key);
        if (id !== undefined) ids.push(id);
      } catch {
        // unresolvable seed name: skip
      }
    }
    return ids;
  };

  const pages: Record<string, { pageId: number; closureSize: number }> = {};
  const closureRows: { pageId: number; cardId: number; depth: number; views: string[] }[] = [];
  const ruleRows: {
    pageId: number;
    cardId: number;
    settingCode: string;
    candidateKey: string;
    candidateId: number | null;
  }[] = [];

  for (const pageName of pageNames) {
    let pageId: number | undefined;
    try {
      pageId = keyToId.get(DeckoName.parse(pageName).key);
    } catch {
      pageId = undefined;
    }
    if (pageId === undefined) {
      pages[pageName] = { pageId: -1, closureSize: 0 };
      continue;
    }
    await side.query("DELETE FROM one_trip_page_closure WHERE page_id = ?", [pageId]);
    await side.query("DELETE FROM one_trip_page_rules WHERE page_id = ?", [pageId]);

    // the fixpoint, BOUNDED (the small-world lesson, measured: an unbounded
    // rule-of-rule walk reaches the whole 19,482-card deck from any page —
    // the exact whole-deck payload the research verdict rejected). Two node
    // colors:
    //   WHITE (full expansion): reached through CONTENT edges (include/
    //     link/side/type) or seeded — contributes content edges, rule
    //     candidates, and anchor junctions.
    //   GRAY (content-only): added BY rule-candidate or anchor expansion or
    //     as a search result — contributes its content edges only (a rule
    //     template's nests render; the rule lattice beyond it does not).
    // Gray nodes' content-reached neighbors are white again, so the content
    // graph stays fully walked while the lattice stays one hop deep.
    const memberDepth = new Map<number, number>([[pageId, 0]]);
    const color = new Map<number, "white" | "gray">([[pageId, "white"]]);
    const worklist: number[] = [pageId];
    for (const seed of shellSeedIds().filter((id) => id !== pageId)) {
      if (!memberDepth.has(seed)) {
        memberDepth.set(seed, 1);
        color.set(seed, "white"); // shell cards behave as page-level state
        worklist.push(seed);
      }
    }
    const viewsByCard = new Map<number, Set<string>>();

    const pushMember = (id: number, viaDepth: number, nodeColor: "white" | "gray"): void => {
      if (memberDepth.has(id)) return;
      memberDepth.set(id, viaDepth);
      color.set(id, nodeColor);
      worklist.push(id);
    };
    const recordCandidateTargets = (cardId: number, isPageCard: boolean): void => {
      // PAGE-CARD-ONLY rule expansion (measured bound): the rule lattice is
      // a small world — candidate cards' content templates reference sets
      // whose candidates reference more templates, and the fixpoint reaches
      // the whole deck (19,482/19,482) through the *all-hub global rules.
      // The page card's own candidates ride the payload (its rule lookups
      // are the page-level constant); every other card's rule walk is the
      // record-and-replay plan's residue.
      if (!isPageCard) return;
      const cardName = byId.get(cardId)?.composedName;
      if (cardName === undefined) return;
      for (const group of ruleSeam.candidatesForCard(cardName)) {
        for (const candidateKey of group.candidateKeys) {
          const candidateId = keyToId.get(candidateKey) ?? null;
          // Row storage: POSITIVE candidates for every member (the closure
          // audit + the plan's data), negative knowledge ONLY for the page
          // card (what the payload carries — carrying every member's
          // negatives would blow the payload past the tens-of-KB budget;
          // the replay plan covers the rest).
          if (candidateId !== null || isPageCard) {
            ruleRows.push({
              pageId,
              cardId,
              settingCode: group.settingCode,
              candidateKey,
              candidateId,
            });
          }
          if (candidateId !== null) {
            pushMember(candidateId, (memberDepth.get(cardId) ?? 0) + 1, "gray");
          }
        }
      }
    };
    const recordSearchResults = (cardId: number): void => {
      const ids = searchResultsByNest.get(cardId);
      if (ids === undefined) return;
      for (const resultId of ids) {
        pushMember(resultId, (memberDepth.get(cardId) ?? 0) + 1, "gray");
      }
    };

    while (worklist.length > 0) {
      const current = worklist.shift()!;
      const expands = color.get(current) === "white";
      if (expands) {
        recordCandidateTargets(current, current === pageId);
        recordSearchResults(current);
      }
      for (const edge of adjacency.get(current) ?? []) {
        if (edge.refereeId === null) continue;
        if (edge.refView !== undefined) {
          const set = viewsByCard.get(edge.refereeId);
          if (set === undefined) viewsByCard.set(edge.refereeId, new Set([edge.refView]));
          else set.add(edge.refView);
        }
        pushMember(
          edge.refereeId,
          (memberDepth.get(current) ?? 0) + 1,
          // ITEM edges join GRAY (content-only): collection items render,
          // but item-of-item recursion is the menu-graph cascade (measured:
          // unbounded item walking reaches the whole deck through nav
          // lists); nested collections beyond the first tier are the
          // record-and-replay plan's residue. Every other content edge
          // re-whitens the target: the include/link/side/type graph is the
          // trusted fixpoint.
          edge.kind === "item" ? "gray" : "white",
        );
      }
    }

    for (const [cardId, cardDepth] of memberDepth) {
      closureRows.push({
        pageId,
        cardId,
        depth: cardDepth,
        views: [...(viewsByCard.get(cardId) ?? [])],
      });
    }
    pages[pageName] = { pageId, closureSize: memberDepth.size };
  }

  for (let i = 0; i < closureRows.length; i += 500) {
    const chunk = closureRows.slice(i, i + 500);
    const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    await side.query(
      `INSERT INTO one_trip_page_closure (page_id, card_id, depth, views) VALUES ${placeholders}`,
      chunk.flatMap((r) => [r.pageId, r.cardId, r.depth, JSON.stringify(r.views)]),
    );
  }
  for (let i = 0; i < ruleRows.length; i += 500) {
    const chunk = ruleRows.slice(i, i + 500);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    // OR IGNORE: the same candidate key can arise from two set patterns of
    // one card (duplicate set names in the pattern list) — the dedupe is
    // the primary key, not a logic error
    await side.query(
      `INSERT OR IGNORE INTO one_trip_page_rules (page_id, card_id, setting_code, candidate_key, candidate_id) VALUES ${placeholders}`,
      chunk.flatMap((r) => [r.pageId, r.cardId, r.settingCode, r.candidateKey, r.candidateId]),
    );
  }

  const dangling = edgeRows.filter((e) => e.refereeId === null).length;
  const meta: [string, string][] = [
    ["live_cards", String(liveRows.length)],
    ["composed_names", String(composedCount)],
    ["edges", String(edgeRows.length)],
    ["dangling_edges", String(dangling)],
    ["search_nests", String(nests.length)],
    ["stored_inclusion_rows", String(storedInclusion.length)],
    ["parsed_edges", String(derivedIncludeSet.size)],
    ["parsed_not_stored", String(parsedNotStored)],
    ["stored_not_parsed", String(storedNotParsed)],
    ["search_nest_posture", posture],
    // page-name -> page-id entries so the store is self-describing (the
    // readPageClosure API resolves pages without touching the corpus)
    ...Object.entries(pages)
      .filter(([, info]) => info.pageId > 0)
      .map(([name, info]) => [`page:${name}`, String(info.pageId)] as [string, string]),
  ];
  for (const [key, value] of meta) {
    await side.query(
      "INSERT INTO one_trip_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  // --- render-plan recording (the store-build-time half of the replay) ----
  let renderPlans: Record<string, { pageId: number; entries: number }> | undefined;
  if (options.recordRenderPlans === true) {
    if (options.sidePath === undefined || options.sidePath === "") {
      throw new Error(
        "buildOneTripClosure: recordRenderPlans requires sidePath " +
          "(the one-trip gate's DECKO_ONE_TRIP_STORE during the recording renders)",
      );
    }
    const recording = await recordRenderPlansForPages({
      corpus,
      side,
      sidePath: options.sidePath,
      pageNames,
      pageIds: new Map(
        Object.entries(pages)
          .filter(([, info]) => info.pageId > 0)
          .map(([name, info]) => [name, info.pageId]),
      ),
    });
    renderPlans = {};
    for (const [name, page] of Object.entries(recording.pages)) {
      renderPlans[name] = { pageId: page.pageId, entries: page.entries };
    }
  }

  const report: OneTripBuildReport = {
    liveCards: liveRows.length,
    composedNames: composedCount,
    edges: edgeRows.length,
    danglingEdges: dangling,
    searchNests: nests.length,
    pages,
    edgeAgreement: {
      storedInclusionRows: storedInclusion.length,
      parsedEdges: derivedIncludeSet.size,
      parsedNotStored,
      storedNotParsed,
    },
    ...(renderPlans !== undefined ? { renderPlans } : {}),
  };
  return report;
}

/** Read one page's materialized closure back from the side store (the page
 *  resolves through the store's own meta entries — no corpus access). */
export async function readPageClosure(
  side: SQLDatabaseDriver,
  pageName: string,
): Promise<{ pageId: number; cardIds: number[] }> {
  const meta = await side.query<{ value: string }>(
    "SELECT value FROM one_trip_meta WHERE key = ?",
    [`page:${pageName}`],
  );
  const pageId = Number(meta.rows[0]?.value);
  if (!Number.isSafeInteger(pageId) || pageId <= 0) {
    return { pageId: -1, cardIds: [] };
  }
  const rows = await side.query<{ card_id: number }>(
    "SELECT card_id FROM one_trip_page_closure WHERE page_id = ? ORDER BY card_id",
    [pageId],
  );
  return { pageId, cardIds: rows.rows.map((r) => r.card_id) };
}
