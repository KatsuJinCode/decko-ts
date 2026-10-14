# card-mod compatibility report — decko-ts

Generated: 2026-10-14T23:28:43.524Z
Gem dir:   $GEM_HOME
Repo:      REPO_ROOT

## Summary

Mods scanned: **33**

- declared-complete:  **29**
- partial: **2**
- missing: **0**
- ignored: **2** (not ported, so not evaluated)

**What these labels measure: declarations only.** "declared-complete" is a THRESHOLD, not a statement that every view is present. The generator calls a mod declared-complete when EITHER (a) at least 50% of the mod-specific html view names it declares exist in the implemented surface, AND at least 50% of the set patterns it uses are implemented, AND it has pattern-backed set modules; OR (b) it has a registered manifest plus a byte-pinned test file with 5 or more `toBe(<literal>)` pins. A mod can therefore hold the label with view names still missing — read the `covered/total` column per mod to see which. It does NOT measure executable behavior: no event hook is exercised, no non-html format (json, css, email, rss, csv) is rendered, and every view beyond the handful the byte-pins render is unproven against Ruby's output. The threshold is decision 0004's rubric, unchanged; where a figure from this report is quoted, the covered/total it rests on is quoted with it. Where the evidence for what IS byte-proven lives: `docs/coverage-inventory.md`.

## Behavioural verdict

Behaviour-complete: **18** of 31 evaluated mods. Seed-only, evaluated by seed comparison: `card-mod-defaults-0.20.0`. Not evaluated: `card-mod-delayed_job-0.20.0`.

A mod is **behaviour-complete** only when every view it declares (any format) is either rendered by a graded fixture operation with every such operation byte-identical to Ruby's captured answer, or named in a string literal by one of its own byte-pinned test files; and every event it declares is named in a string literal by some test file. Attribution is by view name and set membership (see `tools/compat-report/behaviour.mjs`): a graded operation credits a declaration only when its card belongs to the declaring file's set; all/, lib/ and abstract/ declarations apply by name alone. Withheld operations are credited when the withheld set is present at grading. Fixture operations are all html; views declared in other formats can only be credited by tests.

Grades this verdict rests on (`tools/compat-report/graded-ops.json`):

- `synthetic-v1`: verdict pass, 1754/1754 rendering ops identical; engine commit deb0be4faa78ff7166b3400b297bd89941f3f4bb, graded 2026-10-14T20:37:06.231Z
- `synthetic-v2`: verdict fail, 2520/2581 rendering ops identical; engine commit deb0be4faa78ff7166b3400b297bd89941f3f4bb, graded 2026-10-14T20:36:37.187Z
- `synthetic-v2 + extra-ops`: verdict fail, 13/21 rendering ops identical; engine commit 46da63b305726e4e463a7e8f1a5d6b080e9ac711, graded 2026-10-14T21:43:53.753Z

