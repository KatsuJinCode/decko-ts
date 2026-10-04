// page42 lane RED/GREEN pin: the bar-menu known/wanted class split for 2-part
// star-right (rstar) rule-row names must follow the CORPUS's own pins, which
// split by the LEFT part:
//
//   star-left compounds ("*all+*autoname", "*all+*create", "*star+*default",
//   ...) — a RULE-ROW name "<set-marker>+<setting>": the corpus pins the
//   page-link class by STORED-ROW presence, 253/253 (82 known-pinned names
//   all resolve present in the staging corpus; 171 wanted-pinned names all
//   resolve absent — tmp/lane-page42 full-page-link census, *all:page skew
//   diff = exactly 8 wanted/known regions on 8 absent rows).
//   Oracle bytes (recapture-raw-shard-000000 *all:page, first-diff 11074):
//   `<a class="full-page-link wanted-card" href="/*all+*autoname">`.
//
//   non-star-left compounds ("Anonymous+*created", "mod X+*script", ...) —
//   the corpus pins known-card 97/97 including five names whose staging rows
//   are missing (Anonymous+*created/-*edited, +*default, democracy+*referred
//   to by, Cs Dev+*self — capture-deck rows the W5 seed family owns; the
//   Eagle oracle recapture-raw-shard-000029 pins known on absent-in-staging
//   rows). The class-level known fiction stays on THIS subset only, gated on
//   the W5 seed landing.
//
// History: commit bb430e0e ("bar-menu class/text split, 11 Eagle") widened
// the known-carve-out to ALL 2-part rstar names, which (a) broke the standing
// r16-rule-bar-and-stored-verdict-parity.test.ts wanted-card pin (verified
// RED at the fold-12 base 64572305: 1 failed | 3 passed) and (b) fails the
// 171 star-left wanted pins — grade9-run4b page entries *all/*star/*rstar/
// *all plus (the 175's ENGINE class this lane fixes).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  const settings: Array<[number, string, string]> = [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [22, "*autoname", "autoname"],
    [24, "*create", "create"],
  ];
  for (const [id, name, codename] of settings) {
    await seedCard(s, { id, name, codename, typeId: SETTING_TYPE_ID });
  }
  // The stored star-left rule row: *all+*create exists (the corpus's own
  // *all+*create row, resolved-present family) -> its bar menu pins known.
  await seedCard(s, { id: 50, leftId: 10, rightId: 24, typeId: LIST_TYPE_ID, dbContent: "{}" });
  // The non-star-left rule-row shape the corpus pins known WITHOUT a stored
  // row (the Anonymous+*created Eagle oracle, staging row absent): the
  // card-name left is a plain content card.
  await seedCard(s, { id: 60, name: "Anonymous", codename: "anonymous", typeId: RICH_TYPE_ID, dbContent: "anon" });
  // The Eagle oracle's own surface (recapture-raw-shard-000029 Eagle:page,
  // offset ~9348): a host card nests the absent name as a bar
  // (`<p><div id="anonymous-Xcreated-bar-view" class="card-slot bar-view
  // ALL ALL_PLUS TYPE-search RSTAR RIGHT-Xcreated ...`). The capture deck's
  // row was Search-typed; staging lacks it — the fiction subset.
  await seedCard(s, { id: 61, name: "Anon Host", typeId: RICH_TYPE_ID, dbContent: "{{Anonymous+*created|bar}}" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("2-part rstar bar-menu class splits by left part (corpus pins)", () => {
  it("star-left absent rule row -> wanted-card page link, create label (oracle 274 bytes)", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xall-Xautoname-bar-view");
    expect(at).toBeGreaterThan(-1);
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 3000);
    expect(slot).toContain(`<a class="full-page-link wanted-card" href="/*all+*autoname">`);
    expect(slot).toContain("create</a>");
    expect(slot).not.toContain(`known-card" href="/*all+*autoname"`);
  });

  it("star-left STORED rule row (*all+*create) -> known-card page link, edit label", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xall-Xcreate-bar-view");
    expect(at).toBeGreaterThan(-1);
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 3000);
    expect(slot).toContain(`full-page-link known-card`);
    expect(slot).not.toContain(`wanted-card" href="/*all+*create"`);
  });

  it("non-star-left absent rule row (Anonymous+*created shape) keeps the known-class fiction (W5-gated)", async () => {
    // The Eagle oracle surface: the host card nests the absent name as a
    // bar; its menu must stay known-card — the corpus pins known 97/97 on
    // this subset (five staging-absent names included) until the W5 seed
    // lands.
    const html = await storage!.engine.render("Anon Host", "content");
    expect(html).toContain(`data-card-name="Anonymous+*created"`);
    expect(html).toContain("full-page-link known-card");
  });
});
