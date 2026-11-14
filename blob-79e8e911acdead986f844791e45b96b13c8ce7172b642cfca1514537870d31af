// benchmarks/speed/worker-entry.ts — the port as a Cloudflare Worker over a
// D1 binding: the request path of port-handler.ts with CloudflareD1Adapter
// (the deploy's D1 seam) as its driver. Built by benchmarks/speed/build.mjs
// with the deploy bundle's esbuild settings and run in workerd (Miniflare)
// by benchmarks/speed/run.mjs; `wrangler deploy` of the same bundle serves
// it from Cloudflare (docs/speed.md, "Running it against a hosted edge").
//
// Bindings: DB (D1), DECKO_BENCH_HOP_MS (optional, simulated database hop).

import { CloudflareD1Adapter, type D1DatabaseLike } from "../../src/server/drivers/d1.js";
import { HopDriver, portHandler } from "./port-handler.js";

interface Env {
  DB: D1DatabaseLike;
  DECKO_BENCH_HOP_MS?: string;
}

let handle: ((request: Request) => Promise<Response>) | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    handle ??= portHandler(new HopDriver(new CloudflareD1Adapter(env.DB), Number(env.DECKO_BENCH_HOP_MS ?? 0)));
    return handle(request);
  },
};
