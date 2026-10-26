# Decision 3 receipt: the port's set declarations, one line per recorded set

Branch port/setdsl-verify-20261026, cut at deploy/full-candidate-20261102
c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6. Generated from the installed
mod manifests' set definition data (src/card/mod-loader/mods/, the
DeckoModManifest setModules arrays the ModLoader loads) against the
recorded set definitions of the pinned gems
(C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems, card-1.110.0
mod/core/set plus every card-mod-*/set tree). Set identity is the
normalized set path (loader.rb#parts_from_path: extension and NN_
prefixes stripped per segment).

Counts: **405 port set-module declarations** across 31 installed mod
manifests (382 distinct set paths; 9 core set patterns). Recorded Ruby
side: 438 set files over 415 distinct sets (5 helper files excluded,
set_template.rb:47-53 `#! no set module` mark). **379 of the 415
recorded sets carry an equal port declaration; 36 do not** (each
dispositioned on its line). No computed set found (see
03-computed-set-search.md).

Format: `declaration name | set path | recorded set(s) | verdict`.
Verdicts: `equal` (declaration carries the recorded set, same
name/pattern, same junction membership), `equal (note)` (carried with
a recorded deviation note), `not-equal` (no port declaration; the
line's disposition says where the behavior lives or that it is a
finding).

