# Mods tranche 6

Base: eceb562706cfe696b377351aa116e8939bac8e18.
Register: brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md.
The register is maintained in the lead documentation repository, not this worktree.

## Remaining partial entries in register order

After excluding the entries dispositioned by mods tranches 1-5:
16 follow; 17 format; 19 history; 23 markdown; 27 script; 28 search;
29 session; 32 tinymce_editor; 33 virtual.
Virtual's event-body skips are already recorded by the events lane, but no
mods tranche has separately dispositioned entry 33. PORTED entries are excluded.
This batch takes entries 16, 17 and 19, in that order.

## Batch two (2026-10-20): entries 23, 27, 28, 29, 32, 33

The first run of this tranche landed 16, 17 and 19 and stopped. Batch two
takes the rest of the WORKING set, in register order: 23, 27, 28, 29, 32, 33.
Everything those six entries needed came from the pinned local gem source at
C:/localProjects/decko-ruby-reference/mod and the pinned gems at
C:/localProjects/decko-ruby-oracle-gems. Nothing deployed; no host contacted.

Four of the six are CENSUS dispositions - the gem's declaration surface
extracted from its own files by a committed Ruby script, committed as a
fixture, and asserted by a test. Two are ports.

| entry | disposition | commit |
| --- | --- | --- |
| 23 markdown | PORTED (setext headers) + remainder pinned | 2e96471d |
| 27 script | PORTED (js :compressed) + 2 register corrections | 2bea02f6 |
| 28 search | VERIFIED MATCHING + 2 closed absences + 1 divergence named | e203b80b |
| 29 session | VERIFIED MATCHING + 1 register correction | bc5ad558 |
| 32 tinymce_editor | VERIFIED MATCHING (the fold is lossless) + 2 corrections | 5ecc4b96 |
| 33 virtual | VERIFIED MATCHING + NAMED SKIP re-pinned | 122f62e1 |

## 23 markdown

PORTED: parser/kramdown/header.rb:17-26 setext_header, dispatched between
:list and :paragraph to match Ruby's @block_parsers order
(parser/kramdown.rb:75-77). Level 1 for an '=' underline, level 2 for '-';
the contents line takes 0-3 leading spaces and the underline none.
after_block_boundary? (block_boundary.rb:17-21) is honoured, so an underline
inside a paragraph stays body text. parse_header_contents (header.rb:44-53)
is factored out and shared; the trailing-# strip stays ATX-only
(header.rb:33), which is why "Title ##" keeps its hashes under a setext
underline.

VERIFIED: 22 setext cases executed through kramdown-2.5.2 with the gem's own
option hash - the committed regeneration script
tests/card/mod-loader/oracle-capture-markdown-views.rb, run against the
pinned gems - match the port byte for byte. All 22 are pinned in the new
SETEXT_PARITY table. Two indented-contents cases still diverge for the
unrelated coderay-tokenizer reason and stay named.

CORRECTED: the mod header's absence list named divergences no test pinned.
Every construct it names is now pinned with BOTH port bytes and oracle bytes
in DIVERGENCES - footnote, definition list, abbreviation, ALD, math, raw
HTML block, link reference definition, EOB marker. Each was measured on
2026-10-20; all eight genuinely diverge, so the header was accurate but
unenforced.

## 27 script

PORTED: abstract/00_script.rb:9-12 view :compressed under `format :js do`,
registered on abstract/00_script under the manifest's js format key, so it
reaches exactly the cards in Abstract::Script's chain (java_script,
coffee_script) and no others. Ruby's two config reads became host seams,
RenderEngine#compressAssets / #scriptCompressor: the only Uglifier(harmony)
port is uglify-harmony-compile-engine.ts, which imports node:vm and is
deliberately kept out of the render surface. An absent seam is the
development value (card-1.110.0 config/environments/development.rb:11), so
the identity arm runs; compress_assets on with no compressor raises Ruby's
named error rather than emitting unminified bytes.

