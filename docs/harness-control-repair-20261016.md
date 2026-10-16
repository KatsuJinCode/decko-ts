# Browser control repair checkpoint, 2026-10-16

Release baseline `50717cca` retains the native whole-run result: 129/154
checks passing, 25 failing; 24 covered, 16 partial, 50 not covered, one
disabled and three out of scope. This is local Node/SDK evidence, with
`productionAcceptance=false`. No focused rerun changes that historical total.

The requested `fix/demo-signed-in-edge` is an ancestor of the release line.
The native `decko recovery` session owns full E2E/live verification; Codex owns
integration and these controls. The native inbox accepted command
`fcdfc09f004871334232daeced52d3e0fba164d00b321ee86aa938e9b6300c5b`, and the lead
explicitly acknowledged the split and released its completed-run heavy lock.

## Executed focused browser results

| Journey | Source | Result | Private local report |
|---|---|---|---|
| Member delete | `078523f6` | 6/6 | `.runtime/control-078523f6-member-delete-r2/report.md` |
| JSON navbox, readable target | `863a5ddb` | 7/7 | `.runtime/control-863a5ddb-cql-navbox-r2/report.md` |
| Nest insert/save/fresh render | `74d9148c` | 4/4 | `.runtime/control-74d9148c-E5-r2/report.md` |
| Isolated right-default prefill | `863a5ddb` | 3/4, prefill fails | `.runtime/control-863a5ddb-C14-r1/report.md` |

The member check proves the browser cookie's stored actor and backend
acceptance, requires exactly 403 with a denial message, verifies the same
stored card remains unchanged and performs a fresh read. It uses the current
name after rename. An unknown/wrong actor cannot execute the deletion check.

The JSON control follows Ruby `decko/features/navbox.feature`: visible
`query[keyword]`, JSON and Enter. A verified admin first reads the target;
the positive query then returns exactly that card and the missing-name query
returns none. The earlier member-actor result was 6/7 without an independent
readability prerequisite and remains preserved. It is not a demonstrated CQL
regression. No engine search patch was needed for the passing path.

The nest control creates the RichText parent before its PlainText child,
matches the relative `+target` preview, observes the exact editor form's POST,
checks persistence and requires the nested body on a fresh page.

## Controls corrected and unresolved findings

Fixture creation now resolves canonical type codenames, verifies the form's
type ID and stored type, and never retries silently as Basic. In this deck,
canonical `basic` means RichText3; ordinary `basic39120` is not a cardtype.
Junction identity follows `left_id/right_id` when both name and key are NULL.
Creation waits for the actual POST and observed redirect, and clicks the
real create Submit button instead of a Pointer editor's disabled add button.

Pointer fixtures use Search30 and the migrated `content_options` setting86,
not a newly created ordinary `*options` card. Editor checks open the actual
pencil link, match modal form IDs with stored-ID suffixes and observe matched
saves. C16's captured actual editor still shows a list input despite a stored
checkbox rule. Runtime rule dispatch remains open. C18/E23 need execution
with the corrected form controls. Default prefill remains empty even after
removing the unrelated structured Movie fixture. Neither finding is closed.

Five lightweight actor/type/junction/selection/abort controls and nine module
loader/coverage/fixture-safety controls pass. Syntax and whitespace checks pass.
Earlier failing runs and their raw captures remain available. The first member
attempt failed before browser startup because OpenSSL was absent from PATH;
the retry used existing Git OpenSSL, with no installation.

No runtime implementation, oracle golden, source snapshot or vendor state was
changed by this checkpoint. There is no verified release-completion ETA.

## Subsequent runtime repair: omitted new-form content

On `640fc529`, the isolated C14 browser check passes **4/4**, including cleanup
and the asset audit (`.runtime/new-form-default-C14-fixed-r1/report.md`). This
supersedes the earlier C14 failure only for this focused local path.

The actual typed-new route converted an absent `card[content]` URL argument
to `""`, then passed it as an explicit new-card content value. Ruby
`card/lib/card/content/all.rb#standard_content` uses the default only when
`db_content` is nil. The route now omits the new-card content assignment when
the URL omits it, preserving both explicit empty content and explicit presets.

An actual-handler HTTP regression first failed on the expected default versus
empty content (4.45 seconds). The repaired default/empty/preset control and
existing typed/legacy RichText preset submission test both pass (11.10 seconds
including setup). Form rendering leaves stored tables unchanged. TypeScript
validation passes. Raw logs: `.runtime/new-form-default-red.log`,
`.runtime/new-form-default-green.log`, `.runtime/new-form-default-typecheck.log`.
No source snapshot, oracle golden or vendor state changed. Pointer dispatch
and the other remaining full-run failures still require their own evidence.

