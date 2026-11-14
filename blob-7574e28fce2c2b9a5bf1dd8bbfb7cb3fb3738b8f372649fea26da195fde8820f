# pinned-port-only-route-absence-ruby.rb - the shared measurement for the
# rows whose surface the PINNED deck does not have.
#
# WHAT THIS IS. Some rows in this family ([Family]) grade a surface the
# port serves and the pinned deck does NOT: the register's own words are
# "port-only route (no Ruby counterpart)", and its basis for grading
# them PORTED is that "the register names the host(s) and the file:line in
# the port that serves it, so there is no Ruby behaviour it could fail to
# match".
#
# That basis is a CLAIM about the pinned side, and a claim about the
# pinned side can be MEASURED. This file measures it:
#
#   1. THE PINNED DECK'S OWN ROUTE TABLE, EXECUTED, reduced for the row's
#      probe paths. The reduction is the shared one
#      (pinned-route-table-candidate-reduction-ruby.rb): for each path,
#      which pinned routes can match it at all, and which verb the FIRST
#      of them admits. The answer is the pinned deck's OWN answer for
#      that path, and for a port-only path it is either nothing at all
#      (no route matches) or a CARD READ (a route matches, but it
#      dispatches to card#read, which renders a card, not the port's
#      status/signin/record surface).
#
#   2. THE PORT'S OWN SERVING SOURCE, quoted with line numbers, so the
#      other half of the register's basis is checkable by a reader
#      instead of taken on trust.
#
# The reduction is LOOSE in the permissive direction (a dynamic segment
# matches ANY segment), so the candidate set can only ever be a SUPERSET
# of what the pinned table accepts. That is the safe direction for the
# claim this file makes: a candidate set that is EMPTY proves the pinned
# table routes the path nowhere, and a candidate set that holds only card
# reads proves the pinned table answers that path with a card read.
#
# This is a SUPPORT file for the capture script beside it, not the loading
# rig: the loading rig is oracle-capture-pinned-deck-harness-ruby.rb, and
# it is deliberately untouched.

require "json"

require_relative "oracle-capture-pinned-deck-harness-ruby"
require_relative "pinned-route-table-candidate-reduction-ruby"

module PinnedPortOnlyRouteAbsence
  # The port's own tree, for the port's own source quotes.
  REPO_ROOT = File.expand_path("../..", __dir__).freeze

  module_function

  # The PINNED deck's own route table, EXECUTED, and the shared reduction
  # for one probe path.
  def reduction_for(pathname)
    routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
    answer = route_candidate_reduction(routes, raw_requirements, pathname)
    {
      "path" => pathname,
      "segments" => answer["segments"],
      "candidates" => answer["candidates"],
      "firstRouteAdmittingGet" => answer["firstRouteAdmittingGet"],
      "firstRouteAdmittingPost" => answer["firstRouteAdmittingPost"],
      "firstRouteAdmittingPut" => answer["firstRouteAdmittingPut"],
      "firstRouteAdmittingPatch" => answer["firstRouteAdmittingPatch"],
      "firstRouteAdmittingDelete" => answer["firstRouteAdmittingDelete"],
      # The total size of the pinned table the reduction ran over, so a
      # reader can see what the answer was reduced FROM.
      "pinnedRouteCount" => routes.length
    }
  end

  # The PORT's own source, quoted with line numbers. The port is the
  # subject of these rows, so its own serving surface is quoted the way
  # the pinned files are quoted elsewhere in this family: with the line
  # numbers, so a reader can check the claim.
  def repo_lines(relative, from, to)
    path = File.join(REPO_ROOT, relative)
    raise "the port's own file #{relative} is not at #{path}" unless File.exist?(path)

    File.readlines(path, chomp: true).each_with_index.filter_map do |line, index|
      number = index + 1
      next if number < from || number > to

      { "line" => number, "text" => line }
    end
  end
end
