// The write path's asset events and the recent-settings list, run once a
// save's rows are written:
//
//   finalize  asset_input_changed       (card-mod-assets asset_inputter.rb:24-27)
//             update_skin_asset_input   (card-mod-bootstrap abstract/skin_field.rb)
//             update_asset_output_file  (card-mod-assets asset_outputter.rb:6-8)
//             asset_input_changed_on_delete (asset_inputter.rb:20-23, before
//                                           clear_references)
//   integrate save_recently_edited_settings (card-mod-rules set/rule/rules.rb:1-6)
//
// The asset content itself is assembled in ../assets/skin-stylesheet.ts (the
// style types) and ../assets/site-script.ts (the script types). What these
// events write, as Ruby does:
//
//   - an inputter's `+*asset input` content goes to its card_virtuals row
//     (card-mod-virtual: created, updated, or only touched when unchanged);
//     no card row, no action;
//   - a `<set>+*style` rule's output is stored as the file of its
//     `+*asset output` card: <card id>/<epoch seconds>.css, the card's content
//     becomes that identifier (and a coded file becomes a local one), its
//     updated_at and updater change; the card has history? false, so there is
//     no action (card_mount.rb: `selected_action_id = Time.now.to_i unless
//     history?`), and the previous file is kept (reset_previous_changes_for_
//     file runs before remove_previously_stored_file for such cards). A
//     `<set>+*script` rule stores its output the same way, with a .js file;
//   - a saved rule moves its setting to the top of `*recent settings`
//     (history? false: the row and its references change, no action);
//   - a deleted inputter updates its referers before its references are
//     cleared (asset_input_changed_on_delete): dependent inputters re-store
//     their inputs, outputters rebuild their files, now without the trashed
//     item (input_item_cards rejects trash).

import { DeckoName } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import type { CardsRow } from "../../server/schema.js";
import type { ActWriter } from "../history/write-path.js";
import { cardFieldStateFromRow } from "../history/write-path.js";
import { trackedFieldIndex } from "../history/change.js";
import type { AttachmentStore } from "../attachments/attachment-store.js";
import { localAttachmentIdentifier } from "../attachments/attachment-content.js";
import { rawItemStrings } from "../render/pointer-list.js";
import { newCardRecord } from "../fetch/card-record.js";
import { VirtualRecordCache, findVirtualByCard, virtualSave } from "../mod-loader/mods/card-mod-virtual.js";
import { STYLE_SOURCES_MTIME } from "../assets/style-sources.js";
import { sqlDateTime } from "../history/act.js";
import type { ScssCompiler } from "../assets/scss-compiler.js";
import type { CoffeeCompiler } from "../assets/coffee-compiler.js";
import type { ScriptCompressor } from "../assets/script-compressor.js";
import {
  STYLE_INPUTTER_TYPES,
  StyleAssetUnsupportedError,
  assembleStyleInput,
  bootswatchSkinContent,
  styleOutputContent,
  type AssetInputStore,
  type StyleAssetDeps,
  type StyleCard,
} from "../assets/skin-stylesheet.js";
import {
  SCRIPT_INPUTTER_TYPES,
  assembleModScriptInput,
  assembleScriptInput,
  scriptOutputContent,
} from "../assets/site-script.js";
import { refreshReferencesOut } from "./refresh-references-out.js";
import { CardActionError } from "./types.js";
import { resolveTypeId } from "./type-resolution.js";

/** What the engine lends these events. */
export interface StyleAssetEventContext {
  fetch: FetchEngine;
  clock: () => Date;
  newWriter: () => ActWriter;
  /** Card#expire for a row these events changed. */
  expire: (cardId: number, name: DeckoName) => Promise<void>;
  attachmentStore: AttachmentStore | undefined;
  compile: ScssCompiler | undefined;
  compileCoffee?: CoffeeCompiler | undefined;
  /** Cardio.config.compress_assets; absent = false. */
  compressAssets?: boolean;
  /** The Uglifier seam the script leaves minify through under compressAssets. */
  compressScript?: ScriptCompressor | undefined;
  virtuals: VirtualRecordCache;
}

/** One card saved in the act. */
export interface SavedCard {
  cardId: number;
  actionId: number;
  verb: "create" | "update" | "delete";
  /** The card's content before the act, when the caller has it. */
  contentBefore?: string | null;
}

const SKIN_FIELDS = new Set(["colors", "variables", "stylesheets"]);

/** The cards row for one id (Ruby Card[id]), read through the fetch engine's
 *  cache rather than a fresh query per call. lookInTrash answers a trashed
 *  row as the raw read did. The cache is the engine's own card read path:
 *  every write the save makes goes through expire, which drops the cached
 *  record, so a read here sees the row as the save left it. */
