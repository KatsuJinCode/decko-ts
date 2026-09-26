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
 *  *type+*default` lookup). The TS engine has no structure-rule walk
 *  for virtual cards; we pass through the SETTING CARD'S type_id as a
 *  best-effort fallback. The byte divergence in data-card-type-id /
 *  data-card-type-name attrs and the bar-right content is the cost of
 *  not implementing the full walk - the structural fix (denied-span ->
 *  real bar) is the round's lever and is independent of the type
 *  resolution. The SETTING card's type is universally `Setting` in the
 *  corpus (id 278), so the divergence is contained to one type_id attr
 *  per virtual slot. */
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
    typeId: settingCard.typeId,
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
  const setKeys = safeSetKeys({
    name,
    typeId: settingCard.typeId,
    typeName: settingCard.typeName,
    leftTypeName: setCard.typeName,
    isRule: true,
  });
  return {
    record,
    name,
    key: name.key,
    typeName: settingCard.typeName,
    typeId: settingCard.typeId,
    typeCode: settingCard.typeCode,
    id: undefined,
    dbContent: settingCard.dbContent,
    setKeys,
  };
}
