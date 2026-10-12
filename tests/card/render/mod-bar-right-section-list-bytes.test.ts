// The Mod cardtype's bar_right is type/mod.rb's section list — the mod's
// present sections comma-joined in Ruby's pinned order tasks < settings <
// configurations < cardtypes < scripts < styles — where the engine used to
// render an empty bar-right for every mod card.
//
// Dispatch shape: the BASE bar_right branches on typeCode "mod"
// (views.ts) because the production replay path renders views through a
// RenderEngine that never binds a ModLoader — a set-module registration
// alone cannot dispatch there. The section predicates live
// in core-admin-runtime.ts (modBarRightSections: ADMIN_CONFIG presence +
// the basket tasks + the pinned scripts/styles presence table).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 5, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // The Mod cardtype + the mod cards (codenames mod_* — the shape
  // type/mod.rb's modname resolution reads).
  await seedCard(s, { id: 3, name: "Mod", codename: "mod", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // A few mods spanning every section predicate.
  await seedCard(s, { id: 45434, name: "mod: core", codename: "mod_core", typeId: 3 });
  await seedCard(s, { id: 45464, name: "mod: account", codename: "mod_account", typeId: 3 });
  await seedCard(s, { id: 45513, name: "mod: defaults", codename: "mod_defaults", typeId: 3 });
  await seedCard(s, { id: 45520, name: "mod: recaptcha", codename: "mod_recaptcha", typeId: 3 });
  await seedCard(s, { id: 45530, name: "mod: shades", codename: "mod_shades", typeId: 3 });
  await seedCard(s, { id: 45540, name: "mod: carrierwave", codename: "mod_carrierwave", typeId: 3 });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** The bar-right region bytes of a mod card's closed view. */
async function modBarRight(mod: string): Promise<string> {
  const html = await storage!.engine.render(`mod: ${mod}`, "closed");
  const m = html.match(/bar-right col-3'>\n([\s\S]*?)\n<\/div>/);
  return m?.[1] ?? "";
}

describe("mod bar_right: the type/mod.rb section list", () => {
  it("renders the dumped oracle section strings", async () => {
    // Each expected string is Ruby's bar-right row for that mod.
    expect(await modBarRight("core")).toBe("tasks, cardtypes");
    expect(await modBarRight("account")).toBe("cardtypes, scripts, styles");
    expect(await modBarRight("defaults")).toBe("configurations");
    expect(await modBarRight("recaptcha")).toBe("settings, configurations, scripts");
    expect(await modBarRight("shades")).toBe("scripts");
    expect(await modBarRight("carrierwave")).toBe("tasks, cardtypes, scripts, styles");
  });
});
