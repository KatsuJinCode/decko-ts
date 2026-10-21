// The Bunny edge READ path's authenticators: the Authorization header's
// Token/Bearer value, ahead of the session cookie.
//
// The completeness register's B7 row (register-routes) grades the port
// PARTIAL: "reads are cookie-session only, so a GET carrying
// `Authorization: Token ...` renders as Anonymous". Ruby's controller runs
// `authenticate` (decko-0.20.0/lib/card_controller/rest.rb:37-40) on every
// request, and `signin_with` (card-1.110.0/lib/card/auth/current.rb:50-63)
// takes the TOKEN authenticator first and the session second.
//
// The tokens here are the ones the PINNED GEM minted
// (fixtures/captured/request-authenticators-ruby-oracle.json, recorded by
// tests/server/oracle-capture-request-authenticators-ruby.rb), so the edge
// validates a real Ruby-signed JWT with the card gem's own secret, and the
// broken ones carry the gem's own failure messages.
//
// WHAT IS PROVEN, AND HOW FAR:
//
//   1. A valid Ruby-signed token signs the read in as the account the
//      payload names, and the edge's own viewer type carries it.
//   2. A token with the anonymous claim signs in as the Anonymous card.
//      The pinned card gem cannot even name that card (it raises NameError
//      on Card::AnonymousID, auth/token.rb:40), so this is the port's
//      answer to the intent, not a byte match, and it is pinned as such.
//   3. A token that does not validate is a DENIAL, with the gem's own
//      message: Ruby raises Card::Error::PermissionDenied
//      (auth/token.rb:18-23), which the controller's error handling
//      answers with 403. The edge's serve callback turns that denial into
//      the read path's 403 JSON (bunny-edge-engine-handler.ts).
//   4. The `token` query param is the fallback authenticator, and a
//      request with neither a token nor a cookie is still the anonymous
//      read it was before this row.
//
// WHAT IS NOT PROVEN HERE, STATED PLAINLY:
//
//   - The Bunny Edge Scripting runtime. The module under test
//     (bunny-edge-session-viewer.ts) is SDK-free BY CONSTRUCTION, so it
//     loads under vitest; the serve callback that calls it needs the
//     platform SDK and is type-checked, not executed, here.
//   - The 403 response body. The denial SHAPE is the edge's own
//     {error: "permission denied", reason} JSON; that the callback emits
//     it for a denial is the handler's one branch, pinned by reading it.
//
// DATA: synthetic. No real deck, no real account, no live service.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SessionStore } from "../../src/card/auth/session-store.js";
import { resolveViewerFromAuthenticators } from "../../deploy/bunny-worker-src/bunny-edge-session-viewer.js";
import { createRenderTestStorage } from "../card/render/render-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/request-authenticators-ruby-oracle.json"), "utf8"),
) as {
  headerGrammar: Array<{ header: string; token: string | null }>;
  signin: Array<{ label: string; outcome: string; errorMessage?: string }>;
  validate: Array<{
    token: string;
    outcome: string;
    payload?: Record<string, unknown>;
    errorMessage?: string;
  }>;
};

/** The secret the capture minted its tokens with, and a pinned instant so
 *  the expiry verdicts do not depend on the clock. */
const TOKEN_CONFIG = {
  secret: "oracle-signing-secret-for-the-capture",
  now: () => 1_700_000_000,
};

const validToken = ORACLE.validate.find(
  (row) => row.outcome === "ok" && row.payload?.["user_id"] === 42,
)!.token;
const anonymousToken = ORACLE.validate.find(
  (row) => row.outcome === "ok" && row.payload?.["anonymous"] === true,
)!.token;
const tamperedToken = ORACLE.validate.find(
  (row) => row.errorMessage === "Signature verification failed",
)!.token;
const expiredToken = ORACLE.validate.find(
  (row) => row.errorMessage === "Signature has expired",
)!.token;

const request = (pathname: string, headers: Record<string, string> = {}): Request =>
  new Request(`https://script-placeholder.bunny.run${pathname}`, { headers });

async function resolve(pathname: string, headers: Record<string, string> = {}) {
  const storage = await createRenderTestStorage();
  try {
    const sessions = new SessionStore({ driver: storage.fetcher.driver });
    return await resolveViewerFromAuthenticators(request(pathname, headers), sessions, TOKEN_CONFIG);
  } finally {
    storage.close();
  }
}

describe("the edge read path's token authenticator", () => {
  it("a Ruby-signed token signs the read in as the account the payload names", async () => {
    const auth = await resolve("/Some_Card", { authorization: `Token ${validToken}` });
    expect(auth).toEqual({ kind: "viewer", viewer: { signedIn: true, actorId: 42 } });
  });

  it("the Bearer scheme carries the same token", async () => {
    const auth = await resolve("/Some_Card", { authorization: `Bearer ${validToken}` });
    expect(auth).toEqual({ kind: "viewer", viewer: { signedIn: true, actorId: 42 } });
  });

  it("the ?token= param is the fallback authenticator", async () => {
    const auth = await resolve(`/Some_Card?token=${encodeURIComponent(validToken)}`);
    expect(auth).toEqual({ kind: "viewer", viewer: { signedIn: true, actorId: 42 } });
  });

  it("the anonymous claim signs in as the Anonymous card, the port's answer to the gem's NameError", async () => {
    // The pinned card gem raises NameError here (it uses
    // Card::AnonymousID and never defines it). The port answers the
    // intent, and the pin holds the difference in the open.
    expect(ORACLE.signin.find((row) => row.label === "anonymous claim")?.errorMessage).toContain(
      "Card::AnonymousID",
    );
    const auth = await resolve("/Some_Card", { authorization: `Token ${anonymousToken}` });
    expect(auth).toEqual({ kind: "viewer", viewer: { signedIn: false } });
  });

  it("a token that does not validate is a denial, with the gem's own message", async () => {
    expect(await resolve("/Some_Card", { authorization: `Token ${tamperedToken}` })).toEqual({
      kind: "denied",
      reason: "Signature verification failed",
    });
    expect(await resolve("/Some_Card", { authorization: `Token ${expiredToken}` })).toEqual({
      kind: "denied",
      reason: "Signature has expired",
    });
    expect(await resolve("/Some_Card", { authorization: "Token " })).toEqual({
      kind: "viewer",
      viewer: { signedIn: false },
    });
    expect(await resolve("/Some_Card", { authorization: "Token not-a-jwt" })).toEqual({
      kind: "denied",
      reason: "Not enough or too many segments",
    });
  });

  it("a request with no token and no cookie is still the anonymous read", async () => {
    expect(await resolve("/Some_Card")).toEqual({ kind: "viewer", viewer: { signedIn: false } });
  });

  it("a host with no signing secret cannot run the token arm, and the session answers", async () => {
    const storage = await createRenderTestStorage();
    try {
      const sessions = new SessionStore({ driver: storage.fetcher.driver });
      const auth = await resolveViewerFromAuthenticators(
        request("/Some_Card", { authorization: `Token ${validToken}` }),
        sessions,
        undefined,
      );
      expect(auth).toEqual({ kind: "viewer", viewer: { signedIn: false } });
    } finally {
      storage.close();
    }
  });
});
