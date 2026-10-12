# account-census-views.rb — static-ruby oracle capture for card-mod-account's
# census-missing views :new + :content_formgroups-source + :new_buttons
# (set/type/signup/views.rb), :edit (set/self/signin.rb:154-157, the
# FORGOT-PASSWORD form) and :account_tab (set/abstract/account_holder.rb:
# 132-137), plus the pill-item composition :account_tab's bytes ride
# (card-mod-edit set/all/board/board_pills.rb + board.rb's board_link_opts).
#
# WHAT RUNS: the gems' own source lines extracted VERBATIM by line range.
# Stubs, each documented:
#
#   Auth             - the headless render's signed-out state (current.rb:7-9
#                      defaults current_id to AnonymousID): signed_in? false.
#                      The invitation? arm (views.rb:2-4: Auth.signed_in? &&
#                      card.can_approve?) needs the admin-approval verdict
#                      machinery the headless engine does not model - the SAME
#                      disclosed basis the ported signup :core's approve links
#                      carry (card-mod-account.ts signupAccountLines) - so the
#                      signed-out title arm is the pinned arm and the
#                      invitation title is emitted as a DOCUMENTED contract
#                      line (t(:account_invite)).
#   card.can_approve? - unreachable signed-out (see Auth).
#   super()          - the base :new / base :edit bodies are the edit mod's
#                      live TS registrations (card-mod-edit.ts newView /
#                      editView); the oracle pins the voo composition the
#                      super() dispatch rides (title / edit_structure /
#                      hide), not the parent bytes (those are the edit mod's
#                      own pinned surface).
#   voo              - the render's voo (title= / hide / edit_structure
#                      storage, the edit_structure BEFORE-hook contract).
#   board pills      - board_pills.rb's composition helpers extracted
#                      verbatim; link_to_card's href = the mark path segment
#                      + the path hash's to_param query (sorted keys, Rack
#                      escape - the follow mod's followButton precedent);
#                      breadcrumb_data (board.rb:68-71): the class falls
#                      back to title.underscore.
#
# The capture corpus carries no live bytes for any of these five view
# names (no signup/setup/forgot form bytes in fixtures/captured - swept).
#
# Each JSONL line carries behaviorId "view:<name>" + gemSource ranges.
#
# Usage: ruby account-census-views.rb <card-mod-account-gem-path>

require "json"
require "cgi"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-account-gem-path>"
abort "not a card-mod-account gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-account")

signup_views_file = File.join(gem_path, "set", "type", "signup", "views.rb")
signin_file = File.join(gem_path, "set", "self", "signin.rb")
account_holder_file = File.join(gem_path, "set", "abstract", "account_holder.rb")
en_yml = File.join(gem_path, "config", "locales", "en.yml")
{
  signup_views_file => "type/signup/views.rb",
  signin_file => "self/signin.rb",
  account_holder_file => "abstract/account_holder.rb",
  en_yml => "config/locales/en.yml"
}.each { |f, n| abort "source not found (#{n}): #{f}" unless File.file?(f) }

SRC = {
  signup_views_file => File.readlines(signup_views_file),
  signin_file => File.readlines(signin_file),
  account_holder_file => File.readlines(account_holder_file)
}.freeze

def region(file, a, b)
  SRC.fetch(file)[(a - 1)...b].join
end

def emit(obj)
  puts JSON.generate(obj)
end

# en.yml strings, read from the REAL locale file
EN = File.readlines(en_yml).each_with_object({}) do |line, h|
  if (m = line.match(/^\s*(account_[a-z_]+):\s*(.+?)\s*$/))
    h[m[1]] = m[2]
  end
end
raise "account_sign_up missing" unless EN["account_sign_up"] == "Sign up"
raise "account_invite missing" unless EN["account_invite"] == "Invite"
raise "account_forgot_password missing" unless EN["account_forgot_password"] == "Forgot Password"

# cardname generate_key (underscore + Rails singularize) for the account
# tab's pill vocabulary - the same rule the related tab's pillCyKey table
# pins ("links out" -> "link_out"); the singularize table here is the
# account tab's own vocabulary.
def pill_key(text)
  table = {
    "roles" => "role",
    "notifications" => "notification"
  }
  base = text.downcase.tr(" ", "_")
  table[base] || base
end

def rack_escape(v)
  CGI.escape(v.to_s).gsub("+", "%20")
end

