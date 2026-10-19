// The mod-definition DSL: the TypeScript form of Ruby Decko's set-module
// DSL (card-1.110.0 lib/card/set/*). A mod written with it reads the way a
// card-mod gem's set/ tree reads, and compiles to the same DeckoModManifest
// a hand-transcribed mod exports — the loader (../mod-loader.ts) cannot tell
// the two apart.
//
// Ruby construct                          -> DSL call
// - card-mod-<name> gem                   -> defineMod("card-mod-<name>", ...)
//                                            (name normalized as
//                                            Cardio::Mod.normalize_name does,
//                                            mod/class_methods.rb:26-28)
// - set/<pattern>/<anchor>.rb             -> set("<pattern>/<anchor>", ...)
//                                            (one ModSetModuleFile; a second
//                                            set() on the same path reopens
//                                            it, as a reopened Ruby module
//                                            does)
// - `format :html do ... end`             -> format("html", ({ view }) => ...)
// - `format do ... end` / a top-level     -> format(({ view }) => ...) /
//   `view` (set/format.rb: a bare view       view(...) at set level; both land
//   call goes to the base format)            on the "base" format
// - `view :x, cache: :never do ... end`   -> view("x", { cache: "never" }, fn)
//                                            (VIEW_SETTINGS, format/
//                                            abstract_format/view_opts.rb)
// - `event :x, :store, on: :update,       -> event("x", "store", { on: "update",
//    after: :y, when: :z? do ... end`         after: "y", when: "z?" }, fn)
//                                            (lib/card/set/event.rb)
// - `setting_opts group: ...`             -> setting({ group: ... })
//                                            (set/advanced_api.rb)
// - `card_accessor :x, type: :phrase`     -> accessor("x", { type: "phrase" })
//   `card_reader` / `card_writer`            reader(...) / writer(...)
//                                            (lib/card/set/trait.rb)
// - `assign_type :x`                      -> assignType("x")
// - `def content` override                -> content(fn)
// - `basket[:tasks][:x] = {...}`          -> basketTask({...})
//   `basket[:warnings] << :x`                basketWarning("x")
// - set_pattern/<code>.rb                 -> setPattern("<code>", spec, opts)
// - boot-time rule-cache warm             -> prepareEngine(fn)
//
// The DSL adds no behaviour of its own: every call appends one entry to the
// manifest in call order, which is the order the hand-written manifests
// list them in (the order Ruby's file reads them in). docs/mod-dsl.md walks
// through writing a new mod with it.

import type { ViewFn } from "../render/format.js";
import type { ContentFn } from "../render/content-overrides.js";
import type { PatternSpec } from "../set-patterns/registry.js";
import { normalizeModName } from "./mod-order.js";
import type {
  DeckoModManifest,
  ModBasketTask,
  ModCardAccessor,
  ModEngineHost,
  ModEventFn,
  ModEventRegistration,
  ModEventStage,
  ModEventTrigger,
  ModFormatBlock,
  ModPatternRegistration,
  ModSetModuleFile,
  ModSettingOpts,
  ModViewConfig,
  ModViewDefinition,
} from "./mod-manifest.js";

// ---------------------------------------------------------------------------
// option shapes (Ruby keyword arguments, symbols written as strings)
// ---------------------------------------------------------------------------

/** `view :x, <opts>` — the view-definition options (ModViewConfig). */
export type ViewOptions = ModViewConfig;

/** `event :x, <stage>, <opts>` — the event options (lib/card/set/event.rb).
 *  `on:` takes one trigger or a list, as Ruby's does (`on: :save`,
 *  `on: %i[create update]`). `when:` is the NAME of a predicate the
 *  execution seam resolves (mod-event-dispatch.ts); Ruby's proc form has
 *  no carrier on the registration surface. */
export interface EventOptions {
  readonly on?: ModEventTrigger | readonly ModEventTrigger[];
  readonly before?: string;
  readonly after?: string;
  readonly when?: string;
  readonly changed?: string | readonly string[];
  readonly changing?: string | readonly string[];
  readonly skip?: "allowed";
  readonly trigger?: "required";
  readonly priority?: number;
  /** The engine implements this event in its own code (engineOwnedEvent in
   *  mod-manifest.ts): the declaration is recorded with an empty body. */
  readonly engineOwned?: boolean;
}

/** `card_accessor :x, <opts>` (lib/card/set/trait.rb). */
export interface AccessorOptions {
  /** `type:` — the cardtype codename the +x child is created with. */
  readonly type?: string;
}

/** defineMod's options: the manifest fields that are not set files. */
export interface ModOptions {
  /** the mod group ("gem-card", "gem-defaults", "gem", "custom";
   *  Cardio::Mod::Dirs, dirs.rb). Omitted when not given. */
  readonly group?: string;
}

// ---------------------------------------------------------------------------
// the builder surfaces handed to each block
// ---------------------------------------------------------------------------

/** Inside `format :x do ... end`. */
export interface FormatDsl {
  /** `view :name do ... end` / `view :name, opts do ... end`. */
  view(name: string, fn: ViewFn): void;
  view(name: string, options: ViewOptions, fn: ViewFn): void;
}

