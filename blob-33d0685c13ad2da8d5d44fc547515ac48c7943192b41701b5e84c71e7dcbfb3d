# oracle-capture-read-show-dispatch-ruby.rb - the PINNED DECK's own read
# action and the show ladder it is: card#read -> show (rest.rb:10-12,
# 91-97).
#
# WHY THIS SCRIPT EXISTS: the completeness register's B1 row grades the port
# on the CONTROLLER METHOD, not on a route line: `card#read` is `show` -
# `def read; show; end` - and everything a page read does lives in show's
# five-step ladder. Every route row in this family that ends in card#read
# (A1, A3, A5, A6, A7, A8, A9, A21, A22) funnels into THIS method, so the
# row is the family's read-dispatch keystone. Earlier rows measured pieces
# around it (A1 show(nil)'s query view; A9 render_page over a FormatDouble)
# and explicitly left show's own body unstood; this capture stands the pinned
# read action up END TO END over the rig's recording doubles, as far as the
# rig reaches, and names exactly where it stops.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:10-12
#                 def read
#                   show
#                 end
#               No body of its own: a read IS show(nil, 200).
#
#   the ladder  decko-0.20.0/lib/card_controller/rest.rb:91-97
#                 def show view=nil, status=200
#                   card.action = :read        # step 1
#                   load_format status          # step 2
#                   result = render_page @format, view   # step 3
#                   status = @format.error_status || status  # step 4
#                   respond @format, result, status          # step 5
#                 end
#
#   step 2      decko-0.20.0/lib/card_controller/response.rb:93-96
#                 def load_format status
#                   request.format = :html if implicit_html?
#                   @format = card.format(response_format).tap { |fmt| fmt.error_status = status }
#                 end
#               The response_format NAME it resolves (params[:format] vs the
#               request's format, explicit_file vs the registered formats) is
#               rows A2/D2's own evidence and is NOT graded here. The capture
#               records the name the pinned body handed the card's format ask
#               under the field formatNameRigDecision, because the rig's
#               format registry stores names as strings (the loading rig's
#               own Card.Format.register comment) and the symbol/string shape
#               of that decision in the rig is the rig's artifact, not the
#               graded fact.
#
#   step 3      rest.rb:99-104: view ||= view_from_params; the card's act
#               wraps format.page.
#
#   step 4      the format's OWN error status wins over the passed one. This
#               is the mechanism that lets a read REDIRECT or 404: the status
#               respond sees is the format's, not the method's default.
#
#   step 5      decko-0.20.0/lib/card_controller/response.rb:10-19
#                 def respond format, result, status
#                   Rails.logger.info Card::Cache.tallies if Cardio.config.cache_log_level
#                   if status.in? [302, 303]
#                     hard_redirect result
#                   elsif format.is_a?(Card::Format::FileFormat) && status == 200
#                     send_file(*result)
#                   else
#                     render_response result.to_s.html_safe, status, format.mime_type
#                   end
#                 end
#               THREE arms in priority order: a redirect status redirects
#               (even for a read), a file format at 200 sends the file,
#               everything else renders with the format's mime type.
#
# WHAT THE RIG REACHES, stated exactly: steps 1, 3, 4 and all three of step
# 5's arms execute here over the recording doubles. Step 2 executes with a
# minimal request double carrying only format=/format (the one surface the
# pinned body touches); its format-name decision is recorded but not graded
# (A2/D2's evidence). The unknown-card :not_found replacement
# (card-1.110.0/lib/card/format/error.rb:18-25) is reached through the
# loading rig's OWN FormatDouble stand-in, which is a transcription carried
# in the rig since tranche 3, not a pinned execution - it is recorded under
# viewForUnknownStandin and labelled as such. The real render machinery
# behind format.page stays the double's recording stand-in (row A9's
# evidence).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-read-show-dispatch-ruby.rb \
#     > fixtures/captured/read-show-dispatch-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
# respond's render_response sends `result.to_s.html_safe`; the pinned
# activesupport carries the String extension.
require "active_support/core_ext/string/output_safety"

# The PINNED DECK's own route table, EXECUTED: the read dispatch is what
# every card#read route funnels into, so the routes feeding it are quoted.
routes = PinnedDeck.route_table_executed
read_routes = routes.select { |route| route["action"] == "card#read" }

# The PINNED MOD's own format registry, loaded: the FileFormat arm below
# needs the pinned mod's own Card::Format::FileFormat class to exist.
registry = load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

read_actions = actions_for(before_actions, "read")

# A minimal request double: the ONE surface the pinned load_format and
# format_name_from_params touch (response.rb:93-113) - format= and format.
class ShowRequestDouble
  attr_accessor :format_value

  def initialize(format_value: "*/*")
    @format_value = format_value
  end

  def format
    format_value
  end

  def format=(value)
    @format_value = value
  end
