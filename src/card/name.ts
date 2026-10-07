/**
 * Decko card name algebra - TypeScript port of:
 *   - cardname 0.20.0 (the Cardname class: lib/cardname.rb and lib/cardname/*.rb)
 *   - card-1.110.0 lib/card/name.rb (the Card::Name subclass: constructor mark
 *     handling, star predicates) and lib/card/name/name_variants.rb (vary,
 *     standard, codename)
 *
 * The Ruby class hierarchy (Card::Name < Cardname) is collapsed into one
 * immutable class, `DeckoName`. Names are value objects: two names are equal
 * (`equals`) if and only if their canonical keys are equal, and instances are
 * deduplicated through a process-wide cache keyed by the raw string, matching
 * Cardname's class-level cache (cardname lib/cardname/class_methods.rb#new).
 *
 * Ruby mutators are ported as pure functions returning new names (documented
 * per method); Ruby's in-place String mutation surface ([]=, <<, replace) has
 * no equivalent here.
 */

import {
  onDeckInflectionsChanged,
  pluralize,
  regexpQuote,
  rubyCapitalize,
  rubySucc,
  singularize,
  titleize,
  underscore,
} from "./name/inflect.js";
import { decodeHtmlEntities } from "./name/entities.js";
import {
  CodenameNotFoundError,
  NameNotFoundError,
  UnsupportedIdentifierError,
} from "./name/errors.js";
import { getNameEnvironment } from "./name/environment.js";

/** Any value the Ruby name layer would call to_name on. */
export type Nameish = DeckoName | string | number | null | undefined;

/** Marker for Ruby Symbols reaching Card::Name[] (from_cardish `when Symbol`). */
export interface CodenameMark {
  readonly codename: string;
}

/** Card::Name[] argument space (from_cardish in lib/card/name.rb). */
export type Cardish =
  | Nameish
  | CodenameMark
  | readonly Cardish[];

/** Relative/contextual name elements (cardname lib/cardname/contextual.rb). */
const RELATIVE_REGEXP_SOURCE = "\\b_(?:left|right|whole|self|user|main|\\d+|L*R?)\\b";
const RELATIVE_REGEXP = new RegExp(RELATIVE_REGEXP_SOURCE);
const RELATIVE_REGEXP_GLOBAL = new RegExp(RELATIVE_REGEXP_SOURCE, "g");
const RELATIVE_FRAGMENT_REGEXP = new RegExp(`^${RELATIVE_REGEXP_SOURCE}$`);

/** Ruby \s = [ \t\r\n\f\v]; Ruby String#strip also removes NUL. */
const RUBY_WHITESPACE = " \t\n\v\f\r";
const RUBY_SPLIT_AROUND_JOINT = new RegExp(`[${RUBY_WHITESPACE}]*\\+[${RUBY_WHITESPACE}]*`);
const RUBY_BLANK = new RegExp(`^[${RUBY_WHITESPACE}]*$`);

/** Marks recognized by Card::Name.new / id_from_string (lib/card/name.rb). */
const ID_MARK_REGEXP = /^~(\d+)$/;
const CODENAME_MARK_REGEXP = /^:(\w+)$/;

/** Ruby \p{Word} = Letter | Mark | Decimal_Number | Connector_Punctuation. */
const OK_FOR_KEY_CLASS = "\\p{L}\\p{M}\\p{Nd}\\p{Pc}";
const NOT_OK_FOR_KEY = new RegExp(`[^${OK_FOR_KEY_CLASS}\\*]+`, "gu");

function rubyStrip(str: string): string {
  return str.replace(
    new RegExp(`^[${RUBY_WHITESPACE}\0]+|[${RUBY_WHITESPACE}\0]+$`, "g"),
    "",
  );
}

/** Ruby String#length: character (codepoint) count. */
function rubyLength(str: string): number {
  return Array.from(str).length;
}

function rubyBlank(value: string | undefined | null): boolean {
  return value == null || RUBY_BLANK.test(value);
}

/**
 * Variants#stable_key (cardname lib/cardname/variants.rb): singularize once;
 * if that is not idempotent, keep the original word (stabilize defaults to
 * false - cardname lib/cardname.rb class defaults).
 */
function stableKey(word: string): string {
  const keyOne = singularize(word);
  const keyTwo = singularize(keyOne);
  return keyOne === keyTwo ? keyOne : word;
}

/** Cardname#simple_key (cardname lib/cardname.rb private #simple_key). */
function simpleKey(body: string): string {
  if (body === "") return "";
  return underscore(body)
    .replace(NOT_OK_FOR_KEY, "_")
    .split(/_+/)
    .filter((piece) => piece !== "")
    .map(stableKey)
    .join("_");
}

export class DeckoName {
  /** Cardname.joint class default (cardname lib/cardname.rb). */
  static readonly JOINT = "+";

  /** Cardname cache (lib/cardname/class_methods.rb#cache). */
  private static cache = new Map<string, DeckoName>();

  // A deck-inflection config change (applyDeckInflections /
  // resetDeckInflections in ./name/inflect.ts) invalidates every memoized
  // key, exactly as a Rails inflections initializer precedes any name
  // resolution at deck boot.
  static {
    onDeckInflectionsChanged(() => {
      DeckoName.cache.clear();
      DeckoName.parseMemo?.clear();
      DeckoName.leftNameMemo = new WeakMap();
      DeckoName.markMemo?.clear();
    });
  }

