// Session-token primitives for the auth layer: generation, at-rest digest,
// and the constant-time comparison used on every lookup.
//
// Runtime note: everything here uses the Web Crypto global
// (crypto.getRandomValues / crypto.subtle) rather than node:crypto so the
// same code runs on Node (local + tests) and in workers/edge deployments.
// Node has shipped the Web Crypto global since v19; this repo runs Node 24
// (runtime-verified by the suite).

/** Token length in raw bytes. 32 random bytes -> 64 hex chars. */
export const SESSION_TOKEN_BYTES = 32;

/** Crypto-random session token: 32 bytes, hex-encoded (64 chars). */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** SHA-256 of a UTF-8 string, hex-encoded — the at-rest form of a token
 *  (the raw token is never stored; only this digest is comparable). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Constant-time equality over byte arrays: the loop always runs over the
 * LONGER input's length and accumulates the XOR of every byte pair into a
 * single flag, so the work done does not vary with where (or whether) the
 * inputs differ.
 *
 * LENGTH IS COMPARED EXPLICITLY, and it is the one thing this function is
 * allowed to branch on. The loop alone would not be sufficient: it
 * zero-pads the shorter input, so `constantTimeEqual("x", "x\0")` would XOR
 * 0x78 against 0x78 and 0x00 against 0x00, accumulate a diff of 0, and
 * report two different secrets as equal. Every real caller compares
 * fixed-length material (a SHA-256 digest, a base64-encoded digest), so the
 * check is belt-and-braces — but a comparator whose failure mode is
 * "accepts a prefix" is the wrong default for secret material, whatever the
 * current callers happen to pass. Comparing the lengths first makes unequal
 * lengths return false without pretending to have run the loop.
 *
 * Implemented in TS rather than node:crypto.timingSafeEqual because (a) that
 * function throws on length mismatch and (b) it does not exist in workers —
 * the edge targets this repo deploys to.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Folded into the returned value, not tested first, so a length mismatch
  // still costs the full loop below — the only early exit is the comparison
  // of two lengths, which reveals nothing an attacker could not learn from a
  // boolean result.
  let diff = a.length === b.length ? 0 : 1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const byteA = i < a.length ? a[i] : 0;
    const byteB = i < b.length ? b[i] : 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

/** Constant-time string equality for secret material (token digests):
 *  both inputs are re-encoded to bytes and compared with
 *  {@link constantTimeEqual}. This is the comparator SessionStore routes
 *  every lookup through (injectable seam — see SessionStoreOptions). */
export function tokensEqual(a: string, b: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}
