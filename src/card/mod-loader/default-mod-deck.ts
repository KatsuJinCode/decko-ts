// The composed default deck: every ported card-mod manifest wired into one
// ModLoader in the deck's real bundle order, plus the boot seam that binds
// the process-wide defaults (setDefaultModLoader + the content-override and
// event registries) - the port of what Ruby does once at boot when
// Bundler's resolve order meets Cardio::Mod::Dirs (dirs.rb:51-63).
//
// The ORDER is not chosen: it is the captured resolve order of the live
// Ruby deck (fixtures/captured/help-mod-loader.json "mods" - the oracle
// Cardio::Mod::Dirs output, index 0..34):
//
//   core, collection, content, format, list, markdown, permissions, help,
//   search, rules, edit, email, integrate, account, history, carrierwave,
//   virtual, assets, script, ace_editor, api_key, style, bar_and_box,
//   bootstrap, comment, date, delayed_job, follow, session, tabs, layout,
//   recaptcha, tinymce_editor, defaults
//
// Four captured names carry no manifest here, deliberately:
// - core + bar_and_box: their registrations are compiled into the engine's
//   seed tables (PATTERN_TABLE + HTML_VIEWS - mod-loader.ts treats the
//   compiled-in core AS the core mod; bar_and_box's views live in the same
//   seed layer). Caveat recorded for the byte-parity rounds: Ruby loads
//   bar_and_box AFTER style, so a view both define resolves to bar_and_box
//   in Ruby; in the TS engine the seed layer sits UNDER every mod
//   registration, so style's registration would win that collision. No
//   corpus fixture pins such a collision (checked at wiring time); the
//   replay is the guard if one ever pins.
// - delayed_job + defaults: no TS surface (the legacy delayed-job queue;
//   the defaults meta-gem carries no registrations).
//
// The render-path defaults are bound HERE, once, in deck-boot order -
// never inside ModLoader.load(), so manual registry wirings (the mod
// suites' beforeAll hooks) survive unrelated loads.

import type { DeckoModManifest } from "./mod-manifest.js";
import { ModLoader, type ModSource } from "../mod-loader.js";
import { setDefaultModLoader } from "../mod-loader.js";
import {
  setDefaultContentOverrideRegistry,
} from "../render/content-overrides.js";
import { setDefaultModEventRegistry } from "./mod-event-registry.js";

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
import cardModAccount from "./mods/card-mod-account.js";
import cardModHistory from "./mods/card-mod-history.js";
import cardModCarrierwave from "./mods/card-mod-carrierwave.js";
import cardModVirtual from "./mods/card-mod-virtual.js";
import cardModAssets from "./mods/card-mod-assets.js";
import cardModScript from "./mods/card-mod-script.js";
import cardModAceEditor from "./mods/card-mod-ace_editor.js";
import cardModApiKey from "./mods/card-mod-api_key.js";
import cardModStyle from "./mods/card-mod-style.js";
import cardModBootstrap from "./mods/card-mod-bootstrap.js";
import cardModComment from "./mods/card-mod-comment.js";
import cardModDate from "./mods/card-mod-date.js";
import cardModFollow from "./mods/card-mod-follow.js";
import cardModSession from "./mods/card-mod-session.js";
import cardModTabs from "./mods/card-mod-tabs.js";
import cardModLayout from "./mods/card-mod-layout.js";
import cardModRecaptcha from "./mods/card-mod-recaptcha.js";
import cardModTinymceEditor from "./mods/card-mod-tinymce_editor.js";

/** Captured names with no manifest entry in the composed deck (see the
 *  file comment for why each is absent). */
export const COMPILED_IN_OR_ABSENT_MODS = [
  "core",
  "bar_and_box",
  "delayed_job",
  "defaults",
] as const;

/** The oracle deck's bundle order
 *  (fixtures/captured/help-mod-loader.json "mods", names by index). */
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

/** The 30 manifests as ModSources, in the oracle bundle order. */
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
