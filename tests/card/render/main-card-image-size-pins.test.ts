// Pins for the main-card image size — the *favicon:page mechanism.
//
// The live PAGE renders the favicon image at the LARGE variant
// (`.../files/103/3649-large.jpg`); the engine rendered -medium. A bare
// view-lane render pins -medium — BOTH are Ruby-correct:
//
// card-mod-carrierwave-0.20.0 set/type/image.rb:44-57 determine_image_size:
//   when nest_mode == :closed then closed_size (:icon)
//   when voo.size.present?    then voo.size
//   when main?                then main_size  # -> :large
//   else                           default_size # -> :medium
// A page's main card renders with main? true (:large); a bare view-lane
// render has no main format (:medium). The engine's size pick had only
// `voo.size ?? :medium` — the main? arm is the fix.

import { describe, it, expect, afterAll } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

async function seedDeck(): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 19, name: "Image", codename: "image", typeId: 2 });
  await seedCard(s, { id: 42, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(s, { id: 43, name: "*title", codename: "title", typeId: 2 });
  await seedCard(s, { id: 45, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(s, { id: 46, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(s, { id: 81, name: "*all", codename: "all", typeId: 2, dbContent: "{}" });
  // The probe layout: main slot only, rendered :open (the image card's
  // home view) so the core image branch runs on the MAIN format.
  await seedCard(s, {
    id: 82,
    name: "Favicon Probe Layout",
    typeId: 2,
    dbContent: "{{_main|open}}",
  });
  await seedCard(s, {
    id: 83,
    leftId: 81,
    rightId: 42,
    typeId: 2,
    dbContent: "Favicon Probe Layout",
  });
  // The *favicon row (Image-typed, bucket content).
  await seedCard(s, {
    id: 103,
    name: "*favicon",
    codename: "favicon",
    typeId: 19,
    dbContent: "(my_bucket)/103/3649.jpg",
  });
  return s;
}

describe("main-card image size (census M6, determine_image_size main? arm)", () => {
  it(
    "the PAGE's main image renders the large variant",
    async () => {
      const s = await seedDeck();
      s.fetcher.codenames.ensureLoaded();
      s.fetcher.installNameEnvironment();
      const html = await renderPageBytes(s.engine, "*favicon");
      expect(html).toContain("3649-large.jpg");
      expect(html).not.toContain("3649-medium.jpg");
    },
  );

  it(
    "the bare view-lane :open render keeps the medium default",
    async () => {
      const s = await seedDeck();
      s.fetcher.codenames.ensureLoaded();
      s.fetcher.installNameEnvironment();
      const html = await s.engine.render("*favicon", "open");
      expect(html).toContain("3649-medium.jpg");
      expect(html).not.toContain("3649-large.jpg");
    },
  );
});
