# card-mod compatibility report — decko-ts

Generated: 2026-09-21T23:45:48.425Z
Gem dir:   C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems
Repo:      C:\localProjects\decko-ts

## Summary

Mods scanned: **33**

- ported:  **1**
- partial: **30**
- missing: **0**
- ignored: **2** (legacy-labeled or data-only)

## decko-ts implemented surface (truth)

- Set patterns (9): all, all_plus, right, rstar, rule, self, star, type, type_plus_right
- Html views in HTML_VIEWS (19): bar, bar_bottom, bar_left, bar_middle, bar_right, blank, card_list, closed, content, core, menu, mini_bar, mini_unknown, no_search_results, open, title, titled, titled_content, unknown
- Rules: lookup=yes, apply=yes
- Permissions: yes (read-rules.ts, view-perms.ts)

## Per-mod report

| mod | status | mod-specific views | set modules | lib rb | verdict |
|-----|--------|-------------------:|------------:|-------:|---------|
| `card-mod-account-0.20.0` | partial | 0/19 | 22 (abstract=2, all=2, right=7, self=4, type=4, type_plus_right=3) | 1 | mod-specific: covered=(no mod-specific views covered); missing=account_tab, closed_account, closure, configs, content_formgroups, edit, ... |
| `card-mod-ace_editor-0.20.0` | partial | 0/0 | 2 (all=1, self=1) | 0 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-api_key-0.20.0` | partial | 0/6 | 2 (right=2) | 2 | mod-specific: covered=(no mod-specific views covered); missing=api_key, buttons, current, generate_button, token, token_link |
| `card-mod-assets-0.20.0` | partial | 0/2 | 12 (abstract=8, right=3, type=1) | 1 | mod-specific: covered=(no mod-specific views covered); missing=javascript_include_tag, stylesheet_include_tag |
| `card-mod-bar_and_box-0.20.0` | ported | 6/11 | 4 (abstract=1, all=2, type=1) | 0 | 6 mod-specific view(s) ported: bar, bar_bottom, bar_left, bar_middle, bar_right, mini_bar |
| `card-mod-bootstrap-0.20.0` | partial | 4/10 | 11 (abstract=4, all=2, self=2, type=2, type_plus_right=1) | 16 | mod-specific: covered=bar_bottom, bar_left, bar_middle, bar_right; missing=carousel, customize_button, icons, input, one_line_content, progress_bar |
| `card-mod-carrierwave-0.20.0` | partial | 0/6 | 11 (abstract=2, all=1, self=5, type=3) | 7 | mod-specific: covered=(no mod-specific views covered); missing=content_changes, full_width, input, link_tag, preview_editor, source |
| `card-mod-collection-0.20.0` | partial | 0/3 | 6 (abstract=3, all=3) | 1 | mod-specific: covered=(no mod-specific views covered); missing=count, paging, paging_urls |
| `card-mod-comment-0.20.0` | partial | 0/0 | 3 (all=1, right=2) | 0 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-content-0.20.0` | partial | 1/4 | 14 (abstract=7, all=3, right=2, self=2) | 7 | mod-specific: covered=bar_middle; missing=file_size, input, one_line_content |
| `card-mod-date-0.20.0` | partial | 0/0 | 5 (all=1, right=2, self=1, type=1) | 0 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-defaults-0.20.0` | ignored | 0/0 | 0 () | 1 | ignored (legacy-labeled per upstream maintainer guidance) |
| `card-mod-delayed_job-0.20.0` | ignored | 0/0 | 0 () | 2 | ignored (legacy-labeled per upstream maintainer guidance) |
| `card-mod-edit-0.20.0` | partial | 0/41 | 21 (all=15, right=2, self=1, type=3) | 0 | mod-specific: covered=(no mod-specific views covered); missing=board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ... |
| `card-mod-email-0.20.0` | partial | 0/2 | 13 (abstract=2, all=2, right=7, type=2) | 2 | mod-specific: covered=(no mod-specific views covered); missing=compact_missing, email_page |
| `card-mod-follow-0.20.0` | partial | 0/12 | 25 (abstract=1, all=4, right=8, self=7, type=4, type_plus_right=1) | 2 | mod-specific: covered=(no mod-specific views covered); missing=confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ... |
| `card-mod-format-0.20.0` | partial | 1/46 | 33 (abstract=1, all=20, right=1, self=1, type=10) | 16 | mod-specific: covered=bar_right; missing=add_button, add_link, add_url, admin, board_link, compact_missing, ... |
| `card-mod-help-0.20.0` | partial | 0/5 | 6 (all=2, right=2, self=2) | 0 | mod-specific: covered=(no mod-specific views covered); missing=guide, help, help_text, lead, popover |
| `card-mod-history-0.20.0` | partial | 0/12 | 3 (all=3) | 12 | mod-specific: covered=(no mod-specific views covered); missing=act, act_legend, action_expanded, action_summary, board_act, change, ... |
| `card-mod-integrate-0.20.0` | partial | 0/0 | 8 (all=1, right=3, self=4) | 0 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-layout-0.20.0` | partial | 1/24 | 23 (abstract=4, all=6, right=3, self=8, type=2) | 5 | mod-specific: covered=bar_bottom; missing=close_modal_link, edit_inline, head_content, input, invite, modal, ... |
| `card-mod-list-0.20.0` | partial | 0/5 | 16 (abstract=6, all=1, right=2, self=3, type=4) | 0 | mod-specific: covered=(no mod-specific views covered); missing=input, list, nest_list_input, one_line_content, view_list |
| `card-mod-markdown-0.20.0` | partial | 0/0 | 1 (type=1) | 0 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-permissions-0.20.0` | partial | 0/3 | 11 (abstract=1, all=2, right=4, self=4) | 0 | mod-specific: covered=(no mod-specific views covered); missing=input, one_line_content, pointer_core |
| `card-mod-recaptcha-0.20.0` | partial | 0/0 | 8 (abstract=1, all=1, right=3, self=3) | 1 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-rules-0.20.0` | partial | 4/34 | 24 (abstract=1, all=3, right=4, rstar=1, rule=8, self=2, type=4, type_plus_right=1) | 0 | mod-specific: covered=bar, bar_bottom, bar_middle, bar_right; missing=accordion_bar_list, accordion_rule_list, bar_setting_list, board_rules_tab, card_select, filtered_accordion_rule_list, ... |
| `card-mod-script-0.20.0` | partial | 0/6 | 16 (abstract=7, all=1, right=1, self=1, type=4, type_plus_right=2) | 2 | mod-specific: covered=(no mod-specific views covered); missing=compressed, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables |
| `card-mod-search-0.20.0` | partial | 2/20 | 28 (abstract=6, all=1, right=17, self=2, type=2) | 1 | mod-specific: covered=bar, card_list; missing=add_autocomplete_item, body, checkbox_list, complete, count, feed_body, ... |
| `card-mod-session-0.20.0` | partial | 0/0 | 2 (all=1, type=1) | 1 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |
| `card-mod-style-0.20.0` | partial | 0/12 | 16 (abstract=7, self=2, type=5, type_plus_right=2) | 0 | mod-specific: covered=(no mod-specific views covered); missing=box, box_bottom, box_middle, compiled, compressed, customize_button, ... |
| `card-mod-tabs-0.20.0` | partial | 0/4 | 2 (abstract=1, all=1) | 2 | mod-specific: covered=(no mod-specific views covered); missing=pills, pills_static, tabs, tabs_static |
| `card-mod-tinymce_editor-0.20.0` | partial | 0/11 | 4 (all=3, self=1) | 1 | mod-specific: covered=(no mod-specific views covered); missing=change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, ... |
| `card-mod-virtual-0.20.0` | partial | 0/0 | 1 (abstract=1) | 1 | mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views) |

