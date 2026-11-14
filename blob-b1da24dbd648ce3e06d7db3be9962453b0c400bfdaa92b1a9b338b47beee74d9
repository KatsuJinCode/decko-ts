import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM harness module without types
import { classifyWriteRequest, decideWrite, resolveLiveWalkProfile } from "../../reference-harness/browser/lib/live-walk-profile.mjs";

// The live-walk write gate, and the session carve-out it used to carry.
//
// WHAT CHANGED, AND WHY IT MATTERS. The gate decided whether a request may
// reach the target from the card's NAME alone: a request whose target card
// was called "signin", "*signin", "account" or "*account" skipped the check
// whatever the request actually was. Three requests that the smell
// probe (docs/runs/smell-row-conversion-r5b-2026-10-24/
// smell-prove-host-override-read-admission/RECEIPT.md) drove at an owned
// local server reached that server in read-only mode:
//
//   POST /update/account            (a card write on a session-ish name)
//   POST /card/create               (card[name]=*signin: a create)
//   GET  /delete/OwnedCard          (a GET on a mutation route)
//
// The gate now asks the REQUEST: the verb the engine's own route table gives
// it (after the engine's own method override), and the card it names. The
// engine's session arms (src/server/write-routes.ts) are the update verb on
// the *signin card (the login action) and the delete verb on it (the logout
// action); everything else on that card, and every card that merely carries
// a session-ish NAME, is an ordinary card write.
//
// The gate's table is the ENGINE's, not the port's: the port keeps the
// engine's GET alternatives to the create and delete actions off its own
// plain-link surface (its recorded hardening), but this gate stands in front
// of an engine this repository does not control, where a plain GET on
// /delete/<mark> is a delete.

const overrideEngine = { name: "write-gate-proof", mode: "host-override" } as const;
const target = "https://owned-proof.invalid";

const readOnly = () =>
  resolveLiveWalkProfile({
    args: { "base-url": target, "write-mode": "read-only" },
    env: {},
    engine: overrideEngine,
  });

const full = () =>
  resolveLiveWalkProfile({
    args: { "base-url": target, "write-mode": "full" },
    env: {},
    engine: overrideEngine,
  });

/** The gate's own answer for one request, as the two gate layers ask it. */
const gate = (method: string, url: string, body: string | null = null) => {
  const verdict = classifyWriteRequest(method, url, body);
  if (!verdict.write) return { verdict, decision: { allowed: true, reason: "not a write-path request" } };
  return { verdict, decision: decideWrite(readOnly(), verdict) };
};

describe("the session carve-out is a request, not a card name", () => {
  it("admits the engine's own session arms", () => {
    // The sign-in: the form posts to /update/*signin (the captured form
    // grammar carries _method=patch; src/server/write-routes.ts: the update
    // arm on the *signin mark dispatches the sign-in).
    const signin = gate("POST", `${target}/update/*signin`, "card%5Bsubcards%5D%5B%2B%2Aemail%5D%5Bcontent%5D=owner%40example.com");
    expect(signin.decision.allowed).toBe(true);
    expect(signin.verdict.verb).toBe("update");
    expect(signin.verdict.cardName).toBe("*signin");

    // The sign-in with the form's own _method=patch: the same request, read
    // through the engine's method override.
    const signinPatched = gate("POST", `${target}/update/*signin`, "_method=patch&card%5Bsubcards%5D%5B%2B%2Aemail%5D%5Bcontent%5D=owner%40example.com");
    expect(signinPatched.decision.allowed).toBe(true);
    expect(signinPatched.verdict.method).toBe("PATCH");

    // The sign-out: the delete verb on the same card, and the navbar's
    // GET /delete/*signin link (the delete action on the *signin card).
    expect(gate("DELETE", `${target}/delete/*signin`).decision.allowed).toBe(true);
    expect(gate("GET", `${target}/delete/*signin`).decision.allowed).toBe(true);
  });

  it("refuses a write that merely NAMES a session-ish card", () => {
    // The three requests the smell probe measured reaching the owned server.
    const account = gate("POST", `${target}/update/account`, "card%5Bcontent%5D=owned");
    expect(account.decision.allowed).toBe(false);
    expect(account.verdict.verb).toBe("update");

    const create = gate("POST", `${target}/card/create`, "card%5Bname%5D=%2Asignin");
    expect(create.decision.allowed).toBe(false);
    expect(create.verdict.verb).toBe("create");

    const getDelete = gate("GET", `${target}/delete/OwnedCard`);
    expect(getDelete.decision.allowed).toBe(false);
    expect(getDelete.verdict.verb).toBe("delete");
  });

  it("refuses every other verb on the session card", () => {
    // A create of a card named *signin is a card write: the engine's session
    // arms are the update and delete verbs on that card and no others.
    expect(gate("POST", `${target}/`, "card%5Bname%5D=%2Asignin").decision.allowed).toBe(false);
    // The single-segment update route: a card named "signin" is not the
    // session card, so this one is a card write.
    expect(gate("PUT", `${target}/signin`).decision.allowed).toBe(false);
    // The GET update alternative is a first-class write route: a card named
    // "signin" is not the session card, so this one is a card write.
    expect(gate("GET", `${target}/update/signin`).decision.allowed).toBe(false);
  });

  it("never admits on a name alone", () => {
    // The check-level gate (assertCardWrite) has no request. A card name
    // alone opens nothing.
    expect(decideWrite(readOnly(), { verb: "update", cardName: "*signin", detail: null }).allowed).toBe(false);
    expect(decideWrite(readOnly(), { verb: "update", cardName: "signin", detail: null }).allowed).toBe(false);
    expect(decideWrite(readOnly(), { verb: "update", cardName: "*account", detail: null }).allowed).toBe(false);
    expect(decideWrite(readOnly(), { verb: "update", cardName: "account", detail: null }).allowed).toBe(false);
  });
});

