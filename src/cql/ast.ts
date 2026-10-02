/**
 * Typed AST for parsed CQL statements.
 *
 * The shape mirrors the runtime objects card-1.110.0 builds during
 * interpretation (AbstractQuery's @conditions/@joins/@mods/@subqueries plus
 * Card::Query::Value and Card::Query::Join), so the SQL generator can walk it
 * exactly the way SqlStatement (+ Joins/Where/Order) walks the Ruby objects.
 */

/** scalar values allowed after normalization (Normalization::OK_VALUE_CLASSES minus query objects) */
export type CqlScalar = string | number | boolean | null;

/** SQL condition shapes produced by interpretation */
export type ConditionNode =
  /** Value#standard_sql: `alias.field op ?` (list values render as an IN group) */
  | {
      kind: "value";
      /** physical column name, already mapped (content -> db_content, name -> key) */
      field: string;
      /** canonical operator token (Value#canonicalize_operator) */
      op: string;
      values: Array<string | number | null>;
    }
  /** Value::MatchValue#match_sql: `alias.field REGEXP ?` (or exact name match) */
  | {
      kind: "match";
      /** the CQL field the match was declared on ("name" or "content") */
      cqlField: string;
      /** physical column: name -> "name", content -> "db_content" */
      field: string;
      /** match term after $var/context normalization (before regexp escaping) */
      term: string;
      /** key-form of the term (used by the "=" exact name match) */
      termKey: string;
      /** parsed prefix: "~~" raw regexp, "=" exact, "" or "~" plain */
      prefix: string;
    }
  /** MatchAttributes#complete: `alias.key LIKE ?` */
  | { kind: "like"; field: string; value: string }
  /**
   * Structural raw fragment with no bindable user data (Custom#compound,
   * MatchAttributes#name_not_null, Tie#negate_join's "is null"). Built only
   * from constant templates + table aliases, never from CQL input.
   */
  | { kind: "raw"; sql: string }
  /** group of conditions joined by a conjunction (MatchAttributes#or_join) */
  | { kind: "group"; conj: "and" | "or"; conditions: ConditionNode[] }
  /**
   * FoundBy#found_by (card-1.110.0 lib/card/query/card_query/found_by.rb).
   * Resolved at EXECUTION time — execute.ts#resolveFoundByConditions runs
   * the found statement and replaces this condition with the equivalent
   * id-set constraint before SQL generation. This node reaching the
   * generator means an unhandled shape survived that pass (sql.ts refuses).
   */
  | { kind: "foundBy"; value: unknown };

/** Card::Query::Join */
export interface JoinNode {
  /** "LEFT" or undefined (inner) — Join#side */
  side?: "LEFT";
  fromAlias: string;
  fromField: string;
  /** physical table name of the joined side */
  toTable: string;
  /** alias of the joined side (Join#to_alias) */
  toAlias: string;
  toField: string;
  /** subquery the join was created for (Join#to); its joins render as subjoins */
  to?: QueryNode;
}

/** mods hash (AbstractQuery @mods), post-interpret_modifier */
export interface Mods {
  return?: string;
  limit?: string;
  offset?: string;
  group?: string;
  index?: string;
  /** sort tokens (modifier form), in order; may be raw field exprs */
  sort?: string[];
  /** sort tokens from the deprecated `sort_by` modifier */
  sortBy?: string[];
  sortAs?: string;
  sortDir?: string[];
  /** deprecated `dir` (Order: sort_dir wins over dir) */
  dir?: string[];
  /** Where#in_condition field; set by Tie#tie_with_in (no CQL key reaches it in 1.110) */
  inField?: string;
}

/** query class / table the node selects from */
export type QueryKind = "card" | "reference" | "action" | "act";

/**
 * fasten strategies (AbstractQuery::Tie): how a subquery is attached to its
 * superquery. "direct" shares the superquery's table alias.
 */
export type Fasten = "join" | "direct" | "exist" | "in";

/** one interpreted query (root or subquery) */
export interface QueryNode {
  kind: QueryKind;
  table: string;
  /** Card/AbstractQuery#table_alias, e.g. c0, cr1 */
  tableAlias: string;
  fasten: Fasten;
  negate: boolean;
  /**
   * effective current conjunction (Conjunctions#current_conjunction:
   * mods[:conj] or "and"); mutated when the conj modifier key is interpreted
   */
  conj: string;
  /** CQL context for relative-name absolutization (AbstractQuery#context) */
  context: string;
  /** conditions interpreted directly on this query (AbstractQuery @conditions) */
  conditions: ConditionNode[];
  /** joins created by ties on this query (AbstractQuery @joins), creation order */
  joins: JoinNode[];
  /** nested queries, creation order (AbstractQuery @subqueries) */
  subqueries: QueryNode[];
  /**
   * true when this subquery's explicit conditions render in the parent join's
   * ON clause instead of the superquery WHERE (Tie#negate_join,
   * Sorting#join_cards with conditions_on_join: true)
   */
  conditionsOnJoin: boolean;
  mods: Mods;
  /** statement keys accepted but not affecting SQL (prepend/append), for callers */
  statementExtras: { prepend?: string; append?: string };
}

/** parse() entry point options */
export interface ParseOptions {
  /** root `vars` — replaces $var values (Normalization#string_value_from_var) */
  vars?: Record<string, string | number | null | undefined>;
  /** root `context` — used to absolutize `_relative` names (AbstractQuery#context) */
  context?: string;
  /**
   * Card-name -> card id resolver standing in for Card::Lexicon.id /
   * String#card_id (a DB lookup). Unresolved names fall back to the same
   * sentinels Ruby uses: -2 for clause_to_hash, -999 for Tie#id_from_val.
   */
  resolveCardId?: (name: string) => number | undefined | null;
  /**
   * The async half of Ruby's name resolution. Card::Lexicon.id answers
   * cache-first WITH a synchronous SQL fallback (card-1.110.0
   * lexicon.rb#lex_to_id), so Ruby heals every cache miss - including
   * entries the Temporary cache's max_keys reset wiped
   * (cache/temporary.rb#within_key_counts, default 10_000 keys) - during
   * interpretation itself. The port's interpretation is synchronous over
   * the warm-cache mirror (`resolveCardId` -> DbLexicon.peekId), which by
   * contract has no db fallback. `ensureCardId` is that fallback leg,
   * hoisted into the async phase: executeQuery resolves the statement's
   * card-name strings through it BEFORE interpretation runs, so the
   * resolved entries sit in the cache the sync mirror reads (and nothing
   * writes between this pass and parseCql that could evict them). Wire it
   * to the same walk `resolveCardId` mirrors (DbLexicon.id). Unresolved or
   * throwing names stay the interpreter's business - they take Ruby's
   * sentinels exactly as before.
   */
  ensureCardId?: (name: string) => Promise<number | undefined>;
  /** codename -> id resolver standing in for Card::Codename.id (member key) */
  resolveCodename?: (codename: string) => number | undefined | null;
  /**
   * name -> key override standing in for Cardname#key (the built-in default,
   * normalize.ts#defaultNameToKey, delegates to the landed card/name stream:
   * DeckoName.parse(name).key with full singularize inflection and mark
   * resolution — see docs/cql-port-notes.md reconciliation). The override
   * remains available for callers that need a different key source.
   */
  nameToKey?: (name: string) => string;
  /** called for deprecated keys (view/params/size) and other soft warnings */
  onWarning?: (message: string) => void;
}

/** BadQuery equivalent (Card::Error::BadQuery) */
export class CqlBadQuery extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CqlBadQuery";
  }
}
