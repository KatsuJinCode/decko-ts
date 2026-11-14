# ruby-date-parse-conformance-table.rb — THE GEM RUN the date-parse class
# needed. Runs the SAME ::Date.parse the Date cardtype performs
# (`::Date.parse(card.content).strftime "%B %-d, %Y"`) over a systematic
# family and emits a JSON conformance table: input -> {parsed, iso,
# rendered} or {parsed:false, error}.
#
#   ruby tools/oracle/ruby-date-parse-conformance-table.rb > table.json
#
# WHY A TABLE AND NOT A HEURISTIC. The engine's parseRubyDateContent had two
# corpus-visible disagreements with the gem, in OPPOSITE directions, and a
# two-point special case would be a decoy. This emits the gem's answer for
# every shape family the corpus actually carries plus the boundary sweep, so
# the port's rule can be checked against gem output rather than guessed.
require "date"
require "json"

inputs = []

# 1. the corpus's own unusual shapes (Date-typed rows, type_id=17)
inputs.concat([
  "1981-10",   # the 2-component dashed one
  "20-0405",   # day + zone, NO month, NO year
  "2016", "1980", "1", "0", "123", "12",   # bare-digit heuristics
  "09/10/2021 8:01 AM", "05/18/2023 12:00 AM",
  "<p>{{+date}}</p>", "",
])

# 2. the compact YYYYMMDD family
["20190319", "20220323", "20161231", "20190101"].each { |s| inputs << s }

# 3. the dashed Y-M-D family
["18-12-22", "2010-7-19", "999-1-1", "38-12-31", "39-01-01", "68-05-05",
 "69-1-1", "2019-13-01", "2021-02-29", "2019-05-0", "2019-03-19",
 "2020-02-29", "2024-02-29", "0001-01-01", "9999-12-31"].each { |s| inputs << s }

# 4. the 2-component dashed boundary sweep - the family the fix generalizes
#    over. A = leading, B = trailing.
(0..35).each do |a|
  (0..35).each do |b|
    inputs << format("%d-%02d", a, b)
  end
end
["1981-10", "2020-01", "12-12", "20-04", "99-99", "2020-1", "2020-13",
 "1-1", "31-12", "32-01", "00-00", "1-0", "0-1"].each { |s| inputs << s }

# 5. the slashed family
["3/19/2019", "19/3/2019", "2019/3/19", "2019/13/1", "2019/0/1"].each { |s| inputs << s }

rows = inputs.uniq.map do |s|
  begin
    d = Date.parse(s)
    { "input" => s, "parsed" => true, "iso" => d.to_s,
      "rendered" => (d.strftime("%B %-d, %Y") rescue nil) }
  rescue => e
    { "input" => s, "parsed" => false, "error" => "#{e.class}: #{e.message}" }
  end
end

puts JSON.pretty_generate({
  "ruby_version" => RUBY_VERSION,
  "date_gem" => (defined?(Date::VERSION) ? Date::VERSION : "stdlib-default"),
  "date_today" => Date.today.to_s,
  "note" => "Date.parse fills MISSING components from Date.today, so any " \
            "input without a full year+month+day is TODAY-DEPENDENT.",
  "rows" => rows,
})
