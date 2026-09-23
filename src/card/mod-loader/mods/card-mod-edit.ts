// The card-mod-edit gem (card-mod-edit-0.20.0), ported through the mod
// loader - the mod that supplies the editing surface (new/edit forms, edit
// rules, type editor, board, conflict tracker, haml-driven templates).
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-edit-0.20.0/): 25 set rb files across the all/right/self/type
// patterns (21 set modules - 4 of the all/ set files are haml template
// services whose anchor is the .rb next to them), 5 HAML templates, and
// no lib/. The mod is overwhelmingly Rails-runtime: every form-rendering
// view drives card_form / form_for / form helpers / nest / frame /
// wrap_with_modal / link_to_card / icon_tag / haml; the input view drives
// the rich_text/text_area/text_field helpers; the board view drives the
// tab pills and the modal-overlay layout. None of those helpers are in
// the headless engine.
//
// Ported here the two views whose bodies do NOT call any Rails-runtime
// helper (a verbatim literal-string view, and the deleted-state view
// whose `wrap { X }` body composes around the ported :title view), plus
// the one setting_opts registration. Every set module from the gem tree
// is listed so the basket records the full gem structure.
//
// Ported (2 of 42 mod-specific html views):
// - set/all/template_nest.rb:3-12 :template_nest - the else branch
//   returns `"{{#{voo.nest_syntax}}}"` as a literal string (the field-
//   only branch calls `with_nest_mode` + `nest template_link_set_name,
//   view: :template_link`, both Rails-runtime; that branch is honest
//   remainder, see below).
// - set/all/editing.rb:46-48 :just_deleted - `wrap { "#{render_title}
//   deleted" }` - render_title is `fmt.renderView("title")`, the title
//   view already in the engine; `wrap { X }` (voo_api.rb:167-177) is
//   `<div>X</div>` with no attrs. unknown: true renders on unknown cards
//   so the deleted-state surface (the only caller, format/nest/fetch.rb
//   after a delete action) gets the bare "X deleted" span.
//
// Setting registration (1 of 1):
// - set/self/input_type.rb:1-4 setting_opts - the *input type setting:
//   group :editing, position 3, rule_type_editable: false,
//   short_help_text "edit interface". This is the *input_type setting
//   the data/real.yml seed card declares; the right/input_type.rb
//   module's format :html block adds a `raw_help_text` helper (returns
//   the ace-editor configuration prose) that the Setting registry's
//   rawHelpText field stores on the right side (setting.rb:112-114).
//
// NOT ported (honest remainder, with one-word reasons):
// - all/board, all/board/* (board, cardboard, board_pills, board.haml,
//   follow_section, related_section, tab_views, tab_visibility): modal/
//   haml/nest/tabs/pills, modal-overlay layout (board.haml col-8/col-4
//   grid), tabs - rails-runtime (wrap_with_modal, haml, list_tag, tabs
//   helper, field_nest, board_pill_sections)
// - all/edit_content.rb :edit, :edit_form: card_form,
//   _render_content_formgroups, _render_edit_buttons, modal wrap, frame
//   helper - rails-runtime
// - all/edit_inline.rb :edit_inline, :edit_inline_buttons, :edit_row,
//   :edit_name_row, edit_inline/edit_row.haml: card_form,
//   button_formgroup, standard_save_button, cancel_in_place_button,
//   delete_button, haml :edit_row - rails-runtime
// - all/edit_name.rb :edit_name, :name_form, edit_name_skip_referers
//   .haml: card_form, _render_name_formgroup, edit_name_buttons,
//   edit_name_skip_referers haml, haml - rails-runtime
// - all/edit_type.rb :edit_type, :edit_type_form, :edit_type_row,
//   :board_type_formgroup, :type_formgroup, type_field helpers: frame,
//   card_form, type_formgroup (formgroup + select_tag), edit_row haml,
//   grouped_options_for_select, options_for_select - rails-runtime
// - all/editing.rb :board, :cardboard, :edit_buttons, :edit_rules,
//   :edit_structure, :edit_nests: modal wrap (wrap_with_modal, full
//   size), breadcrumb_data, board_parts, frame, multi_card_edit, nest,
//   card.structure walk - rails-runtime
// - all/editor.rb :input: try(input_method(input_type)) chain through
//   rich_text_input, text_area_input, text_field_input, hidden_input,
//   input_defined_by_card (with_card + nest), default_input_type,
//   with_card (Card[] fetch) - rails-runtime
// - all/form.rb :content_formgroups, :name_formgroup, :content_formgroup,
//   :edit_in_form, :conflict_tracker: formgroup helper, text_field,
//   hidden_field, wrap_with :fieldset, edit_slot dispatch, card.last_
//   action_id_before_edit mutation - rails-runtime
// - all/form_buttons.rb: FIELD_HELPERS define_method loop + standard_
//   submit_button, standard_save_and_close_button, standard_cancel_
//   button, modal_cancel_button, edit_cancel_button, new_cancel_button,
//   delete_button, delete_button_opts, delete_confirm, delete_success -
//   rails-runtime (form.send, button_tag, link_to, modal_close_button)
// - all/form_elements.rb: FIELD_HELPERS dispatch define_method loop
//   (same shape as form_buttons) + success_tags, hidden_tags,
//   process_hidden_value, submit_button, cancel_button, cancel_strategy,
//   path_to_previous - rails-runtime
// - all/formgroup.rb :read_form, :read_formgroup + formgroup helper
//   chain: read_formgroup.haml template, formgroup (wrap_with :div +
//   formgroup_label + editor_wrap), formgroup_label, formgroup_title,
//   formgroup_div_args, formgroup_div_cardname_args, formgroup_help,
//   formgroup_voo_help - rails-runtime (wrap_with :div, form.label,
//   haml)
// - all/new.rb :new, :new_in_modal, :simple_new, :new_fields, plus
//   all the new_view_title/new_modal_menu/create_form_with_alert_guide
//   helpers, standard_create_button: framed_create_form, frame_and_form,
//   card_form :create, modal wrap, with_create_context (with_nest_mode +
//   voo.title mutation + voo.show :help), wrap true, _render_new_fields,
//   _render_content_formgroups, _render(buttons_view) - rails-runtime
// - all/overlay_guide.rb :overlay_guide + overlay_guide.haml: haml
//   template, link_to, icon_tag, modal overlay wrap - rails-runtime
// - all/template_nest.rb :template_nest field_only branch: with_nest_
//   mode + nest template_link_set_name, view: :template_link (template_
//   link set card) - rails-runtime (only the else branch is ported; the
//   field-only branch needs template_link cards + nest)
// - right/input_type.rb (whole file): assign_type :pointer + format :html
//   block with method overrides (default_item_view, quick_editor,
//   quick_form_opts, default_input_type, raw_help_text, quick_edit)
//   + base block method overrides (option_names,
//   supports_content_option_view?) - no views, methods-only; nothing to
//   register in the view table
// - right/thanks.rb: assign_type :phrase (one-line) - nothing to port
// - self/input_type.rb: setting_opts (PORTED, see above) + format :html
//   raw_help_text helper - the helper is the right-module's
//   raw_help_text analog and isn't itself a view, but its byte content
//   is captured by the Setting registry's rightRawHelpText field
//   (setting.rb:112-114) when the Right::InputType set module also
//   defines raw_help_text, which it does
// - type/list.rb, type/plain_text.rb, type/pointer.rb: base-block method
//   overrides (input_type_content_options, show_content_options?,
//   show_input_type?, field_settings) - no views; the basket records
//   these set modules but the methods are not callable in a headless
//   engine (they describe the type-mod surface for the live editor)

