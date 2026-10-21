# oracle-capture-home-mark-ruby.rb - the PINNED DECK's own `home_mark`,
# executed, and the PINNED seed's own *home row, read.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C6 row grades the
# port on the Home mark ("`*home` global rule, mark.rb:42-44"). The row's
# note named the rule read but not the VALUE the pinned deck ships, nor
# the exact read shape (as_bot, strip, fallback). This capture measures
# both from the PINNED side.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED card gem's own
# files:
#
#   the method  decko-0.20.0/lib/card_controller/mark.rb:42-44
#                 def home_mark
#                   Card::Rule.global_setting(:home) || "Home"
#                 end
#
#   the read    card-1.110.0/lib/card/rule.rb:5-9
#                 def global_setting name
#                   Auth.as_bot do
#                     (card = Card[name]) && !card.db_content.strip.empty? &&
#                       card.db_content
#                   end
#                 end
#
#   the seed    card-mod-defaults-0.20.0/data/real.yml - the deck the
#               pinned gemset builds. Its *home row's content is the
#               value every fresh pinned deck answers - the value the
#               port's hardcoded "Home" happened to agree with, and the
#               reason the agreement was invisible until a rule was
#               edited.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-home-mark-ruby.rb \
#     > fixtures/captured/home-mark-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
# This Ruby ships Psych without the YAML compatibility alias, so the
# parser is named directly.
require "psych"

# The PINNED card gem's own rule module, so Card::Rule.global_setting is
# the PINNED method and not the rig's double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/rule.rb")

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# Run the PINNED home_mark over the three rule states and record what it
# answered.
home_mark_harness = PinnedDeck::ControllerHarness.new
rule_states = {}
{
  "ruleSet" => "Front",
  "ruleBlank" => "   ",
  "ruleMissing" => nil
}.each do |label, content|
  Card.lookup_table = content.nil? ? {} : { "home" => content }
  Card.lookups = nil
  Card::Auth.as_bot_calls = 0
  answer = nil
  error = nil
  begin
    answer = home_mark_harness.send(:home_mark)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  rule_states[label] = {
    "cardContent" => content,
    "answer" => answer,
    "asBotCalls" => Card::Auth.as_bot_calls,
    "ruleLookups" => (Card.lookups || []).map(&:to_s),
    "error" => error
  }
end

# The PINNED seed's own *home row, read out of the pinned mod's own data
# file - the value every fresh pinned deck ships. The seed's keys and
# values use YAML symbol scalars (:name, :content), so Symbol is in the
# permitted classes.
seed_path = PinnedDeck.pinned_path("card-mod-defaults-0.20.0/data/real.yml")
seed_rows = Psych.safe_load(File.read(seed_path), aliases: true, permitted_classes: [Symbol])
home_row = seed_rows.find { |row| row.is_a?(Hash) && (row["name"] == "*home" || row[:name] == "*home") }

# The pinned sources, quoted with line numbers.
mark_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/mark.rb")
                         .select { |row| row["line"].between?(42, 44) }
rule_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/rule.rb")
                         .select { |row| row["line"].between?(5, 9) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C6",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-defaults-0.20.0 (pinned)",
  "homeMark" => rule_states,
  "pinnedSeed" => {
    "file" => "card-mod-defaults-0.20.0/data/real.yml",
    "homeRow" => home_row
  },
  "sources" => {
    "mark" => mark_source,
    "rule" => rule_source
  }
)
