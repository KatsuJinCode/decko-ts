// The per-mod ModEventCard state sources (mod-event-card-state.ts) that the
// deck boot registers. One source per mod whose `when:` predicates read
// state the engine does not already put on the event card.
//
// ADDING A PREDICATE'S STATE: add the predicate to the owning mod's table
// (its `<mod>ModEventPredicates` export), and — if it reads anything the
// engine's `eventCard` does not already carry — add or extend that mod's
// source below. A predicate that reads only what `eventCard` supplies (the
// name, the action, the dirty set, the act's skip/trigger state) needs no
// source at all; that is the cheap case.

import type { ModEventCard } from "./mod-manifest.js";
import {
  registerModEventCardStateSource,
  type ModEventCardState,
  type ModEventCardStateContext,
} from "./mod-event-card-state.js";

/** card/mod/core/set/all/ — the predicates set_autoname (autoname.rb:1),
 *  save_draft + set_default_content (content.rb:7/:13), validate_name +
 *  validate_key (name_events.rb:3/:38) and the cardtype event
 *  (type/cardtype.rb:19-20) consult.
 *
 *  - `Env.params` rides the save for every request path, which is what
 *    draft? (content.rb:17) reads.
 *  - `db_content_before_act` is the port's `changedFields`: use_default_content?
 *    (content.rb:30) asks `!db_content_changed?`, i.e. content was NOT
 *    among the changing columns.
 *  - type_id_before_act is the cardtype predicate's subject
 *    (type/cardtype.rb:11). */
function coreSource(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): ModEventCardState {
  // set_autoname's ladder is NOT ported: a create that arrives without a
  // name is lexed to `~<id>` by the engine rather than named from the deck's
  // autoname rule (autoname.rb:1-8). Ruby's `name.blank?` half of autoname?
  // therefore never holds, which coreModEventPredicates states directly; no
  // field carries it here.
  return ctx.params !== undefined ? { params: ctx.params } : {};
}

/** mod/history/set/all/history — actionable? / finalize_action? /
 *  rollback_request? (events.rb:53/:61, revision.rb:29).
 *
 *  The three read act-local ivars the history writer owns: whether an
 *  action is open for this card, whether a revert was requested, and
 *  whether this card records history at all (history.rb:6). The engine's
 *  write path is what sets them, so they arrive on the context as the
 *  history writer's own view of the act. */
function historySource(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): ModEventCardState {
  return {
    // act_card? (director/all.rb:42): the engine's saves are top-level acts.
    isActCard: ctx.isActCard,
    // history? (history.rb:6) defaults true; the account mod's no-history
    // types opt out, and the engine already computes that set for its own
    // dropHistory call (account-fields.ts NO_HISTORY_RIGHT_CODENAMES).
    history: true,
  };
}

/** Register every source this branch owns. Called once from the deck boot
 *  (default-mod-deck.ts) alongside the predicate tables, so the two halves
 *  of a mod's `when:` support are wired in the same place. */
export function registerDeckModEventCardStateSources(): void {
  registerModEventCardStateSource({
    modName: "core",
    setPaths: ["all/autoname", "all/content", "all/name_events", "type/cardtype"],
    load: coreSource,
  });
  registerModEventCardStateSource({
    modName: "history",
    setPaths: ["all/history", "all/history/events", "all/history/revision"],
    load: historySource,
  });
}