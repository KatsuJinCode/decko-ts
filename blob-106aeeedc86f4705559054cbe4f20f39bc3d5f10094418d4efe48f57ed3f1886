// follow/follow-rule-walk.ts — the follow-rule READ walk: what the follow
// views need to answer "does this actor follow this card, by which option,
// through which rule" and "which rules does a user hold".
//
// Ruby sources (card-mod-follow-0.20.0 unless noted):
//   set/all/follow.rb:19-33     follow_set_card / follow_rule_name /
//                               follow_rule_card / follow_rule?
//   set/type/set.rb:19-21       follow_rule_name on a SET:
//                               Card::Name[[name, user, :follow].compact]
//   set/all/follow/followed_by.rb:8-14
//                               followed_by? = follow_rule_applies? ||
//                               left&.followed_by_as_field? (recursive
//                               left-chain field walk)
//   set/all/follow/followed_by.rb:16-27
//                               followed_field? — the *follow_fields rule
//                               read (item membership or *nests)
//   set/all/follow/followed_by.rb:35-64
//                               follow_rule_applies? / follow_rule_option /
//                               all_follow_rule_options / the per-option
//                               applicability test
//   card-1.110.0 lib/card/rule.rb:39-45
//                               preference_names user, setting — the
//                               preference-card name search
//
// The SQL halves reuse the rule algebra
// (src/card/notify/follower-resolver.ts — its preference index, set-pattern
// walk, and follow_rule_option internals are exported for this file; the
// SQL is reused here rather than duplicated).

import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import {
  followRuleContent,
  followRuleOption,
  indexPreferenceRows,
  preferenceRows,
  setPatternsOf,
  type PreferenceIndex,
  type CardSetPattern,
} from "../notify/follower-resolver.js";

/** set/all/follow.rb:19-21 (all) + set/type/set.rb:35-37 (a set follows
 *  itself) + set/type/cardtype.rb:9-11 (name+*type): the card to follow to
 *  follow changes of this card. For a SET-typed card the set card is the
 *  card itself; the plain-card arm is `Card.fetch name, :self` — the name
 *  + "*self" junction. typeCode is the card's type_code ("set"/"cardtype")
 *  when the caller has it resolved; undefined takes the plain-card arm,
 *  which is the right shape for every non-set/non-cardtype card. */
export function followSetCardName(
  cardName: string,
  typeCode?: string,
): string {
  if (typeCode === "set") return cardName;
  if (typeCode === "cardtype") return `${cardName}+*type`;
  return `${cardName}+*self`;
}

/** set/type/set.rb:19-21 follow_rule_name:
 *  `Card::Name[[name, user, :follow].compact]` — the user part drops when
 *  absent (the *all-user rule name). */
export function followRuleNameFor(setName: string, userName?: string): string {
  return userName === undefined
    ? `${setName}+*follow`
    : `${setName}+${userName}+*follow`;
}

/** set/all/follow.rb:23-25 follow_rule_name on a plain card: the follow SET
 *  card's rule name. */
export function followRuleNameForCard(
  cardName: string,
  userName?: string,
  typeCode?: string,
): string {
  return followRuleNameFor(followSetCardName(cardName, typeCode), userName);
}

/** card-1.110.0 lib/card/rule.rb:39-45 preference_names user, setting:
 *  Card.search(right: {codename: setting}, left: {left: {type_id: SetID},
 *  right: user}, return: :name) — the FULL preference card names
 *  ("Set+User+*follow"), preference order = search order (rowid). This is
 *  the item_names arm of the virtual User+*follow pointer
 *  (set/type_plus_right/user/follow.rb:13-19). */