async function rowById(ctx: StyleAssetEventContext, id: number): Promise<CardsRow | undefined> {
  const card = await ctx.fetch.fetchById(id, { skipVirtual: true, lookInTrash: true });
  if (card === undefined || card.id === undefined) return undefined;
  return {
    id: card.id,
    name: card.name?.s ?? null,
    key: card.key ?? null,
    codename: card.codename ?? null,
    left_id: card.leftId ?? null,
    right_id: card.rightId ?? null,
    current_revision_id: card.currentRevisionId ?? null,
    created_at: card.createdAt as CardsRow["created_at"],
    updated_at: card.updatedAt as CardsRow["updated_at"],
    creator_id: card.creatorId as number,
    updater_id: card.updaterId as number,
    read_rule_class: card.readRuleClass ?? null,
    read_rule_id: card.readRuleId ?? null,
    references_expired: card.referencesExpired ?? null,
    trash: card.trash ? 1 : 0,
    type_id: card.typeId as number,
    db_content: card.dbContent ?? null,
  };
}

async function codenameOf(ctx: StyleAssetEventContext, id: number | null | undefined): Promise<string | undefined> {
  if (id === null || id === undefined) return undefined;
  return (await rowById(ctx, id))?.codename ?? undefined;
}

async function styleCardFromRecord(
  ctx: StyleAssetEventContext,
  rec: { id: number | undefined; name: DeckoName | undefined; key: string | undefined; typeId: number | undefined;
    codename: string | undefined; dbContent: string | undefined; leftId: number | undefined; rightId: number | undefined;
    trash: boolean } | undefined,
): Promise<StyleCard | undefined> {
  if (rec === undefined || rec.trash || rec.id === undefined) return undefined;
  return {
    id: rec.id,
    name: rec.name?.s ?? "",
    key: rec.key ?? rec.name?.key ?? "",
    typeCode: await codenameOf(ctx, rec.typeId),
    codename: rec.codename ?? undefined,
    dbContent: rec.dbContent ?? "",
    leftId: rec.leftId,
    rightId: rec.rightId,
  };
}

async function cardByName(ctx: StyleAssetEventContext, name: string): Promise<StyleCard | undefined> {
  return styleCardFromRecord(ctx, await ctx.fetch.fetchByKey(DeckoName.parse(name).key));
}

async function cardById(ctx: StyleAssetEventContext, id: number): Promise<StyleCard | undefined> {
  return styleCardFromRecord(ctx, await ctx.fetch.fetchById(id));
}

function deps(ctx: StyleAssetEventContext, staleContent: ReadonlyMap<string, string>): StyleAssetDeps {
  return {
    card: (name) => cardByName(ctx, name),
    cardByCodename: async (code) => {
      const id = await ctx.fetch.codenames.id(code);
      return id === undefined ? undefined : cardById(ctx, id);
    },
    compile: ctx.compile,
    compileCoffee: ctx.compileCoffee,
    ...(ctx.compressAssets === undefined ? {} : { compressAssets: ctx.compressAssets }),
    compressScript: ctx.compressScript,
    staleContent,
  };
}

/** set/type/scss.rb validates against Card[:all, :style].joined_items_content.
 * This is a read of each item's Card#content, not asset_input: validation must
 * neither store virtual inputs nor rebuild output files. */
export async function scssValidationVariables(ctx: StyleAssetEventContext): Promise<string> {
  const all = await ctx.fetch.codenames.name("all");
  const style = await ctx.fetch.codenames.name("style");
  if (all === undefined || style === undefined) return "";
  const rule = await cardByName(ctx, `${all.s}+${style.s}`);
  if (rule === undefined) return "";
  const readDeps = deps(ctx, new Map());
  const contents: string[] = [];
  for (const item of rawItemStrings(rule.dbContent)) {
    const card = await cardByName(ctx, DeckoName.parse(item).absoluteName(DeckoName.parse(rule.name)).s);
    if (card === undefined) continue;
    contents.push(card.typeCode === "bootswatch_skin" ? await bootswatchSkinContent(readDeps, card) : card.dbContent);
  }
  return contents.join("\n");
}

/** The `+*asset input` card of an inputter, as card-mod-virtual keys it. */
async function assetInputRecord(ctx: StyleAssetEventContext, inputter: StyleCard, content: string | undefined) {
  const rightId = await ctx.fetch.codenames.id("asset_input");
  if (rightId === undefined) return undefined; // asset_inputter.rb:143: no :asset_input codename, no input
  const name = DeckoName.compose([inputter.name, "*asset input"]);
  const record = newCardRecord(name);
  record.leftId = inputter.id;
  record.rightId = rightId;
  record.dbContent = content;
  record.key = name.key;
  return record;
}

