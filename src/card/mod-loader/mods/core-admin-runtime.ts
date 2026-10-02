// The core mod's admin runtime: the ENGINE CONFIG the admin views read —
// role/config reads only, no invented behavior. Three data registries are
// transcribed byte-for-byte from the pinned gems, and one per-engine state
// is warmed by the core manifest's prepareEngine so the SYNC ViewFn bodies
// can resolve codenames and responsible roles without queries.
//
// Data provenance (every entry cites its file):
// - CORE_TASK_BASKET / CORE_WARNING_BASKET / CONFIG_TITLE — the set-module
//   baskets all/trash.rb:1-6 + self/admin.rb:1-14 initialize. The
//   INSERTION ORDER is load order (the set loader walks set/all before
//   set/self, path-sorted) and was verified against the live oracle deck
//   (probe: tests/card/mod-loader/oracle-probe-core-admin-facts.rb,
//   "basket_task_keys_in_order": [empty_trash, clear_cache,
//   regenerate_assets, ...] — the fourth, delete_upload_tmp_files, is
//   card-mod-carrierwave's own contribution, not this mod's).
// - ADMIN_CONFIG — every card-mod gem's config/admin.yml + core's own
//   (card-1.110.0 mod/core/config/admin.yml), transcribed verbatim
//   (key order = yml order; yml typos preserved, e.g. core's
//   "clear_cash").
// - MOD_SPECS — the installed gem specifications
//   (the installed gems' *.gemspec metadata), the same
//   objects Cardio::Mod::Dirs carries (dirs.rb:53-62, Bundler's
//   definition.specs). Files lists are EMPTY ARRAYS on every installed
//   card-mod gemspec (probe: date_spec.files == [] — the installed specs
//   carry no s.files), so type/mod.rb:76-79's files accordion renders an
//   empty list_group.
// - MOD_DESCRIPTION_KEYS — the `<mod>_mod_description` locale keys that
//   exist (only card-mod-format ships one:
//   card-mod-format-0.20.0 config/locales/en.yml:25
//   "format_mod_description: Format mod"); type/mod.rb:162-166 lets the
//   key win over the spec-derived default.
//
// The runtime config defaults mirror the Rails/decko defaults, not any
// one deck's choices: perform_deliveries defaults TRUE (Rails
// actionmailer; the oracle demo deck sets it false in its
// config/application.rb:19 — a deck choice), and
// allow_irreversible_admin_tasks defaults FALSE (probe:
// config_allow_irreversible_admin_tasks: false).

import { DeckoName } from "../../name.js";
import type { ModEngineHost } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// engine config (Card.config / Cardio.config reads the views make)
// ---------------------------------------------------------------------------

export interface AdminRuntimeConfig {
  /** Card.config.action_mailer.perform_deliveries (self/admin.rb:21).
   *  Rails default true; decks set it in config/application.rb. */
  performDeliveries: boolean;

  /** Cardio.config.allow_irreversible_admin_tasks (self/admin.rb:55). */
  allowIrreversibleAdminTasks: boolean;
}

const DEFAULT_ADMIN_RUNTIME_CONFIG: AdminRuntimeConfig = {
  performDeliveries: true,
  allowIrreversibleAdminTasks: false,
};

let adminRuntimeConfigState: AdminRuntimeConfig = {
  ...DEFAULT_ADMIN_RUNTIME_CONFIG,
};

/** The engine config the admin views and the task runner read. */
export function adminRuntimeConfig(): AdminRuntimeConfig {
  return adminRuntimeConfigState;
}

/** Deck-boot / test seam: set the config values a deck's
 *  config/application.rb would set. Passing {} restores nothing on its
 *  own — call resetAdminRuntimeConfig() for the defaults. */
export function setAdminRuntimeConfig(
  patch: Partial<AdminRuntimeConfig>,
): void {
  adminRuntimeConfigState = { ...adminRuntimeConfigState, ...patch };
}

/** Restore the Rails/decko defaults (test isolation). */
export function resetAdminRuntimeConfig(): void {
  adminRuntimeConfigState = { ...DEFAULT_ADMIN_RUNTIME_CONFIG };
}

// ---------------------------------------------------------------------------
// locale (mod/core config/locales/en.yml — the keys the admin views render)
// ---------------------------------------------------------------------------

/** The core mod's admin locale strings, transcribed verbatim from
 *  card-1.110.0 mod/core/config/locales/en.yml (lines 30-41). Inline
 *  constants rather than i18n-state: the established mod-port convention
 *  (card-mod-account.ts's en.yml literals) keeps the render path
 *  deterministic without locale-load ordering. */
export const CORE_ADMIN_LOCALE = {
  core_task_empty_trash_link_text: "Empty Trash",
  core_task_empty_trash_description: "Empty Trash!",
  core_task_clear_cache_link_text: "Clear Cache",
  core_task_clear_cache_description: "Clear Cache!",
  core_task_regenerate_assets_link_text: "Regenerate Assets",
  core_task_regenerate_assets_description: "Regen!",
  // mm-cstructural (2026-09-30): the 4th basket task
  // (delete_upload_tmp_files, mod: carrierwave) rendered
  // "Translation missing: en.carrierwave_task_delete_upload_tmp_files_link_text"
  // on the `mod: carrierwave` page where the oracle shows the gem's string.
  // card-mod-carrierwave-0.20.0 config/locales/en.yml:18-19. Its
  // sibling `carrierwave_task_move_files_*` keys are COMMENTED OUT in that
  // file (en.yml:14-15) and the task is not in the basket, so they stay out.
  carrierwave_task_delete_upload_tmp_files_link_text: "Delete upload tmp files",
  carrierwave_task_delete_upload_tmp_files_description: "Delete upload tmp files!",
  core_admin_warn: "Administrator Warning",
  core_admin_email_off:
    "Email delivery is turned off. Change settings in %{path} to send sign up notifications.",
} as const;

// ---------------------------------------------------------------------------
// the baskets (all/trash.rb + self/admin.rb load-time registrations)
// ---------------------------------------------------------------------------

/** One basket task (self/admin.rb:3-12 shape). `executePolicy` is the
 *  execute_policy lambda's port; the three core policies need runtime the
 *  headless engine does not hold (see core-mod.ts's remainder notes), so
 *  they are declared with their Ruby provenance and no-op bodies — the
 *  runner's GATING is the ported, tested half. */
export interface AdminTaskConfig {
  mod: string;
  irreversible?: boolean;
  executePolicy?: () => void;
  /** The task-table strings a BASKET CONTRIBUTION carries (the locale pair
   *  lives in the contributing mod's own en.yml — card-mod-carrierwave's
   *  delete_upload_tmp_files — which CORE_ADMIN_LOCALE does not hold).
   *  Undefined on the core basket's entries: taskRowHtml falls back to the
   *  CORE_ADMIN_LOCALE lookup. */
  linkText?: string;
  description?: string;
}

