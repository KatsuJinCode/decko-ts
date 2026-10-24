# oracle-capture-account-password-change.rb - the pinned Ruby's own bytes for
# the ACCOUNT PASSWORD CHANGE (registry row cap-A2, "Change password, then
# sign in with the new password").
#
# The row's contract: the account password can be changed and the new one
# signs in. Six pinned files own it:
#
#   1. card-mod-account-0.20.0/set/right/password.rb - THE WRITE: the
#      :encrypt_password event (:21-28) is `event :encrypt_password, :store,
#      on: :save, changed: :content do` and its body is `self.content =
#      Auth.encrypt content, salt` - the content is ENCRYPTED on store, over
#      the account's existing salt. The validation ladder is here too: the
#      :validate_password_length event (:30-35), the :validate_password_chars
#      event (:37-47) over PASSWORD_REGEX (:5-11), and the
#      :validate_password_present event (:49-51) whose body is `abort :success
#      if content.blank?` - a BLANK password is a silent no-op. view :core,
#      wrap: :em (:82-84) renders the raw value.
#   2. card-mod-account-0.20.0/set/right/salt.rb - THE SALT: `generate` (:5-7)
#      is `self.content = Digest::SHA1.hexdigest "--#{Time.zone.now}--"`, and
#      the salt is generated ONCE at account creation
#      (set/right/account/events.rb:3-5 set_default_salt), never on a
#      password change.
#   3. card-1.110.0/lib/card/auth.rb - THE SIGN-IN: `def authenticate email,
#      password` (:20-25) finds the account by email and returns it only when
#      `password_valid?(account, password.strip)`; `def password_valid?
#      account, password` (:30-33) is `account.password == encrypt(password,
#      account.salt)`; `def encrypt password, salt` (:36-39) is
#      `Digest::SHA1.hexdigest "#{salt}--#{password}--"`.
#   4. card-mod-account-0.20.0/set/abstract/account_field.rb - THE OWNER'S
#      WRITE PERMISSION: ok_to_update? (:16-18) is `(own_account? &&
#      !name_changed? && !type_id_changed?) || super` - the account holder
#      updates their own field.
#   5. card-mod-account-0.20.0/set/right/account.rb - THE ACCOUNT'S OWN READ
#      AND WRITE: ok_to_read? (:28-30) is `own_account? || super` and
#      ok_to_update? (:33-35) is `(own_account? && !name_changed? &&
#      !type_id_changed?) || super`.
#   6. card-mod-account-0.20.0/lib/card/mod/account.rb - THE POLICY: the
#      password length and the character requirements the validation ladder
#      reads.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-account-password-change.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "account-password-change.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "encrypt_password_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "event :encrypt_password, :store, on: :save, changed: :content do", before: 0, after: 6 },
  { key: "encrypt_password_body",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "self.content = Auth.encrypt content, salt", before: 1, after: 1 },
  { key: "validate_password_length_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "event :validate_password_length, :validate, on: :save do", before: 0, after: 5 },
  { key: "validate_password_chars_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "event :validate_password_chars, :validate, on: :save do", before: 0, after: 10 },
  { key: "validate_password_present_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "event :validate_password_present, :prepare_to_validate, on: :update do", before: 0, after: 2 },
  { key: "password_regex",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "PASSWORD_REGEX = {", before: 0, after: 6 },
  { key: "password_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/password.rb",
    marker: "view :core, wrap: :em do", before: 0, after: 2 },
  { key: "salt_generate",
    gem: "card-mod-account-0.20.0",
    path: "set/right/salt.rb",
    marker: "def generate", before: 1, after: 2 },
  { key: "authenticate",
    gem: "card-1.110.0",
    path: "lib/card/auth.rb",
    marker: "def authenticate email, password", before: 1, after: 5 },
  { key: "password_valid",
    gem: "card-1.110.0",
    path: "lib/card/auth.rb",
    marker: "def password_valid? account, password", before: 1, after: 3 },
  { key: "auth_encrypt",
    gem: "card-1.110.0",
    path: "lib/card/auth.rb",
    marker: "def encrypt password, salt", before: 1, after: 3 },
  { key: "account_field_ok_to_update",
    gem: "card-mod-account-0.20.0",
    path: "set/abstract/account_field.rb",
    marker: "def ok_to_update?", before: 1, after: 2 },
  { key: "account_ok_to_update",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account.rb",
    marker: "def ok_to_update?", before: 1, after: 2 },
  { key: "account_ok_to_read",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account.rb",
    marker: "def ok_to_read?", before: 1, after: 2 },
  { key: "set_default_salt_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/events.rb",
    marker: "event :set_default_salt, :prepare_to_validate, on: :create do", before: 0, after: 2 },
  { key: "password_policy",
    gem: "card-mod-account-0.20.0",
    path: "lib/card/mod/account.rb",
    marker: "config.account_password_length", before: 2, after: 3 }
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

encrypt_event = oracle["encrypt_password_event"]["source"]
encrypt_body = oracle["encrypt_password_body"]["source"]
length_event = oracle["validate_password_length_event"]["source"]
chars_event = oracle["validate_password_chars_event"]["source"]
present_event = oracle["validate_password_present_event"]["source"]
regex = oracle["password_regex"]["source"]
core_view = oracle["password_core_view"]["source"]
salt_generate = oracle["salt_generate"]["source"]
authenticate = oracle["authenticate"]["source"]
password_valid = oracle["password_valid"]["source"]
auth_encrypt = oracle["auth_encrypt"]["source"]
field_ok_to_update = oracle["account_field_ok_to_update"]["source"]
account_ok_to_update = oracle["account_ok_to_update"]["source"]
account_ok_to_read = oracle["account_ok_to_read"]["source"]
set_default_salt = oracle["set_default_salt_event"]["source"]
policy = oracle["password_policy"]["source"]

facts = {
  # THE WRITE
  "encrypt_password_event" => encrypt_event[/event :encrypt_password, :store, on: :save, changed: :content do/, 0],
  "encrypt_password_body" => encrypt_body[/self\.content = Auth\.encrypt content, salt/, 0],
  "encrypt_password_salt_read" => encrypt_event[/salt = left&\.salt/, 0],
  # THE VALIDATION LADDER
  "validate_password_length_event" => length_event[/event :validate_password_length, :validate, on: :save do/, 0],
  "validate_password_length_body" => length_event[/return if content\.length >= min_pw_length/, 0],
  "validate_password_chars_event" => chars_event[/event :validate_password_chars, :validate, on: :save do/, 0],
  "validate_password_chars_body" => chars_event[/pw_requirements = check_password_regex\(/, 0],
  "validate_password_present_event" => present_event[/event :validate_password_present, :prepare_to_validate, on: :update do/, 0],
  "validate_password_present_body" => present_event[/abort :success if content\.blank\?/, 0],
  # THE POLICY
  "password_regex" => regex[/PASSWORD_REGEX = \{/, 0],
  "password_regex_lower" => regex[/lower: \/\[a-z\]\//, 0],
  "password_regex_upper" => regex[/upper: \/\[A-Z\]\//, 0],
  "password_regex_special_char" => regex[/special_char: %r\{/, 0],
  "password_regex_number" => regex[/number: \/\\d\+\//, 0],
  "password_policy_length" => policy[/config\.account_password_length\s*=\s*\d+/, 0],
  "password_policy_requirements" => policy[/config\.account_password_requirements\s*=\s*%i\[[^\]]+\]/, 0],
  # THE SALT
  "salt_generate" => salt_generate[/self\.content = Digest::SHA1\.hexdigest "--#\{Time\.zone\.now\}--"/, 0],
  "set_default_salt_event" => set_default_salt[/event :set_default_salt, :prepare_to_validate, on: :create do/, 0],
  "set_default_salt_body" => set_default_salt[/field\(:salt\)\.generate/, 0],
  # THE SIGN-IN
  "authenticate" => authenticate[/def authenticate email, password/, 0],
  "authenticate_account" => authenticate[/account = Auth\.find_account_by_email email/, 0],
  "authenticate_valid" => authenticate[/account if not_required\? \|\| password_valid\?\(account, password\.strip\)/, 0],
  "password_valid" => password_valid[/def password_valid\? account, password/, 0],
  "password_valid_body" => password_valid[/account\.password == encrypt\(password, account\.salt\)/, 0],
  "auth_encrypt" => auth_encrypt[/def encrypt password, salt/, 0],
  "auth_encrypt_body" => auth_encrypt[/Digest::SHA1\.hexdigest "#\{salt\}--#\{password\}--"/, 0],
  # THE OWNER'S WRITE PERMISSION
  "account_field_ok_to_update" => field_ok_to_update[/\(own_account\? && !name_changed\? && !type_id_changed\?\) \|\| super/, 0],
  "account_ok_to_update" => account_ok_to_update[/\(own_account\? && !name_changed\? && !type_id_changed\?\) \|\| super/, 0],
  "account_ok_to_read" => account_ok_to_read[/own_account\? \|\| super/, 0],
  # THE FIELD'S OWN VIEW
  "password_core_view" => core_view[/view :core, wrap: :em do/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured password event does not encrypt the content" unless encrypt_event.include?("Auth.encrypt content, salt")
raise "the captured password event does not read the account's salt" unless encrypt_event.include?("left&.salt")
raise "the captured blank-password guard is missing" unless present_event.include?("abort :success if content.blank?")
raise "the captured length guard is missing" unless length_event.include?("min_pw_length")
raise "the captured character guard is missing" unless chars_event.include?("check_password_regex")
raise "the captured regex does not carry the four character classes" unless regex.include?("lower:") && regex.include?("upper:") && regex.include?("special_char:") && regex.include?("number:")
raise "the captured salt is not generated once at creation" unless set_default_salt.include?("field(:salt).generate")
raise "the captured sign-in does not consult the stored digest" unless password_valid.include?("account.password == encrypt(password, account.salt)")
raise "the captured sign-in does not strip the typed password" unless authenticate.include?("password.strip")
raise "the captured owner permission is missing" unless field_ok_to_update.include?("own_account?")

payload = {
  "contract" => "The account password can be changed and the new one signs in.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
