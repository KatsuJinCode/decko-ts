# tools/oracle/site-script-probe.rb — record, from the Ruby oracle, what the
# script assets do on the write path: what each mod script card's `+*asset
# input` assembles from, what a save of `*all+*script` stores, and what a
# JavaScript card's create, edit and delete do to the asset inputs and the
# site script file.
#
#   ruby tools/oracle/site-script-probe.rb <app root> <deck sqlite> <out dir>
#
# Boots the oracle app in-process against a LOCAL COPY of the deck (the copy
# lives in <out dir>, deleted only by the caller). Every save runs as bot
# (bot saves run the same events; `skip: :allowed` only lets a save opt out
# explicitly). Outgoing network is refused before it reaches the OS; file
# storage is forced into <out dir>/files. Writes <out dir>/site-script-probe.json:
#
#   before    the rule's content, every card_virtuals row, the
#             *all+*script+*asset output card, *recent settings
#   items     per *all+*script item: its groups, each group's file leaves
#             (name, type, base path, relative path, content sha256, and the
#             sha256 of the leaf's js :compressed render), and the sha256 and
#             length of the item's assembled asset input
#   whole     the sha256 of input_from_item_cards over all items
#   steps     per driven save (probe card create, rule save, probe card
#             update, probe card delete): the virtual-row delta by card name,
#             the stored-file delta (path, size, sha256), the output card's
#             identifier and updater, the rule's action count, and
#             *recent settings
require "json"
require "fileutils"
require "digest"
require "socket"

APP_ROOT = ARGV[0]
DECK_SRC = ARGV[1]
OUT = File.expand_path(ARGV[2])
FileUtils.mkdir_p(OUT)

# ---- network block (same shape as tools/parity-side-effects/ruby/drive.rb).
$PROBE_NETWORK_BLOCKED = []
module ProbeNetworkBlock
  def self.refuse(what, host, port)
    $PROBE_NETWORK_BLOCKED << "#{what} #{host}:#{port}"
    raise Errno::ECONNREFUSED, "site-script probe: outgoing network blocked (#{what} #{host}:#{port})"
  end
end
TCPSocket.singleton_class.prepend(Module.new do
  def new(host = nil, port = nil, *rest, **kw) = ProbeNetworkBlock.refuse("TCPSocket", host, port)
  def open(host = nil, port = nil, *rest, **kw) = ProbeNetworkBlock.refuse("TCPSocket", host, port)
end)
UDPSocket.prepend(Module.new do
  def connect(host, port) = ProbeNetworkBlock.refuse("UDPSocket", host, port)
end)
Addrinfo.singleton_class.prepend(Module.new do
  def getaddrinfo(host, port = nil, *rest, **kw)
    return super if host.nil? || %w[localhost 127.0.0.1 ::1].include?(host.to_s)
    ProbeNetworkBlock.refuse("getaddrinfo", host, port)
  end
end)

DECK_COPY = File.join(OUT, "probe-deck.sqlite3")
FileUtils.cp(DECK_SRC, DECK_COPY)
FILES_DIR = File.join(OUT, "files")
FileUtils.rm_rf(FILES_DIR)
FileUtils.mkdir_p(File.join(FILES_DIR, "files"))
CACHE_DIR = File.join(OUT, "cache")
FileUtils.rm_rf(CACHE_DIR)
FileUtils.mkdir_p(CACHE_DIR)
ENV["DECKO_CACHE_DIR"] = CACHE_DIR
ENV["RAILS_ENV"] ||= "development"
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DECK_COPY}"
ENV["RAILS_LOG_TO_STDOUT"] = nil
require File.join(APP_ROOT, "config", "environment")
Cardio.config.file_buckets = {}
Cardio.config.file_default_storage = :local
Cardio.paths["files"] = File.join(FILES_DIR, "files")
Cardio.paths["public"] = File.join(FILES_DIR, "public")
FileUtils.mkdir_p(Cardio.paths["public"])
# Tempfiles binary, as on the POSIX hosts (see drive.rb's PARITY_NATIVE_TEXT note).
require "tempfile"
Tempfile.singleton_class.prepend(Module.new do
  def new(*args, **kw, &blk)
    super.tap(&:binmode)
  end
end)
Cardio.config.recaptcha_site_key = nil
Cardio.config.recaptcha_secret_key = nil

def sha(text) = Digest::SHA256.hexdigest(text.to_s)
def dig(text) = { sha256: sha(text), length: text.to_s.length }

def name_of(id)
  return nil if id.nil?

  card = Card.fetch(id, look_in_trash: true)&.name
  card&.to_s
end

def virtuals_rows
  c = ActiveRecord::Base.connection
  c.select_all("select id, left_id, right_id, content from card_virtuals order by id").map do |r|
    { card: "#{name_of(r['left_id'])}+#{name_of(r['right_id'])}",
      sha256: sha(r["content"].to_s), length: r["content"].to_s.length }
  end
end

def files_rows
  out = []
  return out unless Dir.exist?(FILES_DIR)

  Dir.glob(File.join(FILES_DIR, "**", "*file*"), File::FNM_DOTMATCH).each do |p|
    next unless File.file?(p)

    out << { path: p.sub("#{FILES_DIR}/", ""), size: File.size(p), sha256: Digest::SHA256.file(p).hexdigest }
  end
  out.sort_by { |f| f[:path] }
