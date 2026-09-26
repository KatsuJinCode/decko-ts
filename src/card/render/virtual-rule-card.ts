// Virtual rule-card construction (card-mod-rules set/type/set/html_views/
// rule_lists.rb#setting_list_item): the set card's Rules section lists
// every SETTING in each group (templating/permission/webpage/editing/
// event/other), but Ruby only STORES rule cards whose content the user
// customized - the rest are constructed virtually on the fly. Ruby's
// setting_list_item builds `Card.new(name: "#{set_card.name}+#{setting_card.name}")`,
// runs the live permission walk on it (the rule's grants resolve through
// the *all pattern precedence), and renders its bar.
//
// Round 7's port: for each setting in SETTING_GROUPS without a stored
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
 *  rule card). Round-7's port stamped virtuals with the SETTING CARD's
 *  type (Setting, id 278) — that's wrong: the SETTING cards are all
 *  type=Setting universally, but the rule cards that *all+X renders in
 *  the corpus carry the setting-specific types below (verified against
 *  recapture-raw-shard-000000.jsonl `Xall-X<setting>-bar-view` slot
 *  attrs — e.g. *all+*autoname -> id=52 name=Phrase, *all+*captcha ->
 *  id=51 name=Toggle, *all+*read -> id=47 name=List, etc.).
 *
 *  The map covers every setting the SETTING_GROUPS list iterates;
 *  settings without a corpus *all+X virtual rule entry (default,
 *  structure, content_options, content_option_view) keep the
 *  settingCard.typeId fallback in buildVirtualRuleCard (the original
 *  pre-fix path) — those settings don't surface virtual rule cards on
 *  the corpus's set pages, so the divergence doesn't surface either.
 *
 *  CLUSTER 2 (tiny-render-type-plus-right-rule-card): fixing the
 *  type_id/type_name divergence above closes this family. The bar-right
 *  content also picked up the wrong TYPE- class fragment (`TYPE-setting`
 *  vs the corpus's `TYPE-list`/`TYPE-pointer`/`TYPE-toggle`/...), so
 *  the `safeSetKeys` call below must read the canonical typeName, not
 *  the SETTING card's "Setting". */
const RULE_TYPE_BY_SETTING: ReadonlyMap<string, { typeId: number; typeName: string; typeCode: string }> = new Map<string, { typeId: number; typeName: string; typeCode: string }>([
  // templating
  ["autoname", { typeId: 52, typeName: "Phrase", typeCode: "phrase" }],
  // permission
  ["create", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["read", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["update", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["delete", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["captcha", { typeId: 51, typeName: "Toggle", typeCode: "toggle" }],
  // webpage
  ["head", { typeId: 50, typeName: "HTML", typeCode: "html" }],
  ["layout", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["style", { typeId: 47, typeName: "List", typeCode: "list" }],
  ["script", { typeId: 47, typeName: "List", typeCode: "list" }],
  // editing
  ["help", { typeId: 3, typeName: "RichText", typeCode: "rich_text" }],
  ["input_type", { typeId: 34843, typeName: "Pointer", typeCode: "pointer" }],
  ["guide", { typeId: 34753, typeName: "Markdown", typeCode: "markdown" }],
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
 *  undefined when the setting has no corpus-derived entry (default,
 *  structure, content_options, content_option_view). The caller falls
 *  back to the SETTING card's type for the latter — the divergence
 *  only matters for settings whose *all+X virtual surfaces in the
 *  captured corpus. */
function ruleTypeForSetting(settingCodename: string): { typeId: number; typeName: string; typeCode: string } | undefined {
  return RULE_TYPE_BY_SETTING.get(settingCodename);
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
}

/** Build the in-memory virtual rule card Ruby constructs on the fly for
 *  each SETTING when no stored child exists.
 *
 *  CLUSTER 14 (deep-read-rule-deny-on-self-or-right, ~272 entries on
 *  shard 0): the engine previously rendered `<span class="denied">` for
 *  every setting whose set card had no stored child, because collectRules
 *  only iterates stored children. This helper closes that gap by
 *  constructing the virtual rule card Ruby builds in setting_list_item -
 *  one virtual per missing setting, handed back to nestRecord with the
 *  standard :bar view. The stored children continue to render via their
 *  stored form (the existing nestRecord path on line 584); the virtual
 *  children render the live-walked bar (the same path, different card).
 *
 *  The virtual card has NO id (Ruby's Card.new with no row in the cards
 *  table produces an id-less card; engine treats this via the key-keyed
 *  deniedVerdictsByKey map, format.ts#viewPermissionDenial + the read-
 *  permission gate's verdict resolution). Its setKeys include the RULE
 *  token, RIGHT-X<setting>, TYPE_PLUS_RIGHT-set-X<setting>, SELF-X<set>-
 *  X<setting> chain (mirrors the stored child shape; verified against
 *  the recapture-raw:*captcha+*right:render:content expected bytes for
 *  the virtual child slots).
 *
 *  Type resolution: the virtual card's TYPE in Ruby's render is resolved
 *  through a structure-rule walk (the rule's `*captcha+*right+*follow+
 *  *type+*default` lookup). The TS engine resolves the same per-setting
 *  type via the corpus-derived RULE_TYPE_BY_SETTING map at the top of
 *  this file (the *all+*<setting> virtual rule bars in
 *  tmp/raw-ground-truth/expected/recapture-raw-shard-000000.jsonl pin
 *  id=47/List for permission rules, id=51/Toggle for captcha,
 *  id=34843/Pointer for input_type, etc.). Settings without a corpus
 *  entry (default/structure/content_options/content_option_view) fall
 *  through to the SETTING card's type — those settings don't surface
 *  virtual rule bars on the corpus's set pages, so the divergence
 *  doesn't surface there either. CLUSTER 2 (tiny-render-type-plus-right-
 *  rule-card): the corpus's `data-card-type-id` / `data-card-type-name`
 *  attrs and the slot's `TYPE-<name>` class fragment both read from
 *  these values; the pre-fix `Setting`/278 stamp made every virtual
 *  rule bar mis-type. */
export function buildVirtualRuleCard(inputs: VirtualRuleCardInputs): RenderCard {
  const { setCard, settingCard, settingCodename } = inputs;
  // set.name.s + "+" + "*" + setting's display codename. The bare
  // "*<codename>" form mirrors Ruby's Card.new construction: Ruby's
  // setting_list_item joins the set name with the SETTING CARD'S NAME
  // (which is "*<codename>" with the leading *), so the result is
  // "*captcha+*right+*follow" — the canonical compound form the engine
  // parses through DeckoName.parse (the engine's normal card-name
  // machinery, format.ts#resolveNestName).
  const compoundName = `${setCard.name.s}+*${settingCodename}`;
  const name = DeckoName.parse(compoundName);
  // Type resolution: the virtual rule card's TYPE in Ruby's render is
  // resolved through the structure-rule walk (mod/core/set/all/templating
  // .rb#structure + #structure_rule_card: the *type+*default rule
  // template lookup yields the rule card's own type_id). The corpus
  // pins this per setting (RULE_TYPE_BY_SETTING above; verified
  // against recapture-raw-shard-000000.jsonl). For settings without
  // a corpus entry (default/structure/content_options/content_option
  // _view), fall back to the SETTING card's type — the divergence
  // doesn't surface for those because their *all+X virtual rule bars
  // don't appear in the captured corpus.
  const ruleType = ruleTypeForSetting(settingCodename);
  const typeId = ruleType?.typeId ?? settingCard.typeId;
  const typeName = ruleType?.typeName ?? settingCard.typeName;
  const typeCode = ruleType?.typeCode ?? settingCard.typeCode;
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
