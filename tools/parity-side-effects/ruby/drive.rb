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
require "socket"

# ---- network block: the harness makes no outgoing connection of any kind.
# Every TCP/UDP socket open is refused before it reaches the OS, so a code
# path that would call out (recaptcha verification, SMTP, cloud storage, a
# remote image fetch) fails loudly instead of leaving the machine. Each
# refusal is recorded and reported in the trace (`network_blocked`), and the
# run is marked failed if any occurred.
$NETWORK_BLOCKED = []
module ParityNetworkBlock
  def self.refuse(what, host, port)
    $NETWORK_BLOCKED << "#{what} #{host}:#{port}"
    raise Errno::ECONNREFUSED, "parity harness: outgoing network blocked (#{what} #{host}:#{port})"
  end
end
TCPSocket.singleton_class.prepend(Module.new do
  def new(host = nil, port = nil, *rest, **kw) = ParityNetworkBlock.refuse("TCPSocket", host, port)
  def open(host = nil, port = nil, *rest, **kw) = ParityNetworkBlock.refuse("TCPSocket", host, port)
end)
Socket.singleton_class.prepend(Module.new do
  def tcp(host = nil, port = nil, *rest, **kw, &blk) = ParityNetworkBlock.refuse("Socket.tcp", host, port)
  def udp_server_sockets(*a, **kw, &blk) = ParityNetworkBlock.refuse("Socket.udp", a[0], a[1])
end)
Socket.prepend(Module.new do
  def connect(addr) = ParityNetworkBlock.refuse("Socket#connect", addr.inspect, "")
  def connect_nonblock(addr, **kw) = ParityNetworkBlock.refuse("Socket#connect_nonblock", addr.inspect, "")
end)
UDPSocket.prepend(Module.new do
  def connect(host, port) = ParityNetworkBlock.refuse("UDPSocket#connect", host, port)
  def send(msg, flags, host = nil, port = nil) = ParityNetworkBlock.refuse("UDPSocket#send", host, port)
end)
Addrinfo.singleton_class.prepend(Module.new do
  def getaddrinfo(host, port = nil, *rest, **kw)
    return super if host.nil? || %w[localhost 127.0.0.1 ::1].include?(host.to_s)
    ParityNetworkBlock.refuse("getaddrinfo", host, port)
  end
end)

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
# Public links (card-mod-carrierwave attachment/local.rb create_public_links)
# go under the work directory too, never into the app's own public/ tree.
PUBLIC_DIR = File.join(WORK_DIR, "public")
FileUtils.rm_rf(PUBLIC_DIR)
FileUtils.mkdir_p(File.join(PUBLIC_DIR, "files"))
Cardio.paths["public"] = PUBLIC_DIR

# Windows grants File.symlink only with a special privilege, so the public
# link step raises there and the integrate stage swallows it (the rest of
# that stage never runs). Ruby Decko targets POSIX hosts, where the link
# succeeds, so by default the link step succeeds here too, using hard links
# (same volume, no privilege). PARITY_NATIVE_LINKS=1 keeps the Windows
# behaviour, to reproduce it.
unless ENV["PARITY_NATIVE_LINKS"] == "1"
  File.singleton_class.prepend(Module.new do
    def symlink(src, dest) = File.link(src, dest)
    def symlink?(path) = File.exist?(path)
  end)
end

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
$SWALLOWED = []
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
        # The integrate stages swallow exceptions (result.rb
        # notable_exception_raised logs and continues); record what was
        # swallowed so a missing side effect can be traced to its cause.
        if $TRACE && ev == "notable_exception_raised" && (err = Card::Error.current)
          $SWALLOWED << { card: name.to_s, error: err.class.name, message: err.message.to_s[0, 300],
                          backtrace: Array(err.backtrace).grep_v(%r{/(actionpack|activesupport|rack)-}).first(8) }
        end
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
    changes = $conn.select_rows("select field, value from card_changes where card_action_id = #{r['id']} order by id")
    stamp = $conn.select_one("select creator_id, updater_id, db_content from cards where id = #{r['card_id'].to_i}") || {}
    { card: card_name(r["card_id"]), type: ACTION_TYPES[r["action_type"].to_i] || r["action_type"].to_s,
      fields: changes.map { |c| c[0].to_i }, values: changes.map { |c| c[1].to_s },
      creator: card_name(stamp["creator_id"]), updater: card_name(stamp["updater_id"]),
      content: stamp["db_content"].to_s[0, 200] }
  end
end

# Small image files carry their bytes (base64) so the comparison can decode
# both engines' renditions with one decoder.
IMAGE_EXT = /\.(png|jpe?g|webp|gif)\z/i
def files_list
  Dir.glob(File.join(FILES_DIR, "**", "*")).select { |f| File.file?(f) }
     .map do |f|
       entry = { path: f.sub("#{FILES_DIR}/", ""), size: File.size(f) }
       entry[:b64] = [File.binread(f)].pack("m0") if f.match?(IMAGE_EXT) && File.size(f) <= 1_048_576
       entry
     end.sort_by { |h| h[:path] }
