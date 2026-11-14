# oracle-capture-first-run-setup.rb - the pinned Ruby's own bytes for the
# FIRST-RUN SETUP OF THE FIRST ADMIN ACCOUNT (registry row cap-S9, "First-run
# setup of the first admin account").
#
# The row's contract: a deck with no user account yet shows the setup form,
# and the first account created through it becomes an administrator. Two
# pinned files own it:
#
#   1. card-1.110.0/lib/card/auth/setup.rb - THE CENSUS: `needs_setup?` is
#      true until the deck carries a user account, `needs_setup_if_no_accounts`
#      is `user_account_count.zero?`, `user_account_cql` selects the accounts
#      that are NOT the shipped ones (`creator_id <> Card::DeckoBotID`), and
#      `user_account_count` counts them.
#   2. card-mod-account-0.20.0/set/type/user.rb - THE SETUP SURFACE: the
#      `:setup` view is gated on `perms: :needs_setup?`, the form's title is
#      "Your deck is ready to go!", the button is "Set up", the form posts the
#      `check_setup` trigger, `check_setup` aborts unless `Auth.needs_setup?`,
#      `setup_first_user` grants the first user the three first-user roles,
#      and `signin_after_setup` signs that user in.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-first-run-setup.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "first-run-setup.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "needs_setup",
    gem: "card-1.110.0",
    path: "lib/card/auth/setup.rb",
    marker: "def needs_setup?", before: 0, after: 6 },
  { key: "needs_setup_if_no_accounts",
    gem: "card-1.110.0",
    path: "lib/card/auth/setup.rb",
    marker: "def needs_setup_if_no_accounts", before: 0, after: 3 },
  { key: "user_account_cql",
    gem: "card-1.110.0",
    path: "lib/card/auth/setup.rb",
    marker: "def user_account_cql", before: 0, after: 3 },
  { key: "user_account_count",
    gem: "card-1.110.0",
    path: "lib/card/auth/setup.rb",
    marker: "def user_account_count", before: 0, after: 5 },
  { key: "roles_for_first_user",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "basket[:roles_for_first_user]", before: 0, after: 0 },
  { key: "setup_view",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "view :setup, unknown: true, perms: :needs_setup?, cache: :never do", before: 1, after: 8 },
  { key: "setup_button",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "def setup_button", before: 0, after: 2 },
  { key: "setup_hidden_fields",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "def setup_hidden_fields", before: 0, after: 7 },
  { key: "check_setup_event",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "event :check_setup, before: :check_permissions, on: :create, trigger: :required do", before: 0, after: 7 },
  { key: "setup_first_user_event",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "event :setup_first_user, :finalize, on: :create, when: :setup? do", before: 0, after: 5 },
  { key: "signin_after_setup_event",
    gem: "card-mod-account-0.20.0",
    path: "set/type/user.rb",
    marker: "event :signin_after_setup, :integrate, on: :create, when: :setup? do", before: 0, after: 2 }
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

needs_setup = oracle["needs_setup"]["source"]
census = oracle["needs_setup_if_no_accounts"]["source"]
cql = oracle["user_account_cql"]["source"]
count = oracle["user_account_count"]["source"]
roles = oracle["roles_for_first_user"]["source"]
view = oracle["setup_view"]["source"]
button = oracle["setup_button"]["source"]
hidden = oracle["setup_hidden_fields"]["source"]
check_setup = oracle["check_setup_event"]["source"]
first_user = oracle["setup_first_user_event"]["source"]
signin_after = oracle["signin_after_setup_event"]["source"]

facts = {
  # THE CENSUS
  "needs_setup_method" => needs_setup[/def needs_setup\?/, 0],
  "needs_setup_cache_marker" => needs_setup[/Card\.cache\.read\(NEEDS_SETUP\)/, 0],
  "needs_setup_if_no_accounts" => census[/user_account_count\.zero\?/, 0],
  "user_account_cql" => cql[/\{ right: :account, creator_id: \["ne", Card::DeckoBotID\] \}/, 0],
  "user_account_count_method" => count[/def user_account_count/, 0],
  "user_account_count_query" => count[/Card\.count_by_cql cql/, 0],
  # THE SETUP SURFACE
  "roles_for_first_user" => roles[/basket\[:roles_for_first_user\] = %i\[help_desk shark administrator\]/, 0],
  "setup_view" => view[/view :setup, unknown: true, perms: :needs_setup\?, cache: :never do/, 0],
  "setup_title" => view[/voo\.title = "Your deck is ready to go!" # LOCALIZE/, 0],
  "setup_button" => button[/submit_button text: "Set up", disable_with: "Setting up"/, 0],
  "setup_hidden_trigger" => hidden[/trigger: %w\[check_setup\]/, 0],
  "setup_hidden_success" => hidden[/success: \{ redirect: true, mark: path\(mark: ""\) \}/, 0],
  # THE EVENTS
  "check_setup_event" => check_setup[/event :check_setup, before: :check_permissions, on: :create, trigger: :required do/, 0],
  "check_setup_abort" => check_setup[/abort :failure unless Auth\.needs_setup\?/, 0],
  "setup_first_user_event" => first_user[/event :setup_first_user, :finalize, on: :create, when: :setup\? do/, 0],
  "setup_first_user_roles" => first_user[/basket\[:roles_for_first_user\]\.map\(&:cardname\)\.each do \|role\|/, 0],
  "signin_after_setup_event" => signin_after[/event :signin_after_setup, :integrate, on: :create, when: :setup\? do/, 0],
  "signin_after_setup_body" => signin_after[/Auth\.signin id/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured census does not count the user accounts" unless census.include?("user_account_count.zero?")
raise "the captured census does not exclude the shipped accounts" unless cql.include?("creator_id: [\"ne\", Card::DeckoBotID]")
raise "the captured count does not count by cql" unless count.include?("Card.count_by_cql cql")
raise "the captured view is not gated on the census" unless view.include?("perms: :needs_setup?")
raise "the captured title is not Ruby's own" unless view.include?("Your deck is ready to go!")
raise "the captured button is not Ruby's own" unless button.include?("submit_button text: \"Set up\"")
raise "the captured form does not post the check_setup trigger" unless hidden.include?("trigger: %w[check_setup]")
raise "the captured event does not abort unless the census says so" unless check_setup.include?("abort :failure unless Auth.needs_setup?")
raise "the captured first-user event does not grant the three roles" unless first_user.include?("basket[:roles_for_first_user].map(&:cardname)")
raise "the captured roles are not Ruby's own" unless roles.include?("%i[help_desk shark administrator]")
raise "the captured sign-in event does not sign the new user in" unless signin_after.include?("Auth.signin id")

payload = {
  "contract" => "A deck with no user account yet shows the setup form, and the first account created through it becomes an administrator.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"
