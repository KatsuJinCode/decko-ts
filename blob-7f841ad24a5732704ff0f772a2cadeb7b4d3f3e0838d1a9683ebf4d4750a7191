# Browser journeys

Historical parity evidence only: the recorded run used commit58d21f58, Ruby3.4.11 and the Node host's legacy-SHA1/asset-refresh-never profile. It does not establish current candidate, Ruby3.3, production-password/assets, edge-host or live-site acceptance. The old comparator lacked completeness/provenance/nonzero-failure controls; its counts require revalidation. Current comparisons fail closed on missing/extra/duplicate results, definition/fixture/source/build identity, step/observation completeness and HTTP500 user failures.

The journeys in `reference-harness/browser/journeys/synthetic-v1.json` are user
flows written as plain data. Each one runs in a hidden (headless) browser with
a throwaway profile, on a fresh copy of the synthetic deck, once against stock
Ruby Decko (decko 0.20.0, card 1.110.0; the reference) and once against this
port's Node host. The comparison then grades every observation (address, text,
structure, form fields), the mail sent and the row delta in the card tables.
`reference-harness/SPEC.md` section 8 defines the method.

## Current acceptance status

The complete current candidate and deployed site are not yet accepted. A fresh
production Node run completed all six supplemental journeys: email change,
password change, full reset-token/password/login, administrator-approved signup
activation, Date editing, and initialized rich-text editing. These include
reload, fresh authentication and server-restart assertions. They are local Node
evidence, not six-case Ruby or hosted edge conformance. Three local Bunny-handler
diagnostics also completed signin/signout, note creation and edit/reload; the
full Bunny browser suite remains outstanding. Its local providers do not prove
the deployed Bunny runtime or external mail delivery.

The current Ruby 3.3 full reference capture is unfinished. Its network audit
already records the stock external Font Awesome kit returning HTTP403; required
asset failures remain acceptance failures even when journey steps complete.
Current keyword search uses adapter-aware execution rather than deliberately
reproducing the stock Ruby SQLite exception. Equal HTTP500 pages are failures.

## Historical reported counts

The old report labelled 51 of 51 conformant: 50 identical to Ruby and one
declared sign-in text difference. Those historical figures were produced by the
older profiles and comparator described above; they are not current acceptance.
Its run record is docs/runs/browser-journeys-2026-10-15.md (commit 58d21f58).

- Date: 2026-10-15
- Commit: 58d21f58
- Command: `npm run test:browser-journeys -- --shards 2` (Ruby 2 shards, port 1 shard; memory tight)
- Reference runtime: Ruby 3.4.11
- Journeys: 51
- Completed on Ruby: 51 / 51
- Completed on the port: 51 / 51
- Comparison (default run, uniform sign-in answer on): 50 / 51 graded journeys pass (0 not graded). Flags-off check of the one declared difference: 1 / 1 pass.

Historical error pages: both sides answered an unhandled exception the way a deployed
site does. The Ruby server runs with Decko's production error handling
(`rescue_all_in_controller` on, `consider_all_requests_local` off, as
`tools/parity-side-effects/ruby/drive.rb` sets them), so a plain keyword
search on SQLite (the `match` raise in card's ActiveRecord patch) answers
Decko's `:server_error` view under the page layout, status 500. The port's
Node host rendered that page through the engine with `:server_error` as the
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

The historical flags-off check reported 1/1 against that same old recording.
It does not establish that this is the only current difference or that the
complete activation, reset and persistence journeys worked. Production retains
the uniform sign-in failure answer.

## Reproducing

Needs Ruby with the oracle app's gems installed (`reference-harness/oracle/app`;
point bundler at them with `BUNDLE_PATH` if they are not in the default gem
path), Node 22.5 or later, and an installed Chrome, Edge or Chromium
(`HARNESS_CHROME` names one explicitly). Nothing is downloaded and no window
opens. Per-journey results, server logs and `report.json` land in
`tmp/browser-journeys/`.
