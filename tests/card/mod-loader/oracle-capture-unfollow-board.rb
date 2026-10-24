# oracle-capture-unfollow-board.rb - the pinned Ruby's own bytes for THE
# UNFOLLOW CONTROL ON THE BOARD (registry row cap-W2, "Unfollow from the
# board").
#
# The row's contract: the Engage tab offers the start-follow link with
# Ruby's follow bytes, after following the same control offers Ruby's stop
# link, clicking the stop link leaves the stored follow preference at *never
# on the same rule it followed, and after unfollowing the control is
# byte-identical to the start state with the follower count back at its
# baseline. Five pinned files own it:
#
#   1. card-mod-follow-0.20.0/set/all/follow/start_follow_link.rb - the START
#      STATE: `@rule_content = "*always"`, `@link_text = "follow"`, `@action =
#      "send"`, `@css_class = ""`.
#   2. card-mod-follow-0.20.0/set/all/follow/stop_follow_link.rb - the STOP
#      STATE: `@rule_content = "*never"`, `@link_text = "following"`,
#      `@hover_text = "unfollow"`, `@action = "stop sending"`, `@css_class =
#      "btn-item-delete"`.
#   3. card-mod-follow-0.20.0/set/all/follow/follow_link.rb - the SHAPE: the
#      button (30-43) is `link_to render_link_text, opts` over the css_classes
#      chain ("follow-link", the state's own css_class, "slotter btn btn-sm
#      btn-primary"), the data-update-foreign-slot hook and the hover_text
#      arm; link_opts (44-47) is `{ title: title, path: path(success_view),
#      class: css_class }`; render_link_text (49-52) is the `<span
#      class="follow-verb">` the verb lives in; title (57-59) is `"#{action}
#      emails about changes to #{@card.follow_label}"`; and path (61-69) is the
#      WRITE: `card: { content: "[[#{rule_content}]]" }`.
#   4. card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb - the STATE
#      PICKER: `card.followed? ? StopFollowLink : StartFollowLink`.
#   5. card-mod-follow-0.20.0/set/right/following.rb - the STORAGE READ:
#      `current_follow_rule_card` is `card.left.preference :follow`.
#
# And the follower COUNT, which is the only leg that sees the cache:
# card-mod-follow-0.20.0/set/all/follow/follower_ids.rb owns
# FOLLOWER_IDS_CACHE_KEY, the cache read and write, and `followers_count` as
# `follower_ids.size`.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-unfollow-board.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "unfollow-board.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "start_follow_link",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/start_follow_link.rb",
    marker: "class StartFollowLink < FollowLink", before: 2, after: 7 },
  { key: "stop_follow_link",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/stop_follow_link.rb",
    marker: "class StopFollowLink < FollowLink", before: 2, after: 8 },
  { key: "follow_button",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link.rb",
    marker: "def button", before: 0, after: 13 },
  { key: "follow_link_opts",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link.rb",
    marker: "def link_opts success_view=:follow_status", before: 0, after: 3 },
  { key: "follow_render_link_text",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link.rb",
    marker: "def render_link_text icon=false", before: 0, after: 4 },
  { key: "follow_title",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link.rb",
    marker: "def title", before: 0, after: 2 },
  { key: "follow_path",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link.rb",
    marker: "def path view=:follow_status", before: 0, after: 7 },
  { key: "follow_link_class",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follow_link_views.rb",
    marker: "def follow_link_class", before: 0, after: 2 },
  { key: "current_follow_rule_card",
    gem: "card-mod-follow-0.20.0",
    path: "set/right/following.rb",
    marker: "def current_follow_rule_card", before: 0, after: 2 },
  { key: "follower_ids_cache",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follower_ids.rb",
    marker: "FOLLOWER_IDS_CACHE_KEY = \"FOLLOWER_IDS\".freeze", before: 0, after: 2 },
  { key: "follower_ids_cache_read",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follower_ids.rb",
    marker: "def read_follower_ids_cache", before: 2, after: 2 },
  { key: "followers_count",
    gem: "card-mod-follow-0.20.0",
    path: "set/all/follow/follower_ids.rb",
    marker: "def followers_count", before: 0, after: 2 }
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

