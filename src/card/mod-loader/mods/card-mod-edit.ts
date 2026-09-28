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
// Ported (10 of 42 mod-specific html views) - the 2 earlier literal/
// composed views plus the 8 views of the CORE EDIT-FORM PATH (write-path
// slice 3), byte-verified against the captured signed-in edit surface
// (fixtures/captured/edit-forms.json, captured from the live decko-0.20.0
// oracle app; the capture contract + normalizations live in
// tests/card/mod-loader/oracle-capture-edit-forms.rb):
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
// - set/all/editing.rb:37-41 :edit_buttons - the button formgroup:
//   standard_submit_button (form_buttons.rb:3-5), edit_cancel_button
//   (modal_cancel_button), delete_button - Save drops when the :edit
//   body hid :save_button (voo.hide? gate), nils compacted by output().
// - set/all/edit_type.rb:19-24 :edit_type_row - the Type row (edit_row
//   haml: col-2 label / col-8 type link / col-2 edit link) inside the
//   slot wrap with the class_up + wrap-class extras.
// - set/all/form.rb:27-31 :conflict_tracker - the current-revision
//   hidden field the save path validates (detect_conflict).
// - set/all/editor.rb:32-38 :input - the captured surface's resolved
//   branch: rich_text -> the tinymce editor input (rows 3,
//   tinymce-textarea d0-card-content form-control, id =
//   "<safe_key>-<counter>").
// - set/all/form.rb:4-7 :content_formgroups - the fieldset around
//   edit_slot's formgroup branch.
// - set/all/form.rb:17-19 :content_formgroup - the formgroup div (label
//   + editor wrap) around the conflict tracker + input pair.
// - set/all/edit_content.rb:3-11 :edit_form - the card_form update form
//   (utf8 + _method patch, edit_type_row slot, content fieldset, buttons)
//   in its slot wrap.
// - set/all/edit_content.rb:28-33 :edit - the modal-wrapped edit view
//   (haml :modal_dialog machinery: title, edit modal menu, help slot +
//   edit form body; perms :update - anonymous renders the quiet denial
//   span exactly as captured).
//
// Engine seam aligned for the captured bytes (render/format.ts): Voo's
// show/hide setters now use visibility.rb's FIRST-write-wins viz
// (visibility.rb:71-79 `next if !force && viz_hash[view]`) and
// RenderFormat#uniqueId ports content.rb:60-70's chain-shared id counter.
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
// - all/edit_type.rb :edit_type, :edit_type_form,
//   :board_type_formgroup, :type_formgroup + type_field helpers: frame,
//   card_form, type_formgroup (formgroup + select_tag), edit_row haml,
//   grouped_options_for_select, options_for_select - rails-runtime
//   (:edit_type_row PORTED, see above)
// - all/editing.rb :board, :cardboard, :edit_rules,
//   :edit_structure, :edit_nests: modal wrap (wrap_with_modal, full
//   size), breadcrumb_data, board_parts, frame, multi_card_edit, nest,
//   card.structure walk - rails-runtime (:edit_buttons PORTED, see above)
// - all/editor.rb :input's try-chain siblings: input_method dispatch
//   through text_area_input, text_field_input, hidden_input,
//   input_defined_by_card (with_card + nest), default_input_type,
//   with_card (Card[] fetch) - rails-runtime (:input's captured branch
//   PORTED, see above)
// - all/form.rb :name_formgroup, :edit_in_form + the form/prefix
//   machinery, name_field, multi_card_edit, structure_link: formgroup
//   helper, text_field, wrap_with :fieldset for other branches, edit_
//   slot dispatch for structure/multi-card - rails-runtime
//   (:content_formgroups, :content_formgroup, :conflict_tracker PORTED,
//   see above)
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
import { emitAttrs, h, slotOptionsJson } from "../../render/slot-html.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// shared emitters (module-local ports of the format's Ruby method set - the
// card-mod-layout port carries identical copies; mod files stay
// self-contained per the established port convention)
// ---------------------------------------------------------------------------

