// Rule lookup — the storage walk side of the rule-algebra pair in
// src/card/set-patterns/rule-names.ts. Given a card + setting code (e.g.
// "read", "write", "delete", or a view name like "open"), compute the
// ordered candidate rule names, fetch them, and return the first one that
// exists.
//
// Ports of:
// - lib/card/rule/all.rb#rule_card_id: walks rule cache by lookup key
//   "<set_name>+<setting_code>", tries each set name in pattern-precedence
//   order (most-specific first), returns the first hit.
// - lib/card/rule/cache.rb#lookup_key: codename-based cache key
//   "[anchor_id, pattern_code, setting_code].compact.join('+')" - the
//   "all+read" / "605+self+read" / "2+type+read" forms.
// - lib/card/rule.rb#fetch_id / #fetch: the live cache misses then go to
//   storage (set_names + setting -> "<set>+<setting>" by name).
//
// The full stream owns the WRITE-side hook (rule cards are stored on save
// the same way; cache invalidation on update follows the cache.rb#reset_rule
// rules). For now the lookup is read-only.

import { DeckoName, type Nameish } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import { composeCardRecord, type CardRecord } from "../fetch/card-record.js";
import type { CardsRow } from "../../server/schema.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";

/** The rule lookup result: the active rule card (the first hit in
 *  precedence order), or undefined if none of the candidates exist.
 *  The `candidates` field carries the full list so callers can report /
 *  reason about the search space. */
export interface RuleLookupResult {
  rule: CardRecord;
  /** Which set name won ("*all", "*type", "Joe+Admin", ...). */
  setName: string;
  /** The full ordered candidate list — what we tried, in order. */
  candidates: string[];
  /** Index into `candidates` of the winning rule. */
  matchedIndex: number;
}

/**
 * Find the rule card that applies to `card` for the named setting.
 *
 * Precedence: most-specific set module first (the patternsForCard walk in
 * src/card/set-patterns/card-patterns.ts), then `*all` last. The first
 * candidate that resolves to an existing card wins.
 *
 * Pattern-card-as-input covers the typical case (give it a CardRecord or a
 * rendered RenderCard); raw string names go through DeckoName.parse so
 * callers don't have to pre-build a card record.
 */
export async function findRule(
  fetcher: FetchEngine,
  card: PatternCardInput,
  settingCode: Nameish,
): Promise<RuleLookupResult | undefined> {
  const candidates = ruleNamesForCard(card, settingCode);
  // THE CANDIDATES, DECLARED (the transport packing). The naming algebra
  // produced the whole candidate list before the walk started, so the
  // walk's own reads of them can be declared once, and the walk's reads
  // then cost no round trip.
  await declareRuleCandidates(fetcher, candidates);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    // The *self candidate of a legacy row is looked up by ids first, as
    // Ruby's rule cache does: a by-name miss would cache a new-card
    // placeholder under the candidate's key, which Ruby's id-keyed lookup
    // never creates.
    const record =
      (i === 0 ? await legacySelfRule(fetcher, card, candidate, settingCode) : undefined) ??
      (await fetcher.fetchByName(candidate));
    if (record !== undefined && record.name !== undefined) {
      return {
        rule: record,
        setName: candidate.split("+").slice(0, -1).join("+") || candidate,
        candidates,
        matchedIndex: i,
      };
    }
  }
  return undefined;
}

/**
 * THE RULE CANDIDATES, DECLARED (the transport packing).
 *
 *  The candidate walk resolves each candidate name through the Lexicon, one
 *  name at a time, and each resolution is a round trip: the engine awaits
 *  every answer before it issues the next read. A candidate name is
 *  COMPOUND (a set name joined to a setting name), so its resolution is a
 *  CHAIN of junction lookups, and the chain was walked one junction at a
 *  time: the graded save's rule lookups cost 27 pipeline POSTs, one per
 *  junction, because nothing knew the whole candidate set at once.
 *
 *  The candidate set IS known at the seam: the naming algebra produced the
 *  whole ordered list before the walk started. The declaration resolves the
 *  set level by level (src/card/fetch/lexicon.ts#prefetchIds), and the
 *  walk's own reads of the candidates are then answered from the driver's
 *  read memo.
 *
 *  WHY IT CHANGES NO ANSWER. The declaration is a SPECULATION: the driver
 *  remembers the answers under the same keys the readers use, and a read
 *  the driver cannot vouch for is a MISS - the reader's own read then
 *  takes the blocking path, at its own sequence point, and answers the
 *  same. The declaration therefore changes the NUMBER of round trips, never
 *  the ANSWERS.
 */
async function declareRuleCandidates(
  fetcher: FetchEngine,
  candidates: readonly string[],
): Promise<void> {
  if (fetcher.lexicon.prefetchIds === undefined) return;
  const names: DeckoName[] = [];
  for (const candidate of candidates) {
    try {
      names.push(DeckoName.parse(candidate));
    } catch {
      // A name the walk itself cannot parse is not this method's to
      // declare: the walk's own read of it fails the same way it always
      // did.
    }
  }
  if (names.length === 0) return;
  await fetcher.lexicon.prefetchIds(names);
}

