/**
 * ActiveSupport::Inflector behaviors that the Ruby cardname gem depends on
 * (cardname 0.20.0 does `require "active_support/inflector"`), plus the Ruby
 * String methods that Cardname/Card::Name call on their string bodies
 * (capitalize, succ and friends).
 *
 * Rule tables below are the DEFAULT English inflections, transcribed from
 * activesupport 7.2.3.2 lib/active_support/inflections.rb. Ruby stores rules
 * with `prepend` (Inflections#plural / #singular), so the effective scan order
 * is reverse definition order, with the `irregular` rules (defined last) at the
 * front in their own reverse order. `applyInflections` scans and applies the
 * FIRST matching rule (Ruby `sub!` returns truthy on any match, even a no-op
 * replacement, so a no-op match still stops the scan - e.g. pluralize("gas")
 * == "gas" via /s$/i -> "s").
 *
 * These defaults are the GEM-standard baseline. A deck may run its own
 * amended tables (Rails config/initializers/inflections.rb) - see
 * applyDeckInflections / resetDeckInflections below; deck amendments are data
 * supplied at deck-boot time, never baked into these constants.
 */

interface InflectionRule {
  regexp: RegExp;
  replacement: string;
}

function rules(pairs: readonly (readonly [RegExp, string])[]): InflectionRule[] {
  return pairs.map(([regexp, replacement]) => ({ regexp, replacement }));
}

/**
 * DECK INFLECTION CONFIG SEAM (deck data, not engine code).
 *
 * The cardname gem computes card keys through ActiveSupport::Inflector, whose
 * rule tables are PROCESS-GLOBAL STATE that each Rails/Decko deck may amend at
 * boot from its own config (config/initializers/inflections.rb). Two decks
 * can therefore store different keys for the same name. The engine ships the
 * DEFAULT English tables below; a deck's own amendments are DECK DATA supplied
 * at deck-boot time (the moment fixtures/corpora are seeded), never hardcoded
 * in src/.
 *
 * `applyDeckInflections` mirrors the additive semantics of a Rails inflections
 * block: `uncountable` words are APPENDED to the default uncountables,
 * `singular`/`plural` rule pairs are PREPENDED to the default rules (later
 * definitions win, matching Inflections#singular/#plural prepend order).
 * `resetDeckInflections` restores the gem defaults. Both clear the DeckoName
 * parse cache (registered by name.ts) so no stale keys survive a config
 * change - the same reason a Rails initializer runs before any request.
 */
export interface DeckInflectionConfig {
  /** Inflections#uncountable: words never inflected (matched \\b<word>$ per
   * word part, case-insensitive - Uncountables#to_regex). */
  uncountables?: readonly string[];
  /** Inflections#singular: [regexp, replacement] pairs, definition order. */
  singular?: readonly (readonly [RegExp, string])[];
  /** Inflections#plural: [regexp, replacement] pairs, definition order. */
  plural?: readonly (readonly [RegExp, string])[];
}

type DeckInflectionsListener = () => void;
const deckInflectionsListeners: DeckInflectionsListener[] = [];

/** Registered by src/card/name.ts so a config change drops memoized keys. */
export function onDeckInflectionsChanged(listener: DeckInflectionsListener): void {
  deckInflectionsListeners.push(listener);
}

function notifyDeckInflectionsChanged(): void {
  for (const listener of deckInflectionsListeners) listener();
}

/**
 * Singularization rules, scan order. Transcribed from
 * activesupport-7.2.3.2 lib/active_support/inflections.rb (singular + irregular
 * entries), reversed for prepend semantics.
 */
