// The card-mod-assets gem (card-mod-assets-0.20.0), ported through the mod
// loader.
//
// The gem's tree (the installed
// card-mod-assets-0.20.0/): twelve set files (8 abstract, 3 right, 1 type),
// one lib/ module (Card::Assets - boot-time asset pipeline driver), one
// HAML template, one manifest.yml transform, and a config/locales tree.
// Two html views the engine does not already cover are in scope:
// :javascript_include_tag and :stylesheet_include_tag - both are
// gem-specific (the engine's
// HTML_VIEWS surface has neither), both live in `set/right/group_remote.rb`
// (the only set file with portable html views), and both iterate over the
// group_remote card's URL list (`urls`) emitting one Rails asset-tag helper
// output per URL.
//
// Ported here byte-for-byte from set/right/group_remote.rb:40-54 - one set
// module, two view registrations.
//
// NOT ported (honest remainder):
// - set/abstract/asset_file.rb:54-59 view :javascript_include_tag - this
//   override iterates over `card.existing_source_paths` (filesystem walks
//   of deck mod asset directories) and calls Rails' `javascript_include_tag`
//   helper on each path. Both the source-path resolution (Card::Mod::Dirs)
//   and the Rails helper sit outside the headless engine; the override is
//   only meaningful when the asset_file set module is included on a real
//   card (CSS / SCSS / JS / CoffeeScript), which the engine has no cardtype
//   for, so registering the view would claim a fidelity no oracle here
//   pins.
// - set/abstract/01_manifest_group.rb:4-6 view :core (`list_group
//   card.item_names`) IS PORTED now (the mods-first-half lane 2026-10-19:
//   manifestGroupCoreView over haml-file-views listGroup - the same helper
//   the group_list template renders through; the abstract reaches cards
//   only through the include graph's ManifestGroup includers, never
//   globally).
// - set/abstract/mod_assets.rb:171-182 view :core (`haml :group_list,
//   groups: groups` over group_remote_card.urls + item_cards +
//   input_item_cards) stays unregistered: the group walk rides the
//   remote-manifest fetch and the compile-input machinery, which have no
//   port surface; the deck-pinned modAssetGroupsCoreHtml
//   (haml-file-views.ts) remains the caller-fed variant of the template.
// - set/right/asset_output.rb:24-29 view :not_found + set/abstract/
//   asset_outputter.rb:61-63 view :asset_output_url - PORTED in the
//   the Cloudflare write seam. The blockers named
//   above moved: the attachment write path landed
//   (LocalAttachmentStore + engine attachment), so the url
//   construction and the live-write seam are real now. See the
//   cwwrite-seam section below the manifest.
// - The abstract / type set files (card_accessor / event / include_set
//   / virtual? / history? / chunk_list declarations and the
//   assemble_asset_input_content -> left.format(input_format).render
//   indirection) - the engine has no cardtype for asset inputters /
//   outputters, so registering them would register no rule walk, view,
//   or hook that any TS surface exercises.
// - data/real.yml, data/transform/, config/locales/, lib/card/assets.rb
//   (Card::Assets.refresh / make_output_coded / generate_asset_output_files),
//   lib/tasks/card/assets.rake, the README. The boot-time asset pipeline is
//   Rails-only and was never a render-path surface; the locales' keys move
//   with the views they target.

import type { ViewContext, ViewFn } from "../../render/format.js";
import { NoMethodError, rubyDefaultInspect, stableIdentity } from "../../render/format.js";
import { localAttachmentUrl } from "../../attachments/asset-output-write.js";
import { listGroup } from "../../render/haml-file-views.js";
import { superView } from "../mod-view-helpers.js";
import type {
  DeckoModManifest,
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
} from "../mod-manifest.js";
import { engineOwnedEvent } from "../mod-manifest.js";

