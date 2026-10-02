// The two `haml_file` views, and the tripwire for registering them.
//
// The views (verbatim from the gems):
//
//   card-mod-content set/abstract/haml_file.rb:20-22
//     view :core do
//       haml card.content, haml_locals
//     end
//
//   card-mod-assets set/abstract/mod_assets.rb:171-182
//     view :core do
//       groups = []
//       urls = card.group_remote_card.urls
//       groups << ["group: remote", urls] if urls.present?
//       card.item_cards.map do |item|
//         groups << [item.cardname.tag, item.input_item_cards.map(&:name)]
//       end
//       haml :group_list, groups: groups
//     end
//
// Byte truth: fixtures/captured/haml-slice/ - 53 group_list cases captured
// through the LIVE deck's own Card::Format#haml_to_html
// (tools/haml-slice/oracle-capture-group-list-haml-bytes.rb), plus 102
// measured Haml 5.2.2 engine cases.
//
// REGISTRATION TRIPWIRE. The mod-views-a lane MEASURED that registering a
// `:core` view on a set module most cards do not include silently takes over
// the engine's main content renderer for EVERY card -
// ViewRegistrationTable#chainFor (src/card/mod-loader/mod-registrar.ts) falls
// back to all registering set modules when a card's chain does not match
// (tmp/wrong-goal-hunt/mod-views-a-lane.md, batch 3). `:core` is the most
// dangerous name in the engine, so the last block pins the invariant: a
// plain card's :core must not change when these views exist in the deck.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DeckoName } from "../../../src/card/name.js";
import { RenderFormat, type RenderCard, type RenderEngineLike } from "../../../src/card/render/format.js";
import {
  GROUP_LIST_HAML,
  groupsFor,
  hamlFileCoreView,
  modAssetsCoreView,
} from "../../../src/card/render/haml-file-views.js";
import { compileHaml } from "../../../src/card/render/haml-slice-compiler.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const fixture = JSON.parse(
  readFileSync(
    join(REPO, "fixtures", "captured", "haml-slice", "assets-core-group-list.json"),
    "utf8",
  ),
) as {
  group_list_source: string;
  cases: Record<string, { locals: [string, string[]][]; bytes: string }>;
};

function stubEngine(): RenderEngineLike {
  return {
    views: {},
    fetchRenderCard: () => undefined,
    executeSearch: () => [],
    isDenied: () => false,
    resolveView: () => undefined,
  };
}

function makeCard(name: string, dbContent: string, typeName = "List"): RenderCard {
  const dn = DeckoName.parse(name);
  return {
    record: {
      id: 1,
      codename: undefined,
      leftId: undefined,
      rightId: undefined,
      typeId: undefined,
      dbContent,
      trash: false,
      creatorId: undefined,
      updaterId: undefined,
      createdAt: "2026-09-19 00:00:00.000",
      updatedAt: "2026-09-19 00:00:00.000",
      currentRevisionId: undefined,
      readRuleClass: undefined,
      readRuleId: undefined,
      referencesExpired: undefined,
      name: dn,
      key: dn.key,
      isNew: false,
      fromTrash: false,
      uncacheable: false,
    },
    name: dn,
    key: dn.key,
    typeName,
    typeId: undefined,
    dbContent,
    setKeys: "ALL TYPE-list",
  } as RenderCard;
}

/** ctx for a view fn: the format plus a voo the view never reads. */
function ctxFor(dbContent: string, name = "mod: bootstrap+*style"): ViewContextLike {
  const fmt = new RenderFormat(makeCard(name, dbContent), stubEngine());
  return { fmt, voo: undefined as never };
}

type ViewContextLike = Parameters<typeof modAssetsCoreView>[0];

describe("haml-file views: template identity", () => {
  it("GROUP_LIST_HAML is the gem file, byte for byte", () => {
    expect(GROUP_LIST_HAML).toBe(fixture.group_list_source);
  });
});

