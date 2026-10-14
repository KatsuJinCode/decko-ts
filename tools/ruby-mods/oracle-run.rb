# The stock-Ruby side of the Ruby-mod comparison: stock Decko (card 1.110.0,
# decko 0.20.0) with the mod placed in the app's mod/ directory, rendering the
# same views and running the same creates as tools/ruby-mods/port-run.ts.
#
#   bash tools/ruby-mods/oracle-run.sh <plan.json> <out.json>

require "json"
require_relative "../../reference-harness/oracle/lib/harness_env"

plan = JSON.parse(File.read(ARGV.fetch(0)))
spec = JSON.parse(File.read(plan.fetch("deckJson")))
HarnessEnv.freeze_clock!(spec["clock"])
HarnessEnv.apply_environment!(spec["environment"])
Cardio.config.asset_refresh = :never

def with_production_render
  old_env = Rails.env
  Rails.env = "production"
  yield
ensure
  Rails.env = old_env
end

# Setup creates are committed, and the resulting deck is what the port reads
# (oracle-run.sh copies it to plan["deckOut"]).
Card::Auth.as_bot do
  (plan["setup"] || []).each do |c|
    Card.create! name: c["name"], type: c["type"], content: c["content"]
  end
end

renders = plan.fetch("renders").map do |r|
  started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  begin
    card = Card.fetch(r["card"], new: {})
    html = with_production_render { card.format(:html).render(r["view"].to_sym) }
    r.merge("html" => html.to_s)
  rescue StandardError => e
    r.merge("error" => "#{e.class}: #{e.message}")
  end.merge("ms" => (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000)
end

events = plan.fetch("events").map do |ev|
  stored = nil
  Card::Auth.as_bot do
    Card.transaction do
      card = Card.create! name: ev["name"], content: ev["content"]
      stored = card.db_content
      raise ActiveRecord::Rollback
    end
  end
  ev.merge("stored" => stored)
end

File.write(ARGV.fetch(1), JSON.generate("renders" => renders, "events" => events))
