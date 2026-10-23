# oracle-capture-editor-link-button.rb - the pinned Ruby's own bytes for the
# editor's LINK BUTTON (registry row cap-E6, "Link button ([[ ]]) inserts a
# link").
#
# The row's contract: the editor's link button opens the link editor, the
# editor builds a [[reference]] and inserts it, and the reference renders as a
# link. Five pinned files own it:
#
#   1. card-mod-tinymce_editor-0.20.0/assets/script/link_editor.js.coffee -
#      the CLIENT half, and the owner of the syntax itself: :23 opens the
#      editor with the delimiters "[[" and "]]" (nest.editParams), :36 and
#      :40 rebuild the preview as "[[" + target (+ "|" + title), :44 makes
#      the target a FIELD with the "+" prefix when the field toggle is on,
#      :50 and :55 add and remove that prefix, and :60 is the preview's own
#      shape "[[#{target}|#{title}]]".
#   2. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/
#      _link_editor.haml - the dialog's own fields: the link_name text field
#      (class "form-control _link-target _autocomplete"), the field toggle
#      (check_box_tag :field, "field", id "link-editor-field"), and the
#      link_title text field (class "form-control _link-title").
#   3. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/
#      reference_editor.haml - the shared chrome: the preview input is
#      text_field_tag "preview", snippet.raw, class "_#{ref_type}-preview
#      w-100 text-muted", readonly: true - the "_link-preview" class - and
#      the apply button's class is "_#{ref_type}-apply".
#   4. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/link_editor/
#      link_parser.rb - LinkParser: the absent-params arm is
#      `Link.new("", {}, "[[ ]]")` - the editor's own blank raw - and
#      init_name strips the "+" from a field's name.
#   5. card-mod-content-0.20.0/lib/card/content/chunk/link.rb - the chunk
#      that MATCHES the inserted text and renders it as a link:
#      full_re: /\A\[\[([^\]]+)\]\]/, options: { title: link_text ||
#      @name.to_name.fully_stripped }, and render_name_link nests the
#      referee at view: :link.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-editor-link-button.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "editor-link-button.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "link_editor_script", gem: "card-mod-tinymce_editor-0.20.0",
    path: "assets/script/link_editor.js.coffee",
    marker: "openLinkEditor", before: 0, after: 1000 },
  { key: "link_editor_script_syntax", gem: "card-mod-tinymce_editor-0.20.0",
    path: "assets/script/link_editor.js.coffee",
    marker: "updatePreview: (new_val) ->", before: 1, after: 3 },
  { key: "link_editor_script_title_changed", gem: "card-mod-tinymce_editor-0.20.0",
    path: "assets/script/link_editor.js.coffee",
    marker: "titleChanged: () ->", before: 1, after: 3 },
  { key: "link_editor_partial", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/_link_editor.haml",
    marker: "text_field_tag \"link_name\"", before: 4, after: 14 },
  { key: "reference_editor_chrome", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/reference_editor.haml",
    marker: "text_field_tag \"preview\"", before: 2, after: 6 },
  { key: "link_parser", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/link_editor/link_parser.rb",
    marker: "def self.new link_string", before: 3, after: 8 },
  { key: "link_parser_init_name", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/link_editor/link_parser.rb",
    marker: "def init_name name", before: 1, after: 3 },
  { key: "link_chunk", gem: "card-mod-content-0.20.0",
    path: "lib/card/content/chunk/link.rb",
    marker: "full_re:", before: 0, after: 1000 }
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

script = oracle["link_editor_script"]["source"]
syntax = oracle["link_editor_script_syntax"]["source"]
partial = oracle["link_editor_partial"]["source"]
chrome = oracle["reference_editor_chrome"]["source"]
parser = oracle["link_parser"]["source"]
chunk = oracle["link_chunk"]["source"]

facts = {
  "open_editor_delimiters" => script[/nest\.editParams\(tm, "\[\[", "\]\]"\)/, 0],
  "apply_snippet" => script[/nest\.applySnippet\("link", tinymce_id, link_start, link_size\)/, 0],
  "preview_target_and_title" => oracle["link_editor_script_title_changed"]["source"][/"\[\[" \+ link\.target\(\) \+ "\|" \+ link\.title\(\)/, 0],
  "preview_default_shape" => syntax[/\[\[\#\{link\.target\(\)\}\|\#\{link\.title\(\)\}\]\]/, 0],
  "field_prefix" => script[/then "\+\#\{name\}" else name/, 0],
  "add_plus_arm" => script[/"\[\[\+"/, 0],
  "remove_plus_arm" => script[/"\[\["\)/, 0],
  "link_name_field" => partial[/text_field_tag "link_name"/, 0],
  "link_name_class" => partial[/class: "form-control _link-target _autocomplete"/, 0],
  "link_title_field" => partial[/text_field_tag "link_title"/, 0],
  "link_title_class" => partial[/class: "form-control _link-title"/, 0],
  "field_toggle" => partial[/check_box_tag :field, "field"/, 0],
  "field_toggle_id" => partial[/id: "link-editor-field"/, 0],
  "preview_input" => chrome[/text_field_tag "preview", snippet\.raw/, 0],
  "preview_class" => chrome[/class: "_#\{ref_type\}-preview w-100 text-muted", readonly: true/, 0],
  "apply_class" => chrome[/class: "_#\{ref_type\}-apply btn-sm me-3"/, 0],
  "parser_default_raw" => parser[/Link\.new\("", \{\}, "\[\[ \]\]"\)/, 0],
  "parser_field_arm" => oracle["link_parser_init_name"]["source"][/@name = @field \? name\.to_s\[1\.\.\] : name/, 0],
  "chunk_full_re" => chunk[/full_re: \/.*\/,/, 0],
  "chunk_options" => chunk[/\{ title: link_text \|\| @name\.to_name\.fully_stripped \}/, 0],
  "chunk_render_name_link" => chunk[/format\.nest referee_name, options\.merge\(view: view\)/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured script does not build the [[reference]] preview" unless script.include?("[[")
raise "the captured chunk does not match the [[...]] syntax" unless chunk.include?("[[")

payload = {
  "contract" => "The editor's link button inserts a [[reference]] that renders as a link.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
