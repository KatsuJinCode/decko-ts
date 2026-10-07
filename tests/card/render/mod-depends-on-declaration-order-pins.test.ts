// Pins for the Depends-on section's membership and order (mod: account /
// mod: bootstrap / mod: email / mod: list / mod: edit pages).
//
// Ruby mechanism (card-1.110.0 mod/core set/type/mod.rb:85-87 view
// :depends_on, :130-132, :222-226): `list_section "Depends on",
// card.depends_on`, where depends_on = `card_mods { mod&.spec&.dependencies }`
// filtered to card-mod gems and mapped to mod names.
//
// Reference (2026-10-06 corpus of record, captured with the installed 0.20
// gems): all 22 mod pages with a Depends on section list it in NAME order,
// and the membership is the installed 0.20 gemspecs' (mod: account carries
// integrate and edit, mod: bootstrap carries script). The gemspec files
// declare a different order on five of them (account, bootstrap, edit,
// email, list), so the spec the app reads hands the dependencies over
// sorted. An earlier pin froze the live 0.19-era site's declaration order
// and membership; the corpus of record supersedes it.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

/** Seed the mod-card deck: the Mod cardtype + the "mod: account" card
 *  (codename mod_account — MOD_SPECS' key). The Depends on section renders
 *  from the pinned spec, not deck rows. */
async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "Mod", codename: "mod", typeId: 2 });
  await seedCard(storage, { id: 40, name: "mod: account", codename: "mod_account", typeId: 3 });
  return storage;
}

describe("Depends on section (installed 0.20 gemspecs, name order)", () => {
  it(
    "mod: account's Depends on renders the 0.20 gemspec's five deps in name order",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("mod: account", "core");
      const i = html.indexOf("Depends on");
      expect(i).toBeGreaterThanOrEqual(0);
      const seg = html.slice(i, i + 60000);
      const ids = [...seg.matchAll(/id="(mod_[a-z_]+)-(?:mini_)?bar-view"/g)].map((m) => m[1]);
      expect(ids).toEqual(["mod_edit", "mod_email", "mod_integrate", "mod_list", "mod_permission"]);
    },
  );

  it(
    "mod: bootstrap's Depends on carries the script dep, in name order",
    async () => {
      const s = await seedDeck();
      await seedCard(s, { id: 41, name: "mod: bootstrap", codename: "mod_bootstrap", typeId: 3 });
      const html = await s.engine.render("mod: bootstrap", "core");
      const i = html.indexOf("Depends on");
      const seg = html.slice(i, i + 60000);
      const ids = [...seg.matchAll(/id="(mod_[a-z_]+)-(?:mini_)?bar-view"/g)].map((m) => m[1]);
      expect(ids).toEqual(["mod_bar_and_box", "mod_edit", "mod_script", "mod_style"]);
    },
  );
});
