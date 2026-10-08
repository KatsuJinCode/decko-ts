/**
 * SQLite REGEXP user-defined function for CQL `match` queries.
 *
 * WHY THIS EXISTS: the SQL generator (src/cql/sql.ts) renders CQL `match`
 * as `field REGEXP ?` — the token card-1.110.0's ActiveRecord patch
 * (config/initializers/02_patches/active_record.rb) generates for MySQL.
 * SQLite has no built-in REGEXP operator function: `X REGEXP Y` compiles,
 * but the call fails at run time with "no such function: REGEXP" unless a
 * `regexp(Y, X)` function is registered on the connection. This module is
 * that registration for the LOCAL path (better-sqlite3). The edge path
 * (D1/libSQL: no UDFs possible) is decided but not implemented here — see
 *  ("REGEXP on the edge").
 *
 * SEMANTICS — case-insensitive by default, matching MySQL REGEXP (ICU in
 * MySQL 8, Henry Spencer in 5.x; both case-fold ASCII by default; the
 * decko keys the queries usually hit are downcased anyway). PATTERN
 * FLAVOR: the generator emits two shapes —
 *   1. escaped literals (MatchValue#escape_regexp_characters backslashes
 *      every non-word char): JS non-unicode RegExp accepts these verbatim
 *      as Annex-B identity/syntax escapes (`\ `, `\-`, `\.` all match the
 *      literal character) — runtime-verified on node 24;
 *   2. raw `~~` passthrough patterns (user-authored Ruby/MySQL regexps):
 *      common syntax (classes, anchors, quantifiers, alternation) is
 *      flavor-compatible; the MySQL-only constructs (POSIX bracket
 *      classes, [[:<:]]/[[:>:]] word boundaries) are TRANSLATED to JS
 *      equivalents before compiling, and \p{...} switches the compile to
 *      `u` mode. Anything still untranslated fails the compile — the UDF
 *      then throws and the query errors (MySQL errors on a bad regexp
 *      too; no silent divergence — docs/decisions/0005-cql-match-semantics.md
 *      "Decision" items 1-2).
 *
 * ARGUMENT ORDER: SQLite evaluates `X REGEXP Y` as `regexp(Y, X)` — the
 * PATTERN is the first UDF argument, the COLUMN VALUE the second
 * (runtime-verified: better-sqlite3 13.0.3, SQLite 3.53.4).
 */

import type { LocalSqliteDriver } from "../server/drivers/local-sqlite.js";

/** Compiled-pattern cache: CQL statements re-run with the same terms far
 *  more often than distinct terms appear. Bounded (cleared) so a long-lived
 *  process cannot grow it without limit. */
const PATTERN_CACHE_LIMIT = 512;
const patternCache = new Map<string, RegExp | null>();

/** The POSIX bracket classes MySQL's regex accepts and JS does not — the
 *  translation table (docs/decisions/0005-cql-match-semantics.md "Decision" item 1: the
 *  ASCII-faithful members; MariaDB's ICU spellings beyond these were not
 *  exercised by the capture battery). Each replacement carries its own
 *  brackets (the POSIX spelling `[[:alpha:]]` is a COMPLETE class, not a
 *  class body). The `[[..]]` bracket-colon-bracket shape cannot occur in a
 *  JS-meaningful pattern otherwise, so a plain global replace is total. */
const POSIX_CLASS_TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\[\[:alpha:\]\]/g, "[A-Za-z]"],
  [/\[\[:digit:\]\]/g, "[0-9]"],
  [/\[\[:alnum:\]\]/g, "[A-Za-z0-9]"],
  [/\[\[:upper:\]\]/g, "[A-Z]"],
  [/\[\[:lower:\]\]/g, "[a-z]"],
  [/\[\[:space:\]\]/g, "[ \\t\\r\\n\\v\\f]"],
  [/\[\[:blank:\]\]/g, "[ \\t]"],
  [/\[\[:punct:\]\]/g, "[!-/:-@\\[-`{-~]"],
  [/\[\[:word:\]\]/g, "[A-Za-z0-9_]"],
  [/\[\[:xdigit:\]\]/g, "[0-9A-Fa-f]"],
  // MySQL 5.x word boundaries (MariaDB accepts, MySQL 8 ICU errors —
  // server-side variance documented in the decision); JS \b is the same
  // ASCII word-boundary notion for the patterns the battery pins.
  [/\[\[:<:\]\]/g, "\\b"],
  [/\[\[:>:\]\]/g, "\\b"],
];

