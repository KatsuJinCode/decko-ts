// deploy/bunny-worker-src/bunny-edge-engine-entry.ts — the FULL decko render
// engine deployed as a Bunny Edge Scripting STANDALONE script.
//
// This is the engine counterpart of bunny-edge-entry.ts (the lightweight
// reader that shipped before this entry). Same platform contract, read out of
// the same sources (see that file's header for the citations):
//
//   import * as BunnySDK from "@bunny.net/edgescript-sdk";
//   BunnySDK.net.http.serve(async (request: Request) => new Response("hi"));
//
// The handler receives ONLY a Request (no env argument); secrets arrive as
// environment globals read via process.env.
//
// WHAT MAKES THIS "THE FULL ENGINE" (vs the reader in bunny-worker.ts):
//   - RenderEngine + FetchEngine (src/card/render.ts + src/card/fetch.ts) —
//     the same objects worker.ts boots on Cloudflare Workers, with the same
//     URL dispatch (parsePath, carried by the lineage surface the
//     engine-request dispatch imports — bunny-edge-lineage-worker-surface.ts
//     — the entries' shared route grammar) and the same full layout shell
//     (layoutPage, likewise imported).
//   - The database seam is BunnyDbDriver
//     (src/card/drivers/bunny-db.ts): Hrana v2 over plain fetch against the
//     Bunny Database /v2/pipeline endpoint — no npm client, no node builtins
//     in the driver itself.
//   - Read-only: the write surface (sign-in, /setup, card writes) is NOT
//     armed. Non-GET/HEAD verbs answer 403, matching the Cloudflare worker's
//     behavior with both DECKO_WRITE_PATH and DECKO_FIRST_RUN unset.

//
// RUNTIME FACTS THIS ENTRY DEPENDS ON (verified empirically on the deployed
// edge unless cited):
//   - The reader bundle imports node:process and runs — the
//     Bunny runtime resolves node: imports (deploy/bunny-edge-deployment-runbook.md
//     section 5 cites the docs for env-via-process.env).
//   - The bundled graph retains exactly these node: imports, each with a
//     stated dependency: node:crypto (request-time randomBytes in
//     src/card/render/slot-html.ts — must WORK per render), node:fs +
//     node:url (module-load resolution only; the reads in
//     src/card/render/bootstrap-code-files.ts are lazy + memoized and fire
//     only when rendering the bootstrap SCSS cards), node:net + node:tls
//     (module-load resolution only; the SMTP transport is write-path only
//     and is never constructed on this read-only edge).
//
// ROUTES (the worker.ts surface, plus the reader's /_status health route):
//   GET /                  -> render "Home" :open in the full layout shell
//   GET /<name>            -> render <name> :open
//   GET /<name>/<view>     -> render <name> <view> (the shared read grammar)
//   GET /new/<type>        -> the create form for a new card of <type>
//                             (200 may-create / 403 denied / 404 unknown type
//                             — bunny-edge-new-card-form.ts)
//   GET /_status           -> JSON health (db_ok, card_count, env var NAMES)
//   GET /api/status        -> JSON health (worker.ts shape)
//   GET /api/card/<name>   -> JSON metadata (worker.ts shape)
//   anything else          -> 404 (layout shell); non-GET/HEAD -> 403
//
// THE HANDLER LIVES IN bunny-edge-engine-handler.ts: this file calls
// BunnySDK.net.http.serve at module scope, which made it un-importable for
// tests (the SDK is an edge-runtime dependency, not installed here). The
// handler module carries the entire request surface and is the file tests
// drive (tests/deploy/bunny-edge-engine-handler-parity.test.ts); this
// entry is the SDK registration shim the edge bundles.


// First import: its top level evaluates before the rest of the graph
// (bunny-edge-isolate-probe.ts; measurement only, armed by a variable).
import { probeModuleReady } from "./bunny-edge-isolate-probe.js";
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";

import { handleBunnyEngineRequest, type EdgeEnv } from "./bunny-edge-engine-handler.js";

probeModuleReady();

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  const env = process.env as EdgeEnv;
  return await handleBunnyEngineRequest(request, env);

});
