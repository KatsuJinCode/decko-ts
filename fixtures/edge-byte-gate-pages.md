# Edge byte-gate page list

`edge-byte-gate-pages.txt` is the committed source of record for the edge
render byte gate's page set. The gate itself runs from untracked per-worktree
state: the page list lives at `tmp/gate/pages.txt`, the deck is the mirror
`benchmarks/one-trip-render/deck-analyzed.sqlite3`, and the per-page reference
renderings are produced once from a verified engine revision by the same
integration gate kit that produced the original reference set (see the
integration release record, "How every merge is gated").

## How to use

1. Copy `edge-byte-gate-pages.txt` to `tmp/gate/pages.txt` in the worktree
   that runs the gate kit. One card name per line, no comments.
2. For any line that has no reference rendering yet, generate one from a
   revision the byte gate already trusts, using the same rig that produced
   the existing references, before the gate run judges it. A page without a
   reference is reported `not_identical`, never silently skipped.
3. Every page name must resolve on the mirror deck above.

## Why the search page is in the list

The original 40 names contained no page whose body renders a CQL search
result list (`search-result-item` bars over a virtual search nest), so the
entire search rendering shape — result set, ordering, item bars — shipped
un-gated. The 2026-10-08 all-actor scoreboard grade tripped over exactly that
blind spot: an apparent 58-page search regression that turned out to be a
grading-corpus mispairing, undetectable by the byte gate because none of its
pages exercised the shape. `Christianity` closes the gap: its page body nests
`_self+*referred_to_by` (a VirtualSearch family card) and renders the
referring cards as a result list, and it resolves on the mirror deck.

## Provenance

The first 40 lines are the gate kit's page list verbatim as of the
`integration-2026-10-08` branch at `bbe4747e` (the WP5 gate set, 40 pages,
20 of which render the denial frame). `Christianity` is the one addition.
