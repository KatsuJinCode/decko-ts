# mx-186: pagination math, offsets, limits, and page counts beyond page-2-differs

The roster row `mx-186-cross-cutting-pagination-math` (family [Family])
reads "pagination math: offsets, limits, and page counts beyond
page-2-differs", verdict PASS, bucket DONE, with the evidence basis
"verified - every instrument entry for this action is pass
(whole-harness)". This receipt is the family's own adjudication of that
row: the instruments the registry's own ledger records for it, the Ruby
sources the port's paging bytes are pinned to, and fresh measurements at
this tip.

## What the row is

A result list longer than one page has to paginate correctly, not just
differently: the windows must be disjoint, the offsets must advance by
the limit, the control's page count must equal the walked pages, and an
offset past the end must degrade to an ordinary page rather than an
error.

## The instruments

The ranks91-100 window probe
(reference-harness/browser/probe-pageonly-ranks91-100.mjs) drives two
legs (its ACT-186 section, lines 709-762): it walks the fixture's Topic
result set through the search page's own Next control, reading each
page's result ids and the control's own page items, and grades the walk
disjoint, advancing, and count-consistent (:726); then it requests an
offset of 100000 and grades the answer an ordinary page, never a 5xx
(:735).

The batch5 cross-cutting probe drives the same two legs independently
(its ACT-186 section, lines 313-367).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "pagination math:
offsets, limits, and page counts beyond page-2-differs", id ACT-186,
check_ids []) records these instrument entries:

    - whole-harness, headless-dom, native-local-bundle: pass
    - whole-harness, headless-dom, ts-engine-local-bundle: pass (two
      entries, the pageonly-batch5 and the ranks91-100 re-grades)

## The oracle

THE PAGING BYTES ARE PINNED TO RUBY'S OWN SOURCES BY THE PORT FILE THAT
RENDERS THEM. The port's search paging lives in
src/card/render/search-paging.ts, whose header names the Ruby chain it
renders, file and line: card-mod-search set/abstract/0_search/views.rb:109-116
(search_result_list through with_paging), card-mod-collection
set/abstract/paging/paging_views.rb:21 (with_paging), the paging.haml
structure (nav ul.pagination.paging, the links, the paging-context line
"offset+1 - last_item_on_page of count"), the li and a shapes from
paging_views.rb:38-52, and PagingLinks::MAX_PAGES
(card-mod-collection lib/card/paging_links.rb:5), which caps the final
page link at 100 pages. The same header states the show_paging? rule the
port seats its record by: paging_views.rb:4-9, false when limit < 1,
false when fewer_results_than_limit?, else limit < count_with_params.

THOSE RUBY FILES ARE ON THIS MACHINE, AND THE RULES READ AS CITED. The
installed card-mod-collection-0.20.0's
set/abstract/paging/paging_views.rb opens with show_paging? (lines 1-7:
the limit check, the fewer_results shortcut, `limit < count_with_params`)
and fewer_results_than_limit? (lines 9-13, the offset.zero? guard), and
format :html's with_paging wraps the yielded list with render_paging
(lines 17-22). The measured control at this tip printed exactly the
arithmetic those sources compute: 116 results, limit 20, six page items,
a last window of 16.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The paging
control's structure, its class names, its page-link shapes and its
show-or-hide rule are pinned to Ruby's own files, which were read at this
tip and agree with the port file's own citations; the port renders them
through the committed builder the header names. The walked windows'
disjointness, the offset arithmetic and the oversized-offset behavior are
the probes' own named instruments. No Ruby-captured byte comparison is
claimed for this row: the registry's ledger entries for it are
behavioral, and this receipt matches them with behavioral measurements.

## The measurement at this tip

    node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-ranks91-100-final

    source 9a2ed6e3 (the lane's own tip at run time), the source files
    clean, the engine pure-tip (distSha256 07ff7a50...)
    ACT-186 pagination windows are disjoint, advance by offset, and the
      control's page count matches the walked pages: GREEN
      {"pagesWalked":6,"windowSizes":[20,20,20,20,20,16],
      "duplicateRows":0,"offsets":["20","40","60","80","100"],
      "pageItems":["«","1","2","3","4","5","6","»"],
      "lastPageInControl":6,"total":116,"size":20,"countMathOk":true}
    ACT-186 an offset beyond the last page degrades gracefully (never a
      5xx): GREEN {"requested":"/*search?query[keyword]=Topic&offset=
      100000","status":200}
    legs 22, failures 0

    node reference-harness/browser/probe-pageonly-batch5-ordering-case-\
      paging-roles-empty-error.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-batch5

    source 71d4f686 (the family tip this lane starts from), the source
    files clean, distSha256 708a5f3d...
    ACT-186 pagination windows are disjoint, advance by offset, and the
      control's page count matches the walked pages: GREEN (same shape:
      6 pages, windows 20x5 then 16, 0 duplicate rows)
    ACT-186 an offset beyond the last page degrades gracefully: GREEN
      {"status":200}
    legs 11, failures 0

Six disjoint windows walked through the page's own control, the control's
own count matching the walk, and an offset of 100000 answered with an
ordinary page, on both instruments, at both sources.

## What this receipt does NOT claim

- The row's port side is what the instruments grade, and it is green. This
  receipt does not claim anything about a live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The paging-context line's exact bytes and the ellipses li's behavior
  beyond the 100-page cap are pinned by the port's committed builder and
  its own battery, not re-driven byte-for-byte by this lane's runs; the
  ledger entries this receipt matches are behavioral.
