require "uri"
require "cgi"
require "action_view"

class Probe
  include ActionView::Helpers::FormTagHelper
  include ActionView::Helpers::FormOptionsHelper
  include ActionView::Helpers::TagHelper
  include ActionView::Helpers::OutputSafetyHelper
  def unique_id = "7"
end

p = Probe.new

options_hash = { "Option One" => "Option One", "Option Two" => "Option Two" }
select_opts = { "-- Select --" => "" }.merge(options_hash)
puts "=== select_input (selected: Option One) ==="
puts p.select_tag("pointer_select-#{p.unique_id}",
                  p.options_for_select(select_opts, "Option One"),
                  class: "pointer-select form-control")
puts "=== select_input (nothing selected: first_name nil) ==="
puts p.select_tag("pointer_select-#{p.unique_id}",
                  p.options_for_select(select_opts, nil),
                  class: "pointer-select form-control")
puts "=== multiselect_input (selected: Option Two) ==="
puts p.select_tag("pointer_multiselect-#{p.unique_id}",
                  p.options_for_select(options_hash, ["Option Two"]),
                  multiple: true, class: "pointer-multiselect form-control")
puts "=== raw inspection ==="
r = p.select_tag("pointer_select-#{p.unique_id}",
                 p.options_for_select(select_opts, "Option One"),
                 class: "pointer-select form-control")
puts r.inspect
