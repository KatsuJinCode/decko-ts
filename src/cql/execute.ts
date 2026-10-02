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
 * parse-time resolvers must flow through the execution entry — Ruby reads
 * them from Card::Lexicon / Card::Codename globals; the port injects them.
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
 *
 * Ruby's own path has no "warm first" precondition because Lexicon.id
 * falls back to SQL synchronously; `ensureCardId` (wired here to
 * DbLexicon.id) restores that fallback through the pre-parse pass in
 * executeQuery, so a warm wiped by the Temporary cache's max_keys reset
 * heals instead of resolving "unknown" for a real card.
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
 * The async half of Ruby's CQL name resolution, run before interpretation.
 *
 * Mechanism (search-parity-2 receipt, probe-verified): Ruby answers every
 * CQL name value synchronously through Card::Lexicon (lib/card/query/
 * value.rb#id_from_val -> Card::Lexicon.id -> lexicon.rb#lex_to_id), which
 * is cache-first WITH a SQL fallback - so when the Temporary cache's
 * max_keys reset (cache/temporary.rb#within_key_counts, default 10_000
 * keys) wipes warmed entries mid-boot on any deck larger than the cap,
 * Ruby re-reads them from the database and no search ever notices. The
 * port's interpretation resolves through the sync warm-cache mirror
 * (DbLexicon.peekId), which deliberately has no db fallback, so on a
 * 47,235-live-card deck the warm's own ~94k writes reset the mirror 10
 * times and every name but the last-warmed tail resolves "unknown" (the
 * 47 census search pages rendering search-no-results; production escapes
 * only via the out-of-band full-deck key map in deploy/worker.ts#
 * primeCqlNameResolver). This pass performs Ruby's fallback leg in the
 * async phase the port has: every card-name string the statement carries
 * resolves through ParseOptions.ensureCardId (DbLexicon.id - the same
 * cache-first-with-fallback walk), and the resolved L- entries land in
 * the same cache peekId reads. parseCql runs immediately after with no
 * intervening cache writes, so interpretation sees warm entries for
 * exactly the names it asks about. Without `ensureCardId` this is a
 * no-op; names that fail to resolve (or throw) stay the interpreter's
 * business (Ruby's -999/-2 sentinels, unchanged).
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
 * interpret / interpretToHash bare-string clauses, Tie#id_from_val string
 * restrict values). Generous by design: a string the interpreter never
 * asks about costs one cached negative lookup; a string it DOES ask about
 * must be warm. Relative references ("_left", "+right") and $vars are
 * skipped - the interpreter absolutizes them from the context, never
 * through the card-name resolver; `return`/`sort`/`dir` carry view and
 * ordering specs, not card names. Conjunction item strings ("and"/"or")
 * resolve to one negative lookup per deck, accepted for the coverage.
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
 * driver to the DECIDED post-filter path (docs/cql-execution-notes.md
 * "The REGEXP decision"): the match conditions are stripped from the SQL
 * (SqlOptions.matchPostFilter), the superset is fetched capped at
 * POSTFILTER_ROW_CAP, rows are filtered in JS with the same compile logic
 * as sqlite-regexp.ts, and the statement's limit/offset apply AFTER the
 * filter. Match shapes inside SUBSELECTS cannot post-filter (a JS row
 * filter cannot re-apply subselect membership) and refuse loudly as
 * CqlBadQuery. `found_by` conditions resolve to id-set constraints before
 * generation (resolveFoundByConditions — the port of card-1.110.0
 * lib/card/query/card_query/found_by.rb); any foundBy node that still
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
// found_by resolution (the wave-2 unit; card-1.110.0
// lib/card/query/card_query/found_by.rb)
//
// Ruby's found_by val (found_by.rb:6-10) resolves the value to card(s) and
// merges each found card's cql_hash into the query as a fasten: :direct
// subquery (found_by.rb:14-16) — the outer query's rows must satisfy the
// found statement, with the found card's OWN name as the subquery's context
// (found_by.rb:15). Because that context is fixed per query (never per
// outer row), the subquery is uncorrelated and the id-set translation is
// exact: run the found statement standalone for ids and constrain the outer
// query with `id IN (ids)` — one ANDed constraint per found card, matching
// Ruby's one subquery per card.
//
// The value forms (found_by.rb:27-39):
//  - Hash -> Query.run(val), and each RESULT card's cql_hash becomes a
//    subquery — the double indirection is not exercised by any census page
//    and refuses with a named error.
//  - string / array of strings -> Card.fetch value.to_name.absolute(context)
//    (found_by.rb:35-39; `_left` -> context.trunk, cardname-0.20.0
//    lib/cardname/contextual.rb:110). A missing fetch returns a new
//    non-Search card whose try(:cql_hash) is nil -> BadQuery.
//
// found_by_statement (found_by.rb:18-25) is the found card's cql_hash; the
// card must RESPOND to cql_hash. In the gems that response set is:
// Type::SearchType (card-mod-search set/type/search_type.rb includes
// Abstract::CqlSearch), Type::Cardtype (card-mod-search set/type/cardtype.rb
// — cql_content { type_id: id, sort_by: :name }), and Type::Set
// (card-mod-rules set/type/set.rb:1 includes Type::SearchType). For
// Set-typed cards the cql_content is usually CODE-DEFINED, never parsed
// from the (often empty) db content: card-mod-rules set/right/{type,self,
// right,type_plus_right}.rb define cql_content for every card tagged
// *type / *self / *right / *type plus right. This is the corpus trio's
// exact shape: `Sign up+*type+by name` -> found_by "_left" ->
// `Sign up+*type` (Set-typed, empty content) -> cql_content
// { type: "_left" } -> context `Sign up+*type` absolutizes `_left` to
// `Sign up` -> the Sign up-typed cards.
//
// Subquery mods (the found statement's own return/limit/offset/sort family)
// do not drive a direct-fastened subquery in Ruby (the root query owns
// limit_and_offset and the ORDER clause), so the standalone id run strips
// them.
// ---------------------------------------------------------------------------

/** Type-set codenames whose cards respond to cql_hash. */
const FOUNDBY_CQL_TYPES = new Set(["search_type", "cardtype", "set"]);

/** cql_content overrides keyed by the target's RIGHT part's codename
 *  (card-mod-rules set/right/*.rb — the VirtualSet modules). */
const FOUNDBY_RIGHT_CODENAME_CQL: Record<string, Record<string, unknown>> = {
  // set/right/type.rb:5-7
  type: { type: "_left" },
  // set/right/self.rb:5-7
  self: { name: "_left" },
  // set/right/right.rb:5-7
  right: { right: "_left" },
  // set/right/type_plus_right.rb:5-7
  "type plus right": { left: { type: "_LL" }, right: "_LR" },
};

/** Runaway recursion cap (Ruby has none; the port refuses a runaway chain
 *  loudly instead of blowing the stack). */
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
 *  card(s) (found_by.rb:7-8 iterates the found cards; each becomes its own
 *  subquery, so multiple targets intersect). */
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
      // found_by.rb:28-30 — a Hash value runs Query.run(val) and each RESULT
      // card's cql_hash becomes a subquery. No census page exercises the
      // shape; refuse it by name rather than approximating it.
      throw new CqlBadQuery(
        `found_by hash values (Query.run + result-card cql_hash subqueries) are not supported: ${JSON.stringify(value)}`,
      );
    }
    if (typeof value !== "string") {
      throw new CqlBadQuery(
        `invalid found_by value: ${JSON.stringify(value)} (expected a card name or a list of names)`,
      );
    }
    // found_by.rb:37 — value.to_name.absolute(context): the found_by
    // reference resolves against THIS query's context (the search card's
    // name; QueryNode.context is AbstractQuery#context).
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
  // found_by.rb:23-25's exact message shape.
  return new CqlBadQuery(
    `"found_by" value must be valid Search, but ${name} is a ${typeName}`,
  );
}