export const CORE_TASK_BASKET: Record<string, AdminTaskConfig> = {
  // all/trash.rb:1-6 — loads FIRST (set/all before set/self, path-sorted;
  // probe basket_task_keys_in_order[0])
  empty_trash: {
    mod: "core",
    irreversible: true,
    // execute_policy: -> { Cardio::Utils.empty_trash } — the write path
    // (trash-row deletion) is a named remainder.
    executePolicy: () => undefined,
  },
  // self/admin.rb:4-7
  clear_cache: {
    mod: "core",
    // execute_policy: -> { Card::Cache.reset_all } — the engine's caches
    // are per-engine instances the ModEngineHost surface does not expose;
    // a named remainder.
    executePolicy: () => undefined,
  },
  // self/admin.rb:8-11
  regenerate_assets: {
    mod: "core",
    // execute_policy: -> { Card::Assets.refresh force: true } — the assets
    // pipeline surface; a named remainder.
    executePolicy: () => undefined,
  },
  // card-mod-carrierwave set/self/admin.rb — basket[:tasks]
  // [:delete_upload_tmp_files]. The bar-slots lane (2026-09-29, view-fail
  // class Z3) landed the REGISTRATION only: the oracle pins the task's
  // EXISTENCE through the mod bar_right section list ("tasks, cardtypes,
  // scripts, styles") and its name/title/description through the page-lane
  // capture (expected-v2/page-lane shard-000039, mod: carrierwave :open:
  // task-table row "Delete upload tmp files" / "Delete upload tmp files!").
  // The EXECUTION stays a named remainder — a cron-style scheduled task
  // (the same AGENTS.md gate the carrierwave port note cites); like the
  // three core tasks above, execute_policy is a no-op placeholder.
  delete_upload_tmp_files: {
    mod: "carrierwave",
    executePolicy: () => undefined,
  },
};

/** self/admin.rb:14 `basket[:warnings] = [:no_email_delivery]`. The
 *  recaptcha_config_issues warning (probe basket_warnings[1]) is
 *  card-mod-recaptcha's own basket contribution. */
export const CORE_WARNING_BASKET = ["no_email_delivery"] as const;

/** all/admin.rb:2-5 `basket[:config_title]` — AdminItem#title's lookup
 *  (mod/core/lib/admin_item.rb:16-23: basket hit, else capitalize). */
export const CONFIG_TITLE: Record<string, string> = {
  basic: "Basic configuration",
  editor: "Editor configuration",
};

