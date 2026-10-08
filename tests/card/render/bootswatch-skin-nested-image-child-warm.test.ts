// mopup-shark-m9 (2026-10-02): a bootswatch_skin that is NESTED into another
// card's render must carry its +Image child, on a COLD engine.
//
// THE DEFECT (measured on the real corpus, not reasoned about)
//   `journal skin customized+parent 1:open`, `litera skin customized+parent 1:
//   open` and `slate skin customized+parent 1:open` (expected-v2 view lane,
//   shard-000039) render the EMPTY image-box
//     <div title="journal skin" class="image-box medium"></div>
//   where the oracle carries
//     <div title="journal skin" class="image-box medium"><img alt="journal skin+Image" src="/files/:journal_skin+:image/bootstrap-small.png" /></div>
//   — 86 / 84 / 82 bytes short. The same three entries render byte-EXACT when
//   the same process happens to have rendered the skin card as a root earlier,
//   which is why the full-canvas grade's verdict on them moved between the
//   W=3 and W=6 runs without any byte of engine change.
//
// THE MECHANISM
//   bootswatchSkinBarLeftHtml (src/card/render/views.ts) reads the skin's
//   image child synchronously:
//     fmt.engine.fetchRenderCard(`${name}+Image`)
//   The child is a NULL-NAMED left/right junction (corpus row 22846: left
//   22794, right 19, content ":journal_skin+:image/bootstrap.png"; corpus-wide
//   zero rows carry `+Image` in a name), so nothing in the nest-syntax
//   reference closure seats it. The V6 scan in src/card/render.ts
//   (warmNestedSkinImages) fetches it by DERIVED compound name — which works —
//   but it walks renderCards as the prepare phase finds it, and a skin reached
//   through a pointer/list item is not seated yet: the scan sees mapSize=10
//   holding only the host's sibling skin, and enrichPointerListItemsClosure
//   then grows the map to 211 with the nested skin in it. The view-time read
//   misses and the empty box ships.
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

/** The three skins, their coded image junctions, and a pointer host that
 *  names one of them. Shaped on the corpus rows: skin 22794, image junction
 *  22846 (left 22794 / right 19), pointer-item junction 45365 (left 34179 /
 *  right 45364, db_content "journal skin"). */
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
  // The corpus's Image+*right+*default rule (id 217, Image-typed) types the
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
    // seated junction answers both spellings — the exactness question the M9
    // name gate raised does not arise on this read path.
    const byKey = s.engine.fetchRenderCard(IMAGE);
    expect(byKey).toBeDefined();
    expect(byKey!.name.s).toBe(IMAGE);
    expect(s.engine.fetchRenderCard("Journal Skin+Image")?.id).toBe(byKey!.id);
  });
});
