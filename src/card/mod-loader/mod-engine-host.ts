// The composition seam that adapts a RenderEngine + FetchEngine pair to the
// ModEngineHost surface mod prepareEngine hooks use. The engine's private
// cacheFetchedRecord is reached through the established cast pattern (same
// shape as help-popover.ts's RenderEngineHelpHost seam); the casts live HERE
// so mods and tests never cast themselves.

import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import type { RenderCard } from "../render/format.js";
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
  };
}