CORRECTED: the mod header claimed "the TS engine has an html format only"
and therefore could not register these names. Measured, the second half was
right (the registration is NOT flat; it is scoped to the js format and to
this abstract module) and the first half was wrong: a js-format
registration on a set module in the card's chain resolves and renders,
because render.ts computeResolvedView's non-html arm runs AFTER
loader.viewChain. The blocker was never the format, it was the per-render
compressor.

CORRECTED: the register (2026-10-18, entry 27) says the port "registers 8 of
16 setPaths". It registers 16 of 16, and the existing named test "WITH the
mod: the manifest carries all sixteen gem-tree set modules"
(tests/card/mod-loader/card-mod-script.test.ts) pinned that before this
batch. The claim is withdrawn on that evidence.

VERIFIED: the committed capture script
tests/card/mod-loader/oracle-capture-script-compressed.rb slices the
`format :js do` block out of the gem's own 00_script.rb and class_evals it on
a harness supplying only the card name, _render_core and a Cardio.config
stub - compress, try_compress, comment_with_source and
compression_error_message are the gem's own methods. Six cases across the
gem's option surface (compress_assets true and false, a commented core, an
empty core, a syntax error) are byte-identical, including the ANSI source
excerpt inside "JavaScript::SyntaxError (broken.js): ...". Splitting that
message needed one new export, formatUglifierRawError: the same e.message
reaches the save-validate path through Cardio::Utils.ansi2html
(type/java_script.rb:8) and the :compressed path raw (00_script.rb:36), and
only the raw one was exported.

## 28 search

VERIFIED MATCHING by measurement, and the accounting is CLOSED. The
committed script tests/card/mod-loader/oracle-capture-search-declarations.rb
reads the format blocks and view declarations out of all 29 gem set files,
handling both declaration spellings (`view :name` and `view(:name) { }`, the
latter at abstract/0_search.rb:56 and :86), the multi-line option lists,
and the set DSL's rule that a `view` outside any format block goes to the
BASE format module (card-1.110.0 lib/card/set/format.rb:106-108 - which is
what self/recent.rb:4's bare `view :title` does). Measured: 32 view
declarations across base, html, json, csv, data and rss. Every one is
registered by the port, resolved to a view the port owns elsewhere with the
resolution named, or named as an absence with its cause. Nothing is
unaccounted.

CORRECTED: two absences the register closed on 2026-10-19 and this file's
header had not caught up. :molecule is PORTED as jsonMolecule
(render/format-families.ts:396-427); :feed_item_description is PORTED as
rssItemDescriptionView (card-mod-format.ts:2262).

NAMED, three remain, causes measured this session:
 - csv :body (views.rb:102-106) - the engine has no csv format dispatch;
   render.ts computeResolvedView returns undefined for any format outside
   the html lineage and email_text, so a csv-keyed registration has nothing
   to answer;
 - rss :feed_body (search_views.rb:16-23) - the key dispatches, but the body
   writes an XML feed document and card-mod-format.ts:2255 still names the
   XML-writing feed family unported;
 - json :name_complete / :name_match (views.rb:38-44) - they run ad-hoc CQL
   against params[:term] at VIEW TIME for ANY card. The prepared
   request-term seat is *search-scoped, so these have no seat; serving them
   needs a per-card request-term prepare across the whole deck - engine
   work, not a view body.

NEW DIVERGENCE, named rather than silent: :checkbox_list is registered under
the port's BASE key (card-mod-search.ts:1136-1138) while views.rb:118
declares it under `format :html` only. mod-loader.ts:1112 puts `base` in
EVERY format's chain, so the port answers json/csv/data renders of
:checkbox_list where Ruby raises view (checkbox_list) not supported. Wider
reach, not a gap.

## 29 session

VERIFIED MATCHING by measurement. card-mod-session-0.20.0's whole
declaration surface is two set files, four events and ZERO views - its only
format block is a `before :core` HOOK (type/session.rb:59-63), which is not
a view. The committed script
tests/card/mod-loader/oracle-capture-session-declarations.rb reads the
`event :`, `view :` and `include_set` lines out of the gem's own two files.
Against it: both set paths registered and no third; all four events
registered on their own module with Ruby's stage (:finalize for
discard_deleted_locations, :prepare_to_store for the two session events) and
trigger (:delete / :save); zero view registrations, which is what the gem
declares; and include_set Pointer has no manifest slot, with no set-module
field that could smuggle one in.