# Rails Hash#to_param over the path hash: sorted keys, nested [a][b],
# arrays as [a][] - Rack escape of values AND keys (the related tab's
# pinned href shape: slot%5Bitems%5D%5Bview%5D=closed).
def to_param(hash)
  pairs = []
  hash.keys.sort.each do |k|
    v = hash[k]
    if v.is_a?(Hash)
      v.keys.sort.each do |k2|
        v2 = hash[k][k2]
        if v2.is_a?(Hash)
          v2.keys.sort.each do |k3|
            v3 = hash[k][k2][k3]
            if v3.is_a?(Array)
              v3.each { |item| pairs << ["#{k}[#{k2}][#{k3}][]", item] }
            else
              pairs << ["#{k}[#{k2}][#{k3}]", v3]
            end
          end
        elsif v2.is_a?(Array)
          v2.each { |item| pairs << ["#{k}[#{k2}][]", item] }
        else
          pairs << ["#{k}[#{k2}]", v2]
        end
      end
    else
      pairs << [k, v]
    end
  end
  pairs.map { |k, v| "#{rack_escape(k)}=#{rack_escape(v)}" }.join("&")
end

# --- the board pill composition (verbatim: board_pills.rb + board.rb) --------

BOARD_PILL_UL_CLASSES = "nav nav-pills _auto-single-select board-pills flex-column".freeze
BOARD_PILL_LI_CLASSES = "nav-item".freeze
BOARD_SLOT_SELECTOR =
  ".board-main > .overlay-container > .card-slot._bottomlay-slot," \
  ".board-main > ._overlay-container-placeholder > .card-slot".freeze

def add_class(opts, extra)
  opts[:class] = opts[:class] ? "#{opts[:class]} #{extra}" : extra
end

# verbatim: board.rb:59-62
def board_slot_selector
  BOARD_SLOT_SELECTOR
end

# verbatim: board.rb:68-71 (the html_class ||= title.underscore fallback)
def breadcrumb_data(title, html_class = nil)
  html_class ||= title.downcase
  { "data-breadcrumb": title, "data-breadcrumb-class": html_class }
end

# verbatim: board.rb:42-51 board_link_opts (opts.bury :path, :layout, :overlay
# builds path[:layout]; the [:view] ||= :content default)
def board_link_opts
  opts = {}
  opts[:"data-slot-selector"] = board_slot_selector
  opts[:"data-slotter-mode"] = :override
  opts[:remote] = true
  add_class opts, "slotter"
  opts[:path] = { layout: "overlay", slot: { items: { view: "closed" } }, view: "content" }
  opts
end

# verbatim: board_pills.rb:20-30
def board_pill_item_opts(breadcrumb, extra_opts, text)
  opts = board_link_opts.merge("data-bs-toggle": "pill")
  opts.merge! breadcrumb_data(breadcrumb)
  if extra_opts
    classes = extra_opts.delete :class
    add_class opts, classes if classes
    opts = opts.deep_merge(extra_opts)
  end
  opts["data-cy"] = "#{pill_key(text)}-pill"
  add_class opts, "nav-link"
  opts
end

class Hash
  def deep_merge(other)
    clone = dup
    other.each do |k, v|
      clone[k] = clone[k].is_a?(Hash) && v.is_a?(Hash) ? clone[k].deep_merge(v) : v
    end
    clone
  end
end

# the HTML escape Rails' tag_options applies to EVERY attribute value
# (tag_helper.rb:261-309 content_tag attribute walk)
def html_escape(v)
  v.to_s.gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;").gsub('"', "&quot;")
end

# the link_to_card href shape (links.rb:101-106, href LAST): the mark path
# segment + the path hash's to_param query (the path view rides the SEGMENT);
# every attribute value rides the tag_options escape (href's & becomes &amp;).
def pill_link_html(mark_url_key, text, opts)
  path = opts[:path]
  view_segment = path.delete(:view)
  query = to_param(path)
  href = query.empty? ? "/#{mark_url_key}/#{view_segment}" : "/#{mark_url_key}/#{view_segment}?#{query}"
  attrs = opts.map do |k, v|
    next nil if k == :path
    if k == :remote
      "data-remote=\"true\""
    elsif k == :class
      "class=\"#{html_escape(v)}\""
    elsif k.to_s.start_with?("data-")
      "data-#{k.to_s[5..]}=\"#{html_escape(v)}\""
    else
      "#{k}=\"#{html_escape(v)}\""
    end
  end.compact.join(" ")
  "<a #{attrs} href=\"#{html_escape(href)}\">#{text}</a>"
end

# verbatim: board_pills.rb:13-18 board_pill_items (the mark: [card, field]
# -> "<card>+<field>" with the STAR trait expansion the engine's trait fetch
# composes; :account/:roles/:follow are codename-marked rights)
def board_pill_items(card_name, data, breadcrumb)
  data.map do |text, field, extra_opts|
    opts = board_pill_item_opts(breadcrumb, extra_opts, text)
    mark = "#{card_name}+#{field.to_s.start_with?('*') ? field : "*#{field}"}"
    pill_link_html(mark.tr(" ", "_"), text, opts)
  end
end

# verbatim: board_pills.rb:35-37 board_pill_section (wrap_with(:h6, ...) +
# wrap_each_with(:li, class: ...) - the items joined "\n")
def board_pill_section(tab_name, title, items)
  "<h6 class=\"ms-1 mt-3\">#{title}</h6>" +
    board_pill_items(CARD_NAME, items, tab_name).join("\n")