function inputStore(ctx: StyleAssetEventContext): AssetInputStore {
  return {
    read: async (inputter) => {
      const record = await assetInputRecord(ctx, inputter, undefined);
      if (record === undefined) return "";
      const row = await findVirtualByCard(ctx.fetch.driver, record);
      return row === undefined ? undefined : row.content ?? "";
    },
    save: async (inputter, content) => {
      const record = await assetInputRecord(ctx, inputter, content);
      if (record === undefined) return;
      await virtualSave(ctx.fetch.driver, record, ctx.virtuals, ctx.clock());
    },
  };
}

/** Only the missing-input fallback below uses this gate. Unlike mod assets,
 * style:mods inherits AssetInputter#asset_input_needs_refresh? = false; an
 * existing input must not get a source-mtime refresh of its own. */
async function inputMissing(ctx: StyleAssetEventContext, inputter: StyleCard): Promise<boolean> {
  const record = await assetInputRecord(ctx, inputter, undefined);
  if (record === undefined) return false;
  const row = await findVirtualByCard(ctx.fetch.driver, record);
  return row === undefined;
}

/** A `<set>+*style` rule (type_plus_right/set/style.rb): its right is
 *  *style and its left is a Set card. */
async function isStyleOutputter(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  if ((await codenameOf(ctx, card.rightId)) !== "style") return false;
  const left = card.leftId !== undefined ? await rowById(ctx, card.leftId) : undefined;
  return left !== undefined && (await codenameOf(ctx, left.type_id)) === "set";
}

/** A `<set>+*script` rule (type_plus_right/set/script.rb): its right is
 *  *script and its left is a Set card. */
async function isScriptOutputter(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  if ((await codenameOf(ctx, card.rightId)) !== "script") return false;
  const left = card.leftId !== undefined ? await rowById(ctx, card.leftId) : undefined;
  return left !== undefined && (await codenameOf(ctx, left.type_id)) === "set";
}

/** A mod script card ("mod: x+*script", type_plus_right/mod/script.rb): its
 *  right is *script and its left is a Mod card. */
async function isModScriptCard(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  if ((await codenameOf(ctx, card.rightId)) !== "script" || card.leftId === undefined) return false;
  const left = await rowById(ctx, card.leftId);
  return (left?.codename ?? "").startsWith("mod_");
}

function isStyleTypeInputter(card: StyleCard): boolean {
  return card.typeCode !== undefined && STYLE_INPUTTER_TYPES.has(card.typeCode);
}

/** Abstract::Script's inputter types, plus the mod script cards (an inputter
 *  through type_plus_right/mod/script.rb, typed List). */
async function isScriptInputter(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  if (card.typeCode !== undefined && SCRIPT_INPUTTER_TYPES.has(card.typeCode)) return true;
  return isModScriptCard(ctx, card);
}

/** Any Abstract::AssetInputter card, both asset families. */
async function isInputter(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  // Both operands are awaited: an async call is a truthy promise, so a bare
  // `a() || b()` on two async predicates returns the first without looking.
  return (await isStyleInputter(ctx, card)) || (await isScriptInputter(ctx, card));
}

/** A style inputter that is not typed by STYLE_INPUTTER_TYPES: the
 *  `style: mods` card (style_mods.rb:1 `include_set Abstract::AssetInputter`)
 *  and a `mod: X+*style` card (mod/style.rb:4, typed List). Both respond to
 *  asset_input, so a `dependent_asset_inputters` walk reaches them. */
async function isStyleInputter(ctx: StyleAssetEventContext, card: StyleCard): Promise<boolean> {
  if (isStyleTypeInputter(card) || card.codename === "style_mods") return true;
  if ((await codenameOf(ctx, card.rightId)) !== "style") return false;
  const left = card.leftId !== undefined ? await rowById(ctx, card.leftId) : undefined;
  return (left?.codename ?? "").startsWith("mod_");
}

function refuse(err: unknown): never {
  if (err instanceof StyleAssetUnsupportedError) {
    throw new CardActionError("server-error", err.message);
  }
  throw err;
}

/** update_asset_input (asset_inputter.rb:142-151) and
 *  update_referers_after_input_changed (:134-140). */
async function updateAssetInput(
  ctx: StyleAssetEventContext,
  card: StyleCard,
  stale: ReadonlyMap<string, string>,
  visited: Set<number>,
): Promise<void> {
  if (visited.has(card.id)) return;
  visited.add(card.id);
  const store = inputStore(ctx);
  const styleContent = await assembleStyleInput(deps(ctx, stale), store, card).catch(refuse);
  const content = styleContent ?? (await assembleScriptSide(deps(ctx, stale), card).catch(refuse));
  if (content === undefined) return;
  await store.save(card, content);
  for (const dependent of await dependentAssetInputters(ctx, card)) {
    await updateAssetInput(ctx, dependent, stale, visited);
  }
  for (const outputter of await outputterReferers(ctx, card)) {
    await updateAssetOutput(ctx, outputter.card, stale, outputter.family);
  }
}