const DEFAULT_SINGULAR_RULES: readonly InflectionRule[] = rules([
  // irregular-derived, reverse definition order (zombie, move, sex, child, man, person).
  // Ruby's Inflections#irregular generates /(s0)srest$/i -> '\1' + srest and
  // /(p0)prest$/i -> '\1' + prest (no ^ anchor), each irregular contributing its
  // two singular() calls in prepended order
  [/(z)ombies$/i, "$1ombie"],
  [/(z)ombie$/i, "$1ombie"],
  [/(m)oves$/i, "$1ove"],
  [/(m)ove$/i, "$1ove"],
  [/(s)exes$/i, "$1ex"],
  [/(s)ex$/i, "$1ex"],
  [/(c)hildren$/i, "$1hild"],
  [/(c)hild$/i, "$1hild"],
  [/(m)en$/i, "$1an"],
  [/(m)an$/i, "$1an"],
  [/(p)eople$/i, "$1erson"],
  [/(p)erson$/i, "$1erson"],
  // default singular rules, reverse definition order
  [/(database)s$/i, "$1"],
  [/(quiz)zes$/i, "$1"],
  [/(matr)ices$/i, "$1ix"],
  [/(vert|ind)ices$/i, "$1ex"],
  [/^(ox)en/i, "$1"],
  [/(alias|status)(es)?$/i, "$1"],
  [/(octop|vir)(us|i)$/i, "$1us"],
  [/^(a)x[ie]s$/i, "$1xis"],
  [/(cris|test)(is|es)$/i, "$1is"],
  [/(shoe)s$/i, "$1"],
  [/(o)es$/i, "$1"],
  [/(bus)(es)?$/i, "$1"],
  [/^(m|l)ice$/i, "$1ouse"],
  [/(x|ch|ss|sh)es$/i, "$1"],
  [/(m)ovies$/i, "$1ovie"],
  [/(s)eries$/i, "$1eries"],
  [/([^aeiouy]|qu)ies$/i, "$1y"],
  [/([lr])ves$/i, "$1f"],
  [/(tive)s$/i, "$1"],
  [/(hive)s$/i, "$1"],
  [/([^f])ves$/i, "$1fe"],
  [/(^analy)(sis|ses)$/i, "$1sis"],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, "$1sis"],
  [/([ti])a$/i, "$1um"],
  [/(n)ews$/i, "$1ews"],
  [/(ss)$/i, "$1"],
  [/s$/i, ""],
]);

/**
 * Pluralization rules, scan order. Transcribed from
 * activesupport-7.2.3.2 lib/active_support/inflections.rb (plural + irregular
 * entries), reversed for prepend semantics.
 */
const DEFAULT_PLURAL_RULES: readonly InflectionRule[] = rules([
  // irregular-derived, reverse definition order (same generation scheme as above)
  [/(z)ombies$/i, "$1ombies"],
  [/(z)ombie$/i, "$1ombies"],
  [/(m)oves$/i, "$1oves"],
  [/(m)ove$/i, "$1oves"],
  [/(s)exes$/i, "$1exes"],
  [/(s)ex$/i, "$1exes"],
  [/(c)hildren$/i, "$1hildren"],
  [/(c)hild$/i, "$1hildren"],
  [/(m)en$/i, "$1en"],
  [/(m)an$/i, "$1en"],
  [/(p)eople$/i, "$1eople"],
  [/(p)erson$/i, "$1eople"],
  // default plural rules, reverse definition order
  [/(quiz)$/i, "$1zes"],
  [/^(oxen)$/i, "$1"],
  [/^(ox)$/i, "$1en"],
  [/^(m|l)ice$/i, "$1ice"],
  [/^(m|l)ouse$/i, "$1ice"],
  [/(matr|vert|ind)(?:ix|ex)$/i, "$1ices"],
  [/(x|ch|ss|sh)$/i, "$1es"],
  [/([^aeiouy]|qu)y$/i, "$1ies"],
  [/(hive)$/i, "$1s"],
  [/(?:([^f])fe|([lr])f)$/i, "$1$2ves"],
  [/sis$/i, "ses"],
  [/([ti])a$/i, "$1a"],
  [/([ti])um$/i, "$1a"],
  [/(buffal|tomat)o$/i, "$1oes"],
  [/(bu)s$/i, "$1ses"],
  [/(alias|status)$/i, "$1es"],
  [/(octop|vir)i$/i, "$1i"],
  [/(octop|vir)us$/i, "$1i"],
  [/^(ax|test)is$/i, "$1es"],
  [/s$/i, "s"],
  [/$/, "s"],
]);

/**
 * Default EN uncountables from lib/active_support/inflections.rb.
 * Ruby matches each with /\b<word>\Z/i (Uncountables#to_regex).
 */
const DEFAULT_UNCOUNTABLE_WORDS: readonly string[] = [
  "equipment",
  "information",
  "rice",
  "money",
  "species",
  "series",
  "fish",
  "sheep",
  "jeans",
  "police",
];

