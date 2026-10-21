# Row mx-190 - the search whole count: the port's count measured fresh, the oracle's count carried from the measurement it belongs to, the finding re-scoped

Row: `mx-190-search-whole-count-correctness` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Instrument-coverage-matrix action 189 (ACT-190), kind findings-red.

## What the row asked for

The roster row's blocker text: "Boot stock Ruby decko against the SAME deck
fingerprint with MATCHED actor scope, record the oracle's whole count beside
the port's 242 in one receipt, and close or re-scope finding
F-2026-10-16-search-over-match on that measurement. The port-side instrument
passes (grind tranche-1: --only search-overmatch at d8050251, PASS 7/7
including the deck-wide broad-term composition measurement) but that is not
the closing receipt: the claim stays open until the ORACLE's whole count is
recorded beside the port's in one receipt."

Tranche 1 measured the port side green and measured WHY the oracle's count
cannot be taken on this machine (`docs/reports/matrix-journey-row-mx-190-search-whole-count-oracle-2026-10-20.md`):
Decko's `match` raises on the sqlite adapter, and the MySQL rung - the only
local rung with `match` - cannot run because its three machine-local assets
are absent. This tranche adds the port's own whole count for the RECORDED
query, measured fresh, bound to a deck fingerprint, and puts it in ONE
receipt beside the oracle's recorded count, with the re-scope stated.

## The oracle side, and where its number comes from

The oracle for this row is stock Ruby decko, and the number the row quotes
(127) was measured against the ORIGINAL site on 2026-10-16, in the same
session as the port's 242:

    brandonDojoTech/recovery/release/brandon-bunny-deploy/demo-zero-list.md:160
    (recorded 2026-10-16 15:50Z): "Port now answers 242 matches / 13 pages
    (was 105); original answers 127 / 7 pages"

