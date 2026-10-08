// notify/follower-resolver.ts — the real follower resolution: Ruby's
// follow-rule algebra walked against THIS deck's storage.
//
// Ruby sources (card-mod-follow-0.20.0 unless noted):
//   set/all/follow/follower_ids.rb:63-69   follower_ids = direct + indirect
//   set/all/follow/follower_ids.rb:95-114  direct_follower_ids walk
//                                          (set_names order, per-set user
//                                          enumeration, id dedupe)
//   set/all/follow/followed_by.rb:39-70    follow_rule_option +
//                                          all_follow_rule_options +
//                                          option applicability tests
//   set/all/notify.rb:49-55                notify_followers_of (actor +
//                                          account exclusions)
//   set/all/notify.rb:57-59 + set/right/account.rb:1-7
//                                          reason shape
//                                          {followed_set:, follow_option:}
//   set/self/{always,never,created,edited}.rb
//                                          the four follow options and
//                                          their registered tests /
//                                          candidate blocks
//   card-1.110.0 lib/card/rule.rb:47-51    all_user_ids_with_rule_for
//                                          (+ *all-user expansion)
//   card-1.110.0 lib/card/rule/all.rb:17-31,66-73
//                                          preference lookup (per-set,
//                                          user rule then *all-user
//                                          fallback, first set wins)
//   card-1.110.0 lib/card/rule/preference_cache.rb
//                                          the preference SQL this port
//                                          mirrors
//   card-mod-rules-0.20.0 set/type/set.rb:51-61
//                                          rule_cache_key_base +
//                                          all_user_ids_with_rule_for
//   card-1.110.0 mod/core/set_pattern/01..09
//                                          pattern registration order
//                                          (= set_names order)
//
// ALSO ported here (2026-10-03, gherkin-port-wave lane): the
// INDIRECT/field-follower walk — follower_ids.rb:74-83 indirect walk +
// follower_stash.rb:39-52 stash_field_followers + followed_by.rb:18-31
// followed_field?/*nests — resolveFollowers walks the left chain through
// followed_field? (the *follow_fields rule + the ref_type "I" inclusion
// check) and stashes each qualifying ancestor's direct followers.
//
// NOT ported here (deferred, cited for the next stream):
//   - changes_visible? (set/right/account.rb:9-11, the follower must
//     be able to read the card): permissions stream owns ok?(:read).

import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import type { SavePathEvent } from "./types.js";
import { deckEmailTemplateResolver } from "./deck-resolvers.js";
import type { EmailTemplateResolver, FollowNotifyDeps, FollowerRef, FollowerResolver } from "./follow-notify.js";

/** One row of Ruby's PreferenceCache SQL (rule/preference_cache.rb:8-30):
 *  a `Set+User+Setting` preference card joined through its parts. The
 *  set part carries TWO codenames: the set row's own (for the
 *  anchorless sets: *all, *star, ...) and the codename of the row its
 *  right_id points at (the pattern card — rule_cache_key_base reads
 *  Codename[r.id] of the set card's RIGHT card, mod-rules
 *  set/type/set.rb:51-57; compound set rows themselves have no name). */
interface PreferenceRow {
  rule_id: number;
  set_id: number;
  set_left_id: number | null;
  set_own_codename: string | null;
  set_right_codename: string | null;
  setting_codename: string | null;
  user_id: number;
  content: string | null;
}

/** One set the saved card belongs to, in Ruby's Pattern.concrete order
 *  (mod/core/set_pattern/01..09 registration order; lib/card/set/pattern/
 *  pattern/all.rb:57-60 set_names = patterns.map(&:to_s), and Base#to_s =
 *  anchorless ? pattern card name : "#{anchor}+#{pattern card name}",
 *  lib/card/set/pattern/base.rb:62-65). */
