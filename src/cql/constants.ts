/**
 * Constants for the CQL (Card Query Language) port.
 *
 * Truth source: card-1.110.0 lib/card/query.rb and lib/card/query/**.
 * Every constant below cites the Ruby location it was copied from.
 *
 * RECONCILIATION (schema stream): the table and column names here are copied
 * from the card-1.110.0 db/schema.rb assumptions query.rb makes. The
 * concurrently-written db/schema.sqlite.sql / src/server/schema.ts must use
 * the identical names
 * schema stream") for the checklist.
 */

/** tables referenced by query classes (CardQuery#table, ReferenceQuery#table, ActQuery#table, ActionQuery#table) */
export const CARDS_TABLE = "cards";
export const CARD_REFERENCES_TABLE = "card_references";
export const CARD_ACTIONS_TABLE = "card_actions";
export const CARD_ACTS_TABLE = "card_acts";

/** table_prefix per query class (CardQuery#table_prefix etc.) */
export const TABLE_PREFIX: Record<string, string> = {
  cards: "c",
  card_references: "cr",
  card_actions: "cn",
  card_acts: "cx",
};

/**
 * Columns of the cards table that CQL "basic" fields map onto.
 * query.rb Card::Query @attributes `basic` list. Note two of these are NOT
 * literal column names (Value::SQL_FIELD / SqlStatement#full_field):
 *   content -> db_content
 *   name    -> key       (only for comparisons/sorting; selecting name
 *                         selects name, left_id, right_id)
 * Column list copied from card-1.110.0 db/schema.rb create_table "cards".
 */
export const BASIC_FIELDS = [
  "id",
  "name",
  "key",
  "type_id",
  "content",
  "left_id",
  "right_id",
  "codename",
  "read_rule_id",
  "created_at",
  "updated_at",
  "creator_id",
  "updater_id",
] as const;

export type BasicField = (typeof BASIC_FIELDS)[number];

/** Value::SQL_FIELD — CQL field name -> physical column */
export const SQL_FIELD: Record<string, string> = {
  name: "key",
  content: "db_content",
};

/** card_references columns touched by ReferenceQuery */
export const REFERENCE_FIELDS = ["referer_id", "referee_id", "ref_type", "is_present"] as const;

/**
 * query.rb Card::Query::OPERATORS — raw operator -> canonical SQL operator
 * token. Keys are exactly the accepted operator spellings; anything else
 * raises BadQuery "Invalid operator".
 */
export const OPERATORS: Record<string, string> = {
  "!=": "!=",
  "=": "=",
  "=~": "=~",
  "<": "<",
  ">": ">",
  in: "in",
  "~": "~",
  is: "is",
  eq: "=",
  gt: ">",
  lt: "<",
  match: "~",
  ne: "!=",
  "not in": "not in",
  "is not": "is not",
  "!": "is not",
};

/** operators whose SQL uses an IN-style value list when given several values */
export const LIST_OPS = new Set(["in", "not in", "IN", "NOT IN"]);

/**
 * query.rb Card::Query::CONJUNCTIONS. Note: `in` is listed here but a bare
 * `in:` key is intercepted earlier as an operator-key (Interpretation
 * #interpret_as_content?), so it never reaches the conjunction handler.
 */
export const CONJUNCTIONS: Record<string, "or" | "and"> = {
  any: "or",
  in: "or",
  or: "or",
  all: "and",
  and: "and",
};

/**
 * query.rb Card::Query::MODIFIERS. Values are stringified (or passed through
 * as arrays) by Interpretation#interpret_modifier.
 */
export const MODIFIERS = [
  "conj",
  "return",
  "index",
  "sort_by",
  "sort_as",
  "sort_dir",
  "sort",
  "dir",
  "group",
  "limit",
  "offset",
] as const;

export type Modifier = (typeof MODIFIERS)[number];

/**
 * Keys ignored outright (Interpretation#no_method_for_attribute_type,
 * `ignore` list) or logged as deprecated (`deprecated` list). `vars` is
 * consumed earlier by Normalization, `prepend`/`append` only affect Ruby-side
 * result post-processing (Card::Query::CardQuery::Run#alter_result), not SQL.
 */
export const IGNORED_KEYS = ["prepend", "append", "vars"] as const;
export const DEPRECATED_KEYS = ["view", "params", "size"] as const;

/** SqlStatement::Order::ORDER_MAP — CQL sort token -> column */
export const ORDER_MAP: Record<string, string> = {
  id: "id",
  update: "updated_at",
  create: "created_at",
  name: "key",
  content: "db_content",
  alpha: "key", // DEPRECATED
  relevance: "updated_at", // DEPRECATED
};

/** SqlStatement::DEFAULT_ORDER_DIRS — matched against the raw sort token */
export const DEFAULT_ORDER_DIRS: Record<string, string> = {
  update: "desc",
  relevance: "desc",
};

/** Sorting::SORT_BY_ITEM_JOIN_MAP — sort hash item -> join field */
export const SORT_BY_ITEM_JOIN_MAP: Record<string, string> = {
  left: "left_id",
  right: "right_id",
};

/**
 * ReferenceAttributes#define_reference_method table:
 * methodname -> [reftype(s), ref_method, ref_field].
 * refer_to/link_to/include/nest tie a card_references subquery on
 * referer_id (this card is the referer); the *_by variants tie on
 * referee_id.
 */
export const REFERENCE_ATTRIBUTES: Record<
  string,
  { reftypes: string[]; refMethod: "referee" | "referer"; refField: "referer_id" | "referee_id" }
> = {
  refer_to: { reftypes: ["L", "I"], refMethod: "referee", refField: "referer_id" },
  link_to: { reftypes: ["L"], refMethod: "referee", refField: "referer_id" },
  include: { reftypes: ["I"], refMethod: "referee", refField: "referer_id" },
  nest: { reftypes: ["I"], refMethod: "referee", refField: "referer_id" },
  referred_to_by: { reftypes: ["L", "I"], refMethod: "referer", refField: "referee_id" },
  linked_to_by: { reftypes: ["L"], refMethod: "referer", refField: "referee_id" },
  included_by: { reftypes: ["I"], refMethod: "referer", refField: "referee_id" },
  nested_by: { reftypes: ["I"], refMethod: "referer", refField: "referee_id" },
};

/**
 * Query.safe_sql guard (query.rb): identifiers / raw fragments must match.
 * Anything containing other characters raises BadQuery.
 */
export const SAFE_SQL_RE = /[^\w\s*().,]/;

/**
 * Fields where MatchAttributes/value-match hits the raw column instead of the
 * comparison mapping: match on `name` matches the `name` column
 * (MatchValue#match_field), unlike eq-style comparisons which use `key`.
 */
export const MATCH_FIELD: Record<string, string> = {
  name: "name",
  content: "db_content",
};
