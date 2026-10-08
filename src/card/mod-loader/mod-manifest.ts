// The mod manifest format: the TypeScript analog of a card-mod gem's
// registration surface. A ported mod exports ONE manifest object; the loader
// (../mod-loader.ts) walks manifests in Cardio::Mod::Dirs order and
// registers each definition exactly where Ruby's set-module DSL would.
//
// Ruby file -> manifest field map (every entry cites its source):
// - set_pattern/*.rb                    -> setPatterns[] (a PatternSpec +
//                                          register options; the SetPattern-
//                                          Loader wraps each file as
//                                          `class Card::Set::<Camel> <
//                                          Card::Set::Pattern::Base` whose
//                                          postamble calls register
//                                          (lib/cardio/mod/loader/
//                                          set_pattern_loader.rb:55-61,
//                                          lib/card/set/pattern/
//                                          class_methods.rb:13-18)
// - set/<pattern>/<anchor>.rb           -> setModules[] (one entry per file;
//                                          setPath mirrors the path under
//                                          set/, e.g. "all/help" for
//                                          card-mod-help set/all/help.rb)
// -   `format :html do view :x, ... `   -> setModules[n].formats.html.views[]
//                                          (lib/card/set/format.rb:91-102
//                                          format + AbstractFormat#view
//                                          lib/card/set/format/
//                                          abstract_format.rb:97-100)
// -   `view :x, unknown: true, ...`     -> the view's config{} (the VIEW_
//                                          SETTINGS of lib/card/set/format/
//                                          abstract_format/view_opts.rb:17,
//                                          stored as _view_<x>__<setting>
//                                          methods, view_opts.rb:59-64)
// -   `setting_opts ...`                -> setModules[n].settingOpts
//                                          (lib/card/set/advanced_api.rb:
//                                          10-14 -> Card::Setting#
//                                          register_setting, lib/card/
//                                          setting.rb:63-72)
// - config/late initializers + the      -> prepareEngine (the one-time,
//   boot-time rule-cache warm             deck-wide preparation hook; the
//                                          Ruby analog is the boot-time
//                                          Rule::Cache load, lib/card/rule/
//                                          cache.rb:10-27, which runs
//                                          before any mod view renders)
//
// The manifest deliberately mirrors the gem's FILE structure (one setModules
// entry per .rb file, paths as in the gem) so porting a mod is mostly
// transcription: each Ruby set file becomes one entry, each `view` call one
// ModViewDefinition, each `setting_opts` call one ModSettingOpts.

import type { ViewFn } from "../render/format.js";
import type { ContentFn } from "../render/content-overrides.js";
import type { PatternSpec } from "../set-patterns/registry.js";
// type-only: ModEventContext lives with the dispatcher that builds it (the
// cycle manifest <-> dispatch is type-level only — no runtime edge).
import type { ModEventContext } from "./mod-event-dispatch.js";
// the seam's context is part of the mod-writable surface (ModEventFn's
// third parameter), so the type re-exports here.
export type { ModEventContext };

/**
 * The view-definition options Ruby splits out of `view :x, <opts>` (the
 * VIEW_SETTINGS list, view_opts.rb:17, plus the `unknown: true` global tag,
 * view_opts.rb:52). Absent fields mirror absent settings: the view renders
 * with Ruby's defaults (no substitution, permission-checked, default cache).
 */
export interface ModViewConfig {
  /**
   * unknown: true renders the view AS REQUESTED on unknown cards;
   * a string names the view an unknown card is substituted to
   * (view/permission.rb:39-42; registered per view by interpret_view_
   * settings, view_opts.rb:49-57).
   */
  unknown?: boolean | string;

  /**
   * perms: :none skips the read check entirely (permission.rb#skip_check?;
   * the TS permissions layer consults this via the mod-loader view-config
   * registry - see the format.ts integration patch note in
   * ).
   */
  perms?: string;

  /** cache: :never | :standard | :always | :yes | :deep | :force (render.rb:51). */
  cache?: string;

  /** wrap: :slot etc. - wrappers applied by the render pipeline (voo_api.rb:167-177). */
  wrap?: string | string[];

  /** denial: :blank - the view rendered when the read check denies (format/error.rb:27-31). */
  denial?: string;
}

