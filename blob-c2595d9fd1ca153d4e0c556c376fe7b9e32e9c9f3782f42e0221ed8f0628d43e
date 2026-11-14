# Routes round nine, 2026-10-24: the last three rows close, and the family is at its floor

Lane: `port/routes-round9-20261024` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round9-20261024`, branched at
`a56a1c195d321e9c92245cd2e8cdafe1ebe08773` (the round-eight tip, the
newest pushed routes tip: `git ls-remote origin 'refs/heads/port/routes-*'`
read `port/routes-round8-20261024` at that hash, and the round-eight
receipt names the same tip). The checkout was created with `git init` plus
a targeted fetch of that one tip and an unshallow, and node_modules came
across from the round-eight checkout (a local copy, 914 MB, no network).
Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts, private: `gh repo view KatsuJinCode/decko-ts
--json isPrivate` reads `true`).

Family state at the start of this round, read from the round-eight
receipt (the same family's own count): 72 rows, 65 DONE, 7 open. The open
rows were A12 (operator decision), B9 and B10 (operator and named flags),
C10 (measured skip), and D3, D4 and D5 (the takeable rows).

## The three rows this round took

| Row | Commit | Disposition |
| --- | --- | --- |
| D3 rss | `da377023` | CLOSE on parity, with the landing bound to a check that runs. The rss arm is on this tree on both serving hosts (the staging gate, the answer and the dispatch branch; the edge grammar split and the request core's answer), and the arm's presence is now asserted by a test instead of a fold-time grep. The ONE named divergence (the port serves the feed under `application/rss+xml` where the pinned format's own mime type is `text/html`) stays named. |
| D4 file (the general mapping) | `44fdc855` | CLOSE on parity, on a landed change. An unregistered suffix on a card URL is now the card's OWN file: the fold, the sender (the card's attachment, its own content type, the inline disposition, the uploaded-bytes defences) and both serving hosts' answers. Two cells stay named (the remote-storage arm, the two-segment view suffix). |
| D5 the registered format suffixes | `c75e22e9` | CLOSE on parity, on a landed change. A registered suffix is now split off the card URL and answered in its own format with its own mime type, on both serving hosts. Three names stay named (yaml and yml need Ruby's `to_yaml`, jsonld needs the jsonld support). |

**Three rows closed. The family is at its floor**: everything that remains
open is a named or operator-held row, and nothing in the family is left
with an unmeasured subject.

## What landed, row by row

### D3: the rss arm's landing, bound to a check that runs

The register's D3 row graded the port PARTIAL because "the staging host
had no rss arm at all, so a .rss suffix was stripped and the html page
rendered", and the row's own remaining step was machine-checked at fold
time: "the canonical tree carries no rss arm at all (a grep of the
canonical tree for isRssRequest finds no hit)".

The arm is landed on this tree: the staging host carries the gate (the
suffix and the query door, with the segment rule), the answer (the
engine's own `renderFormatShow(..., "rss")`) and the dispatch branch ahead
of the html arms; the edge host carries the grammar split and the request
core's answer. It came in with the tranche's own landing, which this
branch carries as an ancestor (`git merge-base --is-ancestor a14be12e2
HEAD` exits 0).

WHAT THIS ROUND LANDS is the CHECK. The arm's presence on both serving
hosts is now asserted against the port's own sources
(`tests/server/rss-arm-landed-parity.test.ts`, 4 tests), so an arm that is
removed, or a host that stops answering the feed, fails a test instead of
waiting for the next fold to notice. The row's open cell was a machine
check that only ran at fold time; it now runs on every change.

The pinned-gemset capture for this row re-runs byte-identically:
`tests/server/oracle-capture-rss-format-ruby.rb` answers md5
`f7a1f91610e87f965dcc5a2d6415850f`, the committed fixture's own md5, so
the fixture is not re-committed.

THE ONE DIVERGENCE STAYS NAMED: the pinned rss format declares no mime
type of its own (its class is three lines: `class RssFormat < HtmlFormat`,
`register :rss`), so the mime type it answers is HtmlFormat's, `text/html`
(`card-mod-format-0.20.0/lib/card/format/rss_format.rb`). The port serves
the feed under the feed's own content type (`application/rss+xml`) on both
hosts. Named, with both sides' evidence, and left as it is.

### D4: the file sender answers the general mapping

THE PINNED FOLD (`decko-0.20.0/lib/card_controller/response.rb:102-109`):

```
def format_name_from_params
  rf = requested_format
  explicit_file_format?(rf) ? :file : rf.to_sym
end

def explicit_file_format? rf
  params[:explicit_file] || !Card::Format.registered.member?(rf)
