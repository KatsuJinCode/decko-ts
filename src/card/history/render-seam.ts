// The render-time history query seam: the narrow, read-only data surface
// the card-mod-history html views read.
//
// WHY THIS EXISTS (the blocker the card-mod-history.ts header names): the
// engine's render surface exposes prefetched CARDS only - act/action/change
// ROWS were unreachable from a ViewFn, so eleven of the gem's twelve html
// views could not be ported. This seam closes exactly that gap and nothing
// else.
//
// SHAPE (and why it is safe - the design notes below):
//
// 1. NARROW - the seam has no SQL passthrough and no card mutation. A view
//    can read the history rows (acts/actions/changes) of the ONE card being
//    rendered, the precomputed value/previous-value projections the gem's
//    readers produce for those rows, and the two config constants. There is
//    no write path, no arbitrary query, no cross-card walk beyond the gem's
//    own history_card_ids reference closure (nestee cards whose acts count
//    as this card's history - history.rb:11-13).
// 2. RENDER-TIME, NOT PREFETCH - the rows load in RenderEngine.render's
//    async prepare phase ONLY when the requested view is one of the history
//    views (render.ts#HISTORY_VIEWS) and only for the requested card +
//    act/action params. A render of :titled/:open/:content never touches
//    this code. The sync ViewFn then reads the memoized bundle - the same
//    prepare-then-sync-render split every other engine query seam uses
//    (executeSearch, collectRules, isDenied).
// 3. READ-ONLY - every query is a SELECT through the existing reader
//    functions in card-mod-history.ts (the tested port of the gem's
//    set/all/history/*.rb read side). The seam adds zero writes.
// 4. PERMISSION-CHECKED LIKE EVERY READ - the data is the card's own
//    history, readable exactly when the card is: the standard view gate
//    (view/permission.rb #altered_view -> src/card/permissions/view-perms)
//    runs on the render root BEFORE any history view body executes, so a
//    read-denied card renders the denial, never the history. Per-ROW, the
//    gem filters what it shows through the same read rule it applies
//    everywhere: approved_actions drops an act's actions whose card is not
//    readable (act_renderer.rb:91-94 `a.card&.ok? :read`), and
//    all_with_actions_on applies the viewable_sql WHERE at SQL level
//    (act.rb:54-59). The port runs the identical filter through the
//    engine's precomputed read verdicts (isDenied over each action's card
//    id) - the documented simplification card-mod-history.ts
//    HistoryActsOptions.isActionViewable already carries. The relative
//    renderer's rollback link additionally consults ok_to_update? through
//    engine.taskAllowed (deny-by-default: a rule-less deck denies, as
//    Ruby's permit failure does); the link only NAVIGATES to the write
//    route, which enforces the real update rule server-side.
// 5. ANONYMOUS - the history views declare no perms directive
//    (views.rb:3-65), so they ride the default :read task: anonymous
//    actors read history exactly when they read the card (the capture
//    pinned this wiring: renders ran as Anonymous,
//    state.anon_ok_read_probe = true).

import type { HistoryActionRow, HistoryActRow, HistoryChangeRow } from "../mod-loader/mods/card-mod-history.js";
import type { RenderCard } from "../render/format.js";

/** The params Ruby reads from Card::Env.params at render time
 *  (act_listing.rb:9-12 act_from_context "act_id", actions.rb:34-40
 *  action_from_context ":action_id" (also voo.action_id),
 *  act_listing_opts_from_params "act_seq"/"action_view"/"hide_diff",
 *  acts_page_from_params "page", act_listing.rb:31 params[:act_context]).
 *  The port threads them through RenderEngine.render's optional params
 *  argument - the URL query string, server-parsed. */
export interface HistoryRenderParams {
  actId?: string;
  actionId?: string;
  actSeq?: string;
  actionView?: string;
  hideDiff?: string;
  actContext?: string;
  page?: string;

  /** The render's VIEW opts (Ruby render(view, opts) - the opts hash the
   *  voo builds from; the modal hidden-header arm
   *  reaches the wrap gates through it: render(card, :modal_rule,
   *  { viewOpts: { hide: ['modal_header'] } })). Undefined for every
   *  existing caller (the engine passes {} onward, byte-identical). */
  viewOpts?: Record<string, unknown>;
}

