// The read path's AUTHENTICATORS, measured against the PINNED GEM's own
// header grammar and the PINNED GEM's own token sign-in.
//
// The completeness register's B7 row (register-routes) grades the port
// PARTIAL: "write-path token auth is ported (src/server/write-routes.ts:863-877)
// but reads are cookie-session only, so a GET carrying `Authorization: Token ...`
// renders as Anonymous". The row's fix names the header grammar's source:
// "read the Token/Bearer header and X-API-Key on the read path, per
// card-mod-api_key-0.20.0/lib/card_controller/api_key.rb:4-13".
//
// fixtures/captured/request-authenticators-ruby-oracle.json is what
// oracle-capture-request-authenticators-ruby.rb (tests/server/) recorded by
// running the pinned gems' own methods:
//
//   - actionpack-7.2.4's Token module (http_authentication.rb:427, :487-495,
//     :502-508, :520-533) over fifteen header shapes, and
//   - card-1.110.0's Card::Auth::Token (auth/token.rb:11-41) over six
//     tokens, with the jwt gem (2.10.3) doing the signing.
//
// The tokens in the fixture are minted by the GEM, with the gem's own
// secret, so the port validates a real Ruby-signed JWT rather than one of
// its own making.
//
// WHAT THE MEASUREMENT SETTLES, ITEM BY ITEM:
//
//   1. THE GRAMMAR. Fifteen header shapes, fifteen answers, and the port
//      matches every one. The shapes that decide the behaviour are the
//      awkward ones: "Token " (the prefix with no value) carries NO token
//      at all, because Ruby's String#split drops the empty value of the
//      "token=" pair, so the session arm runs; "Token" (no space) and
//      "Basic ..." carry no token; the scheme is CASE-SENSITIVE, so
//      "token abc" carries no token; and a pair with a value
//      (`token="abc"`) carries that value with one layer of quotes
//      removed.
//
//   2. THE ORDER. The header token wins over the `token` query param, and
//      the param is the fallback (rest.rb:42).
//
//   3. THE SIGN-IN. A payload with a numeric user_id signs in as that
//      account; a payload with the anonymous claim is the one shape the
//      port CANNOT byte-match, because the pinned card gem never defines
//      Card::AnonymousID and its own method raises NameError there. That
//      divergence is named and pinned below, not papered over.
//
//   4. THE FAILURES. A tampered signature, an expired token, an empty
//      token and a token that is not a JWT are all denials, and the denial
//      carries the gem's own message: "Signature verification failed",
//      "Signature has expired", "Not enough or too many segments". A read
//      that presents one of those is a 403 in Ruby, not an anonymous read.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeAuthToken } from "../../src/card/auth/token.js";
import {
  actionpackTokenFromAuthorization,
  requestToken,
  resolveReadTokenAuth,
  signinFromToken,
} from "../../src/server/request-authenticators.js";

const ORACLE = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../fixtures/captured/request-authenticators-ruby-oracle.json",
    ),
    "utf8",
  ),
) as {
  gemset: string;
  anonymousConstantDefined: boolean;
  headerGrammar: Array<{ header: string; token: string | null; options: Record<string, string> | null }>;
  signin: Array<{
    label: string;
    outcome: string;
    errorClass?: string;
    errorMessage?: string;
    signinArgument: unknown;
  }>;
  validate: Array<{
    token: string;
    outcome: string;
    payload?: Record<string, unknown>;
    errorClass?: string;
    errorMessage?: string;
  }>;
};

/** The secret the capture minted its tokens with (the capture's own stub of
 *  Rails' secret_key_base, card-1.110.0/lib/card/auth/token.rb:7). The
 *  instant is pinned so the expiry verdicts do not depend on the clock. */
const TOKEN_CONFIG = {
  secret: "oracle-signing-secret-for-the-capture",
  now: () => 1_700_000_000,
};

const rubySignin = (label: string) => ORACLE.signin.find((row) => row.label === label)!;
const rubyValidate = (token: string) => ORACLE.validate.find((row) => row.token === token)!;

