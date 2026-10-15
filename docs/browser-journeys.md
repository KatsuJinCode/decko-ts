# Browser journeys

The journeys in `reference-harness/browser/journeys/synthetic-v1.json` are user
flows written as plain data. Each one runs in a hidden (headless) browser with
a throwaway profile, on a fresh copy of the synthetic deck, once against stock
Ruby Decko (decko 0.20.0, card 1.110.0; the reference) and once against this
port's Node host. The comparison then grades every observation (address, text,
structure, form fields), the mail sent and the row delta in the card tables.
`reference-harness/SPEC.md` section 8 defines the method.

## Last run

- Date: 2026-10-14
- Command: `npm run test:browser-journeys`
- Reference runtime: Ruby 3.4.11
- Journeys: 51
- Completed on Ruby: 51 / 51
- Completed on the port: 51 / 51
- Comparison: 48 / 51 graded journeys pass (0 not graded: a journey that fails on the reference is not graded)

The reference ran on Ruby 3.4.11; the declared oracle runtime is Ruby 3.3
(`docs/parity-method.md`).

These counts predate a change to how both sides answer an unhandled exception,
and are not yet re-measured. In that run the Ruby server used development error
handling, so a keyword search on SQLite (which raises in card's
`AbstractAdapter#match`) answered with Rails' debug-exceptions page, and the
port's host filled a recorded copy of that page. Both sides now run with Decko's
production error handling. The Ruby server sets `rescue_all_in_controller` and
clears `consider_all_requests_local`, as `tools/parity-side-effects/ruby/drive.rb`
does. Stock Decko then shows the search card's `:server_error` view under the
page layout with status 500. The port's host renders the same page through the
engine. The recorded template and the comparison rule written only for it
(N6 at journey grade) have been removed.

What has been re-measured since: on 2026-10-14, `navbox-keyword-search` was
recorded on Ruby with production error handling (`run-journeys.mjs --filter
'^navbox-keyword-search$'`) and on the port, and `compare-journeys.mjs` passes
it on every item. The `navbox-paging` and `search-filtered-anonymous` journeys
were run on the port only. Both answered the same production page, but they
have no fresh Ruby recording yet. The full suite has not been rerun since the
change. The table below is the earlier run, and its three keyword-search rows
describe the old debug page.

Per graded item:

| item | pass | total |
|---|---|---|
| completion | 51 | 51 |
| address | 89 | 89 |
| text | 86 | 89 |
| structure | 89 | 89 |
| fields | 89 | 89 |
| mail | 51 | 51 |
| rows | 51 | 51 |
| editor | 13 | 13 |

## Per journey

| journey | Ruby | port | comparison | items that differ |
|---|---|---|---|---|
| signin-signout-member | completed | completed | pass |  |
| signin-wrong-password | completed | completed | pass |  |
| signin-admin-home | completed | completed | pass |  |
| create-note-member | completed | completed | pass |  |
| create-phrase-admin | completed | completed | pass |  |
| create-duplicate-name-admin | completed | completed | pass |  |
| create-invalid-number-admin | completed | completed | pass |  |
| edit-note-admin | completed | completed | pass |  |
| edit-phrase-save-member | completed | completed | pass |  |
| rename-admin | completed | completed | pass |  |
| rename-topic-with-referers-admin | completed | completed | pass |  |
| delete-admin | completed | completed | pass |  |
| delete-system-card-admin | completed | completed | pass |  |
| new-topic-structured-form | completed | completed | pass |  |
| create-structured-topic-member | completed | completed | pass |  |
| edit-nested-summary-member | completed | completed | pass |  |
| edit-nests-view-admin | completed | completed | pass |  |
| default-content-in-form | completed | completed | pass |  |
| pointer-checkbox-input | completed | completed | pass |  |
| pointer-radio-input | completed | completed | pass |  |
| pointer-multiselect-input | completed | completed | pass |  |
| rule-board-admin | completed | completed | pass |  |
| upload-file-admin | completed | completed | pass |  |
| upload-remove-preview-admin | completed | completed | pass |  |
| upload-image-admin | completed | completed | pass |  |
| upload-replace-file-admin | completed | completed | pass |  |
| upload-empty-file-refused | completed | completed | pass |  |
| upload-file-member | completed | completed | pass |  |
| navbox-keyword-search | completed | completed | fail | text:search results |
| navbox-paging | completed | completed | fail | text:first page |
| navbox-cql-member | completed | completed | pass |  |
| search-filtered-anonymous | completed | completed | fail | text:anonymous results |
| search-card-pages | completed | completed | pass |  |
| denied-anonymous-read | completed | completed | pass |  |
| denied-anonymous-create | completed | completed | pass |  |
| denied-anonymous-edit | completed | completed | pass |  |
| denied-member-read | completed | completed | pass |  |
| denied-member-create | completed | completed | pass |  |
| denied-member-edit | completed | completed | pass |  |
| denied-member-delete | completed | completed | pass |  |
| follow-from-board-admin | completed | completed | pass |  |
| unfollow-from-board-member | completed | completed | pass |  |
| unfollow-from-mail | completed | completed | pass |  |
| account-settings-member | completed | completed | pass |  |
| account-change-password-member | completed | completed | pass |  |
| account-change-email-member | completed | completed | pass |  |
| signup-anonymous | completed | completed | pass |  |
| reset-password-request | completed | completed | pass |  |
| edit-conflict | completed | completed | pass |  |
| history-view-admin | completed | completed | pass |  |
| read-pages-anonymous | completed | completed | pass |  |

## Reproducing

Needs Ruby with the oracle app's gems installed (`reference-harness/oracle/app`;
point bundler at them with `BUNDLE_PATH` if they are not in the default gem
path), Node 22.5 or later, and an installed Chrome, Edge or Chromium
(`HARNESS_CHROME` names one explicitly). Nothing is downloaded and no window
opens. Per-journey results, server logs and `report.json` land in
`tmp/browser-journeys/`.
