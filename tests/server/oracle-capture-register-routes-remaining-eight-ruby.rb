# oracle-capture-register-routes-remaining-eight-ruby.rb - the PINNED deck's
# own answer for the eight register-routes rows that no tranche has landed,
# and the PORT's own serving source for each.
#
# WHAT THIS SCRIPT IS FOR. The register-routes family holds 72 rows. The
# family branches' own commit subjects, read strictly (only the commits
# whose subject begins with "[Family]"), name 56 of them at the tranche 8
# tip and 64 at the tranche 9 tip. The eight that NO tranche has landed
# are therefore:
#
#   A23  the deck app template's conditional Jasmine engine mount
#   B7   the read path's Token authenticator
#   B10  initial_setup? -> prepare_setup_card!
#   B11  load_action (select_action_by_params + the edit draft)
#   C16  the CSRF/origin posture
#   C17  Token auth and X-API-Key on reads
#   D4   the file sender for an unregistered format suffix
#   D5   the URL format registry and its negotiation
#
# The rows whose pinned method is ALREADY captured by a committed capture
# (B7, B11, C16, C17, D4, D5) keep that capture; this file records what
# those captures cannot: the PINNED ROUTER's own answer for each row's
# probe paths, the two pinned methods that had no capture (A23's
# generator template and B10's implicit mark), and the PORT's own source
# for every row.
#
# The PINNED ROUTER is the real one: the pinned actionpack-7.2.4 (which
# carries Journey) builds an ActionDispatch::Routing::RouteSet, the pinned
# deck's own config/engine_routes.rb is drawn into it verbatim, and the
# router is asked to recognize each probe path with each probe verb
# (tests/server/pinned-rails-route-recognition-ruby.rb).
#
# THE TWO NEW PINNED METHODS:
#
#   A23  the pinned card gem's own generator template
#        (card-1.110.0/lib/generators/deck/templates/config/routes.rb.erb),
#        quoted with line numbers, plus a SCAN of the whole pinned gemset
#        for the constant the mount is conditional on. The mount is behind
#        two conjuncts and one of them is a constant no installed gem
#        defines, so the capture records the scan rather than the reading.
#
#   B10  the PINNED deck's own implicit_mark
#        (decko-0.20.0/lib/card_controller/mark.rb:28-40), EXECUTED over
#        the cells that decide it: the census open or closed, and the
#        request an HTML one or not. The method's own answer (the empty
#        mark, the setup card's type id and the setup view) is recorded.
#
# Run (Ruby 3.4 on PATH, no Rails app, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-register-routes-remaining-eight-ruby.rb \
#     > fixtures/captured/register-routes-remaining-eight-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The path list is fixed, the gemset scan is fixed and every
# recorded answer is a pinned method's own answer, so a re-run on the same
# gemset is byte-stable.

require "json"

require_relative "pinned-rails-route-recognition-ruby"
require_relative "pinned-port-only-route-absence-ruby"

# ---------------------------------------------------------------------------
# the rows, their probe paths, and the verbs each path is probed with
# ---------------------------------------------------------------------------
ROWS = {
  "A23" => {
    "label" => 'the deck app template\'s conditional mount JasmineRails::Engine => "#{rel_root}/specs"',
    "probes" => [
      { "path" => "/specs/spec_helper", "verb" => "get" },
      { "path" => "/jasmine/specs/jasmine.js", "verb" => "get" }
    ]
  },
  "B7" => {
    "label" => "the read path's Token authenticator",
    "probes" => [
      { "path" => "/Alpha", "verb" => "get" }
    ]
  },
  "B10" => {
    "label" => "initial_setup? -> prepare_setup_card!",
    "probes" => [
      { "path" => "/", "verb" => "get" },
      { "path" => "/setup", "verb" => "get" }
    ]
  },
  "B11" => {
    "label" => "load_action (select_action_by_params + the edit draft)",
    "probes" => [
      { "path" => "/Alpha", "verb" => "get" }
    ]
  },
  "C16" => {
    "label" => "the CSRF/origin posture",
    "probes" => [
      { "path" => "/Alpha", "verb" => "post" }
    ]
  },
  "C17" => {
    "label" => "Token auth and X-API-Key on reads",
    "probes" => [
      { "path" => "/Alpha", "verb" => "get" }
    ]
  },
  "D4" => {
    "label" => "the file sender for an unregistered format suffix",
    "probes" => [
      { "path" => "/Alpha.bin", "verb" => "get" },
      { "path" => "/files/Alpha/42.png", "verb" => "get" }
    ]
  },
  "D5" => {
    "label" => "the URL format registry and its negotiation",
    "probes" => [
      { "path" => "/Alpha.css", "verb" => "get" },
      { "path" => "/Alpha.scss", "verb" => "get" },
      { "path" => "/Alpha.js", "verb" => "get" },
      { "path" => "/Alpha.csv", "verb" => "get" },
      { "path" => "/Alpha.xml", "verb" => "get" },
      { "path" => "/Alpha.yaml", "verb" => "get" },
      { "path" => "/Alpha.jsonld", "verb" => "get" }
    ]
  }
}.freeze