/** content.rb:73-76 output: `Array.wrap(content).flatten.compact.join "\n"`
 *  - NILS are compacted away (edit_view_hidden's implicit nil drops without
 *  a blank line); empty STRINGS are Ruby-truthy and stay (they would join
 *  as empty lines). The forms surface has no empty-string members, but the
 *  compaction contract is kept exact. */
function output(parts: (string | undefined | null)[]): string {
  return parts
    .filter((part): part is string => part !== undefined && part !== null)
    .join("\n");
}

/** helper.rb icon_tag (the bootstrap icon registry): the captured surface
 *  pins close, edit, board - the layout port carries the same registry
 *  (card-mod-layout.ts ICONS). */
function icon(name: string): string {
  return `<i class="notranslate material-icons">${name}</i>`;
}

/** title.rb:28 safe_name: `h(card.name)` - the delete confirm's text. */

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
// the CORE EDIT-FORM PATH (write-path slice 3) - the views the captured
// signed-in edit surface composes (fixtures/captured/edit-forms.json,
// captured from the live decko-0.20.0 oracle app; see
// tests/card/mod-loader/oracle-capture-edit-forms.rb for the capture
// contract). Each view cites the Ruby source; the byte shapes are pinned
// by the captured oracle.
// ---------------------------------------------------------------------------

// --- all/form_buttons.rb + all/form_elements.rb + bootstrap/form.rb -------

/** all/form_buttons.rb:14-27 standard_save_button:
 *  `return if voo&.hide?(:save_button)` (the :edit body hides it - the
 *  captured :edit bytes carry only Save and Close, the standalone
 *  :edit_form carries both); add_class "submit-button me-3
 *  _update-history-pills"; text "Save"; "data-cy" "save" ->
 *  submit_button (form_elements.rb:53-62: text default, situation
 *  "primary", data.disable_with "Submitting") -> button_tag (bootstrap
 *  form.rb:32-35 bootstrapify_button appends "btn btn-#{situation}" to
 *  the class; Rails button_tag merges {name: "button", type: "submit"}
 *  BEFORE the caller's options - actionview-7.2.3.2
 *  form_tag_helper.rb:573). Attribute order class-then-data-cy per the
 *  captured bytes (the opts hash order the Ruby chain produces). */
function standardSaveButton(voo: ViewContext["voo"]): string | undefined {
  if (!voo.show("save_button")) return undefined; // Ruby: return if hide?
  return `<button name="button" type="submit" data-disable-with="Submitting" class="submit-button me-3 _update-history-pills btn btn-primary" data-cy="save">Save</button>`;
}

/** all/form_buttons.rb:29-38 standard_save_and_close_button: close
 *  :modal, text "Save and Close", add_class "submit-button me-3
 *  _close-on-success" then "_update-origin"; "data-cy" "submit-modal"
 *  (reverse_merge adds it, so the captured attr order differs from the
 *  Save button: data-cy BEFORE class). */
function standardSaveAndCloseButton(): string {
  return `<button name="button" type="submit" data-disable-with="Submitting" data-cy="submit-modal" class="submit-button me-3 _close-on-success _update-origin btn btn-primary">Save and Close</button>`;
}

/** all/form_buttons.rb:45-50 modal_cancel_button -> modal_close_button
 *  "Cancel", situation: "secondary", class: "cancel-button" (modal.rb:
 *  59-63 MODAL_CLOSE_OPTS {type: "button", "data-bs-dismiss": "modal",
 *  "data-cy": "close-modal"}; bootstrap appends btn btn-secondary). */
function modalCancelButton(): string {
  return `<button name="button" type="button" data-bs-dismiss="modal" data-cy="close-modal" class="cancel-button btn btn-secondary">Cancel</button>`;
}

/** all/form_buttons.rb:56-77 delete_button + delete_button_opts +
 *  delete_confirm + delete_success (NOT main? branch - the engine render
 *  surface is non-focal; the main? branch is the page layer's remainder):
 *  add_class "slotter btn btn-outline-danger ms-auto"; data-confirm
 *  "Are you sure you want to delete #{safe_name}?"; path action :delete,
 *  success {view: :just_deleted}; remote. link_to (links.rb) appends href
 *  then data-remote LAST; the success hash rides the query string
 *  Rails-deep-encoded (success[view]=just_deleted percent-encoded). */
