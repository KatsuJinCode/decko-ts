// The site stylesheet and the asset inputs it is built from: the write-path
// port of card-mod-assets' Abstract::AssetInputter / Abstract::AssetOutputter
// for the STYLE asset types, and of the Bootswatch skin content that feeds
// them (card-mod-bootstrap set/type/bootswatch_skin.rb).
//
// What Ruby does when a skin changes:
//
//   asset_inputter.rb:24-27  event :asset_input_changed, :finalize, on: :save,
//                            changed: :content — update_asset_input: the card's
//                            `+*asset input` (a VirtualCache card, right/
//                            asset_input.rb) saves its assembled content into
//                            card_virtuals, then update_referers_after_input_
//                            changed: every referer that is itself an inputter
//                            updates its input, every referer that is an
//                            outputter rebuilds its output.
//   skin_field.rb            event :update_skin_asset_input, :finalize: a skin
//                            field (+*colors, +*variables, +*stylesheets) whose
//                            skin has no action in the act updates the skin's
//                            input.
//   asset_outputter.rb:6-8   event :update_asset_output_file, :finalize, on:
//                            :save — a `<set>+*style` rule (type_plus_right/
//                            set/style.rb) joins its items' asset inputs and
//                            stores them as the file of its `+*asset output`
//                            card (store_output: `aoc.update file:` as bot).
//
// The assembled input per type (format(input_format).render(input_view)):
//   Bootswatch skin  css :compressed — SassC (style :compressed) over the
//                    skin's content with its link chunks rendered
//   Scss             scss :core — the content with its link chunks rendered
//   CSS              css :compressed — SassC over the rendered content
//   Skin             css :concat (style/set/type/skin.rb) — each item's
//                    stored asset input, or its css :core when the item is no
//                    inputter (a missing item renders the :unknown comment)
//
// The SassC compile is the host's seam (ScssCompiler, scss-compiler.ts):
// Ruby compiles with LibSass 3.6.4 and only LibSass reproduces its bytes.
//
// A Ruby behaviour this module reproduces: while a save is in progress, a
// skin assembled for an asset input reads the cards UPDATED in that act as
// they were before it — so changing a skin's +*colors stores that skin's
// input built from the PREVIOUS colours, because the card cache answers the
// pre-act copy. Cards CREATED in the act are read as saved. `staleContent`
// carries the pre-act contents.

import { DeckoName } from "../name.js";
import { rawItemStrings } from "../render/pointer-list.js";
import { bootstrapCoreScss, bootstrapFunctionsScss } from "../render/bootstrap-code-files.js";
import { bootswatchThemeFile, modStyleFileContent, modStyleFiles } from "./style-sources.js";
import type { CoffeeCompiler } from "./coffee-compiler.js";
import type { ScssCompiler } from "./scss-compiler.js";

/** A card as the asset events read it. */
export interface StyleCard {
  id: number;
  name: string;
  key: string;
  typeCode: string | undefined;
  codename: string | undefined;
  dbContent: string;
  leftId: number | undefined;
  rightId: number | undefined;
}

export interface StyleAssetDeps {
  /** Card.fetch: the live card at this name, or undefined. */
  card(name: string): Promise<StyleCard | undefined>;
  /** Card.fetch by codename. */
  cardByCodename(codename: string): Promise<StyleCard | undefined>;
  /** The SassC seam. */
  compile: ScssCompiler | undefined;
  /** The CoffeeScript seam (the script asset types, site-script.ts). */
  compileCoffee?: CoffeeCompiler | undefined;
  /** Pre-act contents of the cards updated in the current act, by key. */
  staleContent?: ReadonlyMap<string, string>;
  /** Env relative_url_root ("" for a deck served at the site root). */
  relativeRoot?: string;
}

/** An unported shape: the save is refused rather than storing bytes Ruby
 *  would not store. */
export class StyleAssetUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleAssetUnsupportedError";
  }
}

/** The types whose sets include Abstract::AssetInputter for STYLE input
 *  (css.rb:2, scss.rb:2, skin.rb:1, bootswatch_skin.rb:28). */
