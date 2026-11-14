// Virtual rule-card construction (card-mod-rules set/type/set/html_views/
// rule_lists.rb#setting_list_item): the set card's Rules section lists
// every SETTING in each group (templating/permission/webpage/editing/
// event/other), but Ruby only STORES rule cards whose content the user
// customized - the rest are constructed virtually on the fly. Ruby's
// setting_list_item builds `Card.new(name: "#{set_card.name}+#{setting_card.name}")`,
// runs the live permission walk on it (the rule's grants resolve through
// the *all pattern precedence), and renders its bar.
//
// The port: for each setting in SETTING_GROUPS without a stored
// rule child, this file constructs the virtual RenderCard in memory and
// hands it back to the renderer. The engine does NOT iterate virtual
// children (collectRules reads STORED renderCards whose left_id equals
// the set card's id - see render.ts#collectRules); without virtual
// construction the renderer falls through to quietDenial for the missing
// children and the page lists denial spans in place of the rule bar.
//
// The construction is bounded: one virtual per setting in the static
// group table (SETTING_GROUPS.length * GROUP_TO_SETTINGS[group].length
// total virtuals per set PAGE), all client-side, no fetches. The set's
// stored children continue to render via their stored form.

import type { CardRecord } from "../fetch/card-record.js";
import type { RenderCard } from "./format.js";
import { DeckoName } from "../name.js";
import { safeSetKeys } from "./set-keys.js";

/** The canonical rule card TYPE per setting, as Ruby's structure-rule
 *  walk resolves it (mod/core/set/all/templating.rb#structure +
 *  #structure_rule_card: the rule card's own type_id is what the *type+
 *  *default rule template lookup yields for each setting's virtual
 *  rule card). Stamping virtuals with the SETTING CARD's
 *  type (Setting, id 278) is wrong: the SETTING cards are all
 *  type=Setting universally, but the rule cards *all+X renders carry the
 *  setting-specific types below (each setting's *all+X virtual bar carries
 *  a data-card-type-id/data-card-type-name pair — e.g. *all+*autoname ->
 *  id=52 name=Phrase, *all+*captcha ->
 *  id=51 name=Toggle, *all+*read -> id=47 name=List, etc.).
 *
 *  The map covers every setting the SETTING_GROUPS list iterates;
 *  *structure has no entry: its type is deck-specific (the
 *  *structure+*right+*default template resolves to a deck-specific
 *  cardtype), so buildVirtualRuleCard resolves it through the engine's
 *  new-card type walk.
 *
 *  The bar-right content also derives a TYPE- class fragment
 *  (`TYPE-list`/`TYPE-pointer`/`TYPE-toggle`/...), so
 *  the `safeSetKeys` call below must read the canonical typeName, not
 *  the SETTING card's "Setting". */
