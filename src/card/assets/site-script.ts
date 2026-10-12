// The script asset inputs and the site script they build: the write-path
// port of card-mod-assets' Abstract::AssetInputter / Abstract::AssetOutputter
// for the SCRIPT asset types (card-mod-script), the twin of
// skin-stylesheet.ts's style half. What Ruby stores:
//
//   - a JavaScript card's `+*asset input` is its js :compressed render
//     (00_script.rb:9-12): `// <card name>\n` + the content (the compress is
//     the identity when a deck runs with compress_assets=false; the
//     uglifier arm throws a named error rather than storing bytes Ruby would
//     not store — see sassc-coffeescript-compile-engines.ts);
//   - a CoffeeScript card's is the same shape over the compiled CoffeeScript
//     (02_coffee_script.rb:22-24 compile_coffee, no_wrap false outside the
//     html format);
//   - a mod script card ("mod: x+*script", Abstract::ModAssets) assembles its
//     asset groups: each group's file leaves (`// <file base name>\n` + the
//     file's content, compiled when it is CoffeeScript), leaves joined "\n"
//     (asset_group.rb render_items_and_compress), groups joined "\n\n"
//     (01_list other_views.rb format :js view :core nest_item_array join);
//   - a `<set>+*script` rule's output is its items' asset inputs joined "\n"
//     (asset_outputter.rb input_from_item_cards), stored as the file of its
//     `+*asset output` card by the write path (style-asset-events.ts).
//
// The vendored mod script files (fixtures/vendor/mod-script-assets/, copied
// and sha-checked by tools/oracle/vendor-script-sources.mjs) are the files
// Ruby reads from its gems. The compile is the host's seam (CoffeeCompiler,
// coffee-compiler.ts): the npm coffeescript@1.12.2 package is the same
// compiler the coffee-script-source gem bundles, byte for byte.

import { rawItemStrings } from "../render/pointer-list.js";
import {
  assembleStyleInput,
  contentOf,
  STYLE_INPUTTER_TYPES,
  StyleAssetUnsupportedError,
  type AssetInputStore,
  type StyleAssetDeps,
  type StyleCard,
} from "./skin-stylesheet.js";
import { modScriptFileContent, modScriptGroups } from "./script-sources.js";

/** The types whose cards include Abstract::Script, the AssetInputter include
 *  with input_format :js and input_view :compressed (00_script.rb:6, through
 *  01_java_script.rb:4 and 02_coffee_script.rb:6). */
export const SCRIPT_INPUTTER_TYPES: ReadonlySet<string> = new Set(["java_script", "coffee_script"]);

function compileCoffee(deps: StyleAssetDeps, script: string, what: string): string {
  if (deps.compileCoffee === undefined) {
    throw new StyleAssetUnsupportedError(
      `${what}: this host has no CoffeeScript compiler configured (the coffeeCompiler engine option)`,
    );
  }
  // 02_coffee_script.rb compile_coffee: no_wrap is false outside the html
  // format, and the asset input renders in the js format.
  return deps.compileCoffee(script, false);
}

/** One leaf's compressed render: comment_with_source (00_script.rb:20-22)
 *  over the core — the file's content, compiled when it is CoffeeScript. */
function leafChunk(deps: StyleAssetDeps, name: string, type: string, content: string, what: string): string {
  const core = type === "coffee_script" ? compileCoffee(deps, content, what) : content;
  return `// ${name}\n${core}`;
}

/** A JavaScript or CoffeeScript card's assembled asset input; undefined for
 *  any other type. */
export function assembleScriptInput(deps: StyleAssetDeps, card: StyleCard): string | undefined {
  if (card.typeCode === undefined || !SCRIPT_INPUTTER_TYPES.has(card.typeCode)) return undefined;
  return leafChunk(deps, card.name, card.typeCode, contentOf(deps, card), card.name);
}

/** A mod script card ("mod: x+*script") is an inputter whose left is a Mod
 *  card (type_plus_right/mod/script.rb). Its input assembles the mod's
 *  script groups from the vendored files; undefined when the card is not
 *  shaped like one (or the mod has no script assets). */
export function assembleModScriptInput(deps: StyleAssetDeps, card: StyleCard): string | undefined {
  const match = /^mod: (.+)\+\*script$/.exec(card.name);
  if (match === null) return undefined;
  const groups = modScriptGroups(match[1]!.replace(/ /g, "_"));
  if (groups === undefined) return undefined;
  return groups
    .map((group) =>
      group.files
        .map((file) => leafChunk(deps, file.name, file.type, modScriptFileContent(file), file.name))
        .join("\n"),
    )
    .join("\n\n");
}

/** asset_inputter.rb:44-49 asset_input_content for an assembled card: the
 *  stored input when it has one, else the assembled input, stored as it is
 *  read (`update_asset_input if asset_input.blank?` — the referer walk the
 *  Ruby update_asset_input also runs is the caller's event seam). */
export async function assetInputVia(
  deps: StyleAssetDeps,
  store: AssetInputStore,
  card: StyleCard,
  assemble: (card: StyleCard) => string | undefined | Promise<string | undefined>,
): Promise<string> {
  const stored = await store.read(card);
  if (stored !== undefined && stored.trim() !== "") return stored;
  const content = (await assemble(card)) ?? "";
  await store.save(card, content);
  return content;
}

/** asset_outputter.rb:32-34 input_from_item_cards for a `<set>+*script`
 *  rule: the known, untrashed items' asset inputs, joined with newlines. An
 *  item may be any inputter (validate_asset_inputs accepts every
 *  Abstract::AssetInputter, both families); anything else is refused, as
 *  Ruby's validate stage refuses the save (its message is
 *  "<item> is not a valid asset input card", assets_invalid_input). */
export async function scriptOutputContent(
  deps: StyleAssetDeps,
  store: AssetInputStore,
  outputter: StyleCard,
): Promise<string> {
  const parts: string[] = [];
  for (const itemName of rawItemStrings(contentOf(deps, outputter))) {
    if (itemName === "") continue;
    const item = await deps.card(itemName);
    if (item === undefined) continue; // known_only
    if (item.typeCode !== undefined && STYLE_INPUTTER_TYPES.has(item.typeCode)) {
      parts.push(await assetInputVia(deps, store, item, (c) => assembleStyleInput(deps, store, c)));
    } else if (item.typeCode !== undefined && SCRIPT_INPUTTER_TYPES.has(item.typeCode)) {
      parts.push(await assetInputVia(deps, store, item, (c) => assembleScriptInput(deps, c)));
    } else if (/^mod: .+\+\*script$/.test(item.name)) {
      parts.push(await assetInputVia(deps, store, item, (c) => assembleModScriptInput(deps, c)));
    } else {
      throw new StyleAssetUnsupportedError(`${item.name} is not a valid asset input card`);
    }
  }
  return parts.join("\n");
}
