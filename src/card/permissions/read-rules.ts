// Read-permission resolution — the READ side of the decko rule algebra.
//
// Ruby mechanism (the trail the port follows):
//
// 1. Card::Rule::ReadRuleCache (card-1.110.0 lib/card/rule/read_rule_cache.rb)
//    builds the deck-wide { party_id -> [read_rule_id, ...] } hash from
//    STORAGE: read rule cards (right = the *read setting card, left = a set
//    card) joined to card_references — a rule grants the parties its content
//    REFERENCES (the [[Party]] items; the referee side of the rule card's
//    links). This is deliberately content-independent: the cached deck is
//    the reference graph, not the rule text.
// 2. Card::Auth's actor resolves its parties
//    (card-mod-account-0.20.0 set/abstract/account_holder.rb:27-29
//    #parties = all_enabled_roles + [self]; for Anonymous all_enabled_roles
//    is [], :40) and its readable rule ids (#fetch_read_rules :115-123 =
//    read_rule_cache[party] for each of [AnyoneID] + parties, concatenated).
// 3. The card check is card-mod-permissions set/all/permissions.rb:139-146
//    #ok_to_read?: always_ok for the bot; then
//    `Auth.as_card.read_rules_hash[read_rule_id]` where read_rule_id is the
//    card's STORED cards.read_rule_id (`self.read_rule_id ||=
//    permission_rule_id :read`, :142 — computed on save by the
//    set_read_rule store event, set/all/permissions.rb:1-5, which is why the
//    column is on every real row).
// 4. A failed check denies the VIEW (lib/card/view/permission.rb:46-50
//    #denial -> lib/card/format/error.rb:27-31 view_for_denial -> the
//    quiet/loud span; see view-perms.ts for the markup contract).
//
// Query shape: the whole state is TWO independent statements (party
// codenames + the ReadRuleCache join) issued as ONE driver.batch — folded
// into the render prefetch's existing batch by the engine
// (src/card/render.ts), so a cold render stays ONE round trip and warm
// renders issue zero permission queries. A signed-in viewer appends ONE
// more statement to the SAME batch (its role parties, see ReadViewer) —
// still one round trip, never per-render.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";

/** The setting card name the read rules hang off (set/all/permissions.rb
 *  walks permission_rule_id(:read) — the :read setting). */
const READ_SETTING_NAME = "*read";

/** Codename of the setting card the read rules hang off (*read). */
const READ_CODENAME = "read";
/** Codename of the set type card (the SQL's sets.type_id = SetID filter). */
const SET_CODENAME = "set";
/** Codename of the party every deck grants through the *all+*read rule. */
const ANYONE_CODENAME = "anyone";
/** Codename of the party every signed-in actor joins through (fetch_roles,
 *  account_holder.rb:111-113 — only relevant for non-anonymous actors). */
const ANYONE_SIGNED_IN_CODENAME = "anyone_signed_in";
/** Codename of the signed-out actor card. */
const ANONYMOUS_CODENAME = "anonymous";
/** Codename of the Administrator role card — its members get Ruby's
 *  always_ok? short-circuit (auth/permissions.rb:8-13 -> :52-60 cached
 *  `admin?`; account_holder.rb:63-65 `admin?` = `role? AdministratorID`).
 *  Codename registered in card-mod-account data/real.yml:30-32. */
const ADMINISTRATOR_CODENAME = "administrator";
/** Codename of the administrator bot (Auth always_ok? `when DeckoBotID
 *  then true`, auth/permissions.rb:9 — "cannot disable"). Ruby derives that
 *  constant FROM the deck's STORED codename — codename.rb:107-110
 *  `Card.const_get_or_set("#{codename.to_s.camelize}ID")` — so the lookup
 *  key is the stored codename string (`decko_bot` camelize→ `DeckoBot`
 *  → `DeckoBotID`), never a guessed alternate spelling. A former
 *  `deckobot` spelling here matched no row, so actor 1 silently lost the
 *  always_ok short-circuit and was denied owner-only cards. */
const DECKOBOT_CODENAME = "decko_bot";
/** Codename of the *members setting — the joint name Ruby's rolehash hangs
 *  off (Self::Role.generate_rolehash searches `left: {type_id: RoleID},
 *  right_id: MembersID`, card-mod-account set/self/role.rb:33-40). */
const MEMBERS_CODENAME = "members";
/** Codename of the Role CARDTYPE card — Card::RoleID (the type filter of
 *  the same search; role cards are cards whose type IS this card). */
const ROLE_CODENAME = "role";

/**
 * The viewer whose permission verdicts an engine computes — the port of
 * `Auth.as_card` as the read check sees it (set/all/permissions.rb:142:
 * `Auth.as_card.read_rules_hash[read_rule_id]`).
 *
 * Anonymous is the default: `{ signedIn: false }` (with actorId left
 * undefined the caller supplies it — resolveAnonymousReadPermission /
 * anonymousIdFromResults). A signed-in viewer carries the account card id
 * the session resolved to; its role parties are derived from storage in
 * the SAME batch (rolePartyStatement below — the port of fetch_roles,
 * account_holder.rb:111-113: [AnyoneSignedInID] + the member lists of the
 * role cards the actor sits in).
 */
export interface ReadViewer {
  /** True when a live session resolved to an account card (Ruby:
   *  Auth.current_id != AnonymousID). */
  readonly signedIn: boolean;
  /** The account card id (Ruby: Auth.as_card.id). Undefined for the pure
   *  signed-out viewer. */
  readonly actorId?: number;
}

/** The signed-out corpus viewer — what the engine computes when no
 *  session actor is available, and what an unresolved/expired token
 *  degrades to
 *  (auth/current.rb:58-63). */
export const ANONYMOUS_VIEWER: ReadViewer = { signedIn: false };

/** The resolved permission state: the read rule ids the viewer may read
 *  through (Ruby: Auth.as_card.read_rules_hash), whether the deck carries
 *  the read-rule universe (gates the stored-id fallback walk), and the
 *  parties the resolution ran for (diagnostics). */
export interface ReadPermissionState {
  /** read_rules_hash keys (account_holder.rb:51-53). */
  readonly readableRuleIds: Set<number>;
  /** Ruby's Auth.always_ok? short-circuit (auth/permissions.rb:8-13): true
   *  for the DeckoBot actor (`when DeckoBotID then true` — "cannot
   *  disable") or an Administrator-role member (cached `admin?`,
   *  :52-60; account_holder.rb:63-65). Overrides every read verdict —
   *  ok_to_read? returns before the read_rules_hash lookup
   *  (set/all/permissions.rb:140). */
  readonly alwaysOk: boolean;
  /** False when the deck has NO live read rule cards: Ruby decks bootstrap
   *  *all+*read, so this only occurs in synthetic/rule-less seeds; there
   *  the stored-id fallback is skipped (no rule can resolve anyway) and
   *  cards read as allowed — the documented rule-less-seed divergence. */
  readonly hasReadRules: boolean;
  /** True only when the bootstrap *all+*read rule is among the deck's read
   *  rules — the completeness proof for the live-walk fallback (a seed
   *  without it is a fragment; see canReadByRuleLookup). */
  readonly hasCatchAllReadRule: boolean;
  /** The party ids the readable set was computed from. */
  readonly parties: number[];
  /** Auth.current_id when Auth.signed_in? (auth/current.rb:43-47), else
   *  undefined — what a set module's own-card permission override compares
   *  against (e.g. Right::Follow's allowed_to_change_follow_status?). */
  readonly signedInActorId?: number;
}

