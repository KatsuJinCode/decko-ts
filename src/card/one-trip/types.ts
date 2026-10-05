// The one-trip layer's PORTABILITY SURFACE — the named seams that keep the
// language-neutral algorithm (deliverables/one-trip-PORTABILITY.md)
// separable from THIS engine's specifics.
//
// WHY THIS FILE EXISTS (the upstreamability requirement, operator
// 2026-10-03): Ethan's collaborators continue supporting Ruby, so these
// optimizations may be upstreamed to Ruby or re-implemented via the harness
// in any language. Nothing in this layer may bake in a TypeScript idiom or
// a SQLite dialect detail without naming the seam it sits behind. The seam
// inventory:
//
//   1. DERIVED STORE (language-neutral data model, SQL-dialect-neutral
//      DDL): the five tables in side-db-schema.ts. Any implementation that
//      maintains these tables satisfies the spec's data model.
//   2. EDGE DERIVATION (engine seam): turning a card's content into
//      reference keys is the nesting parser's job (here: render/
//      nest-syntax.ts referencedNames + DeckoName absolute-name algebra).
//      The spec states the INVARIANT (edges = what the render's nest
//      resolution consults, absolutized against the referencing card's
//      composed name, relative refs excluded); each engine plugs in its own
//      parser via `EdgeDeriver`.
//   3. RULE CANDIDATE ENUMERATION (engine seam): which rule names a card's
//      lookup walks (`RuleCandidateEnumerator`, backed here by
//      set-patterns/rule-names.ts).
//   4. SEARCH EXECUTION (engine seam + posture switch): executing a search
//      card's query is the CQL engine's job (search-nest-store.ts); the
//      write-time-vs-live choice is `SearchNestPosture` with the default
//      chosen once, here.
//   5. ONE-STATEMENT FETCH (dialect seam): the recursive-CTE +
//      non-recursive-JSON-aggregation shape needs a SQL engine with
//      recursive CTEs and a JSON aggregation function. The statement text
//      lives in one-trip-fetch.ts as a named template (`ONE_TRIP_FETCH_SQL`);
//      engines whose dialect differs re-express the SAME shape (the spec
//      names the invariants: recursion discovers ids, aggregation is
//      non-recursive, one round trip, one document).
//   6. PAYLOAD SEATING (engine seam): handing the fetched rows to the
//      render path (page-bundle-adapter.ts, via the prefetch composer the
//      waves already proved value-identical). Ruby seats through its
//      cache.write_to_cache instead.
//   7. WRITE-SCOPE ISOLATION (the A2 rule, typed): the recompute path's
//      parameters split the world into `ReadableCorpus` (where truth lives)
//      and `WritableDerivedStore` (where derived data goes); the latter
//      exposes no content reads, so a recompute that consulted stale
//      derived state WOULD NOT TYPE-CHECK. (The A2 incident:
//      hop-batch-sibling-fix-lane.md:389-414.)

import type { CardsRow } from "../../server/schema.js";
import type { RenderPlan } from "./render-plan.js";

/** One edge of the dependency graph (SPEC data model): referer -> referee.
 *  `kind` names WHY the edge exists — the closure walks all kinds, the
 *  invalidation fan-out walks all kinds, and the report separates them.
 *  - "include": a nest reference in the referer's content.
 *  - "link": a link reference in the referer's content (existence anchors;
 *    carried so layout/navbar link-chasing stays inside the closure).
 *  - "side": the referer is a junction; the referee is one of its sides
 *    (name composition + the sync side reads need them).
 *  - "type": the referer's type card (the enrichment fold reads it).
 *  - "anchor": the referer is the LEFT side of a rule-shaped junction
 *    (left, *setting) — the set machinery probes that junction whenever it
 *    works with the left card, so the junction row is a data-derivable
 *    dependency of the left card ("set-anchor closure"). NOT carried by
 *    default (measured: the anchor walk is transitively the whole deck);
 *    named as a data-model kind for engines whose decks stay shallow.
 *  - "item": the referer is a collection card (pointer/list/skin) and the
 *    referee is one of its content-line items, which the item machinery
 *    resolves and renders at view time.
 *  Dangling edges (referee_id NULL) record keys that resolved to no live
 *  card — the graph keeps them so a later create is caught by the
 *  referee_key reverse index. */
export type OneTripEdgeKind = "include" | "link" | "side" | "type" | "anchor" | "item";

