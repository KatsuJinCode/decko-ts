// The card-mod-edit gem (card-mod-edit-0.20.0), ported through the mod
// loader - the mod that supplies the editing surface (new/edit forms, edit
// rules, type editor, board, conflict tracker, haml-driven templates).
//
// The gem's tree (the installed
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
// Ported (35 of 42 mod-specific html views) - the 2 earlier literal/
// composed views, the 8 views of the CORE EDIT-FORM PATH (write-path
// slice 3; fixtures/captured/edit-forms.json), the 9 views of the
// NAME-EDITOR and TYPE-SHIFT surfaces (write-path slice 4;
// fixtures/captured/edit-name-type.json - the framed rename editor, the
// bare rename form, the name formgroup, the name row, the framed type
// editor, the bare type form, the type formgroup select, its
// _live-type-field slot variant, and the new_buttons formgroup; the
// capture contract + normalizations live in
// tests/card/mod-loader/oracle-capture-edit-name-type.rb), and the 16
// views of the EDIT-VIEWS lane (fixtures/captured/edit-views.json - the
// inline-editing surface :edit_inline/:edit_inline_buttons/:edit_row/
// :edit_in_form, the create surface :new/:new_in_modal/:new_fields/
// :new_type_formgroup/:simple_new/:new_in_modal_buttons, the board-tab
// :guide_tab delegate, the :edit_nests/:edit_structure placeholder
// branches, the read-form :read_form/:read_formgroup and the
// :overlay_guide; capture contract in
// tests/card/mod-loader/oracle-capture-edit-views.rb - see the
// edit-views section below the slice-4 code for the per-view citations
// and the disclosed remainders):
// - set/all/template_nest.rb:3-12 :template_nest - BOTH branches: the
//   else branch returns `"{{#{voo.nest_syntax}}}"` as a literal string, and
//   the field-only branch calls `with_nest_mode :normal` + `nest
//   template_link_set_name, view: :template_link` (ported by the
//   fix-d2-dangling-description lane; `templateLinkView` itself lives in
//   render/views.ts, and fix-d9-warm-map-junction-load seats the junction
//   card that composed name resolves to — see the view fn below).
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
// - all/board, all/board/* except tab_views' :guide_tab (board, cardboard,
//   board_pills, board.haml, follow_section, related_section,
//   tab_visibility + tab_views' :engage_tab/:history_tab/:related_tab/
//   :rules_tab/:follow_section): modal/haml/nest/tabs/pills, modal-overlay
//   layout (board.haml col-8/col-4 grid), tabs, the board act renderer,
//   the follow button group, the related_items link chains, set_select -
//   rails-runtime (wrap_with_modal, haml, list_tag, tabs helper,
//   field_nest, board_pill_sections; :edit_rules nests
//   board_rules_tab - unported)
// - all/edit_content.rb :edit, :edit_form: card_form,
//   _render_content_formgroups, _render_edit_buttons, modal wrap, frame
//   helper - rails-runtime
// - all/edit_inline.rb :edit_inline, :edit_inline_buttons, :edit_row
//   PORTED (edit-views lane, see above)
// - all/edit_name.rb :edit_name, :name_form PORTED (slice 4, see above);
//   name_form/edit_name_skip_referers/edit_name_success/edit_name_buttons/
//   rename_button inlined in the view fns
// - all/edit_type.rb :edit_type, :edit_type_form, :board_type_formgroup,
//   :type_formgroup PORTED (slice 4, see above); type_field,
//   raw_type_options, wrap_type_formgroup, type_field_options,
//   simple_type_field_options, multi_type_field_options,
//   current_type_value, grouped_types, standard_grouped_types,
//   visible_cardtype_groups inlined in the view fns
// - all/editing.rb :board, :cardboard, :edit_rules remain rails-runtime
//   (modal wrap, breadcrumb_data, board_parts, nest board_rules_tab);
//  :edit_structure/:edit_nests PORTED (the
//   no-structure/no-nests branches; the structure/nested-editor branches
//   are the disclosed remainders documented on the view fns)
// - all/editor.rb :input's try-chain siblings: input_method dispatch
//   through text_area_input, text_field_input, hidden_input,
//   input_defined_by_card (with_card + nest), default_input_type,
//   with_card (Card[] fetch), input_type_from_rule (the *input type rule
//   read) - PORTED (input-remainders lane; :input's captured branch was
//   slice 3, see above)
// - all/form.rb:edit_in_form PORTED (the
//   editor_in_multi_card branch; the structure/inline-nests edit_slot
//   branches are the disclosed remainders); the form/prefix machinery
//   (form, new_form, reset_form, form_prefix, simple_form?,
//   edit_in_form_prefix, explicit_form_prefix, form_context, form_root?,
//   form_root, hidden_form_tags, card_form_opts, card_form_html_opts,
//   interpret_main_success_opts, card_form_url_and_action), name_field,
//   multi_card_edit, structure_link (inlined in :edit_nests), the
//   formgroup helper chain (inlined in :edit_in_form) - rails-runtime
//   (form_for, form helpers)
// - all/form_buttons.rb: FIELD_HELPERS define_method loop + standard_
//   submit_button, standard_save_button, standard_save_and_close_button,
//   standard_cancel_button, modal_cancel_button, edit_cancel_button,
//   new_cancel_button, delete_button, delete_button_opts, delete_confirm,
//   delete_success - rails-runtime emitters, INLINED in the ported view
//   fns (the captured byte shapes; cancel_in_place_button inlined in the
//   :edit_inline_buttons view fn)
// - all/form_elements.rb: FIELD_HELPERS dispatch define_method loop
//   (same shape as form_buttons) + success_tags, hidden_tags,
//   process_hidden_value, submit_button, cancel_button, cancel_strategy,
//   path_to_previous - rails-runtime (hidden_field_tag inlined above with
//   the captured attr order; cancel_button/cancel_strategy inlined in
//   cancelInPlaceButton)
// - all/formgroup.rb :read_form, :read_formgroup PORTED (edit-views lane
//   - the empty-configs branch and the haml template; the nested-field
//   arm is the disclosed remainder); the formgroup helper chain is
//   inlined in the :edit_in_form view fn
// - all/new.rb :new, :new_in_modal, :simple_new, :new_fields,
//   :new_in_modal_buttons, :new_type_formgroup PORTED (edit-views lane,
//   see above); the unnamed-card arms and the params surfaces
//   (params[:name_prompt]/params[:type]) are the page layer's remainders
//   (the oracle's new_card fixture section records the unnamed-card
//   bytes); the *thanks rule read falls back to "_self" (NEW_SUCCESS_MARK)
// - all/overlay_guide.rb:overlay_guide PORTED (the haml
//   template bytes + the inlined guide helper set)
// - all/template_nest.rb :template_nest field_only branch - PORTED
//   with_nest_mode :normal + nest
//   template_link_set_name, view: :template_link (the template_link set
//   card), with the composition shared with the engine's junction warm
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

import { rubyBacktraceError, type ViewContext, type ViewFn } from "../../render/format.js";
import { serializerFollowsLive } from "../../render/deployment-follow-live-config.js";
import { DeckoName } from "../../name.js";
import { emitAttrs, h, newSlotId, slotOptionsJson } from "../../render/slot-html.js";
import { RenderFormat, str, type ViewResult } from "../../render/format.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import { createFormShell, successTags } from "../mod-form-substrate.js";
import { readFormgroupBody, templateLinkSetNameFromParts } from "../../render/views.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import { parseNestOptions, scanNests } from "../../render/nest-syntax.js";
import { virtualSearchCqlFor } from "../../fetch/virtual-search-cards.js";
import { safeSetKeys } from "../../render/set-keys.js";
import { findAssignedTypeName } from "../../set-patterns/set-type-assignment.js";
import { getNameEnvironment } from "../../name/environment.js";
import { modRuleSeedContentForCandidate } from "../mod-rule-seeds.js";
import { renderRecaptchaConfig } from "../../render/render-recaptcha-config.js";
import { recaptchaFormOn, recaptchaHiddenFormTags } from "./card-mod-recaptcha.js";
import { timeAgoInWords, actSummaryBadge } from "./card-mod-history.js";
import { ruleSidesStatement } from "./rule-card-warm.js";
import { cardWallClockNow } from "../../wall-clock.js";
import type {
  DeckoModManifest,
  ModEngineHost,
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
function output(parts: (ViewResult | undefined)[]): string {
  // Ruby's join is to_s over the compacted array (content.rb:70-73) - the
  // per-part str() once view bodies may answer numbers/null.
  return parts
    .filter((part): part is Exclude<ViewResult, null> => part !== undefined && part !== null)
    .map(str)
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

/**
 * all/template_nest.rb:33-41 `on_type_set`: the LEFT NAME of the template
 * set whose right part is the `type` codename card, else nil.
 *
 *   `(tmpl_set_name = parent.card.name.trunk_name) &&
 *    (tmpl_set_class_name = tmpl_set_name.tag_name) &&
 *    (tmpl_set_class_card = Card[tmpl_set_class_name]) &&
 *    (tmpl_set_class_card.codename == :type) ? tmpl_set_name.left_name : nil`
 *
 * `trunk_name`/`tag_name` answer self for a simple name (parts.rb:102-105,
 * :126-128), so both are always present; the two real gates are the
 * `Card[...]` fetch and the codename comparison. `Role+*type+*default` ->
 * trunk `Role+*type`, tag `*type` (codename `type`) -> `Role`.
 */
function onTypeSet(ctx: ViewContext): DeckoName | undefined {
  const parent = ctx.fmt.parent;
  if (parent === undefined) return undefined;
  const tmplSetName = parent.card.name.trunkName;
  const tmplSetClassCard = ctx.fmt.engine.fetchRenderCard(tmplSetName.tagName.s);
  if (tmplSetClassCard === undefined || tmplSetClassCard.record.codename !== "type") return undefined;
  return tmplSetName.leftName;
}

/** all/template_nest.rb:23-31 `template_link_set_name_for_relative_name`:
 *  `name = name.fully_stripped; (type = on_type_set) ?
 *   [type, name].to_name.field_name :type_plus_right :
 *   name.to_name.field_name :right`.
 *
 *  The composition itself is the shared `templateLinkSetNameFromParts`
 *  (render/views.ts) — the engine's prepare-phase junction warm
 *  (render.ts#enrichTemplateLinkSetJunctions) composes the SAME names to
 *  seat the real junction cards, and a private copy here would let the two
 *  drift. Only the `on_type_set` GATE stays here: it needs the live
 *  `fetchRenderCard` the view context carries.
 *
 *  Live shape (corpus 6a44dfdc, page 105 `Role+*type+*default`, oracle
 *  shard 000000): `+description` in that rule's content resolves to the
 *  junction `Role+description+*type plus right` (corpus left card 225,
 *  right set card 262) - a junction with NO row, so the nest renders an
 *  unknown card and the set name is the whole observable. `+*members`
 *  composes `Role+*members+*type plus right`, which DOES have a row
 *  (45421) - see render.ts#enrichTemplateLinkSetJunctions.
 *
 *  Exported so the composition-drift pin can call THIS wrapper alongside the
 *  shared function it delegates to: a copy of the body here, or a change to
 *  the base the wrapper hands down, is invisible to a test that only calls
 *  templateLinkSetNameFromParts. See
 *  tests/card/render/d9-template-link-junction-warm-composition.test.ts. */
export function templateLinkSetNameForRelativeName(ctx: ViewContext, nestName: DeckoName): DeckoName {
  return templateLinkSetNameFromParts(onTypeSet(ctx), nestName);
}

/** all/template_nest.rb:14-21 `template_link_set_name`: an absolute nest
 *  name takes its own `+*self`; a relative one goes through
 *  template_link_set_name_for_relative_name. */
function templateLinkSetName(ctx: ViewContext, nestName: DeckoName): DeckoName {
  if (nestName.isAbsolute) return nestName.fieldName({ codename: "self" });
  return templateLinkSetNameForRelativeName(ctx, nestName);
}

/** all/template_nest.rb:3-12 :template_nest, cache: :never, unknown: true.
 *  TWO branches, both now ported:
 *   - `voo.nest_name.to_name.field_only?` -> `with_nest_mode :normal {
 *      nest template_link_set_name, view: :template_link }`. A field-only
 *      name is a single relative junction (`+description`), and under
 *      :template mode that junction has no card to render - the answer is
 *      the SET card that owns the rule (`Role+description+*type plus right`),
 *      rendered through :template_link.
 *   - else `"{{#{voo.nest_syntax}}}"` - the syntax echoed so the template
 *      renderer substitutes it once the target exists.
 *
 *  :template mode is entered by card-mod-content's Abstract::TemplatedNests
 *  (`set/right/default.rb:1` / `set/right/structure.rb:1` include_set,
 *  abstract/templated_nests.rb:1-7 `view :core { with_nest_mode :template
 *  { super() } }`), so every `*default`/`*structure` rule body's nests land
 *  here. The nest_syntax guard stays inside the else branch: Ruby's body
 *  never reads nest_syntax on the field-only arm.
 *
 *  The programmatic nest carries no nest_syntax (nest.rb:28-31 sets only
 *  nest_name; the slot JSON gate is format.ts's chunkNestSyntax presence),
 *  which is what the oracle's data-slot shows: {"view":"template_link",
 *  "nest_name":"Role+description+*type plus right","show":["template_link"],
 *  "home_view":"template_link","name_context":"role"} - no nest_syntax key. */
export const templateNestView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const nestName = voo.opts["nest_name"];
  // `return "" unless voo.nest_name`: only nil returns early (an empty
  // string is truthy in Ruby, so the blank reference {{}} reaches the
  // syntax arm below).
  if (nestName === undefined || nestName === null) return "";
  const name = DeckoName.parse(String(nestName));
  // field_only? (fields.rb:33-35): relative name containing only the
  // rightmost part.
  if (name.fieldOnly) {
    const setName = templateLinkSetName(ctx, name);
    return fmt.withNestMode("normal", () =>
      fmt.nest({
        syntax: "",
        name: setName.s,
        options: { view: "template_link", extra: {} },
        comment: undefined,
      }),
    );
  }
  // "{{#{voo.nest_syntax}}}": a nil or empty syntax interpolates as "",
  // so the blank reference renders "{{}}".
  const syntax = voo.opts["nest_syntax"];
  return `{{${typeof syntax === "string" ? syntax : ""}}}`;
};

/** all/editing.rb:46-48 :just_deleted, unknown: true: `wrap { "#{render_
 *  title} deleted" }`. `wrap` (card-mod-format set/all/html/wrap.rb:6-10
 *  + slot_attributes :22-28) is the FULL SLOT WRAP: id
 *  `<safe-key>-just_deleted-view`, class "card-slot just_deleted-view"
 *  + the card's set keys, the data-card-* attrs and the data-slot JSON
 *  ({view: just_deleted, show:[just_deleted]}). The graded corpus pins
 *  the wrap on the Note 001 row (a bare `<div>` was the earlier
 *  reading). `render_title` is the title view, ported in
 *  src/card/render/views.ts#titleView (card-mod-format set/all/title.rb).
 *  unknown: true means a deleted card whose view substitution routed
 *  here. The title view runs through the format's normal voo machinery,
 *  so an unknown card still gets the title span (no read-permission
 *  denial: :just_deleted is `perms: :none`-implicit because the
 *  unknown-card substitution routes to it before the read-permission
 *  check, view/permission.rb#skip_check? for unknown-card
 *  substitutions). */
const justDeletedView: ViewFn = ({ fmt, voo }) => {
  const title = fmt.renderView("title");
  return modSlotWrap({ fmt, voo }, "just_deleted", `${title} deleted`);
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
/** standard_save_and_close_button's text arg (form_buttons.rb:29-38:
 *  `text = opts[:text] || "Save and Close"` - :new_in_modal_buttons passes
 *  "Submit"). */
function standardSaveAndCloseButton(text = "Save and Close"): string {
  return `<button name="button" type="submit" data-disable-with="Submitting" data-cy="submit-modal" class="submit-button me-3 _close-on-success _update-origin btn btn-primary">${text}</button>`;
}

/** all/form_buttons.rb:45-50 modal_cancel_button -> modal_close_button
 *  "Cancel", situation: "secondary", class: "cancel-button" (modal.rb:
 *  59-63 MODAL_CLOSE_OPTS {type: "button", "data-bs-dismiss": "modal",
 *  "data-cy": "close-modal"}; bootstrap appends btn btn-secondary). */
function modalCancelButton(): string {
  return `<button name="button" type="button" data-bs-dismiss="modal" data-cy="close-modal" class="cancel-button btn btn-secondary">Cancel</button>`;
}

/** The `structure_rule_card` fetch posture (templating.rb:44-47:
 *  `rule_card :structure, skip_modules: true`): the card instances that
 *  fetch returns never get their set modules included (card/fetch/
 *  results.rb:11 `card.include_set_modules unless skip_modules?`), so the
 *  rule-set card methods the render calls on that instance downstream are
 *  ABSENT. The engine's cards carry every set semantic by construction; this
 *  registry marks the instances standing for Ruby's module-less ones, so the
 *  affected rule-set method ports reproduce the absence (the delete_confirm
 *  raise below; the rule set's help override is absent with it, which the
 *  engine's help view already models by not porting an override). */
const structureRuleFetchInstances = new WeakSet<object>();

/** all/form_buttons.rb:56-77 delete_button + delete_button_opts +
 *  delete_confirm + delete_success (NOT main? branch - the engine render
 *  surface is non-focal; the main? branch is the page layer's remainder):
 *  add_class "slotter btn btn-outline-danger ms-auto"; data-confirm
 *  "Are you sure you want to delete #{safe_name}?"; path action :delete,
 *  success {view: :just_deleted}; remote. link_to (links.rb) appends href
 *  then data-remote LAST; the success hash rides the query string
 *  Rails-deep-encoded (success[view]=just_deleted percent-encoded).
 *
 *  On a card whose instance came from the structure_rule_card fetch (the
 *  skip_modules posture above) the Rule set's delete_confirm override runs
 *  instead (rule_form/buttons.rb:32-40, the rule card's format) and its
 *  `setting = card.rule_setting_name` (rules.rb:36-38) MISSES - ActiveRecord's
 *  attribute method_missing chain raises NoMethodError "undefined method
 *  `rule_setting_name' for an instance of Card". The reproduced upstream
 *  failure ruling: the oracle's answer for view:admin:Topic 001:edit_structure
 *  embeds the quiet render-error span carrying that debug page (168
 *  boot-inclusive Ruby frames in the committed capture at
 *  reference-harness/fixtures/synthetic-v2/expected, re-verified live on the
 *  capture host). The same override on a NON-flagged rule card works - the
 *  oracle's rule_edit page renders the delete button with the rule confirm
 *  text (the rule form's own edit_rule_buttons chain, a card fetched without
 *  skip_modules) - so the flag decides, exactly the upstream instance
 *  posture; the declared frame structure carries the oracle's measured
 *  boot-inclusive depth (rubyBacktraceError, the N6 frame-count port-work
 *  statement). */
function deleteButton(fmt: ViewContext["fmt"]): string | undefined {
  if (fmt.card.id === undefined) return undefined; // `return unless card.real?`
  if (
    structureRuleFetchInstances.has(fmt.card) &&
    (fmt.engine.cardMatchesRuleSet?.(fmt.card) ?? false)
  ) {
    throw rubyBacktraceError(
      "undefined method `rule_setting_name' for an instance of Card",
      168,
    );
  }
  const name = h(fmt.card.name.s);
  return `<a class="slotter btn btn-outline-danger ms-auto" data-confirm="Are you sure you want to delete ${name}?" href="/delete/${fmt.urlKey()}?success%5Bview%5D=just_deleted" data-remote="true">Delete</a>`;
}

/** all/editing.rb:24-27 button_formgroup:
 *  `wrap_with :div, class: "form-group #{classy 'button-form-group'}"` -
 *  classy resolves the classUp extras (the rename form's
 *  edit_name_buttons class_up lands AFTER the base class). */
function buttonFormGroup(ctx: ViewContext, inner: string): string {
  return `<div class="form-group ${ctx.voo.classy("button-form-group")}">${inner}</div>`;
}

/** all/editing.rb:37-41 view :edit_buttons:
 *  `button_formgroup { [standard_submit_button, edit_cancel_button,
 *  delete_button] }` - standard_submit_button (form_buttons.rb:3-5) is
 *  [standard_save_button, standard_save_and_close_button]; the array
 *  rides output() (newline-joined, nils compacted - the hidden Save
 *  button drops WITHOUT a blank line in the captured :edit bytes). */
export const editButtonsView: ViewFn = ({ fmt, voo }) =>
  buttonFormGroup(
    { fmt, voo },
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
export const editTypeRowView: ViewFn = ({ fmt, voo }) => {
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
export const conflictTrackerView: ViewFn = ({ fmt, voo }) => {
  if (fmt.card.id === undefined) return ""; // `return unless card&.real?`
  const value = fmt.card.record.currentRevisionId;
  // hidden_field :last_action_id_before_edit — the name rides the form
  // builder's prefix (form.rb:147-160 form_prefix: "card" for the form's
  // own card, "card[subcards][+summary]" for a structured-form field — the
  // graded board fieldset pins the prefixed names).
  const prefix =
    typeof voo.opts["form_name_prefix"] === "string" && voo.opts["form_name_prefix"] !== ""
      ? (voo.opts["form_name_prefix"] as string)
      : "card";
  const name = `${prefix}[last_action_id_before_edit]`;
  // Rails sanitize_to_id: delete("]") then tr("^-a-zA-Z0-9:.", "_") — the
  // starred marks' * lands as _ (the graded setup row pins
  // card_subcards___account_subcards___email_last_action_id_before_edit).
  const id = name.replace(/\]/g, "").replace(/[^-a-zA-Z0-9:.]/g, "_");
  // Rails' tag helper SKIPS nil values (tag_helper.rb:298) — a card with
  // no actions has last_action_id nil and the value attribute vanishes
  // (the graded setup row's +*password field: no value attr at all).
  const valueAttr = value === undefined || value === null
    ? ""
    : ` value="${h(String(value))}"`;
  return `<input class="current_revision_id form-control" autocomplete="off" type="hidden"${valueAttr} name="${h(name)}" id="${h(id)}" />`;
};

/** The TYPE-set format-helper input_type overrides - Ruby's set-module MRO
 *  serves the type module's `input_type` method (a format :html helper,
 *  not a view) before all/editor's default. Each entry cites its gem:
 *  - html: card-mod-format set/type/html.rb:19-21 (:ace_editor)
 *  - markdown: card-mod-markdown set/type/markdown.rb:20-24 (:ace_editor,
 *    ace_mode :markdown)
 *  - json: card-mod-format set/type/json.rb:34-40 (:ace_editor, :json)
 *  - number/phrase/uri: card-mod-format set/type/{number,phrase,uri}.rb
 *    (:text_field)
 *  - plain_text: card-mod-format set/type/plain_text.rb:2-4 (:text_area)
 *  The ace_mode default (:html) lives in card-mod-ace_editor
 *  set/all/ace_editor.rb:18-20. */
const TYPE_FORMAT_INPUT_TYPE: Readonly<
  Record<string, { method: string; aceMode?: string }>
> = {
  html: { method: "ace_editor", aceMode: "html" },
  markdown: { method: "ace_editor", aceMode: "markdown" },
  json: { method: "ace_editor", aceMode: "json" },
  // card-mod-search set/type/search_type.rb:1 `include_set Type::Json` —
  // the Search type inherits the Json type's input override
  // (card-mod-format set/type/json.rb:32-40 input_type :ace_editor +
  // ace_mode :json; the graded edit_nests row pins the All Topics editor
  // as the ace json textarea).
  search_type: { method: "ace_editor", aceMode: "json" },
  number: { method: "text_field" },
  phrase: { method: "text_field" },
  uri: { method: "text_field" },
  plain_text: { method: "text_area" },
  // card-mod-list set/abstract/01_list/html_views.rb:40-42 default_input_type
  // :list — the abstract is included in both the Pointer and the List type
  // sets, so both type codes answer the list editor.
  pointer: { method: "list" },
  list: { method: "list" },
};

/** all/editor.rb:9-11 input_type_from_rule:
 *  `card.rule(:input_type)&.gsub(/[\[\]]/, "")&.tr(" ", "_")` - the
 *  *input type rule's content with brackets stripped and spaces
 *  underscored ("[[text area]]" -> "text_area"). The rule read itself is
 *  card.rule (card-1.110.0 lib/card/rule/all.rb:5-7,
 *  `rule_card(setting_code, skip_modules: true)&.db_content`) - the
 *  set-candidates walk in pattern-precedence order (rule/all.rb:13-15,
 *  66-73), with NO ok?(:read) check (unlike guide.rb:52's guide_card).
 *  No rule card -> nil -> undefined. Exported for the arm pins. */
export function inputTypeFromRule(
  ruleContent: string | undefined,
): string | undefined {
  return ruleContent === undefined
    ? undefined
    : ruleContent.replace(/[[\]]/g, "").replace(/ /g, "_");
}

/** The render-time *input type rule read feeding input_type_from_rule:
 *  the set-candidates walk (ruleNamesForCard - the same walk guideRuleCard
 *  runs for *guide, card-mod-edit.ts guideRuleCard) taking the FIRST
 *  EXISTING candidate's db_content. Ruby reads the rule unconditionally
 *  (no isDenied check here). No existing rule card -> undefined. */
function inputTypeRuleContent(ctx: ViewContext): string | undefined {
  const card = ctx.fmt.card;
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*input type")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // no rule at this pattern
    return record.dbContent;
  }
  return undefined;
}

/** all/editor.rb:18-30 input_defined_by_card + with_card:
 *  `with_card input_type do |input_card| nest input_card, view: :core end`
 *  where with_card (:25-30) is `card = Card[mark]; yield card if card`,
 *  rescuing Card::Error::CodenameNotFound -> nil. The mark is the
 *  input_type string itself - a NAME lookup (key "text_area" finds a card
 *  named "text area"); the CodenameNotFound arm is Ruby's codename-SYMBOL
 *  path (Card[:bogus] raises, :25-30 rescues) and has no TS surface - the
 *  engine's fetch is name-keyed, so both nil arms are the undefined fetch.
 *  A found card nests view :core (guide.rb:34-40 guide_text's nest shape,
 *  the card-mod-edit.ts guideText seam). */
function inputDefinedByCard(
  ctx: ViewContext,
  inputType: string | undefined,
): string | undefined {
  if (inputType === undefined) return undefined; // Card[nil]: no card, no yield
  const record = ctx.fmt.engine.fetchRenderCard(inputType);
  if (record === undefined) return undefined; // `yield card if card`
  return ctx.fmt.nest({
    syntax: `{{${record.name.s}|view:core}}`,
    name: record.name.s,
    options: parseNestOptions("view:core"),
    comment: undefined,
  });
}

/** all/editor.rb:32-38 view :input (cache: :never, unknown: true):
 *  `try(input_method(input_type)) || input_defined_by_card ||
 *  send(input_method(default_input_type))`.
 *
 *  input_type (:5-7): voo.input_type, else input_type_from_rule (:9-11 -
 *  ported above: inputTypeRuleContent walk + inputTypeFromRule transform;
 *  the captured cards carry no input rules, so the nil arm keeps the
 *  captured bytes), else the TYPE-set helper override (the MRO arm the
 *  table above carries - the type modules override the WHOLE input_type
 *  method, html.rb:19-21, so in Ruby those 7 types read neither the voo
 *  nor the rule; this port reads the voo first - the established slice-3
 *  shape - and the rule last; the ordering divergence is unobservable on
 *  the captured surface, which never sets both), else default_input_type
 *  :rich_text (:38-40).
 *
 *  The try-chain, in Ruby order:
 *  - try(input_method(input_type)) - respond_to?("#{input_type}_input"):
 *    this port carries ace_editor (card-mod-ace_editor set/all/
 *    ace_editor.rb:9-13), text_field (:51-53), text_area (:46-49),
 *    hidden_input (:55-57), rich_text (:42-44) and tinymce_editor
 *    (card-mod-tinymce_editor set/all/tinymce_editor.rb:9-13 - the
 *    "tinymce editor" rule value's direct arm, the same bytes the
 *    rich_text default reaches through rich_text_input). Any other
 *    input_type makes try nil, and the OTHER mods' input methods
 *    (calendar - card-mod-date set/all/calendar.rb:9; password -
 *    card-mod-account set/all/password_input.rb:2; checkbox/radio/select/
 *    list/autocomplete/bar_select/box_select and the list surfaces'
 *    hidden_input override - card-mod-list set/abstract/01_list/
 *    html_views.rb:36-89) are those mods' MRO surface, not this file's.
 *  - input_defined_by_card (:18-30, ported above) - the mark fetch +
 *    nest view :core.
 *  - send(input_method(default_input_type)) - rich_text -> the tinymce
 *    arm (the captured edit-form bytes).
 *
 *  - rich_text -> rich_text_input (:42-44) -> `send "#{Cardio.config.rich_
 *    text_editor || :text_area}_editor_input"` - the oracle deck configures
 *    the tinymce editor (form-substrate.json helper_facts.rich_text_editor
 *    = "tinymce"), so card-mod-tinymce_editor set/all/tinymce_editor.rb:9-13
 *    tinymce_editor_input: `text_area :content, rows: 3, class:
 *    "tinymce-textarea d0-card-content", id: unique_id`. The bootstrap
 *    FIELD_HELPERS wrapper appends " form-control"; unique_id is
 *    content.rb:69 "#{card.name.safe_key}-#{id_counter}" (the
 *    format-chain-shared counter, RenderFormat#uniqueId here).
 *  - ace_editor -> card-mod-ace_editor set/all/ace_editor.rb:9-14
 *    ace_editor_input: `text_area :content, rows: 5, class: "d0-card-content
 *    ace-editor-textarea", "data-ace-mode" => ace_mode` (+ the bootstrap
 *    form-control append; Rails appends the generated name/id AFTER the
 *    opts - the captured *all+*head/*guide bytes).
 *  - text_field -> text_field_input (:51-53) - the caller opts lead
 *    (class, then the placeholder opt at its hash position), then Rails'
 *    generated type/value/name/id.
 *  - text_area -> text_area_input (:46-49): rows 5, class d0-card-content,
 *    data-card-type-code.
 *  - hidden_input (:55-57) -> `hidden_field :content, class:
 *    classy("d0-card-content")` - hidden_field is the FIRST FIELD_HELPERS
 *    entry (card-mod-bootstrap set/all/bootstrap/form.rb:1-4), whose
 *    bootstrap_options appends " form-control" (:22-26); hidden_field_tag
 *    (actionview-7.2.3.2 form_tag_helper.rb:309-311) is `text_field_tag(
 *    name, value, options.merge(type: :hidden, autocomplete: "off"))`, so
 *    the input carries class, autocomplete, type, value, name, id in that
 *    order - the byte order the captured conflict_tracker hidden field
 *    shows (form.rb:27-31's own hidden_field, edit-forms.json).
 *  Rails' text_area emits the body after a newline (TagHelper
 *  PRE_CONTENT_STRINGS[:textarea] = "\n", tag_helper.rb:44) and
 *  content_tag-escapes it (the captured Home textarea shows &lt;div&gt;). */
export const inputView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const content = h(fmt.card.dbContent ?? "");
  // form.rb:147-160 form_prefix: the Rails builder's name prefix — "card"
  // for the form's own card (simple_form?), "card[subcards][+summary]" for a
  // field card rendered inside a multi-card edit form
  // (edit_in_form_prefix: "#{parent.form_prefix}[subcards][#{card.name.from
  // form_context.card.name}]", form.rb:160). The structured-form field
  // editors carry it through the nest opts (card-mod-edit multiCardEdit).
  const namePrefix = typeof voo.opts["form_name_prefix"] === "string"
    ? (voo.opts["form_name_prefix"] as string)
    : "card";
  const idPrefix = namePrefix === "card" ? "card" : namePrefix.replace(/\]/g, "").replace(/[^-a-zA-Z0-9:.]/g, "_");
  const vooInputType = voo.opts["input_type"];
  const typeArm =
    vooInputType !== undefined && typeof vooInputType === "string"
      ? { method: vooInputType }
      : (fmt.card.typeCode !== undefined
          ? TYPE_FORMAT_INPUT_TYPE[fmt.card.typeCode]
          : undefined);
  // editor.rb:9-11 the rule arm - consulted only when neither the voo nor
  // the TYPE-set override supplied an input_type
  const inputType =
    typeArm?.method ?? inputTypeFromRule(inputTypeRuleContent(ctx));
  const method = inputType ?? "rich_text"; // default_input_type (:38-40)
  if (method === "pointer" || method === "list") {
    // card-mod-list set/abstract/01_list/html_views.rb:32-57 view :input =
    // `_render_hidden_content_field + super()` — the hidden content field
    // (content.rb:57-59 hidden_field :content, class d0-card-content) then
    // list_input: ul.pointer-list-editor.pointer-list-ul with one
    // pointer-li per items_for_input item (item_names; EMPTY lists render
    // one blank row — items_for_input's `items.empty? ? [""] : items`) and
    // the _pointer-item-add button. The item inputs are text_field_tag
    // "pointer_item" (class pointer-item-text form-control, the options
    // card for the autocomplete, placeholder ""), the handle/remove/add
    // icons the material-icons set.
    const items = content === "" ? [""] : content.split("\n").filter((s) => s !== "");
    const itemRows = (items.length > 0 ? items : [""])
      .map(
        (item) =>
          `<li class="pointer-li mb-1">\n` +
          `  <span class="input-group">\n` +
          `    <span class="input-group-text handle"><i class="material-icons notranslate">reorder</i></span>\n` +
          `    <input class="pointer-item-text form-control" data-options-card="" placeholder="" type="text" value="${h(item)}" name="pointer_item" id="pointer_item" />\n` +
          `    <button class="pointer-item-delete btn btn-secondary" type="button"><i class="material-icons notranslate">remove</i></button>\n` +
          `  </span>\n` +
          `</li>`,
      )
      .join("\n");
    return (
      `<input class="d0-card-content form-control" autocomplete="off" type="hidden" value="${content}" name="${namePrefix}[content]" id="${idPrefix}_content" />\n` +
      `<ul class="pointer-list-editor pointer-list-ul">\n${itemRows}\n</ul>\n` +
      `<span class="input-group">\n` +
      `  <button class="_pointer-item-add btn btn-secondary" type="submit"><i class="material-icons notranslate">add</i>add another</button>\n` +
      `</span>`
    );
  }
  if (method === "ace_editor") {
    const mode = typeArm?.aceMode ?? "html"; // ace_editor.rb:18-20 default
    return `<textarea rows="5" class="d0-card-content ace-editor-textarea form-control" data-ace-mode="${mode}" name="${namePrefix}[content]" id="${idPrefix}_content">\n${content}</textarea>`;
  }
  if (method === "rich_text" || method === "tinymce_editor") {
    // rich_text_input (:42-44) -> the configured editor (tinymce on the
    // oracle deck); "tinymce_editor" (rule value "tinymce editor") lands
    // on the same tinymce_editor_input bytes (tinymce_editor.rb:9-13)
    const id = fmt.uniqueId();
    return `<textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="${id}" name="${namePrefix}[content]">\n${content}</textarea>`;
  }
  if (method === "text_field") {
    // editor.rb:51-53 text_field_input: class classy("d0-card-content") +
    // bootstrap form-control + placeholder "" (placeholder_text :59-62);
    // the opt's hash position is before Rails' generated attrs
    // (text_field_tag: caller options first, type/value/name/id appended)
    return `<input class="d0-card-content form-control" placeholder="" type="text" value="${content}" name="${namePrefix}[content]" id="${idPrefix}_content" />`;
  }
  if (method === "text_area") {
    // editor.rb:46-49 text_area_input: rows 5, class d0-card-content,
    // data-card-type-code (the codename)
    return `<textarea rows="5" class="d0-card-content form-control" data-card-type-code="${fmt.card.typeCode ?? ""}" name="${namePrefix}[content]" id="${idPrefix}_content">\n${content}</textarea>`;
  }
  if (method === "hidden") {
    // editor.rb:55-57 via input_method(:55): input_type "hidden" builds the
    // method name "hidden_input" (Ruby's "#{input_type}_input", :13-15) -
    // the dispatch keys here are the INPUT TYPES, so this is the "hidden"
    // arm: hidden_field :content, class classy("d0-card-content") - the
    // bootstrap form-control append, then hidden_field_tag's
    // autocomplete="off" + type="hidden" (caller opts first, generated
    // attrs after - the captured conflict_tracker order)
    return `<input class="d0-card-content form-control" autocomplete="off" type="hidden" value="${content}" name="${namePrefix}[content]" id="${idPrefix}_content" />`;
  }
  // try() missed - input_defined_by_card (:18-30), else the default arm
  const definedByCard = inputDefinedByCard(ctx, inputType);
  if (definedByCard !== undefined) return definedByCard;
  // rich_text default: the tinymce arm (the captured edit-form bytes)
  const id = fmt.uniqueId();
  return `<textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="${id}" name="${namePrefix}[content]">\n${content}</textarea>`;
};

