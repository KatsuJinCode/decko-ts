# Browser journeys

The journeys in `reference-harness/browser/journeys/synthetic-v1.json` are user
flows written as plain data. Each one runs in a hidden (headless) browser with
a throwaway profile, on a fresh copy of the synthetic deck, once against stock
Ruby Decko (decko 0.20.0, card 1.110.0; the reference) and once against this
port's Node host. The comparison then grades every observation (address, text,
structure, form fields), the mail sent and the row delta in the card tables.
`reference-harness/SPEC.md` section 8 defines the method.

## Last run

Conformance: 51 of 51 conformant. 50 identical to Ruby; 1 deliberately safer per docs/SECURITY.md divergence 4 (`signin-wrong-password`, the uniform sign-in answer). That journey matches Ruby on every item with `DECKO_SIGNIN_UNIFORM_FAILURE=off`. The default run counts 50 / 51 graded journeys passing; the one difference is the declared text item. The run record is docs/runs/browser-journeys-2026-10-15.md (commit 58d21f58).

- Date: 2026-10-15
- Commit: 58d21f58
- Command: `npm run test:browser-journeys -- --shards 2` (Ruby 2 shards, port 1 shard; memory tight)
- Reference runtime: Ruby 3.4.11
- Journeys: 51
- Completed on Ruby: 51 / 51
- Completed on the port: 51 / 51
- Comparison (default run, uniform sign-in answer on): 50 / 51 graded journeys pass (0 not graded). Flags-off check of the one declared difference: 1 / 1 pass.

Error pages: both sides answer an unhandled exception the way a deployed
site does. The Ruby server runs with Decko's production error handling
(`rescue_all_in_controller` on, `consider_all_requests_local` off, as
`tools/parity-side-effects/ruby/drive.rb` sets them), so a plain keyword
search on SQLite (the `match` raise in card's ActiveRecord patch) answers
Decko's `:server_error` view under the page layout, status 500. The port's
Node host renders that page through the engine with `:server_error` as the
root view. No recorded page is copied and no comparison rule applies to it.

Per graded item:

| item | pass | total |
|---|---|---|
| completion | 51 | 51 |
| address | 89 | 89 |
| text | 88 | 89 |
| structure | 89 | 89 |
| fields | 89 | 89 |
| mail | 51 | 51 |
| rows | 51 | 51 |
| editor | 13 | 13 |

## Per journey

| journey | Ruby | port | comparison | items that differ |
|---|---|---|---|---|
| signin-signout-member | completed | completed | pass |  |
| signin-wrong-password | completed | completed | fail | text:refused sign-in |
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
| navbox-keyword-search | completed | completed | pass |  |
| navbox-paging | completed | completed | pass |  |
| navbox-cql-member | completed | completed | pass |  |
| search-filtered-anonymous | completed | completed | pass |  |
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

## Declared divergence (reported apart from the matches)

`signin-wrong-password` differs in one text item: a wrong password is answered "Wrong email or password." by the port and "Wrong password" by Ruby. The port gives the uniform answer on purpose, as docs/SECURITY.md divergence 4 (sign-in: uniform in its answers) records.

Proof that this is the only difference: the same journey on the port with DECKO_SIGNIN_UNIFORM_FAILURE=off passes every item (completion, address, text, structure, fields) against the same Ruby recording from this run (run-journeys.mjs with the ts engine, the filter ^signin-wrong-password$, then compare-journeys.mjs reporting 1 / 1 pass). The default run leaves the flag on, so the journey stays failing there by design.

## Reproducing

Needs Ruby with the oracle app's gems installed (`reference-harness/oracle/app`;
point bundler at them with `BUNDLE_PATH` if they are not in the default gem
path), Node 22.5 or later, and an installed Chrome, Edge or Chromium
(`HARNESS_CHROME` names one explicitly). Nothing is downloaded and no window
opens. Per-journey results, server logs and `report.json` land in
`tmp/browser-journeys/`.
