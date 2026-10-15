# card-mod compatibility report — decko-ts

Generated: 2026-10-15T10:36:26.457Z
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

Behaviour-complete: **3** of 32 evaluated mods. Across them, 379 of 562 declared views are rendered by a graded operation and byte-identical to Ruby's captured answer, 172 are graded and differ, 2 are exercised by no operation, and 3 of 126 declared events are graded on the rows they leave, identical to Ruby's (54 differ, 58 ran but show no effect against a same-shape baseline, 0 could not be realised as a probe on this deck). A further **4** have every declared view graded identical to Ruby but an event that no probe here observes: `card-mod-integrate-0.20.0`, `card-mod-recaptcha-0.20.0`, `card-mod-session-0.20.0`, `card-mod-virtual-0.20.0`. Declaring neither views nor events, so nothing here grades them: `card-mod-ace_editor-0.20.0`, `card-mod-delayed_job-0.20.0`. Seed-only, evaluated by seed comparison: `card-mod-defaults-0.20.0`. Not evaluated: (none).

A mod is **behaviour-complete** only when every view it declares (any format) is rendered by at least one graded operation and every such operation is byte-identical to Ruby's captured answer (after the grader's N1-N8 rules), AND every event it declares is run as a probe on the deck and leaves the rows Ruby's leaves. A test that names a view (`test-named`) or an event (`named`) is listed as a pointer and never counts, because a name match shows neither what the test asserts nor where its expected bytes came from. Attribution is by view name and set membership (see `tools/compat-report/behaviour.mjs`): a graded operation credits a declaration only when its card belongs to the declaring file's set; all/, lib/ and abstract/ declarations apply by name alone. Withheld operations are credited when the withheld set is present at grading.

The event probes are the `synthetic-v2-mod-probes` fixture (`reference-harness/fixtures/synthetic-v2-mod-probes`): the same synthetic-v2 deck, one write scenario whose steps create, update and delete a probe card for each event declaration (and the same three writes on a card of the same shape as its baseline), with Ruby's answers captured by the oracle adapter. Each step is graded for persistence (the rows the write leaves) and side effects (saved, errors, mail). An event is counted only where its probe's rows DIFFER from the baseline's - a probe whose rows match the baseline shows the event did not fire, and two writes that both did nothing are not a match of behaviour. Engine commit 806d0d1c778b9d8de409b799f3aaf773b659f0cc (dirty), graded 2026-10-15T10:20:45.928Z: persistence 186/530, side effects 42/530, rendering 379/549.

Grades this verdict rests on (`tools/compat-report/graded-ops.json`):

- `synthetic-v1`: verdict pass, 1754/1754 rendering ops identical; engine commit deb0be4faa78ff7166b3400b297bd89941f3f4bb, graded 2026-10-14T20:37:06.231Z
- `synthetic-v2`: verdict fail, 2555/2581 rendering ops identical; engine commit 806d0d1c778b9d8de409b799f3aaf773b659f0cc, graded 2026-10-15T08:32:48.144Z
- `synthetic-v2 + extra-ops`: verdict fail, 13/21 rendering ops identical; engine commit 46da63b305726e4e463a7e8f1a5d6b080e9ac711, graded 2026-10-14T21:43:53.753Z

