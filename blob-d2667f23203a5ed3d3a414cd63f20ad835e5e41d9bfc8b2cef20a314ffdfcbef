// The boot's mod card cascade (boot-mod-cards.ts, layer D of the boot
// seed): the port of Cardio::Mod.ensure_installed. These tests pin the
// cascade's products on a fresh schema-only deck against the recorded Ruby
// deck's own rows - the write-battery fixture
// (reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3), whose
// *all+*script and style: mods contents ARE the cascade's output on the
// Ruby side (defaults fixture cards_306 / cards_328, written by
// ensure_asset_lists in card-1.110.0 lib/cardio/mod/class_methods.rb:75-84).
//
// The recorded lists, verbatim:
//   *all+*script   - fifteen "mod: <name>+*script" items
//   style: mods    - eighteen "mod: <name>+*style" items
// and the fixture deck carries, beside them, the thirty-eight "mod: <name>"
// cards and the thirty-three input junctions the cascade ensures here.

import { afterEach, describe, expect, it } from "vitest";

import { seedCoreFixture } from "../../../src/card/auth/boot-seed.js";
import { ensureInstalledModCards } from "../../../src/card/auth/boot-mod-cards.js";
import { actorBot } from "../../../src/card/auth/actor.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { sqlDateTime } from "../../../src/card/auth/session-store.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** The card action engine the boot's core arm builds, over one driver. */
async function coreArmEngine(driver: RenderTestStorage["fetcher"]["driver"]) {
  const bot = await actorBot(driver);
  return new CardActionEngine(new FetchEngine(driver), { actor: bot });
}

async function bootstrappedDeck(): Promise<RenderTestStorage> {
  // The cascade is the subject, and the shipped boot no longer runs it:
  // PORT_SEED_SOURCE.index is 0, the defaults corpus IS the fresh deck
  // (db:setup exactly, no ensure layer over it), and the corpus carries
  // Ruby's own mod cascade rows. So this test seeds the index-1 core
  // corpus - the arm the boot keeps the ensure layers live on - and runs
  // ensureInstalledModCards the way bootstrapFreshDeck's core arm does,
  // which is the posture these pins were measured in.
  storage = await createRenderTestStorage({ bootstrapReadRules: false });
  const driver = storage.fetcher.driver;
  await seedCoreFixture(driver, sqlDateTime(new Date()));
  await ensureInstalledModCards(await coreArmEngine(driver), driver);
  return storage;
}

const EXPECTED_SCRIPT_ITEMS = [
  "mod: format+*script",
  "mod: list+*script",
  "mod: search+*script",
  "mod: rules+*script",
  "mod: edit+*script",
  "mod: account+*script",
  "mod: carrierwave+*script",
  "mod: ace editor+*script",
  "mod: bar and box+*script",
  "mod: bootstrap+*script",
  "mod: follow+*script",
  "mod: tabs+*script",
  "mod: layout+*script",
  "mod: recaptcha+*script",
  "mod: tinymce editor+*script",
] as const;

const EXPECTED_STYLE_ITEMS = [
  "mod: format+*style",
  "mod: list+*style",
  "mod: permissions+*style",
  "mod: help+*style",
  "mod: search+*style",
  "mod: rules+*style",
  "mod: edit+*style",
  "mod: account+*style",
  "mod: history+*style",
  "mod: carrierwave+*style",
  "mod: api key+*style",
  "mod: style+*style",
  "mod: bar and box+*style",
  "mod: bootstrap+*style",
  "mod: comment+*style",
  "mod: follow+*style",
  "mod: layout+*style",
  "mod: tinymce editor+*style",
] as const;

describe("the boot's mod card cascade (Cardio::Mod.ensure_installed)", () => {
  it("creates the fifteen script input cards and the eighteen style input cards, in bundle order", async () => {
    const deck = await bootstrappedDeck();
    const driver = deck.fetcher.driver;
    const rows = (
      await driver.query<{ name: string | null; lkey: string; rcod: string }>(
        "SELECT l.name AS name, l.key AS lkey, r.codename AS rcod " +
          "FROM cards c JOIN cards l ON l.id = c.left_id JOIN cards r ON r.id = c.right_id " +
          "WHERE c.trash = 0 AND l.type_id = (SELECT id FROM cards WHERE codename = 'mod') " +
          "AND r.codename IN ('style','script') ORDER BY c.id",
        [],
      )
    ).rows;
    const names = rows.map((r) => `${r.name}+*${r.rcod}`);
    const script = names.filter((n) => n.endsWith("+*script"));
    const style = names.filter((n) => n.endsWith("+*style"));
    expect(script).toEqual([...EXPECTED_SCRIPT_ITEMS]);
    expect(style).toEqual([...EXPECTED_STYLE_ITEMS]);
  });

  it("writes *all+*script and style: mods with the recorded contents", async () => {
    const deck = await bootstrappedDeck();
    const driver = deck.fetcher.driver;
    const allScript = (
      await driver.query<{ db_content: string }>(
        "SELECT c.db_content AS db_content FROM cards c " +
          "WHERE c.left_id = (SELECT id FROM cards WHERE codename = 'all') " +
          "AND c.right_id = (SELECT id FROM cards WHERE codename = 'script') AND c.trash = 0",
        [],
      )
    ).rows[0];
    expect(allScript?.db_content?.split("\n")).toEqual([...EXPECTED_SCRIPT_ITEMS]);
    const styleMods = (
      await driver.query<{ db_content: string }>(
        "SELECT db_content FROM cards WHERE codename = 'style_mods' AND trash = 0",
        [],
      )
    ).rows[0];
    expect(styleMods?.db_content?.split("\n")).toEqual([...EXPECTED_STYLE_ITEMS]);
  });

  it("creates the mod cards with Ruby's names and codenames (cardio/mod.rb:56-60)", async () => {
    const deck = await bootstrappedDeck();
    const driver = deck.fetcher.driver;
    const rows = (
      await driver.query<{ name: string; codename: string }>(
        "SELECT name, codename FROM cards WHERE type_id = " +
          "(SELECT id FROM cards WHERE codename = 'mod') AND trash = 0 ORDER BY name",
        [],
      )
    ).rows;
    const byName = new Map(rows.map((r) => [r.name, r.codename]));
    // three spot checks across the order: a plain name, a spaced one, the
    // unported-bar_and_box one the recorded deck also carries
    expect(byName.get("mod: ace editor")).toBe("mod_ace_editor");
    expect(byName.get("mod: bar and box")).toBe("mod_bar_and_box");
    expect(byName.get("mod: tinymce editor")).toBe("mod_tinymce_editor");
    // the recorded deck's mod-card count is 38 (the fixtures' 38 rows,
    // 536..604); the port's bundle order (ORACLE_BUNDLE_ORDER, 34 mods)
    // composes one "mod: <name>" card per mod, so its fresh deck holds 34
    // mod cards - the same walk, the port's own mod set.
    expect(rows.length).toBe(34);
  });

  it("a second boot creates nothing (the ensure arm is a no-op on its own output)", async () => {
    const deck = await bootstrappedDeck();
    const driver = deck.fetcher.driver;
    const before = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", [])).rows[0]?.n ?? 0,
    );
    const second = await ensureInstalledModCards(
      await coreArmEngine(driver),
      driver,
    );
    expect(second.modCardsCreated).toEqual([]);
    expect(second.inputCardsCreated).toEqual([]);
    expect(second.dependencyCardsCreated).toEqual([]);
    expect(second.assetListsSet).toEqual([]);
    const after = Number(
      (await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", [])).rows[0]?.n ?? 0,
    );
    expect(after).toBe(before);
  });
});
