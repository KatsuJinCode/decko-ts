// The one-time setup token that first-run setup requires (docs/SECURITY.md,
// approved divergence 5). Owner creation at /setup is accepted only from a
// request that carries a valid token, so reaching the deck first is not
// enough to become its owner.
//
// Ruby Decko opens its first-run window (card-1.110.0 lib/card/auth/setup.rb
// needs_setup?) to whoever reaches it first while the deck has no accounts.
// This gate is the port's addition in front of that window. One check accepts
// a token from any of three sources:
//
//   * Deploy-issued: the deploy chain (`npm run setup-token`, run by
//     `npm run deploy`, and Bunny one-key provisioning) generates 32 random
//     bytes, stores only their SHA-256 in deck_setup_tokens
//     (deploy/migrations/0012-first-run-setup-token.sql) and prints the link
//     `/setup?token=...`. No operator secret is involved. The rows are
//     deleted once the owner account exists.
//   * Operator-supplied: DECKO_SETUP_TOKEN (a secret on the edge hosts, an
//     environment variable on Node).
//   * Boot-generated: a host with a console the operator reads at start (the
//     Node host) calls armGeneratedSetupToken() when DECKO_SETUP_TOKEN is not
//     set; the token lives in memory only and the host prints it. A restart
//     generates a new one.
//
// With none of the three available, setup is refused with a message naming
// both ways to get a token. The window itself still closes for good when the
// first owner exists (first-run-setup.ts, the census).

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { sha256Hex, tokensEqual } from "./session-token.js";

/** The query parameter the printed setup link carries the token in. */
export const SETUP_TOKEN_PARAM = "token";

let generated: string | undefined;
let configured: string | undefined;

function processEnvToken(): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const raw = proc?.env?.["DECKO_SETUP_TOKEN"];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
}

/** Set the operator's token from a host settings bag (the edge hosts'
 *  bindings), or clear it (undefined) to fall back to process.env. */
export function configureSetupToken(token: string | undefined): void {
  configured = typeof token === "string" && token.trim() !== "" ? token.trim() : undefined;
}

/** Generate the boot token unless the operator supplied one. Returns the
 *  token the host must print, or undefined when DECKO_SETUP_TOKEN is in force
 *  (the operator already knows it, and it is not echoed to a log). */
export function armGeneratedSetupToken(): string | undefined {
  if ((configured ?? processEnvToken()) !== undefined) return undefined;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  generated = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return generated;
}

/** Forget a generated token (tests, and a host shutting the window). */
export function clearGeneratedSetupToken(): void {
  generated = undefined;
}

/** The operator-supplied or boot-generated token in force, if any. The
 *  deploy-issued token is never held in plain text; see deckIssuedDigests. */
export function requiredSetupToken(): string | undefined {
  return configured ?? processEnvToken() ?? generated;
}

/** The SHA-256 digests of the deploy-issued tokens. A database without the
 *  table (the migration not applied) has none. */
async function deckIssuedDigests(driver: SQLDatabaseDriver): Promise<string[]> {
  try {
    const result = await driver.query<{ token_sha256: string }>(`SELECT "token_sha256" FROM "deck_setup_tokens"`, []);
    return result.rows.map((r) => r.token_sha256);
  } catch {
    return [];
  }
}

/** Delete every deploy-issued token: called once the owner account exists,
 *  so the printed link cannot be replayed even if the census were reopened.
 *  A database without the table has nothing to delete. */
export async function clearDeckSetupTokens(driver: SQLDatabaseDriver): Promise<void> {
  try {
    await driver.query(`DELETE FROM "deck_setup_tokens"`, []);
  } catch {
    // No deck_setup_tokens table: no deploy-issued token was ever stored.
  }
}

/** The token a request presents: the printed link's query parameter, else
 *  the form's setup_token field. Empty strings count as absent. */
export function presentedSetupToken(search: string | undefined, formField: string | undefined): string | undefined {
  const fromQuery = new URLSearchParams(search ?? "").get(SETUP_TOKEN_PARAM);
  if (fromQuery !== null && fromQuery.trim() !== "") return fromQuery.trim();
  if (typeof formField === "string" && formField.trim() !== "") return formField.trim();
  return undefined;
}

export type SetupTokenCheck =
  | { ok: true }
  | { ok: false; reason: "no_token_configured" | "wrong_token"; message: string };

export const SETUP_TOKEN_MESSAGES = {
  no_token_configured:
    "Setup needs a setup token, and this deck has none. Run `npm run setup-token` to issue a one-time setup link, " +
    "or set DECKO_SETUP_TOKEN and submit it with the form.",
  wrong_token:
    "The setup token is missing or not correct. Use the setup link printed by the most recent deploy, " +
    "the token printed when the server started, or the value of DECKO_SETUP_TOKEN.",
} as const;

/** Check a presented token against every source in force, in constant time
 *  per comparison. */
export async function checkSetupToken(driver: SQLDatabaseDriver, presented: string | undefined): Promise<SetupTokenCheck> {
  const plain = requiredSetupToken();
  const digests = await deckIssuedDigests(driver);
  if (plain === undefined && digests.length === 0) {
    return { ok: false, reason: "no_token_configured", message: SETUP_TOKEN_MESSAGES.no_token_configured };
  }
  const submitted = (presented ?? "").trim();
  if (submitted !== "") {
    if (plain !== undefined && tokensEqual(submitted, plain)) return { ok: true };
    if (digests.length > 0) {
      const digest = await sha256Hex(submitted);
      // Every digest is compared, so the time taken does not say which matched.
      let matched = false;
      for (const d of digests) if (tokensEqual(d, digest)) matched = true;
      if (matched) return { ok: true };
    }
  }
  return { ok: false, reason: "wrong_token", message: SETUP_TOKEN_MESSAGES.wrong_token };
}
