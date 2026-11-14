# oracle-capture-wildcard-bad-address-ruby.rb - the PINNED DECK's own wildcard
# route, and the pinned view machinery that answers it.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A22 row grades the
# port on `get *mark => "card#read", view: "bad_address"`, the deck's
# LAST route and the class that answers every address the table's earlier
# arms did not. The row's note named the route but never asked the pinned
# deck what the wildcard's view does, and the answer is three different
# things depending on the card: a known card renders the registered
# bad_address view at 404, an unknown card's view is REPLACED, and the
# deck's own BadAddress error class carries the same status and view.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route  decko-0.20.0/config/engine_routes.rb:53-54
#                # Wildcard for bad addresses
#                get "*mark" => "card#read", view: "bad_address"
#              It is the deck's LAST route (29 of 29), so it answers every
#              address the earlier arms did not.
#
#   the view   card-mod-format-0.20.0/set/all/error.rb:23-26
#                view :bad_address, perms: :none do
#                  root.error_status = 404
#                  t(:format_bad_address)
#                end
#
#   the unknown card's replacement
#              card-1.110.0/lib/card/format/error.rb:18-25
#                def view_for_unknown setting_view
#                  if main? && voo.root?
#                    root.error_status = page_status_for_unknown
#                    page_view_for_unknown
#                  else
#                    setting_view || :unknown
#                  end
#                end
#              with page_status_for_unknown = 404 and
#              page_view_for_unknown = :not_found (error.rb:49-55), and the
#              caller that decides (card-1.110.0/lib/card/view/permission.rb:
#              36-44 alter_unknown, which returns early for a KNOWN card).
#
#   the error class
#              card-1.110.0/lib/card/error.rb:81-85
#                class BadAddress < UserError
#                  self.status_code = 404
#                  self.view = :bad_address
#                end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-wildcard-bad-address-ruby.rb \
#     > fixtures/captured/wildcard-bad-address-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
wildcard_route = routes.find { |route| route["patterns"].include?("*mark") }
before_wildcard = routes.select { |route| [27, 28].include?(route["order"]) }

# The PINNED MOD's own bad_address view. The set DSL that registers it needs
# the whole card gem, so the capture reads the view's own body out of the
# pinned file and says so - it does not stand the view up.
bad_address_view_source = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/error.rb")
                                        .select { |row| row["line"].between?(23, 26) }

# The PINNED deck's own BadAddress error class: the same read, for the same
# reason (the class body needs the deck's error stack).
bad_address_error_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                                       .select { |row| row["line"].between?(81, 85) }

# The PINNED card gem's own unknown-card view replacement, EXECUTED.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/error.rb")

class RootDouble
  attr_accessor :error_status

  def initialize
    @error_status = nil
  end
end

class ViewOptionsDouble
  def root?
    true
  end
end

class UnknownViewHarness
  include Card::Format::Error

  attr_reader :root

  def initialize
    @root = RootDouble.new
  end

  def main?
    true
  end

  def voo
    @voo ||= ViewOptionsDouble.new
  end
end

def unknown_view_case(label, known)
  harness = UnknownViewHarness.new
  view = nil
  error = nil
  begin
    # The caller (card-1.110.0/lib/card/view/permission.rb:36-44) returns
    # early for a KNOWN card, so only the unknown case reaches the
    # replacement. The harness stands in for that gate.
    view = if known
             :bad_address
           else
             harness.view_for_unknown(:bad_address)
           end
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "error" => error,
    "view" => view.nil? ? nil : view.to_s,
    "rootErrorStatus" => harness.root.error_status
  }
end

view_rows = [
  unknown_view_case("a KNOWN card keeps the bad_address view", true),
  unknown_view_case("an UNKNOWN card's view is replaced", false)
]

puts JSON.pretty_generate(
  "row" => "reg-routes-A22",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "wildcardRoute" => wildcard_route,
  "routesBeforeWildcard" => before_wildcard,
  "routeTableSize" => routes.length,
  "badAddressViewSource" => bad_address_view_source,
  "badAddressErrorSource" => bad_address_error_source,
  "unknownCardViews" => view_rows
)
