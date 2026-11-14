# capture-dual-lane-page-and-view.rb -- dual-lane ground-truth capture.
#
# INSTRUMENT HARDENING: this is the tracked home of the instrument
# (tools/oracle/ in the decko-ts repo; the capture runner stages a
# sha256-verified copy and records captureScriptSha256 in
# expected-v2/capture-manifest.json, so a photograph names the exact camera
# bytes that took it). Two hardening mechanisms below:
#
#   READ-ONLY CORPUS -- the corpus connection is READ-ONLY, enforced and
#         PROVEN. The runner passes DATABASE_URL=sqlite3:<path>?readonly=true
#         (verified mechanism: activerecord 7.2.3.2 passes URL query params
#         through into SQLite3::Database.new, whose options[:readonly]
#         selects SQLITE_OPEN_READONLY). Below, inside the existing DB
#         guard, the instrument additionally sets PRAGMA query_only=1,
#         asserts it reads back 1, and runs a write probe (UPDATE ...
#         WHERE 0) that MUST be refused -- any boot-time write attempt now
#         fails loudly instead of silently forking state. (Also closes the
#         corpus side of the production-db write class: with readonly +
#         query_only the corpus cannot be written from this boot, whatever
#         else the render path does.)
#   FROZEN CLOCK -- the clock is FROZEN for every photographed card. The
#         `*now` card's content is code-derived wall clock
#         (card-mod-date-0.20.0 set/self/now.rb:
#         content = I18n.localize(Time.now, format: :card_dayofwk_min_tz)),
#         so every capture used to carry its own capture minute inside the
#         `*now` record and any view embedding it. Each card's lane V +
#         lane P renders (and its record read) now run inside
#         ActiveSupport::Testing::TimeHelpers#travel_to pinned to
#         FROZEN_EPOCH -- a constant chosen once, never moved. Photographs
#         carry no wall clock; the frozen epoch is printed at start so any
#         clock-bearing bytes are self-identifying. travel_to does not reach
#         Date.parse's completion of a partial date (done in C from the real
#         clock), so the rig completes those from the frozen day itself
#         (frozen_date_parse below).
#
# WHY THIS EXISTS: the single-lane instrument (capture-disputed-corpus-raw.rb)
# captured only bare `card.format.render(view)` bytes -- no layout resolver, no
# main! context, no {{_main}} nest -- while the live serving path renders every
# page through `show_with_page_layout` (main! + per-card `*layout` rule +
# layout's `{{_main|<view>}}` + wrap_with_html_page). This
# script captures TWO lanes per card so the two goals stop being conflated.
# The old script is left untouched; this is a NEW script writing NEW files.
#
# LANE P ("page", the live-serving shape): per card, after `Card::Env.reset`
#   (anonymous viewer, no params, no ajax -- matches a public GET), the exact
#   entry the live controller reaches (decko rest.rb read -> show ->
#   format.page -> HtmlFormat#show -> show_with_page_layout):
#
#       card.format(:html).show(nil, {})
#
#   The layout is resolved per card (params[:layout] || layout_for_view ||
#   rule_card(:layout) first item || :default), main! is set, the layout's
#   `{{_main}}` chunk names the main view (e.g. titled for Default Layout,
#   content for Home Layout 1), and the result is wrapped in the full HTML
#   document. Ruby errors ARE valid expected bytes here (degenerate layouts,
#   missing cards) and are recorded verbatim as CAPTURE_ERROR sentinels
#   instead of being skipped. Recorded per card alongside the bytes:
#     layout_rule      -- the per-card *layout rule's first item name
#                         (rule_card(:layout).first_name; nil when the rule
#                         content is empty -- note first_name is the point-list
#                         first item, so an EMPTY rule resolves to :default,
#                         not UnknownLayout)
#     layout           -- the resolved layout name (e.g. "Default Layout",
#                         "Home Layout 1") or ":default" (built-in code layout)
#     layout_main_view -- {raw:, effective:} view the layout's {{_main}}
#                         requests (effective = raw || default_html_view)
#     format_main      -- format.main? asserted true after a successful show
#
#   Cloud-bucket delta inside this script: lane P temporarily installs the
#   dummy `my_bucket` credentials (same shape as compile-oracle-assets.rb
#   79-87 / capture-home-content-view.rb 51-59) so attachment-dependent pages
#   render instead of raising "couldn't find credentials". The bucket is
#   REMOVED again before the next card's lane V so lane V stays byte-identical
#   to the old capture's environment (which had no bucket configured and
#   produced the known CAPTURE_ERROR sentinels on attachment-heavy views).
#
# LANE V ("view", the pure view-function shape): byte-compatible replay of
#   capture-disputed-corpus-raw.rb:133 -- `card.format.render(view.to_sym)` in
#   the same VIEW_ORDER, same normalize, same CAPTURE_ERROR sentinels. This is
#   view-function parity ONLY and must never be presented as live-page parity.
#
# OUTPUT (new tree; nothing under expected/ is touched):
#   tmp/raw-ground-truth/expected-v2/page-lane/recapture-raw-shard-NNNNNN.jsonl
#   tmp/raw-ground-truth/expected-v2/view-lane/recapture-raw-shard-NNNNNN.jsonl
#   (sample mode: page-lane/<label>.jsonl and view-lane/<label>.jsonl)
# One JSON line per card: compact, deeply-sorted keys, rendered bytes exactly
# as Ruby wrote them (slot ids included). Page lines add lane/layout fields;
# view lines add the lane field and otherwise match the old shard schema.
#
# MODES
#   FULL   (default): the whole disputed set (scripts/disputed-set-resolved.json),
#          grouped by its 48 shards; complete shards are resume-skipped the
#          same way the old capture skipped them.
#   SAMPLE: set DUAL_LANE_SAMPLE to a JSON file of the form
#          {"label": "...", "cards": [{"id":..., "name":..., "views":[...]}]}
#          (see dual-lane-recapture-sample-cards.json next to this script).
#          Sample files are always rewritten (no resume-skip).
#
# DATABASE GUARD: runs only against a database whose basename is
#   corpus-v2.sqlite3, and only (a) at the canonical
#   tmp/raw-ground-truth/deck/ location, or (b) wherever DUAL_LANE_DB points
#   (explicitly set -- the isolated-copy convention used while a verifier
#   round holds the original sqlite). The connection must additionally be
#   read-only, and the script proves it (PRAGMA query_only + write probe).
#
# FULL RUN (from tools/oracle/decko-oracle-app; <checkout> is this repo):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:<checkout>/tmp/raw-ground-truth/deck/corpus-v2.sqlite3?readonly=true \
#   bundle exec decko runner <checkout>/tools/oracle/capture-dual-lane-page-and-view.rb
#
# SAMPLE RUN (isolated deck copy, same app):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:<checkout>/tmp/raw-ground-truth/deck-dual-lane-sample/corpus-v2.sqlite3?readonly=true \
#   DUAL_LANE_DB=<checkout>/tmp/raw-ground-truth/deck-dual-lane-sample/corpus-v2.sqlite3 \
#   DUAL_LANE_SAMPLE=<checkout>/tmp/raw-ground-truth/scripts/dual-lane-recapture-sample-cards.json \
#   bundle exec decko runner <checkout>/tools/oracle/capture-dual-lane-page-and-view.rb

