/**
 * Rule-name algebra - the naming half of rule lookup (the storage walk
 * itself lands in the rule-lookup stream). Ported from:
 *
 * - lib/card/rule/all.rb: #rule_card_id consults the rule cache by
 *   "<rule lookup key>+<setting code>" for the card's pattern lookup keys in
 *   precedence order (Set::Pattern::All#rule_lookup_keys).
 * - lib/card/rule/cache.rb: Cache#lookup_key builds cache keys
 *   "[anchor_id, pattern_code, setting_code].compact.join('+')" - NO stars:
 *   codename-based ("all+read", "605+self+read", "2+type+read").
 * - card-mod-rules-0.20.0 set/rule/rules.rb: rule cards decompose as
 *   set = trunk, setting = tag (preferences drop the user part).
 * - card-mod-permissions-0.20.0 set/all/permissions.rb#rule_class_name: the
 *   cards.read_rule_class column value - the rule card's trunk is a Set, and
 *   the class is its tag, i.e. the PATTERN CARD NAME ("*all", "*self").
 *
 * Oracle-verified (decko 0.20.0 runner, tests/card/set-patterns/
 * set-pattern-oracle-capture.json):
 * - card "Oracle Junction" + setting *read candidates:
 *   ["Oracle Junction+*self+*read", "RichText+*type+*read", "*all+*read"],
 *   and rule_card(:read) resolves to "*all+*read" (id 10) with the cache
 *   holding "all+read" -> 10.
 * - "*all+*read".rule_class_name == "*all",
 *   "Oracle Restricted+*self+*read".rule_class_name == "*self".
 */

import { DeckoName, type Nameish } from "../name.js";
import { getNameEnvironment } from "../name/environment.js";
import type { PatternCardInput } from "./types.js";
import { patternsForCard } from "./card-patterns.js";

/**
 * The rule card NAME for a set + setting: plain name join ("*all" + "*read"
 * -> "*all+*read"). Both arguments are card names - callers holding a
 * setting CODE build the setting card name via settingCardNameForCode.
 */
export function ruleName(setName: Nameish, settingName: Nameish): string {
  return `${DeckoName.parse(setName).s}+${DeckoName.parse(settingName).s}`;
}

/**
 * Ordered candidate rule names for a card + setting: the card's set names
 * (pattern precedence order) each joined to the setting name. The first name
 * that exists as a rule card in storage wins; that walk is the next stream's
 * work - this is the naming algebra only.
 */
export function ruleNamesForCard(
  card: PatternCardInput,
  settingName: Nameish,
): string[] {
  const setting = DeckoName.parse(settingName).s;
  // ruleName(set, setting) per pattern, with the setting's half parsed once
  // (at the first pattern, exactly where ruleName would first parse it).
  let settingPart: string | undefined;
  return patternsForCard(card).map((pattern) => {
    const setPart = DeckoName.parse(pattern.setName).s;
    settingPart ??= DeckoName.parse(setting).s;
    return `${setPart}+${settingPart}`;
  });
}

/**
 * Setting card name from a setting codename ("read" -> "*read"). Ruby
 * resolves this through Card::Codename[code] -> card name; the fallback
 * builds "*"+code, deterministic for setting cards (their names are always
 * the starred codename).
 */
export function settingCardNameForCode(settingCode: string): string {
  const name = getNameEnvironment()?.codename?.name(settingCode);
  return name ?? `*${settingCode}`;
}

/**
 * Rule::All#rule_id_lookup: the rule cache is keyed by
 * "<rule_lookup_key>+<setting_code>" (rule/all.rb#rule_id_lookup builds
 * `"#{lookup_key}+#{cache_suffix}"`). Example: "all" + "read" -> "all+read".
 */
export function ruleCacheKey(
  ruleLookupKey: string,
  settingCode: string,
): string {
  return `${ruleLookupKey}+${settingCode}`;
}

/**
 * Rule::Cache#lookup_key (lib/card/rule/cache.rb): the storage side builds
 * the same keys from the rule card's row -
 * `[anchor_id, pattern_code, setting_code].compact.map(&:to_s).join("+")`.
 * anchor_id (sets.left_id) is nil for anchorless sets; pattern_code comes
 * from set_tag_id (anchored) or set_id (anchorless); setting_code from the
 * setting card's codename. No stars anywhere.
 */
export function ruleCacheKeyFromRow(
  anchorId: number | null | undefined,
  patternCode: string,
  settingCode: string,
): string {
  return [anchorId, patternCode, settingCode]
    .filter((part) => part !== null && part !== undefined)
    .map(String)
    .join("+");
}

/**
 * Rule::All#rule_id_lookup preference fallback: preferences consult
 * "<setting code>+<user id>" then "<setting code>+<all id>" as the suffix
 * (lib/card/rule/all.rb#preference_card_id). Ported for parity; preference
 * application is a later stream.
 */
export function preferenceCacheKeys(
  settingCode: string,
  userId: number | undefined,
  allUserId: number,
): string[] {
  return userId === undefined
    ? [`${settingCode}+${allUserId}`]
    : [`${settingCode}+${userId}`, `${settingCode}+${allUserId}`];
}

/**
 * permissions.rb#rule_class_name: `trunk.type_id == SetID ?
 * name.trunk_name.tag : nil`. The value stored in cards.read_rule_class is
 * the PATTERN CARD NAME with star ("*all", "*self", "*type"). The caller
 * supplies whether the rule card's trunk is a Set card (storage question).
 */
export function ruleClassName(
  ruleCardName: Nameish,
  trunkIsSet: boolean,
): string | null {
  if (!trunkIsSet) return null;
  return DeckoName.parse(ruleCardName).trunkName.tag;
}

/**
 * card-mod-rules set/rule/rules.rb#rule_set_name: the SET card name a rule
 * card hangs off - the trunk, or trunk.trunk for preference cards
 * (SET+USER+SETTING shape, isPreference from Rule::All#preference?).
 */
export function ruleSetCardName(
  ruleCardName: Nameish,
  isPreference = false,
): string {
  const n = DeckoName.parse(ruleCardName);
  return isPreference ? n.trunkName.trunkName.s : n.trunkName.s;
}

/** card-mod-rules set/rule/rules.rb#rule_setting_name: the rule card's tag. */
export function ruleSettingCardName(ruleCardName: Nameish): string {
  return DeckoName.parse(ruleCardName).tag;
}