/** `dependent_asset_inputters` (asset_inputter.rb:3-4): the referers that
 *  are themselves inputters — except on `style: mods`, whose override
 *  (card-mod-style set/self/style_mods.rb:3-6) is
 *  `Card::Assets.active_theme_cards`. */
async function dependentAssetInputters(ctx: StyleAssetEventContext, card: StyleCard): Promise<StyleCard[]> {
  if (card.codename === "style_mods") return activeThemeCards(ctx);
  const referers = await referringCards(ctx, card);
  return (await Promise.all(referers.map(async (c) => ((await isInputter(ctx, c)) ? c : undefined)))).filter(
    (c): c is StyleCard => c !== undefined,
  );
}

/** `outputters` (asset_inputter.rb:9-10): the referers that respond to
 *  `update_asset_output`, with the family their rule's `*style`/`*script`
 *  right names (the two store a .css and a .js file — asset_outputter.rb:54). */
interface OutputterReferer {
  card: StyleCard;
  family: "style" | "script";
}

async function outputterReferers(
  ctx: StyleAssetEventContext,
  card: StyleCard,
): Promise<readonly OutputterReferer[]> {
  const out: { card: StyleCard; family: "style" | "script" }[] = [];
  for (const referer of await referringCards(ctx, card)) {
    if (await isStyleOutputter(ctx, referer)) out.push({ card: referer, family: "style" });
    else if (await isScriptOutputter(ctx, referer)) out.push({ card: referer, family: "script" });
  }
  return out;
}

/** The cards that refer to this one, in reference order. */
async function referringCards(ctx: StyleAssetEventContext, card: StyleCard): Promise<StyleCard[]> {
  const referers = (
    await ctx.fetch.driver.query<{ referer_id: number }>(
      "SELECT DISTINCT referer_id FROM card_references WHERE referee_id = ? ORDER BY referer_id",
      [card.id],
    )
  ).rows.map((r) => Number(r.referer_id));
  return (await Promise.all(referers.map((id) => cardById(ctx, id)))).filter(
    (c): c is StyleCard => c !== undefined,
  );
}

/** Card::Assets.active_theme_cards (card-mod-assets lib/card/assets.rb:43-48):
 *  `Card.search(referred_to_by: {left: {type: :set}, right: :style})` — the
 *  cards the deck's `<set>+*style` rules refer to, i.e. the items listed in
 *  their content (`*all+*style` lists its theme, `yeti skin`) — filtered to
 *  the ones that answer `theme_name`, which only the Bootswatch skin type
 *  does (card-mod-bootstrap set/type/bootswatch_skin.rb:61). */
async function activeThemeCards(ctx: StyleAssetEventContext): Promise<StyleCard[]> {
  const rule = await cardByName(ctx, "*all+*style");
  if (rule === undefined) return [];
  const items = (
    await Promise.all(rawItemStrings(rule.dbContent).map((name) => cardByName(ctx, name)))
  ).filter((c): c is StyleCard => c !== undefined);
  return items.filter((c) => c.typeCode === "bootswatch_skin");
}

/** The script side's assembled input for an inputter card: a mod script
 *  card's groups, or a JavaScript / CoffeeScript card's compressed render;
 *  undefined for any other card. */
async function assembleScriptSide(deps: StyleAssetDeps, card: StyleCard): Promise<string | undefined> {
  return assembleModScriptInput(deps, card) ?? assembleScriptInput(deps, card);
}

/** update_asset_output (asset_outputter.rb:20-25) + store_output (:36-59).
 *  A `<set>+*style` rule's output is a .css file, a `<set>+*script` rule's a
 *  .js file (handle_file's Tempfile extension: the outputter's
 *  output_format). */