function deleteButton(fmt: ViewContext["fmt"]): string | undefined {
  if (fmt.card.id === undefined) return undefined; // `return unless card.real?`
  const name = h(fmt.card.name.s);
  return `<a class="slotter btn btn-outline-danger ms-auto" data-confirm="Are you sure you want to delete ${name}?" href="/delete/${fmt.urlKey()}?success%5Bview%5D=just_deleted" data-remote="true">Delete</a>`;
}

/** all/editing.rb:24-27 button_formgroup:
 *  `wrap_with :div, class: "form-group #{classy 'button-form-group'}"`. */
function buttonFormGroup(inner: string): string {
  return `<div class="form-group button-form-group">${inner}</div>`;
}

/** all/editing.rb:37-41 view :edit_buttons:
 *  `button_formgroup { [standard_submit_button, edit_cancel_button,
 *  delete_button] }` - standard_submit_button (form_buttons.rb:3-5) is
 *  [standard_save_button, standard_save_and_close_button]; the array
 *  rides output() (newline-joined, nils compacted - the hidden Save
 *  button drops WITHOUT a blank line in the captured :edit bytes). */
const editButtonsView: ViewFn = ({ fmt, voo }) =>
  buttonFormGroup(
    output([
      standardSaveButton(voo),
      standardSaveAndCloseButton(),
      modalCancelButton(),
      deleteButton(fmt),
    ]),
  );

// --- all/edit_type.rb + all/edit_inline.rb + edit_inline/edit_row.haml ----

/** all/edit_type.rb:19-24 view :edit_type_row:
 *  `return _render_board_type_formgroup if voo.visible?(:type_form) { false }`.
 *  visible? (visibility.rb:81-84) viz-writes :type_form with the block's
 *  value (:hide, via the non-force viz) ONLY when unset, then answers
 *  show? - unset here -> the captured slot's hide list carries type_form
 *  and the edit_row branch renders. The board_type_formgroup branch (the
 *  live type select) is the rails-runtime remainder (select2 formgroup).
 *
 *  edit_row (edit_inline.rb:37-46): `class_up "card-slot", "d-flex
 *  form-group"; wrap true, class: :row { haml :edit_row, ... }` - the
 *  slot wrap gains the class_up extras then the wrap arg ("... d-flex
 *  form-group row", the captured order). The haml (edit_row.haml) emits
 *  flush-left single-quoted cols, one \n per line: col-2 label / col-8
 *  content / col-2 edit link.
 *
 *  content = link_to_card(card.type) (links.rb:111+): the known-card
 *  type link `<a class="known-card" href="/<type url_key>"><type name></a>`.
 *  edit_link = edit_inline_link(:board_type_formgroup)
 *  (edit_inline.rb:48-52): link_to_view with menu_icon (icon_tag :edit),
 *  class "ms-2 edit-link", "data-cy" "edit-link" - href "/<card url_key>/
 *  board_type_formgroup", rel nofollow, data-remote. */
const editTypeRowView: ViewFn = ({ fmt, voo }) => {
  if (!voo.viz.has("type_form")) voo.hide("type_form"); // visible? writes once
  if (voo.explicitShow("type_form")) {
    // honest remainder: board_type_formgroup (type select2 formgroup) -
    // rails-runtime; unreachable on the captured surface (type_form hidden)
    return "";
  }
  const typeName = fmt.card.typeName ?? "";
  const typeUrl = DeckoName.parse(typeName).urlKey;
  const content = `<a class="known-card" href="/${typeUrl}">${h(typeName)}</a>`;
  const editLink =
    `<a rel="nofollow" class="ms-2 edit-link slotter" data-cy="edit-link"` +
    ` href="/${fmt.urlKey()}/board_type_formgroup" data-remote="true">${icon("edit")}</a>`;
  const inner =
    `<div class='col-2 text-start'>\n<label>\nType\n</label>\n</div>\n` +
    `<div class='col-8'>\n${content}\n</div>\n` +
    // the haml's last line carries its own trailing newline (the captured
    // bytes newline before the slot wrap's closing </div>)
    `<div class='col-2 text-end'>\n${editLink}\n</div>\n`;
  voo.classUp("card-slot", "d-flex form-group");
  return modSlotWrap({ fmt, voo }, "edit_type_row", inner, "row");
};