## Subsequent runtime repair: Pointer editor rule and Search options

On `a220709f`, the automated existing-Pointer checkbox journey passes **5/5**
(`.runtime/pointer-input-a220709f-C16-r2/report.md`). It checks a real choice,
saves through the modal, verifies stored content and a fresh page, then
unchecks the choice and verifies its removal after another save and read.

The serving path lacked the input-rule preparation that isolated mod tests
explicitly performed. The renderer now seats the winning `input_type` rule
for an existing Pointer/List edit root through the existing authoritative
rule cache before synchronous editor dispatch. A separate options defect
recognized legacy `search` but omitted canonical `search_type`, rendering the
rule's JSON as a literal choice. Both existing option checks now accept the
canonical code as well.

Actual-handler tests failed before each correction and pass afterwards.
They verify the no-rule list fallback, a newly saved checkbox rule, its later
select update, literal List options, canonical Search options and no writes
while rendering the forms. The first focused HTTP/checkbox/select run passed
21 tests; the strengthened canonical-Search HTTP test passed in 14.00 seconds.
TypeScript validation passes. Earlier failures are retained in
`.runtime/pointer-input-rule-red.log`, `.runtime/pointer-search-options-red.log`
and the preceding browser captures; green HTTP logs use matching prefixes.

Whole-run fixture setup now updates an existing input rule between widget
cases rather than ignoring a duplicate create. These C16/C18 diagnostic bodies
operate existing editors; their original capability IDs describe new-card or
structured-card creation, so those capabilities remain uncovered. C18/E23
still need their actual browser selection/change checks on this repair.
No vendor deployment, oracle golden or protected snapshot changed.

## Combined existing-Pointer browser verification

On `425665f1`, `--only cover-b --case C16,C18,E23` passes **7/7** in one
isolated browser and disposable deck
(`.runtime/pointer-workflow-batch-425665f1-r1/report.md`). It proves checkbox
check/save/read, uncheck/save/read, select/save/read, and changing an existing
Pointer from its first choice to the second with stored-content and fresh-page
checks. Reusing the fixture also exercises the input-rule update between
checkbox and select cases. All run-created cards are removed and the owned
stack closes; the asset audit passes.

The bounded case selector now accepts a comma-separated list, avoiding three
cold builds and repeated fixture setup. Selection/abort controls pass. Original
new-card/structured capability coverage stays unchanged: these are existing
editor workflows, with no implicit credit for different creation scenarios.

## Adapter no-op target and complete canonical comparison

The preserved adapter protocol correction is verified on `dfeb9066`. Ruby's
oracle adapter retains the fetched Card object when calling update/delete;
a successful no-op internal return must not replace that identity with null.
The real-adapter control passes in 4.637 seconds. It checks the returned card
identity, no mail, no card/action/change mutations and the existing empty-act
bookkeeping. Engine write semantics are unchanged. TypeScript validation passes.

The complete canonical comparison executes 556 renders and all 115 fresh
scenario sessions / 535 steps against the unchanged Ruby33 reference:

| Kind | Pass | Fail | Reproduced upstream failure |
|---|---:|---:|---:|
| Rendering | 493 | 54 | 9 |
| Persistence | 516 | 19 | 0 |
| Side effects | 445 | 41 | 49 |

There are no semantic operations in this fixture. The grade remains **fail**;
there are no completeness problems or partial selections. Compared with
`50717cca`, no failing IDs are new and only `probe-e30#3` side effects resolve.
Source, fixture database and reference metadata custody checks pass unchanged.
No normalization or declared-divergence rule changed.

Private complete evidence is in the process checkout at
`recovery/release/private-probes/canonical-mod-current-ts-dfeb9066-r1/`,
including `grade.json`, raw results, before/after custody and
`changes-vs-50717cca.json`. The existing content-hash transform cache preserves
real module paths and independent sessions; scenario wall time was 115.931
seconds versus 127.613 in the prior comparison. Aggregate process boot time
still dominates; this does not establish a general performance improvement.

## Seeded member read/search consistency

The ordinary-member diagnostic on `853748ea` retained a **4/5 failure**:
the member could read its actual Person profile at 200 with rendered body,
but JSON navbox search omitted that exact card. Direct fixture inserts left
the profile and account fields' `read_rule_id/read_rule_class` NULL. Normal
creation derives these through the existing `set_read_rule` machinery; CQL
correctly uses the stored rule ID rather than granting a fallback.

