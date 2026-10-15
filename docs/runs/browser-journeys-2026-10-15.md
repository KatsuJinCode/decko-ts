# Browser journeys run record

- Date: 2026-10-15
- Command: `npm run test:browser-journeys -- --shards 2`
- Branch: `deliver/browser-journeys-51` (pushed to `origin/decko-ts`), at 274da96e
- Base: `origin/integration-2026-10-08` (535763df)
- Reference runtime: Ruby 3.4.11, stock Ruby Decko (decko 0.20.0, card 1.110.0)
- Port host: the port's Node host, `vm-staging-server.mjs` with the browser-journey engine (ts-server.mjs)
- Journeys: 51; completed on Ruby 51 / 51; completed on the port 51 / 51
- Comparison: 50 / 51 graded journeys pass (0 not graded)
- Declared divergence present in this run: `signin-wrong-password` (the port's uniform sign-in answer, docs/SECURITY.md divergence 4; with `DECKO_SIGNIN_UNIFORM_FAILURE=off` the same journey passes on every item against the same Ruby recording)
- Raw results: `tmp/final-run/ruby/<journey>.json`, `tmp/final-run/ts/<journey>.json`, `tmp/final-run/report.json` (rebuildable; not committed)

## Per graded item

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

