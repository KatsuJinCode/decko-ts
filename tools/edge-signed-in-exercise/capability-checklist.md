# Signed-in capability checklist for the Bunny edge exercise

The source of truth is `tools/edge-signed-in-exercise/capabilities.json`, which the harness
reads to print coverage in its run record. This document explains where the list came from and
what each row means.

## Where the list came from

Decko's own automated browser tests. Two suites ship in the Decko source
(`C:/localProjects/decko-ruby-reference/decko`, the reference checkout this repo builds its
Ruby oracle from; `git rev-parse --short HEAD` there is the upstream commit under test):

- **Cucumber features** under `features/` with step definitions in `features/step_definitions/`.
  10 feature files, 24 active scenarios (`history.feature` is entirely commented out upstream).
- **Cypress e2e specs** under `spec/cypress/e2e/`, in CoffeeScript, 43 `it`/`specify` blocks
  across 16 spec files (plus `spec/cypress/app_commands/`, the Rails-side helpers).

The gems installed under `decko-ruby-oracle-gems/ruby/3.4.0/gems/` ship **no** spec or feature
directories, so the checklist is taken from the source checkout, not the gems. That is why the
cypress.json generator template under `card-1.110.0/lib/generators/deck/templates/` is only
evidence that the suite exists, not a copy of it.

I also read this repo's own `reference-harness/browser/journeys/synthetic-v1.json` (51
recorded journeys, graded against Ruby on every run) and folded its capabilities in. Where a
capability appears in both sources, both are cited.

## What the counts mean

94 capabilities, each marked `covered`, `partial`, `not_covered`, `disabled_upstream`, or
`out_of_scope`. Every capability a signed-in user has is listed, whether or not the harness
drives it yet, so the gap is visible rather than absent.

## Historical findings from the initial exercise

These describe the initial source, not current acceptance. Later integration changed
several paths. Keep each failed capture and rerun its actual browser behavior against
the exact candidate before claiming that a repair passed.

1. **Navbar signout requires a behavioral check.** The integrated handler maps the
   stock `/delete/*signin` link to signout. The former assertion rejecting that URL
   was invalid. The exercise now clicks the actual link, checks anonymous landing,
   cookie clearing, rejection of the old session and unchanged card rows.
2. **No reset-password or sign-up links on the signed-out `/*signin` page.** Ruby's
   `core.haml` renders `.reset-password-link` and `.signup-button` beside the sign-in button;
   the port's `signin-core-form-view.ts` renders the same markup, but on the edge the signed-out
   page ships **no `<a>` elements at all**, so neither link is reachable. (Confirmed on a
   fresh, signed-out context.)
3. **`/new/File` has no file input.** The signed-in new-card form
   (`bunny-edge-new-card-form.ts`, `signedInNewCardFormBodyHtml`) renders a date input for Date
   and a TinyMCE textarea otherwise, with no `type="file"` branch, so uploads cannot start from
   the create form. Ruby's new view is structure-driven and does render one. This is the same
   generic-form gap the project already logged in
   `.claude/issues/2026-10-15-signed-in-new-card-form-parity.md`.
4. **URL presets are ignored on `/new/<Type>`.** The same generator hardcodes an empty name and
   empty content, so `/new/RichText?card[name]=X&card[content]=Y` creates a blank card instead of
   the preset one. Decko's Cypress `create/presetting` suite drives exactly this.
5. **The account board has no Account tab.** The signed-in account card's `/board` renders the
   content editor and the name row but no Account tab, so a signed-in user cannot change their
   email or password from the edge. Cypress `edit/board/account_tab` drives that on Ruby.

## Capabilities the harness drives today

Signed-out sign-in page, wrong-password refusal, empty-password refusal, sign-in persistence,
navbar chrome, styling and console cleanliness, Date card edit and restore, TinyMCE load, nest
button and dialog, name-match suggestions, RichText save, all seven create routes, duplicate-name
refusal, rename through the board's name row, history, Changes search, CQL and keyword search,
delete (admin and member refusal), no `delete…` card, sign out and back in, the board's tabs and
Engage follow controls, server-time flags, and cleanup.

## Not browser-checkable on this harness

Follower notifications, unfollow-from-mail, and password reset by mailed link all need a
received email. The local harness runs no SMTP sink, so those five capabilities are marked
`out_of_scope` rather than passed. `history.feature` is marked `disabled_upstream` because it is
commented out in Decko's own tree.