export const STYLE_INPUTTER_TYPES: ReadonlySet<string> = new Set(["bootswatch_skin", "scss", "css", "skin"]);

/** The list types whose items recurse (Abstract::Items). */
const RECURSABLE_TYPES: ReadonlySet<string> = new Set(["pointer", "list", "link_list", "nest_list", "skin"]);

/** The card's content as the events read it: the pre-act copy of a card
 *  updated in the current act, else the stored content. */
export function contentOf(deps: StyleAssetDeps, card: StyleCard): string {
  return deps.staleContent?.get(card.key) ?? card.dbContent;
}

// ---------------------------------------------------------------------------
// content chunks: process_content with chunk_list :references, css format
// ---------------------------------------------------------------------------

/** Link chunks in a stylesheet, rendered as the css format renders them
 *  (card-mod-content chunk/link.rb + card-mod-format set/all/links.rb, base
 *  format): `[[/path]]` -> the deck path, `[[http...]]` / `[[mailto:...]]`
 *  -> the url, `[[target|text]]` -> `text[path]`. Name links and nests
 *  render through views; they are refused here. */
export function renderStyleChunks(text: string, relativeRoot = ""): string {
  if (/\{\{[^{}]*\}\}/.test(text)) {
    throw new StyleAssetUnsupportedError("a nest ({{...}}) in stylesheet content is not supported");
  }
  return text.replace(/\[\[([^\]]+)\]\]/g, (whole, inner: string, offset: number) => {
    if (offset > 0 && text[offset - 1] === "\\") {
      throw new StyleAssetUnsupportedError(`an escaped link in stylesheet content is not supported: ${whole}`);
    }
    const bar = inner.indexOf("|");
    const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
    const linkText = bar === -1 ? undefined : inner.slice(bar + 1).trim();
    let path: string;
    if (target.startsWith("/")) {
      // clean_resource: internal links lose their initial slash and
      // contextualize_path puts the relative root in front.
      path = `${relativeRoot}/${target.slice(1)}`;
    } else if (/^(https?:|mailto:)/.test(target)) {
      path = target;
    } else {
      throw new StyleAssetUnsupportedError(`a card link in stylesheet content is not supported: ${whole}`);
    }
    return linkText !== undefined && linkText !== "" && linkText !== path ? `${linkText}[${path}]` : path;
  });
}

// ---------------------------------------------------------------------------
// load_content / recursed_item_cards
// ---------------------------------------------------------------------------

async function modNameOf(deps: StyleAssetDeps, modStyleCard: StyleCard): Promise<string> {
  const leftName = DeckoName.parse(modStyleCard.name).leftName;
  const left = leftName !== undefined ? await deps.card(leftName.s) : undefined;
  if (left?.codename !== undefined && left.codename !== "") return left.codename.replace(/^mod_/, "");
  return (leftName?.s ?? "").replace(/^mod: /, "").replace(/ /g, "_");
}

/** recursed_item_cards (card-mod-collection set/all/recursed.rb) mapped to
 *  content: list cards expand to their items (depth first, order kept,
 *  each card visited once), every other card is a leaf. The bootstrap code
 *  files and the mods' style groups are the vendored files Ruby reads. */
async function leafContents(
  deps: StyleAssetDeps,
  card: StyleCard,
  out: string[],
  seen: Set<string>,
): Promise<void> {
  if (seen.has(card.key)) return;
  seen.add(card.key);
  if (card.codename === "bootstrap_functions") return void out.push(bootstrapFunctionsScss());
  if (card.codename === "bootstrap_core") return void out.push(bootstrapCoreScss());
  if (card.codename === "style_mods") {
    for (const item of rawItemStrings(contentOf(deps, card))) {
      if (item === "") continue;
      const modCard = await deps.card(item);
      if (modCard === undefined) {
        out.push(""); // an unknown item: a new card, a leaf with no content
        continue;
      }
      for (const file of modStyleFiles(await modNameOf(deps, modCard)) ?? []) out.push(modStyleFileContent(file));
    }
    return;
  }
  if (card.typeCode !== undefined && RECURSABLE_TYPES.has(card.typeCode)) {
    for (const item of rawItemStrings(contentOf(deps, card))) {
      if (item === "") continue;
      const itemCard = await deps.card(item);
      if (itemCard === undefined) out.push("");
      else await leafContents(deps, itemCard, out, seen);
    }
    return;
  }
  out.push(contentOf(deps, card));
}

