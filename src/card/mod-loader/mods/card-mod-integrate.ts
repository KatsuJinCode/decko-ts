// The card-mod-integrate gem (card-mod-integrate-0.20.0), ported through
// the mod loader.
//
// The gem's tree (the installed
// card-mod-integrate-0.20.0/): eight set files, no lib/, no haml, no html
// views (htmlViewsDeclared 0, patternsUsed = patternsImplemented =
// [all, right, self], setModules 8). The mod configures integration
// events: when a card is created/updated/deleted, the items of its
// "<set>+*on <action>" rule card are resolved and each receives #deliver
// with the triggering card (README.md; observer.rb).
//
// Ported here:
// - all four setting_opts registrations (set/self/on_create.rb,
//   set/self/on_delete.rb, set/self/on_update.rb, set/self/thanks.rb) as
//   manifest settingOpts - the same surface card-mod-help uses, provable
//   headlessly through the SettingRegistry (group/position holes/flags).
// - the observer SEMANTICS (set/all/observer.rb's event_cards /
//   execute_card_events / the delete-time cache + the recursed_item_cards
//   dependency it calls into) as exported pure functions over an injected
//   card lookup - the exact algorithms, testable against the Ruby source.
//
// NOT ported (honest remainder):
// - the EVENT WIRING (observer.rb:1-9: observer_create/observer_update/
//   observer_delete at the :integrate stage, cache_delete_card_events at
//   :store) - the DECLARATIONS land on the manifest's events[] surface
//   (mod-manifest.ts:ModSetModuleFile.events, ModEventRegistration); the
//   BODIES call the ported executeCardEvents with a no-op deliver (the
//   shipped deliverers - email, notifications - come from unported mods,
//   so the per-card deliver is a documented no-op while the rule walk
//   and recursed-item expansion run for real). Engine-side STAGE
//   execution (event.rb's runner firing the declarations at their named
//   stage during save) is the action engine's stage seam
//   (eventsForStage, src/card/mod-loader/mod-event-registry.ts:116-118);
//   the registry is the mod-writable surface the declarations land on.
// - right/on_create.rb, right/on_delete.rb, right/on_update.rb -
//   `assign_type :list` each (the files' entire content). assign_type is a
//   class-side DSL call: Type.assignment[module_key] = :list (card-1.110.0
//   lib/card/set/advanced_api.rb:5-8), consumed at type resolution by
//   type_id_from_code (mod/core/set/all/type.rb:69-76) so every
//   "+*on <action>" card saves as a List. The manifest surface for that
//   call IS the set-module entry's assignsType field
//   (mod-manifest.ts ModSetModuleFile.assignsType), applied by the loader
//   at registerSetModule (mod-loader.ts:1265-1266 ->
//   registerSetTypeAssignment, the advanced_api.rb:5-8 port) - the same
//   surface card-mod-email.ts (right/to|cc|from|bcc) and
//   card-mod-account.ts (right/email|password|salt|status) carry. The
//   three entries below declare it; ASSIGN_TYPE_DECLARATIONS stays as the
//   test-side pin of the gem's three lines.
// - the deliverers: Ruby duck-types `event_card.deliver self` (README.md);
//   the shipped deliverers are the email/notification template card types
//   from other mods, none ported here - deliver is an injected seam
//   (EventCardDeliver).

import { ruleNamesForCard, settingCardNameForCode } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventCard,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// the card surface the observer reads (observer.rb's receivers, as data)
// ---------------------------------------------------------------------------

/** The minimal card shape observer.rb touches: the rule card (a List of
 *  deliverer names), its list items, and the deliverer cards themselves. */
export interface ObserverCardRef {
  /** the card's name (Card#name.s) - the identity the item walk and the
   *  loop-prevention book key on. */
  readonly name: string;

  /** the card's content (Card#content) - a List card's is the newline-
   *  separated item names (item.rb raw_item_strings). */
  readonly dbContent: string;

  /** the type name - the injected isListCard predicate reads it (Ruby's
   *  recursable_items? is set membership: card-mod-collection
   *  set/abstract/items.rb:1-2 overrides the all-card default false for
   *  the list-typed sets; membership is card-mod-list's concern, so the
   *  port takes the verdict as a predicate). */
  readonly typeName?: string | undefined;
}

/**
 * The storage surface observer.rb reads, injected so the semantics run
 * headlessly (the render engine's fetchRenderCard is the production
 * implementation; the tests inject stubs keyed the same way).
 */
