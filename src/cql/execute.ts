/**
 * CQL execution: parse -> generateSql -> driver -> typed results.
 *
 * The closed loop over the SQL generator: a CQL statement becomes
 * parameterized SQLite SQL, runs through the storage driver seam
 * (src/server/driver.ts SQLDatabaseDriver — LocalSqliteDriver locally,
 * D1/libSQL adapters at the edge), and comes back as typed rows.
 *
 * Result shaping goes as far as SQL allows: `return: "count"` collapses to
 * the integer the single count row carries; card/raw selects return full card
 * rows (CardsRow from src/server/schema.ts). Projection returns (`name`,
 * `content`, `type_id`, ...) come back as the DB reports them —
 * single-column row objects. Name RECONSTRUCTION for compound cards is out
 * of scope here: the name column is NULL for every compound row and the
 * name has to be rebuilt from left_id/right_id, which needs the card/name
 * stream this module does not have.
 *
 *
 * REGEXP: match queries need the UDF from ./sqlite-regexp.js on local
 * drivers (registerSqliteRegexpFunction). The edge drivers cannot register
 * functions; the decided strategy (JS-side post-filter, see
 * docs/decisions/0005-cql-match-semantics.md) is implemented in
 * executeQuery: the first UDF-missing failure flips the driver to
 * match-free SQL + JS row filtering (SqlOptions.matchPostFilter).
 */

import type { SQLDatabaseDriver } from "../server/driver.js";
import type { CardsRow } from "../server/schema.js";
import type { DbLexicon } from "../card/fetch/lexicon.js";
import { DeckoName } from "../card/name.js";
import { parseCql } from "./parser.js";
import { CqlBadQuery, type ParseOptions, type ConditionNode, type QueryNode } from "./ast.js";
import {
  generateSql,
  collectMatchPostFilters,
  hasNestedRegexpMatch,
  type SqlOptions,
} from "./sql.js";
import { absolutizeName, escapeRegexpCharacters } from "./normalize.js";
import { compileMatchPattern } from "./sqlite-regexp.js";

/**
 * Execution-time options. Names in CQL (type: "User", part: "Home",
 * edited_by: "Joe Admin") resolve to ids DURING interpretation, so the
 * parse-time resolvers must flow through the execution entry rather than
 * being reachable from a module-level registry: the caller that owns the
 * lexicon hands them in on every call.
 */
