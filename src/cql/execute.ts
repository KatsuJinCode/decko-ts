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
 * functions; the decided strategy (JS-side post-filter) is documented, not
 * implemented, in docs/cql-execution-notes.md.
 */

import type { SQLDatabaseDriver } from "../server/driver.js";
import type { CardsRow } from "../server/schema.js";
import { parseCql } from "./parser.js";
import type { ParseOptions, QueryNode } from "./ast.js";
import { generateSql } from "./sql.js";
import type { SqlOptions } from "./sql.js";

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
 * Execute one CQL statement against a driver.
 *
 * Local drivers: register the REGEXP UDF once per connection before
 * matching (registerSqliteRegexpFunction). Statements using `found_by`
 * reject here — the generator refuses them (docs/cql-port-notes.md,
 * deferred #1); executing them is the wave-2 engine work.
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
  const { sql, params } = generateSql(root, options);
  // CardsRow straight from the driver generic (the pre-reconciliation
  // `Record<string, unknown>` + cast failed tsc's overlap check)
  const result = await driver.query<CardsRow>(sql, params);
  return { sql, params, rows: result.rows };
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
  root.mods.return = "count";
  const { sql, params } = generateSql(root, options);
  const result = await driver.query<Record<string, unknown>>(sql, params);
  const first = result.rows[0];
  const raw = first === undefined ? undefined : first["count"];
  const count = raw === undefined || raw === null ? 0 : Number(raw);
  return { sql, params, count: Number.isNaN(count) ? 0 : count };
}
