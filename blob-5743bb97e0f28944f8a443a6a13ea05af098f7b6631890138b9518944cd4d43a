# pinned-route-table-candidate-reduction-ruby.rb - the shared candidate
# reduction for the [Family] rows whose decision is a VERB SET.
#
# WHAT THIS IS. A route's `via:` list is only half an answer. The other half
# is what a request with a DIFFERENT verb does: it either falls through to
# some other route in the same table, or it matches nothing at all. For the
# rows that turn on a verb set - the (card)/create, (card)/update and
# (card)/delete arms - "matches nothing" is the finding, and it cannot be
# read off the route's own line. It has to be read off the WHOLE table.
#
# So this file reduces the executed pinned table to an answer per probe
# path: which routes can match this path at all, and which verbs does each
# admit. Two properties make the reduction trustworthy:
#
#   1. AUDITABLE. Every pattern's expansion is returned alongside the result,
#      so a reader can check the tokenizer's work instead of taking it on
#      trust. A Rails path pattern here is a list of "/"-separated segments
#      built from literals, ":name" dynamic segments, "*glob" globs and
#      "(group)" OPTIONAL groups - `(card)` is an optional segment and
#      `(/:mark(.:format))` is an optional chunk introduced by its own
#      separator. In-segment optional captures `(.:format)` and `(-:size)`
#      never change a path's shape, so they are stripped before parsing.
#
#   2. LOOSE IN THE PERMISSIVE DIRECTION. A segment holding the dynamic
#      marker matches ANY segment, so the candidate set can only ever be a
#      SUPERSET of what Rails would accept. That is the safe direction for
#      the claims these rows make ("no route in the pinned table admits PUT
#      for this path"): a superset that still contains no such route proves
#      the claim more strongly, not more weakly.
#
# It also reports, per probe path, the FIRST route (lowest order, which is
# the matching precedence) that admits each verb - or nil when none does.
# nil is the finding, not an omission.
#
# This is a SUPPORT file for the capture scripts beside it, not the loading
# rig: the loading rig is oracle-capture-pinned-deck-harness-ruby.rb, and it
# is deliberately untouched. This file holds only the reduction above, which
# the (card)/ verb rows share so the tokenizer is defined once.

# The dynamic-segment marker. A ":name" in a pattern tokenizes to this alone,
# so a later literal in the same segment (the file routes' `.:format`) is not
# swallowed by the name.
DYNAMIC_SEGMENT = ":*".freeze

# Tokenize a cleaned path pattern into :sep / :lit / :glob / :grp tokens.
def tokenize_route_pattern(text)
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
      # ":name" is ONE dynamic segment however long the name is: step past
      # the ":", consume the name, emit the marker alone.
      index += 1
      index += 1 while index < text.length && text[index].match?(/[[:alnum:]_]/)
      tokens << [:lit, DYNAMIC_SEGMENT]
    else
      literal << char
      index += 1
    end
  end
  tokens << [:lit, literal.dup] unless literal.empty?
  tokens
end

# Expand a token list into every segment-list the pattern can match. Each
# segment is a list of parts; a part is a literal String or the DYNAMIC
# marker. `at_start` is true only at the very beginning of the WHOLE
# pattern, where a separator opens the first segment instead of closing one
# - inside a group a leading separator always closes what came before, which
# is what makes "(/:mark)" a chunk rather than a stray separator.
def expand_route_pattern(tokens, current, done, at_start)
  if tokens.empty?
    return [] if current.empty? && done.empty? # a bare "/" carries no segment

    return [done + [current]]
  end

  token = tokens[0]
  rest = tokens[1..] || []
  case token[0]
  when :sep
    return [done + [current]] if at_start

    expand_route_pattern(rest, [], done + [current], false)
  when :lit
    expand_route_pattern(rest, current + [token[1]], done, false)
  when :glob
    [[["glob"]]]
  when :grp
    # Present: the group's content is spliced in FRONT of the rest, because
    # the group's inner tokens have to keep parsing into what follows it
    # ("(card)/create" -> ["card"], sep, "create").
    present = expand_route_pattern(tokenize_route_pattern(token[1]) + rest, current, done, false)
    # Skipping the group drops the segment it stood for, and with it the
    # separator that followed the group (so "(card)/create" skips to
    # ["create"], not to ["", "create"]).
    skip_rest = rest.first&.first == :sep ? rest[1..] || [] : rest
    skipped = expand_route_pattern(skip_rest, current, done, at_start)
    (present + skipped).uniq
  else
    raise "unknown pattern token #{token.inspect}"
  end
end

# Every segment-list a registered pattern can match.
def route_pattern_expansion(pattern)
  return [["glob"]] if pattern.include?("*")

  clean = pattern.gsub("(.:format)", "").gsub("(-:size)", "")
  clean = clean[1..] if clean.start_with?("/")
  expand_route_pattern(tokenize_route_pattern(clean), [], [], true).uniq
end

# Loosely: true when the expansion can account for these path segments.
def route_pattern_matches?(expansion, segments)
  return true if expansion == [["glob"]]

  # "/" expands to no alternative at all, which is the ROOT: zero segments.
  return segments.empty? if expansion.empty?

  expansion.any? do |expansion_segments|
    next false unless expansion_segments.length == segments.length

    expansion_segments.each_with_index.all? do |parts, position|
      actual = segments[position]
      parts.any? { |part| part == DYNAMIC_SEGMENT || part == actual }
    end
  end
end

# The expansion of every pattern the executed pinned table registered,
# printed whole so a reader can audit the reduction.
def route_pattern_expansions(routes)
  routes.flat_map do |route|
    route["patterns"].map { |pattern| { "pattern" => pattern, "matches" => route_pattern_expansion(pattern) } }
  end.uniq
end

# Every route in the executed table that can match this pathname, with the
# verbs it admits. A route's admitted verbs are its recorded `via` set when
# the DSL named one, else the DSL verb itself - get/post/put/patch/delete/
# root are each their own verb.
def route_candidates_for(routes, raw_requirements, pathname)
  segments = pathname.split("/").reject(&:empty?)
  routes.each_with_index.filter_map do |route, index|
    next if route["patterns"].empty?
    next unless route["patterns"].any? { |pattern| route_pattern_matches?(route_pattern_expansion(pattern), segments) }

    via = Array(raw_requirements[index][:via]).map(&:to_s)
    {
      "order" => route["order"],
      "verb" => route["verb"],
      "patterns" => route["patterns"],
      "via" => via,
      "admitsVerbs" => via.empty? ? [route["verb"]] : via,
      "action" => route["action"]
    }
  end
end

# The per-verb answer for one pathname: the candidate list plus the FIRST
# route (lowest order = the matching precedence) admitting each verb, or nil
# when the pinned table routes that verb nowhere.
PROBED_VERBS = %w[get post put patch delete].freeze

def route_candidate_reduction(routes, raw_requirements, pathname)
  candidates = route_candidates_for(routes, raw_requirements, pathname)
  answer = {
    "path" => pathname,
    "segments" => pathname.split("/").reject(&:empty?),
    "candidates" => candidates
  }
  PROBED_VERBS.each do |verb|
    answer["firstRouteAdmitting#{verb.capitalize}"] =
      candidates.find { |entry| entry["admitsVerbs"].include?(verb) }&.fetch("order")
  end
  answer
end