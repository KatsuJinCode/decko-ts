// The ModEventCard POPULATION mechanism: how the state Ruby's `when:`
// predicates read off the acting card reaches them.
//
// Ruby's set-module predicate is an ordinary card method
// (`when_condition_applies?`, set/event/all.rb:79-85: `when Symbol then send
// block`), so a predicate may read anything `self` carries — the name, the
// dirty state, `Env.params`, `Auth.current_id`, a rule lookup, the type's
// template. The port's event card is a structural snapshot, so those reads
// have to be supplied. This module is that supply: a set of per-mod
// "state sources" that contribute the fields their predicates read, merged
// onto the card the dispatcher walks.
//
// WHY A REGISTRY. Each mod's predicates read different state, and each is
// owned by the mod that declares it. A source is the seam one mod adds: a
// named loader returning the subset of fields its predicates need. Adding a
// predicate is then two steps - declare it in the mod's predicate table
// (`<mod>ModEventPredicates`), and register a source here if it needs state
// the engine does not already carry. A source is merged over the others
// last-registered-wins, but the mod sets are disjoint by construction
// (a predicate name belongs to exactly one set module), so there is no
// contention to arbitrate.
//
// WHAT A SOURCE MAY NOT DO. A source runs inside a save. It reads the deck
// through the driver it is handed and must not mutate anything: a predicate
// is a condition, and Ruby evaluates it between the earlier conditions and
// the event body with no side effects of its own.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { RenameSwapLexicon } from "../actions/update-referer-content.js";
import type { FetchEngine } from "../fetch.js";
import type { ModEventCard } from "./mod-manifest.js";

/** The state fields predicates read (the optional, non-identity part of
 *  ModEventCard). A source returns only what its own mod's predicates
 *  consult; every other field stays absent, which reads as "unknown" to a
 *  predicate written to Ruby's semantics. */
export type ModEventCardState = Partial<ModEventCard>;

/** What a source may read about the save it is populating for. This is the
 *  deck-side context Ruby reaches through the card's own accessors
 *  (`Env.params`, `Auth.current_id`, `rule(...)`), given to a source
 *  instead of being re-derived per mod. */
export interface ModEventCardStateContext {
  /** the save's request params (Card::Env.params, env.rb). Absent off a
   *  request path. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Auth.current_id — the signed-in account id, or null anonymous. */
  readonly authCurrentId: number | null;
  /** the acting card is the act card (director/all.rb:42): true for the
   *  engine's top-level saves. */
  readonly isActCard: boolean;
  readonly driver: SQLDatabaseDriver;
  readonly lexicon: RenameSwapLexicon;
  /** The read engine, for a predicate that resolves a card shape the way
   *  Ruby's does — `rule?` and `preference?` (card/lib/card/rule/all.rb)
   *  walk Card.fetch_type_id over the name's parts, which the port's own
   *  isStandardRuleName / isPreferenceName already do (actions/
   *  rule-content-walk.ts). Absent off a model-pure dispatch; a predicate
   *  that needs it then yields an absent field, never a guess. */
  readonly fetch?: FetchEngine;
}

/** One mod's contribution to the event card's predicate state. */
export interface ModEventCardStateSource {
  /** the mod that owns these fields (the manifest's `name`). */
  readonly modName: string;
  /** the set files whose predicates these fields serve (for the report). */
  readonly setPaths: readonly string[];
  load: (
    card: ModEventCard,
    ctx: ModEventCardStateContext,
  ) => ModEventCardState | Promise<ModEventCardState>;
}

const SOURCES: ModEventCardStateSource[] = [];

/** Register a state source (mod boot, not per save). Sources load in
 *  registration order; a later source wins a shared field. */
export function registerModEventCardStateSource(
  source: ModEventCardStateSource,
): void {
  SOURCES.push(source);
}

/** The registered sources, in registration order (the loader's report and
 *  the tests read this to pin which mods contribute). */
export function modEventCardStateSources(): readonly ModEventCardStateSource[] {
  return SOURCES;
}

/** Drop every source (the mod loader's reset seam, pairing
 *  ModEventRegistry#clear). */
export function clearModEventCardStateSources(): void {
  SOURCES.length = 0;
}

/** Merge every source's contribution onto a copy of the card. A source that
 *  throws is skipped rather than allowed to fail the save: population
 *  supplies state for the `when:` conditions, and a condition Ruby could
 *  not evaluate must reach the dispatcher as a missing field (which then
 *  reads as false) rather than abort a save that Ruby would have
 *  completed. The predicate's own raise — an unresolvable NAME — is the
 *  dispatcher's business and stays loud (mod-event-dispatch.ts). */
export async function populateModEventCardState(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): Promise<ModEventCard> {
  let merged: ModEventCard = card;
  for (const source of SOURCES) {
    try {
      const state = await source.load(merged, ctx);
      if (state !== undefined && Object.keys(state).length > 0) merged = { ...merged, ...state };
    } catch {
      // see the header: an unreadable state is an absent one
    }
  }
  return merged;
}