// tools/vendor/gzip-inline-wasm-blobs-esbuild-plugin.mjs — the esbuild plugin
// that stores the Bunny builds' inline WebAssembly blobs gzip-compressed.
//
// WHY IT EXISTS: each source module exports one base64-encoded WebAssembly
// binary (LibSass and the photon image resizer); gzip (level 9) cuts the two of
// them by about 2.9 MB together. The Deno-based edge runtime inflates them with
// DecompressionStream (verified on staging script 96895, 2026-10-16), and the
// bytes after inflation are identical to the source module's, so behaviour does
// not change. Without this the release bundle (9,998,789 bytes) fails to boot on
// Bunny: see the budget in tools/vendor/edge-bundle-budget.mjs.
//
// IT LIVES HERE, NOT IN tools/bundle-bunny-edge-engine.mjs, so the benchmark
// that measures its cost at module evaluation
// (benchmarks/edge-cold-start/measure-static-vs-dynamic-import-of-gzip-inlined-wasm.mjs)
// drives the SAME plugin the builds use rather than a copy that can drift from
// it. The bundler imports it from here.
//
// WHAT THE PLUGIN EMITS, and the cost that implies: the module body is a
// TOP-LEVEL AWAIT. The inflate therefore runs when the module graph is
// evaluated. Whether that is on the isolate's critical path — before the edge's
// first byte — depends entirely on whether the importer reaches the module
// statically or dynamically:
//
//   - a STATIC import puts it on the boot path: measured p50 101.5 ms of
//     module evaluation on this machine for the LibSass blob alone (Node 24,
//     win32; see the benchmark's own artifact for the Bunny-runtime caveat).
//   - a DYNAMIC import lets esbuild wrap the module body in its lazy init
//     closure, so the inflate waits for the first caller.
//
// The bytes are identical either way; only WHEN they are inflated changes.

import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

/** Inline WebAssembly blobs the Bunny builds store gzip-compressed. */
export const GZIPPED_INLINE_BLOBS = [
  { filter: /libsass-3\.6\.4-wasm-base64\.js$/, exports: "base64" },
  { filter: /photon_rs_bg\.wasm\.inline\.js$/, exports: "arrayBuffer" },
];

export function gzipInlineWasmBlobsPlugin() {
  return {
    name: "gzip-inline-wasm-blobs",
    setup(build) {
      for (const blob of GZIPPED_INLINE_BLOBS) {
        build.onLoad({ filter: blob.filter }, async (args) => {
          const source = (await import(pathToFileURL(args.path).href)).default;
          const raw = typeof source === "string" ? Buffer.from(source, "base64") : Buffer.from(source);
          const gzipped = gzipSync(raw, { level: 9 }).toString("base64");
          const inflate = [
            `const GZIPPED_BINARY_B64 = "${gzipped}";`,
            "const inflated = await (async () => {",
            "  const bin = typeof Uint8Array.fromBase64 === \"function\"",
            "    ? Uint8Array.fromBase64(GZIPPED_BINARY_B64)",
            "    : Uint8Array.from(atob(GZIPPED_BINARY_B64), (c) => c.charCodeAt(0));",
            "  const stream = new DecompressionStream(\"gzip\");",
            "  const writer = stream.writable.getWriter();",
            "  writer.write(bin);",
            "  writer.close();",
            "  return new Uint8Array(await new Response(stream.readable).arrayBuffer());",
            "})();",
          ].join("\n");
          const exported = blob.exports === "base64"
            ? "export default await (async () => { let s = \"\"; for (let i = 0; i < inflated.length; i += 0x8000) s += String.fromCharCode.apply(null, inflated.subarray(i, i + 0x8000)); return btoa(s); })();"
            : "export default inflated.buffer;";
          return { contents: inflate + "\n" + exported + "\n", loader: "js" };
        });
      }
    },
  };
}
