// Web-standard stand-in for "node:crypto", applied ONLY at bundle time via
// the [alias] table in deploy/wrangler.toml (production) and the equivalent
// vite resolve.alias in tests/deploy/deploy-worker-miniflare.test.ts (local
// proof).
//
// WHY THIS EXISTS (the honest compatibility note): the render engine's slot
// emitter (src/card/render/slot-html.ts, newSlotId) imports randomBytes from
// node:crypto. That is the ONLY Node API on the whole worker module graph
// (audited 2026-09-20; see docs/deploy-cloudflare.md). Workers have no node:crypto
// unless the nodejs_compat flag is on, and the deploy target here is
// deliberately Web-standard-only. Rather than editing src/, the bundler
// replaces the "node:crypto" module with this shim.
//
// Contract pinned by the replay harness (docs/parity-method.md):
// randomBytes(10).toString("hex") is exactly 20 lowercase hex chars — the
// SecureRandom.hex(10) slot-id shape.

/** The only member the engine graph actually uses. Returns an object that
 *  quacks like a Buffer for the .toString() calls slot-html makes. */
export function randomBytes(size: number): { toString(encoding?: string): string } {
  if (!Number.isInteger(size) || size < 0) {
    throw new TypeError(`randomBytes size must be a non-negative integer, got ${size}`);
  }
  const bytes = new Uint8Array(size);
  // Web Crypto caps getRandomValues at 65536 bytes per call; chunk the fill.
  const MAX_CHUNK = 0x10000;
  for (let filled = 0; filled < size; ) {
    const end = Math.min(filled + MAX_CHUNK, size);
    crypto.getRandomValues(bytes.subarray(filled, end));
    filled = end;
  }
  return {
    toString(encoding = "utf8"): string {
      if (encoding === "hex") {
        let out = "";
        for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
        return out;
      }
      if (encoding === "base64") {
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      }
      return new TextDecoder().decode(bytes);
    },
  };
}

/** Some bundler shims also get a default export for interop; cheap to carry. */
export default { randomBytes };
