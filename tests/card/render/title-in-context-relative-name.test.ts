// The card-title span renders RELATIVE to the page's name context
// (context_names.rb): inside the "Aikido 2" page, the +management /
// +overview slot titles display as "+management" / "+overview", not the
// full junction. The live-vs-served comparison (round: nitpicks
// round) flagged exactly this on /Aikido_2 and /Archetypal_Psychology.
//
// Mechanism (port of card-mod-format + context_names.rb):
// - html/views.rb:55-62 view :titled wraps its header in
//   `naming { render_header }` - the header yields FIRST, then the card's
//   own name parts join the format's context, so the body nests relativize.
// - title.rb standard_title -> title_in_context: `card.name.from(*context_names)`.
// - wrap.rb:68-79 name_context_slot_option: the slot JSON carries the
//   INITIAL (parent-derived, part-filtered) context as comma-joined keys,
//   appended LAST. SUPERSEDED PIN CORRECTION (2026-09-28, live-wire
//   mechanism-3 work): an earlier version of this test expected the WANTED
//   +management mini_bar to carry NO name_context, pinned to the stale
//   live-v0.19.1 capture an internal work log
//   The graded v0.20.0 capture contradicts that byte: the SAME shape
//   (a wanted, id-less +management mini_bar nested directly in the page
//   body) is the Conflict_Done_Well page in
//   tmp/raw-ground-truth/expected-v2/page-lane/
//   dual-lane-validation-2026-09-25.jsonl — and there the slot CARRIES
//   name_context "conflict_done_well" with no data-card-id. Today's live
//   wire agrees (live-wire-class-tokens.md: Occupy's wanted
//   +pdf/+tags/+discussion slots carry name_context on BOTH the v0.20.0
//   snapshot and the 2026-09-28 live fetch; probe snap=3 live=3 eng=0).
//   wrap.rb:74-78's only gate is initial_context_names.present? — the
//   unknown-card gate was an overfit to the stale capture and was removed
//   (name-context-slot-json-gate.test.ts pins both oracle shapes).
//
// Live bytes (an internal work log):
//   <span class="card-title" title="+management"><span>+</span>management</span>
//   <span class="card-title" title="+overview">...
//   data-slot="{...&quot;home_view&quot;:&quot;titled&quot;,&quot;name_context&quot;:&quot;aikido_2&quot;}"

import { describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

async function seedFieldwork2Shape(storage: RenderTestStorage): Promise<void> {
  // The page card with two body nests: a KNOWN +overview (titled) and an
  // UNSEEDED +management (fetch miss -> wanted card, closed->mini_bar).
  await seedCard(storage, {
    id: 97200,
    name: "Aikido 2",
    typeId: 2,
    dbContent: "<p>{{+overview|titled}}</p>\n<p>{{+management|closed}}</p>",
  });
  await seedCard(storage, { id: 97201, name: "overview", typeId: 2 });
  await seedCard(storage, {
    id: 97202,
    name: "Aikido 2+overview",
    leftId: 97200,
    rightId: 97201,
    typeId: 2,
    dbContent: "<p>the overview body</p>",
  });
}

describe("title_in_context: relative slot titles under the page context", () => {
  it("renders +overview/+management titles relative and the main title full (live /Aikido_2 shape)", async () => {
    const storage = await createRenderTestStorage();
    await seedFieldwork2Shape(storage);
    const html = await storage.engine.render("Aikido 2", "titled");

    // The MAIN card's own title renders pre-context (naming yields the
    // header before adding) - full name, never relativized.
    expect(html).toContain('<span class="card-title" title="Aikido 2">');

    // The known +overview titled slot: relative header title ...
    expect(html).toContain('<span class="card-title" title="+overview">');
    expect(html).not.toContain('title="Aikido 2+overview"');
    // ... and the slot JSON carries the initial context, comma-joined
    // keys, LAST in the JSON (wrap.rb appends after voo.slot_options).
    expect(html).toContain("&quot;home_view&quot;:&quot;titled&quot;,&quot;name_context&quot;:&quot;aikido_2&quot;}");

    // The WANTED +management nest (closed -> mini_bar substitution):
    // RELATIVE bar-left title, and the slot JSON CARRIES name_context —
    // wrap.rb:74-78's only gate is initial_context_names.present? (see the
    // superseded-pin correction in the header: the graded oracle's
    // Conflict_Done_Well+management wanted slot carries name_context, and
    // today's live wire agrees on the Occupy page's wanted slots).
    expect(html).toContain('<span class="card-title" title="+management">');
    expect(html).not.toContain('title="Aikido 2+management"');
    const managementSlot = html.slice(html.indexOf("aikido_2-management-"));
    expect(managementSlot).toContain(
      "&quot;home_view&quot;:&quot;open&quot;,&quot;name_context&quot;:&quot;aikido_2&quot;}",
    );
  });

  it("keeps the full junction title when the same card renders OUT of context", async () => {
    const storage = await createRenderTestStorage();
    await seedFieldwork2Shape(storage);
    // Direct render: no parent context -> the name stays whole.
    const direct = await storage.engine.render("Aikido 2+overview", "titled");
    expect(direct).toContain('<span class="card-title" title="Aikido 2+overview">');
    // No context was added above the render root -> no name_context JSON.
    expect(direct).not.toContain("name_context");
  });

  it("emits name_context on a known pointer/list item bar (live +Gallery shape)", async () => {
    const storage = await createRenderTestStorage();
    // Aikido_Oak_Cliff page body nests a list host whose items are
    // junction cards; live-wire Aikido_Oak_Cliff.html pins the item's
    // data-slot with nest_name ABSOLUTE ("Aikido Oak Cliff+Gallery") and
    // name_context "aikido_oak_cliff".
    await seedCard(storage, { id: 10, name: "List", codename: "list", typeId: 2 });
    await seedCard(storage, {
      id: 97210,
      name: "Aikido Oak Cliff",
      typeId: 2,
      dbContent: "<p>{{+Pages|content}}</p>",
    });
    await seedCard(storage, { id: 97211, name: "Pages", typeId: 2 });
    await seedCard(storage, {
      id: 97212,
      name: "Aikido Oak Cliff+Pages",
      leftId: 97210,
      rightId: 97211,
      typeId: 10, // Pointer (test-schema pointer type; item lines are plain)
      dbContent: "Aikido Oak Cliff+Gallery\n",
    });
    await seedCard(storage, { id: 97213, name: "Gallery", typeId: 2 });
    await seedCard(storage, {
      id: 97214,
      name: "Aikido Oak Cliff+Gallery",
      leftId: 97210,
      rightId: 97213,
      typeId: 10,
      dbContent: "AOC_Dojo_01\n",
    });
    await seedCard(storage, { id: 97215, name: "AOC_Dojo_01", typeId: 2 });

    const html = await storage.engine.render("Aikido Oak Cliff", "titled");
    // The item slot: absolute nest_name, name_context appended last.
    expect(html).toContain("&quot;nest_name&quot;:&quot;Aikido Oak Cliff+Gallery&quot;");
    expect(html).toContain("&quot;name_context&quot;:&quot;aikido_oak_cliff&quot;}");
    // The +Pages host slot carries the context too (authored relative
    // nest_name, live live-wire shape).
    expect(html).toContain("&quot;nest_name&quot;:&quot;+Pages&quot;");
  });
});