require "json"
require "fileutils"

# This script always runs from its STAGED copy
# (<worktree>/tmp/raw-ground-truth/scripts/, where the capture runner puts a
# sha256-verified copy), so the tree root is two levels up from this file --
# the same result whether it is ever run from the tracked location.
WORKTREE_ROOT = File.expand_path("../..", __dir__)   # the repo checkout root
GT_ROOT = File.join(WORKTREE_ROOT, "tmp", "raw-ground-truth")  # instrument tree
DISPUTED_RESOLVED = File.join(GT_ROOT, "scripts", "disputed-set-resolved.json")
OUT_ROOT = File.join(GT_ROOT, "expected-v2")
PAGE_DIR = File.join(OUT_ROOT, "page-lane")
VIEW_DIR = File.join(OUT_ROOT, "view-lane")
LOG_PATH = File.join(OUT_ROOT, "capture-dual-lane.log")

CANONICAL_DECK_DIR = File.join(GT_ROOT, "deck")
SAMPLE_PATH = ENV["DUAL_LANE_SAMPLE"]

# ---- Rails file-cache isolation (same convention as the old capture) --------
CACHE_DIR = File.join(WORKTREE_ROOT, "tools", "oracle", "decko-oracle-app",
                      "tmp", "cache")

def clear_rails_cache!
  FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))
end

clear_rails_cache!
at_exit { clear_rails_cache! }

# ---- guard: only ever run against the RAW corpus (canonical or DUAL_LANE_DB) -
connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd)
unless File.basename(connected_file) == "corpus-v2.sqlite3"
  raise "REFUSING: connected database is #{connected_file}; dual-lane capture " \
        "only runs against a corpus-v2.sqlite3 raw deck (set DATABASE_URL)"
