// Card::Auth::Token parity tests — the port of
// card-1.110.0/lib/card/auth/token.rb, pinned against the bytes the REAL
// jwt gem (2.10.3) produced for the real token.rb bodies.
//
// Every byte below is read out of fixtures/captured/auth-token.json, which
// is produced by tools/oracle/auth_token_capture.rb driving Ruby 3.3.12 +
// jwt 2.10.3 on this machine. Nothing here is a hand-computed expectation:
// if the port drifts from the gem, these assertions are what fail.
//
// This suite and its fixture are DEVELOPMENT EVIDENCE, not part of the
// public package: fixtures/captured/ and tests/card/auth/token.test.ts are
// both on the public candidate's exclusion list, so neither ships and the pin
// is not recomputable in a clean clone. See src/card/auth/token.ts:31-38.
//
// The oracle substitutes exactly two process-global inputs, both recorded
// in the fixture: SECRET_KEY is a FIXTURE STRING (token.rb:7 reads Rails'
// secret_key_base, which is per-deployment and must never enter the repo),
// and `expiration` is measured from a frozen clock (token.rb:33 reads the
// wall clock). Everything else — the JWT algorithm, the header shape, the
// payload key order, base64url padding, the HMAC key handling and every
// error string — is the gem's own behavior.
//
// Buffer appears only in this test, to read base64url segments back into
// JSON; the port itself uses TextEncoder + Web Crypto so the same code runs
// in Node and in workers.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  claimAnonymous,
  claimUserId,
  decodeAuthToken,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
  encodeAuthToken,
  PermissionDeniedError,
  tokenExpiration,
  validateAuthToken,
  type TokenClaims,
  type TokenRuntimeConfig,
} from "../../../src/card/auth/token.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/auth-token.json", import.meta.url)),
    "utf8",
  ),
) as {
  fixture_secret: string;
  frozen_now_epoch: number;
  token_expiry_seconds: number;
  expiration: number;
  cases: Record<string, Record<string, unknown>>;
};

const CASES = FIXTURE.cases;

/** The oracle's pinned inputs, in the shape the port takes them. `now` is
 *  frozen so `expiration` reproduces the fixture's exp exactly. */
const oracleConfig = (): TokenRuntimeConfig => ({
  secret: FIXTURE.fixture_secret,
  now: () => FIXTURE.frozen_now_epoch,
});

const tokenOf = (name: string): string => CASES[name]!.token as string;

/** The alg=none downgrade token — read from the fixture rather than written
 *  here, so the rejection verdict and the input it was measured against
 *  cannot drift apart. */
const TOKEN_ALG_NONE = tokenOf("decode_alg_none");

/** nbf in the future — likewise captured, together with its verdict. */
const TOKEN_NBF_FUTURE = tokenOf("decode_nbf_in_future");

const jsonOfSegment = (token: string, index: number): unknown =>
  JSON.parse(Buffer.from(token.split(".")[index]!, "base64url").toString("utf8"));

// ---------------------------------------------------------------------------
// config — the two values Ruby reads out of process globals
// ---------------------------------------------------------------------------

describe("token config (the two globals token.rb reads)", () => {
  it("defaults the expiry to the railtie value — 2 days (cardio/railtie.rb:12)", () => {
    expect(FIXTURE.token_expiry_seconds).toBe(172800);
    expect(DEFAULT_TOKEN_EXPIRY_SECONDS).toBe(FIXTURE.token_expiry_seconds);
  });

  it("expiration is expiry-from-now, whole seconds (token.rb:32-34)", () => {
    expect(tokenExpiration(oracleConfig())).toBe(FIXTURE.expiration);
    expect(tokenExpiration(oracleConfig())).toBe(
      FIXTURE.frozen_now_epoch + FIXTURE.token_expiry_seconds,
    );
  });

  it("expiration truncates to whole seconds, as Ruby's .to_i does", () => {
    // A clock with sub-second precision must still yield an integer epoch,
    // the same way `2.days.from_now.to_i` truncates rather than rounds.
    const fractional = tokenExpiration({
      secret: FIXTURE.fixture_secret,
      now: () => FIXTURE.frozen_now_epoch + 0.987,
    });
    expect(Number.isInteger(fractional)).toBe(true);
    expect(fractional).toBe(FIXTURE.expiration);
  });

  it("refuses a config with no secret rather than signing with an empty key", () => {
    // jwt's Hmac#ensure_valid_key! (hmac.rb:40) raises 'HMAC key cannot be
    // empty'; the port refuses at the config boundary so the failure names
    // the missing thing rather than surfacing a downstream crypto error.
    expect(() => tokenExpiration({ secret: "" })).toThrow(/secret/i);
  });
});

