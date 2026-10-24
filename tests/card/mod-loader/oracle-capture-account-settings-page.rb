# oracle-capture-account-settings-page.rb - the pinned Ruby's own bytes for
# the ACCOUNT SETTINGS PAGE (registry row cap-A1, "Open the account settings
# page").
#
# The row's contract: the account card's board carries an Account tab, that
# tab exposes the account's email and password fields, and the account
# settings page shows the signed-in account's own email address. Four pinned
# files own it:
#
#   1. card-mod-account-0.20.0/set/abstract/account_holder.rb - the ACCOUNT
#      TAB AND ITS SETTINGS SECTION: default_board_tab (:128-130) is `card.
#      current_account? ? :account_tab : super`, view :account_tab (:132-137)
#      is `board_pill_sections "Account" do [["Settings",
#      account_details_items], ["Content", account_content_items]] end`, and
#      account_details_items (:149-164) opens with the ["Email and Password",
#      :account, ...] pill - the SETTINGS ROW the person clicks.
#   2. card-mod-account-0.20.0/set/right/account/views.rb - the LABELLED
#      FIELD NESTS: view :core (:50-53) is `[account_field_nest(:email,
#      "email"), account_field_nest(:password, "password")]` and
#      account_field_nest (:55-58) is `field_nest field, title: title, view:
#      :labeled` - the LABELED view that renders the field's own content.
#   3. card-mod-account-0.20.0/set/right/email.rb - the ADDRESS AS TEXT: the
#      email right is `assign_type :phrase` (:5), which is why the labeled
#      row carries the address as text rather than as a link.
#   4. card-mod-account-0.20.0/set/right/account/views.rb - THE OWNER'S READ
#      PERMISSION: ok_to_read? in set/right/account.rb (:28-30) is
#      `own_account? || super`, and set/abstract/account_field.rb (:11-13)
#      owns `own_account?` as `account_card&.own_account?` - the account
#      holder reads their own address.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-account-settings-page.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "account-settings-page.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "default_board_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def default_board_tab", before: 1, after: 3 },
  { key: "account_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "view :account_tab do", before: 4, after: 5 },
  { key: "show_account_tab",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def show_account_tab?", before: 1, after: 2 },
  { key: "account_details_items",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def account_details_items", before: 1, after: 15 },
  { key: "account_content_items",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_holder.rb",
    marker: "def account_content_items", before: 1, after: 4 },
  { key: "account_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "view :core do", before: 1, after: 3 },
  { key: "account_field_nest",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "def account_field_nest field, title", before: 0, after: 3 },
  { key: "email_assign_type",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "assign_type :phrase", before: 1, after: 1 },
  { key: "account_ok_to_read",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account.rb",
    marker: "def ok_to_read?", before: 1, after: 2 },
  { key: "account_own_account",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_field.rb",
    marker: "def own_account?", before: 1, after: 2 }
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
details = oracle["account_details_items"]["source"]
content = oracle["account_content_items"]["source"]
core = oracle["account_core_view"]["source"]
nest = oracle["account_field_nest"]["source"]
assign = oracle["email_assign_type"]["source"]
ok_to_read = oracle["account_ok_to_read"]["source"]
own_account = oracle["account_own_account"]["source"]

facts = {
  # the ACCOUNT TAB AND ITS SETTINGS SECTION
  "default_board_tab" => default_tab[/card\.current_account\? \? :account_tab : super/, 0],
  "account_tab_view" => tab[/view :account_tab do/, 0],
  "account_tab_board_pill_sections" => tab[/board_pill_sections "Account" do/, 0],
  "account_tab_settings_section" => tab[/\[\["Settings", account_details_items\],\n\s*\["Content", account_content_items\]\]/, 0],
  "show_account_tab" => show_tab[/card\.account\?/, 0],
  # the SETTINGS ROW THE PERSON CLICKS
  "account_details_items_method" => details[/def account_details_items/, 0],
  "account_details_email_and_password" => details[/\["Email and Password", :account,\n\s*\{ path: \{ slot: \{ hide: %i\[help_link board_link\] \} \} \}\]/, 0],
  "account_content_items_method" => content[/def account_content_items/, 0],
  "account_content_created_edited" => content[/\[\["Created", :created\],\n\s*\["Edited", :edited\]\]/, 0],
  # the LABELLED FIELD NESTS
  "account_core_view" => core[/view :core do/, 0],
  "account_core_fields" => core[/\[account_field_nest\(:email, "email"\),\n\s*account_field_nest\(:password, "password"\)\]/, 0],
  "account_field_nest" => nest[/field_nest field, title: title, view: :labeled/, 0],
  # the ADDRESS AS TEXT
  "email_assign_type" => assign[/assign_type :phrase/, 0],
  # THE OWNER'S READ PERMISSION
  "account_ok_to_read" => ok_to_read[/own_account\? \|\| super/, 0],
  "account_own_account" => own_account[/account_card&\.own_account\?/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured tab does not carry the Account pill sections" unless tab.include?("board_pill_sections \"Account\"")
raise "the captured tab does not name the Settings section" unless tab.include?("account_details_items")
raise "the captured details items do not open with the Email and Password pill" unless details.include?("\"Email and Password\"") && details.include?(":account")
raise "the captured core view does not nest the two labeled fields" unless core.include?("account_field_nest(:email") && core.include?("account_field_nest(:password")
raise "the captured field nest does not use the labeled view" unless nest.include?("view: :labeled")
raise "the captured email right is not a phrase" unless assign.include?("assign_type :phrase")
raise "the captured account read permission is not the owner's own" unless ok_to_read.include?("own_account?")

payload = {
  "contract" => "The account card's board carries an Account tab, that tab exposes the account's email and password fields, and the account settings page shows the signed-in account's own email address.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
