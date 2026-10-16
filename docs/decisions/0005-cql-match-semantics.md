# CQL `match`: one implementation, fail loudly

## Context

CQL's `match` condition is the only part of the query language whose semantics
live outside the application. The term is escaped into a literal substring
search unless it carries a raw-regex prefix, and the result is a regular
expression evaluated by the **database server**.

The Ruby query compiler therefore has no behaviour to port here — it delegates
to whatever the server does, and Ruby's behaviour is the server's behaviour.
That creates a measurement problem and then an implementation problem.

**The measurement problem.** The reference SQLite build cannot execute `match`
at all: the compiler routes it through the database adapter's match method,
which is implemented for MySQL and PostgreSQL and raises on anything else. An
oracle on SQLite can record only the failure. A capture against a
MySQL-protocol server was therefore built, and it pins the semantics that
actually matter — the default path is a literal, case-insensitive substring
search; an exact-name prefix matches on the canonical key; a null name or
content never matches; an empty match is dropped entirely; and raw-regex forms
reach the server as written.

**The implementation problem.** Three implementations were available. A
full-text index matches tokens, not substrings or regular expressions, so it
cannot express the behaviour the capture pins, would still need a user function
for raw patterns, and would add index maintenance to the write path for a
feature the oracle shows is a scan. Delegating to provider capabilities has
nothing to delegate to: no SQLite build has a native regular-expression
function, so every path needs one registered. Post-filtering in the
application is not the primary path, because the read-permission and limit
conditions interleave with the match predicate in one clause: filtering
afterwards over-fetches, and applying the limit before the filter returns the
wrong window. It is used only where no function can be registered, and then
over the complete candidate set with the limit applied last (see "Edge
drivers").

That leaves a registered function backed by the platform's own regular
expression engine.

## Decision

Keep the registered function as the single local implementation, and close the
gap it has with dialect translation rather than with a second engine.

The measured gap is narrow and specific: three captured raw-regex forms, where
the local dialect silently degrades — POSIX character classes compile as
literal character classes (wrong rows, no error), the MySQL-era word-start
synonym does the same, and a Unicode property escape degrades to a literal
match when the pattern is not compiled with the Unicode flag.

So the plan is: translate the forms that have an exact equivalent in the local
dialect before compiling, and **throw** on anything still untranslated. Both
real servers error on a regular expression they cannot interpret. A query that
fails is debuggable; a query that quietly returns the wrong rows is corruption,
and silent wrong rows are exactly what the three current divergences produce.

The default path needs no change: Ruby's own escaping means a non-raw `match`
never reaches the engine containing a metacharacter to interpret. It only has
to match literally with case folding, which the capture confirms is exactly
what the case-insensitive flag does for ASCII and accented Latin alike.

## Consequences

The behaviour this engine exhibits on a raw-regex query is the behaviour of a
MySQL-class server, and the capture records which server class, version and
collation it was taken on. Server engines do not agree on the exotic forms, so
the contract is not "identical everywhere". It is: behave as captured, and fail
loudly rather than quietly where behaviour cannot be reproduced.

### Edge drivers (D1, libSQL): complete JS post-filter, no cap

Ruby evaluates `match` inside the statement's WHERE clause
(`#{field} REGEXP ?`, one predicate among the others), so it returns every
matching card and applies `LIMIT`/`OFFSET` to the matches. Drivers that
cannot register a function (D1, libSQL) therefore take a different route that
produces the same result set:

- the regexp-shaped match conditions are left out of the SQL, and every other
  condition (permission, type, ordering, ...) stays in it;
- the statement runs with **no LIMIT and no OFFSET**, so the candidate set is
  complete; an earlier revision capped it at 10,000 rows, which silently
  dropped matches on any larger deck and is removed;
- the rows are filtered in the application with the same compiled pattern the
  local function uses, a group such as `match: x` (name OR content) is
  evaluated whole, and the statement's own limit and offset are then applied
  to the filtered, already-ordered rows. As in Ruby, an offset without a
  positive limit is ignored.

The cost is explicit: a match query on an edge driver reads every row that
satisfies the non-match conditions. That is the price of staying faithful
without a function; a stored full-text index would not reduce it for
substring and regular-expression terms (see above).

Shapes the post-filter cannot reproduce exactly **fail loudly** with a bad-query
error naming this record, never with fewer rows: a match inside a subselect
(a row filter cannot re-apply subselect membership), and a match combined with
`group` (Ruby filters before grouping; the post-filter would group unfiltered
rows). Local SQLite is unaffected: the registered function runs inside the
statement, so every shape works there.

Two limits are recorded rather than hidden: the capture came from one server,
and the local engine's word-boundary semantics are ASCII-only where the
captured server's are Unicode-aware. Neither is exercised by the capture; both
are stated so a later reader knows what a passing battery does not cover.

### Case folding: lower() on both sides, keyword bound unchanged

The capture pins the default match as a case-insensitive substring search
because the captured server (MySQL, the original site's engine) folds `REGEXP`
case by default — "news" and "News" are one query there. The folding is a
property of the engine, and the edge engine differs. Live-proven against
cs-edge-deck 2026-10-16:

- `'News' REGEXP 'news'` → **0** — the edge regexp is case-sensitive;
- `'News' REGEXP '(?i)news'` → SQLite error **"'?' without operand"** — the
  engine rejects inline fold flags. (This was the first fix's spelling; it
  errored live as a 500 and was rolled back the same day.);
- `lower('News') REGEXP lower('news')` → **1** — the adopted spelling;
- `[Nn]` character classes work — a raw `~~` pattern can spell its own folds;
- `regexp_like` does not exist on this engine.

**The rule:** the keyword path wraps BOTH sides in SQL `lower()` —
`lower(field) REGEXP lower(?)` — and binds the escaped keyword UNCHANGED, its
original case intact. SQL `lower()` folds the bound parameter exactly as it
folds the column. The keyword must NOT be lowercased in JavaScript: JS
`toLowerCase()` is full-Unicode while SQLite-class `lower()` is ASCII-only, so
a JS-folded "Élan" (→ "élan") would stop matching content "Élan" that an
exact query must still reach. One spelling folds on every driver — MySQL's
own `REGEXP` already folds, so the wrap changes no result set there; the
local UDF keeps its `i` flag (harmless double-fold). NULL propagation is
preserved (`lower(NULL)` is NULL on every engine).

**Declared limitation:** `lower()` is ASCII-only on SQLite-class engines, so
non-ASCII case variants stay distinct — "Élan" and "élan" are different
queries on the edge (proven: `lower` leaves "É" unchanged), whereas MySQL
folds accented Latin. This matches prior behavior and is not hidden:
Unicode-insensitive parity is NOT established here; it needs the Ruby
contract to be captured first. The local UDF's `i` flag folds more than the
edge (JS case-folds non-ASCII), a pre-existing local-vs-edge asymmetry the
battery pins rather than silently inherits.

A `~~` raw pattern is user-authored server regexp and passes through AS
WRITTEN — un-wrapped, un-lowercased — exactly as Ruby's
`match_value.rb:46-51` renders it. On the edge such patterns are
case-sensitive unless the author spells `[Nn]`-style folds; on MySQL they
fold as the server folds. That is the record's standing contract ("the
contract is not 'identical everywhere'") applied to the one shape the wrap
deliberately does not touch.

### Declared match divergences

One entry of the captured MySQL-rung match battery is excluded from the strict
name-set comparison, and it is declared here rather than only in a test:

**`raw_posix_alpha`.** The battery is 30 entries and 29 are compared name for
name against Ruby. This one is skipped, and it is *not* a regex-dialect
divergence — the `[[:alpha:]]` form is handled, and an untranslated raw-regex
form now raises rather than silently mismatching (see *Decision*). Its residual
is a deck-model row-composition question: the capture deck's id-29 row (an
RStar-typed junction, left 3 / right 21, name and content NULL) composed
`Cardtype+*type+*structure` at capture time, while this engine's model composes
`Cardtype+*type`. Both readings come from the capture deck's own rows, so the
difference is a property of how that deck was seeded rather than of `match`
semantics, and it is out of scope for the dialect guard.

The exclusion lives in the oracle match replay suite (not in the public package)
(`KNOWN_DIVERGENCES`, with the reasoning above) and
the rules-and-sets exercise suite (not in the public package), so a battery that stops excluding it
fails rather than passing quietly.