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
