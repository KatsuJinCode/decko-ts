// card-mod-marketplace - the marketplace rendered as a mod.
//
// THE PRODUCT RULING. The marketplace is ITSELF a mod:
// a browsable catalog rendered as cards, covering the built-in mods. v1
// catalogs what the deck already carries; runtime installation of NEW
// third-party code is V2. The v2 SEAM already exists and is cited, not
// built: `ModSource[]` is the loader's constructor input
// (mod-loader.ts:127-132 the interface, :201-204 the constructor's
// `for (const mod of mods) this.add(mod)`), and `loader.add({manifest})`
// (:207-212) takes one more. What does NOT exist in v1 is a per-mod
// enable/disable flag, an install transaction, or any write path that
// materializes a gem. This mod therefore CATALOGS and, for the mods whose
// own loaded registrations include card content, may offer a
// create-through-write-path action for CARD CONTENT - never a fake "Install"
// button. WHICH mods those are is derived from the deck at render time
// (installKindFor below), not read out of a table, so the offer a card makes
// and the rows on that same card cannot disagree.
//
// NEW SURFACE, NOT A PORT. There is no card-mod-marketplace gem; the
// installed card-mod reference gem set (the card-mod-* gems this deck's 31
// manifests are transcribed from) carries no marketplace. Every registration
// below is NEW, not Ruby, and is labeled as such at each declaration. Nothing
// here mirrors a Ruby file: no file:line from any reference gem is claimed,
// and no rendered reference covers it.
//
// THE PARITY ARGUMENT (why the shipped byte shapes are untouched). This mod is NOT in the
// composed default deck (default-mod-deck.ts MANIFESTS - deliberately; the
// census test below is the reason). It is loaded only when a host adds it to
// a loader's ModSource[]. Two further properties keep it inert even then:
//
//   1. It registers under the set path `all/marketplace`, so its views land
//      in the per-card MRO chain under the set module `All::Marketplace`
//      (mod-registrar.ts:104-106 setModuleShortname). The chain walker
//      reaches that module through the ALL token every card carries
//      (render/set-keys.ts safeSetKeys), and only for a card that IS in the
//      marketplace set. The frozen deck carries no `*marketplace` card, so
//      no shipped render ever dispatches these views.
//
//   2. The two view names (`marketplace`, `mod_detail`) are NEW. The flat
//      html record the loader writes (mod-loader.ts:374-379) is keyed by
//      view name, so `marketplace` adds a key no existing dispatch asks for.
//      The census that counts flat-feeding rows walks defaultDeckSources()
//      and is untouched by a mod that is not in it -
//      tests/card/mod-loader/view-dispatch-flat-record-format-scope-census
//      .test.ts:113-114 pins 143 base + 28 abstract rows.
//
// The card name is `*marketplace` - a NEW name the frozen deck never
// carries, so a new view rides a new card name, which keeps every shipped
// byte shape where it was.
//
// WHAT THE VIEWS SHOW, AND WHERE EACH NUMBER COMES FROM. Two sources sit on
// one card, and the card says which is which:
//
//  1. THE ROWS ARE THIS DECK'S OWN. One card per mod the LOADED DECK actually
//     contains, and every row on it - cardtypes, set modules, views,
//     settings, events, content overrides, set patterns - is counted at
//     render time out of the loader's own registries (setModules /
//     settingsRegistry / eventRegistry / contentOverrideRegistry), the same
//     registries the renderer dispatches through. A ROW therefore cannot
//     drift from what the deck does: a mod that grows a registration grows
//     its row, and a mod the host did not load has no card at all.
//
//  2. THE PROSE IS THE RUBY GEM'S. The one-paragraph summary comes from
//     marketplace-mod-catalog.ts, transcribed from each mod module's own
//     header - and that header describes the installed card-mod gem's set/
//     tree. Its numbers ("twenty-nine set files", "24 event hooks") are facts
//     about the GEM, not about this port, and they are not expected to match
//     the rows above: a gem that wires twenty-four event hooks can register
//     zero of them here, and a gem that ships eleven set files can have five
//     ported. Each card carries one line naming which list a number belongs
//     to, so a reader never has to guess.
//
// The rule this file follows: a number on these pages is either read live
// from the deck or attributed to the gem it came from. There is no third
// kind, and no claim that the two agree.

