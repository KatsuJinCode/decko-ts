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
/** Ruby's `wrap: { div: { class: "..." } }` view setting (or `{}`, which
 *  answers "no wrap" and still stops the MRO walk). */
export type ModViewWrapSpec = Readonly<Record<string, Readonly<{ class?: string }>>>;

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
  wrap?: string | string[] | ModViewWrapSpec;

  /** denial: :blank - the view rendered when the read check denies (format/error.rb:27-31). */
  denial?: string;

  /** template: :haml - Ruby renders the view from the set's template file
   *  (<view>.haml beside the set file) instead of a block. The engine has no
   *  HAML interpreter: a ported template view supplies its body as a view
   *  function, and this field records that the Ruby view is template-backed
   *  so the port can be checked against the template it transcribes. */
  template?: string;
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
  /** db_content_before_act — the stored content this save is replacing
   *  (the dirty tracker's pre-act column, card/lib/card/dirty.rb). The
   *  carrierwave storage predicates compare the saved content against it
   *  through `current` (01_storage_type.rb:12-14 `refresh true`). */
  readonly dbContentBeforeAct?: string | null;
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
  /** codename (card/lib/card/codename.rb:5) — the card's codename column,
   *  read by `when: :codename?` (codename.rb:10). */
  readonly codename?: string;
  /** type_id_before_act (card/lib/card/dirty.rb, the dirty tracker) — read
   *  by `when: :was_cardtype?` (mod/core/set/type/cardtype.rb:11). */
  readonly typeIdBeforeAct?: number | null;
  /** The type whose SET MODULES are attached at this stage — Ruby's
   *  patterns. A type-CHANGING save assigns type_id through the plain
   *  writer (all/type.rb:52 write_card_or_id), which does not reset
   *  patterns (reset_patterns runs only on the resolution arm,
   *  all/type.rb:60-64, and from the expire paths), so Ruby validates with
   *  the STORED type's modules attached while card.type_id reads the new
   *  value. The walk that knows both facts supplies this; absent, the set
   *  resolution falls back to typeId. */
  readonly patternTypeId?: number | null;
  /** Card::Env.params for this save (lib/card/env.rb) — the request-param
   *  bag Ruby's predicates read as a hash (`draft`, `attachment_upload`,
   *  `insert_item`). Undefined off a request path. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** The type card's template default content, if any — `default_content`
   *  in `use_default_content?` (mod/core/set/all/content.rb:30). */
  readonly defaultContent?: string | undefined;
  /** Auth.current_id (card/lib/card/auth/all.rb) — the signed-in account
   *  id, for the account mod's `current_account?` /
   *  `password_redirect?` (set/abstract/account_holder.rb:23). */
  readonly authCurrentId?: number | null;
  /** `can_approve?` (mod/account/set/type/signup.rb:12-14): `Card.new(type_id:
   *  Card.default_accounted_type_id).ok? :create`. Gates
   *  :auto_approve_with_verification (:20-22). The engine resolves it once
   *  per save (its own signup arm asks the same question). */
  readonly canApprove?: boolean;
  /** Auth.always_ok? (card-1.110.0 lib/card/auth.rb:20) — bot/bypass mode.
   *  The engine answers it from the same memoized permission state its write
   *  gates use (card-action-engine.ts writePermissionState); the
   *  admin_tasks body's permission gate reads it (self/admin.rb:29
   *  `raise Card::Error::PermissionDenied, self unless Auth.always_ok?`). */
  readonly alwaysOk?: boolean;
  /** history? (mod/history/set/all/history.rb:6) — the card type opts out
   *  of history when false; backs `actionable?` (events.rb:53). */
  readonly history?: boolean;
  /** Whether this card IS the act card (director/all.rb:42 `act_card?`). */
  readonly isActCard?: boolean;
  /** carrierwave storage_type — `coded?`/`local?`
   *  (mod/carrierwave/set/abstract/attachment/01_storage_type.rb:28-33). */
  readonly storageType?: string;
  /** The storage_type ASSIGNED on this save (01_storage_type.rb:40-43
   *  `storage_type=`, which also raises Ruby's @explicit_storage_type) —
   *  read by `uncode?` (coded.rb:26-28). Absent when the save assigned
   *  none, which is Ruby's nil. */
  readonly explicitStorageType?: string;
  /** The `mod` assigned on this save (coded.rb:12-14 `mod=`,
   *  set_specific[:mod] at attachment.rb:96) — `uncode?`'s middle clause.
   *  Absent when the save assigned none. */
  readonly assignedMod?: string;
  /** ENV["STORE_CODED_FILES"] (lib/carrier_wave/card_mount.rb:59-63) — the
   *  opt-in that lets a coded attachment actually store. Undefined where
   *  the variable is unset, which is Ruby's nil (falsy). */
  readonly storeCodedFiles?: boolean;
  /** Whether this save carries an attached file, and whether it changed —
   *  the carrierwave attachment conditions
   *  (mod/carrierwave/set/abstract/attachment.rb:51). */
  readonly attachmentPresent?: boolean;
  readonly attachmentIsChanging?: boolean;
  /** `action_id_of_cached_upload` as this save carries it
   *  (00_upload_cache.rb:2, :84-86) — the two-step upload's final save. */
  readonly actionIdOfCachedUpload?: number | string;
  /** The account mod's per-act `@setup_approved` flag
   *  (mod/account/set/type/user.rb:53) — backs `setup?` (:72). */
  readonly setupApproved?: boolean;
  /** Card::Env.controller (card/lib/card/env.rb:18) — true when the save
   *  rides a controller request. Backs silence_notifications?
   *  (mod/follow/set/all/notify.rb:9: `!(Card::Env.controller ||
   *  force_notifications)`). The engine's save paths serve controller
   *  requests, so the save path sets this true (as the recaptcha guard
   *  does). */
  readonly envController?: boolean;
  /** force_notifications (mod/follow/set/all/notify.rb:3 mattr_accessor) —
   *  Ruby's test/deck override that keeps notifications on without a
   *  controller. Unset in the port. */
  readonly forceNotifications?: boolean;
  /** The account card's stored password field (blank = none set), read by
   *  `password_redirect?` (mod/account/set/right/account/events.rb:83). */
  readonly password?: string | null;
  /** The follow mod's per-act silent flag and followability
   *  (mod/follow/set/all/notify.rb:9-38). */
  readonly silentChange?: boolean;
  readonly followable?: boolean;
  /** The follow mod's per-act preference-expiration marker
   *  (mod/follow/set/all/follow/follower_ids.rb:15). */
  readonly expirePreferences?: boolean;
  /** history's pending-revert marker (mod/history/set/all/history/
   *  revision.rb:29 `actions_to_revert.any?`) and the current act's
   *  action presence (events.rb:61). */
  readonly rollbackRequested?: boolean;
  readonly currentAction?: boolean;
  /** last_action_id_before_edit (mod/history/set/all/history/events.rb:66)
   *  — the revision the editor started from; backs `edit_conflict?`. */
  readonly lastActionIdBeforeEdit?: number | string | null;
  /** The card is a child of the *recaptcha+*settings card
   *  (mod/recaptcha/set/abstract/recaptcha_setting.rb:11 `left&.codename
   *  == :recaptcha_settings`). */
  readonly recaptchaSettingChild?: boolean;
  /** list type constraints (mod/list/set/abstract/01_list/events.rb:35-39):
   *  `ok_item_types.present?` and collection's `unique_items?`
   *  (mod/collection/set/all/item_assignment.rb:1). */
  readonly hasOkItemTypes?: boolean;
  readonly uniqueItems?: boolean;
  /** carrierwave attachment storage facts, read by the predicates in
   *  set/abstract/attachment.rb and 01_storage_type.rb: the type as saved
   *  (`current.storage_type`/`bucket`/`mod` — the storage_changed?
   *  comparison, 01_storage_type.rb:49), whether this is a `web` storage
   *  card (:40/:47), whether its bucket is configured read_only
   *  (cloud.rb:118), and the attachment's own identifier content
   *  (attachment.db_content, :40). `current.bucket` and `current.mod` are
   *  Ruby's `false` for a non-cloud / non-coded card (cloud.rb:10,
   *  coded.rb:16) — not nil — so they are typed to carry that false. */
  readonly currentStorageType?: string;
  readonly currentStorageBucket?: string | false;
  readonly currentStorageMod?: string | false;
  /** The SAVING card's own `bucket` (cloud.rb:8-11) and `mod` (coded.rb:
   *  16-18) — the other two halves of `storage_changed?`'s three-way
   *  comparison (01_storage_type.rb:49-53). `false` where Ruby returns
   *  false: a non-cloud card has no bucket, a non-coded card no mod. */
  readonly savedStorageBucket?: string | false;
  readonly savedStorageMod?: string | false;
  readonly webStorage?: boolean;
  readonly bucketReadOnly?: boolean;
  readonly attachmentIdentifierContent?: string | null;
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

