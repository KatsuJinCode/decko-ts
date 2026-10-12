// temporary-cache-reset-mid-request-never-changes-output.test.ts
//
// A cache that drops entries in the middle of a request must never change
// the page. Ruby's Card::Cache::Temporary resets its whole store once it
// holds more than max_temporary_cache_keys entries (temporary.rb
// #within_key_counts), and every Ruby reader heals the miss with a
// synchronous database read (lexicon.rb:71-76), so the reset is invisible in
// Ruby's output. The port's synchronous readers (the name environment's
// `~id` mark parse, the pointer item renders) cannot read the database, so
// an entry the reset dropped became a NameNotFoundError and an "Error
// rendering" span.
//
// The defect page's shape: a card whose `+*members` pointer stores `~id`
// item lines; the request read enough names that the 10,000-key cache reset
// mid-request, one member id's entry went with it, and the page rendered
// `Error rendering: <card>+*members (core view)` where the person bars
// belong.
//
// The pin renders that page shape on two engines over the same deck:
// one with the cache cap at Ruby's default and one with a cap so small that
// the reset fires on nearly every write of the request. The two pages must
// be byte-identical and must carry both person bars. Without the request
// hold, the small-cap engine drops the member entries mid-request.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { TemporaryCache } from "../../../src/card/fetch/cache.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModCollection from "../../../src/card/mod-loader/mods/card-mod-collection.js";
import {
  bindModLoaderToEngine,
  CountingRenderDriver,
  seedCard,
  splitSqlStatements,
  type RenderTestStorage,
} from "./render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const MEMBER_ONE = { id: 23595, name: "Sample Member One" };
const MEMBER_TWO = { id: 34374, name: "Sample Member Two" };
const QAGNEER_ID = 34370;
const MEMBERS_TAG_ID = 908;

async function storageWithCap(maxTemporaryCacheKeys: number): Promise<RenderTestStorage> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"))) {
    await driver.query(statement, []);
  }
  const counting = new CountingRenderDriver(driver);
  const fetcher = new FetchEngine(counting, { maxTemporaryCacheKeys });
  return { engine: new RenderEngine(fetcher), fetcher, counting, close: () => driver.close() };
}

/** The sample page shape: the layout trio + cardtypes every page render
 *  resolves, the page, its `+*members` pointer with `~id` item lines, and
 *  the two member cards. */
async function seedWagneerDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 900, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(s, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(s, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(s, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(s, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(s, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(s, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  await seedCard(s, { id: QAGNEER_ID, name: "Sample Page", typeId: 2, dbContent: "{{+*members}}" });
  await seedCard(s, { id: MEMBERS_TAG_ID, name: "*members", codename: "members", typeId: 2 });
  await seedCard(s, {
    id: 34371,
    leftId: QAGNEER_ID,
    rightId: MEMBERS_TAG_ID,
    name: "Sample Page+*members",
    typeId: 5,
    dbContent: `~${MEMBER_ONE.id}\n~${MEMBER_TWO.id}`,
  });
  await seedCard(s, { id: MEMBER_ONE.id, name: MEMBER_ONE.name, typeId: 2 });
  await seedCard(s, { id: MEMBER_TWO.id, name: MEMBER_TWO.name, typeId: 2 });
}

/** Only the per-render random slot id differs between two renders. */
const masked = (html: string) => html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="X"');

async function renderWagneer(
  maxTemporaryCacheKeys: number,
  opts: { withoutDurableRecord?: boolean } = {},
): Promise<{ html: string; resets: number }> {
  const s = await storageWithCap(maxTemporaryCacheKeys);
  opened.push(s);
  const loader = new ModLoader([
    { manifest: cardModBootstrap },
    { manifest: cardModList },
    { manifest: cardModCollection },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await seedWagneerDeck(s);
  s.fetcher.installNameEnvironment();
  if (opts.withoutDurableRecord) {
    // An engine reading only the live cache for some seated entries:
    // removing the durable id/name record leaves the cache itself as the
    // only thing the synchronous readers have, which is exactly what the
    // request hold must protect.
    vi.spyOn(s.fetcher.lexicon, "peekDurableName").mockReturnValue(undefined);
    vi.spyOn(s.fetcher.lexicon, "peekDurableId").mockReturnValue(undefined);
  }
  const temp = s.fetcher.lexiconCache.temp as TemporaryCache;
  const before = temp.resetCount;
  const html = await renderPageBytes(s.engine, "Sample Page");
  return { html, resets: temp.resetCount - before };
}

const opened: RenderTestStorage[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const s of opened.splice(0)) s.close();
});

describe("a Temporary-cache reset in the middle of a request never changes the page (sample page)", () => {
  it("renders the member bars, byte-identical to an engine whose cache never fills", async () => {
    const roomy = await renderWagneer(1_000_000);
    expect(roomy.html).toContain(`data-card-name="${MEMBER_TWO.name}"`);
    expect(roomy.html).toContain(`data-card-name="${MEMBER_ONE.name}"`);
    expect(roomy.html).not.toContain("Error rendering");

    // A cap of 4 keys: Ruby's reset rule (temporary.rb#within_key_counts)
    // would empty the store dozens of times during this one request.
    const tight = await renderWagneer(4);
    expect(tight.html).not.toContain("Error rendering");
    expect(tight.html).toContain(`data-card-name="${MEMBER_TWO.name}"`);
    expect(masked(tight.html)).toBe(masked(roomy.html));
  });

  it("the page does not depend on the durable record: the cache alone must hold for the request", async () => {
    const roomy = await renderWagneer(1_000_000);
    const tight = await renderWagneer(4, { withoutDurableRecord: true });
    expect(tight.html).not.toContain("Error rendering");
    expect(tight.html).toContain(`data-card-name="${MEMBER_TWO.name}"`);
    expect(masked(tight.html)).toBe(masked(roomy.html));
  });

  it("the request hold defers the reset to the request's end instead of dropping it", async () => {
    // The render's own explicit cache resets (the freshness stamp's first
    // observation) fire under any cap; a roomy cache never overflows.
    const roomy = await renderWagneer(1_000_000);
    const tight = await renderWagneer(4);
    // Under a 4-key cap the overflow fires on nearly every write, yet no
    // overflow reset ran inside the request: exactly one, deferred to the
    // moment the request released its hold.
    expect(tight.resets).toBe(roomy.resets + 1);
  });
});
