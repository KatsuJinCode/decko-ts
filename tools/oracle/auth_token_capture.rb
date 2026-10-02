# Auth::Token byte oracle — captures the exact strings card-1.110.0's
# Card::Auth::Token produces and accepts, so the TypeScript port can be
# pinned against Ruby's OWN output rather than against a reading of it.
#
#   ruby tools/oracle/auth_token_capture.rb > fixtures/captured/auth-token.json
#
# What is run here is the real jwt gem (2.10.3) driving the real
# token.rb bodies, with the two process-global inputs pinned:
#
#   * SECRET_KEY  — card-1.110.0/lib/card/auth/token.rb:7 reads
#                   `Rails.application.credentials.secret_key_base.to_s`.
#                   That is a per-deployment secret and MUST NOT be captured.
#                   This oracle substitutes a FIXTURE secret (a literal here,
#                   never a real one) and records the fact, so every pinned
#                   byte below is "what Ruby does under THIS fixture secret".
#   * expiration   — token.rb:33 `Card.config.token_expiry.from_now.to_i`
#                   reads the wall clock. ActiveSupport is not loaded here, so
#                   `expiration` is defined the same way with Time.now frozen
#                   to a constant (the railtie default is 2.days —
#                   card-1.110.0/lib/cardio/railtie.rb:12 — so the frozen
#                   base + 2 days is the exp value every encode below carries).
#
# The module bodies below are copied verbatim from the gem; only the two
# globals above are substituted. Diff this file against the gem before
# trusting a byte: the gem lives at
#   C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-1.110.0/lib/card/auth/token.rb

require "jwt"
require "json"

# --- pinned inputs (substitutions; see header) ------------------------------

# The fixture secret. NOT a real secret_key_base — a made-up string that
# exists only so the captured bytes are reproducible on any machine.
FIXTURE_SECRET = "decko-ts-oracle-fixture-secret-key-base-0000"

# The frozen "now" every expiration is measured from (2026-09-28 00:00:00 UTC,
# epoch 1790553600).
FROZEN_NOW = Time.at(1_790_553_600).utc

# Card.config.token_expiry — card-1.110.0/lib/cardio/railtie.rb:12
# `config.token_expiry = 2.days`. No mod in the installed gem set overrides
# it (grep token_expiry over card-1.110.0 + card-mod-account-0.20.0 returns
# only this line, token.rb:33, and the two account views that read it).
TOKEN_EXPIRY_SECONDS = 2 * 24 * 60 * 60

# --- the gem's bodies, with the two globals bound ---------------------------

# token.rb:6-7  SECRET_KEY = Rails.application.credentials.secret_key_base.to_s
SECRET_KEY = FIXTURE_SECRET

# token.rb:10-14
def encode user_id, extra_payload = {}
  payload = { user_id: user_id, exp: expiration }.merge(extra_payload)
  JWT.encode payload, SECRET_KEY
end

# token.rb:25-30 — returns Hash if valid, String error message if not
def decode token
  decoded = JWT.decode(token, SECRET_KEY)[0]
  decoded
rescue StandardError => e
  e.message
end

# token.rb:32-34 — the gem's `from_now`, with the clock frozen
def expiration
  (FROZEN_NOW + TOKEN_EXPIRY_SECONDS).to_i
end

# --- capture ----------------------------------------------------------------

result = {
  "captured_by" => "tools/oracle/auth_token_capture.rb",
  "gem" => "card-1.110.0",
  "jwt_gem" => JWT::VERSION::STRING,
  "ruby" => RUBY_VERSION,
  "note" => "SECRET_KEY is a FIXTURE, not a real secret_key_base; " \
            "expiration is measured from a frozen clock. Bytes below are " \
            "reproducible only under these two substitutions.",
  "fixture_secret" => FIXTURE_SECRET,
  "frozen_now_epoch" => FROZEN_NOW.to_i,
  "frozen_now_iso" => FROZEN_NOW.iso8601,
  "token_expiry_seconds" => TOKEN_EXPIRY_SECONDS,
  "expiration" => expiration,
  "cases" => {},
}

# 1. the bare encode: user_id only (views.rb:45 new_token with no extra)
plain = encode 42
result["cases"]["encode_user_only"] = {
  "token" => plain,
  "segments" => plain.split(".", -1).length,
  "decoded_payload" => decode(plain),
}

# 2. the account verify_url encode: extra_payload {anonymous: true}
#    (card-mod-account-0.20.0/set/right/account/views.rb:2-4
#     `token_url :verify_and_activate, anonymous: true`)
anon = encode 42, { anonymous: true }
result["cases"]["encode_anonymous_extra"] = {
  "token" => anon,
  "decoded_payload" => decode(anon),
}

# 3. reset_password_url: no extra payload (views.rb:6-8 `token_url :reset_password`)
reset = encode 7
result["cases"]["encode_reset_password"] = {
  "token" => reset,
  "decoded_payload" => decode(reset),
}

# 4. a string user_id (Card::AnonymousID is the string "anonymous" in Ruby)
anonid = encode "anonymous"
result["cases"]["encode_anonymous_id_string"] = {
  "token" => anonid,
  "decoded_payload" => decode(anonid),
}

# 5. expiry rejection: the same shape, already expired
expired = JWT.encode({ user_id: 42, exp: FROZEN_NOW.to_i - 1 }, SECRET_KEY)
result["cases"]["decode_expired"] = {
  "token" => expired,
  "result" => decode(expired),
}