interface CardSetPattern {
  /** The set card name, e.g. "Pudding+*self" / "*all" (the mail's
   *  followed_set — notify.rb:58 reason[:set_card].name). */
  readonly setName: string;
  /** The rule lookup key: "#{anchor_id}+#{pattern_code}" or the bare
   *  pattern_code for anchorless patterns (base.rb:75-81,
   *  mod-rules set/type/set.rb:51-57 rule_cache_key_base). */
  readonly lookupKey: string;
}

/** Options registered by card-mod-follow set/self/*.rb. The TEST table
 *  (lib/card/follow_option.rb:6-7 @test) holds an applicability block per
 *  option codename; registered via follow_test in:
 *   - set/self/always.rb:5  -> always true
 *   - set/self/never.rb:5   -> always false
 *  *created / *edited register no test — the default test applies
 *  (followed_by.rb:58-63): candidate_ids.include?(follower_id). */
const OPTION_ALWAYS = "always";
const OPTION_NEVER = "never";
const OPTION_CREATED = "created";
const OPTION_EDITED = "edited";

/** The restrictive options' follower_candidate_ids blocks
 *  (lib/card/follow_option.rb:8-9 @follower_candidate_ids):
 *   - set/self/created.rb:5-7  -> [card.creator_id]
 *   - set/self/edited.rb:5-8   -> Card.search(editor_of: card.id)
 *  Any option without a block yields [] (followed_by.rb:66-70). */
async function followerCandidateIds(
  fetch: FetchEngine,
  card: CardRecord,
  optionCode: string | null,
): Promise<readonly number[]> {
  if (optionCode === OPTION_CREATED) return [card.creatorId ?? -1];
  if (optionCode === OPTION_EDITED) return editorIds(fetch, card.id);
  return [];
}

/** Card.search(editor_of: card.id) — query chain:
 *  relational_attributes.rb:28-29 editor_of -> tie_act :action_on
 *  (relational_attributes.rb:82-84, to: :actor_id) -> act_query.rb:13-15
 *  action_on -> action_query.rb:22-24 (ties card_actions by card_id;
 *  NO action_type filter — draft actions count as edits, mirroring
 *  Ruby). Editors = the acts' actor_ids. */
async function editorIds(fetch: FetchEngine, cardId: number | undefined): Promise<number[]> {
  if (cardId === undefined) return [];
  const r = await fetch.driver.query<{ actor_id: number }>(
    `SELECT DISTINCT ca.actor_id AS actor_id
       FROM card_actions a
       JOIN card_acts ca ON ca.id = a.card_act_id
      WHERE a.card_id = ?`,
    [cardId],
  );
  return r.rows.map((row) => Number(row.actor_id));
}

/** FollowOption.test[option_code] (followed_by.rb:58-63):
 *  registered test wins; otherwise candidate membership. */
function optionApplies(
  optionCode: string | null,
  followerId: number,
  candidateIds: readonly number[],
): boolean {
  if (optionCode === OPTION_ALWAYS) return true; // set/self/always.rb:5
  if (optionCode === OPTION_NEVER) return false; // set/self/never.rb:5
  return candidateIds.includes(followerId); // followed_by.rb:62 default
}

/** The saved card's containing sets, Ruby order. Pattern applicability
 *  per mod/core/set_pattern/01_all.rb .. 09_self.rb:
 *   01 all     always                         -> "*all"
 *   02 all_plus compound? (compound_only)     -> "*all plus"   (anchorless)
 *   03 type    type_id present                -> "<Type>+*type"
 *   04 star    name.star? (simple + "*" lead, lib/card/name.rb:115-117)
 *                                             -> "*star"       (anchorless)
 *   05 rstar   name.rstar? (right "*"-leads, lib/card/name.rb:119-121)
 *                                             -> "*rstar"      (anchorless)
 *   06 rule    card.rule? (standard_rule? || preference?,
 *              lib/card/rule/all.rb:33-47)   -> "*rule"       (anchorless)
 *   07 right   compound                       -> "<right part>+*right"
 *   08 type_plus_right compound                -> "<LeftType>+<right>
 *                                                 +*type plus right"
 *   09 self    always                         -> "<name>+*self"
 */
