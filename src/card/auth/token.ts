// Card::Auth::Token — the port of card-1.110.0/lib/card/auth/token.rb.
//
// WHAT THIS IS. Ruby mints the account verify / reset-password links with
// `Auth::Token.encode card.accounted_id, extra_payload`
// (card-mod-account-0.20.0/set/right/account/views.rb:44-46) and consumes
// them with `Auth::Token.decode token`
// (card-mod-account-0.20.0/set/right/account/events.rb:66). Underneath is
// one line — `JWT.encode payload, SECRET_KEY` — so this module is a JWT:
// HS256 over a two-claim payload, signed with the app's secret.
//
// THE TWO PROCESS GLOBALS, AND HOW THEY ARRIVE HERE.
//
//   SECRET_KEY  (token.rb:7)  `Rails.application.credentials.secret_key_base.to_s`
//     Ruby reads a per-deployment Rails credential at load time. There is no
//     Rails credentials object in this engine, so the port takes the secret
//     PER CALL through {@link TokenRuntimeConfig}. That is the same shape
//     the CSRF secret uses (src/server/write-routes.ts:102 WriteRouteContext
//     .csrfSecret, pinned by vm-staging-server.mjs from DECKO_CSRF_SECRET with
//     a per-boot random fallback): the host owns the secret, this module
//     never stores one, and there is no repo-pinned key to leak.
//
//   token_expiry (token.rb:33)  `Card.config.token_expiry.from_now.to_i`
//     The railtie default is 2.days (card-1.110.0/lib/cardio/railtie.rb:12)
//     and NO mod in the installed gem set overrides it — grep token_expiry
//     across card-1.110.0 and card-mod-account-0.20.0 returns only that
//     assignment, this read, and the two account views that render it. So
//     {@link DEFAULT_TOKEN_EXPIRY_SECONDS} is a PORTED value, not a
//     port decision, and a deployment that wants a different one passes
//     `tokenExpirySeconds`.
//
// FAITHFULNESS, ITEM BY ITEM (each pinned by tests/card/auth/token.test.ts
// against bytes the real jwt gem produced — see
// fixtures/captured/auth-token.json and tools/oracle/auth_token_capture.rb):
//
//   * algorithm HS256 — jwt.rb:35 `def encode(payload, key, algorithm = 'HS256', ...)`
//     with no algorithm argument at token.rb:13.
//   * header is EXACTLY {"alg":"HS256"} — jwt/jwa/signing_algorithm.rb:26-28
//     `def header(*) { 'alg' => alg }`. There is no `typ` member; a port that
//     adds one mints tokens the gem's own decoder rejects.
//   * payload member order user_id, exp, then the extra payload in merge
//     order — token.rb:11. JSON preserves insertion order, so the payload
//     segment's BYTES depend on it even though the claims do not.
//   * the extra payload WINS on collision (`.merge(extra_payload)`), so
//     `user_id` and `exp` are not protected.
//   * base64url, unpadded (jwt/base64.rb), three dot-separated segments.
//   * decode returns the claims Hash OR the error message String — never
//     an exception (token.rb:28-29 `rescue StandardError => e; e.message`).
//     The message is user-visible: events.rb:66-70 passes it to the failure
//     event. Every rejection string below is the gem's own, byte for byte.
//   * decode accepts a token with NO exp (jwt's required_claims default is
//     [] — configuration/decode_configuration.rb:58) and rejects exp <= now
//     (claims/expiration.rb:24, leeway 0). The port does not invent an exp
//     and does not add leeway.
//
// ONE DELIBERATE DIVERGENCE: async. Ruby's encode/decode are synchronous.
// This port is async because HMAC over the secret uses Web Crypto's
// `crypto.subtle` — the same runtime constraint, and the same deliberate
// choice, as session-token.ts and signin.ts (whose sha256Hex / sha1Hex are
// async for exactly this reason: the code must also run in workers, where
// node:crypto does not exist). Callers that need a token inline in a
// synchronous ViewFn cannot get one; the account views that would are named
// as the remaining gap in the NOT-PORTED block of
// src/card/mod-loader/mods/card-mod-account.ts.