  /** Process-wide banned characters (Cardname.banned_array, default []). */
  static bannedCharacters: readonly string[] = [];

  /** simple string version of the name (cardname lib/cardname.rb #s / #to_s). */
  readonly s: string;

  /** the key defines the namespace (cardname lib/cardname.rb #key). */
  readonly key: string;

  /** HTML entities decoded (cardname lib/cardname/variants.rb #decoded). */
  readonly decoded: string;

  private readonly nameParts: readonly DeckoName[];
  private readonly simpleFlag: boolean;

  private constructor(raw: string) {
    this.s = rubyStrip(raw);
    this.decoded = decodeHtmlEntities(this.s);

    // part_names (cardname lib/cardname/parts.rb #generate_part_names):
    // blank -> [], single part -> [self], else parse each split part
    if (this.s === "") {
      this.nameParts = [];
      this.simpleFlag = true;
    } else {
      const split = DeckoName.splitParts(this.s);
      this.simpleFlag = split.length <= 1;
      this.nameParts = this.simpleFlag ? [this] : split.map((part) => DeckoName.baseParse(part));
    }

    // key (cardname lib/cardname.rb #generate_key)
    this.key = this.simpleFlag
      ? simpleKey(this.decoded)
      : this.nameParts.map((part) => part.key).join(DeckoName.JOINT);

    this.freeze();
  }

  private freeze(): void {
    Object.freeze(this);
  }

  /**
   * Cardname.new / Card::Name.new merged: Card::Name.new (card-1.110.0
   * lib/card/name.rb #new) first normalizes compound strings and resolves
   * id/codename marks, then defers to Cardname.new which caches by raw string.
   */
  static parse(obj: string | number | null | undefined | DeckoName): DeckoName {
    if (obj instanceof DeckoName) return obj; // Cardname.new returns obj if already one
    let str = obj == null ? "" : String(obj);
    // Inside a request scope only (beginRequestScope): strings with no
    // id/codename mark ("~", ":") parse to a pure function of the text (and
    // the inflection state, whose change clears this memo like `cache`).
    // Hot: compound names are re-split per call otherwise.
    const parseMemo = DeckoName.parseMemo;
    if (parseMemo !== undefined) {
      const memo = parseMemo.get(str);
      if (memo !== undefined) return memo;
      if (!str.includes("~") && !str.includes(":")) {
        const parsed = DeckoName.parseUncached(str);
        parseMemo.set(str, parsed);
        return parsed;
      }
    }
    // Strings WITH a mark resolve through the lexicon / codename registry:
    // within one request those answer from the request's own rows (an id
    // has one name, a codename one card), so a SUCCESSFUL resolution is
    // memoized while a request scope is open (failures re-run: a mark the
    // lexicon cannot resolve yet may resolve later in the request). Outside
    // a request scope nothing here is memoized.
    if (DeckoName.markMemo !== undefined) {
      const marked = DeckoName.markMemo.get(str);
      if (marked !== undefined) return marked;
      const parsed = DeckoName.parseUncached(str);
      DeckoName.markMemo.set(str, parsed);
      return parsed;
    }
    return DeckoName.parseUncached(str);
  }

  private static markMemo: Map<string, DeckoName> | undefined;

  /** Open / close a request scope for the parse and mark memos (see
   *  parse). Scopes nest (a page render opens one, its inner render() opens
   *  another): the outermost begin starts from empty memos and the
   *  outermost end drops every name memo, so nothing outlives the request.
   *  Outside a scope nothing new is memoized. */
  static beginRequestScope(): void {
    DeckoName.requestScopeDepth += 1;
    if (DeckoName.requestScopeDepth > 1) return;
    DeckoName.clearParseMemo();
    DeckoName.markMemo = new Map();
    DeckoName.parseMemo = new Map();
  }

  static endRequestScope(): void {
    if (DeckoName.requestScopeDepth === 0) return;
    DeckoName.requestScopeDepth -= 1;
    if (DeckoName.requestScopeDepth > 0) return;
    DeckoName.markMemo = undefined;
    DeckoName.parseMemo = undefined;
    DeckoName.clearParseMemo();
  }

  private static requestScopeDepth = 0;

  /** True when no request scope is open and no parse or mark memo exists
   *  (the request-local render's no-state-survives check). */
  static requestScopeIsClosed(): boolean {
    return DeckoName.requestScopeDepth === 0 && DeckoName.parseMemo === undefined && DeckoName.markMemo === undefined;
  }
  private static parseMemo: Map<string, DeckoName> | undefined;

  /** Drop the name memos (both are pure functions of the text and the
   *  inflection tables; callers that want request-scoped state clear them
   *  at the request boundary). */
  static clearParseMemo(): void {
    DeckoName.parseMemo?.clear();
    DeckoName.cache.clear();
    DeckoName.leftNameMemo = new WeakMap();
    DeckoName.markMemo?.clear();
  }

  private static parseUncached(str: string): DeckoName {

    if (str.includes(DeckoName.JOINT)) {
      // new_from_compound_string: split on the joint and parse each part
      // (mark resolution applies per part - lib/card/name.rb #new_from_parts)
      const joined = DeckoName.splitParts(str)
        .map((part) => DeckoName.parse(part).s)
        .join(DeckoName.JOINT);
      return DeckoName.baseParse(joined);
    }

    const id = DeckoName.idFromString(str);
    if (id !== undefined) {
      // from_id_from_string (lib/card/name.rb): resolve through the lexicon
      const lexiconName = getNameEnvironment()?.lexicon?.name(id);
      if (rubyBlank(lexiconName)) DeckoName.badMark(str);
      return DeckoName.baseParse(lexiconName as string);
    }
    return DeckoName.baseParse(str);
  }