/** The set-module event declarations:
 *  stub-bodied unless the engine owns the behavior (then engineOwnedEvent).
 *  Same shape as core-mod.ts's local helper; the per-event owner or stub
 *  reason rides the declaration's comment. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

// ---------------------------------------------------------------------------
// The asset OUTPUT url + the right/asset_output :not_found gate
// (set/abstract/asset_outputter.rb:61-63, set/right/asset_output.rb:19-34).
// ---------------------------------------------------------------------------

/** The `+*asset output` child of a card, fetched through the engine's
 *  render-card cache. Ruby's card_accessor generates asset_output_card
 *  (fetch-or-new); a missing child reads as undefined here and the live
 *  write branch renders the Ruby new-card shape (file&.url -> nil -> ""). */
function fetchAssetOutputCard(ctx: ViewContext): { dbContent: string } | undefined {
  const card = ctx.fmt.card;
  const childName = `${card.name.s}+*asset output`;
  const engine = ctx.fmt.engine as {
    fetchRenderCard?: (name: string) => { dbContent: string } | undefined;
  };
  return engine.fetchRenderCard?.(childName);
}

/** The CARD-level method port (asset_outputter.rb:78-82):
 *
 *     def asset_output_url
 *       # ensure_asset_output
 *       asset_output_card.file&.url # (:default, timestamp: false)
 *     end
 *
 * The local-identifier url is "/files/~<card>/<action><ext>"
 * (localAttachmentUrl — the tilde MARK form, FileCardUploader::Path#
 * local_url); a missing child is Ruby's `file&.url` on a new card -> nil,
 * which the caller renders as "". The right/asset_output :not_found live
 * branch reaches this surface — Ruby's `outputter.update_asset_output_live`
 * runs it with self = the CARD, so the bare `asset_output_url` inside
 * resolves as a card method (unlike the VIEW body's bare call, which lands
 * on the format — see assetOutputUrlView). */
function cardAssetOutputUrl(ctx: ViewContext): string {
  const child = fetchAssetOutputCard(ctx);
  return localAttachmentUrl(child?.dbContent ?? "");
}

/** asset_outputter.rb:61-63 view :asset_output_url:
 *
 *     view :asset_output_url do
 *       asset_output_url
 *     end
 *
 * The view block's self is the FORMAT, not the card, so the bare call hits
 * the format's method_missing (card format/method_delegation.rb:41-47);
 * the name is not render-shaped, so the delegation lands on the ActionView
 * context (:73 delegate_to_action_view -> CardActionView), which carries
 * no such helper — NoMethodError "undefined method `asset_output_url' for
 * #<Card::Format::CardActionView:0x...>".
 *
 * The port makes the same lookup: the bare call is resolved on the format.
 * The engine's format defines no asset_output_url (the method lives on the
 * card, cardAssetOutputUrl), and the engine has no ActionView context with
 * helpers to delegate to, so the lookup fails as Ruby's does and raises
 * NoMethodError. The receiver is named in Ruby's default-inspect shape for the
 * CardActionView the delegation lands on (rubyDefaultInspect): the class is
 * Ruby's, the address digits are the engine's own identity (N9 masks them).
 *
 * Ruby source of the failure: card-mod-assets-0.20.0
 * set/abstract/asset_outputter.rb:62 (the bare call), raised at
 * card-1.110.0 lib/card/format/method_delegation.rb:73
 * (delegate_to_action_view, reached from method_missing at :45).
 * The CARD-level method keeps its port in cardAssetOutputUrl, which the
 * :not_found live branch calls. */
const assetOutputUrlView: ViewFn = (ctx) => {
  const format = ctx.fmt as unknown as Record<string, unknown>;
  const method = format["asset_output_url"];
  if (typeof method === "function") return String(method.call(ctx.fmt));
  throw new NoMethodError(
    "undefined method `asset_output_url' for " +
      rubyDefaultInspect("Card::Format::CardActionView", stableIdentity(ctx.fmt.card.name.s)),
  );
};

/** The Abstract::AssetOutputter membership check behind
 *  update_asset_output_live? (right/asset_output.rb:31-33:
 *  `outputter.is_a?(Abstract::AssetOutputter) && !outputter.locked?`).
 *  The abstract is included by the TypePlusRight::Set::Style
 *  (card-mod-style) and TypePlusRight::Set::Script (card-mod-script) set
 *  modules, so the set-key tokens those modules produce on the LEFT card
 *  are the membership test the headless engine can run. The `locked?` half
 *  is Abstract::Lock's cross-process file lock — a single-process engine
 *  is never locked, so that half is a named remainder (always false here). */
