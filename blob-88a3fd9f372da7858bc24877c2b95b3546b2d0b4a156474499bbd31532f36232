# Row mx-190 - the search whole count: the port side measured green, the oracle's count measured unreachable on this machine's rung

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`docs/registry/completeness-roster.json`, family matrix-journey, bucket
WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Instrument-coverage-matrix action 189 (ACT-190), kind findings-red.

## What the row asked for

The row's blocker text: "Boot stock Ruby decko against the SAME deck
fingerprint with MATCHED actor scope, record the oracle's whole count beside
the port's 242 in one receipt, and close or re-scope finding
F-2026-10-16-search-over-match on that measurement. The port-side instrument
passes (grind tranche-1: --only search-overmatch at d8050251, PASS 7/7
including the deck-wide broad-term composition measurement) but that is not
the closing receipt: the claim stays open until the ORACLE's whole count is
recorded beside the port's in one receipt."

## The port side, measured this session

A fresh local run of the instrument on this branch's base (8268a145, source
files clean, bundle SHA256
c75e149eceaf074a4fb1cc58b274b42470cfe0df869eb87210e50f7ed35bc378, a
throwaway copy of the pinned 21676-card deck, headless Chromium): the
search-overmatch module passes all four of its legs -

    search-overmatch fixtures store two public term cards, a control, and an
    administrator-only card behind a self read rule | PASS
    the term's search hands the administrator-only row to the administrator
    and withholds it from an ordinary member | PASS
    every row the term's search returns carries the term in its own name or
    its own stored content | PASS
    search-overmatch records a deck-wide broad-term composition measurement
    as evidence | PASS
    {"measured":true,"broadTerm":"card","deckNameOrContentMatches":820,
     "renderedRowsOnFirstPage":20,
     "caveat":"port-vs-deck on this checkout; NOT the oracle's count"}

The module's own caveat is the row's own words: this is a port-vs-deck
measurement, not an oracle measurement.

## The oracle side: what this session measured

The oracle the row names is **stock Ruby decko** on the same deck. This
session booted it (the pinned gemset, Ruby 3.4.11, the oracle app
`decko-act190-stock-ruby-run-20261019/oracle-app-r3`, the same deck
`ruby-deck-r2.sqlite3`) and asked it the same question. The answer is a
500, and the cause is measured, not guessed:

    GET http://127.0.0.1:46193/*search?query[keyword]=card&offset=0
    -> HTTP 500, 333287 bytes, 0 rendered result rows

The server log names the exception and its frames:

    RuntimeError: %{func} not implemented
    card-1.110.0 config/initializers/02_patches/active_record.rb:82
      in Patches::ActiveRecord::ConnectionAdapters::AbstractAdapter#match
    card-1.110.0 lib/card/query/value/match_value.rb:19
      in Card::Query::Value::MatchValue#match_sql
    card-mod-search-0.20.0 set/abstract/cql_search.rb:65
      in Card::Set::Abstract::CqlSearch#query

The patch is Decko's own: the abstract adapter raises
`I18n.t(:lib_exception_not_implemented)` for `match`
(card-1.110.0/config/initializers/02_patches/active_record.rb:80-83), and
only the PostgreSQL (and MySQL) adapter modules implement it. **A keyword
search in stock Ruby decko is a full-text `MATCH`, which the SQLite adapter
does not have.** The oracle's whole count therefore cannot be taken on the
SQLite deck at all - every keyword search answers 500.

The 2026-10-19 attempt at this row recorded the same shape plus a second,
independent cause: the sign-in page answered 500 there too
("sign-in form fields not found (email=missing, password=missing),
signinStatus: 500"), and the server log carried
`Card::Error: couldn't find credentials for bucket my_bucket` - the deck's
attachment bucket has no credentials in that boot, so any page that renders
an attachment 500s. Its receipt (wholeCount 0 for both terms, httpStatus
500) is at
`C:/localProjects/decko-act190-stock-ruby-run-20261019/ruby-side-measure.json`.

## The rung that would answer it, and why it cannot run here

Decko implements `match` for MySQL as well, and the repo's MySQL rung of the
oracle harness is the local path that has it
(`tools/oracle/boot-mysql-server.sh`, "MySQL rung" in docs/parity-method.md;
the app ships `Gemfile.mysql` / `Gemfile.mysql.lock` beside its sqlite
Gemfile). The boot script refuses to run when its untracked machine-local
assets are absent, and on this machine all three are absent:

    ABSENT: tools/oracle/portable-mariadb/mariadb-11.4.5-winx64
    ABSENT: tools/oracle/mysql-client-scratch/lib
    ABSENT: tools/oracle/mysql-server/my.ini

The script's own message for that case: "oracle harness asset not present:
<repo>/tools/oracle/portable-mariadb/mariadb-11.4.5-winx64 ... it cannot
run from a bare checkout".

## Disposition

- The port side of this row is **measured green** at this base (the four
  search-overmatch legs above, in the same run as the other rows' receipts).
- The oracle's whole count is **not recorded**, and the reason is now
  measured rather than assumed: the sqlite rung cannot serve a keyword
  search (Decko's `match` patch raises on the abstract adapter), and the
  MySQL rung - the only local rung with `match` - cannot run on this
  machine because its three untracked machine-local assets are absent.
- The finding F-2026-10-16-search-over-match therefore **stays open**, and
  the row's bucket is unchanged. What this commit adds is the measured
  cause, so the next attempt does not have to re-derive it.
- The named next step, in order:
  1. provision the three MySQL-rung assets on the machine that runs the
     oracle (docs/parity-method.md), boot MariaDB, and import the SAME deck
     fingerprint (the pinned 21676-card deck, in the normalized form the
     2026-10-19 attempt prepared:
     `decko-act190-stock-ruby-run-20261019/ruby-deck-r2-normalization-record.json`);
  2. boot the oracle app on that rung with the attachment bucket's
     credentials present (the second cause), and with the MATCHED actor
     scope the port's own count uses;
  3. walk the search pages and record the oracle's whole count beside the
     port's whole count for the same term in ONE receipt, then close or
     re-scope the finding on that measurement.
- One caveat carried forward: the port's 242 (the number the row's text
  quotes) and this session's 820 are different measurements - 242 is a
  whole-count from the earlier finding, 820 is the deck-wide
  name-or-content match count this session's instrument records. The
  closing receipt must put the two whole counts side by side, not a whole
  count next to a deck-wide count.

## Battery

- `node tools/edge-signed-in-exercise.mjs` (the run above): 240 / 242
  passed; the search-overmatch module's four legs PASS.
- The oracle boot attempts of this session are outside the repository (the
  run dir `C:/localProjects/decko-act190-stock-ruby-run-20261019`), and
  their logs are the evidence: `ruby-server-r9.log` (the boot and the
  500's backtrace), `ruby-server-r7.log` (the boot that reached Bundler
  and printed the decko command usage), `ruby-server-r5.log` and
  `ruby-server-r6.log` (the two boots that stopped at
  `Bundler::GemNotFound` before the gemset path was corrected).
- No engine source touched by this commit.
