/**
 * CQL AST -> parameterized SQL for SQLite.
 *
 * Walks the QueryNode tree exactly the way card-1.110.0's SqlStatement
 * (+ sql_statement/joins.rb, where.rb, order.rb) walks the Ruby query
 * objects: SqlStatement#build (select/from/joins/where/group/order/limit),
 * Joins#join_clause, Where#explicit_conditions/#implicit_conditions,
 * Order#order_directives.
 *
 * Divergences from the Ruby SQL text (all documented in
 * ):
 * - every user value becomes a `?` placeholder (Ruby inlines quoted
 *   literals); params are ordered by first appearance in the SQL text
 * - whitespace is canonical (single spaces; Ruby emits e.g. "LIMIT  10 ",
 *   a doubled slot for the SQL comment, and "count( distinct ...)")
 * - the permission condition is optional (Ruby always applies the current
 *   user's read rules); pass { alwaysOk: false, readRuleIds } to reproduce it
 * - `match` renders `field REGEXP ?`, the token card-1.110.0's ActiveRecord
 *   patch (config/initializers/02_patches/active_record.rb) generates for
 *   both MySQL and SQLite; SQLite has no built-in REGEXP — the FTS5 decision
 *   is deferred (wave 2), see the notes
 */

import { CqlBadQuery, ConditionNode, JoinNode, QueryNode } from "./ast.js";
import { BASIC_FIELDS, DEFAULT_ORDER_DIRS, LIST_OPS, ORDER_MAP } from "./constants.js";
import { escapeRegexpCharacters, safeSql } from "./normalize.js";

export interface SqlOptions {
  /**
   * true (default) skips the read-rule permission condition, matching Ruby
   * when Auth.always_ok? is true. false adds
   * `<alias>.read_rule_id IN (...)` from `readRuleIds` (an empty list renders
   * the Ruby sentinel `IN (1)`).
   */
  alwaysOk?: boolean;
  readRuleIds?: number[];
  /**
   * REGEXP-on-edge mode ("The REGEXP decision"
   * the decided JS-side post-filter): REGEXP-shaped `match` conditions are
   * OMITTED from the generated SQL and re-applied by the executor in JS
   * (execute.ts) with the same compile logic as sqlite-regexp.ts. The
   * `=term`-on-name shape (exact key equality) is portable SQL and stays.
   * While set, a root query with a dropped match renders
   * `LIMIT POSTFILTER_ROW_CAP` instead of the statement's own limit/offset —
   * filtering after LIMIT would truncate before matching, and the executor
   * applies the user limit/offset in JS after the filter. Groups whose
   * children all drop render as "" (never "()").
   */
  matchPostFilter?: boolean;
}

/** The superset fetch bound for post-filtered match queries (SqlOptions
 *  doc): D1/libSQL cannot host the REGEXP UDF, so the executor fetches the
 *  match-free statement with this LIMIT and filters in JS. Matches beyond
 *  the first POSTFILTER_ROW_CAP superset rows are missed — the documented
 *  divergence; FTS5 remains the scaling answer (decision doc, point 3). */
export const POSTFILTER_ROW_CAP = 10_000;

/** The regexp-shaped match predicate (the "=" name-key equality is portable
 *  SQL and never post-filters). Shared by the condition dropper and the
 *  executor's filter collector so both sides see the same set. */
export function isRegexpMatchCondition(condition: ConditionNode): boolean {
  return condition.kind === "match" && !(condition.prefix === "=" && condition.cqlField === "name");
}

/** The ROOT query's post-filter conditions, flattened: direct regexp match
 *  conditions AND any or-group containing one (the {match: v} expansion is
 *  a group of name-OR-content; the executor evaluates whole groups). Empty
 *  when the statement has nothing to post-filter. */
export function collectMatchPostFilters(root: QueryNode): ConditionNode[] {
  const filters: ConditionNode[] = [];
  for (const condition of root.conditions) {
    if (isRegexpMatchCondition(condition)) {
      filters.push(condition);
    } else if (
      condition.kind === "group" &&
      condition.conditions.some((child) => isRegexpMatchCondition(child))
    ) {
      filters.push(condition);
    }
  }
  return filters;
}

