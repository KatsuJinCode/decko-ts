// The asset-input ASSEMBLY — the port of the half of
// card-mod-assets-0.20.0's Abstract::AssetOutputter/Abstract::AssetInputter
// machinery that the write seam (asset-output-write.ts) named as its gap:
// storeAssetOutput takes ASSEMBLED content; this module produces that
// assembly.
//
//   asset_outputter.rb:20-25 update_asset_output:
//     `lock { store_output input_from_item_cards }`
//   asset_outputter.rb:32-34 input_from_item_cards joint="\n":
//     `input_item_cards.map(&:asset_input_content).compact.join(joint)`
//   asset_outputter.rb:74-76 input_item_cards:
//     `item_cards(known_only: true).compact.reject(&:trash)`
//   asset_inputter.rb:44-49 asset_input_content:
//     `return assemble_asset_input_content if virtual?`
//     `update_asset_input if asset_input.blank?`
//     `asset_input`
//   asset_inputter.rb:51-53 assemble_asset_input_content:
//     `format(input_format).render input_view`   (input_view :core default,
//     asset_inputter.rb:55-57)
//   right/asset_input.rb — the `+*asset input` child (card_accessor
//     :asset_input, type: :plain_text, asset_inputter.rb:1) is an
//     Abstract::VirtualCache card: `virtual? -> new?`,
//     `virtual_content -> left.assemble_asset_input_content`, and its
//     save_virtual_content event ABORTS :success — the child never persists a
//     row; its content is always the live (or in-process-cached) assemble of
//     its left. Oracle-pinned by live renders of the booted oracle app
//     (2026-09-29): every probed +*asset input child reads id=null,
//     virtual?=true, db_content == the left's assemble bytes byte-identically
//     (yeti skin 369,624B; all 15 mod script groups likewise).
//
// BRANCH COLLAPSE the pins force: for a non-virtual inputter,
// `asset_input` reads the child card's content, and the child's content is
// ALWAYS the left's assemble (VirtualCache) — so asset_input_content bottoms
// out in assembleAssetInputContent for every card shape. The `update_asset_input`
// side effects (the bot-scope child touch, update_referers_after_input_changed,
// refresh_asset / asset_input_needs_refresh? source-mtime checks) are the
// save/lifecycle machinery — the in-process Virtual cache exists for Ruby's
// cross-render perf, never shaping bytes; named remainder, not a gap.
//
// THE GROUP OVERRIDE: the asset group cards (the virtual
// "+group: <name>" children of mod asset cards) OVERRIDE asset_input_content
// outright — card-mod-style set/abstract/style_group.rb:5-7
// (`format(:scss).render_core`) and card-mod-script
// set/abstract/script_group.rb:5-7 (`format(:js).render_core`); their
// format :core joins their file-card leaves (style_group.rb:9-15;
// script_group.rb:11-13 render_items_and_compress). The four
// local_*_folder/manifest_group TYPE tokens carry the override in the
// registry below (groupOverride).
//
// THE LEAVES are the named remainder: `format(input_format).render(input_view)`
// bottoms out in SassC compiles (card-mod-style 01_css.rb:57-59 compress,
// 02_scss.rb:22-27 compile_scss — BOTH compress? arms compile), CoffeeScript
// compiles (card-mod-script 02_coffee_script.rb:20-22) and the mod
// asset-directory walk (card-mod-assets asset_group.rb:15-18 relative_paths,
// asset_file.rb:5-9 paths) — none of which the headless engine carries. The
// oracle deck's env pins compress_assets=false (card-1.110.0
// lib/cardio/railtie.rb:35 defaults true; the live dev deck overrides —
// its reported config carries compress_assets=false), so
// the js compressed leaves render `"// <file name>\n" + core` unminified
// (00_script.rb:20-22 comment_with_source + :25-27 identity compress) — but
// the coffee/sass compiles and the directory walk still sit below them.
// deps.renderInputView is the seam: a caller with those engines provides the
// leaf renders; this module owns the WALK and the JOIN, which the oracle
// byte-pins whole (fixtures/carrierwave-input-half-oracle/: the nine
// fully-captured components and the oracle-computed 15,968B assembly).
//
// THE VALIDATE TWIN: asset_outputter.rb:10-18 validate_asset_inputs rejects a
// save whose items do not respond to asset_input_content
// (`find_invalid_input`; live: creating a rule with an unknown item was
// rejected "Content Oracle Cw Ghost is not a valid asset input card",
// 2026-09-29). Ruby's bare input_from_item_cards raises NoMethodError for
// such an item; the port's guard is findInvalidInput and assetInputContent
// returns null past it (the .compact then drops it — documented divergence:
// Ruby raises, the port relies on the same guard the save path runs).