import { constantTimeEqual } from "./session-token.js";

/** The JWT algorithm the gem's `JWT.encode payload, SECRET_KEY` selects:
 *  jwt.rb:35's default parameter. */
const ALGORITHM = "HS256";

/** Card.config.token_expiry — card-1.110.0/lib/cardio/railtie.rb:12
 *  `config.token_expiry = 2.days`. PORTED, not invented. */
export const DEFAULT_TOKEN_EXPIRY_SECONDS = 2 * 24 * 60 * 60;

/**
 * The decoded claims. Ruby's decode returns a HashWithIndifferentAccess
 * (token.rb:27); every access in the gem goes through a symbol
 * (`payload[:user_id]`, `payload[:anonymous]`) and the wire form is JSON,
 * whose members are always strings — so string keys are the faithful
 * representation and the accessors below cover both call sites.
 */
export type TokenClaims = Readonly<Record<string, unknown>>;

/** A claim value that can appear in a decoded payload. */
export type TokenClaimValue = string | number | boolean | null | TokenClaimValue[] | {
  [member: string]: TokenClaimValue;
};

/** The extra claims a caller merges over the defaults (token.rb:10's
 *  `extra_payload={}`). The account mod's only use is
 *  `{ anonymous: true }` (views.rb:2-4). */
export type ExtraTokenPayload = Readonly<Record<string, unknown>>;

/**
 * The token runtime's injected configuration — the seam the CSRF secret
 * established (WriteRouteContext.csrfSecret in src/server/write-routes.ts,
 * pinned by vm-staging-server.mjs from DECKO_CSRF_SECRET with a per-boot
 * random fallback). No default secret exists in this module; a caller that
 * forgets to supply one gets an error naming the missing field rather than a
 * token signed under a known key.
 */
export interface TokenRuntimeConfig {
  /** The HMAC key — Rails' `secret_key_base` in Ruby (token.rb:7). */
  readonly secret: string;
  /** Card.config.token_expiry in seconds; defaults to the railtie's 2 days. */
  readonly tokenExpirySeconds?: number;
  /** Epoch seconds. Defaults to the wall clock; tests pin it to the
   *  oracle's frozen instant so `expiration` reproduces captured bytes. */
  readonly now?: () => number;
}

/** Card::Error::PermissionDenied (token.rb:20 raises it with decode's error
 *  String as the message). */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

// --- the gem's error strings, verbatim --------------------------------------
// jwt-2.10.3 raise sites: claims/expiration.rb:24, claims/not_before.rb,
// encoded_token.rb:90, encoded_token.rb:136, decode.rb:58, decode.rb:109,
// decode.rb:23. Each is reproduced as a constant so the test can assert the
// byte identity and a future jwt upgrade shows up as a test diff.

/** decode.rb:23 — `raise JWT::DecodeError, 'Nil JSON web token'`. */
const NIL_TOKEN = "Nil JSON web token";
/** decode.rb:109 — `raise JWT::DecodeError, 'Not enough or too many segments'`. */
const SEGMENT_COUNT = "Not enough or too many segments";
/** encoded_token.rb:136 — `raise JWT::DecodeError, 'Invalid segment encoding'`
 *  (the parse of a header/payload segment that is not JSON). */
const SEGMENT_ENCODING = "Invalid segment encoding";
/** decode.rb:58 — `raise JWT::IncorrectAlgorithm, 'Expected a different algorithm'`
 *  (the header's alg is not in the allowed list, which defaults to ['HS256']). */
const WRONG_ALGORITHM = "Expected a different algorithm";
/** encoded_token.rb:90 — `raise JWT::VerificationError, 'Signature verification failed'`. */
const BAD_SIGNATURE = "Signature verification failed";
/** claims/expiration.rb:24 — `raise JWT::ExpiredSignature, 'Signature has expired'`. */
const EXPIRED = "Signature has expired";
/** claims/not_before.rb — the not-before claim is in the future. */
const NOT_BEFORE = "Signature nbf has not been reached";

