// Abstract::TemplatedNests — the :core nest-mode wrap
// (card-mod-content-0.20.0 set/abstract/templated_nests.rb:1-7):
//
//     format :html do
//       view :core do
//         with_nest_mode :template do
//           super()
//         end
//       end
//     end
//
// WHAT IS PINNED HERE, AND WHY THE BYTES ARE THE PROOF
//
// The wrap is declared on the ABSTRACT set module, so it only reaches a
// card through `include_set` (set/inheritance.rb). The pinned gemset has
// exactly THREE live includers (grep -rn "TemplatedNests" over
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems returns five
// hits: this definition plus the four below; run when this file was
// written):
//
//   card-mod-content-0.20.0 set/right/default.rb:1    include_set Abstract::TemplatedNests
//   card-mod-content-0.20.0 set/right/structure.rb:1  include_set Abstract::TemplatedNests
//   card-mod-help-0.20.0      set/right/help.rb:1     include_set Abstract::TemplatedNests
//   card-mod-help-0.20.0      set/right/guide.rb:1    # include_set Abstract::TemplatedNests  <- COMMENTED OUT
//
// The port's loader-less render gate is the right-tag mirror of that
// includer set (render/views.ts#isTemplatedNestsCard /
// isTemplatedNestsName over TEMPLATED_NESTS_RIGHT_TAGS). Before this
// entry the table named only *default and *structure, so a *help card's
// :core rendered in :normal nest mode where Ruby renders it in :template.
//
// :template is observable in the OUTPUT BYTES, not in a flag:
// format/nesting/mode.rb:45-50 routes a nest rendered under :template to
// the :template_nest view, and card-mod-edit-0.20.0
// set/all/template_nest.rb:2-12 answers a nest that is not field-only
// with the nest's OWN SYNTAX RE-EMITTED VERBATIM:
//
//     "{{#{voo.nest_syntax}}}"
//
// So a card whose :core runs under :template PRINTS ITS NESTS BACK
// UNCHANGED, while the same body rendered in :normal mode EXPANDS them.
// That is the oracle-shaped discriminator this file asserts, and it is
// the same mechanism tests/card/render/layout-template-nest-mode.test.ts
// pins for the layout cardtype.
//
// A field-only nest (`{{+field}}`) is the other arm of that view
// (template_nest.rb:7-11): it renders the SET card that owns the rule
// through :template_link. Both arms appear below, so the mode is pinned
// from either side.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ModLoader } from "../../../src/card/mod-loader.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import cardModContent from "../../../src/card/mod-loader/mods/card-mod-content.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard } from "../render/render-test-storage.js";
import { isTemplatedNestsName } from "../../../src/card/render/views.js";
import { DeckoName } from "../../../src/card/name.js";

// :template_nest lives in the mod DECK (card-mod-edit
// set/all/template_nest.rb) and a RenderEngine binds its loader in its
// constructor, so the deck must be booted for the substituted view to
// exist. Bound once for the file, unbound in afterAll — the same shape
// tests/card/render/layout-template-nest-mode.test.ts uses.
beforeAll(() => {
  defaultDeckLoader();
});

afterAll(() => {
  setDefaultModLoader(undefined);
});

describe("Abstract::TemplatedNests — the includer census (set/right/default.rb:1, right/structure.rb:1, help right/help.rb:1)", () => {
  it("the render-path name predicate names exactly the gem's three live includers", () => {
    // the three `include_set Abstract::TemplatedNests` lines
    expect(isTemplatedNestsName(DeckoName.parse("X+*default"))).toBe(true);
    expect(isTemplatedNestsName(DeckoName.parse("X+*structure"))).toBe(true);
    expect(isTemplatedNestsName(DeckoName.parse("X+*help"))).toBe(true);
    // card-mod-help set/right/guide.rb:1 — the include line is COMMENTED
    // OUT in the gem, so *guide must NOT be an includer.
    expect(isTemplatedNestsName(DeckoName.parse("X+*guide"))).toBe(false);
    // a card with no right tag at all
    expect(isTemplatedNestsName(DeckoName.parse("Plain Card"))).toBe(false);
  });

  it("the abstract stays in the set-module basket under the gem's path (the registrar's set-tree walk)", async () => {
    const loader = new ModLoader([
      { manifest: cardModContent },
      { manifest: cardModHelp },
    ]);
    const report = loader.load();
    try {
      // the set module carries the gem's path verbatim — the shortname is
      // the Abstract::TemplatedNests the three includers name
      expect(loader.setModules().abstract.map((m) => m.shortname)).toContain(
        "Abstract::TemplatedNests",
      );
      // :core is deliberately NOT registered on the abstract: the wrap
      // lives on the engine's coreView (render/views.ts, isTemplatedNests-
      // Card -> withNestMode) and a mod-bound registration recursed
      // through superView — see the NAMED SKIP on the setModules entry in
      // card-mod-content.ts. So the content mod registers no :core of its
      // own, and this assertion pins that (a future re-registration would
      // show up here as a failure, which is the point).
      expect(report.registeredViews).not.toContain("core");
    } finally {
      loader.reset();
    }
  });
});

