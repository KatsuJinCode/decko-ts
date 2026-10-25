// The :overlay_guide view at the address the enumeration audit's gap names
// (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:overlay_guide`;
// docs/runs/enumeration-audit-2026-10-25.gaps.json, element "the
// :overlay_guide view"):
//
//   /*all+*read/overlay_guide   (fixtures/captured/rules-views.json: the
//                                overlay_rule view of the *all+*read rule
//                                card carries the help link whose href IS
//                                this address)
//
// The capture bytes are the spec, in two layers:
//
//   - The ANCHOR: the capture's own overlay_rule bytes carry the help link
//     line, and that line is pinned byte-for-byte below, read out of the
//     capture at run time (the capture IS the spec; the literal is the
//     audit's evidence).
//   - The RESPONSE: no capture records an :overlay_guide response, so the
//     response is pinned as COMPOSITION - the port's answer at the address
//     is the overlay_guide.haml shape (the overlay slot wrap, the close
//     anchor, the guide text of the guide rule card the card's own set
//     candidates resolve). This is the same honest split the views lane
//     recorded (bytes where the capture rendered, composition where it did
//     not).
//
// What the port already carried: the :overlay_guide view fn
// (src/card/mod-loader/mods/card-mod-edit.ts, all/overlay_guide.rb:2-8,
// unknown: true) and its body pinned for the two captured targets
// (tests/card/mod-loader/card-mod-edit-views.test.ts, the :overlay_guide
// arm of "Oracle Basics" and "Home"). What NO row named, and what this file
// adds, is the ADDRESS: the audit's address is a RULE card's address
// (/*all+*read), and nothing proved that the surface answers there. The
// overlay_rule render's own help link is the anchor that names it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

/** The capture the audit cites: the rule card's recorded views. */
const RULES_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as { rule_card: { views: Record<string, { bytes?: string }>; meta: Record<string, unknown> } };

/** The anchor the audit's evidence names, byte-for-byte out of the
 *  capture's own overlay_rule bytes: the help link whose href is the
 *  audit's address. */
