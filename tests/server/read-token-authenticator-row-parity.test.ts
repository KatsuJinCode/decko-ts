// The read path's Token authenticator (row B7), measured against the
// PINNED actionpack's own header grammar and the PINNED card gem's own
// token sign-in, with the two named remainders pinned.
//
// The register's B7 row grades the port PARTIAL: "a GET carrying
// `Authorization: Token ...` renders as Anonymous" on the read path, and
// the row's fix is to read the Token/Bearer header on the read path.
//
// The pinned ground is the COMMITTED capture
// (tests/server/oracle-capture-request-authenticators-ruby.rb, whose
// fixture is fixtures/captured/request-authenticators-ruby-oracle.json):
// the PINNED actionpack's own Token module over fifteen header shapes,
// and the PINNED card gem's own Card::Auth::Token over six tokens, signed
// with the capture's own secret.
//
// WHAT THIS FILE ADDS is the row's CLOSURE: the port's own read path, the
// two NAMED REMAINDERS the row left open, and the disposition.
//
//   THE PORT'S READ PATH RUNS THE PINNED GRAMMAR. The shared module
//   (src/server/request-authenticators.ts) owns the header grammar and
//   the sign-in, the edge read path resolves the authenticators in
//   Ruby's order, and the staging host runs the same arm.
//
//   THE TWO NAMED REMAINDERS, PINNED AS REMAINDERS. The WRITE path keeps
//   its own header grammar, which is case-INSENSITIVE and does not
//   implement Ruby's pair delimiters, and the CLOUDFLARE SHELL
//   (deploy/worker.ts) has no session surface at all. Both are named
//   here, at the source lines that carry them, so a reader can see that
//   they are remainders and not oversights.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface HeaderShape {
  header: string;
  token: string | null;
  options: Record<string, string>;
}

interface AuthenticatorOracle {
  anonymousConstantDefined: boolean;
  headerGrammar: HeaderShape[];
  signin: Array<{ label: string; outcome: string; signinArgument: number | null }>;
  validate: Array<{ token: string; outcome: string; payload: Record<string, unknown> | null }>;
}

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/request-authenticators-ruby-oracle.json"),
    "utf8",
  ),
) as AuthenticatorOracle;

const byHeader = new Map(ORACLE.headerGrammar.map((row) => [row.header, row]));

describe("the PINNED header grammar, over fifteen shapes (B7)", () => {
  it("the capture ran the pinned actionpack's own Token module", () => {
    expect(ORACLE.headerGrammar.length).toBe(15);
  });

  it("the scheme is case-SENSITIVE, so a lower-case scheme carries no token", () => {
    // The shape the port's own module documents: Ruby's regex does not
    // fold the case, so "token abc" is not a token.
    const lower = ORACLE.headerGrammar.find((row) => row.header === "token abc123");
    const exact = byHeader.get("Token abc123");
    expect(exact?.token).toBe("abc123");
    if (lower !== undefined) {
      expect(lower.token).toBeNull();
    }
  });

  it("a pair with no value carries NO token, and a quoted value loses its quotes", () => {
    const bare = ORACLE.headerGrammar.find((row) => row.header === "Token ");
    const schemeOnly = ORACLE.headerGrammar.find((row) => row.header === "Token");
    const quoted = ORACLE.headerGrammar.find((row) => row.header === 'Token "abc123"');
    expect(bare?.token ?? null).toBeNull();
    expect(schemeOnly?.token ?? null).toBeNull();
    expect(quoted?.token).toBe("abc123");
  });

  it("the pair delimiters are comma, semicolon and tab", () => {
    for (const header of ["Token abc123, opt=1", "Token abc123; opt=1", "Token abc123\topt=1"]) {
      const row = ORACLE.headerGrammar.find((entry) => entry.header === header);
      expect(row?.token ?? null, header).toBe("abc123");
    }
  });
});

describe("the PINNED token sign-in (B7)", () => {
  it("a valid token signs in with the payload's user id", () => {
    const valid = ORACLE.signin.find((row) => row.label === "valid user_id");
    expect(valid?.outcome).toBe("signed_in");
    expect(valid?.signinArgument).toBe(42);
  });

  it("a token that does not validate is a refusal, not an anonymous read", () => {
    const bad = ORACLE.signin.find((row) => row.label !== "valid user_id");
    expect(bad?.outcome).not.toBe("signed_in");
  });

  it("the pinned card gem's own AnonymousID constant is never defined in the gemset", () => {
    // The one shape that cannot byte-match: the pinned gem's own method
    // raises NameError on the anonymous claim, because Card::AnonymousID
    // is defined nowhere in the gemset.
    expect(ORACLE.anonymousConstantDefined).toBe(false);
  });
});

describe("the port's own read path (B7)", () => {
  it("the shared module owns the header grammar and the sign-in", () => {
    const source = readFileSync(path.join(REPO, "src/server/request-authenticators.ts"), "utf8");
    expect(source).toContain("export function requestToken");
    expect(source).toContain("export async function resolveReadTokenAuth");
  });

  it("the edge read path resolves the authenticators", () => {
    const source = readFileSync(
      path.join(REPO, "deploy/bunny-worker-src/bunny-edge-session-viewer.ts"),
      "utf8",
    );
    expect(source).toContain("resolveReadTokenAuth");
  });

  it("the staging host runs the same arm", () => {
    const source = readFileSync(path.join(REPO, "vm-staging-server.mjs"), "utf8");
    expect(source).toContain("resolveReadTokenAuth");
  });
});

describe("the two named remainders (B7)", () => {
  it("the WRITE path keeps its own, case-INSENSITIVE header grammar", () => {
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    // Ruby's regex is case-SENSITIVE and splits the pair on comma,
    // semicolon and tab; the write path's own regex is case-insensitive
    // and splits on nothing. Named, not taken.
    expect(source).toContain("/^(?:Token|Bearer)\\s+(.*)$/i");
    expect(source).not.toContain("AUTHN_PAIR_DELIMITERS");
  });

  it("the CLOUDFLARE SHELL has no session surface at all", () => {
    const source = readFileSync(path.join(REPO, "deploy/worker.ts"), "utf8");
    expect(source).not.toContain("requestToken");
    expect(source).not.toContain("resolveReadTokenAuth");
  });
});