/** Whether any query BELOW the root carries a regexp match: dropped from
 *  the SQL by matchPostFilter, but a JS row filter cannot re-apply a
 *  subselect's membership — the executor refuses those loudly (CqlBadQuery)
 *  instead of silently returning wrong rows. */
export function hasNestedRegexpMatch(root: QueryNode): boolean {
  const visit = (query: QueryNode): boolean => {
    for (const condition of query.conditions) {
      if (isRegexpMatchCondition(condition)) return true;
      if (
        condition.kind === "group" &&
        condition.conditions.some((child) => isRegexpMatchCondition(child))
      ) {
        return true;
      }
    }
    return query.subqueries.some(visit);
  };
  return root.subqueries.some(visit);
}

export interface SqlResult {
  sql: string;
  params: unknown[];
}

export function generateSql(root: QueryNode, options: SqlOptions = {}): SqlResult {
  const ctx: GenContext = { params: [], options };
  const sql = renderQuery(root, ctx, true);
  return { sql, params: ctx.params };
}

interface GenContext {
  params: unknown[];
  options: SqlOptions;
}

/** SqlStatement#build / #to_s */
function renderQuery(query: QueryNode, ctx: GenContext, isRoot: boolean): string {
  // (the post-filter limit branch below uses the same collector the
  // executor filters with, so SQL and JS agree on what was dropped)
  const alias = query.tableAlias;
  const full = isRoot && query.mods.return !== "count"; // CardQuery#full?

  // Order#order_directives (full queries only; fields feed the select list)
  const orderDirectives = full ? orderDirectivesOf(query, ctx) : [];

  // SqlStatement#fields
  const parts: string[] = [fullField(alias, query.mods.return)];
  for (const directive of orderDirectives) parts.push(directive.field);

  const selectSql = `SELECT${renderedJoins(query).length > 0 ? " DISTINCT" : ""} ${parts.join(", ")}`;
  const fromSql = `FROM ${query.table} ${alias}`;
  const joinsSql = renderJoins(query, ctx);
  const whereSql = renderWhere(query, ctx);
  const groupSql = full && query.mods.group ? `GROUP BY ${safeSql(query.mods.group)}` : "";
  const orderSql =
    orderDirectives.length > 0
      ? `ORDER BY ${orderDirectives.map((d) => (d.dir ? `${d.field} ${d.dir}` : d.field)).join(", ")}`
      : "";
  // SqlStatement#limit_and_offset: LIMIT only when limit > 0; OFFSET only
  // with LIMIT (Ruby quirk: offset without limit renders nothing)
  let limitSql = "";
  if (full) {
    // Post-filter mode bounds the superset fetch with the row cap instead of
    // the statement's own limit/offset: filtering after LIMIT would truncate
    // before matching, and the executor applies the user limit/offset in JS
    // after the filter (SqlOptions.matchPostFilter doc).
    if (isRoot && ctx.options.matchPostFilter === true && hasRootRegexpMatch(query)) {
      return [
        selectSql,
        fromSql,
        joinsSql,
        whereSql,
        groupSql,
        orderSql,
        `LIMIT ${POSTFILTER_ROW_CAP}`,
      ]
        .filter((chunk) => chunk !== "")
        .join(" ");
    }
    const limit = toInt(query.mods.limit);
    if (limit > 0) {
      limitSql = `LIMIT ${limit}`;
      if (query.mods.offset !== undefined && query.mods.offset !== "") {
        limitSql += ` OFFSET ${toInt(query.mods.offset)}`;
      }
    }
  }

  return [selectSql, fromSql, joinsSql, whereSql, groupSql, orderSql, limitSql]
    .filter((chunk) => chunk !== "")
    .join(" ");
}

