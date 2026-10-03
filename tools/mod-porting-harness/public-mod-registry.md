# Public mod registry — the porting-harness progress tracker

Generated 2026-10-03T15:25:53.467Z by tools/mod-porting-harness/mod-harness.mjs registry

Ruling: every PUBLIC mod ported, behavior-validated. Private mods are the only exclusion (none in the installed gem set — every row's public evidence names its gem).

**35 ported / 0 unported / 0 private-unknown** across 35 mods.

**Honest gap note:** the mod-level ported status does not mask behavior gaps — 6 ported mod(s) still carry 23 missing view(s) per the re-measurement (card-mod-account: 6, card-mod-follow: 4, card-mod-format: 2, card-mod-history: 1, card-mod-style: 4, card-mod-tinymce_editor: 6). Those behaviors are unported INSIDE ported mods; their rows show them in the re-measure column until their harness scorecards land.

**Harness coverage of the registry:** 7 of 35 rows carry a harness scorecard; the other 28 are cited on compat-report evidence only and are the next surface/capture/verify runs to make.

Re-measurement cite: mod-coverage-remeasure 2026-10-03 (tree 0287dab): 377 declared views / 174 byte-pinned / 354 render-at-all / 23 missing; 28 of 34 mods with zero missing views.

| mod | status | re-measure missing views | harness scorecard | evidence |
|-----|--------|-------------------------:|-------------------|----------|
| `card (core mod, card-1.110.0 mod/core)` | ported | - | see the engine suites | the decko-ts engine IS the core port (src/card/*); not a card-mod-* gem |
| `card-mod-account` | ported | 6 | not harness-validated yet | 17 mod-specific view(s) ported: closed_account, closure, configs, content_formgroups, edit, edit_buttons, ... |
| `card-mod-ace_editor` | ported | 0 | 0/4 validated | harness scorecard, 0 RED: 0/4 harness-oracle-validated, 4 pinned by the mod's standing suite (see tools/mod-porting-harness/reports/card-mod-ace_editor/scorecard.md) |
| `card-mod-api_key` | ported | 0 | not harness-validated yet | 6 mod-specific view(s) ported: api_key, buttons, current, generate_button, token, token_link |
| `card-mod-assets` | ported | 0 | not harness-validated yet | 2 mod-specific view(s) ported: javascript_include_tag, stylesheet_include_tag |
| `card-mod-bar_and_box` | ported | 0 | 0/22 validated | harness scorecard, 0 RED: 0/22 harness-oracle-validated, 22 pinned by the mod's standing suite (see tools/mod-porting-harness/reports/card-mod-bar_and_box/scorecard.md) |
| `card-mod-bootstrap` | ported | 0 | not harness-validated yet | 10 mod-specific view(s) ported: bar_bottom, bar_left, bar_middle, bar_right, carousel, customize_button, ... |
| `card-mod-carrierwave` | ported | 0 | not harness-validated yet | 6 mod-specific view(s) ported: content_changes, full_width, input, link_tag, preview_editor, source |
| `card-mod-collection` | ported | 0 | not harness-validated yet | 2 mod-specific view(s) ported: count, paging |
| `card-mod-comment` | ported | 0 | 1/9 validated | harness scorecard, 0 RED: 1/9 harness-oracle-validated, 8 pinned by the mod's standing suite (see tools/mod-porting-harness/reports/card-mod-comment/scorecard.md) |
| `card-mod-content` | ported | 0 | not harness-validated yet | 4 mod-specific view(s) ported: bar_middle, file_size, input, one_line_content |
| `card-mod-date` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (20 pins across 32 it()):  |
| `card-mod-defaults` | ported | 0 | not harness-validated yet | legacy-labeled per upstream (#1282): ignored (legacy-labeled per upstream maintainer guidance); nothing to port |
| `card-mod-delayed_job` | ported | 0 | not harness-validated yet | legacy-labeled per upstream (#1282): ignored (legacy-labeled per upstream maintainer guidance); nothing to port |
| `card-mod-edit` | ported | 0 | not harness-validated yet | 41 mod-specific view(s) ported: board, board_type_formgroup, conflict_tracker, content_formgroup, content_formgroups, edit, ... |
| `card-mod-email` | ported | 0 | not harness-validated yet | 2 mod-specific view(s) ported: compact_missing, email_page |
| `card-mod-follow` | ported | 4 | not harness-validated yet | 11 mod-specific view(s) ported: confirm_update_all, edit, edit_buttons, errors, follow_button, follow_item, ... |
| `card-mod-format` | ported | 2 | 1/168 validated | harness scorecard, 0 RED: 1/168 harness-oracle-validated, 137 pinned by the mod's standing suite, 30 named-remainder(s) (see the scorecard rows) (see tools/mod-porting-harness/repo |
| `card-mod-help` | ported | 0 | not harness-validated yet | 5 mod-specific view(s) ported: guide, help, help_text, lead, popover |
| `card-mod-history` | ported | 1 | 1/26 validated | harness scorecard, 0 RED: 1/26 harness-oracle-validated, 21 pinned by the mod's standing suite, 4 named-remainder(s) (see the scorecard rows) (see tools/mod-porting-harness/reports |
| `card-mod-integrate` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (21 pins across 28 it()):  |
| `card-mod-layout` | ported | 0 | not harness-validated yet | 24 mod-specific view(s) ported: bar_bottom, close_modal_link, edit_inline, head_content, input, invite, ... |
| `card-mod-list` | ported | 0 | not harness-validated yet | 5 mod-specific view(s) ported: input, list, nest_list_input, one_line_content, view_list |
| `card-mod-markdown` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (15 pins across 14 it()): core |
| `card-mod-permissions` | ported | 0 | not harness-validated yet | 3 mod-specific view(s) ported: input, one_line_content, pointer_core |
| `card-mod-recaptcha` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (12 pins across 40 it()): core |
| `card-mod-rules` | ported | 0 | not harness-validated yet | 34 mod-specific view(s) ported: accordion_bar_list, accordion_rule_list, bar, bar_bottom, bar_middle, bar_right, ... |
| `card-mod-script` | ported | 0 | not harness-validated yet | 5 mod-specific view(s) ported: javascript_include_tag, javascript_tags, remote_script_tags, script_calls, script_variables |
| `card-mod-search` | ported | 0 | not harness-validated yet | 10 mod-specific view(s) ported: add_autocomplete_item, bar, card_list, checkbox_list, count, goto_autocomplete_item, ... |
| `card-mod-session` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (5 pins across 7 it()):  |
| `card-mod-style` | ported | 4 | 5/34 validated | harness scorecard, 0 RED: 5/34 harness-oracle-validated, 21 pinned by the mod's standing suite, 8 named-remainder(s) (see the scorecard rows) (see tools/mod-porting-harness/reports |
| `card-mod-tabs` | ported | 0 | not harness-validated yet | 4 mod-specific view(s) ported: pills, pills_static, tabs, tabs_static |
| `card-mod-tinymce_editor` | ported | 6 | not harness-validated yet | 5 mod-specific view(s) ported: change_create_to_update, link_editor, modal_link_editor, new_image_buttons, open_nest_editor |
| `card-mod-virtual` | ported | 0 | not harness-validated yet | manifest + byte-pinned test (16 pins across 33 it()):  |
| `card-mod-marketplace` | ported | - | not harness-validated yet | TS-only mod (no Ruby gem — no Ruby-declared surface; decko-ts marketplace mod) |

## Private-unknown evidence policy

A mod is marked `private-unknown` only with evidence that its source is site-private (not published). The installed `card-mod-*` gem set is public by construction (published gems with LICENSE files — the same frozen set the license audit read), so no row carries private-unknown here. The TS-only marketplace row cites its no-gem status.
