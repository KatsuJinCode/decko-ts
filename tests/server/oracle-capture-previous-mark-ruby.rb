# oracle-capture-previous-mark-ruby.rb - the PINNED DECK's own `*previous`
# mark handling, executed.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B8 row grades the port
# on `load_mark` (mark.rb:12-14, "the `*previous` mark -> hard_redirect to
# the previous location"). The row's note named the method and the redirect
# but not the ANSWER: what the previous location is, what shape the redirect
# takes, and what happens when the visitor has no history. This capture
# measures all three from the PINNED side.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED card gem's own files:
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:6-20
#                 def load_mark
#                   params[:mark] = interpret_mark params[:mark]
#                 end
#
#                 def interpret_mark mark
#                   case mark
#                   when "*previous"
#                     hard_redirect Card::Env.previous_location
#                   when nil
#                     implicit_mark
#                   else
#                     explicit_mark mark
#                   end
#                 end
#
#   the answer  decko-0.20.0/lib/card_controller/response.rb:39-50
#                 def hard_redirect url, status=302
#                   url = card_url url # make sure we have absolute url
#                   if Card::Env.ajax?
#                     render json: { redirect: url }
#                   else
#                     redirect_to url, status: status
#                   end
#                 end
#               So the redirect is ABSOLUTE (card_url - the pinned
#               Card::Env::Location#card_url, which the pinned controller
#               includes at card_controller.rb:15), 302 for an ordinary
#               request, and the {redirect: url} JSON for an ajax one.
#
#   the target  card-1.110.0/lib/card/env/location_history.rb:6-21
#                 def location_history
#                   session[:history] ||= [Env::Location.card_path("")]
#                   session[:history].shift if session[:history].size > 5
#                   session[:history]
#                 end
#
#                 def previous_location
#                   location_history&.last
#                 end
#               The history is the session's stack of visited pages; an
#               EMPTY history bottoms out at card_path("") - the deck root.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-previous-mark-ruby.rb \
#     > fixtures/captured/previous-mark-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The three cases and the sources are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The deck origin the URL helper makes a relative path absolute against
# (card-1.110.0/lib/card/env/serializable.rb:20-22 reads
# Cardio.config.deck_origin first).
ORIGIN = "https://deck.test"
Cardio.config.deck_origin = ORIGIN
Cardio.config.relative_url_root = ""

# The PINNED card gem's own URL and location-history modules.
PinnedDeck.load_pinned_location_modules!

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# Run the PINNED interpret_mark over a session with the given history and
# report what the pinned method answered.
def run_previous_mark(history:, ajax: false)
  Card::Env.session_answer = history.nil? ? {} : { history: history }
  Card::Env.ajax_answer = ajax
  Card::Env.origin_answer = ORIGIN

  harness = PinnedDeck::ControllerHarness.new(params: { mark: "*previous" })
  error = nil
  begin
    harness.send(:interpret_mark, "*previous")
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "history" => history,
    "ajax" => ajax,
    "previousLocation" => begin
      Card::Env.previous_location
    rescue StandardError => e
      "RAISED: #{e.class}: #{e.message}"
    end,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered,
    "error" => error
  }
end

# A visitor with a history: the last entry is the target.
with_history = run_previous_mark(history: ["https://deck.test/Old", "https://deck.test/Welcome?tab=1"])
# A visitor with NO history: the stack bottoms out at the deck root.
without_history = run_previous_mark(history: nil)
# The ajax flavor of the same redirect.
ajax = run_previous_mark(history: ["https://deck.test/Welcome?tab=1"], ajax: true)

# The pinned sources, quoted with line numbers.
mark_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/mark.rb")
                         .select { |row| row["line"].between?(6, 20) }
redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                             .select { |row| row["line"].between?(39, 50) }
history_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/location_history.rb")
                           .select { |row| row["line"].between?(6, 21) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B8",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "origin" => ORIGIN,
  "withHistory" => with_history,
  "withoutHistory" => without_history,
  "ajaxFlavor" => ajax,
  "sources" => {
    "mark" => mark_source,
    "hardRedirect" => redirect_source,
    "locationHistory" => history_source
  }
)
