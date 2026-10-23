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
import { localMailServices } from "./bunny-edge-local-mail.js";
import { setRaiseAllRenderingErrors } from "../../src/card/render/format.js";

probeModuleReady();

// THE SERVING POSTURE IS RUBY'S PRODUCTION POSTURE, set here at boot.
//
// Ruby sets it false in production: card/lib/cardio/railtie.rb:38
// `config.raise_all_rendering_errors = false`. That switch is one half of
// error.rb:65-67's `loud_error?` (`focal? ||
// config.raise_all_rendering_errors`), so with it false a render raise
// becomes the quiet render-error span (format/error.rb:80-86) and the PAGE
// still answers. A Date card whose content cannot parse is the measured
// case: Ruby raises Date::Error internally (stdlib Date.parse) and the
// rendered page carries the "(core view)" quiet span
// (tests/card/render/date-dashed-two-component-raise-pins.test.ts:9-12).
//
// Without this call the edge ran LOUD, because the library default is loud
// (src/card/render/format.ts:688 `let raiseAllRenderingErrors = true`).
// format.ts:1417 and :2206 then re-raised instead of returning the span, the
// raise escaped the page, and the edge answered Decko's server_error page
// with a 500. The signed-in run of 2026-10-22 recorded exactly that: "GET
// /Harness_date_... 500" beside its own log line
// "[bunny-edge-error-page] render failed for Harness date ...: invalid date".
//
// THE LIBRARY DEFAULT STAYS LOUD. This is the boot; src/card/render/format.ts
// is not changed, so direct render calls (unit tests, the reference runners)
// keep raising exactly as they do now, and the harness adapters
// (vm-staging-server.mjs:135, reference-harness/adapters/*) still set false
// themselves and are unaffected.
setRaiseAllRenderingErrors(false);

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  const env = process.env as EdgeEnv;
  // The local mail capture seat: {} unless DECKO_LOCAL_MAIL=1 (the deployed
  // script never sets it, so production composition is unchanged; see
  // bunny-edge-local-mail.ts).
  return await handleBunnyEngineRequest(request, env, localMailServices(env, request.url));

});
