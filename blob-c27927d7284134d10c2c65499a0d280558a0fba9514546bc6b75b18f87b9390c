# oracle-capture-editor-nest-image.rb - the pinned Ruby's own bytes for the
# NEST IMAGE editor (registry row cap-E8, "Nest image editor").
#
# The row's contract: the nest image editor inserts a nest with view and size
# options. Four pinned files own it:
#
#   1. card-mod-tinymce_editor-0.20.0/assets/script/image_editor.js.coffee -
#      the CLIENT half, and the owner of the inserted syntax: :49-56
#      updateImagePreview writes the preview as
#      "{{ #{name} | view: #{view}; size: #{size} }}" and :57-59 reloads the
#      preview slot from "#{name}?view=#{view}&size=#{size}". The view and
#      size selects are wired to that update at :18-22 (the select2:select
#      handlers on ._image-view-select and ._image-size-select).
#   2. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_editor/
#      _image_options.haml - the dialog's View and Size groups: image_view_select
#      snippet.view and image_size_select.
#   3. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_editor/
#      _image_find.haml - the image name select: select_tag
#      "image-name-select", "", class "_image-card-select _image-name
#      _no-select2-init".
#   4. card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_editor/
#      nest_editor_options.rb - the two selects' own bodies: image_view_select
#      is select_tag :view with class "tags _image-view-select" and
#      data-placeholder "Select view"; image_size_select is select_tag :size,
#      size_select_options(:medium), class "_image-size-select".
#   5. card-mod-content-0.20.0/lib/card/content/chunk/nest.rb - the chunk
#      that READS the inserted options: each_option splits the option string
#      on ";" and each pair on ":", and a value without a key is the view
#      (DEFAULT_OPTION = :view).
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-editor-nest-image.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "editor-nest-image.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "image_editor_script", gem: "card-mod-tinymce_editor-0.20.0",
    path: "assets/script/image_editor.js.coffee",
    marker: "updateImagePreview: (el) ->", before: 100, after: 1000 },
  { key: "image_options_partial", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/nest_editor/_image_options.haml",
    marker: "image_view_select", before: 3, after: 6 },
  { key: "image_find_partial", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/nest_editor/_image_find.haml",
    marker: "select_tag \"image-name-select\"", before: 4, after: 4 },
  { key: "image_selects", gem: "card-mod-tinymce_editor-0.20.0",
    path: "set/all/reference_editor/nest_editor/nest_editor_options.rb",
    marker: "def image_view_select selected", before: 1, after: 9 },
  { key: "nest_chunk", gem: "card-mod-content-0.20.0",
    path: "lib/card/content/chunk/nest.rb",
    marker: "DEFAULT_OPTION = :view", before: 100, after: 1000 }
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

script = oracle["image_editor_script"]["source"]
options_partial = oracle["image_options_partial"]["source"]
find_partial = oracle["image_find_partial"]["source"]
selects = oracle["image_selects"]["source"]
chunk = oracle["nest_chunk"]["source"]

facts = {
  "preview_syntax" => script[/syntaxPreview\.val\("\{\{ \#\{name\} \| view: \#\{view\}; size: \#\{size\} \}\}"\)/, 0],
  "preview_path" => script[/path = "\#\{name\}\?view=\#\{view\}&size=\#\{size\}"/, 0],
  "view_select_event" => script[/on 'select2:select', '\._image-view-select'/, 0],
  "size_select_event" => script[/on 'select2:select', '\._image-size-select'/, 0],
  "image_options_view" => options_partial[/= image_view_select snippet\.view/, 0],
  "image_options_size" => options_partial[/= image_size_select/, 0],
  "image_name_select" => find_partial[/select_tag "image-name-select", "",/, 0],
  "image_name_select_class" => find_partial[/class: "_image-card-select _image-name _no-select2-init"/, 0],
  "image_view_select_name" => selects[/select_tag :view, options_for_select\(view_list\.unshift\(nil\), selected: selected\)/, 0],
  "image_view_select_class" => selects[/class: "tags _image-view-select"/, 0],
  "image_view_select_placeholder" => selects[/"data-placeholder": "Select view"/, 0],
  "image_size_select_name" => selects[/select_tag :size, size_select_options\(:medium\)/, 0],
  "image_size_select_class" => selects[/class: "_image-size-select"/, 0],
  "nest_default_option" => chunk[/DEFAULT_OPTION = :view/, 0],
  "nest_option_list_split" => chunk[/attr_string\.strip\.split\(";"\)\.each do \|pair\|/, 0],
  "nest_option_pair_split" => chunk[/value, key = pair\.split\(":", 2\)\.reverse/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured script does not build the nest preview" unless script.include?("view:")
raise "the captured chunk does not split the option list" unless chunk.include?('split(";")')

payload = {
  "contract" => "The nest image editor inserts a nest with view and size options.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
