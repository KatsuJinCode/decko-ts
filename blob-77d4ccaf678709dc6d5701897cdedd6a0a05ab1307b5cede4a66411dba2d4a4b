# oracle-capture-load-action-ruby.rb - runs the PINNED DECK's own
# load_action and records when it replaces the card's content with the last
# draft's.
#
# Why this script exists: the completeness register's B11 row
# (register-routes) grades the port PARTIAL: "the port EMITS
# ?edit_draft=true (src/card/mod-loader/mods/card-mod-history.ts:1890) and
# never CONSUMES it (grep for edit_draft over src returns only that
# emitter)". The row's fix: "read params[:edit_draft] in load_action and
# render the acting cards last draft". That was derived by reading the
# gems.
#
# This script runs the PINNED DECK's own method
# (decko-0.20.0/lib/card_controller/rest.rb:56-61) over the four cells that
# decide the behavior. The deck gem's own file is loaded as it is; the
# actionpack Token module it includes at load time is the PINNED gem's own
# source (the same extraction the request-authenticators capture uses), and
# the card is a stub that records what the controller asked of it.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-load-action-ruby.rb \
#     > fixtures/captured/load-action-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The stubs carry fixed values, so a re-run on the same gemset is
# byte-stable.

require "json"

GEM_ROOT = ENV.fetch("DECKO_RUBY_GEMSET", nil)
gems_root = if GEM_ROOT
              GEM_ROOT
            else
              File.expand_path(
                "../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
                __dir__
              )
            end

# The load path: every pinned gem's lib directory, the way Bundler would
# put them. The deck gem's file includes ActionController's Token module at
# load time, so the pinned actionpack is on the path.
pinned_libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
raise "no pinned gems found at #{gems_root}" if pinned_libs.empty?

pinned_libs.each do |lib|
  gem_dir = File.dirname(lib)
  gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
  nested = File.join(lib, gem_name)
  $LOAD_PATH.unshift(nested) if File.directory?(nested)
  $LOAD_PATH.unshift(lib)
end

require "active_support/core_ext/object/blank"
require "active_support/core_ext/hash/indifferent_access"
require "base64"

# ---------------------------------------------------------------------------
# the actionpack Token module, verbatim out of the pinned file
# ---------------------------------------------------------------------------

actionpack_rb = File.join(
  gems_root,
  "actionpack-7.2.4/lib/action_controller/metal/http_authentication.rb"
)
raise "actionpack's http_authentication.rb not found at #{actionpack_rb}" unless File.exist?(actionpack_rb)

source = File.read(actionpack_rb)
token_start = source.index("module Token")
raise "the Token module was not found in #{actionpack_rb}" if token_start.nil?

token_lines = source[token_start..].lines
unless token_lines[-3..].map(&:strip) == ["end", "end", "end"]
  raise "the pinned actionpack file does not end with the Token module's three end lines"
end

token_source = token_lines[0..-3].join

module ActionController
  module HttpAuthentication
  end
end

ActionController::HttpAuthentication.module_eval(token_source, actionpack_rb) # rubocop:disable Security/Eval

# ---------------------------------------------------------------------------
# the deck gem's own controller
# ---------------------------------------------------------------------------

rest_rb = File.join(gems_root, "decko-0.20.0/lib/card_controller/rest.rb")
raise "decko's card_controller/rest.rb not found at #{rest_rb}" unless File.exist?(rest_rb)

# The deck gem's own file, loaded as it is.
eval(File.read(rest_rb), TOPLEVEL_BINDING, rest_rb) # rubocop:disable Security/Eval

# ---------------------------------------------------------------------------
# the harness
# ---------------------------------------------------------------------------