end
unless File.dirname(connected_file) == CANONICAL_DECK_DIR || ENV["DUAL_LANE_DB"]
  raise "REFUSING: #{connected_file} is outside #{CANONICAL_DECK_DIR} and " \
        "DUAL_LANE_DB is not set; pass DUAL_LANE_DB=<path> to acknowledge an " \
        "isolated corpus copy"
end

# ---- read-only corpus, enforced and proven -------------------------------
# The runner opens the corpus with DATABASE_URL ...?readonly=true
# (SQLITE_OPEN_READONLY via SQLite3::Database.new options[:readonly]). That
# flag is boot-time protection; here, inside the guard, it is PROVEN:
#   1. the raw connection reports readonly?;
#   2. PRAGMA query_only is set to 1 and reads back 1 (connection-level write
#      block, works even if the file had been opened read-write);
#   3. a write probe (UPDATE ... WHERE 0 -- matches nothing, changes no bytes
#      on a writable connection) is REFUSED. A writable connection raising
#      nothing here fails the capture loudly.
raw_connection = ActiveRecord::Base.connection.raw_connection
if raw_connection.respond_to?(:readonly?) && !raw_connection.readonly?
  puts "WARNING: corpus connection did NOT open READONLY " \
       "(DATABASE_URL should carry ?readonly=true); relying on PRAGMA query_only"
end
ActiveRecord::Base.connection.execute("PRAGMA query_only = 1")
query_only = ActiveRecord::Base.connection.select_value("PRAGMA query_only")
unless query_only.to_i == 1
  raise "REFUSING: corpus connection is writable (PRAGMA query_only=" \
        "#{query_only.inspect}); the capture must photograph a read-only corpus"
end
write_refused = false
begin
  ActiveRecord::Base.connection.execute("UPDATE cards SET id = id WHERE 0")
rescue ActiveRecord::StatementInvalid, SQLite3::Exception => e
  write_refused = true
  puts "write probe: write refused as required (#{e.class})"
end
unless write_refused
  raise "REFUSING: corpus connection executed a write (UPDATE ... WHERE 0 was " \
        "not refused); the capture must be read-only"
end

# ---- frozen clock -------------------------------------------------------------
# travel_to pins Time.now (and Date/DateTime) to FROZEN_EPOCH for the duration
# of each card's photograph; travel_back restores between cards. The epoch is
# a constant chosen once (the corpus generation date at noon UTC) and never
# moved: changing it changes every clock-bearing byte of every photograph.
require "active_support/testing/time_helpers"
module CaptureFrozenClock
  FROZEN_EPOCH = Time.utc(2026, 9, 19, 12, 0, 0).freeze
  extend ActiveSupport::Testing::TimeHelpers

  class << self
    def frozen?
      @frozen == true
    end

    def with_frozen_clock
      travel_to(FROZEN_EPOCH)
      @frozen = true
      yield
    ensure
      @frozen = false
      travel_back
    end
  end
end

# BEGIN frozen_date_parse (evaluated by capture-frozen-date-parse.test.rb)
# travel_to stubs Date.today, but Date.parse completes a partial date (no year,
# or no year and month) inside C (date_core.c rt_complete_frags calls
# date_s_today directly), which reads the real wall clock. A corpus card whose
# view renders a partial date would thus photograph the capture day's month
# while every other clock-bearing byte showed the frozen epoch. While the
# clock is frozen, Date.parse completes the civil shapes the
# C code completes from today -- {mday}, {mon}, {mon, mday} -- from the stubbed
# Date.today instead, exactly as rt_complete_frags does (leading missing civil
# fields from today, trailing ones default to 1). Any other partial shape that
# would read today raises, so a wall-clock byte can never be photographed
# silently. Inputs that carry a year (or jd / cwyear / seconds) never read
# today and go straight to the C implementation.
module CaptureFrozenDateParse
  NO_TODAY_KEYS = %i[year jd cwyear seconds].freeze
  OTHER_DATE_KEYS = %i[yday cweek cwday wday wnum0 wnum1].freeze

  def parse(string = "-4712-01-01", comp = true, start = Date::ITALY, limit: 128)
    return super unless CaptureFrozenClock.frozen?

    frags = Date._parse(string, comp, limit: limit)
    # Nothing parsed: the C code raises "invalid date" without reading today.
    return super if frags.empty? || NO_TODAY_KEYS.any? { |k| frags.key?(k) }

    unless (frags.keys & OTHER_DATE_KEYS).empty? && (frags.key?(:mon) || frags.key?(:mday))
      raise "CaptureFrozenDateParse: Date.parse(#{string.inspect}) would complete " \
            "#{frags.inspect} from the wall clock; this shape is not ported"
    end

    today = Date.today
    mon = frags[:mon] || today.mon
    mday = frags[:mday] || 1
    raise Date::Error, "invalid date" unless Date.valid_civil?(today.year, mon, mday, start)

    Date.civil(today.year, mon, mday, start)
  end
