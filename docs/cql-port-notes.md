# CQL port notes (wave 1)

Port of Card Query Language from **card-1.110.0** (`lib/card/query.rb` and
`lib/card/query/**`) to `src/cql/`. Scope: interpretation (CQL -> AST) and
SQL generation (AST -> parameterized SQLite SQL). The port does **not**
execute SQL; the driver stream consumes `{ sql, params }`.

## Methodology and grounding

`require "card/query"` does not load standalone (zeitwerk load order +
Rails context). Instead, a scratch harness outside the repo loaded the REAL
gem sources in dependency order with a stubbed `Card` module, an in-memory
sqlite3 ActiveRecord connection, and the card initializer's adapter `match`
patch. `Card::Query.new(statement).sql` and `Value#to_sql` then ran for real.
Every SQL expectation in `tests/cql/**` quotes the oracle output for its
statement (`[oracle: ...]` in the test name/comment); cases not runnable in
the harness are marked source-derived with the Ruby file cited.

Oracle quirks worth knowing (all reproduced or documented below):
root alias is `c0` (`table_prefix + root.table_seq`, shared counter across
subquery classes); `SELECT DISTINCT` whenever the rendered join list is
non-empty; `LIMIT` renders only when `limit > 0`, and `OFFSET` only with
`LIMIT` (offset alone renders nothing); count queries skip limit/order/group
(`CardQuery#full?`); Ruby's SQL text has comment-slot double spaces and
`LIMIT  10 ` / `count( distinct ...)` spacing — the port emits single-space
canonical SQL.

## Files

| File | Role |
| --- | --- |
| `src/cql/constants.ts` | operator/conjunction/modifier/field tables copied from query.rb, with schema constants |
| `src/cql/ast.ts` | typed AST mirroring Ruby's query/value/join objects; `CqlBadQuery` |
| `src/cql/normalize.ts` | value normalization: $vars, `_relative` absolutization, name->key, match-term parsing, safe_sql |
| `src/cql/parser.ts` | interpretation: attribute dispatch, ties, conjunctions, references, sorting |
| `src/cql/sql.ts` | SqlStatement (+joins/where/order) walk -> `{ sql, params }` |

Entry points: `parseCql(statement, options)` -> `QueryNode`;
`generateSql(root, { alwaysOk, readRuleIds })` -> `{ sql, params }`.
Parse options: `vars`, `context`, `resolveCardId` (stands in for
`Card::Lexicon.id` / `String#card_id`), `resolveCodename` (`Card::Codename.id`),
`nameToKey` (inject the card/name stream's inflecting key), `onWarning`.

## Supported-key inventory

Every accepted key of query.rb has a home in the AST. "Handler" is the Ruby
method; "ported" means interpretation + SQL generation both covered and
oracle- or source-verified in tests.

### Basic fields (value conditions via `Query::Value`)
`id, name, key, type_id, content, left_id, right_id, codename,
read_rule_id, created_at, updated_at, creator_id, updater_id`
— handler `Interpretation` INTERPRET_METHOD[:basic] -> `QueryHelper#add_condition`.
Column mapping (`Value::SQL_FIELD`): `content`->`db_content`, `name`->`key`.
Values of `name` conditions are key-ified (`Value#standard_sql`).
Operators (`Card::Query::OPERATORS`): `=, !=, =~, <, >, in, ~, is` plus
aliases `eq, gt, lt, match, ne, "not in", "is not", !`. Bare operator keys
("!", "in", ...) become **content** conditions
(`Interpretation#interpret_as_content?`; oracle: `"!" => 5` ->
`c0.db_content is not '5'`). All ported.

### Modifiers (`Interpretation#interpret_modifier`)
`conj, return, index, sort_by, sort_as, sort_dir, sort, dir, group, limit,
offset` — all ported. Notes: `conj` mutates the effective conjunction at
interpret time (hash-order sensitive, as in Ruby); `index` parses but
generation drops it (see deferred); `dir` is the deprecated `sort_dir`;
count returns skip limit/order/group (`full?`).

### Relational attributes (`CardQuery::RelationalAttributes`, `Tie`)
| Key | Handler | Status |
| --- | --- | --- |
| `type, left, right, last_edited_by, created_by` | `Tie#restrict` (+`Tie#id_from_val`, sentinel -999) | ported |
| `part` | `any(left:, right:)` | ported |
| `last_editor_of, creator_of` | `Tie#tie :card` (to updater_id/creator_id) | ported |
| `editor_of, updater_of` | `tie_act` -> ActQuery -> ActionQuery -> CardQuery chain | ported |
| `edited_by, updated_by` | `tie_action` -> ActionQuery (action_type=1) -> ActQuery -> CardQuery | ported |
| `left_plus, right_plus` | `RelationalAttributes#junction` (+`junction_val` merge; part wins side-key collisions — oracle-verified gotcha) | ported |
| `plus` | `any(left_plus:, right_plus:)` | ported |
| `not` | `Conjunctions#not` -> negate tie, conditions_on_join, `<sub>.id is null` | ported |
| `found_by` | `FoundBy#found_by` | **deferred** (below) |
| `sort` (Hash value) | `Sorting#sort`/`interpret_sort_hash`/`sort_by_item_join`/`join_cards` | item-join ported; count sort deferred |
| `match, name_match, complete` | `MatchAttributes#match/#name_match/#complete(+compound)` | ported |

### Reference attributes (`ReferenceAttributes#define_reference_method`,
`ReferenceQuery`)
`refer_to, link_to, include, nest` (referee side, tie on `referer_id`) and
`referred_to_by, linked_to_by, included_by, nested_by` (referer side, tie on
`referee_id`) — ported, incl. reftype `=`/`IN` conditions, `_none` ->
`is_present = 0`, the `as_list_of_ids?` OR-list optimization (single join,
`referee_id in (...)`), and per-value joins for AND lists.
`member_of` (expands to `referred_to_by` with the members codename) ported.
`member` needs `Card::RoleID` -> requires `resolveCodename`; raises without.