function toInt(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** The root query carries a match the post-filter dropped (drives the
 *  capped-LIMIT branch in renderQuery). */
function hasRootRegexpMatch(query: QueryNode): boolean {
  return collectMatchPostFilters(query).length > 0;
}

/** SqlStatement#full_field */
function fullField(alias: string, ret: string | undefined): string {
  const field = ret === undefined || /^_\w+/.test(ret) ? "card" : ret;
  switch (field) {
    case "card":
    case "raw":
      return `${alias}.*`;
    case "content":
      return `${alias}.db_content`;
    case "name":
    case "key":
      return `${alias}.name, ${alias}.left_id, ${alias}.right_id`;
    case "count":
      return `coalesce(count(distinct ${alias}.id),0) as count`;
    default:
      return (BASIC_FIELDS as readonly string[]).includes(field)
        ? `${alias}.${field}`
        : safeSql(field);
  }
}

// ---- WHERE (SqlStatement::Where) ----

function renderWhere(query: QueryNode, ctx: GenContext): string {
  const explicit = explicitConditions(query, ctx);
  const implicit = implicitConditions(query, ctx);
  const chunks = [explicit, implicit].filter((chunk) => chunk !== "");
  return chunks.length > 0 ? `WHERE ${chunks.join(" AND ")}` : "";
}

/** Where#explicit_conditions + #conditions_from + #format_conditions */
function explicitConditions(query: QueryNode, ctx: GenContext): string {
  const list: string[] = query.conditions.map((condition) => renderCondition(condition, query, ctx));
  for (const sub of query.subqueries) {
    if (sub.conditionsOnJoin) continue; // rendered in the owning join's ON
    switch (sub.fasten) {
      case "exist":
        // Where#exist_condition
        list.push(`${sub.negate ? "NOT " : ""}EXISTS (${renderQuery(sub, ctx, false)})`);
        break;
      case "in":
        // Where#in_condition (field recorded by Tie#tie_with_in)
        list.push(
          `${sub.mods.inField ?? `${sub.tableAlias}.id`} ${sub.negate ? "NOT " : ""}IN (${renderQuery(sub, ctx, false)})`,
        );
        break;
      default:
        // :join and :direct subqueries render their conditions inline
        list.push(explicitConditions(sub, ctx));
    }
  }
  return formatConditionList(list, query.conj);
}

/** Where#format_conditions */
function formatConditionList(list: string[], conj: string): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `(${list.join(` ${conj.toUpperCase()} `)})`;
}

/** Where#implicit_conditions: trash + permissions, card queries only */
function implicitConditions(query: QueryNode, ctx: GenContext): string {
  if (query.kind !== "card") return "";
  const chunks = [`${query.tableAlias}.trash is false`];
  const { alwaysOk = true, readRuleIds } = ctx.options;
  if (!alwaysOk) {
    if (readRuleIds && readRuleIds.length > 0) {
      chunks.push(`${query.tableAlias}.read_rule_id IN (${readRuleIds.map(() => "?").join(",")})`);
      ctx.params.push(...readRuleIds);
    } else {
      // Where#permission_conditions: empty rule list -> sentinel "1"
      chunks.push(`${query.tableAlias}.read_rule_id IN (1)`);
    }
  }
  return chunks.join(" AND ");
}

