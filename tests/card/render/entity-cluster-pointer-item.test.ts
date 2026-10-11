// Pointer/list item inner body identity: when the host's item_type_name
// resolves to a non-BasicCs type, the inner `<div class="bar ...">` body
// of an UNKNOWN read-denied item must carry that host type (its
// data-card-type-id/name and ALL TYPE-* class chip), not the corpus's
// default phantom fallback (22281 BasicCs / basic_c).
//
// Bug shape (mechanism-census mechanism (f) "unresolved
// content-divergence with an entity-named-card cluster"; sampled
// examples id 14546 "Jonas Verhoeven+musings", id 15261 "Daemeon
// Reiydelle+Project(s) Organizing", id 16122 "Alexander Rendell+musings",
// id 14329 "Nathan Colville+musings", id 12 "Sign up", id 22 "PlainText",
// id 827 "VPX", id 35864 "Robert Ellingham Yamada Yoshimitsu New York Aikikai",
// id 40381 "Practice Pool+Slack Channel naming conventions most in use+*self",
// id 43485 "Artificial Intelligence+anon_exchange_02+*self", id 49305
// "mod: account+*script" — pages whose names share an entity cluster
// because the +musings / +rvw / +Sign up / etc family all funnel through
// this code path):
//
//   <div id="<item>-mini_bar-view" class="card-slot mini_bar-view ALL TYPE-consideration"
//        data-card-type-id="2979" data-card-type-name="consideration"
//        data-slot="...&quot;type&quot;:&quot;consideration&quot;}">
//     <!-- ORACLE inner body uses the host's item type: -->
//     <div class='bar ALL TYPE-consideration with-bar-menu nodblclick d-flex _card-link'
//          data-card-type-id='2979' data-card-type-name='consideration'>
//       <!-- bar-left with the card-title span (the readable-item bar.haml body) -->
//     </div>
//   </div>
//
//   <!-- ENGINE inner body uses the corpus's default phantom type: -->
//   <div class='bar ALL TYPE-basic_c with-bar-menu nodblclick d-flex _card-link'
//        data-card-type-id='22281' data-card-type-name='BasicCs'>
//     <span class="denied">...</span>
//     <span class="denied">...</span>
//   </div>
//
// The OUTER slot wrap already carries the host type
// (pointerListItemSlot reads phantom.typeId/typeName — set by
// phantomPointerListItem(name, phantomIdentity(hostItemType))); the
// INNER body is built by pointerListItemBodyForUnknown WITHOUT the
// host type (views.ts:1588). Ruby's item.rb#new_unknown_item_args
// folds the host item_type into the phantom's type attrs BOTH in the
// outer nest wrap and the inner bar.haml body — the port has the
// outer right and the inner wrong.
//
// This is a same-tree, same-DB, single-engine-byte diff: fixing the
// inner body identity chain flips the captured oracle bytes byte-exact
// for every entity-cluster +musings / +rvw / etc page in the 36
// content-divergence population whose only divergence was the inner
// TYPE-* class chip + data-card-type-* attrs on the inner bar div.

import { describe, it, expect, afterAll } from "vitest";
import { pointerListItemBodyForUnknown } from "../../../src/card/render/pointer-list.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";
import { PRODUCTION_PHANTOM_ITEM_TYPE } from "../../deploy/fixtures/production-deck-served-deltas.js";

/** The cardtype cards the codename registry needs for typeCode gates. */
async function seedCardtypes(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
}

