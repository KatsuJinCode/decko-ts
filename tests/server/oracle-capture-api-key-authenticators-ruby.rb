# oracle-capture-api-key-authenticators-ruby.rb - runs the PINNED GEM's own
# api_key authenticator and sign-in, and records what they answer.
#
# Why this script exists: the completeness register's C17 row
# (register-routes) grades the port UNPORTED: "Token auth and X-API-Key on
# READS are both unported (see B7): the reads are cookie-session only and
# there is no X-API-Key reader anywhere in the port". Its fix: "add the
# header authenticator to the read dispatch".
#
# This script runs the two gem methods the row's fix depends on, from the
# PINNED GEMSET:
#
#   1. card-mod-api_key-0.20.0/lib/card_controller/api_key.rb - the
#      authenticators merge: the X-API-Key header, else the api_key param.
#      The gem's own file is loaded as it is.
#
#   2. card-mod-api_key-0.20.0/lib/card/auth/api_key.rb - the sign-in: the
#      account lookup, the key check, and the PermissionDenied the gem
#      raises. The gem's own file is loaded as it is; the account lookup is
#      stubbed because it needs a live deck, and the harness records the
#      sign-in argument the gem's own method computes.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-api-key-authenticators-ruby.rb \
#     > fixtures/captured/api-key-authenticators-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The stubbed accounts and keys are the script's own constants, so a
# re-run on the same gemset is byte-stable.

require "json"

GEM_ROOT = ENV.fetch("DECKO_RUBY_GEMSET", nil)
gems_root = if GEM_ROOT
              GEM_ROOT
            else
              File.expand_path(
                "../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
                __dir__
              )
            end

# The load path: every pinned gem's lib directory, the way Bundler would
# put them (the api_key mod's own file requires the jwt gem).
pinned_libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
raise "no pinned gems found at #{gems_root}" if pinned_libs.empty?

pinned_libs.each do |lib|
  gem_dir = File.dirname(lib)
  gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
  nested = File.join(lib, gem_name)
  $LOAD_PATH.unshift(nested) if File.directory?(nested)
  $LOAD_PATH.unshift(lib)
end

require "base64"
require "active_support/core_ext/object/blank"
require "active_support/core_ext/hash/indifferent_access"

# ---------------------------------------------------------------------------
# the stubs
# ---------------------------------------------------------------------------

class Card
  class << self
    # The account the stubbed lookup answers with, and the key the stubbed
    # account's api_key card carries.
    attr_accessor :stub_account, :stub_key

    # find_account_by (auth/current.rb:88-95) stands in for the deck's own
    # search; the capture drives it with a fixed answer.
    def find_account_by(fieldcode, value)
      return nil unless fieldcode == :api_key
      return nil unless value == stub_key
      stub_account
    end
  end

  module Error
    class PermissionDenied < StandardError; end
  end

  module Auth
  end
end

# The account stub: the gem calls `account.left_id` and
# `account.authenticate_api_key(key)`.
class AccountStub
  attr_reader :left_id

  def initialize(left_id, content, real: true)
    @left_id = left_id
    @content = content
    @real = real
  end

  def real?
    @real
  end

  def content
    @content
  end

  # authenticate_api_key (set/right/api_key.rb): the key must match the
  # card's content, and the card must be real.
  def authenticate_api_key(api_key)
    if !real?
      @error = :api_key_not_found
      return false
    end
    if content != api_key
      @error = :api_key_incorrect
      return false
    end
    true
  end
end

# ---------------------------------------------------------------------------
# 1. the authenticators merge (the controller mixin)
# ---------------------------------------------------------------------------

controller_rb = File.join(gems_root, "card-mod-api_key-0.20.0/lib/card_controller/api_key.rb")
raise "the api_key controller mixin not found at #{controller_rb}" unless File.exist?(controller_rb)

eval(File.read(controller_rb), TOPLEVEL_BINDING, controller_rb) # rubocop:disable Security/Eval

