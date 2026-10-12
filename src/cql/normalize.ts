/**
 * Value-normalization helpers for CQL.
 *
 * Name-key generation and relative-name absolutization delegate to the card
 * name stream (`src/card/name.ts`, DeckoName), which owns the inflections and
 * the contextual layer; these helpers are the thin CQL-shaped surface over it.
 */

import { DeckoName } from "../card/name.js";
import { getNameEnvironment } from "../card/name/environment.js";
import { CqlBadQuery } from "./ast.js";
import { SAFE_SQL_RE } from "./constants.js";

/** ASCII non-word: every character outside [A-Za-z0-9_] */
const NON_WORD_RE = /[^A-Za-z0-9_]/g;

/**
 * Split a "=~/~"-prefixed match value into its prefix and term.
 * "~~term" -> raw regexp passthrough; "=term" -> exact; "~term"/"term" -> plain.
 */
export function parseMatchTermAndPrefix(raw: string): { prefix: string; term: string } {
  const match = /^([=~]*)\s*([\s\S]*)$/.exec(raw);
  if (!match) return { prefix: "", term: raw };
  return { prefix: match[1] ?? "", term: match[2] ?? "" };
}

/**
 * Escape a term so it matches literally: every non-word character is
 * backslash-escaped (unless the "~~" prefix bypassed this).
 */
export function escapeRegexpCharacters(term: string): string {
  return term.replace(NON_WORD_RE, "\\$&");
}

/**
 * Marker for a value that has to be absolutized against the query context.
 * `$var` replacement happens in the parser (it needs the vars map); this
 * pattern only decides whether a relative-name lookup is coming.
 */
export const NEEDS_ABSOLUTIZE_RE = /\b_/;

/**
 * Does this name contain a contextual part at all? The pattern is
 * case-insensitive because every part form is matched case-insensitively;
 * it is used ONLY to decide whether a missing-context warning can apply.
 * The actual absolutization is DeckoName's.
 */
const CONTEXTUAL_FORM_RE = /\b_(?:left|right|whole|self|user|main|\d+|L*R?)\b/i;

/** One part of a contextual name — same alternation, anchored to the whole
 *  part so a part is either entirely contextual or not contextual at all. */
const CONTEXTUAL_PART_RE = /^_(left|right|whole|self|user|main|\d+|L*R?)$/i;

function rubyBlank(value: string): boolean {
  return /^\s*$/.test(value);
}

/**
 * Absolutize a possibly-relative name against the query's context.
 *
 * Delegates to the name layer (`DeckoName.absolute`), so all relative forms
 * resolve for real: _self/_whole/_, _left (context trunk), _right (context
 * tag), _N ordinals, _L*R partmaps, _user (the session name) and _main (the
 * environment's main name) via the injectable NameEnvironment, plus the
 * blank-extreme guard that falls an extreme part back to the context.
 *
 * The warnings are additive and non-fatal — absolutization succeeds either
 * way. `onWarning` fires when a contextual part cannot resolve to anything
 * meaningful in the current environment:
 * - a context-dependent part (_self/_left/_right/_N/_L*R) with a blank
 *   context (a query with no context starts from ""),
 * - `_user` with no session name in the NameEnvironment (the part is left
 *   in place),
 * - `_main` with no main name in the NameEnvironment (it resolves to "",
 *   so a blank extreme part falls back to the context).
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
 * The default name -> key mapping, delegated to the name layer
 * (`DeckoName.parse(name).key`). Every CQL site that needs a key — a
 * standard_sql value, an exact name match, a `complete` match attribute —
 * funnels through here so they cannot drift apart.
 *
 * The key is: downcase, space/separator -> underscore, HTML entity decoding,
 * AND the singularize inflection ("Magnus" -> "magnu", "Admins" -> "admin",
 * "Octopi" -> "octopus"). Mark strings resolve through the name layer:
 * an unresolvable "~<id>" / ":<codename>" mark raises NameNotFoundError /
 * CodenameNotFoundError. `ParseOptions.nameToKey` still overrides this for
 * callers that want a different key source.
 */
export function defaultNameToKey(name: string): string {
  return DeckoName.parse(name).key;
}

/** Refuse text carrying characters outside the allowed set. */
export function safeSql(text: string): string {
  const txt = String(text);
  if (SAFE_SQL_RE.test(txt)) {
    throw new CqlBadQuery(`CQL contains disallowed characters: ${txt}`);
  }
  return txt;
}

/**
 * Strings, integers and nil pass; anything else (floats, booleans, hashes...)
 * raises. (Symbols cannot arrive over JSON and are treated as strings by
 * callers before this point.)
 */
export function assertSimpleValue(value: unknown): string | number | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (value === null) return null;
  throw new CqlBadQuery(`Invalid property value: ${JSON.stringify(value)}`);
}
