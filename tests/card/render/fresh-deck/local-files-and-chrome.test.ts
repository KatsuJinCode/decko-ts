// A deck that stores its files locally (a stock `decko setup` deck) renders
// its page chrome exactly as stock Ruby Decko 0.20.0 does: the favicon link,
// the compiled stylesheet and script links, the inlined svg logo, the stock
// main menu's "Getting started" dropdown (a Link list), and, for a signed-in
// user with a role, the interactive roles dropdown. The page-level checks
// compare against the reference harness's recorded Ruby renders.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachmentUrl, formatFileCore, localStorageUrl } from "../../../../src/card/render/views.js";
import { faviconTagBytes, stylesheetTagsBytes } from "../../../../src/card/render/head-views.js";
import { codedSvgFileBytes } from "../../../../src/card/render/coded-attachment-files.js";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("locally stored and coded attachment urls (FileCardUploader#local_url)", () => {
  it("keeps the ~<card id> mark of a local identifier", () => {
    expect(localStorageUrl("~447/1789819200.css")).toBe("/files/~447/1789819200.css");
    expect(attachmentUrl("~307/1789819200.js")).toBe("/files/~307/1789819200.js");
  });

  it("puts an image version after the action id and downcases the extension", () => {
    expect(localStorageUrl("~22/33.PNG", "medium")).toBe("/files/~22/33-medium.png");
  });

  it("names the card's own id when given", () => {
    expect(localStorageUrl("~22/33.png", undefined, 40)).toBe("/files/~40/33.png");
  });

  it("resolves a coded identifier to its codename directory and mod name", () => {
    expect(localStorageUrl(":favicon/carrierwave.png", "small")).toBe("/files/:favicon/carrierwave-small.png");
    expect(localStorageUrl(":yeti_skin+:image/standard.png", "large")).toBe(
      "/files/:yeti_skin+:image/standard-large.png",
    );
  });

  it("renders nothing for an identifier without an extension", () => {
    expect(localStorageUrl("~22/33")).toBe("");
  });

  it("links a local file card's download to its tilde url", () => {
    expect(formatFileCore("~904/989.txt", { cardName: "Report 1" })).toBe(
      "<a href='/files/~904/989.txt'>Download Report 1</a>\n",
    );
  });

  it("builds the head's favicon and stylesheet links from local and coded identifiers", () => {
    const read = {
      titleSetting: "My Deck",
      faviconSource: ":favicon/carrierwave.png",
      styleAssetOutput: "~447/1789819200.css",
    };
    expect(faviconTagBytes(read)).toBe(`<link rel="shortcut icon" href="/files/:favicon/carrierwave-small.png" />`);
    expect(stylesheetTagsBytes(read)).toContain(`href="/files/~447/1789819200.css"`);
  });

  it("reads the stock deck's coded svg logo", () => {
    const svg = codedSvgFileBytes(":logo/carrierwave.svg");
    expect(svg).toBeDefined();
    expect(svg!.startsWith("<svg")).toBe(true);
  });
});

describe("stock-deck pages against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["anonymous", "Topic 001"],
    ["anonymous", "Note 001"],
    ["member", "Note 001"],
    ["admin", "Note 001"],
    ["admin", "Topic 001"],
    // a rule card's menu help counts the setting's rules; an administrator
    // (always_ok?) counts them all
    ["admin", "Note+*type+*create"],
    ["admin", "Topic+*type+*structure"],
  ])("page for %s: %s is byte-identical to Ruby", async (actor, card) => {
    const answer = await session.render(card, { actor });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`page:${actor}:${card}`));
  }, 60_000);

  it("a local file card's core view matches Ruby", async () => {
    const answer = await session.render("Report Index", { actor: "anonymous", view: "core" });
    expect(answer.html).toBe(rubyRender("core:anonymous:Report Index"));
  }, 60_000);
});