/** One party row of the ReadRuleCache join (read_rule_cache.rb SQL). */
interface PartyRuleRow {
  partyId: number;
  readRuleId: number;
}

/** Statement 3 (the gate)'s position in readPermissionStatements' array —
 *  every consumer that folds, splices, or replaces a single permission
 *  statement by index reads THIS constant, so reordering the array cannot
 *  silently desync a fold (the seat head's
 *  gate-count column replaces this statement in the one-trip posture). */
export const PERMISSION_GATE_COUNT_STATEMENT_INDEX = 2;

/**
 * The gate-count statement as a JSON arm for a LARGER statement's select
 * list (the one-trip seat head — one-trip-per-page spec §a.4's zero-bind
 * one-off arm). Derived from readPermissionStatements()[2].sql verbatim, so
 * the two shapes cannot drift: the arm executes the exact statement text as
 * a CTE and json-aggregates its single row into a small TEXT cell the
 * client parses back into the same rows the batch result would have
 * carried. Zero binds — the statement is viewer-independent (statements 1-3
 * read the deck's anyone/anonymous/signed-in parties; only the optional
 * statement 4 is viewer-bound).
 */
export function permissionGateCountJsonArm(): string {
  const body = readPermissionStatements()[PERMISSION_GATE_COUNT_STATEMENT_INDEX].sql;
  return (
    `(WITH gate AS (${body}) ` +
    `SELECT json_group_array(json_object('c', g.c, 'catchAll', g.catchAll)) FROM gate g)`
  );
}

/**
 * The permission statements, ready for a driver.batch fold.
 *
 * Statement 1 (parties): the codename cards the party math needs — the
 * port of the boot-time AnonymousID/AnyoneID constants
 * (lib/card/codename.rb:108 `const_get_or_set("#{codename.camelize}ID")`),
 * plus the two codenames the signed-in path compares against
 * (administrator: the always_ok? role; decko_bot: the always_ok? actor —
 * camelize-derives the DeckoBotID the `when DeckoBotID then true`
 * short-circuit reads).
 *
 * Statement 2 (the cache): read_rule_cache.rb's SQL verbatim, with ReadID
 * and SetID as scalar subqueries on the codename cards so the statement is
 * self-contained (a batch cannot reference a sibling's results).
 *
 * Statement 3 (the gate): hasReadRules / hasCatchAllReadRule counters.
 *
 * Statement 4 (signed-in viewers only): the actor's role parties —
 * appended LAST so the Anonymous batch stays exactly the historical three
 * statements (zero diff for the default viewer). One batch total either
 * way: folding in the actor's roles costs no extra round trip.
 */
export function readPermissionStatements(viewer?: ReadViewer): SQLStatement[] {
  const statements: SQLStatement[] = [
    {
      sql:
        `SELECT id, codename FROM cards WHERE codename IN ` +
        `('${ANYONE_CODENAME}', '${ANYONE_SIGNED_IN_CODENAME}', '${ANONYMOUS_CODENAME}', ` +
        `'${ADMINISTRATOR_CODENAME}', '${DECKOBOT_CODENAME}') ` +
        `AND trash = 0`,
      params: [],
    },
    {
      sql:
        `SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId ` +
        `FROM cards read_rules ` +
        `JOIN card_references refs ON refs.referer_id = read_rules.id ` +
        `JOIN cards sets ON read_rules.left_id = sets.id ` +
        `WHERE read_rules.right_id = ` +
        `  (SELECT id FROM cards WHERE codename = '${READ_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `AND sets.type_id = ` +
        `  (SELECT id FROM cards WHERE codename = '${SET_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `AND read_rules.trash = 0 AND sets.trash = 0`,
      params: [],
    },
    {
      // The hasReadRules gate: ANY live read rule card, independent of
      // references (a rule whose content references nothing grants nobody
      // but still EXISTS — Ruby's permission_rule_id would resolve it for
      // an unruled card's stored-id fallback). catchAll carries whether the
      // BOOTSTRAP rule is among them — identified STRUCTURALLY (left =
      // the *all codename card), since modern junction rows carry no key
      // column — as the completeness proof for a seed's read-rule universe
      // (see canReadByRuleLookup).
      sql:
        `SELECT COUNT(*) AS c, ` +
        `COALESCE(SUM(CASE WHEN cards.left_id = ` +
        `  (SELECT id FROM cards WHERE codename = 'all' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `THEN 1 ELSE 0 END), 0) AS catchAll ` +
        `FROM cards WHERE cards.right_id = ` +
        `(SELECT id FROM cards WHERE codename = '${READ_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `AND cards.trash = 0`,
      params: [],
    },
  ];
  if (viewer !== undefined && viewer.signedIn && viewer.actorId !== undefined) {
    statements.push(rolePartyStatement(viewer.actorId));
  }
  return statements;
}

/**
 * The signed-in actor's role parties — the SQL form of the port's
 * fetch_roles tail (account_holder.rb:107-113):
 *
 * 1. `role_ids_from_role_member_cards` -> `Self::Role.role_ids(user_id)`
 *    (card-mod-account set/self/role.rb:8-14): every role card whose
 *    `+*members` list includes the user.
 * 2. The rolehash those lists feed (`generate_rolehash`, set/self/role.rb:
 *    33-40) is built from cards with `left: {type_id: RoleID},
 *    right_id: MembersID`; this statement reads the same rows.
 * 3. The member ids come from card_references because that is where the
 *    list layer itself puts them: an IdList maintains one reference row
 *    per item (ref_type "L", referee_key NULL) at save time
 *    (card-mod-list set/abstract/id_list.rb:33-47 create_references_out).
 *    Stored decks show the shape: every `<Role>+*members` row's
 *    reference set matches its content item count exactly, and a deck
 *    whose content has been rewritten in place still carries the original
 *    id references — references are the durable id truth.
 *
 * Parameterized by the actor id; rides the SAME batch as the base
 * statements (see readPermissionStatements). ORDER BY is a port-side
 * normalization for deterministic diagnostics — Ruby's rolehash iteration
 * order is not contractual (the union is order-insensitive:
 * account_holder.rb:51-53 hashes it away).
 */
