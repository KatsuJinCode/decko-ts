// The one-time setup token that first-run setup requires (docs/SECURITY.md,
// approved divergence 5). Owner creation at /setup is accepted only from a
// request that carries this token, so reaching the deck first is not enough
// to become its owner.
//
// Where the token comes from:
//   * DECKO_SETUP_TOKEN, when the operator sets it (a secret on the edge
//     hosts, an environment variable on Node). Works on every host.
//   * Otherwise a host that has a console the operator reads at start (the
//     Node host) calls armGeneratedSetupToken() at boot: it generates 32
//     random bytes, keeps them in memory, and the host prints the token.
//     Nothing is written to the deck. A restart generates a new one.
//   * Otherwise (an edge host with no DECKO_SETUP_TOKEN) there is no token
//     and setup is refused with a message naming the setting. An edge isolate
//     has no boot console and no memory shared between isolates, so a token
//     generated there could not reach the operator or survive to the POST.
//
// The token is useless once setup completes: the /setup window closes for
// good when the first owner exists (first-run-setup.ts, the census).

import { tokensEqual } from "./session-token.js";

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

/** The token setup requires now, or undefined when none is available. */
export function requiredSetupToken(): string | undefined {
  return configured ?? processEnvToken() ?? generated;
}

export type SetupTokenCheck =
  | { ok: true }
  | { ok: false; reason: "no_token_configured" | "wrong_token"; message: string };

export const SETUP_TOKEN_MESSAGES = {
  no_token_configured:
    "Setup needs a setup token, and this server has none. Set DECKO_SETUP_TOKEN and submit it with the form.",
  wrong_token: "The setup token is missing or not correct. Use the token printed when the server started, or the value of DECKO_SETUP_TOKEN.",
} as const;

/** Check a submitted token against the one in force, in constant time. */
export function checkSetupToken(submitted: string): SetupTokenCheck {
  const expected = requiredSetupToken();
  if (expected === undefined) {
    return { ok: false, reason: "no_token_configured", message: SETUP_TOKEN_MESSAGES.no_token_configured };
  }
  if (!tokensEqual(submitted.trim(), expected)) {
    return { ok: false, reason: "wrong_token", message: SETUP_TOKEN_MESSAGES.wrong_token };
  }
  return { ok: true };
}
