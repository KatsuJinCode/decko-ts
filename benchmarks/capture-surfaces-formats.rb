# capture-surfaces-formats.rb -- surfaces-batch1 lane oracle capture.
#
# Captures Ruby decko bytes for the four surfaces this lane ports:
#   1. CSV format views  (card-mod-format set/all/csv.rb: :titled/:body/:row/:header/:unknown)
#   2. RSS format views  (set/all/rss.rb: :feed + friends, both rss_enabled states)
#   3. JSON format views (set/all/json.rb + set/all/data.rb: :molecule/:atom/:status)
#   4. the add_comment save event (card-mod-comment set/all/comment.rb:
#      signed-in comment append bytes under a frozen clock)
#
# NO-WRITE PROOF contract: the script REFUSES to run unless connected to a
# disposable copy matching "write-conformance-surfaces1.sqlite3". The corpus
# DB (db/corpus-v2.sqlite3) is never connected to; its sha256 is recorded
# before and after the run by the invoking shell and must be identical.
# Outputs land in fixtures/oracle-surfaces/ of the lane worktree:
#   csv.jsonl, rss.jsonl, rss-enabled.jsonl, json.jsonl, comment.jsonl
# (one JSON object per line: {card, format, view, bytes} — bytes are exact).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development \
#   DATABASE_URL=sqlite3:C:/localProjects/decko-ts-lane-surfaces1/db/write-conformance-surfaces1.sqlite3 \
#   bundle exec decko runner C:/localProjects/decko-ts-lane-surfaces1/benchmarks/capture-surfaces-formats.rb

require "json"
require "fileutils"

OUT_DIR = File.expand_path("../fixtures/oracle-surfaces", __dir__)
FileUtils.mkdir_p(OUT_DIR)

connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd)
unless File.basename(connected_file) == "write-conformance-surfaces1.sqlite3"
  raise "REFUSING: connected database is #{connected_file}; capture only runs " \
        "against the disposable write-conformance-surfaces1.sqlite3 copy"
end

def emit(file, obj)
  File.open(File.join(OUT_DIR, file), "a") { |f| f.puts(JSON.generate(obj)) }
end

def cap(file, card, format_sym, view_sym)
  bytes = yield
  emit(file, card: card.name, format: format_sym.to_s,
            view: view_sym.to_s, bytes: bytes.to_s)
rescue StandardError => e
  emit(file, card: card.name, format: format_sym.to_s,
            view: view_sym.to_s, error: "#{e.class}: #{e.message}")
end

# The substrate: real corpus cards across the types the formats meet.
names = %w[Home Latest_News Aikido_Oak_Cliff Conflict_Done_Well]
cards = names.filter_map { |n| Card.fetch(n) }
# a Search card is the csv/rss item-list case; Latest_News is one on the live deck.
search_card = Card.fetch("Latest_News")
# a pointer/rule card exercises the pointer item path
pointer_card = Card.fetch("*all+*read") || Card.fetch("*all+*create")

# ---------------------------------------------------------------- CSV
FileUtils.rm_f(File.join(OUT_DIR, "csv.jsonl"))
([search_card, pointer_card] + cards).compact.each do |card|
  fmt = card.format(:csv)
  cap("csv.jsonl", card, :csv, :show_default_titled) { fmt.show(nil, {}) }
end
# the explicit sub-views on one search card
if search_card
  fmt = search_card.format(:csv)
  cap("csv.jsonl", search_card, :csv, :header) { fmt.render_header }
  cap("csv.jsonl", search_card, :csv, :body) { fmt.render_body }
  cap("csv.jsonl", search_card, :csv, :row) { fmt.render_row }
  cap("csv.jsonl", search_card, :csv, :unknown) { fmt.render_unknown }
end

# ---------------------------------------------------------------- RSS (config default: disabled)
FileUtils.rm_f(File.join(OUT_DIR, "rss.jsonl"))
([search_card, pointer_card] + cards).compact.each do |card|
  fmt = card.format(:rss)
  cap("rss.jsonl", card, :rss, :show_default_feed) { fmt.show(nil, {}) }
end

