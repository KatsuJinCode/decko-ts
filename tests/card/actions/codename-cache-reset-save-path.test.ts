// The codename cache reset on save.
//
// The event `:reset_codename_cache` (card-1.110.0 mod/core/set/all/
// codename.rb:9-13) runs at the :integrate stage when a save changes a
// codename: it clears the cached codehash, so the NEXT codename lookup
// reloads from the db and sees the new mapping. The memo-staleness contract
// (no db fallthrough in []/id, codename.rb:118-120) is probed and replayed
// in tests/card/permissions/read-rule-derive-and-codename-reset-oracle.test.ts.
//
// What this test pins: the save path wires that reset. The registry is
// warmed FIRST (a resolved lookup proves the codehash memo is loaded), then
// a card is created with a codename through the real CardActionEngine, and
// the lookup of the NEW codename must resolve WITHOUT any manual cache
// intervention. If the save-path reset is missing, the warmed memo answers
// undefined forever (the codehash loads once — codename.rb#load_codehash).
// Mutation check: disabling the engine's resetCache call turns this suite
// red — the warmed memo then answers undefined forever.

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedStandardDeck,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";

describe("codename cache reset on save (codename.rb:9-13)", () => {
  it("a codename-setting save is visible to the next registry lookup", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage) as CardActionEngine;

    // Warm the codehash through the public surface: the seed deck's
    // RichText row carries codename "basic" (actions-test-storage.ts:185).
    await expect(engine.fetch.codenames.id("basic")).resolves.toBeDefined();

    const created = await engine.createCard({
      name: "WCC Codename Probe",
      content: "",
      codename: "wcc_codename_probe",
    });
    expect(created.cardId).toBeGreaterThan(0);

    // No manual resetCache here — the save must have done it.
    await expect(engine.fetch.codenames.id("wcc_codename_probe")).resolves.toBe(
      created.cardId,
    );
    await expect(
      engine.fetch.codenames.nameForId(created.cardId),
    ).resolves.toBe("wcc_codename_probe");
    storage.close();
  });

  it("a save without a codename does not register one (no false positive)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = actionEngine(storage) as CardActionEngine;
    await expect(engine.fetch.codenames.id("basic")).resolves.toBeDefined();

    await engine.createCard({ name: "WCC Plain Probe", content: "" });

    await expect(
      engine.fetch.codenames.id("wcc_plain_probe"),
    ).resolves.toBeUndefined();
    storage.close();
  });
});
