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
//
// THE INVALIDATION HALF IS ENGINE-OWNED, and the port says so here.
// Ruby's cache clears collapse into the port's two invalidation
// mechanisms: clear_rule_cache, clear_preference_cache and
// clear_read_rule_cache (rule.rb:28-37), the rule cache's own clear
// (rule/cache.rb#clear, cache.rb:35-37) and the preference cache's clear
// (rule/preference_cache.rb#clear, preference_cache.rb:56-59) each write
// nil over a deck-wide cached hash, and the port holds no deck-wide hash
// of either kind: the rule lookup state is the per-driver rule-resolution
// memo (read-rules.ts RuleResolutionDriverCache) plus the render engines'
// rule-derived universe memos, BOTH dropped unconditionally on every
// committed save (expireRuleResolutionCache in CardActionEngine
// .expireAfterWrite, read-rules.ts:749-753, and RenderEngine#
// expireRuleCache through the host's post-save gate), and the preference
// index lives for one resolver only (follower-resolver.ts
// oncePreferenceIndex), so there is no stale deck-wide hash to clear.

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
  rule_content?: string | null;
  rule_type_id?: number | string | null;
  rule_codename?: string | null;
  rule_created_at?: string | null;
  rule_updated_at?: string | null;
  rule_creator_id?: number | string | null;
  rule_updater_id?: number | string | null;
  rule_current_revision_id?: number | string | null;
  rule_read_rule_id?: number | string | null;
  rule_read_rule_class?: string | null;
  anchor_name?: string | null;
  anchor_left_id?: number | string | null;
  anchor_right_id?: number | string | null;
  anchor_left_name?: string | null;
  anchor_left_left_id?: number | string | null;
  anchor_left_right_id?: number | string | null;
  anchor_right_name?: string | null;
  anchor_right_left_id?: number | string | null;
  anchor_right_right_id?: number | string | null;
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
  options: { includeContent?: boolean; includeRuleCardFields?: boolean; codenameSubquery?: boolean } = {},
): SQLStatement {
  const extraRuleCols = options.includeRuleCardFields
    ? `\n          rules.db_content AS rule_content,
          rules.type_id AS rule_type_id,
          rules.codename AS rule_codename,
          rules.created_at AS rule_created_at,
          rules.updated_at AS rule_updated_at,
          rules.creator_id AS rule_creator_id,
          rules.updater_id AS rule_updater_id,
          rules.read_rule_id AS rule_read_rule_id,
          rules.read_rule_class AS rule_read_rule_class,
          anchors.name AS anchor_name,
          anchors.left_id AS anchor_left_id,
          anchors.right_id AS anchor_right_id,
          anchors_l.name AS anchor_left_name,
          anchors_l.left_id AS anchor_left_left_id,
          anchors_l.right_id AS anchor_left_right_id,
          anchors_r.name AS anchor_right_name,
          anchors_r.left_id AS anchor_right_left_id,
          anchors_r.right_id AS anchor_right_right_id,`
    : options.includeContent
      ? "\n          rules.db_content AS rule_content,"
      : "";
  const anchorJoin = options.includeRuleCardFields
    ? "\n        LEFT JOIN cards anchors ON anchors.id = sets.left_id AND anchors.trash is false" +
      "\n        LEFT JOIN cards anchors_l ON anchors_l.id = anchors.left_id AND anchors_l.trash is false" +
      "\n        LEFT JOIN cards anchors_r ON anchors_r.id = anchors.right_id AND anchors_r.trash is false"
    : "";
  const typePredicates = options.codenameSubquery
    ? `sets.type_id = (SELECT id FROM cards WHERE codename = 'set' AND trash is false LIMIT 1)\n          AND settings.type_id = (SELECT id FROM cards WHERE codename = 'setting' AND trash is false LIMIT 1)`
    : `sets.type_id = ?\n          AND settings.type_id = ?`;
  return {
    sql: `SELECT
          rules.id      AS rule_id,${extraRuleCols}
          settings.id   AS setting_id,
          sets.id       AS set_id,
          sets.left_id  AS anchor_id,
          sets.right_id AS set_tag_id
        FROM cards rules
        JOIN cards sets     ON rules.left_id  = sets.id
        JOIN cards settings ON rules.right_id = settings.id${anchorJoin}
        WHERE     ${typePredicates}
          AND (settings.codename != 'follow' OR rules.db_content != '')
          AND    rules.trash is false
          AND     sets.trash is false
          AND settings.trash is false`,
    params: options.codenameSubquery ? [] : [setTypeId, settingTypeId],
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
 *
 * Generic over the hash's value type because Ruby returns the STORED rule id
 * and the caller fetches it (`Card.fetch rule_card_id` - all.rb:21); the
 * render engine's rule cache carries that id beside the winning rule's set
 * identity, and this walk must hand back the whole stored value, not a
 * projection of it.
 */
export function ruleIdLookup<V>(
  hash: ReadonlyMap<string, V>,
  lookupKeys: readonly string[],
  settingCode: string,
  fallbackSuffix?: string,
): V | undefined {
  for (const key of lookupKeys) {
    const ruleId = hash.get(`${key}+${settingCode}`);
    if (ruleId !== undefined) return ruleId;
    if (fallbackSuffix === undefined) continue;
    const fallbackId = hash.get(`${key}+${fallbackSuffix}`);
    if (fallbackId !== undefined) return fallbackId;
  }
  return undefined;
}
