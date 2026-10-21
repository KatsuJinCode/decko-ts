# oracle-capture-implicit-mark-ruby.rb - the PINNED DECK's own
# `implicit_mark`, executed over its whole ladder.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B9 row grades the port
# on `implicit_mark` (mark.rb:28-40, "home fallback"). The row's note named
# the method and the fallback but not the LADDER that decides which branch
# answers, nor what the home fallback answers when the rule is missing,
# blank or set. This capture measures all of it from the PINNED side.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED card gem's own files:
#
#   the ladder  decko-0.20.0/lib/card_controller/mark.rb:28-44
#                 def implicit_mark
#                   case
#                   when initial_setup?
#                     prepare_setup_card! # alters params
#                     ""
#                   when (name = mark_from_card_hash)
#                     name
#                   when view_does_not_require_name?
#                     ""
#                   else
#                     home_mark
#                   end
#                 end
#
#                 def home_mark
#                   Card::Rule.global_setting(:home) || "Home"
#                 end
#
#                 def mark_from_card_hash
#                   params.dig :card, :name
#                 end
#
#                 def view_does_not_require_name?
#                   return false unless (view = params[:view]&.to_sym)
#
#                   Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok[view]
#                 end
#
#                 def initial_setup?
#                   Card::Auth.needs_setup? && Card::Env.html?
#                 end
#
#   the rule    card-1.110.0/lib/card/rule.rb:5-9
#                 def global_setting name
#                   Auth.as_bot do
#                     (card = Card[name]) && !card.db_content.strip.empty? &&
#                       card.db_content
#                   end
#                 end
#               The rule is read AS THE BOT, and the answer is the card's
#               content when it is not blank, false otherwise. The "Home"
#               fallback is the `||` on the outside.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-implicit-mark-ruby.rb \
#     > fixtures/captured/implicit-mark-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED card gem's own rule module, so Card::Rule.global_setting is
# the PINNED method (the rig's double is replaced by the later definition
# on the same singleton class) and not a stand-in.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/rule.rb")

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# Run the PINNED implicit_mark over one case and report what it answered.
def run_implicit_mark(params:, card_content: nil, needs_setup: false, html: true,
                      unknown_ok: {})
  Card.lookup_table = card_content.nil? ? {} : { "home" => card_content }
  Card.lookups = nil
  Card::Auth.needs_setup_answer = needs_setup
  Card::Auth.as_bot_calls = 0
  Card::Env.html_answer = html
  Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok_views = unknown_ok

  harness = PinnedDeck::ControllerHarness.new(params: params)
  error = nil
  mark = nil
  begin
    mark = harness.send(:implicit_mark)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "params" => params,
    "cardContent" => card_content,
    "mark" => mark,
    "paramsAfter" => params.dup,
    "asBotCalls" => Card::Auth.as_bot_calls,
    "ruleLookups" => (Card.lookups || []).map(&:to_s),
    "error" => error
  }
end

# The home fallback itself, over the three rule states.
home_mark = PinnedDeck::ControllerHarness.new
home_mark_results = {}
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
    answer = home_mark.send(:home_mark)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  home_mark_results[label] = {
    "cardContent" => content,
    "answer" => answer,
    "asBotCalls" => Card::Auth.as_bot_calls,
    "ruleLookups" => (Card.lookups || []).map(&:to_s),
    "error" => error
  }
end

ladder = {
  # The setup branch. Card.default_accounted_type_id is the account mod's
  # `UserID` (card-mod-account-0.20.0/set/all/account.rb:3-5), a RUNTIME
  # constant the pinned gemset never assigns, so the pinned method cannot
  # be stood up on this branch: the capture records the raise instead of
  # inventing a type id. The setup branch's own subject is row B10, which
  # carries that evidence.
  "initialSetup" => run_implicit_mark(params: {}, needs_setup: true),
  # The body carries a card name: that name IS the mark.
  "markFromCardHash" => run_implicit_mark(params: { card: { name: "Target" } }),
  # A view that needs no name: the mark is empty.
  "viewDoesNotRequireName" => run_implicit_mark(
    params: { view: "new" },
    unknown_ok: { new: true }
  ),
  # Nothing else applies: the home fallback answers.
  "homeFallback" => run_implicit_mark(params: {}, card_content: "Front"),
  "homeFallbackBlankRule" => run_implicit_mark(params: {}, card_content: "   "),
  "homeFallbackMissingRule" => run_implicit_mark(params: {})
}

# The EXPLICIT marks, which never reach the ladder: interpret_mark's third
# branch (mark.rb:17-18) answers the mark as given. The empty mark is in
# here because a request can carry one (a query's ?mark= with no value),
# and the hosts must not silently turn it into the home mark.
explicit_marks = {}
["", "Front", "*previous"].each do |mark|
  harness = PinnedDeck::ControllerHarness.new(params: { mark: mark })
  answer = nil
  error = nil
  begin
    answer = harness.send(:interpret_mark, mark)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  explicit_marks[mark] = { "answer" => answer, "error" => error }
end

# The pinned sources, quoted with line numbers.
mark_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/mark.rb")
                         .select { |row| row["line"].between?(28, 63) }
rule_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/rule.rb")
                         .select { |row| row["line"].between?(5, 9) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B9",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "ladder" => ladder,
  "explicitMarks" => explicit_marks,
  "homeMark" => home_mark_results,
  "sources" => {
    "mark" => mark_source,
    "rule" => rule_source
  }
)