/** A Ruby event whose behaviour the engine implements in its own code
 *  (the comment at each use names where). Declared at its set so the
 *  set's event list is Ruby's; the body is empty, and a registered stub
 *  never replaces engine code (card-action-engine.ts
 *  EVENT_TAKEOVER_BUILTINS lists the only names that do). */
export function engineOwnedEvent(decl: Omit<ModEventRegistration, "fn">): ModEventRegistration {
  return { ...decl, fn: () => undefined };
}

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

  /** `before: :event_name` relative ordering (signin.rb:27 `before:
   *  :signin`, user.rb:50 `before: :check_permissions`, enabled_roles.rb:28
   *  `before: :store_in_session`) - the event runs before the named one at
   *  the same stage; the execution seam sorts by it. Ruby's options.rb:76
   *  clears @stage when before:/after:/around: is given, so an event
   *  carrying this has NO `at:` of its own and inherits the named target's
   *  stage at dispatch. */
  readonly before?: string;

  readonly priority?: number;

  /** the event body (Ruby's block; self = the acting card). */
  readonly fn: ModEventFn;
}

/** One set-module `def content` as a manifest declares it.
 *
 *  A bare ContentFn is the shorthand: the method body, nothing else to say
 *  about it. The object form is for the set modules whose `def content` needs
 *  a fact Ruby reads off the file itself — the only one today being
 *  `assign_type`:
 *
 *  `right/followers.rb` declares NO `assign_type` of its own; it reaches
 *  `assign_type :list` through `include_set Abstract::List` (followers.rb:5)
 *  and declares `view :core, cache: :never do super() end` (:8-10) — so the
 *  card RETAINS its list type and the Abstract::List core runs with the
 *  overridden raw as its item source. That is `supersedesType: false` (the
 *  flag content-overrides.ts#RegisteredContentOverride carries; default true).
 *  Without it the override bytes would REPLACE the pointer-list core instead
 *  of feeding it, and the rendered shape would lose the list wrapper Ruby
 *  emits. */