async function updateAssetOutput(
  ctx: StyleAssetEventContext,
  outputter: StyleCard,
  stale: ReadonlyMap<string, string>,
  family: "style" | "script",
): Promise<void> {
  const eventDeps = deps(ctx, stale);
  const store = inputStore(ctx);
  const css = family === "style"
    ? await styleOutputContent(eventDeps, store, outputter).catch(refuse)
    : await scriptOutputContent(eventDeps, store, outputter).catch(refuse);
  if (ctx.attachmentStore === undefined) {
    throw new Error("storing the site stylesheet requires the engine's attachmentStore option");
  }
  const outputRightId = await ctx.fetch.codenames.id("asset_output");
  if (outputRightId === undefined) throw new Error("the deck has no *asset output codename card");
  const name = DeckoName.compose([outputter.name, "*asset output"]);
  const stamp = Math.floor(ctx.clock().getTime() / 1000);
  const ext = family === "style" ? ".css" : ".js";
  const bytes = new TextEncoder().encode(css);
  const existing = (
    await ctx.fetch.driver.query<CardsRow>(
      "SELECT * FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0",
      [outputter.id, outputRightId],
    )
  ).rows[0];
  const writer = ctx.newWriter();
  let cardId: number;
  if (existing !== undefined) {
    cardId = existing.id;
  } else {
    const fileTypeId = await ctx.fetch.codenames.id("file");
    if (fileTypeId === undefined) throw new Error("the deck has no File cardtype");
    const created = await writer.createCard({
      name: null,
      key: null, // a compound card stores no key (name/all.rb:64-66)
      left_id: outputter.id,
      right_id: outputRightId,
      type_id: fileTypeId,
      db_content: "",
      history: false,
    });
    cardId = created.cardId;
  }
  await ctx.attachmentStore.store({ cardId, actionId: stamp, ext, bytes });
  const before = existing ?? (await rowById(ctx, cardId));
  if (before === undefined) throw new Error(`asset output card ${cardId} vanished`);
  const state = cardFieldStateFromRow(before);
  await writer.updateCard({
    cardId,
    before: state,
    after: { ...state, db_content: localAttachmentIdentifier(cardId, stamp, ext) },
    dirtyFields: ["db_content"],
    history: false,
  });
  await ctx.expire(cardId, name);
}

/** db_content as it stood before `actionId`: the latest earlier recorded
 *  change of the field, else undefined. */
async function contentBefore(ctx: StyleAssetEventContext, cardId: number, actionId: number): Promise<string | undefined> {
  const row = (
    await ctx.fetch.driver.query<{ value: string | null }>(
      `SELECT ch.value FROM card_changes ch JOIN card_actions a ON a.id = ch.card_action_id
        WHERE a.card_id = ? AND a.id < ? AND ch.field = ? AND (a.draft IS NULL OR a.draft = 0)
        ORDER BY a.id DESC LIMIT 1`,
      [cardId, actionId, trackedFieldIndex("db_content")],
    )
  ).rows[0];
  return row === undefined ? undefined : row.value ?? "";
}

async function changedField(ctx: StyleAssetEventContext, saved: SavedCard, field: "db_content" | "type_id"): Promise<boolean> {
  if (saved.verb === "create") return true;
  if (saved.actionId === 0) return false;
  const row = (
    await ctx.fetch.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_changes WHERE card_action_id = ? AND field = ?",
      [saved.actionId, trackedFieldIndex(field)],
    )
  ).rows[0];
  return Number(row?.n ?? 0) > 0;
}

/** Refuse, before anything is written, a save whose asset events may need a
 *  compiler on a host that has none: a stylesheet card (CSS, SCSS, Skin,
 *  Bootswatch skin), a field of a Bootswatch skin, or a `<set>+*style` rule
 *  (the SCSS compiler); a CoffeeScript card or a `<set>+*script` rule (the
 *  CoffeeScript compiler). (The port has no transaction to roll a half-done
 *  save back, so the refusal comes first.) */
export async function assertStyleCompilerFor(
  ctx: StyleAssetEventContext,
  name: DeckoName,
  typeId: number | undefined,
): Promise<void> {
  // A deck running compress_assets minifies every script leaf, so a script
  // save needs the compressor as well as (for CoffeeScript) the compiler.
  const compressorMissing = ctx.compressAssets === true && ctx.compressScript === undefined;
  if (ctx.compile !== undefined && ctx.compileCoffee !== undefined && !compressorMissing) return;
  let missing: "SCSS" | "CoffeeScript" | "script compressor" | undefined;
  const typeCode = await codenameOf(ctx, typeId);
  if (typeCode !== undefined && STYLE_INPUTTER_TYPES.has(typeCode) && ctx.compile === undefined) missing = "SCSS";
  // a JavaScript card's input is its content (minified under
  // compress_assets) — only a CoffeeScript card compiles
  if (typeCode === "coffee_script" && ctx.compileCoffee === undefined) {
    missing ??= "CoffeeScript";
  }
  if ((typeCode === "coffee_script" || typeCode === "java_script") && compressorMissing) {
    missing ??= "script compressor";
  }
  if (!missing && name.isCompound && name.rightName !== undefined && name.leftName !== undefined) {
    const right = await ctx.fetch.fetchByKey(name.rightName.key);
    const rightCode = right?.codename ?? undefined;
    const left = await ctx.fetch.fetchByKey(name.leftName.key);
    const leftType = left === undefined ? undefined : await codenameOf(ctx, left.typeId);
    const leftIsSet = leftType === "set" || (left === undefined && (await typeCodeOfName(ctx, name.leftName)) === "set");
    if (
      (rightCode === "style" && leftIsSet && ctx.compile === undefined) ||
      (rightCode !== undefined && SKIN_FIELDS.has(rightCode) && leftType === "bootswatch_skin" && ctx.compile === undefined)
    ) {
      missing = "SCSS";
    } else if (rightCode === "script" && leftIsSet && ctx.compileCoffee === undefined) {
      missing = "CoffeeScript";
    } else if (rightCode === "script" && leftIsSet && compressorMissing) {
      missing = "script compressor";
    }
  }
  if (missing !== undefined) {
    // The refusal the edge hosts' gate pins (write-routes-compiler-dispatch):
    // a host without a compiler rejects the save as invalid FOR THIS HOST —
    // a user-error-shaped 422 with the named option, not a server fault.
    const what =
      missing === "script compressor"
        ? "script compressor configured (the scriptCompressor engine option, needed under compressAssets)"
        : `${missing} compiler configured (the ${missing === "SCSS" ? "scssCompiler" : "coffeeCompiler"} engine option)`;
    throw new CardActionError(
      "user-error",
      `${name.s}: saving it rebuilds asset files, and this host has no ${what}`,
    );
  }
}

