// The :overlay_guide view at the address the enumeration audit's gap 3
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:overlay_guide`,
// gaps.json "the :overlay_guide view"):
//
//   /*all+*read/overlay_guide
//
// The capture bytes are the spec:
//   - fixtures/captured/rules-views.json records the ANCHOR - the rule
//     board's help link, `href="/*all+*read/overlay_guide"`, inside the
//     captured :overlay_rule bytes of the *all+*read rule card (the audit's
//     evidence line, asserted verbatim from the capture below). The anchor
//     arm of the port's :overlay_rule render is pinned per-address by
//     card-mod-rules-board-views-addresses.test.ts; what NO suite held so
//     far is the view ANSWERING at that address.
//   - fixtures/captured/edit-views.json records the view's rendered bytes
//     for two ordinary targets ("Oracle Basics", "Home") under three actor
//     keys. card-mod-edit-views.test.ts byte-pins the basic_note legs
//     (bot, tova, anonymous) and the deck_level legs for bot and tova. The
//     one captured leg no suite holds is deck_level x anonymous - pinned
//     byte-for-byte here.
//   - The guide-text interior is byte-identical across the four captured
//     legs that carry no guide edit link (anonymous and tova, both targets;
//     the bot legs prepend the /*all+*guide/rule_edit edit-link span), so
//     the deck's anonymous extraction of it is the capture-derived byte
//     spec for ANY address the view answers at - including the cited
//     *all+*read one, whose own response bytes the oracle never recorded.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";
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
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RULES_VIEWS_FIXTURE = path.join(HERE, "..", "..", "..", "fixtures", "captured", "rules-views.json");
const EDIT_VIEWS_FIXTURE = path.join(HERE, "..", "..", "..", "fixtures", "captured", "edit-views.json");

const FIXTURE_PRESENT =
  existsSync(RULES_VIEWS_FIXTURE) && existsSync(EDIT_VIEWS_FIXTURE);

const rulesViews = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(RULES_VIEWS_FIXTURE, "utf8")) as {
      rule_card: { views: Record<string, { bytes?: string }> };
    })
  : undefined;

const editViews = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(EDIT_VIEWS_FIXTURE, "utf8")) as {
      targets: Record<string, { views: Record<string, Record<string, string>> }>;
    })
  : undefined;

/** The capture's normalizations (data-slot-id -> RANDOMIZED,
 *  data-card-id -> RANDOMIZED), applied to BOTH sides. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

/** The captured :overlay_guide bytes of the Home target's anonymous leg -
 *  the one captured leg card-mod-edit-views.test.ts does not pin (its
 *  anonymous arm covers basic_note only). */
function capturedHomeAnonymousOverlayGuide(): string {
  const bytes = editViews!.targets.deck_level.views.anonymous.overlay_guide;
  if (bytes === undefined || bytes === "") throw new Error("capture has no deck_level anonymous overlay_guide");
  return bytes;
}

/** The capture-derived guide-text interior: the bytes between the
 *  guide-text div's opening tag and its own close, read off one captured
 *  render. */
function guideTextBytesOf(render: string): string {
  const start = render.indexOf('<div class="guide-text">');
  const close = render.indexOf("</div>", render.indexOf("</p>", start));
  if (start === -1 || close === -1) throw new Error("capture's overlay_guide lacks the guide-text div");
  return render.slice(start, close + "</div>".length);
}

/** The capture-derived guide-text interior, read off the captured
 *  anonymous basic_note leg. */
function capturedGuideTextBytes(): string {
  return guideTextBytesOf(editViews!.targets.basic_note.views.anonymous.overlay_guide);
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let memberEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // ---- the type cards (the slot identity the capture's legs carry) ----
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 52, name: "Markdown", codename: "markdown", typeId: 9 });
  await seedCard(s, { id: 13, name: "Set", codename: "set", typeId: 9 });
  await seedCard(s, { id: 14, name: "Setting", codename: "setting", typeId: 9 });

  // ---- the junction sides ----
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 14 });
  await seedCard(s, { id: 103, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 14 });

  // ---- the guide surface (the edit-views suite's seed, trimmed to the
  //      arms this file pins): the *all+*guide rule card, Markdown-typed,
  //      its raw content the deck's own default guide text. NO update rule
  //      is seeded anywhere: the engine's deny-by-default verdict posture
  //      is what keeps the guide edit link out of the member and anonymous
  //      arms, exactly as the captured anonymous/tova legs record it.
  await seedCard(s, {
    id: 120,
    leftId: 10,
    rightId: 115,
    typeId: 52, // Markdown
    typeName: "Markdown",
    dbContent:
      "#### Editing Guide\n\n" +
      "This default guide will appear in the full editor view of any card \n" +
      "without more specific guidance.  You can use it to put forward principles of style, \n" +
      "rules of conduct, or any other help text you think may be of use to persons editing \n" +
      "content.\n\n" +
      "Guide content can be edited in [[*guide|*guide rules]].\n",
  });

  // ---- the audit's address: the *all+*read rule card (a stored rule, as
  //      the real deck's is; List-typed like the captured rule decks').
  //      The rule grant resolves through the reference row (the read rule
  //      cache joins card_references), so the [[Anyone]] party row is
  //      seeded with it.
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 9 });
  await seedCard(s, { id: 610, leftId: 10, rightId: 103, typeId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 610, 8, "anyone");

  // ---- the two ordinary targets the capture records the view at
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: "A plain basic card for oracle capture.",
  });
  await seedCard(s, {
    id: 521,
    name: "Home",
    typeId: 2,
    typeName: "RichText",
    dbContent:
      '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n',
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([{ manifest: cardModEdit }, { manifest: cardModMarkdown }]);
  loader.load();

  memberEngine = new RenderEngine(new FetchEngine(s.counting));
  memberEngine.viewer = { signedIn: true, actorId: 583 };
  memberEngine.modLoader = loader!;
  await loader!.installInto(modEngineHost(memberEngine, s.fetcher));
  // the task-verdict warm the edit-views suite documents (the guide arms
  // read the update verdict through the engine's task seam), plus the
  // guide rule card's own name warm: the guide walk fetches the SIDE-BACKED
  // "*all+*guide" junction by name, and a cold engine's first walk lands
  // before the junction's pair-lex resolution has folded - the same
  // first-render ordering the serving boot settles with its prepare pass.
  await memberEngine.render("Oracle Basics", "guide_tab");
  await memberEngine.render("*all+*guide", "core");

  anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
  anonymousEngine.modLoader = loader!;
  await loader!.installInto(modEngineHost(anonymousEngine, s.fetcher));
  await anonymousEngine.render("Oracle Basics", "guide_tab");
  await anonymousEngine.render("*all+*guide", "core");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describeOrSkipLoud(
  !FIXTURE_PRESENT,
  "tests/card/mod-loader/card-mod-edit-overlay-guide-addresses.test.ts",
  "fixtures/captured/{rules-views,edit-views}.json (captured-oracle fixtures, absent on a clean clone)",
)("the :overlay_guide view at the audit's addresses (enumeration gap 3)", () => {
  it("the capture carries the audit's evidence anchor verbatim", () => {
    const overlayBytes = rulesViews!.rule_card.views.overlay_rule.bytes ?? "";
    expect(overlayBytes).toContain('href="/*all+*read/overlay_guide"');
  });

  it("the captured guide-text interior is identical across the four no-link captured legs (the extraction's own guard)", () => {
    const basic = editViews!.targets.basic_note.views.anonymous.overlay_guide;
    for (const target of ["basic_note", "deck_level"] as const) {
      for (const actor of ["anonymous", "tova"] as const) {
        expect(guideTextBytesOf(editViews!.targets[target].views[actor].overlay_guide)).toBe(
          capturedGuideTextBytes(),
        );
      }
    }
    // the bot legs prepend the rule_edit edit-link span, so their interior
    // is a DIFFERENT byte string (the capture's own split)
    expect(guideTextBytesOf(editViews!.targets.basic_note.views.bot.overlay_guide)).not.toBe(
      capturedGuideTextBytes(),
    );
  });

  it("the cited address answers: *all+*read renders the overlay with the captured guide-text bytes (member)", async () => {
    const html = normalize(await memberEngine!.render("*all+*read", "overlay_guide"));
    // the overlay wrap the captured legs record (the haml template's slot
    // wrap, here on the rule card's own set keys)
    expect(html.startsWith('<div id="Xall-Xread-overlay_guide-view"')).toBe(true);
    expect(html).toContain("card-slot overlay_guide-view");
    expect(html).toContain("_overlay d0-card-overlay card nodblclick");
    expect(html).toContain('<a data-bs-dismiss="overlay" class="text-dark p-1 ms-1" href="#">');
    // the guide interior is the capture-derived byte spec
    expect(html).toContain(capturedGuideTextBytes());
    // the anonymous/tova captured legs carry no guide edit link, and the
    // member arm denies the same way (no update rule grants it)
    expect(html).not.toContain("rule_edit");
  });

  it("the cited address answers for the signed-out visitor with the same captured bytes (anonymous)", async () => {
    const html = normalize(await anonymousEngine!.render("*all+*read", "overlay_guide"));
    expect(html.startsWith('<div id="Xall-Xread-overlay_guide-view"')).toBe(true);
    expect(html).toContain("_overlay d0-card-overlay card nodblclick");
    expect(html).toContain(capturedGuideTextBytes());
    expect(html).not.toContain("rule_edit");
  });

  it("the captured deck_level x anonymous leg stays the byte spec (the leg no suite pinned)", async () => {
    const html = normalize(await anonymousEngine!.render("Home", "overlay_guide"));
    expect(html).toBe(normalize(capturedHomeAnonymousOverlayGuide()));
  });
});