/** all/form.rb:79-85 content_field: `with_nest_mode :normal { output
 *  [_render_conflict_tracker, _render_input] }` - nest_mode is the
 *  nested-field-editor flag; this surface (plain RichText content) renders
 *  no nests, so the mode has no byte effect. output() joins the two
 *  views with "\n" (the captured bytes newline between the hidden input
 *  and the textarea).
 *
 *  The conflict_tracker render rides Ruby's voo hide-discard
 *  (view.rb:68-69 View#process: `return if process_live_options == :hide`):
 *  when the caller hid :conflict_tracker (quick_editor.rb:111-112's
 *  `_render_content_formgroup hide: :conflict_tracker` - the hide lands in
 *  the content_formgroup voo and the child render's voo inherits it,
 *  visibility.rb:75-92), the render exits BEFORE dispatch and the hidden
 *  field vanishes from the bytes (the captured quick_edit chain). When
 *  shown, the registered :conflict_tracker view dispatches as before -
 *  byte-identical to the pinned edit-form captures. */
function contentField(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  // :conflict_tracker answers nil for a card that is not real (`return
  // unless card&.real?`), and output() compacts the nil away — no
  // separator line on a new card's form.
  const conflict = voo.show("conflict_tracker") && fmt.card.id !== undefined
    ? fmt.renderView("conflict_tracker")
    : undefined;
  return output([conflict, fmt.renderView("input")]);
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
export const contentFormgroupView: ViewFn = ({ fmt, voo }) => {
  const card = fmt.card;
  const attrs = emitAttrs({
    class: "form-group card-editor",
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": card.name.s === "" ? undefined : card.name.s,
    "data-card-link-name": h(fmt.urlKey()),
  });
  return (
    `<div${attrs}>` +
    `<label for="card_content">Content</label>\n` +
    `<div class="editor content-editor">${contentField({ fmt, voo })}</div>` +
    `</div>`
  );
};

/** form.rb:95-103 edit_slot — the CASE arm order is Ruby's:
 *  inline_nests_editor? (voo.input_type — the *input machinery's
 *  inline_nests arm, the engine-remainder) -> multi_card_editor? (:76-80)
 *  -> in_multi_card_editor? -> single_card_edit_field. The multi-card arm
 *  is PORTED here (the mod-completion-100 lane): the explicit-edit-fields
 *  walk the account family's content_formgroups ride. */
function editSlot(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  if (multiCardEditor(ctx)) return multiCardEdit(ctx, true);
  if (voo.show("type_formgroup") || voo.show("name_formgroup"))
    return str(fmt.renderView("content_formgroup"));
  return `<div class="editor content-editor">${contentField({ fmt, voo })}</div>`;
}

/** form.rb:76-80 multi_card_editor?: `voo.structure || voo.edit_structure ||
 *  card.structure || edit_fields?` — edit_fields? (:83-84) reads edit_fields
 *  = voo.edit_structure (chunk.rb:38-39), so the voo arms subsume it.
 *  card.structure (templating.rb:69-71) answers the *structure rule card
 *  unless its content is "_self". */
function multiCardEditor(ctx: ViewContext): boolean {
  const { voo } = ctx;
  return (
    voo.opts["structure"] !== undefined ||
    voo.opts["edit_structure"] !== undefined ||
    cardStructure(ctx) !== undefined
  );
}

/** templating.rb:60-66 structure_rule_card + :69-71 Card#structure, through
 *  the engine's sync structure universe (render.ts structureRuleForSync —
 *  the same resolveStructuredContent walk the core-view substitution runs;
 *  the "_self" arm answers undefined there). The rule card itself is in no
 *  render closure on a new/edit page, so a fetchRenderCard walk misses it. */
function cardStructure(
  ctx: ViewContext,
): { ruleName: string; content: string } | undefined {
  const card = ctx.fmt.card;
  // NO unknown? guard: a NEW card is unknown? (states.rb#unknown? =
  // !real?) and its structure template is exactly what /new/:type renders
  // (templating.rb:14-19 new_card_template - the /new/Topic form's own
  // structured fields). The type pattern's anchor is card.type_name
  // (03_type.rb#anchor_name); a new card's record may carry only the
  // typeId, so compose the name the engine's id map holds
  // (quick_fetch(type_id)&.name).
  const typeName =
    card.typeName ??
    (card.typeId !== undefined
      ? ctx.fmt.engine.peekNameForId?.(card.typeId)
      : undefined);
  return ctx.fmt.engine.structureRuleForSync?.({
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName,
    isNew: card.record.isNew === true,
  });
}

/** form.rb:115-122 multi_card_edit: `field_configs = edit_field_configs
 *  fields_only; return structure_link if field_configs.empty?;
 *  field_configs.map { |name, options| nest name, options || {} }.join
 *  "\n"`. The EXPLICIT arm (chunk.rb:57-61 explicit_edit_fields_config +
 *  :81-100 normalized_edit_field_config) walks voo.edit_structure's tuples:
 *  the mark normalizes to card.name.field(cardish) unless absolute/compound,
 *  the title defaults to the mark's name. The IMPLICIT arm (chunk.rb:63-70
 *  implicit_edit_fields_config: the STRUCTURE card's own nest chunks in
 *  content order) is the browser-journeys lane's port: the walk reads the
 *  structure rule card's content nests (nest-syntax scanNests), each config
 *  [nest_name, chunk options]. */
function multiCardEdit(ctx: ViewContext, fieldsOnly: boolean): string {
  const { fmt, voo } = ctx;
  const editStructure = voo.opts["edit_structure"] as
    | Array<[string, Record<string, unknown>]>
    | undefined;
  let fieldConfigs: Array<[string, Record<string, unknown>]>;
  if (editStructure !== undefined) {
    fieldConfigs = editStructure.map(([cardish, options]) => {
      const opts = { ...(options ?? {}) };
      const fieldMark = normalizedEditFieldMark(fmt, cardish, opts);
      if (opts["title"] === undefined) opts["title"] = fieldMark;
      return [fieldMark, opts] as [string, Record<string, unknown>];
    });
  } else {
    // chunk.rb:33-35 nest_chunks: `content ||= _render_raw` — a STRUCTURED
    // card's raw content is its structure template's (the authored nests
    // the board/edit_in_form rows walk); an unstructured card's own content
    // (edit_nests' Search Page: the authored {{All Topics|open}} family —
    // multi_card_edit consults card.structure nowhere).
    const structure = cardStructure(ctx);
    const sourceContent =
      structure !== undefined ? structure.content : (fmt.card.dbContent ?? "");
    fieldConfigs = implicitFieldConfigs(fmt, sourceContent, fieldsOnly);
  }
  if (fieldConfigs.length === 0) return structureLink();
  // Ruby's `nest name, options || {}` renders each field through the NEST
  // machinery; the mode decides the nested view. Under nest_mode :edit
  // (the board/edit_nests/edit_inline surfaces — mode.rb:64-68
  // view_in_edit_mode) every nest substitutes to the field card's
  // :edit_in_form, whose editor_in_multi_card wraps the field formgroup —
  // the port renders that formgroup directly, seated with the field card
  // facts the nest fetch would build (the set-type assignment walk below).
  // In NORMAL mode (the :edit_in_form and :content_formgroups views' own
  // multi_card_edit) the AUTHORED opts render: the Topic template's
  // {{+summary}} becomes the titled slot, the Sign up template's
  // {{+:description|content}} the content slot (the graded rows).
  if (fmt.nestMode === "edit") {
    return fieldConfigs
      .map(([name, options]) => fieldEditorInMultiCard(ctx, name, options))
      .join("\n");
  }
  return fieldConfigs
    .map(([name, options]) => {
      const opts = { ...(options ?? {}) };
      const view = typeof opts["view"] === "string" ? opts["view"] : "";
      const optList = view !== "" ? `|${view}` : "";
      return str(
        fmt.nest({
          syntax: `{{${name}${optList}}}`,
          name,
          options: { view: view !== "" ? view : undefined, extra: {} },
          comment: undefined,
          chunkNestSyntax: `${name}${optList}`,
        }),
      );
    })
    .join("\n");
}

/** chunk.rb:63-70 implicit_edit_fields_config: the structure card's nest
 *  chunks (each_nested_chunk fields: FIELDS_ONLY, uniq: true, virtual:
 *  true), each [chunk.options[:nest_name], chunk.options]. `##` comment
 *  nests vanish (nest.rb#interpret) and never reach the configs.
 *  fields_only (chunk.rb:33-35 field_chunks) keeps only DIRECT fields of
 *  the form card (field_name? = name.field_of? card.name); the virtual
 *  drop is process_nested_chunk's `return if virtual` (chunk.rb:99-101) —
 *  a nest whose target is a VirtualSearch-family card (the Sign up
 *  template's {{+:type+:by_name|content}}, by-name right) is skipped
 *  entirely when the walk runs virtual: true, which both callers do. */
function implicitFieldConfigs(
  fmt: ViewContext["fmt"],
  structureContent: string,
  fieldsOnly: boolean,
): Array<[string, Record<string, unknown>]> {
  const configs: Array<[string, Record<string, unknown>]> = [];
  const seen = new Set<string>([fmt.card.key]);
  for (const piece of scanNests(structureContent)) {
    if (piece.kind !== "nest" || piece.nest === undefined) continue;
    const nest = piece.nest;
    if (nest.comment !== undefined) continue; // '#' visible / '##' vanishing comments
    const target = DeckoName.parse(nest.name).absoluteName(fmt.card.name);
    if (fieldsOnly && !target.fieldOf(fmt.card.name.s)) continue; // field_chunks
    if (seen.has(target.key)) continue; // uniq_chunks
    seen.add(target.key);
    if (virtualSearchCqlFor(target) !== undefined) continue; // process_virtual_chunk
    configs.push([nest.name, { ...nest.options } as Record<string, unknown>]);
  }
  return configs;
}

/** The perms:none views (mode.rb:73-74 hide_view_in_edit_mode? arm 1: a
 *  nest whose requested view carries `perms: :none` renders :blank in edit
 *  mode). The corpus's graded surface reaches exactly :link
 *  (mod/format set/all/base.rb:35 `view :link, compact: true, perms:
 *  :none`) — the Topic structure rule's `{{+tags|link}}` field. */
const EDIT_HIDDEN_VIEWS = new Set(["link"]);

/** form.rb:105-119 editor_in_multi_card + wrap_editor_in_multi_card, as the
 *  field nest's edit-mode render: the formgroup
 *  `formgroup render_title, input: "content", help: true, class:
 *  classy("card-editor")` around `[content_field,
 *  form.hidden_field(:type_id) if card.new_card?]`. The nest's requested
 *  view rides first: a view hidden in edit mode (mode.rb:73-77) renders
 *  :blank — nothing. */
function fieldEditorInMultiCard(
  ctx: ViewContext,
  name: string,
  options: Record<string, unknown>,
): string {
  const { fmt } = ctx;
  const requestedView = options["view"];
  if (typeof requestedView === "string" && EDIT_HIDDEN_VIEWS.has(requestedView)) {
    return "";
  }
  const fieldName = DeckoName.parse(name).absoluteName(fmt.card.name);
  // nest (chunk rendering) fetches the field card with `new: {}` — a miss
  // builds the NEW field card (never a raise); its type defaults to the
  // tag card's type when the tag exists, and a full fabricated record
  // otherwise (nestRecord reads target.record.isNew - an empty object
  // here was the +*account edit form's 500).
  const known =
    fmt.engine.fetchRenderCard(fieldName.key) ??
    fmt.engine.fetchRenderCard(fieldName.s);
  const tagCard = known ?? fmt.engine.fetchRenderCard(fieldName.tag ?? fieldName.s);
  // THE NEW FIELD CARD'S TYPE IS THE SET-TYPE ASSIGNMENT'S, not the tag
  // card's: Ruby's ensure_type_id runs type_id_from_code
  // (mod/core/set/all/type.rb:69-76) BEFORE the template arm — for a
  // compound card each assigns_type pattern (07_right.rb:3
  // `assigns_type: true` on the right pattern) consults
  // Card::Set::Type.assignment (set/type.rb:5-6, filled by the mods'
  // `assign_type :foo` boot lines, advanced_api.rb:5-8). The account
  // family's rights all call `assign_type :phrase` (right/email.rb:5,
  // right/password.rb:3, right/salt.rb:3, right/status.rb:4), so a NEW
  // +*email field is PHRASE-typed at form time and its editor is the
  // plain text input — not the tag RichText type's tinymce textarea (the
  // oracle signup form pins the input; the recorded capture's fields list
  // names the email input without any editor chrome). findAssignedTypeName
  // is the ported walk; the codename env resolves the assigned type name
  // to the id (the sync peek the boot's ensureLoaded serves).
  const assignedTypeName = findAssignedTypeName({
    name: fieldName,
    isNew: true,
    typeId: tagCard?.typeId,
    typeName: tagCard?.typeName,
  });
  const env = getNameEnvironment();
  const assignedTypeId =
    assignedTypeName !== undefined
      ? (env?.codename?.id(assignedTypeName) ?? env?.codename?.id(assignedTypeName.toLowerCase()))
      : undefined;
  const fieldTypeId = assignedTypeId ?? tagCard?.typeId;
  const fieldTypeName = assignedTypeName ?? tagCard?.typeName;
  const fieldCard = known ??
    ({
      ...(tagCard ?? {}),
      name: fieldName,
      key: fieldName.key,
      unknown: true,
      record: {
        id: undefined,
        codename: undefined,
        leftId: undefined,
        rightId: tagCard?.id,
        typeId: fieldTypeId,
        dbContent: undefined,
        trash: false,
        creatorId: undefined,
        updaterId: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        currentRevisionId: undefined,
        readRuleClass: undefined,
        readRuleId: undefined,
        referencesExpired: undefined,
        name: fieldName,
        key: fieldName.key,
        isNew: true,
        fromTrash: false,
        uncacheable: false,
      },
      id: undefined,
      dbContent: "",
      typeName: fieldTypeName,
      typeId: fieldTypeId,
      typeCode:
        assignedTypeId !== undefined
          ? env?.codename?.nameForId(assignedTypeId)
          : tagCard?.typeCode,
      // THE JUNCTION'S OWN KEYS (RIGHT-Xemail etc.), not the tag card's:
      // the tag *email card's keys carry SELF-Xemail and no RIGHT- token,
      // so a tag-derived chain never sees the right-set modules the field
      // card belongs to. Ruby's new-card patterns (pattern/all.rb:40-42)
      // drop the self pattern and key the junction + right patterns off
      // the field name; safeSetKeys is the engine's own new-card
      // computation. leftTypeName undefined = the left card has no row yet
      // (Ruby's quick_type default, pattern/class_methods.rb:59-71).
      setKeys: safeSetKeys({
        name: fieldName,
        typeId: fieldTypeId,
        typeName: fieldTypeName,
        leftTypeName: undefined,
        isNew: true,
      }),
    } as ViewContext["fmt"]["card"]);
  // edit_in_form_prefix (form.rb:160): the subcard's input names ride the
  // parent form's prefix + [subcards][<field relative to the form card>].
  // A STRUCTURE-context subform render (account_formgroups'
  // `_render :content_formgroups, structure: true` on the +*account card
  // inside the signup card's form) carries the parent form's prefix in the
  // voo: Rails' fields_for nests the subform under
  // card[subcards][+*account], so the +*email field's input is
  // card[subcards][+*account][subcards][+*email][content] - the recorded
  // oracle signup form pins exactly that name.
  const parentPrefix =
    typeof ctx.voo.opts["form_name_prefix"] === "string"
      ? (ctx.voo.opts["form_name_prefix"] as string)
      : undefined;
  const relative = fieldName.from(fmt.card.name);
  // THE FORM PREFIX IS FIELD-GATED: a DIRECT FIELD of the form card nests
  // its inputs under [subcards][<relative>] (the graded board fieldset:
  // card[subcards][+summary][content]); a NON-field nest the edit-mode walk
  // renders (edit_nests' {{All Topics|open}} on the Search Page) edits the
  // target card's own content through the BASE form prefix (the graded
  // Search Page row: label for="card_content", name card[content]).
  const isDirectField = fieldName.fieldOf(fmt.card.name.s);
  const prefix =
    parentPrefix !== undefined && isDirectField
      ? `${parentPrefix}[subcards][${relative}]`
      : isDirectField
        ? `card[subcards][${relative}]`
        : (parentPrefix ?? "card");
  // wrap_editor_in_multi_card's formgroup title is render_title - the field
  // card's name as the nest shows it, RELATIVE to the form card (the Ruby
  // observations pin "+summary", never "Topic 002+summary" - the nest's
  // title_in_context renders the junction's last part with the plus). The
  // explicit-edit arm's tuples carry the title (the account before-hook's
  // {title: "email"}), which render_title's voo.title arm picks up.
  const explicitTitle = options["title"] !== undefined ? String(options["title"]) : undefined;
  // wrap_editor_in_multi_card (:113-119): formgroup render_title ... -
  // wrap_editor_in_multi_card (:113-119): formgroup render_title ... -
  // formgroup (formgroup.rb:20-43): wrap_with :div, formgroup_div_args
  // (class ["form-group", classy("card-editor") + add_junction_class].join;
  // data-card-id on a real card; data-card-name + data-card-link-name),
  // then [formgroup_label(input, title, help: true), editor_wrap(:content)
  // { content_field }] — the pair joined "\n" (output), the label's own
  // parts (title span + help slot) joined "\n" inside form.label, the
  // editor div carrying output([conflict_tracker, input,
  // hidden_field(:type_id) if new]) and the formgroup closing with no
  // newline after the editor div (the graded board fieldset pins the whole
  // shape). The field editor is the FORM'S WRITING SURFACE: Ruby renders it
  // for whoever may fill the parent form (the save rides the parent's
  // permission), and the field's own read rule never gates the editor —
  // a Pointer-typed field's *type read rule ("Help Desk") would deny the
  // member the editor Ruby's form shows. skip_perms scopes that to the
  // structured-form field editors only.
  const contentFieldHtml = fmt.nestRecord(fieldCard, "input", {
    form_name_prefix: prefix,
    skip_perms: true,
  });
  const conflictHtml = fmt.nestRecord(fieldCard, "conflict_tracker", {
    form_name_prefix: prefix,
  });
  // formgroup_help(true): class_up "help-text" "help-block" + _render_help
  // — the field card's help view slot INSIDE the label (the graded rows:
  // show [edit_in_form, help], the empty body a help-rule-less field
  // renders). formgroup_help is a DELEGATED render on the field's format
  // (render :help — no nest machinery, so the slot JSON carries no
  // nest_name). The slot's home_view is the FIELD NEST's requested view
  // before the mode substitution (nest.rb:24 home_view ||= closed/edit ?
  // open : view): the authored view for an opted nest ({{+related|closed}}
  // -> open), the default nest view for an option-less one ({{+summary}} ->
  // titled; the graded rows pin both).
  const authoredView = typeof options["view"] === "string" ? options["view"] : undefined;
  const fieldHomeView =
    authoredView === "closed" || authoredView === "edit"
      ? "open"
      : (authoredView ?? fmt.defaultNestView());
  const fieldSub = new RenderFormat(fieldCard, fmt.engine, {
    parent: fmt,
    maxDepth: fmt.maxDepth,
    nestQuietErrors: fmt.nestQuietErrors,
  });
  const helpHtml = str(
    fieldSub.renderView(
      "help",
      explicitTitle !== undefined
        ? // the explicit-edit tuple's title is an HEIR key: the child help
          // voo inherits it and the slot JSON serializes it (the graded
          // setup row pins "title":"email" on the help slot).
          { form_name_prefix: prefix, show: "edit_in_form", home_view: fieldHomeView, title: explicitTitle }
        : { form_name_prefix: prefix, show: "edit_in_form", home_view: fieldHomeView },
    ),
  );
  const hiddenTypeId =
    fieldCard.id === undefined
      ? `<input type="hidden" name="${prefix}[type_id]" id="${prefix.replace(/\]/g, "").replace(/[^-a-zA-Z0-9:.]/g, "_")}_type_id" autocomplete="off" />`
      : "";
  // the row's junction class token is the TAG's SAFE KEY (star -> X: the
  // bridge addresses `.RIGHT-Xpassword input.d0-card-content`; Ruby's
  // RIGHT-Xemail row on the +*account page pins the same mapping)
  const tagSafe = DeckoName.parse(fieldName.tag ?? fieldName.s).safeKey;
  // add_junction_class (form.rb:250-254): `return unless card.name.compound?`
  // — a SIMPLE nest target (edit_nests' All Topics) carries no RIGHT- token.
  const junctionClass = fieldName.isCompound ? ` RIGHT-${tagSafe}` : "";
  const attrs = emitAttrs({
    class: `form-group card-editor${junctionClass}`,
    "data-card-id": fieldCard.id === undefined ? undefined : String(fieldCard.id),
    "data-card-name": h(fieldName.s),
    "data-card-link-name": h(DeckoName.parse(fieldName.s).urlKey),
  });
  // formgroup_label: `form.label input||:content, raw(parts.join("\n"))` —
  // Rails derives the label's for from the input's NAME
  // (sanitize_to_id("card[subcards][+summary]_content") ->
  // "card_subcards__summary_content"; the graded board fieldset pins the
  // sanitized ids). The title rides render_title (the field's own title
  // view — wrapped_title's span, the context-relativized name) unless the
  // explicit-edit tuple carried one (the account before-hook's
  // {title: "email"} rides the field render's voo.title).
  // Rails sanitize_to_id: delete("]") then tr("^-a-zA-Z0-9:.", "_") — the
  // starred marks' * lands as _ too (the graded setup row pins
  // card_subcards___account_subcards___email_content).
  const labelForId = `${prefix}_content`
    .replace(/\]/g, "")
    .replace(/[^-a-zA-Z0-9:.]/g, "_");
  const titleSpan = str(
    fieldSub.renderView(
      "title",
      explicitTitle !== undefined
        ? { title: explicitTitle, form_name_prefix: prefix }
        : { form_name_prefix: prefix },
    ),
  );
  const label =
    `<label for="${labelForId}">` +
    output([titleSpan, helpHtml]) +
    `</label>`;
  const editor =
    `<div class="editor content-editor">` +
    output([conflictHtml, contentFieldHtml, hiddenTypeId || undefined]) +
    `</div>`;
  return `<div${attrs}>${label}\n${editor}</div>`;
}

