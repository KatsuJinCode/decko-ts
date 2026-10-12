// The deck-wide rule lookup cache — TypeScript port of
// card-1.110.0 lib/card/rule/cache.rb (Card::Rule::Cache), the STORAGE side
// of the codename-form rule cache.
//
// Ruby holds every deck rule in one cached hash keyed by
// "[anchor_id, pattern_code, setting_code].compact.map(&:to_s).join('+')"
// (cache.rb:37-49) where pattern_code and setting_code are the CODENAMES of
// the rule row's pattern card and setting card, resolved from the cards
// table through Card::Codename[id] (cache.rb:50-56). Rows whose pattern or
// setting card carries no codename produce a nil code and are SKIPPED
// (`next unless (key = lookup_key row)` — cache.rb:39). The type-id filters
// in the SQL interpolate the DECK's Set/Setting ids (cache.rb:18-19
// `#{SetID}` / `#{SettingID}`) — constants Ruby generates FROM the codename
// table at boot (codename.rb:107-110 generate_id_constants), so the port
// resolves them through DbCodenameRegistry too — never hard-coded ids.
//
// The RUNTIME half is already ported: Set::Pattern::All#rule_lookup_keys
// (set-patterns/card-patterns.ts#ruleLookupKeysForCard) and
// Rule::All#rule_id_lookup's walk shape (the lookupKeyForCard helper below;
// card-patterns.ts instance.ts#ruleLookupKey ports Base#rule_lookup_key,
// base.rb:75-80).

import type { SQLStatement } from "../../server/driver.js";
import { ruleCacheKeyFromRow } from "../set-patterns/rule-names.js";

/** One row of the Cache SQL result (cache.rb:9-26 selects these five
 *  columns; drivers return the numeric columns as numbers, Ruby coerces
 *  with .to_i — Number() here). */
export interface RuleCacheRow {
  rule_id: number | string;
  setting_id: number | string;
  set_id: number | string;
  /** sets.left_id — null for anchorless sets (the *all family). */
  anchor_id: number | string | null;
  /** sets.right_id — the anchored set's PATTERN tag (*self, *type, ...). */
  set_tag_id: number | string | null;
}

/**
 * The Cache SQL verbatim (cache.rb:9-26), with the deck's Set/Setting type
 * ids bound as parameters where Ruby interpolates the generated constants.
 * The *follow arm (cache.rb:20) keeps only content-bearing follow rules;
 * the three `trash is false` filters (cache.rb:21-23) exclude trashed
 * rules, sets, and settings.
 */
export function ruleCacheStatement(
  setTypeId: number,
  settingTypeId: number,
): SQLStatement {
  return {
    sql: `SELECT
          rules.id      AS rule_id,
          settings.id   AS setting_id,
          sets.id       AS set_id,
          sets.left_id  AS anchor_id,
          sets.right_id AS set_tag_id
        FROM cards rules
        JOIN cards sets     ON rules.left_id  = sets.id
        JOIN cards settings ON rules.right_id = settings.id
        WHERE     sets.type_id = ?
          AND settings.type_id = ?
          AND (settings.codename != 'follow' OR rules.db_content != '')
          AND    rules.trash is false
          AND     sets.trash is false
          AND settings.trash is false`,
    params: [setTypeId, settingTypeId],
  };
}

/** Number() coercion for the driver rows (Ruby's .to_i on the select_all
 *  strings). */
function toId(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Cache#lookup_hash (cache.rb:37-49) driven through the codename registry:
 * setting_code = nameForId(setting_id) and pattern_code =
 * nameForId(anchor_id ?? set_id : set_tag_id) (cache.rb:50-56 — the
 * anchorless arm reads the set row's OWN id, the anchored arm its pattern
 * tag); a row with either code missing is dropped (`next unless`), and the
 * surviving row's key is the ruleCacheKeyFromRow join.
 *
 * nameForId is Codename[id] (codename.rb:35-42 Integer branch) — the
 * registry's nameForId/peekNameForId. Rows are the ruleCacheStatement
 * result.
 */
export function buildRuleLookupHash(
  rows: readonly RuleCacheRow[],
  nameForId: (id: number) => string | undefined,
): Map<string, number> {
  const hash = new Map<string, number>();
  for (const row of rows) {
    const settingCode = nameForId(toId(row.setting_id));
    if (settingCode === undefined) continue; // cache.rb:44 `return false unless`
    const anchorId = row.anchor_id === null ? null : toId(row.anchor_id);
    // Ruby: row["set_tag_id"] of a null anchor-less junction would hit
    // `nil.to_i` = 0 -> Codename[0] -> nil -> skipped; the ?? 0 mirrors that
    // coercion (a null set_tag_id row never carries a codename-0 card).
    const setClassId = anchorId === null ? toId(row.set_id) : toId(row.set_tag_id ?? 0);
    const patternCode = nameForId(setClassId);
    if (patternCode === undefined) continue; // cache.rb:47 `return false unless`
    hash.set(ruleCacheKeyFromRow(anchorId, patternCode, settingCode), toId(row.rule_id));
  }
  return hash;
}

/**
 * Rule::All#rule_id_lookup (rule/all.rb:61-71): walk the card's rule lookup
 * keys in pattern precedence; PER KEY the primary suffix is probed first and
 * the fallback second (`rule_id ||= fallback_suffix && lookup_hash[...]`
 * sits INSIDE the key loop) — so a more-specific key's fallback beats a
 * less-specific key's primary. fallbackSuffix is preference_card_id's
 * "#{setting}+#{AllID}" after "#{setting}+#{user_id}" (rule/all.rb:56-60).
 */
export function ruleIdLookup(
  hash: ReadonlyMap<string, number>,
  lookupKeys: readonly string[],
  settingCode: string,
  fallbackSuffix?: string,
): number | undefined {
  for (const key of lookupKeys) {
    const ruleId = hash.get(`${key}+${settingCode}`);
    if (ruleId !== undefined) return ruleId;
    if (fallbackSuffix === undefined) continue;
    const fallbackId = hash.get(`${key}+${fallbackSuffix}`);
    if (fallbackId !== undefined) return fallbackId;
  }
  return undefined;
}