  /** Cardname.new proper (cardname lib/cardname/class_methods.rb #new). */
  private static baseParse(raw: string): DeckoName {
    const cached = DeckoName.cache.get(raw);
    if (cached !== undefined) return cached;
    const name = new DeckoName(raw);
    DeckoName.cache.set(raw, name);
    return name;
  }

  /** Card::Name[] (card-1.110.0 lib/card/name.rb #[] / #from_cardish). */
  static of(...cardish: readonly Cardish[]): DeckoName {
    const single: Cardish = cardish.length <= 1 ? (cardish[0] ?? null) : cardish;
    const resolved = DeckoName.fromCardish(single);
    if (resolved === undefined) {
      throw new UnsupportedIdentifierError(
        `${describeCardish(single)} not supported as name identifier`,
      );
    }
    return resolved;
  }

  private static fromCardish(cardish: Cardish): DeckoName | undefined {
    if (cardish == null) return DeckoName.parse("");
    if (cardish instanceof DeckoName) return cardish;
    if (typeof cardish === "number") {
      if (!Number.isInteger(cardish)) return undefined; // Ruby: only Integer is supported
      const lexiconName = getNameEnvironment()?.lexicon?.name(cardish);
      return lexiconName === undefined ? undefined : DeckoName.baseParse(lexiconName);
    }
    if (typeof cardish === "string") return DeckoName.parse(cardish);
    if (Array.isArray(cardish)) return DeckoName.compose(cardish);
    if (typeof cardish === "object" && "codename" in cardish) {
      const codenameName = getNameEnvironment()?.codename?.name(cardish.codename);
      if (codenameName === undefined) {
        throw new CodenameNotFoundError(`unknown codename: ${cardish.codename}`);
      }
      return DeckoName.baseParse(codenameName);
    }
    return undefined;
  }

  /** Card::Name.compose (lib/card/name.rb #compose): interpret parts as cardish. */
  static compose(parts: readonly Cardish[]): DeckoName {
    const resolved = flattenCardish(parts).map((part) => DeckoName.of(part));
    return DeckoName.baseParse(resolved.map((part) => part.s).join(DeckoName.JOINT));
  }

  /** Cardname.split_parts (cardname lib/cardname/class_methods.rb #split_parts). */
  static splitParts(str: string): string[] {
    return str.split(RUBY_SPLIT_AROUND_JOINT);
  }

  /**
   * Card::Name.id_from_string (lib/card/name.rb): "~75" -> 75, ":codename" ->
   * its id via the codename registry, anything else -> undefined.
   */
  static idFromString(str: string): number | undefined {
    const idMatch = ID_MARK_REGEXP.exec(str);
    if (idMatch !== null) return parseInt(idMatch[1] as string, 10);
    const codenameMatch = CODENAME_MARK_REGEXP.exec(str);
    if (codenameMatch !== null) {
      const codename = codenameMatch[1] as string;
      const id = getNameEnvironment()?.codename?.id(codename);
      if (id === undefined) {
        throw new CodenameNotFoundError(`codename doesn't exist: ${codename}`);
      }
      return id;
    }
    return undefined;
  }

  /** Card::Name.id_from_string! (lib/card/name.rb): additionally require the id in the lexicon. */
  static idFromStringStrict(str: string): number | undefined {
    const id = DeckoName.idFromString(str);
    if (id === undefined) return undefined;
    if (rubyBlank(getNameEnvironment()?.lexicon?.name(id))) DeckoName.badMark(str);
    return id;
  }

  /** Card::Name.bad_mark (lib/card/name.rb). */
  private static badMark(str: string): never {
    if (ID_MARK_REGEXP.test(str)) {
      throw new NameNotFoundError(`id doesn't exist: ${(ID_MARK_REGEXP.exec(str) as RegExpExecArray)[1]}`);
    }
    if (CODENAME_MARK_REGEXP.test(str)) {
      throw new CodenameNotFoundError(
        `codename doesn't exist: ${(CODENAME_MARK_REGEXP.exec(str) as RegExpExecArray)[1]}`,
      );
    }
    throw new UnsupportedIdentifierError(`invalid mark: ${str}`);
  }

  // ~~~~~~~~~~~~~~~~~ cardname.rb core ~~~~~~~~~~~~~~~~~

  /** alias of #s (cardname lib/cardname.rb to_s). */
  toString(): string {
    return this.s;
  }

  /** Object#to_name core extension (cardname lib/core_ext.rb). */
  toName(): DeckoName {
    return this;
  }

  /** Cardname#num_parts (cardname lib/cardname.rb). */
  get numParts(): number {
    return this.parts.length;
  }

  /** true if name has only one part (cardname lib/cardname/predicates.rb #simple?). */
  get isSimple(): boolean {
    return this.simpleFlag;
  }

  /** test for same key (cardname lib/cardname.rb #==). */
  equals(other: Nameish): boolean {
    if (other instanceof DeckoName) return this.key === other.key;
    return this.key === DeckoName.parse(other).key;
  }

