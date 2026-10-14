// The read-time asset refresh a host runs before it renders a request, with
// Ruby's trigger.
//
// Ruby's CardController::Rest#setup (decko-0.20.0 lib/card_controller/rest.rb:31-35)
// runs Card::Cache.renew, then Card::Assets.refresh unless the request is for
// an explicit file, then Card::Env.reset. Card::Assets.refresh returns unless
// `force || refresh?` (card-mod-assets lib/card/assets.rb:13-14), and refresh?
// reads Cardio.config.asset_refresh (assets.rb:74-83):
//
//   :eager     refresh on every request
//   :never     never refresh
//   :cautious  refresh only once the shared cache is in use and holds no
//              REFRESHED marker; the first such request writes the marker
//              (assets.rb:86-91, and it returns false when the shared cache
//              is off, assets.rb:87)
//
// A deployed Decko runs :cautious. The railtie sets it (card-1.110.0
// lib/cardio/railtie.rb:34), and card-1.110.0 config/environments/production.rb
// sets no value, so the railtie default holds. :eager comes only from the
// development environment (card-1.110.0 config/environments/development.rb:10).
//
// The marker lives in the shared cache, which every process of a deployed site
// reads. A host here keeps the marker in its own memory: one per host process
// (or per isolate on an edge runtime). The refresh runs once per such host
// process, which matches Ruby's behaviour for a single process.

export type AssetRefreshMode = "eager" | "cautious" | "never";

export interface ReadAssetRefreshOptions {
  /** Cardio.config.asset_refresh. A deployed site is :cautious. */
  readonly mode: AssetRefreshMode;
  /** Cardio.config.shared_cache (card-1.110.0 lib/cardio/railtie.rb:32, true by default). A :cautious refresh needs it (assets.rb:87). */
  readonly sharedCache?: boolean;
  /** The refresh itself: CardActionEngine.refreshReadAssetInputs. */
  readonly refresh: () => Promise<void>;
}

export interface ReadAssetRefresh {
  /** Run before a request renders. `explicitFile` is Ruby's params[:explicit_file]
   *  (rest.rb:33): an asset-file request skips the refresh. Resolves true when a
   *  refresh ran for this request. */
  beforeRead(request?: { readonly explicitFile?: boolean }): Promise<boolean>;
}

export function createReadAssetRefresh(options: ReadAssetRefreshOptions): ReadAssetRefresh {
  const sharedCache = options.sharedCache ?? true;
  // Ruby's Card.cache REFRESHED marker, held by this host process.
  let refreshed = false;

  const refreshesNow = (): boolean => {
    switch (options.mode) {
      case "eager":
        return true;
      case "never":
        return false;
      case "cautious":
        if (!sharedCache) return false;
        if (refreshed) return false;
        refreshed = true;
        return true;
    }
  };

  return {
    async beforeRead(request = {}) {
      if (request.explicitFile === true) return false;
      if (!refreshesNow()) return false;
      await options.refresh();
      return true;
    },
  };
}
