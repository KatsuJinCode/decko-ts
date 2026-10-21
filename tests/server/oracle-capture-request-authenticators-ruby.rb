# oracle-capture-request-authenticators-ruby.rb - runs the PINNED GEM's own
# Authorization-header grammar and the PINNED GEM's own token sign-in, and
# records what they answer.
#
# Why this script exists: the completeness register's B7 row grades the port
# PARTIAL because "a GET carrying `Authorization: Token ...` renders as
# Anonymous" on the read path, and names the fix: "read the Token/Bearer
# header and X-API-Key on the read path, per
# card-mod-api_key-0.20.0/lib/card_controller/api_key.rb:4-13". That was
# derived by reading the gems.
#
# This script runs the two gem methods the row's fix depends on, from the
# PINNED GEMSET, over the shapes that decide the behaviour:
#
#   1. THE HEADER GRAMMAR - actionpack-7.2.4
#      lib/action_controller/metal/http_authentication.rb, the Token module
#      (TOKEN_REGEX :427, token_and_options :487-495, raw_params :520-533,
#      params_array_from :502-504, rewrite_param_values :506-508). The
#      module's SOURCE is taken verbatim out of the pinned file and
#      evaluated in place, because the file's other two modules (Basic,
#      Digest) need a live Rails app at load time and the Token module
#      does not. Nothing in the Token module is retyped here.
#
#   2. THE SIGN-IN - card-1.110.0/lib/card/auth/token.rb
#      (validate! :18-23, decode :25-31, signin_with_token :38-41) with the
#      jwt gem (2.10.3, in the pin). The card gem's own file is loaded as it
#      is; Rails' secret_key_base, Card.config.token_expiry and
#      Card::Error::PermissionDenied are stubbed because they need a live
#      Rails app, and the harness records the signin argument the gem's own
#      method computes.
#
# The one thing this capture CANNOT show is a sign-in target for a payload
# with the anonymous claim: card-1.110.0 never defines Card::AnonymousID
# (the constant is used at auth/current.rb:8, :37 and auth/token.rb:40, and
# defined nowhere in the pinned gemset), so the gem's own method raises
# NameError there. The capture records that fact, and the port's test names
# the divergence rather than pretending a byte match.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-request-authenticators-ruby.rb \
#     > fixtures/captured/request-authenticators-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The signed tokens are minted with a FIXED secret and a FIXED
# expiry, so a re-run on the same gemset is byte-stable; the payload
# timestamps are pinned for the same reason.

require "json"
require "time"
# The jwt gem calls ::Base64.urlsafe_encode64 (jwt/base64.rb:13); on Ruby
# 3.4 base64 is a bundled gem, so it is required explicitly here (the
# actionpack file under test requires it too, at its own line 5).
require "base64"

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
# put them. The files under test are the pinned actionpack
# (lib/action_controller/metal/http_authentication.rb), the pinned
# activesupport (Hash#with_indifferent_access, which the actionpack
# module's token_and_options uses) and the pinned jwt (which
# card-1.110.0/lib/card/auth/token.rb requires).
pinned_libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
raise "no pinned gems found at #{gems_root}" if pinned_libs.empty?

# A few pinned gems nest their files one level deeper (concurrent-ruby ships
# lib/concurrent-ruby/concurrent/map.rb), so a gem's own lib/<gem name>
# directory goes on the path too. Only that one directory per gem: adding
# every nested directory would put activesupport's own lib/active_support on
# the path, and its digest.rb would shadow the standard library's.
pinned_libs.each do |lib|
  gem_dir = File.dirname(lib)
  gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
  nested = File.join(lib, gem_name)
  $LOAD_PATH.unshift(nested) if File.directory?(nested)
  $LOAD_PATH.unshift(lib)
end

# Hash#with_indifferent_access, which actionpack's token_and_options uses
# for the options hash (http_authentication.rb:492). The narrow require
# keeps the i18n/concurrent chain out of the capture.
require "active_support/core_ext/hash/indifferent_access"

# ---------------------------------------------------------------------------
# 1. the header grammar (actionpack's own Token module)
# ---------------------------------------------------------------------------

actionpack_rb = File.join(
  gems_root,
  "actionpack-7.2.4/lib/action_controller/metal/http_authentication.rb"
)
raise "actionpack's http_authentication.rb not found at #{actionpack_rb}" unless File.exist?(actionpack_rb)

# The Token module's source, verbatim, out of the pinned file. The Token
# module is the LAST module in the file, so the slice runs from
# "module Token" to the end, minus the two "end" lines that close the
# enclosing HttpAuthentication and ActionController modules.
source = File.read(actionpack_rb)
token_start = source.index("module Token")
raise "the Token module was not found in #{actionpack_rb}" if token_start.nil?

token_lines = source[token_start..].lines
unless token_lines[-3..].map(&:strip) == ["end", "end", "end"]
  raise "the pinned actionpack file does not end with the Token module's three end lines"
end

token_source = token_lines[0..-3].join

module ActionController
  module HttpAuthentication
  end
end

ActionController::HttpAuthentication.module_eval(token_source, actionpack_rb) # rubocop:disable Security/Eval

TokenGrammar = ActionController::HttpAuthentication::Token

# The request double `token_and_options` reads: it asks for
# `request.authorization` and nothing else.
FakeRequest = Struct.new(:authorization)

