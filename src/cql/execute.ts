/**
 * CQL execution: parse -> generateSql -> driver -> typed results.
 *
 * The closed loop over the wave-1 generator (docs/cql-port-notes.md): a CQL
 * statement becomes parameterized SQLite SQL, runs through the storage
 * driver seam (src/server/driver.ts SQLDatabaseDriver — LocalSqliteDriver
 * locally, D1/libSQL adapters at the edge), and comes back as typed rows.
 *
 * Result shaping mirrors Ruby Run#alter_result to the extent SQL allows:
 * `return: "count"` collapses to the integer (Ruby casts the single count
 * row); card/raw selects return full card rows (CardsRow from
 * src/server/schema.ts). Projection returns (`name`, `content`, `type_id`,
 * ...) come back as the DB reports them — single-column row objects.
 * Name RECONSTRUCTION for compound cards (name is NULL in storage; Ruby
 * rebuilds "left+right" from left_id/right_id recursively in Card#name /
 * Run#alter_result) needs the card/name stream and is deferred — documented
 * in docs/cql-execution-notes.md ("Deferred to later waves").
 *
 * REGEXP: match queries need the UDF from ./sqlite-regexp.js on local
 * drivers (registerSqliteRegexpFunction). The edge drivers cannot register
 * functions; the decided strategy (JS-side post-filter,
 * docs/cql-execution-notes.md "The REGEXP decision") is implemented in
 * executeQuery: the first UDF-missing failure flips the driver to
 * match-free SQL + JS row filtering (SqlOptions.matchPostFilter).
 */

import type { SQLDatabaseDriver } from "../server/driver.js";
import type { CardsRow } from "../server/schema.js";
import type { DbLexicon } from "../card/fetch/lexicon.js";
import { parseCql } from "./parser.js";
import { CqlBadQuery, type ParseOptions, type ConditionNode, type QueryNode } from "./ast.js";
import {
  generateSql,
  collectMatchPostFilters,
  hasNestedRegexpMatch,
  type SqlOptions,
} from "./sql.js";
import { escapeRegexpCharacters } from "./normalize.js";
import { compileMatchPattern } from "./sqlite-regexp.js";

/**
 * Execution-time options. Names in CQL (type: "User", part: "Home",
 * edited_by: "Joe Admin") resolve to ids DURING interpretation, so the
 * parse-time resolvers must flow through the execution entry — Ruby reads
 * them from Card::Lexicon / Card::Codename globals; the port injects them.
 */
export interface CqlExecuteOptions extends SqlOptions {
  /** ParseOptions for interpretation: vars, context, resolveCardId,
   *  resolveCodename, nameToKey, onWarning (see src/cql/ast.ts). */
  parse?: ParseOptions;
}

/** One executed SELECT: the SQL that actually ran (diagnostics + the
 *  parameterization contract), its params, and the rows. `rows` is typed
 *  CardsRow[] for the default card/raw select; projection returns return
 *  single-column rows (pass an explicit Row type argument for those). */
export interface CqlExecutionResult<Row = CardsRow> {
  sql: string;
  params: unknown[];
  rows: Row[];
}

/** `return: "count"` collapses to a single integer (Run#alter_result). */
export interface CqlCountResult {
  sql: string;
  params: unknown[];
  count: number;
}

export type CqlQueryResult = CqlExecutionResult<CardsRow> | CqlCountResult;

/**
 * Parse options whose `resolveCardId` answers through the fetch layer's
 * DbLexicon — the same name->lex->id walk Ruby's Card::Lexicon.id performs
 * for every CQL name value (type/left/right/created_by restrict values,
 * string clauses; compound "A+B" names resolve recursively through their
 * side cards' ids, so the cards.name column never enters the path — that
 * column is NULL for compound rows since the 2020 Lexicon migration).
 *
 * DbLexicon's read path (peekId) is synchronous over cache-warm entries
 * only: warm first (await lexicon.name(id) over the deck's ids, or
 * FetchEngine#warmLexicon), then parse. A cold or unknown name yields
 * undefined and the parser falls back to Ruby's sentinels (-999 in
 * Tie#id_from_val, -2 in clause_to_hash) — an unresolvable name matches
 * nothing, exactly as in Ruby.
 */
export function parseOptionsWithLexicon(
  lexicon: DbLexicon,
  base: ParseOptions = {},
): ParseOptions {
  return { ...base, resolveCardId: (name: string) => lexicon.peekId(name) };
}