function capturedOverlayGuideAnchor(): string {
  const bytes = RULES_CAPTURE.rule_card.views.overlay_rule.bytes ?? "";
  const at = bytes.indexOf("overlay_guide");
  if (at === -1) throw new Error("the capture's overlay_rule bytes carry no overlay_guide anchor");
  const start = bytes.lastIndexOf("<a ", at);
  const end = bytes.indexOf(">", at);
  if (start === -1 || end === -1) throw new Error("the capture's overlay_guide anchor is not an anchor");
  return bytes.slice(start, end + 1);
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let engine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the always-ok actor (the "decko_bot" codename is the STORED spelling
  // the auth seam matches: read-rules.ts DECKOBOT_CODENAME)
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });

  // Cardtypes and codenames the rule walk reads. The set/setting type ids
  // ARE the *set and *setting card ids (13 and 14): the mods' prepareEngine
  // resolves the warm's set/setting type ids by codename
  // (rule-card-warm.ts warmRuleCards), so a card carrying any other
  // type_id falls outside the warm's WHERE clause.
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 52, name: "Markdown", typeId: 9 });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the two setting cards the rule cards hang off: the read rule's setting
  // and the guide rule's setting
  await seedCard(s, { id: 114, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 14 });
  // the *anyone role card the read rule names
  await seedCard(s, { id: 8 + 100, name: "*anyone", codename: "anyone", typeId: 14 });

  // the READ RULE card the audit's address hangs off: "*all+*read", the
  // junction of the *all set and the *read setting. The capture records
  // this card as id 10, key "*all+*read", type_name "List",
  // type_code "list", db_content "Anyone" (rules-views.json
  // rule_card.meta); the deck here seeds the same card with this file's
  // own ids.
  await seedCard(s, {
    id: 119,
    leftId: 10, // *all
    rightId: 114, // *read
    typeId: 2, // RichText
    typeName: "RichText",
    dbContent: "Anyone",
  });
  await seedReference(s, 119, 108, "anyone");

  // the GUIDE RULE card: "*all+*guide", the junction the *guide candidate
  // walk lands on for any card in the *all set - which the read rule card
  // is. Markdown-typed so its :core nest goes through the markdown type.
  await seedCard(s, {
    id: 120,
    leftId: 10, // *all
    rightId: 115, // *guide
    typeId: 52, // Markdown
    typeName: "Markdown",
    dbContent: "Guidance prose for the synthetic guide card.",
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);

  engine = new RenderEngine(new FetchEngine(s.counting));
  engine.viewer = { signedIn: true, actorId: 1 };
  engine.pageSession = { signedIn: true, actorId: 1 };
  engine.modLoader = loader;
  await loader.installInto(modEngineHost(engine, s.fetcher));
  // The guide rule card is nested, never a render root: the task-verdict
  // prepare seats its verdict when a view names it (RenderEngine
  // #ensureTaskVerdicts). A guide render pulls the rule card into the map
  // first - the same order the guide-edit-link suite uses.
  await engine.render("*all+*read", "guide_tab");
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

/** The capture's own normalization (rules-views.json normalizations):
 *  data-slot-id -> RANDOMIZED (SecureRandom.hex(10), wrap.rb:45). */
function normalize(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
}

describe("the :overlay_guide view at the captured /*all+*read/overlay_guide address", () => {
  it("the capture's overlay_rule bytes carry the audit's anchor, byte-for-byte", () => {
    const anchor = capturedOverlayGuideAnchor();
    // the audit's evidence string: "the capture records the anchor
    // / *all+*<setting>/overlay_guide"
    expect(anchor).toContain('href="/*all+*read/overlay_guide"');
    expect(anchor).toContain('data-slotter-mode="overlay"');
    expect(anchor).toContain('class="help-link ps-1 _popover_link slotter text-muted p-1 ms-1"');
    // the capture's own bytes carry the slot selector HTML-escaped (the
    // anchor sits inside an attribute value the capture recorded escaped)
    expect(anchor).toContain(
      'data-slot-selector=".board-sidebar &gt; ._overlay-container-placeholder &gt; .card-slot"',
    );
    expect(anchor).toContain('data-remote="true"');
    // the capture's own card record, so the pin is anchored to the card
    // the audit names
    expect(RULES_CAPTURE.rule_card.meta.key).toBe("*all+*read");
  });

  it("the port's overlay_rule render at /*all+*read carries that anchor", async () => {
    const html = normalize(await engine!.render("*all+*read", "overlay_rule"));
    expect(html).toContain('href="/*all+*read/overlay_guide"');
    // the anchor's own class and slotter mode, so a link that lost its
    // overlay seating does not pass
    expect(html).toContain('class="help-link ps-1 _popover_link slotter text-muted p-1 ms-1"');
    expect(html).toContain('data-slotter-mode="overlay"');
    expect(html).toContain('data-remote="true"');
  });

  it("/*all+*read/overlay_guide answers the overlay_guide surface", async () => {
    const html = normalize(await engine!.render("*all+*read", "overlay_guide"));
    // the slot wrap the view's config seats (all/overlay_guide.rb:2-8:
    // wrap: { slot: { class: "_overlay d0-card-overlay card nodblclick" } })
    expect(html).toContain("overlay_guide");
    expect(html).toContain("_overlay d0-card-overlay card nodblclick");
    // the haml body: the close anchor (data-bs-dismiss, class, href LAST -
    // link_to appends href after the consumed path key)
    expect(html).toContain(
      '<a data-bs-dismiss="overlay" class="text-dark p-1 ms-1" href="#"><i class="notranslate material-icons">close</i></a>',
    );
    // `= guide` contributes the guide text of the guide rule card the
    // card's own set candidates resolve
    expect(html).toContain('class="guide-text"');
    expect(html).toContain("Guidance prose for the synthetic guide card.");
  });
});
