// tmp/perf-profile/nest-index-entry.ts — the one-shot nest index build, in
// source form so the harness can bundle it the way it bundles the Worker.
// The calls are the ones tools/deploy/build-nest-index.mjs makes through
// d1-binding.mjs's buildNestIndexOnBinding.
import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { ensureNestIndex, readNestIndexMarker } from "../../src/card/nest-index.js";

export async function buildNestIndex(db: { prepare(sql: string): unknown }): Promise<unknown> {
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const driver = new CloudflareD1Adapter(db as never);
  const fetcher = new FetchEngine(driver);
  const install = await ensureNestIndex(driver, fetcher.lexicon);
  return { install, marker: await readNestIndexMarker(driver) };
}