// src/server/request-authenticators.ts - the AUTHENTICATORS a request
// carries, in Ruby's order, and the sign-in a Token header buys.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS
// ---------------------------------------------------------------------------
//   Ruby's controller runs one before_action on EVERY request, reads or
//   write:
//
//     # decko-0.20.0/lib/card_controller/rest.rb:37-40
//     def authenticate
//       Card::Auth.signin_with(**authenticators)
//     end
//
//     # rest.rb:41-47
//     def authenticators
//       request ? { token: token_from_header || params[:token] } : {}
//     end
//
//     # rest.rb:48-50
//     def token_from_header
//       token_and_options(request)&.first
//     end
//
//   `signin_with` (card-1.110.0/lib/card/auth/current.rb:50-63) is an
//   ORDER, not a lookup:
//
//     if opts[:token] then signin_with_token(opts[:token])
//     else signin_with_session end
//
//   so the header token (or the ?token= param) wins over the session
//   cookie, and a token that does not validate is a 403, not an anonymous
//   read (auth/token.rb:38-41: `Token.validate!` raises
//   Card::Error::PermissionDenied carrying decode's message).
//
//   This module owns the two halves of that order a HOST can call without
//   a Rails request object:
//
//   1. `actionpackTokenFromAuthorization` - the header grammar, transcribed
//      from actionpack-7.2.4/lib/action_controller/metal/http_authentication.rb
//      (TOKEN_REGEX :427, raw_params :520-533, params_array_from :502-504,
//      rewrite_param_values :506-508). The port's WRITE path has its own
//      copy of a simplified grammar (write-routes.ts:863-877): that copy is
//      case-INSENSITIVE and does not implement the pair delimiters, so the
//      two paths differ. This row is the READ path, so the write path's
//      grammar is left exactly as it is and the difference is named in the
//      row's commit message.
//
//   2. `signinFromToken` - `signin_with_token` (auth/token.rb:38-41):
//      validate the JWT, then sign in as the Anonymous card when the
//      payload says so, else as the payload's user.
//
// ---------------------------------------------------------------------------
// WHY A HEADER WITH NO VALUE IS NO TOKEN AT ALL
// ---------------------------------------------------------------------------
//   The deck does NOT use actionpack's `authenticate` helper, which skips
//   a blank token (`unless token.blank?`, http_authentication.rb:470). It
//   calls `token_and_options(request)&.first` itself, and that method's
//   first element is the first pair's VALUE
//   (http_authentication.rb:492: `[params.shift[1], ...]`). A pair that
//   carries no value - the header "Token " (the prefix with nothing after
//   it) parses to the pair "token=", and Ruby's String#split drops the
//   trailing empty field - therefore yields NIL, and a nil token is no
//   token: the session arm runs, exactly as if the header were absent.
//   A pair that IS present but empty (`token=""`) yields the empty string,
//   which is TRUTHY in Ruby, so the token arm runs and validating "" fails
//   with "Not enough or too many segments" (jwt's segment count) - a 403,
//   not a fallback. The port keeps both halves.
//
// ---------------------------------------------------------------------------
// THE api_key HALF, AND WHERE IT SITS IN THE ORDER
// ---------------------------------------------------------------------------
//   The api_key half of the authenticators (the X-API-Key header) is the
//   api_key gem's own mixin. ROUND SEVEN LANDED IT: the request's api_key
//   is read by `requestApiKey` in this file, and the sign-in it buys is the
//   api_key arm of `signin_with` (resolveReadAuthenticators below, over
//   the card-side lookup in src/card/auth/api-key-lookup.ts).
//
//   The ORDER is an order, not a lookup (card-mod-api_key-0.20.0/lib/
//   card/auth/api_key.rb:7-15):
//
//     if token then signin_with_token token
//     elsif api_key then signin_with_api_key api_key
//     else signin_with_session end
//
//   so the token arm runs first and a request that carries BOTH a token
//   and an api key takes the TOKEN arm; the api_key arm runs only when
//   there is no token; and with neither, the session arm runs.
//
//   The write path's use of the same header is NOT Ruby's JWT semantics:
//   the port's write path treats the header value as a SESSION token
//   (write-routes.ts:1541, :1830 hand it to SessionStore.lookupSession).
//   Ruby's header token is a JWT. That divergence belongs to the write
//   rows, not to this read-side module, and it is named in the row's
//   commit message.

