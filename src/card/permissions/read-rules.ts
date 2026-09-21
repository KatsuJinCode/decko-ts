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
// renders issue zero permission queries.

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

/** The resolved permission state: the read rule ids the viewer may read
 *  through (Ruby: Auth.as_card.read_rules_hash), whether the deck carries
 *  the read-rule universe (gates the stored-id fallback walk), and the
 *  parties the resolution ran for (diagnostics). */
export interface ReadPermissionState {
  /** read_rules_hash keys (account_holder.rb:51-53). */
  readonly readableRuleIds: Set<number>;
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
 * The two statements, ready for a driver.batch fold.
 *
 * Statement 1 (parties): the codename cards the party math needs — the
 * port of the boot-time AnonymousID/AnyoneID constants
 * (lib/card/codename.rb:108 `const_get_or_set("#{codename.camelize}ID")`).
 *
 * Statement 2 (the cache): read_rule_cache.rb's SQL verbatim, with ReadID
 * and SetID as scalar subqueries on the codename cards so the statement is
 * self-contained (a batch cannot reference a sibling's results).
 */
export function readPermissionStatements(): SQLStatement[] {
  return [
    {
      sql:
        `SELECT id, codename FROM cards WHERE codename IN ` +
        `('${ANYONE_CODENAME}', '${ANYONE_SIGNED_IN_CODENAME}', '${ANONYMOUS_CODENAME}') ` +
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
}

/** Parse the batch results (statements in readPermissionStatements order)
 *  for one actor's parties into the permission state. */
export function readPermissionStateFromResults(
  results: SQLQueryResult[],
  actorId: number | undefined,
  signedIn: boolean,
): ReadPermissionState {
  const codenameRows = (results[0]?.rows ?? []) as Array<{ id: number; codename: string | null }>;
  const cacheRows = (results[1]?.rows ?? []) as Array<PartyRuleRow>;
  const ruleCount = (results[2]?.rows ?? []) as Array<{ c: number; catchAll: number }>;

  const byCodename = new Map<string, number>();
  for (const row of codenameRows) {
    if (row.codename !== null) byCodename.set(row.codename, row.id);
  }
  const anyone = byCodename.get(ANYONE_CODENAME);
  const parties: number[] = anyone !== undefined ? [anyone] : [];
  if (signedIn) {
    // account_holder.rb:111-113 fetch_roles puts AnyoneSignedIn first; the
    // deck-role walk (role member cards) is the non-anonymous remainder.
    const anyoneSignedIn = byCodename.get(ANYONE_SIGNED_IN_CODENAME);
    if (anyoneSignedIn !== undefined) parties.push(anyoneSignedIn);
  }
  if (actorId !== undefined) parties.push(actorId); // #parties << id (:27-29)

  // read_rule_cache.rb lookup_hash: party_id -> [read_rule_id, ...]
  const cache = new Map<number, number[]>();
  for (const row of cacheRows) {
    if (row.partyId === null || row.partyId === undefined) continue;
    const list = cache.get(row.partyId);
    if (list === undefined) cache.set(row.partyId, [row.readRuleId]);
    else list.push(row.readRuleId);
  }

  // account_holder.rb:115-123 fetch_read_rules: concat cache[party]
  // (DeckoBot returns [] there — always_ok short-circuits first).
  const readableRuleIds = new Set<number>();
  for (const party of parties) {
    for (const ruleId of cache.get(party) ?? []) readableRuleIds.add(ruleId);
  }
  return {
    readableRuleIds,
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
  return readPermissionStateFromResults(results, anonymousIdFromResults(results), false);
}

/** Verdict for a card whose readRuleId is known — the pure half of
 *  permissions.rb:139-146 ok_to_read? (set membership, no queries). */
export function canReadByStoredRule(
  readRuleId: number,
  state: ReadPermissionState,
): boolean {
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
  if (!state.hasReadRules || !state.hasCatchAllReadRule) return undefined;
  const candidates = ruleNamesForCard(card, READ_SETTING_NAME);
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
 * Composed-key -> card id for the given rule-name keys. The `resolved`
 * closure is the prefetch walk's key-composition CTE
 * (src/card/render/prefetch.ts walkStatement — simple cards by their key
 * column, junction rows by recursively composed side keys, UNION-deduped so
 * cycles terminate; lib/card/lexicon.rb DbLexicon#name_to_lex in SQL).
 */
async function resolveRuleIdsByKeys(
  driver: SQLDatabaseDriver,
  keys: string[],
): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map(() => "?").join(", ");
  const result = await driver.query<{ ckey: string; id: number }>(
    `WITH RECURSIVE resolved(id, ckey) AS (\n` +
      `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
      `  UNION\n` +
      `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
      `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
      `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
      `  UNION\n` +
      `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
      `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
      `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
      `)\n` +
      `SELECT rs.ckey, rs.id FROM resolved rs WHERE rs.ckey IN (${placeholders})`,
    keys,
  );
  const out = new Map<string, number>();
  for (const row of result.rows) out.set(row.ckey, row.id);
  return out;
}
