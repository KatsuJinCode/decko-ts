# CQL `match` implementation decision (decko-ts)

Status: DECIDED — keep and upgrade the SQLite REGEXP UDF (option A).
Evidence: fixtures/captured/cql-mysql-match.json (MySQL-rung oracle capture,
byte-stable across three consecutive runs), the Ruby sources cited inline,
and tests/cql/oracle-match-replay.test.ts (27/30 strict parity, 3 pinned
divergences).

## The mechanism, end to end (why match needed a MySQL oracle at all)

1. CQL `{match: v}` expands to an OR over two row columns:
   `card-1.110.0/lib/card/query/card_query/match_attributes.rb:11-18`
   (`MatchAttributes#match` builds `name`-OR-`content` subconditions and
   `or_join`s them).
2. Each side compiles through
   `lib/card/query/value/match_value.rb:17-20` (`MatchValue#match_sql`):
   - `=term` on the name field becomes exact key equality
     (`:22-26`, `exact_name_match`);
   - anything else becomes `#{match_field} #{connection.match match_value}`
     — `match_field` is the literal row column `name`, or the standardized
     content column (`:28-31`; the cards column is `db_content`, confirmed
     by the fixture's `mechanism.generated_sql_for_word`:
     `(c0.name REGEXP 'matchprobe' OR c0.db_content REGEXP 'matchprobe')`).
