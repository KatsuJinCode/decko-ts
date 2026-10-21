# oracle-capture-explicit-create-route-ruby.rb - the PINNED DECK's own
# "super-explicit" (card)/create route, and the fetch and save its POST|PATCH
# rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A18 row grades the port
# on engine_routes.rb line 46, `match "(card)/create(/:mark(.:format))" =>
# "card#create", via: %i[post patch]`. The row's whole decision is the VERB
# SET: it is the one write arm in the table whose `via` omits :put, so the
# arm's own line and the WHOLE rest of the table have to be measured before
# a port can be told right from wrong here.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:46
#                 match "(card)/create(/:mark(.:format))" => "card#create",
#                 via: %i[post patch]
#               Order 24. BOTH segments are optional: the `(card)` group is
#               a Rails optional group, so "create" alone is the arm; and
#               `(/:mark(.:format))` is optional too, so "/card/create" is
#               the arm with no mark. Order 24 is AFTER the marked create
#               (16) and the marked update (17), so a one-segment "/create"
#               is the L16 marked create of the card literally named
#               "create", never this arm.
#
#   the verb    decko-0.20.0 -> actionpack-7.2.4, the chain `via:` reaches:
#                 routing/mapper.rb:1953  via = Mapping.check_via Array(...)
#                 routing/mapper.rb:207-209 def request_method
#                                          @via.map { |x| Journey::Route.verb_matcher(x) }
#                 routing/mapper.rb:186    request_method_match: request_method
#                 journey/route.rb:183-185 def match_verb(request)
#                                          @request_method_match.any? { |m| m.call request }
#                 journey/route.rb:170-172 def requires_matching_verb?
#                                          (a route whose matchers are not
#                                          all VerbMatchers::All REQUIRES a
#                                          verb match)
#                 journey/route.rb:14-24  the VERBS template: one matcher
#                                          class per verb, `req.<verb>?`
#               So the arm answers POST and PATCH. A PUT to a path this arm
#               owns fails THIS arm's verb test.
#
#   the rest    WHICH is only half the answer: the PUT has to fall to some
#               OTHER route or to none. This capture therefore prints, for
#               each probe path, EVERY route in the executed pinned table
#               whose recorded pattern can span that path's segment count,
#               together with that route's own recorded `via` set. The
#               candidate reduction is mechanical and printed, so a reader
#               can audit it: it is a segment-count span computed from the
#               pattern string the pinned table itself registered, with
#               `:dynamic` and `*glob` and `(group)` spelled out below.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 128-133
#                 params[:action] == "create" -> Card.new card_opts; the
#                 URL mark names the card through uri_fetch_opts'
#                 `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:6-8
#                 def create; handle { card.save! }; end
#               (The A14 row's measured action; quoted, not re-executed.)
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-explicit-create-route-ruby.rb \
#     > fixtures/captured/explicit-create-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own route table, EXECUTED.
#
# files_web_path is primed FIRST, and the order matters: the routes file
# interpolates `#{files}` into the two file routes (lines 10 and 13), and the
# value comes from the PINNED carrierwave mod
# (card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb:2,
# `config.files_web_path = "files"`). The real deck loads that mod at boot,
# before the routes are drawn. Drawn without it, those two routes register as
# "/:mark/:rev_id(.:size).:format" - two DYNAMIC segments that would match
# every two-segment path in this row's candidate reduction, which is exactly
# the pollution this row cannot afford. Priming makes the recorded table the
# deck's real one.
files_web_path = PinnedDeck.files_web_path
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
explicit_create_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#create" &&
    route["patterns"].any? { |pattern| pattern.include?("create") && pattern.include?("card") }
end
raise "the (card)/create route was not found in the pinned route table" if explicit_create_index.nil?

explicit_create = routes[explicit_create_index]
explicit_create_via = Array(raw_requirements[explicit_create_index][:via]).map(&:to_s)

# The arms whose precedence this row rests on: the marked create (16) and
# the marked update (17), both one-segment arms.
marked_create = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#create" && route["patterns"].include?(":mark(.:format)")
end
marked_update = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#update" && route["patterns"].include?(":mark(.:format)")
end

