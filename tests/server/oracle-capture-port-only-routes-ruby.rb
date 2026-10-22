# oracle-capture-port-only-routes-ruby.rb - the PINNED deck's own answer for
# the five port-only paths, and the PORT's own serving source for each.
#
# WHY THIS SCRIPT EXISTS: the register's E rows ([Family]) grade five
# surfaces the port serves and the pinned deck does NOT have:
#
#   E1  GET /_status
#   E2  GET /api/status; GET /api/card/<name> (read-gated JSON)
#   E3  GET /<name> record-JSON (masked content)
#   E4  GET|POST /_signout (ungated, origin-checked)
#   E5  POST /_signin, POST /_signout (staging surfaces); GET /_signin form
#
# The register's own basis for grading them PORTED is that "the register
# names the host(s) and the file:line in the port that serves it, so there
# is no Ruby behaviour it could fail to match". That is a CLAIM about the
# pinned side, and this script MEASURES it: the PINNED deck's own route
# table is EXECUTED and reduced for each path.
#
# WHAT THE ANSWERS ARE, and why each one is a different claim:
#
#   - A path the pinned table routes NOWHERE proves there is no Ruby
#     behaviour to match, and the port's surface there is entirely its
#     own.
#   - A path the pinned table routes to a CARD READ proves something
#     narrower and just as useful: the pinned deck answers that path with
#     a card render, not with the port's status, signin or record
#     surface. The port's surface at such a path is a PORT-ONLY
#     SEMANTIC, not a port-only path.
#
# The reduction is the shared one (pinned-route-table-candidate-reduction-ruby.rb)
# and it is LOOSE in the permissive direction, so the candidate set is a
# SUPERSET of what the pinned table accepts: an empty set proves the
# claim more strongly, not more weakly.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-port-only-routes-ruby.rb \
#     > fixtures/captured/port-only-routes-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The path list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "pinned-port-only-route-absence-ruby"

# ---------------------------------------------------------------------------
# the PINNED deck's own route table, EXECUTED once, and the reduction for
# each row's probe paths
# ---------------------------------------------------------------------------
ROWS = {
  "E1" => {
    "label" => "GET /_status",
    "paths" => ["/_status"]
  },
  "E2" => {
    "label" => "GET /api/status; GET /api/card/<name> (read-gated JSON)",
    "paths" => ["/api/status", "/api/card/Alpha"]
  },
  "E3" => {
    "label" => "GET /<name> record-JSON (masked content)",
    "paths" => ["/Alpha.json"]
  },
  "E4" => {
    "label" => "GET|POST /_signout (ungated, origin-checked)",
    "paths" => ["/_signout"]
  },
  "E5" => {
    "label" => "POST /_signin, POST /_signout (staging surfaces); GET /_signin form",
    "paths" => ["/_signin", "/_signout"]
  }
}.freeze

reductions = ROWS.transform_values do |row|
  row["paths"].map { |pathname| PinnedPortOnlyRouteAbsence.reduction_for(pathname) }
end

# ---------------------------------------------------------------------------
# the PINNED deck's own route table, quoted, so a reader can see what the
# reduction ran over
# ---------------------------------------------------------------------------
pinned_table = PinnedDeck.route_table

# ---------------------------------------------------------------------------
# the PORT's own serving source, quoted with line numbers
# ---------------------------------------------------------------------------
#
# These are the port's own files, at THIS branch's line numbers. The
# register's own citations are from the register build, and the port has
# moved since; what matters is that a reader can check the surface.
port_surface = {
  "E1" => [
    {
      "host" => "the minimal reader",
      "file" => "deploy/bunny-worker-src/bunny-worker.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-worker.ts", 271, 276
      )
    },
    {
      "host" => "the edge engine",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 301, 306
      )
    },
    {
      "host" => "the staging server",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4379, 4381)
    }
  ],
  "E2" => [
    {
      "host" => "the edge engine request core",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-request.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-request.ts", 750, 770
      )
    }
  ],
  "E3" => [
    {
      "host" => "the minimal reader",
      "file" => "deploy/bunny-worker-src/bunny-worker.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-worker.ts", 283, 290
      )
    },
    {
      "host" => "the minimal reader's masked content",
      "file" => "deploy/bunny-worker-src/bunny-worker.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-worker.ts", 376, 382
      )
    },
    {
      "host" => "the staging server",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 2963, 2970)
    }
  ],
  "E4" => [
    {
      "host" => "the edge engine",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 337, 346
      )
    }
  ],
  "E5" => [
    {
      "host" => "the staging server's POST arms",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4278, 4282)
    },
    {
      "host" => "the staging server's GET form arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4483, 4486)
    },
    {
      "host" => "the staging server's signin handler",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 3329, 3336)
    }
  ]
}

puts JSON.pretty_generate(
  "row" => "reg-routes-E1..E5",
  "gemset" => "decko-0.20.0 (pinned route table)",
  "rows" => ROWS.transform_values { |row| row["label"] },
  "reductions" => reductions,
  "pinnedRouteTable" => pinned_table,
  "portSurface" => port_surface,
  "rigArtifacts" => [
    "the PINNED deck's own route table is EXECUTED (the shared rig's route recorder) and reduced with the shared candidate reduction (pinned-route-table-candidate-reduction-ruby.rb), which is LOOSE in the permissive direction: a dynamic segment matches ANY segment, so the candidate set is a SUPERSET of what the pinned table accepts. An empty candidate set therefore proves the pinned table routes the path nowhere, and a candidate set that holds only card reads proves the pinned table answers that path with a card render.",
    "the PORT's own serving source is quoted with line numbers at THIS branch's line numbers, because the port has moved since the register build. The quotes are the port's own bytes, so a reader can check the surface rather than take the register's citation on trust.",
    "the port's own hosts are three (the minimal reader, the edge engine, the staging server) and the rows name which host serves which path. The capture quotes the serving arm of each host the row names, and the rows whose host is one surface quote only that one."
  ]
)
