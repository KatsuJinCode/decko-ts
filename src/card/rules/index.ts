// Public surface for the rule evaluation engine. Re-exports the lookup
// and application primitives so callers can `import { findRule,
// resolveViewOverride } from "./rules/index.js"`.

export { findRule, findRules, ruleCacheKey, nameAsPatternCardInput } from "./lookup.js";
export type { RuleLookupResult } from "./lookup.js";

export {
  parseViewOverride,
  applyViewOverride,
  resolveViewOverride,
} from "./apply.js";
export type { ViewOverride } from "./apply.js";