describe("the Authorization header grammar against the pinned actionpack", () => {
  it("every header shape the gem answers, the port answers the same", () => {
    expect(ORACLE.headerGrammar.length).toBe(15);
    for (const row of ORACLE.headerGrammar) {
      expect(actionpackTokenFromAuthorization(row.header), `header ${JSON.stringify(row.header)}`).toBe(row.token);
    }
  });

  it("a header with a value carries it, with one layer of quotes removed", () => {
    expect(actionpackTokenFromAuthorization('Token token="abc123"')).toBe("abc123");
    expect(actionpackTokenFromAuthorization('Token token="abc123", nonce="def"')).toBe("abc123");
    expect(actionpackTokenFromAuthorization("Token abc123, opt=1")).toBe("abc123");
    expect(actionpackTokenFromAuthorization("Token abc123; opt=1")).toBe("abc123");
    expect(actionpackTokenFromAuthorization("Token abc123\topt=1")).toBe("abc123");
  });

  it("a header with no value is no token at all: the session arm runs", () => {
    // The pair "token=" has no value in Ruby's split, so the token is nil.
    expect(actionpackTokenFromAuthorization("Token ")).toBeNull();
    expect(actionpackTokenFromAuthorization("Token")).toBeNull();
    expect(actionpackTokenFromAuthorization("Basic abc123")).toBeNull();
    // The scheme is case-sensitive.
    expect(actionpackTokenFromAuthorization("token abc123")).toBeNull();
    expect(actionpackTokenFromAuthorization("TOKEN abc123")).toBeNull();
  });

  it("the header token wins over the ?token= param, and the param is the fallback", () => {
    const params = new URLSearchParams("token=from-param");
    expect(requestToken({ authorization: "Token from-header" }, params)).toBe("from-header");
    expect(requestToken({}, params)).toBe("from-param");
    expect(requestToken({}, new URLSearchParams())).toBeNull();
    // A header that carries no token does not shadow the param.
    expect(requestToken({ authorization: "Basic nope" }, params)).toBe("from-param");
  });
});

describe("the token sign-in against the pinned card gem", () => {
  it("a valid payload signs in as the payload's user", async () => {
    const valid = ORACLE.validate.find((row) => row.outcome === "ok" && row.payload?.["user_id"] === 42)!;
    const signin = await signinFromToken(TOKEN_CONFIG, valid.token);
    expect(signin).toEqual({ kind: "actor", actorId: 42 });
    // The gem's own answer for the same token.
    const ruby = rubySignin("valid user_id");
    expect(ruby.outcome).toBe("signed_in");
    expect(ruby.signinArgument).toBe(42);
  });

  it("the anonymous claim is the gem's own NameError, and the port's answer is the intent", async () => {
    // The pinned card gem uses Card::AnonymousID (auth/token.rb:40) and
    // never defines it, so the gem's own method raises. The port cannot
    // byte-match a NameError; it answers the intent (the Anonymous card).
    expect(ORACLE.anonymousConstantDefined).toBe(false);
    const ruby = rubySignin("anonymous claim");
    expect(ruby.outcome).toBe("raised");
    expect(ruby.errorClass).toBe("NameError");
    expect(ruby.errorMessage).toContain("Card::AnonymousID");

    const anonymous = ORACLE.validate.find(
      (row) => row.outcome === "ok" && row.payload?.["anonymous"] === true,
    )!;
    expect(await signinFromToken(TOKEN_CONFIG, anonymous.token)).toEqual({ kind: "anonymous" });
  });

  it("a payload with no usable user_id signs in as the Anonymous card", async () => {
    // Ruby's signin resolves `Card.id(cardish) || AnonymousID`, so a
    // payload that names no account is the anonymous sign-in. The payload
    // is minted here with the port's own encoder because the gem's
    // encoder always writes a numeric user id.
    const bogus = await encodeAuthToken(TOKEN_CONFIG, 42, { user_id: "not-a-number" });
    expect(await signinFromToken(TOKEN_CONFIG, bogus)).toEqual({ kind: "anonymous" });
    // And a payload with no user id at all.
    const noUser = await encodeAuthToken(TOKEN_CONFIG, 42, { user_id: undefined });
    expect(await signinFromToken(TOKEN_CONFIG, noUser)).toEqual({ kind: "anonymous" });
  });

  it("a tampered, expired, empty or malformed token is a denial with the gem's own message", async () => {
    const cases: Array<[string, string]> = [
      ["tampered signature", "Signature verification failed"],
      ["expired", "Signature has expired"],
      ["empty token", "Not enough or too many segments"],
      ["not a jwt", "Not enough or too many segments"],
    ];
    for (const [label, message] of cases) {
      const ruby = rubySignin(label);
      expect(ruby.outcome, label).toBe("raised");
      expect(ruby.errorClass, label).toBe("Card::Error::PermissionDenied");
      expect(ruby.errorMessage, label).toBe(message);
    }

    // The port, on the very tokens the gem signed and broke.
    const tampered = ORACLE.validate.find((row) => row.errorMessage === "Signature verification failed")!;
    expect(await signinFromToken(TOKEN_CONFIG, tampered.token)).toEqual({
      kind: "denied",
      reason: "Signature verification failed",
    });
    const expired = ORACLE.validate.find((row) => row.errorMessage === "Signature has expired")!;
    expect(await signinFromToken(TOKEN_CONFIG, expired.token)).toEqual({
      kind: "denied",
      reason: "Signature has expired",
    });
    expect(await signinFromToken(TOKEN_CONFIG, "")).toEqual({
      kind: "denied",
      reason: "Not enough or too many segments",
    });
    expect(await signinFromToken(TOKEN_CONFIG, "not-a-jwt")).toEqual({
      kind: "denied",
      reason: "Not enough or too many segments",
    });
  });
});

