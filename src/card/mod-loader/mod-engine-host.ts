// The composition seam that adapts a RenderEngine + FetchEngine pair to the
// ModEngineHost surface mod prepareEngine hooks use. The engine's private
// cacheFetchedRecord is reached through the established cast pattern (same
// shape as help-popover.ts's RenderEngineHelpHost seam); the casts live HERE
// so mods and tests never cast themselves.

import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import type { RenderCard } from "../render/format.js";
import { composeAndCacheSqlRows } from "../render/prefetch.js";
import type { ModEngineHost } from "./mod-manifest.js";

/** The engine members the host needs (structural; RenderEngine satisfies
 *  it, with cacheFetchedRecord reached through the cast below). */
interface ModEngineLike {
  fetchRenderCard(name: string): RenderCard | undefined;
  isDenied(card: RenderCard): boolean;
}

/** Build a ModEngineHost over one engine + its fetcher. */
export function modEngineHost(
  engine: ModEngineLike,
  fetcher: FetchEngine,
): ModEngineHost {
  // The seat-enrichment invariant: engine.cacheFetchedRecord -> enrichAndStore
  // reads the ENGINE'S OWN fetcher codename registry synchronously (render.ts
  // enrichAndStore: typeCode = this.fetcher.codenames.peekNameForId(typeId)) —
  // never the host fetcher's. An engine whose codenames were never loaded (a
  // fresh RenderEngine over its own FetchEngine — the multi-actor harness
  // shape) seated every warm row with typeCode undefined, closureWarm's SEARCH
  // gate (the SEARCH_TYPE_CODE match) then mis-fired on the seated search
  // cards, the cold batch was skipped, the *default/*structure universes never
  // loaded, preloadDefaultTypeNames latched an EMPTY defaultTypeNameById, and
  // newCardDefaultType degraded every nest-miss child to the raw phantom
  // constants (the card-mod-search-list oracle's BasicCs-vs-RichText byte
  // divergence on the tova/anonymous arms). Both seat paths below therefore
  // ensure the engine's registry is loaded first; ensureLoaded is memoized
  // (one codehash read per registry, a no-op once loaded).
  const ensureEngineCodenamesLoaded = async (): Promise<void> => {
    const engineFetcher = (engine as unknown as {
      fetcher?: { codenames?: { ensureLoaded(): Promise<void> } };
    }).fetcher;
    await engineFetcher?.codenames?.ensureLoaded();
  };
  return {
    fetchRenderCard: (name: string) => engine.fetchRenderCard(name),
    isDenied: (card: unknown) => engine.isDenied(card as RenderCard),
    batch: (statements) => fetcher.driver.batch([...statements]),
    codenames: fetcher.codenames,
    fetchById: (id: number) => fetcher.fetchById(id),
    fetchByName: (name: string) => fetcher.fetchByName(name),
    // render.ts cacheFetchedRecord (private): writes the fetch cache + the
    // enriched render-card map - the only write path into the sync render
    // surface.
    cacheFetchedRecord: async (record: unknown) => {
      await ensureEngineCodenamesLoaded();
      await (engine as unknown as {
        cacheFetchedRecord(record: CardRecord): Promise<void>;
      }).cacheFetchedRecord(record as CardRecord);
    },
    // db round-trip elimination: the warms' own-rows composer.
    // prefetch.ts composeAndCacheSqlRows over the engine's own cache write
    // seam; the driver + lexicon come from the fetcher, the same objects the
    // fetch ladder would have used, so the records are value-identical to
    // the fetchById storm's (see the interface doc).
    composeAndCacheRows: async (rows) => {
      await ensureEngineCodenamesLoaded();
      const composed = await composeAndCacheSqlRows(
        rows as unknown as Parameters<typeof composeAndCacheSqlRows>[0],
        {
          driver: fetcher.driver,
          lexicon: fetcher.lexicon,
          cacheRecord: async (record: CardRecord) => {
            await (engine as unknown as {
              cacheFetchedRecord(record: CardRecord): Promise<void>;
            }).cacheFetchedRecord(record);
          },
        },
      );
      return composed as unknown as Array<{
        id?: number;
        name?: { s: string };
        key?: string;
        leftId?: number | null;
        rightId?: number | null;
      }>;
    },
  };
}