export async function preferenceNamesForUser(
  fetch: FetchEngine,
  userName: string,
  settingCodename = "follow",
): Promise<string[]> {
  const [setId, userId] = await Promise.all([
    fetch.codenames.id("set"),
    fetch.lexicon.id(DeckoName.parse(userName)),
  ]);
  const settingId = await fetch.codenames.id(settingCodename);
  if (setId === undefined || userId === undefined || settingId === undefined) {
    return [];
  }
  const r = await fetch.driver.query<{ id: number }>(
    `SELECT p.id AS id
       FROM cards p
       JOIN cards user_set ON p.left_id  = user_set.id
       JOIN cards set_card ON user_set.left_id = set_card.id
      WHERE p.right_id          = ?
        AND set_card.type_id    = ?
        AND user_set.right_id   = ?
        AND p.trash = 0 AND user_set.trash = 0 AND set_card.trash = 0
      ORDER BY p.id`,
    [settingId, setId, userId],
  );
  // compound names are COMPOSED at the fetch layer (cards.name holds only
  // simple-card names — the same reason follower-resolver composes
  // followerName through fetchById)
  const names: string[] = [];
  for (const row of r.rows) {
    const name = (await fetch.fetchById(row.id))?.name?.s;
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** The preference-index + pattern bundle one card's walk needs. Built once
 *  per walk (the SQL is the PreferenceCache mirror). */
export interface FollowWalkContext {
  readonly patterns: readonly CardSetPattern[];
  readonly index: PreferenceIndex;
  readonly allId: number | undefined;
}

export async function followWalkContext(
  fetch: FetchEngine,
  card: CardRecord,
): Promise<FollowWalkContext> {
  const [patterns, index, allId] = await Promise.all([
    setPatternsOf(fetch, card),
    preferenceRows(fetch).then(indexPreferenceRows),
    fetch.codenames.id("all"),
  ]);
  return { patterns, index, allId };
}

/** followed_by.rb:39-43 follow_rule_option: the first option line of the
 *  user's follow rule whose applicability test passes, or null.
 *  Reuses the private walk (exported for this file). */
export async function followRuleOptionFor(
  fetch: FetchEngine,
  card: CardRecord,
  followerId: number,
  ctx?: FollowWalkContext,
): Promise<string | null> {
  const walk = ctx ?? (await followWalkContext(fetch, card));
  return followRuleOption(
    fetch,
    card,
    walk.index,
    walk.patterns,
    followerId,
    walk.allId,
  );
}

/** followed_by.rb:8-10 followed_by?: the direct rule applies, OR the left
 *  chain's field-follow rule reaches this card
 *  (`follow_rule_applies?(user_id) || left&.followed_by_as_field?(self,
 *  user_id)`). followed_by_as_field? (:12-14) = followed_field?(field) &&
 *  followed_by?(user_id) — the recursion walks UP the left chain, so a
 *  follower of an ancestor follows the field when the ancestor's
 *  *follow_fields rule names the field (by key, or *nests for included
 *  cards). The *nests arm (nested_card? / nestee_ids, :29-31 +
 *  card-mod-history set/all/history.rb:55-57, 98-102) is ported below —
 *  it reads the card_references graph the write path maintains
 *  (src/card/actions/refresh-references-out.ts). */
export async function followedByUser(
  fetch: FetchEngine,
  card: CardRecord,
  userId: number,
): Promise<boolean> {
  const ctx = await followWalkContext(fetch, card);
  if ((await followRuleOptionFor(fetch, card, userId, ctx)) !== null) return true;
  const leftKey = card.name?.leftName?.key;
  if (leftKey === undefined) return false;
  const left = await fetch.fetchByKey(leftKey);
  if (left === undefined) return false;
  if (!(await followedFieldCheck(fetch, card, left))) return false;
  return followedByUser(fetch, left, userId);
}

/** followed_by.rb:16-27 followed_field? field_card: the LEFT card's
 *  *follow_fields rule item keys match the field card's key — or the item
 *  is the *nests codename card's key ("*nest", cardname.rb generate_key
 *  singularizes), whose arm (:29-31 nested_card?) asks nestee_ids
 *  (card-mod-history set/all/history.rb:55-57: `nesting_ids(:referee_id,
 *  :referer_id)` = the card_references rows with ref_type "I" and
 *  referer_id = the left card — the left card's content INCLUDES the field
 *  card). rule_card(:follow_fields) (:19 -> card-1.110.0 lib/card/rule/
 *  all.rb rule_card) walks the left card's set names in pattern order —
 *  self, then type, then *all (the follow mod seeds "*all+*follow fields"
 *  -> "*nests", data/real.yml:42-46); the first rule card with content
 *  wins. Items are read with `context: self` (:21 item_names(context:
 *  self)): a RELATIVE item ("+status") resolves against the LEFT card's
 *  name, so the port prefixes it before keying (absolute items and the
 *  *nests codename compare as-is; Ruby's other relative anchors
 *  (_left/_right) are not follow_fields conventions — boundary noted). */
async function followedFieldCheck(
  fetch: FetchEngine,
  fieldCard: CardRecord,
  leftCard: CardRecord,
): Promise<boolean> {
  const fieldKey = fieldCard.name?.key;
  if (fieldKey === undefined) return false;
  const leftName = leftCard.name?.s;
  if (leftName === undefined) return false;
  for (const ruleName of await followFieldsRuleNames(fetch, leftCard)) {
    const rule = await fetch.fetchByName(ruleName);
    if (rule === undefined || rule.dbContent === undefined || rule.dbContent === "") {
      continue;
    }
    const nestsKey = await nestsCodenameKey(fetch);
    for (const line of rule.dbContent.split("\n")) {
      const item = line.replace(/^\[\[/, "").replace(/\]\]$/, "");
      if (item.length === 0) continue;
      const key = DeckoName.parse(
        item.startsWith("+") ? `${leftName}${item}` : item,
      ).key;
      if (key === fieldKey) return true;
      if (nestsKey !== undefined && key === nestsKey) {
        if (await nestedCardCheck(fetch, leftCard, fieldCard)) return true;
      }
    }
  }
  return false;
}

/** rule_card(:follow_fields)'s candidate names in set-pattern order
 *  (followed_by.rb:19; the concrete simple-card chain: 09_self, 03_type,
 *  01_all — the preference walk's setPatternsOf order is the *all-first
 *  lookup order, the RULE walk is self-first specific-to-general). */
async function followFieldsRuleNames(
  fetch: FetchEngine,
  leftCard: CardRecord,
): Promise<string[]> {
  const leftName = leftCard.name?.s;
  if (leftName === undefined) return [];
  const names = [`${leftName}+*self+*follow fields`];
  if (leftCard.typeId !== undefined) {
    const typeName = (await fetch.fetchById(leftCard.typeId))?.name?.s;
    if (typeName !== undefined) names.push(`${typeName}+*type+*follow fields`);
  }
  names.push("*all+*follow fields");
  return names;
}

/** :nests.cardname.key (followed_by.rb:24): the *nests codename card's
 *  key (card-mod-search-0.20.0 data/real.yml:89-90 seeds it). A deck
 *  without the codename row still compares against the literal name's
 *  key — the standard deck always carries the card. */
async function nestsCodenameKey(fetch: FetchEngine): Promise<string | undefined> {
  const nestsId = await fetch.codenames.id("nests");
  if (nestsId !== undefined) {
    const name = (await fetch.fetchById(nestsId))?.name?.key;
    if (name !== undefined) return name;
  }
  return DeckoName.parse("*nests").key;
}

/** followed_by.rb:29-31 nested_card? card: `nestee_ids.include? card.id`
 *  — nestee_ids (card-mod-history set/all/history.rb:55-57 via
 *  nesting_ids :98-102) = Card::Reference.select(:referee_id)
 *  .where(ref_type: "I", referer_id: id) — the inclusion graph the write
 *  path maintains (refresh-references-out.ts: ref_type "I" = an {{...}}
 *  inclusion chunk). */
async function nestedCardCheck(
  fetch: FetchEngine,
  leftCard: CardRecord,
  fieldCard: CardRecord,
): Promise<boolean> {
  if (leftCard.id === undefined || fieldCard.id === undefined) return false;
  const r = await fetch.driver.query<{ referee_id: number }>(
    `SELECT referee_id FROM card_references
      WHERE ref_type = 'I' AND referer_id = ? AND referee_id = ?
      LIMIT 1`,
    [leftCard.id, fieldCard.id],
  );
  return r.rows.length > 0;
}
