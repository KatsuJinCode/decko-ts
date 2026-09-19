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
 */

interface InflectionRule {
  regexp: RegExp;
  replacement: string;
}

function rules(pairs: readonly (readonly [RegExp, string])[]): InflectionRule[] {
  return pairs.map(([regexp, replacement]) => ({ regexp, replacement }));
}

/**
 * Singularization rules, scan order. Transcribed from
 * activesupport-7.2.3.2 lib/active_support/inflections.rb (singular + irregular
 * entries), reversed for prepend semantics.
 */
const SINGULAR_RULES: readonly InflectionRule[] = rules([
  // irregular-derived, reverse definition order (zombie, move, sex, child, man, person).
  // Ruby's Inflections#irregular generates /(s0)srest$/i and /(p0)prest$/i (no ^
  // anchor), each irregular contributing its two singular() calls in prepended order
  [/(z)ombies$/i, "$1zombie"],
  [/(z)ombie$/i, "$1zombie"],
  [/(m)oves$/i, "$1move"],
  [/(m)ove$/i, "$1move"],
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
const PLURAL_RULES: readonly InflectionRule[] = rules([
  // irregular-derived, reverse definition order (same generation scheme as above)
  [/(z)ombies$/i, "$1zombies"],
  [/(z)ombie$/i, "$1zombies"],
  [/(m)oves$/i, "$1moves"],
  [/(m)ove$/i, "$1moves"],
  [/(s)exes$/i, "$1sexes"],
  [/(s)ex$/i, "$1sexes"],
  [/(c)hildren$/i, "$1children"],
  [/(c)hild$/i, "$1children"],
  [/(m)en$/i, "$1men"],
  [/(m)an$/i, "$1men"],
  [/(p)eople$/i, "$1people"],
  [/(p)erson$/i, "$1people"],
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
const UNCOUNTABLE_REGEXES: readonly RegExp[] = [
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
].map((word) => new RegExp(`\\b${word}$`, "i"));

/** ActiveSupport::Inflector::Inflections::Uncountables#uncountable? */
function uncountable(word: string): boolean {
  return UNCOUNTABLE_REGEXES.some((re) => re.test(word));
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

/** ActiveSupport::Inflector#singularize (default :en inflections) */
export function singularize(word: string): string {
  return applyInflections(word, SINGULAR_RULES);
}

/** ActiveSupport::Inflector#pluralize (default :en inflections) */
export function pluralize(word: string): string {
  return applyInflections(word, PLURAL_RULES);
}

/**
 * ActiveSupport::Inflector#underscore.
 * Returns the input unchanged unless it contains an ASCII capital or dash or
 * "::" (early-return guard), which is why e.g. "Ünïcödé" keeps its case.
 */
export function underscore(camelCasedWord: string): string {
  if (!/[A-Z-]|::/.test(camelCasedWord)) return camelCasedWord;
  const word = camelCasedWord.replace(/::/g, "/");
  return word
    .replace(/([A-Z\d]+)([A-Z][a-z])/g, "$1_$2")
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
 * Ported from the observed Ruby 3.3 behavior (verified against a 50-case
 * battery, see docs/name-port-notes.md). Carry walks right-to-left over ASCII
 * alphanumerics (9->0 carries, z->a carries, Z->A carries). Non-alphanumeric
 * characters between the carried position and the string head are transparent
 * EXCEPT when the carry is digit-flavored (the original last alphanumeric was
 * a digit) and the next alphanumeric to the left is a letter: then a "1" is
 * inserted immediately after the separator run and the carry stops
 * ("a 9" -> "a 10", "z.99" -> "z.100", "a -- 9" -> "a -- 10"). Letters never
 * insert ("z z" -> "aa a"). Overflow at the string head prepends the neighbor
 * character ("9" -> "10", "zz" -> "aaa", "zz9" -> "aaa0"). Strings without any
 * ASCII alphanumeric simply increment their last character ("+" -> ",").
 */
export function rubySucc(str: string): string {
  if (str === "") return str;
  const chars = Array.from(str);

  let lastAlnum = -1;
  for (let i = chars.length - 1; i >= 0; i--) {
    const c = chars[i] as string;
    if (isAsciiAlnum(c)) {
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
      // separator run while carrying: peek left through the run
      let j = i - 1;
      while (j >= 0 && !isAsciiAlnum(chars[j] as string)) j--;
      if (j >= 0 && neighbor === "1" && !isAsciiDigit(chars[j] as string)) {
        // digit-flavored carry hitting a letter segment: insert "1" after the run
        chars.splice(i + 1, 0, "1");
        return chars.join("");
      }
      if (j < 0) {
        chars.unshift(neighbor);
        return chars.join("");
      }
      i = j;
      continue;
    }
    if (!carry) break;
    if (i === 0) {
      chars.unshift(neighbor);
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
