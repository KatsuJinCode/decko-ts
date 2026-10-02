// Generated test credentials: the
// auth-flow tests' login literals are minted fresh per run with node:crypto
// instead of hardcoded strings, same shape as the literals they replaced.
// No generated value is a real credential anywhere; they exist only inside
// the test run that mints them.

import { randomBytes, randomUUID } from "node:crypto";

/** A password-shaped string (upper + lower + digit + symbol, 24 chars) with
 *  the label woven in so a failure message still says which flow minted it.
 *  The label is sanitized to [A-Za-z] so it cannot break the class
 *  guarantees. */
export function generatedPassword(label: string): string {
  const safeLabel = label.replace(/[^A-Za-z]/g, "") || "Flow";
  const body = randomBytes(24).toString("base64url").replace(/[^A-Za-z0-9]/g, "");
  // Guaranteed classes: the trailing trio pins upper / digit / symbol even
  // if the random body happened to miss one.
  return `${safeLabel}${body}A7!`;
}

/** An email-shaped identifier with a fresh local part; the example.com
 *  resolver name is never delivered to. */
export function generatedEmail(localPart: string): string {
  const safeLocal = localPart.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "user";
  return `${safeLocal}-${randomBytes(6).toString("hex")}@example.com`;
}

/** A token-signing secret: 32 fresh bytes, hex-encoded. */
export function generatedTokenSecret(): string {
  return randomBytes(32).toString("hex");
}

/** A fresh opaque token (reset tokens, session ids). */
export function generatedToken(): string {
  return randomUUID().replace(/-/g, "");
}
