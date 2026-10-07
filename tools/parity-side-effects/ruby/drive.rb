# drive.rb -- boot the Ruby Decko oracle in-process against a LOCAL COPY of
# the deck and drive a fixed operation sequence (scenarios.rb) through its
# HTTP (Rack) interface, recording every observable side effect as JSON.
#
#   ruby drive.rb <app_root> <seeded_deck.sqlite3> <work_dir>
#
# Writes:
#   <work_dir>/ruby-deck.sqlite3   the working copy the scenarios mutate
#   <work_dir>/start-deck.sqlite3  the deck after the shared setup step,
#                                  before any scenario: the TypeScript drive
#                                  starts from this exact file
#   <work_dir>/files/              uploaded files and their variants
#   stdout                         the JSON trace
#
# Local copies only: the source deck is never opened for write. Email is
# captured (ActionMailer :test delivery), never delivered. File storage is
# forced to the local work directory and cloud buckets are removed, so an
# upload can never reach a network store.

require "json"
require "fileutils"

APP_ROOT = ARGV[0]
DECK_SRC = ARGV[1]
WORK_DIR = File.expand_path(ARGV[2])

FileUtils.mkdir_p(WORK_DIR)
DB_COPY = File.join(WORK_DIR, "ruby-deck.sqlite3")
FileUtils.cp(DECK_SRC, DB_COPY)
FILES_DIR = File.join(WORK_DIR, "files")
FileUtils.rm_rf(FILES_DIR)
FileUtils.mkdir_p(FILES_DIR)

# The app's shared file cache (tmp/cache) holds account and permission state
# from earlier runs against other deck copies. Reusing it made a correctly
# signed-in session resolve to Anonymous (every signed-in write answered
# 403). Every run gets its own empty cache directory.
CACHE_DIR = File.join(WORK_DIR, "cache")
FileUtils.rm_rf(CACHE_DIR)
FileUtils.mkdir_p(CACHE_DIR)
ENV["DECKO_CACHE_DIR"] = CACHE_DIR

ENV["RAILS_ENV"] ||= "development"
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DB_COPY}"
ENV["RAILS_LOG_TO_STDOUT"] = nil
require File.join(APP_ROOT, "config", "environment")
require "rack/test"

# ---- storage: local work directory only, no buckets.
Cardio.config.file_buckets = {}
Cardio.config.file_default_storage = :local
Cardio.paths["files"] = FILES_DIR

# ---- recaptcha off: with keys configured, the :recaptcha validation event
# calls Google's siteverify endpoint for every anonymous save. The harness
# makes no network calls, and the TypeScript side runs with the guard
# unconfigured, so both engines run with recaptcha_keys? false. The verify
# URL is pointed at a closed local port as a second guard.
Cardio.config.recaptcha_site_key = nil
Cardio.config.recaptcha_secret_key = nil
Cardio.config.recaptcha_public_key = nil
Cardio.config.recaptcha_private_key = nil
Cardio.config.recaptcha_verify_url = "http://127.0.0.1:9/recaptcha-disabled"
# The mod's after_card hook re-derives the keys (falling back to built-in
# development keys) whenever the card layer reloads, so the config writes
# above do not stick; the key loader and the guard are overridden too, once
# the card layer has loaded (see disable_recaptcha! below).
def disable_recaptcha!
  Card.fetch("*all")
  RecaptchaCard.singleton_class.prepend(Module.new { def load_recaptcha_config(*) = nil }) if defined?(RecaptchaCard)
  Card::Set::All::Recaptcha.prepend(Module.new { def recaptcha_keys? = false })
  raise "recaptcha guard still armed" if Card.new(name: "Recaptcha Probe").recaptcha_keys?
end

# ---- mail capture: nothing leaves the machine.
require "action_mailer/test_helper"
ActionMailer::Base.delivery_method = :test
ActionMailer::Base.perform_deliveries = true
Card::Mailer.perform_deliveries = true
ActionMailer::Base.deliveries.clear

$conn = ActiveRecord::Base.connection

# ---- event trace: every event body (`<event>_without_callbacks`, defined
# by Card::Set::Event#define_simple_method) logs [card name, event] when it
# runs. The wrapper is prepended to each set module that defines events.
$EVENTS = []
$TRACE = false
MODULE_NAME = Module.instance_method(:name)
ObjectSpace.each_object(Module).select { |m| MODULE_NAME.bind(m).call.to_s.start_with?("Card::Set::") }.each do |mod|
  names = (mod.instance_methods(false) + mod.private_instance_methods(false))
          .grep(/_without_callbacks\z/)
  next if names.empty?

  wrapper = Module.new do
    names.each do |mn|
      ev = mn.to_s.sub(/_without_callbacks\z/, "")
      define_method(mn) do |*a, **k, &b|
        $EVENTS << [name.to_s, ev] if $TRACE
        super(*a, **k, &b)
      end
    end
  end
  mod.prepend(wrapper)