end

# The pinned read action, EXECUTED END TO END: read -> show -> the ladder.
def read_dispatch_case(label, params: {})
  card = PinnedDeck::CardDouble.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(params: params, card: card, request: ShowRequestDouble.new)
  error = nil
  begin
    harness.read
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "error" => error,
    "cardCalls" => card.calls,
    "formatNameRigDecision" => card.format_name,
    "pageCalls" => card.page_calls,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "sentFile" => harness.sent_file
  }
end

read_rows = [
  read_dispatch_case("the plain page read: action=:read, the page renders at 200"),
  read_dispatch_case("the query view reaches the page: ?view=related renders view related",
                     params: { view: "related" }),
  read_dispatch_case("the params[:format] ride: the format ask carries it (the NAME decision is A2/D2's evidence)",
                     params: { format: "json" })
]

# Step 4 + step 5's redirect arm, executed directly: show(nil, 302) taps the
# format's error_status to 302, step 4 takes it as THE status, and respond
# hard-redirects - even for a read. The ladder order is the finding.
def show_status_case(label, status)
  card = PinnedDeck::CardDouble.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card, request: ShowRequestDouble.new)
  error = nil
  begin
    # show is private in the pinned module (rest.rb:29 `private` precedes
    # rest.rb:91), so the direct call goes through send - the pinned body
    # that runs is still the pinned body.
    harness.send(:show, nil, status)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "statusArg" => status,
    "error" => error,
    "cardCalls" => card.calls,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "sentFile" => harness.sent_file
  }
end

status_rows = [
  show_status_case("show(nil, 302): the format's error status IS the respond status, so a read hard-redirects", 302)
]

# The unknown-card replacement, through the loading rig's OWN FormatDouble
# stand-in (the rig's transcription of card-1.110.0/lib/card/format/
# error.rb:18-25, carried since tranche 3). RECORDED, NOT GRADED: this is
# the stand-in's answer, labelled as such on its face.
def view_for_unknown_standin_case(label, known:)
  card = PinnedDeck::CardDouble.new(name: "Front", known: known)
  format = PinnedDeck::FormatDouble.new(card, :html)
  answer = format.view_for_unknown(nil)
  {
    "label" => label,
    "known" => known,
    "answer" => answer,
    "cardRootErrorStatus" => card.root_error_status
  }
end

view_for_unknown_rows = [
  view_for_unknown_standin_case("the rig's own stand-in, a KNOWN card: the setting view passes through", known: true),
  view_for_unknown_standin_case("the rig's own stand-in, an UNKNOWN card: :not_found and the 404 root status", known: false)
]

# The FileFormat arm: a card whose format ask is answered by an instance of a
# subclass of the PINNED mod's own Card::Format::FileFormat reaches respond's
# second arm - a file format at 200 sends the file instead of rendering. The
# subclass carries only the page answer the double must give; the is_a? check
# respond makes is against the PINNED class.
class ShowFileFormatCardDouble < PinnedDeck::CardDouble
  def format(name)
    record(:format)
    @format_name = name
    @file_format ||= Class.new(Card::Format::FileFormat) do
      attr_accessor :error_status

      def page(_controller, _view, _slot_opts)
        "FILE-PAGE"
      end

      def mime_type
        "text/html"
      end
    end.new
  end
end

file_format_card = ShowFileFormatCardDouble.new(name: "Front")
file_harness = PinnedDeck::ControllerHarness.new(params: {}, card: file_format_card, request: ShowRequestDouble.new)
file_error = nil
begin
  file_harness.read
rescue StandardError => e
  file_error = "#{e.class}: #{e.message}"
end
file_format_row = {
  "label" => "a FileFormat read at 200: respond sends the file instead of rendering",
  "error" => file_error,
  "cardCalls" => file_format_card.calls,
  "rendered" => file_harness.rendered,
  "redirected" => file_harness.redirected,
  "sentFile" => file_harness.sent_file
}

# The pinned sources, quoted with line numbers.
read_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                        .select { |row| row["line"].between?(10, 12) }
show_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                        .select { |row| row["line"].between?(91, 104) }
respond_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                           .select { |row| row["line"].between?(10, 19) }
load_format_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                               .select { |row| row["line"].between?(93, 113) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B1",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "readRoutes" => read_routes,
  "beforeActionsForRead" => read_actions,
  "registeredFormats" => registry["registered"],
  "readDispatch" => read_rows,
  "showStatusOverride" => status_rows,
  "viewForUnknownStandin" => view_for_unknown_rows,
  "fileFormatArm" => file_format_row,
  "sources" => {
    "read" => read_source,
    "show" => show_source,
    "respond" => respond_source,
    "loadFormat" => load_format_source,
    "beforeActions" => before_action_source
  }
)