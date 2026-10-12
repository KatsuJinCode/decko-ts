/**
 * CQL AST -> parameterized SQL for SQLite.
 *
 * Walks the QueryNode tree in the order a SELECT is built: select list,
 * FROM, joins, WHERE, GROUP BY, ORDER BY, LIMIT — then WHERE (explicit then
 * implicit conditions), JOINS (the query's own joins plus the joins its
 * direct subqueries share its alias with), and ORDER BY (directives plus
 * the tie-breaker, which has its own reasoning below).
 *
 * How this SQL differs from the query-object rendering it replaces:
 * - every user value becomes a `?` placeholder rather than an inlined
 *   quoted literal; params are ordered by first appearance in the SQL text
 * - whitespace is canonical (single spaces between clauses, no padding)
 * - the permission condition is optional; pass { alwaysOk: false,
 *   readRuleIds } to render it
 * - `match` renders `field REGEXP ?`, which SQLite has no built-in
 *   function for — see src/cql/sqlite-regexp.ts for the local registration
 *   and SqlOptions.matchPostFilter for the edge path
 */

import { CqlBadQuery, ConditionNode, JoinNode, QueryNode } from "./ast.js";
import { BASIC_FIELDS, DEFAULT_ORDER_DIRS, LIST_OPS, ORDER_MAP } from "./constants.js";
import { escapeRegexpCharacters, safeSql } from "./normalize.js";

