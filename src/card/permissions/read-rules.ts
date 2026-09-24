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

/** Codename of the setting card the read rules hang off (*read). */
const READ_CODENAME = "read";
/** The setting CARD NAME the live rule walk joins to set names
 *  (ruleNamesForCard joins set + setting names: "Basic+*type" + "*read"). */
const READ_SETTING_NAME = "*read";
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
 *  then true`, auth/permissions.rb:9 — "cannot disable"). */
const DECKOBOT_CODENAME = "deckobot";
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

/** The signed-out corpus viewer — what every engine computed before the
 *  actor wave, and what an unresolved/expired token degrades to
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
}

/** One party row of the ReadRuleCache join (read_rule_cache.rb SQL). */
interface PartyRuleRow {
  partyId: number;
  readRuleId: number;
}

/**
 * The permission statements, ready for a driver.batch fold.
 *
 * Statement 1 (parties): the codename cards the party math needs — the
 * port of the boot-time AnonymousID/AnyoneID constants
 * (lib/card/codename.rb:108 `const_get_or_set("#{codename.camelize}ID")`),
 * plus the two codenames the signed-in path compares against
 * (administrator: the always_ok? role; deckobot: the always_ok? actor).
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
 *    The corpus deck proves the shape: every `<Role>+*members` row's
 *    reference set matches its content item count exactly, and the
 *    anonymized corpus rewrote the CONTENT while the id references
 *    survived — references are the durable id truth.
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
 *  for one actor's parties into the permission state. Legacy entry point —
 *  the Anonymous corpus path passes
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
 * The Anonymous viewer's permission state — the corpus capture's actor.
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

/**
 * The live-computation fallback for a card row without a stored
 * read_rule_id — permission_rule_id(:read) (set/all/permissions.rb:55-61):
 * walk the card's candidate rule names in pattern precedence and take the
 * first that exists, then run the same readable-set check.
 *
 * Candidate resolution goes through the composed-key closure (the
 * DbLexicon.nameToLex SQL the prefetch walk uses) rather than the fetch
 * engine's name ladder: rule names are junctions by construction
 * ("Basic+*type+*read"), and the closure resolves NULL-key junction rows at
 * ANY depth in one statement. One query per fallback card, memoized by the
 * caller's verdict cache.
 *
 * Returns undefined when the deck carries NO read rule cards at all
 * (`hasReadRules: false`): every real deck bootstraps *all+*read
 * (card/auth/setup.rb:44), so this is the synthetic-seed case only, and
 * the caller treats it as ALLOWED (the documented divergence — Ruby on a
 * rule-less deck denies; matching that would deny every card of every
 * rule-less test deck, which is not the surface any oracle captures).
 */
export async function canReadByRuleLookup(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ReadPermissionState,
): Promise<boolean | undefined> {
  if (state.alwaysOk) return true; // permissions.rb:140, before any rule walk
  if (!state.hasReadRules || !state.hasCatchAllReadRule) return undefined;
  // pattern/all.rb#patterns: a NEW card's pattern list drops the first
  // concrete pattern (SELF) — and rule_lookup_keys then nils every anchored
  // candidate whose anchor card has no id. The virtual cards (id ===
  // undefined) are new cards by definition, so their SELF candidate —
  // anchored on themselves — never reaches the lookup. Oracle-verified
  // (2026-09-23 recapture deck, diagnose-capture-error probes):
  // `Card.fetch("<virtual junction>").permission_rule_id(:read)` answers the
  // `*all plus+*read` rule, skipping an existing `<name>+*self+*read` rule.
  const candidates = ruleNamesForCard(
    card.id === undefined ? { ...card, isNew: true } : card,
    READ_SETTING_NAME,
  );
  const resolved = await resolveRuleIdsByKeys(
    fetcher.driver,
    candidates.map((name) => DeckoName.parse(name).key),
  );
  for (const name of candidates) {
    const ruleId = resolved.get(DeckoName.parse(name).key);
    if (ruleId !== undefined) return state.readableRuleIds.has(ruleId);
  }
  // No candidate resolved: in a COMPLETE deck this means no read rule
  // applies at all (Ruby's permission_rule_id -> nil -> deny, the
  // non-bootstrapped-deck edge). Partial decks (per-shard replay seeds)
  // simply lack the card's applicable rule card, and fabricating a denial
  // from missing data would mis-deny cards the full deck renders — so the
  // port allows (documented divergence, docs/permissions-port-notes.md).
  return undefined;
}

/**
 * Composed-key -> card id for the given rule-name keys — TARGET-DRIVEN
 * per-key resolution (D1 read-cost fix, 2026-09-23). The previous statement
 * seeded `resolved` from EVERY card in the deck and composed the full
 * compound-key universe, paying O(deck x recursion passes) rows read per
 * call regardless of how many keys the caller asked for; the requested keys
 * appeared only in the outer SELECT's filter. This version grows the same
 * closure but restricts EVERY arm's output to the key's own fragment set —
 * every '+'-cut contiguous segment run of the requested keys ("a+b+c"
 * needs "a", "b", "c", "a+b", "b+c", "a+b+c") — so the recursion touches
 * only indexed seeks on the requested keys' paths. Any intermediate key the
 * old universe closure built on the way to a requested key is by
 * construction one of those segment runs, so the resolvable set for the
 * requested keys is unchanged (including the old CTE's documented
 * limitation: a junction whose two sides are BOTH composed still needs a
 * simple-keyed side at each step — rule candidates are <= 3 parts, where
 * every split has a simple side).
 *
 * The seed seeks cards_key_index (COLLATE NOCASE — the column is BINARY,
 * the index NOCASE; lossless for decko's lowercase-ASCII keys, the same
 * annotation the prefetch fallback rounds use). UNION dedups (id, ckey) so
 * cycles terminate.
 *
 * Exported for the write-side derivation too (set-read-rule.ts resolves the
 * same rule-name candidates against storage; view-task-rules.ts resolves
 * its task candidates through this same function).
 */
export async function resolveRuleIdsByKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const fragments = new Set<string>();
  for (const key of keys) {
    const segments = key.split("+");
    for (let i = 0; i < segments.length; i++) {
      for (let j = i; j < segments.length; j++) {
        fragments.add(segments.slice(i, j + 1).join("+"));
      }
    }
  }
  const fragList = [...fragments];
  const fragParams = fragList.map(() => "?").join(", ");
  const keyParams = keys.map(() => "?").join(", ");
  // The unary + on j.trash (the established planner guard, the prefetch
  // walk perf note) keeps the planner OFF cards_trash_index in the seed
  // and the recursive arms: without it SQLite drives the joins from a
  // full trash=0 scan instead of the per-fragment key seek and the
  // per-row left_id/right_id seeks (the no-ANALYZE planner trap). Seek
  // terms keep their index paths; + is a value no-op.
const result = await driver.query<{ ckey: string; id: number }>(
    `WITH RECURSIVE resolved(id, ckey) AS (\n` +
      `  SELECT id, "key" FROM cards WHERE "key" COLLATE NOCASE IN (${fragParams}) AND +trash = 0\n` +
      `  UNION\n` +
      `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
      `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0\n` +
      `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
      `   WHERE (l.ckey || '+' || r."key") IN (${fragParams})\n` +
      `  UNION\n` +
      `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
      `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
      `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
      `   WHERE (l."key" || '+' || r.ckey) IN (${fragParams})\n` +
      `)\n` +
      `SELECT rs.ckey, rs.id FROM resolved rs WHERE rs.ckey IN (${keyParams})`,
    [...fragList, ...fragList, ...fragList, ...keys],
  );
  const out = new Map<string, number>();
  for (const row of result.rows) out.set(row.ckey, row.id);
  return out;
}