## Per-mod detail

### card-mod-account-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=account_tab, closed_account, closure, configs, content_formgroups, edit, ...
- **evidence**: 3/24 html views in HTML_VIEWS (0/19 mod-specific)
- **set modules by pattern**: abstract=2, all=2, right=7, self=4, type=4, type_plus_right=3
- **mod-specific html views (covered/total)**: 0/19 (account_tab, closed_account, closure, configs, content_formgroups, edit, edit_buttons, link_with_checkbox, new, new_buttons, one_line_content, open_content, raw, reset_password_days, reset_password_success, reset_password_url, setup, token_days, token_expiry, verify_days, verify_url)
- **all html views declared**: account_tab, closed_account, closure, configs, content_formgroups, core, edit, edit_buttons, link_with_checkbox, new, new_buttons, one_line_content, open, open_content, raw, reset_password_days, reset_password_success, reset_password_url, setup, title, token_days, token_expiry, verify_days, verify_url
- **non-html views**: email_html:closure, email_html:core, email_html:reset_password_days, email_html:reset_password_url, email_html:token_days, email_html:token_expiry, email_html:verify_days, email_html:verify_url
- **view aliases**: :verify_days -> :token_days, :reset_password_days -> :token_days
- **event hooks**: 30 (:validate_account_holder_name_change, :generate_token, :set_stamper, :set_default_salt, :set_default_status, :reset_password, ...)
- **before hooks**: 0 ()
- **include_set refs**: AccountField, AccountHolder, IdList, List
- **Cardio config keys**: account_password_length, account_password_requirements
- **haml templates**: 6
- **lib ruby files**: 1

