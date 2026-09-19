/**
 * Value-normalization helpers for the CQL port.
 *
 * All behavior is ported from card-1.110.0 + cardname-0.20.0 (cited per
 * function). Where a helper needs the card-name algebra that the concurrent
 * card/name stream owns (HTML entity decoding, singularize inflection, full
 * contextual absolutization), the implementation here is a documented,
 * marked approximation and accepts an injectable override in ParseOptions.
 */

import { CqlBadQuery } from "./ast.js";
import { SAFE_SQL_RE } from "./constants.js";

/** Ruby's `\W` (ASCII): every char outside [A-Za-z0-9_] */
const NON_WORD_RE = /[^A-Za-z0-9_]/g;

/**
 * MatchValue#parse_match_term_and_prefix: split "=~/~"-prefixed match values.
 * "~~term" -> raw regexp passthrough; "=term" -> exact; "~term"/"term" -> plain.
 */
export function parseMatchTermAndPrefix(raw: string): { prefix: string; term: string } {
  const match = /^([=~]*)\s*([\s\S]*)$/.exec(raw);
  if (!match) return { prefix: "", term: raw };
  return { prefix: match[1] ?? "", term: match[2] ?? "" };
}

/**
 * MatchValue#escape_regexp_characters: every non-word character is
 * backslash-escaped so the term matches literally (unless the "~~" prefix
 * bypassed this).
 */
export function escapeRegexpCharacters(term: string): string {
  return term.replace(NON_WORD_RE, "\\$&");
}

/**
 * Normalization#normalize_string_value: `$var` replacement happens in the
 * parser (needs vars). Values containing a word-boundary underscore are
 * absolutized against the context (Cardname#absolute).
 */
export const NEEDS_ABSOLUTIZE_RE = /\b_/;

/**
 * Cardname::Contextual#absolute — the relative-part forms card-1.110.0
 * supports. Ported fully for _self/_whole/_, _left, _right and _N; the
 * _user/_main/_L*R forms depend on session/params/global state that does not
 * exist in a pure parser, so they are left in place and reported via
 * `onWarning` (see docs/cql-port-notes.md, deferred list).
 *
 * Approximations vs cardname-0.20.0:
 * - HTML entity decoding (Cardname#decoded) is not applied.
 * - absolutize_extremes skips the "context already starts/ends with these
 *   parts" guard.
 */
export function absolutizeName(
  name: string,
  context: string,
  onWarning?: (message: string) => void,
): string {
  const contextParts = context === "" ? [] : context.split("+");
  const contextTrunk = contextParts.slice(0, -1).join("+");
  const contextTag = contextParts.at(-1) ?? "";

  const newParts = name.split("+").map((part) => {
    const lower = part.toLowerCase();
    if (lower === "_user") {
      onWarning?.("CQL '_user' absolutization needs the session (deferred); left in place");
      return part;
    }
    if (lower === "_main") {
      onWarning?.("CQL '_main' absolutization needs main-name params (deferred); left in place");
      return part;
    }
    if (lower === "_self" || lower === "_whole" || part === "_") return context;
    if (lower === "_left") return contextTrunk;
    if (lower === "_right") return contextTag;
    const ordinal = /^_(\d+)$/.exec(part);
    if (ordinal) {
      const pos = Math.min(Number(ordinal[1]), contextParts.length);
      return contextParts[pos - 1] ?? "";
    }
    if (/^_(l*)(r?)$/i.test(part)) {
      onWarning?.(`CQL part '${part}' partmap absolutization is deferred; left in place`);
      return part;
    }
    return part;
  });

  if (newParts.length === 0) return "";
  // absolutize_extremes: empty leading/trailing parts pull in the context
  if (newParts[0] === "") newParts[0] = context;
  if (newParts[newParts.length - 1] === "") newParts[newParts.length - 1] = context;
  return newParts.map((p) => p.trim()).join("+");
}

/**
 * Cardname#key (simple_key + part_keys.join("+")).
 *
 * MARKED APPROXIMATION: applies ActiveSupport-style underscore + downcase and
 * the OK4KEY_RE character filter (cardname.rb: OK4KEY_RE = '\p{Word}\*'), but
 * NOT the singularize inflection (cardname defaults uninflect: :singularize,
 * stabilize: false) and not HTML entity decoding. "Joe Admin" -> "joe_admin"
 * and "A+B" -> "a+b" match the oracle; plural words diverge ("Admins" ->
 * "admins" here, "admin" in Ruby) until the card/name stream's inflector is
 * injectable. ParseOptions.nameToKey overrides this.
 */
export function defaultNameToKey(name: string): string {
  return name
    .split("+")
    .map((part) => {
      // ActiveSupport String#underscore + downcase
      const underscored = part
        .replace(/::/g, "/")
        .replace(/([A-Z\d]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .replace(/-/g, "_")
        .toLowerCase();
      // cardname simple_key: non-OK4KEY runs -> "_", split, drop empties, join
      const cleaned = underscored.replace(/[^\p{L}\p{M}\p{N}\p{Pc}*]+/gu, "_");
      return cleaned
        .split(/_+/)
        .filter((chunk) => chunk !== "")
        .join("_");
    })
    .join("+");
}

/** Query.safe_sql (query.rb): raises on characters outside the allowed set */
export function safeSql(text: string): string {
  const txt = String(text);
  if (SAFE_SQL_RE.test(txt)) {
    throw new CqlBadQuery(`CQL contains disallowed characters: ${txt}`);
  }
  return txt;
}

/**
 * Value#parse_simple_value: strings and integers pass; nil passes; anything
 * else (floats, booleans, hashes...) raises. (Symbols cannot arrive over
 * JSON and are treated as strings by callers before this point.)
 */
export function assertSimpleValue(value: unknown): string | number | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (value === null) return null;
  throw new CqlBadQuery(`Invalid property value: ${JSON.stringify(value)}`);
}