/** AdminItem#title (admin_item.rb:16-23). */
export function adminItemTitle(category: string, subcategory?: string): string {
  const key = (subcategory ?? category).toString();
  return CONFIG_TITLE[key] ?? capitalize(key);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// ADMIN_CONFIG — every mod's config/admin.yml, verbatim
// ---------------------------------------------------------------------------

/** The parsed admin.yml shape (type/mod.rb:201-209 loads the same YAML). */
export type AdminConfigValue = string;
export interface AdminConfig {
  [category: string]:
    | AdminConfigValue[]
    | { [subcategory: string]: AdminConfigValue[] };
}

/** Every card-mod gem's config/admin.yml + core's own, keyed by MODNAME
 *  (type/mod.rb:168-170 modname: codename minus the "mod_" prefix).
 *  Mods without a config/admin.yml (markdown, rules, tabs, virtual,
 *  api_key, assets, collection, comment, delayed_job) have no entry —
 *  admin_config_exists? answers false for them exactly as the gem tree
 *  does. Key order = each yml's key order. */
export const ADMIN_CONFIG: Record<string, AdminConfig> = {
  // card-1.110.0 mod/core/config/admin.yml
  core: {
    cardtypes: { admin: ["mod", "user", "setting", "cardtype"] },
    // the yml's "clear_cash" typo is verbatim (the BASKET task is
    // clear_cache; this yml list feeds the admin-item surface only)
    tasks: ["empty_trash", "clear_cash", "regenerate_assets"],
  },
  // card-mod-account-0.20.0/config/admin.yml
  account: { cardtypes: { admin: ["role", "signup"] } },
  // card-mod-ace_editor-0.20.0/config/admin.yml
  ace_editor: { configurations: { editor: ["ace"] } },
  // card-mod-bar_and_box-0.20.0/config/admin.yml
  bar_and_box: {
    views: ["box", "bar", "mini_bar", "closed", "open", "one_line_content"],
  },
  // card-mod-bootstrap-0.20.0/config/admin.yml
  bootstrap: {
    cardtypes: { styling: ["bootswatch_skin"] },
    views: ["carousel"],
  },
  // card-mod-carrierwave-0.20.0/config/admin.yml
  carrierwave: { cardtypes: { upload: ["file", "image"] } },
  // card-mod-content-0.20.0/config/admin.yml
  content: { settings: ["structure", "default"] },
  // card-mod-date-0.20.0/config/admin.yml
  date: { cardtypes: { data: ["date"] } },
  // card-mod-defaults-0.20.0/config/admin.yml
  defaults: {
    configurations: { basic: ["home", "main_menu", "getting_started_links"] },
  },
  // card-mod-edit-0.20.0/config/admin.yml
  edit: {
    settings: ["input_type"],
    views: ["edit_form", "edit_inline", "edit_name", "edit_type", "board"],
  },
  // card-mod-email-0.20.0/config/admin.yml
  email: { cardtypes: { template: ["email_template"] } },
  // card-mod-follow-0.20.0/config/admin.yml
  follow: {
    settings: ["follow_fields", "follow"],
    cardtypes: { template: ["notification_template"] },
  },
  // card-mod-format-0.20.0/config/admin.yml
  format: {
    configurations: { basic: ["title", "head", "credit"] },
    cardtypes: {
      text: ["basic", "plain_text", "html", "phrase"],
      scripting: ["json"],
      data: ["number", "toggle", "uri"],
    },
    views: [
      "name",
      "link",
      "url_link",
      "content",
      "short_content",
      "core",
      "raw",
      "titled",
      "labeled",
      "smart_label",
      "title",
      "title_link",
    ],
  },
  // card-mod-help-0.20.0/config/admin.yml
  help: { settings: ["help", "guide"], views: ["help", "guide", "lead"] },
  // card-mod-history-0.20.0/config/admin.yml
  history: { views: ["creator_credit", "updated_by"] },
  // card-mod-integrate-0.20.0/config/admin.yml
  integrate: { settings: ["on_create", "on_update", "on_delete"] },
  // card-mod-layout-0.20.0/config/admin.yml
  layout: {
    settings: ["layout", "head"],
    cardtypes: { styling: ["layout_type"] },
    // mm-cstructural (2026-09-30): the `views` category was dropped from
    // this transcription, so the `mod: layout` page rendered its Views
    // section as "Depends on" (the section list ran description →
    // … → depends_on with views absent, per type/mod.rb:7-19's predicate
    // list). card-mod-layout-0.20.0 config/admin.yml:6-7 `views: [modal_link]`.
    views: ["modal_link"],
  },
  // card-mod-list-0.20.0/config/admin.yml
  list: {
    settings: ["content_options", "content_option_view"],
    cardtypes: { organize: ["list", "pointer", "nest_list", "link_list"] },
  },
  // card-mod-permissions-0.20.0/config/admin.yml
  permissions: { settings: ["create", "read", "update", "delete"] },
  // card-mod-recaptcha-0.20.0/config/admin.yml
  recaptcha: {
    configurations: { basic: ["recaptcha_settings"] },
    settings: ["captcha"],
  },
  // card-mod-script-0.20.0/config/admin.yml
  script: {
    settings: ["script"],
    cardtypes: {
      scripting: ["java_script", "coffee_script"],
      assets: [
        "local_script_folder_group",
        "local_script_manifest_group",
      ],
    },
  },
  // card-mod-search-0.20.0/config/admin.yml
  search: { settings: ["script"], cardtypes: { organize: ["search_type"] } },
  // card-mod-session-0.20.0/config/admin.yml
  session: { cardtypes: { admin: ["session"] } },
  // card-mod-style-0.20.0/config/admin.yml
  style: {
    settings: ["style"],
    cardtypes: {
      assets: ["local_style_folder_group", "local_style_manifest_group"],
      styling: ["css", "scss", "skin"],
    },
  },
  // card-mod-tinymce_editor-0.20.0/config/admin.yml (the yml's bare-symbol
  // scalar `:tiny_mce`)
  tinymce_editor: { configurations: { editor: ["tiny_mce"] } },
};

// ---------------------------------------------------------------------------
// MOD_SPECS — the installed gem specifications, verbatim
// ---------------------------------------------------------------------------

/** The Gem::Specification surface the views read (type/mod.rb:67-83,
 *  162-166). authors/email render through Ruby's Array#to_s (inspect
 *  brackets) — the VIEW composes that; here they stay arrays. files is []
 *  for every installed card-mod gemspec (probe date_spec.files). */
export interface ModSpec {
  gem: string;
  version: string;
  summary: string;
  description: string;
  deps: string[];
}

/** The properties shared by every card-mod gemspec (all 33 carry the same
 *  authors/email/homepage — spot-checked across the specifications dir). */
export const MOD_SPEC_SHARED = {
  authors: ["Ethan McCutchen", "Philipp Kühl", "Gerry Gleason"],
  email: ["info@decko.org"],
  homepage: "https://decko.org",
  files: [] as string[],
};

/** card-1.110.0's own specification — the CORE mod's spec is the card
 *  gem's, but Cardio::Mod.fetch("core").spec answers nil on the oracle
 *  (probe-2 mod_core_fetch.spec_nil: true — Dirs gives the core mod no
 *  Bundler spec), so type/mod.rb's spec-backed views render nothing for
 *  mod: core. Kept here for provenance; NOT served as core's spec. */
export const CARD_GEM_SPEC = {
  gem: "card",
  version: "1.110.0",
  summary: "a simple engine for emergent data structures",
  description:
    'Cards are wiki-inspired data atoms.Card "Sharks" use links, nests, types, patterned names, queries, views, events, and rules to create rich structures.',
  deps: [] as string[],
};

/** Per-mod specs keyed by MODNAME. deps are the gem names
 *  (Gem::Specification#dependencies' runtime entries). */
export const MOD_SPECS: Record<string, ModSpec> = {
  account: {
    gem: "card-mod-account",
    version: "0.20.0",
    summary: "Email-based account handling for decko cards",
    description: "",
    deps: ["card", "card-mod-email", "card-mod-permissions", "card-mod-list", "card-mod-integrate", "card-mod-edit"],
  },
  ace_editor: {
    gem: "card-mod-ace_editor",
    version: "0.20.0",
    summary: "Ace editor",
    description: "",
    deps: ["card", "card-mod-edit", "card-mod-script"],
  },
  api_key: {
    gem: "card-mod-api_key",
    version: "0.20.0",
    summary: "API Keys and JWT Tokens for Decko",
    description: "",
    deps: ["card", "card-mod-account"],
  },
  assets: {
    gem: "card-mod-assets",
    version: "0.20.0",
    summary: "decko asset pipeline",
    description: "",
    deps: ["card", "execjs", "card-mod-virtual", "card-mod-format", "card-mod-list", "card-mod-carrierwave", "card-mod-content"],
  },
  bar_and_box: {
    gem: "card-mod-bar_and_box",
    version: "0.20.0",
    summary: "bar and box views",
    description: "",
    deps: ["card", "card-mod-style"],
  },
  bootstrap: {
    gem: "card-mod-bootstrap",
    version: "0.20.0",
    summary: "Bootstrap",
    description: "",
    deps: ["card", "card-mod-edit", "card-mod-bar_and_box", "card-mod-style", "card-mod-script"],
  },
  carrierwave: {
    gem: "card-mod-carrierwave",
    version: "0.20.0",
    summary: "File and Image handling",
    description: "",
    deps: ["card", "carrierwave", "mini_magick", "ssrf_filter", "marcel", "card-mod-history", "card-mod-permissions"],
  },
  collection: {
    gem: "card-mod-collection",
    version: "0.20.0",
    summary: "collection (list and search)",
    description: "",
    deps: ["card"],
  },
  comment: {
    gem: "card-mod-comment",
    version: "0.20.0",
    summary: "card comments",
    description: "",
    deps: ["card", "card-mod-permissions"],
  },
  content: {
    gem: "card-mod-content",
    version: "0.20.0",
    summary: "card content handling",
    description: "",
    deps: ["card"],
  },
  date: {
    gem: "card-mod-date",
    version: "0.20.0",
    summary: "Calendar editor",
    description: "",
    deps: ["card"],
  },
  defaults: {
    gem: "card-mod-defaults",
    version: "0.20.0",
    summary: "Default decko mods",
    description: "",
    deps: [
      "card", "card-mod-account", "card-mod-ace_editor", "card-mod-api_key",
      "card-mod-assets", "card-mod-bar_and_box", "card-mod-bootstrap",
      "card-mod-carrierwave", "card-mod-comment", "card-mod-date",
      "card-mod-delayed_job", "card-mod-follow", "card-mod-help",
      "card-mod-history", "card-mod-integrate", "card-mod-layout",
      "card-mod-list", "card-mod-markdown", "card-mod-permissions",
      "card-mod-recaptcha", "card-mod-rules", "card-mod-search",
      "card-mod-tabs", "card-mod-tinymce_editor",
    ],
  },
  delayed_job: {
    gem: "card-mod-delayed_job",
    version: "0.20.0",
    summary: "Background processing with Delayed Job",
    description: "",
    deps: ["card", "daemons", "delayed_job_active_record", "delayed_job_web"],
  },
  edit: {
    gem: "card-mod-edit",
    version: "0.20.0",
    summary: "Edit handling",
    description: "",
    deps: ["card", "card-mod-rules", "card-mod-list"],
  },
  email: {
    gem: "card-mod-email",
    version: "0.20.0",
    summary: "Email handling",
    description: "",
    deps: ["card", "card-mod-search", "card-mod-list", "card-mod-permissions"],
  },
  follow: {
    gem: "card-mod-follow",
    version: "0.20.0",
    summary: "follower notifications",
    description: "",
    deps: ["card", "card-mod-carrierwave"],
  },
  format: {
    gem: "card-mod-format",
    version: "0.20.0",
    summary: "format",
    description: "",
    deps: ["card", "card-mod-content"],
  },
  help: {
    gem: "card-mod-help",
    version: "0.20.0",
    summary: "card help text and guides",
    description: "",
    deps: ["card", "card-mod-markdown", "card-mod-permissions"],
  },
  history: {
    gem: "card-mod-history",
    version: "0.20.0",
    summary: "Revision histories in acts, actions, and changes",
    description: "",
    deps: ["card"],
  },
  integrate: {
    gem: "card-mod-integrate",
    version: "0.20.0",
    summary: "card configurable integration events",
    description: "",
    deps: ["card", "card-mod-rules"],
  },
  layout: {
    gem: "card-mod-layout",
    version: "0.20.0",
    summary: "decko layouts",
    description: "",
    deps: ["card", "card-mod-account", "card-mod-session", "card-mod-tabs"],
  },
  list: {
    gem: "card-mod-list",
    version: "0.20.0",
    summary: "list of cards",
    description: "",
    deps: ["card", "card-mod-format", "card-mod-collection"],
  },
  markdown: {
    gem: "card-mod-markdown",
    version: "0.20.0",
    summary: "markdown support for decko",
    description: "use markdown in decko card content",
    deps: ["card", "kramdown", "kramdown-syntax-coderay"],
  },
  permissions: {
    gem: "card-mod-permissions",
    version: "0.20.0",
    summary: "decko permissions",
    description: "",
    deps: ["card"],
  },
  recaptcha: {
    gem: "card-mod-recaptcha",
    version: "0.20.0",
    summary: "recaptcha support for decko",
    description: "",
    deps: ["card", "recaptcha"],
  },
  rules: {
    gem: "card-mod-rules",
    version: "0.20.0",
    summary: "rules",
    description: "",
    deps: ["card", "card-mod-format", "card-mod-search"],
  },
  script: {
    gem: "card-mod-script",
    version: "0.20.0",
    summary: "JavaScript, CoffeeScript, etc.",
    description: "",
    deps: ["card", "card-mod-assets", "card-mod-list"],
  },
  search: {
    gem: "card-mod-search",
    version: "0.20.0",
    summary: "search",
    description: "",
    deps: ["card", "card-mod-collection", "card-mod-format", "card-mod-help"],
  },
  session: {
    gem: "card-mod-session",
    version: "0.20.0",
    summary: "session",
    description: "",
    deps: ["card", "card-mod-list"],
  },
  style: {
    gem: "card-mod-style",
    version: "0.20.0",
    summary: "Skins, CSS, SCSS, etc",
    description: "",
    deps: ["card", "card-mod-assets", "card-mod-list"],
  },
  tabs: {
    gem: "card-mod-tabs",
    version: "0.20.0",
    summary: "tabs",
    description: "",
    deps: ["card", "card-mod-bootstrap"],
  },
  tinymce_editor: {
    gem: "card-mod-tinymce_editor",
    version: "0.20.0",
    summary: "TinyMCE editor",
    description: "",
    deps: ["card", "card-mod-edit"],
  },
  virtual: {
    gem: "card-mod-virtual",
    version: "0.20.0",
    summary: "virtual",
    description: "",
    deps: ["card"],
  },
};

/** The `<mod>_mod_description` locale keys that exist. Only
 *  card-mod-format ships one (card-mod-format-0.20.0
 *  config/locales/en.yml:25). type/mod.rb:162-166 renders
 *  t("#{modname}_mod_description", default: spec_default) — the key wins. */
export const MOD_DESCRIPTION_KEYS: Record<string, string> = {
  format: "Format mod",
};

/** type/mod.rb:162-166 description: the locale key, else the spec default
 *  (description when present, else summary), else nil (probe-2:
 *  mod_core_description is null for the spec-less core mod). */
export function modDescription(modname: string): string | undefined {
  const localeKey = MOD_DESCRIPTION_KEYS[modname];
  if (localeKey !== undefined) return localeKey;
  const spec = MOD_SPECS[modname];
  if (spec === undefined) return undefined;
  if (spec.description.length > 0) return spec.description;
  return spec.summary;
}

// ---------------------------------------------------------------------------
// set/type/mod.rb view :bar_right — the mod bar-right section list.
// Landed by the bar-slots lane 2026-09-29 (view-fail class Z3: 30 oracle
// entries — every `mod: X :closed` bar rendered an EMPTY bar-right where
// the oracle shows the mod's section list).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The mod asset GROUPS — the deck-side
// truth behind both the bar_right scripts/styles presence and the Mod page's
// `<h3>Styles</h3>` / `<h3>Scripts</h3>` sections.
// ---------------------------------------------------------------------------

/** One `Abstract::ModAssets` group: the group title and its item names.
 *  `group: remote` carries URL strings; a local-manifest group carries the
 *  input item NAMES; `group: local` (the folder_group_card branch,
 *  mod_assets.rb:22-27) carries the folder's file basenames. */
export type ModAssetGroup = readonly [title: string, items: readonly string[]];

/** The per-mod asset groups, ORACLE-PINNED.
 *
 *  MECHANISM, fully citable:
 *  - card-mod-style-0.20.0 set/type_plus_right/mod/style.rb:5 and
 *    card-mod-script-0.20.0 set/type_plus_right/mod/script.rb:3 both
 *    `include_set Abstract::ModAssets`, so a Mod card's `+*style` /
 *    `+*script` child gets ModAssets' `:core` (mod_assets.rb:171-182) —
 *    the group_list haml — NOT the pointer-list core a bare List-typed
 *    child would render. That is why the oracle's Styles section is
 *    `<p><h3>Styles</h3><p><h5>group: local</h5><ul class="list-group">…`
 *    and not a card-list. (Before the mm-cstructural fix the engine
 *    resolved the child as a Settings pointer list and rendered
 *    `<div class="card-list card-list-bar pointer-list"></div>`.)
 *  - the child is fetched VIRTUAL — card-mod-assets set/type/mod.rb:14
 *    `Card.fetch [name, asset_type], new: { type: :list }` — so its content
 *    is the mod gem's `assets/<subpath>` tree, not a DB row. The raw corpus
 *    has ZERO rows named `mod: X+*style` / `+*script` (measured: 0 children
 *    under `mod: account`).
 *  - a headless engine has no gem filesystem, so the groups are
 *    transcribed from the DECK'S OWN RENDERED TRUTH — the `<h3>Styles</h3>`
 *    / `<h3>Scripts</h3>` sections of the 28 `mod: *` page rows in the
 *    pass-15 page-lane yardstick — the same oracle-pinned-table pattern as
 *    MOD_BAR_RIGHT_ASSETS below, and the same "expectation = the oracle
 *    bytes, never the reverse" rule the bootswatch lane applied.
 *  - CROSS-CHECK: every group is reproduced by the installed gem trees'
 *    assets directories (gems/card-mod-<name>-0.20.0/assets). Folder
 *    groups are the folder's files (account: style/account.scss +
 *    script/toggle_visibility.js.coffee); manifest groups are the yml keys
 *    with `remote:` first (mod_assets.rb:174-175 pushes the remote group
 *    before the manifest groups), and the `../../vendor/…` manifest paths
 *    resolve to their basenames, which is what the capture shows
 *    (bootstrap styles: `_colorpicker.scss`, `select2.css`, …).
 *
 *  KEY FORM (mm-cstructural, 2026-09-30 — a real bug this lane fixed): every
 *  key in this table, and in MOD_BAR_RIGHT_ASSETS below, is the CODENAME
 *  stem — what `codename.to_s.gsub(/^mod_/, "")` yields (type/mod.rb:168-170),
 *  i.e. `ace_editor`, `api_key`, `bar_and_box`, `tinymce_editor` — NOT the
 *  card's DISPLAY name (`ace editor`, `api key`, `bar and box`). Both tables
 *  were originally keyed by display name, so those four mods resolved to
 *  undefined on every lookup: measured on the `mod: defaults` page, the
 *  nested `mod: ace editor` / `api key` / `bar and box` bars rendered an
 *  EMPTY bar-right where the oracle shows `configurations, scripts` /
 *  `styles` / `scripts, styles` (pass-15 dump, 3 of the 26 bar-right rows
 *  on that one page), and their own pages dropped the Styles/Scripts
 *  sections. The other 29 mods are unaffected — no other gem stem contains
 *  an underscore or a space. */
const MOD_ASSET_GROUPS_SRC: Readonly<
  Record<string, { styles?: ModAssetGroup[]; scripts?: ModAssetGroup[] }>
> = {
  account: {
    styles: [["group: local", ["account.scss"]]],
    scripts: [["group: local", ["toggle_visibility.js.coffee"]]],
  },
  ace_editor: {
    scripts: [
      ["group: remote", ["https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js"]],
      ["group: ace_config", ["decko_ace_config.js.coffee"]],
    ],
  },
  api_key: { styles: [["group: local", ["api_key_style.scss"]]] },
  bar_and_box: {
    styles: [["group: local", ["bar.scss", "box.scss", "image_box.scss"]]],
    scripts: [["group: local", ["bar_and_box.js.coffee", "click_select.js.coffee"]]],
  },
  bootstrap: {
    styles: [
      ["group: remote", ["https://fonts.googleapis.com/css2?family=Material+Icons"]],
      ["group: bootstrap_decko", ["decko_bootstrap.scss"]],
      [
        "group: libraries",
        ["bootstrap-icons.css", "bootstrap_colorpicker.scss", "_colorpicker.scss"],
      ],
      [
        "group: select2",
        [
          "select2.css",
          "_variables.scss",
          "_layout.scss",
          "_dropdown.scss",
          "_single.scss",
          "_multiple.scss",
          "_disabled.scss",
          "_input-group.scss",
          "_validation.scss",
          "_sizing.scss",
        ],
      ],
    ],
    scripts: [
      [
        "group: remote",
        [
          "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js",
          "https://kit.fontawesome.com/1366963381.js",
        ],
      ],
      [
        "group: bootstrap",
        [
          "bootstrap.bundle.js",
          "decko_modal.js.coffee",
          "decko_popover.js.coffee",
          "script_load_select2.js.coffee",
          "bootstrap-colorpicker.min.js",
          "script_colorpicker.js.coffee",
        ],
      ],
    ],
  },
  carrierwave: {
    styles: [["group: local", ["file.scss"]]],
    scripts: [["group: local", ["upload.js.coffee"]]],
  },
  comment: { styles: [["group: local", ["comments.scss"]]] },
  edit: {
    styles: [["group: local", ["board.scss", "edit.scss"]]],
    scripts: [
      [
        "group: local",
        [
          "autosave.js.coffee",
          "board.js.coffee",
          "components.js.coffee",
          "doubleclick.js.coffee",
          "editor.js.coffee",
          "name_editor.js.coffee",
          "tooltip.js.coffee",
          "type_editor.js.coffee",
        ],
      ],
    ],
  },
  follow: {
    styles: [["group: local", ["follow.scss"]]],
    scripts: [["group: local", ["follow.js.coffee"]]],
  },
  format: {
    styles: [
      [
        "group: local",
        [
          "common.scss",
          "logo_and_credit.scss",
          "menu.scss",
          "messaging.scss",
          "misc.scss",
          "open_and_closed.scss",
        ],
      ],
    ],
    scripts: [
      [
        "group: remote",
        [
          "https://code.jquery.com/jquery-3.5.1.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js",
        ],
      ],
      [
        "group: jquery",
        [
          "jquery-ui.min.js",
          "jquery.ui.autocomplete.html.js",
          "jquery.autosize.js",
          "jquery.fileupload.js",
          "jquery.iframe-transport.js",
        ],
      ],
      [
        "group: decko",
        [
          "decko.js.coffee",
          "decko_jquery.js.coffee",
          "slot.js.coffee",
          "slotter.js.coffee",
          "slot_ready.js.coffee",
          "clicks_and_hovers.js.coffee",
        ],
      ],
    ],
  },
  help: { styles: [["group: local", ["help.scss"]]] },
  history: { styles: [["group: local", ["history.scss"]]] },
  layout: {
    styles: [["group: local", ["layout.scss", "modal.scss", "overlay.scss"]]],
    scripts: [["group: local", ["layout.js.coffee", "modal.js.coffee", "overlay.js.coffee"]]],
  },
  list: {
    styles: [["group: local", ["list.scss"]]],
    scripts: [["group: local", ["pointer_config.js.coffee", "pointer_list_editor.js.coffee"]]],
  },
  permissions: { styles: [["group: local", ["permissions.scss"]]] },
  recaptcha: { scripts: [["group: local", ["recaptcha.js.coffee"]]] },
  rules: {
    styles: [["group: local", ["rules.scss"]]],
    scripts: [["group: local", ["rules.js.coffee"]]],
  },
  search: {
    styles: [["group: local", ["search.scss"]]],
    scripts: [["group: local", ["autocomplete.js.coffee", "search_box.js.coffee"]]],
  },
  style: {
    styles: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],
  },
  tabs: { scripts: [["group: local", ["tab.js.coffee"]]] },
};