async function setPatternsOf(fetch: FetchEngine, card: CardRecord): Promise<CardSetPattern[]> {
  const name = card.name;
  if (name === undefined) return []; // a nameless row has no set_names
  const patterns: CardSetPattern[] = [];

  patterns.push({ setName: "*all", lookupKey: "all" });
  if (!name.isSimple) patterns.push({ setName: "*all plus", lookupKey: "all_plus" });

  if (card.typeId !== undefined) {
    const typeName = (await fetch.fetchById(card.typeId))?.name;
    if (typeName !== undefined) {
      patterns.push({ setName: `${typeName.s}+*type`, lookupKey: `${card.typeId}+type` });
    }
  }

  if (name.isSimple && name.s.startsWith("*")) {
    patterns.push({ setName: "*star", lookupKey: "star" });
  }
  const rightName = name.rightName;
  if (!name.isSimple && rightName !== undefined && rightName.s.startsWith("*")) {
    patterns.push({ setName: "*rstar", lookupKey: "rstar" });
  }

  if (await isRuleCard(fetch, card)) {
    patterns.push({ setName: "*rule", lookupKey: "rule" });
  }

  if (!name.isSimple && rightName !== undefined) {
    const tagId = await fetch.lexicon.id(rightName);
    if (tagId !== undefined) {
      patterns.push({ setName: `${rightName.s}+*right`, lookupKey: `${tagId}+right` });
    }
    // type_plus_right anchor = "<left card's type name>+<right part>"
    // (mod/core/set_pattern/08_type_plus_right.rb anchor_name); the
    // anchor id is the LEXICON id of that compound anchor name
    // (base.rb:17-20 find_anchor_id -> @anchor_name.card_id).
    const leftName = name.leftName;
    if (leftName !== undefined) {
      const leftType = await typeOfCard(fetch, leftName);
      if (leftType !== undefined) {
        const anchorName = DeckoName.parse(`${leftType}+${rightName.s}`);
        const anchorId = await fetch.lexicon.id(anchorName);
        if (anchorId !== undefined) {
          patterns.push({
            setName: `${leftType}+${rightName.s}+*type plus right`,
            lookupKey: `${anchorId}+type_plus_right`,
          });
        }
      }
    }
  }

  patterns.push({ setName: `${name.s}+*self`, lookupKey: `${card.id}+self` });
  return patterns;
}

/** card.rule? (lib/card/rule/all.rb:33-47): standard_rule? (right is a
 *  Setting AND left is a Set) || preference? (>2 parts, right Setting,
 *  leading Set + User/*all preferer). */
async function isRuleCard(fetch: FetchEngine, card: CardRecord): Promise<boolean> {
  const name = card.name;
  if (name === undefined || name.isSimple) return false;
  const [settingId, setId, userId] = await Promise.all([
    fetch.codenames.id("setting"),
    fetch.codenames.id("set"),
    fetch.codenames.id("user"),
  ]);
  if (settingId === undefined) return false;

  const right = card.rightId !== undefined && card.rightId !== null
    ? await fetch.fetchById(card.rightId)
    : await fetch.fetchByName(name.tagName);
  if (right?.typeId !== settingId) return false;

  const left = card.leftId !== undefined && card.leftId !== null
    ? await fetch.fetchById(card.leftId)
    : await fetch.fetchByName(name.leftName as DeckoName);
  // standard_rule? branch (rule/all.rb:37-39)
  if (setId !== undefined && left?.typeId === setId) return true;

  // preference? branch (rule/all.rb:42-47): >2 parts, name[0..-3] is a
  // Set, and the preferer (part -2) is a User card or *all.
  const parts = name.partNames;
  if (parts.length <= 2 || setId === undefined) return false;
  const prefererName = parts[parts.length - 2];
  const setPartName = parts.length > 2 ? name.getRange(0, -3) : undefined;
  if (setPartName === undefined || prefererName === undefined) return false;
  const setPart = await fetch.fetchByName(setPartName);
  if (setPart?.typeId !== setId) return false;
  const preferer = await fetch.fetchByName(prefererName);
  if (preferer === undefined) return false;
  const allId = await fetch.codenames.id("all");
  const prefererIsUser = (userId !== undefined && preferer.typeId === userId) ||
    (allId !== undefined && preferer.id === allId);
  return prefererIsUser;
}

