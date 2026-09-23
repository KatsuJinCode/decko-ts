# CQL execution notes (wave 2 — the closed loop)

The execution side of the CQL port: prove that the wave-1 generator's SQL
(docs/cql-port-notes.md) RUNS against a real database and returns correct
rows. Files: `src/cql/execute.ts` (entry points + the Lexicon resolution
seam), `src/cql/sqlite-regexp.ts` (the REGEXP UDF),
`tests/cql/execution.test.ts` (49 end-to-end tests over a seeded in-memory
better-sqlite3 database built from `db/schema.sqlite.sql`),
`tests/cql/oracle-replay.test.ts` (the captured CQL battery replayed
strictly — see "Oracle replay 11/11" below).

**Status 2026-09-20 (name-resolution stream): the captured oracle battery
`fixtures/captured/cql-basic.json` replays 11/11 strict** (was 3/11 with 7
PEND + 1 capture-error sentinel). The gap was name→id resolution: post-2020
compound cards carry NULL `cards.name`/`cards.key`, so CQL name values
(`left:`/`right:`/`type:`/`created_by:` restricts, compound `+` names) must
resolve through the Lexicon's junction walk, not a column read.

## Name→id resolution: the Lexicon seam (landed 2026-09-20)

CQL carries NAME strings everywhere ids are meant (`type: "Search"`,
`left: "Oracle Junction"`, `plus: "child_one"`, `created_by: "Decko Bot"`).
Ruby resolves them during interpretation through `Card::Lexicon.id` /
`Tie#id_from_val` — and since the 2020 Lexicon migration a compound card's
name lives NOWHERE in a single column: it is `left_id`/`right_id` walked
recursively (`lexicon.rb#name_to_lex`/`#lex_to_id`). Reading `cards.name`
would send every compound resolution to the -999 sentinel, which is exactly
why 7 of the 11 captured queries returned 0 rows.

**The shared walk lives fetch-side, in one place:**
`src/card/fetch/lexicon.ts` — `DbLexicon.id(name)` (async, the retrieval
path) and `DbLexicon.peekId(name)` (sync mirror added by this stream).
`peekId` walks the SAME `name_to_lex`/`lex_to_id` path line-for-line but
reads only cache-warm entries (temp, then shared — `cache.rb#read`), so
fetch and CQL cannot drift: there is no second implementation of the walk
anywhere, and `tests/cql/name-resolution.test.ts` pins `peekId(name) ===
await id(name)` for every name shape CQL can carry (simple, compound,
3-part junction, key string, unknown, blank, relative fragment).

**The seam:** `executeQuery`/`executeCount` options accept
`parseOptionsWithLexicon(lexicon, base?)` (`src/cql/execute.ts`), which
wires `ParseOptions.resolveCardId` to `lexicon.peekId`. The async/sync
boundary is honest and documented on both sides: the driver is async, the
parse-time resolver is sync (Ruby's Lexicon is cache-first synchronous too
— the db fallback is the only difference), so callers WARM first (`await
lexicon.name(id)` over the deck's ids, or `FetchEngine.warmLexicon`) and
parse afterwards. A cold or unknown name returns `undefined` — never a
wrong id — and the parser falls back to Ruby's sentinels (-999 in
`Tie#id_from_val`, -2 in `clause_to_hash`), so an unresolvable name matches
nothing exactly as in Ruby. Relative fragments (`+part`, `_left`) stay
unresolved (lexicon.rb:24), and result names recompose through the same
walk in reverse (`DbLexicon.name(id)` — the `Card#name` composition).

Fetch-side diff: exactly one additive method pair on `DbLexicon`
(`peekId` + private `peekLex`); no behavior of the fetch layer changed,
`tests/card/fetch` untouched and green.

## Oracle replay 11/11 (fixtures/captured/cql-basic.json)

`tests/cql/oracle-replay.test.ts` replays every captured query through the
real execution path (`executeQuery`: parseCql → generateSql →
LocalSqliteDriver) and byte-compares each name result SET against Ruby's
recording (sorted on both sides; the captured files' row order is not a
contract the generator pins — ORDER BY shapes are pinned in the
sql-generation suite). Mechanics per query family:

- **Exact name/content** (`exact_name`, `no_results`, `content_exact`) —
  passed before this stream: `name` key-ifies through `nameToKey`, `content`
  maps to `db_content`; no id resolution involved.
- **Restrict resolution** (`left_children`, `right_child`, `plus_condition`,
  `type_dir_desc`, `type_limit`, `not_cardtypes`, `created_by_bot`) — need
  `resolveCardId` through the Lexicon seam above.
- **Result-name composition** — result rows come back with NULL name
  columns for compound cards; the replay recomposes via `DbLexicon.name`,
  the same walk `Card#name` uses (including 3-part junctions like
  `*to+*right+*content options`, which a naive left+right single-level
  join cannot name).

### The seeded capture deck (tests/cql/cql-test-storage.ts)

The capture ran against a fresh 618-card decko app. The replay seeds the
query-relevant model of that deck with its REAL capture-deck ids (read
from `tools/oracle/decko-oracle-app` read-only; standard decko seed
content, no SourceDeck data). Two properties are load-bearing and
documented in the seed file:

1. **NULL-key sort windows.** `sort: "name"` orders by the `key` column;
   SQLite sorts NULL keys first ASC / last DESC with rowid tie-breaks. The
   captured limit windows are reproduced exactly: `created_by_bot` (limit
   5) = the five lowest-id real compounds (10, 11, 14, 19, 29 — every
   later real compound sorts behind the window, so omitting it cannot
   change the set); `not_cardtypes`/`type_limit` = Search compounds
   157, 160, 163 (ASC, NULLs first, id order); `type_dir_desc` = 614 >
   278 > 100 (DESC, NULLs last). Runtime-verified against the oracle
   app's own SQLite engine with the same ORDER BY shapes before writing
   the seed.
2. **The Search-type set is modeled completely** (all 13 real Search-type
   cards), so the type-filtered windows see the full real set.

`not_cardtypes`'s `not: {type: "Cardtype"}` also resolves "Cardtype"
through the seam (real id 3) and negates via the generator's LEFT JOIN +
`id is null` shape.

### match_sentinel: the one entry without an oracle result set

The fixture records `result: "CAPTURE_ERROR: RuntimeError: %{func} not
implemented"` for `{match: "Oracle"}` — the CAPTURE failed, not the query:
Ruby's CQL `match` is MySQL/PG-only (no SQLite REGEXP; the oracle app is
SQLite — docs/oracle-harness.md), so Ruby never produced a result set to
compare against. Byte-comparison is therefore impossible BY CAPTURE, and
the replay does not fake one. It (a) pins the error sentinel so a future
re-capture that records a real result set fails loudly and upgrades the
comparison to a true byte-parity, and (b) RUNS the query through the engine
with the REGEXP UDF and asserts the set the generator+UDF semantics imply
for the seed: name `REGEXP /oracle/i` over non-NULL names (605, 606, 611,
614, 615 — compound rows never match the name side, the UDF's NULL
propagation) OR `db_content` matches (605, 611, 614). That is the honest
ceiling until a MySQL oracle rung lands; the entry executes, is asserted,
and its provenance is labeled in the test.

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
(`src/cql/sqlite-regexp.ts`) registers a deterministic UDF. The execution
suite registers it at bootstrap (`beforeAll`), and the oracle replay
registers it on its replay connection (`cql-test-storage.ts#
createCqlTestStorage`) — the registration contract is "once per driver
instance, before the first prepare of a match statement". Semantics:

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

1. **Name reconstruction as an executeQuery concern** — `executeQuery`
   still returns raw `{name, left_id, right_id}` rows; the replay composes
   result names through `DbLexicon.name(id)` (the shared walk, see "Name→id
   resolution" above), which is the consumer-side shape Ruby's
   `Run#alter_result` implies. Folding composition INTO the execution
   entry (so returned rows carry composed names by default) waits on the
   result-shaping/engine wave that also owns `prepend`/`append`.
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
   `registerSqliteRegexpFunction` exactly once per driver instance (the
   execution suite and the oracle replay both do).
6. **Sync resolution warmth** — `parseOptionsWithLexicon` resolves
   synchronously over warmed Lexicon entries only; the engine wave that
   integrates CQL with live card instances should own the warm cycle (or
   an async resolver redesign) so statement interpretation cannot silently
   hit cold entries in production paths.
