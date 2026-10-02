// The card-mod-format :smart_label view (the third named remainder - missing
// since the mod-views-a lane): card-mod-format-0.20.0 set/all/content.rb
// :26-41 -
//   view :smart_label, cache: :never, unknown: true do
//     label_with_description render_label, label_description
//   end
//   def label_with_description label, description
//     return label unless description
//     "#{label} #{popover_link description}"
//   end
//   def label_description
//     return unless (desc = card.fetch :description)
//     desc.format.render_core
//   end
// render_label is the :label view (content.rb:22-24, card.label = name);
// the popover anchor is card-mod-bootstrap's popover_link helper
// (set/all/bootstrap/helper.rb:41-57), whose live bytes the oracle capture
// fixtures/captured/help-popover.json pins ("rendered" - the same helper,
// dispatching _render_core instead of the description core):
//   <a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"
//    data-bs-content="..." class="ps-1 _popover_link" href="#">
//    <i class="notranslate material-icons">help</i></a>
// (attribute order = ActiveSupport reverse_merge!'s replace(defaults.merge
// (self)) rebuild: tabindex/data-*/class, href LAST).
//
// A/B through the mod loader per the established lane shape.
//
// RED state: :smart_label is not registered - renders raise
// UnsupportedViewError.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the WITH-description probe: +description is the codename card's name
  // (card-1.110.0 mod/core/data/real.yml:3-4 seeds name "description",
  // codename "description")
  await seedCard(s, { id: 200, name: "Oracle Smart Label Probe", dbContent: "probe body" });
  await seedCard(s, { id: 201, name: "description", codename: "description", typeId: 2 });
  await seedCard(s, {
    id: 202,
    name: "Oracle Smart Label Probe+description",
    leftId: 200, rightId: 201, typeId: 2,
    dbContent: "probe description body",
  });
  // the BARE probe: no +description card - label alone
  await seedCard(s, { id: 210, name: "Oracle Bare Smart Label Probe", dbContent: "bare body" });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

async function loadMod() {
  const s = storage!;
  if (loader === undefined) {
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
  }
  return s.engine;
}

describe("card-mod-format :smart_label (set/all/content.rb:26-41)", () => {
  it("WITHOUT the mod: :smart_label raises UnsupportedViewError", async () => {
    const s = storage!;
    await expect(
      s.engine.render("Oracle Smart Label Probe", "smart_label"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: a card without +description renders the bare label", async () => {
    await loadMod();
    const s = storage!;
    expect(
      await s.engine.render("Oracle Bare Smart Label Probe", "smart_label"),
    ).toBe("Oracle Bare Smart Label Probe");
  });

  it("WITH the mod: a card with +description appends the popover anchor over the description core", async () => {
    await loadMod();
    const s = storage!;
    expect(
      await s.engine.render("Oracle Smart Label Probe", "smart_label"),
    ).toBe(
      'Oracle Smart Label Probe <a tabindex="0" data-bs-toggle="popover"' +
        ' data-bs-trigger="hover focus" data-bs-content="probe description body"' +
        ' class="ps-1 _popover_link" href="#"><i class="notranslate material-icons">help</i></a>',
    );
  });

  it(":label stays the label arm alone (content.rb:22-24)", async () => {
    await loadMod();
    const s = storage!;
    expect(
      await s.engine.render("Oracle Smart Label Probe", "label"),
    ).toBe("Oracle Smart Label Probe");
  });
});
