# oracle-capture-anonymous-edit-denial-signin.rb - the pinned Ruby's own bytes
# for the ANONYMOUS EDIT DENIAL AND THE CREDENTIAL FORM BEHIND ITS SIGN-IN
# LINK (registry row cap-S5, "Anonymous user opens a card edit modal, sees
# denial, then follows its sign-in link to the credential form").
#
# The row's contract: an anonymous person who opens a card's edit modal sees
# the denial, the denial carries a sign-in link, and following that link
# reaches the sign-in card's own credential form, with the email and the
# password field the form posts. Four pinned files own it:
#
#   1. card-mod-format-0.20.0/set/all/html/error.rb - THE DENIAL: `loud_denial`
#      is `voo.hide :menu; frame { [wrap_with(:h1, t(:format_sorry)),
#      wrap_with(:div, loud_denial_message)] }`, so the denial's heading is
#      Ruby's own "Sorry!"; `loud_denial_message` picks by SESSION state and
#      the signed-out branch is `sign_in_or_up_links to_do_unauthorized_task`;
#      `sign_in_or_up_links` is the "Please <links> to <task>." sentence; and
#      `signin_link` is the anchor with the "signin-link" class.
#   2. card-mod-format-0.20.0/set/all/html/error.rb - THE LINK'S PATH:
#      `signin_link_path` is `{ view: :titled }` plus the success mark, so
#      the link names the sign-in card's TITLED view.
#   3. card-mod-format-0.20.0/config/locales/en.yml - THE THREE TEXTS:
#      format_sorry is "Sorry!", format_please is "Please" and format_or is
#      "or".
#   4. card-mod-account-0.20.0/set/self/signin.rb - THE CREDENTIAL FORM:
#      `view :core` is the `card_form :update` over the haml template, and
#      `signin_field` nests the email and the password with the "titled"
#      view, which is the form the sign-in link reaches.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-anonymous-edit-denial-signin.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "anonymous-edit-denial-signin.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "loud_denial",
    gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "def loud_denial", before: 0, after: 5 },
  { key: "loud_denial_message",
    gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "def loud_denial_message", before: 0, after: 17 },
  { key: "sign_in_or_up_links",
    gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "def sign_in_or_up_links to_task", before: 0, after: 7 },
  { key: "signin_link",
    gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "def signin_link", before: 0, after: 3 },
  { key: "signin_link_path",
    gem: "card-mod-format-0.20.0",
    path: "set/all/html/error.rb",
    marker: "def signin_link_path", before: 0, after: 9 },
  { key: "sorry_locale",
    gem: "card-mod-format-0.20.0",
    path: "config/locales/en.yml",
    marker: "format_sorry:", before: 0, after: 0 },
  { key: "please_locale",
    gem: "card-mod-format-0.20.0",
    path: "config/locales/en.yml",
    marker: "format_please:", before: 0, after: 0 },
  { key: "or_locale",
    gem: "card-mod-format-0.20.0",
    path: "config/locales/en.yml",
    marker: "format_or:", before: 0, after: 0 },
  { key: "signin_core_view",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "view :core, cache: :never do", before: 4, after: 6 },
  { key: "signin_field",
    gem: "card-mod-account-0.20.0",
    path: "set/self/signin.rb",
    marker: "def signin_field name", before: 0, after: 5 }
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

def locale_value(source, key)
  raw = source[/#{Regexp.escape(key)}:\s*(.*)$/, 1]
  raise "the pinned locale key #{key} was not found" if raw.nil?
  raw.strip.sub(/\A['"]/, "").sub(/['"]\z/, "")
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

denial = oracle["loud_denial"]["source"]
message = oracle["loud_denial_message"]["source"]
sentence = oracle["sign_in_or_up_links"]["source"]
link = oracle["signin_link"]["source"]
link_path = oracle["signin_link_path"]["source"]
core_view = oracle["signin_core_view"]["source"]
field = oracle["signin_field"]["source"]

facts = {
  # THE DENIAL
  "loud_denial_method" => denial[/def loud_denial/, 0],
  "loud_denial_heading" => denial[/wrap_with\(:h1, t\(:format_sorry\)\)/, 0],
  "loud_denial_body" => denial[/wrap_with\(:div, loud_denial_message\)/, 0],
  # THE SIGNED-OUT BRANCH
  "loud_denial_message_method" => message[/def loud_denial_message/, 0],
  "loud_denial_signed_in_branch" => message[/when Auth\.signed_in\?/, 0],
  "loud_denial_signed_out_branch" => message[/sign_in_or_up_links to_do_unauthorized_task/, 0],
  # THE SENTENCE
  "sign_in_or_up_links_method" => sentence[/def sign_in_or_up_links to_task/, 0],
  "sign_in_or_up_links_body" => sentence[/links = \[signin_link, signup_link\]\.compact\.join " #\{t\(:format_or\)\} "/, 0],
  "sign_in_or_up_links_sentence" => sentence[/"\#\{\[t\(:format_please\), links, to_task\]\.join\(' '\)\}\."/, 0],
  # THE LINK
  "signin_link_method" => link[/def signin_link/, 0],
  "signin_link_call" => link[/link_to_card :signin, t\(:account_sign_in\)&\.downcase,/, 0],
  "signin_link_class" => link[/class: "signin-link", path: signin_link_path/, 0],
  "signin_link_path_method" => link_path[/def signin_link_path/, 0],
  "signin_link_path_view" => link_path[/\{ view: :titled \}/, 0],
  # THE THREE TEXTS
  "sorry_text" => locale_value(oracle["sorry_locale"]["source"], "format_sorry"),
  "please_text" => locale_value(oracle["please_locale"]["source"], "format_please"),
  "or_text" => locale_value(oracle["or_locale"]["source"], "format_or"),
  # THE CREDENTIAL FORM
  "signin_core_view" => core_view[/view :core, cache: :never do/, 0],
  "signin_core_form" => core_view[/card_form :update, recaptcha: :off, success: signin_success do/, 0],
  "signin_core_haml" => core_view[/haml :core/, 0],
  "signin_field_method" => field[/def signin_field name/, 0],
  "signin_field_tuple" => field[/\[nest_name, \{ title: name\.to_s, view: "titled",/, 0],
  "signin_field_view" => field[/nest_name: nest_name, skip_perms: true \}\]/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured denial does not carry Ruby's own heading" unless denial.include?("t(:format_sorry)")
raise "the captured denial does not carry the message" unless denial.include?("loud_denial_message")
raise "the captured message does not branch on the session" unless message.include?("when Auth.signed_in?")
raise "the captured message does not offer the sign-in links when signed out" unless message.include?("sign_in_or_up_links to_do_unauthorized_task")
raise "the captured sentence does not join the two links" unless sentence.include?("signin_link, signup_link")
raise "the captured link is not the signin-link class" unless link.include?("class: \"signin-link\"")
raise "the captured link path does not name the titled view" unless link_path.include?("{ view: :titled }")
raise "the captured texts are not Ruby's own" unless facts["sorry_text"] == "Sorry!" && facts["please_text"] == "Please" && facts["or_text"] == "or"
raise "the captured form is not the update form" unless core_view.include?("card_form :update")
raise "the captured fields are not the titled email and password nests" unless field.include?("title: name.to_s, view: \"titled\"")

payload = {
  "contract" => "An anonymous person who opens a card's edit modal sees the denial, the denial carries a sign-in link, and following that link reaches the sign-in card's own credential form.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
