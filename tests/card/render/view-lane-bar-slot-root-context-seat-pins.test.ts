// Pins for the BAR-slot root-context seat (or rather its absence):
// the reference behavior is that every view=bar slot nested under the
// requestless-surface root card carries NO name_context and renders its title
// ABSOLUTE, while every NON-bar slot on the same render (+tags
// mini_bar view=closed, +Description view=content, the +Articles
// view=open slot, the root :open slot itself) also carries no name_context.
//
// Ruby grounding: the 0.20 walk has NO context seat on the accordion :open
// chain (bar.rb:40 build_accordion_bar -> wrap; the only cold
// add_name_context sites are the titled naming, frames, the edit views,
// nest_editor, rss). A root-context seat for bar slots had no Ruby
// grounding and was REMOVED — fitted behavior without a mechanism. The
// part filter idea (root parts ∩ bar parts, relevant_context_names
// semantics, context_names.rb:26-29) is what Ruby's REAL seats (the
// titled naming) apply; bar slots get none of it.

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

/** Seed the root-as-host shape: the ROOT card "Weapons" IS the List host
 *  (a single-part List-class host whose item bars are the pinned surface,
 *  with the control item "Standards").
 *
 *  HISTORY: this suite previously rendered "Weapons+articles" (the
 *  +articles child) as the view root — a junction HOST card whose items
 *  share only the host's FIRST part. That shape is pinned ctx-LESS (the
 *  tags/+Pages class): the synthetic render was updated to the
 *  root-as-host shape; the assertions below pin the current behavior on
 *  THAT shape. */
async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "List", codename: "list", typeId: 2 });
  await seedCard(storage, { id: 4, name: "RichText", codename: "rich_text", typeId: 2 });
  // The ROOT is the List host (root-as-host shape): single-part root whose
  // content lists the item bars.
  await seedCard(storage, {
    id: 20,
    name: "Weapons",
    typeId: 3,
    dbContent: "Weapons+rifles\nWeapons+pistols\nStandards\n",
  });
  await seedCard(storage, { id: 21, name: "Articles", typeId: 2 });
  await seedCard(storage, { id: 22, name: "Rifles", typeId: 2 });
  await seedCard(storage, { id: 23, name: "Pistols", typeId: 2 });
  await seedCard(storage, { id: 24, name: "Standards", typeId: 2 });
  // The item bars (RichText junctions under Weapons).
  await seedCard(storage, { id: 31, leftId: 20, rightId: 22, typeId: 4 });
  await seedCard(storage, { id: 32, leftId: 20, rightId: 23, typeId: 4 });
  return storage;
}

describe("requestless-surface bar slots carry no fitted root-context seat (the starred-root item-bar shape)", () => {
  it(
    "item bars under the requestless root carry no name_context and render absolute titles",
    async () => {
      // CORRECTION: the seat this pin used to require had no Ruby
      // grounding — the 0.20 accordion :open chain adds no name context —
      // and the reference behavior carries name_context on no
      // pointer-item or search-result bars outside the titled
      // +*referred_to_by results. The seat is removed.
      const s = await seedDeck();
      const html = await s.engine.render("Weapons", "open");
      expect(html).not.toContain("&quot;name_context&quot;:&quot;weapon&quot;");
      expect(html).toContain('title="Weapons+Rifles"');
      expect(html).not.toContain('title="+Rifles"');
    },
  );

  it(
    "the part filter keeps bars whose names lack the root part ctx-less",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Weapons", "open");
      // The Standards bar's JSON closes after home_view — no name_context.
      // (safe_key singularizes the item key, so Standards' own slot id is
      // standard-bar-view.)
      expect(html).toContain('id="standard-bar-view"');
      const standardsRegion = html.slice(
        html.indexOf('id="standard-bar-view"'),
        html.indexOf('id="standard-bar-view"') + 1200,
      );
      expect(standardsRegion).toContain("&quot;home_view&quot;:&quot;bar&quot;}");
      expect(standardsRegion).not.toContain("&quot;name_context&quot;");
    },
  );

  it(
    "the root's own open slot and non-bar slots stay ctx-less",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Weapons", "open");
      // The ROOT open slot closes without a name_context member (the slot
      // JSON reads the initial context, pre-seat).
      const rootSlot = html.slice(0, html.indexOf('class="card-slot'));
      expect(rootSlot).not.toContain("&quot;name_context&quot;");
      // Bar-slot count sanity: three item bars render.
      expect(html.match(/class="card-slot bar-view/g)?.length).toBe(3);
    },
  );
});
