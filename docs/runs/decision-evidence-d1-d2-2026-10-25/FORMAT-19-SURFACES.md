# Decision 2 evidence: the 19 formatting-layer definitions and the surfaces they rendered

Repo: KatsuJinCode/decko-ts, branch `port/d1d2-verify-20261025`, base c29e4c3f
(origin/deploy/full-candidate-20261102, the newest pushed roll tip). Produced
2026-10-25 by the d1-d2 verification lane.

## The 19 definitions, dispositioned

Ruby side: `card-1.110.0/lib/card/format.rb` + `format/{content,context_names,render,registration,
wrapper,method_delegation,card_action_view}.rb` (8 files, 76 defs; the 19 gap rows from
`fixtures/captured/card-format-methods-ruby-oracle.json`, instrument counts PORTED-INLINE 39 /
GAP 19 / PORTED 12 / SKIP 3 / NAMED-COLLAPSE 3 at this tree; prior receipt
`docs/runs/treewalk-row-conversion-2026-10-22/reg-treewalk-c2-format-rb-format-content-context-names-render-regi/RECEIPT.md`).
The port binds none of the 19 names. Where each behavior lives:

| def | Ruby | pinned deck reaches it | port mechanism | where the behavior lives |
| --- | --- | --- | --- | --- |
| `require_card_to_initialize!` | format.rb:56 | internal-reachable | condition unreachable | Ruby's guard forces an id-only card to load before its format renders. The port's RenderFormat is constructed over an already-resolved card (src/card/render/format.ts; the render entry takes a fetched card), so a format never sees an unloaded card - the guard's condition cannot arise |
| `context_names_to_params` | format/context_names.rb:38 | unreachable | carried elsewhere | the name-context round trip lives in the edit views' port: add_name_context (src/card/mod-loader/mods/card-mod-edit.ts:1620, the slot JSON's name_context key, emitted only non-empty); Ruby's params-side conversion is headless-unreachable per the instrument |
| `with_voo` | format/render.rb:16 | external | inlined field | the voo is the render-options object threaded through every RenderFormat call: the port's render! names the voo lifecycle as its truth source (src/card/render.ts:19), and voo.show/hide ride the same object (card-mod-edit.ts:1623 `voo.show :help`; visibility handling in format.ts) |
| `before_view` | format/render.rb:24 | external | inlined site | runBeforeHook at src/card/render/format.ts:1499 - the requested view's before hook, cited to voo_api.rb:162-164 (`format.before_view requested_view`), firing also for unknown cards' substituted views |
| `pretty_path` | format/render.rb:44 | internal-reachable | inlined site | the port's path builder: cardPath (src/card/render/format.ts:79) composed with the request origin at format.ts:3046; Ruby's pretty_path is the same interior step of path building |
| `view_cache_setting` | format/render.rb:51 | external | no carrier (deferred) | format.ts's own header records `Deferred: view caching/stubs`; the captured surface exercises no cache-sensitive view (the cache: :never views, :edit among them, are per-request renders in the port by construction) |
| `stub_render` | format/render.rb:59 | external | no carrier (deferred) | same header line: nest-cycle stubs are deferred; the captured renders are raw/nest-free arms (the header's nest-mode census), so no stub bytes exist on any recorded surface |
| `supports_view?` | format/render.rb:76 | internal-reachable | inlined mechanism | view resolution plus the refusal: UnsupportedViewError (src/card/render/format.ts:97, thrown at :1523) - Ruby answers a boolean; the port refuses with the same error surface instead |
| `final_render_call` | format/render.rb:102 | private, internal-reachable | inlined site | the dispatch tail: the chain-aware resolveView (format.ts:1507-1510, Ruby's MRO walk format.rb:146-150) followed by the view function call |
| `add_debug_info` | format/render.rb:106 | private, internal-reachable | no carrier | debug annotations are off in every recorded posture; the port has no debug-info emitter on any captured surface |
| `show_debug_info?` | format/render.rb:115 | private, internal-reachable | no carrier | the flag's enabling condition never holds in the recorded material; no port counterpart was needed to match the bytes |
| `class_from_name` | format/registration.rb:34 | external | inlined field | formats are NAME-carried, not class-carried: RenderFormat.formatName (src/card/render/format.ts:995-1014, withFormatName). The class-from-name conversion has no class layer to convert |
| `symbol_from_classname` | format/registration.rb:55 | private, internal-reachable | no carrier | the inverse conversion, meaningless without format classes; the registry key is the format name string |
| `render_with_wrapper` | format/wrapper.rb:31 | internal-reachable | inlined mechanism | the wrap machinery ports as renderable wrap configs: the :modal wrapper and wrap(true) slot wrap (card-mod-edit.ts:1620-1640) and the :html_page wrapper entry (card-mod-format.ts:2392-2401) |
| `render_with_card_layout` | format/wrapper.rb:35 | internal-reachable | inlined site | the page assembly: src/card/render/page.ts renders the same DOCTYPE + head + interior frame (card-mod-format.ts:2394-2399 records the gem file with no view seats); show_with_page_layout at src/card/render.ts:2909 |
| `send_wrapper_method` | format/wrapper.rb:49 | external | inlined mechanism | Ruby dispatches wrappers through method_missing; the port's configs render directly as function calls, so the delegation surface does not exist |
| `new_action_view` | format/method_delegation.rb:65 | private, internal-reachable | no carrier | Rails ActionView instantiation for the card_action_view delegation; the port has no Rails ActionView |
| `lookup_context` | format/card_action_view.rb:10 | unreachable | no carrier | Rails template lookup context; the port's views are TypeScript functions resolved by resolveView, with no template filesystem |
| `compiled_method_container` | format/card_action_view.rb:15 | unreachable | no carrier | Rails compiled-template cache; same absence - no templates exist to compile |

Counts: 9 rows inlined into the renderer (the voo lifecycle, the before hook, path building, view
resolution and dispatch, the wrappers and the page assembly), 3 carried elsewhere or by a different
shape (the name-context round trip, the format name registry, supports_view?'s refusal), and 7 carried
by nothing - of which 2 are recorded deferrals (view caching, stubs), 2 are Rails' own ActionView/
template machinery with no port counterpart by design, 2 are debug switches never enabled in the
recorded material, and 1 (require_card_to_initialize!) has an unreachable condition in the port's
render model. Whether the OBSERVABLE rendering matches is the rest of this document.


## The surfaces those definitions rendered: recorded bytes next to the port's bytes

The 19 defs are the machinery behind every rendered view, so the surfaces are the captured views
themselves. Two independent layers of comparison, both run this lane at this tree:

### Layer 1: the pinned suites (commands and results)

    npx vitest run tests/server/html-format-parity.test.ts tests/server/json-format-parity.test.ts \
       tests/server/rss-format-parity.test.ts tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
       tests/card/mod-loader/card-mod-bootstrap.test.ts tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (html 18, json 20, rss 10, remaining-views 23, bootstrap 32,
bar-box 44). These suites compare the port's rendered output against the Ruby oracle's recorded bytes
in fixtures/captured/ (html-format-ruby-oracle.json, json-format-ruby-oracle.json,
rss-format-ruby-oracle.json, format-remaining-views.json, bootstrap-views.json,
bar-box-format-views.json). The battery itself (87 steps, writes and reads) also passed: 80 pass +
7 declared + 0 mismatched, with image variants compared by PSNR (upload-image and upload-large-image
variants: PSNR 66.57 to Infinity, alpha 1).

### Layer 2: the raw byte dump (both sides, un-normalized)

An env-gated companion to the remaining-views suite
(tests/card/mod-loader/card-mod-format-remaining-views-bytes-dump.test.ts, run with
DECKO_DUMP_FORMAT_VIEW_BYTES=1) renders each captured view through the port with the suite's own
setup and writes BOTH sides' bytes. Result for the 13 captured views of format-remaining-views.json:

| view | ruby bytes | port bytes | normalized equal |
| --- | --- | --- | --- |
| Format Views Probe#edit_link | 265 | 265 | YES |
| Format Views Probe#edit_button | 129 | 129 | YES |
| Format Views Probe#full_page_link | 123 | 123 | YES |
| Format Views Probe#board_link | 262 | 262 | YES |
| Format Views Probe#help_link | 456 | 456 | YES |
| Format Views Probe#menu_block | 1066 | 1066 | YES |
| Format Views Probe#content_panel | 1474 | 1486 | YES |
| Format Views Probe#content_with_title | 1479 | 1491 | YES |
| Short Probe#short_content | 42 | 42 | YES |
| Configure Probe#configure_link | 233 | 233 | YES |
| Conflict Probe#conflict | 2531 | 2561 | NO |
| Format Views Probe#view_list | 16574 | 16700 | YES |
| *home#home_url | 1 | 1 | YES |

12 of 13 normalize-equal (the normalization is the capture's own documented one: DB-local ids, slot
ids and relative times are masked on BOTH sides - the fixture records Ruby's bytes with those values
already masked). The one NO row, conflict, is item 1 below.

## The ACTUAL differences, enumerated

1. The conflict view's slot JSON id. After the capture's masking, the conflict view's single residual
   difference is one DB-local id inside the nested slot's data-slot JSON attribute (character 2322 of
   the normalized bytes: ruby `...5098}...`, port `...2}...`); every other byte, including the whole
   diffdel/diffins act summary, matches. Reader visibility: none (an internal attribute). Note: the
   pinned suite's exclusion comment for this view describes an expand-toggle difference (the TS render
   carries the toggle, the Ruby cold capture does not); the bytes dumped at THIS tree do not show that
   difference - both sides carry the collapsed accordion button - so that note is older than the
   current bytes. The suite's exclusion stays; this lane records what the current bytes measure.
2. The port's rendered relative times are visible where the capture masks Ruby's: the port renders
   `about 1 months ago` (view_list's creator credit) and `28 days ago` (conflict's act stamp) where the
   capture's masks hide Ruby's exact words. Ruby's own wording is NOT recoverable from these fixtures
   (the capture masks time_ago_in_words output by design), so no mismatch is claimed - but the port's
   pluralization on a singular count (`1 months`) is worth an eyeball against a live Ruby deck; this
   lane could not verify Ruby's side from recorded material.
3. The type-change refusal's page chrome (found in the Decision 1 trace comparison, enumerated here
   because it is a rendering difference). Same alert text on both engines; Ruby renders the full site
   page around it (18,722 bytes: logo, menu, search, nav), the port answers a bare alert document
   (381 bytes). Reader visibility: HIGH - a reader in a browser sees the site vanish around the error.
   Exhibits (exact recorded bytes rendered in a hidden headless browser, asset references left
   unresolved on purpose, so these are structure exhibits, not styled-look exhibits):
   screenshots/refusal-ruby.png and screenshots/refusal-port.png. For contrast,
   screenshots/port-home-live.png shows the port's LIVE home page (this tree's engine on the
   synthetic-v1 deck through the harness's own server) rendering full chrome - the bare refusal is
   specific to the write-refusal path, not to the port's page rendering.
