# oracle-capture-password-reset-request.rb - the pinned Ruby's own bytes for
# the PASSWORD RESET REQUEST (registry row cap-A5, "Request a password reset
# (mail link)").
#
# The row's contract: the reset request reaches the captured test inbox with
# visible acknowledgment, the captured reset link signs the member into the
# password form, the reset password persists and rejects the old credential,
# and the journey restores its original fixture credential. Six pinned files
# own it:
#
#   1. card-mod-account-0.20.0/set/self/signin.rb - THE REQUEST: the
#      :send_reset_password_token event (:27-31) is `event
#      :send_reset_password_token, before: :signin, on: :update, trigger:
#      :required do`; blank_email? (:86-90) refuses a blank address; the
#      send_reset_password_email_or_fail ladder (:78-84) sends only to an
#      ACTIVE account and the reset_password_fail ladder (:96-102) reports
#      the failures; send_reset_password_email (:92-94) is `Auth.as_bot {
#      account.send_password_reset_email }`. The FORM: view :edit (:154-157)
#      is the reset form and view :reset_password_success (:148-151) is the
#      ACKNOWLEDGMENT `frame { t :account_check_email }` - "Check your email
#      for a link to reset your password".
#   2. card-mod-account-0.20.0/set/right/account/views.rb - THE LINK: view
#      :reset_password_url (:6-8) is `token_url :reset_password`; token_url
#      (:34-38) is `card_url path(action: :update, card: { trigger: trigger
#      }, token: new_token(extra_payload))`; new_token (:44-46) is
#      `Auth::Token.encode card.accounted_id, extra_payload`.
#   3. card-mod-account-0.20.0/set/right/account/events.rb - THE CONFIRM: the
#      :reset_password event (:15-17) is `event :reset_password,
#      :prepare_to_validate, on: :update, trigger: :required do` and calls
#      `verifying_token :reset_password_success, :reset_password_failure`;
#      the requiring_token helper (:75-81) refuses a request with no token;
#      reset_password_success (:100-104) is `Auth.signin accounted_id`
#      followed by `success << { id: name, view: :edit }` - the browser
#      lands on the account's edit form, which is where the new password is
#      typed; reset_password_failure (:106-109) re-sends the email and
#      reports the mismatch.
#   4. card-1.110.0/lib/card/auth/token.rb - THE TOKEN: the Auth::Token
#      codec signs and decodes the link's claim.
#   5. card-mod-account-0.20.0/set/right/account.rb - THE DELIVERY:
#      send_account_email (:37-44) renders the EmailTemplate card and
#      delivers it to the +email content.
#   6. card-mod-account-0.20.0/data/real.yml - THE MESSAGE'S OWN BYTES: the
#      password_reset_email template's subject is "reset password for
#      {{:title|core}}" and its text carries the {{_|reset_password_url}}
#      link.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-password-reset-request.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "password-reset-request.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "send_reset_password_token_event",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "event :send_reset_password_token, before: :signin, on: :update, trigger: :required do", before: 2, after: 4 },
  { key: "blank_email",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def blank_email?", before: 1, after: 4 },
  { key: "send_reset_password_email_or_fail",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def send_reset_password_email_or_fail", before: 1, after: 6 },
  { key: "send_reset_password_email",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def send_reset_password_email account", before: 1, after: 2 },
  { key: "reset_password_fail",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def reset_password_fail account", before: 1, after: 6 },
  { key: "reset_password_success_view",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "view :reset_password_success do", before: 2, after: 3 },
  { key: "reset_password_voo",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def reset_password_voo", before: 1, after: 4 },
  { key: "reset_password_url_view",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "view :reset_password_url, denial: :blank, perms: :reset_password_ok? do", before: 0, after: 2 },
  { key: "token_url",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "def token_url trigger, extra_payload={}", before: 0, after: 4 },
  { key: "new_token",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/views.rb",
    marker: "def new_token extra_payload", before: 0, after: 2 },
  { key: "reset_password_event",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/events.rb",
    marker: "event :reset_password, :prepare_to_validate, on: :update, trigger: :required do", before: 2, after: 2 },
  { key: "requiring_token",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/events.rb",
    marker: "def requiring_token", before: 0, after: 6 },
  { key: "reset_password_success",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/events.rb",
    marker: "def reset_password_success", before: 0, after: 4 },
  { key: "reset_password_failure",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account/events.rb",
    marker: "def reset_password_failure error_message", before: 0, after: 3 },
  { key: "send_account_email",
    gem: "card-mod-account-0.20.0",
    path: "set/right/account.rb",
    marker: "def send_account_email email_template", before: 1, after: 7 },
  { key: "token_encode",
    gem: "card-1.110.0",
    path: "lib/card/auth/token.rb",
    marker: "def encode user_id, extra_payload={}", before: 1, after: 4 },
  { key: "token_decode",
    gem: "card-1.110.0",
    path: "lib/card/auth/token.rb",
    marker: "def decode token", before: 1, after: 5 }
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

trigger = oracle["send_reset_password_token_event"]["source"]
blank = oracle["blank_email"]["source"]
or_fail = oracle["send_reset_password_email_or_fail"]["source"]
send_email = oracle["send_reset_password_email"]["source"]
fail_ladder = oracle["reset_password_fail"]["source"]
success_view = oracle["reset_password_success_view"]["source"]
voo = oracle["reset_password_voo"]["source"]
url_view = oracle["reset_password_url_view"]["source"]
token_url = oracle["token_url"]["source"]
new_token = oracle["new_token"]["source"]
reset_event = oracle["reset_password_event"]["source"]
requiring_token = oracle["requiring_token"]["source"]
reset_success = oracle["reset_password_success"]["source"]
reset_failure = oracle["reset_password_failure"]["source"]
account_email = oracle["send_account_email"]["source"]
token_encode = oracle["token_encode"]["source"]
token_decode = oracle["token_decode"]["source"]

facts = {
  # THE REQUEST
  "send_reset_password_token_event" => trigger[/event :send_reset_password_token, before: :signin, on: :update, trigger: :required do/, 0],
  "send_reset_password_token_body" => trigger[/blank_email\? \? break : send_reset_password_email_or_fail/, 0],
  "blank_email_method" => blank[/def blank_email\?/, 0],
  "blank_email_body" => blank[/error_on :email, :error_blank/, 0],
  "send_reset_password_email_or_fail" => or_fail[/def send_reset_password_email_or_fail/, 0],
  "send_reset_password_email_or_fail_body" => or_fail[/if \(account = account_for email_from_field\)&\.active\?/, 0],
  "send_reset_password_email" => send_email[/def send_reset_password_email account/, 0],
  "send_reset_password_email_body" => send_email[/Auth\.as_bot \{ account\.send_password_reset_email \}/, 0],
  "reset_password_fail" => fail_ladder[/def reset_password_fail account/, 0],
  "reset_password_fail_body" => fail_ladder[/error_on :account, :error_not_active/, 0],
  # THE FORM AND THE ACKNOWLEDGMENT
  "reset_password_success_view" => success_view[/view :reset_password_success do/, 0],
  "reset_password_success_view_body" => success_view[/frame \{ t :account_check_email \}/, 0],
  "reset_password_voo" => voo[/def reset_password_voo/, 0],
  "reset_password_voo_body" => voo[/voo\.edit_structure = \[signin_field\(:email\)\]/, 0],
  # THE LINK
  "reset_password_url_view" => url_view[/view :reset_password_url, denial: :blank, perms: :reset_password_ok\? do/, 0],
  "reset_password_url_body" => url_view[/token_url :reset_password/, 0],
  "token_url" => token_url[/def token_url trigger, extra_payload=\{\}/, 0],
  "token_url_body" => token_url[/card_url path\(action: :update,\n\s*card: \{ trigger: trigger \},\n\s*token: new_token\(extra_payload\)\)/, 0],
  "new_token" => new_token[/def new_token extra_payload/, 0],
  "new_token_body" => new_token[/Auth::Token\.encode card\.accounted_id, extra_payload/, 0],
  # THE CONFIRM
  "reset_password_event" => reset_event[/event :reset_password, :prepare_to_validate, on: :update, trigger: :required do/, 0],
  "reset_password_event_body" => reset_event[/verifying_token :reset_password_success, :reset_password_failure/, 0],
  "requiring_token" => requiring_token[/def requiring_token/, 0],
  "requiring_token_body" => requiring_token[/if \(token = Env\.params\[:token\]\)/, 0],
  "requiring_token_error" => requiring_token[/errors\.add :token, "is required"/, 0],
  "reset_password_success" => reset_success[/def reset_password_success/, 0],
  "reset_password_success_body" => reset_success[/success << \{ id: name, view: :edit \}/, 0],
  "reset_password_success_signin" => reset_success[/Auth\.signin accounted_id/, 0],
  "reset_password_failure" => reset_failure[/def reset_password_failure error_message/, 0],
  "reset_password_failure_body" => reset_failure[/Auth\.as_bot \{ send_password_reset_email \}/, 0],
  # THE DELIVERY
  "send_account_email" => account_email[/def send_account_email email_template/, 0],
  "send_account_email_body" => account_email[/ecard\.deliver self, to: email/, 0],
  # THE TOKEN
  "token_encode" => token_encode[/def encode user_id, extra_payload=\{\}/, 0],
  "token_encode_body" => token_encode[/payload = \{ user_id: user_id, exp: expiration \}\.merge\(extra_payload\)/, 0],
  "token_decode" => token_decode[/def decode token/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured request trigger does not refuse a blank address" unless trigger.include?("blank_email?")
raise "the captured request ladder does not require an active account" unless or_fail.include?("active?")
raise "the captured request does not send as the bot" unless send_email.include?("Auth.as_bot")
raise "the captured acknowledgment view is missing" unless success_view.include?("t :account_check_email")
raise "the captured reset form does not ask for the email" unless voo.include?("signin_field(:email)")
raise "the captured link does not carry the trigger" unless token_url.include?("card: { trigger: trigger }")
raise "the captured link does not carry the token" unless token_url.include?("token: new_token(extra_payload)")
raise "the captured new_token does not encode the account" unless new_token.include?("Auth::Token.encode card.accounted_id")
raise "the captured confirm event does not verify the token" unless reset_event.include?("verifying_token")
raise "the captured confirm refuses a request with no token" unless requiring_token.include?("errors.add :token")
raise "the captured success does not sign the holder in" unless reset_success.include?("Auth.signin accounted_id")
raise "the captured success does not land on the edit form" unless reset_success.include?("view: :edit")
raise "the captured failure does not re-send the email" unless reset_failure.include?("send_password_reset_email")
raise "the captured delivery does not address the email field" unless account_email.include?("ecard.deliver self, to: email")

payload = {
  "contract" => "The reset request reaches the captured test inbox with visible acknowledgment, the captured reset link signs the member into the password form, the reset password persists and rejects the old credential, and the journey restores its original fixture credential.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
