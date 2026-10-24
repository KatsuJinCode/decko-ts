# oracle-capture-file-upload.rb - the pinned Ruby's own bytes for THE FILE
# UPLOAD (registry row cap-F1, "Upload a file (/files route after upload)").
#
# The row's contract: a file can be uploaded through the File create form,
# and the uploaded card offers the /files route as a Download link. Five
# pinned files own it:
#
#   1. card-mod-carrierwave-0.20.0/set/type/file/core.haml - the DOWNLOAD
#      LINK: the whole template is `%a{ href: source }<` and `= t
#      :carrierwave_download, title: title_in_context(voo.title)` - ONE anchor
#      whose href is the attachment's source and whose text is the download
#      label.
#   2. card-mod-carrierwave-0.20.0/config/locales/en.yml - the LABEL:
#      `carrierwave_download: Download %{title}`.
#   3. card-mod-carrierwave-0.20.0/set/type/file.rb - the SOURCE: view :source
#      (lines 20-22) is `source`, view :core (24-28) is `handle_source do
#      |source| card_url source end` - the card_url of the attachment's
#      source IS the /files route the row names; def source (47-50) is
#      `file.valid? ? contextualize_path(file.url) : ""`; and def
#      short_content (30-32) is `number_to_human_size card.attachment.size`.
#   4. card-mod-carrierwave-0.20.0/set/type/file/file_chooser.haml - the
#      CHOOSER: the file input is `%input.file-upload.slotter.form-control{ id:
#      "card_#{card.type_code}", name: "card[#{card.type_code}]", type: "file"
#      }`, beside `= hidden_field_tag "attachment_type_id", card.type_id` and
#      `= hidden_field card.attachment_name, class: "attachment_card_name",
#      value: ""`.
#   5. card-mod-carrierwave-0.20.0/set/type/file/preview_editor.haml - the
#      CHIP: `.chosen-file` over `%p.name = card.original_filename` and
#      `%span.size = number_to_human_size card.attachment.size` - the
#      original filename beside Rails' number_to_human_size.
#
# And the /files route's own shape:
# card-mod-carrierwave-0.20.0/lib/carrier_wave/file_card_uploader/path.rb's
# local_url is `"%s/%s/%s" % [local_url_base(opts), file_dir,
# full_filename(url_filename)]`.
#
# And the CLIENT that swaps the chosen-file chip in after the upload round
# trip: card-mod-carrierwave-0.20.0/assets/script/upload.js.coffee's doneFile
# is `editor.find('.chosen-file').replaceWith data.result`. The capture
# MEASURES the port's own vendored copy of that file against the pinned gem's
# file, so the comparison is named rather than assumed.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-file-upload.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "file-upload.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "core_haml",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file/core.haml",
    marker: "%a{ href: source }<", before: 0, after: 1 },
  { key: "upload_client",
    gem: "card-mod-carrierwave-0.20.0",
    path: "assets/script/upload.js.coffee",
    marker: "doneFile: (e, data) ->", before: 0, after: 3 },
  { key: "download_label",
    gem: "card-mod-carrierwave-0.20.0",
    path: "config/locales/en.yml",
    marker: "carrierwave_download: Download %{title}", before: 0, after: 0 },
  { key: "file_type_views",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file.rb",
    marker: "view :core do", before: 4, after: 8 },
  { key: "file_source",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file.rb",
    marker: "def source", before: 0, after: 3 },
  { key: "file_short_content",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file.rb",
    marker: "def short_content", before: 0, after: 2 },
  { key: "file_chooser",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file/file_chooser.haml",
    marker: "%input.file-upload.slotter.form-control{", before: 0, after: 4 },
  { key: "preview_editor",
    gem: "card-mod-carrierwave-0.20.0",
    path: "set/type/file/preview_editor.haml",
    marker: "%p.name", before: 1, after: 3 },
  { key: "local_url",
    gem: "card-mod-carrierwave-0.20.0",
    path: "lib/carrier_wave/file_card_uploader/path.rb",
    marker: "def local_url opts={}", before: 0, after: 2 }
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

# The port's own copy of the upload client against the pinned gem's file.
PORT_UPLOAD_CLIENT_PATH = File.join(
  REPO_ROOT, "fixtures", "vendor", "mod-script-assets", "card-mod-carrierwave",
  "assets", "script", "upload.js.coffee"
)

