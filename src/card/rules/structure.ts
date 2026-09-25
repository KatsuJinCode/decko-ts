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
 * index. Junction rows in the corpus deck carry key=NULL (only simple
 * cards carry key), so a flat CASE that walks one or two joins misses the
 * depth-3 set rows entirely — measured 24/139 *type plus right rules with
 * composed_key=NULL on the raw corpus, which short-circuits 2,573 card-
 * engine byte-diffs to db_content (every card governed by a *type plus
 * right rule). The recursive CTE closes the gap: 139/139 compose.
 */
export function structureRuleUniverseStatement(): SQLStatement {
  return {
    sql:
      `WITH RECURSIVE name_walk(id, composed) AS (\n` +
      `  -- Base case: simple cards (no left, no right) use their stored key\n` +
      `  SELECT id, COALESCE("key", '')\n` +
      `  FROM cards\n` +
      `  WHERE left_id IS NULL AND right_id IS NULL AND trash = 0\n` +
      `  UNION ALL\n` +
      `  -- Junction case: compose left-walk + right-key\n` +
      `  SELECT c.id, COALESCE(w.composed, '') || '+' || COALESCE(r."key", '')\n` +
      `  FROM cards c\n` +
      `  JOIN name_walk w ON w.id = c.left_id\n` +
      `  JOIN cards r ON r.id = c.right_id\n` +
      `  WHERE c.trash = 0\n` +
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
      `                    WHERE ("key" = '${STRUCTURE_SETTING_NAME}' OR name = '${STRUCTURE_SETTING_NAME}')\n` +
      `                      AND trash = 0 ORDER BY id LIMIT 1)`,
    params: [],
  };
}

/**
 * Map rule-card composed key -> the rule card's db_content (null = the row's
 * NULL content; Ruby: default_content nil -> no structured content). Built
 * from the universe statement's batch result.
 */
export function structureUniverseFromResults(
  result: SQLQueryResult | undefined,
): Map<string, string | null> {
  const universe = new Map<string, string | null>();
  if (result === undefined) return universe;
  for (const row of result.rows as Array<{ composed_key: string | null; db_content: string | null }>) {
    if (row.composed_key === null) continue;
    universe.set(row.composed_key, row.db_content);
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
 */
export function structureRuleTypesFromResults(
  result: SQLQueryResult | undefined,
): Map<string, number> {
  const types = new Map<string, number>();
  if (result === undefined) return types;
  for (const row of result.rows as Array<{ composed_key: string | null; rule_type_id: number | null }>) {
    if (row.composed_key === null || row.rule_type_id === null) continue;
    types.set(row.composed_key, row.rule_type_id);
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
 * is a documented remainder, see docs/structure-templates-parity-notes.md).
 *
 * `recordDbContent` is the card's own stored db_content (undefined/null
 * alike); the returned string is what RenderCard.dbContent carries for the
 * render.
 */
export function structuredCardContent(
  card: PatternCardInput,
  recordDbContent: string | null | undefined,
  universe: Map<string, string | null>,
): string {
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
 */
export function templateReferenceNames(templateContent: string): string[] {
  const names: string[] = [];
  for (const ref of referencedNames(templateContent)) {
    if (ref.relative) continue;
    if (ref.name !== "") names.push(ref.name);
  }
  return names;
}
