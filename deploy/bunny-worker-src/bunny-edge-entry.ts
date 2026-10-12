// deploy/bunny-worker-src/bunny-edge-entry.ts — the module that is actually
// deployed to bunny.net as a STANDALONE Edge Script. Kept separate from
// bunny-worker.ts so the handler stays importable (and unit-testable) with no
// side effects: importing this file STARTS THE SERVER.
//
// Shape, per https://bunny.net/docs/scripting/standalone/overview.md
// ("The serve function"):
//
//   import * as BunnySDK from "@bunny.net/edgescript-sdk";
//   BunnySDK.net.http.serve(async (request: Request) => new Response("hi"));
//
// What serve() does on each runtime, read out of the published package
// @bunny.net/edgescript-sdk@0.13.0 (npm tarball, esm/lib.mjs and
// esm-bunny/lib.mjs):
//
//   switch (runtime) {
//     case "bunny": return Bunny.v1.serve(handler), {};
//     case "deno":  return Deno.serve({port, hostname}, handler), {};
//     case "node":  return listener.serve(handler);   // @hono/node-server
//   }
//
// So the same file runs unchanged under `deno run -A` locally
// (standalone/overview.md, "Local development") and on the edge.
//
// ENVIRONMENT: process.env (Node-style) or Deno.env, per
// https://bunny.net/docs/scripting/environment-variables.md and
// https://bunny.net/docs/scripting/secrets.md.
// Deno in the Bunny runtime exposes `process` (the database-connection doc
// example at https://bunny.net/docs/database/connect/scripting.md imports
// `node:process` and reads process.env in an Edge Script), so process.env is
// the one spelling used here.

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import process from "node:process";

import { handleRequest } from "./bunny-worker.js";

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  return await handleRequest(request, process.env as Record<string, string | undefined>);
});