end

$MAIL_CONSUMED = 0
def drain_mail
  all = Array(ActionMailer::Base.deliveries)
  fresh = all[$MAIL_CONSUMED..] || []
  $MAIL_CONSUMED = all.length
  fresh.map do |m|
    text = m.text_part ? m.text_part.body.decoded : (m.html_part ? "" : m.body.decoded)
    html = m.html_part ? m.html_part.body.decoded : ""
    { to: Array(m.to), from: Array(m.from), from_header: m[:from].to_s,
      reply_to: Array(m.reply_to), subject: m.subject.to_s,
      text_body: text.to_s.force_encoding("UTF-8"), html_body: html.to_s.force_encoding("UTF-8") }
  end
end

$steps = []

# Who the cookie session is signed in as after the request: the session's
# user key (Card::Auth.signin writes session[session_user_key]). Reading
# Card::Auth.current_id instead would report whoever the integrate stage
# last acted as (a signup acts as the new account), not the session.
def session_user
  id = SESS.request&.session&.[](Card::Auth.session_user_key)
  id.present? && id.to_i != Card::AnonymousID ? card_name(id) : nil
rescue StandardError
  nil
end

# The Session-type card contents the visitor's session holds afterwards
# (card-mod-session set/type/session.rb session_key "_card_<key>").
def session_cards
  sess = SESS.request&.session
  return {} unless sess

  sess.to_hash.select { |k, _| k.to_s.start_with?("_card_") }
      .to_h { |k, v| [k.to_s.delete_prefix("_card_"), v] }
      .reject { |_, v| v.nil? }
rescue StandardError
  {}
end

def step(name)
  before = counts
  since = max_id("card_actions")
  files_before = files_list
  $EVENTS.clear
  $SWALLOWED.clear
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
    files: files_list - files_before, mail: drain_mail, extra: extra, swallowed: $SWALLOWED.dup,
    signed_in_as: session_user, session_cards: session_cards
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
  # An administrator, for the steps that need account-manager and
  # structure rights (skins, styles, layouts, approvals, account deletion).
  # A user's +*roles card is a virtual search in this deck; membership is
  # the role's +*members list, so the account is added there.
  unless Card["Parity Admin"]
    Card.create!(
      name: "Parity Admin", type_id: Card::UserID,
      subcards: {
        "+*account" => { subcards: {
          "+*email" => { content: "admin.probe@example.com" },
          "+*password" => { content: "Admin horse battery 5%" },
          "+*status" => { content: "active" }
        } }
      }
    )
  end
  members = Card.fetch("Administrator", :members, new: {})
  unless members.item_names.include?("Parity Admin")
    members.add_item "Parity Admin"
    members.save!
  end
  # A pending sign-up (status "pending", as an anonymous sign-up leaves it
  # when the deck requires approval) for the administrator to approve, and an
  # ordinary account for the administrator to delete.
  unless Card["Parity Pending"]
    Card.create!(
      name: "Parity Pending", type_id: Card::SignupID,
      subcards: { "+*account" => { subcards: {
        "+*email" => { content: "pending.probe@example.com" },
        "+*password" => { content: "Pending horse battery 7*" },
        "+*status" => { content: "pending" }
      } } }
    )
  end
  unless Card["Parity Leaver"]
    Card.create!(
      name: "Parity Leaver", type_id: Card::UserID,
      subcards: { "+*account" => { subcards: {
        "+*email" => { content: "leaver.probe@example.com" },
        "+*password" => { content: "Leaver horse battery 8(" },
        "+*status" => { content: "active" }
      } } }
    )
  end
end
Card::Auth.current_id = Card::AnonymousID
ActionMailer::Base.deliveries.clear
$conn.execute("PRAGMA wal_checkpoint(TRUNCATE)") rescue nil
FileUtils.cp(DB_COPY, File.join(WORK_DIR, "start-deck.sqlite3"))

FIXTURES = File.join(File.dirname(__FILE__), "..", "fixtures")
require File.join(File.dirname(__FILE__), "scenarios.rb")

puts JSON.pretty_generate({ engine: "ruby-decko", version: Gem.loaded_specs["card"]&.version&.to_s,
                            delaying: (Cardio.config.delaying rescue nil),
                            network_blocked: $NETWORK_BLOCKED, steps: $steps })
unless $NETWORK_BLOCKED.empty?
  warn "NETWORK BLOCKED #{$NETWORK_BLOCKED.length} attempt(s): #{$NETWORK_BLOCKED.uniq.join('; ')}"
  exit 3
end