export type ModContentOverride =
  | ContentFn
  | {
      readonly fn: ContentFn;
      readonly supersedesType?: boolean;
    };

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
   *  last registration wins per set path (Ruby's method redefinition).
   *
   *  A bare ContentFn is the shorthand for an override whose set module
   *  neither carries an `assign_type` of its own nor answers a separate
   *  supersedesType question; the object form spells out the per-override
   *  flags. Both forms register identically apart from those flags. */
  readonly contentOverrides?: readonly ModContentOverride[];

  /** How this set module decides that a card is one of ITS cards.
   *
   *  Undefined (the default, and every set module except the follow family)
   *  means the shared pure-NAME predicate, cardBelongsToSet
   *  (content-overrides.ts), which compares the set path's anchor against the
   *  card's name keys. `"set-module-chain"` means Ruby's own question
   *  instead: is this module in the card's set-module chain
   *  (lib/card/set/pattern/base.rb:21-29 module_key over :40-44
   *  anchor_codenames, :27-29 lookup_module_list)?
   *
   *  A set module needs this when its anchor is a STARRED codename card, which
   *  the name comparison cannot see: the card `Home+*followers` carries right
   *  part name key `*follower`, not `followers` (Decko singularizes a codename
   *  card key; MEASURED), so `right/followers` never matches on the name alone.
   *
   *  Declared per file on purpose. The chain predicate is CORRECT for the date
   *  family too — `Home+*when created` does resolve `Right::WhenCreated` once
   *  the name environment is installed (MEASURED) — but turning it on there
   *  changes what every real `+*when created` card renders, which no lane has
   *  measured against the oracle, and the loader registers date BEFORE follow
   *  (contentOverrideRegistry().paths() order, MEASURED) while
   *  resolveContentOverrideEntry keeps the LAST match: a predicate loose
   *  enough to match both families would shadow the date overrides instead of
   *  failing loudly. The date surface is left exactly as it stands; see
   *  set-module-membership.ts#cardInSetModule. */
  readonly membership?: "set-module-chain";

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

  /** The file's `def virtual?; new?; end` (card-mod-follow-0.20.0
   *  set/right/followers.rb:22-24, set/right/following.rb:4-6,
   *  set/type_plus_right/user/follow.rb:8-10). Ruby states.rb:44-50 treats
   *  `virtual?` as a per-set-module override ("Some cards with hard-coded
   *  content will also override the #virtual? method. This is established
   *  practice"), and `known?` is `real? || virtual?` — so every UNSAVED card
   *  whose chain holds this module is KNOWN and its page renders its own views
   *  instead of the create form (card-mod-format set/all/html/error.rb:82-84
   *  `page_view_for_unknown` fires only for an unknown card). The loader
   *  registers the module shortname in the virtual-set-module registry
   *  (src/card/set-modules/virtual-set-modules.ts), which the page and render
   *  roots consult. */
  readonly virtual?: boolean;

  /** The file's mod data rule seeds (data/real.yml rule rows the gem ships;
   *  card-mod-recaptcha data/real.yml's *captcha toggles are the ported
   *  case). Registered into the mod rule-seed registry (mod-rule-seeds.ts)
   *  at load; the form-side recaptcha gate reads them synchronously (the
   *  validate side stays storage-only — mod-rule-seeds.ts' header records
   *  why). */
  readonly ruleSeeds?: readonly Readonly<{ name: string; content: string }>[];

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

  /** the file's `card_accessor` / `card_reader` / `card_writer` calls
   *  (card-1.110.0 lib/card/set/trait.rb): each names a +<name> child card
   *  the set's cards read or write through. Recorded in load order with the
   *  set path and mod name injected (ModLoader.cardAccessorDeclarations). */
  readonly cardAccessors?: readonly ModCardAccessor[];
}

/** One `card_accessor :name, type: :x` (reader + writer), `card_reader`
 *  (reader only) or `card_writer` (writer only) declaration. */
export interface ModCardAccessor {
  /** the trait name (`card_accessor :email` -> "email"; the child card is
   *  <card>+<name>). */
  readonly name: string;
  readonly reader: boolean;
  readonly writer: boolean;
  /** `type:` — the cardtype codename the child is created with. */
  readonly type?: string;
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

  /** Fetch one card by NAME (the fetch ladder's by-name arm; the warms
   *  that seat named setting cards through cacheFetchedRecord). */
  fetchByName?(name: string): Promise<unknown | undefined>;

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
   *  the input remainders's *input type warm turns each rule's content
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

  /** db round-trip elimination: compose + cache records from the
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
