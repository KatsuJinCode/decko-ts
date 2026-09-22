/**
 * The set-pattern registry - first piece of the rules/permissions engine
 * (TypeScript port of card-1.110.0's Card::Set::Pattern machinery).
 *
 * The registry decides which rule card applies to which card. A "pattern" is
 * a family of sets ("all cards of type X", "all +field cards", "this exact
 * card"); nine core patterns are registered by card-1.110.0's core mod and
 * looked up in precedence order [self, type plus right, right, rule, rstar,
 * star, type, all plus, all] (registration front-inserts; see registry.ts).
 *
 * Ruby module -> file map (every method cites its source):
 * - lib/card/set/pattern.rb            -> registry.ts (Pattern.find / codes /
 *                                        ids / grouped_codes / reloadables)
 * - lib/card/set/pattern/
 *   class_methods.rb                   -> registry.ts PatternSpec fields
 *                                        (register options, pattern_applies?
 *                                        default, anchor_parts_count default)
 * - mod/core/set_pattern/01..09 .rb    -> registry.ts PATTERN_TABLE entries +
 *                                        labels.ts (label/short_label/
 *                                        generic_label/prototype_args)
 * - lib/card/set/pattern/base.rb       -> instance.ts PatternInstance
 *                                        (anchor handling, set name,
 *                                        safe_key, module_key,
 *                                        rule_lookup_key)
 * - lib/card/set/pattern/all.rb        -> card-patterns.ts (concrete_patterns,
 *                                        patterns, set_names,
 *                                        rule_lookup_keys, safe_set_keys)
 * - card-mod-rules set/type/set.rb     -> set-name.ts (set card name ->
 *                                        pattern + anchor, labels)
 * - lib/card/rule/all.rb + rule/cache.rb
 *   + card-mod-rules set/rule/rules.rb
 *   + card-mod-permissions set/all/permissions.rb
 *                                      -> rule-names.ts (rule name shapes,
 *                                        cache-key algebra, read_rule_class)
 *
 * Environment: the registry resolves card ids and codenames through the name
 * layer's environment (src/card/name/environment.ts - setNameEnvironment /
 * getNameEnvironment), exactly as Ruby resolves them through Card::Lexicon
 * and Card::Codename. Without an environment, set names and safe keys work;
 * rule lookup keys for anchored patterns and pattern ids need a lexicon +
 * codename registry.
 *
 * Deferred (see docs/set-patterns-port-notes.md): pattern MODULE loading
 * (mod system, wave 3), the storage rule-lookup walk (next stream),
 * prototype instantiation (Card layer), permission checks (rules stream).
 */

export {
  PATTERN_TABLE,
  findPattern,
  patternCodes,
  patternIds,
  groupedCodes,
  reloadableCodes,
  SELF_PATTERN_CODE,
  type PatternSpec,
} from "./set-patterns/registry.js";

export { PatternInstance } from "./set-patterns/instance.js";

export {
  concretePatternsForCard,
  patternsForCard,
  setNamesForCard,
  ruleLookupKeysForCard,
  safeSetKeysForCard,
  typeAssigningModuleKeys,
} from "./set-patterns/card-patterns.js";

export {
  parseSetName,
  labelForParsedSet,
  uncapitalizedLabelForParsedSet,
  compoundOnlyForParsedSet,
  ruleCacheKeyBaseForParsedSet,
  type ParsedSetName,
} from "./set-patterns/set-name.js";

export {
  ruleName,
  ruleNamesForCard,
  settingCardNameForCode,
  ruleCacheKey,
  ruleCacheKeyFromRow,
  preferenceCacheKeys,
  ruleClassName,
  ruleSetCardName,
  ruleSettingCardName,
} from "./set-patterns/rule-names.js";

export {
  registerSetTypeAssignment,
  resetSetTypeAssignments,
  getSetTypeAssignment,
  findAssignedTypeName,
  resolveAssignedTypeId,
  resolveAssignedTypeIdForCard,
  listAssignedTypeNamesForCard,
  type SetTypeAssignment,
  type AssignedTypeCardInput,
  type AssignedTypeName,
} from "./set-patterns/set-type-assignment.js";

export type { PatternCardInput, PrototypeArgs } from "./set-patterns/types.js";