export interface ObserverLookup {
  /** Card.fetch by name (rule/all.rb:9-11 rule_card -> Card.fetch; and
   *  the item walk's card resolution). undefined = not found (Ruby nil).
   *  `context` is the containing list card's name (recursed.rb:5 passes
   *  `context&.name || name` down so relative item names resolve). */
  fetch(name: string, context: string | undefined): ObserverCardRef | undefined;

  /** recursable_items? (recursed.rb:13-14 default false; items.rb:1-2
   *  true for list-typed cards). */
  isListCard(card: ObserverCardRef): boolean;
}

/** The triggering card's pattern inputs (the rule_card walk walks ITS set
 *  names - rule/all.rb#rule_card_id consults the card's rule lookup keys). */
export type ObserverTrigger = PatternCardInput;

/** Ruby's duck-typed `event_card.deliver self` (observer.rb:14; README:
 *  "Any card that implements a #deliver method"). The shipped deliverers
 *  are card types from unported mods, so the port injects the call. */
export type EventCardDeliver = (eventCard: ObserverCardRef, trigger: ObserverTrigger) => void;

// ---------------------------------------------------------------------------
// set/all/recursed.rb - recursed_item_cards, the list expansion the
// observer's event_rule answers call into (card-mod-collection-0.20.0)
// ---------------------------------------------------------------------------

/** item.rb:201-203 raw_item_strings: `content.to_s.split(/\n+/).map
 *  { |i| strip_item i }` - strip_item (item.rb:270-272) is
 *  `item.gsub(/\[\[|\]\]/, "").strip`: EVERY [[/]] removed (mid-line
 *  ones too), then trim, and NOTHING is filtered - Ruby keeps [""]-style
 *  empty items (each fetches nil downstream; see itemCardsOf). Ruby's
 *  "".split(/\n+/) answers [] while JavaScript's answers [""], hence
 *  the wholly-empty guard; whitespace-only content survives as [""]-ish
 *  items exactly as Ruby's does. */
function rawItemStrings(content: string): string[] {
  if (content === "") return [];
  return content
    .split(/\n+/)
    .map((item) => item.replace(/\[\[|\]\]/g, "").trim());
}

/** item.rb:236-243 all_item_cards -> fetch_item_card: each raw string
 *  through clean_item_name's resolution (item.rb:15-21 item_names -
 *  relative names resolve against the containing card's name via
 *  clean_item_name, item.rb:258-263; the port hands the raw string and
 *  the containing card's name to the injected fetch), then ONE fetch
 *  per name. NO compact: item.rb:236-239 maps bare, so an unfetchable
 *  item stays nil here (undefined) - nils are the nested level's
 *  compact (recursed.rb:31) and the top level's crash (recursed.rb:34),
 *  both mirrored in recursedItemCards. */
function itemCardsOf(
  card: ObserverCardRef,
  lookup: ObserverLookup,
): (ObserverCardRef | undefined)[] {
  return rawItemStrings(card.dbContent).map((raw) =>
    lookup.fetch(raw, card.name),
  );
}

/** recursed.rb:1-11 recursed_item_cards: depth-first, order-preserving,
 *  loop-safe expansion. `recursable_items?` gates the top level (false ->
 *  [self], recursed.rb:13-15 with items.rb:1-2's list override);
 *  recurse_item_list (recursed.rb:21-30) shifts one item, skips
 *  already-seen ones (already_recursed?:19-24 inserts into the book
 *  BEFORE the recursable test), unshifts a nested list's items to keep
 *  order, and lands leaf items in the list. A nil item at the TOP level
 *  (an unfetchable name - item.rb:236-239 does not compact) reaches
 *  recursed.rb:34's `item.recursable_items?` on nil and RAISES
 *  NoMethodError; the port mirrors the raise. Nested levels DO compact
 *  (recursed.rb:31). The book keys the card NAME where Ruby keys card
 *  identity - equivalent except when the same card is reached under
 *  different name strings (case variants), which would walk twice
 *  where Ruby walks once. */
