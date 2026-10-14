# Derives the AUTOCOMPLETE editor bytes the select-editor suite pins
# (card-mod-list-select-editor.test.ts, the :autocomplete arm) by RUNNING
# the pinned gem versions locally: haml-5.2.2 + actionview-7.2.3.2, resolved
# from whatever GEM_HOME / gem path the local interpreter reports.
#
# The template is card-mod-search-0.20.0 set/all/autocomplete/
# autocomplete_input.haml verbatim; the call shape is the list mod's
# autocomplete_input (card-mod-list set/abstract/01_list/html_views.rb:60-62)
# through autocomplete_field (card-mod-search set/all/autocomplete.rb:14-19):
# item = items_for_input.first, options_card = the content options card's
# url key, extra_classes = "" (the default - hence the class value's
# TRAILING SPACE), placeholder_text = "" (card-mod-edit set/all/editor.rb:
# 60-62). Expected output:
#
#   <div class='pointer-list-editor pointer-list-ul'>
#   <input type="text" name="pointer_item" id="pointer_item" value="Option One" class="pointer-item-text form-control _autocomplete " data-options-card="option_values" placeholder="" />
#   </div>
#
# Run: ruby tests/card/mod-loader/oracle-byte-derivation-autocomplete-editor-bytes.rb
require "uri"
require "cgi"
require "action_view"
require "haml"

class Probe
  include ActionView::Helpers::FormTagHelper
  include ActionView::Helpers::TagHelper
  def placeholder_text = ""
  def item = "Option One"
  def options_card = "option_values"
  def extra_classes = ""
end

TEMPLATE =
  ".pointer-list-editor.pointer-list-ul\n" \
  "  = text_field_tag 'pointer_item', item, class: \"pointer-item-text " \
  "form-control _autocomplete \#{extra_classes}\",\n" \
  "                                         \"data-options-card\": options_card,\n" \
  "                                         placeholder: placeholder_text\n"

r = Haml::Engine.new(TEMPLATE).render(Probe.new)
puts r
puts "=== inspect ==="
puts r.inspect