/** The target card's id: the caller's async db-fallback resolver
 *  (ParseOptions.ensureCardId — Card::Lexicon.id's cache-first-with-fallback
 *  walk, junction-aware), then the sync mirror. Without either resolver the
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

/** One cards row by id (Card.fetch's non-trashed read). */
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

/** found_by_statement (found_by.rb:18-20): the found card's cql_hash — the
 *  responding-types check plus the code-defined cql_content overrides.
 *  `Card.fetch(name, new: {})` (found_by.rb:37) NEVER misses: for a name
 *  with no row it fabricates a card whose set modules come from the NAME
 *  (decko's pattern-card typing) — for a right part tagged *type / *self /
 *  *right / *type plus right the fabricated card is Set-typed and the same
 *  right-set cql_content override applies (the PlainText census page's
 *  `PlainText+*type` target has no corpus row and still resolves
 *  {type: "_left"}). Any other fabricated shape has the deck-default type
 *  (Basic — try(:cql_hash) nil) and takes the :22-25 BadQuery. */
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
      // found_by.rb:22-25 — try(:cql_hash) is nil for every other type.
      throw invalidFoundByCard(targetName, typeCodename ?? "unknown");
    }
    if (typeCodename === "cardtype") {
      // card-mod-search set/type/cardtype.rb:4-6 cql_content:
      // { type_id: id, sort_by: :name }
      return { type_id: row.id, sort_by: "name" };
    }
    if (typeCodename === "set") {
      const override = await foundByRightCodenameOverride(driver, row.right_id);
      if (override !== undefined) return override;
      // No code override: CqlSearch#cql_content parses the db content
      // (cql_search.rb:8-12) with :29-38's exact BadQuery shapes.
      return parseFoundByContentCql(row.db_content ?? "");
    }
    // search_type: cql_hash = cql_content = parse_json_cql(content)
    // (cql_search.rb:3-12, :29-38).
    return parseFoundByContentCql(row.db_content ?? "");
  }
  // No row: the fabricated pattern card. The right part's codename decides.
  const fabricated = await foundByFabricatedStatement(driver, targetName, options);
  if (fabricated !== undefined) return fabricated;
  // A fabricated non-pattern card has the deck-default type (Basic) —
  // found_by.rb:22-25.
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
 *  its codename carries a right-set cql_content override, that hash is the
 *  fabricated Set-typed card's cql_hash. `X+*type` splits at the LAST joint
 *  (Cardname#left_name/right_name), so the right of "PlainText+*type" is
 *  "*type". */
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

/** cql_search.rb:29-38 parse_json_cql — Ruby's exact BadQuery messages for
 *  the empty and unparseable shapes; a non-Hash parse RESULT crashes Ruby
 *  unrescued at :11 symbolize_keys, mirrored as a plain Error. */
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
 *  own name context (found_by.rb:15 context: card.name). Paging/sort mods
 *  are stripped — a direct-fastened subquery's mods do not drive the root
 *  query's SQL (the root owns limit_and_offset and ORDER). Nested found_by
 *  inside the found statement resolves recursively. */
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