### card-mod-ace_editor-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: no html view declarations in this mod
- **set modules by pattern**: all=1, self=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-api_key-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=api_key, buttons, current, generate_button, token, token_link
- **evidence**: 1/7 html views in HTML_VIEWS (0/6 mod-specific)
- **set modules by pattern**: right=2
- **mod-specific html views (covered/total)**: 0/6 (api_key, buttons, current, generate_button, token, token_link)
- **all html views declared**: api_key, buttons, core, current, generate_button, token, token_link
- **non-html views**: json:buttons, json:core, json:current, json:generate_button, json:token, json:token_link
- **view aliases**: (none)
- **event hooks**: 2 (:generate_api_key, :validate_api_key)
- **before hooks**: 0 ()
- **include_set refs**: AccountField
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-assets-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=javascript_include_tag, stylesheet_include_tag
- **evidence**: 1/3 html views in HTML_VIEWS (0/2 mod-specific)
- **set modules by pattern**: abstract=8, right=3, type=1
- **mod-specific html views (covered/total)**: 0/2 (javascript_include_tag, stylesheet_include_tag)
- **all html views declared**: core, javascript_include_tag, stylesheet_include_tag
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 5 (:asset_input_changed, :asset_input_changed_on_delete, :update_asset_output_file, :validate_asset_inputs, :remove_codename)
- **before hooks**: 0 ()
- **include_set refs**: CodeFile, Items, List, Lock, ManifestGroup, ReadOnly, Sources, VirtualCache
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 1

### card-mod-bar_and_box-0.20.0

- **status**: `ported`
- **verdict**: 6 mod-specific view(s) ported: bar, bar_bottom, bar_left, bar_middle, bar_right, mini_bar
- **evidence**: 8/17 html views in HTML_VIEWS (6/11 mod-specific)
- **set modules by pattern**: abstract=1, all=2, type=1
- **mod-specific html views (covered/total)**: 6/11 (accordion_bar, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, boxed, boxed_link, closed_bar, expanded_bar, full_bar, mini_bar, open_bar)
- **all html views declared**: accordion_bar, bar, bar_body, bar_bottom, bar_left, bar_menu, bar_middle, bar_right, boxed, boxed_link, closed, closed_bar, expanded_bar, full_bar, mini_bar, open, open_bar
- **non-html views**: (none)
- **view aliases**: :closed_bar -> :closed, :accordion_bar -> :closed, :open_bar -> :open, :expanded_bar -> :open
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 5
- **lib ruby files**: 0

### card-mod-bootstrap-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar_bottom, bar_left, bar_middle, bar_right; missing=carousel, customize_button, icons, input, one_line_content, progress_bar
- **evidence**: 5/11 html views in HTML_VIEWS (4/10 mod-specific)
- **set modules by pattern**: abstract=4, all=2, self=2, type=2, type_plus_right=1
- **mod-specific html views (covered/total)**: 4/10 (bar_bottom, bar_left, bar_middle, bar_right, carousel, customize_button, icons, input, one_line_content, progress_bar)
- **all html views declared**: bar_bottom, bar_left, bar_middle, bar_right, carousel, core, customize_button, icons, input, one_line_content, progress_bar
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 6 (:update_skin_asset_input, :initialize_because_of_type_change, :copy_theme, :validate_theme_template, :use_as_current_skin, :translate_variables_to_scss)
- **before hooks**: 0 ()
- **include_set refs**: AssetInputter, BootstrapCodeFile, Media, Scss, SkinBox, SkinField
- **Cardio config keys**: icon_libraries
- **haml templates**: 11
- **lib ruby files**: 16

### card-mod-carrierwave-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=content_changes, full_width, input, link_tag, preview_editor, source
- **evidence**: 2/8 html views in HTML_VIEWS (0/6 mod-specific)
- **set modules by pattern**: abstract=2, all=1, self=5, type=3
- **mod-specific html views (covered/total)**: 0/6 (content_changes, full_width, input, link_tag, preview_editor, source)
- **all html views declared**: content, content_changes, core, full_width, input, link_tag, preview_editor, source
- **non-html views**: json:content, json:core, json:image_complete, json:inline, json:input, json:one_line_content, json:preview_editor, json:source, file:content, file:core, file:inline, file:input, file:one_line_content, file:preview_editor, file:source, email_html:content, email_html:core, email_html:inline, email_html:one_line_content, email_html:source, css:content, css:core, css:inline, css:one_line_content, css:source
- **view aliases**: (none)
- **event hooks**: 24 (:prepare_attachment, :assign_attachment_on_create, :assign_attachment_on_update, :delete_cached_upload_file_on_create, :clear_draft_files, :delete_cached_upload_file_on_update, ...)
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: file_buckets, file_default_bucket, file_storage, files_web_path
- **haml templates**: 3
- **lib ruby files**: 7

