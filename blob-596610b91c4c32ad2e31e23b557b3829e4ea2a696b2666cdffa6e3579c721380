// INTEGRATION seam test: the auth layer must import standalone AND compose
// read-only with the writes stream (src/card/actions — the
// CardActionEngine surface with the session-scoped factory). No behavior
// coupling: this file only proves both modules LOAD and expose the shapes
// the server wiring consumes. The wiring itself is proven by the
// write-route suites, which import the same modules statically.

import { describe, expect, it } from "vitest";
import * as auth from "../../../src/card/auth/index.js";
import * as actions from "../../../src/card/actions/index.js";
import { createCardActionEngineForSession } from "../../../src/card/actions/engine-for-session.js";

describe("auth module surface (static import, typechecked)", () => {
  it("exposes the wiring seam the server consumes", () => {
    expect(auth.SessionStore).toBeTypeOf("function");
    expect(auth.actorBot).toBeTypeOf("function");
    expect(auth.actorAnonymous).toBeTypeOf("function");
    expect(auth.actorByCodename).toBeTypeOf("function");
    expect(auth.runAuthMigrations).toBeTypeOf("function");
    expect(auth.tokensEqual).toBeTypeOf("function");
    expect(auth.constantTimeEqual).toBeTypeOf("function");
    expect(auth.generateSessionToken).toBeTypeOf("function");
    expect(auth.sha256Hex).toBeTypeOf("function");
    expect(auth.DEFAULT_SESSION_TTL_SECONDS).toBeTypeOf("number");
    expect(auth.ANONYMOUS_CODENAME).toBe("anonymous");
    expect(auth.DECKOBOT_CODENAME).toBe("decko_bot");
  });
});

describe("writes module (src/card/actions) — read-only import", () => {
  it("loads and exposes the actor-taking write surface", () => {
    expect(actions.CardActionEngine).toBeTypeOf("function");
    expect(actions.CardActionError).toBeTypeOf("function");
    expect(actions.assertNameAvailable).toBeTypeOf("function");
    expect(actions.validateNameLegality).toBeTypeOf("function");
    expect(actions.resolveTypeId).toBeTypeOf("function");
    expect(actions.defaultTypeId).toBeTypeOf("function");
    expect(actions.assertNotOwnAncestor).toBeTypeOf("function");
    expect(createCardActionEngineForSession).toBeTypeOf("function");
  });
});