async function typeOfCard(fetch: FetchEngine, name: DeckoName): Promise<string | undefined> {
  const card = await fetch.fetchByName(name);
  if (card?.typeId === undefined) return undefined;
  return (await fetch.fetchById(card.typeId))?.name?.s;
}

/** The deck's preference rows, one SQL mirroring Ruby's
 *  PreferenceCache (rule/preference_cache.rb:8-30): every non-trashed
 *  `Set+User+Setting` card whose Set is typed Set, Setting is typed
 *  Setting, and User is typed User or is the `*all` card. Ruby splits
 *  this into a rule_id cache + a user-id cache; the rows are the same. */
async function preferenceRows(fetch: FetchEngine): Promise<PreferenceRow[]> {
  const [setId, settingId, userId] = await Promise.all([
    fetch.codenames.id("set"),
    fetch.codenames.id("setting"),
    fetch.codenames.id("user"),
  ]);
  if (setId === undefined || settingId === undefined || userId === undefined) return [];

  const r = await fetch.driver.query<PreferenceRow>(
    `SELECT preferences.id AS rule_id,
            sets.id AS set_id,
            sets.left_id AS set_left_id,
            sets.codename AS set_own_codename,
            set_right.codename AS set_right_codename,
            settings.codename AS setting_codename,
            users.id AS user_id,
            preferences.db_content AS content
       FROM cards preferences
       JOIN cards user_sets ON preferences.left_id  = user_sets.id
       JOIN cards settings  ON preferences.right_id = settings.id
       JOIN cards users     ON user_sets.right_id   = users.id
       JOIN cards sets      ON user_sets.left_id    = sets.id
       LEFT JOIN cards set_right ON set_right.id = sets.right_id
      WHERE sets.type_id     = ?
        AND settings.type_id = ?
        AND (users.type_id = ? OR users.codename = 'all')
        AND sets.trash        = 0
        AND settings.trash    = 0
        AND users.trash       = 0
        AND user_sets.trash   = 0
        AND preferences.trash = 0`,
    [setId, settingId, userId],
  );
  return r.rows;
}

/** set/type/set.rb:51-57 rule_cache_key_base of the SET row:
 *  compound -> "<left_id>+<codename of the right (pattern) card>";
 *  otherwise the row's own codename (the anchorless sets: *all, *all
 *  plus, *star, *rstar, *rule). */
function setRowKeyBase(row: PreferenceRow): string | null {
  if (row.set_left_id !== null && row.set_left_id !== undefined) {
    const rightCode = row.set_right_codename;
    return rightCode === null || rightCode === undefined
      ? null
      : `${row.set_left_id}+${rightCode}`;
  }
  const ownCode = row.set_own_codename;
  return ownCode === null || ownCode === undefined ? null : ownCode;
}

/** Ruby's two preference lookups, keyed the way PreferenceCache keys
 *  them: userIdsBySet["<setKeyBase>+<setting>"] (the USER_ID_CACHE_KEY
 *  hash, preference_cache.rb:44-52) and ruleContentByUser[
 *  "<setKeyBase>+<setting>+<user>"] (the rule_id cache, hash assignment
 *  — later rows overwrite, matching Ruby's rows.each assignment). */
interface PreferenceIndex {
  readonly userIdsBySet: Map<string, number[]>;
  readonly ruleContentByUser: Map<string, string>;
}