end

TABLES = %w[cards card_acts card_actions card_changes card_references
            card_revisions sessions users delayed_jobs].freeze

def counts
  TABLES.each_with_object({}) do |t, h|
    h[t] = begin
      $conn.select_value("select count(*) from #{t}").to_i
    rescue StandardError
      0
    end
  end
end

def max_id(table)
  $conn.select_value("select coalesce(max(id),0) from #{table}").to_i
end

def card_name(id)
  return nil if id.nil?
  Card.fetch(id.to_i, skip_modules: true, look_in_trash: true)&.name.to_s
rescue StandardError => e
  "?#{id} #{e.class}"
end

ACTION_TYPES = %w[create update delete].freeze

def new_actions(since)
  $conn.select_all("select id, card_id, action_type from card_actions where id > #{since} order by id").to_a.map do |r|
    fields = $conn.select_values("select field from card_changes where card_action_id = #{r['id']} order by id")
    { card: card_name(r["card_id"]), type: ACTION_TYPES[r["action_type"].to_i] || r["action_type"].to_s,
      fields: fields.map(&:to_i) }
  end
end

def files_list
  Dir.glob(File.join(FILES_DIR, "**", "*")).select { |f| File.file?(f) }
     .map { |f| { path: f.sub("#{FILES_DIR}/", ""), size: File.size(f) } }.sort_by { |h| h[:path] }
end

$MAIL_CONSUMED = 0
def drain_mail
  all = Array(ActionMailer::Base.deliveries)
  fresh = all[$MAIL_CONSUMED..] || []
  $MAIL_CONSUMED = all.length
  fresh.map do |m|
    text = m.text_part ? m.text_part.body.decoded : m.body.decoded
    { to: Array(m.to), from: Array(m.from), subject: m.subject.to_s, body_excerpt: text.to_s[0, 600] }
  end
end

$steps = []

def step(name)
  before = counts
  since = max_id("card_actions")
  files_before = files_list
  $EVENTS.clear
  $TRACE = true
  $status = nil
  $headers = {}
  $body = ""
  extra = nil
  begin
    yield
  rescue StandardError => e
    extra = { raised: e.class.name, error: e.message.to_s[0, 300],
              backtrace: e.backtrace.grep_v(/actionpack|activesupport|rack/).first(6) }
  ensure
    $TRACE = false
  end
  after = counts
  delta = after.keys.each_with_object({}) { |k, h| h[k] = after[k] - before[k] }
  $steps << {
    step: name, status: $status, headers: $headers, body: $body, delta: delta,
    actions: new_actions(since), events: $EVENTS.dup,
    files: files_list - files_before, mail: drain_mail, extra: extra,
    signed_in_as: (Card::Auth.current_id == Card::AnonymousID ? nil : card_name(Card::Auth.current_id))
  }
end

SESS = ActionDispatch::Integration::Session.new(Cardio.application.class)
SESS.host! "127.0.0.1"

def call(method, path, params = nil, headers = {})
  path = path.gsub(" ", "%20")
  args = {}
  args[:params] = params if params
  args[:headers] = headers unless headers.empty?
  SESS.send(method, path, **args)
  $status = SESS.response.status
  $headers = SESS.response.headers.to_h.select { |k, _| %w[content-type location].include?(k.downcase) }
  $body = SESS.response.body.to_s[0, 200_000]
end

def upload(path, mime)
  Rack::Test::UploadedFile.new(path, mime, true)
end

disable_recaptcha!

# ---- shared setup: a second account that follows every card, so follower
# notifications are observable. Run as the deck's bot (the first-user setup
# path); the deck written here is the start state for BOTH engines.
Card::Auth.as_bot do
  unless Card["Parity Follower"]
    Card.create!(
      name: "Parity Follower", type_id: Card::UserID,
      subcards: { "+*account" => { subcards: {
        "+*email" => { content: "follower.probe@example.com" },
        "+*password" => { content: "Follower horse battery 3#" },
        "+*status" => { content: "active" }
      } } }
    )
  end
  Card.create!(name: "*all+Parity Follower+*follow", content: "*always") unless Card["*all+Parity Follower+*follow"]
end
Card::Auth.current_id = Card::AnonymousID
ActionMailer::Base.deliveries.clear
$conn.execute("PRAGMA wal_checkpoint(TRUNCATE)") rescue nil
FileUtils.cp(DB_COPY, File.join(WORK_DIR, "start-deck.sqlite3"))

FIXTURES = File.join(File.dirname(__FILE__), "..", "fixtures")
require File.join(File.dirname(__FILE__), "scenarios.rb")

puts JSON.pretty_generate({ engine: "ruby-decko", version: Gem.loaded_specs["card"]&.version&.to_s,
                            delaying: (Cardio.config.delaying rescue nil), steps: $steps })