end
Date.singleton_class.prepend(CaptureFrozenDateParse)
# END frozen_date_parse

# ---- input -------------------------------------------------------------------
if SAMPLE_PATH
  raise "DUAL_LANE_SAMPLE missing: #{SAMPLE_PATH}" unless File.exist?(SAMPLE_PATH)

  sample_data = JSON.parse(File.read(SAMPLE_PATH))
  FILE_LABEL = sample_data["label"] || File.basename(SAMPLE_PATH, ".json")
  CARDS = sample_data["cards"].select { |c| c["name"] }
  BY_SHARD = nil
else
  raise "disputed-resolved missing: #{DISPUTED_RESOLVED}" unless File.exist?(DISPUTED_RESOLVED)

  disputed = JSON.parse(File.read(DISPUTED_RESOLVED))
  all_cards = disputed["cards"]
  FILE_LABEL = "recapture-raw"
  CARDS = all_cards.select { |c| !c["id"].nil? && !c["name"].nil? }
  puts "disputed cards total: #{all_cards.size}, valid+resolved: #{CARDS.size}, " \
       "skipped null-id: #{all_cards.size - CARDS.size}"
  BY_SHARD = CARDS.group_by { |c| c["shard"] }
end

# ---- normalize / serialize helpers (identical to the old capture) -----------
SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
# Slot ids are stored exactly as Ruby wrote them (value and quote style);
# graders mask the random value at compare time.
def normalize(html)
  html
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def capture_error(e)
  "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
end

def capture_error?(str)
  str.is_a?(String) && str.start_with?("CAPTURE_ERROR:")
end

def card_attributes(card)
  {
    "id" => card.id,
    "name" => card.name.to_s,
    "key" => card.key,
    "type" => card.type_name.to_s,
    "type_code" => card.type_code.to_s,
    "codename" => card.codename&.to_s,
    "content" => card.content,
    "left" => card.name.simple? ? nil : card.name.left_name.to_s,
    "right" => card.name.simple? ? nil : card.name.right_name.to_s
  }
end

VIEW_ORDER = %w[title closed open content].freeze

def safe(&block)
  yield
rescue StandardError => e
  capture_error(e)
end

# ---- lane V: byte-compatible replay of capture-disputed-corpus-raw.rb:133 ---
def capture_view_lane(entry, card)
  wanted = VIEW_ORDER.select { |v| entry["views"].include?(v) }
  views = {}
  wanted.each do |view|
    views[view] = normalize(card.format.render(view.to_sym))
  rescue StandardError => e
    views[view] = capture_error(e)
  end
  { "id" => card.id, "lane" => "view", "name" => entry["name"],
    "record" => card_attributes(card), "views" => views }
end