/** renderCondition for each ConditionNode shape */
function renderCondition(condition: ConditionNode, query: QueryNode, ctx: GenContext): string {
  const alias = query.tableAlias;
  switch (condition.kind) {
    case "value": {
      const fieldSql = `${alias}.${condition.field}`;
      if (condition.values.length === 1 && !LIST_OPS.has(condition.op)) {
        return `${fieldSql} ${condition.op} ${renderScalar(condition.values[0], ctx)}`;
      }
      // Value#sqlize_array: list ops always group ("in ('5')"); other ops
      // collapse single values to scalars
      return `${fieldSql} ${condition.op} (${condition.values
        .map((v) => renderScalar(v, ctx))
        .join(",")})`;
    }
    case "match": {
      // MatchValue#match_sql: "=term" on name -> exact key comparison;
      // otherwise REGEXP with the term (escaped unless "~~" prefix)
      if (condition.prefix === "=" && condition.cqlField === "name") {
        return `${alias}.key = ${placeholder(ctx, condition.termKey)}`;
      }
      // REGEXP-on-edge: the post-filter mode omits the shape from the SQL
      // (the executor re-applies it in JS with the same compile logic —
      // SqlOptions.matchPostFilter doc).
      if (ctx.options.matchPostFilter === true) return "";
      const value =
        condition.prefix === "~~" ? condition.term : escapeRegexpCharacters(condition.term);
      return `${alias}.${condition.field} REGEXP ${placeholder(ctx, value)}`;
    }
    case "like":
      // MatchAttributes#complete: "#{alias}.key LIKE '#{key}%'"
      return `${alias}.key LIKE ${placeholder(ctx, `${condition.value}%`)}`;
    case "raw":
      return condition.sql;
    case "group":
      // MatchAttributes#or_join — always parenthesized. In post-filter mode
      // every child may drop (a {match: v} or-group is all-match); a fully
      // dropped group renders "" — never "()" — so the executor's WHERE
      // stays valid (SqlOptions.matchPostFilter doc).
      if (ctx.options.matchPostFilter === true) {
        const rendered = condition.conditions
          .map((c) => renderCondition(c, query, ctx))
          .filter((chunk) => chunk !== "");
        if (rendered.length === 0) return "";
        return `(${rendered.join(` ${condition.conj.toUpperCase()} `)})`;
      }
      return `(${condition.conditions
        .map((c) => renderCondition(c, query, ctx))
        .join(` ${condition.conj.toUpperCase()} `)})`;
    case "foundBy":
      // The refusal surfaces as BadQuery (Card::Error::BadQuery's port), not
      // a generic error. found_by is RESOLVED before generation:
      // execute.ts#resolveFoundByConditions translates every foundBy
      // condition into the equivalent id-set constraint (the port of
      // card-1.110.0 lib/card/query/card_query/found_by.rb). Reaching this
      // case means an unhandled shape survived the resolution pass — a loud
      // backstop, never a silent empty. (Historical note: this case was the
      // wave-1 blanket refusal "deferred to wave 2"; through the deploy
      // worker's /api/query a plain Error fell into the 500 "CQL execution
      // failed" branch while every other bad statement answered 400 "bad
      // CQL" — so the backstop stays a CqlBadQuery, probe
      // api-query-found-by-refused.)
      throw new CqlBadQuery(
        "found_by condition reached SQL generation unresolved (unhandled found_by shape) — execute.ts resolveFoundByConditions should have translated it",
      );
  }
}

function renderScalar(value: string | number | null, ctx: GenContext): string {
  if (value === null) return "NULL";
  return placeholder(ctx, value);
}

function placeholder(ctx: GenContext, value: unknown): string {
  ctx.params.push(value);
  return "?";
}

// ---- JOINS (SqlStatement::Joins) ----

/**
 * Joins#joins_on_query: the query's own joins followed by the joins of its
 * :direct subqueries (transitively — those share this query's table alias).
 */
function renderedJoins(query: QueryNode): JoinNode[] {
  const joins = [...query.joins];
  collectDirectSubqueryJoins(query, joins);
  return joins;
}

function collectDirectSubqueryJoins(query: QueryNode, out: JoinNode[]): void {
  for (const sub of query.subqueries) {
    if (sub.fasten === "direct") {
      out.push(...sub.joins);
      collectDirectSubqueryJoins(sub, out);
    }
  }
}

/** Joins#joins / #join_clause / #subjoins */
function renderJoins(query: QueryNode, ctx: GenContext): string {
  const chunks: string[] = [];
  for (const join of renderedJoins(query)) {
    renderJoin(join, ctx, chunks);
  }
  return chunks.join(" ");
}

function renderJoin(join: JoinNode, ctx: GenContext, chunks: string[]): void {
  const side = join.side ?? "";
  const subjoins = join.to ? renderJoins(join.to, ctx) : "";
  const onSql = onClause(join, ctx);

  if (side === "LEFT" && subjoins !== "") {
    // Joins#join_clause_parts: LEFT JOIN parenthesizes table + subjoins
    chunks.push(`LEFT JOIN (${join.toTable} ${join.toAlias} ${subjoins}) ON ${onSql}`);
  } else {
    chunks.push(`${side ? `${side} ` : ""}JOIN ${join.toTable} ${join.toAlias} ON ${onSql}`);
    if (subjoins !== "") chunks.push(subjoins);
  }
}

/** Joins#on_clause + #on_card_conditions */
function onClause(join: JoinNode, ctx: GenContext): string {
  const conditions: string[] = [
    `${join.fromAlias}.${join.fromField} = ${join.toAlias}.${join.toField}`,
  ];
  const to = join.to;
  if (to) {
    if (to.conditionsOnJoin) {
      // on_card_conditions: explicit conditions render in ON when the join
      // owns them (negate joins, sort joins)
      const explicit = explicitConditions(to, ctx);
      if (explicit !== "") conditions.push(explicit);
    }
    // implicit conditions (trash/permissions) always ride along on card joins
    const implicit = implicitConditions(to, ctx);
    if (implicit !== "") conditions.push(implicit);
  }
  return conditions.join(" AND ");
}

