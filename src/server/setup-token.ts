// The one-time first-run setup token for the edge hosts.
//
// Ruby Decko opens its first-run window (card-1.110.0 lib/card/auth/setup.rb
// needs_setup?) to whoever reaches it first while the deck has no accounts.
// A one-click deploy is public the moment it finishes, so on the edge hosts
// that window is additionally gated by a token the deploy chain issues:
//
//   tools/deploy/issue-setup-token.mjs   generates 32 random bytes, stores
//                                        their sha256 in deck_setup_tokens
//                                        (deploy/migrations/0010), and prints
//                                        the token in the deploy output;
//   this module                          checks a request's token against
//                                        that digest and clears it once the
//                                        owner account exists.
//
// The gate fails closed: with no token issued, /setup answers 403 and names
// the command that issues one. The census itself (no accounts yet) is still
// first-run-routes.ts's, unchanged; this gate only decides whether the
// request may reach it.

import type { SQLDatabaseDriver } from "./driver.js";

/** The query parameter (GET) and form field (POST) the token rides. */
export const SETUP_TOKEN_PARAM = "token";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two equal-length hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SetupTokenVerdict =
  | { ok: true; token: string }
  | { ok: false; reason: "not_issued" | "missing" | "mismatch" };

/** The token a request carries: the query parameter, else (POST) the
 *  urlencoded form field of the same name. */
export function setupTokenFromRequest(search: string | undefined, contentType: string | undefined, body: string): string | undefined {
  const fromQuery = new URLSearchParams(search ?? "").get(SETUP_TOKEN_PARAM);
  if (fromQuery !== null && fromQuery !== "") return fromQuery;
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (type === "application/x-www-form-urlencoded" || type === "") {
    const fromForm = new URLSearchParams(body).get(SETUP_TOKEN_PARAM);
    if (fromForm !== null && fromForm !== "") return fromForm;
  }
  return undefined;
}

/** Check a presented token against the issued digest. A database without the
 *  table (migration 0010 not applied) reads as "not issued". */
export async function verifySetupToken(driver: SQLDatabaseDriver, presented: string | undefined): Promise<SetupTokenVerdict> {
  let digests: string[];
  try {
    const result = await driver.query<{ token_sha256: string }>(
      `SELECT "token_sha256" FROM "deck_setup_tokens"`,
      [],
    );
    digests = result.rows.map((r) => r.token_sha256);
  } catch {
    digests = [];
  }
  if (digests.length === 0) return { ok: false, reason: "not_issued" };
  if (presented === undefined) return { ok: false, reason: "missing" };
  const digest = await sha256Hex(presented);
  return digests.some((d) => sameHex(d, digest)) ? { ok: true, token: presented } : { ok: false, reason: "mismatch" };
}

/** Delete every issued token: called once the owner account is created, so
 *  the token cannot be replayed even if the census were ever reopened. */
export async function clearSetupTokens(driver: SQLDatabaseDriver): Promise<void> {
  await driver.query(`DELETE FROM "deck_setup_tokens"`, []);
}

export const SETUP_TOKEN_REFUSAL: Record<"not_issued" | "missing" | "mismatch", string> = {
  not_issued:
    "No first-run setup token has been issued for this deck. Run `npm run setup-token` " +
    "(it prints a one-time link), then open that link.",
  missing:
    "First-run setup needs the one-time setup link printed in this deck's deploy output.",
  mismatch:
    "That setup link is not this deck's current one. Use the link printed by the most recent deploy.",
};