/** Current effective tables: gem defaults amended by deck data (see
 * applyDeckInflections). Immutable snapshots; swapped wholesale on change. */
interface InflectionState {
  singularRules: readonly InflectionRule[];
  pluralRules: readonly InflectionRule[];
  uncountableRegexes: readonly RegExp[];
}

function buildUncountableRegexes(words: readonly string[]): readonly RegExp[] {
  return words.map((word) => new RegExp(`\\b${word}$`, "i"));
}

let inflectionState: InflectionState = {
  singularRules: DEFAULT_SINGULAR_RULES,
  pluralRules: DEFAULT_PLURAL_RULES,
  uncountableRegexes: buildUncountableRegexes(DEFAULT_UNCOUNTABLE_WORDS),
};

/** Amend the process-global inflection tables with DECK DATA (Rails
 * inflections-block semantics: deck uncountables append, deck rules prepend
 * over the defaults, later definitions winning). Call once at deck-boot /
 * corpus-seed time, before any name is parsed. */
let lastAppliedConfig: DeckInflectionConfig | undefined;

export function applyDeckInflections(config: DeckInflectionConfig): void {
  // Re-applying the SAME config object leaves the tables unchanged, so it
  // must not invalidate every memoized name (every engine boot applies the
  // deck's one config).
  if (config === lastAppliedConfig) return;
  lastAppliedConfig = config;
  const deckSingular = config.singular ? rules(config.singular).reverse() : [];
  const deckPlural = config.plural ? rules(config.plural).reverse() : [];
  const uncountableWords = config.uncountables
    ? [...DEFAULT_UNCOUNTABLE_WORDS, ...config.uncountables]
    : DEFAULT_UNCOUNTABLE_WORDS;
  inflectionState = {
    singularRules: [...deckSingular, ...DEFAULT_SINGULAR_RULES],
    pluralRules: [...deckPlural, ...DEFAULT_PLURAL_RULES],
    uncountableRegexes: buildUncountableRegexes(uncountableWords),
  };
  notifyDeckInflectionsChanged();
}

/** Restore the gem's standard (default English) inflection tables. */
export function resetDeckInflections(): void {
  lastAppliedConfig = undefined;
  inflectionState = {
    singularRules: DEFAULT_SINGULAR_RULES,
    pluralRules: DEFAULT_PLURAL_RULES,
    uncountableRegexes: buildUncountableRegexes(DEFAULT_UNCOUNTABLE_WORDS),
  };
  notifyDeckInflectionsChanged();
}

/** ActiveSupport::Inflector::Inflections::Uncountables#uncountable? */
function uncountable(word: string): boolean {
  return inflectionState.uncountableRegexes.some((re) => re.test(word));
}

/** ActiveSupport::Inflector#apply_inflections */
function applyInflections(word: string, rulesInScanOrder: readonly InflectionRule[]): string {
  if (word === "" || uncountable(word)) return word;
  for (const { regexp, replacement } of rulesInScanOrder) {
    if (regexp.test(word)) {
      // Ruby sub! replaces only the first match (rules are not global)
      return word.replace(regexp, replacement);
    }
  }
  return word;
}

/** ActiveSupport::Inflector#singularize (current deck inflections) */
export function singularize(word: string): string {
  return applyInflections(word, inflectionState.singularRules);
}

/** ActiveSupport::Inflector#pluralize (current deck inflections) */
export function pluralize(word: string): string {
  return applyInflections(word, inflectionState.pluralRules);
}

/**
 * ActiveSupport::Inflector#underscore (activesupport 7.2.3.2
 * lib/active_support/inflector/methods.rb). Returns the input unchanged unless
 * it contains an ASCII capital or dash or "::" (early-return guard), which is
 * why e.g. "Ünïcödé" keeps its case. Acronym handling is omitted: the default
 * inflector defines no acronyms, so `acronyms_underscore_regex` never matches.
 */
export function underscore(camelCasedWord: string): string {
  if (!/[A-Z-]|::/.test(camelCasedWord)) return camelCasedWord;
  const word = camelCasedWord.replace(/::/g, "/");
  return word
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
}

/**
 * ActiveSupport::Inflector#humanize + title case, i.e. Inflector#titleize.
 * Only used by Card::Name#vary (card-1.110.0 lib/card/name/name_variants.rb).
 */