// ---- ORDER BY (SqlStatement::Order) ----

interface OrderDirective {
  field: string;
  dir: string;
}

/** Order#order_directives / #order_field / #order_dir, plus the id
 *  tie-breaker (SINGLE-TABLE scans only), shaped by the viewer.
 *
 *  WHY THE TIE-BREAKER: Ruby's ORDER BY declares no tie-break
 *  (sql_statement/order.rb builds `ORDER BY <field> <dir>` only), so tied
 *  rows come out in SQLite's unspecified tier. The captured oracle bytes
 *  embed two DIFFERENT unspecified tiers, and both are reproducible:
 *
 *  - Permission-filtered scans (always_ok false): the statement carries
 *    `read_rule_id IN (...)`, and the capture deck's plan rode whichever
 *    index the sort allowed. A KEY primary (sort name/alpha) rode the key
 *    index itself — the ORDER BY is satisfied without a sorter, so tied
 *    rows stay in rowid order: `c0.id asc` (the Image member search's
 *    NULL-key cohort renders in id order 217,431,...,712). Any other
 *    primary (updated_at has no satisfying plan with the filter in
 *    flight) drove the read_rule_id index — one loop per list value,
 *    rows in rowid order — feeding a stable sort: `c0.read_rule_id asc,
 *    c0.id asc`. That is the *search page (`{"match":"$keyword",
 *    "sort":"relevance"}` → `ORDER BY updated_at desc`): its 2026-09-06
 *    15:26:37 tie cohort renders 393,1001,1708,2456,26026 then the
 *    7786-rule row 1334, and the 01:14:36 cohort 3523,3526 then
 *    12221(12223) then 1823(40702) — for both signed-in members.
 *  - Always-ok scans (the Administrator captures): no permission
 *    condition, and the captured ties follow the primary's direction —
 *    the updated_at index ride backward emits id DESC under a descending
 *    primary (the Administrator *search head-20 runs
 *    26026,2456,1708,1334,1265,1001,393), forward rides emit id ASC (the
 *    `ORDER BY key asc` capture heads). The tier is pinned to the primary
 *    directive's own direction.
 *
 *  The ported decks break ties by THEIR physical order instead: the corpus
 *  scrub carries name/key as NULL for 40,090 of 49,829 rows
 *  (seedCard writes keyColumn NULL for unnamed rows,
 *  render-test-storage.ts), so every `sort: name` search over such rows
 *  ties on the NULL-key tier and the seeded deck's insertion (BFS closure)
 *  order decides — scrambling the head-20 the html limit renders.
 *  Appending the explicit tie-breaker pins the unspecified tier to the
 *  captured semantics on any schema; queries without ties are untouched.
 *
 *  WHY NOT ON JOINED STATEMENTS: with a join in the statement the
 *  unspecified tier is the JOIN EMISSION order — the driving table's rowid
 *  sequence — not the superquery's id column. Ruby emits `ORDER BY key`
 *  bare for the reference-tie shape (reference_attributes.rb refer_to →
 *  tie :reference … {to: :referer_id}; live oracle-app Card::Query SQL for
 *  somatic+*referred_to_by: `SELECT DISTINCT c0.* FROM cards c0 JOIN
 *  card_references cr1 ON c0.id = cr1.referer_id WHERE (cr1.ref_type IN
 *  ('L','I') AND cr1.referee_id = 1186) … ORDER BY c0.key asc`), and its
 *  captured row order is card_references-rowid order: junction rows (NULL
 *  keys, sorted first) in reference-insertion order — somatic's referrer
 *  27518 "Soma+description" whose reference row was written LAST
 *  (cr.id 6296176) renders 29th, while simple-card 37473 (real key) sorts
 *  after the whole NULL-key tier. Appending `c0.id asc` re-sorted that
 *  tier id-ascending, hoisting 27518 into head-20 slot 13 and pushing
 *  29740 off the limited listing — the somatic first-diff. better-sqlite3
 *  reproduces Ruby's emission exactly for the Ruby SQL shape (verified
 *  head-30 equal), so joined statements carry the bare Ruby ORDER BY. */