/** The mod's asset groups for one subpath ("style" | "script"), or
 *  undefined when the mod ships no such directory (the Ruby
 *  `styles?` / `scripts?` predicates, type/mod.rb:110-116: `fetch(:style)
 *  .present?`). */
export function modAssetGroups(
  modname: string,
  subpath: "style" | "script",
): readonly ModAssetGroup[] | undefined {
  return subpath === "style"
    ? MOD_ASSET_GROUPS_SRC[modname]?.styles
    : MOD_ASSET_GROUPS_SRC[modname]?.scripts;
}

/** Folder-group entries the CHILD pages (mod: X+*style / mod: X+*script,
 *  the Abstract::ModAssets cards — card-mod-style set/type_plus_right/mod/
 *  style.rb + card-mod-script set/type_plus_right/mod/script.rb, both
 *  include_set Abstract::ModAssets) render but the PARENT table above
 *  never carried: the parent's Styles/Scripts sections are the Z3-pinned
 *  section list, which shows NEITHER for tinymce_editor even though its
 *  assets/script + assets/style folders hold a group's files each
 *  (mod_assets.rb:20-27 folder_group_card — no manifest.yml, so the single
 *  folder group "local" lists the directory alphabetically; verified
 *  against the installed gem tree, 8 script files + nest_editor.scss).
 *  transcribed from the captured child page bytes, which list the child
 *  folder groups and no parent group. */
