# capture.rb - RUNG 3 smoke capture: seed a deterministic card set in the
# oracle app and record Ruby card behavior to fixtures/captured/smoke.json.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner REPO_ROOT/decko-ts/tools/oracle/capture.rb
#
# Determinism contract:
# - seeding is create-if-missing (re-runs converge; ids stay stable per DB)
# - timestamps (created_at/updated_at) and creator/updater ids are NOT captured
# - output JSON is pretty-printed with deeply sorted keys + trailing newline
# - rule captures map role ids to role names (ids are DB-local)
# - renders run as the runner's default user (Anonymous, id 201 here)

require "json"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "smoke.json")

# NOTE card 1.110 renamed the basic cardtype: the card bearing codename :basic
# is named "RichText"; no card named "Basic" exists and seeding with
# type: "Basic" silently falls back to the default type. Every plain/rich
# seed below therefore uses type "RichText" (type_code :basic).
SEEDS = [
  { name: "Oracle Basics",   type: "RichText",
    content: "A plain basic card for oracle capture." },
  { name: "Oracle Junction", type: "RichText", content: "Junction parent card." },
  { name: "Oracle Junction+child_one", type: "RichText", content: "first child" },
  { name: "Oracle Junction+child_two", type: "RichText", content: "second child" },
  { name: "Oracle Rich",     type: "RichText",
    content: "<p>Rich text with an inclusion: {{Oracle Rich+rich_child}}</p>" },
  { name: "Oracle Rich+rich_child", type: "RichText", content: "the nested child body" },
  { name: "Oracle Search",   type: "Search",
    content: JSON.generate("left" => "Oracle Junction", "sort" => "name") },
  { name: "Oracle Restricted", type: "RichText", content: "Only administrators can read me." }
].freeze

READ_RULE = { name: "Oracle Restricted+*self+*read", type: "List",
              content: "Administrator" }.freeze

RENDER_CARDS = ["Oracle Basics", "Oracle Junction", "Oracle Rich", "Oracle Search"].freeze
RENDER_VIEWS = %i[open closed content title].freeze

# Decko stamps every rendered slot with a random DOM id:
#   card-mod-format-0.20.0/set/all/html/wrap.rb -> wrap_data -> "slot-id": SecureRandom.hex(10)
# The value is random by design and carries no card semantics. The capture
# stores it as written (value and quote style); comparisons mask the value at
# compare time. Any other run-to-run divergence in rendered output is a real
# oracle nondeterminism and must fail the diff.
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

def fetch!(name)
  card = Card.fetch(name)
  raise "seeded card missing: #{name}" if card.nil?
  card
end

def seed_card(attrs)
  existing = Card.fetch(attrs[:name], new: {})
  if existing.new_card?
    Card.create! attrs
    "created"
  elsif existing.content != attrs[:content] || existing.type_name != attrs[:type]
    existing.update! content: attrs[:content], type: attrs[:type]
    "updated"
  else
    "present"
  end
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

payload = {}

# ---- seed ------------------------------------------------------------------
# seed_log goes to STDOUT ONLY (create/update state differs across runs and
# would break byte-stability; it is harness telemetry, not oracle behavior).
seed_log = {}
Card::Auth.as_bot do
  SEEDS.each { |attrs| seed_log[attrs[:name]] = seed_card(attrs) }
  rule = Card.fetch(READ_RULE[:name], new: {})
  if rule.new_card?
    Card.create! READ_RULE
    seed_log[READ_RULE[:name]] = "created"
  elsif rule.content != READ_RULE[:content]
    rule.update! content: READ_RULE[:content]
    seed_log[READ_RULE[:name]] = "updated"
  else
    seed_log[READ_RULE[:name]] = "present"
  end
end
payload["card_count_after_seed"] = Card.count

# ---- card attributes -------------------------------------------------------
payload["cards"] = (SEEDS.map { |s| s[:name] } +
                    ["Oracle Restricted+*self", "Oracle Restricted+*self+*read"]).map do |name|
  [name, card_attributes(fetch!(name))]
end.to_h

# ---- rendered views --------------------------------------------------------
views = {}
RENDER_CARDS.each do |name|
  card = fetch!(name)
  format = card.format
  RENDER_VIEWS.each do |view|
    views["#{name}##{view}"] = normalize(format.render(view))
  rescue StandardError => e
    views["#{name}##{view}"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
  end
  views["#{name}#unknown_view_sentinel"] = begin
    format.render(:definitely_not_a_view)
  rescue StandardError => e
    "CAPTURE_ERROR: #{e.class}: #{e.message[0, 200]}"
  end
end
payload["rendered"] = views

# ---- CQL search (names only) ----------------------------------------------
# match is architecturally unsupported on SQLite in card 1.110: the query
# compiler routes it through ConnectionAdapters#match, implemented only for
# MySQL (REGEXP) and PostgreSQL (~*). We record the raise as the oracle's
# SQLite behavior instead of patching it (patching would fabricate behavior).
match_sentinel = begin
  Card.search(match: "Oracle", return: "name")
rescue StandardError => e
  "CAPTURE_ERROR: #{e.class}: #{e.message}"
end
payload["cql_search"] = {
  "left_Oracle_Junction_sort_name" =>
    Card.search(left: "Oracle Junction", sort: "name", return: "name"),
  "type_Search_sort_name" =>
    Card.search(type: "Search", sort: "name", return: "name"),
  "match_on_sqlite_sentinel" => match_sentinel
}

# ---- read-rule setup effective reader --------------------------------------
restricted = fetch!("Oracle Restricted")
reader_ids = restricted.who_can(:read)
anon_id = fetch!("Anonymous").id
payload["read_rule"] = {
  "target" => "Oracle Restricted",
  "set_card" => "Oracle Restricted+*self",
  "rule_card" => READ_RULE[:name],
  "rule_type" => fetch!(READ_RULE[:name]).type_name.to_s,
  "rule_content" => restricted.rule(:read),
  "effective_readers" => reader_ids.map { |id| Card.fetch(id).name.to_s },
  "anonymous_can_read" => Card::Auth.as(anon_id) { restricted.ok_to_read? },
  "admin_can_read" => Card::Auth.as_bot { restricted.ok_to_read? }
}

# ---- write -----------------------------------------------------------------
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "seed_log: #{JSON.generate(deep_sort(seed_log))}"
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush
