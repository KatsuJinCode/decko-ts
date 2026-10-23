# oracle-capture-port-only-routes-e6-e13-ruby.rb - the PINNED deck's own
# answer for the eight remaining port-only rows, measured with the PINNED
# RAILS' own router, and the PORT's own serving source for each.
#
# WHY THIS SCRIPT EXISTS. The register's E rows ([Family]) grade surfaces the
# port serves, and the register's own basis for grading them PORTED is that
# "the register names the host(s) and the file:line in the port that serves
# it, so there is no Ruby behaviour it could fail to match". That basis is a
# CLAIM about the pinned side, and a claim about the pinned side can be
# MEASURED. This script measures it for the eight rows this tranche lands:
#
#   E6  POST /_reset-request, POST /_account-password, the forgot-password
#       submit, GET /*signin/reset_password_success, GET /*signin/edit
#   E7  GET/POST /setup (DECKO_FIRST_RUN-gated)
#   E8  GET /_mail-log
#   E9  POST /:mark/asset
#   E10 GET /mod/* and /mod/tinymce_editor/*
#   E11 vendor font assets
#   E12 Server-Timing, the isolate-probe routes, the render-budget 503
#   E13 the 405 JSON and the read-only 403
#
# WHAT THE MEASUREMENT IS. The PINNED deck's own config/engine_routes.rb is
# drawn into a REAL pinned-rails route set (the pinned actionpack-7.2.4 that
# carries Journey, the router Rails itself uses), with the pinned deck's own
# files_web_path primed from the PINNED carrierwave mod's own file first,
# and the PINNED router is asked to recognize each probe path with each
# probe verb. The answer is the route the pinned deck dispatches to, with
# its own parameters, in the pinned deck's own matching precedence. A path
# no route matches is the pinned deck's own router 404.
#
# The family's shared instrument (the shared reduction, which reads the
# recorded route list) is run over the same paths as well, and its answer is
# recorded beside the router's, because the two differ in a way a reader
# needs to see: the shared reduction is LOOSE in the permissive direction
# (a "*glob" pattern matches EVERY path), so it reports candidates the
# pinned router would never dispatch to. The router's answer is the one the
# rows' claims rest on.
#
# Run (Ruby 3.4 on PATH, no Rails app, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb \
#     > fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The path list is fixed and the pinned table is fixed, so a re-run
# on the same gemset is byte-stable.

require "json"

require_relative "pinned-rails-route-recognition-ruby"
require_relative "pinned-port-only-route-absence-ruby"

# ---------------------------------------------------------------------------
# the rows, their probe paths, and the verbs each path is probed with
# ---------------------------------------------------------------------------
ROWS = {
  "E6" => {
    "label" => "POST /_reset-request, POST /_account-password, the forgot-password submit, GET /*signin/reset_password_success, GET /*signin/edit",
    "probes" => [
      { "path" => "/_reset-request", "verb" => "post" },
      { "path" => "/_account-password", "verb" => "post" },
      { "path" => "/update/*signin", "verb" => "post" },
      { "path" => "/*signin/reset_password_success", "verb" => "get" },
      { "path" => "/*signin/edit", "verb" => "get" }
    ]
  },
  "E7" => {
    "label" => "GET/POST /setup (DECKO_FIRST_RUN-gated)",
    "probes" => [
      { "path" => "/setup", "verb" => "get" },
      { "path" => "/setup", "verb" => "post" }
    ]
  },
  "E8" => {
    "label" => "GET /_mail-log",
    "probes" => [
      { "path" => "/_mail-log", "verb" => "get" }
    ]
  },
  "E9" => {
    "label" => "POST /:mark/asset - the dedicated multipart upload grammar",
    "probes" => [
      { "path" => "/Alpha/asset", "verb" => "post" },
      { "path" => "/Alpha/asset", "verb" => "get" },
      { "path" => "/asset/Alpha", "verb" => "get" }
    ]
  },
  "E10" => {
    "label" => "GET /mod/* (mod public files); /mod/tinymce_editor/* CDN redirect + nest plugin",
    "probes" => [
      { "path" => "/mod/tinymce_editor/plugins/nest/plugin.min.js", "verb" => "get" },
      { "path" => "/mod/tinymce_editor/themes/silver/theme.min.js", "verb" => "get" }
    ]
  },
  "E11" => {
    "label" => "Vendor font assets (font-awesome, bootstrap fonts)",
    "probes" => [
      { "path" => "/mod/bootstrap/fontawesome-6.7.2/css/all.min.css", "verb" => "get" },
      { "path" => "/mod/bootstrap/fonts/bootstrap-icons.woff2", "verb" => "get" }
    ]
  },
  "E12" => {
    "label" => "Server-Timing header, isolate-probe routes, render-budget 503 + Retry-After, edge caches",
    "probes" => [
      { "path" => "/_probe/cpu", "verb" => "get" },
      { "path" => "/_probe/db", "verb" => "get" }
    ]
  },
  "E13" => {
    "label" => "405 JSON for unmatched non-GET/HEAD; 403 JSON for unarmed-edge non-read verbs",
    "probes" => [
      { "path" => "/a/b/c", "verb" => "post" },
      { "path" => "/a/b/c", "verb" => "get" },
      { "path" => "/Alpha", "verb" => "post" }
    ]
  }
}.freeze