/**
 * Execute one CQL statement against a driver.
 *
 * Local drivers: register the REGEXP UDF once per connection before
 * matching (registerSqliteRegexpFunction). Edge drivers (D1/libSQL) cannot
 * host the UDF; the first "no such function: REGEXP" failure flips the
 * driver to the DECIDED post-filter path (docs/cql-execution-notes.md
 * "The REGEXP decision"): the match conditions are stripped from the SQL
 * (SqlOptions.matchPostFilter), the superset is fetched capped at
 * POSTFILTER_ROW_CAP, rows are filtered in JS with the same compile logic
 * as sqlite-regexp.ts, and the statement's limit/offset apply AFTER the
 * filter. Match shapes inside SUBSELECTS cannot post-filter (a JS row
 * filter cannot re-apply subselect membership) and refuse loudly as
 * CqlBadQuery. Statements using `found_by` reject at generation with
 * CqlBadQuery (docs/cql-port-notes.md, deferred #1).
 */
export async function executeQuery(
  driver: SQLDatabaseDriver,
  cqlQuery: unknown,
  options: CqlExecuteOptions = {},
): Promise<CqlQueryResult> {
  const root = parseCql(cqlQuery, options.parse);
  if (root.mods.return === "count") {
    return executeCountNode(driver, root, options);
  }
  const filters = collectMatchPostFilters(root);
  if (filters.length > 0) {
    if (hasNestedRegexpMatch(root)) throw nestedMatchRefusal();
    if (options.matchPostFilter === true || regexpBrokenDrivers.has(driver)) {
      return executeRowsPostFiltered(driver, root, options, filters);
    }
    const { sql, params } = generateSql(root, options);
    try {
      const result = await driver.query<CardsRow>(sql, params);
      return { sql, params, rows: result.rows };
    } catch (error) {
      if (!isMissingRegexpError(error)) throw error;
      // The edge-driver signature: mark the driver so later match queries
      // skip the failed attempt, and fall through to the post-filter.
      regexpBrokenDrivers.set(driver, true);
    }
  } else {
    const { sql, params } = generateSql(root, options);
    const result = await driver.query<CardsRow>(sql, params);
    return { sql, params, rows: result.rows };
  }
  return executeRowsPostFiltered(driver, root, options, filters);
}

/** Drivers that failed a REGEXP statement with the UDF-missing error. The
 *  memo makes the first match query on an edge driver pay exactly ONE
 *  failed round trip; every later one routes straight to the post-filter. */
const regexpBrokenDrivers = new WeakMap<object, true>();

function isMissingRegexpError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such function:\s*REGEXP/i.test(message);
}

function nestedMatchRefusal(): CqlBadQuery {
  return new CqlBadQuery(
    "match inside a subselect requires the REGEXP UDF (unavailable on this driver) — not supported by the JS post-filter; see docs/cql-execution-notes.md",
  );
}

/** The post-filtered row path: match-free SQL capped at POSTFILTER_ROW_CAP,
 *  JS filter, then the statement's own limit/offset in JS. */
async function executeRowsPostFiltered(
  driver: SQLDatabaseDriver,
  root: QueryNode,
  options: CqlExecuteOptions,
  filters: ConditionNode[],
): Promise<CqlExecutionResult<CardsRow>> {
  const { sql, params } = generateSql(root, { ...options, matchPostFilter: true });
  const result = await driver.query<CardsRow>(sql, params);
  const filtered = applyMatchFilters(result.rows, filters);
  return { sql, params, rows: applyPostFilterLimitOffset(filtered, root.mods) };
}

/** Evaluate the collected match conditions against one row — the JS half of
 *  the REGEXP semantics (case-insensitive by default, NULL never matches,
 *  the same compile logic as the UDF: sqlite-regexp.ts#compileMatchPattern).
 *  Conditions that stayed in SQL ("=term" name equality, like, raw) evaluate
 *  to true — the rows reaching the filter already satisfy them. */
