// The host-side half of Ruby's post-save expiry: after a successful write,
// every render engine holding the saved card's pre-save state must drop it.
//
// Ruby mechanism (the semantics this seam implements): Card#expire runs in
// the after_commit integration phase — card-1.110.0
// lib/card/director/phases.rb:3 (after_commit :integration_phase) and :54
// (`@card.expire unless Cardio.delaying?`) — i.e. expiry rides EVERY
// committed save, unconditional on request format or response shape. What
// expire covers is Cache::All#expire (lib/card/cache/all.rb:17-24):
// expire_views, expire_names, expire_id, expire_left. The TS model layer
// ports that per save (card-action-engine.ts expireAfterWrite ->
// FetchEngine#expireCard), but that only reaches the fetch-layer card
// cache on the shared FetchEngine. The per-engine enriched render-card maps
// are a TS render-perf structure with no Ruby counterpart (render.ts
// "Save-side invalidation" note on expireRenderCard): Ruby's expired Card
// objects simply re-fetch, while a warm RenderEngine re-renders from its
// renderCards map (closureWarm is map-presence-only, render.ts closureWarm)
// until expireRenderCard drops the key. The host must therefore expire
// those maps explicitly for the boot engine and every signed-in engine.
//
// Extracted from the deployed dispatch (vm-staging-server.mjs post-write
// block) so the gate under test IS the gate the server runs; the deployed
// block's Location-header gate is replaced by the mutation point's
// expiryName (see expireRenderCachesAfterSave).

import type { FetchEngine } from "../card/fetch.js";
import type { WriteRouteResponse } from "./write-routes.js";

/** The render engines a save must invalidate: the shared fetch engine, the
 *  boot (anonymous) render engine, and every per-actor signed-in render
 *  engine. Structural: RenderEngine satisfies the engine shape as-is. */
export interface RenderCacheEngines {
  /** FetchEngine#expireName drops the fetched-card cache entry
   *  (cache/card_class.rb#expire). */
  fetcher: FetchEngine;
  /** The boot render engine (vm-staging-server.mjs `render`). */
  renderEngine: { expireRenderCard(name: string): void };
  /** The per-actor signed-in render engines
   *  (vm-staging-server.mjs signedInEngines). */
  signedInEngines: Iterable<{ expireRenderCard(name: string): void }>;
}

/** Expire the saved card's render caches after one write response. The
 *  gate keys on the successful-mutation point's expiryName — the saved
 *  card's name successResponse stamps on EVERY success flavor — never on
 *  the response's HTTP shape: a JSON save's 200 carries no Location
 *  header, and gating on Location is what let JSON saves leave every warm
 *  render engine serving pre-save bytes (reproduced by
 *  tests/server/post-save-cache-expiry.test.ts before the fix). */
export function expireRenderCachesAfterSave(
  engines: RenderCacheEngines,
  writeResponse: WriteRouteResponse,
): void {
  if (writeResponse.status < 200 || writeResponse.status >= 400) return;
  const name = writeResponse.expiryName;
  if (name === undefined || name === "") return;
  engines.fetcher.expireName(name);
  // the enriched render-card maps live on the RENDER engines (the
  // fetch-layer expiry above cannot reach them)
  engines.renderEngine.expireRenderCard(name);
  for (const engine of engines.signedInEngines) {
    engine.expireRenderCard(name);
  }
}