import type { ViewContext, ViewFn } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** all/template_nest.rb:3-12 :template_nest, cache: :never, unknown: true:
 *  the field-only branch calls `with_nest_mode :normal` +
 *  `nest template_link_set_name, view: :template_link` (both
 *  Rails-runtime). The else branch returns the literal
 *  `"{{#{voo.nest_syntax}}}"` - nest_syntax is the syntax captured by
 *  format/nest.rb#prepare (the literal `{{name}}` form the caller
 *  authored, with options preserved). When unknown: true carries a
 *  non-field nest (e.g. a full reference like "Some Card"), the body
 *  echoes the syntax unchanged so the template renderer can substitute
 *  it once the target card exists. The early return when
 *  `voo.nest_name` is nil guards the no-nest case (a bare
 *  render :template_nest without nest_name in scope). */
const templateNestView: ViewFn = ({ voo }) => {
  const nestName = voo.opts["nest_name"];
  if (nestName === undefined || nestName === null || nestName === "") return "";
  const syntax = voo.opts["nest_syntax"];
  // syntax is set whenever nest_name is set (format/nest.rb:471-477 +
  // nestRecord:557-559 both populate both); absent syntax -> empty body
  // (Ruby's "".to_s when nest_syntax is nil produces "" - same shape).
  if (typeof syntax !== "string" || syntax === "") return "";
  const name = DeckoName.parse(String(nestName));
  // field_only? (fields.rb:661-666): relative name containing only the
  // rightmost part. The field-only branch is the Rails-runtime branch
  // (above); port only the else branch.
  if (name.fieldOnly) return ""; // honest remainder: rails (nest + nest_mode)
  return `{{${syntax}}}`;
};

