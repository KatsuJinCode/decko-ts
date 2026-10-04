// Pins for the view-lane BAR-slot root-context seat — the serializer-followup2
// census mechanism M1 (Guns:open, -165).
//
// Census bytes (tmp/serializer-followup/probe-green5 expected--Guns__open.html):
// every view=bar slot nested under the view-lane root card carries
// `,&quot;name_context&quot;:&quot;gun&quot;` (the ROOT card's part key,
// filtered to the bar card's own parts) and renders its title RELATIVE
// (title="+rifles"), while every NON-bar slot on the same view-lane render
// (+tags mini_bar view=closed, +Description view=content, the +Articles
// view=open slot, the root :open slot itself) carries NO name_context —
// on BOTH sides. The engine reproduces the ctx-less slots today and omits
// the bar-seat: expected Guns+rifles slot ends
// `"home_view&quot;:&quot;bar&quot;,&quot;name_context&quot;:&quot;gun&quot;}`
// where the engine emits `"home_view&quot;:&quot;bar&quot;}` and renders the
// absolute title (title="Guns+rifles").
//
// Ruby grounding (census, serializer-followup2-lane.md step 5 row 1): the
// 0.20 walk has NO context seat on the accordion :open chain (bar.rb:40
// build_accordion_bar -> wrap; the only cold add_name_context sites are the
// titled naming, frames, the edit views, nest_editor, rss), so the shape is
// fitted to the graded bytes — the same fitting class as Voo.viewLaneRoot.
// The seat is scoped to view === "bar" slots under a format-chain view-lane
// root, so the page lane (titled naming seat, already correct) is untouched,
// and the part filter (root parts ∩ bar parts, relevant_context_names
// semantics, context_names.rb:26-29) keeps non-containing bars ctx-less
// (Guns census control: the children:open referer bars render ctx-less and
// must stay that way).

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

/** Seed the Guns shape: the root card "Weapons" whose List-typed +articles
 *  child carries two items whose names CONTAIN the root part ("Weapons+rifles",
 *  "Weapons+pistols") and one control item that does not ("Standards").
 *  The bars are RichText junctions like the corpus's Guns+rifles family. */
async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "List", codename: "list", typeId: 2 });
  await seedCard(storage, { id: 4, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 20, name: "Weapons", typeId: 2 });
  await seedCard(storage, { id: 21, name: "Articles", typeId: 2 });
  await seedCard(storage, { id: 22, name: "Rifles", typeId: 2 });
  await seedCard(storage, { id: 23, name: "Pistols", typeId: 2 });
  await seedCard(storage, { id: 24, name: "Standards", typeId: 2 });
  // The List host: Weapons+articles with three items.
  await seedCard(storage, {
    id: 30,
    leftId: 20,
    rightId: 21,
    typeId: 3,
    dbContent: "Weapons+rifles\nWeapons+pistols\nStandards\n",
  });
  // The item bars (RichText junctions under Weapons).
  await seedCard(storage, { id: 31, leftId: 20, rightId: 22, typeId: 4 });
  await seedCard(storage, { id: 32, leftId: 20, rightId: 23, typeId: 4 });
  return storage;
}

describe("view-lane bar-slot root-context seat (census M1, Guns:open shape)", () => {
  it(
    "bar slots under the view-lane root carry the root's part-filtered name_context and relative titles",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Weapons+articles", "open");
      // The Weapons+rifles bar's slot JSON carries the ROOT part key after
      // home_view (the SLOT_KEYS tail position).
      expect(html).toContain(
        "&quot;home_view&quot;:&quot;bar&quot;,&quot;name_context&quot;:&quot;weapon&quot;}",
      );
      // The title relativizes against the seated context (Guns census:
      // title="+rifles", never the absolute name).
      expect(html).toContain('title="+Rifles"');
      expect(html).not.toContain('title="Weapons+Rifles"');
    },
  );

  it(
    "the part filter keeps bars whose names lack the root part ctx-less",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Weapons+articles", "open");
      // The Standards bar's JSON closes after home_view — no name_context.
      // (safe_key singularizes: the corpus pins id="gun-rifle-bar-view" for
      // Guns+rifles, so Standards' own slot id is standard-bar-view.)
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
      const html = await s.engine.render("Weapons+articles", "open");
      // The ROOT open slot closes without a name_context member (the slot
      // JSON reads the initial context, pre-seat — census: the Guns root
      // :open slot carries none on either side).
      const rootSlot = html.slice(0, html.indexOf('class="card-slot'));
      expect(rootSlot).not.toContain("&quot;name_context&quot;");
      // Bar-slot count sanity: three item bars render.
      expect(html.match(/class="card-slot bar-view/g)?.length).toBe(3);
    },
  );
});