const MOD_CHILD_ASSET_GROUPS_SRC: Readonly<
  Record<string, readonly ModAssetGroup[]>
> = {
  "tinymce_editor/script": [
    [
      "group: local",
      [
        "image_editor.js.coffee",
        "link_editor.js.coffee",
        "nest_editor.js.coffee",
        "nest_editor_name.js.coffee",
        "nest_editor_options.js.coffee",
        "nest_editor_rules.js.coffee",
        "script_tinymce.js",
        "tinymce_config.js.coffee",
      ],
    ],
  ],
  "tinymce_editor/style": [["group: local", ["nest_editor.scss"]]],
};

/** The Abstract::ModAssets child card's groups for one mod stem + subpath:
 *  the parent-section table first (the same manifest truth mm-cstructural
 *  pinned — the child core and the parent section render the SAME
 *  group_list bytes), then the child-only folder-group supplement. A mod
 *  in neither table (e.g. shades, whose gem ships no assets/ directory at
 *  all) returns undefined -> the child core is the empty group_list, the
 *  oracle's empty card-content (page 49309 mod: shades+*script). */
export function modChildAssetGroups(
  modname: string,
  subpath: "style" | "script",
): readonly ModAssetGroup[] | undefined {
  const parent = modAssetGroups(modname, subpath);
  if (parent !== undefined) return parent;
  return MOD_CHILD_ASSET_GROUPS_SRC[`${modname}/${subpath}`];
}