The seed helper now derives real metadata for only its newly inserted rows
using the engine's existing `updateReadRule`, before publishing credentials.
It assigns no blanket permission and changes no runtime permission code.
Compiled hash/derivation helpers load after the harness build rather than
being imported from a previous distribution at runner startup. A setup failure
aborts the disposable fixture before the edge stack starts.

On `c5765f58`, the real ordinary-member browser read/search control passes
**5/5**. Its profile uses derived rule **6568**, class **`*all`**, and the
same member's JSON query returns exactly its profile. Maintained P1/P3 browser
boundaries pass **16/16**, including positive/negative controls and warm access
revocation. Reports:

- `.runtime/member-cql-853748ea-r1/report.md` (retained red).
- `.runtime/member-cql-derived-r2/report.md` (member read/search green).
- `.runtime/derived-accounts-permissions-c5765f58-r1/report.md` (16/16).

This is a fixture repair, not proof that untested member journeys or live
account migration are complete. Protected snapshot and vendor state remain
unchanged. The separate native compile-cache trial reproduced the canonical
totals on exact `a4f30704` but was slower over the full fixture, so no default
compile-cache or loader change was adopted.

## Link and image dialog journeys

The combined E6/E8 browser run on `54e87387` passes **5/5** and satisfies
both explicitly mapped capability contracts. Executed bundle SHA-256:
`8ef666001ef5e3cf13ca7eda31547726ec9012293d2882afff2e894997f0fef2`.
Report: `.runtime/editor-dialog-final-54e87387-r7/report.md` and raw/JSON siblings.
Both checks require the stored admin actor and the Apply button bound to the
matching editor; saves are matched to the actual form action.

E6 uses the visible toolbar button and actual link dialog fields. The selected
reference must enter the editor, persist after save and render as the expected
Home link on a fresh page. There is no manually typed-reference fallback.

E8 opens Insert before querying its portal menu, selects the actual `*logo`
through visible Select2 controls, chooses titled/small, applies, saves, checks
the stored snippet, and requires the fresh nested image to decode. The observed
image is card79 at `/files/79/3643-small.jpg` on the configured public CDN.

Two runtime defects were found after correcting the test controls:

1. Stock `/:search.json?view=image_complete` returned HTML content type.
   The single-mark explicit query-view JSON arm now reaches JSON dispatch;
   `v` aliases work too. Existing name-only behavior is preserved. Real HTTP
   positive and missing-image controls first failed on MIME type and now pass.
2. Image completion used the isolate-retained serial renderer. On the pinned
   deck its initial query returned503 after30.049s and2526SQL statements.
   It now uses the existing request-local complete-answer JSON renderer.
   Observed initial lookup:200 at1.302s/90SQL; typed lookup:200 at1.837s/90SQL.
   These are bounded observations, not a distribution benchmark. Snapshot and
   live flags match; configuration hashes include different owned endpoints.

Five JSON typeahead/image/actor/freshness regression tests pass in11.72s,
including byte equality with normal rendering for anonymous/admin/member and
permission/content changes after warmed requests. TypeScript validation passes.
Twelve lightweight loader/selection/abort controls pass.

Earlier test mistakes (toolbar ID assumption, menubar ARIA role, and the Image
modal's shared Apply class) and protocol/time-budget failures remain in the
preceding `.runtime/editor-dialog-*` / `.runtime/editor-image-*` captures.
The controls use actual visible UI; no synthetic picker options, hidden-widget
selection or timeout increase was used. No vendor state or golden was changed.
The original complete507 whole-run score and latest canonical a4f30704 grade
remain historical evidence, not updated totals for this newer checkpoint.

## Owned visible editor contract verification

Frozen source `5e53924c` passes **7/7** in the actual automated Chromium
C14/E5/E23 batch, with three complete scoped capabilities. Evidence:
`.runtime/verified-contracts-5e53924c-r1/report.md` and JSON/raw siblings.
The executed bundle SHA-256 remains
`8ef666001ef5e3cf13ca7eda31547726ec9012293d2882afff2e894997f0fef2`.
C14 reads the exact named/typed form's visible matching editor. Nest uses
visible toolbar and Apply clicks, verifies the opening editor's wire, preserves
original content, then separately verifies insertion and real save/fresh-page
nested rendering. Pointer verifies the stored admin actor and target card ID
before the actual selection-change save. All checks witness admin53041.
Twelve lightweight loader/selection/abort controls also pass. Cleanup removes
all15 journey cards and closes the owned stack; asset audit passes. These are
local SDK-shim results, not vendor deployment acceptance or a revised whole-run
score. C16/C18 new/structured creation remains a separate contract.
