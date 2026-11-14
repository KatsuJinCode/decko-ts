# oracle-capture-account-email-change.rb - the pinned Ruby's own bytes for
# the ACCOUNT EMAIL CHANGE (registry row cap-A3, "Change email").
#
# The row's contract: the account email can be changed and the new one signs
# in, and the new email address shows on the account page. Four pinned files
# own it:
#
#   1. card-mod-account-0.20.0/set/right/email.rb - THE WRITE: the
#      :downcase_email event (:29-33) is `event :downcase_email,
#      :prepare_to_validate, on: :save do` and its body is `self.content =
#      content.downcase`; the :validate_email event (:7-14) strips the
#      content and applies the address grammar `return if content.match?(/^
#      ([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i)`, with the failure
#      `errors.add :content, t(:account_error_invalid_address)`; the
#      :validate_unique_email event (:16-27) REFUSES A DUPLICATE ADDRESS
#      through `cql = { right_id: EmailID, eq: content, return: :id }` and
#      `errors.add :content, t(:account_error_not_unique)`. The right is
#      `assign_type :phrase` (:5), which is why the labeled row carries the
#      address as text.
#   2. card-mod-account-0.20.0/set/right/account/views.rb - THE ADDRESS ON
#      THE ACCOUNT PAGE: view :core (:50-53) is `[account_field_nest(:email,
#      "email"), account_field_nest(:password, "password")]` and
#      account_field_nest (:55-58) is `field_nest field, title: title, view:
#      :labeled` - the LABELED view that renders the field's own content, so
#      the NEW address is what the page shows.
#   3. card-mod-account-0.20.0/set/abstract/account_field.rb - THE OWNER'S
#      WRITE PERMISSION: ok_to_update? (:16-18) is `(own_account? &&
#      !name_changed? && !type_id_changed?) || super`.
#   4. card-1.110.0/lib/card/auth.rb - THE SIGN-IN BY THE NEW ADDRESS: `def
#      authenticate email, password` (:20-25) finds the account with
#      `Auth.find_account_by_email email`, and card-1.110.0
#      lib/card/auth/current.rb's find_account_by_email (:74-77) is
#      `find_account_by :email, email.strip.downcase` - the lookup NORMALIZES
#      the typed address, so the new address signs in.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-account-email-change.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "account-email-change.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "downcase_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :downcase_email, :prepare_to_validate, on: :save do", before: 0, after: 4 },
  { key: "validate_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :validate_email, :validate, on: :save do", before: 1, after: 7 },
  { key: "validate_unique_email_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "event :validate_unique_email, after: :validate_email, on: :save do", before: 0, after: 11 },
  { key: "email_assign_type",
    gem: "card-mod-account-0.20.0",
    path: "set/right/email.rb",
    marker: "assign_type :phrase", before: 1, after: 1 },
  { key: "account_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "view :core do", before: 1, after: 3 },
  { key: "account_field_nest",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "def account_field_nest field, title", before: 0, after: 3 },
  { key: "account_field_ok_to_update",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_field.rb",
    marker: "def ok_to_update?", before: 1, after: 2 },
  { key: "authenticate",
    gem: "card-1.110.0",
    path: "lib/card/auth.rb",
    marker: "def authenticate email, password", before: 1, after: 5 },
  { key: "find_account_by_email",
    gem: "card-1.110.0",
    path: "lib/card/auth/current.rb",
    marker: "def find_account_by_email email", before: 1, after: 3 }
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

downcase = oracle["downcase_email_event"]["source"]
validate = oracle["validate_email_event"]["source"]
unique = oracle["validate_unique_email_event"]["source"]
assign = oracle["email_assign_type"]["source"]
core = oracle["account_core_view"]["source"]
nest = oracle["account_field_nest"]["source"]
ok_to_update = oracle["account_field_ok_to_update"]["source"]
authenticate = oracle["authenticate"]["source"]
find_by_email = oracle["find_account_by_email"]["source"]

facts = {
  # THE WRITE
  "downcase_email_event" => downcase[/event :downcase_email, :prepare_to_validate, on: :save do/, 0],
  "downcase_email_body" => downcase[/self\.content = content\.downcase/, 0],
  "validate_email_event" => validate[/event :validate_email, :validate, on: :save do/, 0],
  "validate_email_strip" => validate[/self\.content = content\.strip/, 0],
  "validate_email_grammar" => validate[/return if content\.match\?\(\/\^\(\[\^@\\s\]\+\)@\(\(\?\:\[-a-z0-9\]\+\\\.\)\+\[a-z\]\{2,\}\)\$\/i\)/, 0],
  "validate_email_error" => validate[/errors\.add :content, t\(:account_error_invalid_address\)/, 0],
  "validate_unique_email_event" => unique[/event :validate_unique_email, after: :validate_email, on: :save do/, 0],
  "validate_unique_email_cql" => unique[/cql = \{ right_id: EmailID, eq: content, return: :id \}/, 0],
  "validate_unique_email_error" => unique[/errors\.add :content, t\(:account_error_not_unique\)/, 0],
  "email_assign_type" => assign[/assign_type :phrase/, 0],
  # THE ADDRESS ON THE ACCOUNT PAGE
  "account_core_view" => core[/view :core do/, 0],
  "account_core_fields" => core[/\[account_field_nest\(:email, "email"\),\n\s*account_field_nest\(:password, "password"\)\]/, 0],
  "account_field_nest" => nest[/field_nest field, title: title, view: :labeled/, 0],
  # THE OWNER'S WRITE PERMISSION
  "account_field_ok_to_update" => ok_to_update[/\(own_account\? && !name_changed\? && !type_id_changed\?\) \|\| super/, 0],
  # THE SIGN-IN BY THE NEW ADDRESS
  "authenticate" => authenticate[/def authenticate email, password/, 0],
  "authenticate_account" => authenticate[/account = Auth\.find_account_by_email email/, 0],
  "find_account_by_email" => find_by_email[/def find_account_by_email email/, 0],
  "find_account_by_email_body" => find_by_email[/find_account_by :email, email\.strip\.downcase/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured email validation does not apply the address grammar" unless validate.include?("content.match?")
raise "the captured email validation does not strip the content" unless validate.include?("content.strip")
raise "the captured email validation does not refuse a duplicate address" unless unique.include?("errors.add :content")
raise "the captured downcase event does not lowercase the address" unless downcase.include?("content.downcase")
raise "the captured field nest does not use the labeled view" unless nest.include?("view: :labeled")
raise "the captured lookup does not normalize the typed address" unless find_by_email.include?("email.strip.downcase")
raise "the captured owner permission is missing" unless ok_to_update.include?("own_account?")

payload = {
  "contract" => "The account email can be changed and the new one signs in, and the new email address shows on the account page.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
