// Environment reads that are safe on every runtime. Node exposes `process`;
// Workers without nodejs_compat and some edge runtimes do not, and there a
// bare `process.env` throws ReferenceError. Engine code reachable from an
// edge entry reads its settings through these two functions, never through
// `process` directly (tests/deploy/deploy-worker-miniflare.test.ts checks
// the demo Worker bundle for this).
//
// Read per call so a test or a probe can toggle a setting without reloading
// modules.

/** The value of an environment variable, or undefined where the runtime has
 *  no `process` (every setting then takes its default). */
export function envValue(name: string): string | undefined {
  if (typeof process === "undefined" || typeof process.env !== "object") return undefined;
  return process.env[name];
}

/** An opt-in flag: on only when its environment variable is exactly "1";
 *  runtimes without `process` read every flag as off. */
export function debugFlag(name: string): boolean {
  return envValue(name) === "1";
}