### card-mod-collection-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=count, paging, paging_urls
- **evidence**: 0/3 html views in HTML_VIEWS (0/3 mod-specific)
- **set modules by pattern**: abstract=3, all=3
- **mod-specific html views (covered/total)**: 0/3 (count, paging, paging_urls)
- **all html views declared**: count, paging, paging_urls
- **non-html views**: json:paging, json:paging_urls, jsonld:paging, jsonld:paging_urls
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 1

### card-mod-comment-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: no html view declarations in this mod
- **set modules by pattern**: all=1, right=2
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 1 (:add_comment)
- **before hooks**: 0 ()
- **include_set refs**: Permission
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-content-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar_middle; missing=file_size, input, one_line_content
- **evidence**: 2/5 html views in HTML_VIEWS (1/4 mod-specific)
- **set modules by pattern**: abstract=7, all=3, right=2, self=2
- **mod-specific html views (covered/total)**: 1/4 (bar_middle, file_size, input, one_line_content)
- **all html views declared**: bar_middle, core, file_size, input, one_line_content
- **non-html views**: rss:one_line_content
- **view aliases**: (none)
- **event hooks**: 3 (:update_structurees_references, :reset_cache_to_use_new_structure, :update_structurees_type)
- **before hooks**: 0 ()
- **include_set refs**: CodeContent, Sources, TemplatedNests
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 7

### card-mod-date-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: 1/1 html views in HTML_VIEWS (0/0 mod-specific)
- **set modules by pattern**: all=1, right=2, self=1, type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-defaults-0.20.0

- **status**: `ignored`
- **verdict**: ignored (legacy-labeled per upstream maintainer guidance)
- **evidence**: no meaningful set/ tree; config-only or backend-only gem
- **set modules by pattern**: (none)
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-delayed_job-0.20.0

- **status**: `ignored`
- **verdict**: ignored (legacy-labeled per upstream maintainer guidance)
- **evidence**: no meaningful set/ tree; config-only or backend-only gem
- **set modules by pattern**: (none)
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: delaying
- **haml templates**: 0
- **lib ruby files**: 2

### card-mod-edit-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ...
- **evidence**: 0/42 html views in HTML_VIEWS (0/41 mod-specific)
- **set modules by pattern**: all=15, right=2, self=1, type=3
- **mod-specific html views (covered/total)**: 0/41 (board, board_type_formgroup, cardboard, conflict_tracker, content_formgroup, content_formgroups, edit, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, engage_tab, follow_section, guide_tab, history_tab, input, just_deleted, name_form, name_formgroup, new, new_buttons, new_fields, new_in_modal, new_in_modal_buttons, new_type_formgroup, overlay_guide, read_form, read_formgroup, related_tab, rules_tab, simple_new, type_formgroup)
- **all html views declared**: board, board_type_formgroup, cardboard, conflict_tracker, content_formgroup, content_formgroups, edit, edit_buttons, edit_form, edit_in_form, edit_inline, edit_inline_buttons, edit_name, edit_name_row, edit_nests, edit_row, edit_rules, edit_structure, edit_type, edit_type_form, edit_type_row, engage_tab, follow_section, guide_tab, history_tab, input, just_deleted, name_form, name_formgroup, new, new_buttons, new_fields, new_in_modal, new_in_modal_buttons, new_type_formgroup, overlay_guide, read_form, read_formgroup, related_tab, rules_tab, simple_new, type_formgroup
- **non-html views**: (none)
- **view aliases**: :cardboard -> :board
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 5
- **lib ruby files**: 0

### card-mod-email-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=compact_missing, email_page
- **evidence**: 3/5 html views in HTML_VIEWS (0/2 mod-specific)
- **set modules by pattern**: abstract=2, all=2, right=7, type=2
- **mod-specific html views (covered/total)**: 0/2 (compact_missing, email_page)
- **all html views declared**: compact_missing, content, core, email_page, unknown
- **non-html views**: email_text:compact_missing, email_text:last_action, email_text:unknown, email_html:compact_missing, email_html:core, email_html:email_page, email_html:unknown
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: EmailField, TestContext
- **Cardio config keys**: (none)
- **haml templates**: 1
- **lib ruby files**: 2

