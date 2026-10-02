// follow/follow-render-seam.ts — the render-time follow seam: the narrow,
// read-only bundle the follow/account views read synchronously, built in
// RenderEngine.render's async prepare phase ONLY when the requested view is
// one of FOLLOW_SEAM_VIEWS (the exact pattern of the history seam,
// src/card/history/render-seam.ts: "prepare-then-sync-render split every
// other engine query seam uses").
//
// THE ACTOR BOUNDARY (the current actor IS the engine session — the same
// page-chrome session pattern the rest of the chrome reads): every
// Auth.current_id / Auth.current.name / Auth.signed_in?
// walk in the follow/account view bodies resolves through the engine's
// pageSession field (src/card/render.ts, "The page-chrome session (Ruby
// Auth.current)") — never through a global, never through the read-verdict
// viewer. The seam resolves the session actor's NAME once per actor (the
// async half a sync ViewFn cannot do) and degrades an unresolvable session
// to signed-out the way RenderEngine.prepareSessionAccountLinks does
// (render.ts: the auth/current.rb:58-63 unresolvable-session shape).

import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import type { RenderCard } from "../render/format.js";
import type { ReadViewer } from "../permissions/read-rules.js";
import { DeckoName } from "../name.js";
import { FOLLOW_OPTION_ALL } from "./follow-options.js";
import { followRuleNameFor, followRuleOptionFor } from "./follow-rule-walk.js";

/** The views whose bodies read the seam. Gated so a :titled/:open/:content
 *  render never touches the walk (the history seam's rule). :closure is the
 *  account side's one async body (the closure_deletions search); the
 *  account views ride the same seam. */
export const FOLLOW_SEAM_VIEWS: ReadonlySet<string> = new Set([
  "follow_button",
  "follow_tab",
  "ignore_tab",
  "link_with_checkbox", // type/role.rb:26-32 role_checkbox reads Auth.current
  "closure",
  // the board family (card-mod-edit tab_views.rb:2-5/:42-44):
  // engage_tab's render_follow_section + follow_section itself
  "follow_section",
  "engage_tab",
]);

/** The resolved current actor — Ruby Auth.current (card id + name).
 *  undefined = signed out (Auth.current_id == AnonymousID arms: show_follow?
 *  false, allowed_to_change_follow_status? false). */
export interface FollowActorSession {
  readonly actorId: number;
  readonly actorName: string;
}

/** One row of the User+*follow follow/ignore editor
 *  (set/type_plus_right/user/follow.rb follow_editor.haml walks
 *  [rule_card, option] pairs). ruleCardName is the preference card name
 *  ("Set+User+*follow"); option is one follow option line of that rule. */
export interface FollowTabRow {
  readonly ruleCardName: string;
  readonly option: string;
  /** The rule's SET name ("Set+*self" etc.) — the row's rule_set, for the
   *  follow_item link target + option description. */
  readonly ruleSetName: string;
}

/** What the seam carries for one render. Only what the gated view bodies
 *  consume; fields not relevant to the requested view are cheap no-ops
 *  (one preference-index SQL shared across the walk). */
export interface FollowRenderBundle {
  /** Auth.current — undefined when signed out. */
  readonly session: FollowActorSession | undefined;
  /** card.followed? (set/all/follow/followed_by.rb:2-4:
   *  followed_by? Auth.current_id) under the session actor. False when
   *  signed out (followed_by? nil-id has no rule walk in Ruby — the option
   *  candidate tests take follower_id; no user id matches "always"-less
   *  walks... Ruby: followed_by? Auth.current_id with AnonymousID DOES run
   *  the walk; Anonymous never holds rules, so the port's false is the
   *  observed Ruby outcome, computed here without the walk). */
  readonly followed: boolean;
  /** The follow rule NAME the session actor's button acts on
   *  (FollowLink#mark: follow_set_card.follow_rule_name(Auth.current.name)
   *  — follow_link.rb:50-52). Undefined when signed out (Ruby would build
   *  the name for Anonymous; the button is a session surface — the port
   *  carries the Anonymous name shape instead: see
   *  followMarkForAnonymous). */
  readonly followMark: string | undefined;
  /** The root card's follow_label (set/all/follow.rb:6-8 name;
   *  set/type/set.rb:9-15 the pattern short label) — the link title text. */
  readonly followLabel: string;
  /** direct_follower_ids.size (follower_ids.rb:95-115) - the DISTINCT
   *  users holding a "<set>+<user>+*follow" preference whose set covers
   *  the render card's simple-card set chain (set_names: <name>+*self,
   *  <type>+*type, *all). The junction/right sets and the
   *  *follow_fields/*nests indirect walk are the documented remainders
   *  (the gap). 0 when signed out is not assumed - the walk
   *  runs regardless (Ruby's count is actor-independent). */
  readonly followerCount: number;
  /** The User+*follow editor rows (follow_tab: following_rules_and_options;
   *  ignore_tab: ignoring_rules_and_options). */
  readonly followTabRows: readonly FollowTabRow[];
  readonly ignoreTabRows: readonly FollowTabRow[];
  /** The closure walk (account_holder.rb:87-89 closure_deletions:
   *  Auth.as_bot { Card.search left: id, not: {right: :account} }) — the
   *  accounted user's cards minus the +*account rights, search order
   *  (rowid; Ruby CQL default sort is by name — the seed decks' names sort
   *  identically at the sizes the corpus carries; DISCLOSED in the receipt:
   *  no oracle bytes exist to split the two orderings). */
  readonly closureDeletions: readonly { readonly name: string }[];
}