function leftIsAssetOutputter(ctx: ViewContext): boolean {
  const card = ctx.fmt.card;
  if (!card.name.s.includes("+")) return false; // a right card always is
  const leftName = card.name.s.slice(0, card.name.s.lastIndexOf("+"));
  const engine = ctx.fmt.engine as {
    fetchRenderCard?: (name: string) => { setKeys: string } | undefined;
  };
  const left = engine.fetchRenderCard?.(leftName);
  if (left === undefined) return false;
  return left.setKeys.includes("TYPE_PLUS_RIGHT-set-Xstyle") ||
    left.setKeys.includes("TYPE_PLUS_RIGHT-set-Xscript");
}

/** set/right/asset_output.rb:24-29 view :not_found:
 *    return super() unless update_asset_output_live?
 *    root.error_status = 302
 *    outputter.update_asset_output_live
 *  The live branch's BYTES are `card_path asset_output_url` — the output
 *  url string. Ruby re-writes the output on every render (the emitted
 *  file name embeds an incrementing action id), while
 *  the headless view renders the url of the output that exists; the write
 *  itself is the async storeAssetOutput seam the server composition calls,
 *  since a ViewFn is synchronous. When the rendered card IS the
 *  `+*asset output` child, the url reads from the card's own db_content
 *  (the child exists by definition); from the outputter's side it reads
 *  through the card-level method port (cardAssetOutputUrl). The 302 is
 *  root-format response state (the engine has no root.error_status
 *  surface — same remainder as :bad_address). A non-outputter left
 *  delegates via super() to the chain's next :not_found (the standard
 *  not_found shape). */
const assetOutputNotFoundView: ViewFn = (ctx) => {
  if (!leftIsAssetOutputter(ctx)) {
    return superView(ctx, "Right::AssetOutput", "not_found");
  }
  const card = ctx.fmt.card;
  if (card.name.s.endsWith("+*asset output")) {
    return localAttachmentUrl(card.dbContent);
  }
  return cardAssetOutputUrl(ctx);
};


// ---------------------------------------------------------------------------
// set/right/group_remote.rb - the card-level methods, then the format :html
// block
// ---------------------------------------------------------------------------

/** group_remote.rb:25-27 urls: `item_configs.map { |path| path["src"] }`.
 *  The Ruby mod's URL source is the manifest's `remote` group
 *  (`item_configs = left.manifest_group_items("remote")`,
 *  group_remote.rb:20-23), and the canonical `content` is exactly this URL
 *  list joined by newlines (group_remote.rb:29-31). The card's stored
 *  content is therefore the URL list one-per-line; the headless port reads
 *  it back as the view's URL source (the body that produced db_content in
 *  Ruby is the same body that consumes it here, byte-for-byte). Empty
 *  lines are filtered so a trailing newline on the card is harmless.
 *
 *  group_remote.rb:38 `delegate :urls, to: :card` exposes the card-level
 *  `urls` as `format.urls`; the port has no format-class delegation
 *  surface, so this helper reads `card.dbContent` directly (the same field
 *  the delegate reads through) and is the one URL source - the failure
 *  mode for "card has no urls" is centralized here. */
function urlsFor(ctx: ViewContext): string[] {
  const raw = ctx.fmt.card.dbContent ?? "";
  if (raw === "") return [];
  return raw.split("\n").filter((line) => line !== "");
}

/** group_remote.rb:40-42 view :core: `list_group urls` - the bootstrap
 *  list_group helper (card-mod-bootstrap set/all/bootstrap/helper.rb:12-19)
 *  over the same urlsFor URL source the two tag views read (ported
 *  2026-10-19; the helper's byte shape is haml-file-views.ts listGroup -
 *  the mod_asset group_list template already renders through it). */
const groupRemoteCoreView: ViewFn = (ctx) => listGroup(urlsFor(ctx));