import type { ViewContext } from "../../render/format.js";
import { h } from "../../render/slot-html.js";
import type { DeckoModManifest, ModPatternRegistration } from "../mod-manifest.js";
import { getDefaultModLoader, type ModLoader } from "../../mod-loader.js";
import { setModuleShortname, setPathPattern } from "../mod-registrar.js";
import { writePathEnabled } from "../../../server/write-routes.js";
import {
  catalogEntryFor,
  type ModCatalogEntry,
} from "./marketplace-mod-catalog.js";

// ---------------------------------------------------------------------------
// The catalog card name + the two view names - NEW surface (see the header)
// ---------------------------------------------------------------------------

/** The card whose view renders the catalog. A `*`-prefixed name - the same
 *  shape the deck's other card-scoped views hang off (a `*` name is a
 *  Setting; the `self` pattern anchors on the card's own name -
 *  set-patterns/registry.ts:161). NEW: no gem declares a `*marketplace`
 *  card and the frozen deck carries none, so nothing renders this unless a
 *  host both loads the mod and has such a card. */
export const MARKETPLACE_CARD_NAME = "*marketplace";

/** The catalog view. NEW view name - the frozen deck never dispatches it. */
export const MARKETPLACE_VIEW = "marketplace";

/** The per-mod detail view. NEW view name, same reasoning.
 *
 *  The mod it details rides the `mod` nest option
 *  (`{{*marketplace|mod_detail: date}}`), read off ctx.voo.opts the way the
 *  other mod views read their render_opts (card-mod-collection.ts:310,
 *  card-mod-edit.ts:1534). With no option the detail view falls back to the
 *  catalog rather than rendering an empty page. */
export const MOD_DETAIL_VIEW = "mod_detail";

// ---------------------------------------------------------------------------
// Reading the loaded deck's registrations
// ---------------------------------------------------------------------------

/** One mod's registration surface, counted from the loader's OWN registries.
 *
 *  Every field is derived, never declared: the set modules are the basket's
 *  entries whose modName is this mod (mod-registrar.ts SetModuleBasket.base /
 *  abstract / allNonbase), the views and cardtypes are the manifest set
 *  files the loader registered under those modules, the settings are the
 *  SettingRegistry's entries under the codenames the loader derived
 *  (mod-loader.ts:397-406), the events the ModEventRegistry's entries, the
 *  content overrides the ContentOverrideRegistry's. A mod that grows a
 *  registration grows its card. */
export interface ModRegistrationSurface {
  readonly modName: string;
  /** set module shortnames the mod registered, in load order
   *  ("All::Help", "Self::Help", "Right::ApiKey"). */
  readonly setModules: readonly string[];
  /** the distinct view names the mod registered, sorted. */
  readonly views: readonly string[];
  /** the mod's set-type/* set module shortnames - a mod's cardtypes are
   *  exactly the set files under the type pattern. */
  readonly cardtypes: readonly string[];
  /** the setting codenames the mod registered via setting_opts
   *  (mod-manifest.ts:116-145 ModSettingOpts). */
  readonly settings: readonly string[];
  /** the event names the mod declared (mod-manifest.ts:232-276). */
  readonly events: readonly string[];
  /** the set paths carrying a `def content` override
   *  (mod-manifest.ts:298 ModSetModuleFile.contentOverrides). */
  readonly contentOverrides: readonly string[];
  /** the set patterns the mod registered (mod-manifest.ts:352-366). */
  readonly patterns: readonly string[];
}

/** The setting codename the loader derives from a set path's anchor
 *  (mod-loader.ts:400-405: the path minus its pattern segment, underscored,
 *  numeric prefix stripped - Ruby's setting.rb:96). Restated here so the
 *  attribution runs through the SAME derivation the loader used rather than
 *  a second guess at it. */
function settingCodenameFor(setPath: string): string {
  return setPath
    .split("/")
    .slice(1)
    .join("_")
    .replace(/^\d+_/, "");
}

/** The registration surface of every mod in the LOADED deck.
 *
 *  Walked from the loader, not from a table: a mod the host added shows up,
 *  and a mod the host left out does not, exactly as the deck sees it. */