/** The per-mod scripts/styles presence for the bar_right section list.
 *
 *  The Ruby surface behind the scripts/styles sections is the mod gem's
 *  FILE TREE (Card::Mod's script/style directories — the `mod: X+*script`
 *  and `mod: X+*style` children are directory-backed manifest cards, not
 *  stored rows: the bench deck has ZERO rows with those names; the
 *  page-lane capture pins their folder-group cores, e.g. carrierwave's
 *  "group: local / upload.js.coffee" and "file.scss"). The headless port
 *  has no gem tree to walk, so this table is the ORACLE-PINNED presence
 *  set, transcribed verbatim from the deck's own script/style cardtype
 *  default-content templates (bench-corpus-raw nameless template rows id
 *  20616 = the 16 script mods, id 33922 = the 18 style mods — the same
 *  directory truth the deck itself pins) and cross-checked against all
 *  30 Z3 dump rows: every mod's section list below reproduces the oracle
 *  bar_right string exactly.
 *
 *  mm-cstructural: MOD_ASSET_GROUPS above is the SAME truth with the
 *  contents, so the presence set is derived from it and a mod absent from
 *  that table has no scripts/styles section. `tinymce_editor` and `shades`
 *  keep their explicit flags — neither ships a Styles/Scripts section on
 *  any captured mod page, so their bar_right presence is pinned by the 30
 *  Z3 rows alone. */
const MOD_BAR_RIGHT_ASSETS: Readonly<Record<string, { scripts?: boolean; styles?: boolean }>> = {
  account: { scripts: true, styles: true },
  ace_editor: { scripts: true },
  api_key: { styles: true },
  bar_and_box: { scripts: true, styles: true },
  bootstrap: { scripts: true, styles: true },
  carrierwave: { scripts: true, styles: true },
  comment: { styles: true },
  content: {},
  core: {},
  date: {},
  defaults: {},
  edit: { scripts: true, styles: true },
  email: {},
  follow: { scripts: true, styles: true },
  format: { scripts: true, styles: true },
  help: { styles: true },
  history: { styles: true },
  integrate: {},
  layout: { scripts: true, styles: true },
  list: { scripts: true, styles: true },
  permissions: { styles: true },
  recaptcha: { scripts: true },
  rules: { scripts: true, styles: true },
  script: {},
  search: { scripts: true, styles: true },
  session: {},
  shades: { scripts: true },
  style: { styles: true },
  tabs: { scripts: true },
  tinymce_editor: { scripts: true, styles: true },
};