// --- all/form.rb + all/formgroup.rb + all/editor.rb ------------------------

/** all/form.rb:27-31 view :conflict_tracker (cache: :never, unknown: true):
 *  `return unless card&.real?; card.last_action_id_before_edit =
 *  card.last_action_id; hidden_field :last_action_id_before_edit, class:
 *  "current_revision_id"`. The value is the card's last action id (the
 *  cards row's current_revision_id - the stale-revision detector the
 *  save path validates against; detect_conflict, card-mod-history
 *  set/all/history/events.rb:19). The bootstrap FIELD_HELPERS wrapper
 *  (bootstrap/form.rb:15-22) appends " form-control"; Rails hidden
 *  fields carry autocomplete="off" (form_tag_helper.rb:309
 *  hidden_field_tag = text_field_tag(..., type: :hidden,
 *  autocomplete: "off")); the attribute order is the captured one. */
const conflictTrackerView: ViewFn = ({ fmt }) => {
  if (fmt.card.id === undefined) return ""; // `return unless card&.real?`
  const value = fmt.card.record.currentRevisionId;
  return `<input class="current_revision_id form-control" autocomplete="off" type="hidden" value="${value ?? ""}" name="card[last_action_id_before_edit]" id="card_last_action_id_before_edit" />`;
};

/** all/editor.rb:32-38 view :input (cache: :never, unknown: true):
 *  `try(input_method(input_type)) || input_defined_by_card ||
 *  send(input_method(default_input_type))` - input_type unset on the
 *  captured cards (no *input type rule) -> default_input_type :rich_text
 *  (:40-42) -> rich_text_input (:42-44) -> `send "#{Cardio.config.rich_
 *  text_editor || :text_area}_editor_input"` - the oracle deck configures
 *  the tinymce editor (the captured class tinymce-textarea), so
 *  card-mod-tinymce_editor set/all/tinymce_editor.rb:9-13
 *  tinymce_editor_input: `text_area :content, rows: 3, class:
 *  "tinymce-textarea d0-card-content", id: unique_id`. The bootstrap
 *  FIELD_HELPERS wrapper appends " form-control"; unique_id is
 *  content.rb:69 "#{card.name.safe_key}-#{id_counter}" (the
 *  format-chain-shared counter, RenderFormat#uniqueId here).
 *  Rails' text_area emits the body after a newline (TagHelper
 *  PRE_CONTENT_STRINGS[:textarea] = "\n", tag_helper.rb:44) and
 *  content_tag-escapes it (the captured Home textarea shows &lt;div&gt;).
 *  The ace/plain/hidden/defined-by-card input branches are the honest
 *  remainder (rails-runtime helpers / other mods' editor config). */
const inputView: ViewFn = ({ fmt }) => {
  const id = fmt.uniqueId();
  const content = h(fmt.card.dbContent ?? "");
  return `<textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="${id}" name="card[content]">\n${content}</textarea>`;
};

/** all/form.rb:79-85 content_field: `with_nest_mode :normal { output
 *  [_render_conflict_tracker, _render_input] }` - nest_mode is the
 *  nested-field-editor flag; this surface (plain RichText content) renders
 *  no nests, so the mode has no byte effect. output() joins the two
 *  views with "\n" (the captured bytes newline between the hidden input
 *  and the textarea). */
function contentField(fmt: ViewContext["fmt"]): string {
  return output([fmt.renderView("conflict_tracker"), fmt.renderView("input")]);
}

