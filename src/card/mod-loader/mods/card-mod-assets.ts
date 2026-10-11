// The card-mod-assets gem (card-mod-assets-0.20.0), ported through the mod
// loader.
//
// The gem's tree (the installed
// card-mod-assets-0.20.0/): twelve set files (8 abstract, 3 right, 1 type),
// one lib/ module (Card::Assets - boot-time asset pipeline driver), one
// HAML template, one manifest.yml transform, and a config/locales tree.
// The T6 verdict (tools/compat-report/mod-compat-report.json, gem ===
// 'card-mod-assets-0.20.0', metrics.htmlViewsMissingNames) lists the two
// html views the engine does not already cover: :javascript_include_tag
// and :stylesheet_include_tag - both are gem-specific (the engine's
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
// - set/abstract/01_manifest_group.rb:4-7 view :core and
//   set/abstract/mod_assets.rb:171-182 view :core - both override the
//   engine's :core with `list_group card.item_names` /
//   `haml :group_list, groups: groups`; the List-group / HAML renderer
//   surfaces are not in the TS engine's :core path, and the engine's :core
//   (src/card/render/views.ts:163 coreView) already serves the structural
//   bytes these cards need at runtime.
// - set/right/asset_output.rb:24-29 view :not_found + set/abstract/
//   asset_outputter.rb:61-63 view :asset_output_url - PORTED in the
//   the Cloudflare write seam (2026-09-28, oracle-pinned). The blockers named
//   above moved: the attachment write (80eb1b4) landed the attachment write
//   path (LocalAttachmentStore + engine attachment), so the url
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
import { localAttachmentUrl } from "../../attachments/asset-output-write.js";
import { superView } from "../mod-view-helpers.js";
import type {
  DeckoModManifest,
  ModEventFn,
  ModEventRegistration,
} from "../mod-manifest.js";
import { engineOwnedEvent } from "../mod-manifest.js";

/** The set-module event declarations (the set-module event, 2026-10-08):
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
// Oracle-pinned by live renders of the booted oracle app.
// ---------------------------------------------------------------------------

/** The `+*asset output` child of a card, fetched through the engine's
 *  render-card cache. Ruby's card_accessor generates asset_output_card
 *  (fetch-or-new); a missing child reads as undefined here and the views
 *  render the Ruby new-card shape (file&.url -> nil -> ""). */
function fetchAssetOutputCard(ctx: ViewContext): { dbContent: string } | undefined {
  const card = ctx.fmt.card;
  const childName = `${card.name.s}+*asset output`;
  const engine = ctx.fmt.engine as {
    fetchRenderCard?: (name: string) => { dbContent: string } | undefined;
  };
  return engine.fetchRenderCard?.(childName);
}

/** asset_outputter.rb:61-63 view :asset_output_url -> asset_output_url
 *  (:78-82) = `asset_output_card.file&.url`. The local-identifier url is
 *  the oracle-pinned "/files/~<card>/<action><ext>" (localAttachmentUrl —
 *  the tilde MARK form, FileCardUploader::Path#local_url). A missing child
 *  renders "" (Ruby: file&.url on a new card -> nil). NOTE: Ruby's bare
 *  `asset_output_url` call inside the view body raises NoMethodError
 *  through the format's ActionView delegation (captured in the oracle
 *  JSON); the card-level method's bytes are the view's intent and this
 *  port. */
const assetOutputUrlView: ViewFn = (ctx) => {
  const child = fetchAssetOutputCard(ctx);
  return localAttachmentUrl(child?.dbContent ?? "");
};

/** The Abstract::AssetOutputter membership check behind
 *  update_asset_output_live? (right/asset_output.rb:31-33:
 *  `outputter.is_a?(Abstract::AssetOutputter) && !outputter.locked?`).
 *  The abstract is included by the TypePlusRight::Set::Style
 *  (card-mod-style) and TypePlusRight::Set::Script (card-mod-script) set
 *  modules, so the set-key tokens those modules produce on the LEFT card
 *  are the membership test the headless engine can run. The `locked?` half
 *  is Abstract::Lock's cross-process file lock — a single-process engine
 *  is never locked (oracle: outputter_locked false); named remainder. */
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
 *  url string (oracle: view_not_found_first = "/files/~447/1790661047.css";
 *  Ruby re-writes the output on every render — 1790661047 then 1790661048 —
 *  the headless view renders the url of the output that exists; the write
 *  itself is the async storeAssetOutput seam the server composition calls,
 *  since a ViewFn is synchronous). When the rendered card IS the
 *  `+*asset output` child, the url reads from the card's own db_content
 *  (the child exists by definition); from the outputter's side it reads
 *  through the child fetch (assetOutputUrlView). The 302 is root-format
 *  response state (the engine has no root.error_status surface — same
 *  remainder as :bad_address). A non-outputter left delegates via super()
 *  to the chain's next :not_found (oracle not_found_super: the standard
 *  not_found shape). */
const assetOutputNotFoundView: ViewFn = (ctx) => {
  if (!leftIsAssetOutputter(ctx)) {
    return superView(ctx, "Right::AssetOutput", "not_found");
  }
  const card = ctx.fmt.card;
  if (card.name.s.endsWith("+*asset output")) {
    return localAttachmentUrl(card.dbContent);
  }
  return assetOutputUrlView(ctx);
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

/** group_remote.rb:44-48 view :javascript_include_tag, cache: :never:
 *  `urls.map { |path| javascript_include_tag path }.join("\n")`. Rails'
 *  javascript_include_tag helper, given a remote URL (no asset-pipeline
 *  digest lookup), emits `<script src="<url>"></script>` (Rails'
 *  asset_tag_helper.rb#javascript_include_tag falls through to
 *  javascript_src_tag, which renders that exact byte shape for a plain URL
 *  with no extension-based source lookup). One tag per URL, joined by a
 *  single newline. The `cache: :never` config (view_opts.rb's VIEW_SETTINGS
 *  list) carries through to ModViewConfigTable; the runtime cache layer
 *  consults it via the coordinator's render-pipeline integration. */
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
// haml template). Oracle-pinned: fixtures/captured/admin-view-pins.json
// mod_format_card views :styles/:scripts (the nested +*style/+*script
// group renders), captured 2026-09-29 with the no-write proof.
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
      // bare engine :not_found. NOT ported from the same file:
      // followable?/ok_to_read?/history? (the read-permission and history
      // surfaces are engine-level).
      // Event (set-module event 2026-10-08) — STUB, named remainder:
      // asset_output.rb:13-17 `event :remove_codename, :prepare_to_validate,
      // on: :delete, when: :codename?` loads the attachment then strips the
      // codename so the to-be-deleted card releases it; the engine's delete
      // path has no codename-mutation hook (the port's codename registry is
      // read-only at delete).
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
      // Events (set-module event 2026-10-08) — ENGINE-OWNED: the write
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
      // hangs the event on clear_references' chain (itself a :finalize
      // on: :delete event); the surface records the resolved stage and
      // the engine's delete path owns the position (the check_setup
      // precedent).
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
          at: "finalize",
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
  ],
};

export default cardModAssets;

// Internal view fns exported so the test file can verify byte parity
// directly (the same seam card-mod-carrierwave.ts exposes).
export { assetOutputUrlView, assetOutputNotFoundView };