function rolePartyStatement(actorId: number): SQLStatement {
  return {
    sql:
      `SELECT lists.left_id AS roleId ` +
      `FROM card_references refs ` +
      `JOIN cards lists ON lists.id = refs.referer_id ` +
      `JOIN cards roles ON roles.id = lists.left_id ` +
      `WHERE refs.referee_id = ? AND refs.referee_id IS NOT NULL ` +
      `AND lists.right_id = ` +
      `  (SELECT id FROM cards WHERE codename = '${MEMBERS_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ` +
      `AND lists.trash = 0 AND roles.trash = 0 ` +
      `AND roles.type_id = ` +
      `  (SELECT id FROM cards WHERE codename = '${ROLE_CODENAME}' AND trash = 0 ORDER BY id LIMIT 1) ` +
      `ORDER BY lists.left_id`,
    params: [actorId],
  };
}

/** Parse the batch results (statements in readPermissionStatements order)
 *  for one actor's parties into the permission state. The corpus path
 *  passes
 *  (results, anonymousIdFromResults(results), false). */
export function readPermissionStateFromResults(
  results: SQLQueryResult[],
  actorId: number | undefined,
  signedIn: boolean,
): ReadPermissionState {
  return readPermissionStateFromViewerResults(results, { signedIn, actorId });
}

/**
 * Parse the batch results for ONE viewer into the permission state — the
 * port of account_holder.rb's read_rules_hash construction:
 *
 * - parties (:27-29 `all_enabled_roles << id`): for a signed-in actor
 *   [AnyoneSignedIn, ...roleMemberRoles, selfId] (fetch_roles :111-113
 *   puts AnyoneSignedIn first; the role ids are statement 4's rows).
 *   Anonymous joins no roles (:39-41 all_enabled_roles is [] when id ==
 *   AnonymousID), so its parties are [Anyone, AnonymousID].
 * - fetch_read_rules (:115-123): the union of
 *   `Card::Rule.read_rule_cache[party]` over `[AnyoneID] + parties`
 *   (DeckoBot returns [] there — always_ok short-circuits first, :116).
 * - alwaysOk: the port of ok_to_read?'s opening short-circuit
 *   (set/all/permissions.rb:140 `return true if Auth.always_ok?`) — true
 *   when the actor IS DeckoBot (auth/permissions.rb:9) or holds the
 *   Administrator role (auth/permissions.rb:52-60 cached `admin?` =
 *   account_holder.rb:63-65 `all_enabled_roles.include? AdministratorID`).
 */
export function readPermissionStateFromViewerResults(
  results: SQLQueryResult[],
  viewer: ReadViewer,
): ReadPermissionState {
  const codenameRows = (results[0]?.rows ?? []) as Array<{ id: number; codename: string | null }>;
  const cacheRows = (results[1]?.rows ?? []) as Array<PartyRuleRow>;
  const ruleCount = (results[2]?.rows ?? []) as Array<{ c: number; catchAll: number }>;
  const actorId = viewer.actorId;
  const signedIn = viewer.signedIn === true && actorId !== undefined;
  // Statement 4 exists only when readPermissionStatements got a signed-in
  // viewer (the two functions' guards are the same predicate on purpose).
  const roleRows = signedIn
    ? ((results[3]?.rows ?? []) as Array<{ roleId: number }>)
    : [];

  const byCodename = new Map<string, number>();
  for (const row of codenameRows) {
    if (row.codename !== null) byCodename.set(row.codename, row.id);
  }
  const anyone = byCodename.get(ANYONE_CODENAME);
  const anyoneSignedIn = byCodename.get(ANYONE_SIGNED_IN_CODENAME);
  const administratorId = byCodename.get(ADMINISTRATOR_CODENAME);
  const deckobotId = byCodename.get(DECKOBOT_CODENAME);

  // Role member-card roles, deduped in statement order (ORDER BY role id).
  const roles: number[] = [];
  for (const row of roleRows) {
    if (!roles.includes(row.roleId)) roles.push(row.roleId);
  }

  const alwaysOk =
    signedIn &&
    actorId !== undefined &&
    (actorId === deckobotId ||
      (administratorId !== undefined && roles.includes(administratorId)));

  const parties: number[] = anyone !== undefined ? [anyone] : [];
  if (signedIn && anyoneSignedIn !== undefined) parties.push(anyoneSignedIn);
  parties.push(...roles);
  if (actorId !== undefined) parties.push(actorId);

  // read_rule_cache.rb lookup_hash: party_id -> [read_rule_id, ...]
  const cache = new Map<number, number[]>();
  for (const row of cacheRows) {
    if (row.partyId === null || row.partyId === undefined) continue;
    const list = cache.get(row.partyId);
    if (list === undefined) cache.set(row.partyId, [row.readRuleId]);
    else list.push(row.readRuleId);
  }

  // account_holder.rb:115-123 fetch_read_rules: concat cache[party].
  const readableRuleIds = new Set<number>();
  for (const party of parties) {
    for (const ruleId of cache.get(party) ?? []) readableRuleIds.add(ruleId);
  }
  return {
    readableRuleIds,
    alwaysOk,
    hasReadRules: (ruleCount[0]?.c ?? 0) > 0,
    hasCatchAllReadRule: (ruleCount[0]?.catchAll ?? 0) > 0,
    parties,
    signedInActorId: signedIn ? actorId : undefined,
  };
}

/** The Anonymous card's id from the batch results (undefined when the deck
 *  has no such codename row — the state then simply carries fewer
 *  parties, which denies every ruled card exactly like Ruby's empty
 *  read_rules_hash does). */
export function anonymousIdFromResults(results: SQLQueryResult[]): number | undefined {
  const codenameRows = (results[0]?.rows ?? []) as Array<{ id: number; codename: string | null }>;
  return codenameRows.find((row) => row.codename === ANONYMOUS_CODENAME)?.id;
}

/**
 * The Anonymous viewer's permission state — the viewer every default
 * computation runs as.
 * Anonymous joins no roles (account_holder.rb:40 all_enabled_roles is []
 * when id == AnonymousID), so its parties are [AnyoneID, AnonymousID].
 */
export async function resolveAnonymousReadPermission(
  driver: SQLDatabaseDriver,
): Promise<ReadPermissionState> {
  const results = await driver.batch(readPermissionStatements());
  return readPermissionStateFromViewerResults(results, {
    signedIn: false,
    actorId: anonymousIdFromResults(results),
  });
}

/** Verdict for a card whose readRuleId is known — the pure half of
 *  permissions.rb:139-146 ok_to_read? (set membership, no queries), with
 *  Ruby's always_ok? short-circuit in front of it (:140). */
export function canReadByStoredRule(
  readRuleId: number,
  state: ReadPermissionState,
): boolean {
  if (state.alwaysOk) return true;
  return state.readableRuleIds.has(readRuleId);
}

/** The winning read rule's content shape that DELEGATES the verdict to the
 *  card's LEFT: permissions.rb:54
 *  `rule(action).match?(/^\[?\[?_left\]?\]?$/)` — the bare reference and its
 *  single/double-bracket forms, Ruby line anchors (^/$ match at \n). The
 *  corpus rule `*all plus+*read` carries exactly "_left\n". */