/** type/mod.rb view :bar_right's section list — the mod's present
 *  sections, comma-joined. Oracle-pinned order over all 30 dump rows
 *  (the only total order the 30 strings admit): tasks < settings <
 *  configurations < cardtypes < scripts < styles. recaptcha ("settings,
 *  configurations, scripts") pins settings before configurations; format
 *  pins configurations before cardtypes; carrierwave/core pin tasks
 *  before cardtypes. Section predicates: tasks = the mod's basket tasks
 *  (core's three + carrierwave's delete_upload_tmp_files, see
 *  CORE_TASK_BASKET); settings/configurations/cardtypes = the mod's
 *  config/admin.yml lists (ADMIN_CONFIG — their presence matches the
 *  oracle on all 30 mods); scripts/styles = MOD_BAR_RIGHT_ASSETS. */
export function modBarRightSections(modname: string): string {
  const config = ADMIN_CONFIG[modname];
  const assets = MOD_BAR_RIGHT_ASSETS[modname] ?? {};
  const sections: string[] = [];
  if (Object.values(CORE_TASK_BASKET).some((t) => t.mod === modname)) sections.push("tasks");
  if (config?.settings !== undefined) sections.push("settings");
  if (config?.configurations !== undefined) sections.push("configurations");
  if (config?.cardtypes !== undefined) sections.push("cardtypes");
  if (assets.scripts === true) sections.push("scripts");
  if (assets.styles === true) sections.push("styles");
  return sections.join(", ");
}

// ---------------------------------------------------------------------------
// per-engine state (the prepareEngine warm + the sync lookups)
// ---------------------------------------------------------------------------

/** One warmed engine's admin runtime state. Everything here is a
 *  role/config READ over the deck's own rows — the port of Ruby's
 *  process-global caches (Card[code], the rule cache) for the sync
 *  ViewFn surface. */
export interface AdminRuntimeState {
  /** codename -> the codename card's NAME (Ruby Card[code] resolution). */
  readonly codenameToName: Map<string, string>;
  /** codename card codename -> its responsible-role codenames
   *  (all/admin.rb:36-38 responsible_role: the *update rule walk's item
   *  cards' codenames). */
  readonly rolesByCardCodename: Map<string, string[]>;
  /** The deck's mod cards (type Mod), name-sorted — the
   *  mod_cards_with_config iteration universe (all/admin.rb:19-21). */
  readonly modCards: Array<{ name: string; codename: string }>;
}

const runtimeStates = new WeakMap<ModEngineHost, AdminRuntimeState>();

/** The warmed state for one engine (undefined before prepareEngine ran). */
export function adminRuntimeState(
  host: ModEngineHost,
): AdminRuntimeState | undefined {
  return runtimeStates.get(host);
}

interface BatchRows {
  rows: Array<Record<string, unknown>>;
}

function rowsOf(results: unknown[], index: number): Array<Record<string, unknown>> {
  const entry = results[index] as BatchRows | undefined;
  return entry?.rows ?? [];
}

/**
 * The core manifest's prepareEngine: three batched reads, once per engine.
 *
 * 1. Every codename card into the sync render cache (the Card[code] warm:
 *    cards.codename IS NOT NULL), building codenameToName.
 * 2. Every mod card (type Mod) into the sync render cache, building the
 *    modCards list in DECK order (no sort — see the comment at the query)
 *    with each card's stored codename.
 * 3. The *update rule walk per codename card — all/admin.rb:32-38
 *    scoping_rule_card (Card.fetch([self, :self, :update]).find_existing_rule_card)
 *    walks the candidate rule names in pattern precedence (oracle-verified
 *    candidate order: [<C>+*self+*update, <T>+*type+*update, *all+*update],
 *    src/card/set-patterns/rule-names.ts:17-24); the first EXISTING rule's
 *    pointer items resolve to their codenames (item_cards.map(&:codename)).
 */