/** One `view :name, opts do ... end` inside a format block. */
export interface ModViewDefinition {
  /** the view name ("help" for view :help). */
  readonly view: string;

  /** the view body - the TS port of the view block (self = format). */
  readonly viewFn: ViewFn;

  /** the view's definition options (see ModViewConfig). */
  readonly config?: ModViewConfig;
}

/** One `format :html do ... end` block's registrations (set/format.rb:91-102). */
export interface ModFormatBlock {
  /** the views the block defines. Later registrations override earlier ones
   *  (Ruby module reopening: define_method replaces, view_definition.rb:18-21)
   *  - the loader preserves load order, so a later mod's view wins. */
  readonly views?: readonly ModViewDefinition[];
}

/**
 * One `setting_opts ...` call (advanced_api.rb:10-14): extends Card::Setting
 * and runs register_setting (setting.rb:63-72). The codename comes from the
 * set module's anchor (Self::Help -> "help", setting.rb:96) unless given.
 */
export interface ModSettingOpts {
  /** group: :editing | :permission | :webpage | :templating | :event | :other
   *  (the fixed group list, setting.rb:45-54; default :other). */
  readonly group?: string;

  /** position: 1-based slot in the group (setting.rb#set_position:101-110:
   *  occupied slot -> insert BEFORE it; free slot -> assign, leaving nil
   *  holes; absent -> append). */
  readonly position?: number;

  /** rule_type_editable: true | false (setting.rb:69). */
  readonly ruleTypeEditable?: boolean;

  /** short_help_text (setting.rb:69). */
  readonly shortHelpText?: string;

  /** help_text: stored on BOTH the Self set and the Right set
   *  (setting.rb#help_text_for_setting:112-114), so cards in either set
   *  answer raw_help_text. */
  readonly helpText?: string;

  /** restricted_to_type: cardtype codenames the setting applies to
   *  (setting.rb:70, 116-123; kept as codename strings - the id resolution
   *  is the codename registry's job at query time). */
  readonly restrictedToType?: readonly string[];

  /** preference: true adds the codename to the preferences set
   *  (setting.rb:68, 95-99). */
  readonly preference?: boolean;
}

/**
 * One set-module file: set/<pattern>/<anchor...>.rb. The anchor-less `all`
 * pattern file is setPath "all/<name>". Helper files (a leading `#! not set
 * module` line, set_template.rb:47-53) are not ported: they define no
 * registrations.
 */

/** The stages a set-module event can run at - Ruby's full director stage
 *  list (card-1.110.0 lib/card/director/director.rb:18; the _with_delay
 *  variants exist for delayed_job, which has no TS surface - they are
 *  recorded so declarations port verbatim). */
export type ModEventStage =
  | "initialize"
  | "prepare_to_validate"
  | "validate"
  | "prepare_to_store"
  | "store"
  | "finalize"
  | "integrate"
  | "after_integrate"
  | "integrate_with_delay"
  | "extend"
  | "extend_with_delay";

/** The `on:` triggers (event.rb#deferred_conditions; "save" is stored
 *  verbatim - the execution seam applies :save -> [:create, :update]). */
export type ModEventTrigger = "create" | "update" | "delete" | "save";

/** The card surface an event body receives when the execution seam fires
 *  it (Ruby's `self` in an event body is the acting card). Structural
 *  minimum; the seam widens it as stages wire in.
 *
 *  THE EXECUTION SEAM'S WIDENING (mod-event-dispatch.ts): the fields Ruby
 *  event bodies read off `self` — the key (map_referees), the action, the
 *  dirty-field set (attribute_is_changing?, dirty.rb:31-37), the pre-act
 *  name (name_before_act), trash/type, and the act's skip/trigger state
 *  (skip_and_trigger.rb). All optional: stub declarations never read them. */