NAMED, not silent: save_current_location declares `on: :read`
(location_history.rb:6) and the port DROPS that arm - the trigger union has
no read arm, and the read path runs the save itself (Env.save_location
ported as visitor-session.ts saveLocation). The test asserts the drop
against the Ruby name, so a future port that adopts a read trigger fails
loudly rather than drifting.

CORRECTED: the register (2026-10-18, entry 29) states "The `before :core`
hook itself is registered in the same file." Read against this tree that is
false: set/type/session.rb registers the two events and nothing else. There
is also no seam it could be registered into - RenderFormat#runBeforeHook
(src/card/render/format.ts:1726) is a hardcoded switch over view names, not
a mod-registration surface, and ModFormatBlock carries views only.

## 32 tinymce_editor

VERIFIED MATCHING by measurement; the register's remaining hold is closed
as a LOSSLESS FOLD rather than a gap. The committed script
tests/card/mod-loader/oracle-capture-tinymce-declarations.rb reads the
format blocks and view declarations out of all nine gem set files,
including the multi-line declarations whose option lists continue past the
`view` keyword's line. Measured: ELEVEN views in three of nine files, and
the SIX files the port does not register as patterns declare ZERO views -
all/reference_editor.rb and all/tinymce_editor.rb carry helper methods and
basket pushes, link_editor/link_parser.rb,
nest_editor/nest_editor_options.rb and nest_editor/nest_editor_tabs.rb are
classes and option tables, and self/tiny_mce.rb is a raw_help_text. All
eleven registrations match by name, format key and option words, and the
gem's option vocabulary is cache / perms / unknown with no fourth knob
(`wrap:` rides the viewFn; the schema's config carries only the scalars).

CORRECTED: two in-file comments contradicted the registrations beside them.
The nest_editor set module said ":nest_editor + :modal_nest_editor +
:nest_content (unported, see header)" - all three are registered three
lines below. The nest_image set module said ":nest_image/:modal_nest_image/
:new_image are the unported remainder" - all three are registered below
those words. Both were the stale-prose pattern the register already
documented for this file's header on 2026-10-19; the per-set-module comments
had not been caught up. What remains unported is the HAML the bodies render,
named per view in the viewFn comments - not the registrations.

Per-view BODY parity is not claimed by this batch; it rests on the mod
file's existing oracle pins (card-mod-tinymce_editor.test.ts), as the
register says.

## 33 virtual

VERIFIED MATCHING by measurement, and the NAMED SKIP is now pinned at the
entry level. The committed script
tests/card/mod-loader/oracle-capture-virtual-declarations.rb reads the
`event :`, `view :`, `include_set` and `def` lines out of the gem's one set
file and its lib file. Measured: one set module, two events, zero views,
zero includes - the counts the gem declares, so a view here would be
fabrication. The lib file's 14 Card::Virtual record methods and the set
file's 8 card methods are pinned by name, including the constant-false
history?/followable? pair the port exports. The record BODIES stay where
they were already proven, against real storage, in card-mod-virtual.test.ts.

NAMED SKIP, re-pinned: both registered fns remain no-ops. Measured cause,
not a guess. Ruby's bodies are `Virtual.save self; abort :success`
(virtual_cache.rb:21-24) and `Virtual.delete self; abort :success unless
real?` (:26-29). The abort unwinds the save BEFORE the cards-table write, so
a virtual card's content lands in card_virtuals and the act ends - no cards
row, no store, no history. The port's write path composes real rows through
the ActWriter and has no such diversion, so wiring only the Virtual half
would run Virtual.save AND the row write, which Ruby's shape never produces.
What is missing is routing, not logic: the driver-shaped bodies exist and
are proven (virtualSave/virtualDelete, wired helpers at
card-mod-virtual.ts:456-477). The events lane recorded the same verdict on
2026-10-19 in commit 8ec17a8c on port/events-last-third-20261019. The new
test asserts both fns are still no-ops, so a fn that starts doing driver
work without the diversion fails there first.

## Shared method: measure the gem, do not transcribe it

Five of this batch's six entries are dispositions about DECLARATIONS, and
every one of them was settled by a committed Ruby script that reads the
gem's own files rather than by a second reading of a prose summary. The
scripts share a shape - walk the set files, report the format blocks and the
declarations inside them with their option words - and between them they
handle the four things a naive grep gets wrong:

1. both declaration spellings (`view :name` and `view(:name) { }`);
2. multi-line option lists (a declaration whose options continue past the
   keyword's line, with nested braces);
3. a `view` outside any format block, which the set DSL routes to the BASE
   format module;
4. comments, which are skipped rather than mined for declarations.

Each script writes its result to a committed fixture and each test asserts
against that fixture, so a future Ruby-side change shows up as a failing
count rather than as new prose nobody re-reads.

## Batch two: validation and limits

Checks run during batch two, each named with the command that produced it.

- Touched battery, per entry: card-mod-markdown plus the two other
  kramdown-touching files 176/176; card-mod-script-compressed 11/11;
  card-mod-virtual plus card-mod-virtual-declarations 39/39;
  card-mod-session-declarations 7/7;
  card-mod-tinymce-editor-declarations plus card-mod-tinymce_editor plus
  both view-dispatch censuses 53/53;
  card-mod-search-declarations plus card-mod-search plus both
  view-dispatch censuses 52/52.
- Intermediate full battery after the script port: every file under
  tests/card/mod-loader/ and tests/card/assets/ - 147 files, 2198 passed,
  1 skipped. Two census files were re-pinned there for the one new js-keyed
  row and both then passed.
- FINAL full battery for the batch, the union of the three directories the
  batch touched: tests/card/mod-loader/, tests/card/assets/,
  tests/card/render/ - 413 files, 381 passed, 31 skipped, 1 failed; 3566
  tests, 3418 passed, 145 skipped, 3 failed; 345.50 seconds.
- Type checking: `tsc --noEmit` reports exactly three errors, all in the
  untouched tests/card/actions/write-path-races.test.ts (lines 132, 526).
  Re-checked after every commit in the batch; the count never moved.
- Fixture reproducibility: every committed fixture regenerated byte for
  byte from its Ruby script during the batch. SHA-256:
  script-compressed-oracle.json
  005d14c9978d07b89ac4705222fbc33bd73bb99c67bc528bcec1c585b7a85f64;
  session-declarations.json
  6ee38927dafa8710836dceab403dccfcb4adbcc3a89525ad6661c55b7040a3b3;
  virtual-declarations.json
  1f45cc5391d04fb6f90cd510487d451c7c199b671b39c7f863c06de962e55106;
  tinymce-declarations.json
  955ea52f30b923ed13647b4d2e046037b990535a899a7d64ab33ae5e7bb2d95e;
  search-declarations.json
  f3af54b6476d93e062c199421bb2aa8d964693f007ab2b879f4813467b6baf2b.

The three failures in the final battery are ALL in
tests/card/render/content-options-one-line-count-capture-state-pins.test.ts,
and their cause is measured, not assumed: each is
`ENOENT: no such file or directory` opening a Ruby source under
`C:/localProjects/archive/decko-fork-study/decko/mod/...`. The archive
checkout is present but its layout does not contain those two files
(`mod/edit/set/type/` is empty; `mod/list/set/abstract/` holds a DIRECTORY
named `01_list`, not the `01_list.rb` the test opens). None of the 30 files
this batch changed is an input to that test, so no change in this batch can
have produced or hidden these failures. The earlier tranche-6 batch recorded
the same three failures and reproduced them on the untouched tranche-5 base.

What this batch did NOT do, stated plainly:

- No per-view BODY oracle pin was added for the four census entries (28, 29,
  32, 33). Those entries are disposed on the DECLARATION surface, which is
  what their registers hold open; per-view body parity for them remains what
  the mod files' existing oracle pins say it is, and this batch neither
  strengthens nor weakens that claim.
- The three entry-28 absences and the one entry-28 divergence were NOT fixed.
  They are named with measured causes and pinned as invariants, which is what
  the parity law asks for when a cause is architectural.
- The synthetic-v1 composed grade was not re-run. It is a release-acceptance
  artifact, not a check this tranche's ask names, and batch one already
  recorded its FAIL grade and its seven baseline side-effect failures on the
  same base.

Disk: batch two adds 2578 lines and removes 65 across 30 files; the sixteen
brand-new files total 69,914 bytes (four census test files, five JSON
fixtures, five Ruby census scripts, two script-port files). Nothing was
deleted: the five probe scripts written under tmp/ during the markdown
measurement were moved out of the tests tree rather than removed (the
filesystem deletion gate declined the `rm`, correctly - they are scratch, not
evidence, and tmp/ is gitignored so they cost nothing to the branch).

No deployment, no dependency installation, and no production-host contact
was performed. culturesmith.com was never contacted: the only network in
this batch was `git push` to the private decko-ts remote.

## 16 follow

Verified matching: the HTML follow_button is registered, with cache never.
Corrected stale manifest prose claiming the button was unported.
The modal helper has exactly one mention in the entire pinned card-mod set
Ruby/HAML source: its definition. This is no missing reachable view.
Skip and named: JSON follow_status invokes link_opts on StartFollowLink or
StopFollowLink CLASS objects. The gem defines only the instance method.
Both branches raise NoMethodError, measured by loading the gem's own classes.
No guessed successful JSON answer is registered.

Oracle: oracle-capture-follow-link-remainder.rb and its JSON capture record the
method error, both branches, the modal census and the source SHA-256.
Checks: card-mod-follow-remainder-census plus card-mod-follow, 15/15 passed.
No deployment and no production-host contact.

## 17 format

Ported: JSON-LD not_found, denial and test, with raw Ruby error_result JSON
bytes and the literal test error. The capture executes the gem's JSON-LD
block and helper, without copying its expected answer into the probe.
Corrected the stale html-only dispatch claim: params.format already reaches
RenderFormat. These views now pass through that real dispatch.
Remainders named precisely: dynamic JSON errors and JSON-LD errors/server_error
need root error_status and card.errors state not exposed by RenderFormat;
format_unsupported also mutates that root state. CSV body and RSS XML remain
unregistered view bodies; separate show helpers exist, so their absence is not
absence of a format family. No full-mod parity claim is made.
Checks: JSON-LD static errors, card-mod-format, RSS format views: 62/62 passed.

## Process evidence

Gateway research was started before design; its default provider returned an
unhelpful refusal. The local pinned gem source is the authoritative evidence.
Gateway health reported bridges up; no running search was terminated.
Touched follow tests completed in 3.50 seconds, format tests in 2.22 seconds.
The first follow save changed line endings accidentally. A separate forward
commit restores the original LF bytes; no history was rewritten.

## 19 history

Ported: all/history/export JSON history and actions, using the existing
format dispatch with a new card/view-scoped prepared result. history reads
the full history_card_ids closure, including drafts. actions reads only the
root card and excludes drafts. Both use ascending action id order, preserve
Ruby's act/action hash insertion order, and apply last-value-wins changes.
The result is not sourced from the HTML reader, which is paginated.
A new request clears the result; a card/view mismatch never returns another
card's data. No data means an empty array, not invented action rows.
The Ruby capture executes the pinned export.rb view blocks and hash helpers
on synthetic act/action/change objects. The engine test seeds the equivalent
SQLite rows and includes a nested card, a draft, repeated field changes,
a far-away HTML page number, and an unrelated empty card.
The optional atom explicit-show extension remains outside these two views.

Corrected the register's stale reason that manifest JSON views have no render
route. The route exists, and both view registrations are now exercised by it.
The two composed-deck census files now pin exactly these five new rows:
three JSON-LD format errors and two JSON history exports. Counts change by
exactly five; the foreign rows still do not enter the HTML flat table.

## Validation and limits

- Follow touched battery: 15/15 passed.
- Format touched battery: 62/62 passed.
- History plus both updated census suites: 58/58 passed.
- Full mod-loader battery: 142 files, initially 2040 passed, 5 stale census
  assertions failed, 1 data-gated skip. After correcting the five exact
  inventory expectations, the affected census suites pass 15/15. The full
  unchanged battery was not repeated.
- Render/history battery: 234 files passed, 1 failed, 31 skipped;
  1242 tests passed, 3 failed, 144 skipped. All three failures are in
  content-options-one-line-count-capture-state-pins; rerunning that exact
  file on the untouched tranche-5 base reproduces all three failures.
- Type checking: three errors in untouched write-path-races.test.ts,
  reproduced identically on the tranche-5 base. No added type errors.
- Full composed synthetic-v1 reference grade: rendering 1754/1754,
  semantics 2389/2389, persistence 16/16, side effects 12/19, read writes 8/8,
  other tables 12/12. This is a FAIL grade, not release acceptance.
  A fresh run on the exact tranche-5 base produces the same seven side-effect
  failures. Raw run comparison: 0 unexplained differences across 1752 render,
  2388 semantics and 16 scenario records (normalization masks recorded by the
  existing comparison tool). New JSON views are covered by the direct Ruby
  captures, not by claiming synthetic-v1 includes them.

The full mod battery took 107.84 seconds. The render/history battery exceeded
the diagnostic threshold at 176.59 seconds. Diagnosis: 266 selected files,
repeated isolated module imports, two-worker concurrency, and a depth-sweep
suite taking 24.09 seconds; tests/import/transform accounted for 44/29/24
percent of tracked work. This was a broader selection than the touched paths
needed. No unchanged full battery was repeated. Baseline failures were
isolated to one file (0.55 seconds), and the corrected census/history battery
took 2.34 seconds. Existing runners were allowed to complete.

The worktree is retained for lead integration: it contains the unmerged
branch and ignored/raw validation evidence. It is not an abandoned scratch
checkout. No dependency installation, deployment or production-host contact
was performed.

Grade receipt SHA-256 mods-tranche6-synthetic-v1: 8b50b88e5da5f77c2a254021f3fbf20a379feed1030c5c4060a17a6164a72768.

Grade receipt SHA-256 mods-tranche6-baseline-synthetic-v1: 81a8a6f3cae2a587e5c6de8b27eeba346f6b14816f0bd3df08533ecfcc5e5348.

Oracle capture SHA-256 values:
- follow-link-remainder.json: 17cb3e2d2ca9b3a25bc650795dd5a1f2ba20950b3c57ccc618e1fbe33dd0174a
- jsonld-static-errors.json: 7f756aaa87e763058e8806c2ed4b3a1e6a5d09a920ba1cf940e2c7ed047527a1
- history-json-export.json: 5c257b5ee28f709b5f109467716ce9205899e9bee2f9ff4d9f64eca0725a62e1

Final touched battery after census corrections: 9 files, 135/135 passed in 3.76 seconds.
