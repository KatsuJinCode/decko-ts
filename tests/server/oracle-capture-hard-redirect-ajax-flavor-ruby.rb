# oracle-capture-hard-redirect-ajax-flavor-ruby.rb - the PINNED DECK's own
# hard_redirect (response.rb:40-50), in both flavors.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C2 row grades the port
# on `hard_redirect`'s ajax flavor - `render json: { redirect: url }` - and
# on what surrounds it. Three facts ride this method, and each of them is a
# decision the port has to reproduce:
#
#   1. THE URL IS MADE ABSOLUTE FIRST: `url = card_url url` runs BEFORE the
#      ajax test, so the ajax flavor's JSON carries the ABSOLUTE url too.
#      The URL helper is the PINNED card gem's own
#      (card-1.110.0/lib/card/env/location.rb:19-21): an already-absolute
#      url is left alone, a relative one is made absolute against the deck
#      origin.
#
#   2. THE TWO FLAVORS: an ajax request gets `render json: {redirect: url}`
#      (the client resets its own window location), and every other request
#      gets `redirect_to url, status: status`.
#
#   3. THE STATUS IS THE NON-AJAX ARM'S: the ajax arm carries no status at
#      all (Rails' own default render status applies), and the non-ajax arm
#      carries the one it was handed - hard_redirect's own default is 302
#      (response.rb:40), while the CUD success hands it 303
#      (response.rb:31).
#
# WHAT THE RIG REACHES, stated exactly: both arms, the absolute-URL rule,
# the default status, the explicit status, the ajax arm's indifference to
# the status, and the already-absolute passthrough all execute here over
# the recording doubles. The URL helper is the PINNED one, because the
# capture loads the PINNED card gem's own location module
# (PinnedDeck.load_pinned_location_modules!).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-hard-redirect-ajax-flavor-ruby.rb \
#     > fixtures/captured/hard-redirect-ajax-flavor-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The deck origin the URL helper makes a relative path absolute against,
# and the relative url root the card_path helper uses.
ORIGIN = "https://deck.test"
Cardio.config.deck_origin = ORIGIN
Cardio.config.relative_url_root = ""

# The PINNED card gem's own URL module: card_url is the PINNED method, not
# the rig's stand-in.
PinnedDeck.load_pinned_location_modules!

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def hard_redirect_case(label, url:, ajax:, status: nil)
  Card::Env.ajax_answer = ajax
  Card::Env.origin_answer = ORIGIN
  card = PinnedDeck::CardDouble.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card)
  error = nil
  begin
    # hard_redirect is private in the pinned module (response.rb:8
    # `private` precedes response.rb:40), so the direct call goes through
    # send - the pinned body that runs is still the pinned body.
    if status.nil?
      harness.send(:hard_redirect, url)
    else
      harness.send(:hard_redirect, url, status)
    end
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "urlArg" => url,
    "ajax" => ajax,
    "statusArg" => status,
    "error" => error,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected
  }
end

rows = [
  hard_redirect_case("a plain request: the redirect carries the default status 302 and an ABSOLUTE url",
                     url: "/Front", ajax: false),
  hard_redirect_case("the CUD success's own status: a plain request redirects 303",
                     url: "/Front", ajax: false, status: 303),
  hard_redirect_case("an ajax request: the answer is the JSON {redirect: url}, with the ABSOLUTE url",
                     url: "/Front", ajax: true),
  hard_redirect_case("an ajax request ignores the status argument entirely",
                     url: "/Front", ajax: true, status: 303),
  hard_redirect_case("an already-absolute url is left alone by the url helper",
                     url: "https://other.example/Front", ajax: false)
]

# The pinned sources, quoted with line numbers.
hard_redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                               .select { |row| row["line"].between?(40, 50) }
card_url_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/location.rb")
                         .select { |row| row["line"].between?(6, 21) }
cud_success_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                              .select { |row| row["line"].between?(25, 33) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C2",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "hardRedirect" => rows,
  "rigArtifacts" => [
    "the ajax arm calls `render json: {...}` with no status, so Rails' own default render status applies; the rig's render records the render OPTIONS, not a status.",
    "the ajax test is the rig's Card::Env.ajax? double (the pinned deck reads Card::Env.ajax? the same way - env/serializable.rb:24), so the capture sets the double's answer rather than standing up a request."
  ],
  "sources" => {
    "hardRedirect" => hard_redirect_source,
    "pinnedCardUrl" => card_url_source,
    "redirectCudSuccess" => cud_success_source
  }
)