function indexPreferenceRows(rows: readonly PreferenceRow[]): PreferenceIndex {
  const userIdsBySet = new Map<string, number[]>();
  const ruleContentByUser = new Map<string, string>();
  for (const row of rows) {
    const base = setRowKeyBase(row);
    if (base === null) continue;
    const setting = row.setting_codename;
    if (setting === null || setting === undefined) continue;
    const setKey = `${base}+${setting}`;
    const users = userIdsBySet.get(setKey);
    if (users === undefined) userIdsBySet.set(setKey, [row.user_id]);
    else if (!users.includes(row.user_id)) users.push(row.user_id);
    ruleContentByUser.set(`${setKey}+${row.user_id}`, row.content ?? "");
  }
  return { userIdsBySet, ruleContentByUser };
}

/** lib/card/rule.rb:47-51 all_user_ids_with_rule_for: the set's rule
 *  users, expanded to EVERY user when the *all card holds the rule
 *  (card-1.110.0 lib/card/rule.rb:55-57 all_user_ids = Card.where(
 *  type_id: UserID) — deliberately NO trash filter, mirroring Ruby). */
async function enumeratedUserIds(
  fetch: FetchEngine,
  index: PreferenceIndex,
  lookupKey: string,
): Promise<readonly number[]> {
  const userIds = index.userIdsBySet.get(`${lookupKey}+follow`);
  if (userIds === undefined) return [];
  const allId = await fetch.codenames.id("all");
  if (allId === undefined || !userIds.includes(allId)) return userIds;
  const userId = await fetch.codenames.id("user");
  if (userId === undefined) return userIds;
  const r = await fetch.driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE type_id = ?",
    [userId],
  );
  return r.rows.map((row) => Number(row.id));
}

/** lib/card/rule/all.rb:17-31,66-73 preference(:follow, user) on the
 *  FOLLOWED card: walk the card's rule_lookup_keys in pattern order;
 *  per set try the user's own rule first, then the SET+*all+*follow
 *  default (the fallback_suffix, rule/all.rb:69); the first set that
 *  yields a rule wins — even if a more specific set has a different
 *  rule (Ruby walks general -> specific and stops at the first hit). */
async function followRuleContent(
  fetch: FetchEngine,
  index: PreferenceIndex,
  patterns: readonly CardSetPattern[],
  followerId: number,
  allId: number | undefined,
): Promise<string | null> {
  for (const pattern of patterns) {
    const own = index.ruleContentByUser.get(`${pattern.lookupKey}+follow+${followerId}`);
    if (own !== undefined) return own;
    if (allId !== undefined) {
      const fallback = index.ruleContentByUser.get(`${pattern.lookupKey}+follow+${allId}`);
      if (fallback !== undefined) return fallback;
    }
  }
  return null;
}

/** The option codename of one follow-rule line: line.to_name.codename
 *  (followed_by.rb:53) = Codename[Lexicon.id(line)] (name_variants.rb
 *  :37-39). A line whose name has no codename (or no card) yields nil,
 *  which never matches (no test, no candidates).
 *
 *  Link-bracket form: the upstream feature steps write the preference
 *  content as "[[*always]]" (edit_steps.rb:9 "the card ...+*follow
 *  contains \"[[*always]]\"") and the notifications arrive
 *  (update_includers.feature:19-20), so Ruby's line resolution accepts
 *  the link form; the port strips the brackets before the lexicon
 *  lookup for the same acceptance. */
async function optionCodeOfLine(
  fetch: FetchEngine,
  line: string,
): Promise<string | null> {
  const bare = line.replace(/[[\]]/g, "").trim();
  const id = await fetch.lexicon.id(DeckoName.parse(bare));
  if (id === undefined) return null;
  const card = await fetch.fetchById(id);
  return card?.codename ?? null;
}

/** followed_by.rb:39-43 follow_rule_option: the first option LINE in
 *  the user's follow-rule content whose applicability test passes, or
 *  nil (not a follower via this walk). */