export function registrationSurface(loader: ModLoader): ModRegistrationSurface[] {
  const basket = loader.setModules();
  const registeredModules = [...basket.base, ...basket.abstract, ...basket.allNonbase()];
  const settings = loader.settingsRegistry();
  const overrides = loader.contentOverrideRegistry();
  const eventsByMod = new Map<string, string[]>();
  for (const event of loader.eventRegistry().all()) {
    const list = eventsByMod.get(event.modName) ?? [];
    if (!list.includes(event.event)) list.push(event.event);
    eventsByMod.set(event.modName, list);
  }
  const overridePathsByMod = new Map<string, string[]>();
  for (const path of overrides.paths()) {
    const modName = overrides.forPath(path)?.modName;
    if (modName === undefined) continue;
    const list = overridePathsByMod.get(modName) ?? [];
    if (!list.includes(path)) list.push(path);
    overridePathsByMod.set(modName, list);
  }

  const out: ModRegistrationSurface[] = [];
  const seen = new Set<string>();
  for (const modName of loader.modNames()) {
    if (seen.has(modName)) continue;
    seen.add(modName);
    // The set modules the LOADER registered for this mod. The basket is the
    // attribution authority: it records modName per registered module
    // (mod-loader.ts:979-994 registerSetModule).
    const modules = registeredModules.filter((m) => m.modName === modName);
    // The set paths behind those modules, recovered from the basket's
    // shortname -> setPath bookkeeping (mod-registrar.ts:170-177).
    const pathsByShortname = new Map<string, string>();
    for (const module of modules) {
      const path = basket.setPathFor(module.shortname);
      if (path !== undefined) pathsByShortname.set(module.shortname, path);
    }
    // The manifest is the object the loader's phase-2 walk consumed
    // (mod-loader.ts:305-307 filters setModules by pattern code, then
    // registers each file), so reading it here reports what the loader
    // registered - and a set file the basket does not carry contributes
    // nothing, because the attribution above is by registered module.
    const source = loader.fetchMod(modName);
    const views = new Set<string>();
    for (const file of source?.manifest.setModules ?? []) {
      const shortname = setModuleShortname(file.setPath);
      if (!pathsByShortname.has(shortname)) continue;
      for (const block of Object.values(file.formats ?? {})) {
        for (const view of block?.views ?? []) views.add(view.view);
      }
    }
    // A setting counts as registered when the loader's SettingRegistry
    // actually holds the codename the loader derived for one of this mod's
    // set files - the check is against the registry, not against the
    // manifest, so a mod whose setting never landed is reported as having
    // none.
    const settingsOut = new Set<string>();
    for (const file of source?.manifest.setModules ?? []) {
      if (file.settingOpts === undefined) continue;
      if (!pathsByShortname.has(setModuleShortname(file.setPath))) continue;
      const codename = settingCodenameFor(file.setPath);
      for (const group of settings.groups.values()) {
        for (const entry of group) {
          if (entry !== null && entry.codename === codename) settingsOut.add(codename);
        }
      }
    }
    out.push({
      modName,
      setModules: modules.map((m) => m.shortname),
      views: [...views].sort(),
      cardtypes: modules
        .map((m) => pathsByShortname.get(m.shortname))
        .filter((p): p is string => p !== undefined && setPathPattern(p) === "type")
        .map((p) => setModuleShortname(p))
        .sort(),
      settings: [...settingsOut].sort(),
      events: [...(eventsByMod.get(modName) ?? [])].sort(),
      contentOverrides: [...(overridePathsByMod.get(modName) ?? [])].sort(),
      patterns: (source?.manifest.setPatterns ?? []).map((p: ModPatternRegistration) => p.code).sort(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The v1 install boundary - what the detail view may honestly offer
// ---------------------------------------------------------------------------

/** What the v1 catalog may honestly say about a mod's create-through-write-
 *  path action. DERIVED from the loaded deck's registrations, never declared
 *  in the catalog - see `installKindFor` below for the rule and the reason. */
export type ModInstallKind = "content-bundle" | "compiled-code";

/** The APPLY seam's gate state, as the detail view sees it.
 *
 *  Two independent facts, both required before ANY create-through-write-path
 *  action is offered:
 *   - writePathEnabled: the host exposes the write path at all. The staging
 *     server boots READONLY and writes stay off until ops boots writable with
 *     the flag set (write-routes.ts:190-192 writePathEnabled reads
 *     DECKO_WRITE_PATH === "1"). A browse-only host has no create route, so
 *     offering a create action there would be offering a 405.
 *   - signedIn: the write path authenticates every write - token-or-cookie
 *     session, unresolvable = Anonymous, and the engine's anonymous-actor
 *     rejection is a 403 (write-routes.ts:53-55, :748-757 the authenticate
 *     step). The render-side session is the page chrome's `decko.signed_in`
 *     (RenderEngineLike.pageSession, format.ts:2721).
 *
 *  When either is false the detail view states WHICH one is missing. It does
 *  not render a disabled-looking button pretending to be the other. */
export interface ApplyGate {
  readonly writePathEnabled: boolean;
  readonly signedIn: boolean;
  /** true only when BOTH hold - the sole precondition for a create action. */
  readonly canApply: boolean;
  /** The plain reason no create action is offered, or undefined when one is.
   *  Rendered verbatim so the boundary is legible rather than implied. */
  readonly blockedReason?: string;
}

/** The gate the detail view reads for one render. */
export function applyGate(ctx: ViewContext): ApplyGate {
  const writePath = writePathEnabled();
  const signedIn = ctx.fmt.engine.pageSession?.signedIn === true;
  if (writePath && signedIn) {
    return { writePathEnabled: true, signedIn: true, canApply: true };
  }
  const reason = !writePath
    ? "This host has the write path turned off (DECKO_WRITE_PATH is not \"1\"), so no card can be created here. A browse-only host renders no create action."
    : "You are not signed in. The write path authenticates every write and rejects an anonymous actor (HTTP 403), so no create action is offered.";
  return { writePathEnabled: writePath, signedIn, canApply: false, blockedReason: reason };
}

/** What a mod's detail view says about installing it under the v1 ruling.
 *
 *  DERIVED, NOT DECLARED. There is no installKind field in the catalog and no
 *  static table here: the classification is a function of the mod's own
 *  registration surface, read from the loader at render time. That is the
 *  whole point. A hand-maintained field could (and did) call a mod compiled
 *  code while the same card listed its cardtypes, or offer a create form for
 *  a mod that registers neither a cardtype nor a view. Reading the surface
 *  makes that state unrepresentable - the apply arm below is a direct
 *  function of this value, so the offer and the rows cannot disagree.
 *
 *  The boundary the rule draws is the v1 ruling's own: a create action is
 *  offered only where the mod contributes something the WRITE PATH can
 *  create. A cardtype (a set/type/* set module - a card type the deck knows
 *  how to instantiate) and a content override (a set path carrying a `def
 *  content`) are card content. Views, set modules, settings, events and set
 *  patterns are compiled registrations the RENDER path calls; the write path
 *  has no route that creates any of them. */
export function installKindFor(surface: ModRegistrationSurface): ModInstallKind {
  return surface.cardtypes.length > 0 || surface.contentOverrides.length > 0
    ? "content-bundle"
    : "compiled-code";
}

/** The registrations that put a mod on the card-content side of the line,
 *  named. Spelled out on the page so the classification above is checkable
 *  by the reader rather than taken on the view's word: if the note claims a
 *  cardtype, the card lists it. */
function contentRegistrations(surface: ModRegistrationSurface): string {
  const parts: string[] = [];
  if (surface.cardtypes.length > 0) {
    parts.push(
      plural(surface.cardtypes.length, "cardtype") + ` (${surface.cardtypes.join(", ")})`,
    );
  }
  if (surface.contentOverrides.length > 0) {
    parts.push(
      plural(surface.contentOverrides.length, "content override") +
        ` (${surface.contentOverrides.join(", ")})`,
    );
  }
  return parts.join(" and ");
}

/** The registrations that put a mod on the compiled-code side, named the same
 *  way, so the negative half of the rule is as checkable as the positive. */
function compiledRegistrations(surface: ModRegistrationSurface): string {
  const parts: string[] = [];
  if (surface.views.length > 0) parts.push(plural(surface.views.length, "view"));
  if (surface.setModules.length > 0) parts.push(plural(surface.setModules.length, "set module"));
  if (surface.settings.length > 0) parts.push(plural(surface.settings.length, "setting"));
  if (surface.events.length > 0) parts.push(plural(surface.events.length, "event"));
  if (surface.patterns.length > 0) parts.push(plural(surface.patterns.length, "set pattern"));
  if (parts.length === 0) return "no registrations at all in this deck";
  return parts.join(", ");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What a mod's detail view says about installing it under the v1 ruling.
 *  Written from the surface, so the note and the rows it rides cannot
 *  contradict each other. */
export function installNote(surface: ModRegistrationSurface, kind: ModInstallKind): string {
  if (kind === "content-bundle") {
    return `This deck registers ${contentRegistrations(surface)} for this mod - card content, which is what the write path creates. The registrations are compiled in and already active. The create action below adds a card named after this mod, carrying the content you type; it does not set that card's type, and it does not install, remove, or reconfigure the mod. Installing or removing the mod itself is the v2 boundary.`;
  }
  return `This deck registers no cardtype and no content override for this mod. What it does register is ${compiledRegistrations(surface)} - compiled code the render path calls, none of it something the write path can create - so there is no card content here for a create action to add. The registrations are compiled in and already active. Installing or removing the mod itself is the v2 boundary.`;
}

// ---------------------------------------------------------------------------
// The catalog view - one card per mod in the loaded deck
// ---------------------------------------------------------------------------

/** The catalog body: one card per mod the loaded deck contains.
 *
 *  NEW bytes - no rendered reference covers this view, so nothing here is a
 *  port and no
 *  byte here is compared to Ruby. The shape is the deck's own card markup (a
 *  div per entry, the deck's class vocabulary) so the catalog reads as cards
 *  in a deck that styles cards, and the escaping is the shared `h()`
 *  (render/slot-html.ts:18, the escaper the core views use). */
function marketplaceView(ctx: ViewContext): string {
  const loader = getDefaultModLoader();
  if (loader === undefined) {
    return shell(
      '<p class="marketplace-empty">No mod loader is bound, so there is no catalog to show. The marketplace reads the loaded deck\'s own registries; with no deck loaded there are no mods to list.</p>',
    );
  }
  const surfaces = registrationSurface(loader);
  const cards = surfaces.map((surface) =>
    catalogCard(surface, catalogEntryFor(surface.modName)),
  );
  return shell(
    `<p class="marketplace-lede">${h(
      `${surfaces.length} mods are loaded into this deck. Every one is compiled in: the deck composes them at boot, so each is present and its registrations are live. There is no per-mod enable switch, and installing new third-party code is not part of this version.`,
    )}</p>${cards.join("")}`,
  );
}

/** The catalog's page shell. NEW markup. */
function shell(inner: string): string {
  return `<div class="marketplace-deck">${inner}</div>`;
}

/** One mod's catalog card: name, its sourced one-paragraph summary, the
 *  surfaces it owns, and its state. */
function catalogCard(
  surface: ModRegistrationSurface,
  entry: ModCatalogEntry | undefined,
): string {
  const name = h(surface.modName);
  const gem =
    entry?.gemName === undefined
      ? ""
      : `<span class="marketplace-gem">${h(entry.gemName)}</span>`;
  // The summary is SOURCED prose. When a mod has no catalog entry - a host
  // added a mod this catalog does not describe - the card says so rather
  // than inventing a paragraph. The counts below still render, because they
  // are read from the deck.
  //
  // The provenance line is not decoration. A sourced paragraph describes the
  // Ruby GEM this mod was ported from, so its numbers and the live rows
  // below routinely differ, and a card that showed both without saying so
  // would read as a contradiction. It rides only with a sourced paragraph -
  // with no paragraph there is no gem description to attribute.
  const summary =
    entry === undefined
      ? '<p class="marketplace-summary marketplace-summary-unsourced">No catalog entry describes this mod. It is loaded and its registrations are counted below, but this version\'s catalog carries no sourced description for it.</p>'
      : `<p class="marketplace-summary">${h(entry.summary)} <span class="marketplace-source">Source: ${h(entry.sourceFile)}:${entry.sourceLine}</span></p>` +
        `<p class="marketplace-provenance">The paragraph above describes the Ruby gem this mod was ported from, so its numbers describe that gem and not this port. Every list below is this deck's own registrations, counted live at render time.</p>`;
  return (
    `<div class="marketplace-card" data-mod="${name}">` +
    `<h3 class="marketplace-name">${name}${gem}</h3>` +
    summary +
    surfaceList(surface) +
    `<p class="marketplace-state">Loaded and active: this mod is part of the deck's composition, so its registrations are live. The deck has no per-mod on/off switch, which is why every entry reads the same way.</p>` +
    `<p class="marketplace-detail-hint">Detail view: <code>{{${h(MARKETPLACE_CARD_NAME)}|${MOD_DETAIL_VIEW}: ${name}}}</code></p>` +
    `</div>`
  );
}

/** The surfaces a mod owns, as counted from the deck. */
function surfaceList(surface: ModRegistrationSurface): string {
  const rows: Array<[string, readonly string[]]> = [
    ["Cardtypes", surface.cardtypes],
    ["Set modules", surface.setModules],
    ["Views", surface.views],
    ["Settings", surface.settings],
    ["Events", surface.events],
    ["Content overrides", surface.contentOverrides],
    ["Set patterns", surface.patterns],
  ];
  return `<ul class="marketplace-surfaces">${rows
    .map(([label, values]) => surfaceRow(label, values))
    .join("")}</ul>`;
}

function surfaceRow(label: string, values: readonly string[]): string {
  const key = label.toLowerCase().replace(/\s+/g, "-");
  const body =
    values.length === 0
      ? '<span class="marketplace-none">none</span>'
      : values.map((v) => `<code>${h(v)}</code>`).join(", ");
  return `<li class="marketplace-surface" data-surface="${h(key)}"><span class="marketplace-surface-label">${h(label)}</span>: ${body}</li>`;
}

// ---------------------------------------------------------------------------
// The per-mod detail view
// ---------------------------------------------------------------------------

/** The detail body: one mod's cardtypes / settings / views, read from the
 *  manifest shape mod-manifest.ts declares, plus the v1 install boundary.
 *
 *  A mod's cardtypes are exactly its `set/type/<x>` files - the manifest's
 *  ModSetModuleFile.setPath (mod-manifest.ts:284) whose first segment names
 *  the pattern, and the `type` pattern's own table entry is
 *  set-patterns/registry.ts's "type" code. */
function modDetailView(ctx: ViewContext): string {
  const loader = getDefaultModLoader();
  if (loader === undefined) {
    return shell('<p class="marketplace-empty">No mod loader is bound, so there is no mod to detail.</p>');
  }
  const requested =
    typeof ctx.voo.opts["mod"] === "string" ? (ctx.voo.opts["mod"] as string) : undefined;
  if (requested === undefined) {
    // No mod named: the catalog IS the honest answer rather than an empty
    // detail page, which would read as a bug.
    return marketplaceView(ctx);
  }
  const surfaces = registrationSurface(loader);
  const surface = surfaces.find((s) => s.modName === requested);
  if (surface === undefined) {
    // THE NOT-LOADED FALLBACK, and all it claims. A name the loader holds no
    // registrations for gets this page: the honest fact (this deck does not
    // compose that mod), the number of mods it does compose, the nest-option
    // spelling that names one, and the full list of loaded names. It does NOT
    // assert a reason for the absence. The loader records absence, not cause
    // - whether a name is missing because it was never ported, because it is
    // compiled into the engine's seed tables, or because this host did not
    // load it is a fact about the DECK's composition, and a render-time view
    // that guessed among those would be inventing. The recorded reasons live
    // with the composition that has them (default-mod-deck.ts's own header,
    // the COMPILED_IN_OR_ABSENT_MODS list beside it) and are not restated
    // here as page copy.
    const known = surfaces.map((s) => `<code>${h(s.modName)}</code>`).join(", ");
    return (
      shell(
        `<h3 class="marketplace-name">No mod named ${h(requested)} is loaded</h3>` +
          `<p class="marketplace-summary">This deck composes ${surfaces.length} mods, and that name is not one of them, so there are no registrations here to detail. This page does not guess why: the loader records which mods a deck holds, not why a name is missing from one. A mod detail names one through the nest option, for example <code>{{${h(MARKETPLACE_CARD_NAME)}|${MOD_DETAIL_VIEW}: date}}</code>. The mods in this deck are: ${known}.</p>`,
      )
    );
  }
  const entry = catalogEntryFor(surface.modName);
  // DERIVED, never read off the catalog: the classification is a function of
  // the surface the rows above are counted from, so the offer the Apply
  // section makes and the rows it sits under cannot disagree.
  const kind = installKindFor(surface);
  return (
    shell(
      `<div class="marketplace-detail" data-mod="${h(surface.modName)}">` +
        `<h3 class="marketplace-name">${h(surface.modName)}${
          entry?.gemName === undefined
            ? ""
            : `<span class="marketplace-gem">${h(entry.gemName)}</span>`
        }</h3>` +
        (entry === undefined
          ? '<p class="marketplace-summary marketplace-summary-unsourced">No catalog entry describes this mod; the lists below are read from the deck.</p>'
          : `<p class="marketplace-summary">${h(entry.summary)} <span class="marketplace-source">Source: ${h(entry.sourceFile)}:${entry.sourceLine}</span></p>` +
            `<p class="marketplace-provenance">The paragraph above describes the Ruby gem this mod was ported from, so its numbers describe that gem and not this port. Every list below is this deck's own registrations, counted live at render time.</p>`) +
        `<p class="marketplace-install">${h(installNote(surface, kind))}</p>` +
        detailSection(
          "Cardtypes",
          surface.cardtypes,
          "The mod's set/type/* set modules - a mod's cardtypes are exactly the set files under the type pattern.",
        ) +
        detailSection(
          "Settings",
          surface.settings,
          "Setting codenames the mod registered via setting_opts, checked against the loader's setting registry.",
        ) +
        detailSection(
          "Views",
          surface.views,
          "View names the mod registered across its set modules' format blocks.",
        ) +
        detailSection(
          "Set modules",
          surface.setModules,
          "Every set module the mod's set/ tree registers, as the loader's module basket records it.",
        ) +
        detailSection(
          "Events",
          surface.events,
          "Event names the mod declared. The execution seam fires them at their stage; v1's catalog records the declaration, it does not run it.",
        ) +
        detailSection(
          "Content overrides",
          surface.contentOverrides,
          "Set paths carrying a set-module def content override.",
        ) +
        detailSection(
          "Set patterns",
          surface.patterns,
          "Set patterns the mod registered. No ported mod of the composed deck registers one; the core patterns stay in their own order.",
        ) +
        applySection(applyGate(ctx), kind, surface) +
        `</div>`,
    )
  );
}

function detailSection(label: string, values: readonly string[], why: string): string {
  const body =
    values.length === 0
      ? '<span class="marketplace-none">none</span>'
      : `<ul class="marketplace-detail-list">${values
          .map((v) => `<li><code>${h(v)}</code></li>`)
          .join("")}</ul>`;
  return (
    `<section class="marketplace-detail-section" data-section="${h(label.toLowerCase())}">` +
    `<h4 class="marketplace-detail-label">${h(label)}</h4>` +
    `<p class="marketplace-detail-why">${h(why)}</p>` +
    body +
    `</section>`
  );
}

/** The APPLY section. A create-through-write-path action is rendered ONLY for
 *  a mod the loaded deck registers card content for, and only when the gate
 *  holds; every other case states the boundary in words. There is deliberately
 *  no "Install" control anywhere - v1 cannot install, and a control that looks
 *  like it installs something is a lie the reader would act on.
 *
 *  The offer is a FUNCTION of the derived classification, which is a function
 *  of the rows on this same page. There is no second switch and no field to
 *  fall out of step: a mod the card lists no cardtype for can never reach
 *  the form arm below, and a mod it lists a cardtype for can never reach the
 *  "no create action" arm.
 *
 *  When the gate does hold, the form posts to the deck's OWN create route
 *  (write-routes.ts matchRoute:442-489 - POST / with `card[name]` is the
 *  bare create arm, :447-450). The name rides in the `card[name]` field
 *  rather than in the path, which is what createInputFromParams reads first
 *  (write-routes.ts:918) and which keeps an underscore-bearing mod name
 *  exact - the path form would run it through markToName, which turns `_`
 *  into a space (write-routes.ts:490-495, card_class.rb:131). */
function applySection(
  gate: ApplyGate,
  kind: ModInstallKind,
  surface: ModRegistrationSurface,
): string {
  const modName = surface.modName;
  if (kind !== "content-bundle") {
    return (
      `<section class="marketplace-apply marketplace-apply-unavailable" data-mod="${h(modName)}">` +
      `<h4 class="marketplace-detail-label">Apply</h4>` +
      `<p class="marketplace-apply-note" data-gate="compiled-code">No create action is offered for this mod: this deck registers no card content for it - no cardtype, no content override - for the write path to create. The boundary it sits on is stated above.</p>` +
      `</section>`
    );
  }
  if (!gate.canApply) {
    return (
      `<section class="marketplace-apply marketplace-apply-blocked" data-mod="${h(modName)}">` +
      `<h4 class="marketplace-detail-label">Apply</h4>` +
      `<p class="marketplace-apply-note" data-gate="${gate.writePathEnabled ? "signed-out" : "write-path-disabled"}">${h(
        gate.blockedReason ?? "The create action is unavailable.",
      )}</p>` +
      `</section>`
    );
  }
  const id = h(modName);
  return (
    `<section class="marketplace-apply marketplace-apply-available" data-mod="${id}">` +
    `<h4 class="marketplace-detail-label">Apply</h4>` +
    `<p class="marketplace-apply-note">This deck registers ${h(
      contentRegistrations(surface),
    )} for this mod, so card content here is something the write path can create and a create action is offered. The form below posts to the deck's own create route: it adds a card named ${h(
      modName,
    )}, carrying the content you type. It does not set that card's type, and it does not install, remove, or reconfigure the mod.</p>` +
    `<form class="marketplace-apply-form" method="post" action="/">` +
    `<input type="hidden" name="card[name]" value="${id}">` +
    `<label class="marketplace-apply-label" for="marketplace-apply-content-${id}">Card content</label>` +
    `<textarea class="marketplace-apply-content" id="marketplace-apply-content-${id}" name="card[content]" rows="3"></textarea>` +
    `<button class="marketplace-apply-submit" type="submit">Create card</button>` +
    `</form>` +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// the manifest (the established shape; every entry here NEW, not Ruby)
// ---------------------------------------------------------------------------

/** card-mod-marketplace's manifest. NEW - there is no marketplace gem; the
 *  reference gems carry no such mod and no rendered reference covers any of
 *  it.
 *
 *  One set file, `all/marketplace`, carrying the two views. The set path is
 *  the all/ pattern because the catalog is a per-DECK surface, and the view
 *  names are new keys nothing else dispatches (see the header's parity
 *  argument).
 *
 *  `unknown: true` is NOT declared. The unknown-substitution setting
 *  (mod-manifest.ts:66-71) would make the view answer for unknown cards,
 *  which is a wider surface than a catalog needs - the catalog is about the
 *  deck, not about a card that failed to fetch.
 *
 *  `cache: "never"` is declared on both: the catalog is read live off the
 *  loader's registries on every render, and a cached body would go stale the
 *  moment a host loads a different deck (mod-manifest.ts:81 cache;
 *  render.rb:51's cache vocabulary). */
const cardModMarketplace: DeckoModManifest = {
  name: "marketplace",
  // No gemName: this mod ships in-tree, not as a gem (mod-manifest.ts:379
  // records the gem name "when the mod ships as a gem").
  group: "custom",
  setModules: [
    {
      setPath: "all/marketplace",
      formats: {
        html: {
          views: [
            { view: MARKETPLACE_VIEW, viewFn: marketplaceView, config: { cache: "never" } },
            { view: MOD_DETAIL_VIEW, viewFn: modDetailView, config: { cache: "never" } },
          ],
        },
      },
    },
  ],
};

/** The mod as a ModSource - the v2 seam's own input type
 *  (mod-loader.ts:127-132). A host composes it into a deck the way
 *  defaultDeckSources does:
 *
 *    new ModLoader([...defaultDeckSources(), marketplaceModSource()])
 *
 *  The marketplace is deliberately NOT in the composed default deck; see the
 *  file header's parity argument and default-mod-deck.ts's census guard. */
export function marketplaceModSource(): { manifest: DeckoModManifest } {
  return { manifest: cardModMarketplace };
}

export default cardModMarketplace;
