// The X-API-Key read arm (row C17), measured against the PINNED api_key
// gem's own authenticators and sign-in, with the port's own seam named.
//
// The register's C17 row grades the port UNPORTED: "Token auth and
// X-API-Key on READS are both unported (see B7): the reads are
// cookie-session only and there is no X-API-Key reader anywhere in the
// port". Its fix: "add the header authenticator to the read dispatch".
//
// The pinned ground is the COMMITTED capture
// (tests/server/oracle-capture-api-key-authenticators-ruby.rb, whose
// fixture is fixtures/captured/api-key-authenticators-ruby-oracle.json):
// the PINNED gem's own CardController::ApiKey authenticators and the
// PINNED gem's own Card::Auth::ApiKey sign-in.
//
// WHAT THIS FILE ADDS is the row's closure: the arm is still NOT
// written, and the two pieces that are missing are named at the source
// lines that carry them, so the row's "unblocks when" clause is exact.
//
//   THE PINNED ORDER IS AN ORDER, NOT A LOOKUP. The token arm runs
//   first; the api_key arm runs only when there is no token; and with
//   neither, the session arm runs. A token AND an api key together
//   answer the TOKEN arm, so the api_key arm never sees a request that
//   carries a token.
//
//   A KEY WITH NO ACCOUNT IS A REFUSAL WITH THE GEM'S OWN MESSAGE
//   ("API key authentication failed", Card::Error::PermissionDenied),
//   not an anonymous read.
//
//   THE PORT'S ARM IS NOT WRITTEN, and the two missing pieces are: the
//   READER (no file under src/ reads the X-API-Key header) and the
//   CARD-SIDE LOOKUP (the account whose *api_key card carries the key,
//   found by CONTENT and not by name, which the port's fetch layer has
//   no equivalent of).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveReadAuthenticators } from "../../src/server/request-authenticators.js";
import { signinFromApiKey } from "../../src/card/auth/api-key-lookup.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface ApiKeyOracle {
  gemset: string;
  authenticators: Array<{ label: string; apiKey: string | null; hasTokenKey: boolean }>;
  signin: Array<{
    label: string;
    outcome: string;
    signinArgument?: number;
    errorClass?: string;
    errorMessage?: string;
  }>;
  signinOrder: Array<{ token: string | null; apiKey: string | null; arm: string }>;
}

interface Oracle {
  routerAnswers: Record<string, Array<{ path: string; verb: string; matched: boolean; answer: { defaults: Record<string, string> } | null }>>;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
}

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as Oracle;

const API_KEY = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/api-key-authenticators-ruby-oracle.json"),
    "utf8",
  ),
) as ApiKeyOracle;

function expectQuotedLines(
  file: string,
  quotes: Array<{ line: number; text: string }>,
): void {
  const source = readFileSync(path.join(REPO, file), "utf8").split("\n");
  for (const quote of quotes) {
    expect(source[quote.line - 1], `${file}:${quote.line}`).toBe(quote.text);
  }
}

describe("the PINNED api_key gem's own answers (C17)", () => {
  it("the capture ran the pinned gem's own authenticators and sign-in", () => {
    expect(API_KEY.gemset).toBe("card-mod-api_key-0.20.0 (pinned)");
    expect(API_KEY.authenticators.length).toBe(4);
    expect(API_KEY.signin.length).toBe(4);
  });

  it("the header wins over the param, and neither is a token", () => {
    const header = API_KEY.authenticators.find((row) => row.label === "header wins");
    expect(header?.apiKey).toBe("header-key");
    const neither = API_KEY.authenticators.find((row) => row.label === "neither");
    expect(neither?.apiKey).toBeNull();
  });

  it("the ORDER is token, then api_key, then session", () => {
    expect(API_KEY.signinOrder.map((row) => row.arm)).toEqual([
      "token_arm",
      "RAISED: Card::Error::PermissionDenied: API key authentication failed",
      "session_arm",
    ]);
  });

  it("a key with no account is a REFUSAL with the gem's own message", () => {
    const refused = API_KEY.signin.find((row) => row.label === "no account for the key");
    expect(refused?.outcome).toBe("raised");
    expect(refused?.errorClass).toBe("Card::Error::PermissionDenied");
    expect(refused?.errorMessage).toBe("API key authentication failed");
  });

  it("a matching key signs in with the account's own id", () => {
    const signedIn = API_KEY.signin.find((row) => row.label === "matching key");
    expect(signedIn?.outcome).toBe("signed_in");
    expect(signedIn?.signinArgument).toBe(77);
  });
});