def compare_port_upload_client(gem_path, port_path)
  raise "the port's upload client asset is not present: #{port_path}" unless File.file?(port_path)
  gem_lines = File.readlines(gem_path, chomp: true)
  port_lines = File.readlines(port_path, chomp: true)
  differences = []
  gem_lines.each_with_index do |line, index|
    other = port_lines[index]
    next if other == line
    differences << { "line" => index + 1, "gem" => line, "port" => other.to_s }
  end
  {
    "port_path" => "fixtures/vendor/mod-script-assets/card-mod-carrierwave/assets/script/upload.js.coffee",
    "gem_sha256" => Digest::SHA256.hexdigest(File.binread(gem_path)),
    "port_sha256" => Digest::SHA256.hexdigest(File.binread(port_path)),
    "differing_line_count" => differences.length,
    "differing_lines" => differences,
    "line_count_difference" => gem_lines.length == port_lines.length ? nil : {
      "gem_line_count" => gem_lines.length,
      "port_line_count" => port_lines.length
    },
    "files_are_byte_identical" => Digest::SHA256.hexdigest(File.binread(gem_path)) ==
      Digest::SHA256.hexdigest(File.binread(port_path))
  }
end

core = oracle["core_haml"]["source"]
label = oracle["download_label"]["source"]
views = oracle["file_type_views"]["source"]
source = oracle["file_source"]["source"]
short_content = oracle["file_short_content"]["source"]
chooser = oracle["file_chooser"]["source"]
chip = oracle["preview_editor"]["source"]
local_url = oracle["local_url"]["source"]
upload_client = oracle["upload_client"]["source"]

facts = {
  # the DOWNLOAD LINK
  "core_haml_anchor" => core[/%a\{ href: source \}</, 0],
  "core_haml_label" => core[/= t :carrierwave_download, title: title_in_context\(voo\.title\)/, 0],
  "download_label" => label[/carrierwave_download: Download %\{title\}/, 0],
  # the SOURCE
  "file_view_source" => views[/view :source do/, 0],
  "file_view_core" => views[/view :core do/, 0],
  "file_core_body" => views[/card_url source/, 0],
  "file_source_body" => source[/file\.valid\? \? contextualize_path\(file\.url\) : ""/, 0],
  "file_short_content" => short_content[/number_to_human_size card\.attachment\.size/, 0],
  "local_url" => local_url[/local_url_base\(opts\), file_dir, full_filename\(url_filename\)/, 0],
  # the CHOOSER
  "chooser_input" => chooser[/%input\.file-upload\.slotter\.form-control\{ id: "card_#\{card\.type_code\}",/, 0],
  "chooser_input_name" => chooser[/name: "card\[#\{card\.type_code\}\]",/, 0],
  "chooser_input_type" => chooser[/type: "file" \}/, 0],
  "chooser_attachment_type_id" => chooser[/= hidden_field_tag "attachment_type_id", card\.type_id/, 0],
  "chooser_attachment_card_name" => chooser[/= hidden_field card\.attachment_name, class: "attachment_card_name", value: ""/, 0],
  # the CHIP
  "chip_name" => chip[/= card\.original_filename/, 0],
  "chip_size" => chip[/= number_to_human_size card\.attachment\.size/, 0],
  # the UPLOAD CLIENT
  "upload_client_handler" => upload_client[/doneFile: \(e, data\) ->/, 0],
  "upload_client_swap" => upload_client[/editor\.find\('\.chosen-file'\)\.replaceWith data\.result/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured core view is not the one-anchor download link" unless core.include?("%a{ href: source }<")
raise "the captured core view does not carry the download label" unless core.include?("carrierwave_download")
raise "the captured file type does not render the card_url of the source" unless views.include?("card_url source")
raise "the captured chooser does not carry the file input" unless chooser.include?("file-upload")
raise "the captured chooser does not carry the attachment card name" unless chooser.include?("attachment_card_name")
raise "the captured chip does not carry the original filename" unless chip.include?("card.original_filename")
raise "the captured upload client does not swap the chip in" unless upload_client.include?("replaceWith data.result")

port_upload_client = compare_port_upload_client(
  File.join(GEM_HOME, "card-mod-carrierwave-0.20.0", "assets", "script", "upload.js.coffee"),
  PORT_UPLOAD_CLIENT_PATH
)

payload = {
  "contract" => "A file can be uploaded through the File create form, and the uploaded card offers the /files route as a Download link: one anchor whose href is the attachment's source and whose text is the download label, beside the chip that shows the original filename and the human size.",
  "facts" => facts,
  "oracle" => oracle,
  "port_upload_client_asset" => port_upload_client,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
