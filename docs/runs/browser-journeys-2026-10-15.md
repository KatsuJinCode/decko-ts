# Browser journeys run record

- Date: 2026-10-15
- Commit: 58d21f58 (branch deliver/browser-journeys-51, pushed to origin/decko-ts)
- Base: origin/integration-2026-10-08 (535763df)
- Command: `npm run test:browser-journeys -- --shards 2` (Ruby 2 shards, port 1 shard; memory tight)
- Reference runtime: Ruby 3.4.11, stock Ruby Decko (decko 0.20.0, card 1.110.0)
- Journeys: 51. Completed on Ruby: 51 / 51. Completed on the port: 51 / 51.
- Conformant: 51 of 51 — 50 identical to Ruby, 1 deliberately safer per docs/SECURITY.md divergence 4 (signin-wrong-password).
- Default run (uniform sign-in answer on, the shipped setting): 50 / 51 graded journeys pass; the one difference is the declared text item.
- Flags-off run of signin-wrong-password (DECKO_SIGNIN_UNIFORM_FAILURE=off, same commit): passes every item against the same Ruby recording (tmp/flagsoff3/).
- Reruns: edit-note-admin and navbox-cql-member failed once on the reference side (Ruby page.goto timeout under load, memory tight) and passed on a standalone re-run; both recordings are the re-runs.
- Raw results: tmp/final-run3/ (not committed).

## Per graded item (default run)

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
| signin-signout-member | completed | completed | identical |  |
| signin-wrong-password | completed | completed | declared | text:refused sign-in (uniform answer, SECURITY.md divergence 4) |
| signin-admin-home | completed | completed | identical |  |
| create-note-member | completed | completed | identical |  |
| create-phrase-admin | completed | completed | identical |  |
| create-duplicate-name-admin | completed | completed | identical |  |
| create-invalid-number-admin | completed | completed | identical |  |
| edit-note-admin | completed | completed | identical |  |
| edit-phrase-save-member | completed | completed | identical |  |
| rename-admin | completed | completed | identical |  |
| rename-topic-with-referers-admin | completed | completed | identical |  |
| delete-admin | completed | completed | identical |  |
| delete-system-card-admin | completed | completed | identical |  |
| new-topic-structured-form | completed | completed | identical |  |
| create-structured-topic-member | completed | completed | identical |  |
| edit-nested-summary-member | completed | completed | identical |  |
| edit-nests-view-admin | completed | completed | identical |  |
| default-content-in-form | completed | completed | identical |  |
| pointer-checkbox-input | completed | completed | identical |  |
| pointer-radio-input | completed | completed | identical |  |
| pointer-multiselect-input | completed | completed | identical |  |
| rule-board-admin | completed | completed | identical |  |
| upload-file-admin | completed | completed | identical |  |
| upload-remove-preview-admin | completed | completed | identical |  |
| upload-image-admin | completed | completed | identical |  |
| upload-replace-file-admin | completed | completed | identical |  |
| upload-empty-file-refused | completed | completed | identical |  |
| upload-file-member | completed | completed | identical |  |
| navbox-keyword-search | completed | completed | identical |  |
| navbox-paging | completed | completed | identical |  |
| navbox-cql-member | completed | completed | identical |  |
| search-filtered-anonymous | completed | completed | identical |  |
| search-card-pages | completed | completed | identical |  |
| denied-anonymous-read | completed | completed | identical |  |
| denied-anonymous-create | completed | completed | identical |  |
| denied-anonymous-edit | completed | completed | identical |  |
| denied-member-read | completed | completed | identical |  |
| denied-member-create | completed | completed | identical |  |
| denied-member-edit | completed | completed | identical |  |
| denied-member-delete | completed | completed | identical |  |
| follow-from-board-admin | completed | completed | identical |  |
| unfollow-from-board-member | completed | completed | identical |  |
| unfollow-from-mail | completed | completed | identical |  |
| account-settings-member | completed | completed | identical |  |
| account-change-password-member | completed | completed | identical |  |
| account-change-email-member | completed | completed | identical |  |
| signup-anonymous | completed | completed | identical |  |
| reset-password-request | completed | completed | identical |  |
| edit-conflict | completed | completed | identical |  |
| history-view-admin | completed | completed | identical |  |
| read-pages-anonymous | completed | completed | identical |  |