export interface OneTripEdge {
  refererId: number;
  refereeKey: string;
  /** Resolved live-card id, or null when no live card carries the key. */
  refereeId: number | null;
  kind: OneTripEdgeKind;
  /** For include/link edges: the nest's requested view when the parse saw
   *  one ("which views/parts each needs" at edge granularity). */
  refView?: string;
}

/** One page's transitive closure row (SPEC data model): page -> card with
 *  the BFS depth and every requested view observed along the paths. */
export interface OneTripClosureRow {
  pageId: number;
  cardId: number;
  depth: number;
  /** Distinct nest views requested for this card within this page's tree
   *  (empty when the card is pulled in only by side/type edges). */
  views: string[];
}

/** A search nest enumerated by the builder (SPEC data model): a card whose
 *  render executes a stored query, plus the query bytes it executes. */
export interface OneTripSearchNest {
  searchCardId: number;
  cqlText: string;
}

/** Per-page rule-candidate row (SPEC data model): which rule names the
 *  render's lookup walks for each closed card, and which resolve. */
export interface OneTripRuleCandidate {
  cardId: number;
  settingCode: string;
  candidateKey: string;
  /** Resolved rule-card id, or null (the negative knowledge the render's
   *  walk needs to stop early). */
  candidateId: number | null;
}

/** ENGINE SEAM 2: the edge derivation the builder consumes. An engine
 *  plugs in its own parser; the default (this repo) scans nest chunks with
 *  the render's own parser so the builder can never drift from what the
 *  render resolves. */
export interface EdgeDeriver {
  /** All absolute reference keys (plus the requested view when present)
   *  in one card's content, relativized against nothing: the caller
   *  absolutizes? NO — the deriver receives the card's composed name and
   *  returns ABSOLUTE keys (the invariant: the render resolves nest names
   *  against the referencing card; the edges must match that resolution
   *  exactly, relative refs excluded). */
  referenceEdges(content: string, referencingCardName: string): { key: string; view?: string }[];
  /** Whether this content also carries link references worth chasing. */
  linkEdges(content: string, referencingCardName: string): { key: string }[];
}

/** ENGINE SEAM 3: the rule candidate enumeration the builder consumes. */
export interface RuleCandidateEnumerator {
  /** Every candidate rule key for one card, grouped by setting code (the
   *  group list defines WHICH settings this engine's render consults — the
   *  default derives it from the deck itself, not from render code). */
  candidatesForCard(cardName: string): { settingCode: string; candidateKeys: string[] }[];
}

/** The builder's report (SPEC: every build is auditable — edge agreement,
 *  closure sizes, surplus handled by the consumer's validation). */
export interface OneTripBuildReport {
  liveCards: number;
  composedNames: number;
  edges: number;
  danglingEdges: number;
  searchNests: number;
  pages: Record<string, { pageId: number; closureSize: number }>;
  /** Present when the build recorded render plans (recordRenderPlans):
   *  per recorded page, the plan entry count (the audit the census's
   *  classification table compares against). */
  renderPlans?: Record<string, { pageId: number; entries: number }>;
  edgeAgreement: {
    /** card_references rows of ref_type 'I' (the stored edge table). */
    storedInclusionRows: number;
    /** Edges the real parser derives. */
    parsedEdges: number;
    /** Derived edges with no stored row — evidence the stored table is
     *  stale (references_expired / pre-machinery saves). */
    parsedNotStored: number;
    /** Stored rows the current parse does not derive — stale keys from
     *  renames, trashed referers, changed content. */
    storedNotParsed: number;
  };
}

/** The bundle the one-trip fetch returns (SPEC: ONE document carrying
 *  every row the render touches). `rows` are full cards rows — the same
 *  field fidelity the render's own reads produce — plus the per-page rule
 *  candidates and the materialized search results.
 *
 *  `renderPlan` (the inline fetch only, renderplan-replay lane): the page's
 *  PRE-COMPUTED RENDER PLAN read from one_trip_render_plans inside the
 *  seat's head statement — the exact pipeline-able statements + params the
 *  recorded build-time render asked, in call order. The gate replays it as
 *  ONE batch and arms the replay router with the results (the census's
 *  5-trip floor). `undefined` = the store carries no plan for this page;
 *  the render then runs its ordinary live residue (graceful). */
export interface PageBundle {
  pageKey: string;
  pageId: number;
  /** The full cards rows of the closure (page card included). */
  rows: CardsRow[];
  cardIds: number[];
  ruleCandidates: OneTripRuleCandidate[];
  searchResults: { searchCardId: number; position: number; cardId: number }[];
  renderPlan?: RenderPlan;
}
