/**
 * Per-card pattern queries - port of the Card-instance methods in
 * card-1.110.0 lib/card/set/pattern/all.rb (Set::Pattern::All):
 * concrete_patterns, patterns, set_names, rule_lookup_keys, safe_set_keys.
 *
 * These walk the concrete table in lookup order (registry.ts) and keep the
 * applying instances. New cards drop the FIRST concrete pattern
 * (pattern/all.rb#patterns: `new_card? ? concrete_patterns[1..] :
 * concrete_patterns`) - the first is always *self, which applies to every
 * card, so this is "new cards have no *self set".
 */

import type { PatternCardInput } from "./types.js";
import { PATTERN_TABLE } from "./registry.js";
import { PatternInstance } from "./instance.js";

/** Set::Pattern::All#concrete_patterns: applying instances, lookup order. */
export function concretePatternsForCard(
  card: PatternCardInput,
): PatternInstance[] {
  const instances: PatternInstance[] = [];
  for (const spec of PATTERN_TABLE) {
    const instance = PatternInstance.tryNew(spec, card);
    if (instance) instances.push(instance);
  }
  return instances;
}

/** Set::Pattern::All#patterns: concrete_patterns, minus the first for new cards. */
export function patternsForCard(card: PatternCardInput): PatternInstance[] {
  const concrete = concretePatternsForCard(card);
  return card.isNew ? concrete.slice(1) : concrete;
}

/** Set::Pattern::All#set_names (Base#to_s per instance). */
export function setNamesForCard(card: PatternCardInput): string[] {
  return patternsForCard(card).map((pattern) => pattern.setName);
}

/**
 * Set::Pattern::All#rule_lookup_keys: rule lookup keys per instance,
 * compacted (nil keys - anchored patterns whose anchor card has no id - are
 * dropped, Ruby: `patterns.map(&:rule_lookup_key).compact`).
 */
export function ruleLookupKeysForCard(card: PatternCardInput): string[] {
  return patternsForCard(card)
    .map((pattern) => pattern.ruleLookupKey)
    .filter((key): key is string => key !== null);
}

/**
 * Set::Pattern::All#safe_set_keys: `patterns.map(&:safe_key).reverse * " "` -
 * most-general first (e.g. "ALL TYPE-rich_text SELF-basic").
 */
export function safeSetKeysForCard(card: PatternCardInput): string {
  return patternsForCard(card)
    .map((pattern) => pattern.safeKey)
    .reverse()
    .join(" ");
}

/**
 * Set::Pattern::All#each_type_assigning_module_key: module keys of the
 * assigns_type patterns (*right, *type plus right) that resolve for this
 * card. Consumed by Ruby's type-assignment machinery for new field cards;
 * listed here so the next streams inherit the exact shape.
 */
export function typeAssigningModuleKeys(card: PatternCardInput): string[] {
  const keys: string[] = [];
  for (const pattern of patternsForCard(card)) {
    if (!pattern.assignsType) continue;
    const key = pattern.moduleKey;
    if (key !== null) keys.push(key);
  }
  return keys;
}