| declaration | set path | recorded set(s) | verdict |
|---|---|---|---|
| none | abstract/account_dropdown | card-mod-layout-0.20.0 set/abstract/account_dropdown.rb | not-equal (method-only set module (Auth-dependent dropdown methods); card-mod-layout.ts header) |
| Abstract::AccountField (account) | abstract/account_field | card-mod-account-0.20.0 set/abstract/account_field.rb | equal |
| Abstract::AccountHolder (account) | abstract/account_holder | card-mod-account-0.20.0 set/abstract/account_holder.rb | equal |
| Abstract::AssetCoffeeScript (script) | abstract/asset_coffee_script | card-mod-script-0.20.0 set/abstract/04_asset_coffee_script.rb | equal |
| Abstract::AssetCss (style) | abstract/asset_css | card-mod-style-0.20.0 set/abstract/03_asset_css.rb | equal |
| Abstract::AssetFile (assets) | abstract/asset_file | card-mod-assets-0.20.0 set/abstract/asset_file.rb | equal |
| Abstract::AssetGroup (assets) | abstract/asset_group | card-mod-assets-0.20.0 set/abstract/asset_group.rb | equal |
| Abstract::AssetInputter (assets) | abstract/asset_inputter | card-mod-assets-0.20.0 set/abstract/asset_inputter.rb | equal |
| Abstract::AssetJavaScript (script) | abstract/asset_java_script | card-mod-script-0.20.0 set/abstract/03_asset_java_script.rb | equal |
| Abstract::AssetOutputter (assets) | abstract/asset_outputter | card-mod-assets-0.20.0 set/abstract/asset_outputter.rb | equal |
| Abstract::AssetScript (script) | abstract/asset_script | card-mod-script-0.20.0 set/abstract/01_asset_script.rb | equal |
| Abstract::AssetScss (style) | abstract/asset_scss | card-mod-style-0.20.0 set/abstract/03_asset_scss.rb | equal |
| Abstract::AssetStyle (style) | abstract/asset_style | card-mod-style-0.20.0 set/abstract/01_asset_style.rb | equal |
| Abstract::Attachment (carrierwave) | abstract/attachment | card-mod-carrierwave-0.20.0 set/abstract/attachment.rb | equal |
| Abstract::Attachment::Cloud (carrierwave) | abstract/attachment/cloud | card-mod-carrierwave-0.20.0 set/abstract/attachment/cloud.rb | equal |
| Abstract::Attachment::Coded (carrierwave) | abstract/attachment/coded | card-mod-carrierwave-0.20.0 set/abstract/attachment/coded.rb | equal |
| Abstract::Attachment::Local (carrierwave) | abstract/attachment/local | card-mod-carrierwave-0.20.0 set/abstract/attachment/local.rb | equal |
| Abstract::Attachment::Paths (carrierwave) | abstract/attachment/paths | card-mod-carrierwave-0.20.0 set/abstract/attachment/paths.rb | equal |
| Abstract::Attachment::StorageType (carrierwave) | abstract/attachment/storage_type | card-mod-carrierwave-0.20.0 set/abstract/attachment/01_storage_type.rb | equal |
| Abstract::Attachment::UploadCache (carrierwave) | abstract/attachment/upload_cache | card-mod-carrierwave-0.20.0 set/abstract/attachment/00_upload_cache.rb | equal |
| Abstract::Attachment::Web (carrierwave) | abstract/attachment/web | card-mod-carrierwave-0.20.0 set/abstract/attachment/web.rb | equal |
| Abstract::BootstrapCodeFile (bootstrap) | abstract/bootstrap_code_file | card-mod-bootstrap-0.20.0 set/abstract/bootstrap_code_file.rb | equal |
| Abstract::BsBadge (bootstrap) | abstract/bs_badge | card-mod-bootstrap-0.20.0 set/abstract/bs_badge.rb | equal |
| Abstract::CodeContent (content) | abstract/code_content | card-mod-content-0.20.0 set/abstract/01_code_content.rb | equal |
| Abstract::CodeFile (content) | abstract/code_file | card-mod-content-0.20.0 set/abstract/02_code_file.rb | equal |
| Abstract::CodenameList (list) | abstract/codename_list | card-mod-list-0.20.0 set/abstract/codename_list.rb | equal |
| Abstract::CoffeeScript (script) | abstract/coffee_script | card-mod-script-0.20.0 set/abstract/02_coffee_script.rb | equal |
| none | abstract/cql_search | card-mod-search-0.20.0 set/abstract/cql_search.rb | not-equal (method-only set module (CQL search semantics carried in src/card/render.ts runSearch); card-mod-search.ts header) |
| Abstract::Css (style) | abstract/css | card-mod-style-0.20.0 set/abstract/01_css.rb | equal |
| Abstract::Delist (list) | abstract/delist | card-mod-list-0.20.0 set/abstract/delist.rb | equal |
| Abstract::EmailField (email) | abstract/email_field | card-mod-email-0.20.0 set/abstract/email_field.rb | equal |
| Abstract::FolderGroup (assets) | abstract/folder_group | card-mod-assets-0.20.0 set/abstract/folder_group.rb | equal |
| Abstract::FollowOption (follow) | abstract/follow_option | card-mod-follow-0.20.0 set/abstract/follow_option.rb | equal |
| Abstract::HamlFile (content) | abstract/haml_file | card-mod-content-0.20.0 set/abstract/haml_file.rb | equal |
| Abstract::IdList (list) | abstract/id_list | card-mod-list-0.20.0 set/abstract/id_list.rb | equal |
| Abstract::Items (collection), Abstract::Items (layout) | abstract/items | card-mod-collection-0.20.0 set/abstract/items.rb; card-mod-layout-0.20.0 set/abstract/items.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| none | abstract/items/options_api | card-mod-layout-0.20.0 set/abstract/items/options_api.rb | not-equal (method-only set module (options rules); card-mod-layout.ts header) |
| Abstract::JavaScript (script) | abstract/java_script | card-mod-script-0.20.0 set/abstract/01_java_script.rb | equal |
| Abstract::JsonldSupport (format) | abstract/jsonld_support | card-mod-format-0.20.0 set/abstract/jsonld_support.rb | equal |
| Abstract::List (list) | abstract/list | card-mod-layout-0.20.0 set/abstract/list.rb; card-mod-list-0.20.0 set/abstract/01_list.rb | equal (carried by the list manifest; recorded in the layout/list gem) |
| Abstract::List::Events (list) | abstract/list/events | card-mod-list-0.20.0 set/abstract/01_list/events.rb | equal |
| Abstract::List::HtmlViews (list) | abstract/list/html_views | card-mod-list-0.20.0 set/abstract/01_list/html_views.rb | equal |
| Abstract::List::OtherViews (list) | abstract/list/other_views | card-mod-list-0.20.0 set/abstract/01_list/other_views.rb | equal |
| Abstract::LocalManifestGroup (assets) | abstract/local_manifest_group | card-mod-assets-0.20.0 set/abstract/local_manifest_group.rb | equal |
| Abstract::Lock (content) | abstract/lock | card-mod-content-0.20.0 set/abstract/lock.rb | equal |
| Abstract::ManifestGroup (assets) | abstract/manifest_group | card-mod-assets-0.20.0 set/abstract/01_manifest_group.rb | equal |
| none | abstract/media | card-mod-bar_and_box-0.20.0 set/abstract/media.rb | not-equal (bar_and_box has no manifest; the captured media-snippet bytes ride src/card/render/views.ts:5101 (card-mod-bar_and_box set/abstract/media.rb + media_snippet.haml)) |
| Abstract::ModAssets (assets) | abstract/mod_assets | card-mod-assets-0.20.0 set/abstract/mod_assets.rb | equal |
| Abstract::Paging (collection) | abstract/paging | card-mod-collection-0.20.0 set/abstract/paging.rb | equal |
| Abstract::Paging::PagingViews (collection) | abstract/paging/paging_views | card-mod-collection-0.20.0 set/abstract/paging/paging_views.rb | equal |
| Abstract::Permission (permissions) | abstract/permission | card-mod-permissions-0.20.0 set/abstract/permission.rb | equal |
| Abstract::ProgressBar (bootstrap) | abstract/progress_bar | card-mod-bootstrap-0.20.0 set/abstract/progress_bar.rb | equal |
| Abstract::ReadOnly (content) | abstract/read_only | card-mod-content-0.20.0 set/abstract/read_only.rb | equal |
| Abstract::RecaptchaSetting (recaptcha) | abstract/recaptcha_setting | card-mod-recaptcha-0.20.0 set/abstract/recaptcha_setting.rb | equal |
| Abstract::ReferenceList (list) | abstract/reference_list | card-mod-list-0.20.0 set/abstract/reference_list.rb | equal |
| Abstract::Script (script) | abstract/script | card-mod-script-0.20.0 set/abstract/00_script.rb | equal |
| Abstract::ScriptGroup (script) | abstract/script_group | card-mod-script-0.20.0 set/abstract/script_group.rb | equal |
| Abstract::Scss (style) | abstract/scss | card-mod-style-0.20.0 set/abstract/02_scss.rb | equal |
| Abstract::Search (search) | abstract/search | card-mod-search-0.20.0 set/abstract/0_search.rb | equal |
| none | abstract/search/search_params | card-mod-search-0.20.0 set/abstract/0_search/search_params.rb | not-equal (no disposition) |
| Abstract::Search::Views (search) | abstract/search/views | card-mod-search-0.20.0 set/abstract/0_search/views.rb | equal |
| Abstract::SearchViews (search) | abstract/search_views | card-mod-search-0.20.0 set/abstract/search_views.rb | equal |
| Abstract::SkinBox (style) | abstract/skin_box | card-mod-style-0.20.0 set/abstract/skin_box.rb | equal |
| Abstract::SkinField (bootstrap) | abstract/skin_field | card-mod-bootstrap-0.20.0 set/abstract/skin_field.rb | equal |
| Abstract::Sources (content) | abstract/sources | card-mod-content-0.20.0 set/abstract/00_sources.rb | equal |
| Abstract::StyleGroup (style) | abstract/style_group | card-mod-style-0.20.0 set/abstract/style_group.rb | equal |
| Abstract::Tabs (tabs) | abstract/tabs | card-mod-tabs-0.20.0 set/abstract/tabs.rb | equal |
| Abstract::TaskTable (core) | abstract/task_table | card-1.110.0 set/abstract/task_table.rb | equal |
| Abstract::TemplatedNests (content) | abstract/templated_nests | card-mod-content-0.20.0 set/abstract/templated_nests.rb | equal |
| Abstract::TestContext (email) | abstract/test_context | card-mod-email-0.20.0 set/abstract/test_context.rb | equal |
| none | abstract/type_index | card-mod-search-0.20.0 set/abstract/type_index.rb | not-equal (method-only set module (no registration surface); card-mod-search.ts header) |
| Abstract::VirtualCache (virtual) | abstract/virtual_cache | card-mod-virtual-0.20.0 set/abstract/virtual_cache.rb | equal |
| none | abstract/virtual_search | card-mod-search-0.20.0 set/abstract/virtual_search.rb | not-equal (method-only set module (no registration surface); card-mod-search.ts header) |
| Abstract::VirtualSet (rules) | abstract/virtual_set | card-mod-rules-0.20.0 set/abstract/virtual_set.rb | equal |
| All::Account (account) | all/account | card-mod-account-0.20.0 set/all/account.rb | equal |
| All::AceEditor (ace_editor) | all/ace_editor | card-mod-ace_editor-0.20.0 set/all/ace_editor.rb | equal |
| All::Admin (core) | all/admin | card-1.110.0 set/all/admin.rb | equal |
| none | all/alert | card-mod-layout-0.20.0 set/all/alert.rb | not-equal (method-only set module (alert helper methods); the helper's emitted bytes are carried in core-mod.ts and card-mod-edit.ts alert markup) |
| All::AssignAttributes (core) | all/assign_attributes | card-1.110.0 set/all/assign_attributes.rb | equal |
| All::Autocomplete (search) | all/autocomplete | card-mod-search-0.20.0 set/all/autocomplete.rb | equal |
| All::Autoname (core) | all/autoname | card-1.110.0 set/all/autoname.rb | equal |
| none | all/bar | card-mod-bar_and_box-0.20.0 set/all/bar.rb | not-equal (bar_and_box has no manifest; its :bar/:open/:closed view bytes are compiled into the engine seed tables (src/card/render/views.ts, citing card-mod-bar_and_box set/all/bar.rb; src/card/mod-loader/default-mod-deck.ts header)) |
| All::Base (format) | all/base | card-mod-format-0.20.0 set/all/base.rb | equal |
| All::Board (edit) | all/board | card-mod-edit-0.20.0 set/all/board.rb | equal |
| All::Board::BoardPills (edit) | all/board/board_pills | card-mod-edit-0.20.0 set/all/board/board_pills.rb | equal |
| All::Board::FollowSection (edit) | all/board/follow_section | card-mod-edit-0.20.0 set/all/board/follow_section.rb | equal |
| All::Board::RelatedSection (edit) | all/board/related_section | card-mod-edit-0.20.0 set/all/board/related_section.rb | equal |
| All::Board::TabViews (edit) | all/board/tab_views | card-mod-edit-0.20.0 set/all/board/tab_views.rb | equal |
| All::Board::TabVisibility (edit) | all/board/tab_visibility | card-mod-edit-0.20.0 set/all/board/tab_visibility.rb | equal |
| All::Bootstrap (bootstrap) | all/bootstrap | card-mod-bootstrap-0.20.0 set/all/bootstrap.rb | equal |
| All::Bootstrap::Accordion (bootstrap) | all/bootstrap/accordion | card-mod-bootstrap-0.20.0 set/all/bootstrap/accordion.rb | equal |
| All::Bootstrap::Carousel (bootstrap) | all/bootstrap/carousel | card-mod-bootstrap-0.20.0 set/all/bootstrap/carousel.rb | equal |
| All::Bootstrap::Dropdown (bootstrap) | all/bootstrap/dropdown | card-mod-bootstrap-0.20.0 set/all/bootstrap/dropdown.rb | equal |
| All::Bootstrap::Form (bootstrap) | all/bootstrap/form | card-mod-bootstrap-0.20.0 set/all/bootstrap/form.rb | equal |
| All::Bootstrap::Helper (bootstrap) | all/bootstrap/helper | card-mod-bootstrap-0.20.0 set/all/bootstrap/helper.rb | equal |
| All::Bootstrap::Icon (bootstrap) | all/bootstrap/icon | card-mod-bootstrap-0.20.0 set/all/bootstrap/icon.rb | equal |
| All::Bootstrap::Navbar (bootstrap) | all/bootstrap/navbar | card-mod-bootstrap-0.20.0 set/all/bootstrap/navbar.rb | equal |
| All::Bootstrap::Table (bootstrap) | all/bootstrap/table | card-mod-bootstrap-0.20.0 set/all/bootstrap/table.rb | equal |
| All::Bootstrap::Wrapper (bootstrap) | all/bootstrap/wrapper | card-mod-bootstrap-0.20.0 set/all/bootstrap/wrapper.rb | equal |
| none | all/box | card-mod-bar_and_box-0.20.0 set/all/box.rb | not-equal (bar_and_box has no manifest; :box view bytes compiled into the engine seed tables (src/card/render/views.ts; default-mod-deck.ts header)) |
| All::Calendar (date) | all/calendar | card-mod-date-0.20.0 set/all/calendar.rb | equal |
| All::CardtypeGroups (rules) | all/cardtype_groups | card-mod-rules-0.20.0 set/all/cardtype_groups.rb | equal |
| All::Chunk (content) | all/chunk | card-mod-content-0.20.0 set/all/chunk.rb | equal |
| All::Codename (core) | all/codename | card-1.110.0 set/all/codename.rb | equal |
| All::Comment (comment) | all/comment | card-mod-comment-0.20.0 set/all/comment.rb | equal |
| All::Content (core), All::Content (format) | all/content | card-1.110.0 set/all/content.rb; card-mod-format-0.20.0 set/all/content.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| All::ContextualContent (content) | all/contextual_content | card-mod-content-0.20.0 set/all/contextual_content.rb | equal |
| All::Css (format) | all/css | card-mod-format-0.20.0 set/all/css.rb | equal |
| All::Csv (format) | all/csv | card-mod-format-0.20.0 set/all/csv.rb | equal |
| All::Data (format) | all/data | card-mod-format-0.20.0 set/all/data.rb | equal |
| All::Debug (core) | all/debug | card-1.110.0 set/all/debug.rb; card-mod-monkey-0.20.0 set/all/debug.rb | equal (carried by the core manifest for core's own set/all/debug.rb (to_s/inspect); card-mod-monkey's contributor file at the same path (view :debug, introspection methods) has NO port carrier - a finding (02-membership-comparison.md)) |
| All::Demo (format) | all/demo | card-mod-format-0.20.0 set/all/demo.rb | equal |
| All::EditContent (edit) | all/edit_content | card-mod-edit-0.20.0 set/all/edit_content.rb | equal |
| All::EditInline (edit) | all/edit_inline | card-mod-edit-0.20.0 set/all/edit_inline.rb | equal |
| All::EditName (edit) | all/edit_name | card-mod-edit-0.20.0 set/all/edit_name.rb | equal |
| All::EditType (edit) | all/edit_type | card-mod-edit-0.20.0 set/all/edit_type.rb | equal |
| All::Editing (edit) | all/editing | card-mod-edit-0.20.0 set/all/editing.rb | equal |
| All::Editor (edit) | all/editor | card-mod-edit-0.20.0 set/all/editor.rb | equal |
| All::EmailHtml (email) | all/email_html | card-mod-email-0.20.0 set/all/email_html.rb | equal |
| All::EmailText (email) | all/email_text | card-mod-email-0.20.0 set/all/email_text.rb | equal |
| All::Error (format) | all/error | card-mod-format-0.20.0 set/all/error.rb | equal |
| none | all/event_viz | card-mod-monkey-0.20.0 set/all/event_viz.rb | not-equal (NOT CARRIED (finding): card-mod-monkey has no port manifest and no carrier was found for this set module anywhere in the port tree) |
| All::File (format) | all/file | card-mod-format-0.20.0 set/all/file.rb | equal |
| All::FileUtils (carrierwave) | all/file_utils | card-mod-carrierwave-0.20.0 set/all/file_utils.rb | equal |
| All::Follow (follow) | all/follow | card-mod-follow-0.20.0 set/all/follow.rb | equal |
| All::Follow::FollowLinkViews (follow) | all/follow/follow_link_views | card-mod-follow-0.20.0 set/all/follow/follow_link_views.rb | equal |
| All::Follow::FollowedBy (follow) | all/follow/followed_by | card-mod-follow-0.20.0 set/all/follow/followed_by.rb | equal |
| All::Follow::FollowerIds (follow) | all/follow/follower_ids | card-mod-follow-0.20.0 set/all/follow/follower_ids.rb | equal |
| All::Form (edit) | all/form | card-mod-edit-0.20.0 set/all/form.rb | equal |
| All::FormButtons (edit) | all/form_buttons | card-mod-edit-0.20.0 set/all/form_buttons.rb | equal |
| All::FormElements (edit) | all/form_elements | card-mod-edit-0.20.0 set/all/form_elements.rb | equal |
| All::Formgroup (edit) | all/formgroup | card-mod-edit-0.20.0 set/all/formgroup.rb | equal |
| All::Guide (help) | all/guide | card-mod-help-0.20.0 set/all/guide.rb | equal |
| All::Haml (format) | all/haml | card-mod-format-0.20.0 set/all/haml.rb | equal |
| All::HeadJavascript (script) | all/head_javascript | card-mod-script-0.20.0 set/all/head_javascript.rb | equal |
| All::Help (help) | all/help | card-mod-help-0.20.0 set/all/help.rb | equal |
| All::History (history) | all/history | card-mod-history-0.20.0 set/all/history.rb | equal |
| All::History::ActListing (history) | all/history/act_listing | card-mod-history-0.20.0 set/all/history/act_listing.rb | equal |
| All::History::Actions (history) | all/history/actions | card-mod-history-0.20.0 set/all/history/actions.rb | equal |
| All::History::Acts (history) | all/history/acts | card-mod-history-0.20.0 set/all/history/acts.rb | equal |
| All::History::Events (history) | all/history/events | card-mod-history-0.20.0 set/all/history/events.rb | equal |
| All::History::Export (history) | all/history/export | card-mod-history-0.20.0 set/all/history/export.rb | equal |
| All::History::Last (history) | all/history/last | card-mod-history-0.20.0 set/all/history/last.rb | equal |
| All::History::Revision (history) | all/history/revision | card-mod-history-0.20.0 set/all/history/revision.rb | equal |
| All::History::Selected (history) | all/history/selected | card-mod-history-0.20.0 set/all/history/selected.rb | equal |
| All::History::Views (history) | all/history/views | card-mod-history-0.20.0 set/all/history/views.rb | equal |
| All::HistoryBoard (history) | all/history_board | card-mod-history-0.20.0 set/all/history_board.rb | equal |
| All::Html (format) | all/html | card-mod-format-0.20.0 set/all/html.rb | equal |
| All::Html::Error (format) | all/html/error | card-mod-format-0.20.0 set/all/html/error.rb | equal |
| All::Html::Frame (format) | all/html/frame | card-mod-format-0.20.0 set/all/html/frame.rb | equal |
| All::Html::Head (format) | all/html/head | card-mod-format-0.20.0 set/all/html/head.rb | equal |
| All::Html::Header (format) | all/html/header | card-mod-format-0.20.0 set/all/html/header.rb | equal |
| All::Html::Menu (format) | all/html/menu | card-mod-format-0.20.0 set/all/html/menu.rb | equal |
| All::Html::Show (format) | all/html/show | card-mod-format-0.20.0 set/all/html/show.rb | equal |
| All::Html::Views (format) | all/html/views | card-mod-format-0.20.0 set/all/html/views.rb | equal |
| All::Html::Wrap (format) | all/html/wrap | card-mod-format-0.20.0 set/all/html/wrap.rb | equal |
| All::Initialize (core) | all/initialize | card-1.110.0 set/all/initialize.rb | equal |
| All::Item (collection) | all/item | card-mod-collection-0.20.0 set/all/item.rb | equal |
| All::ItemAssignment (collection) | all/item_assignment | card-mod-collection-0.20.0 set/all/item_assignment.rb | equal |
| All::Js (format) | all/js | card-mod-format-0.20.0 set/all/js.rb | equal |
| All::Json (format) | all/json | card-mod-format-0.20.0 set/all/json.rb | equal |
| All::Jsonld (format) | all/jsonld | card-mod-format-0.20.0 set/all/jsonld.rb | equal |
| none | all/layouts | card-mod-layout-0.20.0 set/all/layouts.rb | not-equal (layout DSL registrations (code-layout registry) with no TS consumer; card-mod-layout.ts header) |
| All::Links (format) | all/links | card-mod-format-0.20.0 set/all/links.rb | equal |
| All::LocationHistory (session) | all/location_history | card-mod-session-0.20.0 set/all/location_history.rb | equal |
| All::Modal (layout) | all/modal | card-mod-layout-0.20.0 set/all/modal.rb | equal |
| All::NameEvents (core) | all/name_events | card-1.110.0 set/all/name_events.rb | equal |
| All::NavbarLinks (layout) | all/navbar_links | card-mod-layout-0.20.0 set/all/navbar_links.rb | equal |
| All::New (edit) | all/new | card-mod-edit-0.20.0 set/all/new.rb | equal |
| All::Notify (follow) | all/notify | card-mod-follow-0.20.0 set/all/notify.rb | equal |
| All::Notify::BaseViews (follow) | all/notify/base_views | card-mod-follow-0.20.0 set/all/notify/base_views.rb | equal |
| All::Notify::HtmlViews (follow) | all/notify/html_views | card-mod-follow-0.20.0 set/all/notify/html_views.rb | equal |
| All::Observer (integrate) | all/observer | card-mod-integrate-0.20.0 set/all/observer.rb | equal |
| All::Overlay (layout) | all/overlay | card-mod-layout-0.20.0 set/all/overlay.rb | equal |
| All::OverlayGuide (edit) | all/overlay_guide | card-mod-edit-0.20.0 set/all/overlay_guide.rb | equal |
| All::PasswordInput (account) | all/password_input | card-mod-account-0.20.0 set/all/password_input.rb | equal |
| All::Path (format) | all/path | card-mod-format-0.20.0 set/all/path.rb | equal |
| All::Permissions (permissions) | all/permissions | card-mod-permissions-0.20.0 set/all/permissions.rb | equal |
| none | all/process_layout | card-mod-layout-0.20.0 set/all/process_layout.rb | not-equal (process_layout's basket[:cache_seed_names] write has no TS consumer; card-mod-layout.ts header) |
| All::Recaptcha (recaptcha) | all/recaptcha | card-mod-recaptcha-0.20.0 set/all/recaptcha.rb | equal |
| All::Recursed (collection) | all/recursed | card-mod-collection-0.20.0 set/all/recursed.rb | equal |
| All::ReferenceEditor (tinymce_editor) | all/reference_editor | card-mod-tinymce_editor-0.20.0 set/all/reference_editor.rb | equal |
| All::ReferenceEditor::LinkEditor (tinymce_editor) | all/reference_editor/link_editor | card-mod-tinymce_editor-0.20.0 set/all/reference_editor/link_editor.rb | equal |
| All::ReferenceEditor::NestEditor (tinymce_editor) | all/reference_editor/nest_editor | card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor.rb | equal |
| All::ReferenceEditor::NestEditor::NestEditorOptions (tinymce_editor) | all/reference_editor/nest_editor/nest_editor_options | card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor/nest_editor_options.rb | equal |
| All::ReferenceEditor::NestEditor::NestEditorTabs (tinymce_editor) | all/reference_editor/nest_editor/nest_editor_tabs | card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor/nest_editor_tabs.rb | equal |
| All::ReferenceEditor::NestImage (tinymce_editor) | all/reference_editor/nest_image | card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_image.rb | equal |
| All::ReferenceEvents (core) | all/reference_events | card-1.110.0 set/all/reference_events.rb | equal |
| All::RelatedSets (rules) | all/related_sets | card-mod-rules-0.20.0 set/all/related_sets.rb | equal |
| All::Result (core) | all/result | card-1.110.0 set/all/result.rb | equal |
| All::Rss (format) | all/rss | card-mod-format-0.20.0 set/all/rss.rb | equal |
| All::SetSelect (rules) | all/set_select | card-mod-rules-0.20.0 set/all/set_select.rb | equal |
| All::States (core) | all/states | card-1.110.0 set/all/states.rb | equal |
| All::Subcards (core) | all/subcards | card-1.110.0 set/all/subcards.rb | equal |
| All::SupportsContentOptions (list) | all/supports_content_options | card-mod-list-0.20.0 set/all/supports_content_options.rb | equal |
| All::Tabs (tabs) | all/tabs | card-mod-tabs-0.20.0 set/all/tabs.rb | equal |
| All::TemplateNest (edit) | all/template_nest | card-mod-edit-0.20.0 set/all/template_nest.rb | equal |
| All::Templating (content) | all/templating | card-mod-content-0.20.0 set/all/templating.rb | equal |
| All::Text (format) | all/text | card-mod-format-0.20.0 set/all/text.rb | equal |
| All::TinymceEditor (tinymce_editor) | all/tinymce_editor | card-mod-tinymce_editor-0.20.0 set/all/tinymce_editor.rb | equal |
| All::Title (format) | all/title | card-mod-format-0.20.0 set/all/title.rb | equal |
| All::Trash (core) | all/trash | card-1.110.0 set/all/trash.rb | equal |
| All::Type (core) | all/type | card-1.110.0 set/all/type.rb | equal |
| All::UpdateReadRules (permissions) | all/update_read_rules | card-mod-permissions-0.20.0 set/all/update_read_rules.rb | equal |
| All::Utils (core) | all/utils | card-1.110.0 set/all/utils.rb | equal |
| none | all/view_viz | card-mod-monkey-0.20.0 set/all/view_viz.rb | not-equal (NOT CARRIED (finding): card-mod-monkey has no port manifest and no carrier was found for this set module anywhere in the port tree) |
| All::Yaml (format) | all/yaml | card-mod-format-0.20.0 set/all/yaml.rb | equal |
| Right::Account (account), Right::Account (api_key), Right::Account (follow) | right/account | card-mod-account-0.20.0 set/right/account.rb; card-mod-api_key-0.20.0 set/right/account.rb; card-mod-follow-0.20.0 set/right/account.rb | equal (declared once per contributing mod, as Ruby's one set module collects 3 files) |
| Right::Account::Events (account) | right/account/events | card-mod-account-0.20.0 set/right/account/events.rb | equal |
| Right::Account::Views (account) | right/account/views | card-mod-account-0.20.0 set/right/account/views.rb | equal |
| Right::ApiKey (api_key) | right/api_key | card-mod-api_key-0.20.0 set/right/api_key.rb | equal |
| Right::AssetInput (assets) | right/asset_input | card-mod-assets-0.20.0 set/right/asset_input.rb | equal |
| Right::AssetOutput (assets) | right/asset_output | card-mod-assets-0.20.0 set/right/asset_output.rb | equal |
| Right::Autoname (core) | right/autoname | card-1.110.0 set/right/autoname.rb | equal |
| Right::Bcc (email) | right/bcc | card-mod-email-0.20.0 set/right/bcc.rb | equal |
| none | right/by_create | card-mod-search-0.20.0 set/right/by_create.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/by_name | card-mod-search-0.20.0 set/right/by_name.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/by_update | card-mod-search-0.20.0 set/right/by_update.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Captcha (recaptcha) | right/captcha | card-mod-recaptcha-0.20.0 set/right/captcha.rb | equal |
| Right::Cc (email) | right/cc | card-mod-email-0.20.0 set/right/cc.rb | equal |
| none | right/children | card-mod-search-0.20.0 set/right/children.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Comment (comment) | right/comment | card-mod-comment-0.20.0 set/right/comment.rb | equal |
| Right::ContentOptionView (list) | right/content_option_view | card-mod-list-0.20.0 set/right/content_option_view.rb | equal |
| Right::ContentOptions (list) | right/content_options | card-mod-list-0.20.0 set/right/content_options.rb | equal |
| Right::ContextualClass (follow) | right/contextual_class | card-mod-follow-0.20.0 set/right/contextual_class.rb | equal |
| none | right/count | card-mod-search-0.20.0 set/right/count.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Create (permissions) | right/create | card-mod-permissions-0.20.0 set/right/create.rb | equal |
| none | right/created | card-mod-search-0.20.0 set/right/created.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/creator | card-mod-search-0.20.0 set/right/creator.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Default (content) | right/default | card-mod-content-0.20.0 set/right/default.rb | equal |
| Right::Delete (permissions) | right/delete | card-mod-permissions-0.20.0 set/right/delete.rb | equal |
| Right::Disappear (follow) | right/disappear | card-mod-follow-0.20.0 set/right/disappear.rb | equal |
| Right::Discussion (comment) | right/discussion | card-mod-comment-0.20.0 set/right/discussion.rb | equal |
| none | right/edited | card-mod-search-0.20.0 set/right/edited.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/editors | card-mod-search-0.20.0 set/right/editors.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Email (account) | right/email | card-mod-account-0.20.0 set/right/email.rb | equal |
| Right::EnabledRoles (layout) | right/enabled_roles | card-mod-layout-0.20.0 set/right/enabled_roles.rb | equal |
| Right::Follow (follow) | right/follow | card-mod-follow-0.20.0 set/right/follow.rb | equal |
| Right::FollowFields (follow) | right/follow_fields | card-mod-follow-0.20.0 set/right/follow_fields.rb | equal |
| Right::Followers (follow) | right/followers | card-mod-follow-0.20.0 set/right/followers.rb | equal |
| Right::Following (follow) | right/following | card-mod-follow-0.20.0 set/right/following.rb | equal |
| Right::From (email) | right/from | card-mod-email-0.20.0 set/right/from.rb | equal |
| Right::GroupRemote (assets) | right/group_remote | card-mod-assets-0.20.0 set/right/group_remote.rb | equal |
| none | right/guide | card-mod-help-0.20.0 set/right/guide.rb | not-equal (method-only set module (raw_help_text method, card-mod-help set/right/guide.rb:3-7); card-mod-help.ts header) |
| Right::Head (format), Right::Head (layout) | right/head | card-mod-format-0.20.0 set/right/head.rb; card-mod-layout-0.20.0 set/right/head.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Right::Help (help) | right/help | card-mod-help-0.20.0 set/right/help.rb | equal |
| Right::HtmlMessage (email) | right/html_message | card-mod-email-0.20.0 set/right/html_message.rb | equal |
| Right::InputType (edit) | right/input_type | card-mod-edit-0.20.0 set/right/input_type.rb | equal |
| none | right/last_edited | card-mod-search-0.20.0 set/right/last_edited.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Layout (layout) | right/layout | card-mod-layout-0.20.0 set/right/layout.rb | equal |
| none | right/linked_to_by | card-mod-search-0.20.0 set/right/linked_to_by.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/links_to | card-mod-search-0.20.0 set/right/links_to.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/mates | card-mod-search-0.20.0 set/right/mates.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Message (follow) | right/message | card-mod-follow-0.20.0 set/right/message.rb | equal |
| none | right/nested_by | card-mod-search-0.20.0 set/right/nested_by.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/nests | card-mod-search-0.20.0 set/right/nests.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::OnCreate (integrate) | right/on_create | card-mod-integrate-0.20.0 set/right/on_create.rb | equal |
| Right::OnDelete (integrate) | right/on_delete | card-mod-integrate-0.20.0 set/right/on_delete.rb | equal |
| Right::OnUpdate (integrate) | right/on_update | card-mod-integrate-0.20.0 set/right/on_update.rb | equal |
| Right::Password (account) | right/password | card-mod-account-0.20.0 set/right/password.rb | equal |
| Right::Read (permissions) | right/read | card-mod-permissions-0.20.0 set/right/read.rb | equal |
| none | right/referred_to_by | card-mod-search-0.20.0 set/right/referred_to_by.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| none | right/refers_to | card-mod-search-0.20.0 set/right/refers_to.rb | not-equal (method-only set module (virtual-search cql_content/raw_help_text methods); card-mod-search.ts header) |
| Right::Right (rules) | right/right | card-mod-rules-0.20.0 set/right/right.rb | equal |
| Right::Roles (account) | right/roles | card-mod-account-0.20.0 set/right/roles.rb | equal |
| Right::Salt (account) | right/salt | card-mod-account-0.20.0 set/right/salt.rb | equal |
| Right::Script (script) | right/script | card-mod-script-0.20.0 set/right/script.rb | equal |
| Right::SecretKey (recaptcha) | right/secret_key | card-mod-recaptcha-0.20.0 set/right/secret_key.rb | equal |
| Right::Self (rules) | right/self | card-mod-rules-0.20.0 set/right/self.rb | equal |
| Right::SiteKey (recaptcha) | right/site_key | card-mod-recaptcha-0.20.0 set/right/site_key.rb | equal |
| Right::Status (account) | right/status | card-mod-account-0.20.0 set/right/status.rb | equal |
| Right::Structure (content) | right/structure | card-mod-content-0.20.0 set/right/structure.rb | equal |
| Right::Subject (email) | right/subject | card-mod-email-0.20.0 set/right/subject.rb | equal |
| Right::TextMessage (email) | right/text_message | card-mod-email-0.20.0 set/right/text_message.rb | equal |
| Right::Thanks (edit) | right/thanks | card-mod-edit-0.20.0 set/right/thanks.rb | equal |
| Right::To (email) | right/to | card-mod-email-0.20.0 set/right/to.rb | equal |
| Right::Type (rules) | right/type | card-mod-rules-0.20.0 set/right/type.rb | equal |
| Right::TypePlusRight (rules) | right/type_plus_right | card-mod-rules-0.20.0 set/right/type_plus_right.rb | equal |
| Right::Update (permissions) | right/update | card-mod-permissions-0.20.0 set/right/update.rb | equal |
| Right::WhenCreated (date) | right/when_created | card-mod-date-0.20.0 set/right/when_created.rb | equal |
| Right::WhenLastEdited (date) | right/when_last_edited | card-mod-date-0.20.0 set/right/when_last_edited.rb | equal |
| Rstar::RuleUser (rules) | rstar/rule_user | card-mod-rules-0.20.0 set/rstar/rule_user.rb | equal |
| Rule::BarView (rules) | rule/bar_view | card-mod-rules-0.20.0 set/rule/bar_view.rb | equal |
| Rule::BoardRulesEditor (rules) | rule/board_rules_editor | card-mod-rules-0.20.0 set/rule/board_rules_editor.rb | equal |
| Rule::Editor (rules) | rule/editor | card-mod-rules-0.20.0 set/rule/editor.rb | equal |
| Rule::HtmlViews (rules) | rule/html_views | card-mod-rules-0.20.0 set/rule/html_views.rb | equal |
| Rule::QuickEditor (rules) | rule/quick_editor | card-mod-rules-0.20.0 set/rule/quick_editor.rb | equal |
| Rule::RuleForm (rules) | rule/rule_form | card-mod-rules-0.20.0 set/rule/rule_form.rb | equal |
| Rule::RuleForm::Buttons (rules) | rule/rule_form/buttons | card-mod-rules-0.20.0 set/rule/rule_form/buttons.rb | equal |
| Rule::RuleForm::SetSelection (rules) | rule/rule_form/set_selection | card-mod-rules-0.20.0 set/rule/rule_form/set_selection.rb | equal |
| Rule::Rules (rules) | rule/rules | card-mod-rules-0.20.0 set/rule/rules.rb | equal |
| Self::AccountLinks (layout) | self/account_links | card-mod-layout-0.20.0 set/self/account_links.rb | equal |
| Self::Ace (ace_editor) | self/ace | card-mod-ace_editor-0.20.0 set/self/ace.rb | equal |
| Self::Admin (core), Self::Admin (carrierwave), Self::Admin (recaptcha) | self/admin | card-1.110.0 set/self/admin.rb; card-mod-carrierwave-0.20.0 set/self/admin.rb; card-mod-recaptcha-0.20.0 set/self/admin.rb | equal (declared once per contributing mod, as Ruby's one set module collects 3 files) |
| Self::Alerts (layout) | self/alerts | card-mod-layout-0.20.0 set/self/alerts.rb | equal |
| Self::Always (follow) | self/always | card-mod-follow-0.20.0 set/self/always.rb | equal |
| Self::Anonymous (account) | self/anonymous | card-mod-account-0.20.0 set/self/anonymous.rb | equal |
| Self::Autoname (core) | self/autoname | card-1.110.0 set/self/autoname.rb | equal |
| Self::BootstrapCore (bootstrap) | self/bootstrap_core | card-mod-bootstrap-0.20.0 set/self/bootstrap_core.rb | equal |
| Self::BootstrapFunctions (bootstrap) | self/bootstrap_functions | card-mod-bootstrap-0.20.0 set/self/bootstrap_functions.rb | equal |
| Self::Captcha (recaptcha) | self/captcha | card-mod-recaptcha-0.20.0 set/self/captcha.rb | equal |
| Self::Cardtype (rules) | self/cardtype | card-mod-rules-0.20.0 set/self/cardtype.rb | equal |
| Self::ContentOptionView (list) | self/content_option_view | card-mod-list-0.20.0 set/self/content_option_view.rb | equal |
| Self::ContentOptions (list) | self/content_options | card-mod-list-0.20.0 set/self/content_options.rb | equal |
| Self::Create (permissions) | self/create | card-mod-permissions-0.20.0 set/self/create.rb | equal |
| Self::Created (follow) | self/created | card-mod-follow-0.20.0 set/self/created.rb | equal |
| Self::DeckoBot (account) | self/decko_bot | card-mod-account-0.20.0 set/self/decko_bot.rb | equal |
| Self::Default (content) | self/default | card-mod-content-0.20.0 set/self/default.rb | equal |
| Self::Delete (permissions) | self/delete | card-mod-permissions-0.20.0 set/self/delete.rb | equal |
| Self::DropdownDivider (layout) | self/dropdown_divider | card-mod-layout-0.20.0 set/self/dropdown_divider.rb | equal |
| Self::Edited (follow) | self/edited | card-mod-follow-0.20.0 set/self/edited.rb | equal |
| Self::Favicon (carrierwave) | self/favicon | card-mod-carrierwave-0.20.0 set/self/favicon.rb | equal |
| Self::Follow (follow) | self/follow | card-mod-follow-0.20.0 set/self/follow.rb | equal |
| Self::FollowDefaults (follow) | self/follow_defaults | card-mod-follow-0.20.0 set/self/follow_defaults.rb | equal |
| Self::FollowFields (follow) | self/follow_fields | card-mod-follow-0.20.0 set/self/follow_fields.rb | equal |
| Self::Foot (layout) | self/foot | card-mod-layout-0.20.0 set/self/foot.rb | equal |
| Self::Guide (help) | self/guide | card-mod-help-0.20.0 set/self/guide.rb | equal |
| Self::Head (layout) | self/head | card-mod-layout-0.20.0 set/self/head.rb | equal |
| Self::Help (help) | self/help | card-mod-help-0.20.0 set/self/help.rb | equal |
| Self::Home (format) | self/home | card-mod-format-0.20.0 set/self/home.rb | equal |
| Self::InputType (edit) | self/input_type | card-mod-edit-0.20.0 set/self/input_type.rb | equal |
| Self::InputType::Right::ContentOptions (list) | self/input_type/right/content_options | card-mod-list-0.20.0 set/self/input_type/right/content_options.rb | equal |
| Self::Layout (layout) | self/layout | card-mod-layout-0.20.0 set/self/layout.rb | equal |
| none | self/layout_options | card-mod-layout-0.20.0 set/self/layout_options.rb | not-equal (method-only set module (item_names method); card-mod-layout.ts header) |
| Self::Mod (core) | self/mod | card-1.110.0 set/self/mod.rb | equal |
| Self::Never (follow) | self/never | card-mod-follow-0.20.0 set/self/never.rb | equal |
| Self::NewFile (carrierwave) | self/new_file | card-mod-carrierwave-0.20.0 set/self/new_file.rb | equal |
| Self::NewImage (carrierwave) | self/new_image | card-mod-carrierwave-0.20.0 set/self/new_image.rb | equal |
| Self::Now (date) | self/now | card-mod-date-0.20.0 set/self/now.rb | equal |
| Self::OnCreate (integrate) | self/on_create | card-mod-integrate-0.20.0 set/self/on_create.rb | equal |
| Self::OnDelete (integrate) | self/on_delete | card-mod-integrate-0.20.0 set/self/on_delete.rb | equal |
| Self::OnUpdate (integrate) | self/on_update | card-mod-integrate-0.20.0 set/self/on_update.rb | equal |
| Self::Read (permissions) | self/read | card-mod-permissions-0.20.0 set/self/read.rb | equal |
| Self::RecaptchaSettings (recaptcha) | self/recaptcha_settings | card-mod-recaptcha-0.20.0 set/self/recaptcha_settings.rb | equal |
| none | self/recent | card-mod-search-0.20.0 set/self/recent.rb | not-equal (method-only set module; its feed_item_description view byte is ported as rssItemDescriptionView (card-mod-format.ts:2262); card-mod-search.ts header) |
| Self::RecentSettings (rules) | self/recent_settings | card-mod-rules-0.20.0 set/self/recent_settings.rb | equal |
| Self::Role (account) | self/role | card-mod-account-0.20.0 set/self/role.rb | equal |
| Self::Script (script) | self/script | card-mod-script-0.20.0 set/self/script.rb | equal |
| Self::Search (search), Self::Search (carrierwave) | self/search | card-mod-carrierwave-0.20.0 set/self/search.rb; card-mod-search-0.20.0 set/self/search.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| none | self/sidebar | card-mod-layout-0.20.0 set/self/sidebar.rb | not-equal (method-only set module (raw_help_text method); card-mod-layout.ts header) |
| Self::Signin (account) | self/signin | card-mod-account-0.20.0 set/self/signin.rb | equal |
| Self::Structure (content) | self/structure | card-mod-content-0.20.0 set/self/structure.rb | equal |
| Self::Style (style) | self/style | card-mod-style-0.20.0 set/self/style.rb | equal |
| Self::StyleMods (style) | self/style_mods | card-mod-style-0.20.0 set/self/style_mods.rb | equal |
| Self::Thanks (integrate) | self/thanks | card-mod-integrate-0.20.0 set/self/thanks.rb | equal |
| Self::TinyMce (tinymce_editor) | self/tiny_mce | card-mod-tinymce_editor-0.20.0 set/self/tiny_mce.rb | equal |
| Self::Trash (core) | self/trash | card-1.110.0 set/self/trash.rb | equal |
| Self::Update (permissions) | self/update | card-mod-permissions-0.20.0 set/self/update.rb | equal |
| Self::Version (core) | self/version | card-1.110.0 set/self/version.rb | equal |
| Type::Basic (format) | type/basic | card-mod-format-0.20.0 set/type/basic.rb | equal |
| Type::BootswatchSkin (bootstrap) | type/bootswatch_skin | card-mod-bootstrap-0.20.0 set/type/bootswatch_skin.rb | equal |
| Type::BootswatchSkin::Events (bootstrap) | type/bootswatch_skin/events | card-mod-bootstrap-0.20.0 set/type/bootswatch_skin/events.rb | equal |
| Type::BootswatchSkin::HtmlViews (bootstrap) | type/bootswatch_skin/html_views | card-mod-bootstrap-0.20.0 set/type/bootswatch_skin/html_views.rb | equal |
| Type::Cardtype (core), Type::Cardtype (format), Type::Cardtype (rules), Type::Cardtype (follow) | type/cardtype | card-1.110.0 set/type/cardtype.rb; card-mod-follow-0.20.0 set/type/cardtype.rb; card-mod-format-0.20.0 set/type/cardtype.rb; card-mod-rules-0.20.0 set/type/cardtype.rb; card-mod-search-0.20.0 set/type/cardtype.rb | equal (declared in more than one manifest) |
| Type::CoffeeScript (script) | type/coffee_script | card-mod-script-0.20.0 set/type/coffee_script.rb | equal |
| Type::Css (style) | type/css | card-mod-style-0.20.0 set/type/css.rb | equal |
| Type::Date (date) | type/date | card-mod-date-0.20.0 set/type/date.rb | equal |
| Type::EmailTemplate (email) | type/email_template | card-mod-email-0.20.0 set/type/email_template.rb | equal |
| Type::EmailTemplate::EmailConfig (email) | type/email_template/email_config | card-mod-email-0.20.0 set/type/email_template/email_config.rb | equal |
| Type::EmailTemplate::Html (email) | type/email_template/html | card-mod-email-0.20.0 set/type/email_template/html.rb | equal |
| Type::File (carrierwave) | type/file | card-mod-carrierwave-0.20.0 set/type/file.rb | equal |
| Type::Html (format), Type::Html (layout) | type/html | card-mod-format-0.20.0 set/type/html.rb; card-mod-layout-0.20.0 set/type/html.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Type::Image (carrierwave) | type/image | card-mod-bar_and_box-0.20.0 set/type/image.rb; card-mod-carrierwave-0.20.0 set/type/image.rb | equal (carried by the carrierwave manifest; recorded in the bar_and_box/carrierwave gem) |
| Type::Image::HtmlViews (carrierwave) | type/image/html_views | card-mod-carrierwave-0.20.0 set/type/image/html_views.rb | equal |
| Type::JavaScript (script) | type/java_script | card-mod-script-0.20.0 set/type/java_script.rb | equal |
| Type::Json (format) | type/json | card-mod-format-0.20.0 set/type/json.rb | equal |
| Type::LayoutType (layout) | type/layout_type | card-mod-layout-0.20.0 set/type/layout_type.rb | equal |
| Type::LinkList (list) | type/link_list | card-mod-list-0.20.0 set/type/link_list.rb | equal |
| Type::List (list), Type::List (edit) | type/list | card-mod-edit-0.20.0 set/type/list.rb; card-mod-list-0.20.0 set/type/list.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Type::LocalScriptFolderGroup (script) | type/local_script_folder_group | card-mod-script-0.20.0 set/type/local_script_folder_group.rb | equal |
| Type::LocalScriptManifestGroup (assets), Type::LocalScriptManifestGroup (script) | type/local_script_manifest_group | card-mod-script-0.20.0 set/type/local_script_manifest_group.rb | equal (declared in more than one manifest) |
| Type::LocalStyleFolderGroup (style) | type/local_style_folder_group | card-mod-style-0.20.0 set/type/local_style_folder_group.rb | equal |
| Type::LocalStyleManifestGroup (assets), Type::LocalStyleManifestGroup (style) | type/local_style_manifest_group | card-mod-style-0.20.0 set/type/local_style_manifest_group.rb | equal (declared in more than one manifest) |
| Type::Markdown (markdown) | type/markdown | card-mod-markdown-0.20.0 set/type/markdown.rb | equal |
| Type::Mod (core), Type::Mod (format), Type::Mod (assets) | type/mod | card-1.110.0 set/type/mod.rb; card-mod-assets-0.20.0 set/type/mod.rb; card-mod-format-0.20.0 set/type/mod.rb | equal (declared once per contributing mod, as Ruby's one set module collects 3 files) |
| Type::NestList (list) | type/nest_list | card-mod-list-0.20.0 set/type/nest_list.rb | equal |
| Type::NotificationTemplate (follow) | type/notification_template | card-mod-follow-0.20.0 set/type/notification_template.rb | equal |
| Type::Number (format) | type/number | card-mod-format-0.20.0 set/type/number.rb | equal |
| Type::Phrase (format) | type/phrase | card-mod-format-0.20.0 set/type/phrase.rb | equal |
| Type::PlainText (format), Type::PlainText (edit) | type/plain_text | card-mod-edit-0.20.0 set/type/plain_text.rb; card-mod-format-0.20.0 set/type/plain_text.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Type::Pointer (list), Type::Pointer (edit) | type/pointer | card-mod-edit-0.20.0 set/type/pointer.rb; card-mod-list-0.20.0 set/type/pointer.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Type::Role (account) | type/role | card-mod-account-0.20.0 set/type/role.rb | equal |
| Type::Scss (style) | type/scss | card-mod-style-0.20.0 set/type/scss.rb | equal |
| none | type/search_type | card-mod-search-0.20.0 set/type/search_type.rb | not-equal (method-only set module; card-mod-search.ts header) |
| Type::Session (session) | type/session | card-mod-session-0.20.0 set/type/session.rb | equal |
| Type::Set (rules), Type::Set (follow) | type/set | card-mod-follow-0.20.0 set/type/set.rb; card-mod-rules-0.20.0 set/type/set.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| Type::Set::HtmlViews (rules) | type/set/html_views | card-mod-rules-0.20.0 set/type/set/html_views.rb | equal |
| Type::Set::HtmlViews::FilteredRuleLists (rules) | type/set/html_views/filtered_rule_lists | card-mod-rules-0.20.0 set/type/set/html_views/filtered_rule_lists.rb | equal |
| Type::Set::HtmlViews::RuleLists (rules) | type/set/html_views/rule_lists | card-mod-rules-0.20.0 set/type/set/html_views/rule_lists.rb | equal |
| Type::Set::HtmlViews::SettingFilter (rules) | type/set/html_views/setting_filter | card-mod-rules-0.20.0 set/type/set/html_views/setting_filter.rb | equal |
| Type::Set::HtmlViews::Template (rules) | type/set/html_views/template | card-mod-rules-0.20.0 set/type/set/html_views/template.rb | equal |
| Type::Set::SettingCategories (rules) | type/set/setting_categories | card-mod-rules-0.20.0 set/type/set/setting_categories.rb | equal |
| Type::Setting (rules) | type/setting | card-mod-rules-0.20.0 set/type/setting.rb | equal |
| Type::Signup (account) | type/signup | card-mod-account-0.20.0 set/type/signup.rb | equal |
| Type::Signup::Views (account) | type/signup/views | card-mod-account-0.20.0 set/type/signup/views.rb | equal |
| Type::Skin (style) | type/skin | card-mod-style-0.20.0 set/type/skin.rb | equal |
| Type::Toggle (format) | type/toggle | card-mod-format-0.20.0 set/type/toggle.rb | equal |
| Type::Uri (format) | type/uri | card-mod-format-0.20.0 set/type/uri.rb | equal |
| Type::User (account), Type::User (follow) | type/user | card-mod-account-0.20.0 set/type/user.rb; card-mod-follow-0.20.0 set/type/user.rb | equal (declared once per contributing mod, as Ruby's one set module collects 2 files) |
| TypePlusRight::BootswatchSkin::Colors (bootstrap) | type_plus_right/bootswatch_skin/colors | card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/colors.rb | equal |
| TypePlusRight::BootswatchSkin::Image (bootstrap) | type_plus_right/bootswatch_skin/image | card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/image.rb | equal |
| TypePlusRight::BootswatchSkin::Parent (bootstrap) | type_plus_right/bootswatch_skin/parent | card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/parent.rb | equal |
| TypePlusRight::BootswatchSkin::Stylesheets (bootstrap) | type_plus_right/bootswatch_skin/stylesheets | card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/stylesheets.rb | equal |
| TypePlusRight::BootswatchSkin::Variables (bootstrap) | type_plus_right/bootswatch_skin/variables | card-mod-bootstrap-0.20.0 set/type_plus_right/bootswatch_skin/variables.rb | equal |
| TypePlusRight::Cardtype::Account (account) | type_plus_right/cardtype/account | card-mod-account-0.20.0 set/type_plus_right/cardtype/account.rb | equal |
| TypePlusRight::Mod::Script (script) | type_plus_right/mod/script | card-mod-script-0.20.0 set/type_plus_right/mod/script.rb | equal |
| TypePlusRight::Mod::Style (style) | type_plus_right/mod/style | card-mod-style-0.20.0 set/type_plus_right/mod/style.rb | equal |
| TypePlusRight::Role::Members (account) | type_plus_right/role/members | card-mod-account-0.20.0 set/type_plus_right/role/members.rb | equal |
| TypePlusRight::Set::Script (assets), TypePlusRight::Set::Script (script) | type_plus_right/set/script | card-mod-script-0.20.0 set/type_plus_right/set/script.rb | equal (declared in more than one manifest) |
| TypePlusRight::Set::Setting (rules) | type_plus_right/set/setting | card-mod-rules-0.20.0 set/type_plus_right/set/setting.rb | equal |
| TypePlusRight::Set::Structure (rules) | type_plus_right/set/structure | card-mod-rules-0.20.0 set/type_plus_right/set/structure.rb | equal |
| TypePlusRight::Set::Style (assets), TypePlusRight::Set::Style (style) | type_plus_right/set/style | card-mod-style-0.20.0 set/type_plus_right/set/style.rb | equal (declared in more than one manifest) |
| TypePlusRight::User::Email (account) | type_plus_right/user/email | card-mod-account-0.20.0 set/type_plus_right/user/email.rb | equal |
| TypePlusRight::User::Follow (follow) | type_plus_right/user/follow | card-mod-follow-0.20.0 set/type_plus_right/user/follow.rb | equal |
| TypePlusRight::User::Follow::FollowEditorHelper (follow) | type_plus_right/user/follow/follow_editor_helper | card-mod-follow-0.20.0 set/type_plus_right/user/follow/follow_editor_helper.rb | equal |
| All::Follow::FollowLink (follow) | all/follow/follow_link | (no recorded set file; the Ruby file is a `#! no set module` helper that registers nothing) | equal (note) |
| All::Follow::StartFollowLink (follow) | all/follow/start_follow_link | (no recorded set file; the Ruby file is a `#! no set module` helper that registers nothing) | equal (note) |
| All::Follow::StopFollowLink (follow) | all/follow/stop_follow_link | (no recorded set file; the Ruby file is a `#! no set module` helper that registers nothing) | equal (note) |
