// The read path's api_key authenticator, measured against the PINNED GEM's
// own api_key mixin.
//
// The completeness register's C17 row (register-routes) grades the port
// UNPORTED: "Token auth and X-API-Key on READS are both unported (see B7):
// the reads are cookie-session only and there is no X-API-Key reader
// anywhere in the port". Its fix: "add the header authenticator to the read
// dispatch".
//
// fixtures/captured/api-key-authenticators-ruby-oracle.json is what
// oracle-capture-api-key-authenticators-ruby.rb (tests/server/) recorded by
// running the PINNED MOD's own two methods
// (card-mod-api_key-0.20.0/lib/card_controller/api_key.rb and
// lib/card/auth/api_key.rb).
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE AUTHENTICATOR is the X-API-Key HEADER, else the api_key param -
//      the header wins - and it is MERGED into the deck's own authenticators
//      hash, so the token key survives the merge.
//
//   2. THE SIGN-IN ORDER is token, then api_key, then session
//      (lib/card/auth/api_key.rb). A request that carries both a token and
//      an api key takes the TOKEN arm.
//
//   3. THE SIGN-IN ARGUMENT is the ACCOUNT's id (the api_key card's
//      left_id), not the key.
//
//   4. THE CHECK is exact, and the LOOKUP is not. The lookup strips the key
//      (find_account_by_api_key: `find_account_by :api_key, api_key.strip`)
//      but the check does not (authenticate_api_key: `content != api_key`),
//      so a key with surrounding whitespace FINDS the account and then
//      FAILS the check, and Ruby answers 403. A port that strips both
//      would sign the request in.
//
//   5. A key that matches no account, or an account whose card does not
//      carry the key, is Card::Error::PermissionDenied with the message
//      "API key authentication failed".
//
// The port's own state, pinned below: the api_key mod's set/ surface is
// ported (the views), but its lib/ surface - the authenticator and the
// sign-in - is not, and the mod's own header says why. There is no
// X-API-Key reader anywhere in src/, and the port's reads are cookie-session
// only. That is the open divergence, pinned so it cannot be closed by
// accident.
//
// DATA: the oracle's own stubs. No deck, no account, no live service.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { requestApiKey } from "../../src/server/request-authenticators.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/api-key-authenticators-ruby-oracle.json"), "utf8"),
) as {
  authenticators: Array<{ label: string; apiKey: string | null; hasTokenKey: boolean }>;
  signin: Array<{
    label: string;
    outcome: string;
    signinArgument?: number;
    errorClass?: string;
    errorMessage?: string;
  }>;
  signinOrder: Array<{ token: string | null; apiKey: string | null; arm: string }>;
};

