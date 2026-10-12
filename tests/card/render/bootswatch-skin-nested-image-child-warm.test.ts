// A bootswatch_skin that is NESTED into another card's render must carry its
// +Image child, on a COLD engine.
//
// THE DEFECT
//   A host card whose pointer content names a skin rendered the EMPTY
//   image-box
//     <div title="skin" class="image-box medium"></div>
//   where the reference render carries
//     <div title="skin" class="image-box medium"><img alt="skin+Image" src="/files/:skin+:image/bootstrap-small.png" /></div>
//   The same host rendered byte-EXACT when the same process had already
//   rendered the skin card as a root earlier — the failure depended on warm
//   state, not on any byte of engine logic between runs.
//
// THE MECHANISM
//   bootswatchSkinBarLeftHtml (src/card/render/views.ts) reads the skin's
//   image child synchronously:
//     fmt.engine.fetchRenderCard(`${name}+Image`)
//   The child is a NULL-NAMED left/right junction (a junction reached only
//   through its derived `<skin>+Image` name), so nothing in the nest-syntax
//   reference closure seats it. The warmNestedSkinImages scan in
//   src/card/render.ts fetches it by DERIVED compound name — which works —
//   but it walks renderCards as the prepare phase finds it, and a skin
//   reached through a pointer/list item is not seated yet: the scan sees the
//   map holding only the host's sibling skin, and
//   enrichPointerListItemsClosure then grows the map with the nested skin
//   afterwards. The view-time read misses and the empty box ships.
//
// THE FIX
//   Call warmNestedSkinImages a second time, after
//   enrichPointerListItemsClosure. Both calls are idempotent: a seated
//   junction short-circuits on fetchRenderCard, so the second call costs one
//   map scan and zero queries on an already-warm deck.
//
// WHAT THIS FILE PINS
//   1. (RED without the fix) rendering a host that reaches a skin through the
//      pointer-item closure seats `<skin>+Image` on a cold engine — and the
//      rendered bytes carry the coded /files/ src, not the empty box.
//   2. (green before and after — the control) a root skin render still seats
//      its own +Image, so the second call did not replace the first.
//   3. (green before and after — the control) a skin with NO +Image child
//      still renders the empty box and still seats nothing.
//   4. (green before and after — the control) the exactness check is not a
//      warm-state illusion: seeding the image junction with a DIFFERENT
//      stored casing cannot change the derived compound key the view reads.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** The skin, its coded image junction, and a pointer host that names the
 *  skin: a skin row, an Image-typed left/right junction under it, and a
 *  Pointer-typed host whose db_content names the skin. */
const HOST = "journal skin customized";
const SKIN = "journal skin";
const IMAGE = `${SKIN}+Image`;
const CODED_SRC = "/files/:journal_skin+:image/bootstrap-small.png";

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 5, name: "HTML", codename: "html" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 9, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 19, name: "Image", codename: "image", typeId: 19 });
  // The *all+*read grant (deck-readable) — without it every nest is denied
  // and the media bytes never render.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The cardtypes: the Bootswatch skin whose codename gates the media arm,
  // and Pointer (the closure the nested skin arrives through).
  await seedCard(s, { id: 8, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 33929, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });

  // The skin, its coded +Image junction, a second skin with no image, and
  // the pointer host whose db_content names the first skin.
  await seedCard(s, { id: 22794, name: SKIN, typeId: 33929, dbContent: "" });
  await seedCard(s, {
    id: 22846,
    name: IMAGE,
    leftId: 22794,
    rightId: 19,
    typeId: 19,
    dbContent: ":journal_skin+:image/bootstrap.png",
  });
  // The deck's Image+*right+*default rule (id 217, Image-typed) types the
  // bare skin's absent +Image as an Image, whose :boxed is `unknown: true`.
  await seedCard(s, { id: 260, name: "*right", codename: "right", typeId: 1 });
  await seedCard(s, { id: 318, name: "*default", codename: "default", typeId: 2 });
  await seedCard(s, { id: 216, leftId: 19, rightId: 260 });
  await seedCard(s, { id: 217, leftId: 216, rightId: 318, typeId: 19 });
  await seedCard(s, { id: 22900, name: "bare skin", typeId: 33929, dbContent: "" });
  await seedCard(s, { id: 34179, name: HOST, typeId: 34843, dbContent: SKIN });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
  storage = undefined;
});

describe("bootswatch_skin nested through a pointer item seats its +Image child", () => {
  it("(1) seats <skin>+Image on a cold engine and renders the coded /files/ src", async () => {
    const s = storage!;
    // Nothing has rendered yet in this engine, so the skin is not in the map
    // and the pointer-item closure is what has to put it there.
    expect(s.engine.fetchRenderCard(IMAGE)).toBeUndefined();
    const html = await s.engine.render(HOST, "open");
    expect(s.engine.fetchRenderCard(IMAGE)).toBeDefined();
    expect(html).toContain(CODED_SRC);
    expect(html).not.toContain(`class="image-box medium"></div>`);
  });

  it("(2) control: a ROOT skin render still seats its own +Image", async () => {
    const s = storage!;
    const html = await s.engine.render(SKIN, "closed");
    expect(s.engine.fetchRenderCard(IMAGE)).toBeDefined();
    expect(html).toContain(CODED_SRC);
  });

  it("(3) control: a skin with NO +Image child renders the empty box and seats nothing", async () => {
    const s = storage!;
    const html = await s.engine.render("bare skin", "closed");
    expect(s.engine.fetchRenderCard("bare skin+Image")).toBeUndefined();
    expect(html).toContain(`class="image-box medium"></div>`);
    expect(html).not.toContain("/files/:bare_skin+:image/");
  });

  it("(4) control: the read is by DERIVED compound key, not by stored name", async () => {
    const s = storage!;
    // A stored name that differs only in case derives to the same key, so the
    // seated junction answers both spellings — the read is by derived key,
    // and an exactness question about stored name forms does not arise here.
    const byKey = s.engine.fetchRenderCard(IMAGE);
    expect(byKey).toBeDefined();
    expect(byKey!.name.s).toBe(IMAGE);
    expect(s.engine.fetchRenderCard("Journal Skin+Image")?.id).toBe(byKey!.id);
  });
});
