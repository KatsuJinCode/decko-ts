# CQL execution notes (wave 2 — the closed loop)

The execution side of the CQL port: prove that the wave-1 generator's SQL
(docs/cql-port-notes.md) RUNS against a real database and returns correct
rows. Files: `src/cql/execute.ts` (entry points), `src/cql/sqlite-regexp.ts`
(the REGEXP UDF), `tests/cql/execution.test.ts` (49 end-to-end tests over a
seeded in-memory better-sqlite3 database built from `db/schema.sqlite.sql`).

## Execution contract

```ts
executeQuery(driver, statement, options?) -> Promise<CqlQueryResult>
executeCount(driver, statement, options?) -> Promise<number>

type CqlQueryResult =
  | { sql: string; params: unknown[]; rows: CardsRow[] }   // card/raw selects
  | { sql: string; params: unknown[]; count: number }      // return: "count"
```

- `options.parse` (`ParseOptions`): vars, context, `resolveCardId`,
  `resolveCodename`, `nameToKey`, `onWarning`. Names resolve to ids DURING
  interpretation (`type: "User"`, `part: "Home"`, `edited_by: "Joe Admin"`),
  so the resolvers must flow through the execution entry — Ruby reads them
  from Lexicon/Codename globals. Found the hard way: without this seam every
  name-based statement silently resolves to the -999/-2 sentinels. The
  execution tests pin resolver behavior.
- `options.alwaysOk` / `options.readRuleIds`: the generator's permission
  switches, unchanged (default always-ok; empty rule list renders the Ruby
  sentinel `IN (1)`).
- Result shaping mirrors `Run#alter_result` where SQL allows: `return:
  "count"` collapses to the integer; default selects return full card rows
  typed `CardsRow` (`src/server/schema.ts`; the task brief's "CardRow" is
  this interface). Projection returns (`name`, `content`, `type_id`, ...)
  come back as the DB reports them — single-column row objects; pass an
  explicit row type argument.
- Sort/limit/offset round-trip through SQL; the Ruby quirks hold in
  execution: LIMIT only with `limit > 0`, OFFSET only with LIMIT (offset
  alone paginates nothing — pinned by test), count ignores limit/order/group
  (`CardQuery#full?`).
- Params are strings / integers / null only (`assertSimpleValue` upstream);
  all three drivers bind those natively.
- `found_by` statements reject at execution with the generator's wave-2
  pointer (pinned by test).

### Driver extension (landed file, additive)

`LocalSqliteDriver.registerFunction(name, fn, options?)` was added to
`src/server/drivers/local-sqlite.ts` (plus the `function` member on its
local `BetterSqlite3Database` interface). Narrow and backward-compatible: a
new method, no signature or behavior change for existing callers. Rationale:
the driver intentionally does not expose the better-sqlite3 handle, but the
REGEXP UDF must be registered on the underlying connection. Runtime-verified
on better-sqlite3 13.0.3 / SQLite 3.53.4 (Windows, node 24).

## The REGEXP decision

The generator emits `field REGEXP ?` (the token card-1.110.0's ActiveRecord
patch generates for MySQL). SQLite compiles `X REGEXP Y` but fails at run
time with `no such function: REGEXP` unless a `regexp` function is
registered on the connection. The failure is loud, not silent — pinned by a
test that runs a match query against a driver WITHOUT the UDF.

**Local/test path (implemented):** `registerSqliteRegexpFunction(driver)`
(`src/cql/sqlite-regexp.ts`) registers a deterministic UDF. Semantics:

- case-insensitive by default, matching MySQL REGEXP (ICU in 8.x, Henry
  Spencer in 5.x; both ASCII case-fold by default; decko keys are downcased
  anyway);
- argument order is `regexp(pattern, value)` — SQLite evaluates `X REGEXP Y`
  as `regexp(Y, X)`; runtime-verified, and wrong order would flip every
  match result;
- pattern flavor: the generator's escaped literals (every non-word char
  backslashed) run verbatim as JS Annex-B identity escapes in non-unicode
  mode (`\ `, `\-`, `\.` match literally — runtime-verified); `~~` raw
  patterns are JS-compatible for common syntax, and POSIX classes
  (`[[:alpha:]]`) fail the compile and THROW — a bad pattern surfaces as a
  query error, never silently-empty rows (MySQL errors on bad regexps too;
  pinned by test);
- NULL operands return NULL (so compound cards with NULL `name` never match
  name-REGEXP — SQL NULL propagation, pinned by test);
- compiled patterns are cached per process (bounded at 512, cleared).

**Edge path (decided, NOT implemented): D1 and libSQL have no REGEXP and no
UDF registration. Recommendation: JS-side post-filtering of a superset
query.** Reasoning:

1. LIKE rewrite only covers escaped-literal terms; `~~` raw patterns,
   anchors, classes and alternation are untranslatable — it would fork match
   semantics between local and edge.
2. FTS5 exists on both platforms but changes semantics (word-boundary
   tokenization vs substring/regexp), needs a shadow virtual table +
   triggers + a MATCH-syntax rewrite — a schema-stream project with real
   parity risk, wrong cost for correctness-first wave 2.
3. Post-filtering keeps ONE matching implementation: strip `match`
   conditions (the AST already tags them, `kind: "match"`) from the SQL,
   fetch the superset, filter rows in JS with the same compile logic as
   `sqlite-regexp.ts`, then apply limit/offset in JS after filtering (they
   must NOT stay in SQL — filtering after LIMIT would truncate before
   matching). Cost: unbounded superset fetches, so the edge executor needs a
   row cap; FTS5 remains the scaling answer if match volume ever demands it.

## Generator adjustments: none required

Hypothesis was that SQLite would reject MySQL-isms beyond REGEXP. It did
not. Every SQL family the generator emits ran unmodified on SQLite
3.53.4 (all runtime-verified, most pinned in the execution suite):

- `trash is false` over the CHECK-constrained 0/1 column;
- `coalesce(count(distinct c0.id),0) as count` — `count` is a legal alias;
- `SELECT DISTINCT` over join sets, incl. the parenthesized LEFT JOIN
  groups (`LEFT JOIN (card_actions cn1 JOIN card_acts cx2 ... )`),
  which SQLite's join-clause grammar accepts;
- `CAST(... AS INTEGER/REAL/TEXT)` (sort_as), `GROUP BY`, `LIKE`, `IN`,
  `IS NULL`/`is null`, LIMIT/OFFSET, the sort-hash join.

No regression tests were needed against the generator; the 60
sql-generation tests plus 49 execution tests are the joint record.

## Mid-flight landing this stream consumed

The card/name stream landed the real `DeckoName`-backed `defaultNameToKey`
(ActiveSupport singularize included: "Editor Notes" -> `editor_note`) and
`DeckoName.absolute` absolutization while this stream was running
(tests/cql/reconciliation.test.ts, docs/name-port-notes.md). Consequence
consumed here: the execution seed stores Ruby-truth keys (a card NAMED
"Editor Notes" has key `editor_note`), and the tests reference names, not
keys, wherever the parser key-ifies — so the suite is robust to further
inflector corrections. Anything the name layer changes in key computation
changes CQL results; the execution suite is the integration pin.

## Reconciliation list

- **Schema stream (`db/schema.sqlite.sql`, `src/server/schema.ts`)** —
  verified by RUNNING it: every suite run loads the CORE DDL through
  `driver.query`. Names match `src/cql/constants.ts` exactly (cards,
  card_references, card_actions, card_acts; `db_content` not `content`;
  `read_rule_id` indexed; `trash` CHECK (0,1) makes the Ruby-parity
  `trash is false` predicate correct). The execution suite exercises
  `cards` + `card_references` + `card_actions` + `card_acts` rows
  end-to-end. No renames needed; nothing for the schema stream to change.
- **Fetch stream (`src/card/fetch/**`, in flight)** — `executeQuery`
  returns raw SQL rows; hydrating them into engine Card objects, the card
  cache, and `found_by`'s run-during-interpretation are the natural next
  consumer. `statementExtras.prepend/append` (parse-surfaced, no SQL
  effect) also wait for the fetch/result-shaping layer, as in Ruby's
  `Run#alter_result`.
- **Name stream** — see section above; key computation is shared through
  `defaultNameToKey` / `ParseOptions.nameToKey`.

## Deferred (honest gaps)

1. **Name reconstruction** — `return: "name"` returns the raw
   `{name, left_id, right_id}` rows; compound cards carry NULL there and
   Ruby rebuilds "left+right" recursively. Needs the card/name algebra +
   recursive fetch; deferred to the fetch/engine wave.
2. **`found_by`** — requires running nested queries / Search-card fetches
   at interpretation time; the execution entry exists but the engine loop
   (Query.run semantics) does not.
3. **Edge REGEXP** — decided (post-filter), not implemented; see above.
4. **Sort-by-count** — still parser-raised (wave-1 deferral #2); nothing in
   execution changes that.
5. **UDF lifecycle** — registration is per better-sqlite3 connection and
   must precede the first prepare of a match statement. `executeQuery` does
   NOT auto-register (it accepts the `SQLDatabaseDriver` interface, which
   has no registration concept); callers bootstrap with
   `registerSqliteRegexpFunction` exactly once per driver instance.
