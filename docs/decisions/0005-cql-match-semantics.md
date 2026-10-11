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
application breaks the query's own semantics, because the read-permission and
limit conditions interleave with the match predicate in one clause — filtering
afterwards either over-fetches without bound or returns the wrong window.

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

`match` does not work on edge deployments, which cannot register functions.
Those queries fail with the driver's own error rather than returning an empty
result. That is intentional and it is why the documented seed decks use only
the condition shapes that work everywhere.

Two limits are recorded rather than hidden: the capture came from one server,
and the local engine's word-boundary semantics are ASCII-only where the
captured server's are Unicode-aware. Neither is exercised by the capture; both
are stated so a later reader knows what a passing battery does not cover.

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

The exclusion lives in `tests/cql/oracle-match-replay.test.ts`
(`KNOWN_DIVERGENCES`, with the reasoning above) and
`tests/exercise/rules-and-sets-5.test.ts`, so a battery that stops excluding it
fails rather than passing quietly.