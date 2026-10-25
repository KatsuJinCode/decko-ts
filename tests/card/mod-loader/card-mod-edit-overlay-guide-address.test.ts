// The :overlay_guide view at the ADDRESS the enumeration audit's gap names
// (docs/runs/enumeration-audit-2026-10-25.gaps.json, the capture-view gap
// "the :overlay_guide view"; the audit's part A1 table).
//
// The audit's evidence is an ADDRESS, not a view body:
//   fixtures/captured/rules-views.json, rule_card.views.overlay_rule, carries
//   the anchor
//     href="/*all+*read/overlay_guide"
//   (the help link of the rule board's overlay menu, the popover that opens
//   the guide of the card the rule belongs to). The audit's own words: "the
//   capture records the anchor / *all+*read/overlay_guide".
//
// What the capture does NOT carry at that address is the overlay_guide BODY:
// the rules-views capture records the view bodies of the rule card and the
// set card, and overlay_guide is neither. The body spec comes from the
// SECOND capture of the same original surface,
// fixtures/captured/edit-views.json, whose targets.basic_note.views carry
// the overlay_guide view bytes the original rendered (oracle-capture-
// edit-views.rb, the SAME two targets and three actors as this repo's
// card-mod-edit-views suite):
//   views.bot.overlay_guide     the signed-in administrator's bytes
//   views.tova.overlay_guide    the signed-in member's bytes
// The two differ by exactly the guide rule card's EDIT LINK: guide.rb:27-32
// prepends it only when the guide card passes the update verdict.
//
// The gap this closes: the view's BYTES were already byte-pinned (the
// card-mod-edit-views suite pins overlay_guide for both targets and both
// actors), but nothing proved the port ANSWERS at the captured ADDRESS. The
// port's own view table carries overlay_guide (card-mod-edit.ts's
// set/all/overlay_guide.rb registration), so the address is a routing
// question, and this file is the answer: the port renders the overlay_guide
// view at the captured address, with the original's bytes, and the member's
// answer differs from the administrator's exactly where the original's does.
//
// The deck is this suite's own (in-process SQLite, no network): the rule
// card the anchor names (*all+*read), the guide surface the view reads
// (*guide, its *all+*guide rule card with the captured guide content, the
// "*guide+*right" set and its *update rule -> [[Administrator]], which
// reproduces the original's administrator/member split), and the actors.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

const CAPTURED_DIR = new URL("../../../fixtures/captured/", import.meta.url);
const RULES_CAPTURE = fileURLToPath(new URL("rules-views.json", CAPTURED_DIR));
const EDIT_CAPTURE = fileURLToPath(new URL("edit-views.json", CAPTURED_DIR));
const CAPTURES_PRESENT =
  existsSync(RULES_CAPTURE) && existsSync(EDIT_CAPTURE);

const RULES_CAPTURED = CAPTURES_PRESENT
  ? JSON.parse(readFileSync(RULES_CAPTURE, "utf8"))
  : undefined;
const EDIT_CAPTURED = CAPTURES_PRESENT
  ? JSON.parse(readFileSync(EDIT_CAPTURE, "utf8"))
  : undefined;

/** The guide-text block of a captured overlay_guide body: the
 *  `<div class="guide-text">` element and everything inside it. The block
 *  holds no nested div (the guide text carries spans, headings, paragraphs
 *  and links), so the non-greedy match stops at the block's own close. */