export async function prepareAdminRuntime(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded();
  const selfId = host.codenames.peekId("self");
  const starId = host.codenames.peekId("star");
  const typePatternId = host.codenames.peekId("type");
  const allId = host.codenames.peekId("all");
  const updateId = host.codenames.peekId("update");
  const modTypeId = host.codenames.peekId("mod");

  // -- 1. codename cards (one batch, one round trip) ----------------------
  const codenameIds = await host.batch([
    {
      sql: "SELECT id, codename FROM cards WHERE trash = 0 AND codename IS NOT NULL",
      params: [],
    },
  ]);
  const codenameRecords: Array<{
    id: number;
    codename: string;
    name: string;
  }> = [];
  for (const row of rowsOf(codenameIds, 0)) {
    const id = row.id as number;
    const codename = row.codename as string;
    const record = await host.fetchById(id);
    if (record?.name?.s === undefined) continue;
    await host.cacheFetchedRecord(record);
    codenameRecords.push({ id, codename, name: record.name.s });
  }

  // -- 2. mod cards --------------------------------------------------------
  //  ORDER: no sort. Ruby's all/admin.rb:19-21
  //    def mod_cards_with_config
  //      Card.search(type: :mod).select { |mod| mod.admin_config.present? }
  //    end
  //  and all_configs (admin.rb:40-42) `.map(&:admin_config_objects).flatten`
  //  it in SEARCH order, so the section's item order IS the deck's mod-card
  //  order. The corpus pins that order: the oracle's Administrator
  //  `Configurations` section reads *title, *credit (mod: format, id 45437),
  //  *Ace (mod: ace editor, 45475), *TinyMCE (mod: tinymce editor, 45509),
  //  *home / *main menu / *getting started links (mod: defaults, 45513) —
  //  ascending card id. The name sort this replaced ordered that same list
  //  ace editor, defaults, format, recaptcha, tinymce editor, which is
  //  what the rendered bytes showed.
  //
  //  CODENAME: the row's `codename` COLUMN, not a name-derived key.
  //  Ruby's modname (card/mod/core/set/type/mod.rb:164-166) is
  //    def modname; codename.to_s.gsub(/^mod_/, ""); end
  //  — the CARD's codename. `nameToCodename` is DeckoName#key (the url_key),
  //  which decays the plural gem names: the deck stores `mod_defaults`,
  //  `mod_permissions`, `mod_rules`, `mod_assets`, `mod_tabs`, `mod_shades`
  //  (measured: every mod card's cards.codename equals that exact plural),
  //  while key gives mod_default / mod_permission / mod_rule / mod_asset /
  //  mod_tab / mod_shade. ADMIN_CONFIG is keyed by GEM name, so the derived
  //  key silently dropped whole mods from all_configs: `mod: defaults`
  //  resolved to "default" (no ADMIN_CONFIG entry), losing *home,
  //  *main menu and *getting started links — the three items the oracle's
  //  Administrator Configurations section ends with.
  const modCards: AdminRuntimeState["modCards"] = [];
  if (modTypeId !== undefined) {
    const modRows = await host.batch([
      {
        sql: "SELECT id, codename FROM cards WHERE trash = 0 AND type_id = ?",
        params: [modTypeId],
      },
    ]);
    for (const row of rowsOf(modRows, 0)) {
      const record = await host.fetchById(row.id as number);
      if (record?.name?.s === undefined) continue;
      await host.cacheFetchedRecord(record);
      const codename = row.codename;
      modCards.push({
        name: record.name.s,
        codename:
          typeof codename === "string" && codename !== ""
            ? codename
            : nameToCodename(record.name.s),
      });
    }
  }

  // -- 3. the *update rule walk --------------------------------------------
  const rulesByCardId = new Map<number, string>();
  if (selfId !== undefined && updateId !== undefined) {
    // SELF pattern: rule = C+*self+*update (junction chain by ids)
    const selfRules = await host.batch([
      {
        sql:
          "SELECT c.id AS card_id, r.db_content AS rule_content " +
          "FROM cards c " +
          "JOIN cards s ON s.left_id = c.id AND s.right_id = ? AND s.trash = 0 " +
          "JOIN cards r ON r.left_id = s.id AND r.right_id = ? AND r.trash = 0 " +
          "WHERE c.trash = 0 AND c.codename IS NOT NULL",
        params: [selfId, updateId],
      },
    ]);
    for (const row of rowsOf(selfRules, 0)) {
      rulesByCardId.set(row.card_id as number, (row.rule_content as string) ?? "");
    }
  }
  if (starId !== undefined && updateId !== undefined) {
    // STAR pattern: rule = *star+*update (the anchorless star set IS *star).
    // Ruby's candidate order for a simple star-named card is
    // [<C>+*self+*update, *star+*update, <T>+*type+*update, *all+*update]:
    // 04_star.rb#pattern_applies? (card.name.star?) sits between *self and
    // *type in the concrete lookup order (registry.ts:20's citation of
    // mod/core/set_pattern: [self, type_plus_right, right, rule, rstar,
    // star, type, all_plus, all]; the ported Card#star? is
    // src/card/name.ts:518-520). The admin config items are star-named
    // settings (*title, *credit, ...), so the walk without this candidate
    // fell through to *all+*update for every one of them and the
    // type/role.rb:12-24 :configs view grouped nothing under the roles the
    // dump's *star+*update row names (replays-adjudication lane,
    // 2026-10-01: Administrator's Configurations section was missing in
    // full).
    const starRules = await host.batch([
      {
        sql:
          "SELECT r.db_content AS rule_content " +
          "FROM cards r " +
          "WHERE r.trash = 0 AND r.left_id = ? AND r.right_id = ?",
        params: [starId, updateId],
      },
    ]);
    const starContent = rowsOf(starRules, 0)[0]?.rule_content as string | undefined;
    if (starContent !== undefined) {
      for (const record of codenameRecords) {
        if (rulesByCardId.has(record.id)) continue;
        // 04_star.rb#pattern_applies?: card.name.star? (simple star name).
        if (!DeckoName.parse(record.name).isStar) continue;
        rulesByCardId.set(record.id, starContent);
      }
    }
  }
  if (typePatternId !== undefined && updateId !== undefined) {
    // TYPE pattern: rule = <T>+*type+*update (T's card id is c.type_id)
    const typeRules = await host.batch([
      {
        sql:
          "SELECT c.id AS card_id, r.db_content AS rule_content " +
          "FROM cards c " +
          "JOIN cards s ON s.left_id = c.type_id AND s.right_id = ? AND s.trash = 0 " +
          "JOIN cards r ON r.left_id = s.id AND r.right_id = ? AND r.trash = 0 " +
          "WHERE c.trash = 0 AND c.codename IS NOT NULL",
        params: [typePatternId, updateId],
      },
    ]);
    for (const row of rowsOf(typeRules, 0)) {
      const cardId = row.card_id as number;
      if (!rulesByCardId.has(cardId)) {
        rulesByCardId.set(cardId, (row.rule_content as string) ?? "");
      }
    }
  }
  if (allId !== undefined && updateId !== undefined) {
    // ALL pattern: *all+*update (the anchorless set card IS *all)
    const allRules = await host.batch([
      {
        sql:
          "SELECT r.db_content AS rule_content " +
          "FROM cards r " +
          "WHERE r.trash = 0 AND r.left_id = ? AND r.right_id = ?",
        params: [allId, updateId],
      },
    ]);
    const allContent = rowsOf(allRules, 0)[0]?.rule_content as string | undefined;
    if (allContent !== undefined) {
      for (const record of codenameRecords) {
        if (!rulesByCardId.has(record.id)) {
          rulesByCardId.set(record.id, allContent);
        }
      }
    }
  }

  // the rule items' codenames: one batch over the collected item names
  const itemNameKeys = new Set<string>();
  for (const content of rulesByCardId.values()) {
    for (const item of pointerItems(content)) {
      itemNameKeys.add(DeckoName.parse(item).key);
    }
  }
  const codenameByKey = new Map<string, string>();
  if (itemNameKeys.size > 0) {
    const keys = [...itemNameKeys];
    const itemRows = await host.batch([
      {
        sql: `SELECT key, codename FROM cards WHERE trash = 0 AND codename IS NOT NULL AND key IN (${keys.map(() => "?").join(",")})`,
        params: keys,
      },
    ]);
    for (const row of rowsOf(itemRows, 0)) {
      codenameByKey.set(row.key as string, row.codename as string);
    }
  }

  const rolesByCardCodename = new Map<string, string[]>();
  for (const record of codenameRecords) {
    const content = rulesByCardId.get(record.id);
    if (content === undefined) continue;
    const roles: string[] = [];
    for (const item of pointerItems(content)) {
      const codename = codenameByKey.get(DeckoName.parse(item).key);
      // Ruby's item_cards.map(&:codename) raises on a missing item card;
      // the headless port skips unresolvable items (documented divergence,
      // core-mod.ts header) — seeded decks carry real role cards.
      if (codename !== undefined) roles.push(codename);
    }
    rolesByCardCodename.set(record.codename, roles);
  }

  runtimeStates.set(host, {
    codenameToName: new Map(
      codenameRecords
        .filter((r) => r.codename !== "")
        .map((r) => [r.codename, r.name]),
    ),
    rolesByCardCodename,
    modCards,
  });
}

/** Pointer-content item lines (the *update rule's db_content). */
function pointerItems(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** modname from a mod card's name: the codename minus the mod_ prefix is
 *  the gem's own derivation (type/mod.rb:168-170), but the runtime only
 *  has the warmed name; the mod cards' codenames ride the codehash, so
 *  this composes the expected codename form ("mod: core" -> "mod_core"). */
function nameToCodename(name: string): string {
  return DeckoName.parse(name).key;
}