# ---- lane P: the live-serving shape ------------------------------------------
# The old capture ran WITHOUT any cloud bucket configured; lane V above must
# reproduce that environment byte-for-byte. Lane P needs four production-
# equivalent settings the development boot does not give it:
#
#   1. dummy `my_bucket` credentials (same fix as compile-oracle-assets.rb
#      79-87) so attachment-dependent pages render instead of raising
#      "couldn't find credentials";
#   2. `raise_all_rendering_errors = false` (the production default,
#      card-1.110.0/lib/cardio/railtie.rb:38; card-1.110.0's
#      config/environments/development.rb:39 sets it true and this capture
#      boots RAILS_ENV=development). Without the flip, a nested view error
#      re-raises page-wide instead of producing the quiet inline
#      `<span class="render-error">Error rendering: ...</span>` the serving
#      path renders;
#   3. `Rails.env = "production"` while the page renders: html error.rb:91
#      `show_all_errors? = Auth.always_ok? || Rails.env.development?` — under
#      development the quiet error span carries an admin backtrace tooltip
#      an anonymous visitor never sees. The only other render-path gate on
#      Rails.env is a dev-only StUb debug log (no byte effect);
#   4. `Cardio.config.deck_origin` is set to the serving origin: Env.origin
#      (used by card_url for decko.rootUrl and every absolute URL in page
#      bytes) falls back to deck_origin when there is no request, and the
#      expectations must carry the same origin the served pages carry;
#   5. `Cardio.config.default_html_view = :content`: html default_nest_view
#      (set/all/html.rb:17) reads this config for every nest WITHOUT an
#      explicit view. The railtie default (card-mod-format mod/format.rb:2)
#      is :titled, but the serving deck's pages render implicit child nests
#      as content-view, so that deck configures :content; the TS engine's
#      defaultNestView() returning "titled" (format.ts:605) carries the
#      railtie default and does not match this deck's configuration;
#   6. the previous values are restored before the next card's lane V so
#      lane V stays byte-identical to the old capture's environment.
def with_capture_page_bucket
  Cardio.config.file_buckets ||= {}
  added = false
  unless Cardio.config.file_buckets.key?(:my_bucket)
    Cardio.config.file_buckets[:my_bucket] = {
      provider: "AWS",
      subdirectory: "files",
      credentials: { provider: "AWS", aws_access_key_id: "DUMMY", aws_secret_access_key: "DUMMY" },
      public: true,
    }
    added = true
  end
  old_raise_all = Cardio.config.raise_all_rendering_errors
  old_rails_env = Rails.env
  old_deck_origin = Cardio.config.deck_origin
  old_default_html_view = Cardio.config.default_html_view
  Cardio.config.raise_all_rendering_errors = false
  Rails.env = "production"
  Cardio.config.deck_origin = "https://culturesmith.com"
  Cardio.config.default_html_view = :content
  yield
ensure
  Cardio.config.default_html_view = old_default_html_view
  Cardio.config.deck_origin = old_deck_origin
  Rails.env = old_rails_env
  Cardio.config.raise_all_rendering_errors = old_raise_all
  Cardio.config.file_buckets.delete(:my_bucket) if added
end

def capture_page_lane(entry, card)
  fmt = card.format(:html)
  layout_rule = safe { fmt.send(:layout_name_from_rule) }
  resolved_obj = nil
  layout = safe do
    resolved_obj = fmt.send(:page_layout, nil)
    resolved_obj.to_s
  end

  row = { "id" => card.id, "lane" => "page", "layout" => layout,
          "layout_rule" => layout_rule, "name" => entry["name"],
          "record" => card_attributes(card) }

  page_html = nil
  with_capture_page_bucket do
    page_html = safe { normalize(fmt.show(nil, {})) }
  end

  if capture_error?(page_html)
    row["error"] = page_html
    return row
  end

  main_opts = safe { Card::Layout.main_nest_opts(resolved_obj, fmt) }
  raw_view = main_opts.is_a?(Hash) ? main_opts[:view] : nil
  row["format_main"] = safe { fmt.main? }
  row["layout_main_view"] =
    { "effective" => (raw_view || Cardio.config.default_html_view).to_s,
      "raw" => raw_view&.to_s }
  row["page_html"] = page_html
  row
end

def nil_card_row(entry, lane)
  { "error" => capture_error(RuntimeError.new("Card.fetch returned nil")),
    "id" => entry["id"], "lane" => lane, "name" => entry["name"] }
end

# BEGIN capture_identity_error (extracted and tested by capture-identity.test.rb)
# The input set names the card id each entry must photograph. When the deck
# being captured does not hold that card, Card.fetch can still return a
# not-found placeholder (id nil) or a different card, and rendering it would
# record the placeholder's bytes as the expected output for a card the graded
# deck does hold. Such a row is a capture error, never an expectation.
def capture_identity_error(entry, card)
  want = entry["id"]
  return nil if want.nil? || card.nil? || card.id == want

  got = card.id.nil? ? "a not-found placeholder (id nil)" : "id #{card.id}"
  "CAPTURE_ERROR: IdentityMismatch: input id #{want} but Card.fetch returned #{got}; " \
    "the capture deck does not hold the input card"
end

def identity_error_row(entry, lane, message)
  { "error" => message, "id" => entry["id"], "lane" => lane, "name" => entry["name"] }
end
# END capture_identity_error

# ---- driver ------------------------------------------------------------------
FileUtils.mkdir_p(PAGE_DIR)
FileUtils.mkdir_p(VIEW_DIR)
FileUtils.mkdir_p(File.dirname(LOG_PATH))

def log_line(line)
  puts line
  File.open(LOG_PATH, "a") { |lf| lf.puts(line) }