/** all/form.rb:17-19 view :content_formgroup (cache: :never, unknown:
 *  true): `wrap_content_formgroup { content_field }` ->
 *  wrap_content_formgroup (:55-59) = formgroup "Content", input:
 *  :content, help: false, class: classy("card-editor").
 *
 *  formgroup (formgroup.rb:20-27): `wrap_with :div, formgroup_div_args
 *  do [formgroup_label(input, title, help), editor_wrap(input, &block)]
 *  end` - the pair joins "\n" (the captured newline between the label and
 *  the editor div). formgroup_div_args (:37-43): class "form-group
 *  card-editor", then data-card-id (card.real?), then the cardname args
 *  (:45-47 data-card-name / data-card-link-name, h-escaped). formgroup_
 *  label (:29-35): parts [formgroup_title("Content") (shown - title
 *  visible by default), formgroup_help(false) (nil - help: false)]
 *  -> form.label(:content, "Content") = `<label for="card_content">`.
 *  editor_wrap (:208-212 form.rb): `<div class="editor content-editor">`. */
const contentFormgroupView: ViewFn = ({ fmt }) => {
  const card = fmt.card;
  const attrs = emitAttrs({
    class: "form-group card-editor",
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": card.name.s === "" ? undefined : h(card.name.s),
    "data-card-link-name": h(fmt.urlKey()),
  });
  return (
    `<div${attrs}>` +
    `<label for="card_content">Content</label>\n` +
    `<div class="editor content-editor">${contentField(fmt)}</div>` +
    `</div>`
  );
};

/** all/form.rb:4-7 view :content_formgroups (cache: :never, unknown:
 *  true): `wrap_with :fieldset, edit_slot, class: classy("card-editor",
 *  "editor")`. edit_slot (:95-103) -> single_card_edit_field (:105-112):
 *  `voo.show?(:type_formgroup) || voo.show?(:name_formgroup)` is TRUE -
 *  visibility.rb show? = `!hide?` answers SHOWN for un-listed optionals -
 *  so the formgroup branch `_render_content_formgroup` renders (the
 *  captured fieldset wraps the form-group div, label and editor). */
const contentFormgroupsView: ViewFn = ({ fmt }) =>
  `<fieldset class="card-editor editor">${fmt.renderView("content_formgroup")}</fieldset>`;

// --- all/edit_content.rb (the :edit_form view + card_form machinery) -------

/** all/edit_content.rb:3-11 view :edit_form, wrap: :slot:
 *  `voo.show :edit_type_row; with_nest_mode :edit { edit_form }`.
 *  nest_mode is the nested-field-editor flag - no nests render on this
 *  surface, no byte effect. The slot wrap (wrap: :slot) is emitted here
 *  (the render pipeline applies no wrappers - the render pipeline's wrap
 *  configs are declarative records).
 *
 *  edit_form (:14-27): `voo.hide :edit_type_row` - a NO-OP under Ruby's
 *  first-write-wins viz (visibility.rb:76 `next if !force &&
 *  viz_hash[view]`), which is why the captured data-slot lists
 *  edit_type_row under "show". `form_opts = edit_form_opts.reverse_merge
 *  success: edit_success` - edit_form_opts (:64-67) carries the two
 *  data-slot form attrs; edit_success (editing.rb:31-33, the override
 *  stub) is nil so success_tags (form_elements.rb:11-13) renders "" - the
 *  capture has NO success hidden tags.
 *
 *  card_form (:186-195 form.rb): @form_root = true; hidden = nil; form_for
 *  card, {url: path(action: :update), html: {class: "card-form slotter
 *  autosave" (card_form_html_opts :204-211 - slotter unless redirect,
 *  autosave for :update), "data-slot-selector": "modal-origin",
 *  "data-slot-error-selector": ".card-slot"}, remote: true}. Rails
 *  form_for (persisted record) emits the utf8 enqueuer + the _method
 *  patch spoof verbatim (form_tag_helper.rb:980 + method_tag,
 *  autocomplete="off"), the dom id "edit_card_<id>", and NO
 *  authenticity_token (decko config:
 *  embed_authenticity_token_in_remote_forms = false - the captured form
 *  carries none; tokens ride the meta tag per Rails 7.2 forgery
 *  verification, request_forgery_protection.rb).
 *
 *  The body is output([edit_view_hidden (editing.rb:35-36, nil),
 *  _render_edit_type_row(home_view: :edit_type_row),
 *  _render_content_formgroups, _render(voo.buttons_view || :edit_buttons)])
 *  - newline-joined, the nil dropped. home_view rides the edit_type_row
 *  voo (the captured edit_type_row slot JSON carries it). */
