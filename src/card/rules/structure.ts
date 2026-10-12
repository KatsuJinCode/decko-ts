// Structured content — the *structure rule template mechanism. A card whose
// set carries an applicable *structure rule renders the RULE's content, not
// its own db_content; the card's name is the substitution context for every
// nest inside the template ({{_self}}, {{_left|view}}, ... resolve against
// the structured card at render time).
//
// Ruby ports (every mechanism claim cites the gem file):
// - lib/card/content/all.rb:8-10 (card-1.110.0):
//     def content
//       structured_content || standard_content
//     end
// - content/all.rb:25-27: structured_content = structure && default_content
//   (the applicable template's db_content; nil template content falls
//   through — Ruby && short-circuits on nil).
// - content/all.rb:17-19: standard_content = db_content ||
//   (new_card? ? default_content : "") — for persisted (real) cards:
//   db_content || "".
// - card-mod-content-0.20.0 set/all/templating.rb:40-42:
//     def structure
//       template&.is_structure? ? template : nil
//     end
// - templating.rb:44-48 (structure_rule_card): the rule card from
//   `rule_card :structure` (lib/card/rule/all.rb:9-14 — the first hit in
//   pattern-precedence order), NIL-ed when its db_content.strip == "_self".
//   The walk does NOT continue past a "_self" hit: the first existing
//   <set>+*structure card decides, and "_self" means "no structure".
// - templating.rb:11-13 (is_structure?): the rule card's right-part codename
//   must be :structure — true by name-construction for <set>+*structure
//   cards; see the module note at the bottom for the codename nuance.
// - card-1.110.0 mod/core/set/all/content.rb:26-28:
//     def default_content
//       template&.db_content
//     end
// - Every content view flows through Card#content:
//   card-mod-format-0.20.0 set/all/base.rb:75-77 (`view :raw` ->
//   structure_card&.content) and base.rb:85-87 (`view :core` ->
//   process_content _render_raw). So one content-level substitution covers
//   raw/core/open/closed alike — the TS port's views read the single
//   RenderCard.dbContent accessor (render/format.ts#renderRaw), which the
//   render engine populates through resolveStructuredContent.
//
// The candidate walk reuses the landed rule-name algebra
// (set-patterns/rule-names.ts#ruleNamesForCard: set_names in
// Set::Pattern::All#concrete_patterns order, lib/card/set/pattern/all.rb:23,
// 57-59, each joined to the setting name "*structure").

