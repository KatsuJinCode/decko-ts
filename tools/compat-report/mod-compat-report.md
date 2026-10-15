# card-mod compatibility report — decko-ts

Generated: 2026-10-15T08:07:03.446Z
Gem dir:   $GEM_HOME
Repo:      REPO_ROOT

## Summary

Mods scanned: **33**

- declared-complete:  **31**
- partial: **1**
- missing: **0**
- ignored: **1** (not ported, so not evaluated)

**What these labels measure: declarations only.** "declared-complete" is a THRESHOLD, not a statement that every view is present. The generator calls a mod declared-complete when EITHER (a) at least 50% of the mod-specific html view names it declares exist in the implemented surface, AND at least 50% of the set patterns it uses are implemented, AND it has pattern-backed set modules; OR (b) it has a registered manifest plus a byte-pinned test file with 5 or more `toBe(<literal>)` pins. A mod can therefore hold the label with view names still missing — read the `covered/total` column per mod to see which. They do NOT measure behaviour: that is the Behavioural verdict below, which grades each declared view and event against Ruby. Non-html formats (json, css, email, rss, csv) are rendered by no instrument here. The threshold is decision 0004's rubric, unchanged; where a figure from this report is quoted, the covered/total it rests on is quoted with it. Where the evidence for what IS byte-proven lives: `docs/coverage-inventory.md`.

## Behavioural verdict

Behaviour-complete: **3** of 32 evaluated mods. Across them, 364 of 562 declared views are rendered by a graded operation and byte-identical to Ruby's captured answer, 82 are graded and differ, 51 are exercised by no operation, and 3 of 126 declared events are graded on the rows they leave, identical to Ruby's (62 differ, 47 ran but show no effect against a same-shape baseline, 3 could not be realised as a probe on this deck). A further **4** have every declared view graded identical to Ruby but an event that no probe here observes: `card-mod-integrate-0.20.0`, `card-mod-recaptcha-0.20.0`, `card-mod-session-0.20.0`, `card-mod-virtual-0.20.0`. Declaring neither views nor events, so nothing here grades them: `card-mod-ace_editor-0.20.0`, `card-mod-delayed_job-0.20.0`. Seed-only, evaluated by seed comparison: `card-mod-defaults-0.20.0`. Not evaluated: (none).

A mod is **behaviour-complete** only when every view it declares (any format) is rendered by at least one graded operation and every such operation is byte-identical to Ruby's captured answer (after the grader's N1-N8 rules), AND every event it declares is run as a probe on the deck and leaves the rows Ruby's leaves. A test that names a view (`test-named`) or an event (`named`) is listed as a pointer and never counts, because a name match shows neither what the test asserts nor where its expected bytes came from. Attribution is by view name and set membership (see `tools/compat-report/behaviour.mjs`): a graded operation credits a declaration only when its card belongs to the declaring file's set; all/, lib/ and abstract/ declarations apply by name alone. Withheld operations are credited when the withheld set is present at grading.

The event probes are the `synthetic-v2-mod-probes` fixture (`reference-harness/fixtures/synthetic-v2-mod-probes`): the same synthetic-v2 deck, one write scenario whose steps create, update and delete a probe card for each event declaration (and the same three writes on a card of the same shape as its baseline), with Ruby's answers captured by the oracle adapter. Each step is graded for persistence (the rows the write leaves) and side effects (saved, errors, mail). An event is counted only where its probe's rows DIFFER from the baseline's - a probe whose rows match the baseline shows the event did not fire, and two writes that both did nothing are not a match of behaviour. Engine commit 75186d066f5c24849dd42e445eab4cc669e28186 (dirty), graded 2026-10-15T07:55:53.256Z: persistence 116/527, side effects 23/527, rendering 365/444.

Grades this verdict rests on (`tools/compat-report/graded-ops.json`):

- `synthetic-v1`: verdict pass, 1754/1754 rendering ops identical; engine commit deb0be4faa78ff7166b3400b297bd89941f3f4bb, graded 2026-10-14T20:37:06.231Z
- `synthetic-v2`: verdict fail, 2540/2581 rendering ops identical; engine commit 014618e3622589e57f3f4073c7ec2f73ffd0cc16, graded 2026-10-15T06:34:09.604Z
- `synthetic-v2 + extra-ops`: verdict fail, 13/21 rendering ops identical; engine commit 46da63b305726e4e463a7e8f1a5d6b080e9ac711, graded 2026-10-14T21:43:53.753Z

| mod | behaviour | views | graded identical | graded differs | test-named, not counted | unexercised views | events | graded identical rows | graded differing rows | ran, no effect seen | no probe possible | named by a test, not counted | unexercised |
|-----|-----------|------:|-----------------:|---------------:|------------:|------------------:|-------:|----------------------:|---------------------:|--------------------:|-----------------:|-----------------------------:|------------:|
| `card-mod-account-0.20.0` | behaviour-incomplete | 30 | 14 | 11 | 2 | 3 | 33 | 3 | 0 | 26 | 1 | 3 | 0 |
| `card-mod-ace_editor-0.20.0` | no-gradable-declarations | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-api_key-0.20.0` | behaviour-incomplete | 10 | 9 | 0 | 1 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-assets-0.20.0` | behaviour-incomplete | 8 | 4 | 1 | 2 | 1 | 5 | 0 | 5 | 0 | 0 | 0 | 0 |
| `card-mod-bar_and_box-0.20.0` | behaviour-complete | 21 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-bootstrap-0.20.0` | behaviour-incomplete | 14 | 7 | 7 | 0 | 0 | 6 | 0 | 3 | 2 | 1 | 0 | 0 |
| `card-mod-carrierwave-0.20.0` | behaviour-incomplete | 25 | 16 | 3 | 3 | 3 | 24 | 0 | 14 | 5 | 0 | 0 | 5 |
| `card-mod-collection-0.20.0` | behaviour-incomplete | 5 | 1 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-comment-0.20.0` | behaviour-incomplete | 7 | 6 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `card-mod-content-0.20.0` | behaviour-incomplete | 9 | 7 | 2 | 0 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `card-mod-date-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-defaults-0.20.0` | seed only (see below) | | | | | | | | | | | | |
| `card-mod-delayed_job-0.20.0` | no-gradable-declarations | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-edit-0.20.0` | behaviour-incomplete | 43 | 38 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-email-0.20.0` | behaviour-incomplete | 11 | 3 | 2 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-follow-0.20.0` | behaviour-incomplete | 24 | 16 | 4 | 3 | 1 | 10 | 0 | 8 | 2 | 0 | 0 | 0 |
| `card-mod-format-0.20.0` | behaviour-incomplete | 154 | 85 | 18 | 26 | 25 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-help-0.20.0` | behaviour-incomplete | 5 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-history-0.20.0` | behaviour-incomplete | 14 | 11 | 1 | 2 | 0 | 6 | 0 | 6 | 0 | 0 | 0 | 0 |
| `card-mod-integrate-0.20.0` | views-graded-events-incomplete | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 0 | 0 | 3 | 0 |
| `card-mod-layout-0.20.0` | behaviour-incomplete | 32 | 27 | 2 | 3 | 0 | 3 | 0 | 1 | 2 | 0 | 0 | 0 |
| `card-mod-list-0.20.0` | behaviour-incomplete | 22 | 12 | 2 | 3 | 5 | 5 | 0 | 5 | 0 | 0 | 0 | 0 |
| `card-mod-markdown-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-permissions-0.20.0` | behaviour-incomplete | 4 | 3 | 1 | 0 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 |
| `card-mod-recaptcha-0.20.0` | views-graded-events-incomplete | 1 | 1 | 0 | 0 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `card-mod-rules-0.20.0` | behaviour-incomplete | 41 | 30 | 10 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| `card-mod-script-0.20.0` | behaviour-incomplete | 13 | 9 | 1 | 2 | 1 | 2 | 0 | 1 | 1 | 0 | 0 | 0 |
| `card-mod-search-0.20.0` | behaviour-incomplete | 32 | 17 | 5 | 1 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-session-0.20.0` | views-graded-events-incomplete | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 3 | 0 | 0 | 0 |
| `card-mod-style-0.20.0` | behaviour-incomplete | 19 | 9 | 1 | 8 | 1 | 3 | 0 | 1 | 2 | 0 | 0 | 0 |
| `card-mod-tabs-0.20.0` | behaviour-incomplete | 5 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-tinymce_editor-0.20.0` | behaviour-incomplete | 11 | 9 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-virtual-0.20.0` | views-graded-events-incomplete | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 |

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

