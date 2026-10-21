// The carrierwave mod's css-format views on type/image: the port does not
// register them, and the measurement says no pinned path reaches them.
//
// Ruby: card-mod-carrierwave-0.20.0/set/type/image.rb:100-107 declares
//
//     format :css do
//       view :core do
//         handle_source
//       end
//
//       view :content do  # why is this necessary?
//         render_core
//       end
//     end
//
// The css format is rendered at five sites in the pinned gemset: the
// AssetInputter / AssetOutputter include_set lines on type/css, type/scss,
// type/skin, type/bootswatch_skin and type_plus_right/set/style, plus
// card-mod-email's :email_stylesheet.card.format(:css).render_compiled.
// Every one of them renders a css, scss, skin, bootswatch_skin or
// stylesheet card. No pinned path renders an IMAGE card in the css format,
// so the two declarations are a latent surface.
//
// The capture script is committed
// (tests/card/mod-loader/oracle-capture-carrierwave-css-format-views.rb);
// its output is the fixture this test reads, and the port file names the
// skip in its NOT-ported block.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";

const oracle = JSON.parse(
  readFileSync(
    new URL("fixtures/carrierwave-css-format-views.json", import.meta.url),
    "utf8",
  ),
);

describe("carrierwave register entry 7: the css-format views on type/image", () => {
  it("the gem declares exactly two css-format views on type/image", () => {
    expect(oracle.image_css_views).toEqual([
      { set_file: "type/image.rb", format: "css", view: "core", line: 101 },
      { set_file: "type/image.rb", format: "css", view: "content", line: 105 },
    ]);
  });

  it("every css-format render site in the pinned gemset is a css-family card, never an image", () => {
    expect(oracle.css_render_sites).toHaveLength(5);
    expect(oracle.css_render_card_types).toEqual([
      "all",
      "bootswatch_skin",
      "css",
      "set:set",
      "skin",
    ]);
    expect(oracle.image_card_type_covered).toBe(false);
  });

  it("the port registers no css-format view for type/image, and names the skip", () => {
    const file = cardModCarrierwave.setModules!.find(
      (setModule) => setModule.setPath === "type/image",
    )!;
    expect(file.formats?.css).toBeUndefined();
    expect(Object.keys(file.formats ?? {}).sort()).toEqual(["html"]);
    expect(file.formats?.html?.views?.map((view) => view.view).sort()).toEqual([
      "inline",
      "one_line_content",
      "source",
    ]);
  });
});