router_answers = ROWS.transform_values do |row|
  row["probes"].map { |probe| PinnedRailsRouteRecognition.recognize(probe["path"], probe["verb"]) }
end

# ---------------------------------------------------------------------------
# A23: the pinned generator template and the gemset scan
# ---------------------------------------------------------------------------
module PinnedJasmineMount
  TEMPLATE = "card-1.110.0/lib/generators/deck/templates/config/routes.rb.erb".freeze
  CONSTANT = "JasmineRails".freeze

  module_function

  # Every file in the pinned gemset that names the constant, with the
  # lines that name it. The scan is over the whole gemset, not over the
  # template, because the mount is conditional on the constant EXISTING.
  def constant_hits
    root = PinnedDeck.gems_root
    hits = []
    Dir.glob(File.join(root, "*", "**", "*")).sort.each do |path|
      next unless File.file?(path)
      next if File.size(path) > 2 * 1024 * 1024

      begin
        lines = File.readlines(path, chomp: true)
      rescue StandardError
        next
      end
      lines.each_with_index do |line, index|
        next unless line.include?(CONSTANT)

        hits << {
          "file" => path.sub("#{root}/", ""),
          "line" => index + 1,
          "text" => line
        }
      end
    end
    hits
  end

  # The gems whose NAME says they carry the constant's library, and the
  # directories a mounted engine would live in.
  def jasmine_gems
    root = PinnedDeck.gems_root
    Dir.glob(File.join(root, "*")).select { |dir| File.basename(dir).downcase.include?("jasmine") }
                                          .map { |dir| File.basename(dir) }
  end
end

# ---------------------------------------------------------------------------
# B10: the PINNED deck's own implicit_mark, EXECUTED
# ---------------------------------------------------------------------------
module PinnedImplicitMark
  # The pinned card type id the setup card is. The pinned method asks
  # Card.default_accounted_type_id; the value is a stand that RECORDS the
  # ask and answers a fixed number, because the id itself is not the
  # row's question (the row's question is WHICH mark the method returns
  # and WHICH view and card it puts in the params).
  TYPE_ID = 99

  module_function

  # One cell: the census open or closed, and the request an HTML one or
  # not. The pinned method is the one that answers.
  def cell(needs_setup:, html:, view: nil, card_name: nil, home: "Home")
    # The PINNED controller, loaded: the Mark module the method lives in is
    # the pinned gem's own file, evaluated by the shared rig.
    PinnedDeck.load_pinned_controller!
    # The rig's own Card and Card::Env stands, configured for this cell.
    Card::Auth.needs_setup_answer = needs_setup
    Card::Env.html_answer = html
    Card::Rule.global_settings = { "home" => home }
    Card.define_singleton_method(:default_accounted_type_id) { TYPE_ID }

    probe = Class.new do
      attr_accessor :params

      def initialize(params)
        @params = params
      end
    end

    params = {}
    params[:view] = view unless view.nil?
    params[:card] = { name: card_name } unless card_name.nil?
    instance = probe.new(params)
    # The PINNED module's own methods, on the probe: the Mark module's
    # methods are private instance methods of the pinned module, and the
    # probe extends with it so the pinned method is the one that answers.
    instance.extend(CardController::Mark)
    mark = instance.send(:implicit_mark)

    {
      "needsSetup" => needs_setup,
      "html" => html,
      "answerMark" => mark,
      "paramsAfter" => params.transform_values { |value| value.is_a?(Hash) ? value.transform_keys(&:to_s) : value }
    }
  end

  def capture
    {
      "sourceFile" => "decko-0.20.0/lib/card_controller/mark.rb",
      "method" => "CardController::Mark#implicit_mark",
      "cells" => [
        {
          "name" => "the census is open and the request is an HTML one",
          "cell" => cell(needs_setup: true, html: true)
        },
        {
          "name" => "the census is closed",
          "cell" => cell(needs_setup: false, html: true)
        },
        {
          "name" => "the census is open but the request is not an HTML one",
          "cell" => cell(needs_setup: true, html: false)
        },
        {
          "name" => "the census is open and the request names a view",
          "cell" => cell(needs_setup: true, html: true, view: "core")
        }
      ]
    }
  end
