// Post-save expiry: after a successful write, every render engine holding
// the saved card's pre-save state must drop it.
//
// WHY THE HOST HAS TO DO IT. Expiry rides every committed save — it does not
// depend on request format or response shape — and the model layer already
// runs it per save (card-action-engine.ts expireAfterWrite ->
// FetchEngine#expireCard). But that only reaches the fetch-layer card cache
// on the shared FetchEngine. The per-engine enriched render-card maps are a
// render-performance structure with a second failure mode: a cache that
// holds a pre-save Card simply re-fetches when invalidated, whereas a warm
// RenderEngine re-renders straight from its renderCards map
// (closureWarm is map-presence-only) and will keep serving those bytes until
// expireRenderCard drops the key. Nothing else drops it, so the host has to
// expire those maps explicitly — for the boot engine and for every
// signed-in engine.
//
// This is the same gate the server runs, extracted so the gate under test IS
// the gate in production.

import type { FetchEngine } from "../card/fetch.js";
import type { WriteRouteResponse } from "./write-routes.js";

/** The render engines a save must invalidate: the shared fetch engine, the
 *  boot (anonymous) render engine, and every per-actor signed-in render
 *  engine. Structural: RenderEngine satisfies the engine shape as-is. */
export interface RenderCacheEngines {
  /** FetchEngine#expireName drops the fetched-card cache entry. */
  fetcher: FetchEngine;
  /** The boot (anonymous) render engine. */
  renderEngine: { expireRenderCard(name: string): void };
  /** The per-actor signed-in render engines. */
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
  // The signed-in list materializes ONCE: this fan-out walks it twice (the
  // saved card's name here, every expiryNames entry below), and the Iterable
  // the host passes (the signed-in engines Map's values iterator) exhausts
  // on the first walk — the second loop then iterates nothing, and the
  // signed-in engines' render maps kept every expiryNames entry warm (a
  // renamed card's BEFORE name kept answering known off the pre-rename
  // map entry; a changed subcard likewise on the account forms). An array
  // is re-iterable, which is all the fan-out needs.
  const signedInEngines = Array.from(engines.signedInEngines);
  engines.fetcher.expireName(name);
  // the enriched render-card maps live on the RENDER engines (the
  // fetch-layer expiry above cannot reach them)
  engines.renderEngine.expireRenderCard(name);
  for (const engine of signedInEngines) {
    engine.expireRenderCard(name);
  }
  // The save's SUBCARDS are cards too (subcards.rb — each saves as its own
  // card with its own post-commit expire): a changed +*email child whose
  // enriched entry stays warm renders its pre-save value on the mark's
  // page (the account-change journeys' residual). A rename's BEFORE name
  // rides the same list (expire_names covers both key versions,
  // cache/all.rb:104-108 — the write route stamps it on the response).
  for (const sub of writeResponse.expiryNames ?? []) {
    if (sub === undefined || sub === "") continue;
    engines.fetcher.expireName(sub);
    engines.renderEngine.expireRenderCard(sub);
    for (const engine of signedInEngines) {
      engine.expireRenderCard(sub);
    }
  }
}
