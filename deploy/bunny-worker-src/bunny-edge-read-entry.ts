// deploy/bunny-worker-src/bunny-edge-read-entry.ts — the READ-ONLY Bunny edge
// script: anonymous page reads, everything else forwarded to the full engine
// script (see bunny-edge-read-handler.ts for what is served and what is
// forwarded, and why). Built by tools/bundle-bunny-edge-engine.mjs into
// deploy/dist/bunny-edge-read.bundle.js / .code.json.
//
// Variables beyond the full script's: DECKO_EDGE_FULL_URL, the full engine
// script's own address (for example https://<its pull zone>.b-cdn.net).

// First import: its top level evaluates before the rest of the graph
// (bunny-edge-isolate-probe.ts; measurement only, armed by a variable).
import { probeModuleReady } from "./bunny-edge-isolate-probe.js";
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";

import { handleBunnyReadRequest, type EdgeEnv } from "./bunny-edge-read-handler.js";

probeModuleReady();

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  const env = process.env as EdgeEnv;
  return await handleBunnyReadRequest(request, env);
});