/** The resolved, defaulted view of a {@link TokenRuntimeConfig}. */
function resolveConfig(config: TokenRuntimeConfig): {
  secret: string;
  expirySeconds: number;
  now: () => number;
} {
  if (typeof config?.secret !== "string" || config.secret.length === 0) {
    // jwt's Hmac#ensure_valid_key! raises 'HMAC key cannot be empty' (hmac.rb:40)
    // and 'HMAC key expected to be a String' (hmac.rb:39); the port refuses at
    // the config boundary so the error names the field the host forgot,
    // rather than surfacing a crypto-layer message.
    throw new TypeError(
      "TokenRuntimeConfig.secret is required: the Auth::Token HMAC key (token.rb:7 reads Rails' secret_key_base) was missing or empty",
    );
  }
  return {
    secret: config.secret,
    expirySeconds: config.tokenExpirySeconds ?? DEFAULT_TOKEN_EXPIRY_SECONDS,
    now: config.now ?? (() => Math.floor(Date.now() / 1000)),
  };
}

/** Card::Auth::Token.expiration (token.rb:32-34):
 *  `Card.config.token_expiry.from_now.to_i` — whole epoch seconds, truncated
 *  not rounded, exactly as Ruby's .to_i on a Time. */
export function tokenExpiration(config: TokenRuntimeConfig): number {
  const resolved = resolveConfig(config);
  return Math.trunc(resolved.now() + resolved.expirySeconds);
}

/** The claims Hash, in the member order token.rb:11 builds it:
 *  `{ user_id: user_id, exp: expiration }.merge(extra_payload)`. Insertion
 *  order is preserved because the payload segment's bytes depend on it.
 *
 *  A key already present keeps its ORIGINAL position when the extra payload
 *  overwrites it — that is what Ruby's Hash#merge does, and it is why an
 *  `{ user_id: 99 }` override does not move user_id behind exp. */
function buildPayload(
  userId: string | number,
  exp: number,
  extraPayload: ExtraTokenPayload,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { user_id: userId, exp };
  for (const [key, value] of Object.entries(extraPayload)) payload[key] = value;
  return payload;
}

/** The claim a view reads at token.rb:40 (`payload[:anonymous]`) and
 *  events.rb:67 (`result[:user_id]`). */
export function claimUserId(claims: TokenClaims): string | number | undefined {
  const value = claims?.user_id;
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** token.rb:40 `payload[:anonymous] ? Card::AnonymousID : payload[:user_id]`
 *  — the flag that makes signin resolve to the Anonymous card. */
export function claimAnonymous(claims: TokenClaims): boolean | undefined {
  const value = claims?.anonymous;
  return typeof value === "boolean" ? value : undefined;
}

// --- base64url (jwt/base64.rb), no padding ---------------------------------

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** base64url WITHOUT padding (jwt-2.10.3/lib/jwt/base64.rb) — the
 *  RFC 4648 §5 alphabet (`-` and `_`, not `+` and `/`) and no `=`, which is
 *  what makes the token safe to drop into a query parameter. */
function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64URL_ALPHABET[b0 >> 2];
    out += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += BASE64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** base64url decode. Returns null on a character outside the alphabet, which
 *  the caller turns into the gem's 'Invalid segment encoding' — the same
 *  outcome Ruby's JSON parse failure produces for a garbage segment. */
function base64UrlDecode(segment: string): Uint8Array | null {
  const clean = segment.replace(/=+$/, "");
  if (clean.length % 4 === 1) return null;
  const values: number[] = [];
  for (const char of clean) {
    const value = BASE64URL_ALPHABET.indexOf(char);
    if (value < 0) return null;
    values.push(value);
  }
  const bytes: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const v0 = values[i]!;
    const v1 = values[i + 1];
    const v2 = values[i + 2];
    const v3 = values[i + 3];
    // base64url carries no padding, so the trailing group is short: 4
    // characters are 3 bytes, 3 are 2, 2 are 1. Byte k of a group needs
    // character k+1 for its low bits, so byte1 requires v2 and byte2
    // requires v3 — reading an absent character as zero instead appends a
    // phantom byte, which is how the first cut of this function failed:
    // every segment whose base64url length was 2 (mod 4) decoded with a
    // trailing garbage byte, and every 32-byte signature came back 33.
    bytes.push((v0 << 2) | ((v1 ?? 0) >> 4));
    if (v2 === undefined) continue;
    bytes.push(((v1 & 0x0f) << 4) | (v2 >> 2));
    if (v3 === undefined) continue;
    bytes.push(((v2 & 0x03) << 6) | v3);
  }
  return new Uint8Array(bytes);
}