4. The follow mail's unfollow link carries the deliberate soft-redirect suffix on the port
   (`&success[redirect]=soft`; both engines' text and HTML bodies otherwise identical). This is the
   recorded divergence the issue text already declares (draft item 3), not a new finding.
5. Write-response headers (Cache-Control: no-store added; Content-Type omitted on 303s) and the delta
   table's extra auth_sessions counter - detailed in TRACE-COMPARISONS.md items 1-2; zero reader
   visibility.

## What this comparison is, and is not

It IS: every captured view byte of the format fixtures, compared both by the pinned suites (147 green)
and by a raw side-by-side dump; the refusal page pair rendered to images; the differences enumerated
with visibility. It is NOT: a styled-browser pixel comparison against a live Ruby server (no Ruby
server was booted this lane; the visual exhibits render recorded bytes, labeled as such), and NOT a
claim about the 3 battery steps withheld until disclosure.


## The surfaces those definitions rendered: recorded bytes next to the port's bytes

The 19 defs are the machinery behind every rendered view, so the surfaces are the captured views
themselves. Two independent layers of comparison, both run this lane at this tree:

### Layer 1: the pinned suites (commands and results)

    npx vitest run tests/server/html-format-parity.test.ts tests/server/json-format-parity.test.ts \
       tests/server/rss-format-parity.test.ts tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
       tests/card/mod-loader/card-mod-bootstrap.test.ts tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (html 18, json 20, rss 10, remaining-views 23, bootstrap 32,
bar-box 44). These suites compare the port's rendered output against the Ruby oracle's recorded bytes
in fixtures/captured/ (html-format-ruby-oracle.json, json-format-ruby-oracle.json,
rss-format-ruby-oracle.json, format-remaining-views.json, bootstrap-views.json,
bar-box-format-views.json). The battery itself (87 steps, writes and reads) also passed: 80 pass +
7 declared + 0 mismatched, with image variants compared by PSNR (upload-image and upload-large-image
variants: PSNR 66.57 to Infinity, alpha 1).

### Layer 2: the raw byte dump (both sides, un-normalized)

An env-gated companion to the remaining-views suite
(tests/card/mod-loader/card-mod-format-remaining-views-bytes-dump.test.ts, run with
DECKO_DUMP_FORMAT_VIEW_BYTES=1) renders each captured view through the port with the suite's own
setup and writes BOTH sides' bytes. Result for the 13 captured views of format-remaining-views.json:

| view | ruby bytes | port bytes | normalized equal |
| --- | --- | --- | --- |
| Format Views Probe#edit_link | 265 | 265 | YES |
| Format Views Probe#edit_button | 129 | 129 | YES |
| Format Views Probe#full_page_link | 123 | 123 | YES |
| Format Views Probe#board_link | 262 | 262 | YES |
| Format Views Probe#help_link | 456 | 456 | YES |
| Format Views Probe#menu_block | 1066 | 1066 | YES |
| Format Views Probe#content_panel | 1474 | 1486 | YES |
| Format Views Probe#content_with_title | 1479 | 1491 | YES |
| Short Probe#short_content | 42 | 42 | YES |
| Configure Probe#configure_link | 233 | 233 | YES |
| Conflict Probe#conflict | 2531 | 2561 | NO |
| Format Views Probe#view_list | 16574 | 16700 | YES |
| *home#home_url | 1 | 1 | YES |

12 of 13 normalize-equal (the normalization is the capture's own documented one: DB-local ids, slot
ids and relative times are masked on BOTH sides - the fixture records Ruby's bytes with those values
already masked). The one NO row, conflict, is item 1 below.

## The ACTUAL differences, enumerated

1. The conflict view's slot JSON id. After the capture's masking, the conflict view's single residual
   difference is the action_id inside the nested slot's data-slot JSON attribute (character 2322 of
   the normalized bytes: ruby `...&quot;action_id&quot;:5098}`, port `...&quot;action_id&quot;:2}`) -
   each engine's own deck-local action id; every other byte, including the whole diffdel/diffins act
   summary, matches. Reader visibility: none (an internal attribute). Note: the
   pinned suite's exclusion comment for this view describes an expand-toggle difference (the TS render
   carries the toggle, the Ruby cold capture does not); the bytes dumped at THIS tree do not show that
   difference - both sides carry the collapsed accordion button - so that note is older than the
   current bytes. The suite's exclusion stays; this lane records what the current bytes measure.