import { rawItemStrings } from "../render/pointer-list.js";

export type AssetInputFormat = "scss" | "css" | "js";

/** The card shape the assembly reads (a fetched record or a test double).
 *  `virtual` is Ruby's virtual? — undefined derives it as id === undefined
 *  (VirtualCache cards and the Card.new asset-file/group cards are exactly
 *  the id-less shapes; oracle: +*asset input children id=null). */
export interface AssetInputCardRef {
  name: string;
  dbContent?: string | null;
  setKeys?: string;
  id?: number;
  trash?: boolean;
  virtual?: boolean;
}

/** The assembly's two needs: item resolution (the fetch engine) and the
 *  leaf render (format(input_format).render(input_view)). Structural — a
 *  test double satisfies it. */
export interface AssetInputDeps {
  fetchByName(
    name: string,
  ): AssetInputCardRef | undefined | Promise<AssetInputCardRef | undefined>;
  renderInputView(
    item: AssetInputCardRef,
    format: AssetInputFormat,
    view: string,
  ): string | null | Promise<string | null>;
}

/** One include_set Abstract::AssetInputter option pair — Ruby:
 *  `include_set Abstract::AssetInputter, input_format: X, input_view: Y`
 *  defines per-set-class attr_readers the MRO resolves. `groupOverride`
 *  marks the style_group/script_group cards, whose asset_input_content
 *  override renders format(format).render(:core) REGARDLESS of the
 *  inputter default (and who never read a +*asset input child). */
export interface AssetInputFormatSpec {
  format: AssetInputFormat;
  view: string;
  groupOverride?: boolean;
}

/** The registry: every gem include line + the two group overrides, keyed by
 *  the set-keys token the engine's safeSetKeys emits for that set
 *  (set-keys.ts: the space-joined token form, star-card keys X-prefixed —
 *  "*all+*read" emits "TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread"). */
const ASSET_INPUT_FORMAT_RULES: ReadonlyArray<{ token: string; spec: AssetInputFormatSpec }> = [
  // card-mod-style-0.20.0 set/self/style_mods.rb:1
  { token: "SELF-style_mod", spec: { format: "scss", view: "core" } },
  // card-mod-style-0.20.0 set/type_plus_right/mod/style.rb:4
  { token: "TYPE_PLUS_RIGHT-mod-Xstyle", spec: { format: "scss", view: "core" } },
  // card-mod-script-0.20.0 set/type_plus_right/mod/script.rb:2
  { token: "TYPE_PLUS_RIGHT-mod-Xscript", spec: { format: "js", view: "core" } },
  // card-mod-style-0.20.0 set/type/css.rb:2
  { token: "TYPE-css", spec: { format: "css", view: "compressed" } },
  // card-mod-style-0.20.0 set/type/scss.rb:2
  { token: "TYPE-scss", spec: { format: "scss", view: "core" } },
  // card-mod-style-0.20.0 set/type/skin.rb:1-2
  { token: "TYPE-skin", spec: { format: "css", view: "concat" } },
  // card-mod-bootstrap-0.20.0 set/type/bootswatch_skin.rb:30
  { token: "TYPE-bootswatch_skin", spec: { format: "css", view: "compressed" } },
  // card-mod-script-0.20.0 set/abstract/00_script.rb:6 — the JavaScript /
  // CoffeeScript types include Abstract::Script (01_java_script.rb:4,
  // 02_coffee_script.rb:6)
  { token: "TYPE-java_script", spec: { format: "js", view: "compressed" } },
  { token: "TYPE-coffee_script", spec: { format: "js", view: "compressed" } },
  // the group overrides: card-mod-style set/abstract/style_group.rb:5-7 rides
  // the local STYLE folder/manifest group types (type_plus_right/mod/style.rb
  // folder_group_type_id/local_manifest_group_type_id), card-mod-script
  // set/abstract/script_group.rb:5-7 the local SCRIPT ones
  // (type_plus_right/mod/script.rb:17-21)
  { token: "TYPE-local_style_folder_group", spec: { format: "scss", view: "core", groupOverride: true } },
  { token: "TYPE-local_style_manifest_group", spec: { format: "scss", view: "core", groupOverride: true } },
  { token: "TYPE-local_script_folder_group", spec: { format: "js", view: "core", groupOverride: true } },
  { token: "TYPE-local_script_manifest_group", spec: { format: "js", view: "core", groupOverride: true } },
];

