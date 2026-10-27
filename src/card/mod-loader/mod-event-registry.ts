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
// What does NOT live here: the EXECUTION wiring - Ruby's Card::Set::Event
// API runs declarations at their stage during save. That half is its own
// module now: mod-event-dispatch.ts (the stage walk + Ruby's applicability
// algebra), consulted by the save path's modEvents runtime
// (src/card/actions/card-action-engine.ts). This registry remains the
// mod-writable declaration surface the ports pin against
// (card-mod-integrate.ts OBSERVER_EVENT_DECLARATIONS).
//
// The registration half's census; the dispatch carries the execution half
// and names its own defs.
//
// THE CENSUS - card-1.110.0/lib/card/set/event.rb
//   :72-86   event - the Api entry point; the DSL's event() call, mod-dsl.ts
//   :90-96   register - this class's register(): validation, then record
//   :104-107 name - the registry keys entries by `event`
//   :108-111 block - the manifest carries `fn` verbatim
//   :114-117 simple_method_name - rides the delayed-job rows (methodName)
//
// The options census: ported below as real code, registration-time
// validation against Api::OPTIONS.
//
// THE CENSUS - card-1.110.0/lib/card/set/event/options.rb
//   :6-11    validate_conditions - validateConditions below
//   :15-20   validate_condition_name - validateConditionName below
//   :23-28   validate_condition_value - validateConditionValue below
//   :31-38   validate_standard_condition_value - validateStandardConditionValue below
//   :40-42   invalid_condition_values - invalidConditionValues below
//   :44-49   validate_when_value - validateWhenValue below
//
// THE CENSUS - card-1.110.0/lib/card/set/event/options.rb
//   :52-57   event_opts - collapses into the manifest build: the DSL's event() fills the typed fields, so register() validates and the dispatch applies the stage/action semantics
//   :60-65   normalize_opts - collapses into the manifest build, as event_opts: the stage-or-opts first argument lands in the manifest's `at` field
//   :69-71   process_action_opts - carried at the dispatch: on: is stored verbatim and mod-event-dispatch.ts expands "save" to create+update at dispatch
//   :73-87   process_stage_opts - carried at the dispatch: the stage walk roots events at their stage and chains after:/before: beside their target
//   :83-86   callback_name - carried at the dispatch: the stage names order Ruby's callback chains; the dispatch's chain walk orders without them
//
// The event.rb DEFINITION factories are not ported, named:
// define, event.rb:97-102, define_event, event.rb:128-131,
// define_simple_method, event.rb:133-136, define_event_method,
// event.rb:139-141, and define_standard_event_method, event.rb:147-159.
// Ruby generates ActiveSupport callbacks and one method pair per event at
// load; the port records the declaration (register) and the dispatch's
// stage walk fires it (mod-event-dispatch.ts, whose census names the
// execution defs), so the per-event method generation collapses into the
// register/dispatch pair and carries no port site of its own.
//
// callbacks.rb has no port counterpart, named: set_event_callbacks,
// callbacks.rb:6-12, set_event_callback, callbacks.rb:14-20, and
// valid_event_callback, callbacks.rb:23-28, wire each event onto Card's
// ActiveSupport callback chains with `prepend: true, if:
// event_applies?(event)`. The port has no ActiveSupport callback chain:
// the dispatch walks the registry at each stage and applies the same
// applicability algebra itself, so the callback wiring collapses into the
// stage walk and these three defs carry no port site of their own.

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
   *  absent = recorded without a stage, resolved by the execution seam).
   *  Ruby clears @stage when before:/after:/around: is declared
   *  (options.rb:76), so an event carrying either relative ordering has no
   *  `at` of its own and inherits its target's stage at dispatch. */
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
  /** `changing:` — the alias of changed:, stored verbatim (see
   *  ModEventRegistration; the execution seam treats it identically). */
  readonly changing?: readonly string[];
  /** `skip: :allowed` — the act's plain skip list may drop this event
   *  (see ModEventRegistration). */
  readonly skip?: "allowed";
  /** `trigger: :required` — runs only when explicitly triggered (see
   *  ModEventRegistration). */
  readonly trigger?: "required";
  /** `after:` relative ordering, stored verbatim (see ModEventRegistration). */
  readonly after?: string;
  /** `before:` relative ordering, stored verbatim (see ModEventRegistration). */
  readonly before?: string;
  readonly priority?: number;
  readonly fn: ModEventFn;
}

// ---------------------------------------------------------------------------
// event option validation - the port of Card::Set::Event::Options
// (card-1.110.0 lib/card/set/event/options.rb) over the Api::OPTIONS table
// (lib/card/set/event/api.rb:19-26). Ruby validates at Event#register
// (event.rb:92 validate_conditions), so a set file with a bad option dies
// at mod load; the port validates at registry registration, the same
// point on the loader's walk, and refuses the load the same way.
// ---------------------------------------------------------------------------

/** Api::OPTIONS (event/api.rb:19-26): every condition key a declaration may
 *  carry and the values each accepts. `changed:`/`changing:` take Card::
 *  Dirty's options (dirty.rb:15-17: the seven dirty fields plus the two
 *  aliases type/content). `when:` takes a symbol or a proc - here the
 *  predicate NAME string, or a function when a caller holds the proc. */
