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
    // ROUND SEVEN (register-routes C17) LANDED THE api_key ARM, and the
    // hosts now call the WHOLE authenticator ORDER (the token arm, then
    // the api_key arm, then the session) instead of the token arm alone.
    // The token arm itself is unchanged and is still the module's own
    // function, so this row's pin moves to the order and keeps naming the
    // arm it is about.
    expect(source).toContain("resolveReadAuthenticators");
    const shared = readFileSync(
      path.join(REPO, "src/server/request-authenticators.ts"),
      "utf8",
    );
    expect(shared).toContain("export async function resolveReadTokenAuth(");
    // The order runs the token arm first, so a request that carries a
    // token never reaches the api_key arm.
    expect(shared).toContain("const tokenAuth = await resolveReadTokenAuth(");
  });

  it("the staging host runs the same arm", () => {
    const source = readFileSync(path.join(REPO, "vm-staging-server.mjs"), "utf8");
    // The same move as the edge's: the host resolves the WHOLE order now.
    expect(source).toContain("resolveReadAuthenticators");
  });
});

describe("the two named remainders (B7)", () => {
  it("CLOSED: the WRITE path reads the PINNED, case-SENSITIVE header grammar", () => {
    const source = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    // Ruby's regex is case-SENSITIVE and splits the pair on comma,
    // semicolon and tab. The write path used to keep a grammar of its
    // own - case-INSENSITIVE, splitting on nothing - and this pin held
    // that difference on the record. The write path now reads the shared
    // pinned grammar (actionpackTokenFromAuthorization), so the two paths
    // answer the same header the same way; this pin changes on purpose
    // with the landing.
    expect(source).toContain(
      'import { actionpackTokenFromAuthorization } from "./request-authenticators.js"',
    );
    expect(source).not.toContain("/^(?:Token|Bearer)\\s+(.*)$/i");
    // The pair delimiters live in the shared module now, and the write
    // path reaches them through it.
    const shared = readFileSync(path.join(REPO, "src/server/request-authenticators.ts"), "utf8");
    expect(shared).toContain("AUTHN_PAIR_DELIMITERS");
  });

  it("the CLOUDFLARE SHELL has no session surface at all", () => {
    const source = readFileSync(path.join(REPO, "deploy/worker.ts"), "utf8");
    expect(source).not.toContain("requestToken");
    expect(source).not.toContain("resolveReadTokenAuth");
  });
});