### Conjunctions (`CardQuery::Conjunctions`)
`and/all, or/any` -> `conjoin` direct subqueries sharing the parent alias;
multi-value relational lists shift a leading conjunction and either flatten
(same conj), optimize to id lists (reference keys), or wrap a subcondition
group (`Interpretation#relate_multi_value`). Bare `in:` never reaches the
conjunction handler (operator-key interception; oracle: raises
`Invalid property value` on hash items). All ported.

### Custom (`CardQuery::Custom`)
`compound` -> structural raw `left_id IS [NOT ]NULL` (port normalizes Ruby's
accidental double space). Ported.

### Ignored keys
`prepend, append` — consumed into `statementExtras` (Ruby applies them to
results in `Run#alter_result`, after SQL; no SQL effect). `vars` — consumed
by normalization. Ported.

### Deprecated keys (`view, params, size`)
Warn via `onWarning` and ignore (`Interpretation#deprecated_attribute`).
Ported.

### Shorthand statements (`Normalization#clause_to_hash`)
Integer -> `{id}`, String -> `{id: resolveCardId ?? -2}`, Symbol -> codename
path (unreachable over JSON; noted). Hash required otherwise; BadQuery.

## Deferred keys and behaviors (wave 2, with Ruby handlers)

1. **`found_by`** — `FoundBy#found_by` calls `Query.run` / `Card.fetch`
   *during interpretation* (resolves Search cards, interprets each result's
   `cql_hash` as a :direct subquery with `context: card.name`). The AST
   records `{kind: "foundBy"}`; `generateSql` raises with a pointer here.
   Needs the execution engine + card cache.
2. **`sort` count sorts** — `Sorting#sort_by_count_referred_to` (the only
   implemented item; experimental per the Ruby comments). Double-nested
   subselect + `LEFT JOIN (SELECT ... ) srtbl`. Oracle shape captured:
   `SELECT DISTINCT c0.*, coalesce(count,0) ... LEFT JOIN ( SELECT DISTINCT
   coalesce(count(*), 0) as count, c1.id as sort_join_field FROM cards c1
   LEFT JOIN card_references wr ON c1.id = wr.referee_id WHERE referer_id in
   ( SELECT ... ) AND c1.trash is false GROUP BY sort_join_field) srtbl ON
   c0.id = srtbl.sort_join_field ... ORDER BY coalesce(count,0) asc`.
   Parser raises `sorting by #count/<item> not yet implemented`.
3. **`index` modifier** — Ruby emits MySQL-only `USE INDEX (...)`
   (`SqlStatement#indexes`). SQLite has no equivalent; generation drops it.
   Options: keep dropped, or translate to SQLite `INDEXED BY` when the
   schema stream names indexes.
4. **`match` full-text strategy** — `match` renders `field REGEXP ?`
   (the token card's ActiveRecord patch generates for MySQL *and* SQLite:
   `config/initializers/02_patches/active_record.rb`; Postgres is `~*`).
   SQLite has **no built-in REGEXP function**: either an app-defined REGEXP
   UDF must be registered on the driver, or the wave-2 FTS5 decision lands
   (virtual table + triggers + MATCH syntax). Not faked: SQL is generated,
   execution needs the driver-level decision.
5. **`member` codename constant** — needs `resolveCodename` (Ruby reads
   `Card::RoleID`, a boot-time codename constant).
