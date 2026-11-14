# oracle-capture-new-card-preset.rb - the pinned Ruby's own bytes for the
# create-form preset contract (registry row cap-C10, "Presetting card content
# from the URL (?card[content]=...)").
#
# The row's contract is a URL preset: a /new/<Type> request that carries
# card[name]= and card[content]= must reach the form the editor fills and the
# card that stores the content. Four pinned files own that contract:
#
#   1. card-1.110.0/lib/card/fetch/card_class.rb - the fetch options builder
#      that reads the request's card hash ("new: card_params").
#   2. card-mod-edit-0.20.0/set/all/new.rb - new_view_name (the name field
#      the preset rides) and new_name_prompt? (whether the prompt shows).
#   3. card-mod-edit-0.20.0/set/all/form.rb - content_field (the editor's own
#      field name, the one the preset fills).
#   4. decko-0.20.0/lib/card_controller/rest.rb - the create arm of the
#      write route (a new card is created, an existing one updated).
#
# The capture records the pinned files' own bytes for those owners, the line
# ranges, the files' SHA-256 digests, and the field names the contract is
# written in. It performs ZERO writes and reads NO deck: it photographs the
# pinned gemset's bytes.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-new-card-preset.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "new-card-preset.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

# gem-relative path, the marker the owner's bytes carry, and how many lines
# around it the capture keeps.
OWNERS = [
  { key: "card_class_fetch", gem: "card-1.110.0", path: "lib/card/fetch/card_class.rb",
    marker: "Env.hash(params[:card])", before: 6, after: 6 },
  { key: "new_view_name", gem: "card-mod-edit-0.20.0", path: "set/all/new.rb",
    marker: "def new_view_name", before: 2, after: 10 },
  { key: "content_field", gem: "card-mod-edit-0.20.0", path: "set/all/form.rb",
    marker: "def content_field", before: 2, after: 12 },
  { key: "editor_input", gem: "card-mod-edit-0.20.0", path: "set/all/editor.rb",
    marker: "def text_area_input", before: 2, after: 6 },
  { key: "create_arm", gem: "decko-0.20.0", path: "lib/card_controller/rest.rb",
    marker: "card.new_card? ? create", before: 2, after: 2 }
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

# The field names the contract is written in, read out of the pinned bytes.
name_source = oracle["new_view_name"]["source"]
content_source = oracle["content_field"]["source"]
fetch_source = oracle["card_class_fetch"]["source"]
editor_source = oracle["editor_input"]["source"]

# The editor's field name is a Rails derivation, not a literal: the form is
# the card's own form (card_form :create in new.rb) and the field is the
# :content symbol, so the rendered name is "card[content]". The capture keeps
# BOTH halves of that derivation, and the name it derives.
raise "the pinned editor input does not render the :content field" unless editor_source.match?(/text_area\s+:content/)

facts = {
  "content_field_name" => "card[content]",
  "content_field_name_derivation" => "form_for(card) + text_area :content (editor.rb) + card_form :create (new.rb)",
  "name_field_name" => name_source[/hidden_field_tag\s+"(card\[[^\"]+\])"/, 1] ||
                      name_source[/"(card\[[^\"]+\])"/, 1],
  "request_card_hash" => fetch_source[/params\[:card\]/, 0] && "params[:card]"
}

raise "the pinned content field name was not found in the captured bytes" if facts["content_field_name"].nil?
raise "the pinned name field name was not found in the captured bytes" if facts["name_field_name"].nil?
raise "the pinned request card hash was not found in the captured bytes" if facts["request_card_hash"].nil?

payload = {
  "contract" => "The /new URL's card[name] and card[content] reach the create form and the stored card.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