2. The port's rendered relative times are visible where the capture masks Ruby's: the port renders
   `about 1 months ago` (view_list's creator credit) and `28 days ago` (conflict's act stamp) where the
   capture's masks hide Ruby's exact words. Ruby's own wording is NOT recoverable from these fixtures
   (the capture masks time_ago_in_words output by design), so no mismatch is claimed - but the port's
   pluralization on a singular count (`1 months`) is worth an eyeball against a live Ruby deck; this
   lane could not verify Ruby's side from recorded material.
3. The type-change refusal's page chrome (found in the Decision 1 trace comparison, enumerated here
   because it is a rendering difference). Same alert text on both engines; Ruby renders the full site
   page around it (18,722 bytes: logo, menu, search, nav), the port answers a bare alert document
   (381 bytes). Reader visibility: HIGH - a reader in a browser sees the site vanish around the error.
   Exhibits (exact recorded bytes rendered in a hidden headless browser, asset references left
   unresolved on purpose, so these are structure exhibits, not styled-look exhibits):
   screenshots/refusal-ruby.png and screenshots/refusal-port.png. For contrast,
   screenshots/port-home-live.png shows the port's LIVE home page (this tree's engine on the
   synthetic-v1 deck through the harness's own server) rendering full chrome - the bare refusal is
   specific to the write-refusal path, not to the port's page rendering.