end
```

The REGISTRY decides: a registered format answers its own format, and an
UNREGISTERED one is the FILE sender. The registry holds the names as
strings (`card-1.110.0/lib/card/format/registration.rb:6-9`), which is
what `member?(rf)` compares.

WHAT LANDED:

1. THE FOLD, in the port's own grammar helper
   (`splitUnregisteredFormatSuffix`, `src/server/file-routes.ts`): the
   suffix after the LAST dot of the mark segment is the requested format,
   and a REGISTERED name is not folded here (row D5's arm owns those).
2. THE SENDER (`handleFileSenderRead`, the same module): the answer is the
   card's OWN file, read from the same store the `/files/` route reads,
   with the file's own content type, the inline disposition (attachment
   only when the requested format is literally "file"), the Expires
   header and the uploaded-bytes defences (nosniff, and the sandbox policy
   for the types that can carry script). The pinned rules are the file
   format's own `:core` view
   (`card-mod-carrierwave-0.20.0/set/type/file.rb:67-93`): the card's
   attachment, or the not-found view when the card has no attachment (the
   404 the pinned deck answers there).
3. BOTH SERVING HOSTS answer it, because the arm lives in the port's own
   attachment surface: the edge host's handler calls that surface for
   every request, and the staging host's card-read arm calls it for the
   one-segment mark shape.

THE NAMED REMAINDERS, two cells the port does not answer yet:

- the remote-storage arm: the pinned file format's `:core` view returns
  `card.format(:html).render_core` when the card's file is remote
  (`set/type/file.rb:72`), and this port's store is local, so the cell has
  no counterpart here;
- the two-segment arm: the pinned `(.:format)` capture rides the VIEW
  segment too (`engine_routes.rb:51`), and the port folds the one-segment
  mark arm only.

### D5: a registered suffix is a format

WHAT LANDED:

1. THE SUFFIX RULE, in one shared module
   (`src/server/registered-format-route.ts`): the format is the part after
   the LAST dot of the last segment of the card URL (the route's
   `(.:format)` capture, `engine_routes.rb:22`, 24, 51), and only a
   REGISTERED name is split.
2. THE EDGE HOST: the grammar splits the suffix off the MARK on the
   one-segment arm and off the VIEW on the two- and three-segment arms,
   and the request core answers the card in that format with the format's
   own mime type (the engine's own format-scoped view dispatch, not a
   harness fabrication).
3. THE STAGING HOST: the same split and the same answer, in the host's own
   dispatch chain, ahead of the arm that STRIPPED the suffix and rendered
   card's html page.

THE PINNED ANSWERS, from the committed capture:

- the mime types are the mod's own format classes: css `text/css`, scss
  `text/x-scss`, js `text/javascript`, text and txt `text/plain`, xml
  `text/xml`, csv `text/comma-separated-values` (or `text/plain` when
  `?disposition=inline`, `csv_format.rb:7-11`), and the port's own table
  carries exactly those;
- the view is the one the request names, or the format's own show default
  (the css format's `view ||= :content`, the base format's `view ||=
  :core`), not the html arm's "open";
- the csv format RAISES on a card whose items are not all known cards, and
  the port's 500 is that raise: the same NoMethodError the pinned csv
  `:titled` view raises, recorded in the port's own family module
  (`src/card/render/format-families.ts`).

THE NAMED REMAINDERS, three names the port cannot answer yet and why:

- yaml and yml need Ruby's `to_yaml`
  (`card-mod-format-0.20.0/set/all/yaml.rb:5-7`), and the port has no YAML
  serializer, so the port's yaml view (the pod hash) is a different
  answer and not the same one in another shape. The suffix stays in the
  card's name;
- jsonld needs the jsonld support (`set/all/jsonld.rb:16-18` answers the
  unsupported-format error unless a set opts in), and the port's own format
  mod says it is not ported. The suffix stays in the card's name.

AN UNREGISTERED SUFFIX IS NOT THE REGISTERED ARM: the pinned deck folds it
to the FILE sender, which is row D4's own arm, so the two rows split the
suffix space between them without overlapping.

## Captures: re-run in this lane, against the pinned gemset

Every capture below was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` with Ruby
3.4.11 on PATH, no Rails and no database, and compared with its committed
fixture.