/** Every source file under src/ whose text mentions the header. */
function apiKeyHeaderMentions(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      apiKeyHeaderMentions(full, out);
    } else if (/\.(ts|mjs|js)$/.test(entry)) {
      if (readFileSync(full, "utf8").includes("X-API-Key")) {
        out.push(path.relative(REPO, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

describe("the api_key authenticator, against the pinned mod", () => {
  it("the header wins over the param, and the merge keeps the token key", () => {
    const byLabel = new Map(ORACLE.authenticators.map((row) => [row.label, row]));
    expect(byLabel.get("header wins")!.apiKey).toBe("header-key");
    expect(byLabel.get("header only")!.apiKey).toBe("header-key");
    expect(byLabel.get("param only")!.apiKey).toBe("param-key");
    expect(byLabel.get("neither")!.apiKey).toBeNull();
    for (const row of ORACLE.authenticators) {
      expect(row.hasTokenKey, row.label).toBe(true);
    }
  });

  it("the sign-in order is token, then api_key, then session", () => {
    expect(ORACLE.signinOrder[0]!.arm).toBe("token_arm");
    expect(ORACLE.signinOrder[1]!.arm).toContain("API key authentication failed");
    expect(ORACLE.signinOrder[2]!.arm).toBe("session_arm");
  });

  it("the sign-in argument is the account's id", () => {
    const byLabel = new Map(ORACLE.signin.map((row) => [row.label, row]));
    expect(byLabel.get("matching key")!.outcome).toBe("signed_in");
    expect(byLabel.get("matching key")!.signinArgument).toBe(77);
    expect(byLabel.get("another account, the key matching its own card")!.signinArgument).toBe(88);
  });

  it("a key that matches no account is a denial, with the gem's own message", () => {
    const byLabel = new Map(ORACLE.signin.map((row) => [row.label, row]));
    const denied = byLabel.get("no account for the key")!;
    expect(denied.outcome).toBe("raised");
    expect(denied.errorClass).toBe("Card::Error::PermissionDenied");
    expect(denied.errorMessage).toBe("API key authentication failed");
  });

  it("the lookup strips the key and the check does not, so padded keys are denied", () => {
    // The cell a naive port gets wrong: the padded key FINDS the account
    // (the lookup strips) and then FAILS the check (the check does not), so
    // Ruby answers 403 rather than signing in.
    const byLabel = new Map(ORACLE.signin.map((row) => [row.label, row]));
    const padded = byLabel.get("the key is stripped for the lookup but not for the check")!;
    expect(padded.outcome).toBe("raised");
    expect(padded.errorClass).toBe("Card::Error::PermissionDenied");
    expect(padded.errorMessage).toBe("API key authentication failed");
  });
});

describe("the port's api_key reader", () => {
  it("THE READER IS WRITTEN: the header is read, in the lower-case spelling", () => {
    // ROUND SEVEN LANDED THE READER, so this pin CHANGED ON PURPOSE. The
    // row's own note said so: a lane that ports the reader has to change
    // the expectation on purpose and to say why in the commit.
    //
    // The header is read in lower case, the way this module reads the
    // Authorization header and the way every host presents headers: the
    // Node host's req.headers is already lower-cased, and a Fetch Request's
    // headers.get is case-insensitive.
    const mentions = apiKeyHeaderMentions(path.join(REPO, "src"));
    // The shared authenticators module READS it now, and the api_key mod's
    // own header still NAMES it (in prose).
    expect(mentions.sort()).toEqual([
      "src/card/auth/api-key-lookup.ts",
      "src/card/mod-loader/mods/card-mod-api_key.ts",
      "src/server/request-authenticators.ts",
    ]);
    const shared = readFileSync(path.join(REPO, "src/server/request-authenticators.ts"), "utf8");
    expect(shared).toContain('headers["x-api-key"]');
    expect(shared).toContain("export function requestApiKey(");
    // The mod's header now records where the READ half of the lib/ surface
    // lives, and still names the mixin it does not carry.
    const mod = readFileSync(path.join(REPO, "src/card/mod-loader/mods/card-mod-api_key.ts"), "utf8");
    expect(mod).toContain("CardController::ApiKey");
    expect(mod).toContain("src/card/auth/api-key-lookup.ts");
  });

  it("the READER'S ORDER IS THE PINNED ONE: the header wins, and an EMPTY header still wins", () => {
    // card-mod-api_key-0.20.0/lib/card_controller/api_key.rb:4-12:
    // `super.merge api_key: api_key_from_header || params[:api_key]`, with
    // `api_key_from_header` = `request.headers["X-API-Key"]`.
    expect(requestApiKey({ "x-api-key": "header-key" })).toBe("header-key");
    expect(requestApiKey({ "x-api-key": "header-key" }, new URLSearchParams("api_key=param-key"))).toBe(
      "header-key",
    );
    // Ruby's `||` treats "" as truthy, so an EMPTY header is still the
    // authenticator and the api_key arm runs with the empty key.
    expect(requestApiKey({ "x-api-key": "" }, new URLSearchParams("api_key=param-key"))).toBe("");
    // No header: the param answers.
    expect(requestApiKey({}, new URLSearchParams("api_key=param-key"))).toBe("param-key");
    // Neither: no api key at all.
    expect(requestApiKey({}, new URLSearchParams("other=1"))).toBeNull();
  });
});