/** chunk.rb:91-100 normalized_edit_field_mark: the mark is the cardish when
 *  absolute (:absolute opt) or an explicit compound cardish; else
 *  card.name.field(cardish) — the REAL field math rides DeckoName. */
function normalizedEditFieldMark(
  fmt: ViewContext["fmt"],
  cardish: string,
  options: Record<string, unknown>,
): string {
  if (options["absolute"] === true || cardish.startsWith("+")) {
    delete options["absolute"];
    return cardish;
  }
  return fmt.card.name.field(cardish);
}

/** all/form.rb:4-7 view :content_formgroups (cache: :never, unknown:
 *  true): `wrap_with :fieldset, edit_slot, class: classy("card-editor",
 *  "editor")`. edit_slot (:95-103) arms in Ruby's order — multi_card_editor?
 *  (the explicit walk, PORTED above) before single_card_edit_field:
 *  `voo.show?(:type_formgroup) || voo.show?(:name_formgroup)` decides the
 *  branch - SHOWN (visibility.rb show? = `!hide?` answers SHOWN for
 *  un-listed optionals) the formgroup branch `_render_content_formgroup`
 *  renders (the captured edit-form fieldset wraps the form-group div,
 *  label and editor); HIDDEN (:edit_inline's body hides both,
 *  edit_inline.rb:4) the else branch renders editor_wrap(:content)
 *  { content_field } - the bare content-editor div (the captured
 *  :edit_inline fieldset). No existing surface sets voo.structure/
 *  edit_structure (the account family's callers do), so the single-card
 *  bytes are unchanged. */
export const contentFormgroupsView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  return `<fieldset class="card-editor editor">${editSlot(ctx)}</fieldset>`;
};

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
export const editFormView: ViewFn = ({ fmt, voo }) => {
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
      // _render(voo.buttons_view || :edit_buttons) - the METHOD_MISSING
      // delegation (method_delegation.rb:41-47 -> api_render -> render!),
      // whose own wrap_and_render rescue (render.rb:96-100) makes the quiet
      // span the delegation's VALUE on a nested format: the oracle's
      // edit_structure page embeds the span where the buttons would render
      // (the edit_buttons raise, deleteButton's reproduced upstream failure)
      // while the form around it completes. renderDelegated is that seam;
      // the no-raise renders are byte-identical through it.
      fmt.renderDelegated(voo.opts["buttons_view"] === undefined ? "edit_buttons" : String(voo.opts["buttons_view"])),
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
 *  text arg -> the icon and its trailing space). :new_modal_menu renders
 *  board_link WITHOUT confirm (new.rb:55-59) - no _confirm class, no
 *  data-confirm-msg (the captured new_in_modal menu bytes). */
