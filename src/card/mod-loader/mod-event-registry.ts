// The mod-declared card-event registry: the recording half of Ruby's
// set-module `event` DSL (card-1.110.0 lib/card/set/event.rb), which is how
// a set module attaches work to the card save path (`event :observer_create,
// :integrate, on: :create do ... end`, card-mod-integrate-0.20.0
// set/all/observer.rb:1-9).
//
// What lives here: the DECLARATIONS. A mod's manifest carries its events per
// set file (ModSetModuleFile.events); the ModLoader's SetLoader phase
// registers each one here with the set path + mod name injected - the same
// bookkeeping shape view registration uses (RegisteredSetModule).
//
// What does NOT live here yet (the honest remainder, mirroring the
// card-mod-integrate port's note): the EXECUTION wiring - Ruby's
// Card::Set::Event API runs declarations at their stage during save
// (event.rb's stage runner; the action engine's stage seams are
// src/card/actions/card-action-engine.ts). The engine consults
// eventsForStage at its named stages when that seam lands; until then the
// registry is the mod-writable surface the ports pin their declarations
// against (card-mod-integrate.ts OBSERVER_EVENT_DECLARATIONS).

import type {
  ModEventFn,
  ModEventRegistration,
  ModEventStage,
  ModEventTrigger,
} from "./mod-manifest.js";

export type {
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
  ModEventStage,
  ModEventTrigger,
} from "./mod-manifest.js";

/** One registered event: the declaration plus the file coordinates the
 *  loader injected (the set file the `event` call sits in - Ruby's
 *  Card::Set::Event attaches to the set module being defined). */
export interface RegisteredModEvent {
  /** the event's name (`event :observer_create` -> "observer_create"). */
  readonly event: string;
  /** the declaring set file's path ("all/observer"). */
  readonly setPath: string;
  /** the contributing mod ("integrate"). */
  readonly modName: string;
  /** the stage (`event :x, :integrate` - event.rb's stage position;
   *  absent = recorded without a stage, resolved by the execution seam). */
  readonly at?: ModEventStage;
  /** the `on:` triggers (`on: :create`); "save" is stored verbatim - the
   *  execution seam applies Ruby's :save -> [:create, :update] expansion
   *  (event.rb#deferred_conditions). */
  readonly on?: readonly ModEventTrigger[];
  /** named `when:` predicate (Ruby allows a symbol or proc; the TS surface
   *  carries the name and the execution seam resolves it against the card). */
  readonly when?: string;
  /** `changed:` field gate, stored verbatim (see ModEventRegistration). */
  readonly changed?: readonly string[];
  /** `after:` relative ordering, stored verbatim (see ModEventRegistration). */
  readonly after?: string;
  readonly priority?: number;
  readonly fn: ModEventFn;
}

/** Registration order = SetLoader walk order (groups outer, mods, pattern
 *  codes, path-sorted files) - the same order Ruby's event definitions
 *  load in, which is the order the execution seam will run same-stage
 *  events. */
export class ModEventRegistry {
  private readonly events: RegisteredModEvent[] = [];

  register(entry: RegisteredModEvent): void {
    this.events.push(entry);
  }

  /** Every registered event, in registration order. */
  all(): RegisteredModEvent[] {
    return [...this.events];
  }

  /** The events declared at one stage, in registration order (the list the
   *  action engine's stage seam will walk). */
  forStage(stage: ModEventStage): RegisteredModEvent[] {
    return this.events.filter((entry) => entry.at === stage);
  }

  /** One event by name (first registration wins for duplicate names -
   *  Ruby raises on duplicate event names per set module; cross-module
   *  duplicates are legal and resolve by set membership at fire time). */
  forEvent(name: string): RegisteredModEvent | undefined {
    return this.events.find((entry) => entry.event === name);
  }

  /** Drop every registration (the mod loader's reset seam). */
  clear(): void {
    this.events.length = 0;
  }

  size(): number {
    return this.events.length;
  }
}

// ---------------------------------------------------------------------------
// process-wide default instance (the execution seam's consultation point)
// ---------------------------------------------------------------------------

let defaultRegistry: ModEventRegistry | undefined;

/** Bind a registry as the default (the deck boot seam - the composed deck's
 *  loader calls this after load()). Pass undefined to unbind (tests +
 *  reload sequences; the same contract as setDefaultModLoader). */
export function setDefaultModEventRegistry(
  registry: ModEventRegistry | undefined,
): void {
  defaultRegistry = registry;
}

/** The stage lookup the action engine's execution seam will consult.
 *  Undefined registry = no mod events (the pre-seam state). */
export function eventsForStage(stage: ModEventStage): RegisteredModEvent[] {
  return defaultRegistry?.forStage(stage) ?? [];
}