export interface ModEventCard {
  readonly name: string;
  readonly id?: number;
  readonly dbContent?: string;
  /** The card's effective key (lib/card/name/all.rb:17-19) — what
   *  map_referees keys on. */
  readonly key?: string;
  /** The save this dispatch belongs to (Ruby's card.action). */
  readonly action?: "create" | "update" | "delete";
  readonly trash?: boolean;
  readonly typeId?: number | null;
  /** name_before_act (dirty.rb:66-68) — the pre-save name on renames. */
  readonly nameBeforeAct?: string;
  /** The columns changing in THIS save, in Card::Dirty canonical names
   *  (dirty.rb:8-10: name, db_content, trash, type_id, left_id, right_id,
   *  codename; DirtyNames :57-60 folds left/right changes into name). */
  readonly changedFields?: readonly string[];
  /** The act's skip/trigger state (see ModEventActState). */
  readonly act?: ModEventActState;
}

/** The act-level state an event body sees — Ruby's accessors on the act
 *  card (skip_and_trigger.rb:17-35): skip=/trigger= carry hash value true,
 *  forceSkip the skip_event! entries (:force). */
export interface ModEventActState {
  readonly action: "create" | "update" | "delete";
  readonly actId?: number;
  readonly skip?: readonly string[];
  readonly forceSkip?: readonly string[];
  readonly trigger?: readonly string[];
}

/** An event body. Errors propagate to the caller (integration-stage walks
 *  rescue them, card.rb:163-171); async bodies are awaited by the seam that
 *  fires them. The host is the mod engine host (the same instance
 *  prepareEngine receives); ctx carries the deck deps + the act skip state
 *  (ModEventContext, mod-event-dispatch.ts). Bodies that predate the seam
 *  take fewer parameters — assignable in both directions of the widening. */
export type ModEventFn = (
  card: ModEventCard,
  host: ModEngineHost,
  ctx: ModEventContext,
) => void | Promise<void>;

/** One `event :name, <opts> do ... end` declaration inside a set file
 *  (lib/card/set/event.rb). The loader injects setPath + modName at
 *  registration (they come from the file the event sits in); the registry
 *  lives in mod-loader/mod-event-registry.ts. */
export interface ModEventRegistration {
  /** the event's name (`event :observer_create` -> "observer_create"). */
  readonly event: string;

  /** the stage position (`event :x, :integrate`). */
  readonly at?: ModEventStage;

  /** the triggers the event runs on. */
  readonly on?: readonly ModEventTrigger[];

  /** named `when:` predicate (Ruby allows a symbol or proc; the surface
   *  carries the name, resolved by the execution seam at fire time). */
  readonly when?: string;

  /** `changed:` field gate (permissions.rb:1 `changed: %i[type_id name]`) -
   *  the card FIELDS whose change gates the event; the execution seam
   *  evaluates it against the act's changed fields. */
  readonly changed?: readonly string[];

  /** `changing:` — the API-level alias of changed: (event.rb:57; Dirty
   *  alias_method :77). Recorded verbatim so declarations port as written
   *  (cardtype.rb:20 `changing: :type`); the dispatcher treats it exactly
   *  as changed:. */
  readonly changing?: readonly string[];

  /** `skip: :allowed` (event.rb:40, name_events.rb:12/:46,
   *  reference_events.rb:6): the act's plain skip= list may drop this
   *  event; events without the declaration only yield to skip_event!
   *  (skip_and_trigger.rb:80-84). */
  readonly skip?: "allowed";

  /** `trigger: :required` (event.rb:41): the event runs only when the act
   *  explicitly triggers it (skip_and_trigger.rb:86-90). */
  readonly trigger?: "required";

  /** `after: :event_name` relative ordering (permissions.rb:7
   *  `after: :set_read_rule`) - the event runs after the named one at the
   *  same stage; the execution seam sorts by it. */
  readonly after?: string;

  readonly priority?: number;

  /** the event body (Ruby's block; self = the acting card). */
  readonly fn: ModEventFn;
}

export interface ModSetModuleFile {
  /** path under set/ minus the .rb extension, e.g. "all/help" or
   *  "right/comment". The first segment names the pattern; the rest is the
   *  anchor (the module chain Card::Set::<Pattern>::<Anchor>,
   *  set_template.rb:66-69). Number prefixes are stripped per segment
   *  (loader.rb#parts_from_path:61-65). */
  readonly setPath: string;

  /** the file's format blocks keyed by format name ("html" for
   *  `format :html do`; the bare `format do` block is the base format). */
  readonly formats?: Readonly<Record<string, ModFormatBlock>>;

