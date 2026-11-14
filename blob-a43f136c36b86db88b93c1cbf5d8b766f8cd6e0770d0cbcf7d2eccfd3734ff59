// Password storage (src/card/auth/password-hash.ts; docs/SECURITY.md,
// "Passwords"): Ruby's salted SHA-1 digests keep verifying, new passwords are
// stored as PBKDF2-HMAC-SHA256, and the policy is configurable for decks that
// Ruby Decko serves too.

import { createHash, pbkdf2Sync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPassword,
  CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS,
  configurePasswordHashing,
  hashPassword,
  isLegacyDigest,
  isPbkdf2Hash,
  OWASP_PBKDF2_SHA256_ITERATIONS,
  passwordHashPolicy,
  passwordHashPolicyFromEnv,
  setPbkdf2IterationLimit,
  type PasswordHashPolicy,
} from "../../../src/card/auth/password-hash.js";

const SALT = "4f0a1c2e9b7d6a5f3e2d1c0b9a8f7e6d5c4b3a29";
const PASSWORD = "Probe-pass-123";
const RUBY_DIGEST = createHash("sha1").update(`${SALT}--${PASSWORD}--`).digest("hex");
const PBKDF2: PasswordHashPolicy = { mode: "pbkdf2", iterations: 100_000 };
const LEGACY: PasswordHashPolicy = { mode: "legacy-sha1", iterations: 100_000 };

afterEach(() => {
  setPbkdf2IterationLimit(undefined);
  configurePasswordHashing(undefined);
  vi.restoreAllMocks();
});

describe("legacy digests (Ruby Card::Auth.encrypt) keep verifying", () => {
  it("accepts the right password and refuses a wrong one", async () => {
    expect(isLegacyDigest(RUBY_DIGEST)).toBe(true);
    expect(await checkPassword(RUBY_DIGEST, PASSWORD, SALT, PBKDF2)).toEqual({ ok: true, needsUpgrade: true });
    expect(await checkPassword(RUBY_DIGEST, "Probe-pass-124", SALT, PBKDF2)).toEqual({ ok: false, needsUpgrade: false });
    expect(await checkPassword(RUBY_DIGEST, PASSWORD, "other-salt", PBKDF2)).toEqual({ ok: false, needsUpgrade: false });
  });

  it("does not ask for an upgrade in legacy-sha1 mode (Ruby must keep reading it)", async () => {
    expect(await checkPassword(RUBY_DIGEST, PASSWORD, SALT, LEGACY)).toEqual({ ok: true, needsUpgrade: false });
  });

  it("never matches an empty stored value (a missing +*password card)", async () => {
    expect((await checkPassword("", PASSWORD, SALT, PBKDF2)).ok).toBe(false);
  });

  it("stores Ruby's exact digest in legacy-sha1 mode", async () => {
    expect(await hashPassword(PASSWORD, SALT, LEGACY)).toBe(RUBY_DIGEST);
  });
});