/** Ruby: the FollowLink mark for Anonymous — the name is still built
 *  (follow_rule_name "Anonymous"). The port resolves it lazily only when a
 *  signed-out :follow_button render needs a mark... it does not: the
 *  signed-out button is the Start arm and Ruby's start button carries the
 *  Anonymous mark. To stay byte-faithful the seam builds the Anonymous mark
 *  when the "*anonymous"/"anon" codename card exists and leaves it
 *  undefined when it does not (a deck without the account mod's seeds). */
async function anonymousActorName(
  fetch: FetchEngine,
): Promise<string> {
  const anonId = await fetch.codenames.id("anon");
  if (anonId !== undefined) {
    const name = (await fetch.fetchById(anonId))?.name?.s;
    if (name !== undefined) return name;
  }
  // the Anonymous card is a system card in every Ruby deck (AnonymousID);
  // a deck without the codename row still renders the literal name
  return "Anonymous";
}

/** account_holder.rb:87-89 closure_deletions: Card.search(left: id,
 *  not: {right: :account}) — every non-trashed card whose LEFT is the
 *  accounted user except the +*account-family rights. */
async function closureDeletions(
  fetch: FetchEngine,
  userId: number,
): Promise<{ readonly name: string }[]> {
  const accountId = await fetch.codenames.id("account");
  const r = await fetch.driver.query<{ id: number }>(
    `SELECT id FROM cards
      WHERE left_id = ? AND trash = 0
        AND (right_id IS NULL OR right_id != ?)
      ORDER BY id`,
    [userId, accountId ?? -1],
  );
  // compound names are composed at the fetch layer (cards.name holds only
  // simple-card names)
  const out: { readonly name: string }[] = [];
  for (const row of r.rows) {
    const name = (await fetch.fetchById(row.id))?.name?.s;
    if (name !== undefined) out.push({ name });
  }
  return out;
}

/** The User+*follow editor rows (follow_editor_helper.rb):
 *  - following_rules_and_options (:7-11): every preference card of the
 *    user, options = the rule's items minus *never (:75-80).
 *  - ignoring_rules_and_options (:14-19): rules whose items include *never,
 *    options = [*never] (:16-18).
 *  The rows arrive in the helper's walk order: Pattern.concrete.reverse
 *  (:37 file order = 01..09) per rules_and_options_by_set_pattern (:34-46),
 *  options in rule-content line order.
 *  The suggestions arm (:83-90 suggested_following_rule_options_hash +
 *  :63-70 merge_option_hashes) folds the "follow suggestions" codename
 *  card's items (user/follow.rb:21-23 Card[:follow_suggestions]&.
 *  item_names) into the following rows: a suggestion whose rule key is
 *  already held appends its option (uniq, existing order first); the
 *  remaining suggestions become new rows appended after the held rules,
 *  ruleCardName = the preference NAME KEY (cardname.rb generate_key
 *  part_keys.join("+")) — Ruby's `Card.fetch key, new: {}` builds a NEW
 *  card whose name is that key string. Runs only under current_user?
 *  (user/follow.rb:25-27 Auth.signed_in? && Auth.current_id == left.id) —
 *  opts.sessionId === opts.trunkId with both defined. */
export interface FollowEditorRowsOptions {
  /** Auth.current_id — the session actor (undefined = signed out). */
  readonly sessionId?: number;
  /** card.trunk — the rendered User+*follow card's LEFT id. */
  readonly trunkId?: number;
}