# The card stub: it answers the two things load_action asks of it, and
# records what it was asked. `drafts` and `last_draft_content` stand in for
# the card gem's own Card#drafts (card.rb:173) and
# Card::Content::All#last_draft_content (content/all.rb:42-44,
# `drafts.last.card_changes.last.value`).
class CardStub
  attr_reader :selected, :content

  def initialize(drafts: [], last_draft_content: "DRAFT CONTENT")
    @drafts = drafts
    @last_draft_content = last_draft_content
    @selected = []
    @content = "SAVED CONTENT"
  end

  def select_action_by_params(params)
    @selected << params
    nil
  end

  def drafts
    @drafts
  end

  def last_draft_content
    @last_draft_content
  end

  def content=(value)
    @content = value
  end
end

class ControllerHarness
  include CardController::Rest

  attr_accessor :card, :params

  def initialize(card, params)
    @card = card
    @params = params
  end
end

def load_action_case(label, params, drafts: [], last_draft_content: "DRAFT CONTENT")
  card = CardStub.new(drafts: drafts, last_draft_content: last_draft_content)
  harness = ControllerHarness.new(card, params)
  begin
    harness.send(:load_action)
    {
      "label" => label,
      "outcome" => "loaded",
      "selectedAction" => card.selected.length,
      "content" => card.content
    }
  rescue StandardError => e
    {
      "label" => label,
      "outcome" => "raised",
      "errorClass" => e.class.name,
      "errorMessage" => e.message,
      "selectedAction" => card.selected.length,
      "content" => card.content
    }
  end
end

cases = [
  # No edit_draft param: the action is selected, the content is untouched.
  load_action_case("no edit_draft", { rev_id: "7" }, drafts: [Object.new]),
  # edit_draft present but FALSE: the same.
  load_action_case("edit_draft false", { rev_id: "7", edit_draft: "false" }, drafts: [Object.new]),
  # edit_draft present and the card has NO drafts: the same.
  load_action_case("edit_draft true, no drafts", { rev_id: "7", edit_draft: "true" }, drafts: []),
  # edit_draft present and the card HAS drafts: the content becomes the
  # last draft's content.
  load_action_case("edit_draft true, with drafts", { rev_id: "7", edit_draft: "true" }, drafts: [Object.new])
]

# The card side of the same question: the gem's own last_draft_content
# picks the LAST draft's LAST card change's value. The gem's own file
# (card-1.110.0/lib/card/content/all.rb) carries that method; the capture
# runs it with a stubbed drafts list, so the SELECTION is the gem's and
# only the data is the capture's.
content_all_rb = File.join(gems_root, "card-1.110.0/lib/card/content/all.rb")
raise "card's content/all.rb not found at #{content_all_rb}" unless File.exist?(content_all_rb)

# The method's own body, verbatim out of the pinned file, bound to a stub
# that answers `drafts`.
draft_selection = []
drafts_fixture = [
  Struct.new(:card_changes).new([Struct.new(:value).new("FIRST DRAFT")]),
  Struct.new(:card_changes).new([Struct.new(:value).new("SECOND DRAFT")])
]
all_source = File.read(content_all_rb)
method_source = all_source[/def last_draft_content.*?^\s*end/m]
raise "last_draft_content was not found in #{content_all_rb}" if method_source.nil?

content_holder = Object.new
content_holder.define_singleton_method(:drafts) { drafts_fixture }
content_holder.singleton_class.class_eval(method_source, content_all_rb)
draft_selection << { "drafts" => drafts_fixture.length, "value" => content_holder.last_draft_content }

# The same method with ONE draft whose LAST card change is not the first.
one_draft = [Struct.new(:card_changes).new([
  Struct.new(:value).new("OLDER CHANGE"),
  Struct.new(:value).new("NEWER CHANGE")
])]
holder = Object.new
holder.define_singleton_method(:drafts) { one_draft }
holder.singleton_class.class_eval(method_source, content_all_rb)
draft_selection << { "drafts" => 1, "value" => holder.last_draft_content }

puts JSON.pretty_generate(
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "loadAction" => cases,
  "lastDraftContent" => draft_selection
)