| Capture | Committed fixture md5 | Re-run |
| --- | --- | --- |
| rss-format (D3) | `f7a1f91610e87f965dcc5a2d6415850f` | IDENTICAL |
| explicit-file-route (D4) | `e2d644d0e5d0b647b1176c0150dada3f` | IDENTICAL |
| format-registry (D5) | `d1ec55ae341df9d7748d47629408bf33` | IDENTICAL |
| register-routes-remaining-eight (the port's own surface quotes) | `2f16da17896772deea8f1dda7d60b536` | RE-RUN and COMMITTED after the quote re-point. The fixture before this round was md5 `1a9c7e8d00ce73300397b9b6c2c58f77`, and the diff walk over the two files reports the quoted lines alone: this round's landings moved the port's own source lines that the capture quotes. |

## The battery (final state, run in this lane)

- **The full `tests/server/` suite**: **127 files passed, 1 skipped (128);
  1318 tests passed, 14 skipped, 0 failed**. The one skipped file is
  `tests/server/edit-session-replay.test.ts` ("needs data or setup that a
  clean clone does not have"), the same skip the round-three to
  round-eight receipts record. The count is the round-eight tip's 1293
  passed plus this round's twenty-five new legs.
- **Per row**, the row's own files at that row's commit:
  - D3: `npx vitest run tests/server/rss-arm-landed-parity.test.ts`
    -> 1 file passed, 4 tests passed, 0 failed.
  - D4: `npx vitest run tests/server/file-sender-general-mapping-parity.test.ts`
    -> 1 file passed, 7 tests passed, 0 failed.
  - D5: `npx vitest run tests/server/registered-format-route-parity.test.ts
    tests/server/registered-format-negotiation-parity.test.ts
    tests/server/format-negotiation-arm-seam-parity.test.ts`
    -> 3 files passed, 26 tests passed, 0 failed; and `npx vitest run
    tests/deploy/bunny-edge-engine-request-registered-format.test.ts
    tests/deploy/staging-registered-format-d5.test.ts
    tests/deploy/bunny-edge-engine-request-rss.test.ts`
    -> 3 files passed, 22 tests passed, 0 failed.
- **The full `tests/deploy/` suite**: **1 file failed, 85 passed, 1 skipped
  (87); 1 failed, 688 passed, 10 skipped**. The one failure is
  `tests/deploy/worker-edge-cache-runtime.test.ts`, the pre-existing
  environmental failure this lineage's receipts record from tranche three
  onward. It is NOT this round's doing, and that was checked rather than
  assumed: the same file fails the SAME way at the round-eight tip
  (`git rev-parse HEAD` reads `a56a1c19` in the round-eight lane's
  checkout, and `npx vitest run tests/deploy/worker-edge-cache-runtime.test.ts`
  there answers 1 failed, 3 passed, with the same assertion, "expected
  'armed; cache=miss; not-stored' to contain 'miss+stored'"), and the same
  file fails the same way ALONE at this lane's tip (1 failed, 3 passed).
  The suite's counts are the round-eight tip's 678 passed plus this round's
  ten new legs.
- **TSC**: `npx tsc --noEmit` -> **exit 0, zero output lines**.

## The family count after this round

72 rows. **68 DONE, 4 open**: A12 (untouched, kept named with its
operator-decision flag), B9 and B10 (untouched, kept named with their
operator and named flags), and C10 (untouched, kept named with its
measured-skip flag).

**THE FAMILY IS AT ITS FLOOR.** Every row that remains open is a named or
operator-held row, and every row that this round took is closed on a
measurement: three rows, three landings, three pinned tests, and no row
left with an unmeasured subject.

## What this round did NOT land, named

- **D5's yaml, yml and jsonld**: the YAML serializer and the jsonld
  support are not ported, so those suffixes keep riding in the card's
  name. The dependency is named above.
- **D4's remote-storage arm and the two-segment view suffix**: the port's
  store is local and the fold covers the one-segment mark arm only. Both
  are named above.
- **D3's content type**: the port serves the feed under the feed's own
  content type where the pinned format's own mime type is `text/html`.
  Named, and left as it is.
- **A12, B9, B10, C10**: untouched, kept named with their flags.
- **The rounds before this one's named remainders**: untouched, still named.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-round9-20261024`
(a `git init` plus one targeted fetch, an unshallow, node_modules copied
in from the round-eight checkout, no network) at 1.3 GB in total (node_modules
914 MB, the rebuilt dist is gitignored), four commits, this report and the
round's test pins. The system drive reads 18 GB free after the lane.

Moved out of the checkout: this lane's scratch directory
`.tools-tmp-round9/` (the capture re-runs, the battery logs and the
commit-message drafts), ARCHIVED to
`C:/localProjects/decko-ts-lane-archives/routes-round9-20261024-tools-tmp/tools-tmp`
rather than deleted, so the checkout carries none of it and none of its
bytes is lost.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, the port's own test storage, or a locally
booted host.
