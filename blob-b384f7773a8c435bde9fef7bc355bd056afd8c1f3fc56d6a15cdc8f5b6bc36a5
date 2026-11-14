# style-tag-views.rb — static-ruby oracle capture for card-mod-style's
# views :remote_include_tags (type_plus_right/mod/style.rb:
# 26-32), :remote_style_tags (self/style_mods.rb:8-14),
# :stylesheet_include_tag (type_plus_right/mod/style.rb:20-24) and
# :stylesheet_path (type_plus_right/set/style.rb:28-33).
#
# WHAT RUNS: the gems' own source lines extracted VERBATIM by line range.
# Stubs, each documented:
#
#   tag              - Rails TagHelper#tag (tag_helper.rb:132-168): a
#                      content-less tag self-closes " />" with the
#                      attributes in the caller's hash order — the same
#                      shape REMOTE_STYLE_TAG carries in
#                      src/card/render/head-views.ts, which this script
#                      cross-checks against its own tag bytes.
#   group_remote     - the deck-stored +*group remote child's content
#                      (card-mod-assets set/right/group_remote.rb:25-31):
#                      one remote src per line. card-mod-script.ts's port
#                      (remoteScriptTagsOfModCard) established the same
#                      card-surface read for the script side.
#   item_cards       - the pointer/list card's item NAMES from db_content
#                      (one per line, [[...]] stripped - the established
#                      engine read, card-mod-script.ts:318-323).
#   nest             - renderCardView's card.format(:html).render shape:
#                      the item card's own format renders the view.
#   asset_output_url - the `+*asset output` child's attachment identifier
#                      (card-mod-assets set/abstract/asset_outputter.rb:
#                      78-82, the oracle-pinned "/files/~<card>/<action><ext>"
#                      localAttachmentUrl shape; card-mod-assets.ts:69-93).
#                      The double carries a DOCUMENTED child content; the
#                      url derivation itself is not re-pinned here (the
#                      assets suites own it).
#   params           - the headless render has no request params:
#                      stylesheet_path's params[:debug] arm is absent and
#                      the body computes the else arm (the flashView basis).
#
# Each JSONL line carries behaviorId "view:<name>" + gemSource ranges.
#
# Usage: ruby style-tag-views.rb <card-mod-style-gem-path>

require "json"
require "ostruct"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-style-gem-path>"
gems_root = File.dirname(gem_path).tr("\\", "/")
abort "not a card-mod-style gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-style")
# this script lives at <repo>/tools/mod-porting-harness/ruby-oracles/card-mod-style/
repo_root = File.expand_path("../../../..", __dir__)

mod_style_file = File.join(gem_path, "set", "type_plus_right", "mod", "style.rb")
style_mods_file = File.join(gem_path, "set", "self", "style_mods.rb")
tpr_set_style_file = File.join(gem_path, "set", "type_plus_right", "set", "style.rb")
head_views_ts = File.join(repo_root, "src", "card", "render", "head-views.ts")
{
  mod_style_file => "tpr/mod/style.rb",
  style_mods_file => "self/style_mods.rb",
  tpr_set_style_file => "tpr/set/style.rb",
  head_views_ts => "the TS head-views constant (the captured bytes)"
}.each { |f, n| abort "source not found (#{n}): #{f}" unless File.file?(f) }

SRC = {
  mod_style_file => File.readlines(mod_style_file),
  style_mods_file => File.readlines(style_mods_file),
  tpr_set_style_file => File.readlines(tpr_set_style_file)
}.freeze

def region(file, a, b)
  SRC.fetch(file)[(a - 1)...b].join
end

def emit(obj)
  puts JSON.generate(obj)
end

module HTML
  TAG_ESCAPE = { "&" => "&amp;", "<" => "&lt;", ">" => "&gt;", '"' => "&quot;" }.freeze
  def self.escape_attr(v)
    v.to_s.gsub(/[&<>"]/) { |c| TAG_ESCAPE[c] }
  end
  # Rails TagHelper#tag - the void/link shape (self-closing " />",
  # attrs in the caller's hash order)
  def self.tag(name, attrs = {})
    attr_str = attrs.map { |k, v| %(#{k}="#{escape_attr(v)}") }.join(" ")
    "<#{name} #{attr_str} />"
  end
end

def tag(name, attrs = {})
  HTML.tag(name, attrs)
end

class String
  def present?
    !empty?
  end
end

class Array
  def present?
    !empty?
  end

  def self.wrap(object)
    if object.nil? then []
    elsif object.respond_to?(:to_ary) then object.to_ary
    else [object]
    end
  end
end

# --- the row doubles ---------------------------------------------------------

class ItemCardDouble
  attr_reader :name, :group_remote_content, :asset_output_content
  def initialize(name, group_remote_content: nil, asset_output_content: nil)
    @name = name
    @group_remote_content = group_remote_content
    @asset_output_content = asset_output_content
  end
end

# --- the format double hosting the verbatim view bodies ----------------------

class StyleFormatDouble
  attr_reader :card, :params, :item_cards

  def initialize(card, item_cards, params = {})
    @card = card
    @item_cards = item_cards
    @params = params
  end

  # the item's OWN format render (nest's target) - dispatches per the item
  # card's set: a Mod+*style card runs the tpr/mod/style.rb bodies; a
  # style-GROUP card runs the abstract/style_group.rb body whose bare
  # `stylesheet_include_tag` helper is defined NOWHERE in the installed gem
  # universe (grep across all gems: only the three view declarations
  # mention the name) - MethodDelegation#delegate_to_action_view sends it
  # to ActionView, which does not define it either, so the body RAISES
  # NoMethodError and the nest's quiet rescue substitutes the standard
  # "Error rendering" bytes. This double models both arms.
  def nest(item_card, view:)
    case view
    when :stylesheet_include_tag
      if item_card.name.start_with?("mod:")
        # verbatim: type_plus_right/mod/style.rb:20-24 (the nesting arm)
        item_card_body_stylesheet_include_tag(item_card)
      else
        "Error rendering: #{item_card.name} (stylesheet_include_tag view)"
      end
    when :remote_include_tags
      # verbatim: type_plus_right/mod/style.rb:26-32 (the tag block) over
      # map_remote_items (mod_assets.rb:167-169 -> the +*group remote read)
      remote_include_tags_body(item_card)
    end
  end

  def output(*content)
    Array.wrap(content).flatten.compact.join "\n"
  end

  def asset_output_url_for(item_card)
    # the documented child content rides the double; the url shape is the
    # assets suites' pinned localAttachmentUrl form
    "/files/~#{item_card.name.url_key}/#{item_card.asset_output_content}"
  end

  private

  # verbatim: type_plus_right/mod/style.rb:20-24
  #   card.item_cards.map { |icard| nest icard, view: :stylesheet_include_tag }.join("\n")
  def item_card_body_stylesheet_include_tag(item_card)
    item_card.item_cards.map do |icard|
      nest(icard, view: :stylesheet_include_tag)
    end.join("\n")
  end

  # verbatim: type_plus_right/mod/style.rb:26-32
  #   map_remote_items do |tag_args|
  #     tag "link", href: tag_args.delete("src"), media: "all",
  #         rel: "stylesheet", type: "text/css"
  #   end
  # map_remote_items = card.group_remote_card.map_items - the item configs
  # carry "src" (right/group_remote.rb's url list); the double hands one
  # hash per content line.
  def remote_include_tags_body(item_card)
    content = item_card.group_remote_content
    return "" if content.nil?

    content.split("\n").reject(&:empty?).map do |src|
      tag_args = { "src" => src }
      tag "link", href: tag_args.delete("src"),
                  media: "all", rel: "stylesheet", type: "text/css"
    end
  end
end

class ModStyleCardDouble
  attr_reader :name, :item_cards
  def initialize(name, item_cards)
    @name = name
    @item_cards = item_cards
  end
  def url_key
    @name.tr(" ", "_")
  end
end

class NameString < String
  def url_key
    tr(" ", "_")
  end
end

# --- drive the scenarios -----------------------------------------------------

# The deck's documented mod-style state: the style mod's remote group
# carries the Material Icons stylesheet, the bootstrap mod's remote
# group is empty.
style_mod_card = ItemCardDouble.new(NameString.new("mod: style"),
                                    group_remote_content:
                                      "https://fonts.googleapis.com/css2?family=Material+Icons",
                                    asset_output_content: "1790661047.css")
bootstrap_mod_card = ItemCardDouble.new(NameString.new("mod: bootstrap"),
                                        group_remote_content: "")

# Scenario 1: view :remote_include_tags on Mod+*style (the tag bytes over
# the group remote list).
fmt1 = StyleFormatDouble.new(style_mod_card, [])
remote_tags_1 = Array(fmt1.nest(style_mod_card, view: :remote_include_tags)).join("
")
# the mod card's own view body runs through the same path
raise "tag bytes drifted: #{remote_tags_1.inspect}" unless remote_tags_1 ==
  '<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />'

# cross-check against the TS constant: src/card/render/head-views.ts's
# REMOTE_STYLE_TAG must carry byte-identical link markup
captured_constant = File.read(head_views_ts)[/<link href="https:\/\/fonts\.googleapis\.com[^"]*" media="all" rel="stylesheet" type="text\/css" \/>/]
raise "captured constant not found" unless captured_constant
raise "oracle bytes != captured constant" unless remote_tags_1 == captured_constant

emit(behaviorId: "view:remote_include_tags",
     kind: "view-fragment",
     scenario: "remote_include_tags_tags",
     gemSource: "type_plus_right/mod/style.rb:26-32 + card-mod-assets mod_assets.rb:167-169 + right/group_remote.rb:25-31",
     tags: remote_tags_1,
     capturedConstant: captured_constant)

# Scenario 2: the empty group remote -> "" (present? drops it upstream).
remote_tags_empty = Array(fmt1.nest(bootstrap_mod_card, view: :remote_include_tags)).join("
")
emit(behaviorId: "view:remote_include_tags",
     kind: "view-fragment",
     scenario: "remote_include_tags_empty_group",
     gemSource: "type_plus_right/mod/style.rb:26-32 (map over an empty list)",
     tags: remote_tags_empty)

# Scenario 3: view :remote_style_tags on *style mods (self/style_mods.rb:
# 8-14) - item_cards nested at :remote_include_tags, present?-filtered,
# output-joined "\n".
style_mods_card = ModStyleCardDouble.new("*style mods", [style_mod_card, bootstrap_mod_card])
items3 = [fmt1.nest(style_mod_card, view: :remote_include_tags),
          fmt1.nest(bootstrap_mod_card, view: :remote_include_tags)].select(&:present?)
remote_style_tags = items3.join("\n")
emit(behaviorId: "view:remote_style_tags",
     kind: "view-fragment",
     scenario: "remote_style_tags_nest",
     gemSource: "self/style_mods.rb:8-14 (item nest + select(&:present?) + output join)",
     tags: remote_style_tags)

# Scenario 4: view :stylesheet_include_tag on Mod+*style (tpr/mod/style.rb:
# 20-24) - item_cards nested; a style-GROUP item's arm raises (the
# undefined helper) and the nest's quiet rescue substitutes.
group_card = ItemCardDouble.new(NameString.new("bootstrap skin"))
mod_style_card2 = ItemCardDouble.new(NameString.new("mod: bootstrap"),
                                     group_remote_content: "",
                                     asset_output_content: nil)
mod_style_card2.define_singleton_method(:item_cards) { [group_card] }
fmt4 = StyleFormatDouble.new(mod_style_card2, [group_card])
def fmt4.nest(item_card, view:)
  if view == :stylesheet_include_tag
    if item_card.name.start_with?("mod:")
      item_card.item_cards.map { |ic| nest(ic, view: view) }.join("\n")
    else
      "Error rendering: #{item_card.name} (stylesheet_include_tag view)"
    end
  end
end
nested4 = fmt4.nest(mod_style_card2, view: :stylesheet_include_tag)
emit(behaviorId: "view:stylesheet_include_tag",
     kind: "view-fragment",
     scenario: "stylesheet_include_tag_item_nest",
     gemSource: "type_plus_right/mod/style.rb:20-24 + abstract/style_group.rb:37-40 (the abstract arm's bare helper is undefined in the gem universe - NoMethodError -> the quiet rescue)",
     bytes: nested4)

# Scenario 5: view :stylesheet_path on Set+*style (tpr/set/style.rb:28-33)
# - the headless params absence computes the else arm: card.asset_output_url.
class SetStyleCardDouble < ItemCardDouble
  def url_key
    name.url_key
  end
end
set_style_card = SetStyleCardDouble.new(NameString.new("*all+*style"),
                                        asset_output_content: "1790661047.css")
fmt5 = StyleFormatDouble.new(set_style_card, [])
path5 = fmt5.asset_output_url_for(set_style_card)
emit(behaviorId: "view:stylesheet_path",
     kind: "view-fragment",
     scenario: "stylesheet_path_else_arm",
     gemSource: "type_plus_right/set/style.rb:28-33 (params[:debug] absent headlessly -> card.asset_output_url)",
     path: path5)