const editFormView: ViewFn = ({ fmt, voo }) => {
  voo.showViz("edit_type_row"); // the view body's voo.show :edit_type_row
  voo.hide("edit_type_row"); // edit_form's own hide - first-write no-op
  const form =
    `<form class="card-form slotter autosave" id="edit_card_${fmt.card.id}"` +
    ` data-slot-selector="modal-origin" data-slot-error-selector=".card-slot"` +
    ` action="/update/${fmt.urlKey()}" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    output([
      undefined, // edit_view_hidden (editing.rb:35-36, the override stub)
      fmt.renderView("edit_type_row", { home_view: "edit_type_row" }),
      fmt.renderView("content_formgroups"),
      fmt.renderView(voo.opts["buttons_view"] === undefined ? "edit_buttons" : String(voo.opts["buttons_view"])),
    ]) +
    `</form>`;
  return modSlotWrap({ fmt, voo }, "edit_form", form);
};

// --- all/edit_content.rb (the :edit view) + the modal machinery ------------

/** modal.rb:40-44 view :close_modal_link, unknown: true:
 *  `link_to icon_tag(:close), path: "", class: "_close-modal btn-close",
 *  "data-bs-dismiss": "modal"` - path "" bypasses Card::Path and href is
 *  appended LAST by link_to (links.rb:101-106), so the attribute order is
 *  class, data-bs-dismiss, href (the layout port's closeModalLinkView
 *  carries the identical bytes). */
function closeModalLink(): string {
  return `<a class="_close-modal btn-close" data-bs-dismiss="modal" href="">${icon("close")}</a>`;
}

/** menu.rb:85-97 board_link(confirm: true): base opts {class:
 *  "board-link", title: "Advanced", "data-bs-toggle": "tooltip",
 *  "data-bs-placement": "bottom"}; in_modal adds "data-slotter-mode"
 *  "modal-replace"; confirm_edit_loss (:205-209) add_class "_confirm" +
 *  "data-confirm-msg" (the en locale format_confirm_edit_loss: "Unsaved
 *  changes will be lost. Do you want to proceed?"); link_to_view :board
 *  adds the slotter class + rel nofollow + data-remote, href appended
 *  last (the captured attr order). The text is "#{board_icon} " (empty
 *  text arg -> the icon and its trailing space). */
function boardLink(fmt: ViewContext["fmt"]): string {
  return (
    `<a rel="nofollow" class="board-link _confirm slotter" title="Advanced"` +
    ` data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal-replace"` +
    ` data-confirm-msg="Unsaved changes will be lost. Do you want to proceed?"` +
    ` href="/${fmt.urlKey()}/board" data-remote="true">${icon("space_dashboard")} </a>`
  );
}

/** menu.rb:24 wrapper :modal_menu (:24 in modal.rb - `wrapper :modal_menu,
 *  :div, class: "modal-menu _modal-menu ms-auto"`) around
 *  edit_modal_menu (edit_content.rb:37-41):
 *  `[render_close_modal_link, board_link(confirm: true)]` - the array
 *  joins "\n" inside the div (the captured bytes). */
function editModalMenu(fmt: ViewContext["fmt"]): string {
  return `<div class="modal-menu _modal-menu ms-auto">${[closeModalLink(), boardLink(fmt)].join("\n")}</div>`;
}

