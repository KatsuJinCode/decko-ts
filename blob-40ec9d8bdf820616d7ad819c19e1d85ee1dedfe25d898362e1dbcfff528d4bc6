# mx-B-044: the account card's board has an Account tab

The roster row `mx-B-044-7b-further-signed-in-capabilit` (family [Family])
reads "the account card's board has an Account tab", verdict PASS, bucket
DONE, with the evidence basis "verified - every instrument entry for B-044
is pass (live-acceptance-lane+whole-harness)". This receipt is the family's
own adjudication of that row: the instrument the registry's own ledger
records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

A person's own card is a board with several tabs on it. The account tab is
the one that holds the account's own settings, so it has to be there, it has
to be named, and it has to be reachable by clicking it.

## The instrument

The account-settings journey reads the board's tab bar first
(tools/edge-signed-in-exercise.mjs:671-678): it visits the account card's
board, collects the board's links and role tabs (:673), and looks for the
one whose text matches "account" (:674). If there is none the row is
recorded FAIL with the whole tab list as evidence (:676); if there is one,
the row is recorded PASS with that tab's text and href (:678). The journey
then activates the tab the way a person does (:682: it clicks the board's
nav-tab whose text is exactly "Account"), which is what the later rows in
this group read.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the account card's
board has an Account tab", id ACT-044, check_ids ["B-044"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE BOARD TAB BAR IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The repository's committed capture of a real Ruby deck's rendered
views (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:130:board@set/all/editing.rb`. Its bytes are the
board's own tab bar, with the account tab among the six:

    <ul class='nav nav-tabs' role='tablist'>
    <li role="presentation" class="nav-item tab-li-account"><a
    data-url="/Decko_Bot/account_tab" class="load nav-link" role="tab"
    data-bs-toggle="tab" data-tab-name="Account"
    href="#tab-decko_bot-2-account">Account</a></li>
    <li role="presentation" class="nav-item tab-li-guide">...
    <li role="presentation" class="nav-item tab-li-engage">...
    <li role="presentation" class="nav-item tab-li-history">...
    <li role="presentation" class="nav-item tab-li-related">...
    <li role="presentation" class="nav-item tab-li-rule">...

THE TAB'S OWN CONTENT IS RUBY'S OWN TOO, and the repository carries it twice
over. First, the committed capture arm
`probe-view:11:account_tab@set/abstract/account_holder.rb`, whose bytes are
the account tab's own pill list, the "Settings" section with the email and
password pill the journey opens next:

    <ul class="nav nav-pills _auto-single-select board-pills flex-column">
    <h6 class="ms-1 mt-3">Settings</h6><li class="nav-item"><a
    data-slot-selector="..." data-slotter-mode="override"
    class="slotter nav-link known-card" data-bs-toggle="pill"
    data-breadcrumb="Account" data-breadcrumb-class="account"
    data-cy="email_and_password-pill"
    href="/Decko_Bot+*account/content?layout=overlay&amp;...">Email and Password</a></li>
    ...

followed by the Roles, Notifications, API, Close Account, Created and Edited
pills, and the "Content" section heading. Second, the static-Ruby oracle
line the port's own account surface is replayed against: the committed
`account_tab_sections` oracle line in
fixtures/oracle-surfaces/card-mod-account.harness.jsonl (3,615 bytes, the
same pill list rendered for the oracle's own card name) is read by
tests/card/mod-loader/card-mod-account-harness-probe.test.ts:192-196, which
asserts that the port's `accountProbeSurface.accountTabHtml("Joe User")`
equals the oracle's bytes exactly. That test is the reason the port's pill
sections cannot drift from Ruby's without the battery going red.

The port renders the same thing. The board's tab set is the frozen constant
at src/card/mod-loader/mods/card-mod-edit.ts:3090-3100, whose first entry is
`["Account", "account_tab"]`, and the tab anchors are built at
src/card/mod-loader/mods/card-mod-edit.ts:3366-3383, byte for byte the shape
Ruby captured: the `li` with `role="presentation"` and
`class="nav-item tab-li-account"`, then the anchor with `data-url`, the
class, `role="tab"`, `data-bs-toggle="tab"`, `data-tab-name="Account"` and
the `href="#tab-<card>-<n>-account"`. The tab's own content is the port's
account tab view, src/card/mod-loader/mods/card-mod-account.ts:981-1000
(`accountTabHtml` / `accountTabView`), which builds the same pill list, and
the pill anchor itself is
src/card/mod-loader/mods/card-mod-account.ts:925-967.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The board's tab
bar, its tab titles, the account tab's own name, its href shape, its
`data-tab-name` attribute and the account tab's pill list, including the
`data-cy="email_and_password-pill"` key, are Ruby's own, and the port
renders each of them. The number in the tab id (`tab-<card>-<n>-account`)
is a per-render counter on both sides, so it is a shape, not a fixed byte;
the port's own comment says so where it builds the id
(src/card/mod-loader/mods/card-mod-edit.ts:3362-3365). The check's own
predicate (a board link whose text matches "account") is the harness's own
instrument.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"accountTab":{"text":"Account","href":"#tab-harness_admin-9-account"},"actor":"Harness Admin"}

The board carried a tab named "Account" and the journey activated it. The
run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode. The same row is graded twice in that run, once for each of the
run's two throwaway accounts, and both are PASS.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