/**
 * The *self rule of a legacy compound row, found the way Ruby's rule cache
 * finds it. Ruby keys every rule by ids (cache.rb lookup_key:
 * "#{sets.left_id}+self+#{setting}", the anchor being the card's own id), so
 * a card's *self rule is found whatever its name. The name walk above
 * resolves "<card>+*self+<setting>" through the lexicon, which composes a
 * compound name only through side ids; a legacy row that stores its compound
 * name with no side ids cannot be composed, and its *self rule is missed.
 * Only such rows take this path (one indexed statement), so ordinary cards
 * keep the name walk and its caching unchanged.
 */
async function legacySelfRule(
  fetcher: FetchEngine,
  card: PatternCardInput,
  candidate: string,
  settingCode: Nameish,
): Promise<CardRecord | undefined> {
  const id = card.id;
  if (id === undefined || id === null) return undefined;
  const name = DeckoName.parse(card.name);
  if (!name.isCompound) return undefined;
  const setting = DeckoName.parse(settingCode);
  if (DeckoName.parse(candidate).key !== DeckoName.parse(`${name.s}+*self+${setting.s}`).key) return undefined;
  // An ordinary compound card (side ids present) keeps the name walk's
  // answer; that is the common case and costs no statement. A side-less row
  // is checked in the statement below, which also covers a row that fetch
  // by id cannot return because a by-name miss cached a placeholder under
  // its key.
  const row = await fetcher.fetchById(id);
  if (row !== undefined && row.leftId !== undefined && row.leftId !== null && row.rightId !== undefined && row.rightId !== null) {
    return undefined;
  }
  await fetcher.codenames.ensureLoaded();
  const selfId = fetcher.codenames.peekId("self");
  const setTypeId = fetcher.codenames.peekId("set");
  const settingTypeId = fetcher.codenames.peekId("setting");
  const settingCard = await fetcher.fetchByName(setting.s);
  if (selfId === undefined || setTypeId === undefined || settingTypeId === undefined || settingCard?.id === undefined) {
    return undefined;
  }
  if (settingCard.typeId !== settingTypeId) return undefined;
  // The row itself, composed here rather than fetched by id: fetch by id
  // reads the cache by key first, where an earlier by-name miss of this
  // name may have cached a new-card placeholder.
  const result = await fetcher.driver.query<CardsRow>(
    `SELECT r.* FROM cards s JOIN cards r ON r.left_id = s.id
      WHERE s.left_id = ? AND s.right_id = ? AND s.type_id = ? AND s.trash = 0
        AND r.right_id = ? AND r.trash = 0
        AND EXISTS (SELECT 1 FROM cards c WHERE c.id = s.left_id AND c.left_id IS NULL AND c.trash = 0)
        AND (? != 'follow' OR r.db_content != '')
      LIMIT 1`,
    [id, selfId, setTypeId, settingCard.id, settingCard.codename ?? ""],
  );
  const ruleRow = result.rows[0];
  if (ruleRow === undefined) return undefined;
  const rule = await composeCardRecord(ruleRow, fetcher.lexicon);
  if (rule.name !== undefined) return rule;
  // The rule's own name composes through the same legacy left the lexicon
  // cannot name; it is the candidate the walk asked for.
  const ruleName = DeckoName.parse(candidate);
  return { ...rule, name: ruleName, key: ruleName.key };
}

/**
 * Find every rule that applies to `card` across the named settings. Used by
 * the renderer to collect view overrides (each setting is independent — the
 * `:open` rule and the `:content` rule on the same set module are different
 * rule cards). The returned array is in pattern-precedence order so callers
 * can apply most-specific last (Ruby's view chain order).
 */
export async function findRules(
  fetcher: FetchEngine,
  card: PatternCardInput,
  settingCodes: readonly Nameish[],
): Promise<RuleLookupResult[]> {
  const results: RuleLookupResult[] = [];
  for (const code of settingCodes) {
    const found = await findRule(fetcher, card, code);
    if (found !== undefined) results.push(found);
  }
  return results;
}

/**
 * The codename-form cache key for a rule card
 * ([anchor_id, pattern_code, setting_code].compact.join('+')). Mirrors
 * cache.rb#lookup_key; used by the rule cache and for debugging only
 * (the live lookup walks by name, not by cache key — see rule/all.rb
 * note on codename resolution requiring the codename registry to be
 * initialized first).
 */
export function ruleCacheKey(
  anchorId: number | undefined,
  patternCode: string,
  settingCode: string,
): string {
  return [anchorId, patternCode, settingCode].filter((x) => x !== undefined).join("+");
}

/** Convenience: parse a card name for the pattern-card-input shape that
 *  ruleNamesForCard consumes. Most callers will pass a CardRecord or a
 *  RenderCard; this lets you pass a plain name without a record. */
export function nameAsPatternCardInput(name: Nameish): PatternCardInput {
  return { name: DeckoName.parse(name).s };
}