end

# ---------------------------------------------------------------------------
# the port's own serving source, quoted with line numbers
# ---------------------------------------------------------------------------
#
# These are the port's own files, at THIS branch's line numbers. The
# register's own citations are from the register build, and the port has
# moved since; what matters is that a reader can check the surface.
port_surface = {
  "A23" => [
    {
      "host" => "the port's deprecated asset prefixes",
      "file" => "src/server/worker-shared-surface.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/worker-shared-surface.ts", 361, 365)
    }
  ],
  "B7" => [
    {
      "host" => "the port's shared authenticators",
      "file" => "src/server/request-authenticators.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/request-authenticators.ts", 72, 83)
    }
  ],
  "B10" => [
    {
      "host" => "the port's census and its env gate",
      "file" => "src/card/auth/first-run-setup.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/card/auth/first-run-setup.ts", 149, 153)
    },
    {
      "host" => "the port's setup route gate",
      "file" => "src/server/first-run-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/first-run-routes.ts", 176, 183)
    }
  ],
  "B11" => [
    {
      "host" => "the port's edit-draft emitter",
      "file" => "src/card/mod-loader/mods/card-mod-history.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/card/mod-loader/mods/card-mod-history.ts", 1908, 1914)
    }
  ],
  "C16" => [
    {
      "host" => "the port's origin check on the write path",
      "file" => "src/server/write-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/write-routes.ts", 1080, 1088)
    }
  ],
  "C17" => [
    {
      "host": "the port's api_key half of the authenticators",
      "file": "src/server/request-authenticators.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/request-authenticators.ts", 72, 78)
    },
    {
      "host" => "the port's api_key mod header",
      "file" => "src/card/mod-loader/mods/card-mod-api_key.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/card/mod-loader/mods/card-mod-api_key.ts", 41, 48)
    }
  ],
  "D4" => [
    {
      "host" => "the port's file route",
      "file": "src/server/file-routes.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("src/server/file-routes.ts", 82, 98)
    }
  ],
  "D5" => [
    {
      "host" => "the port's read grammar",
      "file": "deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts",
      "lines" => PinnedPortOnlyRouteAbsence.repo_lines("deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts", 36, 67)
    }
  ]
}

capture = JSON.pretty_generate(
  "row" => "reg-routes-A23, B7, B10, B11, C16, C17, D4, D5",
  "gemset" => "decko-0.20.0 (pinned route table, drawn into the pinned rails router)",
  "rows" => ROWS.transform_values { |row| row["label"] },
  "routerAnswers" => router_answers,
  "pinnedMethods" => {
    "A23" => {
      "templateFile" => PinnedJasmineMount::TEMPLATE,
      "templateLines" => PinnedDeck.pinned_lines(PinnedJasmineMount::TEMPLATE),
      "constant" => PinnedJasmineMount::CONSTANT,
      "constantHits" => PinnedJasmineMount.constant_hits,
      "jasmineGems" => PinnedJasmineMount.jasmine_gems
    },
    "B10" => PinnedImplicitMark.capture
  },
  "portSurface" => port_surface,
  "rigArtifacts" => [
    "the PINNED deck's own route table is drawn into a REAL pinned-rails route set (the pinned actionpack-7.2.4 that carries Journey) and the PINNED router is asked to recognize each probe path with each probe verb. The answer is the route the pinned deck dispatches to, with its own parameters, in the pinned deck's own matching precedence. A path no route matches is the pinned deck's own router 404 (ActionController::RoutingError).",
    "the PORT's own serving source is quoted with line numbers at THIS branch's line numbers, because the port has moved since the register build. The quotes are the port's own bytes, so a reader can check the surface rather than take the register's citation on trust.",
    "THE ROWS WHOSE PINNED METHOD IS ALREADY CAPTURED keep that capture: B7 (tests/server/oracle-capture-request-authenticators-ruby.rb), B11 (oracle-capture-load-action-ruby.rb), C16 (oracle-capture-forgery-posture-ruby.rb), C17 (oracle-capture-api-key-authenticators-ruby.rb), D4 and D5 (oracle-capture-format-registry-ruby.rb, oracle-capture-explicit-file-route-ruby.rb). This file adds what those captures cannot: the pinned ROUTER's answer for each row's probe paths, the two pinned methods that had no capture (A23's generator template, B10's implicit mark), and the port's own source for every row."
  ]
)

# The capture writes to the path given as its first argument, and to
# standard output when there is none.
if ARGV.first
  File.write(ARGV.first, capture)
else
  puts capture
end
