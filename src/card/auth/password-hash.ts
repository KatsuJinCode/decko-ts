// Password storage: Ruby's salted SHA-1 for compatibility, PBKDF2 for new
// passwords (docs/SECURITY.md, "Passwords").
//
// Ruby Decko (card 1.110.0, lib/card/auth.rb:27-39) stores
// SHA1("<salt>--<password>--") as 40 hex characters, where the salt is
// itself SHA1 of a timestamp, and compares it with ordinary string equality.
// A single unkeyed SHA-1 is fast enough to brute-force at scale, so the port
// keeps verifying those digests but stores every newly set or changed
// password as PBKDF2-HMAC-SHA256 with a random 16-byte salt, and replaces a
// legacy digest with a PBKDF2 hash the next time its owner signs in.
//
// Stored format: pbkdf2_sha256$<iterations>$<salt, base64>$<hash, base64>.
// The iteration count travels with each hash, so raising it later upgrades
// old hashes at sign-in rather than invalidating them.
//
// Parameters follow the OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-
// SHA256 with 600,000 iterations. Cloudflare's production Workers runtime
// refuses PBKDF2 above 100,000 iterations (cloudflare/workerd issue 1346; the
// limit is not enforced by local workerd); the Workers host declares that
// limit with setPbkdf2IterationLimit and its default becomes 100,000.
//
// Ruby cannot verify a PBKDF2 hash. A site that runs Ruby Decko beside the
// port on the same deck sets DECKO_PASSWORD_HASH=legacy-sha1: new passwords
// are then stored as Ruby's digest and nothing is upgraded at sign-in.
//
// WebCrypto only, so it runs on Node, workerd and Deno alike.

import { sha1Hex } from "./signin.js";
import { tokensEqual } from "./session-token.js";

export type PasswordHashMode = "pbkdf2" | "legacy-sha1";

export interface PasswordHashPolicy {
  /** "pbkdf2" (default): store PBKDF2, upgrade legacy digests at sign-in.
   *  "legacy-sha1": store Ruby's digest, upgrade nothing (Ruby side by side). */
  mode: PasswordHashMode;
  /** PBKDF2 iterations for newly stored hashes. */
  iterations: number;
}

/** OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256. */
export const OWASP_PBKDF2_SHA256_ITERATIONS = 600_000;

/** Below this the configuration is refused: it is the lowest limit any
 *  supported runtime imposes, so no host needs less. */
export const MIN_PBKDF2_ITERATIONS = 100_000;

/** Cloudflare Workers' production PBKDF2 limit. */
export const CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS = 100_000;

const PBKDF2_PREFIX = "pbkdf2_sha256";
const SALT_BYTES = 16;
const HASH_BITS = 256;
const PBKDF2_RE = /^pbkdf2_sha256\$(\d{1,9})\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;
const LEGACY_RE = /^[0-9a-f]{40}$/;

let platformLimit: { iterations: number; runtime: string } | undefined;
let configured: PasswordHashPolicy | undefined;

/** A host whose runtime refuses PBKDF2 above some iteration count declares
 *  it once at module load (the Cloudflare Workers entries). */
export function setPbkdf2IterationLimit(limit: { iterations: number; runtime: string } | undefined): void {
  platformLimit = limit;
}

/** The environment variables the policy reads. */
export interface PasswordHashEnv {
  readonly DECKO_PASSWORD_HASH?: unknown;
  readonly DECKO_PASSWORD_PBKDF2_ITERATIONS?: unknown;
}

/** Build a policy from host settings. Unset values take the defaults:
 *  pbkdf2, at OWASP's count or the platform's limit when lower. Throws on a
 *  value it cannot honour, so a misconfiguration fails loudly. */