const LEFT_DELEGATION_CONTENT = /^\[?\[?_left\]?\]?$/m;

/** Recursion cap for the delegation walk: each hop consumes one name part
 *  (the left chain strictly shrinks), so this is paranoia, not the
 *  termination argument. */
const LEFT_DELEGATION_MAX_DEPTH = 16;

/**
 * The live-computation fallback for a card row without a stored
 * read_rule_id — permission_rule_id(:read) (set/all/permissions.rb:55-61)
 * as the LIVE-WALK half of the delegation mechanism (this file): walk the
 * card's candidate rule names in pattern precedence (ruleNamesForCard),
 * take the first that exists (resolveRuleRowsByKeys with content), then
 * apply the `_left` rule-content delegation (a compound card whose winning
 * read rule says "_left" reads through its left card's permission rule,
 * recursively — permissions.rb:56-71, re-checked at every hop of the left
 * chain via readThroughLeftCard, depth-capped). The delegation is
 * load-bearing on this corpus: `*all plus+*read` = "_left", so EVERY
 * compound card's first-precedence candidate delegates (virtual rule cards
 * under a set included — the setting list the set card's :content view
 * renders); skipping it resolved the walk at "*all plus+*read" and keyed
 * the verdict off that rule's own referenced party ("_left" names the left
 * card), which denies exactly the cards Ruby allows.
 *
 * The mechanism's other half is the LOOKUP-TIME delegation in
 * set-read-rule.ts: effectiveReadRuleId / permissionRuleId /
 * leftPermissionRuleId apply the same permissions.rb:52-72 semantics when
 * the stored read_rule_id is DERIVED (deriveReadRuleRecord — the
 * set_read_rule write path) so a stored id already bakes the left chain
 * in. The read verdict for stored ids needs no walk (canReadByStoredRule);
 * this live walk covers exactly the cards without one (new cards, fetch
 * placeholders, rows predating the column).
 *
 * The final verdict runs the same readable-set check the stored path does
 * (readableRuleIds.has(rule.id) — read_rules_hash[read_rule_id],
 * permissions.rb:143).
 *
 * Returns undefined when the deck carries NO read rule cards at all
 * (`hasReadRules: false`): every real deck bootstraps *all+*read
 * (card/auth/setup.rb:44), so this is the rule-less-seed case only, and
 * the caller treats it as ALLOWED. That is a deliberate divergence —
 * Ruby on a
 * rule-less deck denies; matching that would deny every card of every
 * rule-less test deck.
 * A COMPLETE deck's walk that resolves NO candidate returns false (fail
 * closed): see the tail.
 */
export async function canReadByRuleLookup(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ReadPermissionState,
): Promise<boolean | undefined> {
  return canReadByRuleLookupDepth(fetcher, card, state, 0);
}

async function canReadByRuleLookupDepth(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ReadPermissionState,
  depth: number,
): Promise<boolean | undefined> {
  if (state.alwaysOk) return true; // permissions.rb:140, before any rule walk
  if (!state.hasReadRules || !state.hasCatchAllReadRule) return undefined;
  // pattern/all.rb#patterns: a NEW card's pattern list drops the first
  // concrete pattern (SELF) — and rule_lookup_keys then nils every anchored
  // candidate whose anchor card has no id. The virtual cards (id ===
  // undefined) are new cards by definition, so their SELF candidate —
  // anchored on themselves — never reaches the lookup:
  // `Card.fetch("<virtual junction>").permission_rule_id(:read)` answers the
  // `*all plus+*read` rule, skipping an existing `<name>+*self+*read` rule.
  const candidates = ruleNamesForCard(
    card.id === undefined ? { ...card, isNew: true } : card,
    READ_SETTING_NAME,
  );
  // WITH content: the delegation check reads the winning rule's text
  // (permissions.rb:54 `rule(action)`); the extra join rides the same
  // statement, no second round trip.
  // RENDER path, so the rule-closure walk: every candidate here is a
  // pattern name joined to *read, which the scoped walk resolves exactly
  // (resolveRuleRowsByRuleKeys carries the equivalence measurement).
  const resolved = await resolveRuleRowsByRuleKeys(
    fetcher.driver,
    candidates.map((name) => DeckoName.parse(name).key),
    true,
  );
  const cardName = card.name === undefined ? undefined : DeckoName.parse(card.name);
  for (const name of candidates) {
    const key = DeckoName.parse(name).key;
    const rule = resolved.get(key);
    if (rule === undefined) continue;
    // permissions.rb:52-58 permission_rule_id: a COMPOUND card whose winning
    // rule's content is the _left reference resolves through the LEFT card's
    // own permission walk (left_permission_rule_id :66-72). Without this the
    // walk evaluates viewer membership in the DELEGATING rule's grants — a
    // _left rule names no party, so every id-less compound child under it
    // (the structured/missing children) denied where
    // Ruby's delegation reaches the left card's own rule (the
    // `*all plus+*read -> _left` chain ends at *all+*read = Anyone).
    if (
      depth < LEFT_DELEGATION_MAX_DEPTH &&
      cardName !== undefined &&
      cardName.isCompound &&
      LEFT_DELEGATION_CONTENT.test(rule.content ?? "")
    ) {
      return readThroughLeftCard(fetcher, cardName, state, depth);
    }
    return state.readableRuleIds.has(rule.id);
  }
  // No candidate resolved. In a COMPLETE deck (hasReadRules &&
  // hasCatchAllReadRule) this is an unevaluatable rule walk, not an
  // unruled card: the catch-all is structurally present (hasCatchAllReadRule)
  // AND among the candidates (the *all pattern applies to every card), so a
  // miss means the composed-key closure could not resolve the deck's own
  // rule graph for this card. Ruby's walk cannot resolve here either —
  // permission_rule_id -> nil -> ok_to_read? denies
  // (set/all/permissions.rb:139-146 read_rules_hash[nil]) — so the port
  // FAILS CLOSED (deny). The fail-open this replaced leaked card bodies
  // through the catch-all whenever a more specific rule candidate could not
  // be evaluated: a *type plus right read rule granting "Anyone Signed In"
  // never reached the verdict, the walk fell
  // through to *all+*read, and anonymous was granted.
  // Partial decks (per-shard replay seeds) simply lack the card's
  // applicable rule card, and fabricating a denial from missing data would
  // mis-deny cards the full deck renders — there the port still allows
  // .
  return state.hasReadRules && state.hasCatchAllReadRule ? false : undefined;
}

/** permissions.rb:66-72 left_permission_rule_id:
 *  `lcard = left_or_new(skip_virtual: true, skip_modules: true);
 *  lcard.permission_rule_id action`. The skip_virtual fetch is what keeps
 *  the delegation off the virtual-card hook (a missing left is a NEW left,
 *  not a virtual one). The new-left branch carries name only — Ruby's new
 *  card has no type yet, so its walk runs type-less (the *type candidates
 *  are correctly absent from a type-less walk). */
