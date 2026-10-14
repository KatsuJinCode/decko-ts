// The composed default deck: every ported card-mod manifest wired into one
// ModLoader in the deck's real bundle order, plus the boot seam that binds
// the process-wide defaults (setDefaultModLoader + the content-override and
// event registries) - the port of what Ruby does once at boot when
// Bundler's resolve order meets Cardio::Mod::Dirs (dirs.rb:51-63).
//
// The ORDER is not chosen: it is the order Bundler resolves the reference
// deck's bundle in, which Cardio::Mod::Dirs walks, index 0..34:
//
//   core, collection, content, format, list, markdown, permissions, help,
//   search, rules, edit, email, integrate, account, history, carrierwave,
//   virtual, assets, script, ace_editor, api_key, style, bar_and_box,
//   bootstrap, comment, date, delayed_job, follow, session, tabs, layout,
//   recaptcha, tinymce_editor, defaults
//
// Three names in that order carry no manifest here, deliberately:
// - bar_and_box: its registrations are compiled into the engine's seed
//   tables (PATTERN_TABLE + HTML_VIEWS - bar_and_box's views live in the
//   seed layer). Caveat recorded for the byte-parity rounds: Ruby loads
//   bar_and_box AFTER style, so a view both define resolves to bar_and_box
//   in Ruby; in the TS engine the seed layer sits UNDER every mod
//   registration, so style's registration would win that collision. No
//   fixture pins such a collision; the replay is the guard if one ever pins.
// - delayed_job + defaults: no TS surface (the legacy delayed-job queue;
//   the defaults meta-gem carries no registrations).
//
// core IS composed, not absent: `core: coreMod` is MANIFESTS' first entry.
// core loads at bundle index 0 and is the admin surface's registration site
// (the seed tables' "compiled-in core" equivalence predates that composition
// and carries no admin surface).
//
// The render-path defaults are bound HERE, once, in deck-boot order -
// never inside ModLoader.load(), so manual registry wirings (the mod
// suites' beforeAll hooks) survive unrelated loads.

import type { DeckoModManifest } from "./mod-manifest.js";
import type { ModEngineHost } from "./mod-manifest.js";
import type {
  ModEventPredicateTable,
  ModEventRuntime,
} from "./mod-event-dispatch.js";
import { ModLoader, type ModSource } from "../mod-loader.js";
import { setDefaultModLoader, getDefaultModLoader } from "../mod-loader.js";
import { restoreSetTypeAssignments, snapshotSetTypeAssignments } from "../set-patterns/set-type-assignment.js";
import {
  setDefaultContentOverrideRegistry,
} from "../render/content-overrides.js";
import { setDefaultModEventRegistry } from "./mod-event-registry.js";

import coreMod, { coreModEventPredicates } from "./mods/core-mod.js";
import cardModCollection from "./mods/card-mod-collection.js";
import cardModContent from "./mods/card-mod-content.js";
import cardModFormat from "./mods/card-mod-format.js";
import cardModList from "./mods/card-mod-list.js";
import cardModMarkdown from "./mods/card-mod-markdown.js";
import cardModPermissions from "./mods/card-mod-permissions.js";
import cardModHelp from "./mods/card-mod-help.js";
import cardModSearch from "./mods/card-mod-search.js";
import cardModRules from "./mods/card-mod-rules.js";
import cardModEdit from "./mods/card-mod-edit.js";
import cardModEmail from "./mods/card-mod-email.js";
import cardModIntegrate from "./mods/card-mod-integrate.js";
import cardModAccount, { accountModEventPredicates } from "./mods/card-mod-account.js";
import cardModHistory, { historyModEventPredicates } from "./mods/card-mod-history.js";
import { registerDeckModEventCardStateSources } from "./mod-event-state-sources.js";
import cardModCarrierwave from "./mods/card-mod-carrierwave.js";
import cardModVirtual from "./mods/card-mod-virtual.js";
import cardModAssets from "./mods/card-mod-assets.js";
import cardModScript from "./mods/card-mod-script.js";
import cardModAceEditor from "./mods/card-mod-ace_editor.js";
import cardModApiKey from "./mods/card-mod-api_key.js";
import cardModStyle from "./mods/card-mod-style.js";
import cardModBootstrap from "./mods/card-mod-bootstrap.js";
import cardModComment, { commentModEventPredicates } from "./mods/card-mod-comment.js";
import cardModDate from "./mods/card-mod-date.js";
import cardModFollow, { followModEventPredicates } from "./mods/card-mod-follow.js";
import cardModSession from "./mods/card-mod-session.js";
import cardModTabs from "./mods/card-mod-tabs.js";
import cardModLayout from "./mods/card-mod-layout.js";
import cardModRecaptcha, { recaptchaModEventPredicates } from "./mods/card-mod-recaptcha.js";
import cardModTinymceEditor from "./mods/card-mod-tinymce_editor.js";

