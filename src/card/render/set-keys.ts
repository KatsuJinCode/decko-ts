// Set-pattern CSS keys: TypeScript port of Card::Set::Pattern's safe_set_keys.
//
// Truth source (card-1.110.0, mod/core/set_pattern/01..09 + lib/card/set/pattern):
// - lib/card/set/pattern/all.rb#safe_set_keys: `patterns.map(&:safe_key).reverse * " "`
// - lib/card/set/pattern/base.rb#safe_key: `caps_part = pattern_code.to_s.tr(" ", "_").upcase;
//   anchorless? ? caps_part : "#{caps_part}-#{@anchor_name.safe_key}"`
// - pattern registration order (concrete_patterns): the set_pattern files
//   load in filename order: all, all_plus, type, star, rstar, rule, right,
//   type_plus_right, self. safe_set_keys REVERSES, so the SELF key comes first.
// - applies? rules: pattern_applies? per set_pattern file (04_star.rb:
//   card.name.star?; 05_rstar.rb: card.name.rstar? + compound_only; 02/06/07/08
//   compound_only; 03_type.rb: !!card.type_id).
//
// SCOPE NOTE: the dedicated set-patterns stream (src/card/set-patterns) owns
// the full registry; this file carries the rendering-side slice needed for
// slot classes. `rule` (06_rule.rb) is deliberately absent: pattern_applies?
// is card.rule?, a rules-wave predicate - a rule card's slot classes would
// miss the RULE- key (no fixture renders one; reconciliation note in
// docs/render-port-notes.md).

import { DeckoName } from "../name.js";

/** The pattern attributes a card record exposes for key computation. */
export interface SetKeysInput {
  name: DeckoName;
  typeId: number | undefined;
  /** The card's own type NAME (03_type.rb#anchor_name: card.type_name). */
  typeName: string | undefined;
  /** The LEFT part's type NAME (08_type_plus_right.rb#anchor_name:
   *  `"#{left_type(card)}+#{card.name.tag}"`); required for compound names. */
  leftTypeName: string | undefined;
}

interface PatternDef {
  code: string;
  anchorless: boolean;
  compoundOnly: boolean;
  applies: (input: SetKeysInput) => boolean;
  anchorKey: (input: SetKeysInput) => string | undefined;
}

/** mod/core/set_pattern/*.rb in load order. */
const PATTERNS: readonly PatternDef[] = [
  {
    code: "all",
    anchorless: true,
    compoundOnly: false,
    applies: () => true, // 01_all.rb: always
    anchorKey: () => undefined,
  },
  {
    code: "all_plus",
    anchorless: true,
    compoundOnly: true, // 02_all_plus.rb options
    applies: (i) => i.name.isCompound,
    anchorKey: () => undefined,
  },
  {
    code: "type",
    anchorless: false,
    compoundOnly: false,
    applies: (i) => i.typeId !== undefined, // 03_type.rb: !!card.type_id
    anchorKey: (i) =>
      i.typeName !== undefined ? DeckoName.parse(i.typeName).safeKey : undefined,
  },
  {
    code: "star",
    anchorless: false,
    compoundOnly: false,
    applies: (i) => i.name.isStar, // 04_star.rb: card.name.star?
    anchorKey: (i) => i.name.safeKey,
  },
  {
    code: "rstar",
    anchorless: false,
    compoundOnly: true,
    applies: (i) => i.name.isRStar, // 05_rstar.rb: card.name.rstar?
    anchorKey: (i) => i.name.safeKey,
  },
  // 06_rule.rb (rule) omitted - see module doc.
  {
    code: "right",
    anchorless: false,
    compoundOnly: true,
    applies: (i) => i.name.isCompound, // 07_right.rb: tag anchor
    anchorKey: (i) => (i.name.rightName !== undefined ? i.name.rightName.safeKey : undefined),
  },
  {
    code: "type_plus_right",
    anchorless: false,
    compoundOnly: true,
    applies: (i) => i.name.isCompound && i.leftTypeName !== undefined,
    anchorKey: (i) => {
      // 08_type_plus_right.rb#anchor_name: "#{left_type(card)}+#{card.name.tag}"
      if (i.leftTypeName === undefined || i.name.rightName === undefined) return undefined;
      return `${DeckoName.parse(i.leftTypeName).safeKey}-${i.name.rightName.safeKey}`;
    },
  },
  {
    code: "self",
    anchorless: false,
    compoundOnly: false,
    applies: () => true, // 09_self.rb: always
    anchorKey: (i) => i.name.safeKey,
  },
];

/**
 * safe_set_keys (pattern/all.rb:40-42): `patterns.map(&:safe_key).reverse * " "`.
 * Ruby's `patterns` list (Pattern.concrete) is most-specific-FIRST, so the
 * reversal emits least-specific-first (ALL ... SELF). The PATTERNS array
 * here is already in least-specific-first order (set_pattern file numbering),
 * so the list emits directly - the same bytes through the same transform
 * viewed from the other end.
 */
export function safeSetKeys(input: SetKeysInput): string {
  const keys: string[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.compoundOnly && !input.name.isCompound) continue;
    if (!pattern.applies(input)) continue;
    const caps = pattern.code.replace(/ /g, "_").toUpperCase(); // base.rb#safe_key
    if (pattern.anchorless) {
      keys.push(caps);
    } else {
      const anchor = pattern.anchorKey(input);
      if (anchor === undefined) continue;
      keys.push(`${caps}-${anchor}`);
    }
  }
  return keys.join(" ");
}
