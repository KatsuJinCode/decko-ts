# Gap batch 8, gap 1: the permission-filtered anonymous search

One of the two check-suite gaps the enumeration audit named in its A5
table (the six check-suite behaviours no roster row names) and the last
two it left unowned: gaps.json entry 24, element "the permission-filtered
anonymous search (journey search-filtered-anonymous)".

## The capture is the spec

`reference-harness/browser/journeys/synthetic-v1.json`, journey
`search-filtered-anonymous`, covers `["searches", "permission filtering"]`,
and its steps are exactly four: visit `/`, fill `#query_keyword` with
"Memo", press Enter, observe "anonymous results". The audit's why_no_row:
"no capability names it; the roster's search rows cover keyword and CQL
search, not permission filtering of the result set."

What the observation means is the search contract the port itself
documents: the viewer's read rules apply at the relation level, before
the limit closes the window (the render engine's cqlPermissionOptions
seam; the comment at the `:search_box_complete` preparation in
`src/card/render.ts` carries Ruby's own sentence for it). The result set
an anonymous visitor reads must hold only cards the anonymous reader may
read.

## What this lane adds

The N12 capability row
(`tools/edge-signed-in-exercise/capabilities.json`, group `search`) and
its check module `tools/edge-signed-in-exercise/checks-search-anonymous-filter.mjs`.
The module builds the contrast the journey's observation needs: two cards
whose names carry the searched term, one readable by anyone and one whose
`*self+*read` rule names only `[[Administrator]]` and whose content
carries a secret token, then runs the journey's own four steps in a
signed-out browser, then runs the same search as the administrator as the
control leg.

One run, on the LOCAL stack the harness boots itself, at this lane's tip,
source commit `ac61efde` (`ac61efde6440e2ba8aa8a14650dc91e5a43f6a99`), on
a clean committed tree (the harness's source-custody preflight). Nothing
reached the live edge: the run's provenance carries `productionRuntime:
false`. The source deck is the same local snapshot the earlier rounds
used, and the run record names its digest.

## The grade line

**9 / 9 checks passed**, 0 failed. The runner's process exit was 0.

The four N12 checks, from the run record committed beside this write-up:

| check | result | the evidence |
|---|---|---|
| N12 the anonymous navbox search for a term lists a card the anonymous reader may read | PASS | signed-out browser drove the journey's own steps (`/`, `#query_keyword` = "Memo", Enter, landing `/*search?query[keyword]=Memo`); the public fixture `Memo_Harness_mvogz4t2_anyone` heads the anonymous result set (20 results) |
| N12 the anonymous navbox search for the same term omits the card whose read rule names only Administrator | PASS | the restricted fixture `Memo_Harness_mvogz4t2_admin` is absent from the same anonymous result set |
| N12 the restricted card's name and secret content appear nowhere in the anonymous results page | PASS | the results page bytes carry neither the restricted name nor the secret token (page sha256 `c514126e` in the run record) |
| N12 the same search as administrator lists the restricted card, so the anonymous absence is the read rule and not a search miss | PASS | the administrator's same search (status 200) lists the restricted fixture first and the public fixture second |

The run's own grader (`lib/local-policy.mjs` verifiedCapabilities)
computed **covered** for the new N12 row from this record: 4 of 4
declared checks verified. Capability coverage moved from 1 covered row to
2 (of 97 rows while this half of the batch is the tree's whole addition).

WHAT THIS ROW DOES NOT CLAIM: the whole-count over-match question the
search-suggest instrument scopes (a PASS here says nothing about result
counts on broad terms); the signed-in member's filtered result set (the
journey grades the anonymous arm; the member arm rides the same read-rule
seam the port's permission rows cover); and the CQL search surface (row
N2's contract).

## The superseded attempt (recorded, kept)

The first run (`.runtime/edge-signed-in/gapbatch8-anon-search/report.md`)
failed in this module's own fixture guard before any graded leg: the
guard counted the three fixtures by NAME, and the engine writes NULL
names for compound cards, so the rule card `<Name>+*self+*read` never
matched and the guard threw "fixtures did not store" at a tree where all
three creates had been accepted. The fix is commit `ac61efde` (the guard
resolves the rule through left_id/right_id, the junction resolution the
A4 module documents); the attempt is kept in the lane's `.runtime` and
named here because a superseded attempt that is not named looks like a
clean first pass.

## State

CLOSED. The journey's own steps, driven signed out against a deck holding
one readable and one Administrator-only fixture for the term, return a
result set that lists the readable card and omits the restricted card,
the restricted name and its secret appear nowhere in the served bytes,
and the administrator's same search lists both.
