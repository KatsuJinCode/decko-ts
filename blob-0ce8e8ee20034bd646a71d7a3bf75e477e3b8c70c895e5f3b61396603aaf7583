# oracle-capture-save-name-change-origin.rb - the pinned Ruby's own bytes
# for the NAME CHANGE ORIGIN SLOT (registry row cap-E17, "Save after a name
# change updates the origin slot": the board and page show the new name).
#
# The row's contract: saving a name change updates the origin slot, and the
# board and the page show the new name. Four pinned files own it:
#
#   1. card-mod-edit-0.20.0/set/all/edit_name.rb - the NAME EDITOR: the
#      :edit_name view (:2-4) is `frame { name_form }`; the :name_form view
#      (:6-8) is `name_form :edit_name_row`; name_form (:12-22) is
#      `card_form({ action: :update, id: card.id }, { "data-main-success":
#      JSON(redirect: true, view: ""), "data-slotter-mode": "update-origin",
#      class: "_rename-form", success: edit_name_success(success_view) }) do
#      [_render_name_formgroup, edit_name_skip_referers, edit_name_buttons]
#      end` - the "update-origin" SLOTTER MODE is the origin-slot contract;
#      edit_name_success (:28-32) is `{ name: "_self", redirect: "" }` plus
#      the view when one is given; edit_name_buttons (:34-39) is
#      `button_formgroup { [rename_button, standard_cancel_button] }`; and
#      rename_button (:41-46) is `button_tag t(:core_rename), class:
#      "renamer", data: { disable_with: t(:core_renaming), confirm:
#      t(:core_rename_confirm) }`.
#   2. card-mod-edit-0.20.0/set/all/form.rb - the NAME FIELD: name_field
#      (:42-44) is `text_field :name, value: card.name, autocomplete:
#      "off"`.
#   3. card-mod-format-0.20.0/assets/script/decko/slotter.js.coffee - the
#      CLIENT: the `._update-origin` click handler (:103-104) sets the
#      slotter's mode to "update-origin", showSuccessResponse (:164-177)
#      dispatches `when "update-origin" then @updateOrigin()`, and
#      updateOrigin (:199-209) reloads the ORIGIN slot
#      (`origin.slotReload()`).
#   4. card-1.110.0/mod/core/set/all/name_events.rb - the NAME WRITE:
#      validate_renaming (:46-52) is the :update-stage guard on a changed
#      name, expire_old_name (:56-58) is the :store event that expires the
#      old name, and prepare_left_and_right (:67-70) is the :store event that
#      prepares the compound name's sides.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-save-name-change-origin.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "save-name-change-origin.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "edit_name", gem: "card-mod-edit-0.20.0",
    path: "set/all/edit_name.rb",
    marker: "def name_form success_view=nil", before: 11, after: 35 },
  { key: "name_field", gem: "card-mod-edit-0.20.0",
    path: "set/all/form.rb",
    marker: "def name_field", before: 1, after: 3 },
  { key: "slotter_update_origin_handler", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "$('body').on 'click', '._update-origin', ->", before: 1, after: 2 },
  { key: "slotter_success_response", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "showSuccessResponse: (responseData, mode) ->", before: 1, after: 12 },
  { key: "slotter_update_origin", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "updateOrigin: () ->", before: 2, after: 12 },
  { key: "name_events", gem: "card-1.110.0",
    path: "mod/core/set/all/name_events.rb",
    marker: "event :validate_renaming, :validate, on: :update", before: 1, after: 25 }
].freeze

def deep_sort(obj)
  case obj
  when Hash
    obj.keys.sort_by(&:to_s).each_with_object({}) { |k, h| h[k.to_s] = deep_sort(obj[k]) }
  when Array
    obj.map { |v| deep_sort(v) }
  else
    obj
  end
end