describe("the read path's token arm", () => {
  it("a token resolves to its actor, and a broken token is a denial", async () => {
    const valid = ORACLE.validate.find((row) => row.outcome === "ok" && row.payload?.["user_id"] === 42)!;
    expect(
      await resolveReadTokenAuth({ authorization: `Token ${valid.token}` }, null, TOKEN_CONFIG),
    ).toEqual({ kind: "actor", actorId: 42 });
    expect(
      await resolveReadTokenAuth({ authorization: "Token not-a-jwt" }, null, TOKEN_CONFIG),
    ).toEqual({ kind: "denied", reason: "Not enough or too many segments" });
  });

  it("no token is absent, and a host with no signing secret cannot run the arm", async () => {
    expect(await resolveReadTokenAuth({}, null, TOKEN_CONFIG)).toEqual({ kind: "absent" });
    // A host without a secret cannot validate any token, so the token arm
    // does not run and the session arm answers.
    expect(
      await resolveReadTokenAuth({ authorization: "Token whatever" }, null, undefined),
    ).toEqual({ kind: "absent" });
  });

  it("NAMED REMAINDER: the write path keeps its own header grammar, and the two differ", () => {
    // The READ path's grammar is the PINNED actionpack's: the scheme is
    // case-SENSITIVE and the pairs split on the pinned delimiters
    // (comma, semicolon, tab). The WRITE path keeps its own:
    // /^(?:Token|Bearer)\s+(.*)$/i - case-INSENSITIVE, and no pair
    // delimiters at all (src/server/write-routes.ts:880).
    //
    // The two paths therefore differ on the same header, and the
    // difference is named rather than taken: the write path's grammar is
    // the one the write-path suites pin, and changing it is a change to
    // the write surface, not to this row's read arm.
    expect(actionpackTokenFromAuthorization("Token abc")).toBe("abc");
    // The read path refuses the lower-case scheme; the write path's
    // case-insensitive regex accepts it.
    expect(actionpackTokenFromAuthorization("token abc")).toBeNull();
    const write = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../src/server/write-routes.ts",
      ),
      "utf8",
    );
    expect(write).toContain("/^(?:Token|Bearer)\\s+(.*)$/i");
  });
});