export interface SqlOptions {
  /**
   * true (default) skips the read-rule permission condition. false adds
   * `<alias>.read_rule_id IN (...)` from `readRuleIds` (an empty list renders
   * the sentinel `IN (1)`).
   */
  alwaysOk?: boolean;
  readRuleIds?: number[];
  /**
   * Card ids the query must NOT return, by right-part (junction) side:
   * renders `<alias>.right_id NOT IN (?, ...)`.
   *
   * This is the narrowing half of a scoped permission answer, and it exists
   * because `alwaysOk` is all-or-nothing. A caller needs both halves at once:
   * a viewer who is allowed everything is still not allowed everything. This
   * is that seam — RenderEngine#cqlPermissionOptions uses it to keep a
   * rule-less allowance from reaching the account field cards, where "no
   * rule to evaluate" must not read as "readable to everyone". An empty or
   * absent list renders nothing.
   */
  excludedRightIds?: number[];
  /**
   * REGEXP-on-edge mode (the decided JS-side post-filter): REGEXP-shaped
   * `match` conditions are OMITTED from the generated SQL and re-applied by
   * the executor in JS (execute.ts) with the same compile logic as
   * sqlite-regexp.ts. The `=term`-on-name shape (exact key equality) is
   * portable SQL and stays. While set, a root query with a dropped match
   * renders `LIMIT POSTFILTER_ROW_CAP` instead of the statement's own
   * limit/offset — filtering after LIMIT would truncate before matching, and
   * the executor applies the user limit/offset in JS after the filter. Groups
   * whose children all drop render as "" (never "()").
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

/** Render one query to its SELECT statement. */
function renderQuery(query: QueryNode, ctx: GenContext, isRoot: boolean): string {
  // (the post-filter limit branch below uses the same collector the
  // executor filters with, so SQL and JS agree on what was dropped)
  const alias = query.tableAlias;
  const full = isRoot && query.mods.return !== "count"; // the root, not counting

  // Order directives: full queries only, and their fields feed the select
  // list as well as the ORDER BY.
  const orderDirectives = full ? orderDirectivesOf(query, ctx) : [];

  // The select list.
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
  // LIMIT renders only when limit > 0, and OFFSET renders only alongside a
  // LIMIT — an offset on its own has nothing to count from.
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

/** The select expression for a `return` spec. An underscore-prefixed return
 *  is an internal field name, not a user-facing projection, and renders the
 *  whole card row. */
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

// ---- WHERE ----

function renderWhere(query: QueryNode, ctx: GenContext): string {
  const explicit = explicitConditions(query, ctx);
  const implicit = implicitConditions(query, ctx);
  const chunks = [explicit, implicit].filter((chunk) => chunk !== "");
  return chunks.length > 0 ? `WHERE ${chunks.join(" AND ")}` : "";
}

/** Conditions the statement actually asked for: this query's own, plus the
 *  subquery conditions that render inline rather than in the ON clause. */
function explicitConditions(query: QueryNode, ctx: GenContext): string {
  const list: string[] = query.conditions.map((condition) => renderCondition(condition, query, ctx));
  for (const sub of query.subqueries) {
    if (sub.conditionsOnJoin) continue; // rendered in the owning join's ON
    switch (sub.fasten) {
      case "exist":
        // An "exist" subquery is an EXISTS test over the rendered subselect.
        list.push(`${sub.negate ? "NOT " : ""}EXISTS (${renderQuery(sub, ctx, false)})`);
        break;
      case "in":
        // An "in" subquery compares against its recorded in-field.
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

/** Parenthesize a condition list under its conjunction; a single condition
 *  needs no parentheses. */
function formatConditionList(list: string[], conj: string): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `(${list.join(` ${conj.toUpperCase()} `)})`;
}

/** Conditions the statement never asked for but that must hold anyway:
 *  trashed cards are invisible, and the viewer's read rules decide the rest.
 *  Card queries only — reference/action/act rows have no trash column. */
function implicitConditions(query: QueryNode, ctx: GenContext): string {
  if (query.kind !== "card") return "";
  const chunks = [`${query.tableAlias}.trash is false`];
  // The scoped-permission narrowing, applied in BOTH always-ok states: it
  // is not the read-rule filter, it is an exclusion the caller asked for
  // regardless of which answer it got for the filter (see SqlOptions
  // .excludedRightIds).
  if (ctx.options.excludedRightIds && ctx.options.excludedRightIds.length > 0) {
    chunks.push(
      `${query.tableAlias}.right_id NOT IN (${ctx.options.excludedRightIds.map(() => "?").join(",")})`,
    );
    ctx.params.push(...ctx.options.excludedRightIds);
  }
  const { alwaysOk = true, readRuleIds } = ctx.options;
  if (!alwaysOk) {
    if (readRuleIds && readRuleIds.length > 0) {
      chunks.push(`${query.tableAlias}.read_rule_id IN (${readRuleIds.map(() => "?").join(",")})`);
      ctx.params.push(...readRuleIds);
    } else {
      // No rule ids at all is not "no filter": it renders a sentinel rule id
      // that matches nothing, so the query returns nothing rather than
      // everything.
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
      // List operators always render their group (an `in` with one value is
      // still `in (?)`); other operators collapse a lone value to a scalar.
      return `${fieldSql} ${condition.op} (${condition.values
        .map((v) => renderScalar(v, ctx))
        .join(",")})`;
    }
    case "match": {
      // "=term" on name is an exact key comparison — the name was already
      // keyed. Everything else is REGEXP, with the term escaped unless the
      // "~~" prefix asked for it raw.
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
      // `complete` is a prefix match on the key column.
      return `${alias}.key LIKE ${placeholder(ctx, `${condition.value}%`)}`;
    case "raw":
      return condition.sql;
    case "group":
      // A group is always parenthesized. In post-filter mode every child may
      // drop; a fully dropped group renders "" — never "()" — so the
      // executor's WHERE stays valid (SqlOptions.matchPostFilter doc).
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
      // found_by is RESOLVED before generation: execute.ts's
      // resolveFoundByConditions translates every foundBy condition into the
      // equivalent id-set constraint. Reaching this case means an unhandled
      // shape survived that pass.
      //
      // The refusal must stay a CqlBadQuery, not a plain Error. Over the
      // HTTP query endpoint a plain Error falls into the 500 "CQL execution
      // failed" branch, while every other malformed statement answers 400
      // "bad CQL" — so a generic error here would report a client mistake
      // as a server fault. It is a loud backstop, never a silent empty.
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

// ---- JOINS ----

/**
 * The query's own joins, followed by the joins of its direct subqueries,
 * transitively — those share this query's table alias, so their joins have
 * to render in the same FROM clause.
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

/** Render the join list to SQL. */
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
    // A LEFT JOIN whose target carries its own joins parenthesizes both.
    chunks.push(`LEFT JOIN (${join.toTable} ${join.toAlias} ${subjoins}) ON ${onSql}`);
  } else {
    chunks.push(`${side ? `${side} ` : ""}JOIN ${join.toTable} ${join.toAlias} ON ${onSql}`);
    if (subjoins !== "") chunks.push(subjoins);
  }
}

/** A join's ON clause: the field pairing, plus whatever the target's own
 *  conditions contribute. */
function onClause(join: JoinNode, ctx: GenContext): string {
  const conditions: string[] = [
    `${join.fromAlias}.${join.fromField} = ${join.toAlias}.${join.toField}`,
  ];
  const to = join.to;
  if (to) {
    if (to.conditionsOnJoin) {
      // Explicit conditions render in ON when the join owns them — negated
      // joins and sort joins both set conditionsOnJoin.
      const explicit = explicitConditions(to, ctx);
      if (explicit !== "") conditions.push(explicit);
    }
    // implicit conditions (trash/permissions) always ride along on card joins
    const implicit = implicitConditions(to, ctx);
    if (implicit !== "") conditions.push(implicit);
  }
  return conditions.join(" AND ");
}

// ---- ORDER BY ----

interface OrderDirective {
  field: string;
  dir: string;
}

/** The ORDER BY directives for one query, plus the id tie-breaker.
 *
 *  WHY THE TIE-BREAKER: an ORDER BY that declares no tie-break leaves the
 *  order of tied rows to the engine, and SQLite's choice is not one thing —
 *  it is whichever plan the query happens to get. The shapes here have three
 *  distinct outcomes, all reproducible:
 *
 *  - Permission-filtered scan with a KEY primary: the key index satisfies
 *    the ORDER BY outright, so no sorter runs and tied rows come back in
 *    rowid order. A plain `id asc` tie-breaker reproduces it.
 *  - Permission-filtered scan with any other primary: no plan satisfies the
 *    sort with the filter in flight, so the read_rule_id index drives the
 *    scan — one loop per list value, rowid order within each — feeding a
 *    stable sort. That is `read_rule_id asc, id asc`.
 *  - Always-ok scan: no permission condition, and tied rows follow the
 *    primary's own direction, so the tie-breaker takes that direction.
 *
 *  The tier matters more than it looks on decks that carry NULL keys for
 *  unnamed rows: a `sort: name` search ties across that whole cohort, and
 *  whatever the engine happens to emit decides which rows a limit renders.
 *  Appending the explicit tie-breaker pins the tier instead of inheriting
 *  it, on any schema. Queries with no ties are untouched.
 *
 *  WHY NOT ON JOINED STATEMENTS: with a join in the statement, the
 *  unspecified tier is the JOIN EMISSION order — the driving table's rowid
 *  sequence — not the superquery's id column, and the joined table carries
 *  its own rowid tier on top of that (junction rows with NULL keys sort
 *  ahead of keyed rows, in reference-insertion order). Appending an id
 *  tie-breaker would re-sort that tier and move rows across a limit
 *  boundary, changing which rows a listing renders. Joined statements
 *  therefore carry the bare ORDER BY, and the engine reproduces the
 *  emission order for that SQL shape. */
function orderDirectivesOf(query: QueryNode, ctx: GenContext): OrderDirective[] {
  const sortMod = query.mods.sortBy ?? query.mods.sort;
  if (!sortMod || sortMod.length === 0) {
    // A sortless joined reference statement carries no ORDER BY at all, and
    // its row order is the reference-join emission — a tier that depends on
    // the plan the engine picks, so it can differ between engine builds even
    // when the statement does not. Pinning the superquery's id asc makes the
    // tier deterministic. Sorted joined statements never reach this arm;
    // they keep their bare ORDER BY.
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

/** CAST(field AS type) when sort_as is present. */
function applySortAs(query: QueryNode, field: string): string {
  const as = query.mods.sortAs;
  if (!as) return field;
  return `CAST(${field} AS ${sqliteCastType(safeSql(as))})`;
}

/**
 * A directive's direction. sort_dir wins over the deprecated dir;
 * per-directive entries index into those arrays; with neither, the
 * DEFAULT_ORDER_DIRS table (keyed by the raw sort token) decides, then "asc".
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
 * Map a sort_as type name to a SQLite cast type. The accepted spellings are
 * the adapter's native type names ("signed", "char", "decimal", ...);
 * SQLite understands INTEGER/REAL/TEXT, so each maps onto one of those.
 * Anything unmapped passes through verbatim.
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