async function followRuleOption(
  fetch: FetchEngine,
  card: CardRecord,
  index: PreferenceIndex,
  patterns: readonly CardSetPattern[],
  followerId: number,
  allId: number | undefined,
): Promise<string | null> {
  const content = await followRuleContent(fetch, index, patterns, followerId, allId);
  if (content === null || content === "") return null; // rule/all.rb:18 present? guard
  for (const line of content.split("\n")) {
    const optionCode = await optionCodeOfLine(fetch, line);
    const candidates = await followerCandidateIds(fetch, card, optionCode);
    if (optionApplies(optionCode, followerId, candidates)) {
      // each_direct_follower_id_with_reason strips the option's
      // brackets for the reason (follower_ids.rb:118); 1.110 rule
      // content stores bare option names ("*always"), so the star
      // survives the strip — as in Ruby.
      return line.replace(/[[\]]/g, "");
    }
  }
  return null;
}

/** Follower delivery target: follower.account's +*email
 *  (card-mod-account set/right/account.rb:3 card_accessor :email —
 *  the account card <user>+*account and its <user>+*account+*email
 *  child; set/right/account.rb:2 `return unless email.present?`).
 *  null = no account/email: discovery keeps the follower, delivery
 *  skips them (notify.rb:51's `!follower.account` half — same split). */
async function followerEmail(fetch: FetchEngine, followerId: number): Promise<string | null> {
  const follower = await fetch.fetchById(followerId);
  const followerName = follower?.name;
  if (followerName === undefined) return null;
  const emailCard = await fetch.fetchByName(`${followerName.s}+*account+*email`);
  const email = emailCard?.dbContent;
  return email === undefined || email === "" ? null : email;
}

/**
 * Ruby's direct-follower walk for one card
 * (set/all/follow/follower_ids.rb:95-114 direct_follower_ids +
 * :107-114 direct_follower_ids_for_set): for each containing set in
 * pattern order, enumerate the users with a *follow preference for
 * that set (rule.rb:47-51), dedupe against earlier sets, and keep the
 * user only when follow_rule_option finds an applicable option. The
 * resulting FollowerRef[] order IS Ruby's order: set order = pattern
 * registration order, per-set user order = preference-row order (the
 * same order Ruby's PreferenceCache produces; Ruby defines no further
 * ordering), and the first (set, option) a user matches wins — a user
 * matching two sets/lines appears once with the first reason.
 */
export async function resolveFollowers(
  fetch: FetchEngine,
  cardId: number | null,
  _event: SavePathEvent,
): Promise<readonly FollowerRef[]> {
  if (cardId === null) return [];
  const card = await fetch.fetchById(cardId);
  if (card === undefined || card.trash) return [];

  // follower_ids.rb:66-68: follower_ids = direct_follower_ids +
  // indirect_follower_ids, in that order (the dedupe set is shared).
  const seen = new Set<number>();
  const refs: FollowerRef[] = [];
  await stashDirectFollowers(fetch, card, seen, refs);
  await stashFieldFollowers(fetch, card, seen, refs);
  return refs;
}

/** The direct walk for ONE card — follower_ids.rb:95-114
 * direct_follower_ids (the former body of resolveFollowers, reused by the
 * indirect walk for the left-chain cards). */
async function stashDirectFollowers(
  fetch: FetchEngine,
  card: CardRecord,
  seen: Set<number>,
  refs: FollowerRef[],
): Promise<void> {
  const patterns = await setPatternsOf(fetch, card);
  const index = indexPreferenceRows(await preferenceRows(fetch));
  const allId = await fetch.codenames.id("all");

  for (const pattern of patterns) {
    const userIds = await enumeratedUserIds(fetch, index, pattern.lookupKey);
    for (const followerId of userIds) {
      if (seen.has(followerId)) continue; // follower_ids.rb:109 dedupe
      const option = await followRuleOption(fetch, card, index, patterns, followerId, allId);
      if (option === null) continue; // follower_ids.rb:109 no applicable option
      seen.add(followerId);
      const follower = await fetch.fetchById(followerId);
      if (follower === undefined) continue; // unreachable for seeded users
      refs.push({
        followerId,
        followerName: follower.name?.s ?? "",
        followerEmail: await followerEmail(fetch, followerId),
        followedSetName: pattern.setName,
        followOption: option,
      });
    }
  }
}