  /**
   * Cardname#[] - name based on part index. Supports `[index]`,
   * `[start, length]` and Ruby-style inclusive ranges via {@link getRange}.
   * Out-of-range accesses yield the empty name (Ruby nil.to_name).
   */
  get(start: number, length?: number): DeckoName {
    const len = this.nameParts.length;
    const from = start < 0 ? len + start : start;
    if (length === undefined) {
      return from >= 0 && from < len ? (this.nameParts[from] as DeckoName) : DeckoName.parse("");
    }
    if (length < 0 || from < 0 || from > len) return DeckoName.parse("");
    const count = Math.min(length, len - from);
    return DeckoName.baseParse(this.sliceParts(from, count));
  }

  /**
   * Ruby-style inclusive range access on part names, `self[start..end]`.
   * A negative end counts from the right; when the range is empty or
   * out-of-bounds the result is the empty name (Ruby nil.to_name).
   */
  getRange(start: number, endInclusive: number): DeckoName {
    const len = this.nameParts.length;
    const from = start < 0 ? len + start : start;
    const to = endInclusive < 0 ? len + endInclusive : endInclusive;
    if (from < 0 || to < 0 || from > to || from >= len) return DeckoName.parse("");
    return DeckoName.baseParse(this.sliceParts(from, to - from + 1));
  }

  private sliceParts(from: number, count: number): string {
    return this.nameParts
      .slice(from, from + count)
      .map((part) => part.s)
      .join(DeckoName.JOINT);
  }

  // ~~~~~~~~~~~~~~~~~ parts.rb ~~~~~~~~~~~~~~~~~

  /** each joint separated part (cardname lib/cardname/parts.rb #parts). */
  get parts(): string[] {
    return this.nameParts.map((part) => part.s);
  }

  /** cardname lib/cardname/parts.rb #part_keys. */
  get partKeys(): string[] {
    return this.nameParts.map((part) => part.key);
  }

  /** cardname lib/cardname/parts.rb #part_names. */
  get partNames(): readonly DeckoName[] {
    return this.nameParts;
  }

  /** the part left of the rightmost joint (cardname lib/cardname/parts.rb #left). */
  get left(): string | undefined {
    return this.leftName?.s;
  }

  /** cardname lib/cardname/parts.rb #left_key. */
  get leftKey(): string | undefined {
    return this.leftName?.key;
  }

  /** cardname lib/cardname/parts.rb #left_name. */
  get leftName(): DeckoName | undefined {
    if (this.isSimple) return undefined;
    // A name is immutable and its left part is baseParse of its own parts
    // (a pure function of the text and the inflection tables), so it is
    // computed once per instance; the memo is dropped with the name cache.
    const memo = DeckoName.leftNameMemo.get(this);
    if (memo !== undefined) return memo;
    const left = this.getRange(0, -2);
    DeckoName.leftNameMemo.set(this, left);
    return left;
  }

  private static leftNameMemo = new WeakMap<DeckoName, DeckoName>();

  /** left and right of a compound card (cardname lib/cardname/parts.rb #parents). */
  get parents(): string[] {
    return this.parentNames.map((parent) => parent.s);
  }

  /** cardname lib/cardname/parts.rb #parent_keys. */
  get parentKeys(): string[] {
    return this.parentNames.map((parent) => parent.key);
  }

  /** cardname lib/cardname/parts.rb #parent_names. */
  get parentNames(): DeckoName[] {
    if (this.isSimple) return [];
    const left = this.leftName;
    const right = this.rightName as DeckoName;
    return left === undefined ? [right] : [left, right];
  }

  /** like #left, but returns self for simple cards (cardname lib/cardname/parts.rb #trunk). */
  get trunk(): string {
    return this.trunkName.s;
  }

  /** cardname lib/cardname/parts.rb #trunk_key. */
  get trunkKey(): string {
    return this.trunkName.key;
  }

  /** cardname lib/cardname/parts.rb #trunk_name. */
  get trunkName(): DeckoName {
    return this.isSimple ? this : (this.leftName as DeckoName);
  }

  /** like #right, but returns self for simple cards (cardname lib/cardname/parts.rb #tag). */
  get tag(): string {
    return this.tagName.s;
  }

  /** cardname lib/cardname/parts.rb #tag_key. */
  get tagKey(): string {
    return this.tagName.key;
  }

  /** cardname lib/cardname/parts.rb #tag_name. */
  get tagName(): DeckoName {
    return this.isSimple ? this : (this.rightName as DeckoName);
  }

  /** the part right of the rightmost joint (cardname lib/cardname/parts.rb #right). */
  get right(): string | undefined {
    return this.rightName?.s;
  }

  /** cardname lib/cardname/parts.rb #right_key. */
  get rightKey(): string | undefined {
    return this.rightName?.key;
  }

  /** cardname lib/cardname/parts.rb #right_name. */
  get rightName(): DeckoName | undefined {
    if (this.isSimple) return undefined;
    return this.nameParts[this.nameParts.length - 1] ?? undefined;
  }

  // ~~~~~~~~~~~~~~~~~ pieces.rb ~~~~~~~~~~~~~~~~~

  /** self and all ancestors (cardname lib/cardname/pieces.rb #pieces). */
  get pieces(): string[] {
    if (this.isSimple) return [this.s];
    const compound: string[] = [];
    const split = this.parts;
    let left = split[0] as string;
    for (let i = 1; i < split.length; i++) {
      left = [left, split[i]].join(DeckoName.JOINT);
      compound.push(left);
    }
    return [...split, ...compound];
  }

