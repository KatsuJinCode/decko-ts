# Row mx-190, the search whole count: the port's count measured on the MySQL rung beside the original's recorded count, and the one divergence fixed

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family [Family],
bucket WORKING ON IT, verdict FAIL). Instrument-coverage-matrix
action 189 (ACT-190), kind findings-red, finding
`F-2026-10-16-search-over-match`.

Branch `port/mx190-20261025`, base `c29e4c3f` (`deploy/full-candidate-20261102`,
the newest pushed roll tip, verified with `git ls-remote`).

## What the row asked for, and what this receipt holds

The row's blocker text asked for the oracle's whole count beside the port's in
ONE receipt, on the same rung and the same deck, and for the finding to be
closed or re-scoped on that measurement. Tranche 1 and tranche 2 measured the
port side green and could not take the oracle's count: Decko's `match` raises
on the sqlite adapter (card-1.110.0
`config/initializers/02_patches/active_record.rb:80-83`), and the oracle
harness's own MySQL rung could not run because its three machine-local assets
were absent.

THE ASSETS ARE PRESENT NOW, on the PORT's rung: MySQL 8.4.11 sits in
`C:/localProjects/.mysql-test-cache` (the official Community binaries
`tools/mysql/fetch-mysql.mjs` downloads and checksum-verifies), and the port's
own bench starts a throwaway server from exactly that path
(`tests/server/drivers/mysql-server.ts`).

So this receipt measures the port's count ON THE MYSQL RUNG, against the
original's RECORDED counts, in one receipt, per query:

- the original's side is the recorded behavior of stock Ruby Decko on a MySQL
  server: `fixtures/captured/cql-mysql-match.json`, captured on the oracle
  harness's MySQL rung (11.4.5-MariaDB, `cards_table_collation`
  utf8mb4_general_ci), 31 recorded queries with the rows each one returned;
- the port's side is measured fresh here, on a real MySQL 8.4.11 server, over
  the SAME modeled deck the SQLite-rung replay uses
  (`tests/cql/matchprobe-deck.ts`), with the capture's collation on the table
  and on the session;
- the two are put side by side as COUNTS, which is what the earlier receipt
  said the closing one had to do ("the closing receipt must put the two whole
  counts side by side, not a whole count next to a deck-wide count").

## The check, and how to run it

    npx vitest run tests/cql/search-count-mysql.test.ts

`tests/cql/search-count-mysql.test.ts` is the standing check: it starts the
throwaway MySQL 8.4.11 server, creates the database, loads Ruby's own MySQL
schema (`db/schema.mysql-reference.sql` plus `db/schema.mysql-card-gem.sql`),
seeds the modeled capture deck, and replays every recorded query through the
port's own CQL execution path (`executeQuery` and `executeCount` over
`MysqlDriver`), comparing the port's rows and the port's COUNT with the
recorded rows and the recorded count.

The run record is written to `.runtime/mx190-search-count-mysql/report.json`
(one entry per recorded query: the original's names, the port's names, the
port's count, the error if any).

## The numbers

31 recorded queries, measured on MySQL 8.4.11:

- **30 of 31 answer with the original's recorded names.**
- **29 of 31 answer with the original's recorded COUNT** (the count equals the
  recorded set size exactly).
