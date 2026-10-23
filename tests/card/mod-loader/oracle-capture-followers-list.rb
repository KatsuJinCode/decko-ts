# oracle-capture-followers-list.rb - the pinned Ruby's own bytes for THE
# FOLLOWERS LIST AND THE ALL FOLLOWED CARDS VIEW (registry row cap-W4,
# "Followers list and 'all followed cards' view").
#
# The row's contract: the board's followers link opens the followers list, and
# the "all followed cards" link opens the view of the cards the viewer
# follows. Four pinned files own it:
#
#   1. card-mod-follow-0.20.0/set/right/followers.rb - the FOLLOWERS LIST:
#      view :core, cache: :never (13-15) is the `super()` passthrough, and the
#      VIEW'S BODY IS NOT IN THE VIEW: `def content` (17-19) is `left ?
#      item_names.to_pointer_content : ""` and `def item_names _args={}` (21-23)
#      is `left ? left.follow_set_card.prototype.follower_names : []` - the
#      follower NAMES as the card's pointer content.
#   2. card-mod-follow-0.20.0/set/right/following.rb - the ALL FOLLOWED CARDS
#      VIEW: view :core (13-22) is a branch - `render_rule_editor` when
#      `card.left && Auth.signed_in?`, else `nest Card.fetch(card.name.left,
#      :followers), view: :titled, items: { view: :link }`.
#   3. card-mod-follow-0.20.0/set/all/follow/follower_ids.rb - the NAMES the
#      list shows: `def follower_names` is `followers.map(&:name)`.
#   4. card-mod-edit-0.20.0/set/all/board/follow_section.rb - the TWO LINKS
#      on the board: followers_board_link is `card.name.field(:followers)` with
#      the label `"#{cnt} follower#{'s' unless cnt == 1}"`, and
#      follow_overview_button is `[Auth.current, :follow]` with the literal
#      "all followed cards".
#
# And the pointer content's own shape:
# card-1.110.0/config/initializers/01_core_extensions/array.rb's
# to_pointer_content strips each item and joins them with "\n".
#
# THE CAPTURE ALSO MEASURES THE PORT'S GAP at this branch's tip, because this
# row is a measured skip and its measurement has to live somewhere that cannot
# drift: the port's follow mod is scanned for the follower_names call (in
# executable code, not in a comment) and for a registered :core view on the
# right/following set.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-followers-list.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "followers-list.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

PORT_FOLLOW_MOD = File.join(
  REPO_ROOT, "src", "card", "mod-loader", "mods", "card-mod-follow.ts"
)

