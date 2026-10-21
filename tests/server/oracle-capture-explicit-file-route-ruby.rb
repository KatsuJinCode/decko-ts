# oracle-capture-explicit-file-route-ruby.rb - the PINNED DECK's own explicit
# file route, and the file sender it dispatches to.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A2 row (register-routes)
# grades the port PARTIAL: "the register's claim was STALE, not a gap: the
# save path stores ImageCardUploader version files ... the route threads the
# parsed -size segment into the store ... Commit aae99a09 corrects only the
# two stale header comments". The row's own verification still pointed at the
# stale claim, so the row could not close on evidence.
#
# This capture supplies that evidence from the PINNED side: it EXECUTES the
# pinned deck's own route table and the pinned deck's own dispatch methods
# for the explicit-file request, and records what they answer.
#
# THE MECHANISM, from the PINNED DECK's own methods:
#
#   the route   decko-0.20.0/config/engine_routes.rb:9-13
#                 get({ "#{files}/:mark/:rev_id(-:size).:format" => "card#read" }
#                     .merge(mark: /[^-]+/, explicit_file: true, rev_id: /[^-]+/))
#                 get({ "#{files}/:mark(-:size)-:rev_id.:format" => "card#read" }
#                     .merge(mark: /[^-]+/, explicit_file: true, rev_id: /[^-]+/))
#               The `files` prefix is the deck's own config value, set by the
#               PINNED carrierwave mod (card-mod-carrierwave-0.20.0/lib/card/
#               mod/carrierwave.rb:2 `config.files_web_path = "files"`).
#
#   the dispatch decko-0.20.0/lib/card_controller/response.rb:102-109
#                 def format_name_from_params
#                   rf = requested_format
#                   explicit_file_format?(rf) ? :file : rf.to_sym
#                 end
#                 def explicit_file_format? rf
#                   params[:explicit_file] || !Card::Format.registered.member?(rf)
#                 end
#
#   the sender  decko-0.20.0/lib/card_controller/response.rb:10-19
#                 if status.in? [302, 303] then hard_redirect
#                 elsif format.is_a?(Card::Format::FileFormat) && status == 200
#                   send_file(*result)
#                 else render_response(...)
#
# The route's own requirements carry the two facts the port's grammar has to
# match: the mark and the rev_id may NOT contain a dash (/[^-]+/), and the
# explicit_file requirement is what turns the request into the file sender.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-explicit-file-route-ruby.rb \
#     > fixtures/captured/explicit-file-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
require "active_support/core_ext/string/output_safety"

# The PINNED MOD's own format registry (card-mod-format's format files
# register themselves) - the deck's dispatch asks it whether a format name
# is registered, and the PINNED mod's own Card::Format::FileFormat is the
# class the deck's respond method branches on.
registry = load_pinned_format_registry!

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
files_routes = routes.select { |route| route["patterns"].any? { |pattern| pattern.include?(":rev_id") } }

# The PINNED DECK's own dispatch methods.
PinnedDeck.eval_pinned("decko-0.20.0/lib/card_controller/response.rb")
PinnedDeck::ControllerHarness.include_pinned_modules!

# A request double: `request.format` is the format the URL suffix (or the
# Accept header) asked for.
FakeRequest = Struct.new(:format)

class ResponseHarness
  include CardController::Response

  attr_accessor :params, :request

  def initialize(params, request)
    @params = params
    @request = request
  end
end

def dispatch_case(label, requested, params: {})
  harness = ResponseHarness.new(params, FakeRequest.new(requested))
  begin
    {
      "label" => label,
      "requested" => requested,
      "params" => params,
      "formatName" => harness.send(:format_name_from_params).to_s
    }
  rescue StandardError => e
    {
      "label" => label,
      "requested" => requested,
      "params" => params,
      "formatName" => nil,
      "errorClass" => e.class.name,
      "errorMessage" => e.message
    }
  end
end

dispatch_rows = [
  dispatch_case("the explicit file request (png)", "png", params: { explicit_file: true }),
  dispatch_case("the explicit file request with a registered format (html)", "html", params: { explicit_file: "1" }),
  dispatch_case("no explicit file, a registered format (html)", "html"),
  dispatch_case("no explicit file, an unregistered format (bin)", "bin")
]

# The sender: WHICH branch of respond answers. The file format is the PINNED
# MOD's own Card::Format::FileFormat (card-mod-format-0.20.0/lib/card/
# format/file_format.rb:5); the page format is the PINNED MOD's own html
# format class, allocated without a card because respond only asks it for
# its mime type.
file_format = Card::Format::FileFormat.allocate
page_format = Card::Format::REGISTRY_CLASSES["html"].allocate

def respond_case(label, format, result, status)
  harness = PinnedDeck::ControllerHarness.new
  error = nil
  begin
    harness.send(:respond, format, result, status)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  branch = if harness.sent_file
             "send_file"
           elsif harness.redirected
             "hard_redirect"
           elsif harness.rendered
             "render_response"
           elsif error
             "RAISED"
           else
             "NO_RESPONSE"
           end
  {
    "label" => label,
    "format" => format.class.name,
    "status" => status,
    "branch" => branch,
    "error" => error,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "sentFile" => harness.sent_file ? harness.sent_file.map(&:to_s) : nil
  }
end

respond_rows = [
  respond_case("the file format at 200 is the file sender", file_format, ["bytes", {}], 200),
  respond_case("the file format at 404 renders the page", file_format, ["bytes", {}], 404),
  respond_case("a page format at 200 renders the page", page_format, "PAGE", 200),
  respond_case("a page format at 302 hard-redirects", page_format, "/Somewhere", 302)
]

puts JSON.pretty_generate(
  "row" => "reg-routes-A2",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 + card-mod-carrierwave-0.20.0 (pinned)",
  "filesWebPath" => PinnedDeck.files_web_path,
  "registeredFormats" => registry["registered"],
  "filesRoutes" => files_routes,
  "routeTableSize" => routes.length,
  "dispatch" => dispatch_rows,
  "respond" => respond_rows
)
