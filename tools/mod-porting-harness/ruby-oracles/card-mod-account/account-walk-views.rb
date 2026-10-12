# account-walk-views.rb — static-ruby oracle for card-mod-account's
# census views :content_formgroups (set/type/signup/views.rb:11-13) and
# :setup (set/type/user.rb:10-19) — the structure-driven formgroup walk and
# the first-run setup form.
#
# WHAT RUNS (byte-producing where the gem source controls the bytes):
#   1. The REAL cardname gem (cardname-0.20.0 whole lib + the card-core
#      Card::Name bridge): the field-mark math (Name#field), the keys.
#   2. The REAL Haml 5.2.2 over the gem's verbatim setup_help.haml.
#   3. Verbatim gem source regions evaled into doubles:
#      - card-mod-content set/all/chunk.rb: the explicit-edit-fields walk
#        (edit_fields / edit_field_configs / explicit_edit_fields_config /
#        normalized_edit_field_config / normalized_edit_field_mark) - the
#        WALK the two views ride
#      - card-mod-account set/abstract/account_holder.rb account_formgroups
#        (143-145) + set/right/account/views.rb before :content_formgroups
#        (59-61) + set/type/signup/views.rb :content_formgroups (11-13) +
#        set/type/user.rb :setup chain (10-45: view, setup_form,
#        setup_form_buttons, setup_button, setup_hidden_fields)
#      - card-mod-edit set/all/form_elements.rb submit_button (59-66) over
#        the Rails button_tag double (the pinned bootstrap byte shape)
#      - card core auth/setup.rb needs_setup? (9-15) - the census predicate
#
# STUBS, each documented:
#   params           - the headless render has no request params (the
#                      documented convention); no view here reads one.
#   card / voo       - the probe-card doubles (a Sign Up card "Probe Signup"
#                      with its +*account trait; a User card "Probe Admin"
#                      for :setup); voo = the visibility double.
#   subformat._render- THE ENGINE SEAM: the +account subformat's render
#                      dispatches through the mod chain (the before hook ->
#                      the edit mod's content_formgroups -> the walk). The
#                      oracle runs the REAL chain pieces verbatim and marks
#                      the nested FIELD-CARD renders (the +email/+password
#                      edit_in_form editors) as seams - their bytes are the
#                      engine's (the probe renders them through the seeded
#                      runtime).
#   Auth.as_bot      - the permission-widening wrapper: the headless probe
#                      seeds the read grants instead.
#   Card.default_accounted_type_id - the Sign Up codename card's id (decko
#                      vocabulary; the fixture decks seed codename "signup").
#   Card.config.action_mailer.perform_deliveries - BOTH arms rendered (the
#                      delivery-off warning block is the deck-config arm).
#   Card.cache / Card.search / Card.count_by_cql - the needs_setup? census
#                      reads; the oracle pins the PREDICATE SHAPE (the count
#                      zero? decision) - the census itself is first-run-
#                      setup.ts's ported machinery.
#
# Usage: ruby account-walk-views.rb <card-mod-account-gem-path> [repo-root]

require "json"
require "uri"

gem "activesupport", "7.2.4"
require "active_support"
require "active_support/core_ext/array/wrap"
require "active_support/core_ext/object/blank"
require "active_support/core_ext/hash/reverse_merge"
gem "haml", "5.2.2"
require "haml"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-account-gem-path> [repo-root]"
repo_root = ARGV[1] || File.expand_path("../../../..", __dir__)
abort "not a card-mod-account gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-account")
GEMS = File.dirname(File.expand_path(gem_path)).tr("\\", "/")
ACCOUNT = File.expand_path(gem_path).tr("\\", "/")
EDIT = File.join(GEMS, "card-mod-edit-0.20.0")
CONTENT = File.join(GEMS, "card-mod-content-0.20.0")
CARD = File.join(GEMS, "card-1.110.0")
[ACCOUNT, EDIT, CONTENT, CARD].each { |p| abort "mod gem not found: #{p}" unless File.directory?(p) }

def emit(obj)
  puts JSON.generate(obj)
end

# --- the REAL name machinery -------------------------------------------------
$LOAD_PATH.unshift File.join(GEMS, "cardname-0.20.0", "lib")
require "cardname"