const RULE_TYPE_BY_SETTING: ReadonlyMap<string, { typeId: number; typeName: string; typeCode: string }> = new Map<string, { typeId: number; typeName: string; typeCode: string }>([
  // templating
  ["autoname", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  // The virtual rule-bar type per setting is the
  // ensure_type chain outcome (mod/core/set/all/type.rb:58-80
  // ensure_type_id: type_id_from_code — each_type_assigning_module_key over
  // the card's own
  // type-assigning patterns, e.g. card-mod-layout set/right/layout.rb
  // `assign_type :pointer`, card-mod-style set/type_plus_right/set/style.rb
  // `assign_type :pointer` — then type_id_from_template, card-mod-content
  // set/all/templating.rb:57-73 new_card_template). Each entry below states
  // the resolved type for that setting:
  //   *default             RichText
  //   *guide               RichText
  //   *layout              Pointer
  //   *style               Pointer
  //   *content_options     List
  //   *content_option_view Phrase
  ["default", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  // permission
  ["create", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["read", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["update", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["delete", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["captcha", { typeId: 51, typeName: "Toggle", typeCode: "toggle" }],
  // webpage
  ["head", { typeId: 50, typeName: "HTML", typeCode: "html" }],
  ["layout", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["style", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["script", { typeId: 47, typeName: "List", typeCode: "list" }],
  // editing
  ["help", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  ["input_type", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["guide", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  ["content_options", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["content_option_view", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  // event
  ["on_create", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["on_update", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["on_delete", { typeId: 47, typeName: "List", typeCode: "list" }],
  // other
  ["thanks", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  ["follow_fields", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["follow", { typeId: 47, typeName: "List", typeCode: "list" }],
]);

/** The canonical rule card type for a setting's virtual rule card, or
 *  undefined when the setting has no map entry (*structure). The caller
 *  falls back to the SETTING card's type — the divergence
 *  only matters where the *all+X virtual surfaces. */
function ruleTypeForSetting(settingCodename: string): { typeId: number; typeName: string; typeCode: string } | undefined {
  return RULE_TYPE_BY_SETTING.get(settingCodename);
}

/** The distinct rule-card type ids the map resolves - the
 *  preload list render.ts#preloadSetRules walks into the render-card map
 *  (right after the setting cards) so the SYNC virtual construction can
 *  resolve the deck's own type card (deckTypeCard below). */
export const RULE_TYPE_IDS_FOR_PRELOAD: ReadonlyArray<number> = [
  ...new Set([...RULE_TYPE_BY_SETTING.values()].map((v) => v.typeId)),
];

/** The map's template type id for one setting (undefined =
 *  the settingCard fallback shape) - the id the DECK type-card lookup
 *  keys on. */
export function ruleTypeIdForSetting(settingCodename: string): number | undefined {
  return RULE_TYPE_BY_SETTING.get(settingCodename)?.typeId;
}

/** The setting card the virtual child points at - the engine prefetches
 *  every setting (autoname, default, ..., follow) via
 *  preloadAllSettingCards; an absent setting card means the deck has no
 *  such setting at all (the rendering host has no such concept), and
 *  falls through to quietDenial - the original mechanism, unchanged. */
export interface VirtualRuleCardInputs {
  /** The set card whose Rules section is rendering (the left part of the
   *  compound name - e.g. *captcha+*right for the deep-read-rule-deny
   *  page). */
  readonly setCard: RenderCard;
  /** The setting card the virtual child is for (the right part -
   *  e.g. *follow for the *captcha+*right+*follow virtual). */
  readonly settingCard: RenderCard;
  /** The setting's bare codename ("follow", "input_type", ...) - mirrors
   *  the right part's codename for the rule-set-categories walk the
   *  before(:bar) hook reads (format.ts#ruleSetCategories). */
  readonly settingCodename: string;
  /** The DECK's type card at the template-resolved id (the caller
   *  resolves ruleTypeIdForSetting through render.ts findRenderCardById) -
   *  the card whose NAME and codename the rendered virtual must print.
   *  Ruby resolves the virtual rule card's type through the
   *  structure/template walk to an ID, then reads type_name/type_code off
   *  the deck's card AT that id; a deck may name its type cards
   *  differently from the stock names this map carries (the served
   *  *head virtuals then read that deck's own type name).
   *  Undefined (type card not preloaded / absent from the deck) keeps
   *  the map's raw-deck literal - the documented degradation, the same
   *  shape as the settingCard.typeId fallback below. */
  readonly deckTypeCard?: RenderCard;
  /** The engine's new-card type walk (RenderEngineLike.newCardDefaultType:
   *  type.rb ensure_type_id, type_id_from_code || type_id_from_template),
   *  consulted for settings the map does not cover: the
   *  virtual *structure rule takes its type from the deck's
   *  *structure+*right+*default template (a deck-specific cardtype). */
  readonly newCardDefaultType?: (name: DeckoName) => { typeId: number; typeName: string } | undefined;
  /** The engine's new-card type resolution (the *default template chain,
   *  templating.rb new_card_template -> type_id_from_template) and codename
   *  lookup. Used for a setting the map does not cover: on a stock
   *  deck `*all+*structure` is typed by `*structure+*right+*default`
   *  (Nest list), not by the setting card's own type. */
  readonly engine?: VirtualRuleTypeEngine;
}

interface VirtualRuleTypeEngine {
  newCardDefaultType?(name: DeckoName): { typeId: number; typeName: string } | undefined;
  peekCodenameById?(id: number): string | undefined;
  peekIdByCodename?(codename: string): number | undefined;
  peekRegisteredNameForId?(id: number): string | undefined;
}

/** The codename of the type card a map entry names (RichText's codename is
 *  `basic`; the map's typeCode spells the class fragment). */
function mapEntryCodename(entry: { typeCode: string }): string {
  return entry.typeCode === "rich_text" ? "basic" : entry.typeCode;
}

/** A map entry re-resolved on a deck whose type card for that codename has
 *  another id; undefined when the mapped id is right for this deck or the
 *  engine cannot tell. */
function relocateRuleType(
  entry: { typeId: number; typeName: string; typeCode: string },
  engine: VirtualRuleTypeEngine | undefined,
): { typeId: number; typeName: string; typeCode: string } | undefined {
  if (engine?.peekCodenameById === undefined || engine.peekIdByCodename === undefined) return undefined;
  const codename = mapEntryCodename(entry);
  if (engine.peekCodenameById(entry.typeId) === codename) return undefined;
  const typeId = engine.peekIdByCodename(codename);
  if (typeId === undefined) return undefined;
  const typeName = engine.peekRegisteredNameForId?.(typeId) ?? entry.typeName;
  return { typeId, typeName, typeCode: entry.typeCode };
}

/** Build the in-memory virtual rule card Ruby constructs on the fly for
 *  each SETTING when no stored child exists.
 *
 *  The engine rendering only stored children would emit
 *  `<span class="denied">` for
 *  every setting whose set card had no stored child, because collectRules
 *  only iterates stored children. This helper closes that gap by
 *  constructing the virtual rule card Ruby builds in setting_list_item -
 *  one virtual per missing setting, handed back to nestRecord with the
 *  standard :bar view. The stored children continue to render via their
 *  stored form (the existing nestRecord path); the virtual
 *  children render the live-walked bar (the same path, different card).
 *
 *  The virtual card has NO id (Ruby's Card.new with no row in the cards
 *  table produces an id-less card; engine treats this via the key-keyed
 *  deniedVerdictsByKey map, format.ts#viewPermissionDenial + the read-
 *  permission gate's verdict resolution). Its setKeys include the RULE
 *  token, RIGHT-X<setting>, TYPE_PLUS_RIGHT-set-X<setting>, SELF-X<set>-
 *  X<setting> chain (mirrors the stored child shape).
 *
 *  Type resolution: the virtual card's TYPE in Ruby's render is resolved
 *  through a structure-rule walk (the rule's `<set>+<setting>+*type+
 *  *default` lookup). The TS engine resolves the same per-setting
 *  type via the RULE_TYPE_BY_SETTING map at the top of
 *  this file (id=47/List for permission rules, id=51/Toggle for captcha,
 *  id=34843/Pointer for input_type, etc.). Settings without a map
 *  entry (*structure) fall
 *  through to the SETTING card's type or the engine's new-card type walk.
 *  The `data-card-type-id` / `data-card-type-name`
 *  attrs and the slot's `TYPE-<name>` class fragment all read from
 *  these values; a `Setting`/278 stamp would mis-type every virtual
 *  rule bar. */
export function buildVirtualRuleCard(inputs: VirtualRuleCardInputs): RenderCard {
  const { setCard, settingCard, settingCodename, deckTypeCard, engine } = inputs;
  // set.name.s + "+" + the SETTING CARD'S OWN NAME. Ruby's
  // setting_list_item joins the set name with the setting card's stored
  // name (which carries the leading "*" and the STORED DISPLAY form),
  // so the result for the input-type setting is "<set>+*self+*input type"
  // — the space form Ruby renders in the bar's display positions
  // (data-slot nest_name + card-title; the url_key/id attrs stay
  // underscore forms because they are key derivations). The codename
  // join is key-identical
  // (so all key/url-key lookups are unaffected) but NOT display-identical:
  // the stored name's space form is what Ruby emits
  // (`nest_name":"<set>+*self+*input type"` + `title="<set>+*self+*input
  // type"`) where the codename form would emit "*input_type".
  const settingNamePart =
    settingCard.name?.s !== undefined && settingCard.name.s.startsWith("*")
      ? settingCard.name.s
      : `*${settingCodename}`;
  const compoundName = `${setCard.name.s}+${settingNamePart}`;
  const name = DeckoName.parse(compoundName);
  // Type resolution: the virtual rule card's TYPE in Ruby's render is
  // resolved through the structure-rule walk (mod/core/set/all/templating
  // .rb#structure + #structure_rule_card: the *type+*default rule
  // template lookup yields the rule card's own type_id). The per-setting
  // map states the outcome (RULE_TYPE_BY_SETTING above). For settings
  // without a map entry (*structure), fall back to the SETTING card's
  // type or the engine's new-card type walk.
  const mapped = ruleTypeForSetting(settingCodename);
  // The map's ids are those of the deck it was measured on. On another deck
  // the type card holding the same codename has another id: when the
  // mapped id does not hold the expected codename here, the map entry is
  // re-resolved through the deck's codename table.
  const relocated = mapped !== undefined ? relocateRuleType(mapped, engine) : undefined;
  const ruleType = relocated ?? mapped;
  // Unmapped settings: the template chain, as Ruby's ensure_type_id does.
  const templated =
    mapped === undefined
      ? (engine?.newCardDefaultType?.(name) ?? inputs.newCardDefaultType?.(name))
      : undefined;
  const templateType =
    templated !== undefined
      ? {
          typeId: templated.typeId,
          typeName: templated.typeName,
          typeCode: engine?.peekCodenameById?.(templated.typeId),
        }
      : undefined;
  const typeId = ruleType?.typeId ?? templateType?.typeId ?? settingCard.typeId;
  // Ruby prints the DECK's type card at the template-resolved id:
  // type_name (card.type_name) and the codename-derived type code are
  // lookups on THAT card, so the served deck's type names are what the
  // rendered bytes carry. The map literals are the stock names and
  // are only the fallback for a deck that does not carry the type card.
  // (A relocated type already carries this deck's own name; the caller's
  // deckTypeCard was looked up at the map's id, another card here.)
  const deckType = relocated === undefined ? deckTypeCard : undefined;
  const typeName =
    deckType?.name.s ?? ruleType?.typeName ?? templateType?.typeName ?? settingCard.typeName;
  const typeCode =
    deckType?.typeCode ?? ruleType?.typeCode ?? templateType?.typeCode ?? settingCard.typeCode;
  // left/right id wiring: the rule card's record points at the set
  // (left_id) and the setting (right_id). Records use the underlying
  // CardRecord shape so the engine's left-id lookup is consistent with
  // stored children (the engine's collectRules walks left_id; the
  // virtual card's record carries the right left_id for the read-rule
  // grant walk).
  const record: CardRecord = {
    id: undefined,
    codename: undefined,
    leftId: setCard.id,
    rightId: settingCard.id,
    typeId,
    dbContent: settingCard.dbContent,
    trash: false,
    creatorId: undefined,
    updaterId: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    currentRevisionId: undefined,
    readRuleClass: undefined,
    readRuleId: undefined,
    referencesExpired: undefined,
    name,
    key: name.key,
    isNew: true, // Card.new without a row -> new card; the *self pattern drops
    fromTrash: false,
    uncacheable: false,
  };
  // setKeys: pass through safeSetKeys with the same input shape
  // enrichAndStore builds for stored children (the typeId + leftTypeName
  // + isRule triple). The bare RULE token is in the result because the
  // *rule pattern applies (right part is a setting, left part is a set).
  // The TYPE- fragment is built from typeName (TYPE-<name>), so it MUST
  // be the canonical per-setting typeName (List/Toggle/Pointer/...) —
  // not "Setting" — otherwise the slot's class chain reads TYPE-setting
  // instead of the corpus's TYPE-list/TYPE-toggle/TYPE-pointer/etc.
  const setKeys = safeSetKeys({
    name,
    typeId,
    typeName,
    leftTypeName: setCard.typeName,
    isRule: true,
    isNew: true, // pattern/all.rb#patterns: new cards drop the SELF token
  });
  return {
    record,
    name,
    key: name.key,
    typeName,
    typeId,
    typeCode,
    id: undefined,
    dbContent: settingCard.dbContent,
    setKeys,
  };
}