# ---------------------------------------------------------------------------
# the PINNED RAILS' own answer, per row, per probe
# ---------------------------------------------------------------------------
router_answers = ROWS.transform_values do |row|
  row["probes"].map { |probe| PinnedRailsRouteRecognition.recognize(probe["path"], probe["verb"]) }
end

# ---------------------------------------------------------------------------
# the family's SHARED instrument's answer over the same paths, for the reader
# who wants to see where the two differ
# ---------------------------------------------------------------------------
shared_answers = ROWS.transform_values do |row|
  row["probes"].map do |probe|
    reduction = PinnedPortOnlyRouteAbsence.reduction_for(probe["path"])
    {
      "path" => probe["path"],
      "verb" => probe["verb"],
      "firstRouteAdmitting" => {
        "get" => reduction["firstRouteAdmittingGet"],
        "post" => reduction["firstRouteAdmittingPost"],
        "put" => reduction["firstRouteAdmittingPut"],
        "patch" => reduction["firstRouteAdmittingPatch"],
        "delete" => reduction["firstRouteAdmittingDelete"]
      }[probe["verb"]],
      "candidateCount" => reduction["candidates"].length,
      "note" => "the shared reduction is LOOSE in the permissive direction (a \"*glob\" pattern matches EVERY path), so its candidate set is a SUPERSET of what the pinned table accepts; the pinned router's own answer above is the one the rows' claims rest on"
    }
  end
end

# ---------------------------------------------------------------------------
# the PINNED deck's own route table, quoted, so a reader can see what the
# router ran over
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
  "E6" => [
    {
      "host" => "the staging server's account-flow POST arms",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4282, 4287)
    },
    {
      "host" => "the staging server's signin view arms",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4296, 4302)
    },
    {
      "host" => "the write path's forgot-password trigger",
      "file" => "src/server/write-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/write-routes.ts", 1462, 1467)
    },
    {
      "host" => "the port's own reset_password_success view",
      "file" => "src/card/mod-loader/mods/card-mod-account.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/card/mod-loader/mods/card-mod-account.ts", 427, 441)
    }
  ],
  "E7" => [
    {
      "host" => "the staging server's first-run arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4288, 4295)
    },
    {
      "host" => "the first-run surface's own path",
      "file" => "src/server/first-run-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/first-run-routes.ts", 119, 123)
    },
    {
      "host" => "the first-run surface's own handler",
      "file" => "src/server/first-run-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/first-run-routes.ts", 176, 186)
    },
    {
      "host" => "the edge surface's first-run gate name",
      "file" => "deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts", 100, 108
      )
    }
  ],
  "E8" => [
    {
      "host" => "the staging server's mail-log arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4375, 4379)
    },
    {
      "host" => "the staging server's mail-log handler",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 1346, 1362)
    }
  ],
  "E9" => [
    {
      "host" => "the port's upload grammar, in the module header",
      "file" => "src/server/file-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/file-routes.ts", 18, 27)
    },
    {
      "host" => "the port's upload arm",
      "file" => "src/server/file-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/file-routes.ts", 85, 95)
    }
  ],
  "E10" => [
    {
      "host" => "the staging server's mod public files arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4403, 4408)
    },
    {
      "host" => "the staging server's mod public dir reader",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 385, 395)
    },
    {
      "host" => "the edge engine's tinymce redirect",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 393, 409
      )
    },
    {
      "host" => "the edge engine's tinymce prefix and CDN base",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 105, 109
      )
    }
  ],
  "E11" => [
    {
      "host" => "the staging server's vendor asset arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4011, 4018)
    },
    {
      "host" => "the edge engine's vendor asset arm",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 297, 301
      )
    },
    {
      "host" => "the port's own font-awesome asset surface",
      "file" => "src/server/font-awesome-assets.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/font-awesome-assets.ts", 1, 24)
    },
    {
      "host" => "the port's own bootstrap font surface",
      "file" => "src/server/bootstrap-font-assets.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/bootstrap-font-assets.ts", 1, 17)
    }
  ],
  "E12" => [
    {
      "host" => "the edge profiler's header name",
      "file" => "deploy/bunny-worker-src/bunny-edge-server-timing.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-server-timing.ts", 85, 90
      )
    },
    {
      "host" => "the edge isolate probe's routes",
      "file" => "deploy/bunny-worker-src/bunny-edge-isolate-probe.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-isolate-probe.ts", 105, 135
      )
    },
    {
      "host" => "the edge render budget's own constants",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-request.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-request.ts", 240, 258
      )
    },
    {
      "host" => "the edge render budget's 503",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-request.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-request.ts", 313, 334
      )
    }
  ],
  "E13" => [
    {
      "host" => "the staging server's 405 arm",
      "file" => "vm-staging-server.mjs",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("vm-staging-server.mjs", 4255, 4267)
    },
    {
      "host" => "the edge engine's read-only 403",
      "file" => "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts", 386, 391
      )
    }
  ]
}