import { DeckoName, type Nameish } from "../name.js";
import { CodenameNotFoundError, NameNotFoundError } from "../name/errors.js";
import type { SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import { referencedNames } from "../render/nest-syntax.js";

/** The setting card name for structure templates (the codename "structure"
 *  builds "*structure" — every decko setting card is named by its codename). */
export const STRUCTURE_SETTING_NAME = "*structure";

/**
 * The bulk rule-card fetch folded into the cold render's closure batch
 * (decko-commons/decko#1282 shape: the structure resolution costs ZERO extra
 * round trips — one statement alongside the walk/permission/codehash
 * statements, and ~zero wall time: every join rides a primary key or the
 * cards_right_id index).
 *
 * Match shape: a *structure rule row's RIGHT side IS the *structure setting
 * card, so the universe is found by an indexed right_id lookup — no whole-
 * deck scan (the prefetch walk's `resolved` CTE shape measured 5 s/call on
 * rule-dense seeds; this form stays indexed). The rule's COMPOSED key (the
 * match key for the candidate walk below) is built from its SET card via a
 * recursive name-composition CTE that walks the left_id/right_id chain to
 * the leaves:
 *   - anchorless sets ("*all") are simple rows: composed = stored key;
 *   - depth-2 anchored sets ("quiz+*type") are 1-junction rows: leaf key +
 *     pattern card key;
 *   - depth-3 anchored sets ("Basic+RVW+*type plus right") are 2-junction
 *     rows: leaf1 key + leaf2 key + pattern card key — exactly the shape
 *     *type plus right rules take (the rule's set card is a junction whose
 *     left side is itself a junction of the card's TYPE + the right tag).
 *
 * The recursive CTE composes the canonical name from the stored left_id /
 * right_id chain at every depth; the rule-card join rides the right_id
 * index. Junction rows commonly carry key=NULL (only simple
 * cards carry key), so a flat CASE that walks one or two joins misses the
 * depth-3 set rows entirely — measured 24/139 *type plus right rules with
 * composed_key=NULL, which short-circuits thousands of card renders to
 * db_content (every card governed by a *type plus
 * right rule). The recursive CTE closes the gap: 139/139 compose.
 */
export function structureRuleUniverseStatement(): SQLStatement {
  return ruleUniverseStatementBySetting(STRUCTURE_SETTING_NAME);
}

/** The setting whose rule universe the *default machinery reads (the
 *  new-card template: Ruby's new_card_template, card-mod-content
 *  set/all/templating.rb — a nest-miss child inherits the *default rule
 *  card's TYPE, mod/core/set/all/type.rb:78-80 type_id_from_template). */
export const DEFAULT_SETTING_NAME = "*default";

/**
 * The same universe shape for an ARBITRARY setting, so a nest-miss child
 * (Ruby's new_card from
 * format/nest/fetch.rb#new_card) can resolve the *default rule card's
 * type_id — those children render with the
 * rule's type (an absent "+Discussion" child renders
 * data-card-type-id=3 RichText from the discussion+*right+*default rule
 * card's own type). Deliberately the SAME statement shape as the structure
 * universe (one indexed right_id join + the composed-key CTE) so the
 * perf contract holds: one statement, folded into the cold batch.
 */
export function ruleUniverseStatementBySetting(settingName: string): SQLStatement {
  if (typeof process !== "undefined" && process.env?.DECKO_LEGACY_RULE_UNIVERSE === "1") {
    return legacyRuleUniverseStatement(settingName);
  }
  return {
    // Rule universe by UPWARD walk: start at each rule's set card and climb
    // left_id to the simple base card, prepending each junction's right key.
    // Same rows (and order) as composing every name in the deck top-down
    // and joining, at O(rules x depth) instead of O(deck): measured 34 ms ->
    // 1 ms on the 21.7k-card trial deck. Trash is not filtered on the walk:
    // a trashed intermediate still carries its left/right ids (e.g. rule 829
    // has set card 828 trashed but walks through Gallery).
    sql:
      `WITH RECURSIVE\n` +
      `setting(id) AS (SELECT id FROM cards WHERE ("key" = ? OR name = ?) AND trash = 0 ORDER BY id LIMIT 1),\n` +
      `rules(rid, lid, db_content, type_id) AS (\n` +
      `  SELECT r.id, r.left_id, r.db_content, r.type_id FROM cards r\n` +
      `  WHERE r.trash = 0 AND r.right_id = (SELECT id FROM setting)),\n` +
      `up(rid, cur, suffix) AS (\n` +
      `  SELECT rid, lid, '' FROM rules\n` +
      `  UNION ALL\n` +
      `  SELECT u.rid, c.left_id, '+' || COALESCE(rk."key", '') || u.suffix\n` +
      `  FROM up u JOIN cards c ON c.id = u.cur JOIN cards rk ON rk.id = c.right_id\n` +
      `  WHERE c.left_id IS NOT NULL)\n` +
      `SELECT CASE WHEN COALESCE(b."key", '') || u.suffix <> ''\n` +
      `         THEN COALESCE(b."key", '') || u.suffix || '+' || st."key" ELSE NULL END AS composed_key,\n` +
      `  rules.db_content AS db_content, rules.type_id AS rule_type_id\n` +
      `FROM up u\n` +
      `JOIN cards b ON b.id = u.cur AND b.left_id IS NULL AND b.right_id IS NULL\n` +
      `JOIN rules ON rules.rid = u.rid\n` +
      `JOIN cards st ON st.id = (SELECT id FROM setting)\n` +
      `ORDER BY rules.rid`,
    // The setting name is bound, never interpolated into the SQL text —
    // settingName is a caller-supplied string.
    params: [settingName, settingName],
  };
}

/** The previous whole-deck top-down walk, kept for A/B measurement
 *  (DECKO_LEGACY_RULE_UNIVERSE=1). */
function legacyRuleUniverseStatement(settingName: string): SQLStatement {
  return {
    sql:
      `WITH RECURSIVE name_walk(id, composed) AS (\n` +
      `  -- Base case: simple cards (no left, no right) use their stored key\n` +
      `  SELECT id, COALESCE("key", '')\n` +
      `  FROM cards\n` +
      `  WHERE left_id IS NULL AND right_id IS NULL\n` +
      `  UNION ALL\n` +
      `  -- Junction case: compose left-walk + right-key. The walk does NOT\n` +
      `  -- filter on trash: a trashed intermediate card still carries its\n` +
      `  -- left_id/right_id and contributes to the composed name (mirrors\n` +
      `  -- the old SQL's LEFT JOIN chain through trashed junctions — e.g.\n` +
      `  -- rule 829 has set card 828 trashed but walks through Gallery).\n` +
      `  SELECT c.id, COALESCE(w.composed, '') || '+' || COALESCE(r."key", '')\n` +
      `  FROM cards c\n` +
      `  JOIN name_walk w ON w.id = c.left_id\n` +
      `  JOIN cards r ON r.id = c.right_id\n` +
      `)\n` +
      `SELECT\n` +
      `  CASE\n` +
      `    WHEN n.composed IS NOT NULL AND n.composed <> ''\n` +
      `      THEN n.composed || '+' || st."key"\n` +
      `    ELSE NULL\n` +
      `  END AS composed_key,\n` +
      `  r.db_content AS db_content,\n` +
      `  r.type_id AS rule_type_id\n` +
      `FROM cards r\n` +
      `JOIN cards st ON st.id = r.right_id\n` +
      `JOIN name_walk n ON n.id = r.left_id\n` +
      `WHERE r.trash = 0\n` +
      `  AND r.right_id = (SELECT id FROM cards\n` +
      `                    WHERE ("key" = ? OR name = ?)\n` +
      `                      AND trash = 0 ORDER BY id LIMIT 1)`,
    // The setting name is bound, never interpolated into the SQL text —
    // settingName is a caller-supplied string.
    params: [settingName, settingName],
  };
}

/** The *default rule universe: composed rule key -> the rule card's own
 *  type_id (the new-card type a nest-miss child inherits). */
export function defaultRuleUniverseStatement(): SQLStatement {
  return ruleUniverseStatementBySetting(DEFAULT_SETTING_NAME);
}

/**
 * The TYPE-NAME read for both template universes in ONE self-contained
 * statement: every *default/*structure rule card's type_id joined to its
 * type card's name. Rides the SAME cold prelude batch as the two universe
 * statements (the rule defaults load with the universes): newCardDefaultType's
 * dup_structure leg (templating.rb:61-65 — a *structure rule card can
 * BECOME the new-card template, contributing ITS type_id) must answer the
 * winning rule card's type NAME synchronously, so the names load with the
 * universes instead of an IN-list that needs the universe rows first.
 * Folded: +1 statement, +0 round trips (the prelude-prime
 * precedent).
 */
export function templateTypeNameStatement(): SQLStatement {
  return {
    sql:
      `SELECT DISTINCT c.type_id AS type_id, t.name AS name\n` +
      `FROM cards c\n` +
      `LEFT JOIN cards t ON t.id = c.type_id\n` +
      `WHERE c.trash = 0\n` +
      `  AND c.right_id IN (\n` +
      `    SELECT id FROM cards\n` +
      `    WHERE key IN ('*default', '*structure') AND trash = 0)\n` +
      `  AND c.type_id IS NOT NULL`,
    params: [],
  };
}

/**
 * Parse templateTypeNameStatement's rows into the id -> type-name map the
 * sync template-type resolution reads (defaultTypeNameById).
 */
export function templateTypeNamesFromResults(
  result: SQLQueryResult | undefined,
): Map<number, string> {
  const map = new Map<number, string>();
  if (result === undefined) return map;
  for (const row of result.rows as Array<{ type_id: number | null; name: string | null }>) {
    if (row.type_id === null || row.name === null || row.name === "") continue;
    map.set(row.type_id, row.name);
  }
  return map;
}

/**
 * Map rule-card composed key -> the rule card's db_content (null = the row's
 * NULL content; Ruby: default_content nil -> no structured content). Built
 * from the universe statement's batch result.
 *
 * Keys are canonicalized via DeckoName.key (singularize + underscore + space
 * fold) to match the candidate walk in resolveStructuredContent, which looks
 * up `DeckoName.parse(candidate).key`. The composed_key from the SQL is the
 * raw stored-key join ("Date+RVW+*type plus right+*structure") — the
 * canonical form is "date+rvw+*type_plu_right+*structure". Without this
 * canonicalization step, every *type plus right rule (and any future rule
 * whose set-card side has spaces / plurals) misses the candidate-walk
 * lookup and falls through to db_content.
 */
export function structureUniverseFromResults(
  result: SQLQueryResult | undefined,
): Map<string, string | null> {
  const universe = new Map<string, string | null>();
  if (result === undefined) return universe;
  for (const row of result.rows as Array<{ composed_key: string | null; db_content: string | null }>) {
    if (row.composed_key === null) continue;
    const canonicalKey = DeckoName.parse(row.composed_key).key;
    if (canonicalKey === "") continue;
    universe.set(canonicalKey, row.db_content);
  }
  return universe;
}

/**
 * Map rule-card composed key -> the RULE CARD's own type_id, from the same
 * universe rows. This is the virtual-card type source: a new (virtual) card's
 * `type_id_from_template` answers `template&.type_id` — the applicable
 * *structure rule card's type (mod/core/set/all/type.rb:78-80,
 * `type_id_from_template` -> `name && template&.type_id`) — because for a
 * card under a structure rule, `new_card_template` IS that rule card
 * (card-mod-content set/all/templating.rb:19-33: `structure =
 * dup_structure(default&.type_id)` returns the rule card, and
 * `assign_type_to?` then re-assigns the same id the template lookup already
 * yielded). Consumed by the fetch layer's virtual-card resolution
 * (src/card/fetch/virtual-cards.ts); real-card rendering never reads it.
 *
 * Keys canonicalized identically to structureUniverseFromResults — the
 * virtual-card lookup uses the same canonical key form.
 */
export function structureRuleTypesFromResults(
  result: SQLQueryResult | undefined,
): Map<string, number> {
  const types = new Map<string, number>();
  if (result === undefined) return types;
  for (const row of result.rows as Array<{ composed_key: string | null; rule_type_id: number | null }>) {
    if (row.composed_key === null || row.rule_type_id === null) continue;
    const canonicalKey = DeckoName.parse(row.composed_key).key;
    if (canonicalKey === "") continue;
    types.set(canonicalKey, row.rule_type_id);
  }
  return types;
}

export interface StructuredContentResult {
  /** The template content — the winning rule card's db_content verbatim
   *  ("" stays "": Ruby's structured_content is truthy for "" and WINS over
   *  db_content; only nil falls through). */
  templateContent: string;
  /** The full candidate name that won (diagnostics). */
  ruleName: string;
  /** Index into the candidate list (precedence position, diagnostics). */
  matchedIndex: number;
}

/**
 * templating.rb#structure + #structure_rule_card for one card: walk the
 * card's candidate rule names in pattern-precedence order; the FIRST
 * candidate that exists in the universe decides. "_self" content (after
 * Ruby strip — surrounding whitespace removed) nils the structure, exactly
 * like structure_rule_card's ternary; the walk does not continue.
 *
 * Returns undefined when no candidate exists, the winner is "_self", or the
 * winner's content is NULL (structured_content nil -> standard path).
 */
export function resolveStructuredContent(
  card: PatternCardInput,
  universe: Map<string, string | null>,
): StructuredContentResult | undefined {
  if (universe.size === 0) return undefined;
  const candidates = ruleNamesForCard(card, STRUCTURE_SETTING_NAME);
  for (let i = 0; i < candidates.length; i++) {
    const key = DeckoName.parse(candidates[i] as string).key;
    if (!universe.has(key)) continue;
    const content = universe.get(key) ?? null;
    if (content === null) return undefined; // default_content nil -> standard_content
    if (content.trim() === "_self") return undefined; // structure_rule_card nils it
    return { templateContent: content, ruleName: candidates[i] as string, matchedIndex: i };
  }
  return undefined;
}

/**
 * lib/card/content/all.rb#content for a persisted (real) card:
 * `structured_content || standard_content` where standard_content is
 * `db_content || ""` (content/all.rb:17-19 — the new_card? default_content
 * branch applies to cards not in the database; the *default template path
 * is a documented remainder
 *
 * `setModuleOverride` is the set-module CODE content override (the port of
 * Ruby's singleton-class `def content` hook; resolution = src/card/set-module-content-overrides.ts). In Ruby
 * the singleton ancestors precede the Card class, so an applicable set
 * module's `def content` shadows this ENTIRE method (structured_content
 * included) for every card.content caller — so the override must answer
 * here first. Undefined
 * (no wired module matches) falls through unchanged.
 *
 * `recordDbContent` is the card's own stored db_content (undefined/null
 * alike); the returned string is what RenderCard.dbContent carries for the
 * render.
 */
export function structuredCardContent(
  card: PatternCardInput,
  recordDbContent: string | null | undefined,
  universe: Map<string, string | null>,
  setModuleOverride?: string | undefined,
): string {
  if (setModuleOverride !== undefined) return setModuleOverride;
  const structured = resolveStructuredContent(card, universe);
  if (structured !== undefined) return structured.templateContent;
  return recordDbContent ?? "";
}

/**
 * The absolute-name references a template's content contributes to the
 * render closure. Template nests resolve against the STRUCTURED card's
 * context (Card::Content.new content, self — the structured card), so
 * relative refs are skipped here (render-time resolution); absolute refs
 * that exist as cards must be in the prefetched closure for warm renders
 * to stay warm and for nests to find them. Uses the REAL nest parser (the
 * same one the render path and the prefetch verification use) so escaped
 * and commented nests behave identically everywhere.
 *
 * `contextName` (round 9): when given, every non-underscore reference is
 * ABSOLUTIZED against that name before it is returned — the
 * chunk/reference.rb contract the walkers used to miss for plus-shaped
 * refs. Ruby absolutizes each reference against the REFERENCING card at
 * process time (nest-syntax.ts header cites the gem file); a template's
 * `{{+image}}` therefore names `<instance>+image`, NOT the literal key
 * "+image" the un-contextualized walk produced (which matched no row,
 * landed in structureRefMisses, and rendered every template child as the
 * unknown-card empty slot even when the child row existed — the round-9
 * live-wire gap). Underscore refs stay skipped: `_left`/`_main` resolve
 * against the render-time format context, not the name algebra alone.
 */
export function templateReferenceNames(
  templateContent: string,
  contextName?: DeckoName,
): string[] {
  // Request-scoped memo (DeckoName.requestMemo): the structure sweep walks
  // every seated card on every render, and the request-local live render
  // re-renders the page once per discovery pass. A result that dropped an
  // unresolved mark is not memoized: a later read may resolve it.
  // Keyed by the template string first: its hash is computed once per string
  // object, where a concatenated key would be re-hashed on every call.
  const byTemplate = DeckoName.requestMemo<Map<string, readonly string[]>>(TEMPLATE_REFERENCE_MEMO);
  let memo: Map<string, readonly string[]> | undefined;
  if (byTemplate !== undefined) {
    memo = byTemplate.get(templateContent);
    if (memo === undefined) {
      memo = new Map();
      byTemplate.set(templateContent, memo);
    }
  }
  const memoKey = contextName?.s ?? "";
  const hit = memo?.get(memoKey);
  if (hit !== undefined) return [...hit];
  const names: string[] = [];
  let dropped = false;
  for (const ref of referencedNames(templateContent)) {
    if (ref.relative) continue;
    if (ref.name === "") continue;
    if (contextName === undefined) {
      names.push(ref.name);
      continue;
    }
    try {
      names.push(DeckoName.parse(ref.name).absoluteName(contextName).s);
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        dropped = true;
        continue; // unresolved mark: the render's nest path reports it safely
      }
      throw err;
    }
  }
  if (memo !== undefined && !dropped) memo.set(memoKey, [...names]);
  return names;
}

/** Owner of templateReferenceNames' request memo. */
const TEMPLATE_REFERENCE_MEMO = {};