/** Translate the MySQL/PCRE constructs JS RegExp lacks INTO JS syntax.
 *  POSIX classes rewrite in place (`[[:alpha:]]` is already inside its own
 *  brackets — the translation fills the class body); the word boundaries
 *  become `\\b`. Everything else passes through verbatim: the
 *  escaped-literal shape relies on Annex-B identity escapes and must not
 *  be touched. */
function translateMysqlPattern(pattern: string): string {
  let out = pattern;
  for (const [from, to] of POSIX_CLASS_TRANSLATIONS) {
    out = out.replace(from, to);
  }
  return out;
}

/** Compile `source` with `flags`, null on failure. */
function compileOrNull(source: string, flags: string): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** Compile one MySQL-flavored pattern to a JS RegExp. Returns null when the
 *  pattern cannot compile — the UDF and the post-filter executor TURN THAT
 *  INTO A THROWN ERROR ("invalid REGEXP pattern"), per
 *  docs/decisions/0005-cql-match-semantics.md "Decision" item 2: anything still
 *  untranslated must throw (a query that fails is debuggable; a query that
 *  silently drops rows is corruption — the three captured silent
 *  no-matches were exactly that failure shape). Shared with the
 *  post-filter executor (executeQuery's REGEXP-on-edge fallback runs the
 *  SAME compile logic — one matching implementation, per
 *  docs/decisions/0005-cql-match-semantics.md). */
export function compileMatchPattern(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null = null;
  // "i" — MySQL REGEXP is case-insensitive by default (see header).
  // Non-unicode mode is required for the escaped-literal shape (it
  // relies on Annex-B identity escapes, `u` mode rejects them). The
  // `u` flag is added ONLY when the pattern carries a \p{...} class —
  // raw `~~` passthrough patterns cannot contain the escaped-literal
  // shape, so `u` is safe exactly there (the decision's rule).
  const unicode = /\\p\{/.test(pattern);
  const translated = translateMysqlPattern(pattern);
  const flags = unicode ? "iu" : "i";
  compiled = compileOrNull(translated, flags);
  if (compiled === null && unicode) {
    // V8 has no bare-script shorthand: \p{Han} is "Invalid property name"
    // in `u` mode (node 24 probe) while ICU/MySQL accepts it — retry with
    // every property escape spelled \p{Script=Name}. A GENERAL CATEGORY
    // (\p{L} etc.) compiles as-is, so the retry only fires for patterns
    // whose first compile failed; a pattern mixing a category and a script
    // (both spellings) fails the retry and throws — still no silent rows.
    const scripted = translated.replace(
      /\\p\{([A-Za-z]+)\}/g,
      (_m, name: string) => `\\p{Script=${name}}`,
    );
    compiled = compileOrNull(scripted, flags);
  }
  if (patternCache.size >= PATTERN_CACHE_LIMIT) patternCache.clear();
  patternCache.set(pattern, compiled);
  return compiled;
}

/**
 * The UDF itself: `regexp(pattern, value)` -> 1 (match), 0 (no match),
 * or NULL (either operand NULL — SQL NULL-propagation semantics, so
 * `name REGEXP ?` never matches the NULL name of a compound card).
 */
export function sqliteRegexpUdf(pattern: unknown, value: unknown): number | null {
  if (pattern === null || pattern === undefined || value === null || value === undefined) {
    return null;
  }
  if (typeof pattern !== "string" || typeof value !== "string") return 0;
  const compiled = compileMatchPattern(pattern);
  if (compiled === null) {
    throw new Error(`invalid REGEXP pattern: ${pattern}`);
  }
  return compiled.test(value) ? 1 : 0;
}

/**
 * Register the REGEXP UDF on a LocalSqliteDriver. Call once at bootstrap,
 * before the first match query runs (SQLite resolves functions at
 * statement-prepare time). Deterministic registration is both true (the
 * function is pure) and useful: it lets SQLite use the function in any
 * context and caches compiled patterns per connection.
 */
export function registerSqliteRegexpFunction(driver: LocalSqliteDriver): void {
  driver.registerFunction("regexp", sqliteRegexpUdf, { deterministic: true });
}
