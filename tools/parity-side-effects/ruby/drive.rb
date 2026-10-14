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

# ---- production-style error handling. A deployed Decko site does not serve
# Rails' developer exception page, so recording one into the committed trace
# would put this machine's absolute paths (gem paths, AppData, the work
# directory) into a file that ships. Two settings decide what an unhandled
# exception answers, and both differ between development and what a deployed
# site runs:
#
#   rescue_all_in_controller  Decko's own config/environments/production.rb
#     (decko-0.20.0 :1-3) sets it true; the Railtie defaults it false
#     (decko/railtie.rb:9) and the development environment never changes it.
#     True makes CardController rescue StandardError and render the error
#     view for its class (card_controller/errors.rb:18 handle_exception,
#     card/error.rb:46 ServerError) — card-mod-format's server_error.haml,
#     "Wild Card! / 500 Server Error / Yuck, sorry about that.", with no
#     message and no backtrace.
#
#   consider_all_requests_local  card-1.110.0's own production environment
#     (config/environments/production.rb:17) sets it false; its development
#     environment (:25) sets it true. It becomes
#     "action_dispatch.show_detailed_exceptions" (rails application.rb:318),
#     which is what DebugExceptions checks before rendering the developer
#     page (debug_exceptions.rb:61); with it false, anything that still
#     escapes the controller reaches the public error response instead.
#
# Both are applied to the recording only, and only these two: the rest of the
# development environment (reloading, caching, the live server) is what the
# rest of this recording was made under, and changing it would re-record
# behaviour this task is not about. The oracle app itself is left stock.
Cardio.config.rescue_all_in_controller = true
Cardio.config.consider_all_requests_local = false
# Booting the app already loaded CardController, whose class body registered
# its rescue handlers under the development default (card_controller.rb:28,
# `rescue_from_class StandardError if rescue_all?`). That line runs once, at
# class-body time, so the config write above cannot reach it. Running the same
# call here gives the same handler (`handle_exception`), so the recorded
# response is the one a production boot gives, not a new shape.
CardController.rescue_from_class StandardError
# The guards. Without them a setting that silently failed to take would put the
# developer page back into the recording, which is the defect this exists to
# remove, and the run would look clean. rescue_handlers holds
# [class NAME, handler] pairs (activesupport rescuable.rb:72).
unless CardController.rescue_handlers.any? { |name, _handler| name == "StandardError" }
  raise "rescue_all_in_controller did not take: StandardError is not rescued"
end
# env_config is memoized on first use. This check reads it after the setting
# above, so a value memoized earlier with the development default fails here,
# rather than silently answering requests with the developer page.
unless Cardio.application.env_config["action_dispatch.show_detailed_exceptions"] == false
  raise "consider_all_requests_local did not take: " \
        "show_detailed_exceptions is #{Cardio.application.env_config['action_dispatch.show_detailed_exceptions'].inspect}"
end

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
# The uploader's cache and the asset outputter's staging resolve
# Cardio.paths["tmp"] (carrier_wave/file_card_uploader/path.rb cache_dir,
# asset_outputter.rb handle_file). An app whose own tmp/ directory does not
# exist resolves it to nil, and every upload, skin and asset step fails on
# "no implicit conversion of nil into String", so provide it under the work
# directory — the same arrangement reference-harness/oracle/lib/harness_env.rb
# configure_files! makes for the builder and the adapter.
TMP_DIR = File.join(WORK_DIR, "tmp")
FileUtils.rm_rf(TMP_DIR)
FileUtils.mkdir_p([TMP_DIR, File.join(TMP_DIR, "files")])
Cardio.paths["tmp"] = TMP_DIR
# Account tokens (verification, password reset) are signed with the app
# credentials' secret_key_base (card/auth/token.rb SECRET_KEY). The reference
# app carries no credentials, and an empty HMAC key aborts every token send
# ("HMAC key cannot be empty"), so sign with the same harness secret the
# TypeScript drive uses (ts-drive.mjs accountMail.token.secret). Comparison
# normalises token values either way.
Card::Auth::Token.const_set(:SECRET_KEY, "parity-harness-local-secret")

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