  /** cardname lib/cardname/pieces.rb #piece_names. */
  get pieceNames(): DeckoName[] {
    return this.pieces.map((piece) => DeckoName.parse(piece));
  }

  /** parents, parents' parents, etc (cardname lib/cardname/pieces.rb #ancestors). */
  get ancestors(): string[] {
    return this.pieces.filter((piece) => !this.equals(piece));
  }

  /** cardname lib/cardname/pieces.rb #ancestor_pieces. */
  get ancestorPieces(): DeckoName[] {
    return this.ancestors.map((ancestor) => DeckoName.parse(ancestor));
  }

  // ~~~~~~~~~~~~~~~~~ predicates.rb + star handling ~~~~~~~~~~~~~~~~~

  /** true if name has more than one part (cardname lib/cardname/predicates.rb #compound?). */
  get isCompound(): boolean {
    return !this.isSimple;
  }

  /** true unless name contains banned characters (cardname lib/cardname/predicates.rb #valid?). */
  get isValid(): boolean {
    if (DeckoName.bannedCharacters.length === 0) return true;
    const banned = [...DeckoName.bannedCharacters, DeckoName.JOINT]
      .map((c) => regexpQuote(c))
      .join("");
    const bannedRe = new RegExp(`[${banned}]`);
    return !this.parts.some((part) => bannedRe.test(part));
  }

  /** "+X" (cardname lib/cardname/predicates.rb #starts_with_joint?). */
  get startsWithJoint(): boolean {
    return this.isCompound && this.parts[0] === "";
  }

  /** true if name starts with the same parts as the prefix (predicates.rb #starts_with_parts?). */
  startsWithParts(...prefix: readonly Nameish[]): boolean {
    const startName = DeckoName.compose(prefix.map((p) => p ?? ""));
    return startName.equals(this.get(0, startName.numParts));
  }

  /** true if name ends with the same parts as the suffix (predicates.rb #ends_with_parts?). */
  endsWithParts(...suffix: readonly Nameish[]): boolean {
    const endName = DeckoName.compose(suffix.map((p) => p ?? ""));
    return endName.equals(this.getRange(-endName.numParts, -1));
  }

  /** true if a chain of parts equals the subname (cardname lib/cardname/predicates.rb #include?). */
  includes(subname: Nameish): boolean {
    const subkey = DeckoName.parse(subname ?? "").key;
    const escaped = regexpQuote(subkey);
    return new RegExp(`(^|\\+)${escaped}($|\\+)`).test(this.key);
  }

  /** simple star name, e.g. "*self" (card-1.110.0 lib/card/name.rb #star?). */
  get isStar(): boolean {
    return this.isSimple && this.s.charAt(0) === "*";
  }

  /** compound name with a star right, e.g. "A+*right" (lib/card/name.rb #rstar?). */
  get isRStar(): boolean {
    return this.right !== undefined && this.right.charAt(0) === "*";
  }

  // ~~~~~~~~~~~~~~~~~ variants.rb ~~~~~~~~~~~~~~~~~

  /** URI-friendly version; keeps case, underscores for space (variants.rb #url_key). */
  get urlKey(): string {
    return this.nameParts
      .map((part) => {
        const stripped = decodeHtmlEntities(part.s)
          .replace(NOT_OK_FOR_KEY, " ")
          .replace(new RegExp(`^[${RUBY_WHITESPACE}]+|[${RUBY_WHITESPACE}]+$`, "g"), "");
        return stripped.replace(/[ \t\r\n\f\v_]+/g, "_");
      })
      .join(DeckoName.JOINT);
  }

  /** HTML-id-safe key; '*' becomes X, joint becomes '-' (variants.rb #safe_key). */
  get safeKey(): string {
    return this.key.replace(/\*/g, "X").split(DeckoName.JOINT).join("-");
  }

  /** contextual elements removed (variants.rb #stripped). */
  get stripped(): DeckoName {
    return DeckoName.parse(this.s.replace(RELATIVE_REGEXP_GLOBAL, ""));
  }

  /** stripped with blank parts removed (variants.rb #fully_stripped; Array#cardname compose). */
  get fullyStripped(): DeckoName {
    return DeckoName.compose(this.stripped.parts.filter((part) => !rubyBlank(part)));
  }

  // ~~~~~~~~~~~~~~~~~ contextual.rb ~~~~~~~~~~~~~~~~~

  /** true if name is left or right of context (contextual.rb #child_of?). */
  childOf(context: Nameish): boolean {
    if (!this.isCompound) return false;
    const contextName = DeckoName.parse(context ?? "");
    return contextName !== undefined && this.absoluteName(context).parentKeys.includes(contextName.key);
  }

  /** contextual names vary by context (contextual.rb #relative?). */
  get isRelative(): boolean {
    return this.startsWithJoint || RELATIVE_REGEXP.test(this.s);
  }

  /** starts with joint, no other contextual element (contextual.rb #simple_relative?). */
  get isSimpleRelative(): boolean {
    return this.startsWithJoint && !RELATIVE_REGEXP.test(this.s);
  }

  /** a name fragment referring to a relative part (contextual.rb #relative_fragment?). */
  get isRelativeFragment(): boolean {
    return RELATIVE_FRAGMENT_REGEXP.test(this.s);
  }

  /** not relative (contextual.rb #absolute?). */
  get isAbsolute(): boolean {
    return !this.isRelative;
  }

  /** interpret contextual name; string form (contextual.rb #from). */
  from(...from: readonly Nameish[]): string {
    return this.nameFrom(...from).s;
  }

