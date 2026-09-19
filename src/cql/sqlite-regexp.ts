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
 * docs/cql-execution-notes.md ("REGEXP on the edge").
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
 *      flavor-compatible; POSIX classes like [[:alpha:]] are NOT supported
 *      by JS and will fail the compile — the UDF then throws and the query
 *      errors (MySQL errors on a bad regexp too; no silent divergence).
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

/** Compile one MySQL-flavored pattern to a JS RegExp. Returns null when the
 *  pattern cannot compile; the UDF turns that into a thrown error so a bad
 *  pattern surfaces as a query failure, never as silently-empty results. */
function compilePattern(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null = null;
  try {
    // "i" — MySQL REGEXP is case-insensitive by default (see header).
    // Non-unicode mode is required: the escaped-literal shape relies on
    // Annex-B identity escapes (`\ ` etc.), which `u` mode rejects.
    compiled = new RegExp(pattern, "i");
  } catch {
    compiled = null;
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
  const compiled = compilePattern(pattern);
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