function decodeSegmentToText(segment: string): string | null {
  const bytes = base64UrlDecode(segment);
  if (bytes === null) return null;
  return bytesToBinaryString(bytes);
}

/** UTF-8 decode that tolerates the byte shapes a segment can carry. */
function utf8Decode(text: string): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff),
  );
}

// --- signing ---------------------------------------------------------------

async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
  return new Uint8Array(signature);
}

// --- encode ----------------------------------------------------------------

/**
 * Card::Auth::Token.encode (token.rb:10-14):
 * `payload = { user_id: user_id, exp: expiration }.merge(extra_payload);
 *  JWT.encode payload, SECRET_KEY`
 *
 * HS256, header `{"alg":"HS256"}`, unpadded base64url segments, joined by
 * dots. The returned string is what card-mod-account's `token_url` puts in
 * the link's `token` query parameter (views.rb:35-38).
 */
export async function encodeAuthToken(
  config: TokenRuntimeConfig,
  userId: string | number,
  extraPayload: ExtraTokenPayload = {},
): Promise<string> {
  const resolved = resolveConfig(config);
  const payload = buildPayload(userId, tokenExpiration(config), extraPayload);
  const encodedHeader = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: ALGORITHM })),
  );
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(resolved.secret, signingInput);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// --- decode ----------------------------------------------------------------

/** The claim checks the gem runs, in its order, over a decoded payload.
 *  claims/expiration.rb:24 rejects when `exp <= now - leeway` with leeway 0;
 *  the not-before claim is likewise a bare comparison. Both run only when
 *  the claim is present — jwt's required_claims default is [] */
function verifyClaims(
  claims: Record<string, unknown>,
  nowEpochSeconds: number,
): string | null {
  if (claims.exp !== undefined && claims.exp !== null) {
    // Ruby: `payload['exp'].to_i <= (Time.now.to_i - leeway)`. A non-numeric
    // exp stringifies to 0 and is therefore already expired; .to_i's
    // behavior for nil is 0 too, so both sides agree.
    const exp = Number(claims.exp) || 0;
    if (Math.trunc(exp) <= nowEpochSeconds) return EXPIRED;
  }
  if (claims.nbf !== undefined && claims.nbf !== null) {
    const nbf = Number(claims.nbf) || 0;
    if (Math.trunc(nbf) > nowEpochSeconds) return NOT_BEFORE;
  }
  return null;
}

/**
 * Card::Auth::Token.decode (token.rb:25-30): the claims Hash when the token
 * is valid, the error message String when it is not. It NEVER throws —
 * token.rb:28-29 rescues StandardError into `e.message`, and card-mod-
 * account's failure path reports that string to the user (events.rb:66-70),
 * so the messages below are the gem's bytes, not a paraphrase.
 *
 * THE ORDER OF THE FOUR CHECKS IS LOAD-BEARING, and it is the gem's, not a
 * convenience. `JWT::EncodedToken` memoizes `header` and `payload` as lazy
 * accessors (encoded_token.rb:52-54, :60-62) and `Decode#decode_segments`
 * touches them in a fixed order (decode.rb:31-40): the segment count, then
 * `verify_algo` (which parses the HEADER only), then `verify_signature`
 * (which signs the RAW `header.payload` strings and so never parses the
 * payload), and only then the claims verifier, which is the first code that
 * parses the payload. A port that parses both segments up front reports a
 * forger's broken payload as 'Invalid segment encoding' where Ruby reports
 * 'Signature verification failed' — the oracle's tampered-payload case
 * caught exactly that, and the difference is not cosmetic: the first
 * message tells an attacker which part of their forgery to fix.
 */