/** all/edit_content.rb:28-33 view :edit, perms: :update, unknown: true,
 *  cache: :never, wrap: { modal: { footer: "", size: :edit_modal_size,
 *  title: :render_title, menu: :edit_modal_menu } }:
 *
 *  Body (edit_content.rb:34-38): add_name_context (context_names.rb - no
 *  byte effect on simple cards: no part keys, and the slot JSON's
 *  name_context key is only emitted non-empty); with_nest_mode :edit (the
 *  nested-field-editor flag - no nests on this surface, no byte effect);
 *  `voo.show :help`; `voo.hide :save_button` (the Save button drops from
 *  the captured :edit bytes); `wrap(true) { [frame_help,
 *  _render_edit_form] }` - wrap(true) is the SLOT wrap over the current
 *  view, the pair joined "\n". frame_help (frame.rb:33-37):
 *  `with_class_up "help-text", "alert alert-info" { _render :help }` -
 *  the class_up rides the voo chain; the captured cards have no help
 *  rule so the :help view renders the EMPTY slot wrap (card-mod-help's
 *  ported view).
 *
 *  The wrap config is the :modal WRAPPER (modal.rb:7-17 haml
 *  :modal_dialog): the modal-container div + the template's `//` comment
 *  line rendered as the literal HTML comment + the size classes
 *  (:edit_modal_size -> :large -> modal-lg, MODAL_SIZE modal.rb:1) +
 *  modal-header (title = :render_title - the title view's span; menu =
 *  :edit_modal_menu; both shown by default - visibility.rb show? = !hide?)
 *  + modal-body + NO footer (:footer "" is blank, the haml -if gate) +
 *  the four closers, one \n per line. The modal wrap config hash cannot
 *  ride ModViewConfig.wrap (a string list); the wrapper bytes are emitted
 *  here, exactly the layout port's modalView shape. */