async function readThroughLeftCard(
  fetcher: FetchEngine,
  name: DeckoName,
  state: ReadPermissionState,
  depth: number,
): Promise<boolean | undefined> {
  const leftName = name.leftName;
  const leftKey = leftName?.key;
  if (leftName === undefined || leftKey === undefined || leftKey === "") {
    return canReadByRuleLookupDepth(fetcher, { name, id: undefined }, state, depth + 1);
  }
  const left = await fetcher.fetchByKey(leftKey, { skipVirtual: true });
  if (left === undefined) {
    return canReadByRuleLookupDepth(fetcher, { name: leftName, id: undefined }, state, depth + 1);
  }
  const input: PatternCardInput = {
    name: left.name ?? leftName,
    id: left.id,
    ...(left.typeId !== undefined ? { typeId: left.typeId } : {}),
  };
  // The left's *type candidates anchor on the type card's NAME
  // (type.rb:34-36 type_name). One cache-first fetch.
  if (left.typeId !== undefined) {
    const typeCard = await fetcher.fetchById(left.typeId);
    if (typeCard?.name !== undefined && typeCard.name !== null) input.typeName = typeCard.name;
  }
  // The left's *type plus right candidates anchor on ITS left's type
  // (pattern 08_type_plus_right.rb left_type: superleft&.type_name) — the
  // same one-level resolution verdictPatternInput does for nest children.
  const leftInputName = DeckoName.parse(input.name);
  if (leftInputName.isCompound) {
    const leftLeftKey = leftInputName.leftName?.key;
    if (leftLeftKey !== undefined && leftLeftKey !== "") {
      const leftLeft = await fetcher.fetchByKey(leftLeftKey, { skipVirtual: true });
      if (leftLeft !== undefined && leftLeft.typeId !== undefined) {
        const leftLeftType = await fetcher.fetchById(leftLeft.typeId);
        if (leftLeftType?.name !== undefined && leftLeftType.name !== null) {
          input.leftTypeName = leftLeftType.name;
        }
      }
    }
  }
  return canReadByRuleLookupDepth(fetcher, input, state, depth + 1);
}

/**
 * Composed-key -> rule card id for the given rule-name keys — the id-only
 * projection of resolveRuleRowsByKeys; that function's doc carries the
 * resolution statement, the per-driver cache, and the design history.
 * Exported for the write-side derivation too (set-read-rule.ts resolves the
 * same rule-name candidates against storage; view-task-rules.ts resolves
 * its task candidates through this same function).
 */
export async function resolveRuleIdsByKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
): Promise<Map<string, number>> {
  const rows = await resolveRuleRowsByKeys(driver, keys, false);
  const out = new Map<string, number>();
  for (const [key, row] of rows) out.set(key, row.id);
  return out;
}

/**
 * The RENDER path's id-only projection — resolveRuleRowsByRuleKeys without
 * the content column. Every render-path caller asks for rule candidate
 * names, which the rule-closure walk answers exactly; the write path keeps
 * resolveRuleIdsByKeys (the whole-deck walk) because its `self` set-pattern
 * member lookup asks for a card's own composed name.
 */
export async function resolveRuleIdsByRuleKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
): Promise<Map<string, number>> {
  const rows = await resolveRuleRowsByRuleKeys(driver, keys, false);
  const out = new Map<string, number>();
  for (const [key, row] of rows) out.set(key, row.id);
  return out;
}

/** One resolved rule candidate: the rule card's id and (when requested) its
 *  db content — the content is what the _left delegation inspects. */
export interface ResolvedRuleRow {
  id: number;
  /** cards.content of the rule card (null = NULL column). */
  content: string | null;
}

/**
 * Per-driver resolution cache for resolveRuleRowsByKeys.
 *
 * What it holds: the deck's WHOLE composed-key rule universe (ckey ->
 * rule card id), built ONCE per driver generation by ONE unfiltered
 * recursive CTE, plus a lazily filled content map (rule-card id ->
 * db_content) for withContent callers. After the first build, every call
 * is a Map lookup with zero SQL, plus at most one small content IN-query
 * for rule-card ids not yet content-memoized.
 *
 * Why the memo unit is the whole universe: every read-verdict walk
 * resolves a DISTINCT key set (one per canReadByRuleLookupDepth ->
 * ensureVerdicts), so a per-key-set memo cannot share work across walks.
 * Equivalence with the per-key-set statement: any composition path that
 * resolves a requested key k uses only contiguous '+'-segment runs of k
 * as intermediates (each recursive step prepends/appends a stored key to
 * a resolved ckey, and the result must equal k), so the unfiltered
 * closure contains every row the fragment-filtered closure could produce
 * for k — and no EXTRA row for k (a path to k cannot pass through a key
 * that is not a segment run of k). Per ckey the closure yields exactly
 * one (id, ckey) row: a junction card's composed key is unique (its
 * sides are strictly simpler cards — decko's name algebra is
 * well-founded), UNION dedups, and termination is the recursion's own
 * strictly-simpler bound. Lookup is exact-match on canonical keys
 * (ruleNamesForCard -> DeckoName.parse().key); keys are lowercase ASCII.
 *
 * Actor purity: the signature takes (driver, keys, withContent) — NO
 * actor input. Actors apply verdicts in the callers
 * (`state.readableRuleIds.has(rule.id)` here, `amongParties(state, ...)`
 * in view-task-rules.ts), so two actors sharing a driver share only the
 * rule-card lookup, never its application.
 *
 * withContent does NOT partition the universe: the universe is the
 * id-only closure; content is read lazily per rule-card id into
 * contentById (one small PK-seek IN query for the ids a call actually
 * resolved, then memoized).
 *
 * Lifetime: the WeakMap key is the driver — one shared driver per server
 * process, one fresh driver per test suite. Nothing outlives its driver.
 *
 * Invalidation: expireRuleResolutionCache, wired into the write path's
 * post-save seam (CardActionEngine.expireAfterWrite) — every committed
 * mutation routes through that method, so a save drops the universe AND
 * the content memo and the next resolution rebuilds post-save state. No
 * second invalidation path.
 */
interface RuleResolutionDriverCache {
  /** ckey -> rule card id: the full composed-key universe, built once per
   *  driver generation. Undefined until the first resolution. The WRITE
   *  path's walk — it answers any composed key, which the rule-closure walk
   *  deliberately does not. */
  universe?: Map<string, number>;
  /** ckey -> rule card id: the RULE-CLOSURE universe (the rule cards' side
   *  spines only), built once per driver generation by the RENDER path's
   *  walk. A separate entry, not a subset view of `universe`: the two walks
   *  are different statements and either can be the first one a driver
   *  generation sees, so each memoizes independently and both are dropped
   *  together by expireRuleResolutionCache. */
  ruleUniverse?: Map<string, number>;
  /** Rule-card db_content per id, lazily filled by withContent calls
   *  (null = NULL column, exactly what the old content join projected). */
  contentById: Map<number, string | null>;
}