/** Bundle-order names with no manifest entry in the composed deck (see the
 *  file comment for why each is absent). core is NOT here: it is composed as
 *  MANIFESTS' first entry, which replaced an earlier list that carried
 *  "core" on the strength of the seed tables only. */
export const COMPILED_IN_OR_ABSENT_MODS = [
  "bar_and_box",
  "delayed_job",
  "defaults",
] as const;

/** The deck's bundle order, names by resolve index. */
export const ORACLE_BUNDLE_ORDER: readonly string[] = [
  "core",
  "collection",
  "content",
  "format",
  "list",
  "markdown",
  "permissions",
  "help",
  "search",
  "rules",
  "edit",
  "email",
  "integrate",
  "account",
  "history",
  "carrierwave",
  "virtual",
  "assets",
  "script",
  "ace_editor",
  "api_key",
  "style",
  "bar_and_box",
  "bootstrap",
  "comment",
  "date",
  "delayed_job",
  "follow",
  "session",
  "tabs",
  "layout",
  "recaptcha",
  "tinymce_editor",
  "defaults",
];

const MANIFESTS: Record<string, DeckoModManifest> = {
  core: coreMod,
  collection: cardModCollection,
  content: cardModContent,
  format: cardModFormat,
  list: cardModList,
  markdown: cardModMarkdown,
  permissions: cardModPermissions,
  help: cardModHelp,
  search: cardModSearch,
  rules: cardModRules,
  edit: cardModEdit,
  email: cardModEmail,
  integrate: cardModIntegrate,
  account: cardModAccount,
  history: cardModHistory,
  carrierwave: cardModCarrierwave,
  virtual: cardModVirtual,
  assets: cardModAssets,
  script: cardModScript,
  ace_editor: cardModAceEditor,
  api_key: cardModApiKey,
  style: cardModStyle,
  bootstrap: cardModBootstrap,
  comment: cardModComment,
  date: cardModDate,
  follow: cardModFollow,
  session: cardModSession,
  tabs: cardModTabs,
  layout: cardModLayout,
  recaptcha: cardModRecaptcha,
  tinymce_editor: cardModTinymceEditor,
};

/** The oracle bundle order restricted to the ported mods - the composed
 *  deck's gemMods input (resolveOrder validates every name has a
 *  manifest). */
export function portedBundleOrder(): string[] {
  return ORACLE_BUNDLE_ORDER.filter((name) => MANIFESTS[name] !== undefined);
}

/** The manifests as ModSources, in bundle order (core first). */
export function defaultDeckSources(): ModSource[] {
  return portedBundleOrder().map((name) => ({
    manifest: MANIFESTS[name]!,
  }));
}

/** The composed deck, loaded. Binds the process-wide defaults (the render
 *  path's mod-view configs, the content-override registry, the event
 *  registry) to THIS loader's tables - the deck-boot seam. A second call
 *  rebinds to a fresh loader (reload semantics; tests use
 *  defaultDeckSources() directly when they need isolation). */
export function defaultDeckLoader(): ModLoader {
  const loader = new ModLoader(defaultDeckSources());
  loader.resolveOrder({ gemMods: portedBundleOrder() });
  loader.load();
  setDefaultModLoader(loader);
  setDefaultContentOverrideRegistry(loader.contentOverrideRegistry());
  setDefaultModEventRegistry(loader.eventRegistry());
  return loader;
}

