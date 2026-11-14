# oracle-capture-save-without-close.rb - the pinned Ruby's own bytes for
# the SAVE-WITHOUT-CLOSE (registry row cap-E16, "Save (without close)
# updates the main slot": the save updates the slot and leaves the board
# open).
#
# The row's contract: the board's Save button (the one that does NOT close)
# writes the card's new content, the card's main slot shows the new content,
# and the board stays open. Five pinned files own it:
#
#   1. card-mod-edit-0.20.0/set/all/form_buttons.rb - the BUTTONS:
#      standard_submit_button (:2-4) is `output [standard_save_button,
#      standard_save_and_close_button]`; standard_save_button (:15-22) is
#      `return if voo&.hide?(:save_button)`, `add_class opts, "submit-button
#      me-3 _update-history-pills"`, `opts[:text] ||= "Save"`, `opts["data-cy"]
#      = "save"`, `submit_button opts` - and it carries NO _close-on-success
#      and NO _update-origin; standard_save_and_close_button (:26-34) is the
#      one that carries "submit-button me-3 _close-on-success" and then
#      "_update-origin", with "data-cy" "submit-#{close}". The class
#      difference IS the without-close contract.
#   2. card-mod-edit-0.20.0/set/all/editing.rb - the BOARD: the :board view
#      (:3-11) opens the edit nest mode, board_parts (:15-29) renders the
#      name row and the edit form, and :edit_buttons (:39-43) is
#      `button_formgroup do [standard_submit_button, edit_cancel_button,
#      delete_button] end`.
#   3. card-mod-format-0.20.0/assets/script/decko/slotter.js.coffee - the
#      CLIENT: the `._close-on-success` click handler (:100-101) is the ONLY
#      button handler that closes, the `._update-origin` handler (:103-104)
#      sets the slotter mode, slotterSuccess (:134-162) closes only on the
#      _close-overlay / _close-modal slotter classes, and showSuccessResponse
#      (:164-177) switches on the mode (`when "update-origin" then
#      @updateOrigin()`, `else @slotUpdate responseData, mode`).
#   4. card-1.110.0/mod/core/set/all/content.rb - the STORE event
#      (set_content, :store, on: :save) that stores the new content.
#   5. decko-0.20.0/lib/card_controller/rest.rb - the WRITE ROUTE: the
#      update action saves the request's own card hash through card.update!.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-save-without-close.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "save-without-close.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "form_buttons", gem: "card-mod-edit-0.20.0",
    path: "set/all/form_buttons.rb",
    marker: "def standard_save_button opts={}", before: 14, after: 20 },
  { key: "editing_board", gem: "card-mod-edit-0.20.0",
    path: "set/all/editing.rb",
    marker: "view :board, perms: :update", before: 2, after: 40 },
  { key: "slotter_close_handler", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "$('body').on 'click', '._close-on-success', ->", before: 1, after: 6 },
  { key: "slotter_success", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "slotterSuccess: (event, responseData) ->", before: 1, after: 42 },
  { key: "set_content_event", gem: "card-1.110.0",
    path: "mod/core/set/all/content.rb",
    marker: "event :set_content, :store, on: :save do", before: 0, after: 3 },
  { key: "update_route", gem: "decko-0.20.0",
    path: "lib/card_controller/rest.rb",
    marker: "def update", before: 1, after: 3 }
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

buttons = oracle["form_buttons"]["source"]
board = oracle["editing_board"]["source"]
close_handler = oracle["slotter_close_handler"]["source"]
success = oracle["slotter_success"]["source"]
store = oracle["set_content_event"]["source"]
route = oracle["update_route"]["source"]

facts = {
  # the BUTTONS
  "standard_submit_button" => buttons[/def standard_submit_button\n\s*output \[standard_save_button, standard_save_and_close_button\]/, 0],
  "standard_save_button_guard" => buttons[/return if voo&\.hide\?\(:save_button\)/, 0],
  "standard_save_button_class" => buttons[/add_class opts, "submit-button me-3 _update-history-pills"/, 0],
  "standard_save_button_text" => buttons[/opts\[:text\] \|\|= "Save"/, 0],
  "standard_save_button_data_cy" => buttons[/opts\["data-cy"\] = "save"/, 0],
  "standard_save_button_submit" => buttons[/submit_button opts/, 0],
  "standard_save_and_close_class" => buttons[/add_class opts, "submit-button me-3 _close-on-success"/, 0],
  "standard_save_and_close_origin" => buttons[/add_class opts, "_update-origin" unless opts\[:no_origin_update\]/, 0],
  "standard_save_and_close_data_cy" => buttons[/opts\.reverse_merge! text: text, "data-cy": "submit-\#\{close\}"/, 0],
  # the BOARD
  "board_view" => board[/view :board, perms: :update, unknown: true, cache: :never, wrap: :board do/, 0],
  "board_view_nest_mode" => board[/with_nest_mode :edit do/, 0],
  "board_parts_edit_form" => board[/_render_edit_form/, 0],
  "edit_buttons_view" => board[/view :edit_buttons do\n\s*button_formgroup do/, 0],
  "edit_buttons_body" => board[/\[standard_submit_button, edit_cancel_button, delete_button\]/, 0],
  # the CLIENT
  "slotter_close_on_success_handler" => close_handler[/\$\('body'\)\.on 'click', '\._close-on-success', ->\n\s*\$\(this\)\.closeOnSuccess\(\)/, 0],
  "slotter_update_origin_handler" => close_handler[/\$\('body'\)\.on 'click', '\._update-origin', ->\n\s*\$\(this\)\.closest\('\.slotter'\)\.data\("slotter-mode", "update-origin"\)/, 0],
  "slotter_success_dispatch" => success[/@showSuccessResponse responseData, @data\("slotter-mode"\)/, 0],
  "slotter_success_close_overlay" => success[/if @hasClass "_close-overlay"\n\s*@removeOverlay\(\)/, 0],
  "slotter_success_close_modal" => success[/if @hasClass "_close-modal"\n\s*@closest\('\.modal'\)\.modal "hide"/, 0],
  "slotter_success_mode_switch" => success[/when "update-origin" then @updateOrigin\(\)/, 0],
  "slotter_success_slot_update" => success[/else @slotUpdate responseData, mode/, 0],
  # the STORE
  "set_content_event" => store[/event :set_content, :store, on: :save do/, 0],
  "set_content_body" => store[/self\.content = prepare_db_content/, 0],
  # the WRITE ROUTE
  "update_route" => route[/card\.new_card\? \? create : handle \{ card\.update! params\[:card\]&\.to_unsafe_h \}/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured Save button is not the without-close one" unless buttons.include?("submit-button me-3 _update-history-pills")
raise "the captured Save-and-Close button does not close" unless buttons.include?("_close-on-success")
raise "the captured client closes on the save-and-close class only" unless success.include?("_close-modal")
raise "the captured store does not store the content" unless store.include?("self.content = prepare_db_content")
raise "the captured route does not save the request's card hash" unless route.include?("card.update!")

payload = {
  "contract" => "The board's Save button (the one that does not close) writes the card's new content, the card's main slot shows the new content, and the board stays open.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