/** set/abstract/01_manifest_group.rb:4-6 view :core: `list_group
 *  card.item_names` (ported 2026-10-19). item_names is the collection
 *  item-name parse (collection item.rb - the content read as a newline
 *  list, [[ ]] marks stripped; the identical parse the json :content
 *  override runs, format-families.ts itemNamesOf). The abstract reaches
 *  cards only through the concrete sets that include it (set-include-graph:
 *  Right::GroupRemote, Type::Local*ManifestGroup), never globally - Ruby's
 *  include_set scoping. */
const manifestGroupCoreView: ViewFn = (ctx) =>
  listGroup(
    (ctx.fmt.card.dbContent ?? "")
      .split(/\n+/)
      .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
      .filter((s) => s !== ""),
  );

/** group_remote.rb:44-48 view :javascript_include_tag, cache: :never:
 *  `urls.map { |path| javascript_include_tag path }.join("\n")`. Rails'
 *  javascript_include_tag helper, given a remote URL (no asset-pipeline
 *  digest lookup), emits `<script src="<url>"></script>` (Rails'
 *  asset_tag_helper.rb#javascript_include_tag falls through to
 *  javascript_src_tag, which renders that exact byte shape for a plain URL
 *  with no extension-based source lookup). One tag per URL, joined by a
 *  single newline. The `cache: :never` config (view_opts.rb's VIEW_SETTINGS
 *  list) carries through to ModViewConfigTable; the runtime cache layer
 *  consults it via the render path's view-config consultation. */
const javascriptIncludeTagView: ViewFn = (ctx) => {
  const urls = urlsFor(ctx);
  return urls.map((path) => `<script src="${path}"></script>`).join("\n");
};

/** group_remote.rb:50-54 view :stylesheet_include_tag:
 *  `urls.map { |path| tag "link", href: path, media: "all", rel:
 *  "stylesheet", type: "text/css" }.join("\n")`. Rails' `tag` helper
 *  emits an HTML element with each named key=value attribute; the four
 *  keys here produce the exact bytes
 *  `<link href="<url>" media="all" rel="stylesheet" type="text/css" />`
 *  - Rails orders attributes per the option Hash's insertion order (the
 *  arg order in the view: href, media, rel, type - that is the byte
 *  order). One tag per URL, joined by a single newline. */
const stylesheetIncludeTagView: ViewFn = (ctx) => {
  const urls = urlsFor(ctx);
  return urls
    .map((path) => `<link href="${path}" media="all" rel="stylesheet" type="text/css" />`)
    .join("\n");
};

// ---------------------------------------------------------------------------
// set/abstract/mod_assets.rb - the group-card :core render (the group_list
// haml template).
// ---------------------------------------------------------------------------

/** mod_assets.rb:171-182 `format :html do view :core do ... haml
 *  :group_list, groups: groups`. The groups arrive pre-composed:
 *  [title, items] pairs where title is the group card's name tag
 *  ("group: local", "group: jquery", ...) and items the group's asset
 *  file names (folder/manifest groups — filesystem state the host mod
 *  mirrors) or the remote URLs (group_remote_card.urls). The template
 *  (set/abstract/mod_assets/group_list.haml, byte-shaped):
 *
 *    - groups.each do |(title, items)|
 *      %p
 *        %h5
 *          =title
 *        =list_group(items)
 *
 *  renders per group `<p>\n<h5>\n<title>\n</h5>\n<list_group>\n</p>`
 *  (haml: one newline after each open tag, the text line's trailing
 *  newline, the close on its own line); EACH ITERATION'S OUTPUT CARRIES A
 *  TRAILING NEWLINE (the haml block emits one "\n" after every %p
 *  iteration — the oracle's section wrapper shows `</ul>\n</p>\n</p>`, so
 *  the last group's `</p>` is newline-terminated). The bootstrap list_group
 *  helper wraps the items joined "\n" as
 *  `<ul class="list-group"><li class="list-group-item">NAME</li>...</ul>`
 *  (card-mod-bootstrap helper.rb:12-31 — the same shape
 *  core-mod.ts#listGroupHtml emits). Exported for the host-mod ports
 *  (card-mod-style / card-mod-script) whose type_plus_right/mod/{style,
 *  script} set modules own the view registrations. */
