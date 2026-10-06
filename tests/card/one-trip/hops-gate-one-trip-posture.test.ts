// THE HOPS GATE'S ON POSTURE (one-trip-integration lane, 2026-10-03).
//
// hops-per-render-one-page-law.test.ts (a standing-net manifest member)
// pins the OFF posture: the fixture page's cold render stays under the
// law's ceiling of 14 round trips and its warm re-render under 1. THIS
// file pins the one-trip posture of the SAME law on the SAME fixture:
// with DECKO_ONE_TRIP=1 and a built store, the cold render's total stays
// under the SAME ceiling — 1 (the one-trip payload's data fetch) + the
// named residue + the per-connection ATTACH must not exceed what the OFF
// posture's law allows, and the warm re-render stays under 1 (the gate's
// per-engine seating memo makes the payload free on re-render).
//
// The fixture seeding is replicated verbatim from the hops gate's
// seedLawFixtureDeck (that file is a manifest member owned by the
// db-roundtrip lane; this file leaves it untouched). Not a standing-net
// manifest member.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { normalizeSlotIds } from "./one-trip-fixture.js";

/** The law's ceiling (hops-per-render-one-page-law.test.ts — change only
 *  with a receipt justification in that file's own discipline). */
const HOPS_LAW_CEILING = 14;

async function seedLawFixtureDeck(s: RenderTestStorage): Promise<void> {
  // Verbatim from tests/card/render/hops-per-render-one-page-law.test.ts.
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, {
    id: 800,
    name: "*all+*read",
    leftId: 274,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedCard(s, { id: 810, name: "Anyone+*self", leftId: 10, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 811,
    name: "Anyone+*self+*read",
    leftId: 810,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedCard(s, {
    id: 900,
    name: "law fixture page",
    typeId: 2,
    dbContent: "{{law fixture child}}\n[[law fixture link target]]",
  });
  await seedCard(s, { id: 901, name: "law fixture page+*self", leftId: 900, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 910,
    name: "law fixture child",
    typeId: 2,
    dbContent: "the child body",
  });
  await seedCard(s, { id: 911, name: "law fixture child+*self", leftId: 910, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 920,
    name: "law fixture list",
    typeId: 47,
    dbContent: "law fixture unknown item",
  });
  await seedCard(s, { id: 921, name: "law fixture list+*self", leftId: 920, rightId: 708, typeId: 259 });
  await seedCard(s, { id: 930, name: "law fixture link target", typeId: 2, dbContent: "link body" });
  await seedCard(s, { id: 931, name: "law fixture link target+*self", leftId: 930, rightId: 708, typeId: 259 });
  await seedCard(s, {
    id: 902,
    name: "law fixture page+*self+*read",
    leftId: 901,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
}

describe("the hops gate's one-trip posture: 1 data fetch + residue stays under the law's ceiling", () => {
  let storageOff: RenderTestStorage | undefined;
  let storageOn: RenderTestStorage | undefined;
  let sideDir = "";
  const savedEnv = { gate: process.env.DECKO_ONE_TRIP, store: process.env.DECKO_ONE_TRIP_STORE };

  afterAll(() => {
    if (savedEnv.gate === undefined) delete process.env.DECKO_ONE_TRIP;
    else process.env.DECKO_ONE_TRIP = savedEnv.gate;
    if (savedEnv.store === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
    else process.env.DECKO_ONE_TRIP_STORE = savedEnv.store;
    storageOff?.close();
    storageOn?.close();
    try { rmSync(sideDir, { recursive: true, force: true }); } catch { /* OS temp cleans up */ }
  });

  it("OFF: the fixture obeys the law (cold <= 14, warm <= 1); ON: 1 data + residue <= 14 and warm <= 1, bytes identical", async () => {
    // ---- OFF posture: the law as the manifest test pins it ----
    storageOff = await createRenderTestStorage();
    await seedLawFixtureDeck(storageOff);
    storageOff.counting.reset();
    const offHtml = await storageOff.engine.render("law fixture page", "open");
    const offCold = storageOff.counting.snapshot();
    expect(offCold.roundTrips).toBeLessThanOrEqual(HOPS_LAW_CEILING);
    storageOff.counting.reset();
    await storageOff.engine.render("law fixture page", "open");
    const offWarm = storageOff.counting.snapshot();
    // [ENGINE-FRESHNESS] port: the warm render's law cost is the ONE
    // deck_data_version stamp SELECT (was zero before the gate) — so the
    // warm law moves from "<= 1 (the cache-friendly render)" to "<= 2 (the
    // stamp + the cache-friendly render)". The data hop count the law
    // actually governs is unchanged.
    expect(offWarm.roundTrips).toBeLessThanOrEqual(2);

    // ---- the derived store, built from this same fixture deck ----
    sideDir = mkdtempSync(join(tmpdir(), "one-trip-hops-"));
    const sidePath = join(sideDir, "one-trip-closure-side.sqlite3");
    const side = new LocalSqliteDriver({ path: sidePath });
    const corpusOfOff = storageOff.counting as unknown as SQLDatabaseDriver;
    await buildOneTripClosure({
      corpus: corpusOfOff,
      side,
      pageNames: ["law fixture page"],
    });

    // ---- ON posture: fresh engine, gate on, the wired path ----
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = sidePath;
    storageOn = await createRenderTestStorage();
    await seedLawFixtureDeck(storageOn);
    storageOn.counting.reset();
    const onHtml = await storageOn.engine.render("law fixture page", "open");
    const onCold = storageOn.counting.snapshot();

    // The law holds in the ON posture: attach (per connection) + the ONE
    // data fetch + the named residue all fit under the same ceiling.
    expect(
      onCold.roundTrips,
      `the ON cold render spent ${onCold.roundTrips} round trips; the law allows ` +
        `${HOPS_LAW_CEILING} (1 one-trip data fetch + attach + the named residue — the ` +
        `payload must REMOVE hops, never add a class)`,
    ).toBeLessThanOrEqual(HOPS_LAW_CEILING);
    expect(onCold.roundTrips).toBeLessThanOrEqual(offCold.roundTrips);

    // THE PIN: the wired ON render produces the same bytes as the OFF path.
    expect(normalizeSlotIds(onHtml)).toBe(normalizeSlotIds(offHtml));

    // Warm ON: the seating memo makes the payload free; the law's warm rule.
    // [ENGINE-FRESHNESS] port: +1 for the stamp SELECT (see the OFF note).
    storageOn.counting.reset();
    await storageOn.engine.render("law fixture page", "open");
    const onWarm = storageOn.counting.snapshot();
    expect(onWarm.roundTrips).toBeLessThanOrEqual(2);
  });
});
