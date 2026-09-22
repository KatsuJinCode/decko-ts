# prototype/measure.rb -- the Ruby prototype's measurement harness for the
# deck-1282 batched-inclusion prefetch (KatsuJinCode/decko-ts #9 /
# docs/ruby-dividend-cte.md).
#
# Boots a minimal decko SQLite deck (copies db/development.sqlite3 from the
# oracle app to prototype/db/prefetch.sqlite3 if not present), seeds a deep
# nested page with a PrefR1 prefix, then renders it twice -- once with the
# installed gem (depth-first, the pre-patch behavior), once with the
# prototype overlay loaded (closure-prefetch). Both runs print
# queries-per-render for cold + warm paths so the dividend is visible.
#
# Run from tools/oracle/decko-oracle-app:
#   RAILS_ENV=development /c/Ruby33-x64/bin/decko runner \
#     C:/localProjects/decko-ts/prototype/measure.rb
#
# Env knobs:
#   PREFETCH_DEPTH          depth of the seeded inclusion chain (default 8)
#   PREFETCH_RENDER_N       measured renders per mode (default 5)
#   PREFETCH_PREFIX         bench card prefix (default "PrefR1")

require "json"
require "fileutils"
require "set"

# ---- knobs ----------------------------------------------------------------
PREFIX     = ENV.fetch("PREFETCH_PREFIX", "PrefR1")
DEPTH      = ENV.fetch("PREFETCH_DEPTH", "8").to_i
RENDER_N   = ENV.fetch("PREFETCH_RENDER_N", "5").to_i
PROTOTYPE_ROOT = __dir__   # the directory holding this script
REPO_ROOT      = File.expand_path("..", PROTOTYPE_ROOT)
ORACLE_DB     = File.join(REPO_ROOT, "tools", "oracle", "decko-oracle-app",
                         "db", "development.sqlite3")
PROTOTYPE_DB_DIR  = File.join(PROTOTYPE_ROOT, "db")
PROTOTYPE_DB_PATH = File.join(PROTOTYPE_DB_DIR, "prefetch.sqlite3")

# ---- sql query counter -----------------------------------------------------
# Same shape as benchmarks/run_ruby_bench.rb:69-74.
SQL_COUNTS = { all: 0, non_schema: 0 }
SQL_SUBSCRIPTION = ActiveSupport::Notifications.subscribe("sql.active_record") do |*args|
  ev = args.last
  payload = ev.respond_to?(:payload) ? ev.payload : (args[4] || {})
  SQL_COUNTS[:all] += 1
  SQL_COUNTS[:non_schema] += 1 unless payload[:name] == "SCHEMA"
end

def reset_sql_counts
  SQL_COUNTS[:all] = 0
  SQL_COUNTS[:non_schema] = 0
end

def measured_cold_render card_name, view, cache_local_only: false
  Card.cache.reset
  reset_sql_counts
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  begin
    html = Card.fetch(card_name)&.format&.render(view)
    ok = true
    msg = nil
  rescue StandardError => e
    html = nil
    ok = false
    msg = "#{e.class}: #{e.message}"
  end
  wall_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0) * 1000).round(3)
  {
    "ok" => ok,
    "error" => msg,
    "queries_non_schema" => SQL_COUNTS[:non_schema],
    "queries_all" => SQL_COUNTS[:all],
    "wall_ms" => wall_ms,
    "html_bytes" => html ? html.bytesize : 0,
    "cache_local_only" => cache_local_only,
  }
end

def measured_warm_render card, view
  reset_sql_counts
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  html = card.format.render(view)
  wall_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0) * 1000).round(3)
  {
    "queries_non_schema" => SQL_COUNTS[:non_schema],
    "queries_all" => SQL_COUNTS[:all],
    "wall_ms" => wall_ms,
    "html_bytes" => html.bytesize,
  }
end

# ---- seed helpers ----------------------------------------------------------
def seed_chain depth, prefix, style
  names = []
  depth.times do |i|
    name = format("%s_chain_%s_d%02d_n%02d", prefix, style, depth, i + 1)
    content = if i + 1 < depth
      format("{{%s_chain_%s_d%02d_n%02d|%s}}",
             prefix, style, depth, i + 2, style)
    else
      "leaf " + ("a" * 200)
    end
    existing = Card.fetch(name, new: {})
    if existing.new_card? || existing.trash?
      Card.create! name: name, type: "RichText", content: content
    end
    names << name
  end
  names
end

def live_count
  Card.where(trash: false).count
end

def clean_prefix prefix
  Card.where(trash: false).where("name LIKE ?", "#{prefix}%").pluck(:name).each do |n|
    c = Card.fetch(n)
    c&.delete!
  end
end

