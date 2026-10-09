// The statement a SECOND query over the same search card sees in Ruby.
//
// card-1.110.0 lib/card/query/card_query/interpretation.rb#relate_multi_value
// reads a multi-valued relational attribute's leading conjunction with
// `val.shift`, mutating the array in the card's cached cql_hash
// (cql_search.rb#cql_hash memoizes it, and standardized_query_args merges it
// shallowly, so nested hashes and arrays are shared). The first query of a
// request (the card_list's item search) therefore consumes every leading
// `"in"`/`"any"`/`"or"`/`"all"`/`"and"` of those arrays, and a later query
// built from the same hash with other arguments (the paging count,
// 0_search.rb#count_with_params) reads them without it, i.e. with the default
// :and conjunction. `{"not": {"type": ["in", "A", "B"]}}` thus counts as
// `not (type = A and type = B)`: every card.
//
// This reproduces that defect for the paging count so the rendered totals
// match Ruby; it is a candidate for an upstream fix (relate_multi_value
// should not mutate its argument).

/** card-1.110.0 lib/card/query.rb CONJUNCTIONS keys. */
const CONJUNCTION_WORDS = new Set(["any", "in", "or", "all", "and"]);

/** Attributes interpreted through `relate` (query.rb ATTRIBUTES :relational
 *  and :plus_relational). */
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
 * A deep copy of `statement` with every leading conjunction word removed from
 * the multi-valued relational attributes the first query interpreted.
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