import {
  PermissionDeniedError,
  claimAnonymous,
  claimUserId,
  validateAuthToken,
  type TokenRuntimeConfig,
} from "../card/auth/token.js";

/** actionpack http_authentication.rb:427 `TOKEN_REGEX = /^(Token|Bearer)\s+/`.
 *  The header must start with the scheme and at least one space. */
const TOKEN_REGEX = /^(Token|Bearer)\s+/;

/** http_authentication.rb:426 `TOKEN_KEY = "token="`. */
const TOKEN_KEY = "token=";

/** http_authentication.rb:428 `AUTHN_PAIR_DELIMITERS = /(?:,|;|\t)/`. */
const AUTHN_PAIR_DELIMITERS = /(?:,|;|\t)/;

/**
 * The token an Authorization header carries, or null when the header
 * carries none.
 *
 * Transcribed from actionpack-7.2.4
 * lib/action_controller/metal/http_authentication.rb:
 *
 *   - `token_and_options` (:487-495): the header must match TOKEN_REGEX,
 *     or there is no token at all;
 *   - `raw_params` (:520-533): the prefix is stripped, the rest is split
 *     on the pair delimiters, each part is stripped, empty parts are
 *     dropped, and a first part that does not already start with
 *     "token=" gets that prefix;
 *   - `params_array_from` (:502-504) and `rewrite_param_values` (:506-508):
 *     each part splits on the first "=" and one layer of surrounding
 *     double quotes is removed from the value.
 *
 * The FIRST pair's value is the token (the rest are the options, which the
 * deck's authenticators ignore).
 */
export function actionpackTokenFromAuthorization(
  authorization: string | undefined | null,
): string | null {
  if (typeof authorization !== "string" || !TOKEN_REGEX.test(authorization)) return null;
  const raw = authorization
    .replace(TOKEN_REGEX, "")
    .split(AUTHN_PAIR_DELIMITERS)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  // raw_params:520-527 - a first part that does not already carry the
  // "token=" prefix gets one.
  const first = raw[0] === undefined || !raw[0].startsWith(TOKEN_KEY)
    ? `${TOKEN_KEY}${raw[0] ?? ""}`
    : raw[0];
  // params_array_from:502-504 splits the pair on the FIRST "=" and Ruby's
  // String#split DROPS a trailing empty field, so a pair that is exactly
  // "token=" has no value at all: the token is nil, not "".
  const equals = first.indexOf("=");
  if (equals === -1) return null;
  const rawValue = first.slice(equals + 1);
  if (rawValue === "") return null;
  // rewrite_param_values:506-508 removes one layer of surrounding quotes.
  return rawValue.replace(/^"|"$/g, "");
}

/** The request headers a host reads, in the shape both hosts already use
 *  (a lower-cased record; a Fetch Request's `headers.get` answers null for
 *  an absent header, so null is accepted here too). */
export interface AuthenticatorHeaders {
  readonly authorization?: string | null | undefined;
  readonly [key: string]: string | null | undefined;
}

/**
 * The request's token authenticator, in Ruby's order: the header first,
 * then the `token` query parameter (rest.rb:42).
 *
 * The header wins even when it carries the EMPTY string, because Ruby
 * treats "" as truthy; the port keeps that (see the file header).
 */
export function requestToken(
  headers: AuthenticatorHeaders,
  searchParams?: URLSearchParams | null,
): string | null {
  const fromHeader = actionpackTokenFromAuthorization(headers.authorization);
  if (fromHeader !== null) return fromHeader;
  const fromParam = searchParams?.get("token");
  return fromParam === null || fromParam === undefined ? null : fromParam;
}