/** The inputter a page render reads that no standard walk reaches: the
 *  `style: mods` self card (head.rb:62 nests it). Ruby never refreshes it on
 *  the request directly; its input is re-stored by the cascade from the mods
 *  (update_referers_after_input_changed, asset_inputter.rb:29-33 — the
 *  dependent_asset_inputters of a mod are the referers that respond to
 *  asset_input, and style: mods is one). The entry only matters on a deck
 *  whose `style: mods` input is missing and no mod refresh reaches it. */
const READ_ASSET_INPUT_NAMES: readonly string[] = ["style: mods"];

/** The read-path asset-input refresh: Card::Assets.refresh, which every
 *  request of an eager deck runs at setup (card-mod-assets lib/card/assets.rb:
 *  13-28; decko lib/card_controller/rest.rb:32). Each standard inputter (the
 *  `mod: X+*style` and `mod: X+*script` cards, assets.rb:62-67) whose input
 *  needs a refresh (asset_input_needs_refresh?, mod_assets.rb:134-135) runs
 *  update_asset_input as the bot (asset_inputter.rb:37-39): it re-stores its
 *  input, then update_referers_after_input_changed re-stores every dependent
 *  inputter and every outputter's bundle file. That cascade is what writes
 *  the .css and .js bundles of a deck's first request.
 *
 *  The gate is the source stamp: a row older than STYLE_SOURCES_MTIME (or
 *  missing) needs a refresh. Saving records the actual clock, as Card::Virtual
 *  does; a deliberately frozen clock older than the sources can therefore
 *  trigger another refresh, just as Ruby's source_changed? does. Ruby's gate is
 *  the mtime of each mod's source files against the row's updated_at; see
 *  style-sources.ts.
 *
 *  Cost on a settled deck: one row read per standard inputter and nothing
 *  else. A refresh pays one assembly, one store per dependent, and one bundle
 *  store per outputter it reaches, once per source change.
 */
export async function refreshReadAssetInputs(ctx: StyleAssetEventContext): Promise<void> {
  for (const card of await standardInputtersNeedingRefresh(ctx)) {
    await updateAssetInput(ctx, card, new Map(), new Set());
  }
  for (const name of READ_ASSET_INPUT_NAMES) {
    const card = await cardByName(ctx, name);
    if (card === undefined || !(await inputMissing(ctx, card))) continue;
    await updateAssetInput(ctx, card, new Map(), new Set());
  }
}

/** Card::Assets.standard_inputters (card-mod-assets lib/card/assets.rb:62-67),
 *  `Card.search left: {type: :mod}, right_id: [StyleID, ScriptID]`, narrowed
 *  to the ones whose input needs a refresh (asset_input_needs_refresh?,
 *  mod_assets.rb:134-135): one statement over every mod style and script
 *  card, joined to its `+*asset input` row by where_card's keys (virtual.rb:
 *  64-72, right_id = *asset input, left_id = the inputter). A row that is
 *  missing, or stamped before the sources, needs the refresh. A settled deck
 *  therefore pays this one read per request and loads no card. */
