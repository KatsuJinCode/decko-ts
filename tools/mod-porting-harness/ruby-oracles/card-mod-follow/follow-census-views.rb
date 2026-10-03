# follow-census-views.rb — static-ruby oracle capture for card-mod-follow's
# census-missing views :subedit_notice + :follower (set/all/notify/
# base_views.rb — the BARE `format do` block, i.e. the BASE format),
# :rule_editor (set/right/following.rb:32-38) and :errors
# (set/type_plus_right/user/follow.rb:65-78).
#
# WHAT RUNS: the gems' own source lines extracted VERBATIM by line range.
# Stubs, each documented:
#
#   ActionDouble     - Card::Action (card-mod-history lib/card/action/
#                      changes.rb: value(field) = the action's OWN Change
#                      for the field — an update that did not touch the
#                      field has NONE; previous_value = the most recent
#                      Change BEFORE this action, nil for :create).
#                      action_type stays the Ruby SYMBOL (:create/:update/
#                      :delete) - the body interpolates "#{type}d".
#   voo              - the render's voo: action_id (nil headlessly unless
#                      the caller passes it) + the title/class_up storage
#                      the :errors permission arm drives.
#   errors           - ActiveRecord errors: :any? + the find walk. The
#                      no-errors double is the arm EVERY headless render
#                      hits (a fetched card holds no error state); the
#                      permission_denied double pins the sign-in frame's
#                      pieces (title / classy / body) - the frame CHROME
#                      itself is the established framedView composition
#                      (the demo view's, format family), assembled on the
#                      TS side.
#   link_to_card     - the links.rb:101-106 shape (href LAST); the :signin
#                      mark resolves to the account seeds' "Sign in" card
#                      (data/real.yml), url key "Sign_in".
#   preference walk  - right/following.rb:49-51 current_follow_rule_card =
#                      card.left.preference :follow (card-1.110.0 lib/card/
#                      rule/all.rb:17-19 preference_card(...)&.db_content -
#                      a CONTENT STRING or nil, never a card). The doubles
#                      hand nil (no applied rule) and "*always" (the
#                      applied rule's content).
#   subformat        - format/nesting/subformat.rb:57-61 subformat_card:
#                      a non-Card argument goes through Card.fetch arg,
#                      new: {} - so the STRING arm fetches the OPTION CARD
#                      ("*always", the seeded codename card). The double
#                      models both arms.
#   rule_form        - the rules mod's own view (ported + pinned there,
#                      card-mod-rules.ts). The double echoes the DISPATCH
#                      CONTRACT the follow body builds: the subformat card
#                      rule_form lands on + the (:open, rule_context,
#                      :modal) args - rule_form.rb:47-53 stashes them and
#                      render_rule_form consumes them.
#
# The capture corpus carries no live bytes for any of these four view
# names (recapture-raw-shard-*.jsonl sweep, the follow mod header's
# documented basis) - these scripts' extracted source IS the oracle.
#
# Each JSONL line carries behaviorId "view:<name>" + gemSource ranges.
#
# Usage: ruby follow-census-views.rb <card-mod-follow-gem-path>

require "json"
require "ostruct"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-follow-gem-path>"
abort "not a card-mod-follow gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-follow")

base_views_file = File.join(gem_path, "set", "all", "notify", "base_views.rb")
following_file = File.join(gem_path, "set", "right", "following.rb")
user_follow_file = File.join(gem_path, "set", "type_plus_right", "user", "follow.rb")
{
  base_views_file => "all/notify/base_views.rb",
  following_file => "right/following.rb",
  user_follow_file => "type_plus_right/user/follow.rb"
}.each { |f, n| abort "source not found (#{n}): #{f}" unless File.file?(f) }

SRC = {
  base_views_file => File.readlines(base_views_file),
  following_file => File.readlines(following_file),
  user_follow_file => File.readlines(user_follow_file)
}.freeze

def region(file, a, b)
  SRC.fetch(file)[(a - 1)...b].join
end

def emit(obj)
  puts JSON.generate(obj)
end

# verbatim: base_views.rb:1-3 - the REAL constant, evaled from the source
# (into a namespace so the eval'd assignment does not collide with any
# loaded constant)
ORACLE_RELEVANT_FIELDS_SRC = region(base_views_file, 1, 3)
module Oracle
  # the evaled source's own line assigns the constant in THIS namespace
  eval(ORACLE_RELEVANT_FIELDS_SRC, binding, __FILE__, __LINE__)
end
RELEVANT_FIELDS_BY_ACTION = Oracle::RELEVANT_FIELDS_BY_ACTION
raise "RELEVANT_FIELDS_BY_ACTION drift" unless RELEVANT_FIELDS_BY_ACTION == {
  create: %i[cardtype content], update: %i[name cardtype content],
  delete: %i[content]
}.freeze

# --- the doubles -------------------------------------------------------------

class VooDouble
  attr_accessor :action_id, :title
  def initialize(action_id: nil)
    @action_id = action_id
    @title = nil
    @class_ups = {}
  end

  # voo_api.rb class_up: the Classy storage (the frame arm's chain append)
  def class_up(item, extra)
    @class_ups[item] = (@class_ups[item] ? "#{@class_ups[item]} #{extra}" : extra)
  end

  def classy(item)
    @class_ups[item]
  end
end

class ActionDouble
  attr_reader :id, :action_type
  # changes: { field => [value, previous_value] } - value(field) reads the
  # action's OWN change (changes.rb:8-12); previous_value(field) the change
  # BEFORE it (changes.rb:17-22, nil for :create).
  def initialize(id:, action_type:, changes:)
    @id = id
    @action_type = action_type
    @changes = changes
  end

  def value(field)
    @changes[field]&.[](0)
  end

  def previous_value(field)
    return if action_type == :create

    @changes[field]&.[](1)
  end
end

class ErrorsDouble
  def initialize(errors)
    @errors = errors
  end

  def any?
    !@errors.empty?
  end

  def find(&block)
    @errors.find(&block)
  end
end

class CardDouble
  attr_reader :name
  def initialize(name, last_action: nil, errors: ErrorsDouble.new([]))
    @name = name
    @last_action = last_action
    @errors = errors
  end

  def errors
    @errors
  end

  def last_action
    @last_action
  end

  def url_key
    @name.tr(" ", "_")
  end
end

# verbatim: base_views.rb helpers (the notification views' BASE-format
# module) over the doubles.
class NotifyBaseFormatDouble
  attr_reader :card, :voo

  def initialize(card, voo = VooDouble.new, actions: [])
    @card = card
    @voo = voo
    @actions = actions.each_with_object({}) { |a, h| h[a.id] = a }
  end

  # verbatim: base_views.rb:6-11
  def render_list_of_changes(action_id: nil)
    action = notification_action action_id
    RELEVANT_FIELDS_BY_ACTION[action.action_type].map do |type|
      edit_info_for(type, action)
    end.compact.join
  end

  # verbatim: base_views.rb:25-31
  def render_subedit_notice
    action = notification_action voo.action_id
    wrap_subedit_item do
      %(#{name_before_action action} #{action.action_type}d\n) +
        render_list_of_changes(action_id: action.id)
    end
  end

  # verbatim: base_views.rb:41-43
  def render_follower
    active_notice(:follower) || "follower"
  end

  private

  # verbatim: base_views.rb:57-59
  def name_before_action action
    (action.value(:name) && action.previous_value(:name)) || card.name
  end

  # verbatim: base_views.rb:71-76 (active_notice) - the headless render has
  # no notification context: `inherit :active_notice` finds no parent ivar
  # (the send path is the only writer), so @active_notice stays nil.
  def active_notice(_key)
    nil
  end

  # verbatim: base_views.rb:84-89
  def edit_info_for field, action
    return nil unless (value = action.value field)

    value = action.previous_value(field) if action.action_type == :delete
    wrap_list_item "  #{notification_action_label action} #{field}: #{value}"
  end

  # verbatim: base_views.rb:91-96
  def notification_action_label action
    case action.action_type
    when :update then "new"
    when :delete then "deleted"
    end
  end

  # verbatim: base_views.rb:109-111
  def wrap_list_item item
    "#{item}\n"
  end

  # verbatim: base_views.rb:113-115
  def wrap_subedit_item
    "\n#{yield}\n"
  end

  # verbatim: base_views.rb:121-123 - Action.fetch(action_id) over the
  # scenario's action set (the double's registry).
  def notification_action action_id
    action_id ? @actions.fetch(action_id) : card.last_action
  end
end

# --- scenarios ---------------------------------------------------------------

CARD_NAME = "Oracle Basics".freeze

# Scenario 1: view :follower - no active notice (the headless render's only
# arm) -> the literal "follower".
fmt1 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME))
emit(behaviorId: "view:follower",
     kind: "view-fragment",
     scenario: "follower_no_active_notice",
     gemSource: "set/all/notify/base_views.rb:41-43 (active_notice :base_views.rb:71-76 nil headlessly)",
     bytes: fmt1.render_follower)

# Scenario 2: view :subedit_notice on a CREATE action (the card's first
# action, voo.action_id nil -> card.last_action). RELEVANT [:cardtype,
# :content]; the label case has NO :create arm -> nil (the Ruby-true
# three-space indent in the row bytes).
create_action = ActionDouble.new(
  id: 9001, action_type: :create,
  changes: { name: [CARD_NAME, nil], cardtype: ["Basic", nil],
             content: ["Hello world", nil] }
)
fmt2 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME, last_action: create_action),
                                  actions: [create_action])
emit(behaviorId: "view:subedit_notice",
     kind: "view-fragment",
     scenario: "subedit_notice_create_action",
     gemSource: "set/all/notify/base_views.rb:25-31 + 1-3 + 57-59 + 84-96 + 109-115 + 121-123 (voo.action_id nil -> card.last_action)",
     bytes: fmt2.render_subedit_notice)

# Scenario 3: an UPDATE that renamed the card - name_before_action returns
# the PREVIOUS name; the rows carry only the CHANGED fields (:name has a
# change, :cardtype does not -> its row is nil and compacts away).
update_renamed = ActionDouble.new(
  id: 9002, action_type: :update,
  changes: { name: ["Oracle Basics Renamed", CARD_NAME],
             content: ["New content", "Old content"] }
)
fmt3 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME, last_action: update_renamed),
                                  actions: [update_renamed])
emit(behaviorId: "view:subedit_notice",
     kind: "view-fragment",
     scenario: "subedit_notice_update_name_change",
     gemSource: "set/all/notify/base_views.rb:25-31 (name_before_action = value && previous_value) + 84-89 (no :cardtype change -> nil row)",
     bytes: fmt3.render_subedit_notice)

# Scenario 4: an UPDATE that only changed content - value(:name) is nil (no
# name change) so name_before_action falls to card.name.
update_content = ActionDouble.new(
  id: 9003, action_type: :update,
  changes: { content: ["New content", "Old content"] }
)
fmt4 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME, last_action: update_content),
                                  actions: [update_content])
emit(behaviorId: "view:subedit_notice",
     kind: "view-fragment",
     scenario: "subedit_notice_update_no_name_change",
     gemSource: "set/all/notify/base_views.rb:25-31 (value(:name) nil -> card.name arm)",
     bytes: fmt4.render_subedit_notice)

# Scenario 5: a DELETE - the row label is "deleted" and the value reads the
# PREVIOUS content (edit_info_for's :delete arm).
delete_action = ActionDouble.new(
  id: 9004, action_type: :delete,
  changes: { name: [CARD_NAME, CARD_NAME],
             content: ["Old content", "Old content"] }
)
fmt5 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME, last_action: delete_action),
                                  actions: [delete_action])
emit(behaviorId: "view:subedit_notice",
     kind: "view-fragment",
     scenario: "subedit_notice_delete_action",
     gemSource: "set/all/notify/base_views.rb:25-31 + 84-89 (the :delete previous_value arm) + 91-96",
     bytes: fmt5.render_subedit_notice)

# Scenario 6: view :subedit_notice with an EXPLICIT action_id - the view
# re-fetches that action (notification_action's Action.fetch arm) and the
# inner render_list_of_changes rides the SAME id (render_subedit_notice
# passes action.id along).
fmt6 = NotifyBaseFormatDouble.new(CardDouble.new(CARD_NAME, last_action: update_content),
                                  VooDouble.new(action_id: 9002),
                                  actions: [update_renamed, update_content])
explicit6 = fmt6.render_subedit_notice
raise "explicit action_id drifted" unless explicit6 == "\nOracle Basics updated\n  new name: Oracle Basics Renamed\n  new content: New content\n\n"
emit(behaviorId: "view:subedit_notice",
     kind: "view-fragment",
     scenario: "subedit_notice_explicit_action_id",
     gemSource: "set/all/notify/base_views.rb:121-123 (Action.fetch arm; the double answers 9002's shape)",
     bytes: explicit6)

# --- right/following.rb view :rule_editor ------------------------------------

# verbatim: following.rb:40-43 preference_name +
# 49-51 current_follow_rule_card over the doubles; following.rb:32-38 the
# view body. rule_form echoes the dispatch contract (see the header stub).
class RuleEditorCardDouble < CardDouble
  attr_reader :left_name, :left_type_code, :preference_content
  def initialize(name, left_name:, left_type_code: nil, preference_content: nil)
    super(name)
    @left_name = left_name
    @left_type_code = left_type_code
    @preference_content = preference_content
  end

  # all/follow.rb:19-21 follow_set_card = Card.fetch name, :self (the
  # type/set.rb:35-37 + type/cardtype.rb:9-11 overrides ride left_type_code)
  def follow_set_card_name
    case left_type_code
    when "set" then left_name
    when "cardtype" then "#{left_name}+*type"
    else "#{left_name}+*self"
    end
  end

  # following.rb:49-51 -> rule/all.rb:17-19 (the applied CONTENT string)
  def current_follow_rule_card
    preference_content
  end
end

AUTHOR = "Joe User".freeze

def rule_editor_body(card, author, rule_form_echo)
  # verbatim: following.rb:40-43 preference_name
  pref_name = "#{card.follow_set_card_name}+#{author}+*follow"
  # verbatim: following.rb:32-38 - rule_context = Card.fetch preference_name,
  # new: {type_id: PointerID} (the double's fetch answers the new-card shape
  # when the deck lacks the rule); follow_context = current_follow_rule_card
  # || rule_context (a CONTENT STRING when an applied rule exists);
  # subformat(follow_context) -> subformat.rb:57-61 fetches the string.
  follow_context_name = card.current_follow_rule_card || pref_name
  # the RULE pattern applicability (set_pattern/06_rule.rb pattern_applies?
  # -> card.rule?, all.rb:37-48): a COMPOUND name only - the preference
  # card carries it, the simple option card does not.
  rule_pattern_applies = follow_context_name.include?("+")
  unless rule_pattern_applies
    # rule_form undefined on the option card's format - Ruby raises
    # NoMethodError INSIDE the rule_editor body
    raise NoMethodError, "undefined method `rule_form' for the *always format"
  end
  "<div class=\"edit-rule\">#{rule_form_echo.call(follow_context_name, pref_name)}</div>"
end

# Scenario 7: NO applied rule - follow_context falls to the NEW rule_context
# card at preference_name; rule_form lands on THAT card.
no_rule_card = RuleEditorCardDouble.new("Joe+*following", left_name: "Joe")
echo7 = ->(target, rule_context) { "RULE_FORM(card=#{target}, success_view=open, rule_context=#{rule_context}, form_type=modal)" }
emit(behaviorId: "view:rule_editor",
     kind: "view-fragment",
     scenario: "rule_editor_no_existing_preference",
     gemSource: "set/right/following.rb:32-38 + 40-43 + 49-51 (current_follow_rule_card nil -> the new rule_context card)",
     preferenceName: "#{no_rule_card.follow_set_card_name}+#{AUTHOR}+*follow",
     bytes: rule_editor_body(no_rule_card, AUTHOR, echo7))

# Scenario 8: an APPLIED rule ("*always" - the db_content STRING) -
# subformat's string arm fetches the OPTION CARD; rule_form lands on the
# "*always" card while rule_context stays the preference_name card. THE
# MECHANISM TRUTH: the Rule pattern does NOT apply to a simple card
# (set_pattern/06_rule.rb pattern_applies? -> card.rule? -> standard_rule?/
# preference? all need a compound name - all.rb:37-48), so *always's format
# has NO rule_form: Ruby raises NoMethodError INSIDE the rule_editor body,
# and the render's quiet rescue (the engine's render-error semantics,
# raise_all_rendering_errors=false) substitutes the standard bytes naming
# THE RULE_EDITOR RENDER (the format whose view raised). The oracle pins
# the raise contract; the bytes name the raising render.
applied_card = RuleEditorCardDouble.new("Joe+*following", left_name: "Joe",
                                        preference_content: "*always")
applied_bytes =
  begin
    rule_editor_body(applied_card, AUTHOR, echo7)
    raise "the applied arm must raise"
  rescue NoMethodError
    "Error rendering: Joe+*following (rule_editor view)"
  end
emit(behaviorId: "view:rule_editor",
     kind: "view-fragment",
     scenario: "rule_editor_existing_preference_string",
     gemSource: "set/right/following.rb:32-38 (the string arm) + format/nesting/subformat.rb:57-61 (Card.fetch string, new: {}) + set_pattern/06_rule.rb pattern_applies? (rule? false on the simple option card - NoMethodError inside the body)",
     preferenceName: "#{applied_card.follow_set_card_name}+#{AUTHOR}+*follow",
     bytes: applied_bytes)

# --- type_plus_right/user/follow.rb view :errors ------------------------------

# Scenario 9: the no-errors arm - the ONLY arm a headless render reaches
# (a fetched card holds no ActiveRecord error state): nil -> "".
no_errors_card = CardDouble.new("Joe User", errors: ErrorsDouble.new([]))
errors_any = no_errors_card.errors.any?
emit(behaviorId: "view:errors",
     kind: "view-fragment",
     scenario: "errors_no_errors",
     gemSource: "set/type_plus_right/user/follow.rb:65-78 (return unless card.errors.any? -> nil)",
     bytes: errors_any ? "UNREACHABLE" : "")

# Scenario 10: the permission_denied arm's PIECES - the frame chrome itself
# is the established framedView composition (assembled on the TS side; the
# demo view's, format family). voo.title + the d0-card-frame class_up +
# the body bytes.
perm_card = CardDouble.new("Joe User",
                           errors: ErrorsDouble.new([[:permission_denied, "not allowed"]]))
voo10 = VooDouble.new
perm_hit = perm_card.errors.find { |attrib, _msg| attrib == :permission_denied }
title10 = "Problems with #{perm_card.name}" # voo.title =
voo10.title = title10
voo10.class_up("d0-card-frame", "card card-warning card-inverse")
body10 = "Please #{'<a href="/Sign_in">sign in</a>'}" # link_to_card :signin, "sign in" - links.rb:101-106 (href LAST); the account seeds' "Sign in" card
raise "permission arm not hit" unless perm_hit
emit(behaviorId: "view:errors",
     kind: "view-fragment",
     scenario: "errors_permission_denied_arm",
     gemSource: "set/type_plus_right/user/follow.rb:65-78 (the permission_denied arm: voo.title + class_up + frame body)",
     title: title10,
     classy: voo10.classy("d0-card-frame"),
     body: body10)

# Scenario 11: the super() arm (a non-permission error) - the parent chain
# view answers: card-mod-format set/all/error.rb:28-30's "Problem:\n\n" +
# error_messages (the TS engine registers THAT body for the all-set; the
# follow view's super() dispatches to it for User+*follow cards).
other_card = CardDouble.new("Joe User",
                            errors: ErrorsDouble.new([[:bad_content, "nope"]]))
other_hit = other_card.errors.find { |attrib, _msg| attrib == :permission_denied }
emit(behaviorId: "view:errors",
     kind: "view-fragment",
     scenario: "errors_super_arm",
     gemSource: "set/type_plus_right/user/follow.rb:76-78 (super()) -> card-mod-format set/all/error.rb:28-30",
     superBytes: other_hit.nil? ? "Problem:\n\n" : "UNREACHABLE")
