/**
 * The ordered set-pattern table - TypeScript port of the pattern registry in
 * card-1.110.0.
 *
 * REGISTRATION MECHANISM (why the lookup order is what it is):
 *
 * Each pattern lives in a numbered file mod/core/set_pattern/NN_code.rb
 * (01_all .. 09_self). The SetPatternLoader (lib/cardio/mod/loader/
 * set_pattern_loader.rb + module template postamble) wraps each file as
 * `class Card::Set::<Camel> < Card::Set::Pattern::Base ... register
 * "<code>".underscore.to_sym, (options || {})`. Loader#parts_from_path strips
 * the `NN_` prefix for the code, and each_file_in_dir loads files in sorted
 * order - so files load 01..09.
 *
 * register (lib/card/set/pattern/class_methods.rb#register) does
 * `Pattern.concrete.insert opts.delete(:index).to_i, self`. No core pattern
 * passes :index, so nil.to_i = 0 and every registration FRONT-INSERTS. The
 * concrete table therefore ends up in REVERSE file order:
 *
 *   [self, type_plus_right, right, rule, rstar, star, type, all_plus, all]
 *
 * This is the lookup/precedence order: rule lookups and set-module inclusion
 * walk most-specific-first. Verified against a running deck (decko 0.20.0),
 * whose concrete codes are exactly the list above, with deck-specific card
 * ids [27, 25, 26, 24, 23, 22, 21, 20, 7].
 *
 * Only card-1.110.0's core mod ships set_pattern files; none of the installed
 * card-mod-* gems add one (checked: no set_pattern dirs in the gems).
 */

import { DeckoName } from "../name.js";
import {
  allLabel,
  allPlusLabel,
  allPlusShortLabel,
  allShortLabel,
  rightGenericLabel,
  rightLabel,
  rightShortLabel,
  ruleLabel,
  ruleShortLabel,
  rstarLabel,
  rstarShortLabel,
  selfGenericLabel,
  selfLabel,
  selfShortLabel,
  starLabel,
  starShortLabel,
  typeGenericLabel,
  typeLabel,
  typePlusRightGenericLabel,
  typePlusRightLabel,
  typePlusRightShortLabel,
  typeShortLabel,
} from "./labels.js";
import type { PatternCardInput, PrototypeArgs } from "./types.js";

/**
 * One registered pattern (the class side: Card::Set::Pattern::ClassMethods
 * state + the methods defined in the pattern's own file).
 */
export interface PatternSpec {
  /** position in the FILE load order, 1..9 (the NN_ filename prefix). */
  readonly loadIndex: number;

  /** the file whose SetPatternLoader template registers this pattern. */
  readonly registerSite: string;

  /** pattern code = codename of the pattern card, e.g. "type plus right". */
  readonly code: string;

  /** canonical pattern card name (codename registry maps code <-> "*"+code). */
  readonly patternCardName: string;

  /** @@options compound_only - ClassMethods#compound_only?. */
  readonly compoundOnly: boolean;

  /** @@options assigns_type. */
  readonly assignsType: boolean;

  /**
   * @@options anchor_parts_count for multi-part anchors (only *type plus
   * right sets it: 2). *self overrides the class method dynamically.
   */
  readonly staticAnchorPartsCount: number;

  /**
   * pattern_applies? - the per-file override when present, otherwise the
   * ClassMethods default `compound_only? ? card.name.compound? : true`
   * (lib/card/set/pattern/class_methods.rb#pattern_applies?).
   */
  applies(card: PatternCardInput): boolean;

  /**
   * anchor_name override. undefined mirrors "no anchor_name method", which
   * register() turns into anchorless (ClassMethods#register:
   * `self.anchorless = !respond_to?(:anchor_name)`).
   */
  anchorName?(card: PatternCardInput): string | undefined;

  /**
   * anchor_id override. *type returns the type id, *self the card id;
   * patterns without it fall back to anchor_name.card_id
   * (pattern/base.rb#find_anchor_id: `self.class.try(:anchor_id, card) ||
   * @anchor_name.card_id`).
   */
  anchorId?(card: PatternCardInput): number | null | undefined;

  /**
   * *self only: dynamic anchor_parts_count
   * (09_self.rb#anchor_parts_count: anchor part count, || 1).
   */
  anchorPartsCountFor?(anchorName: string | undefined): number;

  /** label(anchor) - set/type/set.rb#label passes the anchor name. */
  label(anchor: string | undefined): string;

  /** short_label(anchor). */
  shortLabel(anchor: string | undefined): string;

  /** generic_label - per-file override or `label nil` fallback. */
  genericLabel(): string;

  /** prototype_args(anchor) - mod/core/set_pattern/NN.rb#prototype_args. */
  prototypeArgs(anchor: string | undefined): PrototypeArgs;
}

/** ClassMethods#pattern_applies? default (class_methods.rb). */
function defaultApplies(compoundOnly: boolean, card: PatternCardInput): boolean {
  return compoundOnly ? DeckoName.parse(card.name).isCompound : true;
}