async function standardInputtersNeedingRefresh(ctx: StyleAssetEventContext): Promise<StyleCard[]> {
  const modTypeId = await ctx.fetch.codenames.id("mod");
  const inputRightId = await ctx.fetch.codenames.id("asset_input");
  if (modTypeId === undefined || inputRightId === undefined) return [];
  const rows = (
    await ctx.fetch.driver.query<{ id: number }>(
      "SELECT c.id AS id FROM cards c " +
        "JOIN cards l ON l.id = c.left_id JOIN cards r ON r.id = c.right_id " +
        "LEFT JOIN card_virtuals v ON v.right_id = ? AND v.left_id = c.id " +
        "WHERE c.trash = 0 AND l.type_id = ? AND r.codename IN ('style', 'script') " +
        "AND (v.id IS NULL OR v.updated_at IS NULL OR v.updated_at < ?) ORDER BY c.id",
      [inputRightId, modTypeId, sqlDateTime(STYLE_SOURCES_MTIME)],
    )
  ).rows;
  return (await Promise.all(rows.map((r) => cardById(ctx, Number(r.id))))).filter(
    (c): c is StyleCard => c !== undefined,
  );
}

/** The finalize-stage asset events for the cards an act saved, and the
 *  delete-side asset_input_changed_on_delete for the cards it deleted. */
export async function runStyleAssetEvents(ctx: StyleAssetEventContext, savedCards: readonly SavedCard[]): Promise<void> {
  const saved = savedCards.filter((s) => s.verb !== "delete");
  const savedIds = new Set(saved.map((s) => s.cardId));
  const cards = new Map<number, StyleCard>();
  const stale = new Map<string, string>();
  for (const s of saved) {
    const card = await cardById(ctx, s.cardId);
    if (card === undefined) continue;
    cards.set(s.cardId, card);
    if (s.verb === "update") {
      const before = s.contentBefore !== undefined ? s.contentBefore ?? "" : await contentBefore(ctx, s.cardId, s.actionId);
      if (before !== undefined && before !== card.dbContent) stale.set(card.key, before);
    }
  }
  for (const s of saved) {
    const card = cards.get(s.cardId);
    if (card === undefined) continue;
    // A card's own events read the card as saved (the event runs on the
    // saving instance); other cards are read through the stale view.
    const own = new Map(stale);
    own.delete(card.key);
    // asset_input_changed
    if ((await isInputter(ctx, card)) && (await changedField(ctx, s, "db_content"))) {
      await updateAssetInput(ctx, card, own, new Set());
    }
    // update_skin_asset_input: a skin field whose skin has no action in this act.
    // Ruby's body (skin_field.rb:2-4) is `return if !left || left.action;
    // left.update_asset_input` — and the recorded oracle proves the refresh
    // reads the act field's PRE-ACT bytes, not the just-saved ones: on the
    // write-battery deck (reference-harness/fixtures/write-battery-v1/
    // expected/side-effects-ruby.json), Parity Skin+*colors save #1 leaves
    // the skin's +*asset input untouched (assembling the pre-act colors
    // reproduces the stored input, so save_virtual_content no-ops) and still
    // writes the stylesheet from it, and save #2 (content #876543) stores as
    // the skin's input the assembly of #345678 — the PRE-ACT content, byte
    // for byte the css file it writes in the same act. One-save lag: each
    // field save's bytes only reach the skin's input on the NEXT field save.
    // Passing the field's own-view here leaks its NEW bytes into the skin
    // input a step early (the regression the integration run caught: the
    // battery's three asset steps and skin-stylesheet's colour-change case
    // both fail on it). The full `stale` map is the faithful view.
    if (SKIN_FIELDS.has((await codenameOf(ctx, card.rightId)) ?? "") && card.leftId !== undefined && !savedIds.has(card.leftId)) {
      const skin = await cardById(ctx, card.leftId);
      if (skin?.typeCode === "bootswatch_skin") await updateAssetInput(ctx, skin, stale, new Set());
    }
    // update_asset_output_file
    if (await isStyleOutputter(ctx, card)) await updateAssetOutput(ctx, card, own, "style");
    if (await isScriptOutputter(ctx, card)) await updateAssetOutput(ctx, card, own, "script");
  }
  // asset_input_changed_on_delete (asset_inputter.rb:20-23): finalize, on:
  // :delete, before clear_references — the referers still point at the
  // deleted card, whose row is already trashed, so a rebuilt output drops it
  // (input_item_cards rejects trash).
  for (const s of savedCards) {
    if (s.verb !== "delete") continue;
    const rec = await ctx.fetch.fetchById(s.cardId, { lookInTrash: true });
    // styleCardFromRecord drops trashed rows; the deleted card's type row
    // still stands and decides whether it was an inputter.
    const card = rec === undefined ? undefined : await styleCardFromRecord(ctx, { ...rec, trash: false });
    if (card === undefined || !(await isInputter(ctx, card))) continue;
    await updateReferersAfterInputDeleted(ctx, card, stale);
  }
}