/** Inside a set file (set/<pattern>/<anchor>.rb). */
export interface SetDsl extends FormatDsl {
  /** the file's set path ("type/markdown"). */
  readonly setPath: string;
  /** `format :html do ... end`; with no name, the base format. A list
   *  (`format :json, :csv do`) defines the same block on each. */
  format(body: (dsl: FormatDsl) => void): void;
  format(name: string | readonly string[], body: (dsl: FormatDsl) => void): void;
  /** `event :name, <stage>?, <opts>? do ... end`. A missing body records a
   *  declaration with an empty body (a stub whose behaviour lives in the
   *  engine or is not ported; say which at the call site). */
  event(name: string, fn?: ModEventFn): void;
  event(name: string, stage: ModEventStage, fn?: ModEventFn): void;
  event(name: string, options: EventOptions, fn?: ModEventFn): void;
  event(name: string, stage: ModEventStage, options: EventOptions, fn?: ModEventFn): void;
  /** `setting_opts ...`. */
  setting(options: ModSettingOpts): void;
  /** `card_accessor :name, type: ...` — reader and writer. */
  accessor(name: string, options?: AccessorOptions): void;
  /** `card_reader :name, ...`. */
  reader(name: string, options?: AccessorOptions): void;
  /** `card_writer :name, ...`. */
  writer(name: string, options?: AccessorOptions): void;
  /** `assign_type :type`. */
  assignType(type: string): void;
  /** `def virtual?; new?; end` — every unsaved card in this set module's
   *  chain is a KNOWN virtual card (states.rb:44-50 `known? : real? ||
   *  virtual?`), so its page renders its own views instead of the create
   *  form. card-mod-follow-0.20.0 set/right/followers.rb:22-24. */
  virtual(): void;
  /** a set-module `def content` override. */
  content(fn: ContentFn): void;
  /** a data/real.yml rule row the mod ships for this set. */
  ruleSeed(seed: { name: string; content: string }): void;
  /** `basket[:tasks][:name] = {...}`. */
  basketTask(task: ModBasketTask): void;
  /** `basket[:warnings] << :name`. */
  basketWarning(name: string): void;
}

/** Inside defineMod: the gem's top-level tree. */
export interface ModDsl {
  /** the normalized mod name ("help" for card-mod-help). */
  readonly name: string;
  /** set/<pattern>/<anchor>.rb. */
  set(path: string, body: (dsl: SetDsl) => void): void;
  /** set_pattern/<code>.rb (register options other than :index ride in
   *  the spec, as in ModPatternRegistration). */
  setPattern(code: string, spec: PatternSpec, options?: { index?: number }): void;
  /** the boot-time preparation hook (DeckoModManifest.prepareEngine). */
  prepareEngine(fn: (host: ModEngineHost) => Promise<void>): void;
}

// ---------------------------------------------------------------------------
// compilation
// ---------------------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const toList = <T>(value: T | readonly T[] | undefined): readonly T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? (value as readonly T[]) : [value as T];

/** Copy only the defined fields of `source` (so a compiled manifest carries
 *  exactly the keys a hand-written one would, with no `key: undefined`). */