function nameOf(card: PatternCardInput): DeckoName {
  return DeckoName.parse(card.name);
}

/** `label nil` fallback for patterns without a generic_label override. */
function labelAsGeneric(
  label: (anchor: string | undefined) => string,
): () => string {
  return () => label(undefined);
}

/**
 * The concrete pattern table in LOOKUP order (reversed load order; see the
 * registration mechanism note above). Frozen: mod-supplied patterns
 * extend via a register hook, not by mutating this table.
 */
export const PATTERN_TABLE: readonly PatternSpec[] = Object.freeze([
  {
    loadIndex: 9,
    registerSite: "card-1.110.0 mod/core/set_pattern/09_self.rb",
    code: "self",
    patternCardName: "*self",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 1,
    applies: () => true, // no override, not compound_only
    anchorName: (card) => nameOf(card).s, // 09_self.rb#anchor_name: card.name
    anchorId: (card) => card.id ?? null, // 09_self.rb#anchor_id: card.id
    // 09_self.rb#anchor_parts_count: anchor_name&.part_names&.size || 1
    anchorPartsCountFor: (anchorName) =>
      anchorName === undefined
        ? 1
        : DeckoName.parse(anchorName).partNames.length || 1,
    label: (anchor) => `The card "${anchor}"`,
    shortLabel: (anchor) => anchor ?? "",
    genericLabel: () => "a single card",
    prototypeArgs: (anchor) => ({ name: anchor ?? "" }), // 09_self.rb: { name: anchor }
  },
  {
    loadIndex: 8,
    registerSite: "card-1.110.0 mod/core/set_pattern/08_type_plus_right.rb",
    code: "type_plus_right",
    patternCardName: "*type plus right",
    compoundOnly: true,
    assignsType: true,
    staticAnchorPartsCount: 2,
    applies: (card) => defaultApplies(true, card),
    // 08_type_plus_right.rb#anchor_name: "#{left_type(card)}+#{card.name.tag}"
    // left_type: card.superleft&.type_name || quick_type(left_name); quick_type
    // yields "RichText" for blank AND unknown names (new-card default type),
    // so a new "<x>+field" card anchors "RichText+field".
    anchorName: (card) => {
      const leftType =
        card.leftTypeName == null
          ? "RichText"
          : DeckoName.parse(card.leftTypeName).s;
      return `${leftType}+${nameOf(card).tag}`;
    },
    label: typePlusRightLabel,
    shortLabel: typePlusRightShortLabel,
    genericLabel: typePlusRightGenericLabel,
    prototypeArgs: (anchor) => {
      // 08_type_plus_right.rb#prototype_args: name "+#{anchor.tag}",
      // supercard: Card.new(name: "*dummy", type: anchor.trunk_name)
      const anchorName = anchor ?? "";
      const joint = anchorName.lastIndexOf("+");
      return {
        name: `+${joint < 0 ? anchorName : anchorName.slice(joint + 1)}`,
        supercard: {
          name: "*dummy",
          type: joint < 0 ? "" : anchorName.slice(0, joint),
        },
      };
    },
  },
  {
    loadIndex: 7,
    registerSite: "card-1.110.0 mod/core/set_pattern/07_right.rb",
    code: "right",
    patternCardName: "*right",
    compoundOnly: true,
    assignsType: true,
    staticAnchorPartsCount: 1,
    applies: (card) => defaultApplies(true, card),
    // 07_right.rb#anchor_name: card.name.tag
    anchorName: (card) => nameOf(card).tag,
    label: rightLabel,
    shortLabel: rightShortLabel,
    genericLabel: rightGenericLabel,
    prototypeArgs: (anchor) => ({ name: `*dummy+${anchor ?? ""}` }),
  },
  {
    loadIndex: 6,
    registerSite: "card-1.110.0 mod/core/set_pattern/06_rule.rb",
    code: "rule",
    patternCardName: "*rule",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 06_rule.rb#pattern_applies?: card.rule?
    applies: (card) => card.isRule === true,
    label: ruleLabel,
    shortLabel: ruleShortLabel,
    genericLabel: labelAsGeneric(ruleLabel),
    prototypeArgs: () => ({ name: "*all+*create" }),
  },
  {
    loadIndex: 5,
    registerSite: "card-1.110.0 mod/core/set_pattern/05_rstar.rb",
    code: "rstar",
    patternCardName: "*rstar",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 05_rstar.rb#pattern_applies?: card.name.rstar?
    applies: (card) => nameOf(card).isRStar,
    label: rstarLabel,
    shortLabel: rstarShortLabel,
    genericLabel: labelAsGeneric(rstarLabel),
    prototypeArgs: () => ({ name: "*dummy+*dummy" }),
  },
  {
    loadIndex: 4,
    registerSite: "card-1.110.0 mod/core/set_pattern/04_star.rb",
    code: "star",
    patternCardName: "*star",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 0,
    // 04_star.rb#pattern_applies?: card.name.star?
    applies: (card) => nameOf(card).isStar,
    label: starLabel,
    shortLabel: starShortLabel,
    genericLabel: labelAsGeneric(starLabel),
    prototypeArgs: () => ({ name: "*dummy" }),
  },
  {
    loadIndex: 3,
    registerSite: "card-1.110.0 mod/core/set_pattern/03_type.rb",
    code: "type",
    patternCardName: "*type",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 1,
    // 03_type.rb#pattern_applies?: !!card.type_id
    applies: (card) => card.typeId != null,
    // 03_type.rb#anchor_name: card.type_name
    anchorName: (card) =>
      card.typeName == null ? undefined : DeckoName.parse(card.typeName).s,
    // 03_type.rb#anchor_id: card.type_id
    anchorId: (card) => card.typeId ?? null,
    label: typeLabel,
    shortLabel: typeShortLabel,
    genericLabel: typeGenericLabel,
    prototypeArgs: (anchor) => ({ type: anchor ?? "" }),
  },
  {
    loadIndex: 2,
    registerSite: "card-1.110.0 mod/core/set_pattern/02_all_plus.rb",
    code: "all_plus",
    patternCardName: "*all plus",
    compoundOnly: true,
    assignsType: false,
    staticAnchorPartsCount: 0,
    applies: (card) => defaultApplies(true, card),
    label: allPlusLabel,
    shortLabel: allPlusShortLabel,
    genericLabel: labelAsGeneric(allPlusLabel),
    prototypeArgs: () => ({ name: "+" }),
  },
  {
    loadIndex: 1,
    registerSite: "card-1.110.0 mod/core/set_pattern/01_all.rb",
    code: "all",
    patternCardName: "*all",
    compoundOnly: false,
    assignsType: false,
    staticAnchorPartsCount: 0,
    applies: () => true,
    label: allLabel,
    shortLabel: allShortLabel,
    genericLabel: labelAsGeneric(allLabel),
    prototypeArgs: () => ({}),
  },
]);