/**
 * The indirect walk — follower_ids.rb:74-83 indirect_follower_ids:
 *
 *   result = ::Set.new
 *   left_card = left
 *   while left_card
 *     result += left_card.direct_follower_ids if left_card.followed_field? self
 *     left_card = left_card.left
 *   end
 *
 * A field's change notifies the followers of each left ancestor that
 * "follows fields" like this one (followed_field?,
 * followed_by.rb:18-27): the ancestor's *follow_fields rule lists either
 * the field's key or *nests (any card it includes). The stash dedupe
 * (follower_stash.rb:14-15 @checked) is the shared `seen` set.
 */
async function stashFieldFollowers(
  fetch: FetchEngine,
  card: CardRecord,
  seen: Set<number>,
  refs: FollowerRef[],
): Promise<void> {
  let leftName = card.name?.leftName;
  while (leftName !== undefined) {
    const left = await fetch.fetchByName(leftName);
    if (left === undefined || left.trash) break;
    if (await followedField(fetch, left, card)) {
      await stashDirectFollowers(fetch, left, seen, refs);
    }
    leftName = left.name?.leftName;
  }
}

/** followed_field? (followed_by.rb:18-27): the left card's
 * rule_card(:follow_fields) items — the field's key, or *nests when the
 * left card includes the field. */
async function followedField(
  fetch: FetchEngine,
  left: CardRecord,
  field: CardRecord,
): Promise<boolean> {
  const ruleContent = await followFieldsRuleContent(fetch, left);
  if (ruleContent === null || ruleContent === "") return false; // no rule_card -> false (:19)
  for (const item of ruleContent.split("\n")) {
    const itemKey = DeckoName.parse(item.trim()).key;
    if (field.name !== undefined && itemKey === field.name.key) return true; // :21-22
    if (itemKey === NESTS_KEY && (await nestedCard(fetch, left, field))) return true; // :23-24
  }
  return false;
}

/** :nests.cardname.key (followed_by.rb:23) — the key of the *nests card. */
/** :nests.cardname.key (followed_by.rb:23) — the KEY of the *nests card.
 *  Cardname keys singularize (the cardname gem's key algorithm, mirrored by
 *  DeckoName.parse().key), so the key of "*nests" is "*nest" — both sides
 *  of the :22-24 comparison are keys, and Ruby's own comparison matches on
 *  the singularized form. */
const NESTS_KEY = "*nest";

/** nested_card? (followed_by.rb:29-31): nestee_ids.include?(card.id) —
 * nestees are the referees of this card's ref_type "I" references
 * (card-1.110.0 lib/card/reference/all.rb:31-34). */
async function nestedCard(
  fetch: FetchEngine,
  left: CardRecord,
  field: CardRecord,
): Promise<boolean> {
  if (left.id === undefined || field.id === undefined) return false;
  const r = await fetch.driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_references WHERE referer_id = ? AND ref_type = 'I' AND referee_id = ?",
    [left.id, field.id],
  );
  return Number(r.rows[0]?.n ?? 0) > 0;
}

/** rule_card(:follow_fields) (followed_by.rb:19) — the left card's
 * *follow_fields rule, read in rule-lookup order (the card's set patterns,
 * first rule row wins; card-1.110.0 lib/card/rule.rb rule_card's
 * lookup_keys walk). The rule rows are `Set+*follow fields` cards (right =
 * the follow_fields setting card, left = the set card). */
async function followFieldsRuleContent(
  fetch: FetchEngine,
  left: CardRecord,
): Promise<string | null> {
  const settingId = await fetch.codenames.id("follow_fields");
  if (settingId === undefined) return null;
  const patterns = await setPatternsOf(fetch, left);
  for (const pattern of patterns) {
    const setId = await setCardIdForPattern(fetch, pattern.lookupKey);
    if (setId === undefined) continue;
    const r = await fetch.driver.query<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1",
      [setId, settingId],
    );
    const content = r.rows[0]?.db_content;
    if (content !== undefined && content !== null) return content;
  }
  return null;
}

