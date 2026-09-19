/**
 * Value-normalization helpers for the CQL port.
 *
 * All behavior is ported from card-1.110.0 + cardname-0.20.0 (cited per
 * function). Name-key generation and relative-name absolutization delegate to
 * the landed card/name stream (`src/card/name.ts`, DeckoName), which carries
 * the full ActiveSupport inflections and the contextual layer; see the
 * reconciliation section in docs/cql-port-notes.md.
 */

import { DeckoName } from "../card/name.js";
import { getNameEnvironment } from "../card/name/environment.js";
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
 * cardname-0.20.0 lib/cardname/contextual.rb RELATIVE_REGEXP, made
 * case-insensitive to mirror the per-part branches of
 * `absolutize_contextual_parts` (/^_user$/i, /^_left$/i, ...). Used only to
 * decide when a missing-context warning applies; the actual absolutization is
 * DeckoName's.
 */
const CONTEXTUAL_FORM_RE = /\b_(?:left|right|whole|self|user|main|\d+|L*R?)\b/i;

/** one part of a contextual name, matched like absolutize_contextual_parts */
const CONTEXTUAL_PART_RE = /^_(left|right|whole|self|user|main|\d+|L*R?)$/i;

function rubyBlank(value: string): boolean {
  return /^\s*$/.test(value);
}

/**
 * Normalization#normalize_string_value (card-1.110.0
 * lib/card/query/card_query/normalization.rb:57): `val.to_name.absolute(context)`.
 *
 * Delegates to the landed name layer (`DeckoName.absolute`, port of cardname
 * lib/cardname/contextual.rb#absolute), so all relative forms now resolve for
 * real: _self/_whole/_, _left (context trunk), _right (context tag), _N
 * ordinals, _L*R partmaps, _user (Card::Name.session) and _main
 * (Card::Env.params[:main_name]) via the injectable NameEnvironment, plus the
 * absolutize_extremes blank-extreme guard (contextual.rb#absolutize_extremes).
 *
 * Additive, non-fatal diagnostics (Ruby resolves silently): a warning is
 * emitted via `onWarning` when a contextual part cannot resolve to anything
 * meaningful in the current environment -
 * - a context-dependent part (_self/_left/_right/_N/_L*R) with a blank
 *   context (AbstractQuery#context defaults to "" at the root,
 *   abstract_query.rb:73),
 * - `_user` with no session name in the NameEnvironment (Ruby leaves the part
 *   in place when `Card::Name.session` is nil),
 * - `_main` with no main name in the NameEnvironment (Ruby resolves to ""
 *   via `Card::Env.params[:main_name]`; a blank extreme part then falls back
 *   to the context per absolutize_extremes — verified live).
 */
export function absolutizeName(
  name: string,
  context: string,
  onWarning?: (message: string) => void,
): string {
  const parsed = DeckoName.parse(name);
  if (CONTEXTUAL_FORM_RE.test(name)) {
    warnUnresolvedContextualParts(parsed, context, onWarning);
  }
  return parsed.absolute(context);
}

function warnUnresolvedContextualParts(
  parsed: DeckoName,
  context: string,
  onWarning?: (message: string) => void,
): void {
  const environment = getNameEnvironment();
  for (const part of parsed.parts) {
    if (!CONTEXTUAL_PART_RE.test(part)) continue;
    if (/^_user$/i.test(part)) {
      if (environment?.session === undefined) {
        onWarning?.(
          "CQL '_user' left in place: no session name in the name environment " +
            "(Ruby: Card::Name.session, card-1.110.0 lib/card/name.rb#session)",
        );
      }
    } else if (/^_main$/i.test(part)) {
      if (environment?.mainName === undefined) {
        onWarning?.(
          "CQL '_main' has no main name in the name environment (Ruby: " +
            "Card::Env.params[:main_name], cardname lib/cardname/contextual.rb#absolutize_contextual_parts); " +
            "it resolves to '' and a blank extreme part falls back to the context",
        );
      }
    } else if (rubyBlank(context)) {
      onWarning?.(
        `CQL part '${part}' absolutized against an empty context (no 'context' ` +
          "in the statement or ParseOptions.context; Ruby AbstractQuery#context defaults to '')",
      );
    }
  }
}

/**
 * Cardname#key via the real name layer (this is what Ruby's CQL code calls:
 * `v.to_name.key` — card-1.110.0 lib/card/query/value.rb#standard_sql:29,
 * `match_term.to_name.key` — lib/card/query/value/match_value.rb#exact_name_match:25,
 * `val.to_name.key` — lib/card/query/card_query/match_attributes.rb#complete:26;
 * `String#to_name` is `Card::Name.new` per
 * config/initializers/01_core_extensions/object.rb).
 *
 * Delegates to `DeckoName.parse(name).key` (port of Cardname#key via
 * variants.rb#stable_key + ActiveSupport inflections): downcase,
 * space/separator -> underscore, HTML entity decoding, AND the
 * singularize inflection ("Magnus" -> "magnu", "Admins" -> "admin",
 * "Octopi" -> "octopus" — all live-oracle-verified against cardname 0.20.0).
 * Mark strings resolve exactly as Ruby's `Card::Name.new` does: an
 * unresolvable "~<id>" / ":<codename>" mark raises NameNotFoundError /
 * CodenameNotFoundError from the name layer (lib/card/name.rb#bad_mark).
 * `ParseOptions.nameToKey` still overrides this for callers that want a
 * different key source.
 */
export function defaultNameToKey(name: string): string {
  return DeckoName.parse(name).key;
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