def capture_owner(owner)
  file = File.join(GEM_HOME, owner[:gem], owner[:path])
  raise "oracle gem file not present: #{file}" unless File.file?(file)
  lines = File.readlines(file, chomp: true)
  index = lines.index { |line| line.include?(owner[:marker]) }
  raise "oracle marker not present in #{owner[:gem]}/#{owner[:path]}: #{owner[:marker]}" if index.nil?
  first = [index - owner[:before], 0].max
  last = [index + owner[:after], lines.length - 1].min
  {
    "gem" => owner[:gem],
    "path" => owner[:path],
    "marker" => owner[:marker],
    "marker_line" => index + 1,
    "first_line" => first + 1,
    "last_line" => last + 1,
    "source" => lines[first..last].join("\n"),
    "file_sha256" => Digest::SHA256.hexdigest(File.binread(file))
  }
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

edit_name = oracle["edit_name"]["source"]
name_field = oracle["name_field"]["source"]
origin_handler = oracle["slotter_update_origin_handler"]["source"]
success_response = oracle["slotter_success_response"]["source"]
update_origin = oracle["slotter_update_origin"]["source"]
name_events = oracle["name_events"]["source"]

facts = {
  # the NAME EDITOR
  "edit_name_view" => edit_name[/view :edit_name, perms: :update do\n\s*frame \{ name_form \}/, 0],
  "name_form_view" => edit_name[/view :name_form, perms: :update, wrap: :slot, cache: :never do\n\s*name_form :edit_name_row/, 0],
  "name_form_data_main_success" => edit_name[/"data-main-success": JSON\(redirect: true, view: ""\),/, 0],
  "name_form_slotter_mode" => edit_name[/"data-slotter-mode": "update-origin",/, 0],
  "name_form_class" => edit_name[/class: "_rename-form",/, 0],
  "name_form_body" => edit_name[/\[_render_name_formgroup,\n\s*edit_name_skip_referers,\n\s*edit_name_buttons\]/, 0],
  "edit_name_success" => edit_name[/success = \{ name: "_self", redirect: "" \}/, 0],
  "edit_name_buttons" => edit_name[/\[rename_button, standard_cancel_button\]/, 0],
  "rename_button_class" => edit_name[/button_tag t\(:core_rename\),\n\s*class: "renamer", data: \{ disable_with: t\(:core_renaming\),/, 0],
  # the NAME FIELD
  "name_field" => name_field[/text_field :name, value: card\.name, autocomplete: "off"/, 0],
  # the CLIENT
  "slotter_update_origin_handler" => origin_handler[/\$\('body'\)\.on 'click', '\._update-origin', ->\n\s*\$\(this\)\.closest\('\.slotter'\)\.data\("slotter-mode", "update-origin"\)/, 0],
  "slotter_success_response_mode_switch" => success_response[/when "update-origin" then @updateOrigin\(\)/, 0],
  "slotter_update_origin_body" => update_origin[/origin = @slotOrigin\(type\)/, 0],
  "slotter_update_origin_reload" => update_origin[/origin\.slotReload\(\)/, 0],
  # the NAME WRITE
  "validate_renaming_event" => name_events[/event :validate_renaming, :validate, on: :update, changed: :name, skip: :allowed do/, 0],
  "expire_old_name_event" => name_events[/event :expire_old_name, :store, changed: :name, on: :update do\n\s*Director\.expirees << name_before_act/, 0],
  "prepare_left_and_right_event" => name_events[/event :prepare_left_and_right, :store, changed: :name, on: :save do\n\s*return if name\.simple\?/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured rename form does not carry the update-origin mode" unless edit_name.include?("\"data-slotter-mode\": \"update-origin\"")
raise "the captured rename form is not the _rename-form" unless edit_name.include?("class: \"_rename-form\"")
raise "the captured client does not reload the origin slot" unless update_origin.include?("origin.slotReload()")
raise "the captured name write does not expire the old name" unless name_events.include?("Director.expirees << name_before_act")

payload = {
  "contract" => "Saving a name change updates the origin slot, and the board and the page show the new name.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