### card-mod-follow-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ...
- **evidence**: 1/13 html views in HTML_VIEWS (0/12 mod-specific)
- **set modules by pattern**: abstract=1, all=4, right=8, self=7, type=4, type_plus_right=1
- **mod-specific html views (covered/total)**: 0/12 (confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, follow_status, follow_tab, ignore_tab, one_line_content, rule_editor, status)
- **all html views declared**: confirm_update_all, core, edit, edit_buttons, errors, follow_button, follow_item, follow_status, follow_tab, ignore_tab, one_line_content, rule_editor, status
- **non-html views**: json:follow_button, json:follow_status
- **view aliases**: (none)
- **event hooks**: 10 (:cache_expired_for_type_change, :expire_preferences_cache, :silence_notifications, :notify_followers_after_save, :stash_followers, :notify_followers_after_delete, ...)
- **before hooks**: 0 ()
- **include_set refs**: FollowOption, List
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-format-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar_right; missing=add_button, add_link, add_url, admin, board_link, compact_missing, ...
- **evidence**: 8/57 html views in HTML_VIEWS (1/46 mod-specific)
- **set modules by pattern**: abstract=1, all=20, right=1, self=1, type=10
- **mod-specific html views (covered/total)**: 1/46 (add_button, add_link, add_url, admin, bar_right, board_link, closed_content, compact_missing, configure_button, configure_link, conflict, content_panel, content_with_title, debug_server_error, demo, denial, edit_button, edit_link, errors, favicon_tag, flash, full_page_link, head, header, header_title, help_link, hidden_content_field, input, label, labeled, labeled_editor, menu_block, meta_tags, not_found, one_line_content, page_title, page_title_tag, raw_one_line_content, rss_links, server_error, short_content, smart_label, stylesheet_tags, title_link, title_no_link, type, type_info, universal_edit_button, url_link, view_list)
- **all html views declared**: add_button, add_link, add_url, admin, bar_right, board_link, closed_content, compact_missing, configure_button, configure_link, conflict, content, content_panel, content_with_title, core, debug_server_error, demo, denial, edit_button, edit_link, errors, favicon_tag, flash, full_page_link, head, header, header_title, help_link, hidden_content_field, input, label, labeled, labeled_editor, menu, menu_block, meta_tags, mini_unknown, not_found, one_line_content, page_title, page_title_tag, raw_one_line_content, rss_links, server_error, short_content, smart_label, stylesheet_tags, title, title_link, title_no_link, titled, type, type_info, universal_edit_button, unknown, url_link, view_list
- **non-html views**: jsonld:bad_address, jsonld:compact_missing, jsonld:denial, jsonld:errors, jsonld:format_unsupported, jsonld:items, jsonld:not_found, jsonld:server_error, jsonld:test, jsonld:unknown, css:content, css:import, css:titled, css:unknown, css:url, csv:body, csv:header, csv:row, csv:titled, csv:unknown, data:ancestors, data:atom, data:cast, data:content, data:core, data:items, data:links, data:molecule, data:nucleus, data:pod, json:bad_address, json:compact_missing, json:denial, json:errors, json:format_unsupported, json:not_found, json:page, json:server_error, json:status, json:test, json:unknown, file:core, file:style, js:source, rss:closed, rss:comment_box, rss:content, rss:feed, rss:feed_body, rss:feed_description, rss:feed_item, rss:feed_item_description, rss:feed_title, rss:menu, rss:open, rss:open_content, text:core, text:text_without_nests, yaml:core
- **view aliases**: :open -> :titled, :closed -> :labeled, :closed_content -> :one_line_content, :server_error -> :errors, :denial -> :errors, :not_found -> :errors, :server_error -> :errors, :open -> :titled, ...(3 more)
- **event hooks**: 2 (:validate_json, :validate_number)
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: default_html_view, rss_enabled
- **haml templates**: 6
- **lib ruby files**: 16

### card-mod-help-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=guide, help, help_text, lead, popover
- **evidence**: 0/5 html views in HTML_VIEWS (0/5 mod-specific)
- **set modules by pattern**: all=2, right=2, self=2
- **mod-specific html views (covered/total)**: 0/5 (guide, help, help_text, lead, popover)
- **all html views declared**: guide, help, help_text, lead, popover
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: TemplatedNests
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-history-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=act, act_legend, action_expanded, action_summary, board_act, change, ...
- **evidence**: 0/12 html views in HTML_VIEWS (0/12 mod-specific)
- **set modules by pattern**: all=3
- **mod-specific html views (covered/total)**: 0/12 (act, act_legend, action_expanded, action_summary, board_act, change, creator_credit, draft_legend, history, last_action, last_action_verb, updated_by)
- **all html views declared**: act, act_legend, action_expanded, action_summary, board_act, change, creator_credit, draft_legend, history, last_action, last_action_verb, updated_by
- **non-html views**: json:actions, json:history
- **view aliases**: (none)
- **event hooks**: 6 (:update_ancestor_timestamps, :assign_action, :detect_conflict, :finalize_action, :rollback_actions, :finalize_act)
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: acts_per_page
- **haml templates**: 0
- **lib ruby files**: 12