# 6. tampering: flip one byte of the PAYLOAD segment, keep the signature
head, body, sig = plain.split(".", 3)
tampered_body = body.sub(/\A(.)/) { ($1 == "a" ? "b" : "a") }
tampered = [head, tampered_body, sig].join(".")
result["cases"]["decode_tampered_payload"] = {
  "token" => tampered,
  "result" => decode(tampered),
}

# 7. wrong secret
result["cases"]["decode_wrong_secret"] = {
  "result" => begin
    JWT.decode(plain, "a-different-secret")[0]
  rescue StandardError => e
    e.message
  end,
}

# 8. malformed: not a JWT at all
result["cases"]["decode_garbage"] = { "result" => decode("not-a-jwt") }

# 9. malformed: two segments
result["cases"]["decode_two_segments"] = { "result" => decode("aaa.bbb") }

# 10. malformed: empty string
result["cases"]["decode_empty"] = { "result" => decode("") }

# 11. the alg=none downgrade attempt (the classic JWT attack) — the gem's
#     default decode algorithms are ['HS256']
#     (jwt-2.10.3/lib/jwt/configuration/decode_configuration.rb:57), so a
#     header claiming `none` must be REJECTED
none_header = [
  JWT::Base64.url_encode('{"alg":"none"}'),
  JWT::Base64.url_encode('{"user_id":42}'),
  "",
].join(".")
result["cases"]["decode_alg_none"] = { "token" => none_header, "result" => decode(none_header) }

# 12. header + payload of a well-formed token, so the port can pin the exact
#     header JSON (the alg/typ pair and its key ORDER) independently of the
#     signature
result["cases"]["header_of_plain"] = JWT.decode(plain, SECRET_KEY)[1]

# 13. what the account views actually put in the URL — the shape mail/wiring
#     needs: the token is a query parameter, so it must be URL-safe. The
#     base64url alphabet is [A-Za-z0-9_-] plus the two dots.
result["cases"]["plain_token_is_url_safe"] = (plain =~ %r{\A[A-Za-z0-9_.-]+\z}) ? true : false

# 14. NO exp claim: jwt's required_claims default is [] (decode_configuration.rb:58),
#     so a token without exp must DECODE (the gem does not manufacture one)
no_exp = JWT.encode({ user_id: 42 }, SECRET_KEY)
result["cases"]["decode_no_exp_claim"] = {
  "token" => no_exp,
  "result" => decode(no_exp),
}

# 15/16. the expiry BOUNDARY, measured against the machine's real clock —
#     the gem's own rule (claims/expiration.rb:24) is
#     `raise if payload['exp'].to_i <= Time.now.to_i - leeway`, so exp ==
#     now is EXPIRED and exp == now+1 is not. These two therefore use
#     Time.now, not FROZEN_NOW: a frozen clock cannot demonstrate a
#     boundary, and the case names would otherwise lie about what was
#     measured. (The 3600s margins in cases 17+ are the same discipline.)
at_now = JWT.encode({ user_id: 42, exp: Time.now.to_i }, SECRET_KEY)
result["cases"]["decode_exp_equal_to_now"] = {
  "exp" => Time.now.to_i,
  "result" => decode(at_now),
}

after = JWT.encode({ user_id: 42, exp: Time.now.to_i + 1 }, SECRET_KEY)
result["cases"]["decode_exp_one_past_now"] = {
  "exp" => Time.now.to_i + 1,
  "result" => decode(after),
}

# 17. nbf in the future (verify_not_before defaults true — decode_configuration.rb:50)
#     NOTE the capture runs at the machine's real Time.now, not FROZEN_NOW, so
#     the frozen-epoch arithmetic below is only valid for the nbf claim
future_nbf = JWT.encode({ user_id: 42, exp: (Time.now.to_i + 3600), nbf: (Time.now.to_i + 7200) }, SECRET_KEY)
result["cases"]["decode_nbf_in_future"] = { "token" => future_nbf, "result" => decode(future_nbf) }

# 18. the alg-confusion downgrade: a token whose HEADER claims HS512 but is
#     signed HS256. jwt's default allowed algorithms are ['HS256'], so the
#     header claim alone must not select the verifier.
hs512_claim = JWT.encode({ user_id: 42, exp: (Time.now.to_i + 3600) }, SECRET_KEY, "HS512")
result["cases"]["decode_alg_confusion_hs512"] = { "result" => decode(hs512_claim) }

# 19. an empty signing key — Hmac#ensure_valid_key! rejects it (hmac.rb:40)
empty_key = begin
  JWT.encode({ user_id: 42, exp: (Time.now.to_i + 3600) }, "")
rescue StandardError => e
  e.message
end
result["cases"]["encode_empty_key_error"] = empty_key

# 20. a non-String key — same guard
non_string_key = begin
  JWT.encode({ user_id: 42, exp: (Time.now.to_i + 3600) }, 12345)
rescue StandardError => e
  e.message
end
result["cases"]["encode_non_string_key_error"] = non_string_key

# 21. decode with a nil/blank token, i.e. the "no token param" path that
#     card-mod-account's requiring_token guards upstream (events.rb:74-80)
result["cases"]["decode_nil"] = { "result" => (begin; decode(nil); rescue StandardError => e; e.message; end) }

puts JSON.pretty_generate(result)