describe("the port's own seam (C17)", () => {
  it("the shared module says the api_key half belongs to this row's work", () => {
    for (const entry of ORACLE.portSurface["C17"]) {
      expectQuotedLines(entry.file, entry.lines);
    }
  });

  it("the port's own api_key mod header records WHY the gem's lib/ surface is not ported", () => {
    const source = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-api_key.ts"),
      "utf8",
    );
    expect(source).toContain("lib/card/auth/api_key.rb");
    expect(source).toContain("lib/card_controller/api_key.rb");
  });

  it("THE READER IS WRITTEN, and the pin changed on purpose", () => {
    // ROUND SEVEN LANDED THE READER. This pin was the row's own: it held
    // the reader open by ABSENCE (the header was named in two files, both
    // in prose, and read in none), and the row's note said that a lane
    // which ports the reader has to change the expectation on purpose and
    // to say why in the commit.
    //
    // The reader is the shared authenticators module's requestApiKey: the
    // X-API-Key header first, then the api_key param.
    const shared = readFileSync(path.join(REPO, "src/server/request-authenticators.ts"), "utf8");
    expect(shared).toContain("X-API-Key");
    expect(shared).toContain("export function requestApiKey(");
    expect(shared).toContain('headers["x-api-key"]');
    const mod = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-api_key.ts"),
      "utf8",
    );
    expect(mod).toContain("X-API-Key");
    // The WRITE path still does not read the header: Ruby's write path
    // takes its token from the Authorization header, and the api_key
    // authenticator is the READ path's own row.
    for (const file of [
      "src/server/worker-shared-surface.ts",
      "src/server/write-routes.ts",
      "src/server/file-routes.ts",
      "src/server/first-run-routes.ts",
    ]) {
      const source = readFileSync(path.join(REPO, file), "utf8");
      expect(source, file).not.toContain("x-api-key");
      expect(source, file).not.toContain("X-API-Key");
    }
  });

  it("THE CARD-SIDE LOOKUP IS WRITTEN, and it finds the account by CONTENT", () => {
    // The pinned gem finds the account by CONTENT (the *api_key card's
    // content), not by name (find_account_by_api_key ->
    // find_account_by :api_key, api_key.strip). The port's FETCH layer
    // still reads cards by id and by name and has no content search, so
    // the lookup is the auth layer's own SQL join: the +*account junction
    // whose +*api_key child carries the key.
    const fetch = readFileSync(path.join(REPO, "src/card/fetch.ts"), "utf8");
    expect(fetch).toContain("fetchById");
    expect(fetch).not.toContain("fetchByContent");
    const lookup = readFileSync(path.join(REPO, "src/card/auth/api-key-lookup.ts"), "utf8");
    expect(lookup).toContain("export async function findAccountByApiKey(");
    expect(lookup).toContain("e.db_content = ?");
    expect(lookup).toContain("rubyStrip(rawKey)");
  });
});

// ---------------------------------------------------------------------------
// ROUND SEVEN: the arm MEASURED, over the port's own driver.
// ---------------------------------------------------------------------------