  /** relativize into a name beginning with "+", if possible (contextual.rb #name_from). */
  nameFrom(...from: readonly Nameish[]): DeckoName {
    const compactFrom = from.filter((f): f is Exclude<Nameish, null | undefined> => f != null);
    if (compactFrom.length === 0) return this;

    const remaining = this.partsMinus(
      DeckoName.compose(compactFrom).partKeys,
    );
    if (remaining.every((part) => part === null)) return this;
    if (nameArraysEqual(remaining, this.parts)) return this;

    // Ruby: remaining.compact.unshift(nil).to_name - compact BEFORE unshifting nil
    const compacted = remaining.filter((part): part is string => part !== null);
    const compressed = DeckoName.baseParse(
      [null, ...compacted].join(DeckoName.JOINT),
    );
    // Ruby: `compressed.absolute_name(from)` where `from` is the whole
    // context LIST as an array — and `absolute` does
    // `context = (context || "").to_name`, whose Object#to_name is
    // `Cardname.new self` (cardname core_ext.rb), whose stringify JOINS an
    // array with the joint (class_methods.rb:52-58). The context list is
    // therefore ONE compound context name for the round-trip check, not a
    // list of separate arguments. (Spreading the list here made
    // absoluteName read only its FIRST element, so every multi-part context
    // failed the round-trip and the title stayed the full name — live-wire
    // mechanism 2: the +*self rule-bar pages render title="A+*self+*default"
    // where the oracle renders title="+*default".)
    return this.key === compressed.absoluteName(DeckoName.compose(compactFrom)).key
      ? compressed
      : this;
  }

  /** interpret contextual name; string result (contextual.rb #absolute). */
  absolute(context?: Nameish): string {
    const contextName = DeckoName.parse(context ?? "");
    const newParts = this.parts.map((part) =>
      absolutizeContextualPart(part, contextName),
    );
    if (newParts.length === 0) return "";
    absolutizeExtremes(newParts, contextName);
    return newParts.join(DeckoName.JOINT);
  }

  /** contextual.rb #absolute_name. */
  absoluteName(context?: Nameish): DeckoName {
    return DeckoName.parse(this.absolute(context));
  }

  /** 1 = left; 2 = left of left; ... (contextual.rb #nth_left_name). */
  nthLeftName(n: number): DeckoName {
    // Ruby uses String#length here, not the number of parts
    if (n >= rubyLength(this.s)) {
      return DeckoName.parse(this.parts[0] ?? "");
    }
    const count = this.nameParts.length - n;
    return count > 0
      ? DeckoName.baseParse(this.sliceParts(0, count))
      : DeckoName.parse("");
  }

  /** contextual.rb #parts_minus: drop empty, relative ("^_"), and ignored-key parts. */
  private partsMinus(keysToIgnore: readonly string[]): (string | null)[] {
    return this.parts.map((part) => {
      if (part === "") return null;
      if (/^_/.test(part)) return null;
      if (keysToIgnore.includes(DeckoName.parse(part).key)) return null;
      return part;
    });
  }

  // ~~~~~~~~~~~~~~~~~ fields.rb ~~~~~~~~~~~~~~~~~

  /** "A".field("B") -> "A+B" (cardname lib/cardname/fields.rb #field). */
  field(tag: string | number): string {
    return this.fieldName(tag).s;
  }

  /**
   * fields.rb #field_name: `[self, tag].to_name`, and in WAGN
   * `Array#to_name` is NOT `Cardname.new` — it is `Card::Name.compose`
   * (card-1.110.0 config/initializers/01_core_extensions/array.rb:80-83
   * `def cardname; Card::Name.compose self; end` + `alias to_name`).
   * Two consequences this port has to carry:
   *
   *  1. A SYMBOL tag resolves through the codename registry to the
   *     codename card's real name (card-1.110.0 lib/card/name.rb:73-81
   *     `from_cardish ... when Symbol then Codename.name! cardish`).
   *     template_nest.rb:27's `[type, name].to_name.field_name
   *     :type_plus_right` is the pinned case: `:type_plus_right` is the
   *     codename of the `*type plus right` SET card, so the composed
   *     junction tag is `*type plus right` (cardname-0.20.0 alone would
   *     emit the starless `type_plus_right`, which resolves to nothing).
   *  2. Only a STRING tag loses a leading "+" (fields.rb:16's
   *     `tag.to_s[1..] if !tag.is_a?(Symbol) && tag.to_s[0] == "+"`).
   */
  fieldName(tag: string | number): DeckoName;
  fieldName(tag: Cardish): DeckoName;
  fieldName(tag: Cardish): DeckoName {
    if (
      typeof tag === "object" &&
      tag !== null &&
      !Array.isArray(tag) &&
      !(tag instanceof DeckoName) &&
      "codename" in tag
    ) {
      return DeckoName.compose([this, tag]);
    }
    const tagStr = String(tag);
    const stripped = tagStr.charAt(0) === "+" ? tagStr.slice(1) : tagStr;
    return DeckoName.compose([this, stripped]);
  }

  /** true when the name is a field of the context (fields.rb #field_of?). */
  fieldOf(context?: string | null): boolean {
    if (!this.isCompound) return false;
    if (!rubyBlank(context)) {
      const contextName = DeckoName.parse(context);
      return this.absoluteName(context).leftName?.key === contextName.key;
    }
    return /^[ \t\r\n\f\v]*\+[^+]+$/.test(this.s);
  }

