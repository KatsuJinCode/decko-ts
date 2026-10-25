# reg-dsl-C7

- Family: register-dsl.
- Row: "C7 Format suffixes: `.json` dispatches the json format; any OTHER suffix (css, rss, csv, ...) dispatches that format."
- Blocker at the time of this lane: REAL-GAP - only .json is dispatched; any other suffix maps to FileFormat send_file in Ruby and the port strips it and serves HTML; same root cause as routes D4/D5.

## Verdict: DONE

The row's named gap is repaired by surfaces that are IN THIS TREE at the base this receipt was
measured on (`deploy/full-candidate-20261101` tip `c17906db`, branch
`port/workbatch-b-20261025`), and every pin ran green on that base during this lane.

The Ruby mechanism the row names, read this session from the pinned gem tree
(`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`):

- `decko-0.20.0/lib/card_controller/response.rb:103-105` `format_name_from_params` returns
  `:file` when `explicit_file_format?(rf)`.
- `response.rb:107-109` `explicit_file_format?` is `params[:explicit_file] ||
  !Card::Format.registered.member?(rf)` - the unregistered suffix maps to the file format.

The port surfaces that carry it:

- `src/server/registered-format-route.ts` (row D5's close): the format is the part after the
  LAST dot of the last segment of the card URL, only a REGISTERED name is split, each
  registered name answers in its own format with its own mime type, and json and rss keep
  their own arms (the `.json` dispatch the row's label leads with is that json arm, parse
  pinned per construct in `tests/card/render/card-path-grammar-parity.test.ts`,
  "extension: .<format> on the view segment").
- Row D4's close (the row's own "same root cause" note): an UNREGISTERED suffix on a card URL
  is the card's OWN file - the fold, the sender, the card's attachment, its own content type,
  the inline disposition and the uploaded-bytes defences - on both serving hosts. Evidence:
  `docs/reports/routes-round9-2026-10-24.md`,
  `fixtures/captured/explicit-file-route-ruby-oracle.json`,
  `tests/server/file-sender-general-mapping-parity.test.ts`.

Checks run at the base of this receipt (this lane, this tree):

- `npx vitest run tests/server/registered-format-route-parity.test.ts
  tests/server/file-sender-general-mapping-parity.test.ts` - 2 files, 20 tests passed.
- `npx vitest run tests/card/render/card-path-grammar-parity.test.ts
  tests/deploy/bunny-edge-engine-request-registered-format.test.ts
  tests/deploy/staging-registered-format-d5.test.ts` - 3 files, 17 tests passed (the
  grammar suite's own 7 include the `.json` extension arm; the two deploy suites answer
  registered formats on both hosts, 4 and 6 tests).

Named remainders, inherited from the rows that own the surface (D5's close carries them):
yaml and yml (the port has no YAML serializer; its yaml view is a different answer, not the
same answer in another shape) and jsonld (the port's own format mod records it as not
ported). An unregistered suffix is not split - that is D4's own arm, now landed.