/**
 * The *self pattern is ANCHORED but has a dynamic anchor_parts_count (the
 * only spec carrying anchorPartsCountFor). Its code, for callers that need
 * to special-case it (Ruby: `pattern_code == :self` branches, e.g.
 * lib/card/set/helpers.rb#shortname).
 */
export const SELF_PATTERN_CODE = "self";

/** Pattern.find (lib/card/set/pattern.rb#find): class with that pattern_code. */
export function findPattern(patternCode: string): PatternSpec | undefined {
  return PATTERN_TABLE.find((spec) => spec.code === patternCode);
}

/** Pattern.codes: the concrete pattern codes, in lookup order. */
export function patternCodes(): string[] {
  return PATTERN_TABLE.map((spec) => spec.code);
}

/**
 * Pattern.ids (lib/card/set/pattern.rb#ids): `concrete.map(&:pattern_id)`
 * where pattern_id = pattern_code.card_id - the pattern CARD's id, resolved
 * through the codename registry (ClassMethods#pattern_id:
 * `pattern_code.card_id`). Deck-specific: on one measured deck self=27,
 * type_plus_right=25, right=26, rule=24, rstar=23, star=22, type=21,
 * all_plus=20, all=7). Codes without a registered id yield undefined.
 */
export function patternIds(
  codenameId: (code: string) => number | undefined,
): (number | undefined)[] {
  return PATTERN_TABLE.map((spec) => codenameId(spec.code));
}

/**
 * Pattern.grouped_codes (lib/card/set/pattern.rb#grouped_codes): codes in
 * LOAD order, grouped as [:all], [:abstract], then the nonbase codes
 * reversed (lookup order reversed = load order):
 *   [["all"], ["abstract"], ["all_plus", "type", "star", "rstar", "rule",
 *    "right", "type_plus_right", "self"]]
 */
export function groupedCodes(withAll = true): string[][] {
  const nonbase = patternCodes()
    .filter((code) => code !== "all")
    .reverse();
  const groups: string[][] = [["abstract"], nonbase];
  if (withAll) groups.unshift(["all"]);
  return groups;
}

/**
 * Pattern.reloadables (lib/card/set/pattern.rb#reloadables):
 * `concrete - [Set::All] + Abstract` - the lookup-ordered table minus All,
 * with the abstract pseudo-pattern appended last.
 *
 * The All "pattern" class (Card::Set::All) is also the all-cards SET module
 * - the SetPatternLoader creates Card::Set::All from 01_all.rb and the
 * SetLoader then loads mod/core/set/all/*.rb INTO the same constant. That
 * duality has no behavioral surface in the registry table itself; it only
 * explains why reloadables subtracts it.
 */
export function reloadableCodes(): string[] {
  return [...patternCodes().filter((code) => code !== "all"), "abstract"];
}