/** The memo entry a scope reads. Undefined until that scope's first walk. */
function universeFor(
  cache: RuleResolutionDriverCache,
  scope: RuleResolutionScope,
): Map<string, number> | undefined {
  return scope === "ruleClosure" ? cache.ruleUniverse : cache.universe;
}

function setUniverseFor(
  cache: RuleResolutionDriverCache,
  scope: RuleResolutionScope,
  universe: Map<string, number>,
): void {
  if (scope === "ruleClosure") cache.ruleUniverse = universe;
  else cache.universe = universe;
}

const ruleResolutionCaches = new WeakMap<SQLDatabaseDriver, RuleResolutionDriverCache>();

/** Drop every memoized resolution for this driver — the write path's
 *  post-save invalidation (expireAfterWrite). O(1): the whole per-driver
 *  cache (universe + content) is dropped; the next render rebuilds the
 *  universe once. Cheap on purpose: writes are rare, per-key dependency
 *  tracking (which saved card touches which candidate closure) is where
 *  bugs live. */
export function expireRuleResolutionCache(driver: SQLDatabaseDriver): void {
  ruleResolutionCaches.delete(driver);
}

/**
 * The composed-key universe statement — the resolver's ONE statement per
 * driver generation. The same closure the per-call fragment-filtered
 * statement computes, minus the fragment filter: seed every keyed live
 * card, compose both junction arms with no restriction, return every
 * (id, ckey). The unary + on trash (the established planner guard) keeps
 * the planner OFF cards_trash_index in the seed and the recursive arms;
 * + is a value no-op.
 */
const RULE_KEY_UNIVERSE_STATEMENT =
  `WITH RECURSIVE resolved(id, ckey) AS (\n` +
  `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND +trash = 0\n` +
  `  UNION\n` +
  `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
  `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0\n` +
  `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `)\n` +
  `SELECT rs.ckey, rs.id FROM resolved rs`;

/** The setting names a rule candidate's name can end in — the four task
 *  settings the resolver's render-path callers join a pattern name to
 *  (READ_SETTING_NAME above; view-task-rules.ts's TASK_SETTING_NAME for the
 *  other three). They are the walk's boundary: a composed key is only ever
 *  needed when it can be one of these, and the boundary is on the NAME, not
 *  on any particular page's card — so one statement per driver generation
 *  still serves every card the render asks about. */
const TASK_RULE_SETTING_NAMES: readonly string[] = [
  READ_SETTING_NAME,
  "*create",
  "*update",
  "*delete",
];

/**
 * The RULE-CLOSURE walk — resolveRuleRowsByRuleKeys's ONE statement, the
 * same composed-key resolution as RULE_KEY_UNIVERSE_STATEMENT with the
 * deck replaced by the rule cards' side spines.
 *
 * `anc` is the left-ancestor chain of every rule card (a card whose right
 * side is a task setting card): the composition of a rule card's name reads
 * its left subtree, so the simple card at the bottom of every spine is a
 * seed the walk needs. The second seed term covers the rule cards whose
 * composed key is STORED rather than composable — a rule row with a virtual
 * left carries its full name in the `key` column and no `left_id` to walk
 * from, which is not hypothetical: a delegating rule
 * `*all plus+*read` is exactly that row, and a seed of `anc` alone loses it
 * (which the delegation then resolves to the catch-all `*all+*read` and
 * allows — a fail-OPEN, caught by
 * tests/card/permissions/rule-closure-scoped-resolution.test.ts). Every
 * spine bottoms out in one of the two cases: a card with no `left_id` is
 * either a simple card on a spine or a stored rule-shaped key.
 *
 * The `resolved` arms are the shipped arms verbatim — same trash handling,
 * same bidirectional composition — with the seed narrowed. The projection
 * keeps only the rule-shaped composed keys, which is the entire set of keys
 * the render path can ask for.
 *
 * Against a deck of ~19k live cards, the whole-deck walk returns ~19.5k rows
 * and ~3.8 s; the rule-closure walk returns ~1.5k rows and ~0.4 s, agreeing
 * on every rule-shaped key (0 missing, 0 disagreeing, 0 invented). The
 * benchmark scripts under benchmarks/cold-render/ probe both shapes.
 *
 * The arms stay UNBOUNDED on purpose: adding `j.id IN (SELECT id FROM anc)`
 * to them is the obvious tightening and it is a trap — against that deck it
 * runs an order of magnitude slower than the whole-deck walk it replaces,
 * because the bound re-evaluates a large closure per recursion step.
 * The seed narrowing plus the projection is what actually removes the deck.
 *
 * NOT equivalent to the whole-deck walk for arbitrary keys, and must not be
 * used where a non-rule key is asked for — set-read-rule.ts's `self`
 * set-pattern member lookup is the one such consumer and stays on
 * RULE_KEY_UNIVERSE_STATEMENT.
 *
 * This is the reference text. The render path runs
 * RULE_KEY_RULE_CLOSURE_STATEMENT below, which returns the same row set;
 * DECKO_LEGACY_RULE_CLOSURE=1 selects this one instead.
 */
export const LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT =
  `WITH RECURSIVE\n` +
  `anc(id) AS (\n` +
  `  SELECT r.left_id FROM cards r\n` +
  `    JOIN cards st ON st.id = r.right_id\n` +
  `    WHERE +r.trash = 0 AND st."key" IN (${TASK_RULE_SETTING_NAMES.map(() => "?").join(", ")})\n` +
  `      AND r.left_id IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.left_id FROM anc a\n` +
  `    JOIN cards j ON j.id = a.id\n` +
  `    WHERE j.left_id IS NOT NULL\n` +
  `),\n` +
  `resolved(id, ckey) AS (\n` +
  `  SELECT c.id, c."key" FROM cards c\n` +
  `    WHERE c."key" IS NOT NULL AND +c.trash = 0\n` +
  `      AND (c.id IN (SELECT id FROM anc)\n` +
  `        OR ${TASK_RULE_SETTING_NAMES.map((n) => `c."key" LIKE '%+${n}'`).join("\n        OR ")})\n` +
  `  UNION\n` +
  `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
  `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0\n` +
  `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `)\n` +
  `SELECT rs.ckey, rs.id FROM resolved rs\n` +
  `WHERE ${TASK_RULE_SETTING_NAMES.map((n) => `rs.ckey LIKE '%+${n}'`).join(" OR ")}`;

// The pruned walk below relies on three facts about the setting names; check
// them where the names are defined so a new name cannot silently break it.
for (const n of TASK_RULE_SETTING_NAMES) {
  if (n.length === 0 || /[+%_]/.test(n) || !/^[\x21-\x7e]+$/.test(n)) {
    throw new Error(`rule-closure walk: setting name ${JSON.stringify(n)} must be printable ASCII without '+', '%' or '_'`);
  }
}

/** `col` ends in "+<setting>" for some task setting — the projection's test. */
function endsInRuleSuffix(col: string): string {
  return TASK_RULE_SETTING_NAMES.map((n) => `${col} LIKE '%+${n}'`).join(" OR ");
}