/**
 * The request's api_key authenticator, in Ruby's order: the X-API-Key
 * HEADER first, then the `api_key` query parameter.
 *
 * The pinned reader (card-mod-api_key-0.20.0/lib/card_controller/api_key.rb:
 * 4-12) is `super.merge api_key: api_key_from_header || params[:api_key]`,
 * with `api_key_from_header` = `request.headers["X-API-Key"]`.
 *
 * THE HEADER WINS EVEN WHEN IT IS EMPTY. Ruby's `||` treats "" as truthy,
 * so an X-API-Key header that carries nothing at all is still the
 * authenticator, and the api_key arm then runs with the empty key (which
 * names no account, and is the refusal). The port keeps that.
 *
 * The header is read in lower case, the way this module reads the
 * Authorization header and the way every host presents headers: the
 * Node host's `req.headers` is already lower-cased, and a Fetch Request's
 * `headers.get` is case-insensitive.
 */
export function requestApiKey(
  headers: AuthenticatorHeaders,
  searchParams?: URLSearchParams | null,
): string | null {
  const fromHeader = headers["x-api-key"];
  if (typeof fromHeader === "string") return fromHeader;
  const fromParam = searchParams?.get("api_key");
  return fromParam === null || fromParam === undefined ? null : fromParam;
}

/** What a token authenticates as. */
export type TokenSignin =
  /** The payload names a user: sign in as that account (token.rb:40). */
  | { readonly kind: "actor"; readonly actorId: number }
  /** The payload says anonymous, or names no user: sign in as the
   *  Anonymous card (token.rb:40, current.rb:37-40). */
  | { readonly kind: "anonymous" }
  /** The token does not validate: Ruby raises Card::Error::PermissionDenied
   *  carrying decode's message (token.rb:18-23). */
  | { readonly kind: "denied"; readonly reason: string };

/**
 * `Card::Auth.signin_with_token` (card-1.110.0/lib/card/auth/token.rb:38-41):
 *
 *     payload = Token.validate! token
 *     signin payload[:anonymous] ? Card::AnonymousID : payload[:user_id]
 *
 * and `signin` (current.rb:37-40) resolves the id: `user_id = Card.id(cardish)
 * || AnonymousID`, then `current_id=` coerces a present id with `to_i`.
 * So:
 *
 *   - a payload with `anonymous` set signs in as the Anonymous card;
 *   - a payload with a numeric `user_id` signs in as that account;
 *   - a payload with no usable `user_id` signs in as the Anonymous card
 *     (Card.id of a non-card is nil);
 *   - a token that does not validate is a denial carrying the decode
 *     message, never an anonymous read.
 */
export async function signinFromToken(
  config: TokenRuntimeConfig,
  token: string,
): Promise<TokenSignin> {
  let claims;
  try {
    claims = await validateAuthToken(config, token);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { kind: "denied", reason: error.message };
    }
    throw error;
  }
  if (claimAnonymous(claims) === true) return { kind: "anonymous" };
  const userId = claimUserId(claims);
  if (userId === undefined) return { kind: "anonymous" };
  const actorId = typeof userId === "number" ? userId : Number.parseInt(userId, 10);
  if (!Number.isFinite(actorId)) return { kind: "anonymous" };
  return { kind: "actor", actorId };
}

/** What the read path's token arm resolved to. */
export type ReadTokenAuth =
  /** No token was presented, or the token arm is not armed on this host
   *  (no signing secret configured): the session arm runs. */
  | { readonly kind: "absent" }
  /** The token signed in as the Anonymous card. */
  | { readonly kind: "anonymous" }
  /** The token signed in as an account. */
  | { readonly kind: "actor"; readonly actorId: number }
  /** The token did not validate: Ruby answers 403 (token.rb:18-23). */
  | { readonly kind: "denied"; readonly reason: string };