HEADERS = [
  "Token abc123",
  "Bearer abc123",
  "Token token=\"abc123\"",
  "Token token=\"abc123\", nonce=\"def\"",
  "Token abc123, opt=1",
  "Token abc123; opt=1",
  "Token abc123\topt=1",
  "Token  abc123",
  "Token ",
  "Token",
  "Basic abc123",
  "token abc123",
  "TOKEN abc123",
  "Token \"abc123\"",
  ""
].freeze

header_rows = HEADERS.map do |header|
  request = FakeRequest.new(header)
  parsed = TokenGrammar.token_and_options(request)
  {
    "header" => header,
    # nil means "no token in this header" (the grammar did not match).
    "token" => parsed.nil? ? nil : parsed[0],
    "options" => parsed.nil? ? nil : parsed[1].to_h
  }
end

# ---------------------------------------------------------------------------
# 2. the sign-in (card-1.110.0's own Card::Auth::Token)
# ---------------------------------------------------------------------------

# Rails' secret_key_base. The card gem reads it at class-body time
# (token.rb:7), so the stub has to exist before the file is loaded.
module Rails
  def self.application
    @application ||= Application.new
  end

  class Application
    def credentials
      @credentials ||= Credentials.new
    end
  end

  class Credentials
    def secret_key_base
      "oracle-signing-secret-for-the-capture"
    end
  end
end

# Card.config.token_expiry.from_now (token.rb:27-29) and
# Card::Error::PermissionDenied (token.rb:20). Both need a live Rails app,
# so they are pinned here: the expiry is a FIXED far-future instant, so the
# minted tokens are byte-stable AND valid whenever the capture is run.
FIXED_NOW = Time.at(4_102_444_800).utc # 2100-01-01

class Card
  class << self
    attr_accessor :config

    def id(cardish)
      case cardish
      when Integer then cardish
      when nil then nil
      else cardish.respond_to?(:id) ? cardish.id : nil
      end
    end
  end

  class Config
    def token_expiry
      Expiry.new
    end
  end

  class Expiry
    def from_now
      FIXED_NOW + 3600
    end
  end

  module Error
    class PermissionDenied < StandardError; end
  end
end

Card.config = Card::Config.new

card_token_rb = File.join(gems_root, "card-1.110.0/lib/card/auth/token.rb")
raise "card's auth/token.rb not found at #{card_token_rb}" unless File.exist?(card_token_rb)

# The card gem's own file, loaded as it is.
eval(File.read(card_token_rb), TOPLEVEL_BINDING, card_token_rb) # rubocop:disable Security/Eval

# The harness: the gem's own `signin_with_token` (token.rb:38-41) with the
# `signin` call recorded instead of performed, so the capture shows the
# argument the gem computes.
class SigninHarness
  include Card::Auth::Token

  attr_reader :signed_in_as

  def signin(cardish)
    @signed_in_as = cardish
  end
end

# The sign-in target for a payload with the anonymous claim. The gem reads
# Card::AnonymousID, which the pinned card gem never defines, so the
# constant's absence is recorded rather than papered over.
ANONYMOUS_CONSTANT_DEFINED = Card.const_defined?(:AnonymousID, false)

def signin_case(label, token)
  harness = SigninHarness.new
  begin
    harness.signin_with_token(token)
    {
      "label" => label,
      "outcome" => "signed_in",
      "signinArgument" => harness.signed_in_as.is_a?(Hash) ? harness.signed_in_as.to_h : harness.signed_in_as
    }
  rescue StandardError => e
    {
      "label" => label,
      "outcome" => "raised",
      "errorClass" => e.class.name,
      "errorMessage" => e.message,
      "signinArgument" => nil
    }
  end
end

# The tokens the sign-in cases use. `Card::Auth::Token.encode` mints them
# with the pinned secret and the FIXED expiry.
minted = Card::Auth::Token.encode(42)
minted_anonymous = Card::Auth::Token.encode(42, { anonymous: true })
minted_tampered = "#{minted[0..-4]}AAAA"
# A properly signed token whose exp is in the past. Signed with the same
# secret, so the failure is the EXPIRY and not the signature.
expired = JWT.encode({ "user_id" => 42, "exp" => 1000 }, Card::Auth::Token::SECRET_KEY)

signin_rows = [
  signin_case("valid user_id", minted),
  signin_case("anonymous claim", minted_anonymous),
  signin_case("tampered signature", minted_tampered),
  signin_case("expired", expired),
  signin_case("empty token", ""),
  signin_case("not a jwt", "not-a-jwt")
]

# The validate! answers on their own, so the denial message the port has to
# reproduce is recorded separately from the sign-in target.
validate_rows = [minted, minted_anonymous, minted_tampered, expired, "", "not-a-jwt"].map do |token|
  begin
    payload = Card::Auth::Token.validate!(token)
    { "token" => token, "outcome" => "ok", "payload" => payload.to_h }
  rescue StandardError => e
    { "token" => token, "outcome" => "raised", "errorClass" => e.class.name, "errorMessage" => e.message }
  end
end

puts JSON.pretty_generate(
  "gemset" => "card-1.110.0 + actionpack-7.2.4 + jwt-2.10.3 (pinned)",
  "anonymousConstantDefined" => ANONYMOUS_CONSTANT_DEFINED,
  "headerGrammar" => header_rows,
  "signin" => signin_rows,
  "validate" => validate_rows
)