end

def aoc_row
  card = Card.fetch("*all+*script+*asset output")
  return nil if card.nil?

  { name: card.name.to_s, db_content: card.db_content,
    updater: name_of(card.updater_id), left_id: card.left_id, id: card.id }
end

def rule_row
  card = Card.fetch("*all+*script")
  { content: card.db_content, actions: card.actions.count }
end

def recent_settings
  Card.fetch("*recent settings")&.db_content
end

def delta(&)
  before_v = virtuals_rows
  before_f = files_rows
  yield
  after_v = virtuals_rows
  after_f = files_rows
  vdelta = []
  after_v.each do |row|
    prev = before_v.find { |b| b[:card] == row[:card] }
    vdelta << { **row, change: prev ? (prev[:sha256] == row[:sha256] ? "touched" : "updated") : "created" }
  end
  before_v.each do |row|
    vdelta << { **row, change: "deleted" } unless after_v.any? { |a| a[:card] == row[:card] }
  end
  fdelta = after_f.reject { |f| before_f.any? { |b| b[:path] == f[:path] && b[:sha256] == f[:sha256] } }
  { virtuals: vdelta.sort_by { |r| r[:card].to_s }, files: fdelta.sort_by { |f| f[:path] },
    output_card: aoc_row, rule: rule_row, recent_settings: recent_settings }
end

result = {}
Card::Auth.as_bot do
  rule = Card.fetch("*all+*script")
  result[:before] = {
    rule: rule_row, virtuals: virtuals_rows, output_card: aoc_row,
    recent_settings: recent_settings,
  }

  # ---- the items' structure, read-only: groups, leaves, assembled inputs
  items = []
  whole_parts = []
  rule.item_cards.each do |item|
    # A mod script card's item_cards are its asset groups (mod_assets.rb); an
    # item with no groups (a JavaScript card) is its own single leaf.
    groups = item.item_cards
    groups = [item] if groups.empty?
    group_rows = groups.map do |group|
      leaves = Array(group.try(:item_cards))
      leaves = [group] if leaves.empty?
      leaf_rows = leaves.map do |leaf|
        compressed = begin
          leaf.format(:js)._render_compressed
        rescue StandardError => e
          "ERROR #{e.class}: #{e.message}"
        end
        { name: leaf.name.to_s, type_code: leaf.type_code.to_s,
          base_path: leaf.try(:base_path), db_content: leaf.db_content.to_s,
          content_sha256: sha(leaf.content.to_s),
          compressed_sha256: sha(compressed), compressed_length: compressed.length }
      end
      { name: group.name.to_s, type_code: group.type_code.to_s, leaves: leaf_rows }
    end
    assembled = begin
      item.asset_input_content.to_s
    rescue StandardError => e
      "ERROR #{e.class}: #{e.message}"
    end
    whole_parts << assembled
    items << { name: item.name.to_s, type_code: item.type_code.to_s,
               groups: group_rows, assembled: dig(assembled) }
  end
  result[:items] = items
  result[:whole] = dig(whole_parts.join("\n"))

  # ---- step 1: create the probe JavaScript card
  errors = nil
  created = Card::Auth.as_bot do
    Card.create! name: "Parity Probe Script", type: "java_script",
                 content: "window.parityProbeCount = 1;\n"
  rescue StandardError => e
    errors = "#{e.class}: #{e.message}"
    nil
  end
  result[:create_probe_card] = { error: errors }.merge(delta {})
  result[:create_probe_card][:probe_input] = if created
    row = virtuals_rows.find { |r| r[:card]&.start_with?("Parity Probe Script+") }
    row
  end

  # ---- step 2: save *all+*script with the probe card appended
  rule = Card.fetch("*all+*script")
  new_content = "#{rule.db_content}\nParity Probe Script"
  errors = nil
  Card::Auth.as_bot do
    rule.update! content: new_content
  rescue StandardError => e
    errors = "#{e.class}: #{e.message}"
  end
  result[:save_rule] = { error: errors, new_content: new_content }.merge(delta {})

  # ---- step 3: update the probe card's content
  probe = Card.fetch("Parity Probe Script")
  errors = nil
  Card::Auth.as_bot do
    probe.update! content: "window.parityProbeCount = 2;\n"
  rescue StandardError => e
    errors = "#{e.class}: #{e.message}"
  end
  result[:update_probe_card] = { error: errors }.merge(delta {})

  # ---- step 4: delete the probe card
  probe = Card.fetch("Parity Probe Script")
  errors = nil
  Card::Auth.as_bot do
    probe.delete!
  rescue StandardError => e
    errors = "#{e.class}: #{e.message}"
  end
  result[:delete_probe_card] = { error: errors }.merge(delta {})
end
result[:network_blocked] = $PROBE_NETWORK_BLOCKED

File.write(File.join(OUT, "site-script-probe.json"), JSON.pretty_generate(result))
puts "wrote #{File.join(OUT, 'site-script-probe.json')}"
puts "whole: #{result[:whole][:sha256]} #{result[:whole][:length]}"
