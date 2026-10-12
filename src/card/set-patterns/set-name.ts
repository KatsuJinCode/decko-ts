/**
 * Set card name -> pattern + anchor (the reverse mapping) - port of the
 * Set-type card methods in card-mod-rules-0.20.0 set/type/set.rb:
 * #anchor_name, #pattern_name, #pattern, #subclass_for_set, plus the label /
 * compound_only? / prototype accessors that dispatch through it.
 *
 * Storage shape: a set card is either the pattern card itself (anchorless,
 * e.g. "*all", "*star") or "anchor+*pattern-card" (e.g. "RichText+*type",
 * "RichText+child_one+*type plus right", "<junction>+*self"). The
 * pattern is identified by the TAG CARD's codename; the anchor is the trunk.
 */

import { DeckoName, type Nameish } from "../name.js";
import { getNameEnvironment } from "../name/environment.js";
import { findPattern, type PatternSpec } from "./registry.js";

export interface ParsedSetName {
  /** the set card name, string form. */
  readonly setName: string;

  /** true when the input was a compound name (anchored set shape). */
  readonly anchored: boolean;

  /**
   * set/type/set.rb#pattern_name: the tag for compound sets, the name itself
   * for anchorless sets ("*all" -> "*all").
   */
  readonly patternCardName: DeckoName;

  /**
   * set/type/set.rb#anchor_name: the trunk for compound sets, null for
   * anchorless ones ("*all" -> null).
   */
  readonly anchorName: DeckoName | null;

  /**
   * set/type/set.rb#subclass_for_set resolves the pattern CODE from
   * `pattern.codename` (the tag card's codename) and finds the concrete
   * pattern by it. null when no codename registry resolves the tag.
   */
  readonly patternCode: string | null;

  /** matched registry entry; undefined when the code is not registered. */
  readonly spec: PatternSpec | undefined;
}

/**
 * Parse a set card name into pattern + anchor.
 *
 * The codename comes from the name environment's codename registry (Ruby:
 * Card::Codename via the card's id). Without any environment installed the
 * code resolves null and no spec matches - tests install the registry.
 */
export function parseSetName(input: Nameish): ParsedSetName {
  const setName = DeckoName.parse(input);
  const anchored = setName.isCompound;
  // set/type/set.rb#pattern: `tag` (Card#tag -> name.tag); for simple names
  // the tag is the name itself.
  const patternCardName = setName.tagName;
  // set/type/set.rb#anchor_name: `name.left_name`; simple -> nil.
  const anchorName = anchored ? (setName.leftName ?? null) : null;

  let patternCode: string | null = null;
  const codename = patternCardName.codename;
  if (codename !== undefined) {
    patternCode = codename;
  } else {
    // Card::Codename maps id <-> codename; with no registry the canonical
    // pattern-card convention (codename == name minus star) is the only
    // derivable answer, but the port does NOT guess: null, like Ruby with a
    // tag card that has no codename.
    patternCode = null;
  }

  const spec = patternCode === null ? undefined : findPattern(patternCode);
  return {
    setName: setName.s,
    anchored,
    patternCardName,
    anchorName,
    patternCode,
    spec,
  };
}

/**
 * set/type/set.rb#label: `klass ? klass.label(anchor_name) : ""` - empty
 * string when the pattern is not registered; the label receives the anchor
 * name (nil for anchorless sets).
 */
export function labelForParsedSet(parsed: ParsedSetName): string {
  return parsed.spec
    ? parsed.spec.label(parsed.anchorName?.s)
    : "";
}

/**
 * set/type/set.rb#uncapitalized_label. Reproduces the Ruby method's
 * observable behavior verbatim: the method always returns "".
 *
 * Why (the source's own bug, confirmed on a running deck for both the
 * all-set and the type-plus-right-set paths, where
 * .uncapitalized_label == "" despite label() returning real strings):
 * `label = label.to_s` introduces a local `label` at PARSE time, so the
 * RHS `label` reads the fresh nil local, not the method. nil.to_s -> "",
 * `label[0]` is falsy -> `return label` -> "". The method is dead code in
 * card-mod-rules 0.20.0.
 */
export function uncapitalizedLabelForParsedSet(_parsed: ParsedSetName): string {
  return "";
}

/**
 * set/type/set.rb#compound_only?: `@compound_only.nil? ? (@compound_only =
 * subclass_for_set.compound_only) : @compound_only`. Raises NoMethodError in
 * Ruby when the tag has no registered pattern (subclass_for_set nil); the
 * port returns null for that case and true/false otherwise (Ruby nil means
 * the @@options flag was never set - falsy).
 */
export function compoundOnlyForParsedSet(
  parsed: ParsedSetName,
): boolean | null {
  if (!parsed.spec) return null;
  return parsed.spec.compoundOnly;
}

/**
 * set/type/set.rb#rule_cache_key_base: the set card's contribution to rule
 * cache keys - "#{left.id}+#{Codename[right.id]}" for compound sets,
 * "Codename[id]" for anchorless ones. Needs the lexicon and codename
 * registry; undefined when the ids are unknown.
 */
export function ruleCacheKeyBaseForParsedSet(
  parsed: ParsedSetName,
): string | undefined {
  const env = getNameEnvironment();
  const setName = DeckoName.parse(parsed.setName);
  if (setName.isCompound) {
    const leftId = setName.leftName?.cardId;
    const rightId = setName.rightName?.cardId;
    const rightCode =
      rightId === undefined ? undefined : env?.codename?.nameForId(rightId);
    if (leftId === undefined || rightCode === undefined) return undefined;
    return `${leftId}+${rightCode}`;
  }
  const id = setName.cardId;
  if (id === undefined) return undefined;
  return env?.codename?.nameForId(id);
}