3. The value itself is prepared in `match_value.rb:33-36,53-62`: the term is
   scanned for a prefix (`=`, `~`, `~~`); unless the prefix is `~~`,
   `escape_regexp_characters` (`:60-62`) backslashes EVERY non-word
   character — so the default `match` is a LITERAL substring search and
   `~~term` alone reaches the server as a raw regex (`:46-47` comment: "if
   search val is prefixed with ~~ , it is a MYSQL regexp").
4. `connection.match` is the adapter patch
   `card-1.110.0/config/initializers/02_patches/active_record.rb`:
   `Mysql2Adapter#match` returns `"REGEXP #{string}"` (`:100-103`; the
   fixture's `mechanism.match_method_source` pins the applied method at
   line 101 at runtime), `PostgreSQLAdapter#match` returns `"~* #{string}"`
   (`:94-97`), and the abstract default raises
   (`:80-82`) — that raise is the sentinel the SQLite oracle could only
   record (`cql-basic.json` `match_sentinel`). The `SQLiteAdapter` module
   in the same patch file (`:114-117`) is dead code on Rails 7.2: the real
   class is `SQLite3Adapter`, nothing applies the module, and the abstract
   raise is what fires.
5. Everything regex-flavored beyond that lives in the DATABASE SERVER:
   MariaDB 11.4 = PCRE, MySQL 8.0 = ICU, MySQL 5.7 = Henry Spencer. Case
   behavior follows the collation (the capture deck pins
   `utf8mb4_general_ci`; fixture `mechanism.cards_table_collation`).

So the TS port had no oracle for the ONLY part that executes: the server's
regex semantics. That is what the MySQL rung captured.

## What the capture pins (MariaDB 11.4.5, utf8mb4_general_ci)

Every claim below is a named entry in `fixtures/captured/cql-mysql-match.json`:

- Default `match` is literal substring search — metacharacters in the query
  match themselves (`punct_literal_parens`, `punct_literal_brackets`,
  `punct_literal_plus`, `dot_literal`: `wel.come` matches only the card
  containing a literal dot, not `welxcome`/`wellcome`).
- Case-INSENSITIVE in both directions, from the ci collation:
  `uppercase`/`UPPERCASE`/`UpPeRcAsE` all hit `Matchprobe UPPER`
  (`case_query_*`), `MATCHPROBE LOWER` hits `matchprobe lower`
  (`case_name_lower`), and raw `~~MATCHPROBE` behaves the same as the
  literal form (`raw_case_upper`).
- `=term` is exact name match via the canonical key — `=Matchprobe UPPER`
  and `=matchprobe upper` return the same card (`equals_exact_name`,
  `equals_case_variant`); keys are downcased Ruby-side, so `=` is
  case-insensitive by construction.
- Match reads the ROW columns: the junction row `Matchprobe Compound+zeta`
  has a NULL name column and is invisible (`compound_child_name_token`
  returns the standalone tag card `zeta` only, never the composed
  junction name); NULL name/content never matches (SQL NULL propagation).
- `~~` passes server regex through, and MariaDB PCRE accepts all of:
  `.` wildcard (`dot_raw_regex`), `\b` word boundaries
  (`dot_raw_word_boundary`), character classes (`raw_digit_class`),
  POSIX classes (`raw_posix_alpha`), backreferences (`raw_backreference`),
  unicode properties (`raw_unicode_class`), and even the MySQL-5.7-era
  `[[:<:]]` word-start synonym (`raw_mysql57_wordstart`).
- Accent-SENSITIVE: `naive` does not match `naïve`
  (`nonascii_unaccented_query` returns empty) while `café`/`CAFÉ`/`日本語`
  match their texts (`nonascii_accented`, `nonascii_case_fold`,
  `nonascii_cjk`).
- Empty match is a no-op — the condition is dropped entirely
  (`empty_match_noop` returns the deck's lowest-sorted cards, not "matches
  empty string").
- Field-restricted forms work: `{name: ["match", v]}` and
  `{content: ["match", v]}` (`name_restricted`, `content_restricted`);
  array values are joined with spaces (`array_value_joined`).

Server-side variance the capture does NOT resolve (documented, important):
the exotic `~~` constructs behave differently across production engines —
`[[:<:]]` works on MariaDB PCRE and MySQL 5.7 but errors on MySQL 8 ICU;
`\b` and backreferences/`\p{}` error on engines lacking them. Ruby decko
inherits whatever server a deployment runs, so the port's contract is
"MariaDB-class behavior, loudly wrong rather than silently wrong on the
rest". Re-running the battery against a MySQL 8 server would be a further
optional rung (same capture script, different server).

## The options

### A. SQLite REGEXP UDF backed by a JS regex (current: src/cql/sqlite-regexp.ts)

`registerSqliteRegexpFunction` registers `regexp(pattern, value)`
(argument order runtime-verified: `X REGEXP Y` calls `regexp(Y, X)`,
sqlite-regexp.ts:28-30) with `/i` compilation and NULL propagation
(sqlite-regexp.ts:52, 66-76). The generator emits the Ruby token shapes
(src/cql/sql.ts:193-202: `=`+name → key equality; else
`field REGEXP ?` with Ruby-mirrored escaping unless `~~`).

Measured against the capture (tests/cql/oracle-match-replay.test.ts):
27/30 entries pass as strict name-set parity — the entire default path
(escaping, case, accent sensitivity, `=` keys, compound-row NULL semantics,
empty no-op, field restriction, array joining) needs nothing more. The 3
misses are all `~~` raw patterns where the JS dialect silently loses:
`[[:alpha:]]` and `[[:<:]]` compile as unexpected literal character
classes (no error, wrong rows) and `\p{Han}` without the `u` flag degrades
to a literal `p{Han}` match.

### B. FTS5 (full-text index)

Different semantics, not a weaker version of the same ones. Ruby's match is
a regex/substring SCAN over raw columns — the capture's core 27 entries
pin literal-substring and case behavior (mid-word hits like `wel.come` in
`welxcome`, metacharacter literals, `=foo` key equality). FTS5 matches
TOKENS: it cannot express mid-word substrings without a custom tokenizer,
cannot express regex at all without an auxiliary function, and its index
would add a write-path maintenance burden for a feature the oracle shows is
a scan. FTS5 would still need the UDF for `~~` patterns. Strictly more
complexity for less fidelity.

### C. Delegate to provider capabilities per driver

There is no provider capability to delegate to on SQLite: SQLite (local,
libsql, D1 alike) has no native REGEXP — every path needs a registered
function or an application-layer substitute. Pushing match to JS
post-filtering breaks the SQL-level contract the capture pins: LIMIT and
read-rule conditions interleave with the match predicate in one WHERE
(the generator emits them together, sql.ts:193-202), so post-filtering
either over-fetches unbounded or returns wrong `limit` windows. The edge
driver's no-UDF constraint is already a separate, already-documented
problem (docs/cql-execution-notes.md, "REGEXP on the edge"); this decision
covers the local path the oracle runs on.

## Decision

Keep option A as the single local implementation, and close the measured
gap with a dialect-translation layer inside `compilePattern`
(sqlite-regexp.ts:44-59). Recommended upgrade, in order:

1. Translate before compiling, only for patterns that need it:
   `[[:alpha:]]` → `[A-Za-z]` (and the other POSIX classes), `[[:<:]]` →
   `\b`, `[[:>:]]` → `\b` (equivalent for ASCII word boundaries), and
   `\p{...}` handling by compiling with the `u` flag ONLY when the pattern
   contains `\p{` — raw `~~` patterns cannot contain the escaped-literal
   shape's Annex-B identity escapes (escaping backslashes every non-word
   char, so `{` would be `\{`), which is what forbids `u` today
   (sqlite-regexp.ts:49-51).
2. Anything still untranslated must THROW (the UDF already throws on
   non-compiling patterns, sqlite-regexp.ts:72-74). Both real servers error
   on uninterpretable regex; a query that fails is debuggable, a query that
   silently drops rows is corruption. The three captured divergences are
   all silent no-matches today — that is the failure shape to eliminate.
3. Upgrade tests/cql/oracle-match-replay.test.ts with the UDF: its pinned
   divergences test fails the moment TS matches Ruby on those entries
   ("PIN STALE" path) — move them into the strict-parity set then.

No change is needed to the default path: Ruby's own escaping means the
TS engine never receives a metacharacter it must interpret for
non-`~~` matches — it only has to match literally with ci collation
case-folding, which the capture confirms is exactly what `/i` does for
ASCII and accented Latin alike (`nonascii_case_fold`).

Known limits of this decision: captured on one server (MariaDB 11.4.5);
JS `\b` is ASCII-only where PCRE boundaries are unicode-aware (not
exercised by the battery — an accented word-boundary probe would pin it);
MySQL 8 ICU variance is documented above but not captured (no MySQL 8
server on this machine — Docker absent; a portable-MySQL rung would close
it with the same capture script).