class Card; end
class Card
  module Codename
    TABLE = { signup: "Sign Up", email: "email", password: "password" }.freeze

    def self.name!(key)
      TABLE.fetch(key.to_sym) { raise "codename not in the oracle table: #{key}" }
    end
  end

  class Name < Cardname
    class << self
      def [](*cardish)
        cardish = cardish.first if cardish.size <= 1
        case cardish
        when Symbol then Card::Codename.name!(cardish)
        when Array  then compose(cardish)
        when String, nil then new(cardish)
        else raise "unsupported cardish: #{cardish.inspect}"
        end
      end

      def compose(parts)
        new(parts.map { |part| self[part] }.join(joint))
      end

      def new(str, _validated_parts = nil)
        super(str.to_s)
      end
    end

    def url_key
      tr(" ", "_").downcase
    end
  end
end
String.include(Module.new do
  def to_name
    Card::Name.new(self)
  end
end)
Symbol.include(Module.new do
  def to_name
    Card::Name.new(to_s)
  end
end)
Array.include(Module.new do
  def to_name
    Card::Name.compose(self) # array.rb:12-17 cardname compose
  end
end)

# --- the REAL Haml for setup_help ---------------------------------------------
# Card.config.action_mailer.perform_deliveries - the deck-config read; the
# oracle flips the global for the two arms
def render_setup_help(deliveries)
  path = File.join(ACCOUNT, "set", "type", "user", "setup_help.haml")
  Card.config_deliveries = deliveries
  engine = Haml::Engine.new(File.read(path))
  engine.render(Object.new)
end

class Card
  class << self
    attr_accessor :config_deliveries

    def config
      self
    end

    def action_mailer
      self
    end

    def perform_deliveries
      @config_deliveries
    end
  end
  @config_deliveries = true
end

# --- the walk (card-mod-content set/all/chunk.rb verbatim regions) -------------
def walk_src
  @walk_src ||= File.readlines(File.join(CONTENT, "set", "all", "chunk.rb"))
end

def walk_region(a, b)
  walk_src[(a - 1)...b].join
end

WALK_VERBATIM = <<'RUBY'
# verbatim card-mod-content set/all/chunk.rb (the format :html walk pieces)
def edit_fields
  voo.edit_structure || []
end

def edit_field_configs(fields_only = false)
  if edit_fields.present?
    explicit_edit_fields_config
  else
    implicit_edit_fields_config fields_only
  end
end

def explicit_edit_fields_config
  edit_fields.map do |cardish, options|
    normalized_edit_field_config cardish, options
  end
end

# the IMPLICIT arm (the content's nest-chunk walk) - the engine has no
# nest-chunk enumerator (the edit mod's disclosed remainder, the
# editNestsView precedent); the double answers [] -> the structure_link arm
def implicit_edit_fields_config(_fields_only)
  []
end

def normalized_edit_field_config(cardish, options = {})
  options ||= {}
  field_mark = normalized_edit_field_mark cardish, options
  options[:title] ||= Card::Name[field_mark]
  [field_mark, options]
end

def normalized_edit_field_mark(cardish, options = {})
  return cardish if options.delete(:absolute) || normalized_edit_field_mark?(cardish)

  card.name.field cardish
end

def normalized_edit_field_mark?(cardish)
  cardish.is_a?(Card) || (cardish.is_a?(String) && cardish.to_name.compound?)
end

def multi_card_edit(fields_only = false)
  field_configs = edit_field_configs fields_only
  return structure_link if field_configs.empty?

  field_configs.map do |name, options|
    nest name, options || {}
  end.join "\n"
end
RUBY

# --- the doubles ----------------------------------------------------------------
class VooDouble
  attr_accessor :edit_structure, :title, :help

  def initialize
    @hidden = []
    @shown = []
  end

  def hide(view)
    @hidden << view.to_sym unless @hidden.include?(view.to_sym)
  end

  def hide!(view)
    hide(view)
  end

  def show!(view)
    @shown << view.to_sym unless @shown.include?(view.to_sym)
  end

  def show?(view)
    !@hidden.include?(view.to_sym)
  end
end