export function recursedItemCards(
  card: ObserverCardRef,
  lookup: ObserverLookup,
): ObserverCardRef[] {
  const list: ObserverCardRef[] = [];
  const book = new Set<string>(); // recursed.rb:5 `book = ::Set.new # avoid loops`
  let items: (ObserverCardRef | undefined)[] = lookup.isListCard(card)
    ? itemCardsOf(card, lookup) // recursed.rb:5 item_cards(limit: "", context: ...)
    : [card]; // recursed.rb:5 non-lists recursed_item_cards to [self]
  while (items.length > 0) {
    // recursed.rb:21-30 recurse_item_list
    const item = items.shift();
    if (item === undefined) {
      // recursed.rb:34: nil.recursable_items? -> NoMethodError (the top
      // level's nils are uncompacted; a second nil never arrives because
      // the first one crashes)
      throw new Error(
        "recursed_item_cards: unfetchable item card " +
          "(Ruby: NoMethodError on nil.recursable_items?, recursed.rb:34)",
      );
    }
    if (book.has(item.name)) continue; // already_recursed? (recursed.rb:19-24)
    book.add(item.name);
    if (lookup.isListCard(item)) {
      // recursed.rb:26-27 `items.unshift(*item.item_cards.compact)` -
      // keep items in order; the .compact drops nested unfetchable names
      items = [
        ...itemCardsOf(item, lookup).filter(
          (nested): nested is ObserverCardRef => nested !== undefined,
        ),
        ...items,
      ];
    } else {
      list.push(item); // recursed.rb:29 leaf
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// set/all/observer.rb - the observer semantics
// ---------------------------------------------------------------------------

/** observer.rb:18-22 event_cards: `@card_event_cache ||
 *  ((event_rule = rule_card(setting)) && event_rule.recursed_item_cards) ||
 *  []`. Ruby truthiness, preserved exactly: the cache wins when set (the
 *  delete-time memo, observer.rb:8); else rule_card(setting) resolves and
 *  its recursed items answer (an empty Array is truthy in Ruby, so the
 *  empty expansion is kept, not replaced by the fallback); a nil rule or
 *  nil expansion falls to []. */
export function eventCards(
  trigger: ObserverTrigger,
  settingCode: string,
  lookup: ObserverLookup,
  cache?: readonly ObserverCardRef[] | undefined,
): ObserverCardRef[] {
  if (cache !== undefined) return [...cache]; // observer.rb:19 @card_event_cache
  const rule = observerRuleCard(trigger, settingCode, lookup);
  if (rule === undefined) return []; // observer.rb:20-21 nil rule -> || []
  return recursedItemCards(rule, lookup);
}

/** rule/all.rb:9-11 rule_card: `Card.fetch rule_card_id(setting_code)` -
 *  the card's rule lookup keys in pattern precedence, first existing rule
 *  card wins (rule-names.ts#ruleNamesForCard is that naming algebra; the
 *  setting codename builds its card name via
 *  settingCardNameForCode - "on_create" -> "*on create"/"*on_create").
 *  No read-permission gate here: Ruby's rule_card is a plain fetch (the
 *  ok?(:read) check is the help VIEW's addition, not the rule walk's). */
export function observerRuleCard(
  trigger: ObserverTrigger,
  settingCode: string,
  lookup: ObserverLookup,
): ObserverCardRef | undefined {
  const settingName = settingCardNameForCode(settingCode);
  for (const candidate of ruleNamesForCard(trigger, settingName)) {
    const found = lookup.fetch(candidate, undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** observer.rb:11-16 execute_card_events: `setting = :"on_#{args[:on]}";
 *  event_cards(setting).each { |event_card| event_card.deliver self }` -
 *  deliver in item order, one call per event card. */
export function executeCardEvents(
  args: { on: "create" | "update" | "delete" },
  trigger: ObserverTrigger,
  lookup: ObserverLookup,
  deliver: EventCardDeliver,
  cache?: readonly ObserverCardRef[] | undefined,
): void {
  const setting = `on_${args.on}`; // observer.rb:12
  for (const eventCard of eventCards(trigger, setting, lookup, cache)) {
    deliver(eventCard, trigger); // observer.rb:14 event_card.deliver self
  }
}

/** observer.rb:7-9 cache_delete_card_events body: `@card_event_cache =
 *  event_cards :on_delete` - the :store-stage event memoizes the delete
 *  observers BEFORE the deletion lands, because the list resolution at
 *  :integrate time (observer_delete) must see the rule's items while the
 *  card's set membership still resolves. The port returns the memo; the
 *  caller plays @card_event_cache by passing it back as eventCards'/
 *  executeCardEvents' cache argument. */
export function cacheDeleteCardEvents(
  trigger: ObserverTrigger,
  lookup: ObserverLookup,
): ObserverCardRef[] {
  return eventCards(trigger, "on_delete", lookup);
}

/**
 * observer.rb:1-9, the file's event declarations, pinned as data: three
 * :integrate-stage events (one per action) plus the :store-stage delete
 * cache. Mirrors the `events[]` entries on the all/observer setModule
 * manifest below (the live declarations ride the registry; this constant
 * is the read-only citation record used in tests + tooling).
 */
export const OBSERVER_EVENT_DECLARATIONS = [
  { event: "observer_create", stage: "integrate", on: "create" },
  { event: "observer_update", stage: "integrate", on: "update" },
  { event: "observer_delete", stage: "integrate", on: "delete" },
  { event: "cache_delete_card_events", stage: "store", on: "delete" },
] as const;

// ---------------------------------------------------------------------------
// the host adapter: ModEngineHost -> ObserverLookup (the wiring step that
// lets the exported semantics run against the live engine)
// ---------------------------------------------------------------------------

/**
 * Adapt a ModEngineHost's fetchRenderCard into an ObserverLookup. Maps
 * host.fetchRenderCard(name) -> ObserverCardRef ({name, dbContent,
 * typeName}) and provides isListCard reading typeName (Ruby's
 * recursable_items? membership - card-mod-collection
 * set/abstract/items.rb:1-2; the production typeName is the TYPE card's
 * NAME - mod/core/set/all/type.rb#type_name - so the predicate accepts
 * both the lowercase codename form "list"/"listed" used in the test
 * stubs and the capitalized name form "List" produced by the render
 * engine's enrichment path, src/card/render.ts:915-922).
 */
export function observerLookupFromHost(host: ModEngineHost): ObserverLookup {
  return {
    fetch: (name: string, _context: string | undefined) => {
      const fetched = host.fetchRenderCard(name) as
        | { name?: { s: string }; dbContent?: string; typeName?: string }
        | undefined;
      if (fetched === undefined) return undefined;
      return {
        name: fetched.name?.s ?? name,
        dbContent: fetched.dbContent ?? "",
        typeName: fetched.typeName,
      };
    },
    isListCard: (c) =>
      c.typeName === "list" ||
      c.typeName === "listed" ||
      c.typeName === "List",
  };
}

/** Documented no-op deliver (README.md: "Any card that implements a
 *  #deliver method"). The shipped deliverers are the email/notification
 *  template card types from unported mods, so the per-card deliver is
 *  left as a seam. The rule walk and the recursed-item expansion
 *  (executeCardEvents -> eventCards -> recursedItemCards) run for real;
 *  only the per-card deliver call is dropped. */
export const NO_OP_DELIVER: EventCardDeliver = () => {
  // HONEST REMAINDER: deliverers (email, notifications, ...) are unported.
  // The observer's rule walk + item expansion are exercised; the per-card
  // deliver call is a no-op until the deliverer mods land.
};

/** Module-level memo for the :store -> :integrate cache bridge. Ruby's
 *  @card_event_cache (observer.rb:8) is per-card instance state set at
 *  :store and consumed at :integrate; the TS events have no per-card
 *  state, so we key by card name (the same identity the
 *  recursed_item_cards book uses, recursed.rb:5). Set by
 *  cache_delete_card_events at :store; read by observer_delete at
 *  :integrate and cleared after. */
const deleteEventCache = new Map<string, readonly ObserverCardRef[]>();

/** Body for the three observer_<action> events (observer.rb:1-5's
 *  `%i[create update delete].each do |action| event :"observer_#{action}",
 *  :integrate, on: action do execute_card_events on: action end end`).
 *  For :delete, the memo from cache_delete_card_events (observer.rb:7-9)
 *  wins, mirroring observer.rb:19's @card_event_cache short-circuit. */
function makeObserverEventFn(
  action: "create" | "update" | "delete",
): ModEventFn {
  return (card: ModEventCard, host: ModEngineHost) => {
    const lookup = observerLookupFromHost(host);
    const memo =
      action === "delete" ? deleteEventCache.get(card.name) : undefined;
    if (action === "delete") deleteEventCache.delete(card.name);
    executeCardEvents({ on: action }, { name: card.name }, lookup, NO_OP_DELIVER, memo);
  };
}

/** Body for cache_delete_card_events (observer.rb:7-9:
 *  `@card_event_cache = event_cards :on_delete`). Memoizes the
 *  *on delete rule's recursed items so the subsequent observer_delete at
 *  :integrate sees them even though the rule card is gone by then. */
function cacheDeleteCardEventsFn(
  card: ModEventCard,
  host: ModEngineHost,
): void {
  const lookup = observerLookupFromHost(host);
  const memo = cacheDeleteCardEvents({ name: card.name }, lookup);
  deleteEventCache.set(card.name, memo);
}

/**
 * right/on_create.rb, right/on_delete.rb, right/on_update.rb (each file's
 * sole line): `assign_type :list` - advanced_api.rb:5-8 records
 * Type.assignment["Right::OnCreate" etc.] = :list; type_id_from_code
 * (mod/core/set/all/type.rb:69-76) forces the type at resolution. The
 * manifest entries below carry the same declarations via their
 * `assignsType` field (the loader applies them at mod-loader.ts:1265-1266,
 * idempotent with GEM_TYPE_ASSIGNMENTS' pre-registration of this mod's
 * three lines, set-type-assignment.ts:125-127); this export remains the
 * direct pin of the gem's three lines for the test suite.
 */
export const ASSIGN_TYPE_DECLARATIONS = [
  { setPath: "right/on_create", setModule: "Right::OnCreate", type: "list" },
  { setPath: "right/on_delete", setModule: "Right::OnDelete", type: "list" },
  { setPath: "right/on_update", setModule: "Right::OnUpdate", type: "list" },
] as const;

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModIntegrate: DeckoModManifest = {
  name: "integrate",
  gemName: "card-mod-integrate",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-integrate-0.20.0/set/all/observer.rb - the four event
      // declarations from observer.rb:1-9 (observer_create / observer_update
      // / observer_delete at the :integrate stage; cache_delete_card_events
      // at :store). The bodies call the ported executeCardEvents with a
      // documented no-op deliver (the shipped deliverers come from unported
      // mods - see the header's honest remainder + NO_OP_DELIVER).
      setPath: "all/observer",
      events: [
        {
          // observer.rb:2 - `event :"observer_#{action}", :integrate, on:
          // action do execute_card_events on: action end` for action: create.
          event: "observer_create",
          at: "integrate",
          on: ["create"],
          fn: makeObserverEventFn("create"),
        },
        {
          // observer.rb:2 - action: update.
          event: "observer_update",
          at: "integrate",
          on: ["update"],
          fn: makeObserverEventFn("update"),
        },
        {
          // observer.rb:2 - action: delete (reads the @card_event_cache
          // memo set by cache_delete_card_events at :store).
          event: "observer_delete",
          at: "integrate",
          on: ["delete"],
          fn: makeObserverEventFn("delete"),
        },
        {
          // observer.rb:7-9 - `event :cache_delete_card_events, :store, on:
          // :delete do @card_event_cache = event_cards :on_delete end`.
          event: "cache_delete_card_events",
          at: "store",
          on: ["delete"],
          fn: cacheDeleteCardEventsFn,
        },
      ],
    },
    {
      // card-mod-integrate-0.20.0/set/right/on_create.rb:1 -
      // `assign_type :list` (advanced_api.rb:5-8): the manifest's
      // assignsType field, applied by the loader
      // (mod-loader.ts:1265-1266 registerSetTypeAssignment).
      setPath: "right/on_create",
      assignsType: "list",
    },
    {
      // card-mod-integrate-0.20.0/set/right/on_delete.rb:1 - assign_type :list
      setPath: "right/on_delete",
      assignsType: "list",
    },
    {
      // card-mod-integrate-0.20.0/set/right/on_update.rb:1 - assign_type :list
      setPath: "right/on_update",
      assignsType: "list",
    },
    {
      // card-mod-integrate-0.20.0/set/self/on_create.rb
      setPath: "self/on_create",
      settingOpts: {
        group: "event",
        position: 1,
        ruleTypeEditable: false,
        helpText: "Configure events to be executed when card is created",
      },
    },
    {
      // card-mod-integrate-0.20.0/set/self/on_delete.rb
      setPath: "self/on_delete",
      settingOpts: {
        group: "event",
        position: 3,
        ruleTypeEditable: false,
        helpText: "Configure events to be executed when card is deleted",
      },
    },
    {
      // card-mod-integrate-0.20.0/set/self/on_update.rb
      setPath: "self/on_update",
      settingOpts: {
        group: "event",
        position: 2,
        ruleTypeEditable: false,
        helpText: "Configure events to be executed when card is updated",
      },
    },
    {
      // card-mod-integrate-0.20.0/set/self/thanks.rb - metadata for the
      // *thanks setting (the setting card itself ships elsewhere; this
      // gem only configures it). The Ruby string continuation joins the
      // help_text to one line.
      setPath: "self/thanks",
      settingOpts: {
        group: "other",
        position: 3,
        ruleTypeEditable: false,
        shortHelpText: "destination after card is created",
        helpText:
          "Destination after card is created. " +
          "[[http://decko.org/Custom_thank_you_messages_for_forms|more]]",
      },
    },
  ],
};

export default cardModIntegrate;