# ---------------------------------------------------------------------------
# the candidate reduction: which recorded routes can match an exact path?
# ---------------------------------------------------------------------------
#
# A Rails path pattern is a list of segments separated by "/", with four
# shapes this table uses:
#
#   literal text        e.g. "create", "update", "card", "files"
#   :name               a dynamic segment - matches any ONE path segment
#   *glob               a glob - matches one OR MORE remaining segments
#   (group)             an OPTIONAL group. `(card)` is an optional SEGMENT;
#                       `(/:mark(.:format))` begins with its own separator,
#                       so it is an optional CHUNK of the segments inside.
#
# The in-segment optional captures `(.:format)` and `(-:size)` never change a
# path's shape, so they are removed before parsing.
#
# Every pattern's expansion is printed into the fixture under
# patternExpansions, so a reader can audit the reduction instead of taking
# it on trust.

DYNAMIC = ":*".freeze

def tokenize(text)
  tokens = []
  literal = +""
  index = 0
  while index < text.length
    char = text[index]
    if char == "("
      close = text.index(")", index)
      raise "unbalanced group in pinned pattern #{text.inspect}" if close.nil?

      unless literal.empty?
        tokens << [:lit, literal.dup]
        literal = +""
      end
      tokens << [:grp, text[(index + 1)...close]]
      index = close + 1
    elsif char == "/"
      unless literal.empty?
        tokens << [:lit, literal.dup]
        literal = +""
      end
      tokens << [:sep]
      index += 1
    elsif char == "*"
      unless literal.empty?
        tokens << [:lit, literal.dup]
        literal = +""
      end
      tokens << [:glob]
      index += 1
    elsif char == ":"
      unless literal.empty?
        tokens << [:lit, literal.dup]
        literal = +""
      end
      # ":name" is ONE dynamic segment, however long the name is: step past
      # the ":", consume the name, and emit the marker alone, so a later
      # literal in the same segment (the file routes' `.:format`) is not
      # swallowed by it.
      index += 1
      index += 1 while index < text.length && text[index].match?(/[[:alnum:]_]/)
      tokens << [:lit, DYNAMIC]
    else
      literal << char
      index += 1
    end
  end
  tokens << [:lit, literal.dup] unless literal.empty?
  tokens
end

# Expand a token list into every segment-list it can match. Each segment is
# a list of parts; a part is either a literal String or the DYNAMIC marker.
# `at_start` is true only at the very beginning of the WHOLE pattern, where a
# separator opens the first segment instead of closing one - inside a group a
# leading separator always closes what came before (that is what makes
# "(/:mark)" a chunk rather than a stray separator).
def expand(tokens, current, done, at_start)
  if tokens.empty?
    return [] if current.empty? && done.empty? # a bare "/" matched no segment

    return [done + [current]]
  end

  token = tokens[0]
  rest = tokens[1..] || []
  case token[0]
  when :sep
    return [done + [current]] if at_start

    expand(rest, [], done + [current], false)
  when :lit
    expand(rest, current + [token[1]], done, false)
  when :glob
    [[["glob"]]]
  when :grp
    # Present: the group's content is spliced in FRONT of the rest, because
    # the group's inner tokens have to keep parsing into the pattern that
    # follows it ("(card)/create" -> ["card"], sep, "create").
    present = expand(tokenize(token[1]) + rest, current, done, false)
    # Skipping the group drops the segment it stood for, and with it the
    # separator that followed the group (so "(card)/create" skips to
    # ["create"], not to ["", "create"]).
    skip_rest = rest.first&.first == :sep ? rest[1..] || [] : rest
    skipped = expand(skip_rest, current, done, at_start)
    (present + skipped).uniq
  else
    raise "unknown pattern token #{token.inspect}"
  end
end

def pattern_expansion(pattern)
  return [["glob"]] if pattern.include?("*")

  clean = pattern.gsub("(.:format)", "").gsub("(-:size)", "")
  clean = clean[1..] if clean.start_with?("/")
  expand(tokenize(clean), [], [], true).uniq
end