// ---------------------------------------------------------------------------
// encode — token.rb:10-14, byte-compared to the oracle
// ---------------------------------------------------------------------------

describe("encodeAuthToken (token.rb:10-14 `JWT.encode payload, SECRET_KEY`)", () => {
  it("produces the oracle's exact token for a bare user_id", async () => {
    expect(await encodeAuthToken(oracleConfig(), 42)).toBe(tokenOf("encode_user_only"));
  });

  it("produces the oracle's exact token with the verify_url extra payload", async () => {
    // card-mod-account-0.20.0/set/right/account/views.rb:2-4
    // `token_url :verify_and_activate, anonymous: true`
    expect(await encodeAuthToken(oracleConfig(), 42, { anonymous: true })).toBe(
      tokenOf("encode_anonymous_extra"),
    );
  });

  it("produces the oracle's exact token for the reset_password_url shape", async () => {
    // views.rb:6-8 `token_url :reset_password` — no extra payload
    expect(await encodeAuthToken(oracleConfig(), 7)).toBe(tokenOf("encode_reset_password"));
  });

  it("carries a string user_id unchanged (Card::AnonymousID is a String in Ruby)", async () => {
    expect(await encodeAuthToken(oracleConfig(), "anonymous")).toBe(
      tokenOf("encode_anonymous_id_string"),
    );
  });

  it("header segment is exactly {alg: HS256} — no typ member", async () => {
    // jwt-2.10.3/lib/jwt/jwa/signing_algorithm.rb:26-28
    // `def header(*) { 'alg' => alg }`. A port that helpfully adds
    // `typ: "JWT"` emits a DIFFERENT first segment, and every token it
    // mints then fails the gem's own decoder.
    expect(CASES.header_of_plain).toEqual({ alg: "HS256" });
    expect(jsonOfSegment(await encodeAuthToken(oracleConfig(), 42), 0)).toEqual({
      alg: "HS256",
    });
  });

  it("payload member order is user_id, exp, then the extra payload in merge order", async () => {
    // token.rb:11 `{ user_id: user_id, exp: expiration }.merge(extra_payload)`
    // — JSON preserves insertion order, so the payload segment's bytes are
    // order-sensitive even though the claims are not.
    const token = await encodeAuthToken(oracleConfig(), 42, { anonymous: true, z: 1 });
    expect(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")).toBe(
      `{"user_id":42,"exp":${FIXTURE.expiration},"anonymous":true,"z":1}`,
    );
  });

  it("extra payload overrides the default claims, as Hash#merge does", async () => {
    // token.rb:11 `.merge(extra_payload)` — the extra wins on collision, so
    // a caller can pin its own exp. The port must not protect user_id/exp.
    const token = await encodeAuthToken(oracleConfig(), 42, { user_id: 99 });
    expect(jsonOfSegment(token, 1)).toMatchObject({ user_id: 99 });
  });

  it("emits three unpadded base64url segments and is URL-safe as a query param", async () => {
    // The token rides a `?token=` query parameter (account views.rb:35-38
    // `path(action: :update, card: {trigger: trigger}, token: new_token(...))`).
    const token = await encodeAuthToken(oracleConfig(), 42, { anonymous: true });
    expect(CASES.plain_token_is_url_safe).toBe(true);
    expect(token.split(".")).toHaveLength(3);
    expect(token).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(token).not.toContain("=");
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
  });

  it("mints the same bytes for the same inputs, and different ones once the clock moves", async () => {
    const a = await encodeAuthToken(oracleConfig(), 42);
    const b = await encodeAuthToken(oracleConfig(), 42);
    expect(a).toBe(b);
    const later = await encodeAuthToken(
      { secret: FIXTURE.fixture_secret, now: () => FIXTURE.frozen_now_epoch + 60 },
      42,
    );
    expect(later).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------
// decode — token.rb:25-30, against the oracle's own accept/reject verdicts
// ---------------------------------------------------------------------------

describe("decodeAuthToken (token.rb:25-30, Hash-if-valid / String-if-not)", () => {
  it("round-trips a token it minted, with user_id and exp as claims", async () => {
    const token = await encodeAuthToken(oracleConfig(), 42);
    const claims = await decodeAuthToken(oracleConfig(), token);
    expect(claims).toEqual({ user_id: 42, exp: FIXTURE.expiration });
    expect(CASES.encode_user_only!.decoded_payload).toEqual(claims);
  });

  it("round-trips the verify_url extra payload", async () => {
    const token = await encodeAuthToken(oracleConfig(), 42, { anonymous: true });
    const claims = (await decodeAuthToken(oracleConfig(), token)) as TokenClaims;
    expect(claimUserId(claims)).toBe(42);
    expect(claimAnonymous(claims)).toBe(true);
    expect(CASES.encode_anonymous_extra!.decoded_payload).toEqual(claims);
  });

  it("accepts the oracle's own string user_id token", async () => {
    const claims = (await decodeAuthToken(
      oracleConfig(),
      tokenOf("encode_anonymous_id_string"),
    )) as TokenClaims;
    expect(claimUserId(claims)).toBe("anonymous");
  });

  it("REJECTS an expired token with the gem's own message", async () => {
    // jwt-2.10.3/lib/jwt/claims/expiration.rb:24 raises
    // `JWT::ExpiredSignature, 'Signature has expired'`; token.rb:28-29
    // rescues it and returns e.message — the string is what reaches
    // card-mod-account's failure path (events.rb:66-70), so it is bytes.
    const result = await decodeAuthToken(oracleConfig(), tokenOf("decode_expired"));
    expect(result).toBe(CASES.decode_expired!.result);
    expect(result).toBe("Signature has expired");
  });

  it("REJECTS a tampered payload with the gem's own message", async () => {
    // The signature covers header+payload; flipping a payload byte leaves
    // the signature segment intact and must fail verification
    // (encoded_token.rb:90 `raise JWT::VerificationError, 'Signature verification failed'`).
    const result = await decodeAuthToken(oracleConfig(), tokenOf("decode_tampered_payload"));
    expect(result).toBe(CASES.decode_tampered_payload!.result);
    expect(result).toBe("Signature verification failed");
  });

  it("REJECTS a token signed under a different secret", async () => {
    const result = await decodeAuthToken(
      { secret: "a-different-secret", now: () => FIXTURE.frozen_now_epoch },
      tokenOf("encode_user_only"),
    );
    expect(result).toBe(CASES.decode_wrong_secret!.result);
  });

  it("REJECTS garbage, an empty string, and nil with the gem's messages", async () => {
    expect(await decodeAuthToken(oracleConfig(), "not-a-jwt")).toBe(CASES.decode_garbage!.result);
    expect(await decodeAuthToken(oracleConfig(), "")).toBe(CASES.decode_empty!.result);
    expect(await decodeAuthToken(oracleConfig(), undefined as unknown as string)).toBe(
      CASES.decode_nil!.result,
    );
    expect(await decodeAuthToken(oracleConfig(), "not-a-jwt")).toBe(
      "Not enough or too many segments",
    );
  });

  it("REJECTS a two-segment token with the gem's segment-encoding message", async () => {
    expect(await decodeAuthToken(oracleConfig(), "aaa.bbb")).toBe(CASES.decode_two_segments!.result);
    expect(await decodeAuthToken(oracleConfig(), "aaa.bbb")).toBe("Invalid segment encoding");
  });

  it("REJECTS the alg=none downgrade", async () => {
    // jwt's default decode algorithms are ['HS256']
    // (jwt-2.10.3/lib/jwt/configuration/decode_configuration.rb:57), and
    // decode.rb:58 raises 'Expected a different algorithm' when the header's
    // alg is not in that list. A port that reads alg from the header and
    // honours it would accept an unsigned token here.
    const result = await decodeAuthToken(oracleConfig(), TOKEN_ALG_NONE);
    expect(result).toBe(CASES.decode_alg_none!.result);
    expect(result).toBe("Expected a different algorithm");
  });

  it("REJECTS alg confusion — an HS512 header over an HS256 signature", async () => {
    const plain = tokenOf("encode_user_only");
    const forged = [
      Buffer.from('{"alg":"HS512"}', "utf8").toString("base64url"),
      plain.split(".")[1],
      plain.split(".")[2],
    ].join(".");
    expect(await decodeAuthToken(oracleConfig(), forged)).toBe(
      "Expected a different algorithm",
    );
  });

  it("decodes a token that carries no exp — jwt's required_claims default is []", async () => {
    // decode_configuration.rb:58 `@required_claims = []`; the gem invents
    // no expiry. A port that rejected a missing exp would be stricter than
    // Ruby, refusing links the real deck accepts.
    const claims = (await decodeAuthToken(
      oracleConfig(),
      tokenOf("decode_no_exp_claim"),
    )) as TokenClaims;
    expect(claims).toEqual({ user_id: 42 });
    expect(claims.exp).toBeUndefined();
  });

  it("rejects a not-yet-valid token (verify_not_before defaults true)", async () => {
    expect(CASES.decode_nbf_in_future!.result).toBe("Signature nbf has not been reached");
    expect(await decodeAuthToken(oracleConfig(), TOKEN_NBF_FUTURE)).toBe(
      CASES.decode_nbf_in_future!.result,
    );
  });

  it("treats exp == now as EXPIRED and exp == now+1 as valid — the gem's boundary", async () => {
    // claims/expiration.rb:24:
    // `raise ... if payload['exp'].to_i <= Time.now.to_i - leeway`, leeway 0.
    // The oracle measured both sides against the real clock
    // (decode_exp_equal_to_now / decode_exp_one_past_now); the port must
    // reproduce the RULE, so the port's own clock is pinned here.
    const at = FIXTURE.frozen_now_epoch;
    const config = (): TokenRuntimeConfig => ({ secret: FIXTURE.fixture_secret, now: () => at });
    const atBoundary = await encodeAuthToken(config(), 42, { exp: at });
    const pastBoundary = await encodeAuthToken(config(), 42, { exp: at + 1 });
    expect(await decodeAuthToken(config(), atBoundary)).toBe("Signature has expired");
    expect(await decodeAuthToken(config(), pastBoundary)).toMatchObject({ user_id: 42, exp: at + 1 });
  });

  it("never throws — token.rb:28-29 rescues StandardError into a message", async () => {
    const inputs = [
      "",
      ".",
      "..",
      "a.b.c",
      TOKEN_ALG_NONE,
      " ",
      "e30.e30.",
      "null",
    ];
    for (const input of inputs) {
      expect(typeof (await decodeAuthToken(oracleConfig(), input))).toBe("string");
    }
  });

  it("round-trips at EVERY payload length, so the base64url group logic is pinned by construction", async () => {
    // The first cut of the port's base64url decoder got the group-to-byte
    // mapping wrong for trailing groups of 2 and 3 characters, which is
    // silent for most inputs and fatal for exactly the payload lengths a
    // real token happens to use. Walking the length space here turns a
    // lucky sample into a covered range: every user_id width from 0 to 96
    // characters exercises every (length mod 4) case on both the payload
    // segment and the fixed-width signature.
    for (let width = 0; width <= 96; width++) {
      const userId = "u".repeat(width) || 0;
      const token = await encodeAuthToken(oracleConfig(), userId);
      const claims = (await decodeAuthToken(oracleConfig(), token)) as TokenClaims;
      expect(claimUserId(claims), `user_id width ${width}`).toBe(width === 0 ? 0 : userId);
    }
  });

  it("verifies the signature BEFORE parsing the payload, as jwt's lazy accessors do", async () => {
    // decode.rb:31-40 touches EncodedToken#header (verify_algo), then signs
    // the RAW header.payload strings (verify_signature), and only the claims
    // verifier parses the payload. A port that parses the payload up front
    // answers a forger with 'Invalid segment encoding' where Ruby answers
    // 'Signature verification failed' — the first message tells an attacker
    // which half of the forgery was malformed.
    const good = tokenOf("encode_user_only");
    const [header, , signature] = good.split(".");
    // Flip the payload's first character so it cannot parse as JSON, and
    // keep the original (now wrong) signature.
    const unparseablePayload = (good.split(".")[1]!.startsWith("e") ? "a" : "e") + good.split(".")[1]!.slice(1);
    const result = await decodeAuthToken(
      oracleConfig(),
      [header, unparseablePayload, signature].join("."),
    );
    expect(result).toBe("Signature verification failed");
  });
});

// ---------------------------------------------------------------------------
// validate! — token.rb:18-23
// ---------------------------------------------------------------------------

describe("validateAuthToken (token.rb:18-23)", () => {
  it("returns the claims for a valid token", async () => {
    const claims = (await validateAuthToken(
      oracleConfig(),
      tokenOf("encode_user_only"),
    )) as TokenClaims;
    expect(claims).toEqual({ user_id: 42, exp: FIXTURE.expiration });
  });

  it("throws PermissionDenied carrying the decode error string, as Ruby does", async () => {
    // token.rb:20 `raise Card::Error::PermissionDenied, payload` where
    // payload is decode's String — the MESSAGE is the decode error, which is
    // what card-mod-account's failure path reports.
    await expect(
      validateAuthToken(oracleConfig(), tokenOf("decode_tampered_payload")),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(
      validateAuthToken(oracleConfig(), tokenOf("decode_tampered_payload")),
    ).rejects.toThrow("Signature verification failed");
    await expect(validateAuthToken(oracleConfig(), tokenOf("decode_expired"))).rejects.toThrow(
      "Signature has expired",
    );
  });
});

// ---------------------------------------------------------------------------
// claim accessors — token.rb:40 and card-mod-account events.rb:67
// ---------------------------------------------------------------------------

describe("claim accessors", () => {
  it("reads user_id and anonymous the way the gem's two call sites do", async () => {
    // token.rb:40 `payload[:anonymous] ? Card::AnonymousID : payload[:user_id]`
    // events.rb:67 `result[:user_id] != accounted_id`
    const withAnon = (await decodeAuthToken(
      oracleConfig(),
      tokenOf("encode_anonymous_extra"),
    )) as TokenClaims;
    expect(claimAnonymous(withAnon)).toBe(true);
    expect(claimUserId(withAnon)).toBe(42);

    const withoutAnon = (await decodeAuthToken(
      oracleConfig(),
      tokenOf("encode_user_only"),
    )) as TokenClaims;
    expect(claimAnonymous(withoutAnon)).toBeFalsy();
  });

  it("returns undefined for absent claims, so a bare payload does not throw", () => {
    expect(claimUserId({} as TokenClaims)).toBeUndefined();
    expect(claimAnonymous({} as TokenClaims)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// the injection seam — the CSRF-secret pattern, applied to the token secret
// ---------------------------------------------------------------------------

describe("secret injection", () => {
  it("takes the secret per call — no module-level secret, no repo-pinned key", async () => {
    const token = await encodeAuthToken({ secret: "secret-one" }, 42);
    expect(await decodeAuthToken({ secret: "secret-one" }, token)).toMatchObject({ user_id: 42 });
    expect(await decodeAuthToken({ secret: "secret-two" }, token)).toBe(
      "Signature verification failed",
    );
  });

  it("the secret in this test is a fixture, not a deployment key", async () => {
    // The oracle names its substitution in the fixture; a real
    // secret_key_base must never be committed, so the test asserts the
    // shape of the placeholder rather than trusting a comment.
    expect(FIXTURE.fixture_secret).toBe("decko-ts-oracle-fixture-secret-key-base-0000");
    expect(FIXTURE.fixture_secret).not.toMatch(/^[0-9a-f]{128}$/);
  });
});
