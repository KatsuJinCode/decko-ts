# Rendered keyword search uses the query executor

The renderer previously raised `%{func} not implemented` for every nonempty
top-level match before consulting a database. This reproduced a limitation of
stock Ruby's modern SQLite3Adapter on all hosts, including hosts where keyword
search is supported. Installed card-1.110.0
`config/initializers/02_patches/active_record.rb:80-118` defines the abstract
raise and separate PostgreSQL/MySQL implementations. Decision
[0005](decisions/0005-cql-match-semantics.md) already documents the supported
engine semantics and the complete no-UDF fallback.

The renderer now calls that executor. It no longer turns executor/provider
errors into successful empty lists. Regression tests also found and fix an
empty SQL operand when the no-UDF fallback retains a type restriction, and a
request-specific paging result stored under the unparameterized search key.

`tests/card/render/search-match-adapter.test.ts` uses actual in-memory SQLite
with registered REGEXP and a local HTTP/Hrana server backed by SQLite without
that function. Both prove case-insensitive substring results, a denied first
match excluded before LIMIT, the next readable page, and malformed-regex
rejection. All four tests initially failed with the forced RuntimeError;
after removing it, controls exposed the additional SQL/paging defects before
passing. No permissions, candidate caps, normalization rules or fixture data
were weakened.

Validation: `npx vitest run tests/card/render/search-match-adapter.test.ts
tests/card/render/search-bad-query-error.test.ts tests/cql/execution.test.ts
tests/cql/match-uncapped.test.ts` plus a private capture-derived dialect guard
(not shipped) passed 86 tests in the original verification;
`npx tsc --noEmit` passed. That historical total includes the private control.

This is local source/driver evidence. Stock Ruby33 SQLite keyword-search
HTTP500 remains a reference-adapter incompatibility; matching that failure is
not product acceptance. No reference capture was changed, and this check
does not establish hosted Bunny/Cloudflare browser acceptance or full
MySQL/PostgreSQL scenario parity. The documented complete fallback can scan
the permitted candidate set; this repair does not claim a bounded CPU cost.