/**
 * The read path's token arm, in Ruby's order: the token authenticator
 * first, the session second.
 *
 * `tokenConfig` is the host's signing secret (Ruby's
 * `Rails.application.credentials.secret_key_base`, read by the card gem at
 * token.rb:7). A host with no secret configured cannot validate ANY token,
 * so the token arm is not armed there and the request falls through to the
 * session: the host's own configuration decides, and the state is named in
 * the answer ("absent") so a caller can tell it from "no token presented".
 */
export async function resolveReadTokenAuth(
  headers: AuthenticatorHeaders,
  searchParams: URLSearchParams | null | undefined,
  tokenConfig: TokenRuntimeConfig | undefined,
): Promise<ReadTokenAuth> {
  const token = requestToken(headers, searchParams);
  if (token === null) return { kind: "absent" };
  if (tokenConfig === undefined) return { kind: "absent" };
  const signin = await signinFromToken(tokenConfig, token);
  if (signin.kind === "denied") return { kind: "denied", reason: signin.reason };
  if (signin.kind === "anonymous") return { kind: "anonymous" };
  return { kind: "actor", actorId: signin.actorId };
}

/** The api_key arm's own resolver: the card-side lookup and the refusal
 *  it answers. A host supplies the one it owns (the port's own card-side
 *  lookup is src/card/auth/api-key-lookup.ts's signinFromApiKey). */
export type ApiKeyAuthenticator = (apiKey: string) => Promise<
  { readonly kind: "actor"; readonly actorId: number } | { readonly kind: "denied"; readonly reason: string }
>;

/** What the read path's whole authenticator order resolved to. */
export type ReadAuth =
  /** No token and no api key were presented: the session arm runs. */
  | { readonly kind: "absent" }
  /** The token signed in as the Anonymous card. */
  | { readonly kind: "anonymous" }
  /** The token or the api key signed in as an account. */
  | { readonly kind: "actor"; readonly actorId: number }
  /** The token or the api key did not validate: Ruby answers 403
   *  (auth/token.rb:18-23 for the token, the api_key gem's own
   *  "API key authentication failed" for the api key). */
  | { readonly kind: "denied"; readonly reason: string };

/**
 * The read path's WHOLE authenticator order, in Ruby's order: the token
 * first, then the api_key, then the session.
 *
 * `resolveReadTokenAuth` is the token arm alone (row B7's function, kept as
 * it is so its own pins stand); this function is the order the controller
 * runs (rest.rb:37-47's `Card::Auth.signin_with(**authenticators)`), with
 * the api_key arm between the token and the session.
 *
 * A request that carries a token takes the TOKEN arm whatever else it
 * carries, so the api_key arm never sees it. A request that carries an
 * api key and no token takes the api_key arm. A request with neither is
 * "absent", and the caller answers it from the session cookie.
 *
 * `apiKeyAuthenticator` is undefined on a host with no api_key arm (no
 * card-side lookup to run): the api key is then not consulted at all, and
 * the session arm answers, which is what the arm did before this row.
 */
export async function resolveReadAuthenticators(
  headers: AuthenticatorHeaders,
  searchParams: URLSearchParams | null | undefined,
  tokenConfig: TokenRuntimeConfig | undefined,
  apiKeyAuthenticator?: ApiKeyAuthenticator,
): Promise<ReadAuth> {
  const tokenAuth = await resolveReadTokenAuth(headers, searchParams, tokenConfig);
  if (tokenAuth.kind !== "absent") return tokenAuth;
  if (apiKeyAuthenticator === undefined) return { kind: "absent" };
  const apiKey = requestApiKey(headers, searchParams);
  if (apiKey === null) return { kind: "absent" };
  const signin = await apiKeyAuthenticator(apiKey);
  if (signin.kind === "denied") return { kind: "denied", reason: signin.reason };
  return { kind: "actor", actorId: signin.actorId };
}