/** The settings/sides the rule walks and junction fetches resolve. */
async function seedSettings(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 700, name: "*right", typeId: 2 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 702, name: "*input type", typeId: 2 });
  await seedCard(s, { id: 703, name: "*layout", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259, dbContent: "fr" });
}

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("entity-cluster phantom pointer/list item: inner body carries host item type, not BasicCs fallback", () => {
  // -------------------------------------------------------------------------
  // UNIT: pin the inner-body builder's identity acceptance. Pointer-list's
  // pointerListItemBodyForUnknown (the function the phantom path calls)
  // already accepts an identity override; these tests pin its contract
  // so the call-site fix can rely on it without re-deriving the chip math.
  // -------------------------------------------------------------------------
  it("unit: no identity -> the DECK's configured phantom type (the no-host-type fallback pin)", () => {
    // The fallback is the deck's own `*all+*default` template type, which is
    // deployment CONFIGURATION rather than an
    // engine constant. This case hands the builder the production deck's
    // configured type and pins that those bytes still come out right.
    const body = pointerListItemBodyForUnknown(
      "phantom item",
      undefined,
      PRODUCTION_PHANTOM_ITEM_TYPE,
    );
    expect(body).toMatch(/<div class='bar [^']*TYPE-basic_c[^']*with-bar-menu/);
    expect(body).toContain("data-card-type-id='22281'");
    expect(body).toContain("data-card-type-name='BasicCs'");
    expect(body).not.toContain("TYPE-consideration");
    expect(body).not.toContain("data-card-type-id='2979'");
  });

  it("unit: no identity AND no configured phantom type -> no type chip at all", () => {
    // The counterpart, and the regression guard for the defect itself: a
    // deck with no `*all+*default` rule renders unknown items with NO type
    // chip and no type attributes — Ruby's template walk answers nil there,
    // so the new card carries no type at all. It must NOT quietly fall back
    // to another deck's type.
    const body = pointerListItemBodyForUnknown("phantom item");
    expect(body).toMatch(/<div class='bar [^']*with-bar-menu/);
    expect(body).not.toContain("TYPE-");
    expect(body).not.toContain("data-card-type-id");
    expect(body).not.toContain("data-card-type-name");
    expect(body).not.toContain("22281");
    expect(body).not.toContain("BasicCs");
  });

  it("unit: with consideration identity -> inner body carries consideration", () => {
    const identity = { typeName: "consideration", typeId: 2979, setKeys: "ALL TYPE-consideration" };
    const body = pointerListItemBodyForUnknown(
      "phantom item",
      identity,
      PRODUCTION_PHANTOM_ITEM_TYPE,
    );
    expect(body).toMatch(/<div class='bar [^']*TYPE-consideration[^']*with-bar-menu/);
    expect(body).toContain("data-card-type-id='2979'");
    expect(body).toContain("data-card-type-name='consideration'");
    expect(body).not.toContain("TYPE-basic_c");
    expect(body).not.toContain("data-card-type-id='22281'");
  });

  it("unit: with Project identity -> inner body carries Project (Emery Lockhart sample)", () => {
    const identity = { typeName: "Project", typeId: 398, setKeys: "ALL TYPE-project" };
    const body = pointerListItemBodyForUnknown("Improving Project Success through Myth Discovery", identity);
    expect(body).toMatch(/<div class='bar [^']*TYPE-project[^']*with-bar-menu/);
    expect(body).toContain("data-card-type-id='398'");
    expect(body).toContain("data-card-type-name='Project'");
    expect(body).not.toContain("TYPE-basic_c");
  });

  // -------------------------------------------------------------------------
  // INTEGRATION: pin the FULL render path through a host whose
  // *content_options rule card carries {"type":"consideration"} — the
  // shape the corpus's +musings / +RVW / +Project(s) Organizing
  // entity-cluster families exercise. RED until views.ts:1588 passes
  // the phantom's identity to pointerListItemBodyForUnknown.
  // -------------------------------------------------------------------------
  it(
    "integration: a List host with consideration item_type renders its UNKNOWN item's inner body with consideration (not BasicCs)",
    async () => {
      storage = await createRenderTestStorage();
      await seedCardtypes(storage);
      await seedSettings(storage);
      // The consideration cardtype — what the host's cql-typed
      // *content_options rule points at (matches corpus id 2979).
      await seedCard(storage, { id: 2979, name: "consideration", typeId: 5 });
      // The host list card (matches corpus "Jonas Verhoeven+musings"
      // shape — type 47 List, one item that does NOT exist in the deck).
      await seedCard(storage, {
        id: 99146,
        name: "entity cluster host",
        typeId: 47,
        dbContent: "phantom item",
      });
      // *self set rule card on the host (the rule-walk's most-specific
      // candidate for "this host" + *content_options).
      await seedCard(storage, {
        id: 99147,
        name: "entity cluster host+*self",
        leftId: 99146,
        rightId: 708,
        typeId: 259,
      });
      // The host's *content_options rule card carrying
      // {"type":"consideration"} — the corpus's cql-item-type spec
      // shape (e.g. rules 410/498/501 in corpus-v2). The cql-item-type-id
      // walk (render.ts:2211-2234) parses this and returns
      // { typeName: "consideration", typeId: 2979 }.
      await seedCard(storage, {
        id: 99148,
        name: "entity cluster host+*self+*content options",
        leftId: 99147,
        rightId: 701,
        typeId: 30,
        dbContent: '{"type":"consideration"}',
      });

      const html = await storage.engine.render("entity cluster host", "content");

      // OUTER slot wrap carries the host type (already correct pre-fix;
      // pinned here so a future regression on the outer wrap also fails
      // the test, not silently).
      expect(html).toContain('id="phantom_item-mini_bar-view"');
      expect(html).toMatch(/class="card-slot mini_bar-view [^"]*TYPE-consideration[^"]*"/);
      expect(html).toContain('data-card-type-id="2979"');
      expect(html).toContain('data-card-type-name="consideration"');
      expect(html).toContain('&quot;type&quot;:&quot;consideration&quot;');

      // INNER body identity: the bar div must carry the host type attrs
      // (data-card-type-id/name and ALL TYPE-consideration class chip),
      // not the corpus's default phantom BasicCs/22281/basic_c pin. The
      // mismatch is the mechanism (f) "unresolved content-divergence
      // with an entity-named-card cluster" — the inner body had
      // TYPE-basic_c / data-card-type-id='22281' / data-card-type-name='BasicCs'.
      expect(html).toMatch(/<div class='bar [^']*TYPE-consideration[^']*with-bar-menu/);
      expect(html).toContain("data-card-type-id='2979'");
      expect(html).toContain("data-card-type-name='consideration'");
      expect(html).not.toContain("TYPE-basic_c");
      expect(html).not.toContain("data-card-type-id='22281'");
      expect(html).not.toContain("data-card-type-name='BasicCs'");
    },
  );
  // -------------------------------------------------------------------------
  // INTEGRATION (p21 CQL item-typing): a COMPOUND unknown item whose
  // host item type carries a TYPE-LEVEL *structure rule is VIRTUAL
  // (states.rb:44-50 virtual? = compound && structure.present?) hence
  // KNOWN (states.rb:65) - Ruby's alter_unknown returns early and the
  // denial runs on the requested :bar view itself: the plain quiet denial
  // span, NO mini_bar wrap. Corpus: the SMD/PdG Tactics phantoms (typed
  // Tracked Item via the *content options rule 10280; structure rule 2081
  // Tracked Item+*type+*structure exists) render
  // `<div class="pointer-item item-bar"><span class="denied">` in the raw
  // oracle (exp @8350 / @8515-8987) where the engine's mini_bar two-span
  // body was the port's base act diff. The SIMPLE-named fixture above
  // stays on the mini_bar arm: name.simple? short-circuits virtual?
  // whatever the type (states.rb:45).
  // -------------------------------------------------------------------------
  it(
    "integration: a COMPOUND unknown item whose host item type has a type-level *structure rule renders the bare quiet denial span (virtual/known, no mini_bar wrap)",
    async () => {
      storage = await createRenderTestStorage();
      await seedCardtypes(storage);
      await seedSettings(storage);
      // The Tracked Item cardtype (corpus id 2079) + its TYPE-LEVEL
      // *structure rule (corpus rule 2081, set card "Tracked Item+*type").
      await seedCard(storage, { id: 2079, name: "Tracked Item", typeId: 5 });
      await seedCard(storage, { id: 710, name: "*type", typeId: 2 });
      await seedCard(storage, { id: 2080, name: "Tracked Item+*type", leftId: 2079, rightId: 710, typeId: 259 });
      await seedCard(storage, {
        id: 2081,
        name: "Tracked Item+*type+*structure",
        leftId: 2080,
        rightId: 709,
        typeId: 30,
        dbContent: "<p>Due: {{+due date}}</p>",
      });
      await seedCard(storage, { id: 709, name: "*structure", typeId: 2 });
      // The host list card with a *content options rule typing its items
      // Tracked Item (the corpus's Tactics+*right+*content options 10280
      // shape: the host is COMPOUND with right part "Tactics", so the
      // rule walk's RIGHT-pattern candidate finds the rule) and one
      // COMPOUND item that does not exist (the corpus's "Conflict Done
      // Well+Online Classes+SMD" shape).
      await seedCard(storage, { id: 99245, name: "Tactics", typeId: 2 });
      await seedCard(storage, {
        id: 99247,
        name: "Tactics+*right",
        leftId: 99245,
        rightId: 700,
        typeId: 259,
      });
      await seedCard(storage, {
        id: 99248,
        name: "Tactics+*right+*content options",
        leftId: 99247,
        rightId: 701,
        typeId: 30,
        dbContent: '{"type":"Tracked Item"}',
      });
      await seedCard(storage, { id: 99249, name: "Tactics Holder", typeId: 2 });
      await seedCard(storage, {
        id: 99246,
        name: "Tactics Holder+Tactics",
        leftId: 99249,
        rightId: 99245,
        typeId: 47,
        dbContent: "Conflict Done Well+Online Classes+SMD",
      });

      const html = await storage.engine.render("Tactics Holder+Tactics", "content");

      // The virtual/known phantom: Ruby's plain quiet denial span inside
      // the pointer-item wrap, NO mini_bar slot, NO bar body.
      expect(html).toContain("<div class=\"pointer-item item-bar\"><span class=\"denied\">");
      expect(html).not.toContain("mini_bar-view");
      expect(html).not.toContain("<div class='bar ");
      expect(html).toContain("Sorry, you don't have permission (read)");
    },
  );
});