export function titleize(word: string): string {
  const humanized = underscore(word)
    .replace(/_/g, " ")
    .replace(/^\s+/, "")
    .replace(/^./, (c) => c.toUpperCase());
  return humanized.replace(/\b(?<!\w['’`()])[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Ruby String#capitalize: first character upcased, REST of the string downcased.
 * (JS's string methods have no direct equivalent; String.prototype.replace on
 * the first char plus full toLowerCase is the faithful port.)
 */
export function rubyCapitalize(str: string): string {
  if (str === "") return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function isAsciiDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}
function isAsciiLower(c: string): boolean {
  return c >= "a" && c <= "z";
}
function isAsciiUpper(c: string): boolean {
  return c >= "A" && c <= "Z";
}
function isAsciiAlnum(c: string): boolean {
  return isAsciiDigit(c) || isAsciiLower(c) || isAsciiUpper(c);
}

/**
 * Ruby String#succ / String#next.
 *
 * Ported from observed Ruby 3.3 behavior (verified against a 50-case battery,
 * Carry walks right-to-left over ASCII
 * alphanumerics (9->0 carries, z->a carries, Z->A carries). Non-alphanumeric
 * runs between the carried position and the string head are transparent EXCEPT
 * when the carry is digit-flavored (the original last alphanumeric was a
 * digit) and the next alphanumeric across the run is a letter (or there is
 * none): then the neighbor character is inserted immediately after the run and
 * the carry stops ("a 9" -> "a 10", "z.99" -> "z.100", "a -- 9" -> "a -- 10",
 * "**9" -> "**10"). Letter-flavored carries cross separators freely
 * ("z z" -> "aa a"). Overflow at the string head prepends the neighbor derived
 * from the overflowing character's class ("9" -> "10", "zz" -> "aaa",
 * "zz9" -> "aaa0"). Strings without any ASCII alphanumeric simply increment
 * their last character ("+" -> ",").
 */
export function rubySucc(str: string): string {
  if (str === "") return str;
  const chars = Array.from(str);

  let lastAlnum = -1;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (isAsciiAlnum(chars[i] as string)) {
      lastAlnum = i;
      break;
    }
  }
  if (lastAlnum < 0) {
    // no alphanumeric anywhere: plain increment of the last character
    const lastIdx = chars.length - 1;
    chars[lastIdx] = String.fromCharCode((chars[lastIdx] as string).codePointAt(0)! + 1);
    return chars.join("");
  }

  const lastChar = chars[lastAlnum] as string;
  const neighbor = isAsciiDigit(lastChar) ? "1" : isAsciiLower(lastChar) ? "a" : "A";
  const neighborFor = (c: string): string => (isAsciiDigit(c) ? "1" : isAsciiLower(c) ? "a" : "A");

  let carry = true;
  let i = lastAlnum;
  while (i >= 0) {
    const c = chars[i] as string;
    if (isAsciiDigit(c)) {
      carry = c === "9";
      chars[i] = carry ? "0" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else if (isAsciiLower(c)) {
      carry = c === "z";
      chars[i] = carry ? "a" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else if (isAsciiUpper(c)) {
      carry = c === "Z";
      chars[i] = carry ? "A" : String.fromCharCode(c.charCodeAt(0) + 1);
    } else {
      // separator run while carrying: find the next alphanumeric to the left
      let j = i - 1;
      while (j >= 0 && !isAsciiAlnum(chars[j] as string)) j--;
      if (j < 0 || (neighbor === "1" && !isAsciiDigit(chars[j] as string))) {
        // digit-flavored carry hitting a letter segment (or string head):
        // insert the neighbor right after the run and stop
        chars.splice(i + 1, 0, neighbor);
        return chars.join("");
      }
      i = j;
      continue;
    }
    if (!carry) break;
    if (i === 0) {
      chars.unshift(neighborFor(chars[0] as string));
      return chars.join("");
    }
    i--;
  }
  return chars.join("");
}

/**
 * Ruby Regexp.quote: escape every character that is not a word character,
 * space or dash gets backslash-escaped (used for include?/include-style key
 * matching in cardname/lib/cardname/predicates.rb).
 */
export function regexpQuote(str: string): string {
  return str.replace(/[^\w\s-]/g, (c) => `\\${c}`);
}
