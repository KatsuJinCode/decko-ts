# warm_seeded_deck.rb -- prepare the seeded deck the side-effects drives run
# against: a LOCAL COPY of the oracle deck with the harness's probe account,
# warmed by one home-page render.
#
#   ruby warm_seeded_deck.rb <app_root> <deck sqlite> <out sqlite>
#
# WHY: (1) the harness signs in as parity.probe@example.com (scenarios.json
# signin-success) — an account a bare oracle deck does not carry; it is
# created here, as bot, the way drive.rb creates its own setup accounts.
# (2) a deck's first page render refreshes the mod asset inputs
# (card-mod-assets lib/card/assets.rb: Card::Assets.refresh on the cautious
# option fires once per fresh cache; every drive run uses a fresh cache
# directory). That render-path refresh writes card_virtuals rows (every
# "mod: x+*style" and "mod: x+*script" card's assembled asset input) — side
# effects of RENDERING, not of the write operations the harness compares,
# and the TypeScript drive answers its GET steps from the fetch layer. The
# drives therefore start from a deck whose asset inputs are already stored,
# so the compared steps isolate the WRITE-path side effects. The warm copy's
# card rows only gain the probe account; card_virtuals gains the render's
# rows.
#
# Local copies only: the source deck is never opened for write. The cache is
# a fresh directory under the output's neighbors (same directory as <out>).
require "fileutils"
require "json"

APP_ROOT = ARGV[0]
DECK_SRC = ARGV[1]
OUT = File.expand_path(ARGV[2])
FileUtils.mkdir_p(File.dirname(OUT))
FileUtils.cp(DECK_SRC, OUT)
CACHE_DIR = File.join(File.dirname(OUT), "warm-cache")
FileUtils.rm_rf(CACHE_DIR)
FileUtils.mkdir_p(CACHE_DIR)
FILES_DIR = File.join(File.dirname(OUT), "warm-files")
FileUtils.rm_rf(FILES_DIR)
FileUtils.mkdir_p(File.join(FILES_DIR, "files"))
ENV["DECKO_CACHE_DIR"] = CACHE_DIR
ENV["RAILS_ENV"] ||= "development"
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{OUT}"
ENV["RAILS_LOG_TO_STDOUT"] = nil
require File.join(APP_ROOT, "config", "environment")
Cardio.config.file_buckets = {}
Cardio.config.file_default_storage = :local
Cardio.paths["files"] = File.join(FILES_DIR, "files")
Cardio.paths["public"] = File.join(FILES_DIR, "public")
FileUtils.mkdir_p(Cardio.paths["public"])

probe = nil
Card::Auth.as_bot do
  unless Card["Parity Probe"]
    probe = Card.create!(
      name: "Parity Probe", type_id: Card::UserID,
      subcards: { "+*account" => { subcards: {
        "+*email" => { content: "parity.probe@example.com" },
        "+*password" => { content: "Correct horse battery 1!" },
        "+*status" => { content: "active" }
      } } }
    )
  end
end

SESS = ActionDispatch::Integration::Session.new(Cardio.application.class)
SESS.host! "127.0.0.1"
SESS.get "/"
status = SESS.response.status

conn = ActiveRecord::Base.connection
rows = conn.select_one("select count(*) as n from card_virtuals")["n"]
cards = conn.select_one("select count(*) as n from cards")["n"]
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)") rescue nil
puts JSON.generate({ status: status, card_virtuals: rows, cards: cards,
                     probe_created: !probe.nil?, out: OUT })
exit(status == 200 && rows.to_i > 0 ? 0 : 1)