describe("new passwords are stored as PBKDF2-HMAC-SHA256", () => {
  it("writes pbkdf2_sha256$<iterations>$<salt>$<hash> with a fresh 16-byte salt each time", async () => {
    const a = await hashPassword(PASSWORD, SALT, PBKDF2);
    const b = await hashPassword(PASSWORD, SALT, PBKDF2);
    expect(isPbkdf2Hash(a)).toBe(true);
    expect(a).not.toBe(b);
    const [prefix, iterations, salt, hash] = a.split("$");
    expect(prefix).toBe("pbkdf2_sha256");
    expect(Number(iterations)).toBe(100_000);
    expect(Buffer.from(salt!, "base64").length).toBe(16);
    expect(Buffer.from(hash!, "base64").length).toBe(32);
    // Independent recomputation with node:crypto's PBKDF2.
    expect(pbkdf2Sync(PASSWORD, Buffer.from(salt!, "base64"), 100_000, 32, "sha256").toString("base64")).toBe(hash);
  });

  it("verifies the right password and refuses a wrong one", async () => {
    const stored = await hashPassword(PASSWORD, SALT, PBKDF2);
    expect(await checkPassword(stored, PASSWORD, SALT, PBKDF2)).toEqual({ ok: true, needsUpgrade: false });
    expect(await checkPassword(stored, "Probe-pass-124", SALT, PBKDF2)).toEqual({ ok: false, needsUpgrade: false });
    // The +*salt card plays no part in a PBKDF2 hash.
    expect((await checkPassword(stored, PASSWORD, "unrelated", PBKDF2)).ok).toBe(true);
  });

  it("is standard PBKDF2: the RFC 7914 test vector verifies", async () => {
    // PBKDF2-HMAC-SHA256(P="passwd", S="salt", c=1, dkLen=64), first 32 bytes.
    const dk = "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc";
    const stored = `pbkdf2_sha256$1$${Buffer.from("salt").toString("base64")}$${Buffer.from(dk, "hex").toString("base64")}`;
    expect((await checkPassword(stored, "passwd", "", PBKDF2)).ok).toBe(true);
  });

  it("asks to upgrade a hash with fewer iterations than configured", async () => {
    const stored = await hashPassword(PASSWORD, SALT, PBKDF2);
    expect(await checkPassword(stored, PASSWORD, SALT, { mode: "pbkdf2", iterations: 600_000 })).toEqual({
      ok: true,
      needsUpgrade: true,
    });
  });

  it("reports, rather than mistakes for a wrong password, a hash this runtime cannot compute", async () => {
    const stored = await hashPassword(PASSWORD, SALT, PBKDF2);
    vi.spyOn(crypto.subtle, "deriveBits").mockRejectedValue(
      new Error("Pbkdf2 failed: iteration counts above 100000 are not supported"),
    );
    const check = await checkPassword(stored, PASSWORD, SALT, PBKDF2);
    expect(check.ok).toBe(false);
    expect(check.unsupported).toMatch(/cannot compute PBKDF2 with 100000 iterations/);
  });
});

describe("the policy", () => {
  it("defaults to PBKDF2 at OWASP's 600,000 iterations", () => {
    expect(OWASP_PBKDF2_SHA256_ITERATIONS).toBe(600_000);
    expect(passwordHashPolicyFromEnv({})).toEqual({ mode: "pbkdf2", iterations: 600_000 });
  });

  it("caps the default at a runtime's declared limit (Cloudflare Workers: 100,000)", () => {
    setPbkdf2IterationLimit({ iterations: CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS, runtime: "Cloudflare Workers" });
    expect(passwordHashPolicyFromEnv({})).toEqual({ mode: "pbkdf2", iterations: 100_000 });
    expect(() => passwordHashPolicyFromEnv({ DECKO_PASSWORD_PBKDF2_ITERATIONS: "600000" })).toThrow(
      /exceeds the PBKDF2 limit of Cloudflare Workers/,
    );
  });

  it("reads the mode and the count, and refuses values it cannot honour", () => {
    expect(passwordHashPolicyFromEnv({ DECKO_PASSWORD_HASH: "legacy-sha1" }).mode).toBe("legacy-sha1");
    expect(passwordHashPolicyFromEnv({ DECKO_PASSWORD_PBKDF2_ITERATIONS: "750000" }).iterations).toBe(750_000);
    expect(() => passwordHashPolicyFromEnv({ DECKO_PASSWORD_HASH: "sha1" })).toThrow(/legacy-sha1/);
    expect(() => passwordHashPolicyFromEnv({ DECKO_PASSWORD_PBKDF2_ITERATIONS: "1000" })).toThrow(/at least 100000/);
    expect(() => passwordHashPolicyFromEnv({ DECKO_PASSWORD_PBKDF2_ITERATIONS: "6e5" })).toThrow(/whole number/);
  });

  it("an explicitly configured policy wins over the environment", () => {
    configurePasswordHashing(LEGACY);
    expect(passwordHashPolicy()).toEqual(LEGACY);
  });
});
