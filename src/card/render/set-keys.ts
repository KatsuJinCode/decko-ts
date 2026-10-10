// Set-pattern CSS keys for the slot class attribute: the render-side adapter
// to the set-pattern registry (src/card/set-patterns - the oracle-verified
// port of Card::Set::Pattern). This file owns the RENDER-side input contract
// (SetKeysInput, what a fetched record can supply) and delegates the
// derivation to safeSetKeysForCard; the pattern table itself is NOT
// duplicated here.
//
// Ruby truth (card-1.110.0):
// - lib/card/set/pattern/all.rb:40-42 #safe_set_keys:
//     `patterns.map(&:safe_key).reverse * " "`
// - lib/card/set/pattern/base.rb:70-73 #safe_key:
//     `caps_part = pattern_code.to_s.tr(" ", "_").upcase;
//      anchorless? ? caps_part : "#{caps_part}-#{@anchor_name.safe_key}"`
// - lib/card/set/pattern/class_methods.rb:16 #register:
//     `self.anchorless = !respond_to?(:anchor_name)` - a pattern is
//     anchorless exactly when its mod/core/set_pattern/NN_*.rb file defines
//     no anchor_name. star (04), rstar (05) and rule (06) define none, so
//     their class fragments are the BARE caps codes ("STAR", "RSTAR",
//     "RULE") - never "STAR-<anchor>" (oracle-verified in
//     src/card/set-patterns/instance.ts: the captured
//     safe_set_keys of "*all+*read" is "ALL ALL_PLUS TYPE-list RSTAR RULE
//     RIGHT-Xread TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread").
// - applies?: 04_star.rb card.name.star? (lib/card/name.rb:115);
//   05_rstar.rb card.name.rstar? + compound_only (name.rb:119);
//   06_rule.rb card.rule? (lib/card/rule/all.rb:33 - standard_rule? ||
//   preference?, which resolve the TYPES of the name parts through
//   storage); 03_type.rb !!card.type_id; 07/08/02 compound_only default
//   (lib/card/set/pattern/class_methods.rb:37-39).

import { safeSetKeysForCard } from "../set-patterns/card-patterns.js";
import type { DeckoName } from "../name.js";

/** The pattern attributes a card record exposes for key computation. */
export interface SetKeysInput {
  name: DeckoName;
  typeId: number | undefined;
  /** The card's own type NAME (03_type.rb#anchor_name: card.type_name). */
  typeName: string | undefined;
  /** The LEFT part's type NAME (08_type_plus_right.rb#anchor_name:
   *  `"#{left_type(card)}+#{card.name.tag}"`). undefined means the left
   *  card could not be fetched - Ruby's quick_type default then applies
   *  ("RichText"; lib/card/set/pattern/class_methods.rb:59-71, oracle:
   *  new "Zz Probe New+field" anchors "RichText+field"). */
  leftTypeName: string | undefined;
  /**
   * Card#rule? - the 06_rule.rb pattern_applies?. Ruby derives it from
   * storage (lib/card/rule/all.rb#rule?: the right part's type is Setting
   * and the left part's type is Set, or the preference shape). The render
   * enrichment (src/card/render.ts enrichAndStore) supplies it from the
   * memoized codename ids (ruleTypeIds); a compound card enriched before
   * those ids exist gets no RULE key here, and lands in the engine's
   * setKeysPendingRuleTypes set for the rule set-key repair (render.ts,
   * the render-entry pass) to re-derive once the ids have folded.
   */
  isRule?: boolean;
  /**
   * Card#new_card? — pattern/all.rb:40-42 (`patterns`): a NEW card's pattern
   * list drops the first concrete pattern (*self), so its safe_set_keys
   * carries NO SELF- token (oracle pins: the captured PCTS+legacy
   * closed-view slot reads "ALL ALL_PLUS TYPE-rich_text RIGHT-legacy
   * TYPE_PLUS_RIGHT-project-legacy", and every *all+*<setting> rule bar in
   * the page bytes reads "ALL ALL_PLUS TYPE-<t> RSTAR RULE RIGHT-<s>
   * TYPE_PLUS_RIGHT-set-<s>" — no SELF either way; both cards are new).
   * undefined/false keeps the SELF token (every stored row).
   */
  isNew?: boolean;
}

/**
 * safe_set_keys (pattern/all.rb:40-42): `patterns.map(&:safe_key).reverse * " "`.
 * Ruby's `patterns` list (Pattern.concrete) is most-specific-FIRST, so the
 * reversal emits least-specific-first (ALL ... SELF) - the registry walks
 * lookup order and reverses the same way.
 */
export function safeSetKeys(input: SetKeysInput): string {
  return safeSetKeysForCard({
    name: input.name.s,
    typeId: input.typeId,
    typeName: input.typeName,
    leftTypeName: input.leftTypeName,
    isRule: input.isRule,
    ...(input.isNew === true ? { isNew: true } : {}),
  });
}
