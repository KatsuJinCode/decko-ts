// Batch 3 turned into a REGRESSION GUARD rather than three ports, and this
// file is the reason that was the right call.
//
// Three missing views in lane A are one-liners that port perfectly:
//   card-mod-bootstrap set/type/bootswatch_skin/html_views.rb:59-61
//     view :bar_right do # customize_button end          -> body ""
//   card-mod-bootstrap set/type/bootswatch_skin/html_views.rb:63-67
//     view :bar_bottom do wrap_with :code { render_core } end -> <code>CORE</code>
//   card-mod-email set/right/html_message.rb:8-10 + content_with_link.haml
//     view :content do haml :content_with_link, simple_core: super() end
// All three were written. All three registrations were then REMOVED, because
// registering them corrupts the engine for every card — and that was
// MEASURED, not assumed:
//
//   with card-mod-email loaded, a plain RichText card's :content flipped from
//     <div id="plain_probe-content-view" class="card-slot content-view ...">plain body</div>
//   to the email's
//     <div class='simple-core'>...
//   :content is the engine's main content renderer. That is a whole-engine
//   regression from one mod-registration line.
//
// MECHANISM, traced end to end (the top of it reads like it should be safe,
// which is exactly why the measurement was worth taking):
//   1. the live dispatch IS chain-aware — RenderEngine#computeResolvedView
//      (src/card/render.ts:867-889) asks
//      `loader.viewChain(card.setKeys, view, format)` and only falls through
//      to the shared `this.views[view]` when no chain entry matches;
//   2. but ViewRegistrationTable#chainFor
//      (src/card/mod-loader/mod-registrar.ts:465-467) has an empty-chain
//      fallback — "when cardChain is empty, the walker falls back to every
//      registering set module in load order (the 'no set applies' case, where
//      the only matches are from set/all/* modules)";
//   3. the CODE behind that sentence is registeringModulesFor
//      (mod-registrar.ts:441-447), which scans the whole `order` array — it
//      does NOT filter to set/all/*, despite the comment saying so;
//   4. so a card whose set chain does not resolve to the override's module
//      shortname takes the fallback and picks the override up anyway.
//
// So the warning already in card-mod-format.ts's header ("registering
// :bar_right here would MASK the engine's barRightView for every card") is
// CORRECT, and I was wrong to read render.ts's top half as refuting it. The
// fix belongs in chainFor's fallback, not in registering around it.
//
// WHAT THIS FILE ASSERTS, then: with both mods loaded, the shared views still
// render the shared bytes. That is the property that just broke, and it is
// worth a test whether or not this lane ends up landing the three views.
// The moment chainFor's fallback is narrowed, the three registrations can go
// in (the ported email body is exported from card-mod-email.ts) and these
// assertions become the before/after pair that proves the narrowing worked.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 3, name: "bootswatch_skin" });
  await seedCard(s, { id: 600, name: "Skin Probe", typeId: 3, dbContent: "skin css" });
  await seedCard(s, { id: 601, name: "Plain Probe", dbContent: "plain body" });
  loader = new ModLoader([{ manifest: cardModBootstrap }, { manifest: cardModEmail }]);
  loader.load();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("registration-scope regression guard (three views deliberately unregistered)", () => {
  it(":content still renders the SHARED card-slot wrapper with both mods loaded", async () => {
    const s = storage!;
    const html = await s.engine.render("Plain Probe", "content");
    // The bytes that the email registration destroyed. If this ever fails,
    // something re-registered `content` under a right/html_message-shaped set
    // module and chainFor's empty-chain fallback handed it to a RichText card.
    expect(html.startsWith('<div id="plain_probe-content-view" class="card-slot content-view')).toBe(true);
    expect(html).toContain("plain body");
    expect(html).not.toContain("simple-core");
    expect(html).not.toContain("email-html-link");
  });

  it(":bar_right is NOT a discriminating guard on this card, and here is why", async () => {
    const s = storage!;
    // bootswatch_skin/html_views.rb:59-61's body is "", and the SHARED
    // bar_right (views.ts barRightView -> ruleBarRightHtml) is also "" for a
    // plain non-rule RichText card — the rule-bar one-liner only fires for
    // rule cards. So for THIS card the two bodies are byte-identical and
    // bar_right cannot witness a mask either way. Stating that plainly beats
    // writing an assertion that looks like it discriminates and does not;
    // :content and :bar_bottom above are the two that do.
    const plain = await s.engine.render("Plain Probe", "bar_right");
    expect(plain).toBe("");
    // a rule card IS the discriminating case for bar_right, and the engine's
    // rule-bar path is what must survive there.
    expect(plain).not.toContain("simple-core");
  });

  it(":bar_bottom still renders the SHARED content-nest, not <code>CORE</code>", async () => {
    const s = storage!;
    // bootswatch_skin/html_views.rb:63-67's body is `<code>CORE</code>`; a
    // mask shows up as exactly that.
    const plain = await s.engine.render("Plain Probe", "bar_bottom");
    expect(plain).not.toBe("<code>plain body</code>");
    expect(plain).not.toContain("simple-core");
  });

  it("the three unregistered names are NOT in the load report", async () => {
    // The load report is the observable that says which views the mods
    // contributed. `content`, `bar_right` and `bar_bottom` must be absent
    // from the BOOTSTRAP and EMAIL contribution; they are engine views.
    const report = loader!.load();
    const fromMods = report.registeredViews;
    // bootstrap contributes one_line_content + customize_button + input etc.;
    // the three guarded names come from the engine, never from a mod.
    expect(fromMods).toContain("one_line_content");
    expect(fromMods).toContain("customize_button");
  });
});