# ---------------------------------------------------------------- RSS (enabled)
FileUtils.rm_f(File.join(OUT_DIR, "rss-enabled.jsonl"))
Cardio.config.rss_enabled = true
([search_card, pointer_card] + cards).compact.each do |card|
  fmt = card.format(:rss)
  cap("rss-enabled.jsonl", card, :rss, :show_default_feed) { fmt.show(nil, {}) }
end
if search_card
  fmt = search_card.format(:rss)
  cap("rss-enabled.jsonl", search_card, :rss, :feed_title) { fmt.render_feed_title }
  cap("rss-enabled.jsonl", search_card, :rss, :feed_description) { fmt.render_feed_description }
  cap("rss-enabled.jsonl", search_card, :rss, :feed_body) { fmt.render_feed_body }
end
Cardio.config.rss_enabled = false

# ---------------------------------------------------------------- JSON
FileUtils.rm_f(File.join(OUT_DIR, "json.jsonl"))
([search_card, pointer_card] + cards).compact.each do |card|
  fmt = card.format(:json)
  cap("json.jsonl", card, :json, :show_default_molecule) { fmt.show(nil, {}) }
  cap("json.jsonl", card, :json, :status) { fmt.render_status }
  cap("json.jsonl", card, :json, :atom) { fmt.render_atom }
end

# ---------------------------------------------------------------- add_comment event
# Frozen clock so the signature bytes are deterministic:
# "#{comment_author}.....#{Time.zone.now}" (TimeHelpers travel_to, persistent).
require "active_support/testing/time_helpers"
include ActiveSupport::Testing::TimeHelpers
travel_to(Time.zone.local(2026, 9, 29, 12, 0, 0))
FileUtils.rm_f(File.join(OUT_DIR, "comment.jsonl"))
Card::Auth.as_bot do
  target = Card.fetch("Supercard") || Card.create!(:name => "Supercard", :type_id => Card["RichText"].id)
  target.update! db_content: "body before comment"

  # 1. signed-in single-line comment
  t = Card.fetch("Supercard")
  t.update! comment: "first comment"
  emit("comment.jsonl", card: "Supercard", format: "save", view: "after_signed_in_comment",
       bytes: Card.fetch("Supercard").db_content)

  # 2. multi-line comment (clean_comment <p> wrapping, blank line -> &nbsp;)
  t = Card.fetch("Supercard")
  t.update! comment: "line one\n\nline three"
  emit("comment.jsonl", card: "Supercard", format: "save", view: "after_multiline_comment",
       bytes: Card.fetch("Supercard").db_content)

  # 3. blank comment (present but empty -> author sticky only, no append)
  t = Card.fetch("Supercard")
  before = t.db_content
  t.update! comment: ""
  emit("comment.jsonl", card: "Supercard", format: "save", view: "after_blank_comment",
       bytes: Card.fetch("Supercard").db_content,
       unchanged: (Card.fetch("Supercard").db_content == before))
end

# 4. anonymous comment author param on a card anonymous cannot edit -> denial
begin
  saved_current = Card::Auth.current_id
  Card::Auth.current_id = Card::AnonymousID
  t = Card.fetch("Supercard")
  t.update! comment: "anon should be denied"
  emit("comment.jsonl", card: "Supercard", format: "save", view: "after_anonymous_comment",
       bytes: Card.fetch("Supercard").db_content)
rescue StandardError => e
  emit("comment.jsonl", card: "Supercard", format: "save", view: "anonymous_denied",
       error: "#{e.class}: #{e.message}")
ensure
  Card::Auth.current_id = saved_current
end

# 5. signed-out author label shape via the format helper (no save needed):
#    comment_author falls to Env.params[:comment_author] || "Anonymous" when
#    no session author is sticky and nobody is signed in.
fmt = Card.fetch("Supercard").format
emit("comment.jsonl", card: "Supercard", format: "format", view: "comment_signature_anonymous",
     bytes: begin
       Card::Env.params[:comment_author] = "Riley"
       fmt.comment_signature
     ensure
       Card::Env.params.delete(:comment_author)
     end)

puts "CAPTURE DONE -> #{OUT_DIR}"
