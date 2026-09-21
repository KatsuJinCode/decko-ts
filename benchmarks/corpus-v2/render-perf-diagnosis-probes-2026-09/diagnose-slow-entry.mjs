// Diagnostic: find pathologically slow corpus replay entries.
// Loads shard 0, seeds the render storage, times each entry individually,
// prints the slowest entries. Node-only (no vitest), via tsx-free direct
// import of the built modules? -- no build step in this repo; run through
// vitest's node API instead? Simplest: run with node --experimental-strip-types
// is unreliable on Windows; instead this script shells the timing through
// plain JS using the same storage modules via dynamic import (they are ESM
// TypeScript-only...). Therefore: this script duplicates the seeding in JS
// and drives the RENDER engine through vitest's exported engine classes via
// tsimport? -- pragmatic answer: run under `npx vitest run` as a .ts test.
// See diagnose-slow-entry.test.ts in the same directory.

console.error("use diagnose-slow-entry.test.ts (vitest driver) instead");
process.exit(1);