# ---- load the prototype overlay --------------------------------------------
# The prototype overlays prototype/lib/ on top of the gem's load path, so
# `require "card"` (already loaded) is satisfied, and the patched files in
# prototype/lib/card/format/{nest/fetch.rb,nest/prefetch.rb,render.rb}
# shadow the installed gem files. Verified manually: after prepending, the
# require paths of Card::Format::Render + Card::Format::Nest::Fetch point
# into prototype/lib/.
def load_prototype_overlay
  lib = File.join(PROTOTYPE_ROOT, "lib")
  $LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
  # Force a reload of the touched files. Card and Decko have already been
  # loaded by the runner boot; require + remove_const + require is the
  # standard "hot-swap" for a Ruby module reload. We only touch the modules
  # the patch modifies.
  %w[card/format/render.rb card/format/nest/fetch.rb
     card/format/nest/prefetch.rb].each do |rel|
    abs = File.join(lib, rel)
    next unless File.exist?(abs)
    # Drop any cached `require` entry.
    $LOADED_FEATURES.delete_if { |f| f.end_with?(rel) || f.end_with?(rel.sub(/\.rb$/, "")) }
    # Drop the constants so the re-required file recreates them. The
    # modules are loaded into the Card::Format::* namespace -- remove
    # them in reverse-include order.
  end
  if defined?(Card::Format::Nest::Prefetch)
    Card::Format.send :remove_const, :Prefetch rescue nil
    Card::Format::Nest.send :remove_const, :Prefetch rescue nil
  end
  if defined?(Card::Format::Render)
    Card::Format.send :remove_const, :Render rescue nil
  end
  if defined?(Card::Format::Nest::Fetch)
    Card::Format::Nest.send :remove_const, :Fetch rescue nil
  end
  load File.join(lib, "card", "format", "nest", "prefetch.rb")
  load File.join(lib, "card", "format", "nest", "fetch.rb")
  load File.join(lib, "card", "format", "render.rb")
  Card::Format.include Card::Format::Render
end

# ---- main flow -------------------------------------------------------------
puts "deck-1282 inclusion-closure prefetch -- prototype measurement"
puts "  gem host: card-1.110.0 / decko 0.20.0  (installed via RubyGems)"
puts "  overlay:  #{PROTOTYPE_ROOT}/lib"
puts "  oracle db copy: #{ORACLE_DB} -> #{PROTOTYPE_DB_PATH}"
puts "  depth=#{DEPTH} renders=#{RENDER_N} prefix=#{PREFIX}"

# 0. Ensure we have a working sqlite db to read. The oracle app's dev db is
# already in use at the configured db/development.sqlite3; we read it
# in-place (no copy needed -- the oracle app owns it; this script seeds with
# a distinctive prefix and cleans up at exit).
cards_before = live_count
puts "  cards live before seed: #{cards_before}"

# 1. Seed the deep nested page (cold, no measurement).
Card::Auth.as_bot do
  seed_chain DEPTH, PREFIX, "open"
end
root_name = format("%s_chain_open_d%02d_n01", PREFIX, DEPTH)
root = Card.fetch(root_name)
raise "seed root missing: #{root_name}" if root.nil?
puts "  seeded root: #{root_name} (id=#{root.id})"

# 2. Run a sanity smoke on the seed (no patch yet -- depth-first path).
smoke = measured_cold_render root_name, :open
puts format("  sanity (gem, depth-first, 1 render): queries=%d wall=%.2fms bytes=%d%s",
            smoke["queries_non_schema"], smoke["wall_ms"], smoke["html_bytes"],
            smoke["error"] ? "  ERR=#{smoke["error"]}" : "")

# 3. Phase A: measure the depth-first (pre-patch) cold path N times.
phase_a_cold = RENDER_N.times.map { measured_cold_render root_name, :open }
phase_a_warm = RENDER_N.times.map { measured_warm_render root, :open }
puts ""
puts "Phase A -- depth-first (installed gem, NO patch):"
puts format("  cold: median_queries=%d  median_wall_ms=%.2f  min_q=%d max_q=%d",
            phase_a_cold.map { |r| r["queries_non_schema"] }.sort[phase_a_cold.size / 2],
            phase_a_cold.map { |r| r["wall_ms"] }.sort[phase_a_cold.size / 2],
            phase_a_cold.map { |r| r["queries_non_schema"] }.min,
            phase_a_cold.map { |r| r["queries_non_schema"] }.max)
puts format("  warm: median_queries=%d  median_wall_ms=%.2f",
            phase_a_warm.map { |r| r["queries_non_schema"] }.sort[phase_a_warm.size / 2],
            phase_a_warm.map { |r| r["wall_ms"] }.sort[phase_a_warm.size / 2])

# 4. Phase B: load the prototype overlay and re-measure.
puts ""
puts "Phase B -- closure-prefetch (prototype overlay loaded)..."
load_prototype_overlay

