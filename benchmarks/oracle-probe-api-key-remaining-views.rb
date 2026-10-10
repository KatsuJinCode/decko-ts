# oracle-probe-api-key-remaining-views.rb - capture the two api_key view
# families the committed fixtures/captured/api-key-views.json does NOT cover:
#
#   1. set/right/api_key.rb:77-79 `view :token_link` - the link whose href is
#      `path(format: :json, view: :token)`. The port's href
#      (`/<key>.json?view=token`) is a hand-rolled guess; lib/card/path.rb
#      decides the real shape.
#   2. set/right/account.rb:5-9 `view :api_key` - the *account right's
#      `field_nest :api_key`, the second set file the api_key gem ships and
#      the only view the mod registers outside Right::ApiKey.
#
# READ-ONLY BY CONSTRUCTION: seeds nothing, writes nothing. It reads the
# oracle app's development deck through a copy the caller marked readonly,
# and refuses to run unless (a) the connected file is a copy named
# api-key-probe*.sqlite3, (b) PRAGMA query_only reads back 1, and (c) a write
# probe is refused. The api key VALUE is redacted from every recorded byte
# string (the probe needs structure, not the secret).
#
# Run (from tools/oracle/decko-oracle-app):
#   cp db/development.sqlite3 db/api-key-probe.sqlite3
#   RAILS_ENV=development \
#     DATABASE_URL='sqlite3:db/api-key-probe.sqlite3?readonly=true' \
#     bundle exec decko runner \
#       C:/localProjects/decko-ts/benchmarks/oracle-probe-api-key-remaining-views.rb
#
# Output: $API_KEY_PROBE_OUT (default tmp/api-key-remaining-views.json).

require "json"
require "fileutils"

REPO_ROOT = File.expand_path("..", __dir__)
OUT_PATH = ENV.fetch(
  "API_KEY_PROBE_OUT",
  File.join(REPO_ROOT, "tmp", "api-key-remaining-views.json")
)
FileUtils.mkdir_p(File.dirname(OUT_PATH))

connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd
)
unless File.basename(connected_file).match?(/\Aapi-key-probe.*\.sqlite3\z/)
  raise "REFUSING: connected database is #{connected_file}; this probe reads a " \
        "COPY named db/api-key-probe*.sqlite3 only"
end
conn = ActiveRecord::Base.connection
conn.execute("PRAGMA query_only=1")
raise "REFUSING: PRAGMA query_only did not stick" unless conn.select_value("PRAGMA query_only").to_i == 1

begin
  conn.execute("UPDATE cards SET name = name WHERE 0")
  raise "REFUSING: a write was NOT refused; the connection is not read-only"
rescue ActiveRecord::StatementInvalid, ActiveRecord::ReadOnlyError
  # the expected outcome
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def normalize(html)
  html.gsub(/data-slot-id=(["'])\h+\1/, 'data-slot-id="RANDOMIZED"')
      .gsub(/data-card-id=(["'])\d+\1/, 'data-card-id="RANDOMIZED"')
end

api_key_setting = Card.where(name: "*api key").first
account_right = Card.where(name: "*account").first

# the api_key right's own probe (the capture deck's junction; the committed
# fixture's form id edit_card_1298 pins this row's id)
key_card = Card.where(right_id: api_key_setting.id).first
# an account-right card, to render the *account set's :api_key view
account_card = Card.where(right_id: account_right.id).first

payload = { "cards" => {} }

[key_card, account_card].compact.each do |card|
  entry = {
    "id" => card.id,
    "name" => card.name,
    "type" => card.type.s,
    "set_names" => card.set_names,
    "content_length" => card.content.to_s.length
  }
  fmt = card.format
  key = card.content.to_s.strip
  redact = lambda do |html|
    html = normalize(html)
    key.empty? ? html : html.gsub(key, "<API-KEY-REDACTED>")
  end
  renders = {}
  view_list = %i[token_link current core buttons generate_button content titled titled_content]
  view_list += %i[api_key] if card.id == account_card&.id
  # Right::ApiKey#ok_to_read? is `own_account? || super` (api_key.rb:20-22)
  # and the *account right gates its own subtree, so an ANONYMOUS render
  # returns the quiet denial span - every arm below is read as the bot.
  renders["as_anonymous"] = redact.call(fmt.render(view_list.first))
  # Re-FETCH inside as_bot: Card#format memoizes the format object per card
  # and its class is assembled from the READER's set chain - a format built
  # while anonymous never includes the right set's format module, so
  # token_link/current/generate_button all raise "not supported" on it.
  renders["as_bot"] = begin
    Card::Auth.as_bot do
      bot_fmt = Card.find(card.id).format
      view_list.map { |v| [v.to_s, redact.call(bot_fmt.render(v))] }.to_h
    end
  rescue StandardError => e
    "RAISED: #{e.class}: #{e.message}"
  end
  entry["renders"] = renders
  payload["cards"][card.id.to_s] = entry
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