| mod | behaviour | views | graded identical | graded differs | test-pinned | unexercised views | events | events named by a test | unexercised events |
|-----|-----------|------:|-----------------:|---------------:|------------:|------------------:|-------:|-----------------------:|-------------------:|
| `card-mod-account-0.20.0` | behaviour-incomplete | 30 | 9 | 9 | 9 | 3 | 33 | 33 | 0 |
| `card-mod-ace_editor-0.20.0` | behaviour-complete | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-api_key-0.20.0` | behaviour-complete | 10 | 6 | 0 | 4 | 0 | 2 | 2 | 0 |
| `card-mod-assets-0.20.0` | behaviour-incomplete | 8 | 3 | 1 | 2 | 2 | 5 | 5 | 0 |
| `card-mod-bar_and_box-0.20.0` | behaviour-complete | 21 | 19 | 0 | 2 | 0 | 0 | 0 | 0 |
| `card-mod-bootstrap-0.20.0` | behaviour-incomplete | 14 | 5 | 1 | 7 | 1 | 6 | 6 | 0 |
| `card-mod-carrierwave-0.20.0` | behaviour-incomplete | 25 | 9 | 3 | 9 | 4 | 24 | 19 | 5 |
| `card-mod-collection-0.20.0` | behaviour-incomplete | 5 | 0 | 3 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-comment-0.20.0` | behaviour-complete | 7 | 2 | 0 | 5 | 0 | 1 | 1 | 0 |
| `card-mod-content-0.20.0` | behaviour-complete | 9 | 7 | 0 | 2 | 0 | 3 | 3 | 0 |
| `card-mod-date-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-defaults-0.20.0` | seed only (see below) | | | | | | | | |
| `card-mod-delayed_job-0.20.0` | not evaluated | | | | | | | | |
| `card-mod-edit-0.20.0` | behaviour-incomplete | 43 | 41 | 2 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-email-0.20.0` | behaviour-complete | 11 | 3 | 0 | 8 | 0 | 0 | 0 | 0 |
| `card-mod-follow-0.20.0` | behaviour-incomplete | 24 | 15 | 0 | 7 | 2 | 10 | 3 | 7 |
| `card-mod-format-0.20.0` | behaviour-incomplete | 154 | 89 | 5 | 34 | 26 | 2 | 0 | 2 |
| `card-mod-help-0.20.0` | behaviour-complete | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-history-0.20.0` | behaviour-complete | 14 | 12 | 0 | 2 | 0 | 6 | 6 | 0 |
| `card-mod-integrate-0.20.0` | behaviour-complete | 0 | 0 | 0 | 0 | 0 | 4 | 4 | 0 |
| `card-mod-layout-0.20.0` | behaviour-complete | 32 | 17 | 0 | 15 | 0 | 3 | 3 | 0 |
| `card-mod-list-0.20.0` | behaviour-incomplete | 22 | 12 | 0 | 5 | 5 | 5 | 5 | 0 |
| `card-mod-markdown-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-permissions-0.20.0` | behaviour-complete | 4 | 4 | 0 | 0 | 0 | 7 | 7 | 0 |
| `card-mod-recaptcha-0.20.0` | behaviour-complete | 1 | 0 | 0 | 1 | 0 | 3 | 3 | 0 |
| `card-mod-rules-0.20.0` | behaviour-incomplete | 41 | 24 | 3 | 9 | 5 | 1 | 1 | 0 |
| `card-mod-script-0.20.0` | behaviour-incomplete | 13 | 8 | 0 | 4 | 1 | 2 | 2 | 0 |
| `card-mod-search-0.20.0` | behaviour-incomplete | 32 | 14 | 5 | 2 | 11 | 0 | 0 | 0 |
| `card-mod-session-0.20.0` | behaviour-complete | 0 | 0 | 0 | 0 | 0 | 4 | 4 | 0 |
| `card-mod-style-0.20.0` | behaviour-incomplete | 19 | 8 | 0 | 10 | 1 | 3 | 3 | 0 |
| `card-mod-tabs-0.20.0` | behaviour-complete | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-tinymce_editor-0.20.0` | behaviour-complete | 11 | 9 | 0 | 2 | 0 | 0 | 0 | 0 |
| `card-mod-virtual-0.20.0` | behaviour-complete | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 0 |

### card-mod-defaults-0.20.0: seed comparison

The gem declares no views and no events; it contributes seed data. Its seeded-deck dump (`data/fixtures/real/cards.yml`, 604 live cards) is compared card by card, by key, with the `synthetic-v2` fixture deck that Ruby built, and with the port's own `db/seed.sql`.

- present in synthetic-v2: 604/604; missing: (none)
- codename differs: (none)
- type differs: email_stylesheet
- db_content differs (7): administrator+*member, password_reset_email+*text_message, password_reset_email+*html_message, *all+*script+*asset_output, *all+*style+*asset_output, follower_notification_email+*html_message, *recent_setting. A deck's content diverges from its seed as the deck is used (membership, recent settings, compiled asset outputs), so these are listed, not judged.
- the port's fresh-deck seed (`src/card/auth/boot-seed.ts`, bootstrapFreshDeck: the core fixture plus the account-system cards): 38 cards, 38 of them in this seed. **566 of this gem's 604 seed cards are not created by the port's own seed**: a deck the port provisions itself lacks them, and every fixture deck graded here has them only because Ruby built it (reference-harness/oracle/build-deck.rb).
- the port's demo seed (`db/seed.sql`): 3 cards, 1 of them in this seed.

### Unexercised and differing declarations, per mod

#### card-mod-account-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-account-events.test.ts`, `tests/card/mod-loader/card-mod-account-fields.test.ts`, `tests/card/mod-loader/card-mod-account-forms.test.ts`, `tests/card/mod-loader/card-mod-account-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-account.test.ts`
- views graded identical: base:token_expiry [set/right/account/views.rb] (1 ops), html:account_tab [set/abstract/account_holder.rb] (1 ops), html:closed_account [set/abstract/account_holder.rb] (1 ops), html:configs [set/type/role.rb] (1 ops), html:core [set/self/signin.rb] (2 ops), html:link_with_checkbox [set/type/role.rb] (1 ops), html:reset_password_success [set/self/signin.rb] (1 ops), html:title [set/self/signin.rb] (2 ops), html:token_expiry [set/right/account/views.rb] (1 ops)
- views graded but differing: base:closure [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:closure, base:reset_password_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:reset_password_days, base:reset_password_url [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:reset_password_url, base:token_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:token_days, base:verify_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:verify_days, base:verify_url [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:verify_url, html:edit [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:edit; synthetic-v2 + extra-ops#view:anonymous:*signin:edit, html:open [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:open; synthetic-v2 + extra-ops#view:anonymous:*signin:open, html:setup [set/type/user.rb] differs at synthetic-v2#view:admin:Quinn Contractor:setup
- views test-pinned only: base:raw [set/right/password.rb], base:raw [set/right/salt.rb], base:raw [set/type_plus_right/user/email.rb], html:core [set/right/account/views.rb], html:core [set/right/password.rb], html:core [set/type/signup/views.rb], html:edit_buttons [set/self/signin.rb], html:one_line_content [set/self/signin.rb], html:open_content [set/self/signin.rb]
- views unexercised: html:content_formgroups [set/type/signup/views.rb], html:new_buttons [set/type/signup/views.rb], html:new [set/type/signup/views.rb]
- events unexercised: (none)

#### card-mod-ace_editor-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-ace-editor-input.test.ts`, `tests/card/mod-loader/card-mod-ace_editor.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-api_key-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-api_key.test.ts`
- views graded identical: html:api_key [set/right/account.rb] (1 ops), html:buttons [set/right/api_key.rb] (1 ops), html:core [set/right/api_key.rb] (2 ops), html:current [set/right/api_key.rb] (1 ops), html:generate_button [set/right/api_key.rb] (1 ops), html:token_link [set/right/api_key.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:content [set/right/api_key.rb], html:titled_content [set/right/api_key.rb], html:titled [set/right/api_key.rb], json:token [set/right/api_key.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-assets-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-assets.test.ts`
- views graded identical: html:core [set/abstract/01_manifest_group.rb] (1417 ops), html:core [set/abstract/mod_assets.rb] (1417 ops), html:javascript_include_tag [set/abstract/asset_file.rb] (1 ops)
- views graded but differing: base:asset_output_url [set/abstract/asset_outputter.rb] differs at synthetic-v2#view:admin:*all+*script:asset_output_url
- views test-pinned only: html:javascript_include_tag [set/right/group_remote.rb], html:stylesheet_include_tag [set/right/group_remote.rb]
- views unexercised: base:not_found [set/right/asset_output.rb], html:core [set/right/group_remote.rb]
- events unexercised: (none)

#### card-mod-bar_and_box-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-bar-and-box-views.test.ts`
- views graded identical: base:box_bottom [set/all/box.rb] (1 ops), base:box_middle [set/all/box.rb] (1 ops), base:box_top [set/all/box.rb] (1 ops), base:box [set/all/box.rb] (1 ops), html:accordion_bar [set/all/bar.rb] (1 ops), html:bar_body [set/all/bar.rb] (1 ops), html:bar_bottom [set/all/bar.rb] (1 ops), html:bar_left [set/all/bar.rb] (1 ops), html:bar_menu [set/all/bar.rb] (1 ops), html:bar_middle [set/all/bar.rb] (1 ops), html:bar_right [set/all/bar.rb] (1 ops), html:bar [set/all/bar.rb] (2 ops), html:closed_bar [set/all/bar.rb] (1 ops), html:closed [set/all/bar.rb] (1 ops), html:expanded_bar [set/all/bar.rb] (1 ops), html:full_bar [set/all/bar.rb] (1 ops), html:mini_bar [set/all/bar.rb] (1 ops), html:open_bar [set/all/bar.rb] (1 ops), html:open [set/all/bar.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:boxed_link [set/type/image.rb], html:boxed [set/type/image.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-bootstrap-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-bootstrap-customized-name-existence.test.ts`, `tests/card/mod-loader/card-mod-bootstrap.test.ts`
- views graded identical: html:bar_bottom [set/type/bootswatch_skin/html_views.rb] (1 ops), html:bar_left [set/type/bootswatch_skin/html_views.rb] (1 ops), html:carousel [set/all/bootstrap/carousel.rb] (1 ops), html:icons [set/all/bootstrap/icon.rb] (1 ops), html:progress_bar [set/abstract/progress_bar.rb] (1 ops)
- views graded but differing: html:bar_right [set/type/bootswatch_skin/html_views.rb] differs at synthetic-v2 + extra-ops#view:admin:cerulean skin:bar_right
- views test-pinned only: html:core [set/type_plus_right/bootswatch_skin/colors.rb], html:core [set/type/bootswatch_skin/html_views.rb], html:customize_button [set/type/bootswatch_skin/html_views.rb], html:input [set/type_plus_right/bootswatch_skin/colors.rb], html:input [set/type/bootswatch_skin.rb], html:one_line_content [set/type/bootswatch_skin.rb], html:one_line_content [set/type/bootswatch_skin/html_views.rb]
- views unexercised: html:bar_middle [set/type_plus_right/bootswatch_skin/colors.rb]
- events unexercised: (none)

#### card-mod-carrierwave-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-carrierwave-events.test.ts`, `tests/card/mod-loader/card-mod-carrierwave-when-predicates.test.ts`, `tests/card/mod-loader/card-mod-carrierwave.test.ts`
- views graded identical: base:core [set/type/file.rb] (20 ops), base:inline [set/type/image.rb] (1 ops), base:source [set/type/file.rb] (1 ops), html:core [set/type/file.rb] (20 ops), html:core [set/type/image/html_views.rb] (6 ops), html:full_width [set/type/image/html_views.rb] (1 ops), html:input [set/self/new_file.rb] (1 ops), html:input [set/type/file.rb] (1 ops), html:link_tag [set/self/favicon.rb] (1 ops)
- views graded but differing: html:content_changes [set/type/image/html_views.rb] differs at synthetic-v2#view:admin:*favicon:content_changes, html:input [set/self/new_image.rb] differs at synthetic-v2 + extra-ops#view:admin:*new image:input, html:preview_editor [set/type/file.rb] differs at synthetic-v2#view:admin:Report 1:preview_editor
- views test-pinned only: base:source [set/type/image.rb], css:core [set/type/image.rb], file:core [set/type/file.rb], html:core [set/self/new_file.rb], html:core [set/self/new_image.rb], html:source [set/self/favicon.rb], html:source [set/self/new_file.rb], html:source [set/self/new_image.rb], json:image_complete [set/self/search.rb]
- views unexercised: base:one_line_content [set/type/image.rb], css:content [set/type/image.rb], email_html:inline [set/type/image.rb], json:content [set/type/file.rb]
- events unexercised: mark_remove_<column>_false_event, remove_<column>_event, remove_previously_stored_<column>_event, reset_previous_changes_for_<column>_event, store_<column>_event

#### card-mod-collection-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-collection.test.ts`
- views graded identical: (none)
- views graded but differing: base:count [set/all/item.rb] differs at synthetic-v2#view:admin:All Topics:count, html:count [set/all/item.rb] differs at synthetic-v2#view:admin:All Topics:count, html:paging [set/abstract/paging/paging_views.rb] differs at synthetic-v2#view:admin:All Topics:paging
- views test-pinned only: (none)
- views unexercised: json:paging_urls [set/abstract/paging/paging_views.rb], jsonld:paging_urls [set/abstract/paging/paging_views.rb]
- events unexercised: (none)

#### card-mod-comment-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-comment-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-comment-save-event.test.ts`, `tests/card/mod-loader/card-mod-comment.test.ts`
- views graded identical: base:comment_box [set/all/comment.rb] (2 ops), base:core [set/right/discussion.rb] (4 ops)
- views graded but differing: (none)
- views test-pinned only: base:input [set/right/discussion.rb], base:open_content [set/right/discussion.rb], base:open [set/right/discussion.rb], base:titled_content [set/right/discussion.rb], base:titled [set/right/discussion.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-content-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-content.test.ts`
- views graded identical: html:bar_middle [set/abstract/01_code_content.rb] (1 ops), html:core [set/abstract/haml_file.rb] (1417 ops), html:core [set/abstract/templated_nests.rb] (1417 ops), html:file_size [set/abstract/02_code_file.rb] (1 ops), html:input [set/abstract/01_code_content.rb] (1 ops), html:input [set/abstract/haml_file.rb] (1 ops), html:input [set/abstract/read_only.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:one_line_content [set/right/default.rb], html:one_line_content [set/right/structure.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-date-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-date.test.ts`
- views graded identical: html:core [set/type/date.rb] (15 ops)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-edit-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-edit-forms.test.ts`, `tests/card/mod-loader/card-mod-edit-views.test.ts`, `tests/card/mod-loader/card-mod-edit.test.ts`
- views graded identical: base:template_nest [set/all/template_nest.rb] (1 ops), html:board_type_formgroup [set/all/edit_type.rb] (1 ops), html:board [set/all/editing.rb] (2 ops), html:cardboard [set/all/editing.rb] (1 ops), html:conflict_tracker [set/all/form.rb] (1 ops), html:content_formgroup [set/all/form.rb] (1 ops), html:content_formgroups [set/all/form.rb] (3 ops), html:edit_form [set/all/edit_content.rb] (1 ops), html:edit_in_form [set/all/form.rb] (1 ops), html:edit_inline_buttons [set/all/edit_inline.rb] (1 ops), html:edit_inline [set/all/edit_inline.rb] (2 ops), html:edit_name_row [set/all/edit_inline.rb] (1 ops), html:edit_name [set/all/edit_name.rb] (1 ops), html:edit_nests [set/all/editing.rb] (1 ops), html:edit_row [set/all/edit_inline.rb] (1 ops), html:edit_rules [set/all/editing.rb] (1 ops), html:edit_structure [set/all/editing.rb] (1 ops), html:edit_type_form [set/all/edit_type.rb] (1 ops), html:edit_type_row [set/all/edit_type.rb] (1 ops), html:edit_type [set/all/edit_type.rb] (1 ops), html:edit [set/all/edit_content.rb] (2 ops), html:engage_tab [set/all/board/tab_views.rb] (1 ops), html:follow_section [set/all/board/tab_views.rb] (2 ops), html:guide_tab [set/all/board/tab_views.rb] (1 ops), html:history_tab [set/all/board/tab_views.rb] (2 ops), html:input [set/all/editor.rb] (1 ops), html:just_deleted [set/all/editing.rb] (1 ops), html:name_form [set/all/edit_name.rb] (1 ops), html:name_formgroup [set/all/form.rb] (1 ops), html:new_buttons [set/all/new.rb] (3 ops), html:new_fields [set/all/new.rb] (1 ops), html:new_in_modal_buttons [set/all/new.rb] (1 ops), html:new_in_modal [set/all/new.rb] (1 ops), html:new_type_formgroup [set/all/new.rb] (1 ops), html:overlay_guide [set/all/overlay_guide.rb] (1 ops), html:read_form [set/all/formgroup.rb] (1 ops), html:read_formgroup [set/all/formgroup.rb] (1 ops), html:related_tab [set/all/board/tab_views.rb] (1 ops), html:rules_tab [set/all/board/tab_views.rb] (1 ops), html:simple_new [set/all/new.rb] (1 ops), html:type_formgroup [set/all/edit_type.rb] (1 ops)
- views graded but differing: html:edit_buttons [set/all/editing.rb] differs at synthetic-v2 + extra-ops#view:admin:*follow defaults:edit_buttons, html:new [set/all/new.rb] differs at synthetic-v2 + extra-ops#view:admin:Sign up:new
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-email-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-email-raw-oracle.test.ts`, `tests/card/mod-loader/card-mod-email.test.ts`
- views graded identical: html:core [set/abstract/test_context.rb] (1417 ops), html:core [set/type/email_template/html.rb] (12 ops), html:email_page [set/all/email_html.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: email_html:compact_missing [set/all/email_html.rb], email_html:core [set/abstract/test_context.rb], email_html:unknown [set/all/email_html.rb], email_text:compact_missing [set/all/email_text.rb], email_text:last_action [set/all/email_text.rb], email_text:unknown [set/all/email_text.rb], html:content [set/right/html_message.rb], html:core [set/right/text_message.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-follow-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-follow-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-follow-views.test.ts`, `tests/card/mod-loader/card-mod-follow.test.ts`
- views graded identical: base:followed [set/all/notify/base_views.rb] (1 ops), base:follower [set/all/notify/base_views.rb] (1 ops), base:last_action_verb [set/all/notify/base_views.rb] (1 ops), base:list_of_changes [set/all/notify/base_views.rb] (1 ops), base:subedit_notice [set/all/notify/base_views.rb] (1 ops), base:subedits [set/all/notify/base_views.rb] (1 ops), base:unfollow_url [set/all/notify/base_views.rb] (1 ops), html:core [set/type_plus_right/user/follow.rb] (2 ops), html:follow_button [set/all/follow/follow_link_views.rb] (2 ops), html:follow_item [set/right/follow.rb] (1 ops), html:follow_status [set/right/follow.rb] (1 ops), html:follow_tab [set/type_plus_right/user/follow.rb] (1 ops), html:ignore_tab [set/type_plus_right/user/follow.rb] (1 ops), html:rule_editor [set/right/following.rb] (1 ops), html:status [set/right/following.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:confirm_update_all [set/self/follow_defaults.rb], html:core [set/right/followers.rb], html:core [set/right/following.rb], html:edit [set/type_plus_right/user/follow.rb], html:errors [set/type_plus_right/user/follow.rb], html:one_line_content [set/right/following.rb], html:one_line_content [set/type_plus_right/user/follow.rb]
- views unexercised: html:edit_buttons [set/self/follow_defaults.rb], json:follow_status [set/all/follow/follow_link_views.rb]
- events unexercised: cache_expired_for_new_set, cache_expired_for_type_change, expire_preferences_cache, notify_followers_after_delete, notify_followers_after_save, silence_notifications, stash_followers

#### card-mod-format-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-format-async-head-views.test.ts`, `tests/card/mod-loader/card-mod-format-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-format-head-header-views.test.ts`, `tests/card/mod-loader/card-mod-format-hidden-content-field-view.test.ts`, `tests/card/mod-loader/card-mod-format-remaining-views.test.ts`, `tests/card/mod-loader/card-mod-format-smart-label.test.ts`, `tests/card/mod-loader/card-mod-format-toggle-raises.test.ts`, `tests/card/mod-loader/card-mod-format.test.ts`
- views graded identical: base:acted_at [set/all/base.rb] (1 ops), base:bad_address [set/all/error.rb] (1 ops), base:blank [set/all/base.rb] (1 ops), base:closed_content [set/all/content.rb] (1 ops), base:closed [set/all/base.rb] (1 ops), base:codename [set/all/base.rb] (1 ops), base:compact_missing [set/all/error.rb] (1 ops), base:content [set/all/base.rb] (1 ops), base:core [set/all/base.rb] (1417 ops), base:core [set/type/toggle.rb] (15 ops), base:created_at [set/all/base.rb] (1 ops), base:denial [set/all/error.rb] (1 ops), base:id_url [set/all/base.rb] (1 ops), base:key [set/all/base.rb] (1 ops), base:label [set/all/content.rb] (1 ops), base:labeled_content [set/all/base.rb] (1 ops), base:labeled [set/all/base.rb] (1 ops), base:link [set/all/base.rb] (1 ops), base:linkname [set/all/base.rb] (1 ops), base:name [set/all/base.rb] (1 ops), base:nav_link [set/all/base.rb] (1 ops), base:not_found [set/all/error.rb] (1 ops), base:one_line_content [set/all/base.rb] (1 ops), base:one_line_content [set/all/content.rb] (1 ops), base:open_content [set/all/base.rb] (1 ops), base:open [set/all/base.rb] (1 ops), base:page_title [set/all/html/head.rb] (1 ops), base:raw_one_line_content [set/all/content.rb] (1 ops), base:raw [set/all/base.rb] (2 ops), base:server_error [set/all/error.rb] (1 ops), base:smart_label [set/all/content.rb] (1 ops), base:text_without_nests [set/all/text.rb] (1 ops), base:title_link [set/type/uri.rb] (1 ops), base:title [set/all/title.rb] (1 ops), base:titled_content [set/all/base.rb] (1 ops), base:titled [set/all/base.rb] (1 ops), base:type [set/all/base.rb] (1 ops), base:unknown [set/all/error.rb] (1 ops), base:updated_at [set/all/base.rb] (1 ops), base:url_link [set/all/base.rb] (1 ops), base:url [set/all/base.rb] (1 ops), html:add_button [set/type/cardtype.rb] (1 ops), html:add_link [set/type/cardtype.rb] (1 ops), html:add_url [set/type/cardtype.rb] (1 ops), html:bar_right [set/type/mod.rb] (1 ops), html:board_link [set/all/html/menu.rb] (1 ops), html:compact_missing [set/all/html/error.rb] (1 ops), html:configure_button [set/type/cardtype.rb] (1 ops), html:configure_link [set/type/cardtype.rb] (1 ops), html:conflict [set/all/html/error.rb] (1 ops), html:content_panel [set/all/html/views.rb] (1 ops), html:content_with_title [set/all/html/views.rb] (1 ops), html:content [set/all/html/views.rb] (1 ops), html:core [set/type/plain_text.rb] (25 ops), html:core [set/type/uri.rb] (2 ops), html:demo [set/all/demo.rb] (1 ops), html:denial [set/all/html/error.rb] (1 ops), html:edit_button [set/all/html/menu.rb] (2 ops), html:edit_link [set/all/html/menu.rb] (2 ops), html:favicon_tag [set/all/html/head.rb] (1 ops), html:flash [set/all/html/frame.rb] (1 ops), html:full_page_link [set/all/html/menu.rb] (1 ops), html:head [set/all/html/head.rb] (1 ops), html:header_title [set/all/html/header.rb] (1 ops), html:header [set/all/html/header.rb] (1 ops), html:help_link [set/all/html/menu.rb] (1 ops), html:hidden_content_field [set/all/content.rb] (1 ops), html:input [set/type/toggle.rb] (1 ops), html:labeled_editor [set/type/toggle.rb] (1 ops), html:labeled [set/all/html/views.rb] (1 ops), html:menu_block [set/all/html/menu.rb] (1 ops), html:menu [set/all/html/menu.rb] (1 ops), html:meta_tags [set/all/html/head.rb] (1 ops), html:mini_unknown [set/all/html/error.rb] (1 ops), html:not_found [set/all/html/error.rb] (1 ops), html:one_line_content [set/all/html/views.rb] (1 ops), html:page_title_tag [set/all/html/head.rb] (1 ops), html:raw_one_line_content [set/all/html/views.rb] (1 ops), html:server_error [set/all/html/error.rb] (1 ops), html:short_content [set/all/html/views.rb] (1 ops), html:stylesheet_tags [set/all/html/head.rb] (1 ops), html:title_no_link [set/all/title.rb] (1 ops), html:title [set/all/title.rb] (1 ops), html:titled [set/all/html/views.rb] (1 ops), html:type_info [set/all/html.rb] (1 ops), html:type [set/all/html.rb] (1 ops), html:universal_edit_button [set/all/html/head.rb] (1 ops), html:unknown [set/all/html/error.rb] (1 ops), html:view_list [set/all/demo.rb] (1 ops)
- views graded but differing: base:errors [set/all/error.rb] differs at synthetic-v2#view:admin:Nonexistent Card:errors, base:id [set/all/base.rb] differs at synthetic-v2#view:admin:Topic 001:id, html:debug_server_error [set/all/html/error.rb] differs at synthetic-v2#view:admin:Note 001:debug_server_error, html:errors [set/all/html/error.rb] differs at synthetic-v2#view:admin:Nonexistent Card:errors, html:rss_links [set/all/html/head.rb] differs at synthetic-v2#view:admin:Home:rss_links
- views test-pinned only: base:home_url [set/self/home.rb], base:one_line_content [set/type/html.rb], base:url_link [set/type/uri.rb], css:content [set/all/css.rb], css:titled [set/all/css.rb], css:unknown [set/all/css.rb], css:url [set/all/css.rb], csv:header [set/all/csv.rb], csv:titled [set/all/csv.rb], csv:unknown [set/all/csv.rb], data:content [set/all/data.rb], data:core [set/all/data.rb], file:core [set/all/file.rb], file:style [set/all/file.rb], html:admin [set/type/mod.rb], html:core [set/type/json.rb], html:one_line_content [set/type/html.rb], html:title_link [set/all/title.rb], html:type [set/type/cardtype.rb], json:bad_address [set/all/error.rb], json:denial [set/all/error.rb], json:errors [set/all/error.rb], json:not_found [set/all/error.rb], json:server_error [set/all/error.rb], jsonld:denial [set/all/error.rb], jsonld:errors [set/all/error.rb], jsonld:not_found [set/all/error.rb], jsonld:server_error [set/all/error.rb], rss:closed [set/all/rss.rb], rss:content [set/all/rss.rb], rss:menu [set/all/rss.rb], rss:open [set/all/rss.rb], text:core [set/all/text.rb], yaml:core [set/all/yaml.rb]
- views unexercised: base:home_path [set/self/home.rb], css:import [set/all/css.rb], csv:body [set/all/csv.rb], csv:row [set/all/csv.rb], data:ancestors [set/all/data.rb], data:atom [set/all/data.rb], data:cast [set/all/data.rb], data:items [set/all/data.rb], data:links [set/all/data.rb], data:molecule [set/all/data.rb], data:nucleus [set/all/data.rb], data:pod [set/all/data.rb], js:source [set/all/js.rb], json:page [set/all/json.rb], json:status [set/all/json.rb], jsonld:format_unsupported [set/all/error.rb], jsonld:items [set/all/jsonld.rb], jsonld:test [set/all/error.rb], rss:comment_box [set/all/rss.rb], rss:feed_body [set/all/rss.rb], rss:feed_description [set/all/rss.rb], rss:feed_item_description [set/all/rss.rb], rss:feed_item [set/all/rss.rb], rss:feed_title [set/all/rss.rb], rss:feed [set/all/rss.rb], rss:open_content [set/all/rss.rb]
- events unexercised: validate_json, validate_number

#### card-mod-help-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-help.test.ts`
- views graded identical: html:guide [set/all/guide.rb] (1 ops), html:help_text [set/all/help.rb] (1 ops), html:help [set/all/help.rb] (1 ops), html:lead [set/all/help.rb] (1 ops), html:popover [set/right/help.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-history-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-history-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-history-ladder-views.test.ts`, `tests/card/mod-loader/card-mod-history-updater-of-seam.test.ts`, `tests/card/mod-loader/card-mod-history-views.test.ts`, `tests/card/mod-loader/card-mod-history.test.ts`
- views graded identical: html:act_legend [set/all/history/views.rb] (1 ops), html:act [set/all/history/views.rb] (1 ops), html:action_expanded [set/all/history/views.rb] (1 ops), html:action_summary [set/all/history/views.rb] (1 ops), html:board_act [set/all/history_board.rb] (1 ops), html:change [set/all/history/views.rb] (1 ops), html:creator_credit [set/all/history_board.rb] (1 ops), html:draft_legend [set/all/history/views.rb] (1 ops), html:history [set/all/history/views.rb] (2 ops), html:last_action_verb [set/all/history/views.rb] (1 ops), html:last_action [set/all/history/views.rb] (1 ops), html:updated_by [set/all/history_board.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: json:actions [set/all/history/export.rb], json:history [set/all/history/export.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-integrate-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-integrate.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-layout-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-layout-mycard-views.test.ts`, `tests/card/mod-loader/card-mod-layout.test.ts`
- views graded identical: html:close_modal_link [set/all/modal.rb] (1 ops), html:core [set/self/head.rb] (2 ops), html:core [set/type/layout_type.rb] (6 ops), html:modal_footer [set/all/modal.rb] (1 ops), html:modal_link [set/all/modal.rb] (2 ops), html:modal_menu [set/all/modal.rb] (1 ops), html:modal_title [set/all/modal.rb] (1 ops), html:modal [set/all/modal.rb] (2 ops), html:nav_item [set/abstract/items.rb] (1 ops), html:nav_item [set/all/navbar_links.rb] (1 ops), html:nav_link_in_dropdown [set/all/navbar_links.rb] (1 ops), html:navbar_links [set/all/navbar_links.rb] (1 ops), html:overlay_header [set/all/overlay.rb] (1 ops), html:overlay_help_link [set/all/overlay.rb] (1 ops), html:overlay_menu [set/all/overlay.rb] (1 ops), html:overlay_title [set/all/overlay.rb] (1 ops), html:pop_out_modal_link [set/all/modal.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:bar_bottom [set/self/head.rb], html:core [set/right/head.rb], html:core [set/self/account_links.rb], html:edit_inline [set/right/enabled_roles.rb], html:head_content [set/right/head.rb], html:input [set/self/head.rb], html:invite [set/self/account_links.rb], html:my_card [set/self/account_links.rb], html:nav_item [set/self/dropdown_divider.rb], html:nav_link_in_dropdown [set/self/dropdown_divider.rb], html:navbar_links [set/type/html.rb], html:one_line_content [set/right/head.rb], html:sign_in [set/self/account_links.rb], html:sign_out [set/self/account_links.rb], html:sign_up [set/self/account_links.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-list-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-list-checkbox-editor.test.ts`, `tests/card/mod-loader/card-mod-list-select-editor.test.ts`, `tests/card/mod-loader/card-mod-list.test.ts`
- views graded identical: base:core [set/abstract/01_list/other_views.rb] (1417 ops), html:autocomplete [set/abstract/01_list/html_views.rb] (1 ops), html:checkbox [set/abstract/01_list/html_views.rb] (1 ops), html:core [set/abstract/01_list/html_views.rb] (1417 ops), html:input [set/abstract/01_list/html_views.rb] (1 ops), html:list [set/abstract/01_list/html_views.rb] (1 ops), html:multiselect [set/abstract/01_list/html_views.rb] (1 ops), html:nest_list_input [set/type/nest_list.rb] (1 ops), html:one_line_content [set/abstract/01_list/html_views.rb] (1 ops), html:radio [set/abstract/01_list/html_views.rb] (1 ops), html:select [set/abstract/01_list/html_views.rb] (1 ops), html:view_list [set/abstract/01_list.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: css:content [set/abstract/01_list/other_views.rb], data:content [set/abstract/01_list/other_views.rb], html:input [set/type/link_list.rb], html:input [set/type/nest_list.rb], json:content [set/abstract/01_list/other_views.rb]
- views unexercised: css:titled [set/abstract/01_list/other_views.rb], csv:core [set/abstract/01_list/other_views.rb], data:core [set/abstract/01_list/other_views.rb], js:core [set/abstract/01_list/other_views.rb], json:links [set/abstract/01_list/other_views.rb]
- events unexercised: (none)

#### card-mod-markdown-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-markdown.test.ts`
- views graded identical: html:core [set/type/markdown.rb] (2 ops)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-permissions-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-permissions.test.ts`
- views graded identical: html:core [set/abstract/permission.rb] (1417 ops), html:input [set/abstract/permission.rb] (1 ops), html:one_line_content [set/abstract/permission.rb] (1 ops), html:pointer_core [set/abstract/permission.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-recaptcha-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-recaptcha-form-hooks.test.ts`, `tests/card/mod-loader/card-mod-recaptcha-validate-event.test.ts`, `tests/card/mod-loader/card-mod-recaptcha.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views test-pinned only: html:core [set/self/recaptcha_settings.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-rules-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-rules-nest-oracle-pinned.test.ts`, `tests/card/mod-loader/card-mod-rules-views-2.test.ts`, `tests/card/mod-loader/card-mod-rules-views-3.test.ts`, `tests/card/mod-loader/card-mod-rules-views.test.ts`, `tests/card/mod-loader/card-mod-rules.test.ts`
- views graded identical: html:accordion_bar_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:accordion_rule_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:bar_setting_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:board_rules_tab [set/type/set/html_views/filtered_rule_lists.rb] (1 ops), html:card_select [set/all/set_select.rb] (1 ops), html:core [set/rule/html_views.rb] (76 ops), html:core [set/type/set/html_views.rb] (7 ops), html:core [set/type/setting.rb] (16 ops), html:filtered_accordion_rule_list [set/type/set/html_views/filtered_rule_lists.rb] (1 ops), html:modal_nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (1 ops), html:modal_pill_setting_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:modal_rule [set/rule/board_rules_editor.rb] (1 ops), html:nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (1 ops), html:overlay_rule_list_link [set/type/set/html_views/rule_lists.rb] (1 ops), html:overlay_rule [set/rule/board_rules_editor.rb] (1 ops), html:pill_setting_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:quick_edit_setting_list [set/type/set/html_views/rule_lists.rb] (1 ops), html:quick_edit_success [set/rule/quick_editor.rb] (1 ops), html:rule_board_link [set/rule/editor.rb] (1 ops), html:rule_edit [set/rule/editor.rb] (1 ops), html:rule_help [set/type/setting.rb] (1 ops), html:rule_nest_editor_link [set/rule/editor.rb] (1 ops), html:set_label [set/type/set/html_views.rb] (1 ops), html:template_link [set/type/set/html_views/template.rb] (1 ops)
- views graded but differing: html:quick_edit [set/rule/quick_editor.rb] differs at synthetic-v2#view:admin:*all+*read:quick_edit; synthetic-v2#view:anonymous:*all+*read:quick_edit, html:rule_form_card_editor [set/rule/rule_form.rb] differs at synthetic-v2#view:admin:*all+*create:rule_form_card_editor, html:rule_form [set/rule/rule_form.rb] differs at synthetic-v2#view:admin:*all+*create:rule_form
- views test-pinned only: data:core [set/type/setting.rb], html:grouped_list [set/self/cardtype.rb], html:input [set/type/set/html_views.rb], html:one_line_content [set/rule/bar_view.rb], html:one_line_content [set/type/set/html_views.rb], html:one_line_content [set/type/setting.rb], html:overlay_title [set/rule/board_rules_editor.rb], html:raw_one_line_content [set/rule/bar_view.rb], html:rule_help [set/rule/editor.rb]
- views unexercised: html:bar_bottom [set/rule/bar_view.rb], html:bar_middle [set/rule/bar_view.rb], html:bar_right [set/rule/bar_view.rb], html:bar [set/rule/bar_view.rb], html:help_text [set/rule/board_rules_editor.rb]
- events unexercised: (none)

#### card-mod-script-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-script.test.ts`
- views graded identical: base:core [set/abstract/02_coffee_script.rb] (1417 ops), html:core [set/abstract/00_script.rb] (1417 ops), html:javascript_include_tag [set/abstract/00_script.rb] (1 ops), html:javascript_include_tag [set/all/head_javascript.rb] (1 ops), html:javascript_tags [set/all/head_javascript.rb] (1 ops), html:remote_script_tags [set/type_plus_right/set/script.rb] (1 ops), html:script_calls [set/all/head_javascript.rb] (1 ops), html:script_variables [set/all/head_javascript.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: html:javascript_include_tag [set/right/script.rb], html:remote_script_tags [set/type_plus_right/mod/script.rb], js:core [set/abstract/01_java_script.rb], js:core [set/abstract/script_group.rb]
- views unexercised: js:compressed [set/abstract/00_script.rb]
- events unexercised: (none)

#### card-mod-search-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-search-list-oracle-pinned.test.ts`, `tests/card/mod-loader/card-mod-search-read-scope.test.ts`, `tests/card/mod-loader/card-mod-search.test.ts`
- views graded identical: base:card_list [set/abstract/0_search/views.rb] (1 ops), base:core [set/abstract/search_views.rb] (1417 ops), base:no_search_results [set/abstract/0_search/views.rb] (1 ops), html:add_autocomplete_item [set/all/autocomplete.rb] (1 ops), html:bar [set/abstract/search_views.rb] (2 ops), html:card_list [set/abstract/0_search/views.rb] (1 ops), html:checkbox_list [set/abstract/0_search/views.rb] (1 ops), html:core [set/abstract/search_views.rb] (1417 ops), html:core [set/self/recent.rb] (2 ops), html:goto_autocomplete_item [set/all/autocomplete.rb] (1 ops), html:no_search_results [set/abstract/0_search/views.rb] (1 ops), html:one_line_content [set/abstract/search_views.rb] (1 ops), html:results_for_keyword [set/self/search.rb] (1 ops), html:search_box [set/self/search.rb] (1 ops)
- views graded but differing: base:count [set/abstract/0_search.rb] differs at synthetic-v2#view:admin:All Topics:count, base:search_count [set/abstract/0_search/views.rb] differs at synthetic-v2#view:admin:All Topics:search_count, base:search_error [set/abstract/0_search/views.rb] differs at synthetic-v2#view:admin:All Topics:search_error, html:core [set/self/search.rb] differs at synthetic-v2#core:admin:*search; synthetic-v2#core:anonymous:*search, html:count [set/abstract/0_search.rb] differs at synthetic-v2#view:admin:All Topics:count
- views test-pinned only: base:search_error [set/self/search.rb], json:select2_option [set/all/autocomplete.rb]
- views unexercised: base:title [set/self/recent.rb], csv:body [set/abstract/0_search/views.rb], data:card_list [set/abstract/0_search/views.rb], html:title [set/self/search.rb], json:complete [set/self/search.rb], json:molecule [set/abstract/0_search/views.rb], json:name_complete [set/abstract/0_search/views.rb], json:name_match [set/abstract/0_search/views.rb], json:search_box_complete [set/self/search.rb], rss:feed_body [set/abstract/search_views.rb], rss:feed_item_description [set/self/recent.rb]
- events unexercised: (none)

#### card-mod-session-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-session.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-style-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-style-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-style.test.ts`
- views graded identical: html:box_bottom [set/abstract/skin_box.rb] (1 ops), html:box_middle [set/abstract/skin_box.rb] (1 ops), html:box [set/abstract/skin_box.rb] (1 ops), html:core [set/abstract/01_css.rb] (1417 ops), html:customize_button [set/abstract/skin_box.rb] (1 ops), html:remote_include_tags [set/type_plus_right/mod/style.rb] (1 ops), html:stylesheet_include_tag [set/abstract/style_group.rb] (1 ops), html:stylesheet_path [set/type_plus_right/set/style.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: css:compiled [set/abstract/01_css.rb], css:compiled [set/abstract/02_scss.rb], css:compressed [set/abstract/01_css.rb], css:core [set/abstract/02_scss.rb], css:import [set/abstract/01_css.rb], html:remote_style_tags [set/self/style_mods.rb], html:stylesheet_include_tag [set/type_plus_right/mod/style.rb], scss:core [set/abstract/02_scss.rb], scss:core [set/abstract/style_group.rb], scss:labeled [set/abstract/02_scss.rb]
- views unexercised: css:concat [set/type/skin.rb]
- events unexercised: (none)

#### card-mod-tabs-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-tabs.test.ts`
- views graded identical: html:pills_static [set/all/tabs.rb] (1 ops), html:pills [set/all/tabs.rb] (1 ops), html:tabs_static [set/all/tabs.rb] (1 ops), html:tabs [set/abstract/tabs.rb] (1 ops), html:tabs [set/all/tabs.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-tinymce_editor-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-tinymce-editor-harness-probe.test.ts`, `tests/card/mod-loader/card-mod-tinymce-editor-views.test.ts`, `tests/card/mod-loader/card-mod-tinymce_editor.test.ts`
- views graded identical: html:link_editor [set/all/reference_editor/link_editor.rb] (1 ops), html:modal_link_editor [set/all/reference_editor/link_editor.rb] (1 ops), html:modal_nest_editor [set/all/reference_editor/nest_editor.rb] (1 ops), html:modal_nest_image [set/all/reference_editor/nest_image.rb] (1 ops), html:nest_content [set/all/reference_editor/nest_editor.rb] (1 ops), html:nest_editor [set/all/reference_editor/nest_editor.rb] (1 ops), html:nest_image [set/all/reference_editor/nest_image.rb] (1 ops), html:new_image_buttons [set/all/reference_editor/nest_image.rb] (1 ops), html:new_image [set/all/reference_editor/nest_image.rb] (1 ops)
- views graded but differing: (none)
- views test-pinned only: js:change_create_to_update [set/all/reference_editor/nest_image.rb], js:open_nest_editor [set/all/reference_editor/nest_image.rb]
- views unexercised: (none)
- events unexercised: (none)

#### card-mod-virtual-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-virtual.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views test-pinned only: (none)
- views unexercised: (none)
- events unexercised: (none)

## decko-ts implemented surface (truth)

- Set patterns (9): all, all_plus, right, rstar, rule, self, star, type, type_plus_right
- Html views in HTML_VIEWS (306): accordion_bar, accordion_bar_list, accordion_rule_list, account_tab, act, act_legend, acted_at, action_expanded, action_summary, add_autocomplete_item, add_button, add_link, add_url, admin, api_key, asset_output_url, autocomplete, bad_address, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, bar_setting_list, blank, board, board_act, board_link, board_rules_tab, board_type_formgroup, box, box_bottom, box_middle, box_top, boxed, boxed_link, buttons, card_list, card_select, cardboard, cardtypes, carousel, change, change_create_to_update, checkbox, checkbox_list, close_modal_link, closed, closed_account, closed_bar, closed_content, closure, codename, comment_box, compact_missing, configs, configurations, configure_button, configure_link, confirm_update_all, conflict, conflict_tracker, content, content_changes, content_formgroup, content_formgroups, content_panel, content_with_title, core, count, created_at, creator_credit, current, customize_button, debug_server_error, demo, denial, depends_on, description, draft_legend, edit, edit_button, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_link, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, email_page, engage_tab, errors, expanded_bar, favicon_tag, file_size, filtered_accordion_rule_list, flash, follow_button, follow_item, follow_section, follow_status, follow_tab, followed, follower, full_bar, full_page_link, full_width, gem_info, generate_button, goto_autocomplete_item, grouped_list, guide, guide_tab, head, head_content, header, header_title, help, help_link, help_text, hidden_content_field, history, history_tab, home_path, home_url, home_view, icons, id, id_url, ignore_tab, image_complete, inline, input, invite, javascript_include_tag, javascript_tags, just_deleted, key, label, labeled, labeled_content, labeled_editor, last_action, last_action_verb, lead, link, link_editor, link_tag, link_with_checkbox, linkname, list, list_of_changes, menu, menu_block, meta_tags, mini_bar, mini_unknown, modal, modal_footer, modal_link, modal_link_editor, modal_menu, modal_nest_editor, modal_nest_image, modal_nest_rules, modal_pill_setting_list, modal_rule, modal_title, multiselect, my_card, name, name_form, name_formgroup, nav_item, nav_link, nav_link_in_dropdown, navbar_links, nest_content, nest_editor, nest_image, nest_list_input, nest_rules, new, new_buttons, new_fields, new_image, new_image_buttons, new_in_modal, new_in_modal_buttons, new_type_formgroup, no_search_results, not_found, one_line_content, open, open_bar, open_content, open_nest_editor, overlay_guide, overlay_header, overlay_help_link, overlay_menu, overlay_rule, overlay_rule_list_link, overlay_title, page_title, page_title_tag, paging, pill_setting_list, pills, pills_static, pointer_core, pop_out_modal_link, popover, preview_editor, progress_bar, quick_edit, quick_edit_setting_list, quick_edit_success, radio, raw, raw_one_line_content, read_form, read_formgroup, related_tab, remote_include_tags, remote_script_tags, remote_style_tags, reset_password_days, reset_password_success, reset_password_url, results_for_keyword, roles, rss_links, rule_board_link, rule_edit, rule_editor, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, rules_tab, script_calls, script_variables, scripts, search_box_complete, search_count, search_error, select, server_error, set_label, settings, setup, short_content, sign_in, sign_out, sign_up, simple_new, smart_label, source, status, styles, stylesheet_include_tag, stylesheet_path, stylesheet_tags, subedit_notice, subedits, tabs, tabs_static, tasks, template_link, template_nest, text_without_nests, title, title_link, title_no_link, titled, titled_content, token, token_days, token_expiry, token_link, type, type_formgroup, type_info, unfollow_url, universal_edit_button, unknown, updated_at, updated_by, url, url_link, verify_days, verify_url, view_list, views, warning
- Rules: lookup=yes, apply=no
- Permissions: yes (read-rules.ts, view-perms.ts)

## Per-mod report

| mod | status | mod-specific views | manifest views | set modules | lib rb | test it() / byte-pins | verdict |
|-----|--------|-------------------:|---------------:|------------:|-------:|----------------------:|---------|
| `card-mod-account-0.20.0` | declared-complete | 19/19 | 27 (covered=27) | 22 (abstract=2, all=2, right=7, self=4, type=4, type_plus_right=3) | 1 | 12/1 | 19 mod-specific view(s) declared: account_tab, closed_account, closure, configs, content_formgroups, edit, ... |
| `card-mod-ace_editor-0.20.0` | partial | 0/0 | 0 (covered=0) | 2 (all=1, self=1) | 0 | 10/2 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views); pins=2/10 |
| `card-mod-api_key-0.20.0` | declared-complete | 6/6 | 10 (covered=10) | 2 (right=2) | 2 | 34/14 | 6 mod-specific view(s) declared: api_key, buttons, current, generate_button, token, token_link |
| `card-mod-assets-0.20.0` | declared-complete | 2/2 | 4 (covered=4) | 12 (abstract=8, right=3, type=1) | 1 | 15/6 | 2 mod-specific view(s) declared: javascript_include_tag, stylesheet_include_tag |
| `card-mod-bar_and_box-0.20.0` | declared-complete | 11/11 | 0 (covered=0) | 4 (abstract=1, all=2, type=1) | 0 | 0/0 | 11 mod-specific view(s) declared: bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, ... |
| `card-mod-bootstrap-0.20.0` | declared-complete | 10/10 | 12 (covered=12) | 11 (abstract=4, all=2, self=2, type=2, type_plus_right=1) | 16 | 32/21 | 10 mod-specific view(s) declared: bar_bottom, bar_left, bar_middle, bar_right, carousel, customize_button, ... |
| `card-mod-carrierwave-0.20.0` | declared-complete | 6/6 | 10 (covered=10) | 11 (abstract=2, all=1, self=5, type=3) | 7 | 36/21 | 6 mod-specific view(s) declared: content_changes, full_width, input, link_tag, preview_editor, source |
| `card-mod-collection-0.20.0` | declared-complete | 2/3 | 2 (covered=2) | 6 (abstract=3, all=3) | 1 | 22/16 | 2 mod-specific view(s) declared: count, paging — 1 declared view name(s) NOT in the implemented surface: paging_urls |
| `card-mod-comment-0.20.0` | partial | 0/0 | 7 (covered=7) | 3 (all=1, right=2) | 0 | 12/4 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views); pins=4/12 |
| `card-mod-content-0.20.0` | declared-complete | 4/4 | 4 (covered=4) | 14 (abstract=7, all=3, right=2, self=2) | 7 | 16/9 | 4 mod-specific view(s) declared: bar_middle, file_size, input, one_line_content |
| `card-mod-date-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 5 (all=1, right=2, self=1, type=1) | 0 | 32/20 | manifest + byte-pinned test (20 pins across 32 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-defaults-0.20.0` | ignored | 0/0 | 0 (covered=0) | 0 () | 1 | 0/0 | unported (not evaluated) |
| `card-mod-delayed_job-0.20.0` | ignored | 0/0 | 0 (covered=0) | 0 () | 2 | 0/0 | unported (not evaluated) |
| `card-mod-edit-0.20.0` | declared-complete | 41/41 | 45 (covered=45) | 21 (all=15, right=2, self=1, type=3) | 0 | 9/3 | 41 mod-specific view(s) declared: board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ... |
| `card-mod-email-0.20.0` | declared-complete | 2/2 | 6 (covered=6) | 13 (abstract=2, all=2, right=7, type=2) | 2 | 10/4 | 2 mod-specific view(s) declared: compact_missing, email_page |
| `card-mod-follow-0.20.0` | declared-complete | 12/12 | 19 (covered=19) | 25 (abstract=1, all=4, right=8, self=7, type=4, type_plus_right=1) | 2 | 12/5 | 12 mod-specific view(s) declared: confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ... |
| `card-mod-format-0.20.0` | declared-complete | 46/46 | 54 (covered=54) | 33 (abstract=1, all=20, right=1, self=1, type=10) | 16 | 49/8 | 46 mod-specific view(s) declared: add_button, add_link, add_url, admin, bar_right, board_link, ... |
| `card-mod-help-0.20.0` | declared-complete | 5/5 | 5 (covered=5) | 6 (all=2, right=2, self=2) | 0 | 14/8 | 5 mod-specific view(s) declared: guide, help, help_text, lead, popover |
| `card-mod-history-0.20.0` | declared-complete | 12/12 | 10 (covered=10) | 3 (all=3) | 12 | 40/39 | 12 mod-specific view(s) declared: act, act_legend, action_expanded, action_summary, board_act, change, ... |
| `card-mod-integrate-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 8 (all=1, right=3, self=4) | 0 | 28/21 | manifest + byte-pinned test (21 pins across 28 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-layout-0.20.0` | declared-complete | 24/24 | 26 (covered=26) | 23 (abstract=4, all=6, right=3, self=8, type=2) | 5 | 37/7 | 24 mod-specific view(s) declared: bar_bottom, close_modal_link, edit_inline, head_content, input, invite, ... |
| `card-mod-list-0.20.0` | declared-complete | 5/5 | 10 (covered=10) | 16 (abstract=6, all=1, right=2, self=3, type=4) | 0 | 15/15 | 5 mod-specific view(s) declared: input, list, nest_list_input, one_line_content, view_list |
| `card-mod-markdown-0.20.0` | declared-complete | 0/0 | 1 (covered=1) | 1 (type=1) | 0 | 14/15 | manifest + byte-pinned test (15 pins across 14 it()): core — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-permissions-0.20.0` | declared-complete | 3/3 | 4 (covered=4) | 11 (abstract=1, all=2, right=4, self=4) | 0 | 33/33 | 3 mod-specific view(s) declared: input, one_line_content, pointer_core |
| `card-mod-recaptcha-0.20.0` | declared-complete | 0/0 | 1 (covered=1) | 8 (abstract=1, all=1, right=3, self=3) | 1 | 40/12 | manifest + byte-pinned test (12 pins across 40 it()): core — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-rules-0.20.0` | declared-complete | 34/34 | 30 (covered=30) | 24 (abstract=1, all=3, right=4, rstar=1, rule=8, self=2, type=4, type_plus_right=1) | 0 | 29/19 | 34 mod-specific view(s) declared: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, ... |
| `card-mod-script-0.20.0` | declared-complete | 5/6 | 6 (covered=6) | 16 (abstract=7, all=1, right=1, self=1, type=4, type_plus_right=2) | 2 | 18/14 | 5 mod-specific view(s) declared: javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables — 1 declared view name(s) NOT in the implemented surface: compressed |
| `card-mod-search-0.20.0` | declared-complete | 11/20 | 10 (covered=10) | 28 (abstract=6, all=1, right=17, self=2, type=2) | 1 | 28/5 | 11 mod-specific view(s) declared: add_autocomplete_item, bar, card_list, checkbox_list, count, goto_autocomplete_item, ... — 9 declared view name(s) NOT in the implemented surface: body, complete, fee |
| `card-mod-session-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 2 (all=1, type=1) | 1 | 7/5 | manifest + byte-pinned test (5 pins across 7 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-style-0.20.0` | declared-complete | 9/12 | 8 (covered=8) | 16 (abstract=7, self=2, type=5, type_plus_right=2) | 0 | 17/37 | 9 mod-specific view(s) declared: box, box_bottom, box_middle, customize_button, labeled, remote_include_tags, ... — 3 declared view name(s) NOT in the implemented surface: compiled, compressed, import |
| `card-mod-tabs-0.20.0` | declared-complete | 4/4 | 4 (covered=4) | 2 (abstract=1, all=1) | 2 | 10/3 | 4 mod-specific view(s) declared: pills, pills_static, tabs, tabs_static |
| `card-mod-tinymce_editor-0.20.0` | declared-complete | 11/11 | 12 (covered=12) | 4 (all=3, self=1) | 1 | 33/31 | 11 mod-specific view(s) declared: change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, ... |
| `card-mod-virtual-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 1 (abstract=1) | 1 | 33/16 | manifest + byte-pinned test (16 pins across 33 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |

## Per-mod detail

### card-mod-account-0.20.0

- **status**: `declared-complete`
- **verdict**: 19 mod-specific view(s) declared: account_tab, closed_account, closure, configs, content_formgroups, edit, ...
- **evidence**: 24/24 html views in HTML_VIEWS∪mod-manifests (19/19 mod-specific); mod-loader pins: manifest=yes, test=12 it(), byte-pins=1
- **mod-loader manifest**: yes (27 views registered)
- **byte-pinned test**: yes (12 it() blocks, 1 toBe(<literal>) pins)
- **set modules by pattern**: abstract=2, all=2, right=7, self=4, type=4, type_plus_right=3
- **mod-specific html views (covered/total)**: 19/19 (account_tab, closed_account, closure, configs, content_formgroups, edit, edit_buttons, link_with_checkbox, new, new_buttons, one_line_content, open_content, raw, reset_password_days, reset_password_success, reset_password_url, setup, token_days, token_expiry, verify_days, verify_url)
- **all html views declared**: account_tab, closed_account, closure, configs, content_formgroups, core, edit, edit_buttons, link_with_checkbox, new, new_buttons, one_line_content, open, open_content, raw, reset_password_days, reset_password_success, reset_password_url, setup, title, token_days, token_expiry, verify_days, verify_url
- **non-html views**: email_html:closure, email_html:core, email_html:reset_password_days, email_html:reset_password_url, email_html:token_days, email_html:token_expiry, email_html:verify_days, email_html:verify_url
- **view aliases**: :verify_days -> :token_days, :reset_password_days -> :token_days
- **event hooks**: 30 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AccountField, AccountHolder, IdList, List
- **Cardio config keys**: account_password_length, account_password_requirements
- **haml templates**: 6
- **lib ruby files**: 1

### card-mod-ace_editor-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views); pins=2/10
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=10 it(), byte-pins=2
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (10 it() blocks, 2 toBe(<literal>) pins)
- **set modules by pattern**: all=1, self=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-api_key-0.20.0

- **status**: `declared-complete`
- **verdict**: 6 mod-specific view(s) declared: api_key, buttons, current, generate_button, token, token_link
- **evidence**: 7/7 html views in HTML_VIEWS∪mod-manifests (6/6 mod-specific); mod-loader pins: manifest=yes, test=34 it(), byte-pins=14
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (34 it() blocks, 14 toBe(<literal>) pins)
- **set modules by pattern**: right=2
- **mod-specific html views (covered/total)**: 6/6 (api_key, buttons, current, generate_button, token, token_link)
- **all html views declared**: api_key, buttons, core, current, generate_button, token, token_link
- **non-html views**: json:buttons, json:core, json:current, json:generate_button, json:token, json:token_link
- **view aliases**: (none)
- **event hooks**: 2 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AccountField
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-assets-0.20.0

- **status**: `declared-complete`
- **verdict**: 2 mod-specific view(s) declared: javascript_include_tag, stylesheet_include_tag
- **evidence**: 3/3 html views in HTML_VIEWS∪mod-manifests (2/2 mod-specific); mod-loader pins: manifest=yes, test=15 it(), byte-pins=6
- **mod-loader manifest**: yes (4 views registered)
- **byte-pinned test**: yes (15 it() blocks, 6 toBe(<literal>) pins)
- **set modules by pattern**: abstract=8, right=3, type=1
- **mod-specific html views (covered/total)**: 2/2 (javascript_include_tag, stylesheet_include_tag)
- **all html views declared**: core, javascript_include_tag, stylesheet_include_tag
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 5 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: CodeFile, Items, List, Lock, ManifestGroup, ReadOnly, Sources, VirtualCache
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 1

### card-mod-bar_and_box-0.20.0

- **status**: `declared-complete`
- **verdict**: 11 mod-specific view(s) declared: bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, ...
- **evidence**: 17/17 html views in HTML_VIEWS∪mod-manifests (11/11 mod-specific)
- **mod-loader manifest**: no
- **byte-pinned test**: no
- **set modules by pattern**: abstract=1, all=2, type=1
- **mod-specific html views (covered/total)**: 11/11 (accordion_bar, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, boxed, boxed_link, closed_bar, expanded_bar, full_bar, mini_bar, open_bar)
- **all html views declared**: accordion_bar, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, boxed, boxed_link, closed, closed_bar, expanded_bar, full_bar, mini_bar, open, open_bar
- **non-html views**: (none)
- **view aliases**: :closed_bar -> :closed, :accordion_bar -> :closed, :open_bar -> :open, :expanded_bar -> :open
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 5
- **lib ruby files**: 0

### card-mod-bootstrap-0.20.0

- **status**: `declared-complete`
- **verdict**: 10 mod-specific view(s) declared: bar_bottom, bar_left, bar_middle, bar_right, carousel, customize_button, ...
- **evidence**: 11/11 html views in HTML_VIEWS∪mod-manifests (10/10 mod-specific); mod-loader pins: manifest=yes, test=32 it(), byte-pins=21
- **mod-loader manifest**: yes (12 views registered)
- **byte-pinned test**: yes (32 it() blocks, 21 toBe(<literal>) pins)
- **set modules by pattern**: abstract=4, all=2, self=2, type=2, type_plus_right=1
- **mod-specific html views (covered/total)**: 10/10 (bar_bottom, bar_left, bar_middle, bar_right, carousel, customize_button, icons, input, one_line_content, progress_bar)
- **all html views declared**: bar_bottom, bar_left, bar_middle, bar_right, carousel, core, customize_button, icons, input, one_line_content, progress_bar
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 6 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AssetInputter, BootstrapCodeFile, Media, Scss, SkinBox, SkinField
- **Cardio config keys**: icon_libraries
- **haml templates**: 11
- **lib ruby files**: 16

### card-mod-carrierwave-0.20.0

- **status**: `declared-complete`
- **verdict**: 6 mod-specific view(s) declared: content_changes, full_width, input, link_tag, preview_editor, source
- **evidence**: 8/8 html views in HTML_VIEWS∪mod-manifests (6/6 mod-specific); mod-loader pins: manifest=yes, test=36 it(), byte-pins=21
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (36 it() blocks, 21 toBe(<literal>) pins)
- **set modules by pattern**: abstract=2, all=1, self=5, type=3
- **mod-specific html views (covered/total)**: 6/6 (content_changes, full_width, input, link_tag, preview_editor, source)
- **all html views declared**: content, content_changes, core, full_width, input, link_tag, preview_editor, source
- **non-html views**: json:content, json:core, json:image_complete, json:inline, json:input, json:one_line_content, json:preview_editor, json:source, file:content, file:core, file:inline, file:input, file:one_line_content, file:preview_editor, file:source, email_html:content, email_html:core, email_html:inline, email_html:one_line_content, email_html:source, css:content, css:core, css:inline, css:one_line_content, css:source
- **view aliases**: (none)
- **event hooks**: 24 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: file_buckets, file_default_bucket, file_storage, files_web_path
- **haml templates**: 3
- **lib ruby files**: 7

### card-mod-collection-0.20.0

- **status**: `declared-complete`
- **verdict**: 2 mod-specific view(s) declared: count, paging — 1 declared view name(s) NOT in the implemented surface: paging_urls
- **evidence**: 2/3 html views in HTML_VIEWS∪mod-manifests (2/3 mod-specific); mod-loader pins: manifest=yes, test=22 it(), byte-pins=16
- **mod-loader manifest**: yes (2 views registered)
- **byte-pinned test**: yes (22 it() blocks, 16 toBe(<literal>) pins)
- **set modules by pattern**: abstract=3, all=3
- **mod-specific html views (covered/total)**: 2/3 (count, paging, paging_urls)
- **all html views declared**: count, paging, paging_urls
- **non-html views**: json:paging, json:paging_urls, jsonld:paging, jsonld:paging_urls
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 1

### card-mod-comment-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views); pins=4/12
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=12 it(), byte-pins=4
- **mod-loader manifest**: yes (7 views registered)
- **byte-pinned test**: yes (12 it() blocks, 4 toBe(<literal>) pins)
- **set modules by pattern**: all=1, right=2
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 1 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: Permission
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-content-0.20.0

- **status**: `declared-complete`
- **verdict**: 4 mod-specific view(s) declared: bar_middle, file_size, input, one_line_content
- **evidence**: 5/5 html views in HTML_VIEWS∪mod-manifests (4/4 mod-specific); mod-loader pins: manifest=yes, test=16 it(), byte-pins=9
- **mod-loader manifest**: yes (4 views registered)
- **byte-pinned test**: yes (16 it() blocks, 9 toBe(<literal>) pins)
- **set modules by pattern**: abstract=7, all=3, right=2, self=2
- **mod-specific html views (covered/total)**: 4/4 (bar_middle, file_size, input, one_line_content)
- **all html views declared**: bar_middle, core, file_size, input, one_line_content
- **non-html views**: rss:one_line_content
- **view aliases**: (none)
- **event hooks**: 3 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: CodeContent, Sources, TemplatedNests
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 7

### card-mod-date-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (20 pins across 32 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: 1/1 html views in HTML_VIEWS∪mod-manifests (0/0 mod-specific); mod-loader pins: manifest=yes, test=32 it(), byte-pins=20
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (32 it() blocks, 20 toBe(<literal>) pins)
- **set modules by pattern**: all=1, right=2, self=1, type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-defaults-0.20.0

- **status**: `ignored`
- **verdict**: unported (not evaluated)
- **evidence**: no meaningful set/ tree; config-only or backend-only gem
- **mod-loader manifest**: no
- **byte-pinned test**: no
- **set modules by pattern**: (none)
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-delayed_job-0.20.0

- **status**: `ignored`
- **verdict**: unported (not evaluated)
- **evidence**: no meaningful set/ tree; config-only or backend-only gem
- **mod-loader manifest**: no
- **byte-pinned test**: no
- **set modules by pattern**: (none)
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: delaying
- **haml templates**: 0
- **lib ruby files**: 2

### card-mod-edit-0.20.0

- **status**: `declared-complete`
- **verdict**: 41 mod-specific view(s) declared: board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ...
- **evidence**: 42/42 html views in HTML_VIEWS∪mod-manifests (41/41 mod-specific); mod-loader pins: manifest=yes, test=9 it(), byte-pins=3
- **mod-loader manifest**: yes (45 views registered)
- **byte-pinned test**: yes (9 it() blocks, 3 toBe(<literal>) pins)
- **set modules by pattern**: all=15, right=2, self=1, type=3
- **mod-specific html views (covered/total)**: 41/41 (board, board_type_formgroup, cardboard, conflict_tracker, content_formgroup, content_formgroups, edit, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, engage_tab, follow_section, guide_tab, history_tab, input, just_deleted, name_form, name_formgroup, new, new_buttons, new_fields, new_in_modal, new_in_modal_buttons, new_type_formgroup, overlay_guide, read_form, read_formgroup, related_tab, rules_tab, simple_new, type_formgroup)
- **all html views declared**: board, board_type_formgroup, cardboard, conflict_tracker, content_formgroup, content_formgroups, edit, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, engage_tab, follow_section, guide_tab, history_tab, input, just_deleted, name_form, name_formgroup, new, new_buttons, new_fields, new_in_modal, new_in_modal_buttons, new_type_formgroup, overlay_guide, read_form, read_formgroup, related_tab, rules_tab, simple_new, type_formgroup
- **non-html views**: (none)
- **view aliases**: :cardboard -> :board
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 5
- **lib ruby files**: 0

### card-mod-email-0.20.0

- **status**: `declared-complete`
- **verdict**: 2 mod-specific view(s) declared: compact_missing, email_page
- **evidence**: 5/5 html views in HTML_VIEWS∪mod-manifests (2/2 mod-specific); mod-loader pins: manifest=yes, test=10 it(), byte-pins=4
- **mod-loader manifest**: yes (6 views registered)
- **byte-pinned test**: yes (10 it() blocks, 4 toBe(<literal>) pins)
- **set modules by pattern**: abstract=2, all=2, right=7, type=2
- **mod-specific html views (covered/total)**: 2/2 (compact_missing, email_page)
- **all html views declared**: compact_missing, content, core, email_page, unknown
- **non-html views**: email_text:compact_missing, email_text:last_action, email_text:unknown, email_html:compact_missing, email_html:core, email_html:email_page, email_html:unknown
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: EmailField, TestContext
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 2

### card-mod-follow-0.20.0

- **status**: `declared-complete`
- **verdict**: 12 mod-specific view(s) declared: confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ...
- **evidence**: 13/13 html views in HTML_VIEWS∪mod-manifests (12/12 mod-specific); mod-loader pins: manifest=yes, test=12 it(), byte-pins=5
- **mod-loader manifest**: yes (19 views registered)
- **byte-pinned test**: yes (12 it() blocks, 5 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=4, right=8, self=7, type=4, type_plus_right=1
- **mod-specific html views (covered/total)**: 12/12 (confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, follow_status, follow_tab, ignore_tab, one_line_content, rule_editor, status)
- **all html views declared**: confirm_update_all, core, edit, edit_buttons, errors, follow_button, follow_item, follow_status, follow_tab, ignore_tab, one_line_content, rule_editor, status
- **non-html views**: json:follow_button, json:follow_status
- **view aliases**: (none)
- **event hooks**: 10 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: FollowOption, List
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-format-0.20.0

- **status**: `declared-complete`
- **verdict**: 46 mod-specific view(s) declared: add_button, add_link, add_url, admin, bar_right, board_link, ...
- **evidence**: 57/57 html views in HTML_VIEWS∪mod-manifests (46/46 mod-specific); mod-loader pins: manifest=yes, test=49 it(), byte-pins=8
- **mod-loader manifest**: yes (54 views registered)
- **byte-pinned test**: yes (49 it() blocks, 8 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=20, right=1, self=1, type=10
- **mod-specific html views (covered/total)**: 46/46 (add_button, add_link, add_url, admin, bar_right, board_link, closed_content, compact_missing, configure_button, configure_link, conflict, content_panel, content_with_title, debug_server_error, demo, denial, edit_button, edit_link, errors, favicon_tag, flash, full_page_link, head, header, header_title, help_link, hidden_content_field, input, label, labeled, labeled_editor, menu_block, meta_tags, not_found, one_line_content, page_title, page_title_tag, raw_one_line_content, rss_links, server_error, short_content, smart_label, stylesheet_tags, title_link, title_no_link, type, type_info, universal_edit_button, url_link, view_list)
- **all html views declared**: add_button, add_link, add_url, admin, bar_right, board_link, closed_content, compact_missing, configure_button, configure_link, conflict, content, content_panel, content_with_title, core, debug_server_error, demo, denial, edit_button, edit_link, errors, favicon_tag, flash, full_page_link, head, header, header_title, help_link, hidden_content_field, input, label, labeled, labeled_editor, menu, menu_block, meta_tags, mini_unknown, not_found, one_line_content, page_title, page_title_tag, raw_one_line_content, rss_links, server_error, short_content, smart_label, stylesheet_tags, title, title_link, title_no_link, titled, type, type_info, universal_edit_button, unknown, url_link, view_list
- **non-html views**: jsonld:bad_address, jsonld:compact_missing, jsonld:denial, jsonld:errors, jsonld:format_unsupported, jsonld:items, jsonld:not_found, jsonld:server_error, jsonld:test, jsonld:unknown, css:content, css:import, css:titled, css:unknown, css:url, csv:body, csv:header, csv:row, csv:titled, csv:unknown, data:ancestors, data:atom, data:cast, data:content, data:core, data:items, data:links, data:molecule, data:nucleus, data:pod, json:bad_address, json:compact_missing, json:denial, json:errors, json:format_unsupported, json:not_found, json:page, json:server_error, json:status, json:test, json:unknown, file:core, file:style, js:source, rss:closed, rss:comment_box, rss:content, rss:feed, rss:feed_body, rss:feed_description, rss:feed_item, rss:feed_item_description, rss:feed_title, rss:menu, rss:open, rss:open_content, text:core, text:text_without_nests, yaml:core
- **view aliases**: :open -> :titled, :closed -> :labeled, :closed_content -> :one_line_content, :server_error -> :errors, :denial -> :errors, :not_found -> :errors, :server_error -> :errors, :open -> :titled, ...(3 more)
- **event hooks**: 2 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: default_html_view, rss_enabled
- **haml templates**: 6
- **lib ruby files**: 16

### card-mod-help-0.20.0

- **status**: `declared-complete`
- **verdict**: 5 mod-specific view(s) declared: guide, help, help_text, lead, popover
- **evidence**: 5/5 html views in HTML_VIEWS∪mod-manifests (5/5 mod-specific); mod-loader pins: manifest=yes, test=14 it(), byte-pins=8
- **mod-loader manifest**: yes (5 views registered)
- **byte-pinned test**: yes (14 it() blocks, 8 toBe(<literal>) pins)
- **set modules by pattern**: all=2, right=2, self=2
- **mod-specific html views (covered/total)**: 5/5 (guide, help, help_text, lead, popover)
- **all html views declared**: guide, help, help_text, lead, popover
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: TemplatedNests
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-history-0.20.0

- **status**: `declared-complete`
- **verdict**: 12 mod-specific view(s) declared: act, act_legend, action_expanded, action_summary, board_act, change, ...
- **evidence**: 12/12 html views in HTML_VIEWS∪mod-manifests (12/12 mod-specific); mod-loader pins: manifest=yes, test=40 it(), byte-pins=39
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (40 it() blocks, 39 toBe(<literal>) pins)
- **set modules by pattern**: all=3
- **mod-specific html views (covered/total)**: 12/12 (act, act_legend, action_expanded, action_summary, board_act, change, creator_credit, draft_legend, history, last_action, last_action_verb, updated_by)
- **all html views declared**: act, act_legend, action_expanded, action_summary, board_act, change, creator_credit, draft_legend, history, last_action, last_action_verb, updated_by
- **non-html views**: json:actions, json:history
- **view aliases**: (none)
- **event hooks**: 6 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: acts_per_page
- **haml templates**: 0
- **lib ruby files**: 12

### card-mod-integrate-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (21 pins across 28 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=28 it(), byte-pins=21
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (28 it() blocks, 21 toBe(<literal>) pins)
- **set modules by pattern**: all=1, right=3, self=4
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 1 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-layout-0.20.0

- **status**: `declared-complete`
- **verdict**: 24 mod-specific view(s) declared: bar_bottom, close_modal_link, edit_inline, head_content, input, invite, ...
- **evidence**: 25/25 html views in HTML_VIEWS∪mod-manifests (24/24 mod-specific); mod-loader pins: manifest=yes, test=37 it(), byte-pins=7
- **mod-loader manifest**: yes (26 views registered)
- **byte-pinned test**: yes (37 it() blocks, 7 toBe(<literal>) pins)
- **set modules by pattern**: abstract=4, all=6, right=3, self=8, type=2
- **mod-specific html views (covered/total)**: 24/24 (bar_bottom, close_modal_link, edit_inline, head_content, input, invite, modal, modal_footer, modal_link, modal_menu, modal_title, my_card, nav_item, nav_link_in_dropdown, navbar_links, one_line_content, overlay_header, overlay_help_link, overlay_menu, overlay_title, pop_out_modal_link, sign_in, sign_out, sign_up)
- **all html views declared**: bar_bottom, close_modal_link, core, edit_inline, head_content, input, invite, modal, modal_footer, modal_link, modal_menu, modal_title, my_card, nav_item, nav_link_in_dropdown, navbar_links, one_line_content, overlay_header, overlay_help_link, overlay_menu, overlay_title, pop_out_modal_link, sign_in, sign_out, sign_up
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 3 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AccountDropdown, Items, Type::Html
- **Cardio config keys**: (none)
- **haml templates**: 3
- **lib ruby files**: 5

### card-mod-list-0.20.0

- **status**: `declared-complete`
- **verdict**: 5 mod-specific view(s) declared: input, list, nest_list_input, one_line_content, view_list
- **evidence**: 6/6 html views in HTML_VIEWS∪mod-manifests (5/5 mod-specific); mod-loader pins: manifest=yes, test=15 it(), byte-pins=15
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (15 it() blocks, 15 toBe(<literal>) pins)
- **set modules by pattern**: abstract=6, all=1, right=2, self=3, type=4
- **mod-specific html views (covered/total)**: 5/5 (input, list, nest_list_input, one_line_content, view_list)
- **all html views declared**: core, input, list, nest_list_input, one_line_content, view_list
- **non-html views**: csv:content, csv:core, csv:links, csv:titled, js:content, js:core, js:links, js:titled, data:content, data:core, data:links, data:titled, json:content, json:core, json:links, json:titled, css:content, css:core, css:links, css:titled, rss:content, rss:core, rss:links, rss:titled
- **view aliases**: (none)
- **event hooks**: 5 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: Items, List, Paging, ReferenceList
- **Cardio config keys**: (none)
- **haml templates**: 8
- **lib ruby files**: 0

### card-mod-markdown-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (15 pins across 14 it()): core — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: 1/1 html views in HTML_VIEWS∪mod-manifests (0/0 mod-specific); mod-loader pins: manifest=yes, test=14 it(), byte-pins=15
- **mod-loader manifest**: yes (1 views registered)
- **byte-pinned test**: yes (14 it() blocks, 15 toBe(<literal>) pins)
- **set modules by pattern**: type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-permissions-0.20.0

- **status**: `declared-complete`
- **verdict**: 3 mod-specific view(s) declared: input, one_line_content, pointer_core
- **evidence**: 4/4 html views in HTML_VIEWS∪mod-manifests (3/3 mod-specific); mod-loader pins: manifest=yes, test=33 it(), byte-pins=33
- **mod-loader manifest**: yes (4 views registered)
- **byte-pinned test**: yes (33 it() blocks, 33 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=2, right=4, self=4
- **mod-specific html views (covered/total)**: 3/3 (input, one_line_content, pointer_core)
- **all html views declared**: core, input, one_line_content, pointer_core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 7 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: Permission
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-recaptcha-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (12 pins across 40 it()): core — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: 1/1 html views in HTML_VIEWS∪mod-manifests (0/0 mod-specific); mod-loader pins: manifest=yes, test=40 it(), byte-pins=12
- **mod-loader manifest**: yes (1 views registered)
- **byte-pinned test**: yes (40 it() blocks, 12 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=1, right=3, self=3
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 3 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: RecaptchaSetting
- **Cardio config keys**: recaptcha_minimum_score, recaptcha_private_key, recaptcha_proxy, recaptcha_public_key, recaptcha_secret_key, recaptcha_site_key, recaptcha_verify_url
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-rules-0.20.0

- **status**: `declared-complete`
- **verdict**: 34 mod-specific view(s) declared: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, ...
- **evidence**: 35/35 html views in HTML_VIEWS∪mod-manifests (34/34 mod-specific); mod-loader pins: manifest=yes, test=29 it(), byte-pins=19
- **mod-loader manifest**: yes (30 views registered)
- **byte-pinned test**: yes (29 it() blocks, 19 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=3, right=4, rstar=1, rule=8, self=2, type=4, type_plus_right=1
- **mod-specific html views (covered/total)**: 34/34 (accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, bar_setting_list, board_rules_tab, card_select, filtered_accordion_rule_list, grouped_list, help_text, input, modal_nest_rules, modal_pill_setting_list, modal_rule, nest_rules, one_line_content, overlay_rule, overlay_rule_list_link, overlay_title, pill_setting_list, quick_edit, quick_edit_setting_list, quick_edit_success, raw_one_line_content, rule_board_link, rule_edit, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, set_label, template_link)
- **all html views declared**: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, bar_setting_list, board_rules_tab, card_select, core, filtered_accordion_rule_list, grouped_list, help_text, input, modal_nest_rules, modal_pill_setting_list, modal_rule, nest_rules, one_line_content, overlay_rule, overlay_rule_list_link, overlay_title, pill_setting_list, quick_edit, quick_edit_setting_list, quick_edit_success, raw_one_line_content, rule_board_link, rule_edit, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, set_label, template_link
- **non-html views**: data:core, data:one_line_content, data:rule_help, json:core, json:one_line_content, json:rule_help
- **view aliases**: (none)
- **event hooks**: 1 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: List, Type::SearchType, VirtualSet
- **Cardio config keys**: (none)
- **haml templates**: 4
- **lib ruby files**: 0

### card-mod-script-0.20.0

- **status**: `declared-complete`
- **verdict**: 5 mod-specific view(s) declared: javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables — 1 declared view name(s) NOT in the implemented surface: compressed
- **evidence**: 6/7 html views in HTML_VIEWS∪mod-manifests (5/6 mod-specific); mod-loader pins: manifest=yes, test=18 it(), byte-pins=14
- **mod-loader manifest**: yes (6 views registered)
- **byte-pinned test**: yes (18 it() blocks, 14 toBe(<literal>) pins)
- **set modules by pattern**: abstract=7, all=1, right=1, self=1, type=4, type_plus_right=2
- **mod-specific html views (covered/total)**: 5/6 (compressed, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables)
- **all html views declared**: compressed, core, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables
- **non-html views**: js:compressed, js:core, js:javascript_include_tag
- **view aliases**: (none)
- **event hooks**: 2 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AssetFile, AssetGroup, AssetInputter, AssetOutputter, AssetScript, CoffeeScript, FolderGroup, JavaScript, LocalManifestGroup, ModAssets, Script, ScriptGroup
- **Cardio config keys**: double_click
- **haml templates**: 0
- **lib ruby files**: 2

### card-mod-search-0.20.0

- **status**: `declared-complete`
- **verdict**: 11 mod-specific view(s) declared: add_autocomplete_item, bar, card_list, checkbox_list, count, goto_autocomplete_item, ... — 9 declared view name(s) NOT in the implemented surface: body, complete, feed_body, feed_item_description, molecule, name_complete, name_match, search_box, ...
- **evidence**: 14/23 html views in HTML_VIEWS∪mod-manifests (11/20 mod-specific); mod-loader pins: manifest=yes, test=28 it(), byte-pins=5
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (28 it() blocks, 5 toBe(<literal>) pins)
- **set modules by pattern**: abstract=6, all=1, right=17, self=2, type=2
- **mod-specific html views (covered/total)**: 11/20 (add_autocomplete_item, bar, body, card_list, checkbox_list, complete, count, feed_body, feed_item_description, goto_autocomplete_item, molecule, name_complete, name_match, one_line_content, results_for_keyword, search_box, search_box_complete, search_count, search_error, select2_option)
- **all html views declared**: add_autocomplete_item, bar, body, card_list, checkbox_list, complete, core, count, feed_body, feed_item_description, goto_autocomplete_item, molecule, name_complete, name_match, no_search_results, one_line_content, results_for_keyword, search_box, search_box_complete, search_count, search_error, select2_option, title
- **non-html views**: json:add_autocomplete_item, json:body, json:card_list, json:checkbox_list, json:complete, json:core, json:goto_autocomplete_item, json:molecule, json:name_complete, json:name_match, json:no_search_results, json:results_for_keyword, json:search_box, json:search_box_complete, json:search_count, json:search_error, json:select2_option, json:title, rss:bar, rss:core, rss:feed_body, rss:feed_item_description, rss:one_line_content, rss:title, data:body, data:card_list, data:checkbox_list, data:molecule, data:name_complete, data:name_match, data:no_search_results, data:search_count, data:search_error, csv:body, csv:card_list, csv:checkbox_list, csv:molecule, csv:name_complete, csv:name_match, csv:no_search_results, csv:search_count, csv:search_error
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: CodeContent, CqlSearch, Items, Paging, Search, SearchViews, Type::Json, VirtualSearch
- **Cardio config keys**: paging_limit, search_box_match_start_only
- **haml templates**: 5
- **lib ruby files**: 1

### card-mod-session-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (5 pins across 7 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=7 it(), byte-pins=5
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (7 it() blocks, 5 toBe(<literal>) pins)
- **set modules by pattern**: all=1, type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 4 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: Pointer
- **Cardio config keys**: allow_anonymous_cookies
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-style-0.20.0

- **status**: `declared-complete`
- **verdict**: 9 mod-specific view(s) declared: box, box_bottom, box_middle, customize_button, labeled, remote_include_tags, ... — 3 declared view name(s) NOT in the implemented surface: compiled, compressed, import
- **evidence**: 10/13 html views in HTML_VIEWS∪mod-manifests (9/12 mod-specific); mod-loader pins: manifest=yes, test=17 it(), byte-pins=37
- **mod-loader manifest**: yes (8 views registered)
- **byte-pinned test**: yes (17 it() blocks, 37 toBe(<literal>) pins)
- **set modules by pattern**: abstract=7, self=2, type=5, type_plus_right=2
- **mod-specific html views (covered/total)**: 9/12 (box, box_bottom, box_middle, compiled, compressed, customize_button, import, labeled, remote_include_tags, remote_style_tags, stylesheet_include_tag, stylesheet_path)
- **all html views declared**: box, box_bottom, box_middle, compiled, compressed, core, customize_button, import, labeled, remote_include_tags, remote_style_tags, stylesheet_include_tag, stylesheet_path
- **non-html views**: css:compiled, css:compressed, css:concat, css:core, css:import, css:labeled, scss:compiled, scss:core, scss:labeled, scss:stylesheet_include_tag
- **view aliases**: (none)
- **event hooks**: 3 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: AssetFile, AssetGroup, AssetInputter, AssetOutputter, AssetStyle, Css, FolderGroup, List, LocalManifestGroup, ModAssets, Scss, SkinBox, StyleGroup
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 0

### card-mod-tabs-0.20.0

- **status**: `declared-complete`
- **verdict**: 4 mod-specific view(s) declared: pills, pills_static, tabs, tabs_static
- **evidence**: 4/4 html views in HTML_VIEWS∪mod-manifests (4/4 mod-specific); mod-loader pins: manifest=yes, test=10 it(), byte-pins=3
- **mod-loader manifest**: yes (4 views registered)
- **byte-pinned test**: yes (10 it() blocks, 3 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1, all=1
- **mod-specific html views (covered/total)**: 4/4 (pills, pills_static, tabs, tabs_static)
- **all html views declared**: pills, pills_static, tabs, tabs_static
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: BsBadge
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-tinymce_editor-0.20.0

- **status**: `declared-complete`
- **verdict**: 11 mod-specific view(s) declared: change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, ...
- **evidence**: 11/11 html views in HTML_VIEWS∪mod-manifests (11/11 mod-specific); mod-loader pins: manifest=yes, test=33 it(), byte-pins=31
- **mod-loader manifest**: yes (12 views registered)
- **byte-pinned test**: yes (33 it() blocks, 31 toBe(<literal>) pins)
- **set modules by pattern**: all=3, self=1
- **mod-specific html views (covered/total)**: 11/11 (change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, nest_editor, nest_image, new_image, new_image_buttons, open_nest_editor)
- **all html views declared**: change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, nest_editor, nest_image, new_image, new_image_buttons, open_nest_editor
- **non-html views**: js:change_create_to_update, js:modal_nest_image, js:nest_image, js:new_image, js:new_image_buttons, js:open_nest_editor
- **view aliases**: (none)
- **event hooks**: 0 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 10
- **lib ruby files**: 1

### card-mod-virtual-0.20.0

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (16 pins across 33 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=33 it(), byte-pins=16
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (33 it() blocks, 16 toBe(<literal>) pins)
- **set modules by pattern**: abstract=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 2 (counted, not listed: this report does not measure whether a hook fires)
- **before hooks**: 0 (counted, not listed, for the same reason)
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 1

## Method

Per gem, walk `set/**/*.rb` and `lib/**/*.rb`, mine via regex:
- `view :name` and `view :name, :target` (aliases)
- `format :name do ... end` (which views live inside which format)
- `def name` (set-module methods), `event :name` and `before :view` (counted only; the names are not emitted), `include_set Abstract::Foo`
- `Cardio::Railtie.config.tap { |c| c.key = ... }` (config keys)

Compare against decko-ts `src/card/set-patterns/registry.ts` PATTERN_TABLE
(which set patterns are registered) and `src/card/render/views.ts` HTML_VIEWS
UNIONED with every registered mod's manifest views under
`src/card/mod-loader/mods/*.ts` (the engine resolves both —
HTML_VIEWS is the seed table, the mod loader's `viewsTable` is the
post-load live table). Status thresholds — all declaration-level:
- **declared-complete**: either (a) >=50% of the MOD-SPECIFIC html view NAMES the mod declares exist in the implemented surface AND >=50% of the patterns the mod uses are implemented AND the mod has pattern-backed set modules; OR (b) the mod has a registered manifest under `src/card/mod-loader/mods/` AND a byte-pinned test under `tests/card/mod-loader/` with >=5 `toBe(<literal>)` assertions (the byte-pin criterion). Neither branch renders the mod end to end: (a) compares names, (b) pins the bytes of the views its tests render only.
- **partial**: some declarations (any html view name present, or >=50% pattern coverage, or lib/ + permissions, or a manifest + partial pin file), but not enough for declared-complete.
- **missing**: zero coverage.
- **ignored**: not ported, and therefore not evaluated here - data/transform-only or backend-only gems with no set/ tree, so there is no set module or view to compare against the implemented surface.

NOT measured by any label above: whether event hooks fire (they are
counted, never listed), whether
non-html formats (json, css, email, rss, csv) render, and whether any
renderer beyond the byte-pinned views matches Ruby's bytes. See
`docs/coverage-inventory.md` for where byte-level evidence actually
exists, and `docs/decisions/0004-mods-compiled-into-the-view-registry.md`
for caveats, false positives, and the boundary cases that move a mod
between categories.
