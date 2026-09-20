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
import type { CardRecord } from "../fetch/card-record.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";

/** The rule lookup result: the active rule card (the first hit in
 *  precedence order), or undefined if none of the candidates exist.
 *  The `candidates` field carries the full list so callers can report /
 *  reason about the search space (oracle parity for debugging). */
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
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const record = await fetcher.fetchByName(candidate);
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
 * initialized, which is wave-2+ work).
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