function defined<T extends object>(source: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

const BASE_FORMAT = "base";

class SetFileBuilder {
  readonly file: Mutable<ModSetModuleFile>;
  private readonly formats = new Map<string, ModViewDefinition[]>();

  constructor(setPath: string) {
    this.file = { setPath };
  }

  formatViews(name: string): ModViewDefinition[] {
    let views = this.formats.get(name);
    if (views === undefined) {
      views = [];
      this.formats.set(name, views);
      const blocks: Record<string, ModFormatBlock> = { ...(this.file.formats ?? {}) };
      blocks[name] = { views };
      this.file.formats = blocks;
    }
    return views;
  }

  push<K extends keyof ModSetModuleFile>(key: K, entry: unknown): void {
    const list = (this.file[key] as unknown[] | undefined) ?? [];
    list.push(entry);
    (this.file as Record<string, unknown>)[key] = list;
  }

  formatDsl(name: string): FormatDsl {
    const views = this.formatViews(name);
    return {
      view(viewName: string, optionsOrFn: ViewOptions | ViewFn, maybeFn?: ViewFn): void {
        const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
        if (fn === undefined) {
          throw new Error(`defineMod: view :${viewName} has no body`);
        }
        const config = typeof optionsOrFn === "function" ? undefined : defined(optionsOrFn);
        views.push(
          config === undefined || Object.keys(config).length === 0
            ? { view: viewName, viewFn: fn }
            : { view: viewName, viewFn: fn, config },
        );
      },
    } as FormatDsl;
  }

  dsl(): SetDsl {
    const builder = this;
    let baseFormat: FormatDsl | undefined;
    const accessorEntry = (name: string, reader: boolean, writer: boolean, options?: AccessorOptions): void => {
      const entry: ModCardAccessor = defined({ name, reader, writer, type: options?.type });
      builder.push("cardAccessors", entry);
    };
    return {
      setPath: builder.file.setPath,
      view(name: string, optionsOrFn: ViewOptions | ViewFn, maybeFn?: ViewFn): void {
        baseFormat ??= builder.formatDsl(BASE_FORMAT);
        (baseFormat.view as (n: string, o: ViewOptions | ViewFn, f?: ViewFn) => void)(
          name,
          optionsOrFn,
          maybeFn,
        );
      },
      format(
        nameOrBody: string | readonly string[] | ((dsl: FormatDsl) => void),
        maybeBody?: (dsl: FormatDsl) => void,
      ): void {
        const names = typeof nameOrBody === "function" ? [BASE_FORMAT] : toList(nameOrBody)!;
        const body = typeof nameOrBody === "function" ? nameOrBody : maybeBody;
        if (body === undefined) throw new Error("defineMod: format block has no body");
        for (const formatName of names) body(builder.formatDsl(formatName));
      },
      event(name: string, ...rest: unknown[]): void {
        let stage: ModEventStage | undefined;
        let options: EventOptions = {};
        let fn: ModEventFn | undefined;
        for (const arg of rest) {
          if (typeof arg === "string") stage = arg as ModEventStage;
          else if (typeof arg === "function") fn = arg as ModEventFn;
          else if (arg !== undefined && arg !== null) options = arg as EventOptions;
        }
        const { engineOwned, ...opts } = options;
        if (engineOwned === true && fn !== undefined) {
          throw new Error(`defineMod: engine-owned event :${name} takes no body`);
        }
        const decl: Omit<ModEventRegistration, "fn"> = defined({
          event: name,
          at: stage,
          on: toList(opts.on),
          when: opts.when,
          changed: toList(opts.changed),
          changing: toList(opts.changing),
          skip: opts.skip,
          trigger: opts.trigger,
          after: opts.after,
          before: opts.before,
          priority: opts.priority,
        });
        builder.push("events", { ...decl, fn: fn ?? (() => undefined) });
      },
      setting(options: ModSettingOpts): void {
        if (builder.file.settingOpts !== undefined) {
          throw new Error(`defineMod: ${builder.file.setPath} already has setting_opts`);
        }
        builder.file.settingOpts = options;
      },
      accessor: (name, options) => accessorEntry(name, true, true, options),
      reader: (name, options) => accessorEntry(name, true, false, options),
      writer: (name, options) => accessorEntry(name, false, true, options),
      assignType(type: string): void {
        builder.file.assignsType = type;
      },
      virtual(): void {
        builder.file.virtual = true;
      },
      content(fn: ContentFn): void {
        builder.push("contentOverrides", fn);
      },
      ruleSeed(seed): void {
        builder.push("ruleSeeds", seed);
      },
      basketTask(task): void {
        builder.push("basketTasks", task);
      },
      basketWarning(name): void {
        builder.push("basketWarnings", name);
      },
    } as SetDsl;
  }
}

/**
 * Define a mod. `gemName` is the gem's name ("card-mod-help"); the manifest
 * carries it as gemName and its normalized form as name. A name without the
 * "card-mod-" prefix is a deck-local mod: it is its own normalized name and
 * the manifest carries no gemName.
 */
export function defineMod(gemName: string, body: (dsl: ModDsl) => void): DeckoModManifest;
export function defineMod(
  gemName: string,
  options: ModOptions,
  body: (dsl: ModDsl) => void,
): DeckoModManifest;
export function defineMod(
  gemName: string,
  optionsOrBody: ModOptions | ((dsl: ModDsl) => void),
  maybeBody?: (dsl: ModDsl) => void,
): DeckoModManifest {
  const options: ModOptions = typeof optionsOrBody === "function" ? {} : optionsOrBody;
  const body = typeof optionsOrBody === "function" ? optionsOrBody : maybeBody;
  if (body === undefined) throw new Error(`defineMod ${gemName}: no body`);

  const name = normalizeModName(gemName);
  const files: SetFileBuilder[] = [];
  const byPath = new Map<string, SetFileBuilder>();
  const patterns: ModPatternRegistration[] = [];
  let prepare: ((host: ModEngineHost) => Promise<void>) | undefined;

  body({
    name,
    set(path, setBody) {
      let builder = byPath.get(path);
      if (builder === undefined) {
        builder = new SetFileBuilder(path);
        byPath.set(path, builder);
        files.push(builder);
      }
      setBody(builder.dsl());
    },
    setPattern(code, spec, patternOptions) {
      patterns.push(
        patternOptions?.index === undefined ? { code, spec } : { code, spec, index: patternOptions.index },
      );
    },
    prepareEngine(fn) {
      if (prepare !== undefined) throw new Error(`defineMod ${gemName}: prepareEngine given twice`);
      prepare = fn;
    },
  });

  return defined({
    name,
    gemName: gemName === name ? undefined : gemName,
    group: options.group,
    setPatterns: patterns.length > 0 ? patterns : undefined,
    setModules: files.length > 0 ? files.map((f) => f.file as ModSetModuleFile) : undefined,
    prepareEngine: prepare,
  });
}
