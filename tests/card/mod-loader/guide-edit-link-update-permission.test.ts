// The guide edit-link's update gate, on a synthetic deck a clean clone can
// run. This is the signed-in-editing parity claim the captured oracle
// recorded and that tests/card/mod-loader/card-mod-edit-views.test.ts pins
// against fixtures/captured/{board-views,edit-views}.json - a path a clean
// clone does not have, so that suite skips there and guards nothing
// (docs/TESTING.md). This file proves the same rule from Ruby's SOURCE
// LOGIC, so the claim survives without the capture.
//
// Ruby's rule, in one line (card-mod-help-0.20.0
// mod/help/set/all/guide.rb:27-32, `prepend_guide_edit_link`):
//
//     def prepend_guide_edit_link guide_text
//       return guide_text unless guide_card.ok?(:update)
//       edit_link = with_nest_mode(:normal) { nest(guide_card, view: :edit_link) }
//       "<span class='d-none'>#{edit_link}</span>#{guide_text}"
//     end
//
// The gate is `ok?(:update)` ON THE GUIDE CARD ITSELF - not on the card
// being rendered. `guide_card` is the *guide RULE card
// (guide.rb:47-53 determine_guide_card: `rule_card :guide`, then the
// pointer hop, then `guide_card if guide_card.ok?(:read)`), so the
// question "who sees this edit link" is "who may UPDATE that rule card".
// The rule card is nested, never a render root, which is exactly why the
// engine's verdict for it has to be prepared explicitly rather than read
// off the render root.
//
// Two actors, one deck, opposite answers - both derived from the line
// above, not from the port's output:
//
//   ALWAYS-OK (the DeckoBot actor)   ok?(:update) is true  -> d-none span
//   PLAIN MEMBER                     ok?(:update) is false -> bare text
//
// The always-ok short-circuit is auth/permissions.rb:7-13's
// Auth.always_ok? - the DeckoBot actor card carries the "decko_bot"
// codename (codename.rb:107-110; the alternate "deckobot" spelling
// silently loses the short-circuit). The member is denied because the
// seeded *update rule names only Administrator.
//
// The span's SHAPE is pinned too, because the bug class this file exists
// to catch is a link rendered where Ruby's gate denies one: `class='d-none'`
// with SINGLE quotes (the HAML block emission at guide.rb:31 - the
// help-text sibling at help.rb:22 is a different method and emits the
// same way), the href pointing at the RULE editor. The Rule cardtype
// overrides edit_link_view to :rule_edit
// (card-mod-rules-0.20.0 set/rule/editor.rb:60-62), so the link is
// /<rule card>/rule_edit and NOT the default /<name>/edit.
//
// Synthetic deck (no captured fixture; ids are this file's own):
//   *all+*guide          the guide rule card, Markdown-typed
//   *all+*right+*update  -> [[Administrator]], the member's denial
//   Decko Bot            the always-ok actor ("decko_bot")
//   Tova                 the plain member
//   Oracle Basics        the rendered card, carrying no *self junction,
//                        so its *guide rule resolves to the *all+*guide
//                        card above through the candidate walk.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";