4. The follow mail's unfollow link carries the deliberate soft-redirect suffix on the port
   (`&success[redirect]=soft`; both engines' text and HTML bodies otherwise identical). This is the
   recorded divergence the issue text already declares (draft item 3), not a new finding. The battery's
   comparator normalizes exactly this URL away (compare.mjs:224-227 folds every
   `/update/...*never...` link to a placeholder), so its mail PASS carries this one deliberately
   normalized declared difference.
5. Write-response headers (Cache-Control: no-store added; Content-Type omitted on 303s) and the delta
   table's extra auth_sessions counter - detailed in TRACE-COMPARISONS.md items 1-2; zero reader
   visibility.

## The adversarial second pass (this lane, same session, re-derivation)

No second agent was available; the pass re-derived every conclusion from the captures. What changed:

- The conflict residual was named precisely: the first read called it "one id inside the slot JSON";
  the pass identified the field (action_id) and showed both sides' full JSON (view/show/action_id,
  otherwise identical).
- The view_list equality was re-examined against the suite's exclusion comment (arms at default
  visibility): the dumped bytes are normalized-equal, so the comment's concern does not show in the
  current captures; the artifact records the measured equality rather than the older note.
- The suite's conflict exclusion comment (an expand-toggle difference) was checked against the dumped
  bytes: both sides carry the collapsed accordion button, so that note is older than the current
  bytes; recorded in item 1.
- The port-side relative-time wording (`about 1 months ago`) was flagged as unverifiable against Ruby
  from masked captures and is reported as an open eyeball item rather than glossed over (item 2).

## What this comparison is, and is not

It IS: every captured view byte of the format fixtures, compared both by the pinned suites (147 green)
and by a raw side-by-side dump; the refusal page pair rendered to images; the differences enumerated
with visibility. It is NOT: a styled-browser pixel comparison against a live Ruby server (no Ruby
server was booted this lane; the visual exhibits render recorded bytes, labeled as such), and NOT a
claim about the 3 battery steps withheld until disclosure.