end

# verbatim: account_holder.rb:132-137 view :account_tab ->
# board_pill_sections "Account" (board_pills.rb:32-37: wrap_with :ul over
# the sections map, joined "\n")
def account_tab_bytes(details_items, content_items)
  sections = [
    board_pill_section("Account", "Settings", details_items),
    board_pill_section("Account", "Content", content_items)
  ]
  "<ul class=\"#{BOARD_PILL_UL_CLASSES}\">" + sections.join("\n") + "</ul>"
end

# verbatim: account_holder.rb:151-166 account_details_items
def account_details_items
  [
    ["Email and Password", :account,
     { path: { slot: { hide: %i[help_link board_link] } } }],
    ["Roles", :roles,
     { path: { view: :content } }],
    ["Notifications", :follow],
    ["API", :account,
     { path: { view: :api_key,
               items: { view: :content },
               slot: { hide: %i[help_link board_link] } } }],
    ["Close Account", :account,
     { path: { view: :closure } }]
  ]
end

# verbatim: account_holder.rb:168-170 account_content_items
def account_content_items
  [["Created", :created], ["Edited", :edited]]
end

CARD_NAME = "Joe User".freeze

# Scenario 1: view :account_tab on an accounted user - the two pill
# sections over the verbatim item walks.
emit(behaviorId: "view:account_tab",
     kind: "view-fragment",
     scenario: "account_tab_sections",
     gemSource: "set/abstract/account_holder.rb:132-137 + 151-170 + card-mod-edit set/all/board/board_pills.rb:9-37 + board.rb:42-71",
     bytes: account_tab_bytes(account_details_items, account_content_items))

# Scenario 2: view :new (signup/views.rb:6-9) - the SIGNED-OUT title arm
# (Auth.signed_in? false) + the super() dispatch contract.
signup_new_title = EN["account_sign_up"]
emit(behaviorId: "view:new",
     kind: "view-fragment",
     scenario: "new_signed_out_title",
     gemSource: "set/type/signup/views.rb:6-9 (invitation? false signed-out -> t(:account_sign_up)) + en.yml:34",
     title: signup_new_title,
     dispatch: "super() -> card-mod-edit set/all/new.rb:4-6 view :new (framed_create_form)")

# Scenario 3: the invitation arm's title CONTRACT (the arm the headless
# engine cannot reach: the admin-approval verdict machinery - the same
# disclosed basis the ported signup :core's approve links carry).
emit(behaviorId: "view:new",
     kind: "view-fragment",
     scenario: "new_invitation_title_contract",
     gemSource: "set/type/signup/views.rb:2-4 + 6-9 (invitation? = Auth.signed_in? && card.can_approve?) + en.yml:17",
     title: EN["account_invite"],
     reachable: false)

# Scenario 4: view :new_buttons (signup/views.rb:15-18) - button_formgroup
# over [standard_create_button, invite_button].compact; invite_button nil
# signed-out (views.rb:21-23 return unless invitation?) -> the lone create
# button (form_buttons.rb:184-186: submit_button class
# "submit-button create-submit-button", data-disable-with "Submitting").
button_formgroup_inner = "<button name=\"button\" type=\"submit\" data-disable-with=\"Submitting\" class=\"submit-button create-submit-button btn btn-primary\">Submit</button>"
emit(behaviorId: "view:new_buttons",
     kind: "view-fragment",
     scenario: "new_buttons_create_only",
     gemSource: "set/type/signup/views.rb:15-18 + 21-23 (invite_button nil signed-out) + card-mod-edit form.rb:86-88 button_formgroup + form_buttons.rb:184-186",
     bytes: "<div class=\"form-group button-form-group\">#{button_formgroup_inner}</div>")

# Scenario 5: view :edit (signin.rb:154-157, the FORGOT-PASSWORD form) -
# the reset_password_voo contract (:159-163: title ||= t(:account_forgot_
# password); edit_structure = [signin_field(:email)]; hide :help) + the
# Auth.as_bot { super() } dispatch. signin_field (:198-202): the field nest
# tuple - the SYMBOL :email stars the mark through the codename lookup
# (runtime-probed: "".to_name.field(:email) == "+*email"; the earlier
# hand-derived "+email" here missed the star).
emit(behaviorId: "view:edit",
     kind: "view-fragment",
     scenario: "signin_edit_reset_password_voo",
     gemSource: "set/self/signin.rb:154-157 + 159-163 + 198-202 (signin_field :email) + en.yml:16",
     title: EN["account_forgot_password"],
     editStructure: ["+*email"],
     editStructureOpts: { title: "email", view: "titled", skip_perms: true },
     hide: ["help"],
     dispatch: "Auth.as_bot { super() } -> card-mod-edit set/all/edit.rb view :edit")
