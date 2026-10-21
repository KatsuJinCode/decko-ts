# oracle-capture-deprecated-file-route-ruby.rb - the PINNED DECK's own
# DEPRECATED old-file route, and the requirements that shape its segments.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A3 row grades the port
# on engine_routes.rb line 13,
# `get "#{files}/:mark(-:size)-:rev_id.:format"`, the DEPRECATED old file
# and asset request shape. The route's own requirements decide how a
# request's one segment splits: the mark may not contain a dash
# (mark: /[^-]+/), the rev_id may not either (rev_id: /[^-]+/), and the size
# is unconstrained - so a legacy URL's segment splits at the FIRST dash
# after the mark and at the LAST dash before the format. This capture
# measures the registration and asks the pinned requirements themselves,
# so the row's verdict rests on the pinned route, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:10-13
#                 get({ "#{files}/:mark/:rev_id(-:size).:format" => "card#read" }.merge(file_matchers))
#                 get({ "#{files}/:mark(-:size)-:rev_id.:format" => "card#read" }.merge(file_matchers))
#                 file_matchers = { mark: /[^-]+/, explicit_file: true, rev_id: /[^-]+/ }
#               The two shapes differ in SEGMENT ORDER: the current route
#               puts the rev_id in its own segment with the size after it;
#               the deprecated route packs mark(-size)-rev_id into ONE
#               segment. The deprecated registration sits at order 2,
#               BEFORE the standard page read (order 6), so a /files/...
#               path is a file request, never the card "files".
#
#   the web path decko-0.20.0's files_web_path is the PINNED carrierwave
#               mod's own value (card-mod-carrierwave-0.20.0/lib/card/mod/
#               carrierwave.rb:2, `config.files_web_path = "files"`), read
#               by the rig from the mod's own file.
#
#   the dispatch  the read's format dispatch is SHARED with the current
#               route: params[:explicit_file] sends the read to the file
#               format regardless of the requested format's registration.
#               That evidence is row A2's
#               (fixtures/captured/explicit-file-route-ruby-oracle.json,
#               "dispatch" rows), and the port serves both shapes through
#               the same handler (src/server/file-routes.ts
#               parseFileRouteSegments + handleFileGet); the serving
#               parity - the deprecated shape answering the same stored
#               bytes - is pinned by tests/server/file-routes.test.ts
#               ("deprecated legacy route"). This capture does not repeat
#               either.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-deprecated-file-route-ruby.rb \
#     > fixtures/captured/deprecated-file-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED DECK's own route table, EXECUTED, with the requirements as the
# PINNED values (a Regexp stays a Regexp).
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements

deprecated_index = routes.index { |route| route["patterns"].include?("/:mark(-:size)-:rev_id.:format") }
raise "the deprecated file route was not found in the pinned route table" if deprecated_index.nil?

current_index = routes.index { |route| route["patterns"].include?("/:mark/:rev_id(-:size).:format") }
raise "the current file route was not found in the pinned route table" if current_index.nil?

deprecated_route = routes[deprecated_index]
current_route = routes[current_index]
read_route = routes.find { |route| route["patterns"].include?("/:mark(.:format)") }

# The files web path, from the PINNED carrierwave mod's own file.
files_web_path = PinnedDeck.files_web_path

# What the pinned requirements ADMIT, asked of the pinned Regexp objects
# themselves: the mark and rev_id constraints are what force a legacy
# segment's split at the first dash after the mark and the last dash before
# the format. Rails ANCHORS each segment requirement (Journey compiles
# every segment as ^<requirement>$), and the pinned Regexp objects are
# stored UNANCHORED - so the probe asks the anchored form, and records both
# the stored source and the anchored answer.
def requirement_admits(requirements, key, segments)
  value = requirements[key]
  raise "the #{key} requirement is not a Regexp: #{value.class}" unless value.is_a?(Regexp)

  anchored = Regexp.new("\\A(?:#{value.source})\\Z")
  segments.map do |segment|
    { "segment" => segment, "matches" => anchored.match?(segment) }
  end
end

deprecated_requirements = raw_requirements[deprecated_index]
mark_matches = requirement_admits(deprecated_requirements, :mark, ["card", "my-card"])
rev_matches = requirement_admits(deprecated_requirements, :rev_id, ["99", "9-9"])

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(3, 16) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A3",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "filesWebPath" => files_web_path,
  "deprecatedRoute" => deprecated_route,
  "currentRoute" => current_route,
  "standardPageRoute" => read_route,
  "routeTableSize" => routes.length,
  "requirements" => {
    "mark" => { "source" => deprecated_requirements[:mark].source, "matches" => mark_matches },
    "revId" => { "source" => deprecated_requirements[:rev_id].source, "matches" => rev_matches },
    "explicitFile" => deprecated_requirements[:explicit_file]
  },
  "sources" => {
    "route" => route_source
  }
)