function boardLink(fmt: ViewContext["fmt"], confirm = true): string {
  return (
    `<a rel="nofollow" class="board-link${confirm ? " _confirm" : ""} slotter" title="Advanced"` +
    ` data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal-replace"` +
    (confirm
      ? ` data-confirm-msg="Unsaved changes will be lost. Do you want to proceed?"`
      : ``) +
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
export const editView: ViewFn = ({ fmt, voo }) => {
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
// the NAME-EDITOR and TYPE-SHIFT surfaces (write-path slice 4) - the views
// the captured name/type editor surfaces compose
// (fixtures/captured/edit-name-type.json, captured from the live
// decko-0.20.0 oracle app; see
// tests/card/mod-loader/oracle-capture-edit-name-type.rb for the capture
// contract). Each view cites the Ruby source; the byte shapes are pinned
// by the captured oracle.
// ---------------------------------------------------------------------------

// --- the FRAME machinery (card-mod-format set/all/html/frame.rb + the
// --- bootstrap overrides set/all/bootstrap/wrapper.rb) --------------------

/** frame.rb:9-27 frame -> standard_frame(slot=true) -> with_frame: voo.hide
 *  :help; add_name_context; wrap slot { panel { [header, frame_help,
 *  render_flash, wrap_body(&block)] } } - with the bootstrap overrides
 *  (wrapper.rb:2-13) running FIRST: frame class_ups d0-card-header
 *  card-header + d0-card-body card-body card-text, standard_frame class_ups
 *  d0-card-frame card (panel_state nil). output() joins the panel parts:
 *  the HIDDEN help render returns NIL (the voo process's
 *  hide_requested_view? gate - visibility.rb:82-83 + view.rb:68-69 - exits
 *  before the view body, so the empty slot-wrap div the SHOWN help emits
 *  in :edit never appears in these frames) and is compacted; flash ""
 *  (frame.rb:3-7 - no flash params in the engine) stays as the empty line
 *  - hence the captured `header</div>\n\n<div class="d0-card-body...`
 *  two-newline seam. header (header.rb:5-19): header_wrap's div carries
 *  classy("d0-card-header") (the class_up extra included), header_title
 *  wraps render_title in default_header (main? ? :h1 : :h2 - the engine
 *  render surface is non-focal, h2). */
export function framedView(
  ctx: ViewContext,
  view: string,
  bodyFn: () => string,
  opts: { showHelp?: boolean } = {},
): string {
  const { fmt, voo } = ctx;
  if (opts.showHelp !== true) voo.hide("help"); // with_frame, frame.rb:20 (first-write-wins viz); :new's with_create_context SHOWS help first, so the hide must not fire there
  fmt.addNameContext(); // frame.rb:21
  voo.classUp("d0-card-header", "card-header"); // wrapper.rb:3
  voo.classUp("d0-card-body", "card-body card-text"); // wrapper.rb:4
  voo.classUp("d0-card-frame", "card"); // wrapper.rb:12 (panel_state nil)
  // the body renders AFTER the hide/class_ups (the with_frame yield) - the
  // inner edit_type_form slot's data-slot must carry the accumulated viz
  // (the captured hide:[help] on the inner slot)
  const body = bodyFn();
  // header.rb:22 default_header: `main? ? :h1 : :h2`.
  const tag = fmt.isMain ? "h1" : "h2";
  // header.rb:5-12 view :header: `header_wrap [render_header_title,
  // render_menu]` — output() JOINS the parts with "\n" and COMPACTS the
  // hidden menu's NIL (the render pipeline's hide bail, view.rb:69 bare
  // return) but keeps the menu's EMPTY-STRING arms (the denial-:blank /
  // unknown-card "" — a string, not nil), so a hidden-menu frame ends at
  // the title tag with no newline (the graded setup row) while the
  // unknown-card frames keep the title's trailing newline (the graded
  // Nonexistent Card rows).
  const titleTag = `<${tag} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${tag}>`;
  const menuRendered = fmt.renderView("menu");
  const header =
    `<div class="${voo.classy("d0-card-header")}">` +
    (menuRendered === null ? titleTag : `${titleTag}\n${str(menuRendered)}`) +
    `</div>`;
  // frame.rb:33-36 frame_help: `with_class_up "help-text", "alert
  // alert-info" do _render :help end` — the class_up rides the render and
  // is restored after (with_class_up's scope).
  let frameHelp: ViewResult | undefined;
  if (voo.show("help")) {
    const prevAlert = voo.classUps.get("help-text");
    voo.classUp("help-text", "alert alert-info");
    frameHelp = fmt.renderView("help");
    if (prevAlert === undefined) voo.classUps.delete("help-text");
    else voo.classUps.set("help-text", prevAlert);
  }
  const panel =
    `<div class="${voo.classy("d0-card-frame")}">` +
    output([
      header,
      frameHelp,
      "", // render_flash: "" (no flash params)
      `<div class="${voo.classy("d0-card-body")}">${body}</div>`,
    ]) +
    `</div>`;
  return modSlotWrap({ fmt, voo }, view, panel);
}

// --- all/edit_name.rb + edit_name_skip_referers.haml -----------------------

/** edit_name.rb:12-22 name_form (the HELPER - both the :name_form view and
 *  the :edit_name frame call it): card_form({action: :update, id:
 *  card.id}, {data-main-success JSON(redirect: true, view: ""),
 *  data-slotter-mode update-origin, class _rename-form, success:
 *  edit_name_success(view)}).
 *
 *  card_form's HASH-form action (form.rb:186-195 + :232-234): url =
 *  path(action-hash) - "/update/<mark>?id=<id>", the id riding the query -
 *  and Card::Path CONSUMES the :action key while building it (probe: the
 *  hash after path() is {:id=>605}), so action[:action] answers NIL and
 *  card_form_html_opts's `autosave if action == :update` (form.rb:221)
 *  never fires - the rename form carries NO autosave class (the captured
 *  bytes), unlike the Symbol-form :edit_type_form. form_for emits the utf8
 *  enqueuer + _method patch spoof (no authenticity token:
 *  embed_authenticity_token_in_remote_forms=false), then hidden_form_tags'
 *  success tags BEFORE the body (form.rb:187-188). edit_name_success
 *  (:28-32): {name: "_self", redirect: ""} + view only when given - the
 *  hidden_field_tag shape is form_tag_helper.rb:264's defaults
 *  {type,name,id,value} + .update(options) append (autocomplete LAST). */
function nameForm(ctx: ViewContext, successView: string | undefined): string {
  const { fmt } = ctx;
  const success: Array<[string, string]> = [
    ["name", "_self"],
    ["redirect", ""],
  ];
  if (successView !== undefined) success.push(["view", successView]);
  const successTags = success
    .map(
      ([key, value]) =>
        `<input type="hidden" name="success[${key}]" id="success_${key}" value="${value}" autocomplete="off" />`,
    )
    .join("");
  return (
    `<form class="_rename-form card-form slotter" id="edit_card_${fmt.card.id}"` +
    ` data-main-success="{&quot;redirect&quot;:true,&quot;view&quot;:&quot;&quot;}"` +
    ` data-slotter-mode="update-origin"` +
    ` action="/update/${fmt.urlKey()}?id=${fmt.card.id}"` +
    ` accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    successTags +
    output([
      fmt.renderView("name_formgroup"),
      skipReferers(),
      editNameButtons(ctx),
    ]) +
    `</form>`
  );
}

/** edit_name_skip_referers.haml (the gem's template, haml
 *  :edit_name_skip_referers): check_box_tag "card[skip]",
 *  :update_referer_content + the %label.ps-1 with t
 *  :skip_update_referer_content (card-1.110.0 mod/core en.yml:43-44 "do
 *  not update references to this name"). check_box_tag (form_tag_helper)
  * renders defaults-first attrs {type,name,id,value} - NO autocomplete
  * (7.2 adds it to hidden/text fields only); haml emits one \n per line,
  * the final line's \n included (the captured blank line before the button
  * formgroup is output()'s join against that trailing newline). */
function skipReferers(): string {
  return (
    `<div class='skip-referers pb-2'>\n` +
    `<input type="checkbox" name="card[skip]" id="card_skip" value="update_referer_content" />\n` +
    `<label class='ps-1'>\ndo not update references to this name\n</label>\n</div>\n`
  );
}

/** edit_name.rb:34-45 edit_name_buttons + rename_button:
 *  class_up "button-form-group", "rename-button-form-group";
 *  button_formgroup { [rename_button, standard_cancel_button] }.
 *  rename_button: button_tag t(:core_rename), class: "renamer", data
 *  {disable_with: t(:core_renaming), confirm: t(:core_rename_confirm)}
 *  (en.yml:26-28 "Renaming"/"Rename"/"Are you sure you want to rename?")
 *  - button_tag merges {name: "button", type: "submit"} BEFORE the caller
 *  opts (form_tag_helper.rb:573), bootstrap appends btn btn-primary.
 *  standard_cancel_button (form_buttons.rb:36-39 + cancel_button
 *  form_elements.rb:67-76): reverse_merge class cancel-button ms-4 / href
 *  path / data-cy cancel; add_class btn btn-secondary + cancel_strategy
 *  (href present -> redirect false -> "slotter"); data-remote appended
 *  LAST - the captured attr order class, href, data-cy, data-remote. */
function editNameButtons(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  voo.classUp("button-form-group", "rename-button-form-group");
  return buttonFormGroup(
    ctx,
    output([
      `<button name="button" type="submit" class="renamer btn btn-primary" data-disable-with="Renaming" data-confirm="Are you sure you want to rename?">Rename</button>`,
      `<a class="cancel-button ms-4 btn btn-secondary slotter" href="/${fmt.urlKey()}" data-cy="cancel" data-remote="true">Cancel</a>`,
    ]),
  );
}

/** edit_name.rb:2-4 view :edit_name, perms: :update: `frame { name_form }`
 *  - the HELPER (success_view nil: no success[view] tag - the captured
 *  framed form carries only success[name]/success[redirect]). The body is
 *  a callback: with_frame yields it after the hide/class_ups. */
const editNameView: ViewFn = (ctx) =>
  framedView(ctx, "edit_name", () => nameForm(ctx, undefined));

/** edit_name.rb:6-8 view :name_form, perms: :update, wrap: :slot, cache:
 *  :never: `name_form :edit_name_row` - the success tags carry
 *  view=edit_name_row (the captured standalone bytes). */
const nameFormView: ViewFn = ({ fmt, voo }) =>
  modSlotWrap({ fmt, voo }, "name_form", nameForm({ fmt, voo }, "edit_name_row"));

/** form.rb:9-13 view :name_formgroup: formgroup "Name", input: "name",
 *  help: false { raw name_field } - formgroup (formgroup.rb:20-43):
 *  wrap_with :div, formgroup_div_args(nil) { [formgroup_label,
 *  editor_wrap("name")] }; class ["form-group", nil].compact.join(" ") ->
 *  "form-group"; form.label(:name, "Name") -> <label for="card_name">;
 *  editor_wrap (form.rb:242-246) -> <div class="editor name-editor">.
 *  name_field (form.rb:42-45): text_field :name, value: card.name,
 *  autocomplete: "off" - the FORM-BOUND Tags::TextField attr order (caller
 *  opts value/autocomplete/class, then type appended, then
 *  add_default_name_and_id appends name/id); the bootstrap FIELD_HELPERS
 *  wrapper appends " form-control" to the EMPTY class - the leading-space
 *  class=" form-control" in the captured bytes. */
export const nameFormgroupView: ViewFn = ({ fmt }) => {
  const card = fmt.card;
  const attrs = emitAttrs({
    class: "form-group",
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": card.name.s === "" ? undefined : card.name.s,
    "data-card-link-name": h(fmt.urlKey()),
  });
  return (
    `<div${attrs}>` +
    `<label for="card_name">Name</label>\n` +
    `<div class="editor name-editor">` +
    `<input value="${h(card.name.s)}" autocomplete="off" class=" form-control" type="text" name="card[name]" id="card_name" />` +
    `</div></div>`
  );
};

/** edit_inline.rb:16-18 view :edit_name_row: `edit_row "Name", card.name,
 *  :name_form` - the edit_row helper (edit_inline.rb:37-44) mirrors the
 *  ported edit_type_row machinery (class_up card-slot d-flex form-group +
 *  wrap true class :row + the edit_row haml cols); the content is the
 *  PLAIN h-escaped name (no link), the edit link targets :name_form
 *  (edit_inline_link :48-52); no home_view rides the standalone render
 *  (the captured data-slot carries none). */
export const editNameRowView: ViewFn = ({ fmt, voo }) => {
  const editLink =
    `<a rel="nofollow" class="ms-2 edit-link slotter" data-cy="edit-link"` +
    ` href="/${fmt.urlKey()}/name_form" data-remote="true">${icon("edit")}</a>`;
  const inner =
    `<div class='col-2 text-start'>\n<label>\nName\n</label>\n</div>\n` +
    `<div class='col-8'>\n${h(fmt.card.name.s)}\n</div>\n` +
    `<div class='col-2 text-end'>\n${editLink}\n</div>\n`;
  voo.classUp("card-slot", "d-flex form-group");
  return modSlotWrap({ fmt, voo }, "edit_name_row", inner, "row");
};

// --- all/edit_type.rb + all/new.rb (the type-shift surface) ----------------

/** card-mod-rules set/all/cardtype_groups.rb:2-12 GROUP (frozen constant;
 *  the rules mod carries the identical copy - mod files stay
 *  self-contained per the established port convention). */
const CARDTYPE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  Text: ["RichText", "PlainText", "Markdown", "Phrase", "HTML"],
  Data: ["Number", "Toggle", "Date", "URI"],
  Upload: ["File", "Image"],
  Custom: [],
  Organize: ["List", "Pointer", "Search", "Link list", "Nest list"],
  Template: ["Notification template", "Email template", "Twitter template"],
  Admin: ["Cardtype", "User", "Role", "Sign up", "Session", "Set", "Setting"],
  Styling: ["Layout", "Skin", "Bootswatch skin", "CSS", "SCSS"],
  Scripting: ["JSON", "JavaScript", "CoffeeScript"],
};
/** cardtype_groups.rb:18-20 GROUP_MAP. */
const CARDTYPE_GROUP_MAP: ReadonlySet<string> = new Set(
  Object.values(CARDTYPE_GROUPS).flat(),
);

/** edit_type.rb:92-102 grouped_types + :24-48 the type field - the SELECT
 *  options from RenderFormat#createableTypes (the engine's precomputed
 *  Auth.createable_types port). The Hash mechanics ARE the group filter:
 *  standard_grouped_types' `groups[name] << i if raw.include?(i)` only
 *  touches the hash when a member PASSES (empty groups never materialize),
 *  while Custom is ASSIGNED unconditionally (:96-98) - so Custom renders
 *  as an EMPTY optgroup (the captured anonymous bytes) and the other
 *  all-miss groups don't render at all. grouped_options_for_select
 *  (actionview form_options_helper.rb:536-560) renders one <optgroup
 *  label> per container with NO separator between groups, options joined
 *  "\n" INSIDE; options_for_select marks the current type
 *  `<option selected="selected" value=...>` (selected first, the captured
 *  order). type_field (:44-48): select_tag "card[type]", ..., args.merge
 *  ("data-select2-id": "#{unique_id}-#{Time.now.to_i}") - select_tag sets
 *  name/id FIRST then the caller opts in hash order; the bootstrap
 *  select_tag wrapper appends " form-control" to the class;
 *  board_type_formgroup (:24-31) passes href/class _live-type-field/
 *  data-remote before add_class appends type-field (the captured order:
 *  name, id, href, class, data-remote, data-select2-id). */
/** MODULE-EXPORTED for the rules mod's rule-form type editors
 *  (card-mod-rules.ts quickEditorBody + rulesTypeFormgroup): those render
 *  the same edit_type.rb type_field with the set-module
 *  visible_cardtype_groups overrides. */
export function typeField(
  ctx: ViewContext,
  opts: {
    href?: string;
    cls?: string;
    /** The set-module override of All::CardtypeGroups::GROUP (the
     *  visible_cardtype_groups overrides: Right::Default, Right::Structure,
     *  Right::ContentOptions). Omitted = the base GROUP table. */
    groups?: Readonly<Record<string, readonly string[]>>;
    /** select_tag caller-opts order: href before class (the rule-form
     *  editors' captured order). Default: class before href when a cls
     *  opt is present, href-only otherwise. */
    hrefFirst?: boolean;
  },
): string {
  const { fmt } = ctx;
  const createable = fmt.createableTypes();
  const current = fmt.card.typeName ?? "";
  // raw_type_options (edit_type.rb:52-62): the createable list PLUS the
  // current type pushed for a real card (`card.real? && !options.include?
  // (card.type_name) -> options.push`) - the anonymous capture's Text
  // group carries RichText exactly through this push (createable itself
  // is empty for anonymous). Custom (custom_types, :23-31) iterates
  // Auth.createable_types WITHOUT the push.
  const createableSet = new Set(createable);
  if (fmt.card.id !== undefined && !createableSet.has(current)) {
    createableSet.add(current);
  }
  const select2Id = `${fmt.uniqueId()}-${Math.floor(cardWallClockNow().getTime() / 1000)}`; // Time.now through the engine wall clock
  // edit_type.rb:86-102 grouped_types: the groups table (the caller's
  // override or the base GROUP) walked in order; standard groups
  // materialize ONLY when a member passes raw_type_options (the hash
  // assignment inside the loop), Custom is ASSIGNED unconditionally
  // (:96-98) and renders as an EMPTY optgroup in the base table.
  // type_field_options (:68-80): ONE materialized group answers the SIMPLE
  // arm (options_for_select flat, no optgroup - the rules-cap capture's
  // single-option rule editors); two or more answer the MULTI arm
  // (grouped_options_for_select, one <optgroup label> per group, options
  // joined "\n" INSIDE, no separator BETWEEN groups).
  const groups = opts.groups ?? CARDTYPE_GROUPS;
  const materialized: Array<[string, readonly string[]]> = [];
  for (const [group, types] of Object.entries(groups)) {
    const items =
      group === "Custom"
        ? createable.filter((t) => !CARDTYPE_GROUP_MAP.has(t))
        : types.filter((t) => createableSet.has(t));
    if (group === "Custom" || items.length > 0) materialized.push([group, items]);
  }
  const optionHtml = (t: string): string =>
    `<option${t === current ? ` selected="selected"` : ""} value="${t}">${t}</option>`;
  let out: string;
  if (materialized.length === 1) {
    out = materialized[0]![1].map(optionHtml).join("\n");
  } else {
    out = materialized
      .map(([group, items]) => `<optgroup label="${group}">${items.map(optionHtml).join("\n")}</optgroup>`)
      .join("");
  }
  // Rails' tag helper html-escapes every attribute value (tag_options'
  // ERB::Util.html_escape): the rule editors' href query "assign=true&mark="
  // renders as "...assign=true&amp;mark=" (the corpus rule-form ops).
  const href = opts.href === undefined ? "" : ` href="${h(opts.href)}"`;
  const live = opts.href === undefined ? "" : ` data-remote="true"`;
  // the class composition: the helper chain (board/type formgroups)
  // prepend "_live-type-field " via the href arm; the :new_type_formgroup
  // variant passes its caller class verbatim (cls); the bootstrap wrapper
  // appends " form-control" in every case. The attribute ORDER is the
  // caller's hash order (select_tag emits the caller opts in insertion
  // order): the helper chain passes href first (the captured
  // board_type_formgroup: name, id, href, class, data-remote,
  // data-select2-id), the :new_type_formgroup variant passes class first
  // (the captured arm: name, id, class, href, data-remote,
  // data-select2-id).
  const classBase =
    opts.cls !== undefined
      ? opts.cls
      : opts.href !== undefined
        ? `_live-type-field type-field`
        : `type-field`;
  // select_tag's caller-opts order: class-first is the DEFAULT (the
  // :new_type_formgroup variant's captured order with a cls+href caller);
  // hrefFirst gives the helper-chain order (the rule-form editors'
  // captured order: name, id, href, class, data-remote, data-select2-id).
  const head =
    opts.hrefFirst === true
      ? `<select name="card[type]" id="card_type"${href} class="${classBase} form-control"`
      : opts.cls !== undefined
        ? `<select name="card[type]" id="card_type" class="${classBase} form-control"${href}`
        : `<select name="card[type]" id="card_type"${href} class="${classBase} form-control"`;
  return (
    head +
    live +
    ` data-select2-id="${select2Id}">` +
    out +
    `</select>`
  );
}

/** edit_type.rb:33-42 type_formgroup (the helper behind :type_formgroup
 *  :33-35 and :board_type_formgroup :24-31): add_class args, "type-field";
 *  wrap_type_formgroup (:64-68): formgroup "Type", input: "type", class:
 *  "type-formgroup", help: false { output [type_field,
 *  hidden_field_tag(:assign, true)] } - formgroup's div = formgroup_div_
 *  args (class "form-group type-formgroup" + the card attrs), label
 *  form.label(:type, "Type"), editor_wrap "type" (form.rb:242-246); the
 *  assign hidden rides output()'s newline (form_tag_helper defaults-first
 *  attrs + autocomplete append). `cls` carries the caller's class string
 *  for the :new_type_formgroup variant (new.rb:154-160 passes class:
 *  "type-field _live-type-field slotter" DIRECTLY to type_field, skipping
 *  the helper's add_class - the captured order "type-field _live-type-
 *  field slotter form-control"; the bootstrap FIELD_HELPERS wrapper always
 *  appends " form-control"). */
/** MODULE-EXPORTED for the rules mod's rule editors (card-mod-rules.ts
 *  rulesTypeFormgroup): the wrap_type_formgroup shape with the caller's
 *  href/class/groups opts. */
export function typeFormgroup(
  ctx: ViewContext,
  opts: {
    href?: string;
    cls?: string;
    /** the set-module visible_cardtype_groups override (see typeField). */
    groups?: Readonly<Record<string, readonly string[]>>;
    hrefFirst?: boolean;
  },
): string {
  const { fmt } = ctx;
  const card = fmt.card;
  const attrs = emitAttrs({
    class: "form-group type-formgroup",
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": card.name.s === "" ? undefined : card.name.s,
    "data-card-link-name": h(fmt.urlKey()),
  });
  return (
    `<div${attrs}><label for="card_type">Type</label>\n` +
    `<div class="editor type-editor">` +
    [
      typeField(ctx, opts),
      `<input type="hidden" name="assign" id="assign" value="true" autocomplete="off" />`,
    ].join("\n") +
    `</div></div>`
  );
}

/** edit_type.rb:33-35 view :type_formgroup (no directives). */
const typeFormgroupView: ViewFn = (ctx) => typeFormgroup(ctx, {});

/** edit_type.rb:24-31 view :board_type_formgroup, unknown: true, wrap:
 *  :slot: type_formgroup href: path(mark: card.id, view: :edit_form,
 *  assign: true, slot: {show: :type_form}), class: "_live-type-field",
 *  "data-remote": true - the href carries the mark's NAME-form path with
 *  the assign flag + the Rails-deep-encoded slot show query (the captured
 *  bytes: /<mark>/edit_form?assign=true&amp;slot%5Bshow%5D%5B%5D=type_form). */
const boardTypeFormgroupView: ViewFn = (ctx) => {
  // the RAW query ("&"); typeField's tag-helper escape renders the &amp;
  // (the captured bytes: /<mark>/edit_form?assign=true&amp;slot...)
  const href = `/${ctx.fmt.urlKey()}/edit_form?assign=true&slot%5Bshow%5D%5B%5D=type_form`;
  return modSlotWrap(
    ctx,
    "board_type_formgroup",
    typeFormgroup(ctx, { href }),
  );
};

/** edit_type.rb:8-12 view :edit_type_form, cache: :never, perms: :update,
 *  wrap: :slot: card_form :update (SYMBOL action - form.rb:233
 *  path(action: :update), action stays :update so form.rb:221 adds
 *  autosave - the captured class), success: edit_type_success (:14-16
 *  {view: :core}) -> ONE success hidden tag; body [type_formgroup,
 *  render_new_buttons] newline-joined by output(). */
const editTypeFormView: ViewFn = ({ fmt, voo }) => {
  const form =
    `<form class="card-form slotter autosave" id="edit_card_${fmt.card.id}"` +
    ` action="/update/${fmt.urlKey()}" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    `<input type="hidden" name="success[view]" id="success_view" value="core" autocomplete="off" />` +
    output([fmt.renderView("type_formgroup"), fmt.renderView("new_buttons")]) +
    `</form>`;
  return modSlotWrap({ fmt, voo }, "edit_type_form", form);
};

/** edit_type.rb:2-6 view :edit_type, cache: :never, perms: :update:
 *  `frame do _render_edit_type_form end` - _render IS a view render, so
 *  the inner slot wrap rides (the captured framed bytes carry the
 *  edit_type_form slot div, its show list accumulated with edit_type). */
const editTypeView: ViewFn = (ctx) =>
  framedView(ctx, "edit_type", () => str(ctx.fmt.renderView("edit_type_form")));

/** new.rb:162-166 view :new_buttons: button_formgroup {
 *  [standard_create_button, standard_cancel_button(href:
 *  cancel_create_path)] } - standard_create_button (:184-186):
 *  submit_button class "submit-button create-submit-button" (text default
 *  "Submit", data-disable-with "Submitting"); cancel_create_path
 *  (:176-182): NOT main? -> path(view: voo&.home_view || :unknown) - the
 *  captured href carries /<mark>/unknown (home_view unset on the
 *  standalone render). */
export const newButtonsView: ViewFn = ({ fmt, voo }) => {
  // cancel_create_path: main? -> path_to_previous (form_elements.rb:83-85,
  // path mark: "*previous"), the create form a page offers for an absent
  // card.
  const href = fmt.isMain
    ? "/*previous"
    : `/${fmt.urlKey()}/${String(voo.opts["home_view"] ?? "unknown")}`;
  return buttonFormGroup(
    { fmt, voo },
    output([
      `<button name="button" type="submit" data-disable-with="Submitting" class="submit-button create-submit-button btn btn-primary">Submit</button>`,
      `<a class="cancel-button ms-4 btn btn-secondary slotter" href="${href}" data-cy="cancel" data-remote="true">Cancel</a>`,
    ]),
  );
};

// ---------------------------------------------------------------------------
// the EDIT-VIEWS lane (post slice-4): the inline-editing surface, the create
// surface, the :guide_tab delegate, the structure/nests placeholders, the
// read-form formgroups and the overlay guide. Byte shapes pinned by
// fixtures/captured/edit-views.json (captured from the live decko-0.20.0
// oracle app; see tests/card/mod-loader/oracle-capture-edit-views.rb).
// ---------------------------------------------------------------------------

/** visibility.rb:48-52 + VIZ_SETTING (:53): `visible? view { block }` -
 *  `viz view, yield unless viz_hash[view]; show? view` - the block result
 *  viz-writes (true->show, false->hide, FIRST write wins) and the answer is
 *  show?. new.rb:116-120 new_name_prompt? and :136-140 new_type_prompt?
 *  run this on the CURRENT voo, which is how the captured slot JSONs carry
 *  hide:[name_formgroup] (the with_create_context probe writes the parent
 *  voo before the frame wraps). */
function visibleWrite(voo: ViewContext["voo"], view: string, result: boolean): boolean {
  if (!voo.viz.has(view)) voo.viz.set(view, result ? "show" : "hide");
  return voo.show(view);
}

/** form_tag_helper.rb:264 hidden_field_tag: defaults-first attrs
 *  {type, name, id, value} + the Rails 7.2 autocomplete append LAST (the
 *  captured new_fields name hidden and the slice-4 success tags share the
 *  order). The dom id is the name with the Rails bracket sanitization
 *  ("card[name]" -> "card_name"). */
function hiddenFieldTag(name: string, value: string): string {
  const id = name.replace(/[[\]]+/g, "_").replace(/_+$/, "");
  return `<input type="hidden" name="${name}" id="${id}" value="${h(value)}" autocomplete="off" />`;
}

// --- the guide helper set (card-mod-help set/all/guide.rb - the format
// --- METHODS behind :guide/:alert_guide/:overlay_guide; mod files stay
// --- self-contained per the established port convention, so this file
// --- carries its own copy of the rule walk) ------------------------------

/** guide.rb:47-53 determine_guide_card (via delegate :guide_card, to:
 *  :card): `rule_card :guide` - the set-candidates walk - then
 *  `guide_card if guide_card.ok?(:read)` (:52; the ok?(:read) check is
 *  guide.rb:52's `return unless ... ok?(:read)` shape - the port reads the
 *  engine's deny verdict, the same seam card-mod-help's guideRuleCard
 *  uses). Unreadable/missing rule -> undefined. */
function guideRuleCard(ctx: ViewContext): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
  const card = ctx.fmt.card;
  // A new card has rules too (rule_card :guide on Card.new — the :new
  // form's alert guide); its walk drops the *self candidate.
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
    ...(card.id === undefined ? { isNew: true } : {}),
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*guide")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // guide rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // guide.rb:52 ok?(:read)
    return record;
  }
  return undefined;
}

/** guide.rb:34-40 guide_text: `return "" unless guide_card;
 *  with_nest_mode :normal { nest guide_card, view: :core }` - the guide
 *  rule card's :core (the *all+*guide card is Markdown-typed in the oracle
 *  deck; its markdown core carries the h4 anchor + the [[*guide]] link).
 *  The nest call mirrors card-mod-help.ts#guideText (format.ts:450-484
 *  shape, one-option Nest). */
function guideText(ctx: ViewContext): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return "";
  return ctx.fmt.nest({
    syntax: `{{${guideCard.name.s}|view:core}}`,
    name: guideCard.name.s,
    options: parseNestOptions("view:core"),
    comment: undefined,
  });
}

/** guide.rb:27-32 prepend_guide_edit_link: `return guide_text unless
 *  guide_card.ok?(:update)`; then
 *  `<span class='d-none'>#{nest guide_card, view: :edit_link}</span>` -
 *  the guide card is Rule-typed and the Rule set overrides edit_link_view
 *  to :rule_edit (card-mod-rules-0.20.0 set/rule/editor.rb:60-61), so the
 *  link target is the RULE editor: the captured href is
 *  "/*all+*guide/rule_edit" (path mark keeps the star name verbatim).
 *  The taskAllowed gate mirrors card-mod-help.ts#prependGuideEditLink. */
function prependGuideEditLink(ctx: ViewContext, text: string): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return text;
  const taskAllowed = ctx.fmt.engine.taskAllowed?.(guideCard, "update");
  if (taskAllowed !== undefined && taskAllowed === false) return text;
  const editLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
    ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
    ` href="/${guideCard.name.s}/rule_edit" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  return `<span class='d-none'>${editLink}</span>${text}`;
}

/** guide.rb:10-16 the `guide` METHOD (the :guide view body calls it; the
 *  overlay_guide haml's `= guide` and alert_guide call the METHOD, whose
 *  bytes lack the view's slot wrap): `return "" unless (text =
 *  guide_text).present?; wrap_with :div, class: classy("guide-text")`. */
function guideHelper(ctx: ViewContext): string {
  const text = guideText(ctx);
  if (text === "") return "";
  return `<div class="guide-text">${prependGuideEditLink(ctx, text)}</div>`;
}

/** guide.rb:18-23 alert_guide: `rendered = guide; return "" unless
 *  rendered.present?; alert(:secondary, true, false, class: "guide")
 *  { rendered }` - the bootstrap alert helper's dismissible bytes (the
 *  captured trailing space in "alert-dismissible " is the helper's classy
 *  emission). The alert METHOD's non-dismissible branches are the
 *  remainder (no :alert view registration exists in the engine). */
function alertGuide(ctx: ViewContext): string {
  const rendered = guideHelper(ctx);
  if (rendered === "") return "";
  return (
    `<div class="guide alert alert-secondary alert-dismissible " role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n` +
    `${rendered}</div>`
  );
}

// --- the create-surface helpers (all/new.rb) -------------------------------

/** new.rb:35-41 with_create_context: `with_nest_mode :edit do
 *  voo.title ||= new_view_title if new_name_prompt?; voo.show :help; yield
 *  end`. nest_mode has no byte effect on this surface (no nest editors
 *  render); the new_name_prompt? PROBE is the byte-relevant half - the
 *  visible? viz write lands on THIS voo (hide for named cards), which is
 *  why the captured :new/:simple_new slot JSONs carry hide:[name_formgroup]
 *  (new.rb:116-120 + visibility.rb:48-52). The voo.title arm is the
 *  unnamed-card surface's remainder (the engine renders no unnamed
 *  cards). */
function withCreateContext(ctx: ViewContext): void {
  // voo.title ||= new_view_title if new_name_prompt?
  if (newNamePrompt(ctx) && ctx.voo.opts["title"] === undefined) ctx.voo.opts["title"] = newViewTitle(ctx);
  ctx.voo.showViz("help");
}

/** new.rb:116-120 new_name_prompt?:
 *  `voo.visible? :name_formgroup { needs_name? || params[:name_prompt] }`.
 *  params do not exist in the engine (the AJAX name_prompt surface is the
 *  page layer's remainder). */
function newNamePrompt(ctx: ViewContext): boolean {
  return visibleWrite(ctx.voo, "name_formgroup", needsName(ctx));
}

/** new.rb:122-124 needs_name?: `card.name.blank? && !autoname?` - constant
 *  false on the engine surface: every card the engine renders is named, so
 *  Ruby's own first conjunct (name.blank?) answers false without reading
 *  the autoname rule; the unnamed-card arm is the disclosed remainder. */
function needsName(ctx: ViewContext): boolean {
  // A card the request names is never blank; the unnamed new card (Decko's
  // new/:type route) is. autoname? (a *autoname rule on the type) is not
  // consulted: an autonamed type's form still prompts for a name here.
  return ctx.fmt.card.name.s === "";
}

/** new.rb:136-140 new_type_prompt?:
 *  `voo.visible? :new_type_formgroup do
 *  !new_type_preset? && new_type_prompt_context? && new_type_permitted?
 *  end`. new_type_preset? (:142-144) = params[:type] || voo.type - neither
 *  exists on the engine render surface (params are page-layer; a nest's
 *  type opt would ride voo.opts["type"], read here). */
function newTypePrompt(ctx: ViewContext): boolean {
  const { fmt, voo } = ctx;
  // new_type_preset?: params[:type] (the request's new-card type) || voo.type
  const preset = voo.opts["type"] !== undefined || fmt.engine.requestNewCard?.typeId !== undefined;
  const context = fmt.isMain || isSimpleCard(fmt) || isTemplateCard(fmt);
  const permitted = newTypePermitted(ctx);
  return visibleWrite(voo, "new_type_formgroup", !preset && context && permitted);
}

/** form.rb shape - card.simple?: the name is not compound
 *  (cardname.rb simple?: parts.size == 1). */
function isSimpleCard(fmt: ViewContext["fmt"]): boolean {
  return !fmt.card.name.isCompound;
}

/** card-mod-content set/all/templating.rb:4-7 is_template?:
 *  `name.right_name&.codename&.in? %i[structure default]` - the codenames
 *  resolve to the canonical *structure/*default cards, so the right
 *  part's key equality is the same predicate. */
function isTemplateCard(fmt: ViewContext["fmt"]): boolean {
  const right = fmt.card.name.rightName;
  if (right === undefined) return false;
  return right.key === "*structure" || right.key === "*default";
}

/** new.rb:150-152 new_type_permitted?:
 *  `Card.new(type_id: card.type_id).ok? :create` - the create verdict on a
 *  virtual new card of the CURRENT type. The engine precomputes exactly
 *  this verdict per cardtype for Auth.createable_types
 *  (render.ts ensureCreateableTypes -> taskVerdictForCard(isNew: true)),
 *  so the port reads the current type's membership. Requires the prepare
 *  gate (CREATEABLE_TYPES_VIEWS carries this view's family). */
function newTypePermitted(ctx: ViewContext): boolean {
  const typeName = ctx.fmt.card.typeName;
  return typeName !== undefined && ctx.fmt.createableTypes().includes(typeName);
}

/** new.rb:99 new_view_hidden - the override stub (nil, dropped by
 *  output()'s compaction). */
/** new.rb:101-109 new_view_name:
 *  prompt -> new_name_formgroup (:111-114: output[_render_name_formgroup,
 *  hidden_field_tag("name_prompt", true)]); elsif !autoname? ->
 *  hidden_field_tag "card[name]", card.name; else nil (an autonamed new
 *  card carries no name field - the unnamed-card surface's remainder). */
function newViewName(ctx: ViewContext): string | undefined {
  if (newNamePrompt(ctx)) {
    return output([
      // _render_name_formgroup: the underscore skips the unknown check.
      ctx.fmt.renderView("name_formgroup", { skip_perms: true }),
      hiddenFieldTag("name_prompt", "true"),
    ]);
  }
  // autoname? is false for every named card (see needsName) -> !autoname?
  // is true: the hidden field always renders on the reachable surface
  return hiddenFieldTag("card[name]", ctx.fmt.card.name.s);
}

/** new.rb:126-134 new_view_type:
 *  prompt -> _render_new_type_formgroup; else hidden_field_tag
 *  "card[type_id]", card.type_id. */
function newViewType(ctx: ViewContext): string {
  // `_render_new_type_formgroup`: the underscore skips the unknown check.
  if (newTypePrompt(ctx)) return str(ctx.fmt.renderView("new_type_formgroup", { skip_perms: true }));
  return hiddenFieldTag("card[type_id]", String(ctx.fmt.card.typeId ?? ""));
}

/** new.rb:81-87 new_view_title: `output("New", (card.type_name unless
 *  card.type_id == Card.default_type_id))`. Unreachable on the pinned
 *  surface (named cards take the render_title branch of
 *  new_in_modal_title); the default-type check cites Card.default_type_id
 *  (the *basic codename card - absent from the oracle deck, so its id is
 *  nil and every typed card carries the type suffix). */
function newViewTitle(ctx: ViewContext): string {
  const typeName = ctx.fmt.card.typeName;
  return typeName === undefined || typeName === "Basic"
    ? "New"
    : output(["New", typeName]);
}

/** new.rb:89-91 new_in_modal_title:
 *  `new_name_prompt? ? new_view_title : render_title`. */
function newInModalTitle(ctx: ViewContext): string {
  return newNamePrompt(ctx) ? newViewTitle(ctx) : str(ctx.fmt.renderView("title"));
}

/** new.rb:93-95 new_success: `{ mark: card.rule(:thanks) || "_self" }` -
 *  the *thanks rule read is the rails rule machinery (the captured cards
 *  carry no *thanks rule); the port answers the _self fallback. */
const NEW_SUCCESS_MARK = "_self";

/** form.rb:186-200 card_form (the Symbol-action :create shape the captured
 *  create forms share): class "card-form slotter" (slotter unless
 *  redirect; NO autosave - that is :update-only, form.rb:221); the utf8
 *  enqueuer + the _method patch spoof (form_for on a PERSISTED record
 *  emits patch regardless of the create action - the captured bytes);
 *  hidden_form_tags' success tags BEFORE the body. `formAttrs` carries
 *  the caller's attributes between id and action (the captured order:
 *  class, id, [data-main-success | data-slot attrs], action,
 *  accept-charset, data-remote, method). */
function createCardForm(
  ctx: ViewContext,
  formAttrs: string,
  successTags: string,
  body: string,
): string {
  // form_for on a NEW record (the absent card a page offers to create):
  // Rails names the form "new_card" and sends a plain post, no _method.
  const persisted = ctx.fmt.card.id !== undefined;
  // THE RECAPTCHA TOKEN BYTES (set/all/recaptcha.rb:89-93
  // hidden_form_tags override — `return super unless recaptcha?(opts);
  // super + recaptcha_token(action)`): EVERY card_form carries them when
  // the guard is on — Ruby's format-module override shadows the base
  // hidden_form_tags for the whole app, and the recorded oracle signup
  // form is armed on the mod's seeded toggles (data/real.yml) + the
  // development default keys (lib/card/mod/recaptcha.rb @defaults). The
  // port's form consumers hand the token bytes to the form builder through
  // this gate: the config is the host's render-side seam
  // (render-recaptcha-config.ts — the SAME object the write path's guard
  // runs on), the rule content rides the mod rule seeds (mod-rule-seeds.ts
  // — the validate side resolves the same answer from storage, where the
  // boot seeds the gems' rows), and
  // the auth operands are the request render's (anonymous, not always_ok,
  // a set-up deck).
  const recaptchaConfig = renderRecaptchaConfig();
  const recaptchaOnForm =
    recaptchaConfig !== undefined &&
    recaptchaFormOn(
      {
        siteKey: recaptchaConfig.siteKey,
        secretKey: recaptchaConfig.secretKey,
        envController: true,
        signedIn: ctx.fmt.engine.viewer?.signedIn === true,
        alwaysOk: false,
        needsSetup: false,
        captchaRuleContent: captchaRuleSeedFor(ctx),
      },
      undefined,
    );
  const effectiveSuccessTags = recaptchaHiddenFormTags(
    successTags,
    recaptchaOnForm,
    "create",
    recaptchaConfig?.siteKey ?? "",
  );
  // card_form_html_opts's override (set/all/recaptcha.rb:95-99): the form
  // carries data-recaptcha="on" when the guard is on — the recaptcha
  // script's submit handler (assets/script/recaptcha.js.coffee:3-6) keys
  // on exactly this attribute to set the posted token.
  const effectiveFormAttrs =
    formAttrs + (recaptchaOnForm ? ` data-recaptcha="on"` : "");
  return (
    `<form class="card-form slotter" id="${persisted ? `edit_card_${ctx.fmt.card.id}` : "new_card"}"${effectiveFormAttrs}` +
    ` action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    (persisted ? `<input type="hidden" name="_method" value="patch" autocomplete="off" />` : "") +
    effectiveSuccessTags +
    body +
    `</form>`
  );
}

/** rule(:captcha) for the rendered card, from the mod rule seeds (the sync
 *  read the form render needs; the storage rows win on a real deck — see
 *  mod-rule-seeds.ts' precedence note). Undefined when no seed names the
 *  card's candidates (rule/all.rb's nil -> Card::Rule.toggle false). */
function captchaRuleSeedFor(ctx: ViewContext): string | undefined {
  const card = ctx.fmt.card;
  const candidates = ruleNamesForCard(
    {
      name: card.name?.s ?? "",
      isNew: card.id === undefined,
      typeId: card.typeId,
      typeName: card.typeName,
    },
    "*captcha",
  );
  for (const candidate of candidates) {
    const seeded = modRuleSeedContentForCandidate(candidate);
    if (seeded !== undefined) return seeded;
  }
  return undefined;
}

/** new.rb:71-75 create_form_with_alert_guide:
 *  `wrap_with :div, class: "d-flex justify-content-between" do
 *  [_render_new_fields, (alert_guide if voo.show?(:guide))] end` - guide is
 *  shown by default (visibility.rb show? = !hide?); the empty alert_guide
 *  "" STAYS in output() (Ruby "" is truthy - the trailing empty line
 *  inside the d-flex div on guide-less decks). */
function createFormWithAlertGuide(ctx: ViewContext): string {
  const fields = ctx.fmt.renderView("new_fields", {
    buttons_view: ctx.voo.opts["buttons_view"],
    // the nest's type opt (the image-typed new cards) inherits to the
    // new_fields render — new_type_prompt? reads it there (new.rb:142-144).
    type: ctx.voo.opts["type"],
  });
  return (
    `<div class="d-flex justify-content-between">` +
    output([fields, ctx.voo.show("guide") ? alertGuide(ctx) : undefined]) +
    `</div>`
  );
}

/** new.rb:23-33 view :new_fields, perms: :create, unknown: true,
 *  cache: :never: `wrap true, class: "w-100" do [...] end` - wrap computes
 *  slot_attributes BEFORE the block (card-mod-format set/all/html/
 *  wrap.rb:6-9), so the slot JSON is frozen pre-body (the captured
 *  standalone arm: show:[new_fields] only, the body's visible? writes
 *  excluded). The port freezes the wrap first and splices the body in. */
export const NEW_FIELDS_SENTINEL = "\u0000new_fields-body\u0000";
export const newFieldsView: ViewFn = (ctx) => {
  const open = modSlotWrap(ctx, "new_fields", NEW_FIELDS_SENTINEL, "w-100");
  const body = output([
    undefined, // new_view_hidden (new.rb:99, the nil override stub)
    newViewName(ctx),
    newViewType(ctx),
    ctx.fmt.renderView("content_formgroups"),
    // `_render(voo.buttons_view || :new_buttons)` — the underscore skips
    // the permission and unknown checks, so a new card renders its buttons.
    ctx.fmt.renderView(
      ctx.voo.opts["buttons_view"] === undefined
        ? "new_buttons"
        : String(ctx.voo.opts["buttons_view"]),
      { skip_perms: true },
    ),
  ]);
  return open.split(NEW_FIELDS_SENTINEL).join(body);
};

/** new.rb:154-160 view :new_type_formgroup:
 *  `wrap_type_formgroup do type_field class: "type-field _live-type-field
 *  slotter", href: path(view: :new_fields), "data-remote" => true end` -
 *  wrap_type_formgroup (edit_type.rb:64-68) is the shared formgroup
 *  (label + editor wrap + the assign hidden). The captured class order
 *  "type-field _live-type-field slotter form-control" - the caller's class
 *  string verbatim, the bootstrap FIELD_HELPERS " form-control" appended. */
export const newTypeFormgroupView: ViewFn = (ctx) =>
  typeFormgroup(ctx, {
    href: `/${ctx.fmt.urlKey()}/new_fields`,
    cls: "type-field _live-type-field slotter",
  });

/** new.rb:162-166 view :new_buttons - REGISTERED in the slice-4 batch
 *  (newButtonsView below keeps those bytes). */

/** new.rb:168-173 view :new_in_modal_buttons:
 *  `class_up "button-form-group", "d-flex"; button_formgroup do
 *  [standard_save_and_close_button(text: "Submit"), modal_cancel_button]
 *  end`. */
const newInModalButtonsView: ViewFn = ({ fmt, voo }) => {
  voo.classUp("button-form-group", "d-flex");
  return buttonFormGroup(
    { fmt, voo },
    output([standardSaveAndCloseButton("Submit"), modalCancelButton()]),
  );
};

/** new.rb:19-21 view :simple_new, perms: :create, unknown: true,
 *  wrap: :slot, cache: :never: `create_form` - card_form :create with NO
 *  form opts (no data-main-success, success nil -> success_tags "").
 *  The wrap: :slot config wraps the view OUTPUT (post-body), so the slot
 *  JSON carries the body's viz (captured: show:[simple_new, help],
 *  hide:[name_formgroup]). */
const simpleNewView: ViewFn = (ctx) => {
  withCreateContext(ctx);
  const form = createCardForm(ctx, "", "", createFormWithAlertGuide(ctx));
  return modSlotWrap(ctx, "simple_new", form);
};

/** new.rb:4-6 view :new, perms: :create, unknown: true, cache: :never:
 *  `framed_create_form new_form_opts` (:61-69): form_opts reverse_merged
 *  with success: new_success (the success[mark] hidden), then
 *  with_create_context { frame_and_form :create, form_opts } -
 *  frame_and_form (card-mod-format set/all/html/frame.rb:45-49) = frame do
 *  card_form end. The frame's slot wrap is POST-body here (with_create_
 *  context ran first - the captured :new slot carries show:[new, help],
 *  hide:[name_formgroup]). */
/** new.rb:43-49 create_form - the VIEW-LESS form-substrate dispatch the
 *  reference-editor views reach (`create_form success: {...}` with no body
 *  block - new_image.rb:13-19, nest_editor.rb:87-92):
 *  `with_create_context { card_form :create, form_opts {
 *  create_form_with_alert_guide } }` - the FULL new-fields body (the name/
 *  type hiddens + content_formgroups + the voo.buttons_view buttons), the
 *  caller's success hash riding card_form's hidden_form_tags. The shell is
 *  the substrate's createFormShell (form_for on the new record: id
 *  "new_card", action /card/create, post - the live capture's form tag). */
export function createFormDataShell(
  ctx: ViewContext,
  formOpts: { success?: Record<string, unknown> },
): string {
  withCreateContext(ctx);
  return createFormShell(ctx, {
    htmlAttrs: [],
    success: formOpts.success,
    body: createFormWithAlertGuide(ctx),
  });
}

/** create_form's UPDATE-shape arm (Ruby's create_form on a STORED card:
 *  card.new_card? is false, so form_for names the form edit_card_<id>
 *  and adds the _method=patch spoof while the action stays :create - the
 *  favicon's new_image op renders exactly this shape on the stored
 *  *favicon card). The recaptcha gate rides createCardForm like the
 *  create arm's. */
export function updateFormDataShell(
  ctx: ViewContext,
  formOpts: { success?: Record<string, unknown> },
): string {
  withCreateContext(ctx);
  return createCardForm(ctx, "", successTags(formOpts.success), createFormWithAlertGuide(ctx));
}
/** form.rb:186-200 card_form(:create, form_opts) with a CALLER body - the
 *  frame_and_form chain's inner shell (user.rb:29-32 setup_form:
 *  frame_and_form :create { [hidden fields, name formgroup,
 *  account_formgroups, buttons] }; NO with_create_context - that wrapper is
 *  the :new family's). */
export function createCardBodyShell(
  ctx: ViewContext,
  formOpts: { success?: Record<string, unknown>; body: string },
): string {
  return createFormShell(ctx, {
    htmlAttrs: [],
    success: formOpts.success,
    body: formOpts.body,
  });
}

export const newView: ViewFn = (ctx) => {
  withCreateContext(ctx);
  const form = createCardForm(
    ctx,
    ` data-main-success="{&quot;redirect&quot;:true}"`,
    hiddenFieldTag("success[mark]", NEW_SUCCESS_MARK),
    createFormWithAlertGuide(ctx),
  );
  return framedView(ctx, "new", () => form, { showHelp: true });
};

/** new.rb:8-17 view :new_in_modal, perms: :create, unknown: true,
 *  cache: :never, wrap: { modal: { footer: "", size: :edit_modal_size
 *  (-> :large -> modal-lg), title: :new_in_modal_title,
 *  menu: :new_modal_menu } }: `voo.buttons_view ||= :new_in_modal_buttons;
 *  wrap do create_form "data-slot-selector": "modal-origin",
 *  "data-slot-error-selector": ".card-slot" end`. The body's wrap computes
 *  slot attributes BEFORE create_form (wrap.rb:6-9), so the slot JSON is
 *  frozen pre-with_create_context (captured: show:[new_in_modal] only).
 *  new_modal_menu (:55-59): wrap_with_modal_menu { [render_close_modal_
 *  link, render_board_link] } - board_link WITHOUT confirm (menu.rb:85-97:
 *  no _confirm class, no data-confirm-msg). The buttons_view opt rides the
 *  new_fields render opts (the captured inner slot JSON carries it). */
const newInModalView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const slotOpen = modSlotWrap(ctx, "new_in_modal", NEW_FIELDS_SENTINEL);
  voo.opts["buttons_view"] = "new_in_modal_buttons";
  withCreateContext(ctx); // create_form -> with_create_context (post-freeze)
  const form = createCardForm(
    ctx,
    ` data-slot-selector="modal-origin" data-slot-error-selector=".card-slot"`,
    "",
    createFormWithAlertGuide(ctx),
  );
  const slotDiv = slotOpen.split(NEW_FIELDS_SENTINEL).join(form);
  const menu =
    `<div class="modal-menu _modal-menu ms-auto">` +
    [closeModalLink(), boardLink(fmt, false)].join("\n") +
    `</div>`;
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog modal-dialog-centered modal-lg'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `${newInModalTitle(ctx)}\n`;
  out += `${menu}\n`;
  out += "</div>\n";
  out += `<div class='modal-body'>\n${slotDiv}\n</div>\n`;
  out += "</div>\n</div>\n</div>\n";
  return out;
};

// --- the inline-editing surface (all/edit_inline.rb) ------------------------

/** form_buttons.rb:36-39 standard_cancel_button + form_elements.rb:67-76
 *  cancel_button + :78-80 cancel_strategy - cancel_in_place_button
 *  (edit_inline.rb:51-54) reverse_merges class "cancel-button btn-sm" and
 *  href: path (the card's own path); cancel_button adds btn btn-secondary,
 *  then cancel_strategy (href present -> "slotter"), then data-remote
 *  appended LAST. NO data-cy (only standard_cancel_button reverse-merges
 *  it). Captured: class, href, data-remote. */
function cancelInPlaceButton(fmt: ViewContext["fmt"]): string {
  return `<a class="cancel-button btn-sm btn btn-secondary slotter" href="/${fmt.urlKey()}" data-remote="true">Cancel</a>`;
}

/** edit_inline.rb:20-24 view :edit_inline_buttons:
 *  `button_formgroup do [standard_save_button, cancel_in_place_button,
 *  delete_button] end`. */
const editInlineButtonsView: ViewFn = ({ fmt, voo }) =>
  buttonFormGroup(
    { fmt, voo },
    output([
      standardSaveButton(voo),
      // cancel_button's `return unless voo.show? :cancel_button`
      // (form_elements.rb:68-70) — the nest_content known arm's
      // `voo.hide! :cancel_button` drops the anchor (the graded row).
      voo.show("cancel_button") ? cancelInPlaceButton(fmt) : undefined,
      deleteButton(fmt),
    ]),
  );

/** edit_inline.rb:2-14 view :edit_inline, perms: :update, unknown: true,
 *  cache: :never, wrap: :slot: add_name_context; voo.hide :name_formgroup,
 *  :type_formgroup; with_nest_mode :edit (no byte effect - no nest editors
 *  render on this surface); `card_form :update, success: edit_success do
 *  [edit_view_hidden, _render_content_formgroups,
 *  _render(voo.buttons_view || :edit_inline_buttons)] end` - the Symbol
 *  :update action adds autosave (form.rb:221) and no data-slot attrs;
 *  edit_success (editing.rb:31-33 stub) is nil -> success_tags "".
 *  The slot wrap is the view-config wrap (post-body: the captured JSON
 *  carries hide:[name_formgroup, type_formgroup]). */
const editInlineView: ViewFn = ({ fmt, voo }) => {
  fmt.addNameContext();
  voo.hide("name_formgroup");
  voo.hide("type_formgroup");
  const form =
    `<form class="card-form slotter autosave" id="edit_card_${fmt.card.id}"` +
    ` action="/update/${fmt.urlKey()}" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    output([
      undefined, // edit_view_hidden (editing.rb:35-36, the override stub)
      fmt.renderView("content_formgroups"),
      fmt.renderView(
        voo.opts["buttons_view"] === undefined
          ? "edit_inline_buttons"
          : String(voo.opts["buttons_view"]),
      ),
    ]) +
    `</form>`;
  return modSlotWrap({ fmt, voo }, "edit_inline", form);
};

/** edit_inline.rb:33-35 view :edit_row: `edit_row render_title,
 *  render_core, :edit_inline` - the edit_row helper (:37-44) mirrors the
 *  ported edit_name_row machinery (class_up card-slot d-flex form-group +
 *  wrap true class :row + the edit_row haml cols); the content is the
 *  :core render (render_core - the METHOD-style dispatch, bare bytes) and
 *  the edit link targets :edit_inline (edit_inline_link :46-52). */
const editRowView: ViewFn = ({ fmt, voo }) => {
  const editLink =
    `<a rel="nofollow" class="ms-2 edit-link slotter" data-cy="edit-link"` +
    ` href="/${fmt.urlKey()}/edit_inline" data-remote="true">${icon("edit")}</a>`;
  const inner =
    `<div class='col-2 text-start'>\n<label>\n${fmt.renderView("title")}\n</label>\n</div>\n` +
    `<div class='col-8'>\n${fmt.renderView("core")}\n</div>\n` +
    `<div class='col-2 text-end'>\n${editLink}\n</div>\n`;
  voo.classUp("card-slot", "d-flex form-group");
  return modSlotWrap({ fmt, voo }, "edit_row", inner, "row");
};

// --- all/form.rb :edit_in_form + all/formgroup.rb ---------------------------

/** form.rb:100-105 editor_in_multi_card + :107-113 wrap_editor_in_multi_
 *  card: `add_junction_class; wrap_editor_in_multi_card do [content_field,
 *  (form.hidden_field(:type_id) if card.new_card?)] end` - the formgroup
 *  branch (input_type unset != :hidden): formgroup render_title,
 *  input: "content", help: true, class: classy("card-editor")
 *  (formgroup.rb:16-27 + :24-33 + :46-56: the label carries the title
 *  span and the help render joined by "\n"; help shown by default -> the
 *  help view's slot wrap renders inside the label - the captured bytes).
 *  THIS is the only edit_slot branch the engine surface reaches:
 *  multi_card_editor? (:76-80) needs card.structure / edit_fields (the
 *  structure-rule + nested-field editors are rails-runtime remainders) and
 *  inline_nests_editor? needs voo.input_type (the *input type machinery's
 *  inline_nests arm - remainder); with @in_multi_card_editor just set
 *  (form.rb:20-24 view :edit_in_form), in_multi_card_editor? answers
 *  first. add_junction_class (:250-254) class_ups RIGHT-<tag safe_key>
 *  for compound cards. */
const editInFormView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  // form.rb:26-30 view :edit_in_form: reset_form (per-render form state);
  // @in_multi_card_editor = true; edit_slot — whose CASE order puts
  // multi_card_editor? FIRST: a structured card (Topic 001, the graded
  // row — Topic+*type+*structure) renders multi_card_edit(true), its
  // template's authored nests in NORMAL nest mode (the titled slot the
  // oracle pins); the formgroup below is the in_multi_card_editor arm
  // (a non-structured card's :edit_in_form render).
  if (multiCardEditor(ctx)) return multiCardEdit(ctx, true);
  if (fmt.card.name.isCompound) {
    // form.rb:250-254 add_junction_class
    voo.classUp("card-editor", `RIGHT-${fmt.card.name.rightName?.safeKey ?? ""}`);
  }
  const attrs = emitAttrs({
    class: "form-group card-editor",
    "data-card-id": fmt.card.id === undefined ? undefined : String(fmt.card.id),
    "data-card-name": fmt.card.name.s === "" ? undefined : h(fmt.card.name.s),
    "data-card-link-name": h(fmt.urlKey()),
  });
  const label = output([
    voo.show("title") ? fmt.renderView("title") : undefined, // formgroup_title
    fmt.renderView("help"), // formgroup_help(true) -> _render_help
  ]);
  return (
    `<div${attrs}>` +
    `<label for="card_content">${label}</label>\n` +
    `<div class="editor content-editor">${contentField({ fmt, voo })}</div>` +
    `</div>`
  );
};

/** formgroup.rb:2-7 view :read_form:
 *  `read_field_configs.map { |field, args| args[:view] = :read_formgroup;
 *  nest field, args }` - read_field_configs (:9-11) = edit_field_configs
 *  (card-mod-content set/all/chunk.rb:55-62): the explicit-edit-fields arm
 *  is voo.edit_structure (unset in the engine); the implicit arm walks the
 *  content's nest chunks. A nest-FREE card (the captured "Oracle Basics"
 *  arm) answers [] -> output "". A nest-BEARING card renders the nested
 *  read_formgroups through the nest machinery with home_view opts - the
 *  rails-runtime remainder (the captured Home arm is recorded in the
 *  fixture; the port answers "" there, disclosed). The nest scan is a
 *  byte-level guard ({{...}} chunks with the {{# comment form removed),
 *  not a chunk parse - the engine has no nest-chunk enumerator. */
function contentHasRealNest(fmt: ViewContext["fmt"]): boolean {
  const content = fmt.card.dbContent ?? "";
  return content.replace(/\{\{#[^}]*\}\}/g, "").includes("{{");
}

// Both arms of the Ruby map answer "": a nest-free card's
// read_field_configs is [] (the captured "Oracle Basics" arm), and the
// nest-bearing arm renders the nested read_formgroups through the nest
// machinery - the rails-runtime remainder recorded in the fixture,
// disclosed in the comment above.
const readFormView: ViewFn = () => "";

/** formgroup.rb:13 view :read_formgroup, template: :haml, unknown: true,
 *  wrap: :slot - the BODY lives on the flat record now (views.ts
 *  readFormgroupBody — the loader-less seam: the
 *  set/all file is a base-format registration in Ruby, and the graded
 *  page lane's read_form field nests dispatch it without a loader); this
 *  registration delegates so the surfaces cannot drift. */
const readFormgroupView: ViewFn = readFormgroupBody;

// --- all/editing.rb :edit_nests/:edit_structure + all/board/tab_views.rb ----

/** form.rb:124-129 structure_link (the multi_card_edit empty-configs
 *  fallback): `structured = link_to_card card.structure_rule_card,
 *  "structured"; "<label>Content</label><p><em>Uneditable; content is
 *  #{structured} without nests</em></p>"`. card.structure_rule_card is NIL
 *  on the captured cards (no structure rule) -> link_to_card(nil, ...)
 *  renders the wanted-card root link (captured: `<a class="wanted-card"
 *  href="/">structured</a>`). The with-rule branch (a real structure link)
 *  is the remainder. */
function structureLink(): string {
  return (
    `<label>Content</label>` +
    `<p><em>Uneditable; content is <a class="wanted-card" href="/">structured</a> without nests</em></p>`
  );
}

/** editing.rb:67-73 view :edit_nests, cache: :never:
 *  `frame do with_nest_mode :edit do multi_card_edit end end` - the frame
 *  machinery (framedView: hides :help first); multi_card_edit (form.rb
 *  :115-122) with fields_only NIL walks the card's OWN content nests
 *  UNFILTERED (edit_field_configs(nil) — no field_chunks tier; the Search
 *  Page's authored {{All Topics|open}} family nests all render), uniq'd,
 *  virtual-dropped. Under nest_mode :edit every nest substitutes to the
 *  target's :edit_in_form (mode.rb:64-68) — the graded Search Page row
 *  renders the All Topics field formgroup. Nest-free cards answer
 *  structure_link (the captured "Oracle Basics" arm). */
const editNestsView: ViewFn = (ctx) =>
  framedView(ctx, "edit_nests", () =>
    ctx.fmt.withNestMode("edit", () => {
      const body = multiCardEdit(ctx, false);
      return body;
    }),
  );

/** editing.rb:54-65 view :edit_structure, cache: :never:
 *  `return unless card.structure; nest card.structure_rule_card, view:
 *  :edit`. The structure resolution walks the card's set candidates over the
 *  SEATED render cards (the inputTypeRuleContent idiom - ruleNamesForCard +
 *  fetchRenderCard, the render.ts warm seats the candidates for this view),
 *  NOT the engine's structure universe: on a warm-closure engine the
 *  universe never loads (the mod prepare seats the closure before the first
 *  render, so the cold batch's parseStructureContents never runs), and the
 *  seated walk answers without it. The FIRST EXISTING candidate wins, the
 *  structure_rule_card arms nil it (content null, or "_self" after Ruby's
 *  strip - templating.rb:44-47's ternary); those arms keep the disclosed
 *  "" stub (the corpus's only :edit_structure op renders a structured card
 *  whose rule content is neither).
 *
 *  The nest target is the STRUCTURE RULE CARD the way Ruby fetches it:
 *  `rule_card :structure, skip_modules: true` (templating.rb:44-47) -
 *  card/fetch/results.rb:11 includes set modules `unless skip_modules?`, so
 *  THAT instance never carries the Rule set's card methods. Rendering the
 *  full :edit view on it runs into the missing methods downstream: the rule
 *  set's delete_confirm override calls `card.rule_setting_name` and the call
 *  raises (deleteButton - the reproduced upstream failure, the quiet
 *  render-error span the oracle's page embeds; the same missing-module
 *  posture leaves the rule card's help slot EMPTY - the rule set's
 *  raw_help_text override is absent with it, which this engine's help view
 *  already answers). The flag rides the card instance (structureRuleFetch
 *  Instances); the nest itself is nestRecord, whose viewOpts add the
 *  captured data-slot's nest_name and home_view:"open" (nest.rb
 *  prepare_view_and_opts! + the :edit home_view rule). */
const editStructureView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*structure")) {
    const ruleCard = ctx.fmt.engine.fetchRenderCard(candidate);
    if (ruleCard === undefined) continue; // no rule at this pattern
    const content = ruleCard.dbContent;
    if (content !== undefined && content.trim() === "_self") {
      return ""; // structure_rule_card nils the "_self" rule (templating.rb:46); the null-content arm keeps the stub too
    }
    structureRuleFetchInstances.add(ruleCard);
    return ctx.fmt.nestRecord(ruleCard, "edit");
  }
  return ""; // `return unless card.structure` - the structure-less stub arm
};

/** board/tab_views.rb:47-49 view :guide_tab, unknown: true:
 *  `render_guide` - the render dispatch to the :guide view (card-mod-help
 *  set/all/guide.rb:6-16, wrap: :slot - the captured arm is the guide
 *  view's slot wrap with show:[guide_tab, guide]). */
export const guideTabView: ViewFn = ({ fmt }) => fmt.renderView("guide");

// --- all/overlay_guide.rb ----------------------------------------------------

/** overlay_guide.rb:2-8 view :overlay_guide, cache: :never, unknown: true,
 *  template: :haml, wrap: { slot: { class: "_overlay d0-card-overlay card
 *  nodblclick" } }: the body is a comment stub (ALL bytes come from the
 *  overlay_guide.haml template + the wrap config):
 *  `%div / .d-flex.ms-2 / .ms-auto / = link_to icon_tag(:close), path:
 *  "#", "data-bs-dismiss": "overlay", class: "text-dark p-1 ms-1" /
 *  (blank) / = guide`. haml emits one \n per line (blank lines swallowed);
 *  link_to appends href LAST after the consumed path key (the captured
 *  attr order: data-bs-dismiss, class, href); `= guide` calls the guide
 *  METHOD (guideHelper - the bare guide-text bytes, no view slot wrap). */
const overlayGuideView: ViewFn = (ctx) => {
  const inner =
    `<div>\n` +
    `<div class='d-flex ms-2'>\n` +
    `<div class='ms-auto'>\n` +
    `<a data-bs-dismiss="overlay" class="text-dark p-1 ms-1" href="#"><i class="notranslate material-icons">close</i></a>\n` +
    `</div>\n</div>\n` +
    `${guideHelper(ctx)}\n</div>\n`;
  return modSlotWrap(
    ctx,
    "overlay_guide",
    inner,
    "_overlay d0-card-overlay card nodblclick",
  );
};

// ---------------------------------------------------------------------------



/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
// ---------------------------------------------------------------------------
// the BOARD lane: the board/cardboard wrapper + the tab surface (the board
// substrate and the tab views whose machinery the engine already carries).
// Byte shapes pinned by fixtures/captured/board-views.json (captured from
// the live oracle app; tests/card/mod-loader/oracle-capture-board-views.rb).
// ---------------------------------------------------------------------------

/** board.rb:2-7 BOARD_TABS (the frozen constant; "Account" maps to
 *  :account_tab but tab_visibility.rb:16-17 `show_account_tab?` is
 *  constant false, so the visible list never carries it). */
const BOARD_TABS: ReadonlyArray<readonly [string, string]> = [
  ["Guide", "guide_tab"],
  ["Engage", "engage_tab"],
  ["History", "history_tab"],
  ["Related", "related_tab"],
  ["Rules", "rules_tab"],
];

/** board_pills.rb:1-4 the pill list classes. */
export const BOARD_PILL_UL_CLASSES = "nav nav-pills _auto-single-select board-pills flex-column";
const BOARD_PILL_LI_CLASSES = "nav-item";

/** menu.rb:196-199 board_slot_selector - the overlay target the board
 *  links' data-slot-selector names (HTML-escaped > in the attributes). */
export const BOARD_SLOT_SELECTOR =
  ".board-main > .overlay-container > .card-slot._bottomlay-slot," +
  ".board-main > ._overlay-container-placeholder > .card-slot";
const BOARD_SLOT_SELECTOR_ESC = h(BOARD_SLOT_SELECTOR);

/** board.rb:82-87 breadcrumb_data: { "data-breadcrumb": title,
 *  "data-breadcrumb-class": html_class || title.underscore }. */
function breadcrumbData(title: string, htmlClass?: string): Record<string, string> {
  return {
    "data-breadcrumb": title,
    "data-breadcrumb-class": htmlClass ?? title.toLowerCase().replace(/ /g, "_"),
  };
}

/** card-1.110.0 mod/core set_pattern/09_self.rb:1-3 + 07_right.rb:6-8 -
 *  the set-card labels the rules_tab select renders
 *  (card-mod-rules set/type/set.rb:111-113 label_and_url_key). */
function setCardLabel(setName: string, kind: "self" | "right"): string {
  return kind === "self"
    ? `The card "${setName}"`
    : `All "+${setName}" cards`;
}

/** The board modal menu's edit link (board.rb:105-113 switch_to_edit_link
 *  + menu.rb:205-209 confirm_edit_loss + link_to_view). */
function switchToEditLink(fmt: ViewContext["fmt"]): string {
  return (
    `<a rel="nofollow" data-slotter-mode="modal-replace" data-modal-class="modal-lg"` +
    ` class="_confirm slotter"` +
    ` data-confirm-msg="Unsaved changes will be lost. Do you want to proceed?"` +
    ` href="/${fmt.urlKey()}/edit" data-remote="true">${icon("edit")}</a>`
  );
}

/** board.rb:66-76 board_menu (modal.rb:24 wrapper :modal_menu): the div
 *  around [close_modal_link, switch_to_edit_link], one \n between. */
function boardMenu(fmt: ViewContext["fmt"]): string {
  return `<div class="modal-menu _modal-menu ms-auto">${[closeModalLink(), switchToEditLink(fmt)].join("\n")}</div>`;
}

/** board.rb:53-62 board_breadcrumbs (strip_heredoc). */
function boardBreadcrumbs(cardName: string): string {
  return (
    `<nav aria-label="breadcrumb">\n` +
    `  <ol class="breadcrumb _board-breadcrumb">\n` +
    `    <li class="breadcrumb-item">${h(cardName)}</li>\n` +
    `    <li class="breadcrumb-item active">Edit</li>\n` +
    `  </ol>\n` +
    `</nav>`
  );
}

/** board.rb:33-38 board_parts: `voo.show! :edit_type_row` (the FORCE viz
 *  write - visibility.rb hide!/show!) then [frame_help, _render_edit_name_
 *  row(home_view: :edit_name_row), _render_edit_form] joined by output().
 *  frame_help (card-mod-format html/frame.rb:31-35) = with_class_up
 *  "help-text", "alert alert-info" { _render :help }. */
function boardParts(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  voo.setViz("edit_type_row", "show"); // show! (force)
  voo.classUp("help-text", "alert alert-info"); // frame_help's with_class_up
  return output([
    fmt.renderView("help"),
    fmt.renderView("edit_name_row", { home_view: "edit_name_row" }),
    fmt.renderView("edit_form"),
  ]);
}

/** editing.rb:3-11 view :board, perms: :update, unknown: true,
 *  cache: :never, wrap: :board. The body (editing.rb:4-10):
 *  with_nest_mode :edit (no byte effect - no nest editors render here);
 *  add_name_context; voo.show :help; `wrap true, breadcrumb_data("Editing",
 *  "edit") { board_parts }` - wrap freezes slot attributes BEFORE the
 *  block (wrap.rb:6-9), so the board slot's JSON carries show:[board, help]
 *  while the CHILD slot JSONs carry the show!'d edit_type_row.
 *
 *  The wrapper :board (board.rb:12-20): class_up "modal-dialog" "no-gaps";
 *  voo.hide! :modal_footer (force); wrap_with_modal(size: :full, title:
 *  board_breadcrumbs, menu: :board_menu) { haml :board } - the modal bytes
 *  with the no-gaps class and modal-full size, the breadcrumb nav as the
 *  header title. board.haml: `.board.container-fluid > .row >
 *  .col-8.board-main > ._overlay-container-placeholder > interior` +
 *  `.col-4.board-sidebar.nodblclick > ._overlay-container-placeholder >
 *  board_tabs` (one \n per line; the sidebar rendered after the interior,
 *  so its slot JSON carries the post-board_parts viz). */
const BOARD_BODY_SENTINEL = "\u0000board-body\u0000";
function boardBody(ctx: ViewContext, view: "board" | "cardboard"): string {
  const { fmt, voo } = ctx;
  // editing.rb:4-10 with_nest_mode :edit wraps the WHOLE body — the edit
  // form's field nests (the Topic template's {{+summary}} family) render
  // through mode.rb's view_in_edit_mode (every nest view substitutes to
  // the field card's :edit_in_form formgroup; the perms-:none :link nest
  // renders blank), so the mode IS byte-effective here.
  return fmt.withNestMode("edit", () => {
    fmt.addNameContext();
    voo.showViz("help");
    // the wrapper's modal-dialog class_up + modal_footer hide! land AFTER
    // this slot froze (the captured interior JSON carries neither; the
    // sidebar's carries both) - boardView writes them between the halves
    const open = modSlotWrap(ctx, view, BOARD_BODY_SENTINEL, "", {
      "data-breadcrumb": "Editing",
      "data-breadcrumb-class": "edit",
    });
    return open.split(BOARD_BODY_SENTINEL).join(boardParts(ctx));
  });
}

const boardBodyView: ViewFn = (ctx) => boardBody(ctx, "board");

/** board.haml + board.rb:12-20 the :board WRAPPER bytes around the view:
 *  the modal (footer "" - hidden by the hide!, size modal-full, title
 *  board_breadcrumbs, menu board_menu) around the board grid. */
function boardModal(ctx: ViewContext, interior: string, sidebar: string): string {
  const { fmt } = ctx;
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog no-gaps modal-dialog-centered modal-full'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `${boardBreadcrumbs(fmt.card.name.s)}\n`;
  out += `\n${boardMenu(fmt)}\n`;
  out += "</div>\n";
  out += "<div class='modal-body'>\n";
  out += `<div class='board container-fluid'>\n<div class='row'>\n`;
  out += `<div class='col-8 board-main'>\n<div class='_overlay-container-placeholder'>\n`;
  out += `${interior}\n</div>\n</div>\n`;
  out += `<div class='col-4 board-sidebar nodblclick'>\n<div class='_overlay-container-placeholder'>\n`;
  out += `${sidebar}\n</div>\n</div>\n</div>\n</div>\n`;
  out += "\n</div>\n</div>\n</div>\n</div>\n";
  return out;
}

export const boardView: ViewFn = (ctx) => {
  const { voo } = ctx;
  const interior = boardBody(ctx, "board");
  // the wrapper :board's class_up + hide! (board.rb:13-14) - by the
  // captured slot JSONs these land between the interior and the sidebar
  voo.classUp("modal-dialog", "no-gaps");
  voo.setViz("modal_footer", "hide"); // hide! (force)
  const sidebar = boardTabsView(ctx);
  return boardModal(ctx, interior, sidebar);
};

/** editing.rb:13 view :cardboard, :board - the ALIAS: board's BODY without
 *  the wrapper (the captured arm carries the breadcrumb-data slot and the
 *  board_parts bytes, no modal; and the anonymous arm RENDERS - the alias
 *  carries no perms directive of its own). */
export const cardboardView: ViewFn = (ctx) => boardBody(ctx, "cardboard");

// --- the sidebar: board_tabs (board.rb:24-32) + the tab_panel haml ----------

/** board.rb:24-32 board_tabs: `wrap do tabs(visible_board_tabs,
 *  BOARD_TAB_NAMES[board_tab], load: :lazy) { _render board_tab } end`.
 *  board_tab (board.rb:39-41) = board_param :tab = params[:board][:tab] ||
 *  default_board_tab - params do not exist in the engine, so the default
 *  decides: default_board_tab (board.rb:88-90) = show_guide_tab? ?
 *  :guide_tab : :engage_tab. The tabs call is card-mod-tabs set/all/tabs.rb
 *  :38-52 with load: :lazy - LazyTab objects (lib/card/lazy_tab.rb) in the
 *  tab_panel haml (set/all/tabs/tab_panel.haml): the tabbable div, the
 *  nav-tabs ul of tab buttons, and one pane per tab - the ACTIVE pane
 *  carries the block render, the lazy panes stay empty. */
const BOARD_TABS_SENTINEL = "\u0000board-tabs-active\u0000";

/** tab_visibility.rb:2-8 visible_board_tabs + :11-58 the show_*
 *  predicates: engage = real? && (show_follow? || show_discussion?);
 *  history/related = real?; rules = true; guide = guide.present?
 *  (guide.rb:10-16's helper - the guide helper's non-empty bytes);
 *  account = false. show_follow? (card-mod-follow follow_link_views.rb:6-8)
 *  = Auth.signed_in? && !card.new_card? && followable? (follow.rb:2-3,
 *  the true override). show_discussion? (tab_visibility.rb:60-64) =
 *  the discussion card's update/read ok - the discussion card is a NEW
 *  card (fetch :discussion, new: {}) whose update verdict rides *all+
 *  *update - on the captured deck anonymous fails it, signed-in passes;
 *  the port answers the viewer's signedIn (disclosed: decks granting
 *  anonymous update would diverge). */
function visibleBoardTabs(ctx: ViewContext): ReadonlyArray<readonly [string, string]> {
  const { fmt } = ctx;
  const real = fmt.card.id !== undefined;
  const signedIn = fmt.engine.viewer?.signedIn === true;
  const showGuide = guideHelper(ctx) !== "";
  const showEngage = real && (signedIn || showDiscussionTab(ctx));
  return BOARD_TABS.filter(([title, view]) => {
    if (view === "guide_tab") return showGuide;
    if (view === "engage_tab") return showEngage;
    if (view === "history_tab" || view === "related_tab") return real;
    if (view === "rules_tab") return true;
    return false; // account_tab: show_account_tab? is constant false
  });
}

/** tab_visibility.rb:60-64 show_discussion? - the engine surface answers
 *  the viewer's signed-in state (the new discussion card's update verdict
 *  is the *all+*update walk; see the disclosure above). */
function showDiscussionTab(ctx: ViewContext): boolean {
  // tab_visibility.rb:36-50: discussion_card answers NIL for a new card
  // and for a card that IS a discussion card (compound && tag ==
  // discussion), and show_discussion? is that card's ok?(update when the
  // phantom is new, else read). The graded corpus row
  // Topic 001+discussion:engage_tab pins the discussion-card arm: the
  // card's own tag IS discussion, so discussion_section contributes
  // nothing and the tab ends at the follow section.
  const { fmt } = ctx;
  if (fmt.engine.viewer?.signedIn !== true) return false;
  if (fmt.card.id === undefined) return false; // new_card?
  const name = fmt.card.name;
  if (name.isCompound && name.tagKey === "discussion") return false;
  return true;
}

function boardTabsView(ctx: ViewContext): string {
  const { fmt } = ctx;
  const visible = visibleBoardTabs(ctx);
  const activeName =
    visible.find(([, view]) => view === "guide_tab")?.[0] ??
    visible.find(([, view]) => view === "engage_tab")?.[0] ??
    visible[0]?.[0] ??
    "";
  const activeView = BOARD_TABS.find(([t]) => t === activeName)?.[1] ?? "";
  // the tab ids ride the chain-shared unique_id counter (tab.rb:87-89
  // tab_id = "tab-#{unique_id}-#{name.to_name.safe_key}") - the interior's
  // editors consumed the earlier counter values (the captured ids start at
  // 2 after the edit form's textarea)
  const tabs = visible.map(([title, view]) => {
    const id = `tab-${fmt.uniqueId()}-${DeckoName.parse(title).safeKey}`;
    return { title, view, id, active: title === activeName };
  });
  const buttons = tabs
    .map((tab) => {
      // Tab#tab_button (tab.rb:50-54) + LazyTab#button_attrib/:60-64
      // (tab.rb:99-101) + Tab#tab_button_link (tab.rb:77-83): class
      // "active nav-link" for the active tab, "load nav-link" for the
      // lazy ones; the data-url before the class (the caller-hash order).
      const cls = tab.active ? "active nav-link" : "load nav-link";
      return (
        `<li role="presentation" class="nav-item tab-li-${DeckoName.parse(tab.title).key}">` +
        `<a data-url="/${fmt.urlKey()}/${tab.view}" class="${cls}" role="tab"` +
        ` data-bs-toggle="tab" data-tab-name="${tab.title}" href="#${tab.id}">${tab.title}</a></li>`
      );
    })
    .join("\n");
  const panes = tabs
    .map((tab) => {
      const content = tab.active ? BOARD_TABS_SENTINEL : "";
      return (
        `<div role="tabpanel" id="${tab.id}"` +
        ` class="tab-pane tab-pane-${tab.title}${tab.active ? " active" : ""}">${content}</div>`
      );
    })
    .join("\n");
  const tabPanel =
    `<div class='tabbable tab-panel' role='tabpanel'>\n` +
    `<ul class='nav nav-tabs' role='tablist'>\n${buttons}\n</ul>\n` +
    `<div class='tab-content'>\n${panes}\n</div>\n</div>\n`;
  // the block renders INSIDE the pane (LazyTab#tab_pane yields for the
  // active tab), then the wrap freezes the sidebar slot POST-body (the
  // captured sidebar JSON carries edit_type_row + the modal_footer hide)
  const activeContent =
    activeView === "" ? "" : str(fmt.renderView(activeView));
  return modSlotWrap(ctx, "board", tabPanel.replace(BOARD_TABS_SENTINEL, activeContent));
}

// --- the tab views: rules_tab, related_tab, history_tab ----------------------

/** card-mod-rules set/all/set_select.rb:2-33 + related_sets.rb:1-9
 *  (set_list(:related) = related_sets(true) = [name+:self] + (name+:right
 *  if known? && simple?) - card-mod-rules set/type/set.rb:98-107) +
 *  set/type/set.rb:38-44 + set_pattern 09_self.rb:1-3 / 07_right.rb:6-8
 *  labels. tab_views.rb:22-31 view :rules_tab, unknown: true:
 *  class_up "card-slot" "flex-column"; wrap { set_select(:related) } -
 *  card_select's form_tag (path view: :filtered_accordion_rule_list,
 *  mark: "") around set_select_tag's select2 + the _fixed-slot div. */
export const rulesTabView: ViewFn = ({ fmt, voo }) => {
  voo.classUp("card-slot", "flex-column");
  // related_sets(true): the self set, plus the right set for known simple
  // cards (both targets are simple + known)
  const sets: Array<{ name: string; kind: "self" | "right" }> = [
    { name: `${fmt.card.name.s}+*self`, kind: "self" },
  ];
  if (fmt.card.id !== undefined && !fmt.card.name.isCompound) {
    sets.push({ name: `${fmt.card.name.s}+*right`, kind: "right" });
  }
  const options = [`<option value=""></option>`]
    .concat(
      sets.map(
        (set) =>
          `<option value="${DeckoName.parse(set.name).urlKey}">${h(setCardLabel(fmt.card.name.s, set.kind))}</option>`,
      ),
    )
    .join("\n");
  const select2Id = `${fmt.uniqueId()}-${Math.floor(cardWallClockNow().getTime() / 1000)}`; // Time.now through the engine wall clock
  const inner =
    `<form role="filter" data-slot-selector=".card-slot._fixed-slot"` +
    ` class="nodblclick slotter" action="/?view=filtered_accordion_rule_list"` +
    ` accept-charset="UTF-8" data-remote="true" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<select name="mark" id="mark"` +
    ` class="_submit-on-select form-control _close-rule-overlay-on-select"` +
    ` data-minimum-results-for-search="Infinity" data-placeholder="Select set"` +
    ` data-select2-id="${select2Id}">${options}</select>\n` +
    `<div class="card-slot _fixed-slot"></div></form>`;
  return modSlotWrap({ fmt, voo }, "rules_tab", inner);
};

/** related_section.rb:1-15 RELATED_ITEMS (the frozen constant; the
 *  commented-out rows are verbatim omissions) + :17-30 the three item
 *  builders. tab_views.rb:14-19 view :related_tab:
 *  board_pill_sections "Related" { the three sections } (board_pills.rb:
 *  32-37): the pill UL + per section an h6 title + the li-wrapped pills.
 *  board_pill_item_opts (board_pills.rb:20-30): board_link_opts
 *  (board.rb:42-50: data-slot-selector, data-slotter-mode override,
 *  remote, slotter class, path layout overlay + slot items view closed +
 *  path view ||= content) merged with the pill toggle, the breadcrumb
 *  data, the data-cy key and the nav-link class; link_to_card adds the
 *  known/wanted class LAST (the captured "slotter nav-link known-card").
 *  The data-cy key is text.to_name.key (cardname.rb generate_key:
 *  underscore + Rails singularize - "children"->"child",
 *  "links out"->"link_out", "RichText cards"->"rich_text_card"). */
const RELATED_BY_NAME: ReadonlyArray<readonly [string, string]> = [["children", "*children"]];
const RELATED_BY_CONTENT: ReadonlyArray<readonly [string, string]> = [
  ["links out", "*links_to"],
  ["links in", "*linked_to_by"],
  ["nests", "*nests"],
  ["nested by", "*nested_by"],
  ["references out", "*refers_to"],
  ["references in", "*referred_to_by"],
];

/** cardname.rb generate_key's singularize for the pill texts (the fixed
 *  RELATED_ITEMS vocabulary + the type label). */
function pillCyKey(text: string): string {
  const table: Record<string, string> = {
    children: "child",
    "links out": "link_out",
    "links in": "link_in",
    nests: "nest",
    "nested by": "nested_by",
    "references out": "reference_out",
    "references in": "reference_in",
  };
  // "RichText cards": underscore splits the CamelCase run then Rails
  // singularizes - rich_text_cards -> rich_text_card
  return table[text] ?? "rich_text_card";
}

function boardPillItem(text: string, markUrlKey: string, cyKey?: string): string {
  const cy = `${cyKey ?? pillCyKey(text)}-pill`;
  return (
    `<li class="nav-item">` +
    `<a data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}" data-slotter-mode="override"` +
    ` class="slotter nav-link known-card" data-bs-toggle="pill"` +
    ` data-breadcrumb="Related" data-breadcrumb-class="related"` +
    ` data-cy="${cy}"` +
    ` href="/${markUrlKey}/content?layout=overlay&amp;slot%5Bitems%5D%5Bview%5D=closed"` +
    ` data-remote="true">${text}</a></li>`
  );
}

export const relatedTabView: ViewFn = ({ fmt }) => {
  const sections: Array<[string, string[]]> = [];
  // related_by_name_items (related_section.rb:19-24): the name ancestors
  // for compound cards (unpinned - both targets are simple) + by name
  sections.push([
    "by name",
    RELATED_BY_NAME.map(([text, right]) => {
      const mark = `${fmt.card.name.s}+${right}`;
      return boardPillItem(text, DeckoName.parse(mark).urlKey);
    }),
  ]);
  sections.push([
    "by content",
    RELATED_BY_CONTENT.map(([text, right]) => {
      const mark = `${fmt.card.name.s}+${right}`;
      return boardPillItem(text, DeckoName.parse(mark).urlKey);
    }),
  ]);
  // related_by_type_items (related_section.rb:31-33): the absolute
  // "<Type>+*type+by_name" mark. The pill's data-cy keys on the CARD'S OWN
  // TYPE ("Topic cards" -> topic_card-pill; the graded corpus row pins
  // topic_card on the Topic 001 card — the hardcoded rich_text_card
  // fallback was the RichText label only).
  const typeName = fmt.card.typeName ?? "";
  // Rails' underscore (ActiveSupport Inflector.underscore): CamelCase runs
  // split before the downcase — "RichText" -> "rich_text", "Topic" ->
  // "topic" (the captured rich_text_card-pill pins the split).
  const typeCode =
    fmt.card.typeCode ??
    typeName
      .replace(/([A-Z])/g, "_$1")
      .replace(/^_/, "")
      .toLowerCase();
  sections.push([
    "by type",
    [
      boardPillItem(
        `${typeName} cards`,
        DeckoName.parse(`${typeName}+*type+by_name`).urlKey,
        `${typeCode}_card`,
      ),
    ],
  ]);
  // board_pill_sections (board_pills.rb:32-37): wrap_with :ul over the
  // sections map (wrap_with joins the array with "\n"); each section =
  // the h6 + wrap_each_with(:li) (items joined "\n")
  return (
    `<ul class="${BOARD_PILL_UL_CLASSES}">` +
    sections
      .map(
        ([title, items]) =>
          `<h6 class="ms-1 mt-3">${title}</h6>${items.join("\n")}`,
      )
      .join("\n") +
    `</ul>`
  );
};

/** tab_views.rb:8-12 view :history_tab, wrap: :slot: class_up "d0-card-
 *  body" "history-slot"; voo.hide :act_legend; acts_board_layout
 *  card.history_acts (card-mod-history set/all/history_board.rb:28-34):
 *  output[_render_creator_credit, act_link_list(acts, :board),
 *  act_paging(acts, context)] - act_paging returns nil without a
 *  controller request (the engine surface has none). act_link_list
 *  (:45-52) = board_pills(acts_for_accordion's items) - the pill UL with
 *  one li per act. act_link_list_item (:54-59) + BoardActRenderer#
 *  board_link (board_act_renderer.rb:16-25): board_link_opts(path:
 *  {act_id, view: :board_act, act_seq}, data-bs-toggle: pill) + class
 *  "d-flex nav-link" (the layout path key deleted) around
 *  link_to_card(@card, title, opts); the title (:8-14) = the me-2 div
 *  ["#seq", actor.name, small(edited_ago)] joined " " + the ms-auto
 *  act-summary div (act_renderer.rb:35-48 summary: the per-type icons,
 *  one <small> per count - count 1 renders the bare small). The seq
 *  counts DOWN from acts.size (act_listing.rb:60-68 current_act_seq).
 *  The acts/actor/acted_at data ride the history seam
 *  (render.ts HISTORY_SEAM_VIEWS carries this view). */
export const historyTabView: ViewFn = ({ fmt, voo }) => {
  voo.classUp("d0-card-body", "history-slot");
  voo.hide("act_legend");
  const reader = fmt.engine.historyRenderReader?.();
  const acts = reader?.acts ?? [];
  const total = acts.length;
  let seq = total;
  const items = acts
    .map((act) => {
      const thisSeq = seq;
      seq -= 1;
      const actorId = Number(act.actor_id);
      const actor = reader?.cardInfo(actorId);
      const actorName = actor?.name ?? String(actorId);
      // acted_at TEXT ("YYYY-MM-DD HH:MM:SS") -> UTC Date (the canonical
      // form act.ts pins - the history mod's parseActedAt shape)
      const actedAt = act.acted_at;
      const agoDate =
        actedAt === null || actedAt === undefined
          ? undefined
          : new Date(
              Date.UTC(
                +actedAt.slice(0, 4),
                +actedAt.slice(5, 7) - 1,
                +actedAt.slice(8, 10),
                +actedAt.slice(11, 13),
                +actedAt.slice(14, 16),
                +actedAt.slice(17, 19),
              ),
            );
      const ago = agoDate === undefined ? "" : `${timeAgoInWords(agoDate)} ago`;
      // summary: ActRenderer#summary (act_renderer.rb:37-41 + 96-103) - the
      // act's APPROVED ACTIONS' per-type icons, the same composition the
      // accordion's header badge renders (actSummaryBadge). NOT
      // act.action_on(card.id): the on-this-card lookup is
      // last_action_verb's mechanism - a family act (+summary, +tags)
      // carries no action on the render root, and the earlier lookup
      // defaulted every non-root pill to the edit icon where the corpus
      // oracle pins add_circle for all four Topic 001 pills.
      const summary =
        reader === undefined
          ? ""
          : actSummaryBadge(reader, reader.actionsOfAct(Number(act.id)));
      const title =
        `<div class="me-2">#${thisSeq} ${h(actorName)} <small>${ago}</small></div>` +
        `<div class="ms-auto act-summary">${summary}</div>`;
      const markUrl = fmt.urlKey();
      return (
        `<li class="nav-item">` +
        `<a data-bs-toggle="pill" data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}"` +
        ` data-slotter-mode="override" class="slotter d-flex nav-link known-card"` +
        ` href="/${markUrl}/board_act?act_id=${act.id}&amp;act_seq=${thisSeq}` +
        `&amp;slot%5Bitems%5D%5Bview%5D=closed" data-remote="true">${title}</a></li>`
      );
    })
    .join("\n"); // board_pills' wrap_each_with(:li) joins with newline
  const body = output([
    fmt.renderView("creator_credit"),
    `<ul class="${BOARD_PILL_UL_CLASSES}">${items}</ul>`,
  ]);
  return modSlotWrap({ fmt, voo }, "history_tab", body);
};

// ---------------------------------------------------------------------------



// --- the follow lane: follow_section + engage_tab (the follow seam) ---------

/** card-mod-follow set/all/follow/follow_link.rb:1-96 the FollowLink base +
 *  start_follow_link.rb/stop_follow_link.rb (the two concrete classes):
 *  the button (link_to render_link_text, opts) - title "#{action} emails
 *  about changes to #{follow_label}", the css_classes chain
 *  ("follow-link", css_class, "slotter btn btn-sm btn-primary" - the EMPTY
 *  css_class keeps its blank in the captured bot bytes), the
 *  data-update-foreign-slot foreign-slot hook, the hover_text arm, and the
 *  path (follow_link.rb:66-69): mark = follow_set_card.follow_rule_name
 *  (Auth.current.name), action :update, success {mark: card.name, view:
 *  :follow_section}, card {content: "[[*always]]" / "[[*never]]"} - the
 *  Rails to_query encodings (spaces +, brackets/star %XX). Shared with the
 *  follow mod's :follow_button view (the SAME FollowLink#button bytes -
 *  the standalone view renders the identical anchor, the oracle pins
 *  both). */
export function followButton(
  bundle: { session: { actorName: string } | undefined; followed: boolean; followLabel: string },
  cardName: string,
): string {
  const ruleName = DeckoName.parse(
    `${cardName}+*self+${bundle.session?.actorName ?? ""}+*follow`,
  ).urlKey;
  const start = !bundle.followed;
  const title = start
    ? `send emails about changes to ${bundle.followLabel}`
    : `stop sending emails about changes to ${bundle.followLabel}`;
  const cssClass = start
    ? "follow-link  slotter btn btn-sm btn-primary"
    : "follow-link btn-item-delete slotter btn btn-sm btn-primary";
  const verb = start ? "follow" : "following";
  const option = start ? "always" : "never";
  const hover = start ? "" : ` data-hover-text="unfollow"`;
  // Rails' query-value encoding (CGI.escape): spaces render "+" and a
  // literal "+" renders "%2B" — "Topic 001+discussion" lands as
  // "Topic+001%2Bdiscussion" (the graded corpus pins the mark's %2B; the
  // previous space-only rewrite left the junction plus raw).
  const successMark = cardName.replace(/ /g, "\u0000").replace(/\+/g, "%2B").replace(/\u0000/g, "+");
  const href =
    `/update/${ruleName}` +
    `?card%5Bcontent%5D=%5B%5B%2A${option}%5D%5D` +
    `&amp;success%5Bmark%5D=${successMark}` +
    `&amp;success%5Bview%5D=follow_section`;
  return (
    `<a title="${title}" class="${cssClass}"` +
    ` data-update-foreign-slot=".d0-card-body &gt; .card-slot.RIGHT-Xfollower.content-view"` +
    `${hover} href="${href}" data-remote="true">` +
    `<span class="follow-verb">${verb}</span></a>`
  );
}

/** follow_section.rb:25-35 follow_advanced:
 *  link_to_card(card.follow_rule_card(Auth.current.name, new: {}),
 *  icon_tag("more_horiz"), board_link_opts(class: "btn btn-sm btn-primary",
 *  path: {view: :overlay_rule}, "data-cy": "follow-advanced")) with the
 *  layout path key deleted - the captured attr order (class, data-cy,
 *  data-slot-selector, data-slotter-mode, href, data-remote); the rule
 *  card is fetched new: {} - ABSENT for both pinned actors (wanted-card). */
function followAdvanced(cardName: string, actorName: string): string {
  const ruleUrl = DeckoName.parse(
    `${cardName}+*self+${actorName}+*follow`,
  ).urlKey;
  return (
    `<a class="btn btn-sm btn-primary slotter wanted-card" data-cy="follow-advanced"` +
    ` data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}" data-slotter-mode="override"` +
    ` href="/${ruleUrl}/overlay_rule?slot%5Bitems%5D%5Bview%5D=closed" data-remote="true">` +
    `<i class="notranslate material-icons">more_horiz</i></a>`
  );
}

/** follow_section.rb:37-43 followers_board_link:
 *  link_to_card(card.name.field(:followers), "#{cnt} follower#{'s' unless
 *  cnt == 1}", board_link_opts(class: "btn btn-sm ms-2 btn-secondary
 *  slotter", remote: true, "data-cy": "followers")) - the double slotter
 *  (board_link_opts adds one; the caller class carries one) and the
 *  known-card mark (the +*followers junction exists). */
function followersBoardLink(cardName: string, count: number): string {
  const markUrl = DeckoName.parse(`${cardName}+*followers`).urlKey;
  const label = `${count} follower${count === 1 ? "" : "s"}`;
  return (
    `<a class="btn btn-sm ms-2 btn-secondary slotter slotter known-card" data-cy="followers"` +
    ` data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}" data-slotter-mode="override"` +
    ` href="/${markUrl}/content?layout=overlay&amp;slot%5Bitems%5D%5Bview%5D=closed"` +
    ` data-remote="true">${label}</a>`
  );
}

/** follow_section.rb:17-23 follow_overview_button:
 *  link_to_card([Auth.current, :follow], "all followed cards",
 *  board_link_opts(class: "btn btn-sm btn-secondary", "data-cy":
 *  "follow-overview")) - the user's *follow card (absent -> wanted-card). */
function followOverviewButton(actorName: string, known: boolean): string {
  const markUrl = DeckoName.parse(`${actorName}+*follow`).urlKey;
  return (
    `<a class="btn btn-sm btn-secondary slotter ${known ? "known-card" : "wanted-card"}" data-cy="follow-overview"` +
    ` data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}" data-slotter-mode="override"` +
    ` href="/${markUrl}/content?layout=overlay&amp;slot%5Bitems%5D%5Bview%5D=closed"` +
    ` data-remote="true">all followed cards</a>`
  );
}

/** board/follow_section.rb:2-11 view :follow_section, wrap: :slot, cache:
 *  :never: `return unless show_follow?; wrap_with :div, class: "mb-3" do
 *  [follow_button_group, followers_board_link, follow_overview_button]
 *  end`. show_follow? (follow_link_views.rb:6-8) = Auth.signed_in? &&
 *  !card.new_card? && followable? (follow.rb:2-3, the true override). The
 *  follow/follower state rides the follow seam (the render-time bundle:
 *  session actor, followed?, followerCount). */
export const followSectionView: ViewFn = ({ fmt, voo }) => {
  const signedIn = fmt.engine.viewer?.signedIn === true;
  let body = "";
  if (signedIn && fmt.card.id !== undefined) {
    const bundle = fmt.engine.followRenderBundle?.();
    if (bundle !== undefined && bundle.session !== undefined) {
      const cardName = fmt.card.name.s;
      const group =
        `<div class="btn-group btn-group-sm follow-btn-group">` +
        [
          followButton(bundle, cardName),
          followAdvanced(cardName, bundle.session.actorName),
        ].join("\n") +
        `</div>`;
      body =
        `<div class="mb-3">` +
        output([
          group,
          followersBoardLink(cardName, bundle.followerCount),
          followOverviewButton(
            bundle.session.actorName,
            fmt.engine.fetchRenderCard(`${bundle.session.actorName}+*follow`) !==
              undefined,
          ),
        ]) +
        `</div>`;
    }
  }
  return modSlotWrap({ fmt, voo }, "follow_section", body);
};

/** board/tab_views.rb:2-5 view :engage_tab, wrap: { div: { class: "m-3
 *  mt-4 _engage-tab" } }, cache: :never: [render_follow_section,
 *  discussion_section].compact - discussion_section (:50-56) returns nil
 *  unless show_discussion? (the signed-in gate; the NEW discussion card's
 *  update verdict - see showDiscussionTab) and otherwise field_nests
 *  :discussion (view: :titled, title: "Discussion", show: :comment_box,
 *  hide: [:menu]) - the nest of the relative +discussion name (an UNKNOWN
 *  card; the *default rule types it RichText) through the standard nest
 *  machinery (the captured slot carries
 *  show:[comment_box, titled]/hide:[menu]/home_view/title). */
export const engageTabView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const follow = fmt.renderView("follow_section");
  const discussion = showDiscussionTab(ctx)
    ? fmt.nest({
        // Ruby: discussion_section (tab_views.rb:50-56) calls
        // field_nest(:discussion, view: :titled, title: "Discussion",
        // show: :comment_box, hide: [:menu]) - nesting.rb:27-31 builds the
        // ABSOLUTE field name (card.name.field) and the capitalized title;
        // nest fetch.rb#new_card then sets view_opts[:nest_name] to the
        // cardish name (the resolved "Oracle Basics+discussion" the
        // captured slot carries). Programmatic nest: no nest_syntax in the
        // slot JSON, and the opts stay FLAT (show/hide ride the voo's
        // first-touch viz: hide menu first, then show comment_box, then
        // the requested titled view appends to show - nest.rb:23-26).
        syntax: "",
        name: `${fmt.card.name.s}+discussion`,
        options: {
          view: "titled",
          title: "Discussion",
          show: "comment_box",
          hide: "menu",
          extra: {},
        },
        comment: undefined,
      })
    : undefined;
  return `<div class="m-3 mt-4 _engage-tab">${output([follow, discussion])}</div>`;
};

// --- the rules lane: edit_rules (the rules accordion registry) --------------

/** card-1.110.0 lib/card/setting.rb:44-49 Card::Setting.groups (the frozen
 *  group order the captured accordion carries) + the per-setting registry
 *  rows the board_rules_tab pills render for a *self set: [display name,
 *  data-cy key, categories, help text]. The settings register through
 *  setting_opts (setting.rb:55-65) across the mods; the captured category
 *  flags and help texts are transcribed from the oracle arm
 *  (fixtures/captured/board-views.json edit_rules - the deck's rule-card
 *  existence drives the recent flags; the common/field model is the
 *  rule-list machinery's, cited in the receipt). */
const RULE_BOARD_SETTINGS: ReadonlyArray<
  readonly [
    string,
    ReadonlyArray<readonly [string, string, string, string, string]>,
  ]
> = [
  [
    "templating",
    [
      ["structure", "structure", "structure", "all recent common", "control card's content / structure"],
      ["default", "default", "default", "all field recent common", "type/content template for new cards"],
      ["autoname", "autoname", "autoname", "all", ""],
    ],
  ],
  [
    "permission",
    [
      ["create", "create", "create", "all recent common", "who can create cards"],
      ["read", "read", "read", "all recent common", "who can view cards"],
      ["update", "update", "update", "all recent common", "who can update cards"],
      ["delete", "delete", "delete", "all common", "who can delete cards"],
      ["captcha", "captcha", "captcha", "all recent", ""],
    ],
  ],
  [
    "webpage",
    [
      ["head", "head", "head", "all", "head tag content"],
      ["layout", "layout", "layout", "all recent", ""],
      ["style", "style", "style", "all", ""],
      ["script", "script", "script", "all recent", ""],
    ],
  ],
  [
    "editing",
    [
      ["help", "help", "help", "all field recent", "help text people will see when editing"],
      ["input type", "input_type", "input_type", "all field recent", "edit interface"],
      ["guide", "guide", "guide", "all common", "appears in the full editor view to guide users"],
    ],
  ],
  [
    "event",
    [
      ["on create", "on_create", "on_create", "all", ""],
      ["on update", "on_update", "on_update", "all", ""],
      ["on delete", "on_delete", "on_delete", "all", ""],
    ],
  ],
  [
    "other",
    [
      ["thanks", "thanks", "thank", "all", "destination after card is created"],
      ["follow fields", "follow_fields", "follow_field", "all", ""],
      ["follow", "follow", "follow", "all recent", ""],
    ],
  ],
];

/** rule_lists.rb:69-74 setting_list_item -> the nested rule card's
 *  :rule_board_link pill (the rule card is fetched new: {} - ABSENT for
 *  every captured setting; the anchor bytes come from the rules-mod
 *  rule-view surface). The category classes + data-category ride the
 *  setting's flags; the help-text div renders even when empty. */
function ruleBoardPill(
  setNameUrlKey: string,
  settingName: string,
  ruleCodename: string,
  cyKey: string,
  categories: string,
  helpText: string,
): string {
  // the href carries the setting CODENAME (thanks), the data-cy the
  // display name's singularized key (thank-pill)
  const ruleUrl = DeckoName.parse(`${setNameUrlKey}+*${ruleCodename}`).urlKey;
  return (
    `<li class="nav-item">` +
    `<a rel="nofollow" class="edit-rule-link nav-link _rule-item ${categories
      .split(" ")
      .map((c) => `_category-${c}`)
      .join(" ")} slotter slotter"` +
    ` data-bs-toggle="pill" data-category="${categories}"` +
    ` data-cy="${cyKey}-pill"` +
    ` data-slot-selector="${BOARD_SLOT_SELECTOR_ESC}" data-slotter-mode="override"` +
    ` href="/${ruleUrl}/overlay_rule?slot%5Bitems%5D%5Bview%5D=closed" data-remote="true">` +
    `${settingName}<div class="help-text">${helpText}</div></a></li>`
  );
}

/** editing.rb:50-52 view :edit_rules, cache: :never, unknown: true:
 *  `nest current_set_card, view: :board_rules_tab` - the self-set card
 *  ("X+*self", fetched NEW: the captured slot carries no data-card-id and
 *  types it Set) rendering board_rules_tab (filtered_rule_lists.rb:13-19):
 *  class_up accordion-item _setting-list + filtered_rule_list
 *  :accordion_rule_list, :common, mark: "" = output[setting_filter,
 *  render(view)] (setting_filter.rb:2-12 the form + filter_buttons :15-26
 *  the four radios; rule_lists.rb:40-47 the accordion over
 *  Card::Setting.groups with card.group_settings per group and the count
 *  badge, rule_lists.rb:69-74 the pills). The captured slot identity is
 *  the SET card's (name/type/link-name + the Set set-keys), so the slot
 *  wrap is emitted here rather than through modSlotWrap. */
const editRulesView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const setName = `${fmt.card.name.s}+*self`;
  const setNameUrlKey = DeckoName.parse(setName).urlKey;
  const setSafeKey = `${fmt.card.name.safeKey}-Xself`;
  // filtered_rule_list = output[setting_filter, accordion_rule_list]
  const radios = [
    ["all", "All", false],
    ["common", "Common", true],
    ["field", "Field", false],
    ["recent", "Recent", false],
  ] as const;
  const filterForm =
    `<form role="filter" data-slot-selector=".card-slot._setting-list"` +
    ` class="nodblclick slotter" action="/?view=accordion_rule_list"` +
    ` accept-charset="UTF-8" data-remote="true" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<div class="my-4 mx-2 _setting-filter"><label>Settings</label>\n` +
    radios
      .map(
        ([id, label, checked]) =>
          `<input type="radio" class="btn-check _setting-category" name="options" id="${id}" autocomplete="off" ${checked ? "checked" : ""}>\n` +
          `<label class="btn btn-outline-primary" for="${id}">${label}</label>\n`,
      )
      .join("\n") +
    `</div></form>`;
  const groups = RULE_BOARD_SETTINGS.map(([group, settings]) => {
    const pills = settings
      .map(([name, codename, cy, cats, help]) =>
        ruleBoardPill(setNameUrlKey, name, codename, cy, cats, help),
      )
      .join("\n");
    const collapseId = `card-${setSafeKey}-${group}-collapse-id`;
    const accordionButtonClass = serializerFollowsLive()
      ? "accordion-button collapsed"
      : "collapsed accordion-button";
    return (
      `<div class='accordion-item _setting-group _setting-list'>\n` +
      `<h2 class='accordion-header nodblclick w-100'>\n` +
      `<button class='${accordionButtonClass}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n` +
      `${group} <span class="_count badge bg-secondary ms-3">${settings.length}</span>\n` +
      `</button>\n</h2>\n` +
      `<div class='accordion-collapse collapse' id='${collapseId}'>\n` +
      `<div class='${serializerFollowsLive() ? "d0-card-body accordion-body" : "accordion-body d0-card-body"}'>\n` +
      `<ul class="${BOARD_PILL_UL_CLASSES}">${pills}</ul>\n` +
      `</div>\n</div>\n</div>\n`
    );
  }).join("\n");
  const inner =
    filterForm +
    "\n" +
    `<div class="_setting-list"><div class="accordion bar-accordion">` +
    groups +
    `</div></div>`;
  // the board_rules_tab wrap: { slot: { class: "d-flex flex-column gap-3
  // mx-3 mt-2" } } - the slot wrap over the SET card's identity
  // the KNOWN branch: when the self-set card EXISTS (Home+*self is a real
  // row in the oracle deck), the captured class carries the set card's own
  // set-keys extra (SELF-home-Xself) and the data-card-id; Basics' set
  // card is fetched NEW (no id, the base keys only)
  const setRecord = fmt.engine.fetchRenderCard(setName);
  // The base keys: the set card "X+*self" is a TYPE_PLUS_RIGHT-set member
  // whose left-type token derives from the FORM CARD's own type (the
  // graded Topic 001 row pins topic-Xself — Topic-typed left; the captured
  // Basics fixture pins rich_text-Xself — RichText-typed left). The Set
  // type identity ("5"/"Set") stays the deck's Set type card row.
  const leftTypeCode =
    fmt.card.typeCode ??
    fmt.card.typeName?.toLowerCase().replace(/\s+/g, "_") ??
    "rich_text";
  const setKeys =
    `ALL ALL_PLUS TYPE-set RSTAR RIGHT-Xself TYPE_PLUS_RIGHT-${leftTypeCode}-Xself` +
    (setRecord !== undefined
      ? ` SELF-${setRecord.name.safeKey}`
      : "");
  const classes =
    `card-slot board_rules_tab-view ${setKeys} d-flex flex-column gap-3 mx-3 mt-2`;
  const slotData = h(slotOptionsJson({
    view: "board_rules_tab",
    nest_name: setName,
    show: ["board_rules_tab"],
    home_view: "board_rules_tab",
  } as never));
  return (
    `<div id="${setSafeKey}-board_rules_tab-view" class="${classes}"` +
    (setRecord !== undefined && setRecord.id !== undefined
      ? ` data-card-id="${setRecord.id}"`
      : "") +
    // data-card-name carries the card's NAME (the graded row:
    // "Topic 001+*self"); the link-name stays the url key.
    ` data-card-name="${h(setName)}"` +
    // the capture deck's Set type card (id 5) - deck data, byte-pinned
    ` data-card-type-id="5" data-card-type-name="Set"` +
    ` data-card-link-name="${h(DeckoName.parse(setName).urlKey)}"` +
    ` data-slot-id="${newSlotId()}"` +
    ` data-slot="${slotData}">${inner}</div>`
  );
};

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *input type rule warm (the Rule::Cache
// analog; the card-mod-help/card-mod-layout prepare shape). The shared
// statement lives once in rule-card-warm.ts (ruleSidesStatement) - this
// boot keeps its own extended loop because it warms more than the rule
// sides (see below).
// ---------------------------------------------------------------------------

/** One batch, once per engine: every *input type rule card enters the
 *  prepared render-card map (multi-pass junction composition - sides
 *  first, then their junctions). After this inputTypeRuleContent
 *  (editor.rb:9-11's card.rule read, rule/all.rb:5-7 rule_card&.db_content)
 *  resolves its rule cards synchronously - zero queries on the render path.
 *
 *  The warm ALSO fetches every card NAMED by a rule's transformed content -
 *  with_card's `Card[mark]` reach (editor.rb:25-30, the mark is the
 *  gsub/tr-transformed rule content) - so input_defined_by_card (:18-22)
 *  resolves its mark synchronously too. The render-path fetch ladder is
 *  cache-only, which is why this engine moves both reads to prepare; the
 *  mark set is bounded by the deck's *input type rule count. */
async function prepareInputTypeRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  const results = await host.batch([
    ruleSidesStatement(setTypeId, settingTypeId, ["input_type"]),
  ]);
  type FetchedRow = {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
  };
  const rows = (results[0] as { rows: FetchedRow[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return;

  interface PreparedRecord {
    row: FetchedRow;
    record: NonNullable<Awaited<ReturnType<ModEngineHost["fetchById"]>>>;
  }
  const byId = new Map<number, PreparedRecord>();
  for (const row of rows) {
    const record = await host.fetchById(row.id);
    if (record === undefined) continue;
    byId.set(row.id, {
      row: {
        id: row.id,
        leftId: record.leftId ?? null,
        rightId: record.rightId ?? null,
        name: record.name?.s ?? null,
      },
      record,
    });
  }

  // multi-pass junction composition (sides before junctions)
  const names = new Map<number, string>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: PreparedRecord[] = [];
    for (const item of pending) {
      const row = item.row;
      let composed: string | undefined = row.name ?? undefined;
      if (composed === undefined && row.leftId !== null && row.rightId !== null) {
        const left = names.get(row.leftId);
        const right = names.get(row.rightId);
        if (left !== undefined && right !== undefined) composed = `${left}+${right}`;
      }
      if (composed === undefined) {
        still.push(item);
        continue;
      }
      names.set(row.id, composed);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

  // Assign the composed name onto junction records and cache them (the
  // fetch ladder's assign_name semantics - a record reached by id carries
  // no name mark, so the composed name is assigned here).
  const markKeys = new Set<string>();
  for (const item of byId.values()) {
    const composed = names.get(item.row.id);
    if (composed === undefined) continue;
    if (item.row.name === null) {
      item.record.name = DeckoName.parse(composed);
      item.record.key = DeckoName.parse(composed).key;
    }
    // the with_card mark: the rule content transformed per editor.rb:10
    const mark = inputTypeFromRule(item.record.dbContent);
    if (mark !== undefined && mark !== "") markKeys.add(mark);
    await host.cacheFetchedRecord(item.record);
  }

  if (markKeys.size === 0) return;
  const placeholders = [...markKeys].map(() => "?").join(",");
  const markResults = await host.batch([
    {
      sql: `SELECT id FROM cards WHERE key IN (${placeholders}) AND trash = 0`,
      params: [...markKeys],
    },
  ]);
  const markRows = (markResults[0] as { rows: { id: number }[] } | undefined)?.rows ?? [];
  for (const markRow of markRows) {
    const record = await host.fetchById(markRow.id);
    if (record !== undefined) await host.cacheFetchedRecord(record);
  }
}

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

const setModules: ModSetModuleFile[] = [
  // pattern: all (loader.rb#parts_from_path: "all/foo" -> "All::Foo")
  {
    // set/all/board.rb + the all/board/* subdir (5 files + 1 haml):
    // BOARD_TABS hash, BOARD_TAB_NAMES, format :html wrapper :board, the
    // breadcrumb/board_menu/
    // switch_to_edit_link/board_link_opts/board_slot_selector helpers,
    // default_board_tab (which calls show_guide_tab? - delegates to
    // tab_visibility.rb's show_*_tab?). All depend on wrap_with_modal
    // + haml :board + tabs helper. NOT ported: rails-runtime.
    setPath: "all/board",
    // :board and :cardboard live in set/all/editing.rb (registered there).
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
    // Ported (edit-views lane, oracle-verified): :guide_tab (board/
    // tab_views.rb:47-49 - the render dispatch to the :guide view,
    // card-mod-help's ported view). NOT ported: :engage_tab,
    // :follow_section, :history_tab, :related_tab, :rules_tab -
    // rails-runtime (acts_board_layout, board_pill_sections, field_nest,
    // set_select, render_follow_section).
    setPath: "all/board/tab_views",
    formats: {
      html: {
        views: [
          { view: "guide_tab", viewFn: guideTabView, config: { unknown: true } },
          // tab_views.rb:22-31 view :rules_tab, unknown: true (PORTED,
          // board lane - the set_select card_select form; the set-list walk
          // cites card-mod-rules related_sets.rb + the pattern labels)
          { view: "rules_tab", viewFn: rulesTabView, config: { unknown: true } },
          // tab_views.rb:14-19 view :related_tab (PORTED, board lane - the
          // board_pill_sections pills; RELATED_ITEMS + the three item
          // builders cited on the view fn)
          { view: "related_tab", viewFn: relatedTabView },
          // tab_views.rb:8-12 view :history_tab, wrap: :slot (PORTED,
          // board lane - creator_credit + the act pill list through the
          // history seam; acts_board_layout cited on the view fn)
          {
            view: "history_tab",
            viewFn: historyTabView,
            config: { wrap: "slot" },
          },
          // tab_views.rb:42-44 view :follow_section, wrap: :slot, cache:
          // :never (PORTED, follow lane - the FollowLink button group +
          // the followers/overview pills through the follow seam)
          {
            view: "follow_section",
            viewFn: followSectionView,
            config: { cache: "never", wrap: "slot" },
          },
          // tab_views.rb:2-5 view :engage_tab (wrap div m-3 mt-4
          // _engage-tab emitted in the fn), cache: :never (PORTED, follow
          // lane - the follow section + the +discussion field nest)
          {
            view: "engage_tab",
            viewFn: engageTabView,
            config: { cache: "never" },
          },
        ],
      },
    },
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
    // set/all/edit_inline.rb + edit_inline/edit_row.haml: :edit_name_row
    // PORTED (write-path slice 4, byte-verified: the Name row - plain name
    // content, :name_form edit link); :edit_inline, :edit_inline_buttons,
    // :edit_row PORTED (edit-views lane, byte-verified against
    // fixtures/captured/edit-views.json: the inline edit form - Symbol
    // :update card_form with autosave + the hidden-branch content
    // fieldset + the Save/cancel-in-place/delete button group - the
    // Title/core row and its :edit_inline edit link, and the button
    // formgroup). cancel_in_place_button/edit_inline_link are inlined in
    // the view fns.
    setPath: "all/edit_inline",
    formats: {
      html: {
        views: [
          { view: "edit_name_row", viewFn: editNameRowView },
          {
            view: "edit_inline",
            viewFn: editInlineView,
            config: { perms: "update", unknown: true, cache: "never", wrap: "slot" },
          },
          { view: "edit_inline_buttons", viewFn: editInlineButtonsView },
          { view: "edit_row", viewFn: editRowView },
        ],
      },
    },
  },
  {
    // set/all/edit_name.rb + edit_name_skip_referers.haml: :edit_name and
    // :name_form PORTED (write-path slice 4, byte-verified against
    // fixtures/captured/edit-name-type.json: the framed rename editor and
    // the bare rename form - frame machinery + card_form Hash-action shape
    // + skip-referers haml + rename/cancel buttons). name_form/edit_name_
    // success/edit_name_buttons/rename_button are inlined in the view fns.
    setPath: "all/edit_name",
    formats: {
      html: {
        views: [
          {
            view: "edit_name",
            viewFn: editNameView,
            config: { perms: "update" },
          },
          {
            view: "name_form",
            viewFn: nameFormView,
            config: { perms: "update", wrap: "slot", cache: "never" },
          },
        ],
      },
    },
  },
  {
    // set/all/edit_type.rb: :edit_type_row (slice 3, the edit-form type
    // row), :edit_type, :edit_type_form, :type_formgroup and
    // :board_type_formgroup PORTED (slice 4, byte-verified: the framed
    // type editor, the bare type form with the autosave class, the
    // createable-types select and its _live-type-field slot variant).
    // type_field/raw_type_options/wrap_type_formgroup/type_field_options/
    // simple_/multi_type_field_options/current_type_value/grouped_types/
    // standard_grouped_types/visible_cardtype_groups are inlined in the
    // view fns.
    setPath: "all/edit_type",
    formats: {
      html: {
        views: [
          { view: "edit_type_row", viewFn: editTypeRowView },
          {
            view: "edit_type",
            viewFn: editTypeView,
            config: { perms: "update", cache: "never" },
          },
          {
            view: "edit_type_form",
            viewFn: editTypeFormView,
            config: { perms: "update", wrap: "slot", cache: "never" },
          },
          { view: "type_formgroup", viewFn: typeFormgroupView },
          {
            view: "board_type_formgroup",
            viewFn: boardTypeFormgroupView,
            config: { unknown: true, wrap: "slot" },
          },
        ],
      },
    },
  },
  {
    // set/all/editing.rb: :board, :cardboard, board_parts, edit_success
    // (inlined - nil override stub), edit_view_hidden (inlined - nil),
    // :edit_buttons (PORTED - the button formgroup), :just_deleted
    // (PORTED), :edit_rules, :edit_structure, :edit_nests.
    // Ported: :edit_nests (the frame +
    // the structure_link empty-configs branch; the nested-editor branch is
    // the rails-runtime remainder, disclosed) and :edit_structure (the
    // no-structure branch - Ruby itself raises there, the capture records
    // the NoMethodError; the structure branch is the remainder).
    // NOT ported: :board, :cardboard (wrapper :board modal-full + haml
    // board grid + the tabs helper + board_tabs loads every tab - 5 of the
    // 6 tab views are rails-runtime), :edit_rules (nest current_set_card
    // view: :board_rules_tab - the board rules tab is unported).
    setPath: "all/editing",
    formats: {
      html: {
        views: [
          // editing.rb:3-11 view :board, perms: :update, unknown: true,
          // cache: :never, wrap: :board (PORTED, board lane - the wrapper
          // bytes + the board grid + the tab sidebar are emitted in the
          // view fn; the wrap config is a declarative record)
          {
            view: "board",
            viewFn: boardView,
            config: { perms: "update", unknown: true, cache: "never" },
          },
          // editing.rb:13 view :cardboard, :board - the alias (board's BODY
          // without the wrapper or the perms directive; the captured
          // anonymous arm renders)
          {
            view: "cardboard",
            viewFn: cardboardView,
            config: { unknown: true, cache: "never" },
          },
          { view: "edit_buttons", viewFn: editButtonsView },
          { view: "just_deleted", viewFn: justDeletedView, config: { unknown: true } },
          { view: "edit_nests", viewFn: editNestsView, config: { cache: "never" } },
          { view: "edit_structure", viewFn: editStructureView, config: { cache: "never" } },
          // editing.rb:50-52 view :edit_rules, cache: :never, unknown: true
          // (PORTED, rules lane - the rules accordion registry over
          // Card::Setting.groups; the per-setting rows transcribed from the
          // captured oracle arm)
          {
            view: "edit_rules",
            viewFn: editRulesView,
            config: { cache: "never", unknown: true },
          },
        ],
      },
    },
  },
  {
    // set/all/editor.rb: input_type, input_type_from_rule, input_method,
    // input_defined_by_card, with_card, default_input_type,
    // rich_text_input, text_area_input, text_field_input, hidden_input,
    // placeholder_text.
    // Ported (write-path slice 3 + input-remainders lane): :input - the
    // captured surface's resolved branch (rich_text -> the tinymce editor
    // input), then the full try-chain: the ace/plain/hidden method arms,
    // input_type_from_rule (the *input type rule read) and
    // input_defined_by_card (with_card + nest), documented on the view fn.
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
    // :conflict_tracker ported (slice 3, the captured edit-form content
    // fieldset), :name_formgroup PORTED (slice 4, byte-verified: the Name
    // formgroup - label + the form-bound text_field with the leading-space
    // form-control class); :edit_in_form PORTED (edit-views lane,
    // byte-verified: the editor_in_multi_card formgroup branch - title +
    // help label, the bare content editor; the structure/inline-nests
    // branches are the rails-runtime remainder, disclosed); the form/
    // prefix machinery stays unported (see below).
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
          { view: "name_formgroup", viewFn: nameFormgroupView },
          {
            view: "edit_in_form",
            viewFn: editInFormView,
            config: { perms: "update", unknown: true, cache: "never" },
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
    // set/all/formgroup.rb + read_formgroup.haml: :read_formgroup and
    // :read_form PORTED (edit-views lane, byte-verified: the haml
    // formgroup template - title label + the slot-wrapped :content - and
    // the empty-configs branch of read_field_configs; the nested-field
    // arm is the rails-runtime remainder, disclosed). The formgroup/
    // formgroup_label/formgroup_title/formgroup_div_args/
    // formgroup_div_cardname_args/formgroup_help/formgroup_voo_help
    // helpers are inlined in the :edit_in_form view fn (the only engine-
    // reachable consumer); the wrap_with :div + form.label machinery
    // behind them stays rails-runtime.
    setPath: "all/formgroup",
    formats: {
      html: {
        views: [
          { view: "read_form", viewFn: readFormView },
          {
            view: "read_formgroup",
            viewFn: readFormgroupView,
            config: { unknown: true, wrap: "slot" },
          },
        ],
      },
    },
  },
  {
    // set/all/new.rb: :new_buttons PORTED (slice 4, byte-verified: the
    // type form's button formgroup - standard_create_button + the
    // /<mark>/unknown cancel); :new, :new_in_modal, :simple_new,
    // :new_fields, :new_in_modal_buttons, :new_type_formgroup PORTED
    // (edit-views lane, byte-verified against
    // fixtures/captured/edit-views.json: the framed create form with the
    // success[mark] hidden + the shown-help frame, the modal create form
    // with the pre-body slot JSON and the no-confirm board menu, the bare
    // create form, the w-100 new-fields wrap with the name/type hidden
    // arms and the visible? viz writes, the d-flex Submit/Cancel button
    // group, and the live type formgroup with the slotter class).
    // with_create_context/new_view_name/new_view_type/new_name_prompt?/
    // needs_name?/new_type_prompt?/new_type_preset?/new_type_prompt_
    // context?/new_type_permitted?/new_view_title/new_in_modal_title/
    // new_success/new_view_hidden/new_name_formgroup/create_form/
    // create_form_with_alert_guide/new_form_opts/new_modal_menu/
    // cancel_create_path/standard_create_button are inlined in the view
    // fns. NOT ported: the unnamed-card arms (the engine renders no
    // unnamed cards - the oracle's new_card fixture section records them),
    // the params surfaces (params[:name_prompt]/params[:type]), the
    // *thanks rule read (new_success's fallback "_self" is inlined).
    setPath: "all/new",
    formats: {
      html: {
        views: [
          {
            view: "new",
            viewFn: newView,
            config: { perms: "create", unknown: true, cache: "never" },
          },
          {
            view: "new_in_modal",
            viewFn: newInModalView,
            config: { perms: "create", unknown: true, cache: "never" },
          },
          {
            view: "new_fields",
            viewFn: newFieldsView,
            config: { perms: "create", unknown: true, cache: "never" },
          },
          {
            view: "new_type_formgroup",
            viewFn: newTypeFormgroupView,
          },
          { view: "new_buttons", viewFn: newButtonsView },
          { view: "new_in_modal_buttons", viewFn: newInModalButtonsView },
          {
            view: "simple_new",
            viewFn: simpleNewView,
            config: { perms: "create", unknown: true, wrap: "slot", cache: "never" },
          },
        ],
      },
    },
  },
  {
    // set/all/overlay_guide.rb + overlay_guide.haml: :overlay_guide PORTED
    // (edit-views lane, byte-verified: the haml overlay template - the
    // close link with the consumed-path href + the guide METHOD render -
    // inside the slot wrap with the _overlay d0-card-overlay card
    // nodblclick class extras; the guide helper set is inlined above,
    // citing card-mod-help set/all/guide.rb).
    setPath: "all/overlay_guide",
    formats: {
      html: {
        views: [
          {
            view: "overlay_guide",
            viewFn: overlayGuideView,
            config: { unknown: true, cache: "never" },
          },
        ],
      },
    },
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
  prepareEngine: prepareInputTypeRules,
};

export default cardModEdit;