export async function followEditorRows(
  fetch: FetchEngine,
  userName: string,
  opts: FollowEditorRowsOptions = {},
): Promise<{ following: FollowTabRow[]; ignoring: FollowTabRow[] }> {
  const following: FollowTabRow[] = [];
  const ignoring: FollowTabRow[] = [];
  const userId = await fetch.lexicon.id(DeckoName.parse(userName));
  if (userId === undefined) return { following, ignoring };

  // rule.rb:39-45 preference names for the user (follow)
  const [setId, followSettingId] = await Promise.all([
    fetch.codenames.id("set"),
    fetch.codenames.id("follow"),
  ]);
  if (setId === undefined || followSettingId === undefined) {
    return { following, ignoring };
  }
  const r = await fetch.driver.query<{
    id: number;
    content: string | null;
    set_id: number;
  }>(
    `SELECT p.id AS id, p.db_content AS content, set_card.id AS set_id
       FROM cards p
       JOIN cards user_set ON p.left_id  = user_set.id
       JOIN cards set_card ON user_set.left_id = set_card.id
      WHERE p.right_id       = ?
        AND set_card.type_id = ?
        AND user_set.right_id = ?
        AND p.trash = 0 AND user_set.trash = 0 AND set_card.trash = 0
      ORDER BY set_card.id, p.id`,
    [followSettingId, setId, userId],
  );

  // compound names are composed at the fetch layer (cards.name holds only
  // simple-card names)
  const never = DeckoName.parse("*never").key;
  for (const row of r.rows) {
    const ruleCardName = (await fetch.fetchById(row.id))?.name?.s;
    const ruleSetName = (await fetch.fetchById(row.set_id))?.name?.s;
    if (ruleCardName === undefined) continue;
    const items = (row.content ?? "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\[\[/, "").replace(/\]\]$/, ""));
    const isIgnoreRule = items.some((item) => DeckoName.parse(item).key === never);
    if (isIgnoreRule) {
      ignoring.push({
        ruleCardName,
        option: "*never",
        ruleSetName: ruleSetName ?? "",
      });
    } else {
      for (const option of items) {
        following.push({
          ruleCardName,
          option,
          ruleSetName: ruleSetName ?? "",
        });
      }
    }
  }

  // follow_editor_helper.rb:83-90 + :63-70 — the suggestions merge, gated
  // on current_user? (user/follow.rb:25-27).
  if (
    opts.sessionId !== undefined &&
    opts.trunkId !== undefined &&
    opts.sessionId === opts.trunkId
  ) {
    const suggested = await suggestedFollowingRuleOptions(fetch, userName);
    mergeOptionHashes(following, suggested);
  }
  return { following, ignoring };
}

/** follow_editor_helper.rb:83-90 suggested_following_rule_options_hash:
 *  { preference-rule key => { option, set name } } from the follow
 *  suggestions card's items. */
interface SuggestedOption {
  readonly option: string;
  /** the suggestion's SET card name (the row's rule_set side). */
  readonly setName: string;
}
type SuggestedOptions = Map<string, SuggestedOption>;

async function suggestedFollowingRuleOptions(
  fetch: FetchEngine,
  trunkName: string,
): Promise<SuggestedOptions> {
  const hash: SuggestedOptions = new Map();
  // user/follow.rb:21-23 suggestions: Card[:follow_suggestions]&.item_names
  // || [] — the codename card's items; a deck without the card contributes
  // nothing. The content reads fresh per walk (Ruby's item_names re-reads
  // the card each render; a fetch-cache read would pin the first render's
  // content across the storage's later renders).
  const suggestionsId = await fetch.codenames.id("follow_suggestions");
  if (suggestionsId === undefined) return hash;
  const r = await fetch.driver.query<{ db_content: string | null }>(
    `SELECT db_content FROM cards WHERE id = ? AND trash = 0`,
    [suggestionsId],
  );
  const content = r.rows[0]?.db_content;
  if (content === undefined || content === null || content === "") return hash;

  for (const line of content.split("\n")) {
    const sug = line.replace(/^\[\[/, "").replace(/\]\]$/, "");
    if (sug.length === 0) continue;
    // a_set_and_option_suggestion (:95-99): set = name left, option = name
    // right. A set-ONLY item (:111-115 a_set_only_suggestion) yields to the
    // :87 call site which passes no block — LocalJumpError as written, so a
    // set-only suggestion renders nothing (disclosed gem defect shape, the
    // json :follow_status class; the reachable arm is the set+option
    // junction).
    const sugName = DeckoName.parse(sug);
    const setName = sugName.leftName?.s;
    const optName = sugName.rightName?.s;
    if (setName === undefined || optName === undefined) continue;
    // valid_set_card (:117-120): the fetched card's type_code is :set
    const [setCard, setTypeId] = await Promise.all([
      fetch.fetchByName(setName),
      fetch.codenames.id("set"),
    ]);
    if (setCard === undefined || setCard.name === undefined) continue;
    if (setTypeId === undefined || setCard.typeId !== setTypeId) continue;
    // suggested_follow_option (:101-106)
    const option = await suggestedFollowOption(fetch, optName);
    // hash[set_card.follow_rule_name(card.trunk).key] = [opt] — the
    // preference name's KEY (cardname.rb generate_key part_keys.join("+"));
    // each_with_object assignment, so the LAST suggestion per set wins
    const ruleKey = DeckoName.parse(
      followRuleNameFor(setCard.name.s, trunkName),
    ).key;
    hash.set(ruleKey, { option, setName: setCard.name.s });
  }
  return hash;
}

/** follow_editor_helper.rb:101-106 suggested_follow_option: Card.fetch
 *  (name) || Card[name.to_sym] (by NAME, then by CODENAME);
 *  option_card&.follow_option? -> option_card.name, else :always.cardname.
 *  follow_option? (set/all/follow.rb:14-16) = the card's codename is in
 *  FollowOption.codenames — the four registered option codenames
 *  (lib/card/follow_option.rb + set/self/{always,created,edited,never}.rb,
 *  the follow-options port's FOLLOW_OPTION_ALL). */
async function suggestedFollowOption(
  fetch: FetchEngine,
  optName: string,
): Promise<string> {
  let card = await fetch.fetchByName(optName);
  if (card === undefined) {
    const codenameId = await fetch.codenames.id(optName);
    if (codenameId !== undefined) {
      card = await fetch.fetchById(codenameId);
    }
  }
  const codename = card?.codename;
  if (card === undefined || codename === undefined || codename === null) {
    return "*always";
  }
  return FOLLOW_OPTION_ALL.includes(codename)
    ? (card?.name?.s ?? "*always")
    : "*always";
}

/** follow_editor_helper.rb:63-70 merge_option_hashes: a held rule whose
 *  key a suggestion named appends the suggested option (uniq — existing
 *  order first); the remaining suggestions become new rows in item order
 *  (current.merge suggested). */
function mergeOptionHashes(
  following: FollowTabRow[],
  suggested: SuggestedOptions,
): void {
  // current.each { |key, current_opt| ... } — the held rules
  const seenRules = new Set<string>();
  for (const row of following) {
    const key = DeckoName.parse(row.ruleCardName).key;
    const hit = suggested.get(key);
    if (hit === undefined) continue;
    suggested.delete(key); // suggested.delete(key) inside Ruby's loop
    if (seenRules.has(key)) continue;
    seenRules.add(key);
    // (current_opt + suggested_opt).uniq — the option appends only when
    // not already offered on the rule
    if (
      !following.some(
        (r) =>
          DeckoName.parse(r.ruleCardName).key === key && r.option === hit.option,
      )
    ) {
      following.push({
        ruleCardName: row.ruleCardName,
        option: hit.option,
        ruleSetName: row.ruleSetName,
      });
    }
  }
  // current.merge suggested — the not-held suggestions, item order
  for (const [ruleKey, hit] of suggested) {
    following.push({
      ruleCardName: ruleKey,
      option: hit.option,
      ruleSetName: hit.setName,
    });
  }
}

/** Resolve the session actor (pageSession.actorId -> the card's name), the
 *  same memoization-free shape prepareSessionAccountLinks uses per render;
 *  an unresolvable actor degrades the session to signed-out. */
async function resolveSession(
  fetch: FetchEngine,
  pageSession: ReadViewer | undefined,
): Promise<FollowActorSession | undefined> {
  if (pageSession?.signedIn !== true || pageSession.actorId === undefined) {
    return undefined;
  }
  const actor = await fetch.fetchById(pageSession.actorId, { skipVirtual: true });
  const name = actor?.name?.s;
  if (name === undefined || name === "") return undefined;
  return { actorId: pageSession.actorId, actorName: name };
}

/** The bundle builder RenderEngine.render calls when
 *  FOLLOW_SEAM_VIEWS.has(view). Read-only SELECTs through the notify lane's
 *  rule algebra; no writes; permission semantics unchanged (the standard
 *  view gate runs on the render root before any view body executes). */
export async function prepareFollowRender(
  fetch: FetchEngine,
  pageSession: ReadViewer | undefined,
  rootCard: RenderCard,
  view: string,
): Promise<FollowRenderBundle> {
  const session = await resolveSession(fetch, pageSession);

  // the root card's follow_label (set/all/follow.rb:6-8: `name` for plain
  // cards; sets carry the pattern short label — the render-time bundle
  // keeps the plain-card arm, which is what every non-Set render hits)
  const followLabel = rootCard.name.s;

  let followed = false;
  let followMark: string | undefined;
  let followerCount = 0;
  let followTabRows: readonly FollowTabRow[] = [];
  let ignoreTabRows: readonly FollowTabRow[] = [];
  let deletions: readonly { readonly name: string }[] = [];

  const record: CardRecord | undefined = await fetch.fetchByName(rootCard.name.s);

  if (view === "follow_section" || view === "engage_tab") {
    // card-mod-edit set/all/board/follow_section.rb:2-11 follow_section:
    // the show_follow? gate (follow_link_views.rb:6-8) + the button group
    // read followed?; followers_board_link reads follower_ids.size
    // (follower_ids.rb:95-115 direct_follower_ids - the set-chain walk
    // below mirrors its simple-card arms)
    const setName = `${rootCard.name.s}+*self`;
    const users = new Set<number>();
    await followerCountInto(fetch, rootCard, users);
    if (session !== undefined) {
      // followed? (followed_by.rb:1-9): the actor's follow preference
      // applies to the card's set chain - the same walk the count runs,
      // asked for the actor's id. (followRuleOptionFor's notify-lane walk
      // answers the SELF-set preference only; the *all-covering
      // preference the oracle deck carries is the count walk's shape.)
      followed = users.has(session.actorId);
      followMark = followRuleNameFor(setName, session.actorName);
    }
    followerCount = users.size;
  }

  if (view === "follow_button") {
    const setName = record ? `${record.name?.s ?? rootCard.name.s}+*self` : `${rootCard.name.s}+*self`;
    if (session !== undefined && record !== undefined) {
      followed = (await followRuleOptionFor(fetch, record, session.actorId)) !== null;
      followMark = followRuleNameFor(setName, session.actorName);
    } else {
      followMark = followRuleNameFor(setName, await anonymousActorName(fetch));
    }
  }

  if ((view === "follow_tab" || view === "ignore_tab") && session !== undefined) {
    // the editor's rows belong to the RENDERED card's trunk (user/follow.rb
    // set: the editor walks card.item_cards where card is the rendered
    // User+*follow card — the LEFT user's rules, whoever views); the
    // suggestions merge runs only under current_user? (user/follow.rb:25-27
    // Auth.current_id == left.id)
    const trunkName = rootCard.name.leftName?.s ?? rootCard.name.s;
    const rows = await followEditorRows(fetch, trunkName, {
      sessionId: session.actorId,
      trunkId: record?.leftId,
    });
    followTabRows = rows.following;
    ignoreTabRows = rows.ignoring;
  }

  if (view === "closure" && record !== undefined && record.leftId !== undefined) {
    deletions = await closureDeletions(fetch, record.leftId);
  }

  return {
    session,
    followed,
    followMark,
    followLabel,
    followerCount,
    followTabRows,
    ignoreTabRows,
    closureDeletions: deletions,
  };
}

/** follower_ids.rb:95-115 direct_follower_ids - the simple-card set chain
 *  (<name>+*self, <type>+*type, *all): every "*follow" preference card
 *  whose "<set>+<user>" junction names a covering set contributes its user
 *  (distinct). Read-only SELECTs. */
async function followerCountInto(
  fetch: FetchEngine,
  rootCard: RenderCard,
  users: Set<number>,
): Promise<void> {
  const setKeys = new Set<string>(["*all"]);
  setKeys.add(DeckoName.parse(`${rootCard.name.s}+*self`).key);
  if (rootCard.typeName !== undefined) {
    setKeys.add(DeckoName.parse(`${rootCard.typeName}+*type`).key);
  }
  const followIdRow = await fetch.driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE codename = 'follow' AND trash = 0 ORDER BY id LIMIT 1",
    [],
  );
  const followId = Number(followIdRow.rows?.[0]?.id ?? 0);
  if (followId === 0) return;
  const rules = await fetch.driver.query<{ left_id: number }>(
    "SELECT left_id FROM cards WHERE right_id = ? AND trash = 0",
    [followId],
  );
  for (const row of (rules.rows ?? []) as Array<{ left_id: number }>) {
    const junction = await fetch.fetchById(Number(row.left_id));
    if (
      junction === undefined ||
      junction.leftId === null || junction.leftId === undefined ||
      junction.rightId === null || junction.rightId === undefined
    ) {
      continue;
    }
    const setCard = await fetch.fetchById(Number(junction.leftId));
    if (setCard === undefined || setCard.name === undefined) continue;
    if (!setKeys.has(DeckoName.parse(setCard.name).key)) continue;
    users.add(Number(junction.rightId));
  }
}