export function passwordHashPolicyFromEnv(env: PasswordHashEnv | undefined): PasswordHashPolicy {
  const rawMode = typeof env?.DECKO_PASSWORD_HASH === "string" ? env.DECKO_PASSWORD_HASH.trim() : "";
  const mode: PasswordHashMode = rawMode === "" ? "pbkdf2" : (rawMode as PasswordHashMode);
  if (mode !== "pbkdf2" && mode !== "legacy-sha1") {
    throw new Error(`DECKO_PASSWORD_HASH must be "pbkdf2" or "legacy-sha1", got ${JSON.stringify(rawMode)}`);
  }
  const ceiling = platformLimit?.iterations ?? Number.MAX_SAFE_INTEGER;
  const rawIterations =
    typeof env?.DECKO_PASSWORD_PBKDF2_ITERATIONS === "string" ? env.DECKO_PASSWORD_PBKDF2_ITERATIONS.trim() : "";
  let iterations = Math.min(OWASP_PBKDF2_SHA256_ITERATIONS, ceiling);
  if (rawIterations !== "") {
    if (!/^\d+$/.test(rawIterations)) {
      throw new Error(`DECKO_PASSWORD_PBKDF2_ITERATIONS must be a whole number, got ${JSON.stringify(rawIterations)}`);
    }
    iterations = Number(rawIterations);
    if (iterations < MIN_PBKDF2_ITERATIONS) {
      throw new Error(`DECKO_PASSWORD_PBKDF2_ITERATIONS must be at least ${MIN_PBKDF2_ITERATIONS}, got ${iterations}`);
    }
    if (iterations > ceiling) {
      throw new Error(
        `DECKO_PASSWORD_PBKDF2_ITERATIONS=${iterations} exceeds the PBKDF2 limit of ${platformLimit!.runtime} (${ceiling})`,
      );
    }
  }
  return { mode, iterations };
}

/** Set the policy explicitly (a host with its own settings bag), or clear
 *  it (undefined) to fall back to process.env. */
export function configurePasswordHashing(policy: PasswordHashPolicy | undefined): void {
  configured = policy;
}

function processEnv(): PasswordHashEnv | undefined {
  const proc = (globalThis as { process?: { env?: PasswordHashEnv } }).process;
  return proc?.env;
}

/** The policy in force: the configured one, else process.env, else the
 *  defaults. */
export function passwordHashPolicy(): PasswordHashPolicy {
  return configured ?? passwordHashPolicyFromEnv(processEnv());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/** Is this stored value a PBKDF2 hash in the port's format? */
export function isPbkdf2Hash(stored: string): boolean {
  return PBKDF2_RE.test(stored);
}

/** Is this stored value Ruby's salted SHA-1 digest? */
export function isLegacyDigest(stored: string): boolean {
  return LEGACY_RE.test(stored);
}

/** Ruby's Card::Auth.encrypt (auth.rb:36-39). */
export function legacyDigest(password: string, salt: string): Promise<string> {
  return sha1Hex(`${salt}--${password}--`);
}

/** The value to store for a newly set or changed password. `legacySalt` is
 *  the account's +*salt content, used only by the legacy format. */
export async function hashPassword(
  password: string,
  legacySalt: string,
  policy: PasswordHashPolicy = passwordHashPolicy(),
): Promise<string> {
  if (policy.mode === "legacy-sha1") return legacyDigest(password, legacySalt);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, policy.iterations);
  return `${PBKDF2_PREFIX}$${policy.iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export interface PasswordCheck {
  /** The password matches the stored value. */
  ok: boolean;
  /** It matches, and the stored value should be replaced under the current
   *  policy (a legacy digest, or fewer PBKDF2 iterations than configured). */
  needsUpgrade: boolean;
  /** Set when this runtime could not compute the stored hash (a PBKDF2
   *  count above its limit); ok is then false. */
  unsupported?: string;
}

/** Check a password against a stored value of either format. Comparisons
 *  run in constant time. */
export async function checkPassword(
  stored: string,
  password: string,
  legacySalt: string,
  policy: PasswordHashPolicy = passwordHashPolicy(),
): Promise<PasswordCheck> {
  const m = PBKDF2_RE.exec(stored);
  if (m !== null) {
    const iterations = Number(m[1]);
    const salt = fromBase64(m[2]!);
    const expected = fromBase64(m[3]!);
    let actual: Uint8Array;
    try {
      actual = await pbkdf2(password, salt, iterations);
    } catch (error) {
      return {
        ok: false,
        needsUpgrade: false,
        unsupported: `this runtime cannot compute PBKDF2 with ${iterations} iterations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    const ok = expected.length === actual.length && tokensEqual(toBase64(actual), toBase64(expected));
    return { ok, needsUpgrade: ok && policy.mode === "pbkdf2" && iterations < policy.iterations };
  }
  // Ruby's digest. A stored value of any other shape (empty, a missing
  // card) can never match: Ruby compares it with the fresh digest too.
  const ok = stored !== "" && tokensEqual(await legacyDigest(password, legacySalt), stored);
  return { ok, needsUpgrade: ok && policy.mode === "pbkdf2" };
}
