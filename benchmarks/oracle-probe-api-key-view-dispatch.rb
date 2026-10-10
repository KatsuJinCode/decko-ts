# oracle-probe-api-key-view-dispatch.rb - WHY does Ruby's render(:content) on
# a card whose Right::ApiKey set declares `view :content, unknown: true
# { super() }` produce the api_key set's :core BODY (the committed
# fixtures/captured/api-key-views.json "…#content" bytes are the api-key-core
# subtree, NOT the plain rich-text content)?
#
# The committed capture records the BYTES; this probe records the MECHANISM:
# the full Ruby method-resolution chain for _view_content / _view_core /
# _view_titled / _view_titled_content on a REAL account+*api key card's format
# object, with each link's owner + source_location. Method#super_method walks
# exactly the chain a `super()` call follows, so the chain IS the dispatch.
# The decko-ts port's superView() helper has to reproduce THAT chain.
#
# READ-ONLY BY CONSTRUCTION: this probe seeds nothing and writes nothing - it
# reads the corpus deck through a connection the caller has marked readonly
# and introspects one existing card. The script additionally refuses to run
# unless (a) the connected database is a copy named api-key-probe*.sqlite3 and
# (b) PRAGMA query_only reads back 1, and it runs a write probe that MUST be
# refused. (Mechanism + guard pattern: tools/oracle/capture-dual-lane-page-and-view.rb
# M3/M4 - activerecord 7.2.3.2 passes URL query params through to
# SQLite3::Database.new, whose options[:readonly] selects SQLITE_OPEN_READONLY.)
#
# Run (from tools/oracle/decko-oracle-app):
#   cp db/corpus-v2.sqlite3 db/api-key-probe.sqlite3        # disposable copy
#   RAILS_ENV=development \
#     DATABASE_URL='sqlite3:db/api-key-probe.sqlite3?readonly=true' \
#     bundle exec decko runner \
#       C:/localProjects/decko-ts/benchmarks/oracle-probe-api-key-view-dispatch.rb
#
# API_KEY_PROBE_CARD: the card id to introspect (default: the first card whose
# right_id is the "*api key" setting card). The api key VALUE is redacted from
# every recorded byte string - the probe needs the structure, not the secret.
#
# Output: $API_KEY_PROBE_OUT (default tmp/api-key-view-dispatch.json),
# pretty-printed with deeply sorted keys + a trailing newline.

require "json"
require "fileutils"

REPO_ROOT = File.expand_path("..", __dir__)
OUT_PATH = ENV.fetch(
  "API_KEY_PROBE_OUT",
  File.join(REPO_ROOT, "tmp", "api-key-view-dispatch.json")
)
FileUtils.mkdir_p(File.dirname(OUT_PATH))

# -----------------------------------------------------------------------
# Guard rails - a named disposable copy, query_only on, writes refused
# -----------------------------------------------------------------------
connected_file = File.expand_path(
  ActiveRecord::Base.connection_db_config.configuration_hash[:database].to_s,
  ENV["RAILS_ROOT"] || Dir.pwd
)
unless File.basename(connected_file).match?(/\Aapi-key-probe.*\.sqlite3\z/)
  raise "REFUSING: connected database is #{connected_file}; this probe reads a " \
        "COPY named db/api-key-probe*.sqlite3 only (never the corpus deck)"
end
conn = ActiveRecord::Base.connection
conn.execute("PRAGMA query_only=1")
unless conn.select_value("PRAGMA query_only").to_i == 1
  raise "REFUSING: PRAGMA query_only did not stick; the probe must be read-only"
end
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

# The Ruby method-resolution chain for one view method: every link's owner
# + source_location, in the exact order a `super()` call walks it.
def resolution_chain(format_obj, method_name)
  m = format_obj.method(method_name)
  links = []
  while m
    links << { "owner" => m.owner.to_s, "source_location" => m.source_location }
    m = m.super_method
  end
  links
rescue NameError => e
  [{ "error" => "#{e.class}: #{e.message}" }]
end

# The probe card: an explicit id, else the first card carrying the "*api key"
# right. (The corpus is anonymized, but the key value is redacted anyway.)
setting = Card.where("name like ? and codename = ?", "%api%key%", "api_key").first
probe =
  if (id = ENV["API_KEY_PROBE_CARD"])
    Card.find(id)
  else
    Card.where(right_id: setting.id).where.not(left_id: nil).first
  end

payload = {
  "probe" => {
    "name" => probe.name,
    "id" => probe.id,
    "type" => probe.type.s,
    "set_names" => probe.set_names
  }
}

fmt = probe.format
payload["probe"]["format_class"] = fmt.class.to_s
payload["probe"]["content_length"] = probe.content.to_s.length

# --- the resolution chain per view ---------------------------------------
chains = {}
%i[core content titled titled_content current buttons generate_button].each do |view|
  mname = Card::Set::Format.view_method_name(view)
  chains[view.to_s] = {
    "responds" => fmt.respond_to?(mname),
    "chain" => resolution_chain(fmt, mname)
  }
end
payload["resolution_chains"] = chains

# --- the view-setting methods (view_opts) the dispatch consults ----------
settings = {}
%i[core content titled titled_content].each do |view|
  %i[unknown wrap perms cache compact].each do |setting|
    mname = Card::Set::Format.view_setting_method_name(view, setting)
    settings["#{view}__#{setting}"] =
      fmt.respond_to?(mname) ? fmt.public_send(mname).inspect : "UNDEFINED"
  end
end
payload["view_settings"] = settings

# --- the rendered bytes, with the key value redacted ---------------------
key = probe.content.to_s.strip
redact = lambda do |html|
  # slot ids stored as Ruby wrote them; masked at compare time
  html = html.gsub(/data-card-id=(["'])\d+\1/, 'data-card-id="RANDOMIZED"')
  key.empty? ? html : html.gsub(key, "<API-KEY-REDACTED>")
end
%i[content core titled titled_content].each do |view|
  payload["rendered_#{view}"] = redact.call(fmt.render(view))
rescue StandardError => e
  payload["rendered_#{view}"] = "RAISED: #{e.class}: #{e.message}"
end

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
