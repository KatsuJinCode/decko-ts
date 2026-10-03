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
  return {
    fetchRenderCard: (name: string) => engine.fetchRenderCard(name),
    isDenied: (card: unknown) => engine.isDenied(card as RenderCard),
    batch: (statements) => fetcher.driver.batch([...statements]),
    codenames: fetcher.codenames,
    fetchById: (id: number) => fetcher.fetchById(id),
    // render.ts cacheFetchedRecord (private): writes the fetch cache + the
    // enriched render-card map - the only write path into the sync render
    // surface.
    cacheFetchedRecord: async (record: unknown) => {
      await (engine as unknown as {
        cacheFetchedRecord(record: CardRecord): Promise<void>;
      }).cacheFetchedRecord(record as CardRecord);
    },
    // db-roundtrip-elimination lane (W1): the warms' own-rows composer.
    // prefetch.ts composeAndCacheSqlRows over the engine's own cache write
    // seam; the driver + lexicon come from the fetcher, the same objects the
    // fetch ladder would have used, so the records are value-identical to
    // the fetchById storm's (see the interface doc).
    composeAndCacheRows: async (rows) => {
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
