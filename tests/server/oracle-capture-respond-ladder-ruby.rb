# oracle-capture-respond-ladder-ruby.rb - the PINNED DECK's own respond
# ladder (response.rb:10-19).
#
# WHY THIS SCRIPT EXISTS: the completeness register's C1 row grades the port
# on `respond` - the method every rendered answer goes through. The method
# looks like three arms, and the three arms are not equally obvious:
#
#   1. A REDIRECT STATUS REDIRECTS: `if status.in? [302, 303]` - and the
#      redirect it makes is `hard_redirect result` with NO status argument,
#      so the 302 default of hard_redirect (response.rb:40) answers. A 303
#      that reaches respond therefore answers a 302. That is a fact about
#      the pinned code, and the capture measures it.
#   2. A FILE FORMAT AT 200 SENDS THE FILE: the is_a? check is against the
#      PINNED mod's own Card::Format::FileFormat class, so the capture
#      answers the arm with an instance of a subclass of THAT class.
#   3. EVERYTHING ELSE RENDERS: `render_response result.to_s.html_safe,
#      status, format.mime_type` - the body's html_safe, the status it was
#      given, and the FORMAT's mime type.
#
# The arms are PRIORITY ORDERED, and the order is measurable: a file format
# at 302 is a REDIRECT, not a file.
#
# WHAT THE RIG REACHES, stated exactly: the three arms, their priority
# order, the 303-becomes-302 fact, the render body and mime type, and the
# cache log line all execute here over the recording doubles. The redirect
# arm's own work (making the URL absolute, the ajax flavor) is row C2's
# evidence.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-respond-ladder-ruby.rb \
#     > fixtures/captured/respond-ladder-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
# respond's render arm sends `result.to_s.html_safe`; the pinned
# activesupport carries the String extension.
require "active_support/core_ext/string/output_safety"

# The PINNED MOD's own format registry, loaded: the FileFormat arm's is_a?
# check is against the PINNED class, so the class has to exist.
registry = load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# A format that IS a file format: an instance of a subclass of the PINNED
# mod's own Card::Format::FileFormat, so the is_a? check respond makes is
# the pinned class check.
class RespondFileFormat < Card::Format::FileFormat
  def mime_type
    "text/html"
  end
end

def respond_case(label, format:, result:, status:, cache_log: false)
  Cardio.config.cache_log_level = cache_log ? "info" : nil
  card = PinnedDeck::CardDouble.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card)
  logger = Rails.logger
  before = logger.messages.length
  error = nil
  begin
    # respond is private in the pinned module (response.rb:8 `private`
    # precedes response.rb:10), so the direct call goes through send - the
    # pinned body that runs is still the pinned body.
    harness.send(:respond, format, result, status)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "statusArg" => status,
    "error" => error,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "sentFile" => harness.sent_file,
    "logged" => logger.messages[before..] || []
  }
end

html_format = PinnedDeck::FormatDouble.new(PinnedDeck::CardDouble.new(name: "Front"), :html)
file_format = RespondFileFormat.new

rows = [
  respond_case("a 302 status REDIRECTS: the redirect answers the hard_redirect default 302",
               format: html_format, result: "PAGE", status: 302),
  respond_case("a 303 status REDIRECTS TOO, and the redirect answers 302 - the 303 is not carried",
               format: html_format, result: "PAGE", status: 303),
  respond_case("a file format at 200 SENDS THE FILE instead of rendering",
               format: file_format, result: ["FILE-PAGE"], status: 200),
  respond_case("a file format at 302 REDIRECTS: the redirect arm outranks the file arm",
               format: file_format, result: ["FILE-PAGE"], status: 302),
  respond_case("anything else RENDERS with the format's mime type and the status it was given",
               format: html_format, result: "PAGE", status: 200),
  respond_case("a 404 renders with its own status (not a redirect, not a file)",
               format: html_format, result: "NOT-FOUND", status: 404),
  respond_case("the cache log line fires only when the config asks for it",
               format: html_format, result: "PAGE", status: 200, cache_log: true)
]

# The pinned sources, quoted with line numbers.
respond_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                           .select { |row| row["line"].between?(10, 19) }
render_response_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                                 .select { |row| row["line"].between?(21, 23) }
hard_redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                               .select { |row| row["line"].between?(40, 40) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C1",
  "gemset" => "decko-0.20.0 + card-mod-format-0.20.0 (pinned)",
  "respondLadder" => rows,
  "registeredFormats" => registry["registered"],
  "rigArtifacts" => [
    "the file format the capture answers the file arm with is an instance of a SUBCLASS of the PINNED mod's own Card::Format::FileFormat, so the is_a? check respond makes is the pinned class check; the subclass adds only the mime_type the render arm would read.",
    "the recorded redirect URL is the rig's shape: the rig's hard_redirect stand-in does not make the URL absolute (the pinned card_url does, response.rb:41 - row C2's evidence), and the rig's FormatDouble answers a fixed mime type."
  ],
  "sources" => {
    "respond" => respond_source,
    "renderResponse" => render_response_source,
    "hardRedirectDefault" => hard_redirect_source
  }
)