export const EVENT_API_OPTIONS: Readonly<
  Record<"on" | "changed" | "changing" | "skip" | "trigger", readonly string[]>
> = {
  on: ["create", "update", "delete", "save", "read"],
  changed: [
    "name",
    "db_content",
    "trash",
    "type_id",
    "left_id",
    "right_id",
    "codename",
    "type",
    "content",
  ],
  changing: [
    "name",
    "db_content",
    "trash",
    "type_id",
    "left_id",
    "right_id",
    "codename",
    "type",
    "content",
  ],
  skip: ["allowed"],
  trigger: ["required"],
};

/** The registration record's structural keys: injected by the loader, never
 *  Ruby option keys. Everything else must be a condition key (or the
 *  exempted stage/priority spellings below). */
const REGISTRATION_STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "event",
  "fn",
  "setPath",
  "modName",
]);

/** Keys validate_conditions never checks (options.rb:8: stage, before,
 *  after, around, delay) plus priority, which Ruby consumes earlier
 *  (process_delayed_job_opts, delayed_event.rb:27-29, inside event_opts).
 *  `at` is the port's field name for Ruby's `stage`. The port's
 *  registration surface declares no field for `around:` or `delay:` - Ruby
 *  exempts both here and gives them delayed/around semantics downstream,
 *  and no pinned deck event declares either (measured over the gemset's
 *  lib + mod set trees), so a declaration carrying one falls through to the
 *  invalid-key refusal below rather than registering an event nothing
 *  would ever fire. */
const OPTION_EXEMPT_KEYS: ReadonlySet<string> = new Set([
  "at",
  "before",
  "after",
  "priority",
]);

/** validate_conditions (options.rb:6-11): every key must be a known
 *  condition (or exempt), and every value must be one its condition
 *  accepts. Refusal raises with Ruby's message shapes so a bad
 *  declaration dies at load with the reason named. */
export function validateConditions(entry: RegisteredModEvent): void {
  const event = entry.event;
  const record = entry as unknown as Record<string, unknown>;
  for (const key of Object.keys(entry)) {
    if (REGISTRATION_STRUCTURAL_KEYS.has(key)) continue;
    if (OPTION_EXEMPT_KEYS.has(key)) continue;
    switch (key) {
      case "on":
      case "changed":
      case "changing":
      case "skip":
      case "trigger":
        validateConditionValue(key, record[key], event);
        break;
      case "when":
        validateWhenValue(record[key], event);
        break;
      default:
        validateConditionName(key, event);
    }
  }
}

/** validate_condition_name (options.rb:15-20): the key must be one of
 *  Api::OPTIONS'. */
function validateConditionName(condition: string, event: string): void {
  if (condition in EVENT_API_OPTIONS) return;
  throw new Error(
    `invalid condition key '${condition}' in event '${event}'\n` +
      `valid conditions are ${Object.keys(EVENT_API_OPTIONS).join(", ")}`,
  );
}

/** validate_condition_value (options.rb:23-28): `when` has its own rule;
 *  everything else is a value-list check. */
function validateConditionValue(
  condition: "on" | "changed" | "changing" | "skip" | "trigger",
  value: unknown,
  event: string,
): void {
  validateStandardConditionValue(condition, value, event);
}

/** validate_standard_condition_value (options.rb:31-38): every value the
 *  declaration lists (Ruby's Array.wrap) must be in the condition's option
 *  list. */
function validateStandardConditionValue(
  condition: "on" | "changed" | "changing" | "skip" | "trigger",
  value: unknown,
  event: string,
): void {
  const invalid = invalidConditionValues(condition, value);
  if (invalid.length === 0) return;
  const list = invalid.join(", ");
  const plural = invalid.length > 1 ? "s" : "";
  throw new Error(
    `invalid option${plural} '${list}' for condition '${condition}' in event '${event}'`,
  );
}

/** invalid_condition_values (options.rb:40-42): Array.wrap(val) minus the
 *  condition's accepted values. */
function invalidConditionValues(
  condition: "on" | "changed" | "changing" | "skip" | "trigger",
  value: unknown,
): string[] {
  const wrapped = Array.isArray(value) ? value.map(String) : [String(value)];
  return wrapped.filter((v) => !EVENT_API_OPTIONS[condition].includes(v));
}

/** validate_when_value (options.rb:44-49): a symbol (the predicate name
 *  string here) or a proc (a function), nothing else. */
function validateWhenValue(value: unknown, event: string): void {
  if (typeof value === "string" || typeof value === "function") return;
  throw new Error(
    `invalid value for condition 'when' in event '${event}'\n` +
      "must be a symbol or a proc",
  );
}

/** Registration order = SetLoader walk order (groups outer, mods, pattern
 *  codes, path-sorted files) - the same order Ruby's event definitions
 *  load in, which is the order the execution seam will run same-stage
 *  events. */
export class ModEventRegistry {
  private readonly events: RegisteredModEvent[] = [];

  register(entry: RegisteredModEvent): void {
    validateConditions(entry);
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