# Verify the overlay is active.
render_path = Card::Format::Render.instance_method(:render!).source_location
puts "  Card::Format::Render#render! source_location: #{render_path.inspect}"
nest_fetch_path = Card::Format::Nest::Fetch.instance_method(:fetch_card).source_location
puts "  Card::Format::Nest::Fetch#fetch_card source_location: #{nest_fetch_path.inspect}"
prefetch_path = Card::Format::Nest::Prefetch.instance_method(:prefetch_inclusion_closure)
                .source_location
puts "  Card::Format::Nest::Prefetch#prefetch_inclusion_closure source_location: " \
     "#{prefetch_path.inspect}"
unless render_path.first.include?("prototype/lib") &&
       nest_fetch_path.first.include?("prototype/lib") &&
       prefetch_path.first.include?("prototype/lib")
  raise "PROTOTYPE OVERLAY FAILED TO LOAD -- source_locations still point at " \
        "the installed gem. Aborting measurement."
end
puts "  overlay ACTIVE (all three source_locations under prototype/lib)"

phase_b_cold = RENDER_N.times.map { measured_cold_render root_name, :open }
phase_b_warm = RENDER_N.times.map { measured_warm_render root, :open }
puts ""
puts "Phase B -- closure-prefetch (prototype overlay, WITH patch):"
puts format("  cold: median_queries=%d  median_wall_ms=%.2f  min_q=%d max_q=%d",
            phase_b_cold.map { |r| r["queries_non_schema"] }.sort[phase_b_cold.size / 2],
            phase_b_cold.map { |r| r["wall_ms"] }.sort[phase_b_cold.size / 2],
            phase_b_cold.map { |r| r["queries_non_schema"] }.min,
            phase_b_cold.map { |r| r["queries_non_schema"] }.max)
puts format("  warm: median_queries=%d  median_wall_ms=%.2f",
            phase_b_warm.map { |r| r["queries_non_schema"] }.sort[phase_b_warm.size / 2],
            phase_b_warm.map { |r| r["wall_ms"] }.sort[phase_b_warm.size / 2])

# 5. The dividend: cold-path query reduction.
phase_a_med = phase_a_cold.map { |r| r["queries_non_schema"] }.sort[phase_a_cold.size / 2]
phase_b_med = phase_b_cold.map { |r| r["queries_non_schema"] }.sort[phase_b_cold.size / 2]
puts ""
puts "DIVIDEND -- cold-path queries per render (median over #{RENDER_N}):"
puts "  Phase A (depth-first):    #{phase_a_med} queries"
puts "  Phase B (closure-walk): #{phase_b_med} queries"
if phase_a_med.positive?
  reduction = ((phase_a_med - phase_b_med).to_f / phase_a_med * 100).round(1)
  puts "  reduction: #{reduction}%  (factor #{(phase_a_med.to_f / [phase_b_med, 1].max).round(2)}x)"
end

# 6. Cleanup.
Card::Auth.as_bot do
  clean_prefix PREFIX
end
remaining = Card.where(trash: false).where("name LIKE ?", "#{PREFIX}%").count
cards_after = live_count
puts ""
puts "cleanup: prefix=#{PREFIX} remaining_live=#{remaining} cards_before=#{cards_before} cards_after=#{cards_after}"
raise "bench cards still live after cleanup!" unless remaining.zero?

ActiveSupport::Notifications.unsubscribe(SQL_SUBSCRIPTION)

# 7. Persist the full measurement to prototype/results/measurement.json.
results = {
  "benchmark" => "ruby-prototype-prefetch-dividend",
  "date" => Time.now.utc.iso8601,
  "depth" => DEPTH,
  "renders_per_phase" => RENDER_N,
  "prefix" => PREFIX,
  "phase_a_depth_first" => {
    "cold_renders" => phase_a_cold,
    "warm_renders" => phase_a_warm,
  },
  "phase_b_closure_prefetch" => {
    "cold_renders" => phase_b_cold,
    "warm_renders" => phase_b_warm,
  },
  "dividend" => {
    "cold_queries_median_phase_a" => phase_a_med,
    "cold_queries_median_phase_b" => phase_b_med,
    "reduction_pct" => phase_a_med.positive? ? ((phase_a_med - phase_b_med).to_f / phase_a_med * 100).round(1) : nil,
  },
  "cleanup" => {
    "remaining_live" => remaining,
    "cards_before" => cards_before,
    "cards_after" => cards_after,
  },
}
results_dir = File.join(PROTOTYPE_ROOT, "results")
FileUtils.mkdir_p(results_dir)
out_path = File.join(results_dir, "measurement.json")
File.write(out_path, JSON.pretty_generate(results) + "\n")
puts "wrote #{out_path}"