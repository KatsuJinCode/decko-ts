/**
 * Pattern instance for one card - TypeScript port of
 * card-1.110.0 lib/card/set/pattern/base.rb (Set::Pattern::Base) plus the
 * instance behavior the per-pattern files add through anchor_name /
 * anchor_id overrides.
 *
 * A concrete pattern instance answers "which set(s) does THIS card belong to
 * for pattern P": its set name (Base#to_s), its rule lookup key
 * (Base#rule_lookup_key - the key the rule cache walks), its safe key
 * (Base#safe_key - CSS-class style identifier) and its module key
 * (Base#module_key - Ruby module namespace key, kept for parity).
 *
 * Class-level selection (`Pattern.concrete.map { |sub| sub.new self }.compact`
 * via ClassMethods#new returning nil when !pattern_applies?) lives in
 * card-patterns.ts#concretePatternsForCard.
 */

import { DeckoName } from "../name.js";
import { getNameEnvironment } from "../name/environment.js";
import type { PatternCardInput } from "./types.js";
import type { PatternSpec } from "./registry.js";

export class PatternInstance {
  /** the registered pattern this instance belongs to (the class side). */
  readonly spec: PatternSpec;

  private readonly card: PatternCardInput;

  /** @anchor_name (Base#initialize); undefined for anchorless patterns. */
  private readonly anchor: DeckoName | undefined;

  /** @anchor_id (Base#find_anchor_id), computed on first use: the render
   *  path reads only set names, and the anchor id is a lexicon lookup. The
   *  one reader (ruleLookupKey, via ruleLookupKeysForCard) reads it in the
   *  same synchronous step that builds the instance, and the lookup is a
   *  pure cache read, so deferring it never changes its answer. */
  private anchorIdMemo: { value: number | null | undefined } | undefined;

  private get anchorIdValue(): number | null | undefined {
    if (this.anchorIdMemo === undefined) {
      // Base#find_anchor_id: `self.class.try(:anchor_id, card) ||
      // @anchor_name.card_id` - the || also fires when the override returns
      // nil (e.g. *self on a new card, whose id is nil).
      this.anchorIdMemo = {
        value:
          this.spec.anchorName === undefined
            ? undefined
            : this.spec.anchorId?.(this.card) || this.anchor?.cardId || undefined,
      };
    }
    return this.anchorIdMemo.value;
  }

  private constructor(spec: PatternSpec, card: PatternCardInput) {
    this.spec = spec;
    this.card = card;
    // Base#initialize: `return if anchorless?` - anchorless instances carry
    // no anchor state at all.
    if (spec.anchorName === undefined) {
      this.anchor = undefined;
      return;
    }
    const anchorString = spec.anchorName(card);
    // nil.to_name is the empty name in Ruby (e.g. *type on an inconsistent
    // card with type_id but no type_name -> set name "+*type").
    this.anchor = DeckoName.parse(anchorString ?? "");
  }

  /**
   * ClassMethods#new: `super if pattern_applies? card` - an unapplying
   * pattern yields nil, which the caller's compact drops.
   */
  static tryNew(
    spec: PatternSpec,
    card: PatternCardInput,
  ): PatternInstance | null {
    return spec.applies(card) ? new PatternInstance(spec, card) : null;
  }

  /** the pattern code (Base delegate :pattern_code, to: :class). */
  get patternCode(): string {
    return this.spec.code;
  }

  /**
   * Base#pattern (`pattern_id.cardname`): the pattern CARD's name. Ruby
   * resolves the id through the codename registry and the name back through
   * the lexicon (config/initializers/01_core_extensions/integer.rb#cardname
   * -> Card::Lexicon.name). Without a lexicon hit the canonical "*"+code
   * name applies (codename -> name is deterministic for pattern cards).
   */
  get patternCardName(): string {
    const env = getNameEnvironment();
    const id = env?.codename?.id(this.spec.code);
    if (id !== undefined) {
      const lexName = env?.lexicon?.name(id);
      if (lexName !== undefined) return lexName;
    }
    return this.spec.patternCardName;
  }

  /** @anchor_name (Base); undefined for anchorless patterns. */
  get anchorName(): DeckoName | undefined {
    return this.anchor;
  }

  /** @anchor_id (Base#find_anchor_id); undefined for anchorless patterns. */
  get anchorId(): number | undefined {
    return this.anchorIdValue ?? undefined;
  }

  /** compound_only? (Base delegate). */
  get compoundOnly(): boolean {
    return this.spec.compoundOnly;
  }

  /** assigns_type (Base delegate). */
  get assignsType(): boolean {
    return this.spec.assignsType;
  }

  /** anchorless? (Base delegate): true when the pattern defines no anchor_name. */
  get anchorless(): boolean {
    return this.spec.anchorName === undefined;
  }

