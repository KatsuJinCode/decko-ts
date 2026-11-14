// card-mod-list-0.20.0 set/abstract/01_list/other_views.rb:59-61 — the
// json block's :links view:
//
//     format :json do
//       ...
//       view :links do
//         []
//       end
//     end
//
// WHAT THIS CLOSES. The register's entry 22 recorded this view as
// "absent as a registration with the html-only-engine reason", then its
// own 2026-10-19 correction withdrew the substantive claim and left
// only the registration: the ANSWER the view serves was already landed
// on the json surface — render/format-families.ts#jsonMolecule writes
// `molecule["links"] = []` (:415, inside the :404-427 walk), which is the
// list-family `[]` byte-for-byte. So the port had the value and not the
// declaration, and a card asking for :links under the json format had no
// view to dispatch. This file pins the registration and the value
// together, so the two cannot drift again.
//
// WHY `[]` IS CORRECT (not a stub). The view is the list family's
// OVERRIDE of the data format's general :links
// (card-mod-format-0.20.0 set/all/data.rb:74-82), which maps a card's
// `link_chunks` through `path mark:, format: :json`. A list card holds no
// link chunks of its own — its items are separate cards — so Ruby answers
// the empty array, and the json :molecule built at data.rb:101-109
// (`atom.merge items: _render_items, links: _render_links, ...)`) gets
// `links: []` for a list card.
//
// The NOT-ported neighbour is deliberate and stays: the GENERAL data
// format's link_chunks walk (the non-list card's molecule) has no port
// counterpart, and render/format-families.ts writes the list answer
// unconditionally. This registration does not change that — it is the
// list-family declaration only, and the negative control below pins that
// a NON-list card's json molecule is unaffected by this registration.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { renderFormatShow } from "../../../src/card/render/format-families.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the list family's own type anchor
  await seedCard(s, { id: 30, name: "List", codename: "list", typeId: 2 });
  // a list card with two items, so "no link chunks of its own" is a real
  // property of the deck rather than an empty deck's accident
  await seedCard(s, { id: 40, name: "Oracle List Item A", typeId: 2, dbContent: "a" });
  await seedCard(s, { id: 41, name: "Oracle List Item B", typeId: 2, dbContent: "b" });
  await seedCard(s, { id: 42, name: "Oracle List Probe", typeId: 30, dbContent: "" });
  await seedCard(s, { id: 43, leftId: 42, rightId: 40, typeId: 14, dbContent: "" });
  await seedCard(s, { id: 44, leftId: 42, rightId: 41, typeId: 14, dbContent: "" });
  // the negative control: a plain card that is NOT list-family
  await seedCard(s, { id: 50, name: "Oracle Plain Probe", typeId: 2, dbContent: "plain body" });
  s.fetcher.installNameEnvironment();
  await s.fetcher.warmLexicon([2, 13, 14, 30, 40, 41, 42, 43, 44, 50]);

  loader = new ModLoader([{ manifest: cardModList }]);
  loader.load();
  bindModLoaderToEngine(s, loader);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The json-format render of `name`'s :links view, through the engine's
 *  format-name seam (RenderFormat#withFormatName's shape — the reader
 *  `card.format(:json).render(:links)` is in Ruby). */
const jsonLinks = async (name: string): Promise<unknown> => {
  const s = storage!;
  const card = await s.engine.prepareItemForRender(name);
  if (card === undefined) throw new Error(`probe not preparable: ${name}`);
  const fmt = new RenderFormat(card, s.engine, { formatName: "json" });
  return fmt.renderView("links");
};

/** The json :molecule for a card, through the format-families show path
 *  (json.rb:20-24 `show` defaults :molecule; renderFormatShow dispatches
 *  it to jsonMolecule, format-families.ts:594). */
const jsonMoleculeOf = async (name: string): Promise<Record<string, unknown>> => {
  const s = storage!;
  const bytes = await renderFormatShow(
    {
      fetchRenderCard: (n: string) => s.engine.fetchRenderCard(n),
      prepareItemForRender: (n: string) => s.engine.prepareItemForRender(n),
      render: (n: string, v: string) => s.engine.render(n, v),
      codenameById: async (id: number) => await s.fetcher.codenames.nameForId(id),
    },
    name,
    "json",
    { now: () => new Date("2026-01-01T00:00:00Z") },
  );
  return JSON.parse(bytes) as Record<string, unknown>;
};

describe("card-mod-list other_views — the json :links view", () => {
  it("the set module registers :links under its json format block", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("links");
    expect(report.registeredSetModules).toContain("Abstract::List::OtherViews");
  });

  it("a list card's json :links is the empty array (other_views.rb:59-61)", async () => {
    // Ruby's body is literally `[]`. The view protocol stringifies a
    // non-string answer, so the assertion reads the VALUE the body
    // returned (before serialization) — the empty array is the answer the
    // json molecule consumes.
    const value = await jsonLinks("Oracle List Probe");
    expect(value).toEqual([]);
  });

  it("the json molecule for a list card carries links: [] — the surface the view serves", async () => {
    // This is the consumer the register's correction identified:
    // render/format-families.ts#jsonMolecule writes `molecule["links"] =
    // []` (:415). The registered view must agree with it, or a card that
    // dispatches :links directly and one that reads the molecule would
    // answer differently.
    const molecule = await jsonMoleculeOf("Oracle List Probe");
    // `links` is present as an EMPTY ARRAY - the list-family answer the
    // registered view returns, byte-identical to the value the view body
    // produced. Key presence is the assertion: a molecule that omitted the
    // key would leave the registered view's answer unreachable.
    expect(molecule.links).toEqual([]);
    expect(Object.keys(molecule)).toContain("links");
    // the sibling :items key is present too (data.rb:101-109 merges items:
    // _render_items, links: _render_links into one atom), so this is the
    // molecule shape and not a bare stub object.
    expect(Object.keys(molecule)).toContain("items");
  });

  it("the registration does not leak onto a NON-list card's json molecule (the general arm stays the named divergence)", async () => {
    const plain = await jsonMoleculeOf("Oracle Plain Probe");
    // Ruby's general data-format :links walks link_chunks
    // (data.rb:74-82); the port has no counterpart and writes the list
    // answer unconditionally — the divergence the register names. This
    // assertion PINS the current behaviour rather than endorsing it: if
    // this ever changes, the port gained the link_chunks walk and the
    // register's divergence note must be re-adjudicated.
    expect(plain.links).toEqual([]);
    expect(typeof plain.name).toBe("string");
  });
});