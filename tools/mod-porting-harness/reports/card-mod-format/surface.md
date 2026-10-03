# card-mod-format-0.20.0 — behavior surface

What this mod does (mined from the Ruby gem source, READ-ONLY):

- 145 view(s), 2 event hook(s), 13 seed card(s), 5 config key(s), 3 basket registration(s).
- 40 set module file(s); 16 asset file(s); 0 public/ asset file(s).

## Views

- `name` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/base.rb:14
- `key` — ,      compact: true, perms: :none) { card.key } — card-mod-format-0.20.0/set/all/base.rb:26
- `linkname` — , compact: true, perms: :none) { card.name.url_key } — card-mod-format-0.20.0/set/all/base.rb:27
- `url` — ,      compact: true, perms: :none) { card_url _render_linkname } — card-mod-format-0.20.0/set/all/base.rb:28
- `id_url` — ,   compact: true) { card_url "~#{card.id}" } — card-mod-format-0.20.0/set/all/base.rb:29
- `url_link` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/base.rb:31
- `link` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/base.rb:35
- `nav_link` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/base.rb:39
- `codename` — , compact: true) { card.codename.to_s } — card-mod-format-0.20.0/set/all/base.rb:55
- `id` — ,       compact: true) { card.id            } — card-mod-format-0.20.0/set/all/base.rb:56
- `type` — ,     compact: true) { card.type_name     } — card-mod-format-0.20.0/set/all/base.rb:57
- `created_at` — , compact: true) { date_view card.created_at } — card-mod-format-0.20.0/set/all/base.rb:61
- `updated_at` — , compact: true) { date_view card.updated_at } — card-mod-format-0.20.0/set/all/base.rb:62
- `acted_at` — ,   compact: true) { date_view card.acted_at   } — card-mod-format-0.20.0/set/all/base.rb:63
- `raw` — do — card-mod-format-0.20.0/set/all/base.rb:75
- `core` — , compact: true do — card-mod-format-0.20.0/set/all/base.rb:85
- `content` — do — card-mod-format-0.20.0/set/all/base.rb:89
- `open_content` — do — card-mod-format-0.20.0/set/all/base.rb:93
- `one_line_content` — , compact: true do — card-mod-format-0.20.0/set/all/base.rb:97
- `labeled_content` — , unknown: :mini_unknown do — card-mod-format-0.20.0/set/all/base.rb:101
- `titled_content` — , unknown: :blank do — card-mod-format-0.20.0/set/all/base.rb:105
- `blank` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/base.rb:109
- `titled` — do — card-mod-format-0.20.0/set/all/base.rb:120
- `open` (alias of :titled) — card-mod-format-0.20.0/set/all/base.rb:123
- `labeled` — do — card-mod-format-0.20.0/set/all/base.rb:125
- `closed` (alias of :labeled) — card-mod-format-0.20.0/set/all/base.rb:128
- `one_line_content` — do — card-mod-format-0.20.0/set/all/content.rb:9
- `closed_content` (alias of :one_line_content) — card-mod-format-0.20.0/set/all/content.rb:16
- `raw_one_line_content` — do — card-mod-format-0.20.0/set/all/content.rb:18
- `label` — do — card-mod-format-0.20.0/set/all/content.rb:22
- `smart_label` — , cache: :never, unknown: true do — card-mod-format-0.20.0/set/all/content.rb:26
- `hidden_content_field` — , unknown: true, cache: :never do — card-mod-format-0.20.0/set/all/content.rb:57
- `titled` — do — card-mod-format-0.20.0/set/all/css.rb:11
- `content` — do — card-mod-format-0.20.0/set/all/css.rb:15
- `unknown` — do — card-mod-format-0.20.0/set/all/css.rb:19
- `import` — do — card-mod-format-0.20.0/set/all/css.rb:23
- `url` — , perms: :none do — card-mod-format-0.20.0/set/all/css.rb:27
- `titled` — do — card-mod-format-0.20.0/set/all/csv.rb:21
- `body` — do — card-mod-format-0.20.0/set/all/csv.rb:26
- `row` — do — card-mod-format-0.20.0/set/all/csv.rb:30
- `header` — do — card-mod-format-0.20.0/set/all/csv.rb:35
- `unknown` — do — card-mod-format-0.20.0/set/all/csv.rb:39
- `pod` — do — card-mod-format-0.20.0/set/all/data.rb:32
- `core` — , unknown: true do — card-mod-format-0.20.0/set/all/data.rb:36
- `content` — do — card-mod-format-0.20.0/set/all/data.rb:40
- `nucleus` — do — card-mod-format-0.20.0/set/all/data.rb:44
- `atom` — , unknown: true do — card-mod-format-0.20.0/set/all/data.rb:49
- `molecule` — do — card-mod-format-0.20.0/set/all/data.rb:53
- `ancestors` — do — card-mod-format-0.20.0/set/all/data.rb:57
- `cast` — do — card-mod-format-0.20.0/set/all/data.rb:64
- `items` — , cache: :never do — card-mod-format-0.20.0/set/all/data.rb:70
- `links` — do — card-mod-format-0.20.0/set/all/data.rb:74
- `demo` — do — card-mod-format-0.20.0/set/all/demo.rb:2
- `view_list` — do — card-mod-format-0.20.0/set/all/demo.rb:8
- `compact_missing` — , perms: :none, compact: true do — card-mod-format-0.20.0/set/all/error.rb:2
- `unknown` — , perms: :none, cache: :never do — card-mod-format-0.20.0/set/all/error.rb:6
- `server_error` — , perms: :none do — card-mod-format-0.20.0/set/all/error.rb:10
- `denial` — , perms: :none do — card-mod-format-0.20.0/set/all/error.rb:14
- `not_found` — , perms: :none do — card-mod-format-0.20.0/set/all/error.rb:18
- `bad_address` — , perms: :none do — card-mod-format-0.20.0/set/all/error.rb:23
- `errors` — do — card-mod-format-0.20.0/set/all/error.rb:28
- `test` — do — card-mod-format-0.20.0/set/all/error.rb:75
- `format_unsupported` — , perms: :none do — card-mod-format-0.20.0/set/all/error.rb:91
- `core` — do — card-mod-format-0.20.0/set/all/file.rb:2
- `style` — do — card-mod-format-0.20.0/set/all/file.rb:6
- `type` — , unknown: true do — card-mod-format-0.20.0/set/all/html.rb:5
- `type_info` — do — card-mod-format-0.20.0/set/all/html.rb:9
- `server_error` — , template: :haml — card-mod-format-0.20.0/set/all/html/error.rb:2
- `debug_server_error` — , wrap: { modal: { size: :full } } do — card-mod-format-0.20.0/set/all/html/error.rb:4
- `unknown` — do — card-mod-format-0.20.0/set/all/html/error.rb:10
- `mini_unknown` — , unknown: true, cache: :never do — card-mod-format-0.20.0/set/all/html/error.rb:15
- `compact_missing` — , perms: :none do — card-mod-format-0.20.0/set/all/html/error.rb:33
- `conflict` — , cache: :never do — card-mod-format-0.20.0/set/all/html/error.rb:37
- `errors` — , perms: :none do — card-mod-format-0.20.0/set/all/html/error.rb:53
- `not_found` — , cache: :never do — card-mod-format-0.20.0/set/all/html/error.rb:67
- `denial` — do — card-mod-format-0.20.0/set/all/html/error.rb:75
- `flash` — , cache: :never, unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/frame.rb:2
- `page_title` — , unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/head.rb:21
- `head` — , unknown: true, perms: :none, cache: :always do — card-mod-format-0.20.0/set/all/html/head.rb:31
- `meta_tags` — , unknown: true, perms: :none, template: :haml — card-mod-format-0.20.0/set/all/html/head.rb:35
- `page_title_tag` — , unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/head.rb:37
- `favicon_tag` — , unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/head.rb:41
- `universal_edit_button` — , unknown: :blank, denial: :blank, perms: :update do — card-mod-format-0.20.0/set/all/html/head.rb:46
- `rss_links` — , unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/head.rb:54
- `stylesheet_tags` — , cache: :never, unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/html/head.rb:61
- `header` — , perms: :none do — card-mod-format-0.20.0/set/all/html/header.rb:5
- `header_title` — , perms: :none do — card-mod-format-0.20.0/set/all/html/header.rb:15
- `menu_block` — do — card-mod-format-0.20.0/set/all/html/menu.rb:2
- `menu` — , denial: :blank, unknown: true do — card-mod-format-0.20.0/set/all/html/menu.rb:8
- `edit_link` — , unknown: true, denial: :blank do — card-mod-format-0.20.0/set/all/html/menu.rb:16
- `edit_button` — do — card-mod-format-0.20.0/set/all/html/menu.rb:20
- `full_page_link` — do — card-mod-format-0.20.0/set/all/html/menu.rb:25
- `board_link` — , unknown: true do — card-mod-format-0.20.0/set/all/html/menu.rb:29
- `help_link` — , cache: :never, unknown: true do — card-mod-format-0.20.0/set/all/html/menu.rb:35
- `content` — , cache: :yes do — card-mod-format-0.20.0/set/all/html/views.rb:10
- `short_content` — , wrap: { div: { class: "text-muted" } } do — card-mod-format-0.20.0/set/all/html/views.rb:20
- `raw_one_line_content` — , unknown: :mini_unknown, — card-mod-format-0.20.0/set/all/html/views.rb:24
- `one_line_content` — , unknown: :mini_unknown, — card-mod-format-0.20.0/set/all/html/views.rb:29
- `content_with_title` — do — card-mod-format-0.20.0/set/all/html/views.rb:36
- `content_panel` — do — card-mod-format-0.20.0/set/all/html/views.rb:47
- `titled` — , cache: :yes do — card-mod-format-0.20.0/set/all/html/views.rb:55
- `labeled` — , unknown: :labeled, cache: :yes do — card-mod-format-0.20.0/set/all/html/views.rb:67
- `source` — do — card-mod-format-0.20.0/set/all/js.rb:6
- `status` — , unknown: true, perms: :none do — card-mod-format-0.20.0/set/all/json.rb:29
- `page` — , cache: :never do — card-mod-format-0.20.0/set/all/json.rb:37
- `items` — , cache: :never do — card-mod-format-0.20.0/set/all/jsonld.rb:5
- `remote` — card-mod-format-0.20.0/set/all/links.rb:147 (loop-declared)
- `method` — card-mod-format-0.20.0/set/all/links.rb:147 (loop-declared)
- `feed` — , cache: :never do — card-mod-format-0.20.0/set/all/rss.rb:17
- `feed_body` — , cache: :never do — card-mod-format-0.20.0/set/all/rss.rb:40
- `feed_title` — do — card-mod-format-0.20.0/set/all/rss.rb:48
- `feed_item` — do — card-mod-format-0.20.0/set/all/rss.rb:52
- `feed_item_description` — do — card-mod-format-0.20.0/set/all/rss.rb:67
- `feed_description` — ) { "" } — card-mod-format-0.20.0/set/all/rss.rb:71
- `comment_box` — ) { "" } — card-mod-format-0.20.0/set/all/rss.rb:72
- `menu` — ) { "" } — card-mod-format-0.20.0/set/all/rss.rb:73
- `open` (alias of :titled) — , mod: All::Base::Format — card-mod-format-0.20.0/set/all/rss.rb:75
- `content` (alias of :core) — ,   mod: All::Base::Format — card-mod-format-0.20.0/set/all/rss.rb:76
- `open_content` (alias of :core) — ,   mod: All::Base::Format — card-mod-format-0.20.0/set/all/rss.rb:77
- `closed` (alias of :link) — ,   mod: All::Base::Format — card-mod-format-0.20.0/set/all/rss.rb:78
- `text_without_nests` — do — card-mod-format-0.20.0/set/all/text.rb:15
- `core` — do — card-mod-format-0.20.0/set/all/text.rb:22
- `title` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/title.rb:2
- `title_link` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/title.rb:16
- `title_no_link` — , compact: true, perms: :none do — card-mod-format-0.20.0/set/all/title.rb:20
- `core` — do — card-mod-format-0.20.0/set/all/yaml.rb:6
- `home_url` — , perms: :none do — card-mod-format-0.20.0/set/self/home.rb:2
- `home_path` — , perms: :none do — card-mod-format-0.20.0/set/self/home.rb:6
- `type` — , unknown: true do — card-mod-format-0.20.0/set/type/cardtype.rb:2
- `add_link` — do — card-mod-format-0.20.0/set/type/cardtype.rb:14
- `add_button` — do — card-mod-format-0.20.0/set/type/cardtype.rb:18
- `add_url` — do — card-mod-format-0.20.0/set/type/cardtype.rb:36
- `configure_link` — , cache: :never, perms: :can_configure? do — card-mod-format-0.20.0/set/type/cardtype.rb:53
- `configure_button` — , cache: :never, denial: :blank, perms: :can_configure? do — card-mod-format-0.20.0/set/type/cardtype.rb:61
- `one_line_content` — do — card-mod-format-0.20.0/set/type/html.rb:10
- `core` — do — card-mod-format-0.20.0/set/type/json.rb:30
- `admin` — do — card-mod-format-0.20.0/set/type/mod.rb:2
- `bar_right` — do — card-mod-format-0.20.0/set/type/mod.rb:6
- `core` — do — card-mod-format-0.20.0/set/type/plain_text.rb:6
- `core` — do — card-mod-format-0.20.0/set/type/toggle.rb:5
- `input` — do — card-mod-format-0.20.0/set/type/toggle.rb:15
- `labeled_editor` — do — card-mod-format-0.20.0/set/type/toggle.rb:19
- `title_link` — do — card-mod-format-0.20.0/set/type/uri.rb:2
- `url_link` — do — card-mod-format-0.20.0/set/type/uri.rb:6
- `core` — do — card-mod-format-0.20.0/set/type/uri.rb:12

