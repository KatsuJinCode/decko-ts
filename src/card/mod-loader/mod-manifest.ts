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
import type { PatternSpec } from "../set-patterns/registry.js";

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
   * docs/mod-loader-port-notes.md).
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
   *  reached by id compose names from their side records. */
  fetchById(id: number): Promise<
    | {
        name?: { s: string } | undefined;
        key?: string | undefined;
        leftId?: number | null | undefined;
        rightId?: number | null | undefined;
      }
    | undefined
  >;

  /** Write a composed CardRecord into the engine's caches so the SYNC
   *  render path (fetchRenderCard/isDenied/set keys) sees it. */
  cacheFetchedRecord(record: unknown): Promise<void>;
}
