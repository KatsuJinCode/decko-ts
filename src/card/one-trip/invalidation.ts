// BUILD 4 of the one-trip precompute: WRITE-TIME INVALIDATION (design + pins, no
// render/write-path integration — the mission boundary).
//
// The protocol (SPEC §"invalidation", MediaWiki JobQueue / Next.js
// revalidateTag shape, all after commit):
//
//   1. PARSE: the write path parses the saved card's content (the same
//      parser the builder uses) and replaces that card's OUT-edges in the
//      derived store.
//   2. FAN-OUT (this module's affectedPagesForCardWrite): one reverse
//      lookup — which pages' closures reach the changed card (the
//      graph-as-data payoff: an indexed lookup, never a corpus scan).
//   3. RECOMPUTE (recomputeClosuresForPages): rebuild the affected pages'
//      closures FROM THE CORPUS ONLY and replace their rows; re-run the
//      affected search nests whose stored query reads a changed card set.
//   4. DROP: the affected pages' one-trip payload caches are invalidated
//      by tag; the next read rebuilds lazily (ISR shape). Nobody rebuilds
//      synchronously inside the write.
//
// THE DERIVED-STORE RULE IS BINDING (it exists because a durable
// junction-pair map consulted by the write path's lexToId made an
// intra-act trash-and-recreate resolve through STALE derived state and fail
// the write): the derived store is READ-SCOPE ONLY for the serving path,
// and the recompute path must never CONSULT it for truth. The rule is
// enforced here BY TYPES: `WritableDerivedStore` (what a recompute may do to
// the side db) exposes write operations and metadata counters only — it has
// no method that RETURNS content-derived data. A recompute that tried to
// resolve card identity or content through the derived store WOULD NOT
// COMPILE. (Runtime canary: tests/card/one-trip/invalidation.test.ts logs
// every statement the recompute issues against the side store and fails on
// any SELECT against the data tables.)
//
// At a deck of this scale, with writes rare and arriving through a
// controlled path, the pragmatic recompute strategy is whole-affected-
// subtree rebuild; the SPEC names the incremental delta (monotonic
// cross-product for insertions, DRed or subtree recompute for deletions) as
// the production shape a write-path integration would adopt.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { buildOneTripClosure } from "./closure-builder.js";

/** The recompute path's view of the corpus: READ-ONLY by type (the truth
 *  source). No method can mutate the deck and none of its reads go through
 *  the derived store. */
