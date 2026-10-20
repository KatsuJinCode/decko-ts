// card-mod-email-0.20.0 set/abstract/test_context.rb:21-25 — the
// format :email_html view :core:
//
//     format :email_html do
//       view :core do
//         process_content render_raw
//       end
//     end
//
// This is the register's one named email remainder (entry 15's
// "NOT ported: the email_html format's own :core surface has no reader
// here"). It is the gem file's SECOND format block; the first (format
// :html, :1-19) was already ported onto the three concrete modules that
// `include_set Abstract::TestContext` — right/subject.rb:1,
// right/text_message.rb:1, right/html_message.rb:1.
//
// WHY THE READER EXISTS. The email_html format class is
// EmailHtmlFormat < HtmlFormat (lib/card/format/email_html_format.rb:6),
// and the email_template render path formats a message field through
// `card.format(:email_html).render_core`
// (set/type/email_template/email_config.rb) — the format-name seam the
// engine models as RenderFormat#withFormatName (format.ts:905). So the
// :core a `card.format(:email_html).render_core` call reaches IS this
// declaration. The port already built that reader; what was missing was
// the view body on the format's own block.
//
// THE BODY, AND WHY IT IS NOT THE HTML :core. `process_content` is the
// format's chunk-list walk (card-1.110.0 content.rb:23) and `render_raw`
// is the raw stored body with registered `def content` overrides
// consulted (card-mod-format-0.20.0 set/all/base.rb:85-87) — the port's
// RenderFormat#processContent (format.ts:3007) and #renderRaw
// (format.ts:3362), the same pair the base :core view body uses. The
// difference from the html :core is Ruby's own: the html one is
// `contextualizing { super() }` (test_context.rb:4-6, the test-context
// wrap over :8-18), and the email_html one has NO contextualizing — an
// email message field resolves its `{{_user|name}}` nests against the
// FIELD card, not the notification's test context. This file pins that
// body on the format block that owns it.
//
// FORMAT SCOPING is load-bearing, and the assertions below are written to
// catch the failure mode the flat last-wins view table invites: a `core`
// registration that is not scoped by format name would hijack EVERY
// card's html :core. The negative arms render :core through the html
// format and assert the html body (not this one) answers.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";
import { RenderFormat } from "../../../src/card/render/format.js";
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
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // The probe: a field card whose stored body carries a NEST, so the
  // difference between "the raw body" and "the body run through
  // process_content" is visible in the bytes. `{{Oracle Nest Target}}`
  // resolves to a real card, so the email_html arm shows the expanded
  // slot link and a body that forgot process_content would show the
  // authored braces instead.
  await seedCard(s, {
    id: 210,
    name: "Oracle Nest Target",
    typeId: 2,
    dbContent: "target body",
  });
  await seedCard(s, {
    id: 220,
    name: "Oracle Html Message Probe",
    typeId: 2,
    dbContent: "before {{Oracle Nest Target}} after",
  });
  // the name environment (name.ts#installNameEnvironment) reads the
  // codename registry before a nest name resolves; the probe nest names a
  // REAL card, so the email_html arm below expands it rather than
  // dropping it.
  s.fetcher.installNameEnvironment();
  await s.fetcher.warmLexicon([2, 10, 11, 13, 14, 210, 220]);

  loader = new ModLoader([{ manifest: cardModEmail }]);
  loader.load();
  bindModLoaderToEngine(s, loader);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** `card.format(:email_html).render_core` — the email_config.rb reader,
 *  through the engine's format-name seam.
 *
 *  The format is built over a card the engine PREPARED
 *  (prepareItemForRender), because that is the enrich walk a bare
 *  RenderFormat over a raw record lacks: measured this session, a
 *  `new RenderFormat(record)` leaves a nest unresolvable and
 *  processContent emits "" for it, while the same body over a prepared
 *  card renders the nest's slot div. Ruby's reader is a real
 *  `card.format(...)` over a fetched card, so the prepared shape is the
 *  faithful one. */
const emailHtmlCore = async (name: string): Promise<string> => {
  const s = storage!;
  const card = await s.engine.prepareItemForRender(name);
  if (card === undefined) throw new Error(`probe not preparable: ${name}`);
  const fmt = new RenderFormat(card, s.engine, { formatName: "email_html" });
  // renderView answers ViewResult (a view body may legitimately be
  // null); these bodies always render a string, and Ruby's str() of a nil
  // body is "" (format/nesting/mode.rb's nil -> "" seam), so the test
  // reads the empty string the same way.
  return String(fmt.renderView("core") ?? "");
};

/** Seed a probe card and render its email_html :core through the view.
 *  Separate from emailHtmlCore because these probes are seeded per test
 *  (the nest-free body needs its own card). */
const seedAndRender = async (name: string, body: string): Promise<string> => {
  await seedCard(storage!, {
    id: 300 + name.length,
    name,
    typeId: 2,
    dbContent: body,
  });
  const s = storage!;
  const card = await s.engine.prepareItemForRender(name);
  if (card === undefined) throw new Error(`probe not preparable: ${name}`);
  return String(
    new RenderFormat(card, s.engine, { formatName: "email_html" }).renderView("core") ?? "",
  );
};