| mod | behaviour | views | graded identical | graded differs | test-named, not counted | unexercised views | events | graded identical rows | graded differing rows | ran, no effect seen | no probe possible | named by a test, not counted | unexercised |
|-----|-----------|------:|-----------------:|---------------:|------------:|------------------:|-------:|----------------------:|---------------------:|--------------------:|-----------------:|-----------------------------:|------------:|
| `card-mod-account-0.20.0` | behaviour-incomplete | 30 | 18 | 11 | 1 | 0 | 33 | 3 | 0 | 27 | 0 | 3 | 0 |
| `card-mod-ace_editor-0.20.0` | no-gradable-declarations | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-api_key-0.20.0` | behaviour-incomplete | 10 | 9 | 1 | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-assets-0.20.0` | behaviour-incomplete | 8 | 4 | 1 | 2 | 1 | 5 | 0 | 5 | 0 | 0 | 0 | 0 |
| `card-mod-bar_and_box-0.20.0` | behaviour-complete | 21 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-bootstrap-0.20.0` | behaviour-incomplete | 14 | 7 | 7 | 0 | 0 | 6 | 0 | 3 | 3 | 0 | 0 | 0 |
| `card-mod-carrierwave-0.20.0` | behaviour-incomplete | 25 | 16 | 9 | 0 | 0 | 24 | 0 | 14 | 5 | 0 | 0 | 5 |
| `card-mod-collection-0.20.0` | behaviour-incomplete | 5 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-comment-0.20.0` | behaviour-incomplete | 7 | 6 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `card-mod-content-0.20.0` | behaviour-incomplete | 9 | 7 | 2 | 0 | 0 | 3 | 0 | 1 | 2 | 0 | 0 | 0 |
| `card-mod-date-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-defaults-0.20.0` | seed only (see below) | | | | | | | | | | | | |
| `card-mod-delayed_job-0.20.0` | no-gradable-declarations | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-edit-0.20.0` | behaviour-incomplete | 43 | 38 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-email-0.20.0` | behaviour-incomplete | 11 | 3 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-follow-0.20.0` | behaviour-incomplete | 24 | 16 | 5 | 3 | 0 | 10 | 0 | 6 | 4 | 0 | 0 | 0 |
| `card-mod-format-0.20.0` | behaviour-incomplete | 154 | 89 | 65 | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-help-0.20.0` | behaviour-incomplete | 5 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-history-0.20.0` | behaviour-incomplete | 14 | 11 | 3 | 0 | 0 | 6 | 0 | 6 | 0 | 0 | 0 | 0 |
| `card-mod-integrate-0.20.0` | views-graded-events-incomplete | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 0 | 0 | 3 | 0 |
| `card-mod-layout-0.20.0` | behaviour-incomplete | 32 | 27 | 2 | 3 | 0 | 3 | 0 | 0 | 3 | 0 | 0 | 0 |
| `card-mod-list-0.20.0` | behaviour-incomplete | 22 | 12 | 10 | 0 | 0 | 5 | 0 | 5 | 0 | 0 | 0 | 0 |
| `card-mod-markdown-0.20.0` | behaviour-complete | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-permissions-0.20.0` | behaviour-incomplete | 4 | 3 | 1 | 0 | 0 | 7 | 0 | 6 | 1 | 0 | 0 | 0 |
| `card-mod-recaptcha-0.20.0` | views-graded-events-incomplete | 1 | 1 | 0 | 0 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `card-mod-rules-0.20.0` | behaviour-incomplete | 41 | 36 | 5 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |
| `card-mod-script-0.20.0` | behaviour-incomplete | 13 | 9 | 4 | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `card-mod-search-0.20.0` | behaviour-incomplete | 32 | 18 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-session-0.20.0` | views-graded-events-incomplete | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 3 | 0 | 0 | 0 |
| `card-mod-style-0.20.0` | behaviour-incomplete | 19 | 9 | 9 | 0 | 1 | 3 | 0 | 0 | 3 | 0 | 0 | 0 |
| `card-mod-tabs-0.20.0` | behaviour-incomplete | 5 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `card-mod-tinymce_editor-0.20.0` | behaviour-incomplete | 11 | 9 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
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
- views graded identical: base:raw [set/right/password.rb] (1 ops), base:reset_password_days [set/right/account/views.rb] (2 ops), base:reset_password_url [set/right/account/views.rb] (2 ops), base:token_days [set/right/account/views.rb] (2 ops), base:token_expiry [set/right/account/views.rb] (2 ops), base:verify_days [set/right/account/views.rb] (2 ops), base:verify_url [set/right/account/views.rb] (2 ops), html:closed_account [set/abstract/account_holder.rb] (2 ops), html:configs [set/type/role.rb] (2 ops), html:core [set/right/password.rb] (1 ops), html:core [set/self/signin.rb] (3 ops), html:core [set/type/signup/views.rb] (1 ops), html:link_with_checkbox [set/type/role.rb] (2 ops), html:open_content [set/self/signin.rb] (1 ops), html:reset_password_success [set/self/signin.rb] (2 ops), html:setup [set/type/user.rb] (2 ops), html:title [set/self/signin.rb] (3 ops), html:token_expiry [set/right/account/views.rb] (2 ops)
- views graded but differing: base:closure [set/right/account/views.rb] differs at synthetic-v2#view:admin:Ada Admin+*account:closure; synthetic-v2-mod-probes#probe-view:1:closure@set/right/account/views.rb - first difference byte 185: oracle "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method &amp;#39;closure_deletions&amp;#39; for #&amp;lt;Card:N7#addr&amp;gt;&lt;/strong&gt" | port "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;private method `closure_deletions&amp;#39; called for #&amp;lt;Card id=232 name=&amp;quot;Sign up&am"; base:raw [set/right/salt.rb] differs at synthetic-v2-mod-probes#probe-view:3:raw@set/right/salt.rb - first difference byte 9: oracle "{\"html\":\"Private data\"}" | port "{\"html\":\"ab8b67d5fdbefa0b9d3630ac7097ad5076dd09fc\"}"; html:account_tab [set/abstract/account_holder.rb] differs at synthetic-v2-mod-probes#probe-view:10:account_tab@set/abstract/account_holder.rb - first difference byte 1405: oracle "er &gt; .card-slot\\\" data-slotter-mode=\\\"override\\\" class=\\\"nav-link slotter wanted-card\\\" data-bs-toggle=\\\"pill\\\" data-breadcrumb=\\\"Account\\\" data-breadcrumb-c" | port "er &gt; .card-slot\\\" data-slotter-mode=\\\"override\\\" class=\\\"known-card nav-link slotter\\\" data-bs-toggle=\\\"pill\\\" data-breadcrumb=\\\"Account\\\" data-breadcrumb-cl"; html:content_formgroups [set/type/signup/views.rb] differs at synthetic-v2-mod-probes#probe-view:13:content_formgroups@set/type/signup/views.rb - first difference byte 521: oracle "t;view&quot;:&quot;titled&quot;,&quot;nest_name&quot;:&quot;Probe Signup+*account+*email&quot;,&quot;show&quot;:[&quot;titled&quot;],&quot;home_view&quot;:&quot" | port "t;view&quot;:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+*email&quot;,&quot;nest_syntax&quot;:&quot;+*email&quot;,&quot;show&quot;:[&quot;titled&quot;],&quo"; html:core [set/right/account/views.rb] differs at synthetic-v2-mod-probes#probe-view:14:core@set/right/account/views.rb - first difference byte 419: oracle ";view&quot;:&quot;labeled&quot;,&quot;nest_name&quot;:&quot;Sign up+*account+*email&quot;,&quot;show&quot;:[&quot;labeled&quot;],&quot;home_view&quot;:&quot;lab" | port ";view&quot;:&quot;labeled&quot;,&quot;nest_name&quot;:&quot;+*email&quot;,&quot;show&quot;:[&quot;labeled&quot;],&quot;home_view&quot;:&quot;labeled&quot;,&quot"; html:edit_buttons [set/self/signin.rb] differs at synthetic-v2-mod-probes#probe-view:18:edit_buttons@set/self/signin.rb - first difference byte 17: oracle "{\"html\":\"<button name=\\\"button\\\" type=\\\"submit\\\" class=\\\"_close-modal-on-success btn btn-primary\\\">Reset password</button>\"}" | port "{\"html\":\"<button type=\\\"submit\\\" class=\\\"_close-modal-on-success btn btn-primary\\\">Reset password</button>\"}"; html:edit [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:edit; synthetic-v2 + extra-ops#view:anonymous:*signin:edit; synthetic-v2-mod-probes#probe-view:19:edit@set/self/signin.rb - first difference byte 1285: oracle ",&quot;hide&quot;:[&quot;help&quot;,&quot;save_button&quot;]}\\\"><div id=\\\"Xsignin-edit_form-view\\\" class=\\\"ALL SELF-Xsignin STAR TYPE-rich_text card-slot edit_f" | port ",&quot;hide&quot;:[&quot;help&quot;,&quot;save_button&quot;],&quot;edit_structure&quot;:[{&quot;name&quot;:&quot;+*email&quot;,&quot;title&quot;:&quot;email&quo"; html:new_buttons [set/type/signup/views.rb] differs at synthetic-v2-mod-probes#probe-view:21:new_buttons@set/type/signup/views.rb - first difference byte 202: oracle "primary create-submit-button submit-button\\\">Submit</button>\\n<button name=\\\"button\\\" type=\\\"submit\\\" class=\\\"btn btn-primary\\\">Send Invitation</button></div>\"}" | port "primary create-submit-button submit-button\\\">Submit</button></div>\"}"; html:new [set/type/signup/views.rb] differs at synthetic-v2-mod-probes#probe-view:22:new@set/type/signup/views.rb - first difference byte 420: oracle "ot;help&quot;],&quot;hide&quot;:[&quot;name_formgroup&quot;]}\\\"><div class=\\\"card d0-card-frame\\\"><div class=\\\"card-header d0-card-header\\\"><h2 class=\\\"d0-card-" | port "ot;help&quot;],&quot;hide&quot;:[&quot;name_formgroup&quot;],&quot;title&quot;:&quot;Sign up&quot;}\\\"><div class=\\\"card d0-card-frame\\\"><div class=\\\"card-header"; html:one_line_content [set/self/signin.rb] differs at synthetic-v2-mod-probes#probe-view:23:one_line_content@set/self/signin.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"text-muted\\\"></div>\"}" | port "{\"html\":\"\"}"; html:open [set/self/signin.rb] differs at synthetic-v2 + extra-ops#view:admin:*signin:open; synthetic-v2 + extra-ops#view:anonymous:*signin:open; synthetic-v2-mod-probes#probe-view:25:open@set/self/signin.rb - first difference byte 346: oracle "ew&quot;:&quot;open&quot;,&quot;show&quot;:[&quot;open&quot;,&quot;help&quot;],&quot;hide&quot;:[&quot;menu&quot;,&quot;bar_middle&quot;]}\\\"><div class='ALL SEL" | port "ew&quot;:&quot;open&quot;,&quot;show&quot;:[&quot;open&quot;],&quot;hide&quot;:[&quot;bar_middle&quot;]}\\\"><div class='ALL SELF-Xsignin STAR TYPE-rich_text acco"
- views only named by a test, not graded: base:raw [set/type_plus_right/user/email.rb]
- views unexercised: (none)
- events graded identical (rows): generate_token [set/all/account.rb] probe e2 on Probe Plain e2 (no on:); set_stamper [set/all/account.rb] probe e3 on Probe Plain e3 (no on:); validate_account_holder_name_change [set/abstract/account_holder.rb] probe e1 on Probe Plain e1 (update)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: act_as_current_for_integrate_stage [set/type/signup.rb], activate_account [set/right/account/events.rb], approve_with_verification [set/type/signup.rb], approve_without_verification [set/type/signup.rb], auto_approve_with_verification [set/type/signup.rb], check_setup [set/type/user.rb], delete_account [set/right/account/events.rb], downcase_email [set/right/email.rb], encrypt_password [set/right/password.rb], password_redirect [set/right/account/events.rb], reset_password [set/right/account/events.rb], send_reset_password_token [set/self/signin.rb], set_default_salt [set/right/account/events.rb], set_default_status [set/right/account/events.rb], setup_first_user [set/type/user.rb], signin [set/self/signin.rb], signin_after_setup [set/type/user.rb], signin_success [set/self/signin.rb], signout [set/self/signin.rb], signout_upon_delete [set/right/account/events.rb], update_role_cache [set/type_plus_right/role/members.rb], validate_email [set/right/email.rb], validate_password_chars [set/right/password.rb], validate_password_length [set/right/password.rb], validate_password_present [set/right/password.rb], validate_unique_email [set/right/email.rb], verify_and_activate [set/right/account/events.rb]
- events with no probe: (none)
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
- views graded but differing: json:token [set/right/api_key.rb] differs at synthetic-v2-mod-probes#probe-view:39:token@set/right/api_key.rb - first difference byte 10: oracle "{\"class\":\"NoMethod\",\"message\":\"undefined method 'id' for nil\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format json (view token)\"}"
- views only named by a test, not graded: (none)
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
- events graded but differing rows: asset_input_changed [set/abstract/asset_inputter.rb] differs at mod-event-probes#140; mod-event-probes#141 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105677,\"card_id\":972,\"comment\":null,\"draft\":0,\"id\":1072,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105696,\"card_id\":984,\"comment\":null,\"draft\":0,\"id\":1097,\"super_action_id\":null}],\"updated\":[]},\"card_act"; asset_input_changed_on_delete [set/abstract/asset_inputter.rb] differs at mod-event-probes#145; mod-event-probes#146 - first difference byte 76: oracle "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105682,\"card_id\":974,\"comment\":null,\"draft\":0,\"id\":1077,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105701,\"card_id\":986,\"comment\":null,\"draft\":0,\"id\":1102,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; remove_codename [set/right/asset_output.rb] differs at mod-event-probes#160; mod-event-probes#161 - first difference byte 1: oracle "{\"card_actions\":{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105695,\"card_id\":981,\"comment\":null,\"draft\":0,\"i" | port "{}"; update_asset_output_file [set/abstract/asset_outputter.rb] differs at mod-event-probes#150; mod-event-probes#151 - first difference byte 76: oracle "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105687,\"card_id\":976,\"comment\":null,\"draft\":0,\"id\":1082,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105706,\"card_id\":988,\"comment\":null,\"draft\":0,\"id\":1107,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; validate_asset_inputs [set/abstract/asset_outputter.rb] differs at mod-event-probes#155; mod-event-probes#156 - first difference byte 76: oracle "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105692,\"card_id\":978,\"comment\":null,\"draft\":0,\"id\":1087,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105711,\"card_id\":990,\"comment\":null,\"draft\":0,\"id\":1112,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
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
- views graded but differing: html:bar_middle [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:68:bar_middle@set/type_plus_right/bootswatch_skin/colors.rb - first difference byte 9: oracle "{\"html\":\"      <div class=\\\"colorpicker-element\\\">\\n        <div class=\\\"input-group-addon\\\">\\n          <span class=\\\"bg-body bo" | port "{\"html\":\"\\n      <div class=\\\"colorpicker-element\\\">\\n        <div class=\\\"input-group-addon\\\">\\n          <span class=\\\"bg-body "; html:bar_right [set/type/bootswatch_skin/html_views.rb] differs at synthetic-v2 + extra-ops#view:admin:cerulean skin:bar_right; synthetic-v2-mod-probes#probe-view:69:bar_right@set/type/bootswatch_skin/html_views.rb - first difference byte 8: oracle "{\"html\":null}" | port "{\"html\":\"\"}"; html:carousel [set/all/bootstrap/carousel.rb] differs at synthetic-v2-mod-probes#probe-view:70:carousel@set/all/bootstrap/carousel.rb - first difference byte 10: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible t" | port "{\"html\":\"<div class=\\\"carousel slide\\\" id=\\\"decko_bot-1\\\" data-bs-ride=\\\"true\\\"><div class=\\\"carousel-indicators\\\"><button data-bs"; html:core [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:71:core@set/type_plus_right/bootswatch_skin/colors.rb - first difference byte 20: oracle "{\"html\":\"<div class='colorpicker-element row'>\\n<div class='col-auto input-group-addon'>\\n<div>\\n<span class='labeled-badge'></span>\\n<i sty" | port "{\"html\":\"<div class=\\\"CodeRay\\\">\\n  <div class=\\\"code\\\"><pre></pre></div>\\n</div>\\n\"}"; html:input [set/type_plus_right/bootswatch_skin/colors.rb] differs at synthetic-v2-mod-probes#probe-view:75:input@set/type_plus_right/bootswatch_skin/colors.rb - first difference byte 10: oracle "{\"html\":\"<div class='row'>\\n<div class='col-6'>\\n<h4>Palette</h4>\\n<div class='row'>\\n<label class='col-form-label col-sm-3'>\\nblu" | port "{\"html\":\"<textarea rows=\\\"3\\\" class=\\\"d0-card-content form-control tinymce-textarea\\\" id=\\\"cerulean_skin-Xcolor-1\\\" name=\\\"card[co"; html:one_line_content [set/type/bootswatch_skin.rb] differs at synthetic-v2-mod-probes#probe-view:77:one_line_content@set/type/bootswatch_skin.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"text-muted\\\"></div>\"}" | port "{\"html\":\"\"}"; html:one_line_content [set/type/bootswatch_skin/html_views.rb] differs at synthetic-v2-mod-probes#probe-view:78:one_line_content@set/type/bootswatch_skin/html_views.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"text-muted\\\"></div>\"}" | port "{\"html\":\"\"}"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: initialize_because_of_type_change [set/type/bootswatch_skin/events.rb] differs at mod-event-probes#170; mod-event-probes#171 - first difference byte 1: oracle "{\"card_actions\":{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105704,\"card_id\":988,\"comment\":null,\"draft\":0,\"i" | port "{}"; update_skin_asset_input [set/abstract/skin_field.rb] differs at mod-event-probes#165; mod-event-probes#166 - first difference byte 76: oracle "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105699,\"card_id\":984,\"comment\":null,\"draft\":0,\"id\":1094,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105716,\"card_id\":992,\"comment\":null,\"draft\":0,\"id\":1117,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; use_as_current_skin [set/type/bootswatch_skin.rb] differs at mod-event-probes#183; mod-event-probes#184 - first difference byte 1: oracle "{\"card_actions\":{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105717,\"card_id\":1006,\"comment\":null,\"draft\":0,\"" | port "{}"
- events run with no effect seen against the baseline: copy_theme [set/type/bootswatch_skin/events.rb], translate_variables_to_scss [set/type_plus_right/bootswatch_skin/colors.rb], validate_theme_template [set/type/bootswatch_skin/events.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-carrierwave-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-carrierwave-events.test.ts`, `tests/card/mod-loader/card-mod-carrierwave-when-predicates.test.ts`, `tests/card/mod-loader/card-mod-carrierwave.test.ts`
- views graded identical: base:core [set/type/file.rb] (21 ops), base:inline [set/type/image.rb] (2 ops), base:source [set/type/file.rb] (2 ops), base:source [set/type/image.rb] (1 ops), html:content_changes [set/type/image/html_views.rb] (2 ops), html:core [set/self/new_file.rb] (1 ops), html:core [set/self/new_image.rb] (1 ops), html:core [set/type/file.rb] (21 ops), html:core [set/type/image/html_views.rb] (7 ops), html:full_width [set/type/image/html_views.rb] (2 ops), html:input [set/self/new_file.rb] (2 ops), html:input [set/type/file.rb] (2 ops), html:link_tag [set/self/favicon.rb] (2 ops), html:source [set/self/favicon.rb] (1 ops), html:source [set/self/new_file.rb] (1 ops), html:source [set/self/new_image.rb] (1 ops)
- views graded but differing: base:one_line_content [set/type/image.rb] differs at synthetic-v2-mod-probes#probe-view:82:one_line_content@set/type/image.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\">Image : <em>empty</em></div>\"}" | port "{\"html\":\"Image : <em>empty</em>\"}"; css:content [set/type/image.rb] differs at synthetic-v2-mod-probes#probe-view:85:content@set/type/image.rb - first difference adapter error Error: the port has no view dispatch for format css (view content); css:core [set/type/image.rb] differs at synthetic-v2-mod-probes#probe-view:86:core@set/type/image.rb - first difference adapter error Error: the port has no view dispatch for format css (view core); email_html:inline [set/type/image.rb] differs at synthetic-v2-mod-probes#probe-view:87:inline@set/type/image.rb - first difference adapter error Error: the port has no view dispatch for format email_html (view inline); file:core [set/type/file.rb] differs at synthetic-v2-mod-probes#probe-view:88:core@set/type/file.rb - first difference adapter error Error: the port has no view dispatch for format file (view core); html:input [set/self/new_image.rb] differs at synthetic-v2 + extra-ops#view:admin:*new image:input; synthetic-v2-mod-probes#probe-view:96:input@set/self/new_image.rb - first difference byte 36: oracle "{\"html\":\"<div class='choose-file'>\\n<div class=\\\"attachment-preview\\\" id=\\\"1789819200-preview\\\"></div>\\n<span class='btn btn-secondary fileinput-button'>\\n<" | port "{\"html\":\"<div class='choose-file'>\\n\\n<span class='btn btn-secondary fileinput-button'>\\n<i class=\\\"material-icons notranslate\\\">cloud_upload</i>\\n<span>Rep"; html:preview_editor [set/type/file.rb] differs at synthetic-v2-mod-probes#probe-view:99:preview_editor@set/type/file.rb - first difference byte 202: oracle ")&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method &amp;#39;gsub&amp;#39; for nil&lt;/strong&gt;&lt;/p&gt;\\n      &lt;div&gt;N6#frames&lt;/div&gt;\\n   " | port ")&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method `gsub&amp;#39; for nil&lt;/strong&gt;&lt;/p&gt;\\n      &lt;div&gt;N6#frames&lt;/div&gt;\\n    \\\">*new"; json:content [set/type/file.rb] differs at synthetic-v2-mod-probes#probe-view:103:content@set/type/file.rb - first difference adapter error Error: the port has no view dispatch for format json (view content); json:image_complete [set/self/search.rb] differs at synthetic-v2-mod-probes#probe-view:104:image_complete@set/self/search.rb - first difference adapter error Error: the port has no view dispatch for format json (view image_complete)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: assign_attachment_on_update [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#198; mod-event-probes#199 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105731,\"card_id\":1014,\"comment\":null,\"draft\":0,\"id\":1150,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105730,\"card_id\":998,\"comment\":null,\"draft\":0,\"id\":1131,\"super_action_id\":null}],\"updated\":[]},\"card_acts"; change_bucket_if_read_only [set/abstract/attachment/cloud.rb] differs at mod-event-probes#226; mod-event-probes#227 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105759,\"card_id\":1026,\"comment\":null,\"draft\":0,\"id\":1178,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105758,\"card_id\":1010,\"comment\":null,\"draft\":0,\"id\":1159,\"super_action_id\":null}],\"updated\":[]},\"card_act"; correct_identifier [set/abstract/attachment.rb] differs at mod-event-probes#260; mod-event-probes#261 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105793,\"card_id\":1040,\"comment\":null,\"draft\":0,\"id\":1212,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105792,\"card_id\":1024,\"comment\":null,\"draft\":0,\"id\":1193,\"super_action_id\":null}],\"updated\":[]},\"card_act"; delete_cached_upload_file_on_update [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#211; mod-event-probes#212 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105744,\"card_id\":1020,\"comment\":null,\"draft\":0,\"id\":1163,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105743,\"card_id\":1004,\"comment\":null,\"draft\":0,\"id\":1144,\"super_action_id\":null}],\"updated\":[]},\"card_act"; prepare_attachment [set/abstract/attachment/00_upload_cache.rb] differs at mod-event-probes#189; mod-event-probes#190 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105722,\"card_id\":1010,\"comment\":null,\"draft\":0,\"id\":1141,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105721,\"card_id\":994,\"comment\":null,\"draft\":0,\"id\":1122,\"super_action_id\":null}],\"updated\":[]},\"card_acts"; remove_public_link_on_delete [set/abstract/attachment/local.rb] differs at mod-event-probes#245; mod-event-probes#246 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105778,\"card_id\":1034,\"comment\":null,\"draft\":0,\"id\":1197,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105777,\"card_id\":1018,\"comment\":null,\"draft\":0,\"id\":1178,\"super_action_id\":null}],\"updated\":[]},\"card_act"; save_original_filename [set/abstract/attachment.rb] differs at mod-event-probes#265; mod-event-probes#266 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105798,\"card_id\":1042,\"comment\":null,\"draft\":0,\"id\":1217,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105797,\"card_id\":1026,\"comment\":null,\"draft\":0,\"id\":1198,\"super_action_id\":null}],\"updated\":[]},\"card_act"; select_file_revision [set/abstract/attachment.rb] differs at mod-event-probes#255; mod-event-probes#256 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105788,\"card_id\":1038,\"comment\":null,\"draft\":0,\"id\":1207,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105787,\"card_id\":1022,\"comment\":null,\"draft\":0,\"id\":1188,\"super_action_id\":null}],\"updated\":[]},\"card_act"; uncode_attachment_storage [set/abstract/attachment/coded.rb] differs at mod-event-probes#231; mod-event-probes#232 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105764,\"card_id\":1028,\"comment\":null,\"draft\":0,\"id\":1183,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105763,\"card_id\":1012,\"comment\":null,\"draft\":0,\"id\":1164,\"super_action_id\":null}],\"updated\":[]},\"card_act"; update_public_link [set/abstract/attachment/local.rb] differs at mod-event-probes#250; mod-event-probes#251 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105783,\"card_id\":1036,\"comment\":null,\"draft\":0,\"id\":1202,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105782,\"card_id\":1020,\"comment\":null,\"draft\":0,\"id\":1183,\"super_action_id\":null}],\"updated\":[]},\"card_act"; update_storage [set/abstract/attachment/01_storage_type.rb] differs at mod-event-probes#216; mod-event-probes#217 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105749,\"card_id\":1022,\"comment\":null,\"draft\":0,\"id\":1168,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105748,\"card_id\":1006,\"comment\":null,\"draft\":0,\"id\":1149,\"super_action_id\":null}],\"updated\":[]},\"card_act"; validate_coded_storage_type [set/abstract/attachment/coded.rb] differs at mod-event-probes#236; mod-event-probes#237 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105769,\"card_id\":1030,\"comment\":null,\"draft\":0,\"id\":1188,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105768,\"card_id\":1014,\"comment\":null,\"draft\":0,\"id\":1169,\"super_action_id\":null}],\"updated\":[]},\"card_act"; validate_storage_type [set/abstract/attachment/01_storage_type.rb] differs at mod-event-probes#221; mod-event-probes#222 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105754,\"card_id\":1024,\"comment\":null,\"draft\":0,\"id\":1173,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105753,\"card_id\":1008,\"comment\":null,\"draft\":0,\"id\":1154,\"super_action_id\":null}],\"updated\":[]},\"card_act"; write_identifier [set/abstract/attachment.rb] differs at mod-event-probes#274; mod-event-probes#275 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105807,\"card_id\":1046,\"comment\":null,\"draft\":0,\"id\":1226,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105806,\"card_id\":1030,\"comment\":null,\"draft\":0,\"id\":1207,\"super_action_id\":null}],\"updated\":[]},\"card_act"
- events run with no effect seen against the baseline: assign_attachment_on_create [set/abstract/attachment/00_upload_cache.rb], clear_draft_files [set/abstract/attachment/00_upload_cache.rb], delete_cached_upload_file_on_create [set/abstract/attachment/00_upload_cache.rb], update_public_link_on_create [set/abstract/attachment/local.rb], validate_file_exist [set/abstract/attachment.rb]
- events with no probe: (none)
- events unexercised: mark_remove_<column>_false_event, remove_<column>_event, remove_previously_stored_<column>_event, reset_previous_changes_for_<column>_event, store_<column>_event

#### card-mod-collection-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-collection.test.ts`
- views graded identical: html:paging [set/abstract/paging/paging_views.rb] (2 ops)
- views graded but differing: base:count [set/all/item.rb] differs at synthetic-v2-mod-probes#probe-view:105:count@set/all/item.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible " | port "{\"html\":\"4\"}"; html:count [set/all/item.rb] differs at synthetic-v2-mod-probes#probe-view:106:count@set/all/item.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible " | port "{\"html\":\"4\"}"; json:paging_urls [set/abstract/paging/paging_views.rb] differs at synthetic-v2-mod-probes#probe-view:108:paging_urls@set/abstract/paging/paging_views.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (paging_urls) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format json (view paging_urls)\"}"; jsonld:paging_urls [set/abstract/paging/paging_views.rb] differs at synthetic-v2-mod-probes#probe-view:109:paging_urls@set/abstract/paging/paging_views.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (paging_urls) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format jsonld (view paging_urls)\"}"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-comment-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-comment.test.ts`
- views graded identical: base:comment_box [set/all/comment.rb] (3 ops), base:core [set/right/discussion.rb] (5 ops), base:input [set/right/discussion.rb] (1 ops), base:open [set/right/discussion.rb] (1 ops), base:titled_content [set/right/discussion.rb] (1 ops), base:titled [set/right/discussion.rb] (1 ops)
- views graded but differing: base:open_content [set/right/discussion.rb] differs at synthetic-v2-mod-probes#probe-view:113:open_content@set/right/discussion.rb - first difference byte 10: oracle "{\"html\":\"<p>First comment.</p>\\n<div class=\\\"comment-box nodblclick\\\"><form class=\\\"autosave card-form slotter\\\" id=\\\"edit_card_94" | port "{\"html\":\"<textarea rows=\\\"3\\\" class=\\\"d0-card-content form-control tinymce-textarea\\\" id=\\\"topic_001-discussion-1\\\" name=\\\"card[co"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: add_comment [set/all/comment.rb] differs at mod-event-probes#279; mod-event-probes#280 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105812,\"card_id\":1048,\"comment\":null,\"draft\":0,\"id\":1231,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105811,\"card_id\":1032,\"comment\":null,\"draft\":0,\"id\":1212,\"super_action_id\":null}],\"updated\":[]},\"card_act"
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-content-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:bar_middle [set/abstract/01_code_content.rb] (2 ops), html:core [set/abstract/haml_file.rb] (1410 ops), html:core [set/abstract/templated_nests.rb] (1410 ops), html:file_size [set/abstract/02_code_file.rb] (2 ops), html:input [set/abstract/01_code_content.rb] (2 ops), html:input [set/abstract/haml_file.rb] (2 ops), html:input [set/abstract/read_only.rb] (2 ops)
- views graded but differing: html:one_line_content [set/right/default.rb] differs at synthetic-v2-mod-probes#probe-view:124:one_line_content@set/right/default.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\">RichText : <em>empty</em></div>\"}" | port "{\"html\":\"RichText : <em>empty</em>\"}"; html:one_line_content [set/right/structure.rb] differs at synthetic-v2-mod-probes#probe-view:125:one_line_content@set/right/structure.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\"><a class=\\\"cardtype known-card\\\" href=\\\"/RichText\\\">RichText</a> : {{+:description|co" | port "{\"html\":\"RichText : {{+:description|content}}\\n{{_|add_button}}{{_|configure_button}}\\n{{+:type+:by_name|content}}\\n\"}"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: update_structurees_references [set/right/structure.rb] differs at mod-event-probes#285 - first difference byte 3: oracle "{\"class\":\"ArgumentError\",\"message\":\"no such card Probe e64+*structure\"}" | port "{\"card\":null,\"errors\":[{\"field\":\"exception\",\"message\":\"Error: no such card Probe e64+*structure\"}],\"mail\":[],\"saved\":false}"
- events run with no effect seen against the baseline: reset_cache_to_use_new_structure [set/right/structure.rb], update_structurees_type [set/right/structure.rb]
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
- views graded but differing: html:board [set/all/editing.rb] differs at synthetic-v2-mod-probes#probe-view:129:board@set/all/editing.rb - first difference byte 6722: oracle "ablist'>\\n<li role=\\\"presentation\\\" class=\\\"nav-item tab-li-account\\\"><a data-url=\\\"/Decko_Bot/account_tab\\\" class=\\\"load nav-link\\\" role=\\\"tab\\\" data-bs-toggle" | port "ablist'>\\n<li role=\\\"presentation\\\" class=\\\"nav-item tab-li-guide\\\"><a data-url=\\\"/Decko_Bot/guide_tab\\\" class=\\\"active nav-link\\\" role=\\\"tab\\\" data-bs-toggle=\\"; html:edit_structure [set/all/editing.rb] differs at synthetic-v2-mod-probes#probe-view:144:edit_structure@set/all/editing.rb - first difference byte 8: oracle "{\"html\":null}" | port "{\"html\":\"\"}"; html:history_tab [set/all/board/tab_views.rb] differs at synthetic-v2-mod-probes#probe-view:152:history_tab@set/all/board/tab_views.rb - first difference byte 1243: oracle " class=\\\"material-icons notranslate\\\">add_circle</i><small> </small></div></a></li></ul></div>\"}" | port " class=\\\"material-icons notranslate\\\">add_circle</i><small> 599</small></div></a></li></ul></div>\"}"; html:new [set/all/new.rb] differs at synthetic-v2 + extra-ops#view:admin:Sign up:new; html:related_tab [set/all/board/tab_views.rb] differs at synthetic-v2-mod-probes#probe-view:166:related_tab@set/all/board/tab_views.rb - first difference byte 4011: oracle "umb=\\\"Related\\\" data-breadcrumb-class=\\\"related\\\" data-cy=\\\"rich_text_card-pill\\\" href=\\\"/RichText+*type+by_name/content?layout=overlay&amp;slot%5Bitems%5D%5Bvi" | port "umb=\\\"Related\\\" data-breadcrumb-class=\\\"related\\\" data-cy=\\\"basic_card-pill\\\" href=\\\"/RichText+*type+by_name/content?layout=overlay&amp;slot%5Bitems%5D%5Bview%5"
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
- views graded but differing: email_html:compact_missing [set/all/email_html.rb] differs at synthetic-v2-mod-probes#probe-view:170:compact_missing@set/all/email_html.rb - first difference adapter error Error: the port has no view dispatch for format email_html (view compact_missing); email_html:core [set/abstract/test_context.rb] differs at synthetic-v2-mod-probes#probe-view:171:core@set/abstract/test_context.rb - first difference adapter error Error: the port has no view dispatch for format email_html (view core); email_html:unknown [set/all/email_html.rb] differs at synthetic-v2-mod-probes#probe-view:172:unknown@set/all/email_html.rb - first difference adapter error Error: the port has no view dispatch for format email_html (view unknown); email_text:compact_missing [set/all/email_text.rb] differs at synthetic-v2-mod-probes#probe-view:173:compact_missing@set/all/email_text.rb - first difference adapter error Error: the port has no view dispatch for format email_text (view compact_missing); email_text:last_action [set/all/email_text.rb] differs at synthetic-v2-mod-probes#probe-view:174:last_action@set/all/email_text.rb - first difference adapter error Error: the port has no view dispatch for format email_text (view last_action); email_text:unknown [set/all/email_text.rb] differs at synthetic-v2-mod-probes#probe-view:175:unknown@set/all/email_text.rb - first difference adapter error Error: the port has no view dispatch for format email_text (view unknown); html:content [set/right/html_message.rb] differs at synthetic-v2-mod-probes#probe-view:176:content@set/right/html_message.rb - first difference byte 582: oracle "ot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}\\\"><span class=\\\"alert alert-danger render-error\\\">unknown codename: test_context</span></div>\\n</div>\\n" | port "ot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}\\\"><div style=\\\"text-align:center\\\">\\n  <h1>Thank you for signing up with My Deck!</h1>\\n  <p>\\n    Plea"; html:core [set/right/text_message.rb] differs at synthetic-v2-mod-probes#probe-view:178:core@set/right/text_message.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">unknown codename: test_context</span>\"}" | port "{\"html\":\"Thank you for signing up with My Deck!\\n\\nPlease follow the link below to verify this email address and activate your ac"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-follow-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-follow-views.test.ts`, `tests/card/mod-loader/card-mod-follow.test.ts`
- views graded identical: base:followed [set/all/notify/base_views.rb] (2 ops), base:follower [set/all/notify/base_views.rb] (2 ops), base:last_action_verb [set/all/notify/base_views.rb] (2 ops), base:list_of_changes [set/all/notify/base_views.rb] (2 ops), base:subedit_notice [set/all/notify/base_views.rb] (2 ops), base:subedits [set/all/notify/base_views.rb] (2 ops), base:unfollow_url [set/all/notify/base_views.rb] (2 ops), html:confirm_update_all [set/self/follow_defaults.rb] (2 ops), html:core [set/type_plus_right/user/follow.rb] (3 ops), html:follow_button [set/all/follow/follow_link_views.rb] (3 ops), html:follow_item [set/right/follow.rb] (2 ops), html:follow_status [set/right/follow.rb] (2 ops), html:follow_tab [set/type_plus_right/user/follow.rb] (2 ops), html:ignore_tab [set/type_plus_right/user/follow.rb] (2 ops), html:rule_editor [set/right/following.rb] (1 ops), html:status [set/right/following.rb] (1 ops)
- views graded but differing: html:edit_buttons [set/self/follow_defaults.rb] differs at synthetic-v2 + extra-ops#view:admin:*follow defaults:edit_buttons; synthetic-v2-mod-probes#probe-view:190:edit_buttons@set/self/follow_defaults.rb - first difference byte 705: oracle "           This may take a while. </p>\\n        </div></div><div class=\\\"button-form-group form-group\\\"><button name=\\\"card[trigger]\\\" type=\\\"submit\\\" data-disa" | port "           This may take a while. </p>\\n        </div></div>\\n<div class=\\\"button-form-group form-group\\\"><button type=\\\"submit\\\" name=\\\"card[trigger]\\\" value=\\"; html:edit [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:191:edit@set/type_plus_right/user/follow.rb - first difference byte 14: oracle "{\"html\":\"<div class='_modal-slot fade modal' id='modal-container' role='dialog'>\\n<!-- /, \\\"data-backdrop\\\": \\\"static\\\"} -->\\n<div cla" | port "{\"html\":\"<div id=\\\"ada_admin-Xfollow-open-view\\\" class=\\\"ALL ALL_PLUS RIGHT-Xfollow RSTAR SELF-ada_admin-Xfollow TYPE-list TYPE_PLUS_R"; html:errors [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:192:errors@set/type_plus_right/user/follow.rb - first difference byte 8: oracle "{\"html\":null}" | port "{\"html\":\"\"}"; html:one_line_content [set/type_plus_right/user/follow.rb] differs at synthetic-v2-mod-probes#probe-view:198:one_line_content@set/type_plus_right/user/follow.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"text-muted\\\"></div>\"}" | port "{\"html\":\"\"}"; json:follow_status [set/all/follow/follow_link_views.rb] differs at synthetic-v2-mod-probes#probe-view:199:follow_status@set/all/follow/follow_link_views.rb - first difference byte 10: oracle "{\"class\":\"NoMethod\",\"message\":\"undefined method 'link_opts' for class Card::Set::All::Follow::StartFollowLink\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format json (view follow_status)\"}"
- views only named by a test, not graded: html:core [set/right/followers.rb], html:core [set/right/following.rb], html:one_line_content [set/right/following.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: cache_expired_for_type_change [set/all/follow/follower_ids.rb] differs at mod-event-probes#299; mod-event-probes#300 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105818,\"card_id\":1052,\"comment\":null,\"draft\":0,\"id\":1238,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105816,\"card_id\":1034,\"comment\":null,\"draft\":0,\"id\":1217,\"super_action_id\":null}],\"updated\":[]},\"card_act"; expire_preferences_cache [set/all/follow/follower_ids.rb] differs at mod-event-probes#304; mod-event-probes#305 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105823,\"card_id\":1054,\"comment\":null,\"draft\":0,\"id\":1243,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105821,\"card_id\":1036,\"comment\":null,\"draft\":0,\"id\":1222,\"super_action_id\":null}],\"updated\":[]},\"card_act"; notify_followers_after_delete [set/all/notify.rb] differs at mod-event-probes#324; mod-event-probes#325 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105843,\"card_id\":1062,\"comment\":null,\"draft\":0,\"id\":1263,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105841,\"card_id\":1044,\"comment\":null,\"draft\":0,\"id\":1242,\"super_action_id\":null}],\"updated\":[]},\"card_act"; notify_followers_after_save [set/all/notify.rb] differs at mod-event-probes#314; mod-event-probes#315 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105833,\"card_id\":1058,\"comment\":null,\"draft\":0,\"id\":1253,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105831,\"card_id\":1040,\"comment\":null,\"draft\":0,\"id\":1232,\"super_action_id\":null}],\"updated\":[]},\"card_act"; silence_notifications [set/all/notify.rb] differs at mod-event-probes#309; mod-event-probes#310 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105828,\"card_id\":1056,\"comment\":null,\"draft\":0,\"id\":1248,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105826,\"card_id\":1038,\"comment\":null,\"draft\":0,\"id\":1227,\"super_action_id\":null}],\"updated\":[]},\"card_act"; stash_followers [set/all/notify.rb] differs at mod-event-probes#319; mod-event-probes#320 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105838,\"card_id\":1060,\"comment\":null,\"draft\":0,\"id\":1258,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105836,\"card_id\":1042,\"comment\":null,\"draft\":0,\"id\":1237,\"super_action_id\":null}],\"updated\":[]},\"card_act"
- events run with no effect seen against the baseline: cache_expired_for_new_preference [set/right/follow.rb], cache_expired_for_new_set [set/type/set.rb], follow_fields_changed [set/right/follow_fields.rb], update_follow_rules [set/self/follow_defaults.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-format-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-format-async-head-views.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-format-head-header-views.test.ts`, `tests/card/mod-loader/card-mod-format-hidden-content-field-view.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-format-smart-label.test.ts`, `tests/card/mod-loader/card-mod-format-toggle-raises.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: base:acted_at [set/all/base.rb] (2 ops), base:bad_address [set/all/error.rb] (2 ops), base:blank [set/all/base.rb] (2 ops), base:closed [set/all/base.rb] (2 ops), base:codename [set/all/base.rb] (2 ops), base:compact_missing [set/all/error.rb] (2 ops), base:content [set/all/base.rb] (2 ops), base:core [set/all/base.rb] (1410 ops), base:core [set/type/toggle.rb] (16 ops), base:created_at [set/all/base.rb] (2 ops), base:denial [set/all/error.rb] (2 ops), base:errors [set/all/error.rb] (2 ops), base:home_path [set/self/home.rb] (1 ops), base:id_url [set/all/base.rb] (2 ops), base:id [set/all/base.rb] (2 ops), base:key [set/all/base.rb] (2 ops), base:label [set/all/content.rb] (2 ops), base:labeled_content [set/all/base.rb] (2 ops), base:labeled [set/all/base.rb] (2 ops), base:link [set/all/base.rb] (2 ops), base:linkname [set/all/base.rb] (2 ops), base:name [set/all/base.rb] (2 ops), base:nav_link [set/all/base.rb] (2 ops), base:open_content [set/all/base.rb] (2 ops), base:open [set/all/base.rb] (2 ops), base:page_title [set/all/html/head.rb] (2 ops), base:raw [set/all/base.rb] (3 ops), base:server_error [set/all/error.rb] (2 ops), base:smart_label [set/all/content.rb] (2 ops), base:text_without_nests [set/all/text.rb] (2 ops), base:title_link [set/type/uri.rb] (2 ops), base:title [set/all/title.rb] (2 ops), base:titled_content [set/all/base.rb] (2 ops), base:titled [set/all/base.rb] (2 ops), base:type [set/all/base.rb] (2 ops), base:unknown [set/all/error.rb] (2 ops), base:updated_at [set/all/base.rb] (2 ops), base:url_link [set/all/base.rb] (2 ops), base:url_link [set/type/uri.rb] (1 ops), base:url [set/all/base.rb] (2 ops), html:add_button [set/type/cardtype.rb] (2 ops), html:add_link [set/type/cardtype.rb] (2 ops), html:add_url [set/type/cardtype.rb] (2 ops), html:admin [set/type/mod.rb] (1 ops), html:bar_right [set/type/mod.rb] (2 ops), html:board_link [set/all/html/menu.rb] (2 ops), html:compact_missing [set/all/html/error.rb] (2 ops), html:configure_button [set/type/cardtype.rb] (2 ops), html:configure_link [set/type/cardtype.rb] (2 ops), html:content_panel [set/all/html/views.rb] (2 ops), html:content_with_title [set/all/html/views.rb] (2 ops), html:content [set/all/html/views.rb] (2 ops), html:core [set/type/json.rb] (1 ops), html:core [set/type/uri.rb] (3 ops), html:debug_server_error [set/all/html/error.rb] (2 ops), html:demo [set/all/demo.rb] (2 ops), html:denial [set/all/html/error.rb] (2 ops), html:edit_button [set/all/html/menu.rb] (3 ops), html:edit_link [set/all/html/menu.rb] (3 ops), html:errors [set/all/html/error.rb] (2 ops), html:favicon_tag [set/all/html/head.rb] (2 ops), html:flash [set/all/html/frame.rb] (2 ops), html:full_page_link [set/all/html/menu.rb] (2 ops), html:head [set/all/html/head.rb] (2 ops), html:header_title [set/all/html/header.rb] (2 ops), html:header [set/all/html/header.rb] (2 ops), html:help_link [set/all/html/menu.rb] (2 ops), html:hidden_content_field [set/all/content.rb] (2 ops), html:input [set/type/toggle.rb] (2 ops), html:labeled_editor [set/type/toggle.rb] (2 ops), html:labeled [set/all/html/views.rb] (2 ops), html:menu_block [set/all/html/menu.rb] (2 ops), html:menu [set/all/html/menu.rb] (2 ops), html:meta_tags [set/all/html/head.rb] (2 ops), html:mini_unknown [set/all/html/error.rb] (2 ops), html:page_title_tag [set/all/html/head.rb] (2 ops), html:rss_links [set/all/html/head.rb] (2 ops), html:server_error [set/all/html/error.rb] (2 ops), html:short_content [set/all/html/views.rb] (2 ops), html:stylesheet_tags [set/all/html/head.rb] (2 ops), html:title_link [set/all/title.rb] (1 ops), html:title_no_link [set/all/title.rb] (2 ops), html:title [set/all/title.rb] (2 ops), html:titled [set/all/html/views.rb] (2 ops), html:type [set/all/html.rb] (2 ops), html:type [set/type/cardtype.rb] (1 ops), html:universal_edit_button [set/all/html/head.rb] (2 ops), html:unknown [set/all/html/error.rb] (2 ops), html:view_list [set/all/demo.rb] (2 ops)
- views graded but differing: base:closed_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:203:closed_content@set/all/content.rb - first difference byte 66: oracle "\":\"\\n  This is the account that makes any automated updates —...\"}" | port "\":\"\\n  This is the account that makes any automated updates &...\"}"; base:home_url [set/self/home.rb] differs at synthetic-v2-mod-probes#probe-view:214:home_url@set/self/home.rb - first difference byte 9: oracle "{\"html\":\"http://deck.example/\"}" | port "{\"html\":\"/\"}"; base:not_found [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:225:not_found@set/all/error.rb - first difference byte 9: oracle "{\"html\":\"<div id=\\\"decko_bot-not_found-view\\\" class=\\\"ALL SELF-decko_bot TYPE-rich_text card-slot not_found-view\\\" data-card-id=\\" | port "{\"html\":\"format.not_found_named\"}"; base:one_line_content [set/all/base.rb] differs at synthetic-v2-mod-probes#probe-view:226:one_line_content@set/all/base.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; base:one_line_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:227:one_line_content@set/all/content.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; base:one_line_content [set/type/html.rb] differs at synthetic-v2-mod-probes#probe-view:228:one_line_content@set/type/html.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\">{{:head|core}}</div>\"}" | port "{\"html\":\"{{:head|core}}\"}"; base:raw_one_line_content [set/all/content.rb] differs at synthetic-v2-mod-probes#probe-view:232:raw_one_line_content@set/all/content.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; css:content [set/all/css.rb] differs at synthetic-v2-mod-probes#probe-view:247:content@set/all/css.rb - first difference adapter error Error: the port has no view dispatch for format css (view content); css:import [set/all/css.rb] differs at synthetic-v2-mod-probes#probe-view:248:import@set/all/css.rb - first difference adapter error Error: the port has no view dispatch for format css (view import); css:titled [set/all/css.rb] differs at synthetic-v2-mod-probes#probe-view:249:titled@set/all/css.rb - first difference adapter error Error: the port has no view dispatch for format css (view titled); css:unknown [set/all/css.rb] differs at synthetic-v2-mod-probes#probe-view:250:unknown@set/all/css.rb - first difference adapter error Error: the port has no view dispatch for format css (view unknown); css:url [set/all/css.rb] differs at synthetic-v2-mod-probes#probe-view:251:url@set/all/css.rb - first difference adapter error Error: the port has no view dispatch for format css (view url); csv:body [set/all/csv.rb] differs at synthetic-v2-mod-probes#probe-view:252:body@set/all/csv.rb - first difference adapter error Error: the port has no view dispatch for format csv (view body); csv:header [set/all/csv.rb] differs at synthetic-v2-mod-probes#probe-view:253:header@set/all/csv.rb - first difference adapter error Error: the port has no view dispatch for format csv (view header); csv:row [set/all/csv.rb] differs at synthetic-v2-mod-probes#probe-view:254:row@set/all/csv.rb - first difference adapter error Error: the port has no view dispatch for format csv (view row); csv:titled [set/all/csv.rb] differs at synthetic-v2-mod-probes#probe-view:255:titled@set/all/csv.rb - first difference byte 10: oracle "{\"class\":\"NoMethod\",\"message\":\"undefined method 'each' for an instance of String\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format csv (view titled)\"}"; csv:unknown [set/all/csv.rb] differs at synthetic-v2-mod-probes#probe-view:256:unknown@set/all/csv.rb - first difference adapter error Error: the port has no view dispatch for format csv (view unknown); data:ancestors [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:257:ancestors@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view ancestors); data:atom [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:258:atom@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view atom); data:cast [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:259:cast@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view cast); data:content [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:260:content@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view content); data:core [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:261:core@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view core); data:items [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:262:items@set/all/data.rb - first difference byte 10: oracle "{\"class\":\"NoMethod\",\"message\":\"undefined method 'item_cards' for #<Card::Format::CardActionView:0x000001bd407b0008>\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format data (view items)\"}"; data:links [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:263:links@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view links); data:molecule [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:264:molecule@set/all/data.rb - first difference byte 10: oracle "{\"class\":\"NoMethod\",\"message\":\"undefined method 'item_cards' for #<Card::Format::CardActionView:0x000001bd42fb78a8>\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format data (view molecule)\"}"; data:nucleus [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:265:nucleus@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view nucleus); data:pod [set/all/data.rb] differs at synthetic-v2-mod-probes#probe-view:266:pod@set/all/data.rb - first difference adapter error Error: the port has no view dispatch for format data (view pod); file:core [set/all/file.rb] differs at synthetic-v2-mod-probes#probe-view:267:core@set/all/file.rb - first difference adapter error Error: the port has no view dispatch for format file (view core); file:style [set/all/file.rb] differs at synthetic-v2-mod-probes#probe-view:268:style@set/all/file.rb - first difference adapter error Error: the port has no view dispatch for format file (view style); html:conflict [set/all/html/error.rb] differs at synthetic-v2-mod-probes#probe-view:278:conflict@set/all/html/error.rb - first difference byte 14844: oracle "late\\\">expand_more</i></a>\\n<ins class='diff-added diffins'>#<Cardio::Mod:0x000001bd38e4f4c0>_mod\\n#<Cardio:...</ins></div></div>\\n                </li>\\n      " | port "late\\\">expand_more</i></a>\\n<ins class='diff-added diffins'>{{+:description|content}}\\n{{_|add_button}}{{_|c...</ins></div></div>\\n                </li>\\n      "; html:core [set/type/plain_text.rb] differs at synthetic-v2-mod-probes#probe-view:283:core@set/type/plain_text.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">unknown codename: test_context</span>\"}" | port "{\"html\":\"Thank you for signing up with My Deck!\\n\\nPlease follow the link below to verify this email address and activate your ac"; html:not_found [set/all/html/error.rb] differs at synthetic-v2-mod-probes#probe-view:306:not_found@set/all/html/error.rb - first difference byte 9: oracle "{\"html\":\"<div id=\\\"decko_bot-not_found-view\\\" class=\\\"ALL SELF-decko_bot TYPE-rich_text card-slot not_found-view\\\" data-card-id=\\" | port "{\"html\":\"format.not_found_named\"}"; html:one_line_content [set/all/html/views.rb] differs at synthetic-v2-mod-probes#probe-view:307:one_line_content@set/all/html/views.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; html:one_line_content [set/type/html.rb] differs at synthetic-v2-mod-probes#probe-view:308:one_line_content@set/type/html.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\">{{:head|core}}</div>\"}" | port "{\"html\":\"{{:head|core}}\"}"; html:raw_one_line_content [set/all/html/views.rb] differs at synthetic-v2-mod-probes#probe-view:310:raw_one_line_content@set/all/html/views.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; html:type_info [set/all/html.rb] differs at synthetic-v2-mod-probes#probe-view:319:type_info@set/all/html.rb - first difference byte 8: oracle "{\"html\":null}" | port "{\"html\":\"\"}"; js:source [set/all/js.rb] differs at synthetic-v2-mod-probes#probe-view:325:source@set/all/js.rb - first difference adapter error Error: the port has no view dispatch for format js (view source); json:bad_address [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:326:bad_address@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format json (view bad_address); json:denial [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:327:denial@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format json (view denial); json:errors [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:328:errors@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format json (view errors); json:not_found [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:329:not_found@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format json (view not_found); json:page [set/all/json.rb] differs at synthetic-v2-mod-probes#probe-view:330:page@set/all/json.rb - first difference adapter error Error: the port has no view dispatch for format json (view page); json:server_error [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:331:server_error@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format json (view server_error); json:status [set/all/json.rb] differs at synthetic-v2-mod-probes#probe-view:332:status@set/all/json.rb - first difference adapter error Error: the port has no view dispatch for format json (view status); jsonld:denial [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:333:denial@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view denial); jsonld:errors [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:334:errors@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view errors); jsonld:format_unsupported [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:335:format_unsupported@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view format_unsupported); jsonld:items [set/all/jsonld.rb] differs at synthetic-v2-mod-probes#probe-view:336:items@set/all/jsonld.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view items); jsonld:not_found [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:337:not_found@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view not_found); jsonld:server_error [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:338:server_error@set/all/error.rb - first difference adapter error Error: the port has no view dispatch for format jsonld (view server_error); jsonld:test [set/all/error.rb] differs at synthetic-v2-mod-probes#probe-view:339:test@set/all/error.rb - first difference byte 10: oracle "{\"class\":\"Runtime\",\"message\":\"blah\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format jsonld (view test)\"}"; rss:closed [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:340:closed@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view closed); rss:comment_box [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:341:comment_box@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view comment_box); rss:content [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:342:content@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view content); rss:feed_body [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:343:feed_body@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_body); rss:feed_description [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:344:feed_description@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_description); rss:feed_item_description [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:345:feed_item_description@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_item_description); rss:feed_item [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:346:feed_item@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_item); rss:feed_title [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:347:feed_title@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_title); rss:feed [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:348:feed@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed); rss:menu [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:349:menu@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view menu); rss:open_content [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:350:open_content@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view open_content); rss:open [set/all/rss.rb] differs at synthetic-v2-mod-probes#probe-view:351:open@set/all/rss.rb - first difference adapter error Error: the port has no view dispatch for format rss (view open); text:core [set/all/text.rb] differs at synthetic-v2-mod-probes#probe-view:352:core@set/all/text.rb - first difference adapter error Error: the port has no view dispatch for format text (view core); yaml:core [set/all/yaml.rb] differs at synthetic-v2-mod-probes#probe-view:353:core@set/all/yaml.rb - first difference adapter error Error: the port has no view dispatch for format yaml (view core)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: validate_json [set/type/json.rb], validate_number [set/type/number.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-help-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:guide [set/all/guide.rb] (2 ops), html:help_text [set/all/help.rb] (2 ops), html:help [set/all/help.rb] (2 ops), html:lead [set/all/help.rb] (2 ops)
- views graded but differing: html:popover [set/right/help.rb] differs at synthetic-v2-mod-probes#probe-view:358:popover@set/right/help.rb - first difference byte 121: oracle "-trigger=\\\"hover focus\\\" data-bs-content=\\\"Cards created by &lt;em&gt;{{_left|name}}&lt;/em&gt;.\\\" class=\\\"_popover_link ps-1\\\" href=\\\"#\\\"><i class=\\\"material-i" | port "-trigger=\\\"hover focus\\\" data-bs-content=\\\"Cards created by <em>*created+*right</em>.\\\" class=\\\"_popover_link ps-1\\\" href=\\\"#\\\"><i class=\\\"material-icons notran"
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
- views graded but differing: html:act [set/all/history/views.rb] differs at synthetic-v2-mod-probes#probe-view:360:act@set/all/history/views.rb - first difference byte 14129: oracle "late\\\">expand_more</i></a>\\n<ins class='diff-added diffins'>#<Cardio::Mod:0x000001bd38e4f4c0>_mod\\n#<Cardio:...</ins></div></div>\\n                </li>\\n      " | port "late\\\">expand_more</i></a>\\n<ins class='diff-added diffins'>{{+:description|content}}\\n{{_|add_button}}{{_|c...</ins></div></div>\\n                </li>\\n      "; json:actions [set/all/history/export.rb] differs at synthetic-v2-mod-probes#probe-view:371:actions@set/all/history/export.rb - first difference adapter error Error: the port has no view dispatch for format json (view actions); json:history [set/all/history/export.rb] differs at synthetic-v2-mod-probes#probe-view:372:history@set/all/history/export.rb - first difference adapter error Error: the port has no view dispatch for format json (view history)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: assign_action [set/all/history/events.rb] differs at mod-event-probes#359; mod-event-probes#360 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105853,\"card_id\":1066,\"comment\":null,\"draft\":0,\"id\":1273,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105855,\"card_id\":1050,\"comment\":null,\"draft\":0,\"id\":1256,\"super_action_id\":null}],\"updated\":[]},\"card_act"; detect_conflict [set/all/history/events.rb] differs at mod-event-probes#364; mod-event-probes#365 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105858,\"card_id\":1068,\"comment\":null,\"draft\":0,\"id\":1278,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105860,\"card_id\":1052,\"comment\":null,\"draft\":0,\"id\":1261,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; finalize_act [set/all/history/events.rb] differs at mod-event-probes#379; mod-event-probes#380 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105873,\"card_id\":1074,\"comment\":null,\"draft\":0,\"id\":1293,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105875,\"card_id\":1058,\"comment\":null,\"draft\":0,\"id\":1276,\"super_action_id\":null}],\"updated\":[]},\"card_act"; finalize_action [set/all/history/events.rb] differs at mod-event-probes#369; mod-event-probes#370 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105863,\"card_id\":1070,\"comment\":null,\"draft\":0,\"id\":1283,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105865,\"card_id\":1054,\"comment\":null,\"draft\":0,\"id\":1266,\"super_action_id\":null}],\"updated\":[]},\"card_act"; rollback_actions [set/all/history/events.rb] differs at mod-event-probes#374; mod-event-probes#375 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105868,\"card_id\":1072,\"comment\":null,\"draft\":0,\"id\":1288,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105870,\"card_id\":1056,\"comment\":null,\"draft\":0,\"id\":1271,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; update_ancestor_timestamps [set/all/history/events.rb] differs at mod-event-probes#354; mod-event-probes#355 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105848,\"card_id\":1064,\"comment\":null,\"draft\":0,\"id\":1268,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105850,\"card_id\":1048,\"comment\":null,\"draft\":0,\"id\":1251,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
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
- events graded but differing rows: cache_delete_card_events [set/all/observer.rb] differs at mod-event-probes#384; mod-event-probes#385 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105878,\"card_id\":1076,\"comment\":null,\"draft\":0,\"id\":1298,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105880,\"card_id\":1060,\"comment\":null,\"draft\":0,\"id\":1281,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-layout-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-layout-mycard-views.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:bar_bottom [set/self/head.rb] (1 ops), html:close_modal_link [set/all/modal.rb] (2 ops), html:core [set/right/head.rb] (1 ops), html:core [set/self/account_links.rb] (3 ops), html:core [set/type/layout_type.rb] (9 ops), html:head_content [set/right/head.rb] (1 ops), html:input [set/self/head.rb] (1 ops), html:invite [set/self/account_links.rb] (2 ops), html:modal_footer [set/all/modal.rb] (2 ops), html:modal_link [set/all/modal.rb] (3 ops), html:modal_menu [set/all/modal.rb] (2 ops), html:modal_title [set/all/modal.rb] (2 ops), html:modal [set/all/modal.rb] (3 ops), html:my_card [set/self/account_links.rb] (3 ops), html:nav_item [set/abstract/items.rb] (2 ops), html:nav_item [set/all/navbar_links.rb] (2 ops), html:nav_link_in_dropdown [set/all/navbar_links.rb] (2 ops), html:navbar_links [set/all/navbar_links.rb] (2 ops), html:navbar_links [set/type/html.rb] (1 ops), html:overlay_header [set/all/overlay.rb] (2 ops), html:overlay_help_link [set/all/overlay.rb] (2 ops), html:overlay_menu [set/all/overlay.rb] (2 ops), html:overlay_title [set/all/overlay.rb] (2 ops), html:pop_out_modal_link [set/all/modal.rb] (2 ops), html:sign_in [set/self/account_links.rb] (2 ops), html:sign_out [set/self/account_links.rb] (2 ops), html:sign_up [set/self/account_links.rb] (2 ops)
- views graded but differing: html:core [set/self/head.rb] differs at synthetic-v2-mod-probes#probe-view:377:core@set/self/head.rb - first difference byte 9: oracle "{\"html\":\"<title>*head - My Deck</title>\\n<meta charset='UTF-8'>\\n<meta content='width=device-width, initial-scale=1.0' name='view" | port "{\"html\":\"\"}"; html:one_line_content [set/right/head.rb] differs at synthetic-v2-mod-probes#probe-view:393:one_line_content@set/right/head.rb - first difference byte 9: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\">{{:head|core}}</div>\"}" | port "{\"html\":\"{{:head|core}}\"}"
- views only named by a test, not graded: html:edit_inline [set/right/enabled_roles.rb], html:nav_item [set/self/dropdown_divider.rb], html:nav_link_in_dropdown [set/self/dropdown_divider.rb]
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: clear_roles_cache [set/right/enabled_roles.rb], update_layout_registry [set/type/layout_type.rb], validate_role_enabling [set/right/enabled_roles.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-list-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-list-checkbox-editor.test.ts`, `tests/card/mod-loader/card-mod-list-select-editor.test.ts`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: base:core [set/abstract/01_list/other_views.rb] (1410 ops), html:autocomplete [set/abstract/01_list/html_views.rb] (2 ops), html:checkbox [set/abstract/01_list/html_views.rb] (2 ops), html:core [set/abstract/01_list/html_views.rb] (1410 ops), html:input [set/abstract/01_list/html_views.rb] (2 ops), html:input [set/type/nest_list.rb] (1 ops), html:list [set/abstract/01_list/html_views.rb] (2 ops), html:multiselect [set/abstract/01_list/html_views.rb] (2 ops), html:nest_list_input [set/type/nest_list.rb] (2 ops), html:radio [set/abstract/01_list/html_views.rb] (2 ops), html:select [set/abstract/01_list/html_views.rb] (2 ops), html:view_list [set/abstract/01_list.rb] (2 ops)
- views graded but differing: css:content [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:403:content@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format css (view content); css:titled [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:404:titled@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format css (view titled); csv:core [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:405:core@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format csv (view core); data:content [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:406:content@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format data (view content); data:core [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:407:core@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format data (view core); html:input [set/type/link_list.rb] differs at synthetic-v2-mod-probes#probe-view:412:input@set/type/link_list.rb - first difference byte 1434: oracle "=\\\"text\\\" name=\\\"pointer_item\\\" id=\\\"pointer_item\\\" value=\\\"*getting started links\\\" class=\\\"pointer-item-text form-control _autocomplete _reference pointer-ite" | port "=\\\"text\\\" name=\\\"pointer_item\\\" id=\\\"pointer_item\\\" value=\\\":getting_started_links\\\" class=\\\"pointer-item-text form-control _autocomplete _reference pointer-ite"; html:one_line_content [set/abstract/01_list/html_views.rb] differs at synthetic-v2-mod-probes#probe-view:417:one_line_content@set/abstract/01_list/html_views.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; js:core [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:421:core@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format js (view core); json:content [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:422:content@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format json (view content); json:links [set/abstract/01_list/other_views.rb] differs at synthetic-v2-mod-probes#probe-view:423:links@set/abstract/01_list/other_views.rb - first difference adapter error Error: the port has no view dispatch for format json (view links)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: add_and_drop_items [set/abstract/01_list/events.rb] differs at mod-event-probes#404; mod-event-probes#405 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105883,\"card_id\":1078,\"comment\":null,\"draft\":0,\"id\":1303,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105885,\"card_id\":1062,\"comment\":null,\"draft\":0,\"id\":1286,\"super_action_id\":null}],\"updated\":[]},\"card_act"; delist [set/abstract/delist.rb] differs at mod-event-probes#424; mod-event-probes#425 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105903,\"card_id\":1086,\"comment\":null,\"draft\":0,\"id\":1323,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105905,\"card_id\":1070,\"comment\":null,\"draft\":0,\"id\":1306,\"super_action_id\":null}],\"updated\":[]},\"card_act"; insert_item_event [set/abstract/01_list/events.rb] differs at mod-event-probes#409; mod-event-probes#410 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105888,\"card_id\":1080,\"comment\":null,\"draft\":0,\"id\":1308,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105890,\"card_id\":1064,\"comment\":null,\"draft\":0,\"id\":1291,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; validate_item_type [set/abstract/01_list/events.rb] differs at mod-event-probes#414; mod-event-probes#415 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105893,\"card_id\":1082,\"comment\":null,\"draft\":0,\"id\":1313,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105895,\"card_id\":1066,\"comment\":null,\"draft\":0,\"id\":1296,\"super_action_id\":null}],\"updated\":[]},\"card_act"; validate_item_uniqueness [set/abstract/01_list/events.rb] differs at mod-event-probes#419; mod-event-probes#420 - first difference byte 76: oracle "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105898,\"card_id\":1084,\"comment\":null,\"draft\":0,\"id\":1318,\"super_action_id\":null}],\"updated\":[]},\"card_a" | port "{\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105900,\"card_id\":1068,\"comment\":null,\"draft\":0,\"id\":1301,\"super_action_id\":null}],\"updated\":[]},\"card_a"
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
- views graded but differing: html:one_line_content [set/abstract/permission.rb] differs at synthetic-v2-mod-probes#probe-view:427:one_line_content@set/abstract/permission.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: check_permissions [set/all/permissions.rb] differs at mod-event-probes#444; mod-event-probes#445 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105923,\"card_id\":1094,\"comment\":null,\"draft\":0,\"id\":1343,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105925,\"card_id\":1078,\"comment\":null,\"draft\":0,\"id\":1326,\"super_action_id\":null}],\"updated\":[]},\"card_act"; expire_related [set/all/update_read_rules.rb] differs at mod-event-probes#454; mod-event-probes#455 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105933,\"card_id\":1098,\"comment\":null,\"draft\":0,\"id\":1353,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105935,\"card_id\":1082,\"comment\":null,\"draft\":0,\"id\":1336,\"super_action_id\":null}],\"updated\":[]},\"card_act"; set_field_read_rules [set/all/permissions.rb] differs at mod-event-probes#434; mod-event-probes#435 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105913,\"card_id\":1090,\"comment\":null,\"draft\":0,\"id\":1333,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105915,\"card_id\":1074,\"comment\":null,\"draft\":0,\"id\":1316,\"super_action_id\":null}],\"updated\":[]},\"card_act"; set_read_rule [set/all/permissions.rb] differs at mod-event-probes#429; mod-event-probes#430 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105908,\"card_id\":1088,\"comment\":null,\"draft\":0,\"id\":1328,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105910,\"card_id\":1072,\"comment\":null,\"draft\":0,\"id\":1311,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; update_read_rule [set/all/permissions.rb] differs at mod-event-probes#439; mod-event-probes#440 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105918,\"card_id\":1092,\"comment\":null,\"draft\":0,\"id\":1338,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105920,\"card_id\":1076,\"comment\":null,\"draft\":0,\"id\":1321,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; update_rule_cache [set/all/update_read_rules.rb] differs at mod-event-probes#449; mod-event-probes#450 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105928,\"card_id\":1096,\"comment\":null,\"draft\":0,\"id\":1348,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105930,\"card_id\":1080,\"comment\":null,\"draft\":0,\"id\":1331,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
- events run with no effect seen against the baseline: cascade_read_rule [set/right/read.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-recaptcha-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-recaptcha-form-hooks.test.ts`, `tests/card/mod-loader/card-mod-recaptcha-validate-event.test.ts`, `tests/card/mod-loader/card-mod-recaptcha.test.ts`
- views graded identical: html:core [set/self/recaptcha_settings.rb] (3 ops)
- views graded but differing: (none)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: recaptcha [set/all/recaptcha.rb] differs at mod-event-probes#474; mod-event-probes#475 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105948,\"card_id\":1104,\"comment\":null,\"draft\":0,\"id\":1368,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105950,\"card_id\":1088,\"comment\":null,\"draft\":0,\"id\":1351,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; set_recaptcha_site_key [set/abstract/recaptcha_setting.rb] differs at mod-event-probes#469; mod-event-probes#470 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105943,\"card_id\":1102,\"comment\":null,\"draft\":0,\"id\":1363,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105945,\"card_id\":1086,\"comment\":null,\"draft\":0,\"id\":1346,\"super_action_id\":null}],\"updated\":[]},\"card_act"; validate_recaptcha_field [set/abstract/recaptcha_setting.rb] differs at mod-event-probes#464; mod-event-probes#465 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105938,\"card_id\":1100,\"comment\":null,\"draft\":0,\"id\":1358,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105940,\"card_id\":1084,\"comment\":null,\"draft\":0,\"id\":1341,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
- events run with no effect seen against the baseline: (none)
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-rules-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-rules.test.ts`
- views graded identical: html:accordion_bar_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:accordion_rule_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:bar_bottom [set/rule/bar_view.rb] (1 ops), html:bar_right [set/rule/bar_view.rb] (1 ops), html:bar_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:bar [set/rule/bar_view.rb] (1 ops), html:board_rules_tab [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:card_select [set/all/set_select.rb] (2 ops), html:core [set/rule/html_views.rb] (77 ops), html:core [set/type/set/html_views.rb] (8 ops), html:core [set/type/setting.rb] (17 ops), html:filtered_accordion_rule_list [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:help_text [set/rule/board_rules_editor.rb] (1 ops), html:input [set/type/set/html_views.rb] (1 ops), html:modal_nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:modal_pill_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:modal_rule [set/rule/board_rules_editor.rb] (2 ops), html:nest_rules [set/type/set/html_views/filtered_rule_lists.rb] (2 ops), html:one_line_content [set/type/set/html_views.rb] (1 ops), html:overlay_rule_list_link [set/type/set/html_views/rule_lists.rb] (2 ops), html:overlay_rule [set/rule/board_rules_editor.rb] (2 ops), html:overlay_title [set/rule/board_rules_editor.rb] (1 ops), html:pill_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:quick_edit_setting_list [set/type/set/html_views/rule_lists.rb] (2 ops), html:quick_edit_success [set/rule/quick_editor.rb] (2 ops), html:quick_edit [set/rule/quick_editor.rb] (3 ops), html:raw_one_line_content [set/rule/bar_view.rb] (1 ops), html:rule_board_link [set/rule/editor.rb] (2 ops), html:rule_edit [set/rule/editor.rb] (2 ops), html:rule_form_card_editor [set/rule/rule_form.rb] (2 ops), html:rule_form [set/rule/rule_form.rb] (2 ops), html:rule_help [set/rule/editor.rb] (1 ops), html:rule_help [set/type/setting.rb] (2 ops), html:rule_nest_editor_link [set/rule/editor.rb] (2 ops), html:set_label [set/type/set/html_views.rb] (2 ops), html:template_link [set/type/set/html_views/template.rb] (2 ops)
- views graded but differing: data:core [set/type/setting.rb] differs at synthetic-v2-mod-probes#probe-view:430:core@set/type/setting.rb - first difference adapter error Error: the port has no view dispatch for format data (view core); html:bar_middle [set/rule/bar_view.rb] differs at synthetic-v2-mod-probes#probe-view:434:bar_middle@set/rule/bar_view.rb - first difference byte 8: oracle "{\"html\":null}" | port "{\"html\":\"\"}"; html:grouped_list [set/self/cardtype.rb] differs at synthetic-v2-mod-probes#probe-view:444:grouped_list@set/self/cardtype.rb - first difference byte 32: oracle "{\"html\":\"<h5>Text</h5>\\n<p><div class=\\\"item-bar\\\"><div id=\\\"rich_text-bar-view\\\" class=\\\"ALL SELF-rich_text TYPE-cardtype bar-view card-slot\\\" data-car" | port "{\"html\":\"<h5>Text</h5>\\n<p><div id=\\\"rich_text-titled-view\\\" class=\\\"ALL SELF-rich_text TYPE-cardtype card-slot titled-view\\\" data-card-id=\\\"2\\\" data-ca"; html:one_line_content [set/rule/bar_view.rb] differs at synthetic-v2-mod-probes#probe-view:451:one_line_content@set/rule/bar_view.rb - first difference byte 22: oracle "{\"html\":\"<div class=\\\"one-line text-muted\\\"><div class=\\\"pointer-list\\\"><div class=\\\"item-link pointer-item\\\"><a class=\\\"known-card\\\" href=\\\"/" | port "{\"html\":\"<div class=\\\"pointer-list\\\"><div class=\\\"item-link pointer-item\\\"><a class=\\\"known-card\\\" href=\\\"/Anyone\\\"><span class=\\\"card-title\\\""; html:one_line_content [set/type/setting.rb] differs at synthetic-v2-mod-probes#probe-view:453:one_line_content@set/type/setting.rb - first difference byte 22: oracle "{\"html\":\"<div class=\\\"text-muted\\\"><div class=\\\"alert alert-info rule-instruction\\\"></div></div>\"}" | port "{\"html\":\"<div class=\\\"alert alert-info rule-instruction\\\"></div>\"}"
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: save_recently_edited_settings [set/rule/rules.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-script-0.20.0

- tests linked: `tests/card/mod-loader/card-mod-script.test.ts`
- views graded identical: base:core [set/abstract/02_coffee_script.rb] (1410 ops), html:core [set/abstract/00_script.rb] (1410 ops), html:javascript_include_tag [set/abstract/00_script.rb] (2 ops), html:javascript_include_tag [set/all/head_javascript.rb] (2 ops), html:javascript_tags [set/all/head_javascript.rb] (2 ops), html:remote_script_tags [set/type_plus_right/mod/script.rb] (1 ops), html:remote_script_tags [set/type_plus_right/set/script.rb] (2 ops), html:script_calls [set/all/head_javascript.rb] (2 ops), html:script_variables [set/all/head_javascript.rb] (2 ops)
- views graded but differing: html:javascript_include_tag [set/right/script.rb] differs at synthetic-v2-mod-probes#probe-view:475:javascript_include_tag@set/right/script.rb - first difference byte 11: oracle "{\"html\":\"\\n<!-- javascript_include_tag not overridden for mod: format+*script+group: jquery -->\\n\\n\\n<!-- javascript_include_tag no" | port "{\"html\":\"\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\"}"; js:compressed [set/abstract/00_script.rb] differs at synthetic-v2-mod-probes#probe-view:481:compressed@set/abstract/00_script.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (compressed) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format js (view compressed)\"}"; js:core [set/abstract/01_java_script.rb] differs at synthetic-v2-mod-probes#probe-view:482:core@set/abstract/01_java_script.rb - first difference adapter error Error: the port has no view dispatch for format js (view core); js:core [set/abstract/script_group.rb] differs at synthetic-v2-mod-probes#probe-view:483:core@set/abstract/script_group.rb - first difference adapter error Error: the port has no view dispatch for format js (view core)
- views only named by a test, not graded: (none)
- views unexercised: (none)
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: validate_coffeescript_syntax [set/type/coffee_script.rb], validate_javascript_syntax [set/type/java_script.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-search-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-search-read-scope.test.ts`, `tests/card/mod-loader/card-mod-search.test.ts`
- views graded identical: base:card_list [set/abstract/0_search/views.rb] (2 ops), base:core [set/abstract/search_views.rb] (1410 ops), base:no_search_results [set/abstract/0_search/views.rb] (2 ops), base:search_count [set/abstract/0_search/views.rb] (2 ops), base:search_error [set/abstract/0_search/views.rb] (2 ops), base:title [set/self/recent.rb] (1 ops), html:add_autocomplete_item [set/all/autocomplete.rb] (2 ops), html:bar [set/abstract/search_views.rb] (3 ops), html:card_list [set/abstract/0_search/views.rb] (2 ops), html:checkbox_list [set/abstract/0_search/views.rb] (2 ops), html:core [set/abstract/search_views.rb] (1410 ops), html:core [set/self/recent.rb] (3 ops), html:core [set/self/search.rb] (3 ops), html:goto_autocomplete_item [set/all/autocomplete.rb] (2 ops), html:no_search_results [set/abstract/0_search/views.rb] (2 ops), html:results_for_keyword [set/self/search.rb] (2 ops), html:search_box [set/self/search.rb] (2 ops), html:title [set/self/search.rb] (1 ops)
- views graded but differing: base:count [set/abstract/0_search.rb] differs at synthetic-v2-mod-probes#probe-view:486:count@set/abstract/0_search.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible " | port "{\"html\":\"4\"}"; base:search_error [set/self/search.rb] differs at synthetic-v2-mod-probes#probe-view:490:search_error@set/self/search.rb - first difference byte 202: oracle ")&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method &amp;#39;message&amp;#39; for an instance of Array&lt;/strong&gt;&lt;/p&gt;\\n      &lt;div&gt;N6#fra" | port ")&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method `message&amp;#39; for an instance of Array&lt;/strong&gt;&lt;/p&gt;\\n      &lt;div&gt;N6#frames&lt;/"; csv:body [set/abstract/0_search/views.rb] differs at synthetic-v2-mod-probes#probe-view:492:body@set/abstract/0_search/views.rb - first difference adapter error Error: the port has no view dispatch for format csv (view body); data:card_list [set/abstract/0_search/views.rb] differs at synthetic-v2-mod-probes#probe-view:493:card_list@set/abstract/0_search/views.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (card_list) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format data (view card_list)\"}"; html:count [set/abstract/0_search.rb] differs at synthetic-v2-mod-probes#probe-view:501:count@set/abstract/0_search.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible " | port "{\"html\":\"4\"}"; html:one_line_content [set/abstract/search_views.rb] differs at synthetic-v2-mod-probes#probe-view:504:one_line_content@set/abstract/search_views.rb - first difference byte 92: oracle "\\\">\\n  This is the account that makes any automated updates —...</div>\"}" | port "\\\">\\n  This is the account that makes any automated updates &...</div>\"}"; json:complete [set/self/search.rb] differs at synthetic-v2-mod-probes#probe-view:508:complete@set/self/search.rb - first difference adapter error Error: the port has no view dispatch for format json (view complete); json:molecule [set/abstract/0_search/views.rb] differs at synthetic-v2-mod-probes#probe-view:509:molecule@set/abstract/0_search/views.rb - first difference adapter error Error: the port has no view dispatch for format json (view molecule); json:name_complete [set/abstract/0_search/views.rb] differs at synthetic-v2-mod-probes#probe-view:510:name_complete@set/abstract/0_search/views.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (name_complete) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format json (view name_complete)\"}"; json:name_match [set/abstract/0_search/views.rb] differs at synthetic-v2-mod-probes#probe-view:511:name_match@set/abstract/0_search/views.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (name_match) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format json (view name_match)\"}"; json:search_box_complete [set/self/search.rb] differs at synthetic-v2-mod-probes#probe-view:512:search_box_complete@set/self/search.rb - first difference adapter error Error: the port has no view dispatch for format json (view search_box_complete); json:select2_option [set/all/autocomplete.rb] differs at synthetic-v2-mod-probes#probe-view:513:select2_option@set/all/autocomplete.rb - first difference adapter error Error: the port has no view dispatch for format json (view select2_option); rss:feed_body [set/abstract/search_views.rb] differs at synthetic-v2-mod-probes#probe-view:514:feed_body@set/abstract/search_views.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_body); rss:feed_item_description [set/self/recent.rb] differs at synthetic-v2-mod-probes#probe-view:515:feed_item_description@set/self/recent.rb - first difference adapter error Error: the port has no view dispatch for format rss (view feed_item_description)
- views only named by a test, not graded: (none)
- views unexercised: (none)
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
- events graded but differing rows: discard_deleted_locations [set/all/location_history.rb] differs at mod-event-probes#490; mod-event-probes#491 - first difference byte 78: oracle "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105953,\"card_id\":1106,\"comment\":null,\"draft\":0,\"id\":1373,\"super_action_id\":null}],\"updated\":[]},\"card_act" | port "deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105955,\"card_id\":1090,\"comment\":null,\"draft\":0,\"id\":1356,\"super_action_id\":null}],\"updated\":[]},\"card_act"
- events run with no effect seen against the baseline: delete_in_session [set/type/session.rb], save_current_location [set/all/location_history.rb], store_in_session [set/type/session.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-style-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`, `tests/card/mod-loader/card-mod-style.test.ts`
- views graded identical: html:box_bottom [set/abstract/skin_box.rb] (2 ops), html:box_middle [set/abstract/skin_box.rb] (2 ops), html:box [set/abstract/skin_box.rb] (2 ops), html:core [set/abstract/01_css.rb] (1410 ops), html:customize_button [set/abstract/skin_box.rb] (1 ops), html:remote_include_tags [set/type_plus_right/mod/style.rb] (2 ops), html:remote_style_tags [set/self/style_mods.rb] (2 ops), html:stylesheet_include_tag [set/abstract/style_group.rb] (2 ops), html:stylesheet_path [set/type_plus_right/set/style.rb] (2 ops)
- views graded but differing: css:compiled [set/abstract/01_css.rb] differs at synthetic-v2-mod-probes#probe-view:516:compiled@set/abstract/01_css.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (compiled) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format css (view compiled)\"}"; css:compiled [set/abstract/02_scss.rb] differs at synthetic-v2-mod-probes#probe-view:517:compiled@set/abstract/02_scss.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (compiled) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format css (view compiled)\"}"; css:compressed [set/abstract/01_css.rb] differs at synthetic-v2-mod-probes#probe-view:518:compressed@set/abstract/01_css.rb - first difference byte 10: oracle "{\"class\":\"User\",\"message\":\"view (compressed) not supported for Decko Bot\"}" | port "{\"class\":\"Error\",\"message\":\"the port has no view dispatch for format css (view compressed)\"}"; css:core [set/abstract/02_scss.rb] differs at synthetic-v2-mod-probes#probe-view:519:core@set/abstract/02_scss.rb - first difference adapter error Error: the port has no view dispatch for format css (view core); css:import [set/abstract/01_css.rb] differs at synthetic-v2-mod-probes#probe-view:520:import@set/abstract/01_css.rb - first difference adapter error Error: the port has no view dispatch for format css (view import); html:stylesheet_include_tag [set/type_plus_right/mod/style.rb] differs at synthetic-v2-mod-probes#probe-view:529:stylesheet_include_tag@set/type_plus_right/mod/style.rb - first difference byte 9: oracle "{\"html\":\"<span class=\\\"alert alert-danger render-error\\\">Error rendering: <span title=\\\"\\n      &lt;h3&gt;Error message (visible " | port "{\"html\":\"\"}"; scss:core [set/abstract/02_scss.rb] differs at synthetic-v2-mod-probes#probe-view:531:core@set/abstract/02_scss.rb - first difference adapter error Error: the port has no view dispatch for format scss (view core); scss:core [set/abstract/style_group.rb] differs at synthetic-v2-mod-probes#probe-view:532:core@set/abstract/style_group.rb - first difference adapter error Error: the port has no view dispatch for format scss (view core); scss:labeled [set/abstract/02_scss.rb] differs at synthetic-v2-mod-probes#probe-view:533:labeled@set/abstract/02_scss.rb - first difference adapter error Error: the port has no view dispatch for format scss (view labeled)
- views only named by a test, not graded: (none)
- views unexercised: css:concat [set/type/skin.rb]
- events graded identical (rows): (none)
- events graded but differing rows: (none)
- events run with no effect seen against the baseline: no_deletion_if_used [set/type/skin.rb], validate_css [set/type/css.rb], validate_scss_syntax [set/type/scss.rb]
- events with no probe: (none)
- events unexercised: (none)

#### card-mod-tabs-0.20.0

- tests linked: `a withheld test file (it reads the private real-site fixtures, which are not redistributed)`
- views graded identical: html:pills [set/all/tabs.rb] (2 ops), html:tabs [set/abstract/tabs.rb] (2 ops), html:tabs [set/all/tabs.rb] (2 ops)
- views graded but differing: html:pills_static [set/all/tabs.rb] differs at synthetic-v2-mod-probes#probe-view:534:pills_static@set/all/tabs.rb - first difference byte 185: oracle "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method &amp;#39;args&amp;#39; for #&amp;lt;Card::Format::CardActionView:N7#addr&amp;gt;&lt" | port "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;pills_static: NoMethodError parity - undefined method &amp;#39;args&amp;#39; for Card::Format::CardA"; html:tabs_static [set/all/tabs.rb] differs at synthetic-v2-mod-probes#probe-view:536:tabs_static@set/all/tabs.rb - first difference byte 185: oracle "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;undefined method &amp;#39;args&amp;#39; for #&amp;lt;Card::Format::CardActionView:N7#addr&amp;gt;&lt" | port "ble to admin only)&lt;/h3&gt;\\n      &lt;p&gt;&lt;strong&gt;tabs_static: NoMethodError parity - undefined method &amp;#39;args&amp;#39; for Card::Format::CardAc"
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
- views graded but differing: js:change_create_to_update [set/all/reference_editor/nest_image.rb] differs at synthetic-v2-mod-probes#probe-view:548:change_create_to_update@set/all/reference_editor/nest_image.rb - first difference adapter error Error: the port has no view dispatch for format js (view change_create_to_update); js:open_nest_editor [set/all/reference_editor/nest_image.rb] differs at synthetic-v2-mod-probes#probe-view:549:open_nest_editor@set/all/reference_editor/nest_image.rb - first difference adapter error Error: the port has no view dispatch for format js (view open_nest_editor)
- views only named by a test, not graded: (none)
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
- events graded but differing rows: delete_virtual_content [set/abstract/virtual_cache.rb] differs at mod-event-probes#529; mod-event-probes#530 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105967,\"card_id\":1112,\"comment\":null,\"draft\":0,\"id\":1387,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105979,\"card_id\":1100,\"comment\":null,\"draft\":0,\"id\":1380,\"super_action_id\":null}],\"updated\":[]},\"card_ac"; save_virtual_content [set/abstract/virtual_cache.rb] differs at mod-event-probes#524; mod-event-probes#525 - first difference byte 77: oracle "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105962,\"card_id\":1110,\"comment\":null,\"draft\":0,\"id\":1382,\"super_action_id\":null}],\"updated\":[]},\"card_ac" | port "\"deleted\":[],\"inserted\":[{\"action_type\":0,\"card_act_id\":105974,\"card_id\":1098,\"comment\":null,\"draft\":0,\"id\":1375,\"super_action_id\":null}],\"updated\":[]},\"card_ac"
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