/** The last characters of the setting names in both ASCII cases: a key that
 *  matches `LIKE '%+<setting>'` or `LIKE '<setting>'` must end in one of
 *  them, under case-insensitive and case-sensitive LIKE alike. */
const RULE_SUFFIX_LAST_CHARS = [
  ...new Set(TASK_RULE_SETTING_NAMES.flatMap((n) => {
    const c = n.slice(-1);
    return [c.toLowerCase(), c.toUpperCase()];
  })),
];

/**
 * The RULE-CLOSURE walk the render path runs: the same rows as
 * LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT, for any deck, with the arms
 * pruned to the derivations that can reach a projected row. On a local
 * mirror of a ~19k-card deck the legacy walk builds roughly 11k `resolved`
 * rows (enumerating about 14k join candidates) to keep ~1.5k; this one builds
 * a third as many rows from fewer candidates, and takes about half the time.
 * a check script that is not in this tree asserts the two
 * return the same row set on a deck and on randomly perturbed copies of it.
 *
 * WHY THE PRUNING IS EXACT. Call a string rule-shaped (T) when it is
 * `LIKE '%+<setting>'` or `LIKE '<setting>'` for a task setting. Setting
 * names hold no '+' (checked above), so:
 *   - a left-arm row `l.ckey || '+' || r.key` is projected iff r.key is T;
 *   - a right-arm row `l.key || '+' || r.ckey` is projected iff r.ckey is T,
 *     and the row is then T itself.
 * A projected row is therefore derived either from a seed, or by the left arm
 * from ANY row of a card that is the left of a junction with a T right key,
 * or by the right arm from a T row. Let D be the downward closure, through
 * both left_id and right_id, of the lefts of every junction whose right key
 * is T. Every derivation of a row for a card in D runs through cards in D
 * only (both arms derive a card's rows from its own left or right child).
 * So the walk keeps exactly the rows the projection can depend on if each
 * arm only produces a row whose card is in D or whose composed key is T:
 *   - left arm into D (`dl`), left arm into a T-right junction (`tl`);
 *   - right arm into D (`dr`), right arm from a T row (the WHERE on r.ckey).
 * The seed is the legacy seed's row set, read from the two small sets that
 * define it (anc, and the T-keyed cards) instead of by testing every card.
 * D only needs to CONTAIN those lefts, so `tc` and `tl` ignore trash and the
 * NOT NULL key tests; the arms keep the legacy arms' conditions verbatim.
 *
 * WHY THE CTEs ARE MATERIALIZED. A recursive step that joins an unindexed
 * CTE re-reads it once per queue row — the trap the legacy comment records
 * (the `j.id IN (SELECT id FROM anc)` bound). Here the edge sets are
 * MATERIALIZED, so SQLite builds them once and probes them through an
 * automatic index; without the hint the same statement is an order of
 * magnitude slower. Requires SQLite 3.35 or later (the MATERIALIZED keyword).
 *
 * Row ORDER is not part of the contract (the legacy statement has no
 * ORDER BY either); the check script reports whether it matched.
 *
 * AT MOST FIVE TERMS PER COMPOUND SELECT. Cloudflare D1 runs SQLite with
 * the compound-SELECT limit at 5 (measured in workerd's local D1: 5 terms
 * run, 6 answer "too many terms in compound SELECT"). The two left-arm edge
 * sets, `dl` and `tl`, are therefore joined through one materialized union,
 * `dtl`: one left-arm term over dl UNION tl derives exactly the rows the two
 * separate left-arm terms did, so `resolved` keeps its row set with five
 * terms. Pinned by tests/card/permissions/rule-closure-d1-compound-limit.test.ts.
 */
export const RULE_KEY_RULE_CLOSURE_STATEMENT =
  `WITH RECURSIVE\n` +
  `anc(id) AS (\n` +
  `  SELECT r.left_id FROM cards r\n` +
  `    JOIN cards st ON st.id = r.right_id\n` +
  `    WHERE +r.trash = 0 AND st."key" IN (${TASK_RULE_SETTING_NAMES.map(() => "?").join(", ")})\n` +
  `      AND r.left_id IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.left_id FROM anc a\n` +
  `    JOIN cards j ON j.id = a.id\n` +
  `    WHERE j.left_id IS NOT NULL\n` +
  `),\n` +
  `tc(id) AS MATERIALIZED (\n` +
  `  SELECT c.id FROM cards c\n` +
  `    WHERE substr(c."key", -1) IN (${RULE_SUFFIX_LAST_CHARS.map((c) => `'${c}'`).join(", ")})\n` +
  `      AND (${TASK_RULE_SETTING_NAMES.map((n) => `c."key" LIKE '%+${n}' OR c."key" LIKE '${n}'`).join("\n        OR ")})\n` +
  `),\n` +
  `tl(parent, child) AS MATERIALIZED (\n` +
  `  SELECT j.id, j.left_id FROM tc CROSS JOIN cards j ON j.right_id = tc.id\n` +
  `    WHERE j.left_id IS NOT NULL\n` +
  `),\n` +
  `d(id) AS (\n` +
  `  SELECT child FROM tl\n` +
  `  UNION\n` +
  `  SELECT c.left_id FROM d CROSS JOIN cards c ON c.id = d.id WHERE c.left_id IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT c.right_id FROM d CROSS JOIN cards c ON c.id = d.id WHERE c.right_id IS NOT NULL\n` +
  `),\n` +
  `dl(parent, child) AS MATERIALIZED (\n` +
  `  SELECT c.id, c.left_id FROM d CROSS JOIN cards c ON c.id = d.id WHERE c.left_id IS NOT NULL\n` +
  `),\n` +
  `dr(parent, child) AS MATERIALIZED (\n` +
  `  SELECT c.id, c.right_id FROM d CROSS JOIN cards c ON c.id = d.id WHERE c.right_id IS NOT NULL\n` +
  `),\n` +
  `dtl(parent, child) AS MATERIALIZED (\n` +
  `  SELECT parent, child FROM dl\n` +
  `  UNION\n` +
  `  SELECT parent, child FROM tl\n` +
  `),\n` +
  `resolved(id, ckey) AS (\n` +
  `  SELECT c.id, c."key" FROM anc CROSS JOIN cards c ON c.id = anc.id\n` +
  `    WHERE c."key" IS NOT NULL AND +c.trash = 0\n` +
  `  UNION\n` +
  `  SELECT c.id, c."key" FROM tc CROSS JOIN cards c ON c.id = tc.id\n` +
  `    WHERE c."key" IS NOT NULL AND +c.trash = 0\n` +
  `      AND (${endsInRuleSuffix(`c."key"`)})\n` +
  `  UNION\n` +
  `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
  `    JOIN dtl ON dtl.child = l.id\n` +
  `    JOIN cards j ON j.id = dtl.parent AND +j.trash = 0\n` +
  `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN dr ON dr.child = r.id\n` +
  `    JOIN cards j ON j.id = dr.parent AND +j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `    WHERE ${endsInRuleSuffix(`('+' || r.ckey)`)}\n` +
  `)\n` +
  `SELECT rs.ckey, rs.id FROM resolved rs\n` +
  `WHERE ${endsInRuleSuffix("rs.ckey")}`;