function rowMatches(row: CardsRow, condition: ConditionNode): boolean {
  switch (condition.kind) {
    case "match": {
      const value = (row as unknown as Record<string, unknown>)[condition.field];
      if (value === null || value === undefined) return false; // SQL NULL propagation
      const pattern =
        condition.prefix === "~~" ? condition.term : escapeRegexpCharacters(condition.term);
      const compiled = compileMatchPattern(pattern);
      if (compiled === null) {
        // the UDF throws the same shape for an uncompilable pattern — a bad
        // pattern surfaces as a query failure, never silently-empty rows
        throw new Error(`invalid REGEXP pattern: ${pattern}`);
      }
      return compiled.test(String(value));
    }
    case "group": {
      const results = condition.conditions.map((child) => rowMatches(row, child));
      return condition.conj === "or" ? results.some(Boolean) : results.every(Boolean);
    }
    default:
      return true;
  }
}

function applyMatchFilters(rows: CardsRow[], filters: ConditionNode[]): CardsRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((filter) => rowMatches(row, filter)));
}

/** The statement's own limit/offset, applied AFTER the JS filter (they must
 *  not stay in the SQL — filtering after LIMIT would truncate before
 *  matching). Ruby quirks hold: limit <= 0 means unlimited; offset counts
 *  from the filtered set. */
function applyPostFilterLimitOffset(
  rows: CardsRow[],
  mods: { limit?: string; offset?: string },
): CardsRow[] {
  const limit = toIntOrZero(mods.limit);
  const offset = toIntOrZero(mods.offset);
  let out = rows;
  if (offset > 0) out = out.slice(offset);
  if (limit > 0) out = out.slice(0, limit);
  return out;
}

function toIntOrZero(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Execute a statement AS a count query (Ruby Card.count semantics): the
 * return mod is forced to "count", which also skips limit/order/group
 * (CardQuery#full?). Use for "how many cards match" regardless of any
 * return the statement itself declares.
 */
export async function executeCount(
  driver: SQLDatabaseDriver,
  cqlQuery: unknown,
  options: CqlExecuteOptions = {},
): Promise<number> {
  const root = parseCql(cqlQuery, options.parse);
  const result = await executeCountNode(driver, root, options);
  return result.count;
}

/** Count path shared by executeQuery (return: "count") and executeCount. */
async function executeCountNode(
  driver: SQLDatabaseDriver,
  root: QueryNode,
  options: CqlExecuteOptions = {},
): Promise<CqlCountResult> {
  const filters = collectMatchPostFilters(root);
  if (filters.length > 0) {
    if (hasNestedRegexpMatch(root)) throw nestedMatchRefusal();
    if (options.matchPostFilter === true || regexpBrokenDrivers.has(driver)) {
      return executeCountPostFiltered(driver, root, options, filters);
    }
    try {
      return await countSql(driver, root, options);
    } catch (error) {
      if (!isMissingRegexpError(error)) throw error;
      regexpBrokenDrivers.set(driver, true);
    }
    return executeCountPostFiltered(driver, root, options, filters);
  }
  return countSql(driver, root, options);
}

/** The plain count select (the count SQL cannot express the JS filter half,
 *  so the post-filtered count runs the ROW select instead — see
 *  executeCountPostFiltered). */
async function countSql(
  driver: SQLDatabaseDriver,
  root: QueryNode,
  options: CqlExecuteOptions,
): Promise<CqlCountResult> {
  root.mods.return = "count";
  const { sql, params } = generateSql(root, options);
  const result = await driver.query<Record<string, unknown>>(sql, params);
  const first = result.rows[0];
  const raw = first === undefined ? undefined : first["count"];
  const count = raw === undefined || raw === null ? 0 : Number(raw);
  return { sql, params, count: Number.isNaN(count) ? 0 : count };
}

/** Post-filtered count: the count aggregate cannot apply a JS filter, so the
 *  row select runs instead (return mod dropped for generation — that also
 *  re-enables the capped LIMIT the post-filter mode renders — the rows are
 *  filtered in JS and counted). The reported sql/params are the statement
 *  that ACTUALLY ran. Cap caveat: matches beyond POSTFILTER_ROW_CAP superset
 *  rows are missed, the documented post-filter divergence. */
async function executeCountPostFiltered(
  driver: SQLDatabaseDriver,
  root: QueryNode,
  options: CqlExecuteOptions,
  filters: ConditionNode[],
): Promise<CqlCountResult> {
  const savedReturn = root.mods.return;
  root.mods.return = undefined;
  try {
    const { sql, params } = generateSql(root, { ...options, matchPostFilter: true });
    const result = await driver.query<CardsRow>(sql, params);
    const count = applyMatchFilters(result.rows, filters).length;
    return { sql, params, count };
  } finally {
    root.mods.return = savedReturn;
  }
}