  /**
   * Base#anchor_parts_count: `self.class.anchor_parts_count @anchor_name`.
   * Class default is the static option (0 anchorless, 1 anchored, 2 for
   * *type plus right); *self overrides with the anchor's part count.
   */
  get anchorPartsCount(): number {
    if (this.spec.anchorPartsCountFor) {
      return this.spec.anchorPartsCountFor(this.anchor?.s);
    }
    return this.spec.staticAnchorPartsCount;
  }

  /**
   * Base#anchor_parts. For counts > 1 with a longer anchor: the head is the
   * first (size - count + 1) parts joined, the tail the last (count - 1)
   * parts - "handles cases where anchor is a compound card, eg A+B+*self".
   * Anchorless instances return [] (Ruby returns [nil]; no caller reaches
   * it - anchor_codenames short-circuits for anchorless).
   */
  get anchorParts(): readonly DeckoName[] {
    if (!this.anchor) return [];
    const count = this.anchorPartsCount;
    if (count <= 1) return [this.anchor];
    const parts = this.anchor.partNames;
    if (parts.length <= count) return parts;
    return [
      this.anchor.getRange(0, -count),
      ...parts.slice(parts.length - count + 1),
    ];
  }

  /**
   * Base#anchor_codenames: every anchor part must resolve to a codename,
   * else nil (Ruby's `map { ... || break }` collapses to nil on the first
   * missing codename - all-or-nothing).
   */
  get anchorCodenames(): readonly string[] | null {
    if (!this.anchor) return null;
    const codes: string[] = [];
    for (const part of this.anchorParts) {
      const code = part.codename;
      if (code === undefined) return null;
      codes.push(code);
    }
    return codes;
  }

  /**
   * Base#module_key: anchorless -> camelize(code); anchored ->
   * camelize(code + anchor codenames) joined by "::", nil when any anchor
   * part lacks a codename.
   */
  get moduleKey(): string | null {
    if (this.anchorless) return camelize(this.spec.code);
    const codes = this.anchorCodenames;
    if (codes === null) return null;
    return [this.spec.code, ...codes].map(camelize).join("::");
  }

  /**
   * Base#to_s: the SET NAME - just the pattern card for anchorless patterns,
   * "anchor+*pattern" for anchored ones.
   */
  get setName(): string {
    const pattern = this.patternCardName;
    return this.anchorless ? pattern : `${this.anchor?.s}+${pattern}`;
  }

  /**
   * Base#safe_key: "TYPE_PLUS_RIGHT-rich_text-child_one" style - pattern
   * code uppercased with spaces to underscores, joined to the anchor's
   * safe_key ("*" -> "X", "+" -> "-") with a dash. For the card
   * "*all+*read" the emitted safe_set_keys is "ALL ALL_PLUS TYPE-list
   * RSTAR RULE RIGHT-Xread TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread".
   */
  get safeKey(): string {
    const capsPart = this.spec.code.replaceAll(" ", "_").toUpperCase();
    return this.anchorless
      ? capsPart
      : `${capsPart}-${this.anchor?.safeKey}`;
  }

  /**
   * Base#rule_lookup_key: the key Card::Rule::All#rule_id_lookup walks
   * (lib/card/rule/all.rb). Anchorless -> the bare code ("all", "star");
   * anchored -> "<anchor id>+<code>" ("605+self", "2+type"); nil when the
   * anchor card has no id (not in the database) - those keys are compacted
   * away, so rules on sets whose anchor card does not exist are unreachable
   * (a new "<x>+field" card lists the *right and *type
   * plus right SET names but their lookup keys are nil).
   */
  get ruleLookupKey(): string | null {
    if (this.anchorless) return this.spec.code;
    if (this.anchorIdValue) return `${this.anchorIdValue}+${this.spec.code}`;
    return null;
  }

  /** the card this instance was computed for. */
  get cardInput(): PatternCardInput {
    return this.card;
  }

  /** Base#inspect. */
  inspect(): string {
    return `<${this.constructor.name} ${this.setName}>`;
  }
}

/** Ruby String#camelize for codenames: "type_plus_right" -> "TypePlusRight". */
function camelize(code: string): string {
  return code
    .split("_")
    .map((word) =>
      word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
}

/**
 * Base#module_key's exact join in driver-backed form: the anchor codenames
 * arrive already resolved through the ASYNC db-backed registries
 * (set-type-assignment.ts anchorCodenameDriverBacked - Lexicon card_id +
 * Codename[i2c], the same data Base#anchor_codenames reads in Ruby through
 * the db), not through the sync name-environment peeks the #moduleKey
 * getter reads. Anchorless specs take the bare camelize(code) arm exactly
 * like #moduleKey (base.rb:59-67 module_key's anchorless branch).
 */
export function moduleKeyFromAnchorCodenames(
  spec: PatternSpec,
  anchorCodenames: readonly string[],
): string {
  return [spec.code, ...anchorCodenames].map(camelize).join("::");
}
