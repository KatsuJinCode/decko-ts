// The *changed_card SETTING ADDRESS the enumeration audit's gap names
// (docs/runs/enumeration-audit-2026-10-25.gaps.json, the capture-setting gap
// "the *changed_card setting address"; the audit's part A2 table).
//
// The audit's evidence:
//   fixtures/captured/email-templates-raw-oracle.json records the deck's own
//   card "*changed card" (id 33822, codename changed_card) and the
//   follower-notification mail's rendered content, which links to that card
//   at TWO addresses:
//     <a class="known-card" href="/*changed_card"><span class="card-title" title="*changed card">*changed card</span></a>
//     <a href="/*changed_card?view=history">
//   The audit's own words: "the capture records / *changed_card and
//   / *changed_card?view=history".
//
// What the capture does NOT carry is the page the original served at those
// addresses (the capture is a mail capture: it holds the card row and the
// mail's bytes, not the page). The claim this suite makes is therefore the
// ADDRESS CONTRACT itself, and the port's own read grammar is the spec for
// it (src/server/worker-shared-surface.ts's decodeName folds the url_key's
// underscores back into spaces, and worker.ts's read grammar answers
// GET /<name> with the :open view and GET /<name>?view=<view> with that
// view):
//   / *changed_card          the card's own page
//   / *changed_card?view=history   the card's history view
//
// The port's card-mod-email family already renders the capture's mail bytes
// (the tools/compat-report grade lists the follower-notification email's
// :content and :core views as identical against the oracle), so this suite
// does not re-pin the mail; it pins the addresses the mail names, and the
// capture's own bytes stay the record of where they come from.
//
// The deck is this suite's own (in-process SQLite, no network): the card the
// capture names (name "*changed card", codename changed_card), the cardtype
// it is typed by, and the actors.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { decodeName, queryViewFromUrl } from "../../../src/server/worker-shared-surface.js";

const CAPTURED_DIR = new URL("../../../fixtures/captured/", import.meta.url);
const MAIL_CAPTURE = fileURLToPath(new URL("email-templates-raw-oracle.json", CAPTURED_DIR));
const CAPTURES_PRESENT = existsSync(MAIL_CAPTURE);

const MAIL_CAPTURED = CAPTURES_PRESENT
  ? JSON.parse(readFileSync(MAIL_CAPTURE, "utf8"))
  : undefined;

/** The capture's own card row for the changed card. */
function capturedChangedCard(): { name: string; codename: string; type_name: string } {
  for (const card of MAIL_CAPTURED.cards as Array<Record<string, string>>) {
    if (card.codename === "changed_card") {
      return {
        name: card.name,
        codename: card.codename,
        type_name: card.type_name,
      };
    }
  }
  throw Error("the mail capture carries no card with the codename changed_card");
}

/** The capture's own bytes: the whole capture read as text, so the mail's
 *  rendered content is searched the way the original recorded it. */
function capturedBytes(): string {
  return JSON.stringify(MAIL_CAPTURED);
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });

  // the card the capture names: name "*changed card", codename
  // "changed_card" (the capture's own row)
  await seedCard(s, {
    id: 33822,
    name: "*changed card",
    codename: "changed_card",
    typeId: 2,
    typeName: "RichText",
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModHistory },
    { manifest: cardModPermissions },
  ]);
  loader.load();
  bindModLoaderToEngine(storage, loader);

  botEngine = new RenderEngine(new FetchEngine(s.counting));
  botEngine.viewer = { signedIn: true, actorId: 1 };
  botEngine.pageSession = { signedIn: true, actorId: 1 };
  botEngine.modLoader = loader;
  await loader.installInto(modEngineHost(botEngine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("the *changed_card setting address", () => {
  it("the capture records the card and the two addresses that name it", () => {
    if (!CAPTURES_PRESENT) return;
    const card = capturedChangedCard();
    expect(card.name).toBe("*changed card");
    expect(card.codename).toBe("changed_card");
    const bytes = capturedBytes();
    expect(bytes).toContain(`href=\\"/*changed_card\\"`);
    expect(bytes).toContain(`href=\\"/*changed_card?view=history\\"`);
  });

  it("the port answers at / *changed_card with the card's own page", async () => {
    if (!CAPTURES_PRESENT) return;
    // the address the mail links to, decoded the way the port's read
    // grammar decodes it (the url_key's underscores fold back into spaces)
    const url = new URL("http://127.0.0.1/*changed_card");
    expect(decodeName(url.pathname.slice(1))).toBe("*changed card");
    expect(queryViewFromUrl(url)).toBeUndefined();
    const html = await botEngine!.render(decodeName(url.pathname.slice(1))!, "open");
    expect(html.startsWith(`<div id="Xchanged_card-open-view"`)).toBe(true);
    expect(html).toContain(`data-card-name="*changed card"`);
    expect(html).toContain(`data-card-link-name="*changed_card"`);
  });

  it("the port answers at / *changed_card?view=history with the history view", async () => {
    if (!CAPTURES_PRESENT) return;
    const url = new URL("http://127.0.0.1/*changed_card?view=history");
    expect(decodeName(url.pathname.slice(1))).toBe("*changed card");
    expect(queryViewFromUrl(url)).toBe("history");
    const html = await botEngine!.render(decodeName(url.pathname.slice(1))!, queryViewFromUrl(url)!);
    expect(html.startsWith(`<div id="Xchanged_card-history-view"`)).toBe(true);
    expect(html).toContain(`class="card-slot history-view`);
  });
});