describe("haml-file views: assets :core against the live-Decko capture", () => {
  // The card body carries exactly ONE group, with a NON-EMPTY title: the
  // title is the first line and each item is a following line, and a blank
  // line cannot round-trip. Two oracle cases fall outside that seam and are
  // swept at the compiler level instead, where the `groups` local is passed
  // directly (tests/card/render/haml-slice-compiler.test.ts, 53 cases):
  //
  //   edge-two_groups / edge-three  - more than one group
  //   edge-empty_title              - a blank title cannot survive a line body
  //   edge-empty                    - zero groups has no first line at all
  //
  // The exclusion is asserted, so it can only change by an explicit edit.
  const roundTrippable = (locals: [string, string[]][]): boolean =>
    locals.length === 1 && locals[0]![0] !== "";
  const keys = Object.keys(fixture.cases).filter((k) =>
    roundTrippable(fixture.cases[k]!.locals as [string, string[]][]),
  );
  const excluded = Object.keys(fixture.cases).filter(
    (k) => !roundTrippable(fixture.cases[k]!.locals as [string, string[]][]),
  );

  it("round-trips 49 of the 53 captured cases through the card body; 4 are named", () => {
    expect(Object.keys(fixture.cases).length).toBe(53);
    expect(keys.length).toBe(49);
    expect(excluded.sort()).toEqual([
      "edge-empty",
      "edge-empty_title",
      "edge-three",
      "edge-two_groups",
    ]);
  });

  it(`covers all ${keys.length} single-group captured oracle cases byte-exactly`, () => {
    const mismatches: string[] = [];
    for (const key of keys) {
      const { locals, bytes } = fixture.cases[key]!;
      // The view reads the group list from the card body: title on the first
      // line, one item per line after it.
      const body = locals.map(([title, items]) => [title, ...items].join("\n")).join("\n");
      const got = modAssetsCoreView(ctxFor(body));
      if (got !== bytes) mismatches.push(`${key}\n  want ${JSON.stringify(bytes)}\n  got  ${JSON.stringify(got)}`);
    }
    expect(mismatches.join("\n")).toBe("");
  });

  it("the 4 excluded cases still compile byte-exactly when `groups` is passed directly", () => {
    for (const key of excluded) {
      const { locals, bytes } = fixture.cases[key]!;
      const fmt = new RenderFormat(makeCard("mod: bootstrap+*style", ""), stubEngine());
      const got = modAssetsCoreView({
        fmt,
        voo: undefined as never,
        // the seam the body would otherwise carry
      });
      // With no group list in the body the view renders ""; the multi-group
      // bytes are proven at the compiler level, not here. Assert the honest
      // behaviour rather than a fabricated one.
      expect(got).toBe("");
      expect(compileHaml(GROUP_LIST_HAML, { locals: { groups: locals as [string, string[]][] }, helpers: { list_group: (i: unknown) => `<ul class="list-group">${(i as string[]).map((x) => `<li class="list-group-item">${x}</li>`).join("\n")}</ul>` } })).toBe(bytes);
    }
  });
});

describe("haml-file views: content :core (HamlFile)", () => {
  it("an empty card body compiles to the empty string", () => {
    expect(hamlFileCoreView(ctxFor(""))).toBe("");
  });

  it("compiles a card body through the compiler, not through a table", () => {
    const src = "%p\n  %span= 1 + 1\n";
    expect(hamlFileCoreView(ctxFor(src))).toBe(compileHaml(src, { locals: {}, helpers: {} }));
    expect(hamlFileCoreView(ctxFor(src))).toBe("<p>\n<span>2</span>\n</p>\n");
  });

  it("haml_locals is {} in the gem, so an unnamed local is Ruby's NameError", () => {
    expect(() => hamlFileCoreView(ctxFor("= nope\n"))).toThrow(
      "undefined local variable or method `nope' for main",
    );
  });
});

describe("haml-file views: groupsFor is a one-line seam", () => {
  it("reads title + items from the card body, and nothing else", () => {
    expect(groupsFor(ctxFor("group: local\na.scss\nb.js\n"))).toEqual([
      ["group: local", ["a.scss", "b.js"]],
    ]);
  });

  it("an empty body is no groups, which renders the empty string", () => {
    expect(groupsFor(ctxFor(""))).toEqual([]);
    expect(modAssetsCoreView(ctxFor(""))).toBe("");
  });
});

describe("REGISTRATION TRIPWIRE: a plain card's :core is untouched", () => {
  it("a plain RichText card still renders its own body, not a group list", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 100, name: "Home", typeId: 2, dbContent: "hello" });
      const plain = await storage.engine.render("Home", "core");
      expect(plain).toContain("hello");
      expect(plain).not.toContain("list-group");
    } finally {
      storage.close();
    }
  });

  it("a card whose body IS an asset group does not reach the haml view yet", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, {
        id: 101,
        name: "Bootstrap Style",
        typeId: 2,
        dbContent: "group: local\ndecko_bootstrap.scss\n",
      });
      const bytes = await storage.engine.render("Bootstrap Style", "core");
      // The mod loader does NOT register modAssetsCoreView yet: the engine's
      // set-module chain is derived from a card's safe_set_keys
      // (src/card/render/set-keys-to-modules.ts), and `include_set
      // Abstract::ModAssets` is not part of that chain, so registering under
      // the set module would be inert - or, via chainFor's empty-chain
      // fallback, deck-wide. That is the named gap in the receipt, and this
      // assertion is the measured present state, not a wish.
      expect(bytes).not.toContain("list-group");
      // The view itself, called directly, DOES produce the group list.
      expect(modAssetsCoreView(ctxFor("group: local\ndecko_bootstrap.scss\n"))).toBe(
        '<p>\n<h5>\ngroup: local\n</h5>\n<ul class="list-group">' +
          '<li class="list-group-item">decko_bootstrap.scss</li></ul>\n</p>\n',
      );
    } finally {
      storage.close();
    }
  });
});