/** The statement the render path's rule-closure walk runs. */
function ruleClosureStatement(): string {
  if (typeof process !== "undefined" && process.env?.DECKO_LEGACY_RULE_CLOSURE === "1") {
    return LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT;
  }
  return RULE_KEY_RULE_CLOSURE_STATEMENT;
}

/** The setting-name parameters both rule-closure statements bind. */
export const RULE_CLOSURE_PARAMS: readonly string[] = TASK_RULE_SETTING_NAMES;

/**
 * The same composed-key resolution as resolveRuleIdsByKeys, with the rule
 * card's CONTENT carried when `withContent` is set (the content is what the
 * _left delegation inspects; the id-only projection keeps hot callers on
 * the shared universe with zero extra reads).
 *
 * Per driver, the first call builds the universe ONCE (see
 * RuleResolutionDriverCache); every call — repeat, reordered, or a wholly
 * different key set — is then Map lookups, plus at most one small content
 * IN-query for rule-card ids not yet content-memoized. Every caller treats
 * the result as read-only (`.get(key)` walks only; verified at all five
 * call sites).
 */
export async function resolveRuleRowsByKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
  withContent: boolean,
): Promise<Map<string, ResolvedRuleRow>> {
  return resolveRowsAgainst(driver, keys, withContent, "wholeDeck");
}

/**
 * The RENDER path's resolution: the same answers as resolveRuleRowsByKeys,
 * from the RULE-CLOSURE walk — one statement, scoped to the composed keys
 * that can be a rule candidate's name, instead of the whole deck's composed
 * key universe.
 *
 * WHY the scope is the requested closure and not the whole deck: every key
 * a render asks this resolver for ends in a task setting name, because
 * every rule candidate is a pattern name joined to a setting
 * (`ruleNamesForCard(card, "*read" | "*create" | "*update" | "*delete")`
 * — canReadByRuleLookupDepth below and allTaskVerdictsForCard /
 * permitVerdict in view-task-rules.ts are the only render-path callers, and
 * their keys are pattern names by construction). Every one of those keys on
 * a cold render ends in a task setting name. A card's composed key is
 * therefore needed
 * only when the card sits on a rule card's spine, and the walk only has to
 * start from the simple cards on those spines — which is the boundary the
 * whole-deck statement lacks.
 *
 * WHAT IT COSTS AND BUYS: against a deck of ~19k live cards the whole-deck
 * walk returns an order of magnitude more rows and takes about ten times as
 * long, for the same statement count (one per driver generation) and the
 * same answers on every rule-shaped key (0 missing, 0 disagreeing,
 * 0 invented). The benchmark script under benchmarks/cold-render/ measures
 * both shapes.
 *
 * The whole-deck walk stays for the write path: set-read-rule.ts's
 * `self` set-pattern member lookup resolves the anchor card's own composed
 * name, which is not a rule key, so the scoped walk would answer nothing
 * for it. That is the one consumer that still needs the full universe, and
 * it is a write, not a render.
 */
export async function resolveRuleRowsByRuleKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
  withContent: boolean,
): Promise<Map<string, ResolvedRuleRow>> {
  return resolveRowsAgainst(driver, keys, withContent, "ruleClosure");
}

/** Which walk backs a resolution: the whole deck's composed-key universe, or
 *  the rule cards' side-spine closure. Both are one statement per driver
 *  generation; they differ in what the walk is allowed to compose. */
type RuleResolutionScope = "wholeDeck" | "ruleClosure";

async function resolveRowsAgainst(
  driver: SQLDatabaseDriver,
  keys: string[],
  withContent: boolean,
  scope: RuleResolutionScope,
): Promise<Map<string, ResolvedRuleRow>> {
  if (keys.length === 0) return new Map();
  let cache = ruleResolutionCaches.get(driver);
  if (cache === undefined) {
    cache = { contentById: new Map() };
    ruleResolutionCaches.set(driver, cache);
  }
  if (universeFor(cache, scope) === undefined) {
    const result = await driver.query<{ ckey: string; id: number }>(
      scope === "ruleClosure" ? ruleClosureStatement() : RULE_KEY_UNIVERSE_STATEMENT,
      scope === "ruleClosure" ? [...TASK_RULE_SETTING_NAMES] : [],
    );
    // The statement's await is an expire window: a fixture seed or committed
    // save may have dropped this entry after this call created it. Re-read
    // the entry so the built universe lands in the LIVE cache — writing into
    // a detached object would make every later call rebuild.
    cache = ruleResolutionCaches.get(driver) ?? { contentById: new Map() };
    ruleResolutionCaches.set(driver, cache);
    if (universeFor(cache, scope) === undefined) {
      const universe = new Map<string, number>();
      for (const row of result.rows) universe.set(row.ckey, row.id);
      setUniverseFor(cache, scope, universe);
    }
  }
  const universe = universeFor(cache, scope);
  if (universe === undefined) throw new Error("rule resolution universe missing after build");
  // The result map is built in SORTED key order: the resolution is
  // order-insensitive (the old CTE's fragment Set + IN clause + ckey-keyed
  // result were too), so reordered calls must produce identical maps —
  // entry order included (pinned by
  // tests/card/permissions/rule-resolution-memo.test.ts).
  const ordered = [...keys].sort();
  const out = new Map<string, ResolvedRuleRow>();
  if (!withContent) {
    for (const key of ordered) {
      const id = universe.get(key);
      if (id !== undefined) out.set(key, { id, content: null });
    }
    return out;
  }
  const missing = new Set<number>();
  for (const key of ordered) {
    const id = universe.get(key);
    if (id === undefined) continue;
    out.set(key, { id, content: null });
    if (!cache.contentById.has(id)) missing.add(id);
  }
  if (missing.size > 0) {
    const ids = [...missing];
    const result = await driver.query<{ id: number; db_content: string | null }>(
      `SELECT id, db_content FROM cards WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ids,
    );
    const fetched = new Map<number, string | null>();
    for (const row of result.rows) fetched.set(row.id, row.db_content);
    // Same expire window as the universe build: re-read the entry so the
    // content memo lands in the LIVE cache.
    cache = ruleResolutionCaches.get(driver) ?? cache;
    for (const [id, content] of fetched) cache.contentById.set(id, content);
    // Serve this call's rows from the FETCHED data — an entry dropped
    // mid-flight must not surface null content for one call (the _left
    // delegation reads it); the cache write is best-effort and self-heals.
    for (const row of out.values()) {
      const fresh = fetched.get(row.id);
      row.content = fresh !== undefined ? fresh : (cache.contentById.get(row.id) ?? null);
    }
    return out;
  }
  for (const row of out.values()) row.content = cache.contentById.get(row.id) ?? null;
  return out;
}