export function modAssetsGroupListHtml(
  groups: ReadonlyArray<readonly [string, readonly string[]]>,
): string {
  return groups
    .map(
      ([title, items]) =>
        `<p>\n<h5>\n${title}\n</h5>\n${listGroupOf(items)}\n</p>\n`,
    )
    .join("");
}

/** bootstrap helper.rb:20-31 list_tag over the group's item names. */
function listGroupOf(items: readonly string[]): string {
  if (items.length === 0) return `<ul class="list-group"></ul>`;
  return (
    `<ul class="list-group">` +
    items
      .map((item) => `<li class="list-group-item">${item}</li>`)
      .join("\n") +
    `</ul>`
  );
}

// ---------------------------------------------------------------------------
// the when: predicates (set/right/asset_output.rb, set/abstract/asset_inputter.rb)
// ---------------------------------------------------------------------------

/** The set-module methods Ruby's `when:` conditions reach with `send`
 *  (card/lib/card/set/event/all.rb:82) from the asset mod's event
 *  declarations. The deck-boot composition merges them into
 *  ModEventRuntime.predicates (default-mod-deck.ts). */
export const assetsModEventPredicates = {
  /** codename? (card/lib/card/codename.rb:10-12): `codename.present?`.
   *  Gates :remove_codename (set/right/asset_output.rb:13-17,
   *  :prepare_to_validate on :delete) — the to-be-deleted asset-output card
   *  releases its codename so nothing else resolves to it.
   *
   *  The codename column rides the event card as `codename` (mod-manifest.ts
   *  names it for this predicate); the engine's own delete path already
   *  reads the row's codename for the protected-card guard
   *  (validate_delete, set/all/trash.rb:31-34), so the state source fills
   *  the same field from the same row. `present?` is blankness, not mere
   *  non-null: an empty string is blank and answers false. */
  "codename?": (card: ModEventCard): boolean => {
    const codename = card.codename;
    return codename !== undefined && codename !== null && codename.trim() !== "";
  },
  /** asset_inputter? (set/abstract/asset_inputter.rb:72-74): `true`,
   *  marked "for override" — it is the set's own opt-in flag, true for
   *  every card that carries Abstract::AssetInputter. Gates
   *  :asset_input_changed (:finalize on :save, asset_inputter.rb:24-27) and
   *  :asset_input_changed_on_delete (:20-23, before :clear_references).
   *
   *  No set module in the deck's gem tree overrides it (the only definition
   *  is this one), so the answer is true wherever the set applies — which
   *  the dispatcher's set-scoping gate has already established by the time
   *  the predicate runs (set_condition_applies? runs before the `when:`
   *  condition, all.rb:16-22). It therefore states true directly rather
   *  than reading a state field: there is nothing left to resolve. */
  "asset_inputter?": (_card: ModEventCard): boolean => true,
} as const;

// ---------------------------------------------------------------------------
// the manifest (one setModules entry per gem file; format :html block holds
// the two mod-specific views)
// ---------------------------------------------------------------------------