  /** relative name containing only the rightmost part (fields.rb #field_only?). */
  get fieldOnly(): boolean {
    if (!this.isRelative) return false;
    const firstNonBlank = this.stripped.parts.find((part) => !rubyBlank(part));
    return firstNonBlank === this.parts[this.parts.length - 1];
  }

  /** fields.rb #relative_field_name. */
  relativeFieldName(tag: string | number): DeckoName {
    return this.fieldName(tag).nameFrom(this);
  }

  // ~~~~~~~~~~~~~~~~~ manipulate.rb (as pure functions) ~~~~~~~~~~~~~~~~~

  /**
   * Manipulate#[]= ported as a pure function: a new name with the part at
   * `index` replaced. (Ruby mutates in place; DeckoName is immutable.)
   */
  withPartAt(index: number, value: Nameish): DeckoName {
    const parts = [...this.parts];
    const at = index < 0 ? parts.length + index : index;
    parts[at] = DeckoName.parse(value ?? "").s;
    return DeckoName.baseParse(parts.join(DeckoName.JOINT));
  }

  /** Manipulate#<< ported as a pure function: append a part. */
  append(value: Nameish): DeckoName {
    return DeckoName.baseParse(
      [...this.parts, DeckoName.parse(value ?? "").s].join(DeckoName.JOINT),
    );
  }

  /** swap one name for another; keys are compared (manipulate.rb #swap). */
  swap(oldValue: Nameish, newValue: Nameish): DeckoName {
    const oldName = DeckoName.parse(oldValue ?? "");
    const newName = DeckoName.parse(newValue ?? "");
    if (oldName.numParts > this.numParts) return this;
    if (oldName.isSimple) {
      return DeckoName.baseParse(
        this.parts
          .map((part) => (oldName.equals(part) ? newName.s : part))
          .join(DeckoName.JOINT),
      );
    }
    if (this.includes(oldName)) {
      return DeckoName.baseParse(this.swapAllSubsequences(oldName, newName).join(DeckoName.JOINT));
    }
    return this;
  }

  /** add a joint to the beginning unless present (manipulate.rb #prepend_joint / #to_field). */
  get prependJoint(): string {
    return this.s.startsWith(DeckoName.JOINT) ? this.s : DeckoName.JOINT + this.s;
  }

  /** substitute this name's variants in str (manipulate.rb #sub_in). */
  subIn(str: string, withValue: Nameish): string {
    const withName = DeckoName.parse(withValue ?? "").s;
    let result = str;
    for (const caseMethod of ["capitalize", "downcase"] as const) {
      for (const inflectMethod of ["pluralize", "singularize"] as const) {
        const from = applyCaseAndInflection(this.s, caseMethod, inflectMethod);
        const to = applyCaseAndInflection(withName, caseMethod, inflectMethod);
        // Ruby interpolates the source unescaped into the regex; escaping here
        // keeps regex-significant names (e.g. "*self") working - see notes.
        result = result.replace(
          new RegExp(`\\b${regexpQuote(from)}\\b`, "g"),
          to,
        );
      }
    }
    return result;
  }

  private swapAllSubsequences(oldName: DeckoName, newName: DeckoName): string[] {
    const result: string[] = [];
    const oldKeys = oldName.partKeys;
    const allKeys = this.partKeys;
    let i = 0;
    while (i <= this.numParts - oldName.numParts) {
      if (
        oldKeys[0] === allKeys[i] &&
        arraysEqual(oldKeys, allKeys.slice(i, i + oldName.numParts))
      ) {
        result.push(...newName.parts);
        i += oldName.numParts;
      } else {
        result.push(this.parts[i] as string);
        i += 1;
      }
    }
    if (i < this.numParts) result.push(...this.parts.slice(i));
    return result;
  }

  // ~~~~~~~~~~~~~~~~~ name_variants.rb (Card::Name) ~~~~~~~~~~~~~~~~~

  /**
   * Card::Name#vary (card-1.110.0 lib/card/name/name_variants.rb): apply a
   * comma/space separated list of variants (capitalize, singularize, pluralize,
   * titleize, downcase, upcase, swapcase, reverse, succ; aliases capitalized,
   * singular, plural, title). Unknown variants are ignored.
   */
  vary(variants: string): DeckoName {
    const result = variants
      .split(/[ \t\r\n\f\v,]+/)
      .filter((variant) => variant !== "")
      .reduce((name, variant) => applyVariant(name, variant), this.s);
    return DeckoName.baseParse(result);
  }

  /**
   * Card::Name#standard (lib/card/name/name_variants.rb): replace each part
   * with its lexicon-registered name where available. Requires a lexicon in
   * the environment; without one the name is returned unchanged (Ruby raises
   * through Lexicon when unconfigured; returning self is the graceful form).
   */
  get standard(): DeckoName {
    if (this.isSimple) {
      // Lexicon indexes by name key (card-1.110.0 lib/card/lexicon.rb#lex_query)
      const id = getNameEnvironment()?.lexicon?.id(this.key);
      const std = id === undefined ? undefined : getNameEnvironment()?.lexicon?.name(id);
      return rubyBlank(std) ? this : DeckoName.baseParse(std as string);
    }
    return DeckoName.compose(this.parts.map((part) => DeckoName.parse(part).standard));
  }

  /** Card::Name#card_id (lib/card/name/name_variants.rb): lexicon id for the name key. */
  get cardId(): number | undefined {
    return getNameEnvironment()?.lexicon?.id(this.key);
  }