describe("Abstract::TemplatedNests — the mode, in the rendered bytes", () => {
  let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
  let loader: ModLoader;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    // the anchors the junctions compose
    await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
    await seedCard(s, { id: 12, name: "*right", codename: "right", typeId: 13 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 13 });
    await seedCard(s, { id: 100, name: "*default", codename: "default", typeId: 14 });
    await seedCard(s, { id: 110, name: "*structure", codename: "structure", typeId: 14 });
    await seedCard(s, { id: 120, name: "*help", codename: "help", typeId: 14 });
    await seedCard(s, { id: 130, name: "*guide", codename: "guide", typeId: 14 });
    await seedCard(s, { id: 122, name: "*other", codename: "other", typeId: 14 });

    // Oracle Set Owner — a Cardtype-typed card, so template_nest.rb's
    // on_type_set arm finds a trunk name and a field-only nest resolves
    // through [type, name].to_name.field_name :type_plus_right (:23-31).
    await seedCard(s, { id: 200, name: "Role", typeId: 3, dbContent: "" });
    // the nest a NON-field nest names — a REAL card, so a :normal nest
    // would expand. That is what makes the assertion below a gate rather
    // than a pass because the target is missing.
    // The nest target: a REAL card with REAL content, so a :normal-mode
    // nest expands into bytes that carry "target body" (the nest renders
    // view :core). An empty target would make the :normal arm pass for
    // the wrong reason — an empty nest and a dropped nest look alike — so
    // the contrast below is anchored on the target's own bytes.
    await seedCard(s, {
      id: 210,
      name: "Oracle Nest Target",
      typeId: 2,
      dbContent: "target body",
    });

    // THE PROBE CARDS. The Abstract::TemplatedNests includers are SET
    // MODULES keyed on a RIGHT TAG, so any card whose name carries that
    // tag picks the wrap up — including the TYPE_PLUS_RIGHT shape the
    // corpus renders (`Role+*type+*default`, corpus 6a44dfdc page 105,
    // quoted in render/views.ts's isTemplatedNestsCard header). That is
    // the shape below: a Cardtype-trunked set card's `+*type+*<tag>`
    // field, carrying a nest in its stored rule body.
    //
    // Ruby, card-mod-content-0.20.0 set/right/default.rb:1 (and
    // right/structure.rb:1, and card-mod-help right/help.rb:1):
    // `include_set Abstract::TemplatedNests` -> the card's :core is
    // `with_nest_mode :template { super() }` -> a non-field nest routes to
    // :template_nest -> template_nest.rb:12-13 re-emits "{{nest_syntax}}"
    // VERBATIM. Under :normal the same nest EXPANDS into a slot link.
    // That contrast is the whole discriminator, and it is the same
    // mechanism tests/card/render/layout-template-nest-mode.test.ts pins.
    await seedCard(s, { id: 140, name: "*type", codename: "type", typeId: 14 });
    // *description — the field a `{{+description}}` nest names, and the
    // card whose junction Role+description carries.
    await seedCard(s, {
      id: 121,
      name: "*description",
      codename: "description",
      typeId: 14,
    });
    await seedCard(s, { id: 201, leftId: 200, rightId: 121, typeId: 14, dbContent: "" });

    // One probe per right tag. `base` is the id the owner's +*type field
    // takes; the probe field itself is base+1, so each probe owns a
    // disjoint id pair.
    const probeField = async (
      base: number,
      ownerName: string,
      rightId: number,
      body: string,
    ) => {
      // typeId 2 (Basic), NOT Cardtype: a Cardtype owner's `+*type+*<tag>`
    // field routes :core to the RULES-LISTING view (the rules that apply),
    // which never reaches the stored-content core the wrap governs. A
    // plain set card's field does render its stored body.
    await seedCard(s, { id: base, name: ownerName, typeId: 2, dbContent: "" });
      await seedCard(s, { id: base + 10, leftId: base, rightId: 140, typeId: 14, dbContent: "" });
      // The field is typed Basic (2), NOT Setting (14): a Setting-typed
      // card's :core is the RULES LISTING (views.ts#settingCoreHtml) in
      // Ruby and in the port, so it never reaches the stored content the
      // wrap governs. A Basic-typed card renders its own body, which is
      // where the gate's decision becomes visible in the bytes.
      await seedCard(s, { id: base + 11, leftId: base + 10, rightId, typeId: 2, dbContent: body });
    };

    await probeField(300, "Oracle Help Owner", 120, "{{Oracle Nest Target}}");
    await probeField(320, "Oracle Default Owner", 100, "{{Oracle Nest Target}}");
    await probeField(340, "Oracle Structure Owner", 110, "{{Oracle Nest Target}}");
    // the negative control: *guide is NOT an includer (card-mod-help
    // set/right/guide.rb:1 has the include line COMMENTED OUT)
    await probeField(360, "Oracle Guide Owner", 130, "{{Oracle Nest Target}}");
    // the negative control: a card with NO templated-nests right tag
    await probeField(380, "Oracle Plain Owner", 122, "{{Oracle Nest Target}}");
    // the name environment (name.ts#installNameEnvironment) reads the
    // codename registry before a nest name resolves; without it the probe
    // nests cannot resolve and every arm would pass for the wrong reason.
    s.fetcher.installNameEnvironment();
    await s.fetcher.warmLexicon([
      2, 3, 11, 12, 13, 14, 100, 110, 120, 121, 122, 130, 140, 200, 201, 210,
    ]);

    // the field-only arm's probe: the same help owner, one step deeper,
    // carrying `{{+description}}`
    await seedCard(s, {
      id: 312,
      leftId: 311,
      rightId: 121,
      typeId: 2,
      dbContent: "{{+description}}",
    });

    loader = new ModLoader([
      { manifest: cardModContent },
      { manifest: cardModHelp },
    ]);
    loader.load();
    bindModLoaderToEngine(s, loader);
  }, 60_000);

  afterAll(() => {
    loader?.reset();
    storage?.close();
  });

  /** The RENDERED bytes of a probe field card through the real render
   *  path — engine.render(name, "core") — so the mode is whatever the
   *  engine's own gate (render/views.ts#isTemplatedNestsCard over
   *  TEMPLATED_NESTS_RIGHT_TAGS) decides. A helper that FORCED the mode
   *  would pin the machinery, not the gate, and every negative control
   *  would pass for the wrong reason.
   *
   *  The probe field is typed Basic rather than Setting precisely so that
   *  :core reaches the stored body: a Setting-typed field renders the
   *  rules listing instead (views.ts#settingCoreHtml:2918-2919, porting
   *  card-mod-rules-0.20.0 set/type/setting.rb:39-55), which says nothing
   *  about the wrap. */
  const renderedCore = async (name: string): Promise<string> =>
    storage.engine.render(name, "core");

  /** An Abstract::TemplatedNests includer's :core runs under
   *  with_nest_mode :template (templated_nests.rb:3-5), so a non-field
   *  nest routes to :template_nest and prints back VERBATIM
   *  (card-mod-edit-0.20.0 set/all/template_nest.rb:12-13
   *  `"{{#{voo.nest_syntax}}}"`). The contrast that pins it: the same card
   *  and the same nest, one on an includer and one not. */
  const verbatimArm = async (fieldName: string) => {
    const bytes = await renderedCore(fieldName);
    expect(bytes).toContain("{{Oracle Nest Target}}");
    return bytes;
  };

  it("*help: :core runs under :template — the nest is RE-EMITTED VERBATIM (template_nest.rb:12-13)", async () => {
    // Ruby: card-mod-help-0.20.0 set/right/help.rb:1
    // `include_set Abstract::TemplatedNests` — the THIRD includer, and
    // the one this entry adds to the port's right-tag table. Before it,
    // this card rendered under :normal and the nest expanded.
    await verbatimArm("Oracle Help Owner+*type+*help");
  });

  it("*default and *structure: still render under :template (the two arms the port already carried)", async () => {
    await verbatimArm("Oracle Default Owner+*type+*default");
    await verbatimArm("Oracle Structure Owner+*type+*structure");
  });

  it("*guide: NOT an includer (help's right/guide.rb:1 is commented out) — the nest EXPANDS", async () => {
    // The negative control, and the one that would fail if the table grew
    // a `*guide` entry: the include line is commented out in the gem, so
    // Ruby's guide cards render in :normal mode and expand the nest.
    const bytes = await renderedCore("Oracle Guide Owner+*type+*guide");
    expect(bytes).not.toContain("{{Oracle Nest Target}}");
    expect(bytes).toContain("oracle_nest_target");
  });

  it("a card with no templated-nests right tag is unaffected — the nest EXPANDS", async () => {
    const bytes = await renderedCore("Oracle Plain Owner+*type+*other");
    expect(bytes).not.toContain("{{Oracle Nest Target}}");
    expect(bytes).toContain("oracle_nest_target");
  });

  it("the field-only arm resolves through :template_link rather than re-emitting (template_nest.rb:7-11)", async () => {
    // `{{+description}}` is field-only (to_name.field_only?), so
    // template_nest.rb:7-11 renders `template_link_set_name` with view
    // :template_link instead of the verbatim `"{{nest_syntax}}"`. On a
    // set-card-trunked owner that set name is [Role, description]
    // .to_name.field_name :type_plus_right (:23-31) — the Role+description
    // junction the deck seeds — so the nest resolves instead of printing
    // back. Both arms of the view are pinned by this pair.
    const bytes = await renderedCore(
      "Oracle Help Owner+*type+*help+*description",
    );
    expect(bytes).not.toContain("{{+description}}");
    expect(bytes).not.toContain("{{Oracle Nest Target}}");
  });
});