/** One action's card as the views need it (name algebra + type + the
 *  prepared card when the engine enriched it - the subformat render target
 *  of ActionRenderer#content_diff, action_renderer.rb:84-88). */
export interface HistoryActionCardInfo {
  cardId: number;
  name: string;
  typeId: number | null;
  typeName: string | undefined;
  /** The prepared render card (present when the id resolved in the
   *  engine's store). The nested :action_summary subformat render reads
   *  THIS card - set keys, read gate, slot wrap all ride the standard
   *  machinery. Undefined = the card row is gone (deleted); the gem's
   *  clean_acts/approved_actions drop such actions from view. */
  renderCard: RenderCard | undefined;
}

/** The type name of a type_id through the engine's codename/name registry
 *  (for the cardtype diff, action_renderer.rb:90-94). */
export type TypeNameLookup = (typeId: number) => string | undefined;

/** The synchronous history data bundle one history-view render reads.
 *  Built once per render by RenderEngine.prepareHistoryRender; consumed by
 *  the three ported views in card-mod-history.ts. */
export interface HistoryRenderReader {
  readonly params: HistoryRenderParams;
  /** The render root's id (undefined on a NEW card - history views never
   *  reach a body there: the unknown/denial substitution runs first). */
  readonly rootCardId: number | undefined;
  /** Card::Auth.current_id for the render (the engine viewer). */
  readonly currentUserId: number;
  /** history_acts - act.rb:46-52 all_with_actions_on(history_card_ids,
   *  true) ordered id DESC, viewable-filtered. */
  readonly acts: HistoryActRow[];
  /** The total act count BEFORE pagination (act_list_starting_seq,
   *  act_listing.rb:69-71, and the page slice). */
  readonly actsTotal: number;
  /** card.last_act (last.rb:69-91) - RelativeActRenderer#current_act? +
   *  the no-act_id act fallback chain. */
  readonly cardLastAct: HistoryActRow | undefined;
  /** card.last_action (last.rb:53-55) - act/action_from_context fallbacks. */
  readonly cardLastAction: HistoryActionRow | undefined;
  /** Act.find (act_listing.rb:12) over the loaded acts. */
  actById(id: number): HistoryActRow | undefined;
  /** Card::Action.fetch over the loaded actions. */
  actionById(id: number): HistoryActionRow | undefined;
  /** Act#actions (act.rb:88-92, id order). */
  actionsOfAct(actId: number): HistoryActionRow[];
  /** Act#action_on(card_id) (act.rb:97-101) - the act's non-draft action
   *  on that card. */
  actionOn(actId: number, cardId: number): HistoryActionRow | undefined;
  /** Act#actions_affecting(card) (act.rb:122-127) - the relative
   *  renderer's action set. */
  actionsAffecting(actId: number, cardId: number): HistoryActionRow[];
  /** The act's action set AFTER the approved_actions read filter
   *  (act_renderer.rb:91-94) - `actions` is renderer-relative
   *  (affecting vs all), so the filter takes the caller's list. */
  approvedActions(actions: HistoryActionRow[]): HistoryActionRow[];
  /** The action's card info (name/type/prepared card). */
  actionCard(action: HistoryActionRow): HistoryActionCardInfo | undefined;
  /** Card info by id - the act primary cards (clean_acts' `acts.select
   *  { &:card }`, act_listing.rb:59-63) and the actor links read this. */
  cardInfo(cardId: number): HistoryActionCardInfo | undefined;
  /** value(:field) - changes.rb:8-12 through interpret_field/interpret_value
   *  (precomputed in the prepare phase). */
  value(action: HistoryActionRow, field: "name" | "type_id" | "db_content" | "content" | "trash"):
    string | number | boolean | null | undefined;
  /** previous_value(:field) - changes.rb:17-22. */
  previousValue(action: HistoryActionRow, field: "name" | "type_id" | "db_content" | "content" | "trash"):
    string | number | boolean | null | undefined;
  /** type name for the cardtype diff. */
  typeNameForId(typeId: number): string | undefined;
  /** ok_to_update? on the render root (the rollback link's gate,
   *  relative_act_renderer.rb:68). undefined = unverifiable-allowed. */
  readonly rootUpdateAllowed: boolean | undefined;
  /** The raw act/action/changes rows the views' own normalization may need
   *  (the JSON export shapes already read these directly). */
  readonly changes: Map<number, HistoryChangeRow[]>;
}
