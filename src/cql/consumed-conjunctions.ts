// The statement a SECOND query over the same search card sees.
//
// A search runs at least twice per render: once to fetch the page of items,
// once to count the rows behind the pager. Both queries are built from one
// statement object, and that object is interpreted in place — resolving a
// multi-valued relational attribute pops the leading "in"/"any"/"or"/"all"/
// "and" off the front of its value array and interprets the rest as the
// attribute's values. Nothing puts the popped word back.
//
// So by the time the count query reads the statement, those arrays are one
// element shorter and the conjunction they used to name is gone; the values
// are now read as a conjunction of their own. `{"not": {"type": ["in", "A",
// "B"]}}` was "type is A or B" on the first pass and becomes the default
// and-conjunction on the second, which widens the count to every card.
//
// This module hands the pager the statement as the count query will see it,
// so the rendered total agrees with the items above it. The defect itself
// belongs at the other end: interpretation should not mutate its argument.

/** Conjunction words a value array may lead with. */
const CONJUNCTION_WORDS = new Set(["any", "in", "or", "all", "and"]);

/** Attributes whose values may carry a leading conjunction word. */
const RELATIONAL_KEYS = new Set([
  "type", "part", "left", "right",
  "editor_of", "edited_by", "last_editor_of", "last_edited_by",
  "creator_of", "created_by", "updater_of", "updated_by",
  "link_to", "linked_to_by", "include", "included_by",
  "nest", "nested_by", "refer_to", "referred_to_by",
  "member_of", "member", "found_by", "not", "sort", "match",
  "name_match", "complete",
  "plus", "left_plus", "right_plus",
]);

/** Attributes whose values are interpreted as further clauses. */
const CLAUSE_KEYS = new Set([...RELATIONAL_KEYS, "and", "or", "all", "any"]);

/**
 * A deep copy of `statement` with the leading conjunction word stripped from
 * every multi-valued relational attribute, standing in for the mutation the
 * first query's in-place interpretation has already performed.
 */
export function statementAfterFirstQuery(statement: Record<string, unknown>): Record<string, unknown> {
  return consumeClause(statement) as Record<string, unknown>;
}

function consumeClause(clause: unknown): unknown {
  if (Array.isArray(clause)) return clause.map(consumeClause);
  if (clause === null || typeof clause !== "object") return clause;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(clause as Record<string, unknown>)) {
    if (!CLAUSE_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    let next = value;
    if (
      RELATIONAL_KEYS.has(key) &&
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      CONJUNCTION_WORDS.has(value[0])
    ) {
      next = value.slice(1);
    }
    out[key] = consumeClause(next);
  }
  return out;
}