That is ONE measurement session, ONE query, TWO counts: the port's 242 and
the original's 127. This tranche did NOT re-measure the oracle, and the
receipt says so plainly. The reason is measured, not assumed: Decko's `match`
is implemented for MySQL and PostgreSQL only and raises on any other adapter
(card-1.110.0 config/initializers/02_patches/active_record.rb:80-83), so a
keyword search in stock Ruby decko is a full-text MATCH that the sqlite
adapter does not have; and the MySQL rung's three machine-local assets
(tools/oracle/portable-mariadb/mariadb-11.4.5-winx64,
tools/oracle/mysql-server/my.ini, tools/oracle/mysql-client-scratch/lib)
are absent on this machine, so tools/oracle/boot-mysql-server.sh refuses to
run (tranche 1's measurement, with the boot logs as the evidence).

## The port side, measured fresh on this branch

A fresh measurement on the pinned deck, with the page-walk method the
2026-10-16 measurement used (count the rows across the pages):

    node tmp/measure-search-whole-count.mjs --term news \
      --out .runtime/mx-190-search-whole-count

The measurement builds the local deck on the engine schema (21676 cards
copied), seeds the local accounts, boots the local stack, signs in as the
administrator, and walks `/*search?query[keyword]=news` page by page
(offset 0, 20, 40, ...), reading the result rows out of the port's own
result-row markup (src/card/mod-loader/mods/card-mod-search.ts:653-657 - the
`search-result-list` wrapper and its `search-result-item` children; an
unscoped `data-card-name` read counts every other slot's card on the page and
over-counted 369 on the first attempt of this measurement, which is why the
row selector is scoped).

The numbers:

    deck            C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    deck sha256     6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    cards copied    21676   (19494 not trashed)
    actor scope     the local seeded administrator, signed in
    query           /*search?query[keyword]=news, 20 rows a page, sort relevance
                    (the deck's *search card content: {"match":"$keyword","sort":"relevance"})
    PORT            317 rows over 16 pages  (317 unique names - no cross-page duplicate)
    DECK reference  317 rows whose name or stored content carries the term
                    (the deck read directly, case-folded; NOT a search count)

**The port's count and the deck's own count are the same number: 317.**
Every row the port returns for the term carries the term in its own name or
its own stored content, and the port returns no row beyond those.

The fresh instrument run agrees, in the same run as the other rows'
receipts: the search-overmatch module's four legs PASS, including the
accounting leg ("every row the term's search returns carries the term in its
own name or its own stored content") and the scope leg ("the term's search
hands the administrator-only row to the administrator and withholds it from
an ordinary member") - the two named candidate causes, measured on this
checkout (`docs/reports/receipts/row-mx-155-base-run-2026-10-21.json` for the
run; the module's own evidence in the run report).

## What the Ruby oracle's predicate is, and why that matters here

`{"match": "news"}` in Ruby is `(cards.name REGEXP 'news' OR
cards.db_content REGEXP 'news')` - card-1.110.0
lib/card/query/card_query/match_attributes.rb:10-18 builds the OR over the
name and the content, and lib/card/query/value/match_value.rb:26-40 renders
the field as the name column or the standardized content column
(`db_content`) with the term's non-word characters escaped. For a term with
no regex metacharacters that predicate is the same case-insensitive
name-or-content scan the port's own count was compared against, which is why
the port's 317 and the deck's 317 are the same measurement taken two ways.

## The re-scope

The finding F-2026-10-16-search-over-match is RE-SCOPED, not closed, on this
measurement, and the re-scope is stated in three parts:

1. **The port's matching breadth is not the cause, on this checkout.** The
   port returns exactly the rows the deck independently says carry the term
   (317 = 317), and the instrument's accounting leg agrees. The divergence
   named in the finding - "the port returns more results than the original
   site" - does not reproduce as a matching-breadth defect against THIS
   deck, for THIS term, under THIS actor scope.

2. **The two recorded counts are not two counts of one deck.** The 2026-10-16
   pair (the port's 242 over 13 pages against the original's 127 over 7) was
   taken against the live deck of that day and the port's copy of it. The
   deck has moved since (the local copy that this tranche measured carries
   21676 cards and the fingerprint above, and the triage's own record names
   "deck drift" as one of the two candidate causes of the 2026-10-16
   divergence: brandonDojoTech/docs/reports/permission-system-debrief-2026-10-16.md
   section 5, "Whole-count search divergence (port >=143 vs original 127;
   broader-than-anonymous viewer scope + deck drift)"). Two numbers measured
   against two deck states cannot be differenced without the oracle's count
   on the deck this tranche measured.

3. **The viewer-scope cause is excluded by measurement.** The instrument's
   scope leg passes on this checkout: the member's result set is contained in
   the administrator's, and the administrator-only row is withheld from the
   member. The scope half of the 2026-10-16 attribution is not supported on
   this path.

The finding therefore stays OPEN, and the roster row stays WORKING ON IT.
What the receipt adds over tranche 1's is the port's own count for the
recorded query, measured fresh and bound to a deck fingerprint, and the
re-scope's three parts with their evidence.

## The named next step (unchanged, and it is not this lane's to take)

Provision the three MySQL-rung assets on the machine that runs the oracle
(docs/parity-method.md, "MySQL rung"), boot MariaDB, import the SAME deck
fingerprint (the pinned 21676-card deck in the normalized form the 2026-10-19
attempt prepared:
C:/localProjects/decko-act190-stock-ruby-run-20261019/ruby-deck-r2-normalization-record.json),
boot the oracle app on that rung with the attachment bucket's credentials
present and with the MATCHED actor scope this receipt used (the
administrator), walk the search pages, and record the oracle's whole count
BESIDE the port's 317 in one receipt. Until that exists, the pair is one
recorded oracle number and one freshly measured port number on two decks,
and the row's own bar - the oracle's count beside the port's in ONE receipt,
on the SAME deck fingerprint - is not met.

The repository's own tooling for that step exists and is unused here:
`tools/mysql/fetch-mysql.mjs` (downloads and verifies the official MySQL
Community binaries), `tools/same-database/load-deck-into-mysql.mjs` (loads a
deck into MySQL under Ruby's own MySQL schema, from
db/schema.mysql-reference.sql), and
`reference-harness/adapters/ruby-mysql/` (the Ruby-on-MySQL lane). This
tranche did not provision those assets: the machine-local provisioning is
outside the repo's change set, the download footprint is large, and the
tranche's guard is that nothing deploys and no operator account-side step is
taken on its own.

RECEIPT: `docs/reports/receipts/row-mx-190-search-whole-count-2026-10-21.json`;
the measurement's own raw run is `.runtime/mx-190-search-whole-count/receipt.json`.

BATTERY: the local signed-in exercise at this base (240 / 242; the
search-overmatch module's four legs PASS); the fresh whole-count measurement
above; no engine source touched by this row's work.