# Text-mode files on Windows turn "\n" into "\r\n" when written. The asset
# outputter stages the site stylesheet in a Tempfile (asset_outputter.rb
# handle_file), so on Windows the stored stylesheet gains a carriage return
# per line, which Ruby Decko's POSIX hosts never write. By default Tempfiles
# are binary here, as on POSIX; PARITY_NATIVE_TEXT=1 keeps the Windows
# behaviour.
unless ENV["PARITY_NATIVE_TEXT"] == "1"
  require "tempfile"
  Tempfile.singleton_class.prepend(Module.new do
    def new(*args, **kw, &blk)
      super.tap(&:binmode)
    end
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

# ---- portable paths. A recorded backtrace or message that names this
# machine's directories (the BUNDLE_PATH the gems were installed under, the
# app root, the work directory, the checkout the drive itself runs from)
# would put absolute paths in a file that ships, so every path-bearing string
# the trace records is rewritten to the part that is stable: the gem name and
# version, or a marker. The gem root comes from Bundler, not from a hard-coded
# path; the checkout root is the directory two levels above this file's
# tools/parity-side-effects/ruby. Roots are matched with their separators
# normalised, because Windows records backslash paths and POSIX records
# forward ones, and longest first so the checkout wins over the app inside it.
GEM_ROOT = ENV["BUNDLE_PATH"] || File.join(Gem.dir, "gems")
CHECKOUT_ROOT = File.expand_path("../../..", __dir__)
PORTABLE_ROOTS = [
  [File.expand_path(GEM_ROOT).tr("\\", "/"), "<gem-root>"],
  [File.expand_path(APP_ROOT).tr("\\", "/"), "<app>"],
  [File.expand_path(WORK_DIR).tr("\\", "/"), "<work>"],
  [File.expand_path(DECK_SRC).tr("\\", "/"), "<deck>"],
  [CHECKOUT_ROOT.tr("\\", "/"), "<checkout>"],
].sort_by { |root, _| -root.length }.freeze
# Any drive-letter path left after the roots above is still this machine's
# directory tree (a cache, a temp dir, a gem outside BUNDLE_PATH). The letter
# is dropped so no absolute path reaches the recording.
DRIVE_ROOT = %r{\b[A-Za-z]:/}

def portable_paths(str)
  out = str.to_s.tr("\\", "/")
  PORTABLE_ROOTS.each { |root, marker| out = out.gsub(root, marker) }
  out.gsub(DRIVE_ROOT, "<path>/")
end

def portable_backtrace(backtrace, keep)
  Array(backtrace).grep_v(%r{/(actionpack|activesupport|rack)-}).first(keep).map { |l| portable_paths(l) }
end

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
          $SWALLOWED << { card: name.to_s, error: err.class.name,
                          message: portable_paths(err.message)[0, 300],
                          backtrace: portable_backtrace(err.backtrace, 8) }
        end
        super(*a, **k, &b)
      end
    end
  end
  mod.prepend(wrapper)
end

TABLES = %w[cards card_acts card_actions card_changes card_references
            card_revisions card_virtuals sessions users delayed_jobs].freeze

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

# A card's name as its rows store it: a simple card's name column, a
# compound's parts joined. Read from the table, not the card cache, which
# can still hold a name the act has since changed (a closed account's
# holder renamed within the act).
def card_name(id)
  return nil if id.nil?
  row = $conn.select_one("select name, left_id, right_id from cards where id = #{id.to_i}")
  return "?#{id}" unless row
  return row["name"].to_s if row["name"].present?
  "#{card_name(row['left_id'])}+#{card_name(row['right_id'])}"
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
# Other files carry the sha256 of their bytes (the stored stylesheet, text
# uploads), compared exactly.
require "digest"
def files_list
  Dir.glob(File.join(FILES_DIR, "**", "*")).select { |f| File.file?(f) }
     .map do |f|
       entry = { path: f.sub("#{FILES_DIR}/", ""), size: File.size(f) }
       if f.match?(IMAGE_EXT)
         entry[:b64] = [File.binread(f)].pack("m0") if File.size(f) <= 1_048_576
       else
         entry[:sha256] = Digest::SHA256.file(f).hexdigest
       end
       entry
     end.sort_by { |h| h[:path] }
end

# The card_virtuals rows (card-mod-virtual's store for `+*asset input`
# content), by id: the asset-input card's name and the content's length and
# sha256. A step reports the rows it created or whose content it changed,
# and the rows it deleted; a touch (updated_at only) is a timestamp and is
# not reported.
def virtuals_snapshot
  $conn.select_all("select id, left_id, right_id, content from card_virtuals").to_a.to_h do |r|
    [r["id"], { card: "#{card_name(r['left_id'])}+#{card_name(r['right_id'])}",
                length: r["content"].to_s.length, sha256: Digest::SHA256.hexdigest(r["content"].to_s) }]
  end
end

def virtuals_delta(before, after)
  changed = after.filter_map do |id, row|
    prev = before[id]
    next if prev && prev[:sha256] == row[:sha256]

    row.merge(change: prev ? "updated" : "created")
  end
  deleted = before.reject { |id, _| after.key?(id) }.map { |_, row| row.merge(change: "deleted") }
  (changed + deleted).sort_by { |r| [r[:card], r[:change]] }
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
  virtuals_before = virtuals_snapshot
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
    extra = { raised: e.class.name, error: portable_paths(e.message)[0, 300],
              backtrace: portable_backtrace(e.backtrace.grep_v(/actionpack|activesupport|rack/), 6) }
  ensure
    $TRACE = false
  end
  after = counts
  delta = after.keys.each_with_object({}) { |k, h| h[k] = after[k] - before[k] }
  $steps << {
    step: name, status: $status, headers: $headers, body: $body, delta: delta,
    actions: new_actions(since), events: $EVENTS.dup,
    files: files_list - files_before, virtuals: virtuals_delta(virtuals_before, virtuals_snapshot),
    mail: drain_mail, extra: extra, swallowed: $SWALLOWED.dup,
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
