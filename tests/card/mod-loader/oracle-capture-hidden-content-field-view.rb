# Derivation probe: what does ActionView 7.2.3.2 emit for the exact call
# Card::Format::MethodDelegation forwards for card-mod-format
# set/all/content.rb:57-59 view :hidden_content_field?
#
# Source-proven facts this probe relies on:
#   1. view body self = Card::Format::HtmlFormat instance
#      (card-1.110.0 lib/card/format.rb:62-68 singleton_class include)
#   2. Card::Format includes MethodDelegation (format.rb:27)
#   3. no hidden_field is defined anywhere in card/decko/mod gems
#      (grep over the gem tree: only Rails' own helpers define it)
#   4. method_missing forwards verbatim: action_view.send :hidden_field,
#      :content, {class: "d0-card-content"}   (method_delegation.rb:41-47,71-75)
#      -> the Hash is positional argument #2 (the `method` slot)
#   5. the receiver is CardActionView < ActionView::Base
#      (card_action_view.rb:4), which includes Helpers (base.rb:158)
#
# This probe runs steps 4-5 for real: real ActionView::Base subclass,
# real FormHelper#hidden_field, exact argument shapes.
#
# Run under the card gems' Ruby (3.3) with actionview-7.2.3.2 installed:
#   ruby tests/card/mod-loader/oracle-capture-hidden-content-field-view.rb
# Verified output (Ruby 3.3.0, actionview-7.2.3.2):
#   respond_to?(:hidden_field) = true
#   hidden_field.source_location = [\".../actionview-7.2.3.2/lib/
#     action_view/helpers/form_helper.rb\", 1214] (the FormHelper
#     #hidden_field template form)
#   EMITTED: "<input autocomplete=\"off\" type=\"hidden\"
#     name=\"content[{:class=&gt;&quot;d0-card-content&quot;}]\"
#     id=\"content_{:class=&gt;&quot;d0-card-content&quot;}\" />"
#     (the hash lands in the `method` slot: stringified into name/id,
#     and no class attribute reaches the tag)
#   BUILDER: "<input class=\"d0-card-content\" autocomplete=\"off\"
#     type=\"hidden\" name=\"card[content]\" id=\"card_content\" />"
#     (the FormBuilder form - NOT the shape decko views execute - for
#     contrast: class preserved, card[content] naming)

require "uri"
require "action_view"

class OracleProbeView < ActionView::Base
  # minimalist like CardActionView; no controller needed for tag helpers
end

view = OracleProbeView.new(ActionView::LookupContext.new([]), {}, nil)

puts "respond_to?(:hidden_field) = #{view.respond_to?(:hidden_field)}"
puts "hidden_field.source_location = #{view.method(:hidden_field).source_location}"
puts "---"

# The exact positional binding MethodDelegation produces (send with a
# positional Hash in slot 2 — no keyword-argument ambiguity on `send`):
result = view.__send__(:hidden_field, :content, { class: "d0-card-content" })
puts "EMITTED: #{result.inspect}"
puts "---"

# Also capture what the sane-looking readings would emit, for contrast:
# (a) FormBuilder form (form_helper.rb:2518) - 2-arg on a builder:
builder = ActionView::Helpers::FormBuilder.new(
  :card, nil, view, {}
)
begin
  puts "BUILDER: #{builder.hidden_field(:content, class: "d0-card-content").inspect}"
rescue StandardError => e
  puts "BUILDER: raised #{e.class}: #{e.message.lines.first.strip}"
end