- The 31st is the declared deck-model divergence, carried from the SQLite
  replay and unchanged by this work: `raw_posix_alpha`'s page differs in one
  composed name (`Cardtype+*type` here, `Cardtype+*type+*structure` in the
  capture deck), a property of how that deck was seeded, not of `match`
  semantics (`docs/decisions/0005-cql-match-semantics.md`, "Declared match
  divergences").
- The two entries whose count differs from the recorded set size are the two
  entries that PAGE, and that is the count quirk itself (below).

## The count quirk the original's recorded behavior carries

The count is the WHOLE count, never the page count. Decko's search count
merges the count args ON TOP of the search statement (card-mod-search
`set/abstract/0_search.rb:35-39`: `args[:offset] = 0; args[:limit] = 0;
returning(:count, args)`), so a search that pages still answers the number of
matching cards. The port spells the same thing
(`src/card/mod-loader/mods/card-mod-search.ts`, `mergedCountCql`:
`{offset: 0, limit: 0, return: "count"}`), and the measurement confirms it on
the MySQL rung:

| recorded query | recorded rows (the original) | port rows | port count |
|---|---|---|---|
| `empty_match_noop` (`limit: 3`, empty match dropped) | 3 | 3 | **74** (the whole deck) |
| `raw_posix_alpha` (`limit: 4`) | 4 | 4 | **54** (every match) |

Both counts are the whole count, and both are greater than the page: the
count ignores the limit, exactly as the original's count does. Every other
recorded query has no limit, and for those the port's count equals the
original's recorded count exactly.

## The divergence this rung found, and the fix

One recorded query did NOT answer on the MySQL rung before the fix, and it is
the row's surface: a search that cannot answer cannot count.

    raw_mysql57_wordstart   {"match": "~~[[:<:]]come", "sort": "name"}
    original (MariaDB 11.4.5, the capture):  ["Matchprobe Dots"]
    port on MySQL 8.4.11 before the fix:     ERROR "Illegal argument to a
                                             regular expression."

MECHANISM. The port binds the raw pattern to the server's own `REGEXP`
unchanged (the `~~` branch of the match condition in `src/cql/sql.ts`), and
MySQL 8's ICU engine does not implement the MySQL 5.7 word-boundary forms
`[[:<:]]` / `[[:>:]]`: it refuses them with
ER_REGEXP_ILLEGAL_ARGUMENT, so the statement errors, the search answers
nothing, and no count is produced at all. MariaDB's PCRE - the engine the
original site and the capture ran on - accepts the form and answered one row.
The suite pins the refusal on the server itself (the check's own leg: the
server rejects `'wel.come' REGEXP '[[:<:]]come'` and accepts the translated
`'wel.come' REGEXP '\\bcome'`), so the mechanism is measured, not asserted.

FIX. The two word-boundary forms are translated into the `\b` every
MySQL-class server accepts, before the pattern is bound
(`translateServerRegexp`, `src/cql/normalize.ts`; applied in the `~~` branch of
`src/cql/sql.ts`). The translation is exact: a word start and a word boundary
coincide wherever a word-boundary pattern continues with a word character.
Nothing else is touched - the POSIX bracket classes and the `\p{...}` property
classes are accepted by MySQL 8's ICU as written (measured on the same server:
both answer the captured rows), so they reach the server unchanged. The
decision record is amended in place with the measurement
(`docs/decisions/0005-cql-match-semantics.md`, "Amendment 2026-10-25").

After the fix the same query answers on MySQL 8.4.11 what the original
answered: `["Matchprobe Dots"]`, count **1**.

## What this receipt does NOT claim

The oracle was NOT re-measured on this machine. The oracle harness's own MySQL
rung still cannot run here, and the three named reasons are machine-side, not
port-side: the oracle app checkout (`tools/oracle/decko-oracle-app`) is
absent, the `mysql2` gem is not in the pinned gem tree
(`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`), and the oracle
harness's three machine-local assets (`tools/oracle/portable-mariadb/`,
`tools/oracle/mysql-client-scratch/lib`, `tools/oracle/mysql-server/my.ini`)
are absent. The original's counts in this receipt are therefore the RECORDED
ones (the capture), and the port's counts are measured here; they are the
same queries over the same deck model, on a MySQL server, with the capture's
collation - but they are two measurements on two server builds (MariaDB
11.4.5 for the original, MySQL 8.4.11 for the port), and this receipt says so
rather than calling them one.

The row's remaining condition is unchanged and is not this lane's: the
finding's live-deck pair (the port's 242 against the original's 127, recorded
2026-10-16 on the live deck of that day) is a different measurement on a
different deck state, and the guarded live deploy the row's DONE condition
waits on is still blocked on the operator's files-area arming.

## The row's state after this work

- The search whole-count correctness is now VERIFIED ON THE MYSQL RUNG: the
  port's count equals the original's recorded count for every recorded query
  that does not page, and the count is the whole count for the two that do.
- The one divergence the MySQL rung carried - the raw-regex word-boundary
  form, which the port could not answer at all - is FIXED and pinned.
- The finding `F-2026-10-16-search-over-match` stays OPEN on the live-deck
  pair and the deploy, both named above; the port-side count correctness it
  blocked is closed with this measurement.

## The battery

- `npx vitest run tests/cql/` - 20 files, 321 tests, 0 failed (the SQLite
  replay, the regex throw guard, the SQL generation pins and the MySQL-rung
  suite).
- `npx tsc --noEmit` - exit 0, no output.
- The MySQL-family set named by the ask (`tests/server/drivers/mysql-driver`,
  `mysql-ruby-schema`, `mysql-lifetime`, `tests/card/nest-index/
  nest-index-dialects`, `tests/card/actions/atomic-saves`): 1 failed file, 4
  passed; the five failures are the named pre-existing MySQL 8.4 atomic-saves
  baseline (`Table 'atomic_1.sqlite_master' doesn't exist` - the nest-index
  cache's table probe reads SQLite's catalog), unchanged by this work.
- The correctness battery at the final commit is recorded in the commit
  message.

RECEIPT: `docs/reports/receipts/row-mx-190-search-count-mysql-rung-2026-10-25.json`;
the run's own record: `.runtime/mx190-search-count-mysql/report.json`.