# Whether a path is a candidate for a route's expansion.
#
# The test is deliberately LOOSE in the permissive direction: a segment whose
# parts include the dynamic marker matches ANY segment, so an expansion can
# only ever admit MORE candidates than Rails would. That direction is the
# safe one for this row's conclusion, which is a claim of the form "no route
# in the pinned table admits this verb for this path": a superset that still
# contains no such route proves the claim more strongly, not more weakly.
def matches_path?(expansion, segments)
  return true if expansion == [["glob"]]

  # "/" expands to no alternative at all, which is the ROOT: it matches the
  # path with zero segments.
  return segments.empty? if expansion.empty?

  expansion.any? do |expansion_segments|
    next false unless expansion_segments.length == segments.length

    expansion_segments.each_with_index.all? do |parts, position|
      actual = segments[position]
      parts.any? { |part| part == DYNAMIC || part == actual }
    end
  end
end

# The expansion of every route the pinned table registered, printed whole.
pattern_expansions = routes.flat_map do |route|
  route["patterns"].map { |pattern| { "pattern" => pattern, "matches" => pattern_expansion(pattern) } }
end.uniq

def candidates_for(routes, raw_requirements, pathname)
  segments = pathname.split("/").reject(&:empty?)
  routes.each_with_index.filter_map do |route, index|
    next if route["patterns"].empty?
    next unless route["patterns"].any? { |pattern| matches_path?(pattern_expansion(pattern), segments) }

    via = Array(raw_requirements[index][:via]).map(&:to_s)
    {
      "order" => route["order"],
      "verb" => route["verb"],
      "patterns" => route["patterns"],
      "via" => via,
      # The verb set a request to this path would have to satisfy: the
      # recorded `via` when the DSL named one, else the DSL verb itself
      # (get/post/put/patch/delete/root are their own verb).
      "admitsVerbs" => via.empty? ? [route["verb"]] : via,
      "action" => route["action"]
    }
  end
end

PROBE_PATHS = [
  "/create/Foo", "/card/create/Foo", "/create", "/card/create"
]

verb_candidates = PROBE_PATHS.map do |pathname|
  candidates = candidates_for(routes, raw_requirements, pathname)
  {
    "path" => pathname,
    "segments" => pathname.split("/").reject(&:empty?),
    "candidates" => candidates,
    "firstRouteAdmittingPut" => candidates.find { |entry| entry["admitsVerbs"].include?("put") }&.fetch("order"),
    "firstRouteAdmittingDelete" => candidates.find { |entry| entry["admitsVerbs"].include?("delete") }&.fetch("order"),
    "firstRouteAdmittingPost" => candidates.find { |entry| entry["admitsVerbs"].include?("post") }&.fetch("order"),
    "firstRouteAdmittingPatch" => candidates.find { |entry| entry["admitsVerbs"].include?("patch") }&.fetch("order")
  }
end

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

create_actions = actions_for(before_actions, "create")

# The PINNED DECK's own fetch, executed over recording doubles.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class << Card
  attr_reader :new_asks

  def new(card_opts = {})
    (@new_asks ||= []) << card_opts
    :new_card_recorded
  end
end

def explicit_create_fetch_case(label, params)
  Card.instance_variable_set(:@new_asks, nil)
  harness = Object.new
  harness.extend(Card::Fetch::CardClass)
  error = nil
  answer = nil
  begin
    answer = harness.uri_fetch(params)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "newAsks" => (Card.instance_variable_get(:@new_asks) || []),
    "answer" => answer,
    "error" => error
  }
end

fetch_rows = [
  explicit_create_fetch_case("the URL mark names the new card",
                             { action: "create", mark: "Target" }),
  explicit_create_fetch_case("the (card)/create arm with NO mark: Name[nil] is the EMPTY name",
                             { action: "create" })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(45, 48) }
create_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(6, 8) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(74, 77) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
uri_fetch_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(128, 133) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb set is carried
# by the source that enforces it.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(170, 172) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A18",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "filesWebPath" => files_web_path,
  "explicitCreateRoute" => explicit_create,
  "explicitCreateVia" => explicit_create_via,
  "precedence" => {
    "markedCreateBefore" => marked_create,
    "markedUpdateBefore" => marked_update
  },
  "beforeActionsForCreate" => create_actions,
  "patternExpansions" => pattern_expansions,
  "verbCandidates" => verb_candidates,
  "uriFetch" => fetch_rows,
  "sources" => {
    "route" => route_source,
    "create" => create_source,
    "handle" => handle_source,
    "uriFetch" => uri_fetch_source,
    "uriFetchOpts" => uri_fetch_opts_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)