  /** the file's `setting_opts` call (only meaningful on Self-set files;
   *  nothing enforces that here beyond Ruby's own convention). */
  readonly settingOpts?: ModSettingOpts;

  /** the file's set-module `def content` overrides (right/when_created.rb:7,
   *  self/now.rb:1 - ContentFn = the method body). Registered in order on
   *  the deck's ContentOverrideRegistry with setPath + modName injected;
   *  last registration wins per set path (Ruby's method redefinition). */
  readonly contentOverrides?: readonly ContentFn[];

  /** the file's `event` declarations (see ModEventRegistration; the
   *  DECLARATION surface - execution wiring into the save path is the
   *  action engine's stage seam, consult via eventsForStage). */
  readonly events?: readonly ModEventRegistration[];

  /** the file's `assign_type :foo` line (advanced_api.rb:5-8:
   *  `Type.assignment[module_key ||= shortname] = type`). module_key is the
   *  set module's shortname ("right/to" -> "Right::To"), so one registration
   *  per set-module file. Consumed by the type-assignment walk
   *  (set-type-assignment.ts) whenever a COMPOUND card's type is derived —
   *  the save path's resolveTypeId and the render path's new-card typing
   *  (render.ts newCardDefaultType, type.rb:58-66 `type_id_from_code ||
   *  type_id_from_template`). */
  readonly assignsType?: string;

  /** the file's `basket[:tasks][:name] = {...}` declarations
   *  (set/self/admin.rb in card-mod-carrierwave; the registrar's basket
   *  machinery, lib/card/set/basket.rb). The loader collects them in load
   *  order; the deck task basket is core's own basket merged with every
   *  contribution (the *admin :core task table reads the deck basket). */
  readonly basketTasks?: readonly ModBasketTask[];

  /** the file's `basket[:warnings] << :name` pushes (set/self/admin.rb in
   *  card-mod-recaptcha). Collected in load order; the *admin :warning view
   *  walks the deck list. */
  readonly basketWarnings?: readonly string[];
}

/** One `basket[:tasks][:name] = { mod: ..., execute_policy: ... }` entry
 *  (card-mod-carrierwave set/self/admin.rb:1-4). `execute_policy` is a Ruby
 *  lambda with no headless surface (it shells at the asset pipeline) and is
 *  deliberately not carried; the en.yml strings for the task table's
 *  `t "#{mod}_task_#{task}_link_text"` / `_description` ride along because
 *  a contribution's locale lives in the CONTRIBUTING mod's en.yml (the core
 *  basket's pairs live in core-admin-runtime's CORE_ADMIN_LOCALE). */
export interface ModBasketTask {
  /** the basket key (Ruby's task symbol). */
  readonly task: string;
  /** the `mod:` value (basket select key; type/mod.rb#tasks filters
   *  `v[:mod] == modname.to_sym`). */
  readonly mod: string;
  /** the `irreversible:` flag (nil is omitted - Ruby nil is falsy). */
  readonly irreversible?: boolean;
  /** en.yml `<mod>_task_<task>_link_text` (the task table's link text). */
  readonly linkText: string;
  /** en.yml `<mod>_task_<task>_description` (the task table's second cell). */
  readonly description: string;
}

/** One set_pattern file registration (SetPatternTemplate postamble:
 *  `register "<code>".underscore.to_sym, (options || {})`,
 *  set_pattern_loader.rb:55-61). */
export interface ModPatternRegistration {
  /** the pattern code (the file name's suffix: set_pattern/tab.rb -> "tab";
   *  loader.rb#parts_from_path strips NN_ prefixes). */
  readonly code: string;

  /** the pattern's class-side definition (applies?, anchors, labels,
   *  prototype_args) - the same shape the core table uses. */
  readonly spec: PatternSpec;

  /** the register options (class_methods.rb:13-18): compound_only,
   *  assigns_type, anchor_parts_count, and the optional :index insertion
   *  point (absent -> front-insert, nil.to_i = 0). The option VALUES ride
   *  inside spec; this carries only :index. */
  readonly index?: number;
}