const BOT_ID = 1;
const MEMBER_ID = 583;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the actors. The bot's codename is the STORED spelling the auth seam
  // matches (read-rules.ts DECKOBOT_CODENAME "decko_bot" - codename.rb:
  // 107-110); "deckobot" would silently lose always_ok and this file's
  // positive arm would fail for the wrong reason.
  await seedCard(s, { id: BOT_ID, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: MEMBER_ID, name: "Tova" });

  // Cardtypes and codenames the rule walk and the auth seam read. The
  // set/setting type ids ARE the *set and *setting card ids (13 and 14) -
  // not arbitrary numbers: the mods' prepareEngine resolves the warm's
  // set/setting type ids by CODENAME (rule-card-warm.ts warmRuleCards:
  // host.codenames.peekId("set"/"setting")), so a *all card carrying any
  // other type_id falls outside the warm's WHERE clause and the guide
  // rule card never reaches the render-card map. The ids below are the
  // captured-oracle suite's proven values for the same reason
  // (card-mod-edit-views.test.ts:241-247).
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the *right pattern card and the *guide setting card
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 14 });
  await seedCard(s, { id: 118, name: "*right", codename: "right", typeId: 14 });
  // the Markdown cardtype (52), so the guide rule card's :core nest
  // resolves through the markdown type rather than plain RichText
  await seedCard(s, { id: 52, name: "Markdown", typeId: 9 });
  // Role: Ruby's seed types Administrator as a Role, and Role is a Cardtype.
  await seedCard(s, { id: 127, name: "Cardtype", codename: "cardtype", typeId: 127 });
  await seedCard(s, { id: 126, name: "Role", codename: "role", typeId: 127 });
  await seedCard(s, { id: 121, name: "Administrator", codename: "administrator", typeId: 126 });

  // The guide RULE card IS "*all+*guide" itself - the junction the
  // *guide candidate walk lands on, Markdown-typed so its :core nest goes
  // through the markdown type. Its dbContent is the guide text; the body
  // mentions no [[link]] so the assertion needs no chunk machinery.
  await seedCard(s, {
    id: 120,
    leftId: 10, // *all
    rightId: 115, // *guide
    typeId: 52, // Markdown
    typeName: "Markdown",
    dbContent: "Guidance prose for the synthetic guide card.",
  });

  // The member's denial: "*guide+*right+*update" -> [[Administrator]]. The
  // Right-pattern join makes that card an update candidate for the
  // *all+*guide rule card, and the only who_can is Administrator - so a
  // plain member's ok?(:update) on the guide card is false. This is the
  // same stand-in shape the captured-oracle suite seeds
  // (card-mod-edit-views.test.ts:449-459) and stands in for the protection
  // Ruby's own rule-card read/update rules carry OUTSIDE the candidate
  // walk (the deck's own *all+*update would otherwise grant "Anyone
  // Signed In").
  await seedCard(s, { id: 123, leftId: 115, rightId: 118, typeId: 13 }); // *guide+*right
  await seedCard(s, { id: 124, leftId: 123, rightId: 12, dbContent: "[[Administrator]]" });
  await seedReference(s, 124, 121, "administrator");

  // the rendered card. No *self junction, so the *guide candidate walk
  // falls through to the *all+*guide rule card above.
  await seedCard(s, {
    id: 25,
    name: "Oracle Basics",
    typeId: 2, // RichText
    typeName: "RichText",
    dbContent: "A plain basic card.",
  });

  // A second target whose guide RULE card is itself named so that url_key
  // and the raw name differ: "My Board+*self+*guide". The *self junction
  // is what puts that card first in the candidate walk (patterns in
  // precedence order: a card's own *self outranks the global *all - the
  // walk in card-mod-help.ts#guideRuleCard), so this arm resolves the
  // underscored rule card rather than the "*all+*guide" one above.
  //
  // Ruby's link_to resolves the card's url_key (variants.rb #url_key),
  // which underscores the space, so the rule editor href is
  // "/My_Board+*self+*guide/rule_edit" - NOT the raw name with its space.
  // card-mod-help's copy of the helper read url_key and card-mod-edit's
  // copy read the raw name, so the two ports of one Ruby method disagreed
  // here; this arm pins the Ruby form on BOTH (the :guide view and the
  // edit surface's :overlay_guide).
  await seedCard(s, { id: 26, name: "My Board", typeId: 2, typeName: "RichText" });
  await seedCard(s, { id: 27, leftId: 26, rightId: 11, typeId: 13 }); // My Board+*self
  await seedCard(s, {
    id: 28,
    leftId: 27, // My Board+*self
    rightId: 115, // *guide
    typeId: 52, // Markdown
    typeName: "Markdown",
    dbContent: "Guidance prose for the underscored-set guide card.",
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);

  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The per-render random slot id (SecureRandom.hex(10), wrap.rb:45) is
 *  masked so two renders of the same view compare byte for byte. Applied
 *  to both sides wherever two outputs are compared. */
function normalize(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
}

/** A fresh engine bound to the loaded mods, warmed the way a page load
 *  warms it, so the GUIDE RULE CARD's update verdict is established.
 *
 *  The warm is the load-bearing part of this file, not decoration. The
 *  guide card is nested, never a render root: the engine's task-verdict
 *  prepare (RenderEngine#ensureTaskVerdicts, render.ts) seats verdicts for
 *  the cards a view requires, and a view that never names the guide rule
 *  card leaves its verdict unestablished. Unestablished is NOT allowed -
 *  the seam is deny-by-default - so a link missing without the warm would
 *  look like a correct denial. A guide render (guide_tab delegates to it,
 *  tab_views.rb:47-49) pulls the rule card into the map; a task-requiring
 *  view (edit_inline) then runs the verdict walk over it. Ruby has no such
 *  ordering hazard - ok?(:update) is an immediate query - which is why the
 *  port owes the prepare, and why this helper exists. */
async function warmedEngine(actorId: number): Promise<RenderEngine> {
  const engine = new RenderEngine(new FetchEngine(storage!.counting));
  engine.viewer = { signedIn: true, actorId };
  engine.pageSession = { signedIn: true, actorId };
  engine.modLoader = loader!;
  await loader!.installInto(modEngineHost(engine, storage!.fetcher));
  await engine.render("Oracle Basics", "guide_tab");
  await engine.render("Oracle Basics", "edit_inline");
  return engine;
}

describe("the guide edit link follows guide_card.ok?(:update) (guide.rb:27-32)", () => {
  it("renders the d-none edit-link span for an update-allowed viewer", async () => {
    const engine = await warmedEngine(BOT_ID);
    const html = await engine.render("Oracle Basics", "guide");

    // guide.rb:6-16 - wrap: :slot around a div.guide-text body
    expect(html).toContain("class=\"guide-text\"");
    // guide.rb:31 - the single-quoted d-none span (the HAML block's
    // literal class attribute, NOT the double-quoted form the slot wrapper
    // around it uses)
    expect(html).toContain("class='d-none'");
    // guide.rb:30 nests the guide card with view: :edit_link; the Rule
    // cardtype's edit_link_view override (rules set/rule/editor.rb:60-62)
    // retargets it at the RULE editor, so the href is /<rule>/rule_edit
    expect(html).toContain('href="/*all+*guide/rule_edit"');
    // the guide body itself still renders - the span PREPENDS
    expect(html).toContain("Guidance prose for the synthetic guide card.");
  });

  it("omits the edit link for a viewer the guide card's update rule denies", async () => {
    const engine = await warmedEngine(MEMBER_ID);
    const html = await engine.render("Oracle Basics", "guide");

    // The same guide text renders - guide.rb:11's guide_text guard and the
    // div.guide-text wrap do not depend on the update verdict.
    expect(html).toContain("class=\"guide-text\"");
    expect(html).toContain("Guidance prose for the synthetic guide card.");
    // guide.rb:28 `return guide_text unless guide_card.ok?(:update)` - the
    // seeded *update rule names only Administrator and Tova is not one, so
    // the span is NOT emitted. This is the assertion the regression broke:
    // the deny-only gate let the span through for every actor, so the
    // captured oracle's member and anonymous arms differed from the port's
    // bytes on exactly this span.
    expect(html).not.toContain("class='d-none'");
    expect(html).not.toContain("rule_edit");
  });

  it("the two arms differ only by the span - same guide bytes either way", async () => {
    // The split is the update gate and nothing else: strip the span from
    // the always-ok arm and it matches the member's byte for byte. This is
    // what makes the pair evidence about the gate rather than about two
    // differently-seeded worlds.
    //
    // data-slot-id is a per-render SecureRandom hex (wrap.rb:45), so it is
    // normalized on BOTH sides before the comparison - the same mask the
    // captured-oracle suite applies to its two sides.
    const bot = await warmedEngine(BOT_ID);
    const member = await warmedEngine(MEMBER_ID);
    const botHtml = normalize(await bot.render("Oracle Basics", "guide"));
    const memberHtml = normalize(await member.render("Oracle Basics", "guide"));

    expect(botHtml).toContain("class='d-none'");
    expect(memberHtml).not.toContain("class='d-none'");

    const stripped = botHtml.replace(/<span class='d-none'>.*?<\/span>/, "");
    expect(stripped).toBe(memberHtml);
  });

  it("the edit surface's own guide copy splits the same way (overlay_guide)", async () => {
    // card-mod-edit carries its OWN copy of the guide helper - the mod
    // files stay self-contained (card-mod-edit.ts:2062-2065) rather than
    // importing card-mod-help's, and overlay_guide.haml's `= guide` calls
    // that copy's guideHelper. The captured-oracle suite's failures were
    // on this view (the :overlay_guide arm of "Oracle Basics", and the
    // board's guide view), so the gate is pinned on BOTH copies: a fix
    // that landed in one file and not the other would leave the edit
    // surface emitting the link for a denied viewer, which is the
    // regression this file exists to hold shut.
    //
    // overlay_guide.rb:2-8 + overlay_guide.haml: the close link and the
    // overlay wrap are fixed bytes; `= guide` contributes the guide-text
    // div, so the assertions below target that div's contents.
    const bot = await warmedEngine(BOT_ID);
    const member = await warmedEngine(MEMBER_ID);
    const botHtml = await bot.render("Oracle Basics", "overlay_guide");
    const memberHtml = await member.render("Oracle Basics", "overlay_guide");

    // the overlay wrap itself (overlay_guide.haml's outer div and the
    // close link) - asserted so a passing gate cannot come from the view
    // not having rendered at all
    expect(botHtml).toContain("overlay_guide");
    expect(botHtml).toContain('data-bs-dismiss="overlay"');
    expect(botHtml).toContain("class=\"guide-text\"");

    // the gate, through the edit mod's own copy
    expect(botHtml).toContain("class='d-none'");
    expect(botHtml).toContain('href="/*all+*guide/rule_edit"');
    expect(memberHtml).toContain("class=\"guide-text\"");
    expect(memberHtml).toContain("Guidance prose for the synthetic guide card.");
    expect(memberHtml).not.toContain("class='d-none'");
    expect(memberHtml).not.toContain("rule_edit");
  });

  it("builds the rule-editor href from url_key, not the raw name (variants.rb #url_key)", async () => {
    // The guide rule card here is "My Board+*self+*guide". Ruby's link_to
    // resolves the card's url_key, which underscores the space; the raw
    // name would put a literal space in the href. Both ports of this Ruby
    // method - card-mod-help's :guide and card-mod-edit's :overlay_guide -
    // are asserted, because they are separate copies and had drifted.
    const bot = await warmedEngine(BOT_ID);
    const guideHtml = await bot.render("My Board", "guide");
    const overlayHtml = await bot.render("My Board", "overlay_guide");

    expect(guideHtml).toContain('href="/My_Board+*self+*guide/rule_edit"');
    expect(guideHtml).not.toContain('href="/My Board+*self+*guide/rule_edit"');
    expect(overlayHtml).toContain('href="/My_Board+*self+*guide/rule_edit"');
    expect(overlayHtml).not.toContain('href="/My Board+*self+*guide/rule_edit"');
  });
});