// Pins for the Depends-on section's membership and order — the
// serializer-followup2 census mechanism M4 (mod: account / mod: bootstrap /
// mod: email / mod: list pages, the -958/-954/-956/-958 family).
//
// Census bytes (tmp/serializer-followup/probe-green5, the five failing mod
// pages): the live "Depends on" bars render in the mods' GEMSPEC DECLARATION
// order with the LIVE gemspecs' membership:
//   mod: account  -> mod: email, mod: permission, mod: list
//   mod: bootstrap-> mod: edit, mod: bar and box, mod: style
//   mod: email    -> mod: search, mod: list, mod: permission
//   mod: list     -> mod: format, mod: collection
// The engine rendered mod: account's section as FIVE bars
// [edit, email, integrate, list, permissions] — the 0.20-era pinned
// MOD_SPECS deps (card-mod-account's 0.20 gemspec carries integrate + edit;
// the live 0.19.1-era gemspec does not) passed through a `.sort()`.
//
// Ruby mechanism (card-1.110.0 mod/core set/type/mod.rb:85-89 view
// :depends_on): `list_section "Depends on", card.depends_on` where
// depends_on = `card_mods { mod&.spec&.dependencies }` — the gemspec's
// dependency list in DECLARATION order, mapped to mod names, filtered to
// card-mod gems. No sort exists anywhere in the chain; the prior lane's
// "the lockfile is sorted" observation was a coincidence for the pages
// tested then (the five census pages refute it).
//
// The pinned MOD_SPECS arrays are the byte ground truth (the live bytes are
// the live-era gemspecs' order): this pin freezes mod: account's sequence.

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

describe("Depends on section (census M4, gemspec declaration order)", () => {
  it(
    "mod: account's Depends on renders exactly the live three bars in live order",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("mod: account", "core");
      const i = html.indexOf("Depends on");
      expect(i).toBeGreaterThanOrEqual(0);
      const seg = html.slice(i, i + 6000);
      const ids = [...seg.matchAll(/id="(mod_[a-z_]+)-(?:mini_)?bar-view"/g)].map((m) => m[1]);
      expect(ids).toEqual(["mod_email", "mod_permission", "mod_list"]);
    },
  );

  it(
    "mod: bootstrap's Depends on drops the script dep and keeps live order",
    async () => {
      const s = await seedDeck();
      await seedCard(s, { id: 41, name: "mod: bootstrap", codename: "mod_bootstrap", typeId: 3 });
      const html = await s.engine.render("mod: bootstrap", "core");
      const i = html.indexOf("Depends on");
      const seg = html.slice(i, i + 6000);
      const ids = [...seg.matchAll(/id="(mod_[a-z_]+)-(?:mini_)?bar-view"/g)].map((m) => m[1]);
      expect(ids).toEqual(["mod_edit", "mod_bar_and_box", "mod_style"]);
    },
  );
});