# The deck's own base method (decko-0.20.0/lib/card_controller/rest.rb:41-47),
# which the api_key mixin's `super` reaches. The token half of it is
# measured by the request-authenticators capture; what this capture needs
# from it is the shape it merges into: a hash with a :token key. It lives in
# its own module so that the api_key mixin, included AFTER it, is the
# method Ruby finds first and its `super` lands here.
module BaseAuthenticators
  def authenticators
    { token: nil }
  end
end

class ControllerHarness
  include BaseAuthenticators
  include CardController::ApiKey

  attr_accessor :request, :params

  def initialize(request, params)
    @request = request
    @params = params
  end
end

FakeRequest = Struct.new(:headers)

def authenticators_case(label, header_value, param_value)
  harness = ControllerHarness.new(
    FakeRequest.new(header_value === nil ? {} : { "X-API-Key" => header_value }),
    param_value === nil ? {} : { api_key: param_value },
  )
  merged = harness.authenticators
  {
    "label" => label,
    "apiKey" => merged[:api_key],
    "hasTokenKey" => merged.key?(:token)
  }
end

authenticator_rows = [
  authenticators_case("header wins", "header-key", "param-key"),
  authenticators_case("header only", "header-key", nil),
  authenticators_case("param only", nil, "param-key"),
  authenticators_case("neither", nil, nil)
]

# ---------------------------------------------------------------------------
# 2. the sign-in (the auth mixin)
# ---------------------------------------------------------------------------

auth_rb = File.join(gems_root, "card-mod-api_key-0.20.0/lib/card/auth/api_key.rb")
raise "the api_key auth mixin not found at #{auth_rb}" unless File.exist?(auth_rb)

eval(File.read(auth_rb), TOPLEVEL_BINDING, auth_rb) # rubocop:disable Security/Eval

class SigninHarness
  include Card::Auth::ApiKey

  attr_reader :signed_in_as

  # find_account_by (auth/current.rb:88-95), the deck's own lookup, stood in
  # for by the script's fixed answer.
  def find_account_by(fieldcode, value)
    Card.find_account_by(fieldcode, value)
  end

  def signin(cardish)
    @signed_in_as = cardish
  end
end

def signin_case(label, key, account)
  Card.stub_account = account
  Card.stub_key = account.nil? ? nil : account.content
  harness = SigninHarness.new
  begin
    harness.signin_with_api_key(key)
    {
      "label" => label,
      "outcome" => "signed_in",
      "signinArgument" => harness.signed_in_as
    }
  rescue StandardError => e
    {
      "label" => label,
      "outcome" => "raised",
      "errorClass" => e.class.name,
      "errorMessage" => e.message
    }
  end
end

account_ok = AccountStub.new(77, "the-real-key")
account_other = AccountStub.new(88, "another-key")

signin_rows = [
  signin_case("matching key", "the-real-key", account_ok),
  signin_case("no account for the key", "unknown-key", nil),
  signin_case("another account, the key matching its own card", "another-key", account_other),
  signin_case("the key is stripped for the lookup but not for the check", "  the-real-key  ", account_ok)
]

# The order the gem's signin_with uses, read off the gem's own method
# (lib/card/auth/api_key.rb): token, then api_key, then session.
def signin_with_order(token, api_key)
  harness = SigninHarness.new
  harness.define_singleton_method(:signin_with_session) { :session_arm }
  harness.define_singleton_method(:signin_with_token) { |_t| :token_arm }
  harness.signin_with(token: token, api_key: api_key)
rescue StandardError => e
  "RAISED: #{e.class}: #{e.message}"
end

order_rows = [
  { "token" => "t", "apiKey" => "k", "arm" => signin_with_order("t", "k") },
  { "token" => nil, "apiKey" => "k", "arm" => signin_with_order(nil, "k") },
  { "token" => nil, "apiKey" => nil, "arm" => signin_with_order(nil, nil) }
]

puts JSON.pretty_generate(
  "gemset" => "card-mod-api_key-0.20.0 (pinned)",
  "authenticators" => authenticator_rows,
  "signin" => signin_rows,
  "signinOrder" => order_rows
)