export async function decodeAuthToken(
  config: TokenRuntimeConfig,
  token: string | undefined | null,
): Promise<TokenClaims | string> {
  try {
    const resolved = resolveConfig(config);
    // decode.rb:23 — `raise JWT::DecodeError, 'Nil JSON web token' unless jwt`
    if (typeof token !== "string") return NIL_TOKEN;

    // decode.rb:107-111 validate_segment_count! — three segments is the norm;
    // two is tolerated ONLY when the header claims alg:none, and that check
    // (`none_algorithm?` -> `alg_in_header`) is what parses the header first.
    const segments = token.split(".");
    if (segments.length !== 3) {
      if (segments.length === 2) {
        // "aaa.bbb": the header parse is what fails, which is why the oracle
        // measured 'Invalid segment encoding' rather than the segment count.
        if (parseJsonSegment(segments[0]!) === null) return SEGMENT_ENCODING;
        return WRONG_ALGORITHM;
      }
      return SEGMENT_COUNT;
    }

    // 1. the header parse (encoded_token.rb:52-54, reached from verify_algo)
    const header = parseJsonSegment(segments[0]!);
    if (header === null) return SEGMENT_ENCODING;

    // 2. decode.rb:56-59 verify_algo. The ALLOWED algorithm is fixed at HS256
    // (the gem's decode default, configuration/decode_configuration.rb:57);
    // the header may not widen it, so alg:none and alg-confusion both fail
    // here rather than selecting a verifier.
    if (typeof header.alg !== "string" || header.alg !== ALGORITHM) {
      return WRONG_ALGORITHM;
    }

    // 3. decode.rb:61-67 verify_signature — a length-gated, constant-time
    // compare of the presented signature against the freshly computed one
    // (jwt/jwa/hmac.rb:26,76-77 SecurityUtils.secure_compare). This signs
    // the RAW segment strings; the payload is still an opaque blob here.
    const expected = await hmacSha256(resolved.secret, `${segments[0]}.${segments[1]}`);
    const presented = base64UrlDecode(segments[2]!);
    if (presented === null || !secureCompare(presented, expected)) {
      return BAD_SIGNATURE;
    }

    // 4. the payload parse (encoded_token.rb:60-62), reached only now — see
    // the ordering note above.
    const payload = parseJsonSegment(segments[1]!);
    if (payload === null) return SEGMENT_ENCODING;

    // decode.rb:37 — the claims verifier runs after the signature check, so
    // an expired-but-forged token reports the signature failure, never the
    // expiry.
    const claimFailure = verifyClaims(payload, resolved.now());
    if (claimFailure !== null) return claimFailure;

    return payload as TokenClaims;
  } catch (error) {
    // token.rb:28-29 — the rescue is total, so a missing secret comes back as
    // a message String rather than a thrown config error.
    return error instanceof Error ? error.message : String(error);
  }
}

/** Parse one base64url segment as JSON, or null when it is not JSON — the
 *  gem's encoded_token.rb:130-137 parse/parse rescue. */
function parseJsonSegment(segment: string): Record<string, unknown> | null {
  const text = decodeSegmentToText(segment);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(utf8Decode(text)) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** jwt's `SecurityUtils.secure_compare` (jwa/hmac.rb:76-77):
 *  `a.bytesize == b.bytesize && fixed_length_secure_compare(a, b)` — the
 *  length gate first, then the same constant-time byte walk the session
 *  layer already uses (session-token.ts constantTimeEqual), reused rather
 *  than re-derived so there is one comparator to audit. The length gate is
 *  not optional: constantTimeEqual zero-pads the shorter input, so without
 *  it a truncated signature would be compared against zeros. */
function secureCompare(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && constantTimeEqual(a, b);
}

// --- validate! -------------------------------------------------------------

/**
 * Card::Auth::Token.validate! (token.rb:18-23): decode, raise
 * `Card::Error::PermissionDenied` carrying decode's message when decode
 * returned a String, else return the claims.
 */
export async function validateAuthToken(
  config: TokenRuntimeConfig,
  token: string | undefined | null,
): Promise<TokenClaims> {
  const payload = await decodeAuthToken(config, token);
  if (typeof payload === "string") throw new PermissionDeniedError(payload);
  return payload;
}
