# card-mod-format — harness scorecard

Behaviors validated: **1 / 166** (standing-net: 137, named-remainder: 28, RED: 0, uncaptured: 0)

State legend: green = registered + harness oracle captured + probe suite green; registered-standing-net = registered + the mod's tracked suite pins it (no harness oracle line); named-remainder = unregistered with a named, evidenced reason (never RED); uncaptured = no oracle and no probe coverage; red-* = the harness found the behavior unported or the oracle failing.

Probe suite: 54 passed / 0 failed (tests/card/mod-loader/card-mod-format-harness-probe.test.ts, tests/card/mod-loader/card-mod-format.test.ts)

| behavior | kind | state | ts registration | captured | evidence |
|---|---|---|---|---|---|
| `view:name` | view | registered-standing-net | yes | - | view "name" registered (engine HTML_VIEWS + manifest) |
| `view:key` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "key" |
| `view:linkname` | view | registered-standing-net | yes | - | view "linkname" registered (engine HTML_VIEWS + manifest) |
| `view:url` | view | registered-standing-net | yes | - | view "url" registered (engine HTML_VIEWS + manifest) |
| `view:id_url` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "id_url" |
| `view:url_link` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "url_link" |
| `view:link` | view | registered-standing-net | yes | - | view "link" registered (engine HTML_VIEWS + manifest) |
| `view:nav_link` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "nav_link" |
| `view:codename` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "codename" |
| `view:id` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "id" |
| `view:type` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "type" |
| `view:created_at` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "created_at" |
| `view:updated_at` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "updated_at" |
| `view:acted_at` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "acted_at" |
| `view:raw` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "raw" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:content` | view | registered-standing-net | yes | - | view "content" registered (engine HTML_VIEWS) |
| `view:open_content` | view | registered-standing-net | yes | - | view "open_content" registered (engine HTML_VIEWS) |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "one_line_content" |
| `view:labeled_content` | view | registered-standing-net | yes | - | view "labeled_content" registered (engine HTML_VIEWS + manifest) |
| `view:titled_content` | view | registered-standing-net | yes | - | view "titled_content" registered (engine HTML_VIEWS + manifest) |
| `view:blank` | view | registered-standing-net | yes | - | view "blank" registered (engine HTML_VIEWS + manifest) |
| `view:titled` | view | registered-standing-net | yes | - | view "titled" registered (engine HTML_VIEWS) |
| `view:open` | view | registered-standing-net | yes | - | view "open" registered (engine HTML_VIEWS) |
| `view:labeled` | view | registered-standing-net | yes | - | view "labeled" registered (engine HTML_VIEWS + manifest) |
| `view:closed` | view | registered-standing-net | yes | - | view "closed" registered (engine HTML_VIEWS) |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "one_line_content" |
| `view:closed_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "closed_content" |
| `view:raw_one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "raw_one_line_content" |
| `view:label` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "label" |
| `view:smart_label` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "smart_label" |
| `view:hidden_content_field` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "hidden_content_field" |
| `view:titled` | view | registered-standing-net | yes | - | view "titled" registered (engine HTML_VIEWS) |
| `view:content` | view | registered-standing-net | yes | - | view "content" registered (engine HTML_VIEWS) |
| `view:unknown` | view | registered-standing-net | yes | - | view "unknown" registered (engine HTML_VIEWS + manifest) |
| `view:import` | view | named-remainder | no | - | no view "import" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:url` | view | registered-standing-net | yes | - | view "url" registered (engine HTML_VIEWS + manifest) |
| `view:titled` | view | registered-standing-net | yes | - | view "titled" registered (engine HTML_VIEWS) |
| `view:body` | view | named-remainder | no | - | no view "body" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:row` | view | named-remainder | no | - | no view "row" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:header` | view | registered-standing-net | yes | - | view "header" registered (engine HTML_VIEWS) |
| `view:unknown` | view | registered-standing-net | yes | - | view "unknown" registered (engine HTML_VIEWS + manifest) |
| `view:pod` | view | named-remainder | no | - | no view "pod" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:content` | view | registered-standing-net | yes | - | view "content" registered (engine HTML_VIEWS) |
| `view:nucleus` | view | named-remainder | no | - | no view "nucleus" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:atom` | view | named-remainder | no | - | no view "atom" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:molecule` | view | named-remainder | no | - | no view "molecule" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:ancestors` | view | named-remainder | no | - | no view "ancestors" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:cast` | view | named-remainder | no | - | no view "cast" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:items` | view | named-remainder | no | - | no view "items" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:links` | view | named-remainder | no | - | no view "links" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:demo` | view | green | yes | static-ruby | card-mod-format.ts registers view "demo" |
| `view:view_list` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "view_list" |
| `view:compact_missing` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "compact_missing" |
| `view:unknown` | view | registered-standing-net | yes | - | view "unknown" registered (engine HTML_VIEWS + manifest) |
| `view:server_error` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "server_error" |
| `view:denial` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "denial" |
| `view:not_found` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "not_found" |
| `view:bad_address` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "bad_address" |
| `view:errors` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "errors" |
| `view:test` | view | named-remainder | no | - | no view "test" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:format_unsupported` | view | named-remainder | no | - | no view "format_unsupported" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:style` | view | named-remainder | no | - | no view "style" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:type` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "type" |
| `view:type_info` | view | registered-standing-net | yes | - | view "type_info" registered (engine HTML_VIEWS) |
| `view:server_error` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "server_error" |
| `view:debug_server_error` | view | named-remainder | no | - | no view "debug_server_error" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:unknown` | view | registered-standing-net | yes | - | view "unknown" registered (engine HTML_VIEWS + manifest) |
| `view:mini_unknown` | view | registered-standing-net | yes | - | view "mini_unknown" registered (engine HTML_VIEWS) |
| `view:compact_missing` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "compact_missing" |
| `view:conflict` | view | registered-standing-net | yes | - | view "conflict" registered (engine HTML_VIEWS) |
| `view:errors` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "errors" |
| `view:not_found` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "not_found" |
| `view:denial` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "denial" |
| `view:flash` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "flash" |
| `view:page_title` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "page_title" |
| `view:head` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "head" |
| `view:meta_tags` | view | registered-standing-net | yes | - | view "meta_tags" registered (engine HTML_VIEWS) |
| `view:page_title_tag` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "page_title_tag" |
| `view:favicon_tag` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "favicon_tag" |
| `view:universal_edit_button` | view | registered-standing-net | yes | - | view "universal_edit_button" registered (engine HTML_VIEWS) |
| `view:rss_links` | view | registered-standing-net | yes | - | view "rss_links" registered (engine HTML_VIEWS) |
| `view:stylesheet_tags` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "stylesheet_tags" |
| `basket:basket[:head_views] =` | basket-op | named-remainder | no | - | no TS literal "basket[:head_views] =" (no consumer seam yet) |
| `basket:basket[:cache_seed_names] += [` | basket-op | named-remainder | no | - | no TS literal "basket[:cache_seed_names] += [" (no consumer seam yet) |
| `basket:basket[:head_views].map { |viewname| render viewname }.flatten.compact.join "\n"` | basket-op | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `view:header` | view | registered-standing-net | yes | - | view "header" registered (engine HTML_VIEWS) |
| `view:header_title` | view | registered-standing-net | yes | - | view "header_title" registered (engine HTML_VIEWS) |
| `view:menu_block` | view | registered-standing-net | yes | - | view "menu_block" registered (engine HTML_VIEWS) |
| `view:menu` | view | registered-standing-net | yes | - | view "menu" registered (engine HTML_VIEWS) |
| `view:edit_link` | view | registered-standing-net | yes | - | view "edit_link" registered (engine HTML_VIEWS) |
| `view:edit_button` | view | registered-standing-net | yes | - | view "edit_button" registered (engine HTML_VIEWS) |
| `view:full_page_link` | view | registered-standing-net | yes | - | view "full_page_link" registered (engine HTML_VIEWS) |
| `view:board_link` | view | registered-standing-net | yes | - | view "board_link" registered (engine HTML_VIEWS) |
| `view:help_link` | view | registered-standing-net | yes | - | view "help_link" registered (engine HTML_VIEWS) |
| `view:content` | view | registered-standing-net | yes | - | view "content" registered (engine HTML_VIEWS) |
| `view:short_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "short_content" |
| `view:raw_one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "raw_one_line_content" |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "one_line_content" |
| `view:content_with_title` | view | registered-standing-net | yes | - | view "content_with_title" registered (engine HTML_VIEWS) |
| `view:content_panel` | view | registered-standing-net | yes | - | view "content_panel" registered (engine HTML_VIEWS) |
| `view:titled` | view | registered-standing-net | yes | - | view "titled" registered (engine HTML_VIEWS) |
| `view:labeled` | view | registered-standing-net | yes | - | view "labeled" registered (engine HTML_VIEWS + manifest) |
| `view:source` | view | registered-standing-net | yes | - | view "source" registered in ANOTHER mod's manifest (src/card/mod-loader/mods/card-mod-carrierwave.ts) - the surface mod's override dispatche |
| `view:status` | view | registered-standing-net | yes | - | view "status" registered in ANOTHER mod's manifest (src/card/mod-loader/mods/card-mod-follow.ts) - the surface mod's override dispatches thr |
| `view:page` | view | named-remainder | no | - | no view "page" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:items` | view | named-remainder | no | - | no view "items" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed` | view | named-remainder | no | - | no view "feed" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed_body` | view | named-remainder | no | - | no view "feed_body" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed_title` | view | named-remainder | no | - | no view "feed_title" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed_item` | view | named-remainder | no | - | no view "feed_item" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed_item_description` | view | named-remainder | no | - | no view "feed_item_description" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:feed_description` | view | named-remainder | no | - | no view "feed_description" registration in card-mod-format.ts, any other mod manifest, or the engine HTML_VIEWS table |
| `view:comment_box` | view | registered-standing-net | yes | - | view "comment_box" registered (engine HTML_VIEWS) |
| `view:menu` | view | registered-standing-net | yes | - | view "menu" registered (engine HTML_VIEWS) |
| `view:open` | view | registered-standing-net | yes | - | view "open" registered (engine HTML_VIEWS) |
| `view:content` | view | registered-standing-net | yes | - | view "content" registered (engine HTML_VIEWS) |
| `view:open_content` | view | registered-standing-net | yes | - | view "open_content" registered (engine HTML_VIEWS) |
| `view:closed` | view | registered-standing-net | yes | - | view "closed" registered (engine HTML_VIEWS) |
| `view:text_without_nests` | view | registered-standing-net | yes | - | view "text_without_nests" registered (engine HTML_VIEWS) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:title` | view | registered-standing-net | yes | - | view "title" registered (engine HTML_VIEWS) |
| `view:title_link` | view | registered-standing-net | yes | - | view "title_link" registered (engine HTML_VIEWS + manifest) |
| `view:title_no_link` | view | registered-standing-net | yes | - | view "title_no_link" registered (engine HTML_VIEWS) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:home_url` | view | registered-standing-net | yes | - | view "home_url" registered (engine HTML_VIEWS) |
| `view:home_path` | view | registered-standing-net | yes | - | view "home_path" registered (engine HTML_VIEWS) |
| `view:type` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "type" |
| `view:add_link` | view | registered-standing-net | yes | - | view "add_link" registered (engine HTML_VIEWS + manifest) |
| `view:add_button` | view | registered-standing-net | yes | - | view "add_button" registered (engine HTML_VIEWS + manifest) |
| `view:add_url` | view | registered-standing-net | yes | - | view "add_url" registered (engine HTML_VIEWS + manifest) |
| `view:configure_link` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "configure_link" |
| `view:configure_button` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "configure_button" |
| `view:one_line_content` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "one_line_content" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `event:validate_json` | event | named-remainder | no | - | no event "validate_json" registration in card-mod-format.ts |
| `view:admin` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "admin" |
| `view:bar_right` | view | registered-standing-net | yes | - | view "bar_right" registered (engine HTML_VIEWS + manifest) |
| `event:validate_number` | event | named-remainder | no | - | no event "validate_number" registration in card-mod-format.ts |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `view:input` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "input" |
| `view:labeled_editor` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "labeled_editor" |
| `view:title_link` | view | registered-standing-net | yes | - | view "title_link" registered (engine HTML_VIEWS + manifest) |
| `view:url_link` | view | registered-standing-net | yes | - | card-mod-format.ts registers view "url_link" |
| `view:core` | view | registered-standing-net | yes | - | view "core" registered (engine HTML_VIEWS + manifest) |
| `seed:json` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:basic` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-rules.ts |
| `seed:number` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-carrierwave.ts |
| `seed:plain_text` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-email.ts |
| `seed:html` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:toggle` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-admin-runtime.ts |
| `seed:phrase` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:uri` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-admin-runtime.ts |
| `seed:head` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-edit.ts |
| `seed:` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:title` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `seed:credit` | seed | registered-standing-net | yes | - | src/card/mod-loader/mods/core-admin-runtime.ts |
| `seed:noindex` | seed | named-remainder | no | - | no TS registration naming "noindex" |
| `config:configurations` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-ace_editor.ts |
| `config:cardtypes` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-carrierwave.ts |
| `config:views` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:de` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
| `config:en` | config | registered-standing-net | yes | - | src/card/mod-loader/mods/card-mod-account.ts |
