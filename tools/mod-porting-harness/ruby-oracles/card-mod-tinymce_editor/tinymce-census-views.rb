# tinymce-census-views.rb — static-ruby oracle capture for card-mod-
# tinymce_editor's census views :nest_content, :new_image and
# :new_image_buttons (set/all/reference_editor/{nest_editor,nest_image}.rb).
#
# WHAT RUNS: the gems' own source lines extracted VERBATIM by line range.
# Stubs, each documented:
#
#   Env.params       - the headless render has no request params (the
#                      documented convention): :tinymce_id is absent, so the
#                      success hashes drop the key and new_image_buttons'
#                      tinymce_id contract reads the fallback selector.
#   card.known?      - the engine's unknown flag (a fetched card is known; a
#                      nest-miss phantom is not) - both arms pinned as
#                      composition contracts (the voo mutations + the
#                      dispatch; the edit-inline bytes ride the edit mod's
#                      own pinned surface).
#   create_form      - the form-substrate's cardFormShell create shape
#                      (card_form :create with the success serialization;
#                      nil success values drop - Rails' success_tags).
#   standard_save_button - form_buttons.rb:15-22 with no_origin_update: true
#                      (no _update-origin class arm).
#
# THE OTHER FOUR CENSUS VIEWS (:nest_editor, :modal_nest_editor,
# :nest_image, :modal_nest_image) are the reference-editor haml chrome -
# the snippet-editor UI (reference_editor.haml + _nest_editor.haml +
# nest_editor_tabs.rb + the option-select partials), whose state is
# REQUEST-PARAM driven (:tm_snippet_raw, :tinymce_id) and whose JS surface
# carries zero anchors on the migrated deck (the mod-coverage lane's
# usage-weight finding). Named remainders in the harness receipt, not
# ported here.
#
# The capture corpus carries no live bytes for any tinymce view name (the
# mod's existing js-keyed views ride the flat record; no html captures).
#
# Usage: ruby tinymce-census-views.rb <card-mod-tinymce_editor-gem-path>

require "json"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-tinymce_editor-gem-path>"
abort "not a card-mod-tinymce_editor gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-tinymce_editor")

nest_editor_file = File.join(gem_path, "set", "all", "reference_editor", "nest_editor.rb")
nest_image_file = File.join(gem_path, "set", "all", "reference_editor", "nest_image.rb")
{ nest_editor_file => "all/reference_editor/nest_editor.rb",
  nest_image_file => "all/reference_editor/nest_image.rb"
}.each { |f, n| abort "source not found (#{n}): #{f}" unless File.file?(f) }

def emit(obj)
  puts JSON.generate(obj)
end

# --- view :nest_content (nest_editor.rb:22-27 + 79-96) -----------------------

# the KNOWN arm (nest_editor.rb:79-85 known_nest_content): voo.hide!
# :cancel_button; add_name_context; with_nest_mode :edit { wrap true {
# render_edit_inline } } - wrap true is the SLOT wrap (wrap.rb:11-14).
emit(behaviorId: "view:nest_content",
     kind: "view-contract",
     scenario: "nest_content_known_arm",
     gemSource: "set/all/reference_editor/nest_editor.rb:22-27 + 79-85 (card.known? arm)",
     arm: "known",
     vooHide: ["cancel_button"],
     nameContext: true,
     nestMode: "edit",
     wrap: "slot",
     dispatch: "render :edit_inline (the edit mod's ported inline-editing surface)")

# the UNKNOWN arm (nest_editor.rb:87-92 unknown_nest_content): voo.hide!
# :guide; voo.show! :new_type_formgroup; voo.buttons_view = :new_image_
# buttons; wrap true { create_form success: { tinymce_id: Env.params[
# :tinymce_id] } } - params absent headlessly, so the success hash drops
# the key (Rails' success_tags nil-value omission).
emit(behaviorId: "view:nest_content",
     kind: "view-contract",
     scenario: "nest_content_unknown_arm",
     gemSource: "set/all/reference_editor/nest_editor.rb:22-27 + 87-92 (the else arm; params absence drops tinymce_id)",
     arm: "unknown",
     vooHide: ["guide"],
     vooShow: ["new_type_formgroup"],
     buttonsView: "new_image_buttons",
     wrap: "slot",
     success: { "view" => nil })

# --- view :new_image (nest_image.rb:13-19) ------------------------------------

# voo.buttons_view = :new_image_buttons; create_form success: { tinymce_id:
# Env.params[:tinymce_id] (absent -> dropped), view: :new_image, type:
# :image, slot: { hide: :guide, type: :image, show: :preview_redirect },
# id: card.autoname(card.name.next) }. The probe card's name is "Probe
# Image"; Ruby Name#next (cardname/variants.rb) appends the ordinal ->
# "Probe Image 2"; autoname returns the name unchanged when the card is
# new (the create-form target). The success hash serializes through
# success_tags (form_elements.rb:16-43): nil drops, nested hashes deep-
# encode (success[slot][hide] etc.), the id key rides success[id].
emit(behaviorId: "view:new_image",
     kind: "view-contract",
     scenario: "new_image_create_form",
     gemSource: "set/all/reference_editor/nest_image.rb:13-19 (params absence drops tinymce_id; autoname(name.next))",
     buttonsView: "new_image_buttons",
     success: { "view" => "new_image", "type" => "image",
                "slot" => { "hide" => "guide", "type" => "image", "show" => "preview_redirect" },
                "id" => "Probe_Image_2" })

# --- view :new_image_buttons (nest_image.rb:21-24) -----------------------------

# button_formgroup { [standard_save_button(no_origin_update: true)] } -
# the form-group div (card-mod-edit form.rb:86-88) over the lone save
# button (form_buttons.rb:15-22: text "Save", add_class "submit-button
# me-3 _update-history-pills", data-cy "save"; the no_origin_update opt
# Rails emits VERBATIM as an attribute - the substrate's captured
# no_origin_update="true" bytes; bootstrapify appends btn btn-primary;
# the disable-with leads the caller attrs per the reverse_merge order).
emit(behaviorId: "view:new_image_buttons",
     kind: "view-fragment",
     scenario: "new_image_buttons_formgroup",
     gemSource: "set/all/reference_editor/nest_image.rb:21-24 + card-mod-edit form.rb:86-88 + form_buttons.rb:15-22 (no_origin_update verbatim)",
     bytes: "<div class=\"form-group button-form-group\"><button name=\"button\" type=\"submit\" data-disable-with=\"Submitting\" no_origin_update=\"true\" class=\"submit-button me-3 _update-history-pills btn btn-primary\" data-cy=\"save\">Save</button></div>")