/**
 * The port of one card-mod gem. `name` is the normalized mod name
 * (Cardio::Mod.normalize_name strips the "card-mod-" prefix,
 * class_methods.rb:26-28). Everything else transcribes the gem's tree.
 */
export interface DeckoModManifest {
  /** normalized mod name ("card-mod-help" -> "help"). */
  readonly name: string;

  /** the full gem name, when the mod ships as a gem (informational; the
   *  Dirs port keeps it in the group/index bookkeeping). */
  readonly gemName?: string;

  /** the mod group: "gem-card" (core), "gem-defaults" (card-mod-group
   *  metadata), "gem", or "custom" (dirs.rb:66-78, 148-156). */
  readonly group?: string;

  /** the gem's set_pattern/*.rb files, in the order the loader should
   *  consider them within the mod (each_file_in_dir sorts by path). */
  readonly setPatterns?: readonly ModPatternRegistration[];

  /** the gem's set/ tree files (set/PATTERN/ANCHOR.rb; order within the
   *  loader is derived from the pattern-group walk, then mod order, then
   *  path sort). */
  readonly setModules?: readonly ModSetModuleFile[];

  /**
   * One-time deck-wide preparation (the port of what Ruby does at boot
   * BEFORE any render: the rule-cache warm, rule/cache.rb:10-27, plus the
   * gem's config/late initializers where they preload state). Called once
   * per engine by ModLoader.installInto, awaited before the first render.
   * Mods whose views only read already-fetched cards omit this.
   */
  readonly prepareEngine?: (host: ModEngineHost) => Promise<void>;
}

/**
 * The engine surface a mod's prepareEngine may use. Structural on purpose:
 * the RenderEngine satisfies it (its private cacheFetchedRecord is reached
 * through the cast at the install site, the established composition-seam
 * pattern). Mods never import the engine concrete class.
 */
export interface ModEngineHost {
  /** Cache-first render-card resolution (the sync render-path surface). */
  fetchRenderCard(name: string): unknown;

  /** Read-permission verdict for a prepared card (ok_to_read? set membership). */
  isDenied(card: unknown): boolean;

  /** Batch SQL (the deck-wide prefetch shape; one call = one round trip). */
  batch(statements: readonly { sql: string; params: unknown[] }[]): Promise<unknown[]>;

  /** Codename registry (peek a codename's card id after ensureLoaded). */
  codenames: {
    ensureLoaded(): Promise<void>;
    peekId(code: string): number | undefined;
  };

  /** Fetch one card by id (the fetch ladder). The record carries the name
   *  when the card is simple (or its lexicon entry exists); junction cards
   *  reached by id compose names from their side records. dbContent rides
   *  the record (cards.db_content) - the mod rule warms read it (the
   *  input-remainders lane's *input type warm turns each rule's content
   *  into the with_card mark fetch). */
  fetchById(id: number): Promise<
    | {
        name?: { s: string } | undefined;
        key?: string | undefined;
        leftId?: number | null | undefined;
        rightId?: number | null | undefined;
        dbContent?: string | undefined;
      }
    | undefined
  >;

  /** Write a composed CardRecord into the engine's caches so the SYNC
   *  render path (fetchRenderCard/isDenied/set keys) sees it. */
  cacheFetchedRecord(record: unknown): Promise<void>;

  /** db-roundtrip-elimination lane (W1): compose + cache records from the
   *  warms' OWN `SELECT c.*` rows instead of walking each row back through
   *  fetchById (the per-row point-query storm: one idToLex + one id row per
   *  uncached row, ~170 hops per cold engine on the trial deck). Same
   *  mechanism and value-identity contract as prefetch.ts
   *  composeAndCacheSqlRows: the real row goes straight into
   *  composeCardRecord, junction names compose multi-pass sides-first from
   *  the row set itself, the lexicon is primed both directions, and every
   *  composed record lands in the fetch cache + enriched render-card map
   *  exactly like cacheFetchedRecord. Returns the composed records in row
   *  order (records whose sides never composed are skipped, the same skip
   *  the per-row ladder applied when the composed name stayed undefined). */
  composeAndCacheRows(rows: readonly object[]): Promise<
    Array<{
      id?: number;
      name?: { s: string };
      key?: string;
      leftId?: number | null;
      rightId?: number | null;
    }>
  >;
}