/** all/editing.rb:46-48 :just_deleted, unknown: true: `wrap { "#{render_
//  title} deleted" }`. `wrap` (voo_api.rb:167-177) is `<div>X</div>` -
//  no attrs, no class. `render_title` is the title view, ported in
//  src/card/render/views.ts#titleView (card-mod-format set/all/title.rb).
//  unknown: true means a deleted card whose view substitution routed
//  here - the nest that fired the delete action (format/nest/fetch.rb)
//  receives `<div><span class="card-title" title="X">X</span>
//  deleted</div>`. The title view runs through the format's normal
//  voo machinery, so an unknown card still gets the title span (no
//  read-permission denial: :just_deleted is `perms: :none`-implicit
//  because the unknown-card substitution routes to it before the
//  read-permission check, view/permission.rb#skip_check? for
//  unknown-card substitutions). */
const justDeletedView: ViewFn = ({ fmt }) => {
  const title = fmt.renderView("title");
  return `<div>${title} deleted</div>`;
};

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
const setModules: ModSetModuleFile[] = [
  // pattern: all (loader.rb#parts_from_path: "all/foo" -> "All::Foo")
  {
    // set/all/board.rb + the all/board/* subdir (5 files + 1 haml):
    // BOARD_TABS hash, BOARD_TAB_NAMES, format :html wrapper :board +
    // :board/:cardboard views + the breadcrumb/board_menu/
    // switch_to_edit_link/board_link_opts/board_slot_selector helpers,
    // default_board_tab (which calls show_guide_tab? - delegates to
    // tab_visibility.rb's show_*_tab?). All depend on wrap_with_modal
    // + haml :board + tabs helper. NOT ported: rails-runtime.
    setPath: "all/board",
  },
  {
    // set/all/board/board_pills.rb: BOARD_PILL_* constants + board_pills,
    // board_pill_items, board_pill_item_opts, board_pill_sections,
    // board_pill_section. NOT ported: rails-runtime (list_tag, link_to_card).
    setPath: "all/board/board_pills",
  },
  {
    // set/all/board/follow_section.rb: follow_section, follow_button_group,
    // follow_overview_button, follow_advanced, followers_board_link. NOT
    // ported: rails-runtime (follow_button, Auth.current, card.followers_count,
    // link_to_card).
    setPath: "all/board/follow_section",
  },
  {
    // set/all/board/related_section.rb: RELATED_ITEMS, related_by_name_items,
    // related_by_content_items, related_by_type_items. NOT ported: rails-
    // runtime (these are helpers consumed by tab_views.rb's :related_tab).
    setPath: "all/board/related_section",
  },
  {
    // set/all/board/tab_views.rb: :engage_tab, :history_tab, :related_tab,
    // :rules_tab, :follow_section, :guide_tab + discussion_section helper.
    // NOT ported: rails-runtime (acts_board_layout, board_pill_sections,
    // field_nest, set_select, render_guide, render_follow_section).
    setPath: "all/board/tab_views",
  },
  {
    // set/all/board/tab_visibility.rb: visible_board_tabs + show_*_tab?
    // helpers. NOT ported: rails-runtime helpers (no views of their own).
    setPath: "all/board/tab_visibility",
  },
  {
    // set/all/edit_content.rb: :edit_form, :edit, edit_form, edit_modal_size,
    // edit_modal_menu, edit_form_opts. NOT ported: rails-runtime (card_form,
    // modal wrap, frame, _render_content_formgroups, _render(edit_buttons),
    // with_nest_mode, voo.show :help).
    setPath: "all/edit_content",
  },
  {
    // set/all/edit_inline.rb + edit_inline/edit_row.haml: :edit_inline,
    // :edit_name_row, :edit_inline_buttons, :edit_row + edit_row helper +
    // edit_inline_link + cancel_in_place_button. NOT ported: rails-runtime
    // (card_form, button_formgroup, standard_save_button, cancel_in_place_
    // button, delete_button, haml :edit_row).
    setPath: "all/edit_inline",
  },
  {
    // set/all/edit_name.rb + edit_name_skip_referers.haml: :edit_name,
    // :name_form + name_form, edit_name_skip_referers (haml),
    // edit_name_success, edit_name_buttons, rename_button. NOT ported:
    // rails-runtime (frame, card_form, haml, button_tag).
    setPath: "all/edit_name",
  },
  {
    // set/all/edit_type.rb: :edit_type, :edit_type_form, :edit_type_row,
    // :board_type_formgroup, :type_formgroup + type_field, raw_type_options,
    // wrap_type_formgroup, type_field_options, simple_type_field_options,
    // multi_type_field_options, current_type_value, grouped_types,
    // standard_grouped_types, visible_cardtype_groups. NOT ported: rails-
    // runtime (frame, card_form, type_formgroup, select_tag, formgroup,
    // grouped_options_for_select, options_for_select, edit_row haml).
    setPath: "all/edit_type",
  },
  {
    // set/all/editing.rb: :board, :cardboard, board_parts, edit_success,
    // edit_view_hidden, :edit_buttons, :just_deleted (PORTED), :edit_rules,
    // :edit_structure, :edit_nests.
    // Ported: :just_deleted (the bare wrap { render_title + " deleted" }).
    setPath: "all/editing",
    formats: {
      html: {
        views: [{ view: "just_deleted", viewFn: justDeletedView, config: { unknown: true } }],
      },
    },
  },
  {
    // set/all/editor.rb: input_type, input_type_from_rule, input_method,
    // input_defined_by_card, with_card, :input, default_input_type,
    // rich_text_input, text_area_input, text_field_input, hidden_input,
    // placeholder_text. NOT ported: rails-runtime (text_area, text_field,
    // hidden_field, with_card + Card[mark] fetch, nest input_card, view:
    // :core, send(input_method)).
    setPath: "all/editor",
  },
  {
    // set/all/form.rb: :content_formgroups, :name_formgroup,
    // :content_formgroup, :edit_in_form, :conflict_tracker + wrap_content_
    // formgroup, button_formgroup, name_field, content_field, edit_slot,
    // inline_nests_editor?, multi_card_editor?, edit_fields?, in_multi_card_
    // editor?, single_card_edit_field, editor_in_multi_card, wrap_editor_
    // in_multi_card, multi_card_edit, structure_link, form, new_form,
    // reset_form, form_prefix, simple_form?, edit_in_form_prefix,
    // explicit_form_prefix, form_context, form_root?, form_root,
    // card_form, hidden_form_tags, card_form_opts, card_form_html_opts,
    // interpret_main_success_opts, card_form_url_and_action, editor_wrap,
    // add_junction_class. NOT ported: rails-runtime (form_for, form helpers,
    // wrap_with :fieldset, formgroup, hidden_field, text_field, frame).
    setPath: "all/form",
  },
  {
    // set/all/form_buttons.rb: standard_submit_button, standard_save_button,
    // standard_save_and_close_button, standard_cancel_button, modal_cancel_
    // button, edit_cancel_button, new_cancel_button, delete_button,
    // delete_button_opts, delete_confirm, delete_success. NOT ported:
    // rails-runtime (form.send, submit_button, button_tag, link_to, modal_
    // close_button, voo.hide?(:save_button), Auth-aware delete_success).
    setPath: "all/form_buttons",
  },
  {
    // set/all/form_elements.rb: FIELD_HELPERS dispatch loop + success_tags,
    // hidden_tags, process_hidden_value, submit_button, cancel_button,
    // cancel_strategy, path_to_previous. NOT ported: rails-runtime
    // (form.send(method_name), submit_button, button_tag, link_to,
    // hidden_field_tag, cancel_strategy with href/redirect branching).
    setPath: "all/form_elements",
  },
  {
    // set/all/formgroup.rb + read_formgroup.haml: :read_form, :read_formgroup
    // + read_field_configs + formgroup, formgroup_label, formgroup_title,
    // formgroup_div_args, formgroup_div_cardname_args, formgroup_help,
    // formgroup_voo_help. NOT ported: rails-runtime (haml :read_formgroup,
    // wrap_with :div, form.label, formgroup, editor_wrap, nest with view:
    // :read_formgroup).
    setPath: "all/formgroup",
  },
  {
    // set/all/new.rb: :new, :new_in_modal, :simple_new, :new_fields +
    // with_create_context, create_form, new_modal_size, new_modal_menu,
    // framed_create_form, create_form_with_alert_guide, new_form_opts,
    // new_view_title, new_in_modal_title, new_success, new_in_modal_success,
    // new_view_hidden, new_view_name, new_name_formgroup, new_name_prompt?,
    // needs_name?, new_view_type, new_type_prompt?, new_type_preset?,
    // new_type_prompt_context?, new_type_permitted?, :new_type_formgroup,
    // :new_buttons, :new_in_modal_buttons, cancel_create_path,
    // standard_create_button. NOT ported: rails-runtime (framed_create_form,
    // frame_and_form, card_form :create, modal wrap, with_create_context
    // with_nest_mode + voo mutations, wrap true, _render_content_formgroups,
    // _render(buttons_view), check_box_tag, hidden_field_tag, type_field,
    // formgroup, button_formgroup).
    setPath: "all/new",
  },
  {
    // set/all/overlay_guide.rb + overlay_guide.haml: :overlay_guide (haml
    // template + slot wrap). NOT ported: rails-runtime (haml :overlay_guide,
    // link_to, icon_tag, slot wrap with class "_overlay d0-card-overlay
    // card nodblclick", data-bs-dismiss overlay).
    setPath: "all/overlay_guide",
  },
  {
    // set/all/template_nest.rb: :template_nest, template_link_set_name,
    // template_link_set_name_for_relative_name, on_type_set.
    // Ported: :template_nest (the else branch - returns the literal
    // "{{nest_syntax}}" string for non-field-only nests; the field-only
    // branch is honest remainder).
    setPath: "all/template_nest",
    formats: {
      html: {
        views: [
          {
            view: "template_nest",
            viewFn: templateNestView,
            config: { unknown: true, cache: "never" },
          },
        ],
      },
    },
  },
  // pattern: right
  {
    // set/right/input_type.rb: assign_type :pointer + format :html do block
    // (default_item_view, quick_editor, quick_form_opts, default_input_type,
    // raw_help_text, quick_edit) + base block (option_names,
    // supports_content_option_view?). NOT ported: methods-only (no views).
    setPath: "right/input_type",
  },
  {
    // set/right/thanks.rb: assign_type :phrase (one-liner). NOT ported:
    // one-liner assign_type, no views.
    setPath: "right/thanks",
  },
  // pattern: self
  {
    // set/self/input_type.rb: setting_opts + format :html do raw_help_text
    // (the right-module's raw_help_text analog). Ported: setting_opts.
    // The raw_help_text helper isn't a view; the Setting registry stores
    // its bytes in rightRawHelpText when Right::InputType also defines
    // raw_help_text (which it does - right/input_type.rb:22-24).
    setPath: "self/input_type",
    settingOpts: {
      group: "editing",
      position: 3,
      ruleTypeEditable: false,
      shortHelpText: "edit interface",
    },
  },
  // pattern: type
  {
    // set/type/list.rb: input_type_content_options, show_content_options?,
    // show_input_type?, field_settings. NOT ported: methods-only (no views).
    setPath: "type/list",
  },
  {
    // set/type/plain_text.rb: input_type_content_options, field_settings,
    // show_input_type?. NOT ported: methods-only (no views).
    setPath: "type/plain_text",
  },
  {
    // set/type/pointer.rb: show_content_options?, show_input_type?,
    // input_type_content_options. NOT ported: methods-only (no views).
    setPath: "type/pointer",
  },
];

const cardModEdit: DeckoModManifest = {
  name: "edit",
  gemName: "card-mod-edit",
  group: "gem",
  setModules,
};

export default cardModEdit;