### card-mod-integrate-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: no html view declarations in this mod
- **set modules by pattern**: all=1, right=3, self=4
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 1 (:cache_delete_card_events)
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-layout-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar_bottom; missing=close_modal_link, edit_inline, head_content, input, invite, modal, ...
- **evidence**: 2/25 html views in HTML_VIEWS (1/24 mod-specific)
- **set modules by pattern**: abstract=4, all=6, right=3, self=8, type=2
- **mod-specific html views (covered/total)**: 1/24 (bar_bottom, close_modal_link, edit_inline, head_content, input, invite, modal, modal_footer, modal_link, modal_menu, modal_title, my_card, nav_item, nav_link_in_dropdown, navbar_links, one_line_content, overlay_header, overlay_help_link, overlay_menu, overlay_title, pop_out_modal_link, sign_in, sign_out, sign_up)
- **all html views declared**: bar_bottom, close_modal_link, core, edit_inline, head_content, input, invite, modal, modal_footer, modal_link, modal_menu, modal_title, my_card, nav_item, nav_link_in_dropdown, navbar_links, one_line_content, overlay_header, overlay_help_link, overlay_menu, overlay_title, pop_out_modal_link, sign_in, sign_out, sign_up
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 3 (:validate_role_enabling, :clear_roles_cache, :update_layout_registry)
- **before hooks**: 0 ()
- **include_set refs**: AccountDropdown, Items, Type::Html
- **Cardio config keys**: (none)
- **haml templates**: 3
- **lib ruby files**: 5

### card-mod-list-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=input, list, nest_list_input, one_line_content, view_list
- **evidence**: 1/6 html views in HTML_VIEWS (0/5 mod-specific)
- **set modules by pattern**: abstract=6, all=1, right=2, self=3, type=4
- **mod-specific html views (covered/total)**: 0/5 (input, list, nest_list_input, one_line_content, view_list)
- **all html views declared**: core, input, list, nest_list_input, one_line_content, view_list
- **non-html views**: csv:content, csv:core, csv:links, csv:titled, js:content, js:core, js:links, js:titled, data:content, data:core, data:links, data:titled, json:content, json:core, json:links, json:titled, css:content, css:core, css:links, css:titled, rss:content, rss:core, rss:links, rss:titled
- **view aliases**: (none)
- **event hooks**: 5 (:add_and_drop_items, :insert_item_event, :validate_item_type, :validate_item_uniqueness, :delist)
- **before hooks**: 0 ()
- **include_set refs**: Items, List, Paging, ReferenceList
- **Cardio config keys**: (none)
- **haml templates**: 8
- **lib ruby files**: 0

### card-mod-markdown-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: 1/1 html views in HTML_VIEWS (0/0 mod-specific)
- **set modules by pattern**: type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-permissions-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=input, one_line_content, pointer_core
- **evidence**: 1/4 html views in HTML_VIEWS (0/3 mod-specific)
- **set modules by pattern**: abstract=1, all=2, right=4, self=4
- **mod-specific html views (covered/total)**: 0/3 (input, one_line_content, pointer_core)
- **all html views declared**: core, input, one_line_content, pointer_core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 7 (:set_read_rule, :set_field_read_rules, :update_read_rule, :check_permissions, :update_rule_cache, :expire_related, ...)
- **before hooks**: 0 ()
- **include_set refs**: Permission
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 0

