// The edge serving boot resolves views through the mod deck's per-set chain,
// the same registry the save path uses, so the two cannot answer
// differently. Pins:
//   - bootCorpusDeckEngines binds the deck loader to the render engine;
//   - loading the deck leaves the base table's entries for views that only
//     abstract set modules register untouched (an abstract module reaches a
//     card only through include_set, never as every card's fallback);
//   - the navbar family resolves on its Ruby sets (Abstract::Items' dropdown
//     :nav_item for Pointer and List cards, Self::DropdownDivider);
//   - the memoized chain answers what a freshly loaded deck answers.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HTML_VIEWS, baseTableEntry } from "../../src/card/render/views.js";

// Snapshot the base table before anything in this file loads the deck.
const BASE_BAR_MIDDLE = HTML_VIEWS["bar_middle"];
const BASE_INPUT = HTML_VIEWS["input"];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("edge boot view registry", () => {
  it("binds the mod deck's chain to the edge render engine", { timeout: 120_000 }, async () => {
    const { bootCorpusDeckEngines } = await import("../../deploy/bunny-worker-src/bunny-edge-deck-boot.js");
    const { getDefaultModLoader } = await import("../../src/card/mod-loader.js");
    const { LocalSqliteDriver } = await import("../../src/server/drivers/local-sqlite.js");
    const { splitSqlStatements } = await import("../card/render/render-test-storage.js");
    const driver = new LocalSqliteDriver({ path: ":memory:" });
    for (const statement of splitSqlStatements(readFileSync(path.join(REPO_ROOT, "db", "schema.sqlite.sql"), "utf8"))) {
      await driver.query(statement, []);
    }
    const deck = await bootCorpusDeckEngines(driver);
    const loader = getDefaultModLoader();
    expect(loader).toBeDefined();
    expect(deck.render.modLoader).toBe(loader);
    expect(deck.render.modDeckBound()).toBe(true);
  });

  it("falls back to the base table, not to abstract registrations, when a deck is bound", async () => {
    const { defaultDeckLoader } = await import("../../src/card/mod-loader/default-mod-deck.js");
    const loader = defaultDeckLoader();
    // Abstract::CodeContent registers :bar_middle and :input; they belong to
    // the cards whose sets include it, not to every card.
    expect(loader.viewChain("ALL TYPE-scss SELF-bootstrap_core", "bar_middle").some((e) => e.setModule === "Abstract::CodeContent")).toBe(true);
    expect(loader.viewChain("ALL TYPE-cardtype SELF-date", "bar_middle").some((e) => e.setModule === "Abstract::CodeContent")).toBe(false);
    expect(baseTableEntry("bar_middle")).toBe(BASE_BAR_MIDDLE);
    expect(baseTableEntry("input")).toBe(BASE_INPUT);
    // A chain-bound engine resolves a Cardtype card's :bar_middle to the
    // base table's body, though the shared record now holds
    // Abstract::CodeContent's registration.
    const { RenderEngine } = await import("../../src/card/render.js");
    const engine = new RenderEngine({} as never);
    engine.modLoader = loader;
    const date = { key: "date", setKeys: "ALL TYPE-cardtype SELF-date", typeCode: "cardtype", dbContent: "" } as never;
    expect(engine.resolveView(date, "bar_middle")).toBe(BASE_BAR_MIDDLE);
  });

  it("resolves the navbar family on its Ruby sets", async () => {
    const { defaultDeckLoader } = await import("../../src/card/mod-loader/default-mod-deck.js");
    const loader = defaultDeckLoader();
    expect(loader.viewChain("ALL TYPE-pointer SELF-main_menu", "nav_item")[0]?.setModule).toBe("Abstract::Items");
    expect(loader.viewChain("ALL TYPE-list SELF-sub_menu", "nav_item")[0]?.setModule).toBe("Abstract::Items");
    expect(loader.viewChain("ALL TYPE-rich_text SELF-about", "nav_item")[0]?.setModule).toBe("All::NavbarLinks");
    expect(loader.viewChain("ALL TYPE-rich_text SELF-Xdropdown_divider", "nav_item")[0]?.setModule).toBe("Self::DropdownDivider");
    expect(loader.viewChain("ALL TYPE-rich_text SELF-Xdropdown_divider", "nav_link_in_dropdown")[0]?.setModule).toBe("Self::DropdownDivider");
  });

  it("answers from its memo exactly what a freshly loaded deck answers", async () => {
    const { defaultDeckSources, portedBundleOrder } = await import("../../src/card/mod-loader/default-mod-deck.js");
    const { ModLoader } = await import("../../src/card/mod-loader.js");
    const fresh = (): InstanceType<typeof ModLoader> => {
      const l = new ModLoader(defaultDeckSources());
      l.resolveOrder({ gemMods: portedBundleOrder() });
      l.load();
      return l;
    };
    const warm = fresh();
    const keys = [
      "ALL TYPE-pointer SELF-main_menu",
      "ALL ALL_PLUS TYPE-rich_text RIGHT-discussion TYPE_PLUS_RIGHT-project-discussion SELF-x-discussion",
      "ALL TYPE-set SELF-Xall",
      "ALL TYPE-search_type SELF-recent",
    ];
    const views = ["core", "input", "nav_item", "titled", "one_line_content", "count", "bar_middle"];
    // Warm the memo, then compare every answer with a cold loader's.
    for (const k of keys) for (const v of views) warm.viewChain(k, v);
    const cold = fresh();
    for (const k of keys) {
      for (const v of views) {
        expect(warm.viewChain(k, v).map((e) => e.setModule)).toEqual(cold.viewChain(k, v).map((e) => e.setModule));
      }
    }
    // A reload starts the memo over.
    warm.reset();
    expect(warm.viewChain(keys[0]!, "nav_item")).toEqual([]);
  });
});