/** bootswatch_skin.rb:167-172 load_content: each name fetched (a missing
 *  card contributes nothing), its recursed item cards' contents, joined. */
async function loadContent(deps: StyleAssetDeps, cards: ReadonlyArray<StyleCard | undefined>): Promise<string> {
  const out: string[] = [];
  for (const card of cards) {
    if (card === undefined) continue;
    await leafContents(deps, card, out, new Set());
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// the Bootswatch skin
// ---------------------------------------------------------------------------

/** bootswatch_skin.rb:61-72: the theme a skin's files come from — its
 *  parent's theme when it has a real parent skin, else its own codename
 *  without "_skin" ("" for a skin with no codename). */
async function themeName(deps: StyleAssetDeps, skin: StyleCard, depth = 0): Promise<string> {
  if (depth < 20) {
    const parentField = await deps.card(`${skin.name}+*parent`);
    const parentName = parentField !== undefined ? rawItemStrings(contentOf(deps, parentField))[0] : undefined;
    const parent = parentName !== undefined && parentName !== "" ? await deps.card(parentName) : undefined;
    if (parent !== undefined && parent.id !== skin.id) {
      if (parent.typeCode !== "bootswatch_skin") {
        throw new StyleAssetUnsupportedError(`not a valid theme ${parent.name}`);
      }
      return themeName(deps, parent, depth + 1);
    }
  }
  return (skin.codename ?? "").replace(/_skin$/, "");
}

/** bootswatch_skin.rb:44-48 content: pre_variables, variables,
 *  post_variables and stylesheets, joined with newlines. */
export async function bootswatchSkinContent(deps: StyleAssetDeps, skin: StyleCard): Promise<string> {
  const theme = await themeName(deps, skin);
  const field = (right: string) => deps.card(`${skin.name}+${right}`);
  const pre = await loadContent(deps, [await deps.cardByCodename("bootstrap_functions")]);
  const variables = [
    await loadContent(deps, [await field("*colors"), await field("*variables")]),
    bootswatchThemeFile(theme, "variables"),
  ].join("\n");
  const post = await loadContent(deps, [
    await deps.cardByCodename("bootstrap_core"),
    await deps.cardByCodename("style_mods"),
  ]);
  const stylesheets = [
    bootswatchThemeFile(theme, "bootswatch"),
    await loadContent(deps, [await field("*stylesheets")]),
  ].join("\n");
  return [pre, variables, post, stylesheets].join("\n");
}

// ---------------------------------------------------------------------------
// asset inputs
// ---------------------------------------------------------------------------

async function compile(deps: StyleAssetDeps, source: string, what: string): Promise<string> {
  if (deps.compile === undefined) {
    throw new StyleAssetUnsupportedError(
      `${what}: this host has no SCSS compiler configured (the scssCompiler engine option)`,
    );
  }
  // SassC::Engine#render returns an empty template unchanged.
  return source === "" ? "" : deps.compile(source, "compressed");
}

/** css.rb major_comment (card-mod-format set/all/css.rb:31-36). */
function majorComment(comment: string): string {
  const edge = `/* ${"-".repeat(comment.length + 4)} */`;
  return `${edge}\n/* - ${comment} - */\n${edge}\n\n`;
}

/** The storage seam for `+*asset input` rows (card_virtuals). */
export interface AssetInputStore {
  /** The stored input of an inputter, or undefined when none is stored. */
  read(inputter: StyleCard): Promise<string | undefined>;
  /** Virtual.save: create the row or update (touch when unchanged). */
  save(inputter: StyleCard, content: string): Promise<void>;
}

/** assemble_asset_input_content (asset_inputter.rb:51-53) for the style
 *  inputter types; undefined for a card that is not one. */
export async function assembleStyleInput(
  deps: StyleAssetDeps,
  store: AssetInputStore,
  card: StyleCard,
): Promise<string | undefined> {
  switch (card.typeCode) {
    case "bootswatch_skin":
      return compile(deps, renderStyleChunks(await bootswatchSkinContent(deps, card), deps.relativeRoot), card.name);
    case "scss":
      return renderStyleChunks(contentOf(deps, card), deps.relativeRoot);
    case "css":
      return compile(deps, renderStyleChunks(contentOf(deps, card), deps.relativeRoot), card.name);
    case "skin": {
      // style/set/type/skin.rb :concat — item_cards (unknown names included)
      const parts: string[] = [];
      for (const itemName of rawItemStrings(contentOf(deps, card))) {
        if (itemName === "") continue;
        const item = await deps.card(itemName);
        if (item === undefined) {
          parts.push(majorComment(`MISSING Style Card: ${DeckoName.parse(itemName).s}`));
        } else if (item.typeCode !== undefined && STYLE_INPUTTER_TYPES.has(item.typeCode)) {
          parts.push(await assetInput(deps, store, item));
        } else if (item.typeCode !== undefined && RECURSABLE_TYPES.has(item.typeCode)) {
          throw new StyleAssetUnsupportedError(`${card.name}: a list item (${item.name}) in a skin is not supported`);
        } else {
          parts.push(renderStyleChunks(contentOf(deps, item), deps.relativeRoot));
        }
      }
      return parts.join("\n");
    }
    case "list": {
      // The `style: mods` self card (card-mod-style set/self/style_mods.rb:1,
      // `include_set Abstract::AssetInputter, input_format: :scss`) and a
      // `<set>+*style` rule (type_plus_right/set/style.rb) are List-typed
      // inputters, so they miss the type switch above. Their input is the
      // same recursed-item walk the bootswatch branch uses
      // (leafContents: recursed_item_cards mapped to content).
      if (card.codename === "style_mods" || isStyleRule(card)) {
        const parts: string[] = [];
        await leafContents(deps, card, parts, new Set());
        return parts.join("\n");
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** A `<set>+*style` rule: a set card whose right is the `*style` setting
 *  (the card type_plus_right/set/style.rb describes). Its type is List, so
 *  the type switch cannot see it. */
function isStyleRule(card: StyleCard): boolean {
  return card.rightId !== undefined && card.rightId !== null;
}

/** `asset_input` (the `+*asset input` card's content): the stored input, or
 *  — when none is stored — the assembled input, stored as it is read
 *  (Virtual.fetch: find_by_card || create). */
export async function assetInput(deps: StyleAssetDeps, store: AssetInputStore, card: StyleCard): Promise<string> {
  const stored = await store.read(card);
  if (stored !== undefined) return stored;
  const content = (await assembleStyleInput(deps, store, card)) ?? "";
  await store.save(card, content);
  return content;
}

/** asset_input_content (asset_inputter.rb:44-49) for a stored card:
 *  `update_asset_input if asset_input.blank?; asset_input`. */
export async function assetInputContent(deps: StyleAssetDeps, store: AssetInputStore, card: StyleCard): Promise<string> {
  const current = await assetInput(deps, store, card);
  if (current.trim() !== "") return current;
  const content = (await assembleStyleInput(deps, store, card)) ?? "";
  await store.save(card, content);
  return content;
}

/** asset_outputter.rb:32-34 input_from_item_cards: the outputter's known,
 *  untrashed items' asset inputs, joined with newlines (an item that is no
 *  style inputter fails validate_asset_inputs on save in Ruby). */
export async function styleOutputContent(
  deps: StyleAssetDeps,
  store: AssetInputStore,
  outputter: StyleCard,
): Promise<string> {
  const parts: string[] = [];
  for (const itemName of rawItemStrings(contentOf(deps, outputter))) {
    if (itemName === "") continue;
    const item = await deps.card(itemName);
    if (item === undefined) continue; // known_only
    if (item.typeCode === undefined || !STYLE_INPUTTER_TYPES.has(item.typeCode)) {
      throw new StyleAssetUnsupportedError(`${item.name} is not a valid asset input card`);
    }
    parts.push(await assetInputContent(deps, store, item));
  }
  return parts.join("\n");
}