end

puts "DB connected: #{connected_file}"
puts "DUAL_LANE_DB: #{ENV['DUAL_LANE_DB'] || '(unset, canonical deck)'}"
puts "mode: #{SAMPLE_PATH ? "SAMPLE (#{SAMPLE_PATH})" : 'FULL (disputed set)'}"
puts "output: #{PAGE_DIR}"
puts "output: #{VIEW_DIR}"
puts "capture_boot_pid=#{$$}"
puts "corpus read-only: PRAGMA query_only=1 enforced (DATABASE_URL readonly)"
puts "clock frozen at #{CaptureFrozenClock::FROZEN_EPOCH.utc.iso8601} for every photographed card"

started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

shards = BY_SHARD || { FILE_LABEL => CARDS }
# BEGIN shard_filter (evaluated by capture-identity.test.rb)
# DUAL_LANE_SHARDS (FULL mode only): comma-separated input shard names
# ("shard-000003.jsonl,...") this process captures, so several capture
# processes can split the 48 shards between them. Unset = every shard.
shard_filter = ENV["DUAL_LANE_SHARDS"].to_s.split(",").map(&:strip).reject(&:empty?)
unless shard_filter.empty?
  raise "DUAL_LANE_SHARDS is a FULL-mode option" unless BY_SHARD
  unknown = shard_filter - shards.keys
  raise "DUAL_LANE_SHARDS names unknown shards: #{unknown.join(', ')}" unless unknown.empty?
  shards = shards.slice(*shard_filter)
  puts "shard filter: #{shards.keys.sort.join(',')}"
end
# END shard_filter
shards.keys.sort.each do |shard_name|
  slice = BY_SHARD ? shards[shard_name].sort_by { |c| [c["shard"], c["name"]] }
                   : shards[shard_name]
  file_name = BY_SHARD ? "#{FILE_LABEL}-#{shard_name}" : "#{shard_name}.jsonl"
  page_path = File.join(PAGE_DIR, file_name)
  view_path = File.join(VIEW_DIR, file_name)
  expected = slice.size
  if BY_SHARD && File.exist?(page_path) && File.exist?(view_path) &&
     File.foreach(page_path).count == expected &&
     File.foreach(view_path).count == expected
    puts "skip #{shard_name} (complete: #{expected} cards, both lanes)"
    next
  end

  tmp_page = "#{page_path}.tmp"
  tmp_view = "#{view_path}.tmp"
  t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  page_errors = 0
  view_errors = 0
  File.open(tmp_page, "w") do |pf|
    File.open(tmp_view, "w") do |vf|
      slice.each do |entry|
        # The whole photograph of this card -- Env reset, record read,
        # lane V renders, lane P render -- happens under the frozen clock.
        CaptureFrozenClock.with_frozen_clock do
          Card::Env.reset
          card = Card.fetch(entry["name"])

          if card.nil?
            view_errors += 1
            page_errors += 1
            page_row = nil_card_row(entry, "page")
            view_row = nil_card_row(entry, "view")
          elsif (identity_error = capture_identity_error(entry, card))
            view_errors += 1
            page_errors += 1
            page_row = identity_error_row(entry, "page", identity_error)
            view_row = identity_error_row(entry, "view", identity_error)
          else
            view_row = capture_view_lane(entry, card)
            view_errors += 1 if view_row["views"].values.any? { |v| capture_error?(v) }
            page_row = capture_page_lane(entry, card)
            page_errors += 1 if page_row["error"]
          end

          pf.write(JSON.generate(deep_sort(page_row)) + "\n")
          vf.write(JSON.generate(deep_sort(view_row)) + "\n")
        end
      end
    end
  end
  File.rename(tmp_page, page_path)
  File.rename(tmp_view, view_path)

  elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0
  log_line format("%s shard=%s cards=%d page_errors=%d view_errors=%d seconds=%.1f total_elapsed=%.1f",
                  Time.now.strftime("%H:%M:%S"), shard_name, slice.size,
                  page_errors, view_errors, elapsed,
                  Process.clock_gettime(Process::CLOCK_MONOTONIC) - started)

  begin
    Card.cache.reset
  rescue StandardError => e
    puts "cache reset unavailable (#{e.class}); continuing"
  end
end

done = Dir.children(PAGE_DIR).count { |f| f.end_with?(".jsonl") }
puts "DONE dual_lane_shards=#{done} cards=#{CARDS.size}"
puts "resume command: re-run this script unchanged (complete shards are skipped)"