const editView: ViewFn = ({ fmt, voo }) => {
  fmt.addNameContext();
  voo.showViz("help");
  voo.hide("save_button");
  voo.classUp("help-text", "alert alert-info"); // frame_help with_class_up
  const body = modSlotWrap(
    { fmt, voo },
    "edit",
    [fmt.renderView("help"), fmt.renderView("edit_form")].join("\n"),
  );
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog modal-dialog-centered modal-lg'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `${fmt.renderView("title")}\n`;
  out += `${editModalMenu(fmt)}\n`;
  out += "</div>\n";
  out += `<div class='modal-body'>\n${body}\n</div>\n`;
  // the haml closers after the modal-body div: modal-content, the size
  // div, the container - one flush-left </div> per line, each followed by
  // \n (the captured bytes end "</div>\n" x4 including the body close)
  out += "</div>\n</div>\n</div>\n";
  return out;
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
    // edit_modal_menu, edit_form_opts.
    // Ported (write-path slice 3, byte-verified against
    // fixtures/captured/edit-forms.json): :edit_form and :edit (the CORE
    // EDIT-FORM PATH - the card_form update form, the edit_type_row slot,
    // the content formgroups fieldset, the edit buttons, the modal wrap).
    // edit_modal_size/edit_modal_menu/edit_form_opts are inlined in the
    // view fns above (editModalMenu, the form attrs, modal-lg).
    setPath: "all/edit_content",
    formats: {
      html: {
        views: [
          {
            view: "edit_form",
            viewFn: editFormView,
            // Ruby: view :edit_form, wrap: :slot (the wrap config record;
            // the slot wrap bytes are emitted in the view fn)
            config: { cache: "never", wrap: "slot" },
          },
          {
            // Ruby: view :edit, perms: :update, unknown: true, cache:
            // :never, wrap: { modal: {...} } (the modal wrap config hash
            // is emitted in the view fn; the perms directive rides the
            // name-keyed registry in permissions/view-perms.ts, which
            // already carries edit -> update)
            view: "edit",
            viewFn: editView,
            config: { perms: "update", unknown: true, cache: "never" },
          },
        ],
      },
    },
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
    // set/all/edit_type.rb: :edit_type_row ported (the captured edit-form
    // type row - label + type link + board_type_formgroup edit link;
    // edit_type/edit_type_form/board_type_formgroup/type_formgroup remain
    // rails-runtime: frame, card_form, select_tag, grouped_options_for_
    // select, formgroup, edit_row haml for the other rows), + type_field,
    // raw_type_options, wrap_type_formgroup, type_field_options,
    // simple_type_field_options, multi_type_field_options,
    // current_type_value, grouped_types, standard_grouped_types,
    // visible_cardtype_groups. NOT ported: rails-runtime.
    setPath: "all/edit_type",
    formats: {
      html: {
        views: [{ view: "edit_type_row", viewFn: editTypeRowView }],
      },
    },
  },
  {
    // set/all/editing.rb: :board, :cardboard, board_parts, edit_success
    // (inlined - nil override stub), edit_view_hidden (inlined - nil),
    // :edit_buttons (PORTED - the button formgroup), :just_deleted
    // (PORTED), :edit_rules, :edit_structure, :edit_nests.
    setPath: "all/editing",
    formats: {
      html: {
        views: [
          { view: "edit_buttons", viewFn: editButtonsView },
          { view: "just_deleted", viewFn: justDeletedView, config: { unknown: true } },
        ],
      },
    },
  },
  {
    // set/all/editor.rb: input_type, input_type_from_rule, input_method,
    // input_defined_by_card, with_card, default_input_type,
    // rich_text_input, text_area_input, text_field_input, hidden_input,
    // placeholder_text.
    // Ported (write-path slice 3): :input - the captured surface's
    // resolved branch (rich_text -> the tinymce editor input; the
    // try-chain, ace/plain/hidden/defined-by-card branches are the
    // rails-runtime remainder, documented on the view fn).
    setPath: "all/editor",
    formats: {
      html: {
        views: [
          {
            view: "input",
            viewFn: inputView,
            config: { unknown: true, cache: "never" },
          },
        ],
      },
    },
  },
  {
    // set/all/form.rb: :content_formgroups, :content_formgroup,
    // :conflict_tracker ported (the captured edit-form content fieldset:
    // formgroup div + label + editor div + conflict tracker hidden field
    // + the input view); :name_formgroup, :edit_in_form + wrap_content_
    // formgroup, button_formgroup (inlined in the edit_buttons view fn),
    // name_field, content_field (inlined), edit_slot (inlined),
    // inline_nests_editor?, multi_card_editor?, edit_fields?,
    // in_multi_card_editor?, single_card_edit_field (inlined),
    // editor_in_multi_card, wrap_editor_in_multi_card, multi_card_edit,
    // structure_link, form, new_form, reset_form, form_prefix,
    // simple_form?, edit_in_form_prefix, explicit_form_prefix,
    // form_context, form_root?, form_root, card_form (inlined in the
    // edit_form view fn), hidden_form_tags, card_form_opts,
    // card_form_html_opts, interpret_main_success_opts,
    // card_form_url_and_action, editor_wrap (inlined), add_junction_class.
    // NOT ported: rails-runtime (form_for, form helpers, wrap_with
    // :fieldset for other branches, formgroup, text_field, frame).
    setPath: "all/form",
    formats: {
      html: {
        views: [
          {
            view: "content_formgroups",
            viewFn: contentFormgroupsView,
            config: { unknown: true, cache: "never" },
          },
          {
            view: "content_formgroup",
            viewFn: contentFormgroupView,
            config: { unknown: true, cache: "never" },
          },
          {
            view: "conflict_tracker",
            viewFn: conflictTrackerView,
            config: { unknown: true, cache: "never" },
          },
        ],
      },
    },
  },
  {
    // set/all/form_buttons.rb: standard_submit_button (inlined in the
    // edit_buttons view fn), standard_save_button (inlined),
    // standard_save_and_close_button (inlined), standard_cancel_button,
    // modal_cancel_button (inlined), edit_cancel_button (inlined),
    // new_cancel_button, delete_button (inlined), delete_button_opts
    // (inlined), delete_confirm (inlined), delete_success (the non-main?
    // branch inlined; main? is the page layer's remainder). NOT ported:
    // rails-runtime (form.send, button_tag, link_to, modal_close_button,
    // voo.hide?(:save_button) consumers outside the captured surface).
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
