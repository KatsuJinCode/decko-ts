# scenarios.rb -- run the shared operation list (../scenarios.json) through
# drive.rb's step/call helpers. Upload leaves ({"upload": file, "mime": type})
# become Rack uploaded files; everything else is passed as the nested params
# hash Rails would parse from the same form.
#
# Placeholders (strings), resolved per engine just before the step runs:
#   "$rev_id"               the rev_id the previous step's response named (the
#                           cached-upload action of a two-step upload)
#   "$create_action:<name>" the id of the first action recorded on that card
#   "$id:<name>"            the card's id mark, "~<id>"

SCENARIOS = JSON.parse(File.read(File.join(File.dirname(__FILE__), "..", "scenarios.json")))

$LAST_REV_ID = nil

def resolve_placeholder(value)
  case value
  when "$rev_id"
    $LAST_REV_ID or raise "no rev_id in the previous response"
  when /\A\$id:(.+)\z/
    card = Card.fetch(Regexp.last_match(1), skip_modules: true)
    raise "no card #{Regexp.last_match(1)}" unless card&.id
    "~#{card.id}"
  when /\A\$create_action:(.+)\z/
    card = Card.fetch(Regexp.last_match(1), look_in_trash: true, skip_modules: true)
    raise "no card #{Regexp.last_match(1)}" unless card&.id
    $conn.select_value("select min(id) from card_actions where card_id = #{card.id.to_i}").to_s
  else
    value
  end
end

def materialize(value)
  case value
  when Hash
    if value.key?("upload")
      upload(File.join(FIXTURES, value["upload"]), value["mime"])
    else
      value.transform_values { |v| materialize(v) }
    end
  when Array then value.map { |v| materialize(v) }
  when String then resolve_placeholder(value)
  else value
  end
end

# The rev_id a response names: in its redirect target, else in its body.
def remember_rev_id
  loc = $headers.find { |k, _| k.casecmp?("location") }&.last.to_s
  m = loc.match(/rev_id=(\d+)/) || $body.to_s.match(/rev_id(?:%5D|\]|")?[=:]\s*"?(\d+)/)
  $LAST_REV_ID = m && m[1]
end

SCENARIOS["steps"].each do |s|
  step(s["name"]) do
    call(s["method"].to_sym, s["path"], s["params"] ? materialize(s["params"]) : nil)
    remember_rev_id
  end
end