export interface CqlExecuteOptions extends SqlOptions {
  /** ParseOptions for interpretation: vars, context, resolveCardId,
   *  resolveCodename, nameToKey, onWarning (see src/cql/ast.ts). */
  parse?: ParseOptions;
  /** Internal: the found_by resolution depth of the caller. The found_by
   *  pass (resolveFoundByConditions) executes target statements through
   *  executeQuery recursively; this carries the runaway-guard depth across
   *  that re-entry instead of letting every nested statement restart at 0. */
  foundByDepth?: number;
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

/** `return: "count"` collapses to a single integer instead of a row array. */
export interface CqlCountResult {
  sql: string;
  params: unknown[];
  count: number;
}

export type CqlQueryResult = CqlExecutionResult<CardsRow> | CqlCountResult;

/**
 * Parse options whose `resolveCardId` answers through the fetch layer's
 * DbLexicon — a name->lex->id walk run for every CQL name value
 * (type/left/right/created_by restrict values, string clauses; compound
 * "A+B" names resolve recursively through their side cards' ids, so the
 * cards.name column never enters the path — that column is NULL for
 * compound rows).
 *
 * DbLexicon's read path (peekId) is synchronous over cache-warm entries
 * only: warm first (await lexicon.name(id) over the deck's ids, or
 * FetchEngine#warmLexicon), then parse. A cold or unknown name yields
 * undefined and the parser falls back to its sentinels (-999 for a
 * relational value, -2 for a clause) — an unresolvable name matches
 * nothing.
 *
 * `ensureCardId` (wired here to DbLexicon.id) supplies the async half: it is
 * cache-first WITH a database fallback, and executeQuery runs it over every
 * card name the statement carries before parsing. That way a warm entry lost
 * to a cache eviction heals instead of resolving "unknown" for a real card.
 */
export function parseOptionsWithLexicon(
  lexicon: DbLexicon,
  base: ParseOptions = {},
): ParseOptions {
  return {
    ...base,
    resolveCardId: (name: string) => lexicon.peekId(name),
    ensureCardId: (name: string) => lexicon.id(name),
  };
}

/**
 * The async half of CQL name resolution, run before interpretation.
 *
 * Mechanism: interpretation resolves name values through DbLexicon.peekId,
 * a synchronous mirror over cache-warm entries that deliberately has no
 * database fallback — it is a mirror, not a lookup path. That mirror is
 * bounded: a cache whose entry cap is exceeded resets and drops its warmed
 * contents. On a deck whose warm-up writes more keys than the cap holds, the
 * reset happens DURING the warm, so the mirror ends the warm holding only
 * the tail of what was written, and every name the statement asks about
 * outside that tail reads as "unknown". The visible result is a search that
 * matches nothing while the deck plainly has matching cards.
 *
 * This pass closes that gap in the phase where a database read is
 * affordable: it walks every card-name string the statement can hand the
 * interpreter and resolves it through ParseOptions.ensureCardId (DbLexicon.id
 * — cache-first WITH a fallback), which repopulates the very entries peekId
 * reads. parseCql runs immediately afterwards with no intervening cache
 * writes, so interpretation sees a warm entry for each name it asks about,
 * including every name the reset had dropped.
 *
 * Without `ensureCardId` this is a no-op. Names that fail to resolve, or
 * that throw while resolving, stay the interpreter's business — it applies
 * the same sentinels it always has.
 */
async function ensureStatementCardNamesCached(
  cqlQuery: unknown,
  parse: ParseOptions | undefined,
): Promise<void> {
  if (parse === undefined || parse.ensureCardId === undefined) return;
  const ensureCardId = parse.ensureCardId;
  if (cqlQuery === null || typeof cqlQuery !== "object") return;
  const names = collectCardNameValues(cqlQuery);
  // Relative references ("_left", "_self", ...) absolutize FROM the context
  // before the resolver is asked (parser.ts normalizeStringValue ->
  // absolutizeName), and $vars substitute straight into value positions -
  // so the context (whole + parts) and the var values are names the
  // interpreter can ask about without the statement carrying them.
  if (parse.context !== undefined && parse.context !== "") {
    names.add(parse.context);
    try {
      for (const part of DeckoName.parse(parse.context).parts) {
        if (part !== "") names.add(part);
      }
    } catch {
      // an unparseable context contributes nothing the resolver can use
    }
  }
  for (const varValue of Object.values(parse.vars ?? {})) {
    if (typeof varValue === "string" && varValue !== "" && !varValue.startsWith("_")) {
      names.add(varValue);
    }
  }
  for (const name of names) {
    try {
      await ensureCardId(name);
    } catch {
      // priming leg only - a throwing name (e.g. an unregistered codename
      // mark) must not change the statement's outcome; the interpreter
      // applies the same sentinels it always has.
    }
  }
}

/**
 * Every string the statement could hand the resolveCardId sites (parser.ts
 * interpret / interpretToHash bare-string clauses and string restrict
 * values). Generous by design: a string the interpreter never asks about
 * costs one cached negative lookup; a string it DOES ask about must be warm.
 * Relative references ("_left", "+right") and $vars are skipped — the
 * interpreter absolutizes them from the context, never through the card-name
 * resolver; `return`/`sort`/`dir` carry view and ordering specs, not card
 * names. Conjunction item strings ("and"/"or") resolve to one negative
 * lookup per deck, accepted for the coverage.
 */
export function collectCardNameValues(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    if (value !== "" && !value.startsWith("_") && !value.startsWith("$")) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectCardNameValues(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "return" || key === "sort" || key === "dir") continue;
      collectCardNameValues(val, out);
    }
  }
  return out;
}

/**
 * Execute one CQL statement against a driver.
 *
 * Local drivers: register the REGEXP UDF once per connection before
 * matching (registerSqliteRegexpFunction). Edge drivers (D1/libSQL) cannot
 * host the UDF; the first "no such function: REGEXP" failure flips the
 * driver to the DECIDED post-filter path (see
 * docs/decisions/0005-cql-match-semantics.md): the match conditions are
 * stripped from the SQL
 * (SqlOptions.matchPostFilter), the superset is fetched capped at
 * POSTFILTER_ROW_CAP, rows are filtered in JS with the same compile logic
 * as sqlite-regexp.ts, and the statement's limit/offset apply AFTER the
 * filter. Match shapes inside SUBSELECTS cannot post-filter (a JS row
 * filter cannot re-apply subselect membership) and refuse loudly as
 * CqlBadQuery. `found_by` conditions resolve to id-set constraints before
 * generation (resolveFoundByConditions); any foundBy node that still
 * reaches the generator is an unhandled shape and refuses loudly there
 * (sql.ts's foundBy case).
 */
export async function executeQuery(
  driver: SQLDatabaseDriver,
  cqlQuery: unknown,
  options: CqlExecuteOptions = {},
): Promise<CqlQueryResult> {
  await ensureStatementCardNamesCached(cqlQuery, options.parse);
  const root = parseCql(cqlQuery, options.parse);
  await resolveFoundByConditions(driver, root, options);
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
    "match inside a subselect requires the REGEXP UDF (unavailable on this driver) — not supported by the JS post-filter; see docs/decisions/0005-cql-match-semantics.md",
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
 *  matching). A limit of zero or less means unlimited; offset counts from
 *  the filtered set. */
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
 * Execute a statement AS a count query: the return mod is forced to
 * "count", which also skips limit/order/group. Use for "how many cards
 * match" regardless of any return the statement itself declares.
 */
export async function executeCount(
  driver: SQLDatabaseDriver,
  cqlQuery: unknown,
  options: CqlExecuteOptions = {},
): Promise<number> {
  const root = parseCql(cqlQuery, options.parse);
  await resolveFoundByConditions(driver, root, options);
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

// ---------------------------------------------------------------------------
// found_by resolution
//
// `found_by` names another card and constrains the outer query to the rows
// that found card itself selects. The found card's context is its own name
// — fixed for the whole query, never varying per outer row — so the
// constraint is uncorrelated and translates exactly into an id set: run the
// found statement standalone for ids, then constrain the outer query with
// `id IN (ids)`, one ANDed constraint per found card.
//
// The value forms:
//  - Hash -> run the hash as a query, and each RESULT card's own statement
//    becomes a further subquery. That double indirection is refused with a
//    named error rather than approximated.
//  - string / array of strings -> the referenced card, absolutized against
//    the outer query's context (`_left` becomes the context's trunk). A
//    reference that names no fetchable card is a bad query.
//
// A found card's statement comes from the card TYPE, not only from its
// stored content. The types that carry a statement are search_type (parse
// the stored CQL JSON), cardtype (the fixed statement { type_id: id,
// sort_by: "name" }), and set. For set-typed targets the statement is
// usually CODE-DEFINED, keyed by the codename of the target's RIGHT part,
// and never read from the (often empty) stored content — see
// FOUNDBY_RIGHT_CODENAME_CQL. A worked shape: a search card
// `Sign up+*type+by name` does `found_by "_left"`, which absolutizes to
// `Sign up+*type`; that target is set-typed with empty content, so its
// statement is the `*type` override { type: "_left" }, which under context
// `Sign up+*type` resolves `_left` to `Sign up` and selects the cards of
// that type.
//
// The found statement's own return/limit/offset/sort mods do not drive the
// id run: the root query owns paging and ORDER, so a subquery's mods are
// not part of what it selects.
// ---------------------------------------------------------------------------

/** Type-set codenames whose cards carry a statement. */
const FOUNDBY_CQL_TYPES = new Set(["search_type", "cardtype", "set"]);

/** Statements defined by code, keyed by the target's RIGHT part's
 *  codename — the right-set variants each have their own fixed query. */
const FOUNDBY_RIGHT_CODENAME_CQL: Record<string, Record<string, unknown>> = {
  type: { type: "_left" },
  self: { name: "_left" },
  right: { right: "_left" },
  "type plus right": { left: { type: "_LL" }, right: "_LR" },
};

/** Runaway recursion cap. An unterminated found_by chain is refused loudly
 *  here instead of blowing the stack. */
const FOUNDBY_MAX_DEPTH = 8;

/** Never-matching sentinel id for an empty found set (ids are positive in
 *  the schema; -999 is the engine's existing unresolvable-name sentinel). */
const FOUNDBY_EMPTY_ID = -999;

/** Resolve every foundBy condition on `root` and its subqueries in place,
 *  replacing each with the equivalent id-set constraint(s). Runs before SQL
 *  generation in executeQuery/executeCount; a foundBy that reaches the
 *  generator after this pass is an unhandled shape (sql.ts refuses loudly). */
async function resolveFoundByConditions(
  driver: SQLDatabaseDriver,
  root: QueryNode,
  options: CqlExecuteOptions,
  depth = options.foundByDepth ?? 0,
): Promise<void> {
  for (const sub of root.subqueries) {
    await resolveFoundByConditions(driver, sub, options, depth);
  }
  for (let i = 0; i < root.conditions.length; i++) {
    const condition = root.conditions[i];
    if (condition === undefined || condition.kind !== "foundBy") continue;
    const replacements = await resolveFoundByCondition(
      driver,
      condition,
      root,
      options,
      depth,
    );
    root.conditions.splice(i, 1, ...replacements);
    i += replacements.length - 1;
  }
}

/** One foundBy condition -> the ANDed id-set constraints for its target
 *  card(s). Each found card becomes its own subquery, so multiple targets
 *  intersect. */
async function resolveFoundByCondition(
  driver: SQLDatabaseDriver,
  condition: Extract<ConditionNode, { kind: "foundBy" }>,
  node: QueryNode,
  options: CqlExecuteOptions,
  depth: number,
): Promise<ConditionNode[]> {
  if (depth > FOUNDBY_MAX_DEPTH) {
    throw new CqlBadQuery(
      `found_by nesting exceeds ${FOUNDBY_MAX_DEPTH} levels (Ruby has no cap; ` +
        "the port refuses runaway found_by chains instead of overflowing the stack)",
    );
  }
  const values = Array.isArray(condition.value) ? condition.value : [condition.value];
  const constraints: ConditionNode[] = [];
  for (const value of values) {
    if (value !== null && typeof value === "object") {
      // A Hash value runs as a query and each RESULT card's own statement
      // becomes a subquery of its own. Refuse it by name rather than
      // approximating a shape that is not exercised.
      throw new CqlBadQuery(
        `found_by hash values (Query.run + result-card cql_hash subqueries) are not supported: ${JSON.stringify(value)}`,
      );
    }
    if (typeof value !== "string") {
      throw new CqlBadQuery(
        `invalid found_by value: ${JSON.stringify(value)} (expected a card name or a list of names)`,
      );
    }
    // The reference resolves against THIS query's context (the search
    // card's own name, carried on QueryNode.context).
    const targetName = absolutizeName(value, node.context);
    const statement = await foundByTargetStatement(driver, targetName, options);
    constraints.push({
      kind: "value",
      field: "id",
      op: "in",
      values: await runFoundByTargetIds(driver, statement, targetName, options, depth),
    });
  }
  return constraints;
}

function invalidFoundByCard(name: string, typeName: string): CqlBadQuery {
  return new CqlBadQuery(
    `"found_by" value must be valid Search, but ${name} is a ${typeName}`,
  );
}

/** The target card's id: the caller's async db-fallback resolver
 *  (ParseOptions.ensureCardId — a cache-first-with-fallback walk that
 *  follows junctions), then the sync mirror. Without either resolver the
 *  found_by reference cannot be resolved — refuse by name, never silently. */
async function foundByTargetCardId(
  name: string,
  options: CqlExecuteOptions,
): Promise<number | undefined> {
  const parse = options.parse;
  const ensure = parse?.ensureCardId;
  if (ensure !== undefined) {
    try {
      const id = await ensure(name);
      if (id !== undefined && id !== null) return id;
    } catch {
      // fall through to the sync resolver / refusal
    }
  }
  const peeked = parse?.resolveCardId?.(name);
  if (peeked !== undefined && peeked !== null) return peeked;
  if (ensure === undefined && parse?.resolveCardId === undefined) {
    throw new CqlBadQuery(
      `found_by target "${name}" cannot be resolved: the execution options carry no ` +
        "card-name resolver (ParseOptions.ensureCardId / resolveCardId)",
    );
  }
  return undefined;
}

/** One live (non-trashed) cards row by id. */
async function fetchCardRowById(
  driver: SQLDatabaseDriver,
  id: number,
): Promise<CardsRow | undefined> {
  const result = await driver.query<CardsRow>(
    "SELECT * FROM cards WHERE id = ? AND trash = 0",
    [id],
  );
  return result.rows[0];
}

/** One card's codename by id (side/type cards — trash irrelevant for a
 *  codename read; a missing row yields undefined). */
async function fetchCodenameById(
  driver: SQLDatabaseDriver,
  id: number | null,
): Promise<string | undefined> {
  if (id === null || id === undefined) return undefined;
  const result = await driver.query<{ codename: string | null }>(
    "SELECT codename FROM cards WHERE id = ?",
    [id],
  );
  return result.rows[0]?.codename ?? undefined;
}

/** The found card's statement: the type check, then either a code-defined
 *  override or the card's stored CQL content.
 *
 *  A found_by reference NEVER misses outright. When no card row carries the
 *  name, a card is still fabricated from the NAME ITSELF — pattern-card
 *  typing means a right part tagged `*type` / `*self` / `*right` /
 *  `*type plus right` produces a set-typed fabricated card, and the same
 *  right-part override that would apply to a stored card applies here. So a
 *  `PlainText+*type` target with no row still resolves { type: "_left" }.
 *  Any other fabricated shape gets the deck's default card type, which
 *  carries no statement, and is a bad query. */
async function foundByTargetStatement(
  driver: SQLDatabaseDriver,
  targetName: string,
  options: CqlExecuteOptions,
): Promise<Record<string, unknown>> {
  const targetId = await foundByTargetCardId(targetName, options);
  const row = targetId === undefined ? undefined : await fetchCardRowById(driver, targetId);
  if (row !== undefined) {
    const typeCodename = await fetchCodenameById(driver, row.type_id);
    if (!FOUNDBY_CQL_TYPES.has(typeCodename ?? "")) {
      // Every other type carries no statement at all.
      throw invalidFoundByCard(targetName, typeCodename ?? "unknown");
    }
    if (typeCodename === "cardtype") {
      // A cardtype target selects exactly itself, ordered by name.
      return { type_id: row.id, sort_by: "name" };
    }
    if (typeCodename === "set") {
      const override = await foundByRightCodenameOverride(driver, row.right_id);
      if (override !== undefined) return override;
      // No code override: the stored content is the statement.
      return parseFoundByContentCql(row.db_content ?? "");
    }
    // search_type: the stored content is the statement.
    return parseFoundByContentCql(row.db_content ?? "");
  }
  // No row: the fabricated pattern card. The right part's codename decides.
  const fabricated = await foundByFabricatedStatement(driver, targetName, options);
  if (fabricated !== undefined) return fabricated;
  // A fabricated non-pattern card carries the deck's default card type,
  // which has no statement.
  throw invalidFoundByCard(targetName, "Basic");
}

/** The right-set cql_content override for a card's right part, resolved
 *  through the codename column. */
async function foundByRightCodenameOverride(
  driver: SQLDatabaseDriver,
  rightId: number | null,
): Promise<Record<string, unknown> | undefined> {
  const rightCodename = await fetchCodenameById(driver, rightId);
  const override =
    rightCodename === undefined ? undefined : FOUNDBY_RIGHT_CODENAME_CQL[rightCodename];
  return override === undefined ? undefined : { ...override };
}

/** The fabricated-card arm: resolve the target's RIGHT part by name; when
 *  its codename carries a right-set override, that hash is the statement of
 *  the fabricated set-typed card. A name splits at its LAST joint, so the
 *  right of "PlainText+*type" is "*type". */
async function foundByFabricatedStatement(
  driver: SQLDatabaseDriver,
  targetName: string,
  options: CqlExecuteOptions,
): Promise<Record<string, unknown> | undefined> {
  const rightName = DeckoName.parse(targetName).rightName?.s;
  if (rightName === undefined) return undefined;
  const rightId = await foundByTargetCardId(rightName, options);
  if (rightId === undefined) return undefined;
  return foundByRightCodenameOverride(driver, rightId);
}

/** The card's stored CQL JSON. The empty and unparseable shapes are bad
 *  queries in their own right, named as such; a parse result that is not an
 *  object at all is a plain Error — the statement has to be a map before it
 *  can be interpreted, and this is the point where that stops being true. */
function parseFoundByContentCql(content: string): Record<string, unknown> {
  if (content === "") {
    throw new CqlBadQuery("can't run search with empty content");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new CqlBadQuery(`Invalid JSON search query: ${content}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`cql content is not a Hash: ${content}`);
  }
  return parsed as Record<string, unknown>;
}

/** Run the found statement standalone for its id set, in the found card's
 *  own name as the context. Paging/sort mods are stripped — a subquery's
 *  mods do not drive the root query's SQL (the root owns limit_and_offset
 *  and ORDER). Nested found_by inside the found statement resolves
 *  recursively. */
async function runFoundByTargetIds(
  driver: SQLDatabaseDriver,
  statement: Record<string, unknown>,
  targetName: string,
  options: CqlExecuteOptions,
  depth: number,
): Promise<number[]> {
  const stripped: Record<string, unknown> = { ...statement };
  for (const mod of ["return", "limit", "offset", "sort", "sort_by", "dir"]) {
    const value = stripped[mod];
    // a Hash value is an attribute clause, not the modifier — leave it
    if (value !== undefined && value !== null && typeof value !== "object") {
      delete stripped[mod];
    }
  }
  const result = await executeQuery(driver, stripped, {
    ...options,
    foundByDepth: depth + 1,
    parse: { ...options.parse, context: targetName },
  });
  // The projection stays the found statement's default (full card rows):
  // `return: "id"` would drop the columns the JS match post-filter
  // re-applies against (executeRowsPostFiltered), so a found statement
  // carrying a match condition would filter every row away.
  const ids: number[] = [];
  for (const row of "rows" in result ? result.rows : []) {
    const id = (row as unknown as Record<string, unknown>)["id"];
    if (typeof id === "number" && Number.isInteger(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : [FOUNDBY_EMPTY_ID];
}
