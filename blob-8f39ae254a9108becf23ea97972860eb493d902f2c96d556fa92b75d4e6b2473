/**
 * Input shapes for the set-pattern registry.
 *
 * Ruby pattern methods (`pattern_applies?`, `anchor_name`, `anchor_id`) run on
 * Card instances and read type/id/rule state off the database. The registry
 * port takes that state as plain data (`PatternCardInput`) so the registry
 * works without storage; the card fetch layer (src/card/fetch) supplies the
 * fields for real cards.
 */

import type { Nameish } from "../name.js";

/**
 * The card state the pattern machinery reads (the subset of Card that
 * Set::Pattern::Base#initialize and the per-pattern files touch).
 */
export interface PatternCardInput {
  /** the card's name (the only field every pattern needs). */
  name: Nameish;

  /** Card#id - undefined/null for cards that are not in the database. */
  id?: number | null;

  /** Card#new_card? - new cards skip the first concrete pattern (pattern/all.rb#patterns). */
  isNew?: boolean;

  /** Card#type_id - required by the *type pattern (applies? + anchor id). */
  typeId?: number | null;

  /** Card#type_name - anchor NAME for the *type pattern. */
  typeName?: Nameish | null;

  /**
   * Card#superleft&.type_name - left-type for the *type plus right anchor.
   * When absent, the quick_type default applies ("RichText"; see
   * mod/core/set_pattern/08_type_plus_right.rb#left_type - unknown names fetch
   * as new cards, whose default type is RichText).
   */
  leftTypeName?: Nameish | null;

  /**
   * Card#rule? - needed by the *rule pattern. Ruby derives it from storage
   * (lib/card/rule/all.rb#rule?: standard_rule? || preference?, which resolve
   * the types of the name parts); callers with a rule? answer pass it here.
   */
  isRule?: boolean;
}

/**
 * Set::Pattern prototype_args (mod/core/set_pattern/*.rb#prototype_args):
 * the spec from which a set's prototype member card is built. The Card layer
 * that instantiates prototypes is deferred; the args themselves are registry
 * data.
 */
export interface PrototypeArgs {
  /** name for the prototype card (may be relative, e.g. "+" or "+field"). */
  name?: string;

  /** type for the prototype card (type name; the *type pattern uses the anchor). */
  type?: string;

  /** supercard spec (only *type plus right sets one). */
  supercard?: {
    name: string;
    type?: string;
  };
}
