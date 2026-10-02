// haml-file-views.ts - the two `haml_file` views, built on the Haml subset
// compiler in haml-slice-compiler.ts.
//
// The views (verbatim from the gems):
//
//   card-mod-content set/abstract/haml_file.rb:20-22
//     view :core do
//       haml card.content, haml_locals
//     end
//
//   card-mod-assets set/abstract/mod_assets.rb:171-182
//     view :core do
//       groups = []
//       urls = card.group_remote_card.urls
//       groups << ["group: remote", urls] if urls.present?
//       card.item_cards.map do |item|
//         groups << [item.cardname.tag, item.input_item_cards.map(&:name)]
//       end
//       haml :group_list, groups: groups
//     end
//
// Both land in `haml card.content / :group_list` ->
// card-mod-format set/all/haml.rb:41-47 -> :61-69 ->
// Card::Set::Format::HamlPaths#haml_to_html (haml_paths.rb:8-14), which is
// `Haml::Engine.new(haml).render(binding, locals)` with NO options hash.
// haml-slice-compiler.ts reproduces those bytes; the byte truth is pinned in
// fixtures/captured/haml-slice/ (53 live-Decko group_list cases + 102
// measured Haml 5.2.2 cases).
//
// WHAT IS NOT HERE, and why
// ------------------------
// `card.item_cards` walks the mod's asset manifest
// (mod_assets.rb:15-38 local_group_cards -> manifest_exists? ->
// local_manifest_group_cards, else folder_group_card), and
// `input_item_cards` walks the inputter side. Both are filesystem reads of a
// mod's `assets/manifest.yml` - a railtie-side surface the headless engine
// has no source for. Rather than invent a group list, groupsFor() reads the
// SAME canonical field the mod's own views already read: the card's stored
// content, one entry per line, the first line being the group title
// (card-mod-assets set/right/group_remote.rb:25-31 puts the URL list in
// exactly that shape, and the port reads it there too).
// A card with no such content yields groups = [] and the view renders the
// EMPTY STRING - which is exactly what the live oracle produces for a mod
// with no assets (probe: the 5 Mod cards with no asset folder render a
// 14-45 byte :core that contains no group_list block at all).
//
// The seam is named and one line wide, so the manifest reader can replace it
// when the engine grows a mod-filesystem source.

import { compileHaml } from "./haml-slice-compiler.js";
import type { HamlScope } from "./haml-slice-compiler.js";
import type { ViewContext, ViewFn } from "./format.js";

/** card-mod-assets group_list.haml, byte for byte. The fixture asserts the
 *  pinned copy matches the gem file (tests/card/render/
 *  haml-slice-compiler.test.ts, "the fixture's template is the gem's
 *  group_list.haml byte for byte"). */
export const GROUP_LIST_HAML =
  "- groups.each do |(title, items)|\n" +
  "  %p\n" +
  "    %h5\n" +
  "      =title\n" +
  "    =list_group(items)\n";

/** The bootstrap helper group_list.haml calls
 *  (card-mod-bootstrap set/all/bootstrap/helper.rb:12-19, delegating to
 *  list_tag -> list_item_tags -> wrap_with). The bytes it produces were
 *  captured from the LIVE deck through a real Card::Format and are quoted
 *  here verbatim, because they are the byte truth and they are NOT what a
 *  reader would guess:
 *
 *    two items  -> `<ul class="list-group"><li class="list-group-item">x.css</li>\n<li class="list-group-item">y.js</li></ul>`
 *    no items   -> `<ul class="list-group"></ul>`
 *    item "a&b" -> `<ul class="list-group"><li class="list-group-item">a&b</li></ul>`  (NOT escaped)
 *    item "<script>alert(1)</script>" -> passed through verbatim
 *
 *  The last two are MEASURED (fixtures/captured/haml-slice/
 *  assets-core-group-list.json, cases edge-amp / edge-tag / edge-escaped),
 *  not assumed: in this deck the helper does not escape its item text. */
function listGroup(items: unknown): string {
  const list = (Array.isArray(items) ? items : [items]).filter(
    (i) => i !== null && i !== undefined,
  );
  return `<ul class="list-group">${list
    .map((i) => `<li class="list-group-item">${String(i)}</li>`)
    .join("\n")}</ul>`;
}

/** The `groups` local mod_assets.rb:172-179 builds. */
export function groupsFor(ctx: ViewContext): [string, string[]][] {
  const raw = ctx.fmt.card.dbContent ?? "";
  const lines = raw.split("\n").filter((l) => l !== "");
  if (lines.length === 0) return [];
  const [title, ...items] = lines;
  return [[title!, items]];
}

/** card-mod-assets set/abstract/mod_assets.rb:171-182 view :core.
 *
 *  mm-cstructural (2026-09-30): split so a caller with the groups already
 *  in hand (the Mod page's Styles/Scripts sections, whose child card is a
 *  VIRTUAL card whose content is the mod gem's asset tree — a headless
 *  engine has no such tree, so core-mod.ts supplies the deck-pinned groups
 *  and calls this) renders the identical bytes. The card-driven entry
 *  point below is unchanged. */
export function modAssetGroupsCoreHtml(
  groups: readonly (readonly [string, readonly string[]])[],
): string {
  const scope: HamlScope = {
    locals: { groups: groups.map(([title, items]): [string, string[]] => [title, [...items]]) },
    helpers: { list_group: listGroup },
  };
  return compileHaml(GROUP_LIST_HAML, scope);
}

export const modAssetsCoreView: ViewFn = (ctx) => modAssetGroupsCoreHtml(groupsFor(ctx));

/** card-mod-content set/abstract/haml_file.rb:16-22.
 *
 *  `haml_locals` is `{}` in the gem (haml_file.rb:16-18) and the template is
 *  `File.read template_path` (haml_file.rb:7-9) - a mod-local FILE, not the
 *  card's DB content. In the headless engine the stored body is the only
 *  template source available, so that is what compiles here; a card with no
 *  body compiles the empty template to the empty string, which is what Ruby
 *  does for an empty `File.read`. */
export function hamlFileCoreView(
  ctx: ViewContext,
  options: { template?: string; locals?: Record<string, unknown> } = {},
): string {
  const template = options.template ?? ctx.fmt.card.dbContent ?? "";
  const scope: HamlScope = {
    locals: options.locals ?? {},
    helpers: { list_group: listGroup },
  };
  return compileHaml(template, scope);
}