# ---------------------------------------------------------------------------
# the PINNED GEMS' own source, quoted with line numbers
# ---------------------------------------------------------------------------
#
# Some rows' pinned answers are not a route but a METHOD: the pinned card
# gem's own views and events. Those are quoted from the pinned gems' own
# files, at the pinned gems' own line numbers, so a reader can read the
# method instead of taking this capture's word for it.
def pinned_source(relative, from, to)
  {
    "file" => relative,
    "lines" => PinnedDeck.pinned_lines(relative).select { |row| row["line"] >= from && row["line"] <= to }
  }
end

pinned_source_quotes = {
  "E6" => [
    pinned_source("card-mod-account-0.20.0/set/self/signin.rb", 1, 10),
    pinned_source("card-mod-account-0.20.0/set/self/signin.rb", 25, 31),
    pinned_source("card-mod-account-0.20.0/set/self/signin.rb", 148, 157),
    pinned_source("card-mod-account-0.20.0/set/self/signin.rb", 185, 196)
  ],
  "E7" => [
    pinned_source("card-1.110.0/lib/card/auth/setup.rb", 7, 15),
    pinned_source("card-1.110.0/lib/card/auth/setup.rb", 33, 52),
    pinned_source("card-mod-account-0.20.0/set/type/user.rb", 7, 18)
  ],
  "E9" => [
    pinned_source("decko-0.20.0/lib/card_controller/rest.rb", 22, 27)
  ]
}

puts JSON.pretty_generate(
  "row" => "reg-routes-E6..E13",
  "gemset" => "decko-0.20.0 (pinned route table) with actionpack-7.2.4 (pinned rails router)",
  "rows" => ROWS.transform_values { |row| row["label"] },
  "routerAnswers" => router_answers,
  "sharedReductionAnswers" => shared_answers,
  "pinnedRouteTable" => pinned_table,
  "pinnedRouterRoutes" => PinnedRailsRouteRecognition.route_set_rows,
  "pinnedSource" => pinned_source_quotes,
  "portSurface" => port_surface,
  "rigArtifacts" => [
    "the PINNED deck's own route table is drawn into a REAL pinned-rails route set (the pinned actionpack-7.2.4 that carries Journey, the router Rails itself uses) and the PINNED router is asked to recognize each probe path with each probe verb. The answer is the route the pinned deck dispatches to, with its own parameters, in the pinned deck's own matching precedence. A path no route matches is the pinned deck's own router 404 (ActionController::RoutingError).",
    "the pinned deck's files_web_path is primed from the PINNED carrierwave mod's own file BEFORE the table is drawn, because the real deck loads that mod at boot and the routes file interpolates the value into two of its path patterns (engine_routes.rb:10,13).",
    "the family's shared instrument (the shared candidate reduction over the recorded route list) is run over the same paths and recorded beside the router's answer. It is LOOSE in the permissive direction (a \"*glob\" pattern matches EVERY path), so its candidate set is a SUPERSET of what the pinned table accepts; the router's own answer is the one the rows' claims rest on.",
    "the PORT's own serving source is quoted with line numbers at THIS branch's line numbers, because the port has moved since the register build. The quotes are the port's own bytes, so a reader can check the surface rather than take the register's citation on trust."
  ]
)