const cardModAssets: DeckoModManifest = {
  name: "assets",
  gemName: "card-mod-assets",
  group: "gem-defaults",
  setModules: [
    {
      // cwwrite-seam port: set/right/asset_output.rb — the :not_found gate
      // view (format do block, :19-34). The Ruby block is the BASE format;
      // the headless chain serves it in html like the other base-format
      // ports (card-mod-format's all/error registrations). Registered here
      // so every `X+*asset output` card dispatches the gate instead of the
      // bare engine :not_found. followable?/history? are honored by the
      // action engine at the actual asset_output codename boundary.
      // ok_to_read? remains an engine-level read-permission surface.
      // Event — SKIPPED BY NAME (events tranche 4, 2026-10-20):
      // asset_output.rb:13-17 `event :remove_codename, :prepare_to_validate,
      // on: :delete, when: :codename?` loads the attachment (the carrierwave
      // mount, so the coded/local file resolves before the codename it is
      // addressed by is gone) then `self.codename = nil`, so the attribute
      // joins the delete's UPDATE. Ruby's chain effect: the codename is
      // BLANK by the time the :validate stage's validate_delete runs its
      // system-card check (trash.rb:31-34 `unless codename.blank?`), so a
      // codenamed +*asset output card is DELETABLE in Ruby.
      // The port cannot match this, three verified facts:
      // 1. The delete walk dispatches no prepare_to_validate stage at all —
      //    deleteCardInner runs initialize (card-action-engine.ts:4108) and
      //    validate (:4161) only, so an SP-stage body has no seam to fire
      //    in (the delete IS not modeled as an update save).
      // 2. The inline built-in codename arm runs at :4119-4135, BEFORE the
      //    validate-stage dispatch, and reads the stored row — a body that
      //    cleared the codename later could not un-refuse it.
      // 3. The body's `attachment` eager-load is carrierwave mount runtime
      //    (the unported lib/carrier_wave uploader surface), and the
      //    codename mutation would have to reach the trashCard write
      //    (:4205-4213) as a column in the delete's UPDATE — a write-order
      //    redesign, the same shape that keeps manage_trash/delete_children
      //    engine-owned (core-mod.ts header).
      // NAMED DIVERGENCE: deleting a codenamed +*asset output card is
      // refused "is is a system card" (:4127, en.yml:18) where Ruby deletes
      // it and clears the codename. Per the parity law: named, never faked
      // — the fn stays the honest stub carrying this evidence.
      setPath: "right/asset_output",
      events: [
        event({ event: "remove_codename", at: "prepare_to_validate", on: ["delete"], when: "codename?" }),
      ],
      formats: {
        html: {
          views: [{ view: "not_found", viewFn: assetOutputNotFoundView }],
        },
      },
    },
    {
      // cwwrite-seam port: set/abstract/asset_outputter.rb:61-63 view
      // :asset_output_url. Ruby hosts the view on the ABSTRACT module,
      // which the TypePlusRight::Set::Style (card-mod-style
      // set/type_plus_right/set/style.rb:1) and TypePlusRight::Set::Script
      // (card-mod-script set/type_plus_right/set/script.rb:1) set modules
      // include. The TS pattern surface has no abstract membership, so the
      // view registers on the two concrete includer sets — the very sets
      // the :not_found gate's outputter check reads (leftIsAssetOutputter).
      // Bookkeeping entry for the abstract file itself (basket parity, the
      // pattern other mods' abstract surfaces use).
      //
      // Events — ENGINE-OWNED: the write
      // path's asset-event runner (src/card/actions/style-asset-events.ts)
      // executes both at their stages: update_asset_output_file via
      // attachments/asset-output-write.ts storeAssetOutput (the lock +
      // assembled-content write, asset_outputter.rb:20-30), and
      // validate_asset_inputs via asset-input-assembly.ts's validate twin
      // (asset_outputter.rb:10-18's find_invalid_input guard).
      setPath: "abstract/asset_outputter",
      events: [
        engineOwnedEvent({ event: "update_asset_output_file", at: "finalize", on: ["save"] }),
        engineOwnedEvent({ event: "validate_asset_inputs", at: "validate", on: ["save"], skip: "allowed" }),
      ],
    },
    {
      // set/abstract/asset_inputter.rb — the input side of the asset
      // pipeline (card_accessor :asset_input + the two change events).
      // Events ENGINE-OWNED: style-asset-events.ts runs both
      // (asset_inputter.rb:24-27 at finalize on save — the inputter's
      // +*asset input virtual content re-store; :20-23 on delete, before
      // clear_references — the referers walk that re-stores dependents
      // before the references die). Ruby's `before: :clear_references`
      // clears @stage (options.rb:76) and hangs the event on
      // clear_references' callback chain; clear_references is an ENGINE
      // builtin (card-action-engine.ts's reference janitors), not a
      // registered event, so the name resolves to no registry entry and
      // the delete arm is a candidate in none of the nine save stages —
      // the engine's delete path owns the position.
      setPath: "abstract/asset_inputter",
      events: [
        engineOwnedEvent({
          event: "asset_input_changed",
          at: "finalize",
          on: ["save"],
          when: "asset_inputter?",
          changed: ["content"],
          skip: "allowed",
        }),
        engineOwnedEvent({
          event: "asset_input_changed_on_delete",
          before: "clear_references",
          on: ["delete"],
          when: "asset_inputter?",
        }),
      ],
    },
    {
      setPath: "type_plus_right/set/style",
      formats: {
        html: {
          views: [{ view: "asset_output_url", viewFn: assetOutputUrlView }],
        },
      },
    },
    {
      setPath: "type_plus_right/set/script",
      formats: {
        html: {
          views: [{ view: "asset_output_url", viewFn: assetOutputUrlView }],
        },
      },
    },
    {
      // card-mod-assets-0.20.0/set/right/group_remote.rb (the only set file
      // in this gem with portable html views)
      setPath: "right/group_remote",
      formats: {
        html: {
          views: [
            // group_remote.rb:40-42 - list_group urls
            { view: "core", viewFn: groupRemoteCoreView },
            // group_remote.rb:44-48
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { cache: "never" },
            },
            // group_remote.rb:50-54
            {
              view: "stylesheet_include_tag",
              viewFn: stylesheetIncludeTagView,
            },
          ],
        },
      },
    },
    // The gem tree's remaining set files (registered 2026-10-19 so the
    // basket reflects the gem; each file's own surface):
    // - abstract/01_manifest_group: view :core (list_group card.item_names,
    //   manifestGroupCoreView) - REGISTERED ON ITS CONCRETE INCLUDERS below
    //   (type/local_{script,style}_manifest_group, the set-include-graph's
    //   ManifestGroup includers), the type_plus_right/set/{style,script}
    //   precedent: an abstract-pattern registration would FLAT-register
    //   (the loader's kind filter only excludes nonbase) and mask the
    //   engine's :core deck-wide, which Ruby's include_set scoping never
    //   does.
    // - abstract/asset_file: view :javascript_include_tag (:55-59) reads
    //   the asset file's compiled bytes off DISK and calls Rails'
    //   javascript_include_tag on them - the filesystem surface named in
    //   the header; no registration.
    // - abstract/asset_group, abstract/folder_group,
    //   abstract/local_manifest_group: include_set wiring only
    //   (ReadOnly/Sources/Items/ManifestGroup) - no views, no events.
    // - abstract/mod_assets: view :core (:171-182) walks
    //   group_remote_card.urls + item_cards + input_item_cards (the
    //   remote-manifest fetch and the compile-input machinery); the
    //   card-driven walk has no port surface - the deck-pinned
    //   modAssetGroupsCoreHtml (haml-file-views.ts) stays the caller-fed
    //   variant.
    // - right/asset_input: Abstract::VirtualCache + virtual_content
    //   (left.assemble_asset_input_content - the compile-input assembly);
    //   no views, no events.
    // - type/mod: empty (the Mod cardtype's asset surface is
    //   Abstract::ModAssets's includer walk).
    { setPath: "abstract/01_manifest_group" },
    { setPath: "abstract/asset_file" },
    { setPath: "abstract/asset_group" },
    { setPath: "abstract/folder_group" },
    { setPath: "abstract/local_manifest_group" },
    { setPath: "abstract/mod_assets" },
    { setPath: "right/asset_input" },
    { setPath: "type/mod" },
    // 01_manifest_group.rb:4-6 view :core on the abstract's CONCRETE
    // includers (set-include-graph.ts: the ManifestGroup html includers;
    // Right::GroupRemote carries its own :core above, which Ruby's MRO
    // - own module before the included abstract - also puts first).
    {
      setPath: "type/local_script_manifest_group",
      formats: { html: { views: [{ view: "core", viewFn: manifestGroupCoreView }] } },
    },
    {
      setPath: "type/local_style_manifest_group",
      formats: { html: { views: [{ view: "core", viewFn: manifestGroupCoreView }] } },
    },
  ],
};

export default cardModAssets;

// Internal view fns exported so the test file can verify byte parity
// directly (the same seam card-mod-carrierwave.ts exposes).
export { assetOutputUrlView, assetOutputNotFoundView };