describe("the port's api_key arm, measured (C17)", () => {
  let storage: RenderTestStorage;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    // The deck the api_key arm reads: the *account card and the *api_key
    // card (the two codenames the lookup resolves), the user card, the
    // +*account junction (the card whose right_id is the *account card and
    // whose left_id is the user card), and the +*api_key child (the card
    // whose left_id is that junction and whose content is the key).
    await seedCard(storage, { id: 1, name: "*account", codename: "account" });
    await seedCard(storage, { id: 2, name: "*api_key", codename: "api_key" });
    await seedCard(storage, { id: 3, name: "Joe User" });
    await seedCard(storage, { id: 4, leftId: 3, rightId: 1 });
    await seedCard(storage, { id: 5, leftId: 4, rightId: 2, dbContent: "thekeythekeythekeythekey" });
  });

  afterAll(() => storage?.close());

  it("a key that names an account signs in as the ACCOUNT's left_id", async () => {
    const signin = await signinFromApiKey(storage.counting, "thekeythekeythekeythekey");
    expect(signin).toEqual({ kind: "actor", actorId: 3 });
    // The pinned sign-in argument is the account's left_id
    // (signin_with_api_key: `signin account.left_id`), and the capture
    // measured the same shape (the matching key signs in with the
    // account's own id).
    expect(API_KEY.signin.find((row) => row.label === "matching key")?.signinArgument).toBe(77);
  });

  it("a key that names no account is the REFUSAL, with the gem's own message", async () => {
    const signin = await signinFromApiKey(storage.counting, "nosuchkey");
    expect(signin).toEqual({ kind: "denied", reason: "API key authentication failed" });
    const refused = API_KEY.signin.find((row) => row.label === "no account for the key");
    expect(refused?.errorClass).toBe("Card::Error::PermissionDenied");
    expect(refused?.errorMessage).toBe("API key authentication failed");
  });

  it("THE STRIP/CHECK SPLIT HOLDS: a padded key FINDS the account and then FAILS the check", async () => {
    // The lookup strips (find_account_by_api_key) and the check does not
    // (authenticate_api_key: `content != api_key`), so the padded key is
    // the refusal and NOT a sign-in. A port that stripped both would sign
    // the request in.
    const padded = await signinFromApiKey(storage.counting, "  thekeythekeythekeythekey  ");
    expect(padded).toEqual({ kind: "denied", reason: "API key authentication failed" });
    const capture = API_KEY.signin.find(
      (row) => row.label === "the key is stripped for the lookup but not for the check",
    );
    expect(capture?.outcome).toBe("raised");
    expect(capture?.errorMessage).toBe("API key authentication failed");
  });

  it("the ORDER is token, then api_key, then session", async () => {
    // The pinned order (lib/card/auth/api_key.rb:7-15). A request that
    // carries BOTH a token and an api key takes the TOKEN arm, so the
    // api_key arm never sees it.
    expect(API_KEY.signinOrder.map((row) => row.arm)).toEqual([
      "token_arm",
      "RAISED: Card::Error::PermissionDenied: API key authentication failed",
      "session_arm",
    ]);
    // The api_key arm is reached only when the token arm did not answer.
    const withKey = await resolveReadAuthenticators(
      { authorization: "Bearer not-a-jwt", "x-api-key": "thekeythekeythekeythekey" },
      null,
      undefined,
      async () => ({ kind: "actor" as const, actorId: 3 }),
    );
    expect(withKey).toEqual({ kind: "actor", actorId: 3 });
    const withoutKey = await resolveReadAuthenticators(
      { authorization: "Bearer not-a-jwt" },
      null,
      undefined,
      async () => ({ kind: "actor" as const, actorId: 3 }),
    );
    expect(withoutKey).toEqual({ kind: "absent" });
  });
});

describe("the pinned deck's own answer at the read path (C17)", () => {
  it("the read reaches the card read arm in the pinned deck", () => {
    const answer = ORACLE.routerAnswers["C17"].find((row) => row.path === "/Alpha");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["action"]).toBe("read");
  });
});