### card-mod-recaptcha-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: 1/1 html views in HTML_VIEWS (0/0 mod-specific)
- **set modules by pattern**: abstract=1, all=1, right=3, self=3
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: core
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 3 (:validate_recaptcha_field, :set_recaptcha_site_key, :recaptcha)
- **before hooks**: 0 ()
- **include_set refs**: RecaptchaSetting
- **Cardio config keys**: recaptcha_minimum_score, recaptcha_private_key, recaptcha_proxy, recaptcha_public_key, recaptcha_secret_key, recaptcha_site_key, recaptcha_verify_url
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-rules-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar, bar_bottom, bar_middle, bar_right; missing=accordion_bar_list, accordion_rule_list, bar_setting_list, board_rules_tab, card_select, filtered_accordion_rule_list, ...
- **evidence**: 5/35 html views in HTML_VIEWS (4/34 mod-specific)
- **set modules by pattern**: abstract=1, all=3, right=4, rstar=1, rule=8, self=2, type=4, type_plus_right=1
- **mod-specific html views (covered/total)**: 4/34 (accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, bar_setting_list, board_rules_tab, card_select, filtered_accordion_rule_list, grouped_list, help_text, input, modal_nest_rules, modal_pill_setting_list, modal_rule, nest_rules, one_line_content, overlay_rule, overlay_rule_list_link, overlay_title, pill_setting_list, quick_edit, quick_edit_setting_list, quick_edit_success, raw_one_line_content, rule_board_link, rule_edit, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, set_label, template_link)
- **all html views declared**: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, bar_setting_list, board_rules_tab, card_select, core, filtered_accordion_rule_list, grouped_list, help_text, input, modal_nest_rules, modal_pill_setting_list, modal_rule, nest_rules, one_line_content, overlay_rule, overlay_rule_list_link, overlay_title, pill_setting_list, quick_edit, quick_edit_setting_list, quick_edit_success, raw_one_line_content, rule_board_link, rule_edit, rule_form, rule_form_card_editor, rule_help, rule_nest_editor_link, set_label, template_link
- **non-html views**: data:core, data:one_line_content, data:rule_help, json:core, json:one_line_content, json:rule_help
- **view aliases**: (none)
- **event hooks**: 1 (:save_recently_edited_settings)
- **before hooks**: 0 ()
- **include_set refs**: List, Type::SearchType, VirtualSet
- **Cardio config keys**: (none)
- **haml templates**: 4
- **lib ruby files**: 0

### card-mod-script-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=compressed, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables
- **evidence**: 1/7 html views in HTML_VIEWS (0/6 mod-specific)
- **set modules by pattern**: abstract=7, all=1, right=1, self=1, type=4, type_plus_right=2
- **mod-specific html views (covered/total)**: 0/6 (compressed, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables)
- **all html views declared**: compressed, core, javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables
- **non-html views**: js:compressed, js:core, js:javascript_include_tag
- **view aliases**: (none)
- **event hooks**: 2 (:validate_coffeescript_syntax, :validate_javascript_syntax)
- **before hooks**: 0 ()
- **include_set refs**: AssetFile, AssetGroup, AssetInputter, AssetOutputter, AssetScript, CoffeeScript, FolderGroup, JavaScript, LocalManifestGroup, ModAssets, Script, ScriptGroup
- **Cardio config keys**: double_click
- **haml templates**: 0
- **lib ruby files**: 2

### card-mod-search-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=bar, card_list; missing=add_autocomplete_item, body, checkbox_list, complete, count, feed_body, ...
- **evidence**: 5/23 html views in HTML_VIEWS (2/20 mod-specific)
- **set modules by pattern**: abstract=6, all=1, right=17, self=2, type=2
- **mod-specific html views (covered/total)**: 2/20 (add_autocomplete_item, bar, body, card_list, checkbox_list, complete, count, feed_body, feed_item_description, goto_autocomplete_item, molecule, name_complete, name_match, one_line_content, results_for_keyword, search_box, search_box_complete, search_count, search_error, select2_option)
- **all html views declared**: add_autocomplete_item, bar, body, card_list, checkbox_list, complete, core, count, feed_body, feed_item_description, goto_autocomplete_item, molecule, name_complete, name_match, no_search_results, one_line_content, results_for_keyword, search_box, search_box_complete, search_count, search_error, select2_option, title
- **non-html views**: json:add_autocomplete_item, json:body, json:card_list, json:checkbox_list, json:complete, json:core, json:goto_autocomplete_item, json:molecule, json:name_complete, json:name_match, json:no_search_results, json:results_for_keyword, json:search_box, json:search_box_complete, json:search_count, json:search_error, json:select2_option, json:title, rss:bar, rss:core, rss:feed_body, rss:feed_item_description, rss:one_line_content, rss:title, data:body, data:card_list, data:checkbox_list, data:molecule, data:name_complete, data:name_match, data:no_search_results, data:search_count, data:search_error, csv:body, csv:card_list, csv:checkbox_list, csv:molecule, csv:name_complete, csv:name_match, csv:no_search_results, csv:search_count, csv:search_error
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: CodeContent, CqlSearch, Items, Paging, Search, SearchViews, Type::Json, VirtualSearch
- **Cardio config keys**: paging_limit, search_box_match_start_only
- **haml templates**: 5
- **lib ruby files**: 1

