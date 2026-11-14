# oracle-capture-edit-conflict.rb - the pinned Ruby's own bytes for the
# EDIT CONFLICT (registry row cap-E18, "Two edits at the same time: second
# save refused (conflict)").
#
# The row's contract: two editors hold the same revision, the first save
# lands, the stale second save is REFUSED (the content is not overwritten and
# no history is created), the conflict response refreshes the visible form's
# revision, and a retry through the same form then persists. Six pinned
# files own it:
#
#   1. card-mod-edit-0.20.0/set/all/form.rb - the REVISION FIELD: the
#      :conflict_tracker view (:27-31) is `return unless card&.real?`,
#      `card.last_action_id_before_edit = card.last_action_id`, `hidden_field
#      :last_action_id_before_edit, class: "current_revision_id"` - the
#      hidden field IS the revision the form holds.
#   2. card-mod-history-0.20.0/set/all/history/events.rb - the DETECTION:
#      the :detect_conflict event (:19-21) is `event :detect_conflict,
#      :validate, on: :update, when: :edit_conflict?` and `errors.add
#      :conflict, ::I18n.t(:history_error_not_latest_revision)`; and
#      edit_conflict? (:65-70) is `last_action_id_before_edit &&
#      last_action_id_before_edit.to_i != last_action_id && (la =
#      last_action) && la.act.actor_id != Auth.current_id` - the three
#      clauses: a before-edit id is present, it differs from the current
#      revision, and the last action belongs to somebody else.
#   3. card-1.110.0/lib/card.rb - the ATTRIBUTE: :last_action_id_before_edit
#      is an action-specific attribute (:142-152).
#   4. card-1.110.0/lib/card/error.rb - the 409: the EditConflict class
#      (:97-100) is `class EditConflict < UserError` with `self.status_code =
#      409` and `self.view = :conflict`, and the KEY_MAP (:128-129) is
#      `{ permission_denied: PermissionDenied, conflict: EditConflict }`.
#   5. card-mod-format-0.20.0/set/all/html/error.rb - the CONFLICT VIEW: the
#      :conflict view (:37-53) renders the "Conflict!" alert whose
#      `<span class="new-current-revision-id">` carries the current revision
#      and whose text says the other actor has also been making changes.
#   6. card-mod-format-0.20.0/assets/script/decko/slotter.js.coffee - the
#      CLIENT: showErrorResponse's 409 branch (:184-186) copies the
#      `.new-current-revision-id` text into the form's `.current_revision_id`
#      value, so the retried save is based on the current revision.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-edit-conflict.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-conflict.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "conflict_tracker", gem: "card-mod-edit-0.20.0",
    path: "set/all/form.rb",
    marker: "view :conflict_tracker", before: 2, after: 5 },
  { key: "detect_conflict_event", gem: "card-mod-history-0.20.0",
    path: "set/all/history/events.rb",
    marker: "event :detect_conflict, :validate, on: :update, when: :edit_conflict? do", before: 0, after: 3 },
  { key: "edit_conflict_predicate", gem: "card-mod-history-0.20.0",
    path: "set/all/history/events.rb",
    marker: "def edit_conflict?", before: 1, after: 7 },
  { key: "card_attribute", gem: "card-1.110.0",
    path: "lib/card.rb",
    marker: ":last_action_id_before_edit,  # [Integer]", before: 3, after: 3 },
  { key: "edit_conflict_error", gem: "card-1.110.0",
    path: "lib/card/error.rb",
    marker: "class EditConflict < UserError", before: 2, after: 4 },
  { key: "error_key_map", gem: "card-1.110.0",
    path: "lib/card/error.rb",
    marker: "KEY_MAP = { permission_denied: PermissionDenied,", before: 1, after: 3 },
  { key: "conflict_view", gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "view :conflict, cache: :never do", before: 0, after: 17 },
  { key: "slotter_conflict_branch", gem: "card-mod-format-0.20.0",
    path: "assets/script/decko/slotter.js.coffee",
    marker: "if status == 409 #edit conflict", before: 1, after: 4 }
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

tracker = oracle["conflict_tracker"]["source"]
detect = oracle["detect_conflict_event"]["source"]
predicate = oracle["edit_conflict_predicate"]["source"]
attribute = oracle["card_attribute"]["source"]
conflict_error = oracle["edit_conflict_error"]["source"]
key_map = oracle["error_key_map"]["source"]
conflict_view = oracle["conflict_view"]["source"]
client = oracle["slotter_conflict_branch"]["source"]

facts = {
  # the REVISION FIELD
  "conflict_tracker_guard" => tracker[/return unless card&\.real\?/, 0],
  "conflict_tracker_assignment" => tracker[/card\.last_action_id_before_edit = card\.last_action_id/, 0],
  "conflict_tracker_hidden" => tracker[/hidden_field :last_action_id_before_edit, class: "current_revision_id"/, 0],
  # the DETECTION
  "detect_conflict_event" => detect[/event :detect_conflict, :validate, on: :update, when: :edit_conflict\? do/, 0],
  "detect_conflict_error" => detect[/errors\.add :conflict, ::I18n\.t\(:history_error_not_latest_revision\)/, 0],
  "edit_conflict_clause_present" => predicate[/last_action_id_before_edit &&/, 0],
  "edit_conflict_clause_differs" => predicate[/last_action_id_before_edit\.to_i != last_action_id &&/, 0],
  "edit_conflict_clause_actor" => predicate[/la\.act\.actor_id != Auth\.current_id/, 0],
  # the ATTRIBUTE
  "card_attribute" => attribute[/:last_action_id_before_edit,  # \[Integer\]/, 0],
  # the 409
  "edit_conflict_error_class" => conflict_error[/class EditConflict < UserError/, 0],
  "edit_conflict_error_status" => conflict_error[/self\.status_code = 409/, 0],
  "edit_conflict_error_view" => conflict_error[/self\.view = :conflict/, 0],
  "error_key_map" => key_map[/KEY_MAP = \{ permission_denied: PermissionDenied,\n\s*conflict: EditConflict \}\.freeze/, 0],
  # the CONFLICT VIEW
  "conflict_view_name" => conflict_view[/view :conflict, cache: :never do/, 0],
  "conflict_view_alert" => conflict_view[/alert "warning" do/, 0],
  "conflict_view_revision_span" => conflict_view[/<span class="new-current-revision-id">#\{card\.last_action_id\}<\/span>/, 0],
  "conflict_view_actor_line" => conflict_view[/<div>#\{actor_link\} has also been making changes\.<\/div>/, 0],
  # the CLIENT
  "client_conflict_status" => client[/if status == 409 #edit conflict/, 0],
  "client_conflict_revision_copy" => client[/@slot\(\)\.find\('\.current_revision_id'\)\.val\(/, 0],
  "client_conflict_revision_source" => client[/@slot\(\)\.find\('\.new-current-revision-id'\)\.text\(\)/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured form does not carry the revision hidden field" unless tracker.include?("hidden_field :last_action_id_before_edit")
raise "the captured detection does not add the conflict error" unless detect.include?("errors.add :conflict")
raise "the captured error class is not the 409" unless conflict_error.include?("self.status_code = 409")
raise "the captured conflict view does not carry the revision span" unless conflict_view.include?("new-current-revision-id")
raise "the captured client does not refresh the revision" unless client.include?("new-current-revision-id")

payload = {
  "contract" => "Two editors hold the same revision, the first save lands, the stale second save is refused without overwriting the content or creating history, the conflict response refreshes the visible form's revision, and a retry through the same form then persists.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