/** The composed deck, loaded once for its event space only: bound to no
 *  process-wide default, so rendering is unaffected. */
let eventOnlyLoader: ModLoader | undefined;
function eventOnlyDeckLoader(): ModLoader {
  if (eventOnlyLoader === undefined) {
    // A private views record: a loader registers its mods' views into the
    // record it is given, and the default is the render path's shared
    // HTML_VIEWS.
    const loader = new ModLoader(defaultDeckSources(), {});
    loader.resolveOrder({ gemMods: portedBundleOrder() });
    // Loading also resets the process-wide set-type assignments to the
    // mods' own; the host's registrations stay in force.
    const assignments = snapshotSetTypeAssignments();
    try {
      loader.load();
    } finally {
      restoreSetTypeAssignments(assignments);
    }
    eventOnlyLoader = loader;
  }
  return eventOnlyLoader;
}

// -------------------------------------------------------------------------
// the deck-boot MOD EVENT RUNTIME seam
// -------------------------------------------------------------------------

// Ruby composes the event space ONCE at boot - Cardio::Mod::Dirs#initialize
// adds core + every gem mod (card-1.110.0 lib/cardio/mod/dirs.rb:54-62),
// Loader.load_mods registers every set file over the whole dirs
// (lib/cardio/mod/loader.rb:16-21), and the `event` DSL lands each
// declaration in that one space as its file loads (lib/card/set/event.rb:
// 71-74). Every save - the serving write path included - walks the SAME
// space; there is no per-path composition and no save without it. The
// builders below are the port's seam for that shape: the save-path runtime
// over the BOOTED deck (never a private per-caller subset).

/** The deck's named `when:` predicate table: the predicate-exporting mods'
 *  tables merged in bundle order (core's autoname?/draft?/no_autoname?/
 *  use_default_content?/was_cardtype?/skip_update_referers?, comment's
 *  comment, history's actionable?/act_card?/edit_conflict?/
 *  finalize_action?/rollback_request?, recaptcha's validate_recaptcha - no
 *  name collisions). Merging here - at the deck-boot seam - is what makes
 *  the deck runtime resolve every predicate the deck registered, instead of
 *  the single-mod subsets a per-caller composition would give. A predicate
 *  left out is not a silent skip: `when_condition_applies?` sends the name
 *  as a card method in Ruby and raises when nothing answers it, so the
 *  dispatcher raises for it here too. */
export function defaultDeckEventPredicates(): ModEventPredicateTable {
  return {
    ...accountModEventPredicates,
    ...coreModEventPredicates,
    ...commentModEventPredicates,
    ...followModEventPredicates,
    ...historyModEventPredicates,
    ...recaptchaModEventPredicates,
  };
}

/** The save-path ModEventRuntime over the deck-boot composition: the
 *  BOOTED loader's event registry (getDefaultModLoader; booting the deck
 *  when no host did - the same once-per-process boot Ruby performs) with
 *  the deck's merged predicate table. `host` is the caller's ModEngineHost
 *  (the render path passes modEngineHost(engine, fetcher); save-time event
 *  bodies reach the host only for the integrate observers'
 *  fetchRenderCard - a composition without one fails loudly per the
 *  dispatcher's HOST_REQUIRED contract). */
export function defaultDeckEventRuntime(host?: ModEngineHost): ModEventRuntime {
  // A host that renders without a bound mod loader (the edge, a stock-deck
  // node host) keeps rendering that way after its first save: the events
  // come from a loader of their own, never bound as the process default.
  const loader = getDefaultModLoader() ?? eventOnlyDeckLoader();
  // The other half of `when:` support: the state sources that populate the
  // event card with what the predicates read (mod-event-card-state.ts).
  // Registered here, beside the predicate tables, so a mod's two halves are
  // wired in one place.
  registerDeckModEventCardStateSources();
  return {
    registry: loader.eventRegistry(),
    predicates: defaultDeckEventPredicates(),
    ...(host !== undefined ? { host } : {}),
  };
}