### card-mod-session-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: no html view declarations in this mod
- **set modules by pattern**: all=1, type=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 4 (:discard_deleted_locations, :save_current_location, :store_in_session, :delete_in_session)
- **before hooks**: 0 ()
- **include_set refs**: Pointer
- **Cardio config keys**: allow_anonymous_cookies
- **haml templates**: 0
- **lib ruby files**: 1

### card-mod-style-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=box, box_bottom, box_middle, compiled, compressed, customize_button, ...
- **evidence**: 1/13 html views in HTML_VIEWS (0/12 mod-specific)
- **set modules by pattern**: abstract=7, self=2, type=5, type_plus_right=2
- **mod-specific html views (covered/total)**: 0/12 (box, box_bottom, box_middle, compiled, compressed, customize_button, import, labeled, remote_include_tags, remote_style_tags, stylesheet_include_tag, stylesheet_path)
- **all html views declared**: box, box_bottom, box_middle, compiled, compressed, core, customize_button, import, labeled, remote_include_tags, remote_style_tags, stylesheet_include_tag, stylesheet_path
- **non-html views**: css:compiled, css:compressed, css:concat, css:core, css:import, css:labeled, scss:compiled, scss:core, scss:labeled, scss:stylesheet_include_tag
- **view aliases**: (none)
- **event hooks**: 3 (:validate_css, :validate_scss_syntax, :no_deletion_if_used)
- **before hooks**: 0 ()
- **include_set refs**: AssetFile, AssetGroup, AssetInputter, AssetOutputter, AssetStyle, Css, FolderGroup, List, LocalManifestGroup, ModAssets, Scss, SkinBox, StyleGroup
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 0

### card-mod-tabs-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=pills, pills_static, tabs, tabs_static
- **evidence**: 0/4 html views in HTML_VIEWS (0/4 mod-specific)
- **set modules by pattern**: abstract=1, all=1
- **mod-specific html views (covered/total)**: 0/4 (pills, pills_static, tabs, tabs_static)
- **all html views declared**: pills, pills_static, tabs, tabs_static
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: BsBadge
- **Cardio config keys**: (none)
- **haml templates**: 2
- **lib ruby files**: 2

### card-mod-tinymce_editor-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, ...
- **evidence**: 0/11 html views in HTML_VIEWS (0/11 mod-specific)
- **set modules by pattern**: all=3, self=1
- **mod-specific html views (covered/total)**: 0/11 (change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, nest_editor, nest_image, new_image, new_image_buttons, open_nest_editor)
- **all html views declared**: change_create_to_update, link_editor, modal_link_editor, modal_nest_editor, modal_nest_image, nest_content, nest_editor, nest_image, new_image, new_image_buttons, open_nest_editor
- **non-html views**: js:change_create_to_update, js:modal_nest_image, js:nest_image, js:new_image, js:new_image_buttons, js:open_nest_editor
- **view aliases**: (none)
- **event hooks**: 0 ()
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 10
- **lib ruby files**: 1

### card-mod-virtual-0.20.0

- **status**: `partial`
- **verdict**: mod-specific: covered=(no mod-specific views covered); missing=(no mod-specific views)
- **evidence**: no html view declarations in this mod
- **set modules by pattern**: abstract=1
- **mod-specific html views (covered/total)**: 0/0 ((none))
- **all html views declared**: (none)
- **non-html views**: (none)
- **view aliases**: (none)
- **event hooks**: 2 (:save_virtual_content, :delete_virtual_content)
- **before hooks**: 0 ()
- **include_set refs**: (none)
- **Cardio config keys**: (none)
- **haml templates**: 0
- **lib ruby files**: 1

## Method

Per gem, walk `set/**/*.rb` and `lib/**/*.rb`, mine via regex:
- `view :name` and `view :name, :target` (aliases)
- `format :name do ... end` (which views live inside which format)
- `def name` (set-module methods), `event :name` (event hooks), `before :view` (before-hooks), `include_set Abstract::Foo`
- `Cardio::Railtie.config.tap { |c| c.key = ... }` (config keys)

Compare against decko-ts `src/card/set-patterns/registry.ts` PATTERN_TABLE
(which set patterns are registered) and `src/card/render/views.ts` HTML_VIEWS
(which html views are implemented). Status thresholds:
- **ported**: ≥50% of declared html views are in HTML_VIEWS AND ≥50% of patterns the mod uses are implemented AND the mod has pattern-backed set modules.
- **partial**: some coverage (any html view present, or ≥50% pattern coverage, or lib/ + permissions), but not enough for ported.
- **missing**: zero coverage.
- **ignored**: legacy-labeled per upstream (decko-commons#1282 thread) or data/transform-only with no set/ tree.

See `docs/mod-compat-notes.md` for caveats, false positives, and the
boundary cases that move a mod between categories.