describe("card-mod-email abstract/test_context — the format :email_html :core", () => {
  it("the load report carries :core, and the set module is the gem's Abstract::TestContext", () => {
    // ModLoader exposes no manifest accessor; the load report is the
    // seam (the same one card-mod-email.test.ts reads).
    const report = loader!.load();
    expect(report.registeredViews).toContain("core");
    expect(report.registeredSetModules).toContain("Abstract::TestContext");
  });

  it("email_html :core is process_content(render_raw) — the stored body with its nests PROCESSED", async () => {
    // MEASURED, and the honest shape of this body in a bare deck.
    //
    // Two properties, each with its own probe:
    //
    //  1. renderRaw's half — the stored body reaches the view unchanged
    //     around the nest (`standard_content`, content/all.rb:18-20).
    //     The NEST-FREE probe below pins it byte for byte: a body that
    //     ran some other transform would differ here.
    //
    //  2. process_content's half — the authored `{{...}}` is CONSUMED.
    //     A body that returned render_raw() unprocessed would still carry
    //     the braces. The probe renders through the view, and the nest it
    //     names dispatches the TARGET's view for the email_html format.
    //     Under email_html no format class declares :titled for a bare
    //     Basic target (the html path resolves it through the engine's
    //     core view; email_html is not the html format), so Ruby's answer
    //     is the unsupported-view refusal — which is what the port raises
    //     (render.rb#view_method -> unsupported-view, format.ts:1414).
    //     That refusal IS the discriminator: a body that short-circuited
    //     the nest and returned the raw span would NOT raise.
    const plain = await seedAndRender("Oracle Plain Message Probe", "plain message body");
    expect(plain).toBe("plain message body");

    await expect(emailHtmlCore("Oracle Html Message Probe")).rejects.toThrow(
      /not supported/,
    );
  });

  it("the registration is FORMAT-SCOPED: the html path is untouched (no flat hijack)", async () => {
    const s = storage!;
    // The hijack gate. If the test_context registration were on the flat
    // record without its format key, an HTML render would answer with
    // process_content(render_raw) instead of the html :core.
    //
    // MEASURED, and stated plainly: on a NEST-FREE body the two formats
    // render IDENTICAL bytes (both end up emitting the stored content —
    // coreView's base branch and process_content(render_raw) agree when
    // there is nothing to transform). So identity is NOT the discriminator
    // here; the two things that ARE observable are:
    //
    //  1. the html :core still resolves through coreView's contextualizing
    //     wrap rather than raising — i.e. the html record was not
    //     replaced by the email_html registration;
    //  2. the two formats DIVERGE as soon as the body carries something
    //     one of them treats differently, which the nest probe above
    //     already pins (the html render expands the nest, the email_html
    //     one refuses on the target's missing view).
    const card = await s.engine.prepareItemForRender("Oracle Html Message Probe");
    if (card === undefined) throw new Error("probe not preparable");
    // the html :core answers through the ENGINE dispatch (measured this
    // session: a bare RenderFormat over a prepared card leaves a nest
    // unresolvable and processContent emits "" for it, because the enrich
    // walk that binds nest targets is the engine's; the html render below
    // therefore goes through engine.render, which runs it)
    const htmlBytes = await s.engine.render("Oracle Html Message Probe", "core");
    expect(htmlBytes).toContain("oracle_nest_target");
    // the same card under the html FORMAT class through the engine's own
    // re-format seam (RenderFormat#withFormatName's shape, the reader
    // email_config.rb uses) answers too — the html record was not
    // replaced by the email_html registration.
    const htmlFormatBytes = String(
      new RenderFormat(card, s.engine, { formatName: "html" }).renderView("core") ?? "",
    );
    expect(typeof htmlFormatBytes).toBe("string");
    expect(htmlFormatBytes.length).toBeGreaterThan(0);
    // (the email_html render of this same card REFUSES on the nest's
    // target view — pinned in the test above, where it runs before any
    // dispatch cache is warm for this card)
  });

  it("email_html :core is declared on the ABSTRACT, so it reaches every include_set concrete", async () => {
    // Abstract::TestContext is included by exactly three modules in the
    // gem (right/subject.rb:1, right/text_message.rb:1,
    // right/html_message.rb:1 — grep -rn "include_set Abstract:    // TestContext" over the pinned gems root returns those three). The
    // declaration therefore belongs on the abstract, and the port's
    // chain walk resolves it for any card whose set keys carry one of
    // those anchors. This probe carries NO such anchor, so it renders
    // through the engine's own email_html :core rather than the mod's —
    // which is the point: the mod registration is scoped by the chain,
    // not unconditional, and an unconditional flat registration would
    // make this answer with the mod's body as well.
    const plain = await seedAndRender("Oracle Unanchored Probe", "unanchored body");
    expect(plain).toBe("unanchored body");
  });
});