function orderDirectivesOf(query: QueryNode, ctx: GenContext): OrderDirective[] {
  const sortMod = query.mods.sortBy ?? query.mods.sort;
  if (!sortMod || sortMod.length === 0) {
    // SORTLESS JOINED REFERENCE STATEMENTS (the +*members family): Ruby's
    // statement carries no ORDER BY and the captured row order is the
    // reference-join emission — a plan-sensitive tier that flipped between
    // engine builds whose prepare-phase query sequences differ (the Help
    // Desk +*members listing: verification email (21783) and password reset
    // email (21787) tie on everything the statement orders by, and the two
    // orders alternated deterministically with the build). Pinning the
    // superquery's id asc makes the tier deterministic; the Help Desk
    // capture is id-ascending, and the sorted joined shapes keep their bare
    // Ruby ORDER BY untouched (the somatic NULL-key tier above is a SORTED
    // statement — this arm never fires for it).
    const joins = renderedJoins(query);
    if (joins.length > 0) {
      return [{ field: `${query.tableAlias}.id`, dir: "asc" }];
    }
    return [];
  }
  const directives = sortMod.map((token, index) => {
    const field = orderField(query, token);
    return { field, dir: orderDir(query, token, index) };
  });
  // A statement already ordering by this table's id is total — the
  // tie-breaker would never fire and would only noise the generated SQL.
  // Joined statements never take the tie-breaker at all (see above): their
  // unspecified tier must stay the join emission order.
  const idField = `${query.tableAlias}.id`;
  if (directives.some((d) => d.field === idField) || renderedJoins(query).length !== 0) {
    return directives;
  }
  if (ctx.options.alwaysOk === false) {
    if (directives[0].field === `${query.tableAlias}.key`) {
      // Key primary: the key index satisfies the ORDER BY outright — the
      // filter rides along rowid-order, so the tier stays plain id asc.
      directives.push({ field: idField, dir: "asc" });
    } else {
      // Any other primary: the read_rule_id index loop, then rowid within it.
      directives.push({ field: `${query.tableAlias}.read_rule_id`, dir: "asc" });
      directives.push({ field: idField, dir: "asc" });
    }
  } else {
    // Always-ok scan: the unspecified tier follows the primary's direction.
    directives.push({ field: idField, dir: directives[0].dir || "asc" });
  }
  return directives;
}

function orderField(query: QueryNode, token: string): string {
  const mapped = ORDER_MAP[token];
  const raw = mapped ? `${query.tableAlias}.${mapped}` : safeSql(token);
  return applySortAs(query, raw);
}

/** Order#order_as — CAST(field AS type) when sort_as is present */
function applySortAs(query: QueryNode, field: string): string {
  const as = query.mods.sortAs;
  if (!as) return field;
  return `CAST(${field} AS ${sqliteCastType(safeSql(as))})`;
}

/**
 * Order#order_dir. sort_dir wins over the deprecated dir; per-directive
 * entries index into the arrays; without either, DEFAULT_ORDER_DIRS (keyed
 * by the raw sort token) or "asc".
 */
function orderDir(query: QueryNode, token: string, index: number): string {
  const dirs = query.mods.sortDir ?? query.mods.dir;
  if (!dirs || dirs.length === 0) {
    return DEFAULT_ORDER_DIRS[token] ?? "asc";
  }
  const dir = dirs[index];
  return dir === undefined ? "" : safeSql(dir);
}

/**
 * SqlStatement#cast_type approximation for SQLite. Ruby casts through the
 * adapter's native types (MySQL "signed", "char", ...); SQLite understands
 * INTEGER/REAL/TEXT. Unmapped values pass through safe_sql verbatim.
 */
function sqliteCastType(type: string): string {
  switch (type.toLowerCase()) {
    case "signed":
    case "integer":
    case "int":
      return "INTEGER";
    case "char":
    case "string":
    case "text":
    case "binary":
      return "TEXT";
    case "decimal":
    case "float":
    case "real":
    case "numeric":
      return "REAL";
    default:
      return type;
  }
}