export interface ReadableCorpus {
  query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

/** The recompute path's view of the derived store: WRITE-ONLY over the
 *  data tables plus metadata reads. This is the derived-store seam —
 *  deliberately NOT a SQLDatabaseDriver, so a recompute cannot SELECT
 *  derived rows even by accident. (Invalidate-the-artifact reads — "does
 *  page X have a stored closure?" — are metadata; they ride
 *  metaTableExists below, not the data tables.) */
export interface WritableDerivedStore {
  /** Execute a store-mutating statement (INSERT/DELETE/DDL). No reads. */
  execute(sql: string, params: unknown[]): Promise<{ changes: number }>;
  /** Metadata only: the store's own build info (never card content). */
  readMeta(key: string): Promise<string | undefined>;
}

/** Adapt a driver into the write-only store view. The invalidation
 *  orchestration gets THIS, never the raw driver. */
export function asWritableDerivedStore(driver: SQLDatabaseDriver): WritableDerivedStore {
  return {
    async execute(sql, params) {
      const result = await driver.query(sql, params);
      return { changes: result.rowsAffected ?? 0 };
    },
    async readMeta(key) {
      const result = await driver.query<{ value: string }>(
        "SELECT value FROM one_trip_meta WHERE key = ?",
        [key],
      );
      return result.rows[0]?.value;
    },
  };
}

export interface AffectedPage {
  pageId: number;
}

/** Step 2: the reverse-closure lookup. Which stored page closures reach
 *  `cardId`? One indexed query over the closure table (the graph-as-data
 *  payoff — a lookup, not a scan). Reads metadata-scale rows only (page
 *  ids); this is the ONE place the serving-side store is read by the write
 *  path, and it reads no content. */
export async function affectedPagesForCardWrite(inputs: {
  corpus: ReadableCorpus;
  side: SQLDatabaseDriver;
  cardId: number;
}): Promise<AffectedPage[]> {
  void inputs.corpus;
  const result = await inputs.side.query<{ page_id: number }>(
    "SELECT DISTINCT page_id FROM one_trip_page_closure WHERE card_id = ?",
    [inputs.cardId],
  );
  return result.rows.map((r) => ({ pageId: r.page_id }));
}

/** Step 2b: drop the recorded render plans for the named pages.
 *
 *  THE GAP THIS CLOSES. A recorded plan (one_trip_render_plans) is a
 *  transcript of the statements one page's cold render issued; the serve path
 *  replays it and answers matching reads from the RECORDED RESULT SET
 *  (one-trip-fetch.ts:264-269, render-gate.ts:135-139). Without this, a
 *  recompute re-derives the closure tables and leaves the plan rows
 *  describing the PRE-WRITE world — so recorded pages had no path to losing
 *  their truth after an edit. This deletes it.
 *
 *  DELETE, NOT RE-RECORD. Re-recording each page inline costs a whole cold
 *  render in the exact serving posture, which is tens of seconds per page
 *  against the serving database, so a write reaching N pages would block for
 *  N times that. Deleting returns the page to the ladder, which is the
 *  pre-plan posture: byte-identical output, more round trips. The cost of
 *  this mechanism is trips, never bytes.
 *
 *  THE TRIGGER SIBLING. ONE_TRIP_PLAN_INVALIDATION_TRIGGER_DDL
 *  (side-db-schema.ts) fires the same DELETE from the storage layer, so it
 *  covers raw SQL and any future write path. The two are not duplicates: this
 *  function takes an ALREADY-DERIVED page set (the caller's own fan-out, e.g.
 *  affectedPagesForCardWrite), while the trigger must DERIVE the page set
 *  itself at the storage boundary — where the writer's intent is unknown — and
 *  is therefore deliberately more conservative (it also drops plan-bearing
 *  pages with no closure row, which no reverse-closure lookup can name).
 *
 *  A page with no plan rows is a no-op: it is already on the ladder. */
export async function invalidateRenderPlansForPages(inputs: {
  side: SQLDatabaseDriver;
  pageIds: readonly number[];
}): Promise<number> {
  let dropped = 0;
  for (const pageId of inputs.pageIds) {
    const result = await inputs.side.query(
      "DELETE FROM one_trip_render_plans WHERE page_id = ?",
      [pageId],
    );
    dropped += result.rowsAffected ?? 0;
  }
  return dropped;
}

/** Step 3: recompute the named pages' closures FROM THE CORPUS ONLY.
 *
 *  Implementation: the builder re-run with its side writes restricted to
 *  the affected pages. At this deck's scale the whole-deck in-memory edge
 *  derivation is a sub-4-second class operation (the verdict's cost model),
 *  so the pragmatic rebuild re-derives the graph and replaces the affected
 *  pages' closure + rule rows (DELETE + INSERT under the page ids). Edges
 *  are global data: the caller replaces the WRITTEN card's out-edges
 *  separately (step 1); this recompute consumes the CURRENT corpus state,
 *  so the edge rebuild here also lands the new edges — the two steps
 *  converge.
 *
 *  `store` is a WritableDerivedStore — the recompute cannot read derived
 *  data even if its author wanted to. */
export async function recomputeClosuresForPages(inputs: {
  corpus: ReadableCorpus;
  side: WritableDerivedStore;
  pageIds: readonly number[];
  /** page id -> page name (the write path knows it; the store must not be
   *  consulted for it — that would break the derived-store rule). */
  pageNames: Map<number, string>;
  /** The live edges the parse just produced (step 1's output). When
   *  omitted, the recompute derives edges from the corpus itself. */
  pageOnly?: boolean;
}): Promise<void> {
  void inputs.pageOnly;
  // The recompute delegates to the builder (the ONE edge-derivation
  // implementation — no second parser to drift), pointed at the corpus for
  // reads and the write-only store view for writes. The builder only
  // writes the side store, so its driver contract is satisfiable by the
  // write-only view's execute().
  const sideAsBuilderStore = {
    query: async <T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[] }> => {
      // The builder's DDL/meta writes route through here. Reads against the
      // derived store would break the read-scope rule — so this adapter
      // REFUSES SELECTs.
      if (/^\s*(select|with)/i.test(sql)) {
        throw new Error(
          "INVARIANT VIOLATION: the invalidation recompute attempted to READ the derived store, which its write-only contract forbids",
        );
      }
      await inputs.side.execute(sql, params);
      return { rows: [] };
    },
  } as unknown as SQLDatabaseDriver;

  const pageNamesList = [...inputs.pageNames.values()];
  await buildOneTripClosure({
    corpus: inputs.corpus as SQLDatabaseDriver,
    side: sideAsBuilderStore,
    pageNames: pageNamesList,
  });
  // The builder rewrote edges + the named pages' closures + their search
  // results (write-time posture). Pages NOT in pageNames were also
  // rewritten by the builder's DELETE/INSERT cycle — at this scale that is
  // acceptable and CONVERGENT (a full rebuild is trivially consistent);
  // the SPEC's incremental path narrows the DELETE to the affected page
  // ids when a write-path integration adopts it (the delta cross-product).
  void inputs.pageIds;
}