OWNERS = [
  { key: "followers_core_view",
    gem: "card-mod-follow-0.20.0",
    path: "set/right/followers.rb",
    marker: "view :core, cache: :never do", before: 2, after: 2 },
  { key: "followers_content",
    gem: "card-mod-follow-0.20.0",
    path: "set/right/followers.rb",
    marker: "def content", before: 0, after: 2 },
  { key: "followers_item_names",
    gem: "card-mod-follow-0.20.0",
    path: "set/right/followers.rb",
    marker: "def item_names _args={}", before: 0, after: 2 },
  { key: "following_core_view",
    gem: "card-mod-follow-0.20.0",
    path: "set/right/following.rb",
    marker: "view :core do", before: 0, after: 8 },
  { key: "follower_names_method",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follower_ids.rb",
    marker: "def follower_names", before: 0, after: 2 },
  { key: "follow_section_links",
    gem: "card-mod-edit-0.20.0",
    path: "set/all/board/follow_section.rb",
    marker: "def follow_overview_button", before: 0, after: 22 },
  { key: "to_pointer_content",
    gem: "card-1.110.0",
    path: "config/initializers/01_core_extensions/array.rb",
    marker: "def to_pointer_content", before: 0, after: 9 }
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

# The port's gap, measured at this branch's tip.
#
# 1. Does the port's follow mod CALL follower_names in executable code, or
#    only name it in a comment?
# 2. Does the port register a :core view on the right/following set?
def measure_port_gap(path)
  raise "the port's follow mod is not present: #{path}" unless File.file?(path)
  lines = File.readlines(path, chomp: true)
  in_comment = lines.select { |line| line.strip.start_with?("//") }
  code = lines.reject { |line| line.strip.start_with?("//") }
  in_code = code.select { |line| line.include?("follower_names") }
  in_comments = in_comment.select { |line| line.include?("follower_names") }
  # The right/following registration: from its setPath line to the next
  # setPath line.
  start_index = lines.index { |line| line.include?('setPath: "right/following"') }
  registration = nil
  if start_index
    finish = ((start_index + 1)...lines.length).find { |i| lines[i].include?("setPath:") } || lines.length
    registration = lines[start_index...finish].join("\n")
  end
  {
    "port_mod_path" => "src/card/mod-loader/mods/card-mod-follow.ts",
    "port_mod_sha256" => Digest::SHA256.hexdigest(File.binread(path)),
    "follower_names_occurrences_in_code" => in_code.length,
    "follower_names_occurrences_in_comments" => in_comments.length,
    "follower_names_called_in_code" => !in_code.empty?,
    "right_following_registration_found" => !registration.nil?,
    "right_following_registers_core_view" => registration.nil? ? false : registration.include?('view: "core"'),
    "right_following_registers_status_view" => registration.nil? ? false : registration.include?('view: "status"'),
    "right_following_registers_rule_editor_view" => registration.nil? ? false : registration.include?('view: "rule_editor"')
  }
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

followers_core = oracle["followers_core_view"]["source"]
followers_content = oracle["followers_content"]["source"]
followers_names = oracle["followers_item_names"]["source"]
following_core = oracle["following_core_view"]["source"]
names_method = oracle["follower_names_method"]["source"]
section = oracle["follow_section_links"]["source"]
pointer = oracle["to_pointer_content"]["source"]

facts = {
  # the FOLLOWERS LIST
  "followers_core_view" => followers_core[/view :core, cache: :never do/, 0],
  "followers_core_super" => followers_core[/super\(\)/, 0],
  "followers_content" => followers_content[/left \? item_names\.to_pointer_content : ""/, 0],
  "followers_item_names" => followers_names[/left \? left\.follow_set_card\.prototype\.follower_names : \[\]/, 0],
  # the ALL FOLLOWED CARDS VIEW
  "following_core_view" => following_core[/view :core do/, 0],
  "following_core_branch" => following_core[/if card\.left && Auth\.signed_in\?/, 0],
  "following_core_rule_editor" => following_core[/render_rule_editor/, 0],
  "following_core_nest" => following_core[/nest Card\.fetch\(card\.name\.left, :followers\), view: :titled, items: \{ view: :link \}/, 0],
  # the NAMES
  "follower_names_method" => names_method[/followers\.map\(&:name\)/, 0],
  "to_pointer_content_strip" => pointer[/item = item\.to_s\.strip/, 0],
  "to_pointer_content_join" => pointer[/end\.join "\\n"/, 0],
  # the TWO LINKS ON THE BOARD
  "follow_overview_button_target" => section[/link_to_card \[Auth\.current, :follow\], "all followed cards",/, 0],
  "follow_overview_button_text" => section[/"all followed cards",/, 0],
  "followers_board_link_target" => section[/link_to_card card\.name\.field\(:followers\),/, 0],
  "followers_board_link_label" => section[/"\#\{cnt\} follower\#\{'s' unless cnt == 1\}"/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured followers list does not carry the pointer content" unless followers_content.include?("item_names.to_pointer_content")
raise "the captured followers list does not read the follower names" unless followers_names.include?("follower_names")
raise "the captured all-followed-cards view does not branch on the signed-in state" unless following_core.include?("card.left && Auth.signed_in?")
raise "the captured all-followed-cards view does not nest the followers card" unless following_core.include?("view: :titled")
raise "the captured board link does not point at the followers field" unless section.include?("card.name.field(:followers)")
raise "the captured board link does not carry the all-followed-cards label" unless section.include?('"all followed cards"')

port_gap = measure_port_gap(PORT_FOLLOW_MOD)

payload = {
  "contract" => "The board's followers link opens the followers list, whose body is the follower names as the card's pointer content, and the 'all followed cards' link opens the view of the cards the viewer follows.",
  "facts" => facts,
  "oracle" => oracle,
  "port_gap" => port_gap,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