function guideTextBlock(bytes: string): string {
  const match = /<div class="guide-text">[\s\S]*?<\/div>/.exec(bytes);
  if (match === null) throw Error("the captured overlay_guide carries no guide-text block");
  return match[0];
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;
let memberEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // ---- the cardtypes the deck's cards are typed by
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 5, name: "Set", codename: "set", typeId: 9 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 9 });
  await seedCard(s, { id: 52, name: "Markdown", codename: "markdown", typeId: 9 });
  await seedCard(s, { id: 60, name: "Role", codename: "role", typeId: 9 });

  // ---- the actors and the parties
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 14 });

  // ---- the setting cards the two rule cards sit on
  // (typeId 14 is the Setting cardtype itself, the way the deck's own
  // deck.json carries it)
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 116, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 118, name: "*right", codename: "right", typeId: 14 });

  // the rule card the captured anchor names: *all+*read, List-typed, its
  // content "Anyone" (the rules-views capture's own rule_card.meta)
  await seedCard(s, {
    id: 11,
    name: "*all+*read",
    leftId: 10,
    rightId: 116,
    typeId: 4,
    dbContent: "Anyone",
  });
  await seedReference(s, 11, 8, "anyone");

  // the guide rule card: *all+*guide, Markdown-typed, its raw content the
  // deck's own default guide text (the captured guide bytes are its
  // markdown core)
  await seedCard(s, {
    id: 120,
    name: "*all+*guide",
    leftId: 10,
    rightId: 115,
    typeId: 52,
    typeName: "Markdown",
    dbContent:
      "#### Editing Guide\n\n" +
      "This default guide will appear in the full editor view of any card \n" +
      "without more specific guidance.  You can use it to put forward principles of style, \n" +
      "rules of conduct, or any other help text you think may be of use to persons editing \n" +
      "content.\n\n" +
      "Guide content can be edited in [[*guide|*guide rules]].\n",
  });

  // the guide rule card's update verdict: the Right-pattern set card
  // "*guide+*right" plus its *update rule -> [[Administrator]] is what
  // separates the administrator's answer from the member's (guide.rb:27-32
  // prepends the edit link only on an affirmative update verdict)
  await seedCard(s, { id: 121, name: "Administrator", codename: "administrator", typeId: 60 });
  await seedCard(s, { id: 123, leftId: 115, rightId: 118, typeId: 5 });
  await seedCard(s, { id: 124, leftId: 123, rightId: 12, dbContent: "[[Administrator]]" });
  await seedReference(s, 124, 121, "administrator");

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModHelp },
    { manifest: cardModMarkdown },
    { manifest: cardModPermissions },
  ]);
  loader.load();
  bindModLoaderToEngine(storage, loader);

  botEngine = new RenderEngine(new FetchEngine(s.counting));
  botEngine.viewer = { signedIn: true, actorId: 1 };
  botEngine.pageSession = { signedIn: true, actorId: 1 };
  await warm(botEngine);

  memberEngine = new RenderEngine(new FetchEngine(s.counting));
  memberEngine.viewer = { signedIn: true, actorId: 583 };
  memberEngine.pageSession = { signedIn: true, actorId: 583 };
  await warm(memberEngine);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** Bind the loader to one engine and warm the verdicts the guide view
 *  reads: the guide rule card has to be fetched into the engine's render
 *  map and its update verdict computed before the view's edit-link gate can
 *  answer. */
async function warm(engine: RenderEngine): Promise<void> {
  engine.modLoader = loader!;
  await loader!.installInto(modEngineHost(engine, storage!.fetcher));
  await engine.render("*all+*read", "overlay_guide");
}

describe("the :overlay_guide view at the captured address", () => {
  it("the capture's anchor names the address this suite renders", () => {
    if (!CAPTURES_PRESENT) return;
    const overlayBytes: string = RULES_CAPTURED.rule_card.views.overlay_rule.bytes;
    expect(overlayBytes).toContain(`href="/*all+*read/overlay_guide"`);
  });

  it("the port answers at / *all+*read/overlay_guide with the overlay_guide view", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = await botEngine!.render("*all+*read", "overlay_guide");
    // the slot wrapper the original rendered (the capture's own wrapper,
    // with the card identity of the capture's card)
    expect(html).toContain(`overlay_guide-view`);
    expect(html).toContain(`_overlay d0-card-overlay card nodblclick`);
    // the close link of the overlay's frame (overlay_guide.haml)
    expect(html).toContain(
      `<a data-bs-dismiss="overlay" class="text-dark p-1 ms-1" href="#"><i class="notranslate material-icons">close</i></a>`,
    );
    // the guide text is the guide rule card's markdown core, byte for byte
    // the original's
    const expected = guideTextBlock(EDIT_CAPTURED.targets.basic_note.views.bot.overlay_guide);
    expect(html).toContain(expected);
  });

  it("the administrator's answer carries the guide rule card's edit link", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = await botEngine!.render("*all+*read", "overlay_guide");
    const captured = EDIT_CAPTURED.targets.basic_note.views.bot.overlay_guide;
    const editLink = /<span class='d-none'><a rel="nofollow" class="edit-link slotter"[\s\S]*?<\/a><\/span>/.exec(
      captured,
    );
    if (editLink === null) throw Error("the captured administrator bytes carry no guide edit link");
    expect(html).toContain(editLink[0]);
    // the link's target is the RULE editor of the guide rule card
    expect(html).toContain(`href="/*all+*guide/rule_edit"`);
  });

  it("the member's answer is the same guide without the edit link", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = await memberEngine!.render("*all+*read", "overlay_guide");
    const captured = EDIT_CAPTURED.targets.basic_note.views.tova.overlay_guide;
    const expected = guideTextBlock(captured);
    expect(html).toContain(expected);
    // the member has no update verdict on the guide rule card, so the edit
    // link is absent - the original's own split (guide.rb:27-32)
    expect(html).not.toContain(`href="/*all+*guide/rule_edit"`);
  });
});