start_link = oracle["start_follow_link"]["source"]
stop_link = oracle["stop_follow_link"]["source"]
button = oracle["follow_button"]["source"]
link_opts = oracle["follow_link_opts"]["source"]
link_text = oracle["follow_render_link_text"]["source"]
title = oracle["follow_title"]["source"]
path = oracle["follow_path"]["source"]
link_class = oracle["follow_link_class"]["source"]
storage = oracle["current_follow_rule_card"]["source"]
cache_key = oracle["follower_ids_cache"]["source"]
cache_read = oracle["follower_ids_cache_read"]["source"]
count = oracle["followers_count"]["source"]

facts = {
  # the START STATE
  "start_rule_content" => start_link[/@rule_content = "\*always"/, 0],
  "start_link_text" => start_link[/@link_text = "follow"/, 0],
  "start_action" => start_link[/@action = "send"/, 0],
  "start_css_class" => start_link[/@css_class = ""/, 0],
  # the STOP STATE
  "stop_rule_content" => stop_link[/@rule_content = "\*never"/, 0],
  "stop_link_text" => stop_link[/@link_text = "following"/, 0],
  "stop_hover_text" => stop_link[/@hover_text = "unfollow"/, 0],
  "stop_action" => stop_link[/@action = "stop sending"/, 0],
  "stop_css_class" => stop_link[/@css_class = "btn-item-delete"/, 0],
  # the SHAPE
  "button_class_chain" => button[/class: @format\.css_classes\("follow-link", link_opts\[:class\],/, 0],
  "button_class_chain_tail" => button[/"slotter btn btn-sm btn-primary"\)/, 0],
  "button_foreign_slot" => button[/opts\["data-update-foreign-slot"\] =/, 0],
  "button_hover_arm" => button[/opts\["data-hover-text"\] = hover_text if hover_text/, 0],
  "button_link_to" => button[/link_to render_link_text, opts/, 0],
  "link_opts" => link_opts[/\{ title: title,\n\s*path: path\(success_view\),\n\s*class: css_class \}/, 0],
  "render_link_text" => link_text[/verb = %\(<span class="follow-verb">#\{link_text\}<\/span>\)/, 0],
  "title" => title[/"\#\{action\} emails about changes to \#\{@card\.follow_label\}"/, 0],
  "path_action" => path[/action: :update,/, 0],
  "path_success" => path[/success: \{ mark: @card\.name, view: view \},/, 0],
  "path_content_write" => path[/card: \{ content: "\[\[#\{rule_content\}\]\]" \}/, 0],
  # the STATE PICKER
  "follow_link_class" => link_class[/card\.followed\? \? StopFollowLink : StartFollowLink/, 0],
  # the STORAGE
  "current_follow_rule_card" => storage[/card\.left\.preference :follow/, 0],
  # the FOLLOWER COUNT AND ITS CACHE
  "follower_ids_cache_key" => cache_key[/FOLLOWER_IDS_CACHE_KEY = "FOLLOWER_IDS"\.freeze/, 0],
  "follower_ids_cache_read" => cache_read[/Card\.follower_ids_cache\[id\]/, 0],
  "followers_count" => count[/follower_ids\.size/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured start state does not write *always" unless start_link.include?('@rule_content = "*always"')
raise "the captured stop state does not write *never" unless stop_link.include?('@rule_content = "*never"')
raise "the captured stop state does not carry the delete class" unless stop_link.include?('@css_class = "btn-item-delete"')
raise "the captured path does not write the rule content" unless path.include?('card: { content: "[[#{rule_content}]]" }')
raise "the captured button does not carry the hover arm" unless button.include?('opts["data-hover-text"] = hover_text if hover_text')
raise "the captured class picker does not choose by state" unless link_class.include?("card.followed? ? StopFollowLink : StartFollowLink")
raise "the captured storage read is not the follow preference" unless storage.include?("card.left.preference :follow")

payload = {
  "contract" => "The Engage tab's follow control has two states: the start link writes *always and the stop link writes *never, and clicking the stop link leaves the stored follow preference at *never on the same rule it followed, with the follower count back at its baseline.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
