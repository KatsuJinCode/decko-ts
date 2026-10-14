# Rack entry for the speed benchmark: the stock oracle app, unmodified, with
# two benchmark-only additions loaded here and nowhere else.
#
#   DECKO_BENCH_DB_HOP_MS=<n>  hold every SQL round trip the app sends to
#                              SQLite n ms before it runs: the simulated
#                              network between an app server and its database.
#   X-Decko-Db-Trips           response header: SQL round trips this request
#                              made (ActiveRecord's raw_execute, one per
#                              statement sent).
oracle = File.expand_path("../../../reference-harness/oracle/app/config", __dir__)
require File.join(oracle, "application")
# Production eager-loads Active Storage, which requires a storage.yml the
# oracle app does not carry (it stores uploads through Decko's own file
# handling). No Active Storage service is used by any page measured.
ReferenceOracle::Application.config.active_storage.service_configurations = {}
require File.join(oracle, "environment")

module DeckoBenchHop
  HOP = ENV.fetch("DECKO_BENCH_DB_HOP_MS", "0").to_f / 1000.0

  def raw_execute(*args, **kwargs)
    Thread.current[:decko_bench_trips] = (Thread.current[:decko_bench_trips] || 0) + 1
    sleep(HOP) if HOP > 0
    super
  end
end
ActiveRecord::ConnectionAdapters::SQLite3Adapter.prepend(DeckoBenchHop)

class DeckoBenchTrips
  def initialize(app)
    @app = app
  end

  def call(env)
    Thread.current[:decko_bench_trips] = 0
    status, headers, body = @app.call(env)
    headers["x-decko-db-trips"] = Thread.current[:decko_bench_trips].to_s
    [status, headers, body]
  end
end

use DeckoBenchTrips
run Cardio.application.class
