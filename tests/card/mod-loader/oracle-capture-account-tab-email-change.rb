# oracle-capture-account-tab-email-change.rb - the pinned Ruby's own bytes for
# the ACCOUNT TAB AND THE EMAIL CHANGE (registry row cap-E19, "Edit board:
# account tab, change email").
#
# The row's contract: the account card's board has an Account tab, that tab
# exposes the account's email and password fields, and the account email can
# be changed so the new address signs in. Five pinned files own it:
#
#   1. card-mod-account-0.20.0/set/abstract/account_holder.rb - the ACCOUNT
#      TAB: default_board_tab (:128-130) is `card.current_account? ?
#      :account_tab : super` and view :account_tab (:132-137) is
#      `board_pill_sections "Account" do [["Settings",
#      account_details_items], ["Content", account_content_items]] end` - the
#      two sections the tab's pills live in. show_account_tab? (:139-141) is
#      `card.account?`.
#   2. card-mod-account-0.20.0/set/right/account/views.rb - the EMAIL AND
#      PASSWORD FIELDS: view :core (:50-53) is `[account_field_nest(:email,
#      "email"), account_field_nest(:password, "password")]` and
#      account_field_nest (:55-58) is `field_nest field, title: title, view:
#      :labeled` - the LABELED view the person reads the address off.
#   3. card-mod-account-0.20.0/set/right/email.rb - the EMAIL WRITE: the
#      :validate_email event (:7-14) strips the content and applies the
#      address grammar, the :validate_unique_email event (:16-27) refuses a
#      duplicate address, and the :downcase_email event (:29-33) lowercases
#      the address before validation.
#   4. card-mod-account-0.20.0/set/right/password.rb - the PASSWORD FIELD:
#      view :core, wrap: :em (:53-55) renders the raw value, and the
#      :encrypt_password event (:21-27) stores the encrypted content.
#   5. card-mod-account-0.20.0/set/right/email.rb - the EMAIL'S OWN TYPE:
#      `assign_type :phrase` (:5) - the address is a phrase, which is why
#      the labeled row carries the address as text.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-account-tab-email-change.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "account-tab-email-change.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "account_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "view :account_tab do", before: 4, after: 5 },
  { key: "default_board_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def default_board_tab", before: 1, after: 3 },
  { key: "show_account_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def show_account_tab?", before: 1, after: 2 },
  { key: "account_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "view :core do", before: 1, after: 3 },
  { key: "account_field_nest",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "def account_field_nest field, title", before: 0, after: 3 },
  { key: "validate_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :validate_email, :validate, on: :save do", before: 1, after: 7 },
  { key: "validate_unique_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :validate_unique_email, after: :validate_email, on: :save do", before: 0, after: 11 },
  { key: "downcase_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :downcase_email, :prepare_to_validate, on: :save do", before: 0, after: 4 },
  { key: "email_assign_type",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "assign_type :phrase", before: 1, after: 1 },
  { key: "password_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "view :core, wrap: :em do", before: 0, after: 2 },
  { key: "encrypt_password_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "event :encrypt_password, :store, on: :save, changed: :content do", before: 0, after: 6 }
].freeze

def deep_sort(obj)
  case obj
  when Hash
    obj.keys.sort_by(&:to_s).each_with_object({}) { |k, h| h[k.to_s] = deep_sort(obj[k]) }
  when Array
    obj.map { |v| deep_sort(v) }
  else
    obj
  end
end

def capture_owner(owner)
  file = File.join(GEM_HOME, owner[:gem], owner[:path])
  raise "oracle gem file not present: #{file}" unless File.file?(file)
  lines = File.readlines(file, chomp: true)
  index = lines.index { |line| line.include?(owner[:marker]) }
  raise "oracle marker not present in #{owner[:gem]}/#{owner[:path]}: #{owner[:marker]}" if index.nil?
  first = [index - owner[:before], 0].max
  last = [index + owner[:after], lines.length - 1].min
  {
    "gem" => owner[:gem],
    "path" => owner[:path],
    "marker" => owner[:marker],
    "marker_line" => index + 1,
    "first_line" => first + 1,
    "last_line" => last + 1,
    "source" => lines[first..last].join("\n"),
    "file_sha256" => Digest::SHA256.hexdigest(File.binread(file))
  }
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

tab = oracle["account_tab"]["source"]
default_tab = oracle["default_board_tab"]["source"]
show_tab = oracle["show_account_tab"]["source"]
core = oracle["account_core_view"]["source"]
nest = oracle["account_field_nest"]["source"]
validate = oracle["validate_email_event"]["source"]
unique = oracle["validate_unique_email_event"]["source"]
downcase = oracle["downcase_email_event"]["source"]
assign = oracle["email_assign_type"]["source"]
password_core = oracle["password_core_view"]["source"]
encrypt = oracle["encrypt_password_event"]["source"]

facts = {
  # the ACCOUNT TAB
  "account_tab_view" => tab[/view :account_tab do/, 0],
  "account_tab_sections" => tab[/\[\["Settings", account_details_items\],\n\s*\["Content", account_content_items\]\]/, 0],
  "account_tab_board_pill_sections" => tab[/board_pill_sections "Account" do/, 0],
  "default_board_tab" => default_tab[/card\.current_account\? \? :account_tab : super/, 0],
  "show_account_tab" => show_tab[/card\.account\?/, 0],
  # the EMAIL AND PASSWORD FIELDS
  "account_core_view" => core[/view :core do/, 0],
  "account_core_fields" => core[/\[account_field_nest\(:email, "email"\),\n\s*account_field_nest\(:password, "password"\)\]/, 0],
  "account_field_nest" => nest[/field_nest field, title: title, view: :labeled/, 0],
  "email_assign_type" => assign[/assign_type :phrase/, 0],
  # the EMAIL WRITE
  "validate_email_event" => validate[/event :validate_email, :validate, on: :save do/, 0],
  "validate_email_strip" => validate[/self\.content = content\.strip/, 0],
  "validate_email_grammar" => validate[/return if content\.match\?\(\/\^\(\[\^@\\s\]\+\)@\(\(\?\:\[-a-z0-9\]\+\\\.\)\+\[a-z\]\{2,\}\)\$\/i\)/, 0],
  "validate_email_error" => validate[/errors\.add :content, t\(:account_error_invalid_address\)/, 0],
  "validate_unique_email_event" => unique[/event :validate_unique_email, after: :validate_email, on: :save do/, 0],
  "validate_unique_email_cql" => unique[/cql = \{ right_id: EmailID, eq: content, return: :id \}/, 0],
  "validate_unique_email_error" => unique[/errors\.add :content, t\(:account_error_not_unique\)/, 0],
  "downcase_email_event" => downcase[/event :downcase_email, :prepare_to_validate, on: :save do/, 0],
  "downcase_email_body" => downcase[/self\.content = content\.downcase/, 0],
  # the PASSWORD FIELD
  "password_core_view" => password_core[/view :core, wrap: :em do/, 0],
  "encrypt_password_event" => encrypt[/event :encrypt_password, :store, on: :save, changed: :content do/, 0],
  "encrypt_password_body" => encrypt[/self\.content = Auth\.encrypt content, salt/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured tab does not carry the Account pill sections" unless tab.include?("board_pill_sections \"Account\"")
raise "the captured tab does not name the two sections" unless tab.include?("account_details_items") && tab.include?("account_content_items")
raise "the captured core view does not nest the two labeled fields" unless core.include?("account_field_nest(:email") && core.include?("account_field_nest(:password")
raise "the captured field nest does not use the labeled view" unless nest.include?("view: :labeled")
raise "the captured email validation does not apply the address grammar" unless validate.include?("content.match?")
raise "the captured email validation does not refuse a duplicate address" unless unique.include?("errors.add :content")
raise "the captured downcase event does not lowercase the address" unless downcase.include?("content.downcase")

payload = {
  "contract" => "The account card's board has an Account tab, that tab exposes the account's email and password fields, and the account email can be changed so the new address signs in.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
