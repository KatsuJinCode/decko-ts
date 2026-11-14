// The render-time ACT-SEARCH seam: the narrow, read-only data surface the
// card-mod-history `updated_by` view reads.
//
// WHY THIS EXISTS: Ruby's
// updated_by body is `Card.search(updater_of: { id: card.id })`
// (card-mod-history-0.20.0 set/all/history_board.rb:10-16) - a CQL search
// that ties the cards table through card_acts and card_actions
// (card-1.110.0 lib/card/query/card_query/relational_attributes.rb:32-34
// `updater_of -> tie_act :update_action_on` -> ActQuery#update_action_on
// (lib/card/query/act_query.rb:17-19) -> ActionQuery#update_action_on +
// add_update_condition (lib/card/query/action_query.rb:26-33)). The engine's
// render surface exposes prefetched CARDS only - the fetched-card
// composition reads no act rows (src/card/fetch/card-record.ts:31-35) - so
// the view had no substrate at all.
//
// NO COLUMN APPROXIMATION IS FAITHFUL, and the schema says so: cards.updater_id
// is NOT NULL and is set at CREATE, so it names the creator on every
// never-updated card. The two shapes differ observably: a card with TWO update
// actions renders
// `Updated by <a ...>Decko Bot</a>` while a card with one create action
// renders the EMPTY text-muted div. The distinguishing
// fact lives only in the update ACTS.
//
// SHAPE (why it is safe - the same four-point argument the history seam
// carries, src/card/history/render-seam.ts):
//
// 1. NARROW - one reader, one row set. The bundle carries the DISTINCT actor
//    cards of the ONE card being rendered, by id and name. There is no SQL
//    passthrough, no query string, no card mutation, no cross-card walk.
// 2. RENDER-TIME, NOT PREFETCH - the rows load in RenderEngine.render's async
//    prepare phase ONLY when the requested view is one of UPDATER_SEAM_VIEWS
//    (:box, which renders :box_bottom; :box_bottom; and :updated_by asked
//    for by name) and only for the requested card. A :titled/:open/:content
//    render never touches this code. The sync ViewFn reads the memoized
//    bundle - the same prepare-then-sync-render split the engine already
//    uses for executeSearch, collectRules, isDenied and the history seam.
// 3. READ-ONLY - the single SELECT is the port of the query the gem itself
//    runs (see updaterOf in card-mod-history.ts). The seam adds zero writes.
// 4. PERMISSION-CHECKED LIKE EVERY READ - not by a verdict, because the gem's
//    own query has no permission clause: it joins cards to card_acts on
//    actor_id, card_actions on card_act_id, and the target card, filtering on
//    `action_type = 1` (update) and non-trash rows - no viewable_sql, no
//    ok?(:read). What DOES gate the data is the
//    view gate that runs before any body: the render root's read verdict
//    (view/permission.rb:46-50 #denial -> view_for_denial) means a card the
//    viewer cannot read never reaches this view at all, and the query can
//    only name actors of acts ON THAT card.

/** One updater actor card: the actor of at least one UPDATE action on the
 *  rendered card. `name` is the actor card's name (a junction's name is
 *  composed from left/right by the lexicon, exactly as Ruby's
 *  lex_to_name does) - the view needs it for `nest card, view: :link`.
 *  undefined = the name could not be composed (a cold lexicon for an id
 *  with no stored name/key); the view drops such an updater from the link
 *  list rather than fabricating an anchor. */
export interface UpdaterCardInfo {
  readonly cardId: number;
  readonly name: string | undefined;
}

/** The synchronous act-search bundle one updated_by render reads. Built
 *  once per render by RenderEngine.prepareUpdaterRender; consumed by the
 *  ported :updated_by view (src/card/render/views.ts). */
export interface UpdaterRenderReader {
  /** The render root's id. undefined on a NEW card - the view's
   *  `if card.id` guard (history_board.rb:11) makes the search - and so the
   *  whole body - absent there, exactly as Ruby skips it. */
  readonly rootCardId: number | undefined;
  /** `Card.search(updater_of: { id: card.id })` - the DISTINCT actor cards,
   *  in the query's natural order (see updaterOf: Ruby's SQL carries no
   *  ORDER BY; the port pins the deterministic id-ascending order that
   *  SQLite's DISTINCT-over-join already produces). */
  readonly updaters: readonly UpdaterCardInfo[];
}