/** The card's input format/view — Ruby's `input_format`/`input_view` methods
 *  (:44-57). undefined = the card does not carry the AssetInputter machinery
 *  (nor the group override), i.e. `respond_to?(:asset_input_content)` is
 *  false — the find_invalid_input predicate. */
export function inputFormatFor(setKeys: string | undefined): AssetInputFormatSpec | undefined {
  if (setKeys === undefined || setKeys === "") return undefined;
  const tokens = setKeys.split(/\s+/);
  for (const { token, spec } of ASSET_INPUT_FORMAT_RULES) {
    if (tokens.includes(token)) return spec;
  }
  return undefined;
}

/** right/asset_input.rb — the +*asset input child's name (card_accessor
 *  :asset_input; the write seam's store side owns the sibling
 *  "+*asset output" child). */
export function assetInputCardName(itemName: string): string {
  return `${itemName}+*asset input`;
}

function isVirtualItem(item: AssetInputCardRef): boolean {
  return item.virtual ?? item.id === undefined;
}

/** asset_outputter.rb:74-76 input_item_cards:
 *  `item_cards(known_only: true).compact.reject(&:trash)` — the outputter's
 *  list items parsed the way card-mod-list set/all/item.rb#raw_item_strings
 *  parses them (split /\n+/, [[ ]] stripped), unknown names dropped
 *  (known_only), trashed rows rejected. A missing outputter is Ruby's
 *  Card::Error::NotFound (render.ts throws the same shape). */
export async function inputItemCards(
  deps: AssetInputDeps,
  outputterName: string,
): Promise<AssetInputCardRef[]> {
  const outputter = await deps.fetchByName(outputterName);
  if (outputter === undefined) {
    throw new Error(`card not found: ${outputterName}`);
  }
  const itemNames = rawItemStrings(outputter.dbContent ?? "");
  const items: AssetInputCardRef[] = [];
  for (const name of itemNames) {
    if (name === "") continue;
    const item = await deps.fetchByName(name);
    if (item === undefined) continue; // known_only: true
    if (item.trash === true) continue; // reject(&:trash)
    items.push(item);
  }
  return items;
}

/** asset_inputter.rb:51-53 assemble_asset_input_content:
 *  `format(input_format).render input_view`. The leaf render is
 *  deps.renderInputView (the SassC/CoffeeScript/mod-dir remainder — see the
 *  module doc); null past the registry = not an inputter. */
export async function assembleAssetInputContent(
  deps: AssetInputDeps,
  item: AssetInputCardRef,
): Promise<string | null> {
  const spec = inputFormatFor(item.setKeys);
  if (spec === undefined) return null;
  return (await deps.renderInputView(item, spec.format, spec.view)) ?? null;
}

/** asset_inputter.rb:44-49 asset_input_content — the virtual branch assembles
 *  directly (:45); the persisted branch reads `asset_input`, whose
 *  VirtualCache child bottoms out in the SAME assemble (right/asset_input.rb
 *  virtual_content + the aborting save — see the module doc's branch
 *  collapse). Null past the registry = not an inputter (the validate twin's
 *  predicate). */
export async function assetInputContent(
  deps: AssetInputDeps,
  item: AssetInputCardRef,
): Promise<string | null> {
  if (isVirtualItem(item)) return assembleAssetInputContent(deps, item);
  return assembleAssetInputContent(deps, item);
}

/** asset_outputter.rb:16-18 find_invalid_input: the first item that does not
 *  respond to asset_input_content — the validate_asset_inputs guard
 *  (:10-14, message t(:assets_invalid_input, input_name: …)). Null = every
 *  item is an inputter (oracle: both deck outputters null). */
export async function findInvalidInput(
  deps: AssetInputDeps,
  outputterName: string,
): Promise<string | null> {
  const items = await inputItemCards(deps, outputterName);
  for (const item of items) {
    if (inputFormatFor(item.setKeys) === undefined) return item.name;
  }
  return null;
}

/** asset_outputter.rb:32-34 input_from_item_cards:
 *  `input_item_cards.map(&:asset_input_content).compact.join(joint)`.
 *  THE assembled content storeAssetOutput writes (update_asset_output's
 *  input half).
 *
 *  @param joint Ruby's default "\n" (the method's parameter). */
export async function inputFromItemCards(
  deps: AssetInputDeps,
  outputterName: string,
  joint = "\n",
): Promise<string> {
  const items = await inputItemCards(deps, outputterName);
  const contents: string[] = [];
  for (const item of items) {
    const content = await assetInputContent(deps, item);
    if (content !== null) contents.push(content); // .compact
  }
  return contents.join(joint);
}