describe("the gate's table is the engine's", () => {
  it("refuses the engine's GET alternatives to the create and delete actions", () => {
    // engine_routes.rb:41-44 gives GET to those actions; the port keeps
    // them off its plain-link surface, but the gate stands in front of an
    // engine this repository does not control.
    expect(gate("GET", `${target}/create/OwnedCard`).verdict.verb).toBe("create");
    expect(gate("GET", `${target}/create/OwnedCard`).decision.allowed).toBe(false);
    expect(gate("GET", `${target}/card/delete/OwnedCard`).decision.allowed).toBe(false);
    // A bare "/delete" is a card literally named that word (the table's own
    // note), not the delete action: a read, and the gate leaves it alone.
    expect(classifyWriteRequest("GET", `${target}/delete`).write).toBe(false);
  });

  it("asks the table about the verb the request really carries", () => {
    // Rack's MethodOverride, as the engine applies it before the table.
    const overridden = classifyWriteRequest("POST", `${target}/update/OwnedCard`, "_method=patch");
    expect(overridden.method).toBe("PATCH");
    expect(overridden.verb).toBe("update");
    const plain = classifyWriteRequest("POST", `${target}/update/OwnedCard`, "card%5Bcontent%5D=owned");
    expect(plain.method).toBe("POST");
    expect(plain.verb).toBe("update");
    // The delete arm: the sign-out form's own shape (POST with the
    // _method=delete field) is the delete verb for the table.
    const deleted = classifyWriteRequest("POST", `${target}/delete/*signin`, "_method=delete");
    expect(deleted.method).toBe("DELETE");
    expect(deleted.verb).toBe("delete");
    expect(deleted.cardName).toBe("*signin");
  });

  it("leaves the owner pages alone", () => {
    // A session-marked card's own page is a read: it is not a write-path
    // request, so the gate never sees it, and it renders for its owner.
    for (const path of ["/signin", "/account", "/*signin", "/read.json", "/"]) {
      expect(classifyWriteRequest("GET", `${target}${path}`).write, path).toBe(false);
    }
  });
});

describe("full mode is the falsification", () => {
  it("admits what read-only refuses, so the refusals mean something", () => {
    const profile = full();
    for (const [method, url, body] of [
      ["POST", `${target}/update/account`, "card%5Bcontent%5D=owned"],
      ["POST", `${target}/card/create`, "card%5Bname%5D=%2Asignin"],
      ["GET", `${target}/delete/OwnedCard`, null],
    ] as const) {
      const verdict = classifyWriteRequest(method, url, body);
      expect(verdict.write).toBe(true);
      expect(decideWrite(profile, verdict).allowed, `${method} ${url}`).toBe(true);
    }
  });
});
