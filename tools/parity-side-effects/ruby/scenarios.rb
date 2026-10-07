# scenarios.rb -- run the shared operation list (../scenarios.json) through
# drive.rb's step/call helpers. Upload leaves ({"upload": file, "mime": type})
# become Rack uploaded files; everything else is passed as the nested params
# hash Rails would parse from the same form.

SCENARIOS = JSON.parse(File.read(File.join(File.dirname(__FILE__), "..", "scenarios.json")))

def materialize(value)
  case value
  when Hash
    if value.key?("upload")
      upload(File.join(FIXTURES, value["upload"]), value["mime"])
    else
      value.transform_values { |v| materialize(v) }
    end
  when Array then value.map { |v| materialize(v) }
  else value
  end
end

SCENARIOS["steps"].each do |s|
  step(s["name"]) do
    call(s["method"].to_sym, s["path"], s["params"] ? materialize(s["params"]) : nil)
  end
end