class WalkCardDouble
  attr_reader :name

  def initialize(name_s, type_name)
    @name = Card::Name[name_s]
    @type_name = type_name
  end

  def type_name
    @type_name
  end

  # AccountHolder#account: the codename trait card's name (the fetch resolves
  # "<card>+*account"; the walk renders the TRAIT name)
  def account
    Card::Name["#{@name}+*account"]
  end
end

class WalkFormatDouble
  attr_reader :card, :voo

  def initialize(card)
    @card = card
    @voo = VooDouble.new
  end

  # THE NEST SEAM: the nested field-card render (the edit_in_form editor the
  # engine renders; the dispatch contract is the pinned line)
  def nest(name, _opts = {})
    "%%NEST_SEAM[#{name}]%%"
  end

  # form.rb:124-129 structure_link (the empty-configs fallback; unreachable
  # when the before hook set edit_structure - the walk's other arm)
  def structure_link
    "<label>Content</label><p><em>Uneditable; content is " \
      "<a class=\"wanted-card\" href=\"/\">structured</a> without nests</em></p>"
  end

  # card core format/content.rb (the pinned byte shapes)
  def css_classes(*array)
    array.flatten.uniq.compact * " "
  end

  def classy(*classes)
    classes.flatten.compact.join(" ")
  end

  def wrap_with(tag, content_or_args = {}, html_args = {}, &block)
    tag_args = block_given? ? content_or_args : html_args
    content = block_given? ? yield : content_or_args
    attrs = tag_args.map { |k, v| %( #{k}="#{v}") }.join
    "<#{tag}#{attrs}>#{content}</#{tag}>"
  end

  def output(*content)
    content = yield if block_given?
    Array.wrap(content).flatten.compact.join "\n"
  end

  def multi_card_editor?
    voo.edit_structure.present? # voo.structure unset on every surface here
  end

  eval(WALK_VERBATIM, binding, "walk-verbatim")
end

# --- verbatim account gem regions ------------------------------------------------
account_holder_src = File.readlines(File.join(ACCOUNT, "set", "abstract", "account_holder.rb"))
# 143-145 account_formgroups
account_formgroups_src = account_holder_src[142..144].join

right_views_src = File.readlines(File.join(ACCOUNT, "set", "right", "account", "views.rb"))
# 59-61 the before hook
before_hook_src = right_views_src[58..60].join

signup_views_src = File.readlines(File.join(ACCOUNT, "set", "type", "signup", "views.rb"))
# 11-13 view :content_formgroups
signup_cfg_src = signup_views_src[10..12].join

user_src = File.readlines(File.join(ACCOUNT, "set", "type", "user.rb"))
# 10-19 view :setup; 27-33 setup_form; 35-39 buttons; 41-45 hidden fields
setup_view_src = user_src[9..18].join
setup_form_src = user_src[26..32].join
setup_buttons_src = user_src[34..38].join
setup_hidden_src = user_src[40..44].join

form_elements_src = File.readlines(File.join(EDIT, "set", "all", "form_elements.rb"))
submit_button_src = form_elements_src[58..65].join

# --- the pinned button_tag double (bootstrap form.rb:14-18 + Rails) -------------
def button_tag(content, options)
  situation = options.delete(:situation) || "primary"
  options[:class] = [options[:class], "btn", "btn-#{situation}"].compact * " "
  data = options.delete(:data) || {}
  data_attrs = data.map { |k, v| %( data-#{k.to_s.tr("_", "-")}="#{v}") }.join
  attr_str = options.map { |k, v| %( #{k}="#{v}") }.join
  "<button name=\"button\" type=\"submit\"#{data_attrs}#{attr_str}>#{content}</button>"
end

# submit_button verbatim (form_elements.rb:59-66) over the pinned button_tag
def format_submit_button(args = {})
  text = args.delete(:text) || "Submit"
  args.reverse_merge! situation: "primary", data: {}
  args[:data][:disable_with] ||= args.delete(:disable_with) || "Submitting"
  button_tag text, args
end

# setup_button verbatim (user.rb:41-44)
def format_setup_button
  format_submit_button(text: "Set up", disable_with: "Setting up")
end

# setup_hidden_fields verbatim (user.rb:46-53) over the hidden_tags chain
def format_setup_hidden_fields
  hidden_tags(
    card: {
      type_id: Card.default_accounted_type_id,
      trigger: %w[check_setup]
    },
    success: { redirect: true, mark: path(mark: "") }
  )
end

# hidden_tags verbatim (form_elements.rb:23-40)
def hidden_tags(hash, base = nil, options = {})
  hash ||= {}
  hash.inject("") do |result, (key, val)|
    new_base = base ? "#{base}[#{key}]" : key
    result + process_hidden_value(val, new_base, options)
  end
end

def process_hidden_value(val, base, options = {})
  case val
  when Hash
    hidden_tags val, base, options
  when Array
    base += "[]"
    val.map { |v| process_hidden_value v, base, options }.join
  else
    hidden_field_tag base, val, options
  end
end

# Rails hidden_field_tag (form_tag_helper.rb:255-268); the nil value omits
# the value attribute
def hidden_field_tag(name, value = nil, _options = {})
  id = name.to_s.tr("]", "").tr("[", "_")
  attrs = %( type="hidden" name="#{name}" id="#{id}")
  attrs += %( value="#{value}") unless value.nil?
  '<input' + attrs + ' autocomplete="off" />' 
end

# Card.default_accounted_type_id - the Sign Up codename card's id (the deck
# vocabulary; the probe decks seed codename "signup")
def Card.default_accounted_type_id
  501
end
def path(_opts)
  "/" # path(mark: "") -> "" -> contextualize_path -> "/" (the html arm)
end

# ============================================================================
# SCENARIO 1: the content_formgroups WALK on the signup card
#   signup/views.rb:11-13 view body; account_formgroups renders the +*account
#   subformat's content_formgroups under structure: true; the before hook
#   sets voo.edit_structure; the edit mod's fieldset + the explicit walk.
# ============================================================================
signup_card = WalkCardDouble.new("Probe Signup", "Sign Up")
signup_fmt = WalkFormatDouble.new(signup_card)

# account_formgroups (account_holder.rb:143-145) with the subformat dispatch:
# the +*account card's format runs the before hook then the edit mod's
# content_formgroups
account_card = WalkCardDouble.new(signup_card.account.to_s, "Phrase")
account_fmt = WalkFormatDouble.new(account_card)

# run the before hook against the account subformat's voo (verbatim body)
account_fmt.voo.instance_eval do
  self.edit_structure = [[:email, { title: "email" }],
                         [:password, { title: "password" }]]
end

# the edit mod's content_formgroups: wrap_with :fieldset, edit_slot,
# class: classy("card-editor", "editor"); edit_slot -> multi_card_edit(true)
fieldset_bytes = account_fmt.wrap_with(:fieldset, account_fmt.multi_card_edit(true), class: account_fmt.classy("card-editor", "editor"))

# the signup view body: [account_formgroups, (multi_card_editor? ? ... : "")].join
signup_body = [fieldset_bytes, (signup_fmt.multi_card_editor? ? signup_fmt.multi_card_edit(true) : "")].join

emit(behaviorId: "view:content_formgroups",
     kind: "view-bytes",
     scenario: "signup_content_formgroups_walk",
     gemSource: "set/type/signup/views.rb:11-13 + set/abstract/account_holder.rb:143-145 (account_formgroups) + set/right/account/views.rb:59-61 (the before hook's edit_structure) + card-mod-content set/all/chunk.rb:55-100 (the explicit walk) + card-mod-edit set/all/form.rb:4-7/:115-122 (the fieldset + multi_card_edit)",
     paramsSeam: "none (the walk reads no request params; Auth.as_bot widens the reads - the probe seeds the grants)",
     normalizedConfigs: [["Probe Signup+*account+email", { "title" => "email" }],
                         ["Probe Signup+*account+password", { "title" => "password" }]],
     signupMultiCardArm: signup_fmt.multi_card_editor?,
     bytes: signup_body,
     nestSeams: ["Probe Signup+*account+email", "Probe Signup+*account+password"],
     liveCrossCheck: "the fieldset + the normalized field marks are gem-source bytes; the nested +email/+password edit_in_form editors are the ENGINE seam (the probe renders them through the seeded runtime)")

# ============================================================================
# SCENARIO 2: the walk's EMPTY arm (no edit_structure -> structure_link)
# ============================================================================
empty_fmt = WalkFormatDouble.new(WalkCardDouble.new("Probe Basic", "Basic"))
empty_bytes = empty_fmt.multi_card_edit(true)
emit(behaviorId: "view:content_formgroups",
     kind: "view-contract",
     scenario: "walk_empty_configs_structure_link",
     gemSource: "card-mod-edit set/all/form.rb:124-129 structure_link (the multi_card_edit empty-configs fallback)",
     bytes: empty_bytes)

# ============================================================================
# SCENARIO 3: view :setup - the voo contract + the form chain
#   user.rb:10-19: with_nest_mode :edit; voo.title; voo.show! :help;
#   voo.hide! :menu; voo.help = haml :setup_help; Auth.as_bot { setup_form }.
#   setup_form (27-33): frame_and_form :create { [setup_hidden_fields,
#   _render_name_formgroup, account_formgroups, setup_form_buttons] }.
# ============================================================================
setup_card = WalkCardDouble.new("Probe Admin", "User")
setup_fmt = WalkFormatDouble.new(setup_card)
setup_fmt.voo.title = "Your deck is ready to go!"
setup_fmt.voo.show!(:help)
setup_fmt.voo.hide!(:menu)
help_on = render_setup_help(false)
help_off = render_setup_help(true)
setup_voo_contract = {
  title: "Your deck is ready to go!",
  show: ["help"],
  hide: ["menu"],
  nestMode: "edit",
  helpBytes: help_on,
  helpDeliveryOffBytes: help_off
}
hidden_fields_bytes = format_setup_hidden_fields
setup_button_bytes = format_submit_button(text: "Set up", disable_with: "Setting up")
buttons_group = setup_fmt.wrap_with(:div, { class: "form-group " + setup_fmt.classy("button-form-group") }) do
  setup_button_bytes
end

emit(behaviorId: "view:setup",
     kind: "view-contract",
     scenario: "setup_voo_and_form_chain",
     gemSource: "set/type/user.rb:10-19 (the voo contract + the Auth.as_bot dispatch) + :27-33 (setup_form: frame_and_form :create over [setup_hidden_fields, _render_name_formgroup, account_formgroups, setup_form_buttons]) + :35-45 (the buttons + the hidden fields) + set/type/user/setup_help.haml (real Haml 5.2.2)",
     paramsSeam: "none (perms :needs_setup? is the deck census; the seam is first-run-setup.ts's setupWindowState verdict - the sync view gate reads the prepared verdict)",
     voo: setup_voo_contract,
     hiddenFields: {
       card_type_id: Card.default_accounted_type_id,
       card_trigger: ["check_setup"],
       success: { "redirect" => true, "mark" => "/" }
     },
     hiddenFieldsBytes: hidden_fields_bytes,
     setupButtonBytes: setup_button_bytes,
     buttonsGroupBytes: buttons_group,
     formChain: "frame_and_form :create -> frame { card_form :create, form_opts { body } } - the body is output([hidden_fields, name_formgroup, account_formgroups(the scenario-1 walk), buttons_group])")

# ============================================================================
# SCENARIO 4: needs_setup? - the census predicate shape (auth/setup.rb:9-15)
#   needs_setup? is false once the account count is non-zero; the census
#   itself (user_account_cql: right: *account, creator != DeckoBot) is
#   first-run-setup.ts's ported machinery - the view gate reads its verdict.
# ============================================================================
emit(behaviorId: "view:setup",
     kind: "view-contract",
     scenario: "needs_setup_predicate",
     gemSource: "card core lib/card/auth/setup.rb:9-15 + :33-40 (needs_setup_if_no_accounts = user_account_count.zero?; the census cql right: :account, creator_id != DeckoBot)",
     predicate: "open iff the non-bot user-account count is zero; once false it stays false (the NEEDS_SETUP cache write)",
     seam: "the sync view gate reads first-run-setup.ts setupWindowState's prepared verdict (reason 'needs_setup'); the census is async SQL")
