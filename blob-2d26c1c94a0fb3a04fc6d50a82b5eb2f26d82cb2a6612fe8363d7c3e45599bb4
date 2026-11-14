// Public surface for the rule evaluation engine. Re-exports the lookup
// primitives so callers can `import { findRule } from "./rules/index.js"`.

export { findRule, findRules, ruleCacheKey, nameAsPatternCardInput } from "./lookup.js";
export type { RuleLookupResult } from "./lookup.js";

// the codename-form rule lookup cache (lib/card/rule/cache.rb)
export {
  ruleCacheStatement,
  buildRuleLookupHash,
  ruleIdLookup,
} from "./rule-cache.js";
export type { RuleCacheRow } from "./rule-cache.js";

// structured content: the *structure rule template mechanism
// (content/all.rb#content — structured_content || standard_content)
export {
  STRUCTURE_SETTING_NAME,
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  structuredCardContent,
  templateReferenceNames,
} from "./structure.js";
export type { StructuredContentResult } from "./structure.js";