- tests linked: `tests/card/mod-loader/card-mod-account-events.test.ts`, `tests/card/mod-loader/card-mod-account-fields.test.ts`, `tests/card/mod-loader/card-mod-account-forms.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-account.test.ts`
- views graded identical: base:raw [set/right/password.rb] (1 ops), base:reset_password_url [set/right/account/views.rb] (2 ops), base:token_expiry [set/right/account/views.rb] (2 ops), base:verify_url [set/right/account/views.rb] (2 ops), html:closed_account [set/abstract/account_holder.rb] (2 ops), html:configs [set/type/role.rb] (2 ops), html:core [set/right/password.rb] (1 ops), html:core [set/self/signin.rb] (3 ops), html:link_with_checkbox [set/type/role.rb] (2 ops), html:open_content [set/self/signin.rb] (1 ops), html:reset_password_success [set/self/signin.rb] (2 ops), html:setup [set/type/user.rb] (2 ops), html:title [set/self/signin.rb] (3 ops), html:token_expiry [set/right/account/views.rb] (2 ops)
- views graded but differing: base:closure [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:closure; synthetic-v2-mod-probes#probe-view:1:closure@set/right/account/views.rb, base:raw [set/right/salt.rb] differs at synthetic-v2-mod-probes#probe-view:3:raw@set/right/salt.rb, base:reset_password_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:reset_password_days; synthetic-v2-mod-probes#probe-view:4:reset_password_days@set/right/account/views.rb, base:token_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:token_days; synthetic-v2-mod-probes#probe-view:6:token_days@set/right/account/views.rb, base:verify_days [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:verify_days; synthetic-v2-mod-probes#probe-view:8:verify_days@set/right/account/views.rb, html:account_tab [set/abstract/account_holder.rb] differs at synthetic-v2-mod-probes#probe-view:10:account_tab@set/abstract/account_holder.rb, html:core [set/right/account/views.rb] differs at synthetic-v2-mod-probes#probe-view:13:core@set/right/account/views.rb, html:edit_buttons [set/self/signin.rb] differs at synthetic-v2-mod-probes#probe-view:16:edit_buttons@set/self/signin.rb, html:edit [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:edit; synthetic-v2 + extra-ops#view:anonymous:*signin:edit; synthetic-v2-mod-probes#probe-view:17:edit@set/self/signin.rb, html:one_line_content [set/self/signin.rb] differs at synthetic-v2-mod-probes#probe-view:19:one_line_content@set/self/signin.rb, html:open [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:open; synthetic-v2 + extra-ops#view:anonymous:*signin:open; synthetic-v2-mod-probes#probe-view:21:open@set/self/signin.rb
- views only named by a test, not graded: base:raw [set/type_plus_right/user/email.rb], html:core [set/type/signup/views.rb]
- views unexercised: html:content_formgroups [set/type/signup/views.rb], html:new_buttons [set/type/signup/views.rb], html:new [set/type/signup/views.rb]
- events graded identical (rows): generate_token [set/all/account.rb] probe e2 on Probe Plain e2 (no on:); set_stamper [set/all/account.rb] probe e3 on Probe Plain e3 (no on:); validate_account_holder_name_change [set/abstract/account_holder.rb] probe e1 on Probe Plain e1 (update)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: act_as_current_for_integrate_stage [set/type/signup.rb], activate_account [set/right/account/events.rb], approve_with_verification [set/type/signup.rb], approve_without_verification [set/type/signup.rb], auto_approve_with_verification [set/type/signup.rb], check_setup [set/type/user.rb], delete_account [set/right/account/events.rb], downcase_email [set/right/email.rb], encrypt_password [set/right/password.rb], password_redirect [set/right/account/events.rb], reset_password [set/right/account/events.rb], send_reset_password_token [set/self/signin.rb], set_default_salt [set/right/account/events.rb], set_default_status [set/right/account/events.rb], setup_first_user [set/type/user.rb], signin [set/self/signin.rb], signin_after_setup [set/type/user.rb], signin_success [set/self/signin.rb], signout [set/self/signin.rb], signout_upon_delete [set/right/account/events.rb], validate_email [set/right/email.rb], validate_password_chars [set/right/password.rb], validate_password_length [set/right/password.rb], validate_password_present [set/right/password.rb], validate_unique_email [set/right/email.rb], verify_and_activate [set/right/account/events.rb]
- events with no probe: update_role_cache []: set pattern type_plus_right is not probed by this planner
- events unexercised: (none)

#### card-mod-ace_editor-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-ace_editor.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-api_key-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:api_key [set/right/account.rb] (2 ops), html:buttons [set/right/api_key.rb] (2 ops), html:content [set/right/api_key.rb] (1 ops), html:core [set/right/api_key.rb] (3 ops), html:current [set/right/api_key.rb] (2 ops), html:generate_button [set/right/api_key.rb] (2 ops), html:titled_content [set/right/api_key.rb] (1 ops), html:titled [set/right/api_key.rb] (1 ops), html:token_link [set/right/api_key.rb] (2 ops)
- views graded but differing: (none)
- views only named by a test, not graded: json:token [set/right/api_key.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: generate_api_key [set/right/api_key.rb], validate_api_key [set/right/api_key.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-assets-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-assets.test.ts`
- views graded identical: base:not_found [set/right/asset_output.rb] (1 ops), html:core [set/abstract/01_manifest_group.rb] (1410 ops), html:core [set/abstract/mod_assets.rb] (1410 ops), html:javascript_include_tag [set/abstract/asset_file.rb] (2 ops)
- views graded but differing: base:asset_output_url [set/abstract/asset_outputter.rb] differs at synthetic-v2#view:admin:*all+*script:asset_output_url
- views only named by a test, not graded: html:javascript_include_tag [set/right/group_remote.rb], html:stylesheet_include_tag [set/right/group_remote.rb]
- views unexercised: html:core [set/right/group_remote.rb]
- events graded identical (rows): (none)
- events graded but differing rows: asset_input_changed [set/abstract/asset_inputter.rb] differs at mod-event-probes#139; mod-event-probes#140; asset_input_changed_on_delete [set/abstract/asset_inputter.rb] differs at mod-event-probes#144; mod-event-probes#145; remove_codename [set/right/asset_output.rb] differs at mod-event-probes#159; mod-event-probes#160; update_asset_output_file [set/abstract/asset_outputter.rb] differs at mod-event-probes#149; mod-event-probes#150; validate_asset_inputs [set/abstract/asset_outputter.rb] differs at mod-event-probes#154; mod-event-probes#155
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-bar_and_box-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-bar-and-box-views.test.ts`
- views graded identical: base:box_bottom [set/all/box.rb] (2 ops), base:box_middle [set/all/box.rb] (2 ops), base:box_top [set/all/box.rb] (2 ops), base:box [set/all/box.rb] (2 ops), html:accordion_bar [set/all/bar.rb] (2 ops), html:bar_body [set/all/bar.rb] (2 ops), html:bar_bottom [set/all/bar.rb] (1 ops), html:bar_left [set/all/bar.rb] (2 ops), html:bar_menu [set/all/bar.rb] (2 ops), html:bar_middle [set/all/bar.rb] (2 ops), html:bar_right [set/all/bar.rb] (2 ops), html:bar [set/all/bar.rb] (3 ops), html:boxed_link [set/type/image.rb] (1 ops), html:boxed [set/type/image.rb] (1 ops), html:closed_bar [set/all/bar.rb] (2 ops), html:closed [set/all/bar.rb] (2 ops), html:expanded_bar [set/all/bar.rb] (2 ops), html:full_bar [set/all/bar.rb] (2 ops), html:mini_bar [set/all/bar.rb] (2 ops), html:open_bar [set/all/bar.rb] (2 ops), html:open [set/all/bar.rb] (2 ops)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-bootstrap-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-bootstrap-customized-name-existence.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:bar_bottom [set/type/bootswatch_skin/html_views.rb] (3 ops), html:bar_left [set/type/bootswatch_skin/html_views.rb] (2 ops), html:core [set/type/bootswatch_skin/html_views.rb] (3 ops), html:customize_button [set/type/bootswatch_skin/html_views.rb] (2 ops), html:icons [set/all/bootstrap/icon.rb] (2 ops), html:input [set/type/bootswatch_skin.rb] (1 ops), html:progress_bar [set/abstract/progress_bar.rb] (2 ops)
- views graded but differing: html:bar_middle [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:63:bar_middle@set/type_plus_right/bootswatch_skin/colors.rb, html:bar_right [set/type/bootswatch_skin/html_views.rb] differs at synthetic-v2 + extra-ops#view:admin:cerulean skin:bar_right; synthetic-v2-mod-probes#probe-view:64:bar_right@set/type/bootswatch_skin/html_views.rb, html:carousel [set/all/bootstrap/carousel.rb] differs at synthetic-v2-mod-probes#probe-view:65:carousel@set/all/bootstrap/carousel.rb, html:core [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:66:core@set/type_plus_right/bootswatch_skin/colors.rb, html:input [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:70:input@set/type_plus_right/bootswatch_skin/colors.rb, html:one_line_content [set/type/bootswatch_skin.rb] differs at synthetic-v2-mod-probes#probe-view:72:one_line_content@set/type/bootswatch_skin.rb, html:one_line_content [set/type/bootswatch_skin/html_views.rb] differs at synthetic-v2-mod-probes#probe-view:73:one_line_content@set/type/bootswatch_skin/html_views.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: initialize_because_of_type_change [set/type/bootswatch_skin/events.rb] differs at mod-event-probes#169; mod-event-probes#170; update_skin_asset_input [set/abstract/skin_field.rb] differs at mod-event-probes#164; mod-event-probes#165; use_as_current_skin [set/type/bootswatch_skin.rb] differs at mod-event-probes#182; mod-event-probes#183
- events run with no effect seen against the baseline: copy_theme [set/type/bootswatch_skin/events.rb], validate_theme_template [set/type/bootswatch_skin/events.rb]
- events with no probe: translate_variables_to_scss []: set pattern type_plus_right is not probed by this planner
- events unexercised: (none)

#### card-mod-carrierwave-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-carrierwave-events.test.ts`, `tests/card/mod-loader/card-mod-carrierwave-when-predicates.test.ts`, `tests/card/mod-loader/card-mod-carrierwave.test.ts`
- views graded identical: base:core [set/type/file.rb] (21 ops), base:inline [set/type/image.rb] (2 ops), base:source [set/type/file.rb] (2 ops), base:source [set/type/image.rb] (1 ops), html:content_changes [set/type/image/html_views.rb] (2 ops), html:core [set/self/new_file.rb] (1 ops), html:core [set/self/new_image.rb] (1 ops), html:core [set/type/file.rb] (21 ops), html:core [set/type/image/html_views.rb] (7 ops), html:full_width [set/type/image/html_views.rb] (2 ops), html:input [set/self/new_file.rb] (2 ops), html:input [set/type/file.rb] (2 ops), html:link_tag [set/self/favicon.rb] (2 ops), html:source [set/self/favicon.rb] (1 ops), html:source [set/self/new_file.rb] (1 ops), html:source [set/self/new_image.rb] (1 ops)
- views graded but differing: base:one_line_content [set/type/image.rb] differs at synthetic-v2-mod-probes#probe-view:77:one_line_content@set/type/image.rb, html:input [set/self/new_image.rb] differs at synthetic-v2 + extra-ops#view:admin:*new image:input; synthetic-v2-mod-probes#probe-view:87:input@set/self/new_image.rb, html:preview_editor [set/type/file.rb] differs at synthetic-v2-mod-probes#probe-view:90:preview_editor@set/type/file.rb
- views only named by a test, not graded: css:core [set/type/image.rb], file:core [set/type/file.rb], json:image_complete [set/self/search.rb]
- views unexercised: css:content [set/type/image.rb], email_html:inline [set/type/image.rb], json:content [set/type/file.rb]
- events graded identical (rows): (none)
- events graded but differing rows: assign_attachment_on_update [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#196; mod-event-probes#197; change_bucket_if_read_only [set/abstract/attachment/cloud.rb] differs at mod-event-probes#224; mod-event-probes#225; correct_identifier [set/abstract/attachment.rb] differs at mod-event-probes#258; mod-event-probes#259; delete_cached_upload_file_on_update [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#209; mod-event-probes#210; prepare_attachment [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#187; mod-event-probes#188; remove_public_link_on_delete [set/abstract/attachment/local.rb] differs at mod-event-probes#243; mod-event-probes#244; save_original_filename [set/abstract/attachment.rb] differs at mod-event-probes#263; mod-event-probes#264; select_file_revision [set/abstract/attachment.rb] differs at mod-event-probes#253; mod-event-probes#254; uncode_attachment_storage [set/abstract/attachment/coded.rb] differs at mod-event-probes#229; mod-event-probes#230; update_public_link [set/abstract/attachment/local.rb] differs at mod-event-probes#248; mod-event-probes#249; update_storage [set/abstract/attachment/01_storage_type.rb] differs at mod-event-probes#214; mod-event-probes#215; validate_coded_storage_type [set/abstract/attachment/coded.rb] differs at mod-event-probes#234; mod-event-probes#235; validate_storage_type [set/abstract/attachment/01_storage_type.rb] differs at mod-event-probes#219; mod-event-probes#220; write_identifier [set/abstract/attachment.rb] differs at mod-event-probes#272; mod-event-probes#273
- events run with no effect seen against the baseline: assign_attachment_on_create [set/abstract/attachment/00_upload_cache.rb], clear_draft_files [set/abstract/attachment/00_upload_cache.rb], delete_cached_upload_file_on_create [set/abstract/attachment/00_upload_cache.rb], update_public_link_on_create [set/abstract/attachment/local.rb], validate_file_exist [set/abstract/attachment.rb]
- events with no probe: (none)
- events unexercised: mark_remove_<column>_false_event, remove_<column>_event, remove_previously_stored_<column>_event, reset_previous_changes_for_<column>_event, store_<column>_event

#### card-mod-collection-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-collection.test.ts`
- views graded identical: html:paging [set/abstract/paging/paging_views.rb] (2 ops)
- views graded but differing: base:count [set/all/item.rb] differs at synthetic-v2#view:admin:All Topics:count; synthetic-v2-mod-probes#probe-view:94:count@set/all/item.rb, html:count [set/all/item.rb] differs at synthetic-v2#view:admin:All Topics:count; synthetic-v2-mod-probes#probe-view:95:count@set/all/item.rb
- views only named by a test, not graded: (none)
- views unexercised: json:paging_urls [set/abstract/paging/paging_views.rb], jsonld:paging_urls [set/abstract/paging/paging_views.rb]
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-comment-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-comment.test.ts`
- views graded identical: base:comment_box [set/all/comment.rb] (3 ops), base:core [set/right/discussion.rb] (5 ops), base:input [set/right/discussion.rb] (1 ops), base:open [set/right/discussion.rb] (1 ops), base:titled_content [set/right/discussion.rb] (1 ops), base:titled [set/right/discussion.rb] (1 ops)
- views graded but differing: base:open_content [set/right/discussion.rb] differs at synthetic-v2-mod-probes#probe-view:100:open_content@set/right/discussion.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: add_comment [set/all/comment.rb] differs at mod-event-probes#277; mod-event-probes#278
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-content-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:bar_middle [set/abstract/01_code_content.rb] (2 ops), html:core [set/abstract/haml_file.rb] (1410 ops), html:core [set/abstract/templated_nests.rb] (1410 ops), html:file_size [set/abstract/02_code_file.rb] (2 ops), html:input [set/abstract/01_code_content.rb] (2 ops), html:input [set/abstract/haml_file.rb] (2 ops), html:input [set/abstract/read_only.rb] (2 ops)
- views graded but differing: html:one_line_content [set/right/default.rb] differs at synthetic-v2-mod-probes#probe-view:111:one_line_content@set/right/default.rb, html:one_line_content [set/right/structure.rb] differs at synthetic-v2-mod-probes#probe-view:112:one_line_content@set/right/structure.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: reset_cache_to_use_new_structure [set/right/structure.rb] differs at mod-event-probes#287; mod-event-probes#288; update_structurees_references [set/right/structure.rb] differs at mod-event-probes#282; mod-event-probes#283; update_structurees_type [set/right/structure.rb] differs at mod-event-probes#292; mod-event-probes#293
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-date-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:core [set/type/date.rb] (16 ops)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-delayed_job-0.20.0

- tests linked: (none)
- views graded identical: (none)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-edit-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-edit-views.test.ts`, `tests/card/mod-loader/card-mod-edit.test.ts`
- views graded identical: base:template_nest [set/all/template_nest.rb] (2 ops), html:board_type_formgroup [set/all/edit_type.rb] (2 ops), html:cardboard [set/all/editing.rb] (2 ops), html:conflict_tracker [set/all/form.rb] (2 ops), html:content_formgroup [set/all/form.rb] (2 ops), html:content_formgroups [set/all/form.rb] (4 ops), html:edit_buttons [set/all/editing.rb] (2 ops), html:edit_form [set/all/edit_content.rb] (2 ops), html:edit_in_form [set/all/form.rb] (2 ops), html:edit_inline_buttons [set/all/edit_inline.rb] (2 ops), html:edit_inline [set/all/edit_inline.rb] (3 ops), html:edit_name_row [set/all/edit_inline.rb] (2 ops), html:edit_name [set/all/edit_name.rb] (2 ops), html:edit_nests [set/all/editing.rb] (2 ops), html:edit_row [set/all/edit_inline.rb] (2 ops), html:edit_rules [set/all/editing.rb] (2 ops), html:edit_type_form [set/all/edit_type.rb] (2 ops), html:edit_type_row [set/all/edit_type.rb] (2 ops), html:edit_type [set/all/edit_type.rb] (2 ops), html:edit [set/all/edit_content.rb] (3 ops), html:engage_tab [set/all/board/tab_views.rb] (2 ops), html:follow_section [set/all/board/tab_views.rb] (3 ops), html:guide_tab [set/all/board/tab_views.rb] (2 ops), html:input [set/all/editor.rb] (2 ops), html:just_deleted [set/all/editing.rb] (2 ops), html:name_form [set/all/edit_name.rb] (2 ops), html:name_formgroup [set/all/form.rb] (2 ops), html:new_buttons [set/all/new.rb] (4 ops), html:new_fields [set/all/new.rb] (2 ops), html:new_in_modal_buttons [set/all/new.rb] (2 ops), html:new_in_modal [set/all/new.rb] (2 ops), html:new_type_formgroup [set/all/new.rb] (2 ops), html:overlay_guide [set/all/overlay_guide.rb] (2 ops), html:read_form [set/all/formgroup.rb] (2 ops), html:read_formgroup [set/all/formgroup.rb] (2 ops), html:rules_tab [set/all/board/tab_views.rb] (2 ops), html:simple_new [set/all/new.rb] (2 ops), html:type_formgroup [set/all/edit_type.rb] (2 ops)
- views graded but differing: html:board [set/all/editing.rb] differs at synthetic-v2-mod-probes#probe-view:116:board@set/all/editing.rb, html:edit_structure [set/all/editing.rb] differs at synthetic-v2-mod-probes#probe-view:131:edit_structure@set/all/editing.rb, html:history_tab [set/all/board/tab_views.rb] differs at synthetic-v2-mod-probes#probe-view:139:history_tab@set/all/board/tab_views.rb, html:new [set/all/new.rb] differs at synthetic-v2 + extra-ops#view:admin:Sign up:new, html:related_tab [set/all/board/tab_views.rb] differs at synthetic-v2-mod-probes#probe-view:153:related_tab@set/all/board/tab_views.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-email-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-email.test.ts`
- views graded identical: html:core [set/abstract/test_context.rb] (1410 ops), html:core [set/type/email_template/html.rb] (13 ops), html:email_page [set/all/email_html.rb] (2 ops)
- views graded but differing: html:content [set/right/html_message.rb] differs at synthetic-v2-mod-probes#probe-view:157:content@set/right/html_message.rb, html:core [set/right/text_message.rb] differs at synthetic-v2-mod-probes#probe-view:159:core@set/right/text_message.rb
- views only named by a test, not graded: email_html:compact_missing [set/all/email_html.rb], email_html:core [set/abstract/test_context.rb], email_html:unknown [set/all/email_html.rb], email_text:compact_missing [set/all/email_text.rb], email_text:last_action [set/all/email_text.rb], email_text:unknown [set/all/email_text.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-follow-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-follow-views.test.ts`, `tests/card/mod-loader/card-mod-follow.test.ts`
- views graded identical: base:followed [set/all/notify/base_views.rb] (2 ops), base:follower [set/all/notify/base_views.rb] (2 ops), base:last_action_verb [set/all/notify/base_views.rb] (2 ops), base:list_of_changes [set/all/notify/base_views.rb] (2 ops), base:subedit_notice [set/all/notify/base_views.rb] (2 ops), base:subedits [set/all/notify/base_views.rb] (2 ops), base:unfollow_url [set/all/notify/base_views.rb] (2 ops), html:confirm_update_all [set/self/follow_defaults.rb] (2 ops), html:core [set/type_plus_right/user/follow.rb] (3 ops), html:follow_button [set/all/follow/follow_link_views.rb] (3 ops), html:follow_item [set/right/follow.rb] (2 ops), html:follow_status [set/right/follow.rb] (2 ops), html:follow_tab [set/type_plus_right/user/follow.rb] (2 ops), html:ignore_tab [set/type_plus_right/user/follow.rb] (2 ops), html:rule_editor [set/right/following.rb] (1 ops), html:status [set/right/following.rb] (1 ops)
- views graded but differing: html:edit_buttons [set/self/follow_defaults.rb] differs at synthetic-v2 + extra-ops#view:admin:*follow defaults:edit_buttons; synthetic-v2-mod-probes#probe-view:171:edit_buttons@set/self/follow_defaults.rb, html:edit [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:172:edit@set/type_plus_right/user/follow.rb, html:errors [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:173:errors@set/type_plus_right/user/follow.rb, html:one_line_content [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:179:one_line_content@set/type_plus_right/user/follow.rb
- views only named by a test, not graded: html:core [set/right/followers.rb], html:core [set/right/following.rb], html:one_line_content [set/right/following.rb]
- views unexercised: json:follow_status [set/all/follow/follow_link_views.rb]
- events graded identical (rows): (none)
- events graded but differing rows: cache_expired_for_new_preference [set/right/follow.rb] differs at mod-event-probes#327; mod-event-probes#328; cache_expired_for_type_change [set/all/follow/follower_ids.rb] differs at mod-event-probes#297; mod-event-probes#298; expire_preferences_cache [set/all/follow/follower_ids.rb] differs at mod-event-probes#302; mod-event-probes#303; follow_fields_changed [set/right/follow_fields.rb] differs at mod-event-probes#332; mod-event-probes#333; notify_followers_after_delete [set/all/notify.rb] differs at mod-event-probes#322; mod-event-probes#323; notify_followers_after_save [set/all/notify.rb] differs at mod-event-probes#312; mod-event-probes#313; silence_notifications [set/all/notify.rb] differs at mod-event-probes#307; mod-event-probes#308; stash_followers [set/all/notify.rb] differs at mod-event-probes#317; mod-event-probes#318
- events run with no effect seen against the baseline: cache_expired_for_new_set [set/type/set.rb], update_follow_rules [set/self/follow_defaults.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-format-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-format-async-head-views.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-format-head-header-views.test.ts`, `tests/card/mod-loader/card-mod-format-hidden-content-field-view.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-format-smart-label.test.ts`, `tests/card/mod-loader/card-mod-format-toggle-raises.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: base:acted_at [set/all/base.rb] (2 ops), base:bad_address [set/all/error.rb] (2 ops), base:blank [set/all/base.rb] (2 ops), base:closed [set/all/base.rb] (2 ops), base:codename [set/all/base.rb] (2 ops), base:compact_missing [set/all/error.rb] (2 ops), base:content [set/all/base.rb] (2 ops), base:core [set/all/base.rb] (1410 ops), base:core [set/type/toggle.rb] (16 ops), base:created_at [set/all/base.rb] (2 ops), base:denial [set/all/error.rb] (2 ops), base:home_path [set/self/home.rb] (1 ops), base:id_url [set/all/base.rb] (2 ops), base:key [set/all/base.rb] (2 ops), base:label [set/all/content.rb] (2 ops), base:labeled_content [set/all/base.rb] (2 ops), base:labeled [set/all/base.rb] (2 ops), base:link [set/all/base.rb] (2 ops), base:linkname [set/all/base.rb] (2 ops), base:name [set/all/base.rb] (2 ops), base:nav_link [set/all/base.rb] (2 ops), base:open_content [set/all/base.rb] (2 ops), base:open [set/all/base.rb] (2 ops), base:page_title [set/all/html/head.rb] (2 ops), base:raw [set/all/base.rb] (3 ops), base:server_error [set/all/error.rb] (2 ops), base:smart_label [set/all/content.rb] (2 ops), base:text_without_nests [set/all/text.rb] (2 ops), base:title_link [set/type/uri.rb] (2 ops), base:title [set/all/title.rb] (2 ops), base:titled_content [set/all/base.rb] (2 ops), base:titled [set/all/base.rb] (2 ops), base:type [set/all/base.rb] (2 ops), base:unknown [set/all/error.rb] (2 ops), base:updated_at [set/all/base.rb] (2 ops), base:url_link [set/all/base.rb] (2 ops), base:url_link [set/type/uri.rb] (1 ops), base:url [set/all/base.rb] (2 ops), html:add_button [set/type/cardtype.rb] (2 ops), html:add_link [set/type/cardtype.rb] (2 ops), html:add_url [set/type/cardtype.rb] (2 ops), html:admin [set/type/mod.rb] (1 ops), html:bar_right [set/type/mod.rb] (2 ops), html:board_link [set/all/html/menu.rb] (2 ops), html:compact_missing [set/all/html/error.rb] (2 ops), html:configure_button [set/type/cardtype.rb] (2 ops), html:configure_link [set/type/cardtype.rb] (2 ops), html:content_panel [set/all/html/views.rb] (2 ops), html:content_with_title [set/all/html/views.rb] (2 ops), html:content [set/all/html/views.rb] (2 ops), html:core [set/type/json.rb] (1 ops), html:core [set/type/uri.rb] (3 ops), html:debug_server_error [set/all/html/error.rb] (2 ops), html:demo [set/all/demo.rb] (2 ops), html:denial [set/all/html/error.rb] (2 ops), html:edit_button [set/all/html/menu.rb] (3 ops), html:edit_link [set/all/html/menu.rb] (3 ops), html:favicon_tag [set/all/html/head.rb] (2 ops), html:flash [set/all/html/frame.rb] (2 ops), html:full_page_link [set/all/html/menu.rb] (2 ops), html:head [set/all/html/head.rb] (2 ops), html:header_title [set/all/html/header.rb] (2 ops), html:header [set/all/html/header.rb] (2 ops), html:help_link [set/all/html/menu.rb] (2 ops), html:hidden_content_field [set/all/content.rb] (2 ops), html:input [set/type/toggle.rb] (2 ops), html:labeled_editor [set/type/toggle.rb] (2 ops), html:labeled [set/all/html/views.rb] (2 ops), html:menu_block [set/all/html/menu.rb] (2 ops), html:menu [set/all/html/menu.rb] (2 ops), html:meta_tags [set/all/html/head.rb] (2 ops), html:mini_unknown [set/all/html/error.rb] (2 ops), html:page_title_tag [set/all/html/head.rb] (2 ops), html:server_error [set/all/html/error.rb] (2 ops), html:short_content [set/all/html/views.rb] (2 ops), html:stylesheet_tags [set/all/html/head.rb] (2 ops), html:title_link [set/all/title.rb] (1 ops), html:title_no_link [set/all/title.rb] (2 ops), html:title [set/all/title.rb] (2 ops), html:titled [set/all/html/views.rb] (2 ops), html:type [set/all/html.rb] (2 ops), html:type [set/type/cardtype.rb] (1 ops), html:universal_edit_button [set/all/html/head.rb] (2 ops), html:unknown [set/all/html/error.rb] (2 ops), html:view_list [set/all/demo.rb] (2 ops)
- views graded but differing: base:closed_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:183:closed_content@set/all/content.rb, base:errors [set/all/error.rb] differs at synthetic-v2#view:admin:Nonexistent Card:errors; synthetic-v2-mod-probes#probe-view:192:errors@set/all/error.rb, base:home_url [set/self/home.rb] differs at synthetic-v2-mod-probes#probe-view:194:home_url@set/self/home.rb, base:id [set/all/base.rb] differs at synthetic-v2#view:admin:Topic 001:id; synthetic-v2-mod-probes#probe-view:196:id@set/all/base.rb, base:not_found [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:205:not_found@set/all/error.rb, base:one_line_content [set/all/base.rb] differs at synthetic-v2-mod-probes#probe-view:206:one_line_content@set/all/base.rb, base:one_line_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:207:one_line_content@set/all/content.rb, base:one_line_content [set/type/html.rb] differs at synthetic-v2-mod-probes#probe-view:208:one_line_content@set/type/html.rb, base:raw_one_line_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:212:raw_one_line_content@set/all/content.rb, html:conflict [set/all/html/error.rb] differs at synthetic-v2-mod-probes#probe-view:236:conflict@set/all/html/error.rb, html:core [set/type/plain_text.rb] differs at synthetic-v2-mod-probes#probe-view:241:core@set/type/plain_text.rb, html:errors [set/all/html/error.rb] differs at synthetic-v2#view:admin:Nonexistent Card:errors; synthetic-v2-mod-probes#probe-view:248:errors@set/all/html/error.rb, html:not_found [set/all/html/error.rb] differs at synthetic-v2-mod-probes#probe-view:264:not_found@set/all/html/error.rb, html:one_line_content [set/all/html/views.rb] differs at synthetic-v2-mod-probes#probe-view:265:one_line_content@set/all/html/views.rb, html:one_line_content [set/type/html.rb] differs at synthetic-v2-mod-probes#probe-view:266:one_line_content@set/type/html.rb, html:raw_one_line_content [set/all/html/views.rb] differs at synthetic-v2-mod-probes#probe-view:268:raw_one_line_content@set/all/html/views.rb, html:rss_links [set/all/html/head.rb] differs at synthetic-v2#view:admin:Home:rss_links; synthetic-v2-mod-probes#probe-view:269:rss_links@set/all/html/head.rb, html:type_info [set/all/html.rb] differs at synthetic-v2-mod-probes#probe-view:277:type_info@set/all/html.rb
- views only named by a test, not graded: css:content [set/all/css.rb], css:titled [set/all/css.rb], css:unknown [set/all/css.rb], css:url [set/all/css.rb], csv:header [set/all/csv.rb], csv:titled [set/all/csv.rb], csv:unknown [set/all/csv.rb], data:content [set/all/data.rb], data:core [set/all/data.rb], file:core [set/all/file.rb], file:style [set/all/file.rb], json:bad_address [set/all/error.rb], json:denial [set/all/error.rb], json:errors [set/all/error.rb], json:not_found [set/all/error.rb], json:server_error [set/all/error.rb], jsonld:denial [set/all/error.rb], jsonld:errors [set/all/error.rb], jsonld:not_found [set/all/error.rb], jsonld:server_error [set/all/error.rb], rss:closed [set/all/rss.rb], rss:content [set/all/rss.rb], rss:menu [set/all/rss.rb], rss:open [set/all/rss.rb], text:core [set/all/text.rb], yaml:core [set/all/yaml.rb]
- views unexercised: css:import [set/all/css.rb], csv:body [set/all/csv.rb], csv:row [set/all/csv.rb], data:ancestors [set/all/data.rb], data:atom [set/all/data.rb], data:cast [set/all/data.rb], data:items [set/all/data.rb], data:links [set/all/data.rb], data:molecule [set/all/data.rb], data:nucleus [set/all/data.rb], data:pod [set/all/data.rb], js:source [set/all/js.rb], json:page [set/all/json.rb], json:status [set/all/json.rb], jsonld:format_unsupported [set/all/error.rb], jsonld:items [set/all/jsonld.rb], jsonld:test [set/all/error.rb], rss:comment_box [set/all/rss.rb], rss:feed_body [set/all/rss.rb], rss:feed_description [set/all/rss.rb], rss:feed_item_description [set/all/rss.rb], rss:feed_item [set/all/rss.rb], rss:feed_title [set/all/rss.rb], rss:feed [set/all/rss.rb], rss:open_content [set/all/rss.rb]
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: validate_json [set/type/json.rb], validate_number [set/type/number.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-help-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:guide [set/all/guide.rb] (2 ops), html:help_text [set/all/help.rb] (2 ops), html:help [set/all/help.rb] (2 ops), html:lead [set/all/help.rb] (2 ops)
- views graded but differing: html:popover [set/right/help.rb] differs at synthetic-v2-mod-probes#probe-view:287:popover@set/right/help.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-history-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-history-updater-of-seam.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-history.test.ts`
- views graded identical: html:act_legend [set/all/history/views.rb] (2 ops), html:action_expanded [set/all/history/views.rb] (2 ops), html:action_summary [set/all/history/views.rb] (2 ops), html:board_act [set/all/history_board.rb] (2 ops), html:change [set/all/history/views.rb] (2 ops), html:creator_credit [set/all/history_board.rb] (2 ops), html:draft_legend [set/all/history/views.rb] (2 ops), html:history [set/all/history/views.rb] (3 ops), html:last_action_verb [set/all/history/views.rb] (2 ops), html:last_action [set/all/history/views.rb] (2 ops), html:updated_by [set/all/history_board.rb] (2 ops)
- views graded but differing: html:act [set/all/history/views.rb] differs at synthetic-v2-mod-probes#probe-view:289:act@set/all/history/views.rb
- views only named by a test, not graded: json:actions [set/all/history/export.rb], json:history [set/all/history/export.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: assign_action [set/all/history/events.rb] differs at mod-event-probes#357; mod-event-probes#358; detect_conflict [set/all/history/events.rb] differs at mod-event-probes#362; mod-event-probes#363; finalize_act [set/all/history/events.rb] differs at mod-event-probes#377; mod-event-probes#378; finalize_action [set/all/history/events.rb] differs at mod-event-probes#367; mod-event-probes#368; rollback_actions [set/all/history/events.rb] differs at mod-event-probes#372; mod-event-probes#373; update_ancestor_timestamps [set/all/history/events.rb] differs at mod-event-probes#352; mod-event-probes#353
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-integrate-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-integrate.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: cache_delete_card_events [set/all/observer.rb] differs at mod-event-probes#382; mod-event-probes#383
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-layout-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-layout-mycard-views.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:bar_bottom [set/self/head.rb] (1 ops), html:close_modal_link [set/all/modal.rb] (2 ops), html:core [set/right/head.rb] (1 ops), html:core [set/self/account_links.rb] (3 ops), html:core [set/type/layout_type.rb] (9 ops), html:head_content [set/right/head.rb] (1 ops), html:input [set/self/head.rb] (1 ops), html:invite [set/self/account_links.rb] (2 ops), html:modal_footer [set/all/modal.rb] (2 ops), html:modal_link [set/all/modal.rb] (3 ops), html:modal_menu [set/all/modal.rb] (2 ops), html:modal_title [set/all/modal.rb] (2 ops), html:modal [set/all/modal.rb] (3 ops), html:my_card [set/self/account_links.rb] (3 ops), html:nav_item [set/abstract/items.rb] (2 ops), html:nav_item [set/all/navbar_links.rb] (2 ops), html:nav_link_in_dropdown [set/all/navbar_links.rb] (2 ops), html:navbar_links [set/all/navbar_links.rb] (2 ops), html:navbar_links [set/type/html.rb] (1 ops), html:overlay_header [set/all/overlay.rb] (2 ops), html:overlay_help_link [set/all/overlay.rb] (2 ops), html:overlay_menu [set/all/overlay.rb] (2 ops), html:overlay_title [set/all/overlay.rb] (2 ops), html:pop_out_modal_link [set/all/modal.rb] (2 ops), html:sign_in [set/self/account_links.rb] (2 ops), html:sign_out [set/self/account_links.rb] (2 ops), html:sign_up [set/self/account_links.rb] (2 ops)
- views graded but differing: html:core [set/self/head.rb] differs at synthetic-v2-mod-probes#probe-view:304:core@set/self/head.rb, html:one_line_content [set/right/head.rb] differs at synthetic-v2-mod-probes#probe-view:320:one_line_content@set/right/head.rb
- views only named by a test, not graded: html:edit_inline [set/right/enabled_roles.rb], html:nav_item [set/self/dropdown_divider.rb], html:nav_link_in_dropdown [set/self/dropdown_divider.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: update_layout_registry [set/type/layout_type.rb] differs at mod-event-probes#397; mod-event-probes#398
- events run with no effect seen against the baseline: clear_roles_cache [set/right/enabled_roles.rb], validate_role_enabling [set/right/enabled_roles.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-list-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-list-checkbox-editor.test.ts`, `tests/card/mod-loader/card-mod-list-select-editor.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: base:core [set/abstract/01_list/other_views.rb] (1410 ops), html:autocomplete [set/abstract/01_list/html_views.rb] (2 ops), html:checkbox [set/abstract/01_list/html_views.rb] (2 ops), html:core [set/abstract/01_list/html_views.rb] (1410 ops), html:input [set/abstract/01_list/html_views.rb] (2 ops), html:input [set/type/nest_list.rb] (1 ops), html:list [set/abstract/01_list/html_views.rb] (2 ops), html:multiselect [set/abstract/01_list/html_views.rb] (2 ops), html:nest_list_input [set/type/nest_list.rb] (2 ops), html:radio [set/abstract/01_list/html_views.rb] (2 ops), html:select [set/abstract/01_list/html_views.rb] (2 ops), html:view_list [set/abstract/01_list.rb] (2 ops)
- views graded but differing: html:input [set/type/link_list.rb] differs at synthetic-v2-mod-probes#probe-view:334:input@set/type/link_list.rb, html:one_line_content [set/abstract/01_list/html_views.rb] differs at synthetic-v2-mod-probes#probe-view:339:one_line_content@set/abstract/01_list/html_views.rb
- views only named by a test, not graded: css:content [set/abstract/01_list/other_views.rb], data:content [set/abstract/01_list/other_views.rb], json:content [set/abstract/01_list/other_views.rb]
- views unexercised: css:titled [set/abstract/01_list/other_views.rb], csv:core [set/abstract/01_list/other_views.rb], data:core [set/abstract/01_list/other_views.rb], js:core [set/abstract/01_list/other_views.rb], json:links [set/abstract/01_list/other_views.rb]
- events graded identical (rows): (none)
- events graded but differing rows: add_and_drop_items [set/abstract/01_list/events.rb] differs at mod-event-probes#402; mod-event-probes#403; delist [set/abstract/delist.rb] differs at mod-event-probes#422; mod-event-probes#423; insert_item_event [set/abstract/01_list/events.rb] differs at mod-event-probes#407; mod-event-probes#408; validate_item_type [set/abstract/01_list/events.rb] differs at mod-event-probes#412; mod-event-probes#413; validate_item_uniqueness [set/abstract/01_list/events.rb] differs at mod-event-probes#417; mod-event-probes#418
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-markdown-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-markdown.test.ts`
- views graded identical: html:core [set/type/markdown.rb] (3 ops)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-permissions-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-permissions.test.ts`
- views graded identical: html:core [set/abstract/permission.rb] (1410 ops), html:input [set/abstract/permission.rb] (2 ops), html:pointer_core [set/abstract/permission.rb] (2 ops)
- views graded but differing: html:one_line_content [set/abstract/permission.rb] differs at synthetic-v2-mod-probes#probe-view:346:one_line_content@set/abstract/permission.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: cascade_read_rule [set/right/read.rb] differs at mod-event-probes#457; mod-event-probes#458; check_permissions [set/all/permissions.rb] differs at mod-event-probes#442; mod-event-probes#443; expire_related [set/all/update_read_rules.rb] differs at mod-event-probes#452; mod-event-probes#453; set_field_read_rules [set/all/permissions.rb] differs at mod-event-probes#432; mod-event-probes#433; set_read_rule [set/all/permissions.rb] differs at mod-event-probes#427; mod-event-probes#428; update_read_rule [set/all/permissions.rb] differs at mod-event-probes#437; mod-event-probes#438; update_rule_cache [set/all/update_read_rules.rb] differs at mod-event-probes#447; mod-event-probes#448
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-recaptcha-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-recaptcha-form-hooks.test.ts`, `tests/card/mod-loader/card-mod-recaptcha-validate-event.test.ts`, `tests/card/mod-loader/card-mod-recaptcha.test.ts`
- views graded identical: html:core [set/self/recaptcha_settings.rb] (3 ops)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: recaptcha [set/all/recaptcha.rb] differs at mod-event-probes#472; mod-event-probes#473; set_recaptcha_site_key [set/abstract/recaptcha_setting.rb] differs at mod-event-probes#467; mod-event-probes#468; validate_recaptcha_field [set/abstract/recaptcha_setting.rb] differs at mod-event-probes#462; mod-event-probes#463
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-rules-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-rules.test.ts`
- views graded identical: html:accordion_bar_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:accordion_rule_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:bar_bottom [set/rule/bar_view.rb] (1 ops), html:bar_right [set/rule/bar_view.rb] (1 ops), html:bar_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:bar [set/rule/bar_view.rb] (1 ops), html:board_rules_tab [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:card_select [set/all/set_select.rb] (2 ops), html:core [set/rule/html_views.rb] (77 ops), html:core [set/type/set/html_views.rb] (8 ops), html:core [set/type/setting.rb] (17 ops), html:filtered_accordion_rule_list [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:help_text [set/rule/board_rules_editor.rb] (1 ops), html:input [set/type/set/html_views.rb] (1 ops), html:modal_nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:modal_pill_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:one_line_content [set/type/set/html_views.rb] (1 ops), html:overlay_rule_list_link [set/type/set/html_views/rule_lists.rb] (2 ops), html:overlay_title [set/rule/board_rules_editor.rb] (1 ops), html:pill_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:quick_edit_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:quick_edit_success [set/rule/quick_editor.rb] (2 ops), html:raw_one_line_content [set/rule/bar_view.rb] (1 ops), html:rule_board_link [set/rule/editor.rb] (2 ops), html:rule_help [set/rule/editor.rb] (1 ops), html:rule_help [set/type/setting.rb] (2 ops), html:rule_nest_editor_link [set/rule/editor.rb] (2 ops), html:set_label [set/type/set/html_views.rb] (2 ops), html:template_link [set/type/set/html_views/template.rb] (2 ops)
- views graded but differing: html:bar_middle [set/rule/bar_view.rb] differs at synthetic-v2-mod-probes#probe-view:352:bar_middle@set/rule/bar_view.rb, html:grouped_list [set/self/cardtype.rb] differs at synthetic-v2-mod-probes#probe-view:362:grouped_list@set/self/cardtype.rb, html:modal_rule [set/rule/board_rules_editor.rb] differs at synthetic-v2-mod-probes#probe-view:367:modal_rule@set/rule/board_rules_editor.rb, html:one_line_content [set/rule/bar_view.rb] differs at synthetic-v2-mod-probes#probe-view:369:one_line_content@set/rule/bar_view.rb, html:one_line_content [set/type/setting.rb] differs at synthetic-v2-mod-probes#probe-view:371:one_line_content@set/type/setting.rb, html:overlay_rule [set/rule/board_rules_editor.rb] differs at synthetic-v2-mod-probes#probe-view:373:overlay_rule@set/rule/board_rules_editor.rb, html:quick_edit [set/rule/quick_editor.rb] differs at synthetic-v2#view:admin:*all+*read:quick_edit; synthetic-v2#view:anonymous:*all+*read:quick_edit; synthetic-v2-mod-probes#probe-view:378:quick_edit@set/rule/quick_editor.rb, html:rule_edit [set/rule/editor.rb] differs at synthetic-v2-mod-probes#probe-view:381:rule_edit@set/rule/editor.rb, html:rule_form_card_editor [set/rule/rule_form.rb] differs at synthetic-v2#view:admin:*all+*create:rule_form_card_editor; synthetic-v2-mod-probes#probe-view:382:rule_form_card_editor@set/rule/rule_form.rb, html:rule_form [set/rule/rule_form.rb] differs at synthetic-v2#view:admin:*all+*create:rule_form; synthetic-v2-mod-probes#probe-view:383:rule_form@set/rule/rule_form.rb
- views only named by a test, not graded: data:core [set/type/setting.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: save_recently_edited_settings []: set pattern rule is not probed by this planner
- events unexercised: (none)

#### card-mod-script-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-script.test.ts`
- views graded identical: base:core [set/abstract/02_coffee_script.rb] (1410 ops), html:core [set/abstract/00_script.rb] (1410 ops), html:javascript_include_tag [set/abstract/00_script.rb] (2 ops), html:javascript_include_tag [set/all/head_javascript.rb] (2 ops), html:javascript_tags [set/all/head_javascript.rb] (2 ops), html:remote_script_tags [set/type_plus_right/mod/script.rb] (1 ops), html:remote_script_tags [set/type_plus_right/set/script.rb] (2 ops), html:script_calls [set/all/head_javascript.rb] (2 ops), html:script_variables [set/all/head_javascript.rb] (2 ops)
- views graded but differing: html:javascript_include_tag [set/right/script.rb] differs at synthetic-v2-mod-probes#probe-view:393:javascript_include_tag@set/right/script.rb
- views only named by a test, not graded: js:core [set/abstract/01_java_script.rb], js:core [set/abstract/script_group.rb]
- views unexercised: js:compressed [set/abstract/00_script.rb]
- events graded identical (rows): (none)
- events graded but differing rows: validate_coffeescript_syntax [set/type/coffee_script.rb] differs at mod-event-probes#477; mod-event-probes#478
- events run with no effect seen against the baseline: validate_javascript_syntax [set/type/java_script.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-search-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-search-read-scope.test.ts`, `tests/card/mod-loader/card-mod-search.test.ts`
- views graded identical: base:card_list [set/abstract/0_search/views.rb] (2 ops), base:core [set/abstract/search_views.rb] (1410 ops), base:no_search_results [set/abstract/0_search/views.rb] (2 ops), base:search_count [set/abstract/0_search/views.rb] (2 ops), base:title [set/self/recent.rb] (1 ops), html:add_autocomplete_item [set/all/autocomplete.rb] (2 ops), html:bar [set/abstract/search_views.rb] (3 ops), html:card_list [set/abstract/0_search/views.rb] (2 ops), html:checkbox_list [set/abstract/0_search/views.rb] (2 ops), html:core [set/abstract/search_views.rb] (1410 ops), html:core [set/self/recent.rb] (3 ops), html:core [set/self/search.rb] (3 ops), html:goto_autocomplete_item [set/all/autocomplete.rb] (2 ops), html:no_search_results [set/abstract/0_search/views.rb] (2 ops), html:results_for_keyword [set/self/search.rb] (2 ops), html:search_box [set/self/search.rb] (2 ops), html:title [set/self/search.rb] (1 ops)
- views graded but differing: base:count [set/abstract/0_search.rb] differs at synthetic-v2#view:admin:All Topics:count; synthetic-v2-mod-probes#probe-view:401:count@set/abstract/0_search.rb, base:search_error [set/abstract/0_search/views.rb] differs at synthetic-v2#view:admin:All Topics:search_error, base:search_error [set/self/search.rb] differs at synthetic-v2-mod-probes#probe-view:405:search_error@set/self/search.rb, html:count [set/abstract/0_search.rb] differs at synthetic-v2#view:admin:All Topics:count; synthetic-v2-mod-probes#probe-view:414:count@set/abstract/0_search.rb, html:one_line_content [set/abstract/search_views.rb] differs at synthetic-v2-mod-probes#probe-view:417:one_line_content@set/abstract/search_views.rb
- views only named by a test, not graded: json:select2_option [set/all/autocomplete.rb]
- views unexercised: csv:body [set/abstract/0_search/views.rb], data:card_list [set/abstract/0_search/views.rb], json:complete [set/self/search.rb], json:molecule [set/abstract/0_search/views.rb], json:name_complete [set/abstract/0_search/views.rb], json:name_match [set/abstract/0_search/views.rb], json:search_box_complete [set/self/search.rb], rss:feed_body [set/abstract/search_views.rb], rss:feed_item_description [set/self/recent.rb]
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-session-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-session.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: discard_deleted_locations [set/all/location_history.rb] differs at mod-event-probes#487; mod-event-probes#488
- events run with no effect seen against the baseline: delete_in_session [set/type/session.rb], save_current_location [set/all/location_history.rb], store_in_session [set/type/session.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-style-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-style.test.ts`
- views graded identical: html:box_bottom [set/abstract/skin_box.rb] (2 ops), html:box_middle [set/abstract/skin_box.rb] (2 ops), html:box [set/abstract/skin_box.rb] (2 ops), html:core [set/abstract/01_css.rb] (1410 ops), html:customize_button [set/abstract/skin_box.rb] (1 ops), html:remote_include_tags [set/type_plus_right/mod/style.rb] (2 ops), html:remote_style_tags [set/self/style_mods.rb] (2 ops), html:stylesheet_include_tag [set/abstract/style_group.rb] (2 ops), html:stylesheet_path [set/type_plus_right/set/style.rb] (2 ops)
- views graded but differing: html:stylesheet_include_tag [set/type_plus_right/mod/style.rb] differs at synthetic-v2-mod-probes#probe-view:429:stylesheet_include_tag@set/type_plus_right/mod/style.rb
- views only named by a test, not graded: css:compiled [set/abstract/01_css.rb], css:compiled [set/abstract/02_scss.rb], css:compressed [set/abstract/01_css.rb], css:core [set/abstract/02_scss.rb], css:import [set/abstract/01_css.rb], scss:core [set/abstract/02_scss.rb], scss:core [set/abstract/style_group.rb], scss:labeled [set/abstract/02_scss.rb]
- views unexercised: css:concat [set/type/skin.rb]
- events graded identical (rows): (none)
- events graded but differing rows: no_deletion_if_used [set/type/skin.rb] differs at mod-event-probes#516; mod-event-probes#517
- events run with no effect seen against the baseline: validate_css [set/type/css.rb], validate_scss_syntax [set/type/scss.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-tabs-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:pills [set/all/tabs.rb] (2 ops), html:tabs [set/abstract/tabs.rb] (2 ops), html:tabs [set/all/tabs.rb] (2 ops)
- views graded but differing: html:pills_static [set/all/tabs.rb] differs at synthetic-v2-mod-probes#probe-view:431:pills_static@set/all/tabs.rb, html:tabs_static [set/all/tabs.rb] differs at synthetic-v2-mod-probes#probe-view:433:tabs_static@set/all/tabs.rb
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-tinymce_editor-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-tinymce_editor.test.ts`
- views graded identical: html:link_editor [set/all/reference_editor/link_editor.rb] (2 ops), html:modal_link_editor [set/all/reference_editor/link_editor.rb] (2 ops), html:modal_nest_editor [set/all/reference_editor/nest_editor.rb] (2 ops), html:modal_nest_image [set/all/reference_editor/nest_image.rb] (2 ops), html:nest_content [set/all/reference_editor/nest_editor.rb] (2 ops), html:nest_editor [set/all/reference_editor/nest_editor.rb] (2 ops), html:nest_image [set/all/reference_editor/nest_image.rb] (2 ops), html:new_image_buttons [set/all/reference_editor/nest_image.rb] (2 ops), html:new_image [set/all/reference_editor/nest_image.rb] (2 ops)
- views graded but differing: (none)
- views only named by a test, not graded: js:change_create_to_update [set/all/reference_editor/nest_image.rb], js:open_nest_editor [set/all/reference_editor/nest_image.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-virtual-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-virtual.test.ts`
- views graded identical: (none)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: delete_virtual_content [set/abstract/virtual_cache.rb] differs at mod-event-probes#526; mod-event-probes#527; save_virtual_content [set/abstract/virtual_cache.rb] differs at mod-event-probes#521; mod-event-probes#522
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

## decko-ts implemented surface (truth)

- Set patterns (9): all, all_plus, right, rstar, rule, self, star, type, type_plus_right
- Html views in HTML_VIEWS (305): accordion_bar, accordion_bar_list, accordion_rule_list, account_tab, act, act_legend, acted_at, action_expanded, action_summary, add_autocomplete_item, add_button, add_link, add_url, admin, api_key, asset_output_url, autocomplete, bad_address, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, bar_setting_list, blank, board, board_act, board_link, board_rules_tab, board_type_formgroup, box, box_bottom, box_middle, box_top, boxed, boxed_link, buttons, card_list, card_select, cardboard, cardtypes, carousel, change, change_create_to_update, checkbox, checkbox_list, close_modal_link, closed, closed_account, closed_bar, closed_content, closure, codename, comment_box, compact_missing, configs, configurations, configure_button, configure_link, confirm_update_all, conflict, conflict_tracker, content, content_changes, content_formgroup, content_formgroups, content_panel, content_with_title, core, count, created_at, creator_credit, current, customize_button, debug_server_error, demo, denial, depends_on, description, draft_legend, edit, edit_button, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_link, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, email_page, engage_tab, errors, expanded_bar, favicon_tag, file_size, filtered_accordion_rule_list, flash, follow_button, follow_item, follow_section, follow_status, follow_tab, followed, follower, full_bar, full_page_link, full_width, gem_info, generate_button, goto_autocomplete_item, grouped_list, guide, guide_tab, head, head_content, header, header_title, help, help_link, help_text, hidden_content_field, history, history_tab, home_path, home_url, home_view, icons, id, id_url, ignore_tab, image_complete, inline, input, invite, javascript_include_tag, javascript_tags, just_deleted, key, label, labeled, labeled_content, labeled_editor, last_action, last_action_verb, lead, link, link_editor, link_tag, link_with_checkbox, linkname, list, list_of_changes, menu, menu_block, meta_tags, mini_bar, mini_unknown, modal, modal_footer, modal_link, modal_link_editor, modal_menu, modal_nest_editor, modal_nest_image, modal_nest_rules, modal_pill_setting_list, modal_rule, modal_title, multiselect, my_card, name, name_form, name_formgroup, nav_item, nav_link, nav_link_in_dropdown, navbar_links, nest_content, nest_editor, nest_image, nest_list_input, nest_rules, new, new_buttons, new_fields, new_image, new_image_buttons, new_in_modal, new_in_modal_buttons, new_type_formgroup, no_search_results, not_found, one_line_content, open, open_bar, open_content, open_nest_editor, overlay_guide, overlay_header, overlay_help_link, overlay_menu, overlay_rule, overlay_rule_list_link, overlay_title, page_title, page_title_tag, paging, pill_setting_list, pills, pills_static, pointer_core, pop_out_modal_link, preview_editor, progress_bar, quick_edit, quick_edit_setting_list, quick_edit_success, radio, raw, raw_one_line_content, read_form, read_formgroup, related_tab, remote_include_tags, remote_script_tags, remote_style_tags, reset_password_days, reset_password_success, reset_password_url, results_for_keyword, roles, rss_links, rule_board_link, rule_edit, rule_editor, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, rules_tab, script_calls, script_variables, scripts, search_box_complete, search_count, search_error, select, server_error, set_label, settings, setup, short_content, sign_in, sign_out, sign_up, simple_new, smart_label, source, status, styles, stylesheet_include_tag, stylesheet_path, stylesheet_tags, subedit_notice, subedits, tabs, tabs_static, tasks, template_link, template_nest, text_without_nests, title, title_link, title_no_link, titled, titled_content, token, token_days, token_expiry, token_link, type, type_formgroup, type_info, unfollow_url, universal_edit_button, unknown, updated_at, updated_by, url, url_link, verify_days, verify_url, view_list, views, warning
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
| `card-mod-carrierwave-0.20.0` | declared-complete | 6/6 | 10 (covered=10) | 11 (abstract=2, all=1, self=5, type=3) | 7 | 38/22 | 6 mod-specific view(s) declared: content_changes, full_width, input, link_tag, preview_editor, source |
| `card-mod-collection-0.20.0` | declared-complete | 2/3 | 2 (covered=2) | 6 (abstract=3, all=3) | 1 | 22/17 | 2 mod-specific view(s) declared: count, paging — 1 declared view name(s) NOT in the implemented surface: paging_urls |
| `card-mod-comment-0.20.0` | declared-complete | 0/0 | 7 (covered=7) | 3 (all=1, right=2) | 0 | 13/5 | manifest + byte-pinned test (5 pins across 13 it()): comment_box, open, open_content, titled, titled_content, core, ... — the mod declares no mod-specific view names; the label rests on the byte-pin c |
| `card-mod-content-0.20.0` | declared-complete | 4/4 | 4 (covered=4) | 14 (abstract=7, all=3, right=2, self=2) | 7 | 16/9 | 4 mod-specific view(s) declared: bar_middle, file_size, input, one_line_content |
| `card-mod-date-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 5 (all=1, right=2, self=1, type=1) | 0 | 32/20 | manifest + byte-pinned test (20 pins across 32 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-defaults-0.20.0` | ignored | 0/0 | 0 (covered=0) | 0 () | 1 | 0/0 | unported (not evaluated) |
| `card-mod-delayed_job-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 0 () | 2 | 11/0 | backend port (src/card/delayed-job/delayed-job.ts): integrate_with_delay events become delayed_jobs rows, worked off after the response on Node, Cloudflare and Bunny; 11 it() in tests/card/delayed-job |
| `card-mod-edit-0.20.0` | declared-complete | 41/41 | 45 (covered=45) | 21 (all=15, right=2, self=1, type=3) | 0 | 9/3 | 41 mod-specific view(s) declared: board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ... |
| `card-mod-email-0.20.0` | declared-complete | 2/2 | 6 (covered=6) | 13 (abstract=2, all=2, right=7, type=2) | 2 | 10/4 | 2 mod-specific view(s) declared: compact_missing, email_page |
| `card-mod-follow-0.20.0` | declared-complete | 12/12 | 19 (covered=19) | 25 (abstract=1, all=4, right=8, self=7, type=4, type_plus_right=1) | 2 | 12/5 | 12 mod-specific view(s) declared: confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ... |
| `card-mod-format-0.20.0` | declared-complete | 46/46 | 54 (covered=54) | 33 (abstract=1, all=20, right=1, self=1, type=10) | 16 | 49/8 | 46 mod-specific view(s) declared: add_button, add_link, add_url, admin, bar_right, board_link, ... |
| `card-mod-help-0.20.0` | declared-complete | 4/5 | 0 (covered=0) | 6 (all=2, right=2, self=2) | 0 | 14/8 | 4 mod-specific view(s) declared: guide, help, help_text, lead — 1 declared view name(s) NOT in the implemented surface: popover |
| `card-mod-history-0.20.0` | declared-complete | 12/12 | 10 (covered=10) | 3 (all=3) | 12 | 40/39 | 12 mod-specific view(s) declared: act, act_legend, action_expanded, action_summary, board_act, change, ... |
| `card-mod-integrate-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 8 (all=1, right=3, self=4) | 0 | 28/21 | manifest + byte-pinned test (21 pins across 28 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-layout-0.20.0` | declared-complete | 24/24 | 26 (covered=26) | 23 (abstract=4, all=6, right=3, self=8, type=2) | 5 | 37/7 | 24 mod-specific view(s) declared: bar_bottom, close_modal_link, edit_inline, head_content, input, invite, ... |
| `card-mod-list-0.20.0` | declared-complete | 5/5 | 10 (covered=10) | 16 (abstract=6, all=1, right=2, self=3, type=4) | 0 | 15/15 | 5 mod-specific view(s) declared: input, list, nest_list_input, one_line_content, view_list |
| `card-mod-markdown-0.20.0` | declared-complete | 0/0 | 0 (covered=0) | 1 (type=1) | 0 | 14/15 | manifest + byte-pinned test (15 pins across 14 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-permissions-0.20.0` | declared-complete | 3/3 | 4 (covered=4) | 11 (abstract=1, all=2, right=4, self=4) | 0 | 33/33 | 3 mod-specific view(s) declared: input, one_line_content, pointer_core |
| `card-mod-recaptcha-0.20.0` | declared-complete | 0/0 | 1 (covered=1) | 8 (abstract=1, all=1, right=3, self=3) | 1 | 40/12 | manifest + byte-pinned test (12 pins across 40 it()): core — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone |
| `card-mod-rules-0.20.0` | declared-complete | 34/34 | 30 (covered=30) | 24 (abstract=1, all=3, right=4, rstar=1, rule=8, self=2, type=4, type_plus_right=1) | 0 | 29/19 | 34 mod-specific view(s) declared: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, ... |
| `card-mod-script-0.20.0` | declared-complete | 5/6 | 6 (covered=6) | 16 (abstract=7, all=1, right=1, self=1, type=4, type_plus_right=2) | 2 | 18/14 | 5 mod-specific view(s) declared: javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables — 1 declared view name(s) NOT in the implemented surface: compressed |
| `card-mod-search-0.20.0` | declared-complete | 11/20 | 10 (covered=10) | 28 (abstract=6, all=1, right=17, self=2, type=2) | 1 | 30/5 | 11 mod-specific view(s) declared: add_autocomplete_item, bar, card_list, checkbox_list, count, goto_autocomplete_item, ... — 9 declared view name(s) NOT in the implemented surface: body, complete, fee |
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
- **evidence**: 8/8 html views in HTML_VIEWS∪mod-manifests (6/6 mod-specific); mod-loader pins: manifest=yes, test=38 it(), byte-pins=22
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (38 it() blocks, 22 toBe(<literal>) pins)
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
- **evidence**: 2/3 html views in HTML_VIEWS∪mod-manifests (2/3 mod-specific); mod-loader pins: manifest=yes, test=22 it(), byte-pins=17
- **mod-loader manifest**: yes (2 views registered)
- **byte-pinned test**: yes (22 it() blocks, 17 toBe(<literal>) pins)
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

- **status**: `declared-complete`
- **verdict**: manifest + byte-pinned test (5 pins across 13 it()): comment_box, open, open_content, titled, titled_content, core, ... — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: no html view declarations in this mod; mod-loader pins: manifest=yes, test=13 it(), byte-pins=5
- **mod-loader manifest**: yes (7 views registered)
- **byte-pinned test**: yes (13 it() blocks, 5 toBe(<literal>) pins)
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

- **status**: `declared-complete`
- **verdict**: backend port (src/card/delayed-job/delayed-job.ts): integrate_with_delay events become delayed_jobs rows, worked off after the response on Node, Cloudflare and Bunny; 11 it() in tests/card/delayed-job/delayed-job.test.ts
- **evidence**: no set/ tree; the mod's surface is engine machinery, guarded by its own test file
- **mod-loader manifest**: no
- **byte-pinned test**: yes (11 it() blocks, 0 toBe(<literal>) pins)
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
- **verdict**: 4 mod-specific view(s) declared: guide, help, help_text, lead — 1 declared view name(s) NOT in the implemented surface: popover
- **evidence**: 4/5 html views in HTML_VIEWS∪mod-manifests (4/5 mod-specific); mod-loader pins: manifest=yes, test=14 it(), byte-pins=8
- **mod-loader manifest**: yes (0 views registered)
- **byte-pinned test**: yes (14 it() blocks, 8 toBe(<literal>) pins)
- **set modules by pattern**: all=2, right=2, self=2
- **mod-specific html views (covered/total)**: 4/5 (guide, help, help_text, lead, popover)
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
- **verdict**: manifest + byte-pinned test (15 pins across 14 it()):  — the mod declares no mod-specific view names; the label rests on the byte-pin criterion alone
- **evidence**: 1/1 html views in HTML_VIEWS∪mod-manifests (0/0 mod-specific); mod-loader pins: manifest=yes, test=14 it(), byte-pins=15
- **mod-loader manifest**: yes (0 views registered)
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
- **evidence**: 14/23 html views in HTML_VIEWS∪mod-manifests (11/20 mod-specific); mod-loader pins: manifest=yes, test=30 it(), byte-pins=5
- **mod-loader manifest**: yes (10 views registered)
- **byte-pinned test**: yes (30 it() blocks, 5 toBe(<literal>) pins)
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
