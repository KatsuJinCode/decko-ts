// The workerd cold-first-POST isolate-abort canary.
//
// WHAT THIS FILE EXISTS FOR
//   workerd 1.20260918.1 aborts an isolate mid-response when the FIRST
//   request the isolate's process handles is a POST whose handler answers
//   WITHOUT any completed network I/O: the client's body stream dies with
//   `terminated` and an empty 500 ships instead of the handler's response.
//   The handler runs to completion first — the abort happens between the
//   handler's return and the body flush, with no error event and no
//   unhandled rejection. Measured against this repo's real edge bundles on
//   2026-10-09 (the write-path-cold-start lane):
//
//     - the Bunny engine bundle, DECKO_WRITE_PATH=1, no DB credentials,
//       cold first POST /update/*signin  ->  the honest 403 guard never
//       ships; the isolate dies (`TypeError: terminated`);
//     - the same bundle with DB credentials present  ->  the sign-in ladder
//       performs its boot I/O first and always survived — the armed write
//       path was never the casualty, the no-I/O guard shape was;
//     - any completed fetch before the response (the read bundle's forward
//       with DECKO_EDGE_FULL_URL set, the deck boot) avoids the abort;
//     - only the FIRST workerd instance of a process is affected, which is
//       why this file keeps exactly one Miniflare instance and why vitest's
//       per-file fork isolation matters: this file's first instance must be
//       the canary's.
//
//   Fixed upstream by workerd 1.20261006.1: the identical repro answers the
//   honest guard there. The repo's miniflare pin carries the fix; this file
//   FAILS if the pin ever regresses below it (or any future workerd breaks
//   the same shape), which is the gate gap the 2026-10-09 demo incident
//   exposed: the seven-step battery only ever GETs, so a guard-path POST
//   crash shipped on every bundle build undetected.
//
// WHY THE GUARD SHAPE AND NOT THE SIGN-IN LADDER
//   The sign-in ladder always performs the deck boot's I/O before
//   answering, so it cannot trigger the abort — the guard shape (a sync
//   403 with no DB round trip) is the only POST path that can, and it is
//   reachable in production by a misconfiguration (credentials missing).
//   The abort converts that operator error into a connection termination,
//   hiding the honest 403. The committed sign-in POST gate lives in
//   tests/deploy/bunny-edge-bundles-workerd-post-gate.test.ts.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { coffeescriptNodeBuiltinStubs } from "../../tools/vendor/coffeescript-edge-bundler-stubs.mjs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENTRY = `${REPO_ROOT}deploy/bunny-worker-src/bunny-edge-engine-entry.ts`;

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "decko-canary-"));
});

afterAll(() => {
  if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
});

/** Bundle the REAL edge entry exactly the way the deploy tool does
 *  (tools/bundle-bunny-edge-engine.mjs) — same options, temp output so
 *  concurrent vitest forks cannot collide on deploy/dist. The bundler
 *  settings are the deployed artifact's; keep the two in step. */
async function buildEngineBundle(): Promise<string> {
  const outfile = join(workDir, "bunny-edge-engine.bundle.js");
  await build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    // Resolution is cwd-dependent for the aliased @cf-wasm/photon entry;
    // pin it to the repo so the gate runs from any working directory.
    absWorkingDir: REPO_ROOT,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    external: [
      ...builtinModules,
      ...builtinModules.map((n) => `node:${n}`),
      "@bunny.net/edgescript-sdk",
    ],
    conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"],
    alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
    // The coffeescript subtree requires fs/vm/path for helpers compile()
    // never touches — the same stubs the deploy tool bundles with. Without
    // them the built engine bundle dies at module load in workerd.
    plugins: [coffeescriptNodeBuiltinStubs()],
    logLevel: "silent",
    banner: { js: 'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];' },
  });
  return outfile;
}

/** The workerd harness the measurement scripts use: the bundle's
 *  `BunnySDK.net.http.serve(handler)` is captured by a shim module and the
 *  Miniflare default export delegates fetch to the captured handler. */
function workerdModules(bundlePath: string) {
  const bundle = readFileSync(bundlePath, "utf8")
    .replace(/(["'])@bunny\.net\/edgescript-sdk\1/g, '"./sdk-shim.mjs"');
  return [
    {
      type: "ESModule" as const,
      path: "main.mjs",
      contents: `import { __served } from "./sdk-shim.mjs";
import "./bundle.mjs";
export default { async fetch(request) { return await __served.fn(request); } };`,
    },
    {
      type: "ESModule" as const,
      path: "sdk-shim.mjs",
      contents: `export const __served = { fn: undefined };
export const net = { http: { serve(a, b) { __served.fn = typeof a === "function" ? a : b; } } };
export default { net };`,
    },
    { type: "ESModule" as const, path: "bundle.mjs", contents: bundle },
  ];
}

describe("workerd cold-first-POST no-I/O guard canary", () => {
  it("the armed engine bundle's first POST answers the honest 403 guard when no DB credentials are set", async () => {
    const bundlePath = await buildEngineBundle();
    const modules = await workerdModules(bundlePath);
    // THE ONLY MINIFLARE INSTANCE THIS FILE EVER CREATES: the canary's
    // abort needs the process's FIRST workerd instance. No DB credentials
    // on purpose — the guard path is the no-I/O answer.
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules,
        compatibilityDate: "2026-09-01",
        compatibilityFlags: ["nodejs_compat"],
        bindings: { DECKO_WRITE_PATH: "1" },
      }) as never,
    );
    try {
      const res = await mf.dispatchFetch("https://edge.test/update/*signin", {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://edge.test" },
        body: "utf8=%E2%9C%93&_method=patch",
      });
      // On the broken runtime this line is never reached: dispatchFetch
      // rejects with `TypeError: terminated` and the isolate is gone.
      expect(res.status).toBe(403);
      const body = (await res.text()) as unknown as string;
      expect(body).toContain("read-only");
      const serverTiming = res.headers.get("server-timing");
      expect(serverTiming).toContain("total");
    } finally {
      await mf.dispose();
    }
  });
});