  /** Card::Name#codename: codename string of the card with this name, if any. */
  get codename(): string | undefined {
    const id = this.cardId;
    if (id === undefined) return undefined;
    return getNameEnvironment()?.codename?.nameForId(id);
  }

  /** Card::Name#codename_or_string. */
  get codenameOrString(): string {
    return this.codename ?? this.s;
  }

  // ~~~~~~~~~~~~~~~~~ Ruby String methods used on names ~~~~~~~~~~~~~~~~~

  /** Ruby String#succ / #next (used by autoname flows). */
  succ(): DeckoName {
    return DeckoName.baseParse(rubySucc(this.s));
  }
}

/** contextual.rb #absolutize_contextual_parts case logic for one part. */
function absolutizeContextualPart(part: string, context: DeckoName): string {
  let resolved: string | undefined;
  if (/^_user$/i.test(part)) {
    resolved = getNameEnvironment()?.session ?? part;
  } else if (/^_main$/i.test(part)) {
    resolved = getNameEnvironment()?.mainName;
  } else if (/^(_self|_whole|_)$/i.test(part)) {
    resolved = context.s;
  } else if (/^_left$/i.test(part)) {
    resolved = context.trunk;
  } else if (/^_right$/i.test(part)) {
    resolved = context.tag;
  } else if (/^_(\d+)$/i.test(part)) {
    const pos = parseInt((/^_(\d+)$/i.exec(part) as RegExpExecArray)[1] as string, 10);
    resolved = ordinalPart(pos, context);
  } else if (/^_(L*)(R?)$/i.test(part)) {
    const match = /^_(L*)(R?)$/i.exec(part) as RegExpExecArray;
    resolved = partmapPart((match[1] as string).length, (match[2] as string) !== "", context);
  } else {
    resolved = part;
  }
  return rubyStrip(resolved ?? "");
}

/** contextual.rb #ordinal_part: context.length is the STRING length in Ruby. */
function ordinalPart(pos: number, context: DeckoName): string | undefined {
  const clamped = pos > rubyLength(context.s) ? rubyLength(context.s) : pos;
  return context.parts[clamped - 1];
}

/** contextual.rb #partmap_part: "_LR" style ordinal navigation. */
function partmapPart(leftCount: number, withRight: boolean, context: DeckoName): string {
  const leftPart = context.nthLeftName(leftCount);
  return withRight ? leftPart.tag : leftPart.s;
}

/** contextual.rb #absolutize_extremes: blank extremes become the context. */
function absolutizeExtremes(newParts: string[], context: DeckoName): void {
  for (const index of [0, newParts.length - 1]) {
    const extreme = newParts[index];
    if (rubyBlank(extreme)) {
      const guarded =
        index === 0
          ? DeckoName.parse(newParts.join(DeckoName.JOINT)).startsWithParts(context.s)
          : DeckoName.parse(newParts.join(DeckoName.JOINT)).endsWithParts(context.s);
      if (!guarded) newParts[index] = context.s;
    }
  }
}

/** applyVariant helper for Card::Name#vary. */
function applyVariant(name: string, variant: string): string {
  switch (variant) {
    case "capitalized":
    case "capitalize":
      return rubyCapitalize(name);
    case "singular":
    case "singularize":
      return singularize(name);
    case "plural":
    case "pluralize":
      return pluralize(name);
    case "title":
    case "titleize":
      return titleize(name);
    case "downcase":
      return name.toLowerCase();
    case "upcase":
      return name.toUpperCase();
    case "swapcase":
      return Array.from(name)
        .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
        .join("");
    case "reverse":
      return Array.from(name).reverse().join("");
    case "succ":
      return rubySucc(name);
    default:
      return name;
  }
}

/** manipulate.rb #sub_in helper: send(m1).send(m2) on a string. */
function applyCaseAndInflection(
  name: string,
  caseMethod: "capitalize" | "downcase",
  inflectMethod: "pluralize" | "singularize",
): string {
  const cased = caseMethod === "capitalize" ? rubyCapitalize(name) : name.toLowerCase();
  return inflectMethod === "pluralize" ? pluralize(cased) : singularize(cased);
}

function nameArraysEqual(left: readonly (string | null)[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, i) => part === right[i]);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, i) => part === right[i]);
}

function flattenCardish(parts: readonly Cardish[]): Exclude<Cardish, readonly Cardish[]>[] {
  const out: Exclude<Cardish, readonly Cardish[]>[] = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      out.push(...(flattenCardish(part) as Exclude<Cardish, readonly Cardish[]>[]));
    } else {
      out.push(part as Exclude<Cardish, readonly Cardish[]>);
    }
  }
  return out;
}

function describeCardish(cardish: Cardish): string {
  if (cardish === null) return "NilClass";
  if (typeof cardish === "boolean") return "Boolean";
  if (typeof cardish === "number") return "Integer";
  if (typeof cardish === "string") return "String";
  if (cardish instanceof DeckoName) return "Card::Name";
  if (Array.isArray(cardish)) return "Array";
  if (typeof cardish === "object" && "codename" in cardish) return "Symbol";
  return String(cardish);
}

/**
 * Card::Name[...] factory (card-1.110.0 lib/card/name.rb #[]).
 * Interprets names, strings, integers (via lexicon), codenames and part arrays.
 */
export function name(...cardish: readonly Cardish[]): DeckoName {
  return DeckoName.of(...cardish);
}
