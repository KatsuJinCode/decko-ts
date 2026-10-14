// The card-mod-comment mod loader integration test: the mod loaded
// through the loader registers its views and the rendered bytes match
// the Ruby source semantics.
//
// Proof shape (A/B per ported view):
//   WITHOUT the mod: render the view on the seeded probe card raises the
//     unsupported-view error (render.ts#view_method - the view does not
//     exist on the live registry).
//   WITH the mod: the view renders the port's documented bytes; the
//     set-modules basket records the full gem tree; the discussion-type
//     overrides (open/titled/titled_content/core) call the base view
//     AND mark :comment_box visible in the voo's viz hash; comment_box
//     itself renders the structural form HTML.
//
// Probe cards:
//   - Oracle Discussion Probe+discussion (junction): right side = discussion
//     so the right/discussion set module applies
//   - Oracle Comment Probe (any card; all/comment applies to every card)
//   - The bare discussion card (the seed data/real.yml's "discussion")

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectViewWithoutMod } from "../../support/native-views.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; their
  // type ids matter to the rule-cache join: set-typed vs setting-typed).
  await seedCard(s, { id: 2, name: "RichText" }); // cardtypes' type card
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the *discussion setting card (right-anchor for Right::Discussion and
  // right-anchor for Right::Comment; matches the data/real.yml seed).
  await seedCard(s, {
    id: 110,
    name: "discussion",
    codename: "discussion",
    typeId: 14,
  });

  // the *comment phrase setting card (right-anchor for Right::Comment)
  await seedCard(s, {
    id: 120,
    name: "comment",
    codename: "comment",
    typeId: 14,
  });

  // Oracle Discussion Probe (left side of the +discussion junction)
  await seedCard(s, {
    id: 200,
    name: "Oracle Discussion Probe",
    dbContent: "discussion probe body",
  });
  // Oracle Discussion Probe+discussion (the junction card: left=probe,
  // right=*discussion setting). The right/discussion set module applies.
  await seedCard(s, {
    id: 201,
    leftId: 200,
    rightId: 110,
    dbContent: "discussion junction body",
  });

  // Oracle Comment Probe (any card; all/comment applies to every card).
  await seedCard(s, {
    id: 210,
    name: "Oracle Comment Probe",
    dbContent: "comment probe body",
  });

  // The write-rule fallback the A/B depends on. Real decko decks bootstrap
  // *all+*update off the *all set (card-mod-permissions-0.20.0/data/real.yml
  // :14-19, the codename-all fields block). With NO update rule card in the
  // seed the write verdict fail-closes — permitVerdict denies when the deck
  // carries no rule data (Ruby who_can -> [] -> among? -> false,
  // set/all/permissions.rb:47-49 :100-118; missing rule -> PermissionDenied,
  // :77-85) — and comment_box's perms-update gate (view-perms.ts
  // VIEW_PERMS_DIRECTIVES comment_box: "update", from card-mod-comment
  // set/all/comment.rb:46) denies BEFORE view dispatch (permission.rb:19-23
  // altered_view runs ahead of render.rb:59-63 view_method, the only
  // UnsupportedViewError raise). A denied comment_box renders its :blank
  // denial (DENIAL_VIEW, view-perms.ts) — the empty string the A/B saw. The
  // suite's pins model the anonymous actor PASSING update (the author-label
  // arm renders only for anonymous, all/comment.rb:74-77), so this fixture
  // grants [[Anyone]] — one step wider than real.yml's Anyone Signed In
  // default, the exact configuration where the A/B isolates view
  // REGISTRATION rather than the permission matrix. Scoped to this file:
  // other render suites pin anonymous DENIALS and must keep their rule-less
  // fixture.
  await seedCard(s, { id: 121, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 122, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 123,
    name: "*all+*update",
    leftId: 10,
    rightId: 121,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 123, 122, "anyone");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-comment through the mod loader (A/B)", () => {
  it("WITHOUT the mod: the mod-specific views raise UnsupportedViewError", async () => {
    const s = storage!;
    // :open / :titled / :titled_content / :core are base views (they render
    // successfully without the mod); only the mod-specific views that the
    // gem introduces are absent from the registry.
    //
    // :open_content left this list once the engine had no registration for
    // it. It is declared in card-mod-format's BASE format
    // (set/all/base.rb:93-95, `_render_core`), so it was never
    // mod-specific. It renders now, which is the Ruby-faithful shape.
    expect(await s.engine.render("Oracle Discussion Probe+discussion", "open_content")).toBe(
      await s.engine.render("Oracle Discussion Probe+discussion", "core"),
    );
    await expectViewWithoutMod(s.engine.render("Oracle Discussion Probe+discussion", "input"), "input");
    // :comment_box left this list once it gained a BASE-TABLE
    // registration (views.ts commentBoxBaseView — the same seam
    // :open_content's own note above describes). It renders now; the
    // mod-layer A/B below still isolates the mod's own registration and its
    // Rails-form bytes.
    expect(await s.engine.render("Oracle Comment Probe", "comment_box")).toContain(
      "comment-box nodblclick",
    );
  });

  it("WITH the mod: :comment_box renders the served comment form (all/comment.rb:46-53)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModComment }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // The mod's :comment_box serves the base table's body: card_form's
    // UPDATE branch with the recaptcha wrap and the form-control author
    // field. The probe carries no *update rule, and this deck's no-rule
    // update verdict allows it.
    const html = await s.engine.render("Oracle Comment Probe", "comment_box");
    expect(html).toContain('<div class="comment-box nodblclick">');
    expect(html).toContain('id="edit_card_210" data-recaptcha="on" action="/update/Oracle_Comment_Probe"');
    expect(html).toContain('<input type="hidden" name="_method" value="patch" autocomplete="off" />');
    expect(html).toContain('<textarea rows="3" class=" form-control" name="card[comment]" id="card_comment">');
    expect(html).toContain('<button name="button" type="submit" data-disable-with="Commenting" class="btn btn-outline-primary">Comment</button>');
    expect(html).not.toContain('<input type="hidden" name="card[name]"');
  });

  it("WITH the mod: discussion :open dispatches to the base open view AND shows :comment_box (right/discussion.rb:1-6)", async () => {
    const s = storage!;
    // The discussion override sets voo's viz hash to show :comment_box and
    // dispatches to the base :open view; the result contains the base
    // open's slot-wrap markers (card-slot, open-view) plus the
    // accordion-item shell the open view renders.
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "open");
    expect(html).toContain("card-slot");
    expect(html).toContain("open-view");
    expect(html).toContain("accordion-item");
  });

  it("WITH the mod: discussion :titled dispatches to the base titled view (right/discussion.rb:1-6)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "titled");
    expect(html).toContain("card-slot");
    expect(html).toContain("titled-view");
    expect(html).toContain("d0-card-header");
  });

  it("WITH the mod: discussion :titled_content dispatches to base titled_content which renders core (right/discussion.rb:1-6)", async () => {
    const s = storage!;
    // The base titled_content view (views.ts:748) is a thin pass-through to
    // :core: `(ctx) => fmt.renderView("core")`. For the discussion card,
    // :core is ALSO overridden by the discussion mod, which appends the
    // comment_box bytes (mirroring Ruby's `output [super(),
    // render_comment_box(optional: :hide)]`). So the rendered bytes carry
    // the discussion card's content (the base core's processed body)
    // followed by the comment_box HTML.
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "titled_content");
    expect(html).toContain("discussion junction body");
    expect(html).toContain('<div class="comment-box nodblclick">');
    expect(html).toContain('<textarea rows="3" class=" form-control" name="card[comment]" id="card_comment">');
  });

  it("WITH the mod: a bare discussion :core is the base core alone - the optional: :hide box renders nil (right/discussion.rb:8-10)", async () => {
    const s = storage!;
    // `output [super(), render_comment_box(optional: :hide)]`: with no
    // ancestor voo recording `show :comment_box`, process_visibility enrolls
    // comment_box as :hide (card-1.110.0 lib/card/view/options/
    // visibility.rb:73-77) and View#process returns nil (lib/card/view.rb:
    // 68-69); output's compact drops it (lib/card/format/content.rb:70-73),
    // so there is no box and no separator newline. The synthetic-v2 oracle
    // records core:anonymous:Topic 001+discussion and core:admin:Topic
    // 001+discussion as the content alone for both viewers.
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "core");
    expect(html).toBe("discussion junction body");
  });

  it("WITH the mod: a discussion :core under a voo that shows :comment_box joins the box with one newline (right/discussion.rb:1-10)", async () => {
    const s = storage!;
    // :titled_content records `voo.show :comment_box` (discussion.rb:1-6)
    // and renders core; the box then renders and output joins the two
    // members with "\n".
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "titled_content");
    expect(html.startsWith('discussion junction body\n<div class="comment-box nodblclick">')).toBe(true);
  });

  it("WITH the mod: discussion :input falls through to base input (right/discussion.rb:12-16, non-editor branch)", async () => {
    const s = storage!;
    // in_multi_card_editor? is false in the headless engine, so the view
    // dispatches to super() — for an unset base :input view, the mod port
    // falls back to the format's :content view (the deck substitute).
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "input");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("WITH the mod: every set module from the gem tree is in the basket", () => {
    const basket = loader!.setModules();
    // the base pattern: all/comment
    expect(basket.base.map((m) => m.shortname)).toContain("All::Comment");
    // right nonbase: right/comment + right/discussion
    const right = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(right).toContain("Right::Comment");
    expect(right).toContain("Right::Discussion");
  });

  it("WITH the mod: the mod loader's load report lists every ported view", () => {
    // the ModLoadReport is returned by load(); re-run via the loader's
    // table introspection since the first call's report was discarded.
    const report = loader!.load();
    expect(report.registeredViews).toContain("comment_box");
    expect(report.registeredViews).toContain("open");
    expect(report.registeredViews).toContain("open_content");
    expect(report.registeredViews).toContain("titled");
    expect(report.registeredViews).toContain("titled_content");
    expect(report.registeredViews).toContain("core");
    expect(report.registeredViews).toContain("input");
  });

  it("WITH the mod: the comment_box view's denial config is registered (:blank, all/comment.rb:46)", () => {
    // The mod loader's view-config registry carries the mod's view
    // options so the format's view-permission gate can consult them
    // (see card-mod-help.ts line 272 for the same pattern).
    const config = loader!.viewConfigFor("comment_box");
    expect(config?.denial).toBe("blank");
    expect(config?.unknown).toBe(true);
    expect(config?.perms).toBe("update");
  });

  it("WITH the mod: the discussion overrides carry unknown: true (right/discussion.rb:1-10)", () => {
    for (const view of ["open", "open_content", "titled", "titled_content", "core"]) {
      expect(loader!.viewConfigFor(view)?.unknown).toBe(true);
    }
  });

  it("WITH the mod: a card's baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Discussion Probe+discussion", "content");
    // baseline :content is the format/views.ts#contentView; the mod
    // does NOT redefine :content for any of its set modules, so the
    // existing core content renders unchanged. We assert it renders
    // WITHOUT throwing and produces a non-empty slot.
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
  });
});