/** The SET CARD id for one pattern lookup key: anchorless patterns ("all",
 * "all_plus", "star", "rstar", "rule") are their own codename card;
 * anchored patterns ("<anchorId>+<code>") are the compound row
 * left = anchor, right = the pattern's codename card
 * (mod/core/set_pattern/*: the set card of "X+*self" is the
 * X+*self row). */
async function setCardIdForPattern(
  fetch: FetchEngine,
  lookupKey: string,
): Promise<number | undefined> {
  const plus = lookupKey.lastIndexOf("+");
  if (plus === -1) return fetch.codenames.id(lookupKey);
  const anchorId = Number(lookupKey.slice(0, plus));
  const code = lookupKey.slice(plus + 1);
  const patternCardId = await fetch.codenames.id(code);
  if (patternCardId === undefined || Number.isNaN(anchorId)) return undefined;
  const r = await fetch.driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1",
    [anchorId, patternCardId],
  );
  const id = r.rows[0]?.id;
  return id === undefined ? undefined : Number(id);
}

/**
 * The FollowerResolver the save path uses when the host doesn't inject
 * one :
 * resolveFollowers above plus Ruby's notify-layer exclusions from
 * set/all/notify.rb:49-55 notify_followers_of — the ACTOR never gets
 * notified about their own act (`next if follower == act.actor`,
 * notify.rb:51). The account half of that same guard is downstream
 * (null followerEmail -> follow-notify.ts skips, matching
 * set/right/account.rb:2 `return unless email.present?`).
 */
export function defaultFollowerResolver(fetch: FetchEngine): FollowerResolver {
  return async (cardId: number | null, event: SavePathEvent): Promise<readonly FollowerRef[]> => {
    const refs = await resolveFollowers(fetch, cardId, event);
    return refs.filter((ref) => ref.followerId !== event.actor.id);
  };
}

/**
 * The full FollowNotifyDeps the save path builds when the host supplies
 * no hook of its own ("Save-path registration
 * line"): the rule-algebra follower resolver above, the deck-backed
 * email-template resolver (deck-resolvers.ts — Ruby reads
 * Card[:follower_notification_email] fresh per notification), and the
 * per-follower identity default for Ruby's `Auth.as(left.id)`
 * (card-mod-follow set/right/account.rb:16). An `opts.followers`
 * override swaps in any FollowerResolver (dependency injection) while
 * the template/auth halves stay deck-backed.
 */
export function defaultFollowNotifyDeps(
  fetch: FetchEngine,
  opts: { followers?: FollowerResolver; template?: EmailTemplateResolver } = {},
): FollowNotifyDeps {
  return {
    followers: opts.followers ?? defaultFollowerResolver(fetch),
    template: opts.template ?? deckEmailTemplateResolver(fetch),
    // Auth.as(left.id) runs the template as the FOLLOWER; the delivery
    // target is ref.followerEmail (account.rb:17 `to: email`), so the
    // actor's own email field is not part of the notice path.
    authAs: (id: number, name: string) => ({ id, name, email: null }),
    defaultFrom: "",
  };
}

// ---------------------------------------------------------------------------
// Read-walk exports: the follow VIEWS walk the
// same rule algebra the notify path resolves (follow_rule_option /
// follow_rule_content / the preference index / the set-pattern walk).
// The functions above were module-private for the notify stream; the
// follow-rule read walk (src/card/follow/follow-rule-walk.ts) reuses them
// here instead of duplicating the SQL.
// ---------------------------------------------------------------------------

export {
  followerCandidateIds,
  optionApplies,
  setPatternsOf,
  preferenceRows,
  indexPreferenceRows,
  enumeratedUserIds,
  followRuleContent,
  followRuleOption,
  optionCodeOfLine,
};
export type { CardSetPattern, PreferenceIndex, PreferenceRow };