/** A deleted inputter's referer walk (update_referers_after_input_changed,
 *  asset_inputter.rb:25-31): dependent inputters re-store their inputs, then
 *  the outputters rebuild their files without the trashed card. */
async function updateReferersAfterInputDeleted(
  ctx: StyleAssetEventContext,
  card: StyleCard,
  stale: ReadonlyMap<string, string>,
): Promise<void> {
  const referers = (
    await ctx.fetch.driver.query<{ referer_id: number }>(
      "SELECT DISTINCT referer_id FROM card_references WHERE referee_id = ? ORDER BY referer_id",
      [card.id],
    )
  ).rows.map((r) => Number(r.referer_id));
  const referringCards = (await Promise.all(referers.map((id) => cardById(ctx, id)))).filter(
    (c): c is StyleCard => c !== undefined,
  );
  for (const referer of referringCards) {
    if (await isInputter(ctx, referer)) await updateAssetInput(ctx, referer, stale, new Set());
  }
  for (const referer of referringCards) {
    if (await isStyleOutputter(ctx, referer)) await updateAssetOutput(ctx, referer, stale, "style");
    if (await isScriptOutputter(ctx, referer)) await updateAssetOutput(ctx, referer, stale, "script");
  }
}

// ---------------------------------------------------------------------------
// save_recently_edited_settings
// ---------------------------------------------------------------------------

async function typeCodeOfName(ctx: StyleAssetEventContext, name: DeckoName): Promise<string | undefined> {
  const rec = await ctx.fetch.fetchByKey(name.key);
  if (rec !== undefined && !rec.trash) return codenameOf(ctx, rec.typeId);
  // A virtual set card ("Book+*type"): its type comes from the set patterns.
  try {
    return codenameOf(ctx, await resolveTypeId(ctx.fetch, { name }));
  } catch {
    return undefined;
  }
}

/** Card#rule? (card-1.110.0 lib/card/rule/all.rb:33-48): a standard rule
 *  (<set>+<setting>) or a preference (<set>+<user or *all>+<setting>). */
async function isRule(ctx: StyleAssetEventContext, name: DeckoName): Promise<boolean> {
  const parts = name.parts;
  if (parts.length < 2) return false;
  const right = DeckoName.parse(parts[parts.length - 1]);
  if ((await typeCodeOfName(ctx, right)) !== "setting") return false;
  if ((await typeCodeOfName(ctx, DeckoName.compose(parts.slice(0, -1)))) === "set") return true;
  if (parts.length > 2 && (await typeCodeOfName(ctx, DeckoName.compose(parts.slice(0, -2)))) === "set") {
    const preferer = DeckoName.parse(parts[parts.length - 2]);
    const rec = await ctx.fetch.fetchByKey(preferer.key);
    return rec?.codename === "all" || (await codenameOf(ctx, rec?.typeId)) === "user";
  }
  return false;
}

/** save_recently_edited_settings (:integrate, on: :save, changed: type or
 *  content): `recent.insert_item 0, name.right` and save it as a subcard. */
export async function saveRecentlyEditedSettings(
  ctx: StyleAssetEventContext,
  savedCards: readonly SavedCard[],
): Promise<void> {
  const recentId = await ctx.fetch.codenames.id("recent_settings");
  if (recentId === undefined) return;
  for (const s of savedCards) {
    if (s.verb === "delete") continue;
    const rec = await ctx.fetch.fetchById(s.cardId);
    if (rec?.name === undefined || rec.trash) continue;
    if (!(await changedField(ctx, s, "db_content")) && !(await changedField(ctx, s, "type_id"))) continue;
    if (!(await isRule(ctx, rec.name))) continue;
    const recent = await rowById(ctx, recentId);
    if (recent === undefined || recent.trash) continue;
    const setting = DeckoName.parse(rec.name.parts[rec.name.parts.length - 1]);
    // Abstract::List insert_item: drop the item (by key), insert it at 0.
    const items = rawItemStrings(recent.db_content ?? "").filter(
      (item) => item !== "" && DeckoName.parse(item).key !== setting.key,
    );
    const content = [setting.s, ...items].join("\n");
    if (content === (recent.db_content ?? "")) continue;
    const state = cardFieldStateFromRow(recent);
    await ctx.newWriter().updateCard({
      cardId: recentId,
      before: state,
      after: { ...state, db_content: content },
      history: false,
    });
    const recentName = DeckoName.parse(recent.name ?? "*recent settings");
    // refresh_references_out: *recent settings is a list (Abstract::List).
    await refreshReferencesOut(ctx.fetch.driver, ctx.fetch.lexicon, recentId, recentName, content, { asList: true });
    await ctx.expire(recentId, recentName);
  }
}