6. **Symbol-valued clauses / codename resolution in `clause_to_hash`** —
   JSON cannot carry Ruby Symbols; `Card::Codename.id` paths need the
   resolver or wave-2 codename table knowledge.
7. **Permission integration** — Ruby always applies
   `Auth.as_card.read_rules` (`Where#permission_conditions`) unless
   `Auth.always_ok?`. The generator defaults to always-ok and accepts
   `{alwaysOk: false, readRuleIds}` (empty list -> sentinel `IN (1)`).
   Wave 2 wires this to the auth/permission stream.
8. **SQL comments** — `SqlStatement#comment` (gated on
   `Card.config.sql_comments`); cosmetic, skipped.

## Reconciliation list vs the schema stream (db/schema.sqlite.sql, src/server/schema.ts)

Names below are what `src/cql/constants.ts` assumes (copied from
card-1.110.0 `db/schema.rb`). The schema stream must match, or constants.ts
must be updated in the same commit:

- Tables: `cards`, `card_references`, `card_actions`, `card_acts`.
- `cards` columns used: `id, name, key, codename, left_id, right_id,
  type_id, db_content, read_rule_id, created_at, updated_at, creator_id,
  updater_id, trash` (boolean, `trash is false` predicate).
- `card_references` columns: `referer_id, referee_id, ref_type` (1-char
  string: L/I), `is_present` (0 = missing referee; `_none`).
- `card_actions` columns: `card_id, card_act_id, action_type` (1 = update).
- `card_acts` columns: `actor_id`.
- **No column named `content`** — CQL `content` is `db_content` everywhere
  except *match on name* which uses the raw `name` column
  (`MatchValue#match_field`), not `key`.
- The schema stream's SQLite DDL should ensure `trash` stores 0/1 so the
  Ruby-parity predicate `trash is false` evaluates correctly, and that
  `read_rule_id` is indexable for the permission IN-list.
- If the schema stream renames anything, the single reconciliation point is
  `src/cql/constants.ts` (tables, prefixes, BASIC_FIELDS, SQL_FIELD,
  REFERENCE_FIELDS).

## Behavior dynamic enough to need the oracle (wave 2 fixtures)

- **Lexicon/card-name resolution**: `-2` vs `-999` sentinels and real ids
  depend on the DB; fixtures should pin `resolveCardId` outcomes
  (existent card, unknown name, deleted card).
- **`read_rules` shapes**: single rule, many, empty (sentinel), always-ok.
- **Conjunction-order sensitivity**: `conj` interpreted *after* tie-creating
  keys changes join sidedness (`Join#inside_or?` reads mods at tie time).
  Fixture candidates: `{type: {...}, conj: "or"}` vs `{conj: "or", type: {...}}`.
- **Name absolutization beyond the minimal forms** (`_main`, `_user`,
  `_L*R` partmaps, entity decoding, singularize inflection) — fixture
  against the cardname gem once the name stream lands.
- **Deep nesting**: Ruby's `depth`-based leading whitespace and join
  parenthesization for 3+ level ties (`left_plus` inside `any` inside
  `not` ...) — worth captured fixtures before optimizing the renderer.
- **Ruby-side result shaping** (`Run`): `return` value handling beyond the
  SELECT field (name reconstruction from left_id/right_id, `count` int cast,
  prepend/append) lives outside SQL and needs the execution wave.

## Known approximations (deliberate, marked in code)

- `name: nil` (nil value on a name condition): Ruby 1.110 emits broken SQL
  (`c0.key is ()` — `Array.wrap(nil)` collapses the value list to empty);
  the port renders the sane `c0.key is NULL`. Oracle-verified divergence.
- `defaultNameToKey` (normalize.ts): no singularize inflection
  (cardname 0.20.0 defaults `uninflect: :singularize` — oracle:
  `"Magnus" -> "magnu"`) and no HTML entity decoding. Inject
  `ParseOptions.nameToKey` from the card/name stream when available.
  ASCII names without plural/singular ambiguity match the oracle exactly.
- `absolutizeName`: full support for `_self/_whole/_`, `_left`, `_right`,
  `_N`; `_user/_main/_L*R` are left in place with a warning; the
  `absolutize_extremes` context-prefixed guard is simplified.
- `sort_as` CAST types mapped to SQLite INTEGER/REAL/TEXT (Ruby casts
  through MySQL native types like `signed`); unmapped tokens pass through
  `safe_sql` verbatim.
- Whitespace canonicalization (single spaces) — the parameterized shape is
  the parity surface, not byte-level spacing.

## Test inventory

`tests/cql/operators.test.ts` (19), `tests/cql/parser.test.ts` (53),
`tests/cql/sql-generation.test.ts` (60), `tests/cql/errors.test.ts` (12) —
144 tests, table-driven, each SQL expectation citing its oracle capture or
Ruby source site.