## Events

- `validate_json` , :validate, on: :save, changed: :content do — card-mod-format-0.20.0/set/type/json.rb:3
- `validate_number` , :validate, on: :save do — card-mod-format-0.20.0/set/type/number.rb:7

## Seed cards

- JSON (codename json) type :cardtype — data/real.yml
- RichText (codename basic) type :cardtype — data/real.yml
- Number (codename number) type :cardtype — data/real.yml
- PlainText (codename plain_text) type :cardtype — data/real.yml
- HTML (codename html) type :cardtype — data/real.yml
- Toggle (codename toggle) type :cardtype — data/real.yml
- Phrase (codename phrase) type :cardtype — data/real.yml
- URI (codename uri) type :cardtype — data/real.yml
- "*head" (codename head) type :setting — data/real.yml
-  — data/real.yml
- "*title" (codename title) type :phrase — data/real.yml
- "*credit" (codename credit) type :html — data/real.yml
- "*noindex" (codename noindex) type :list — data/real.yml

## Basket registrations

- `basket[:head_views] =` — card-mod-format-0.20.0/set/all/html/head.rb:1
- `basket[:cache_seed_names] += [` — card-mod-format-0.20.0/set/all/html/head.rb:7
- `basket[:head_views].map { |viewname| render viewname }.flatten.compact.join "\n"` — card-mod-format-0.20.0/set/all/html/head.rb:32

## Config keys

- `configurations` — card-mod-format-0.20.0/config/admin.yml
- `cardtypes` — card-mod-format-0.20.0/config/admin.yml
- `views` — card-mod-format-0.20.0/config/admin.yml
- `de` — card-mod-format-0.20.0/config/locales/de.yml
- `en` — card-mod-format-0.20.0/config/locales/en.yml
