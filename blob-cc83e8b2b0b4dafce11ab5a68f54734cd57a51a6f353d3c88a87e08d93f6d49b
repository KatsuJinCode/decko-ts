// The read path's edit_draft consumption, measured against the PINNED DECK's
// own load_action.
//
// The completeness register's B11 row (register-routes) grades the port
// PARTIAL: "the port EMITS ?edit_draft=true
// (src/card/mod-loader/mods/card-mod-history.ts:1890) and never CONSUMES it
// (grep for edit_draft over src returns only that emitter)". The row's fix:
// "read params[:edit_draft] in load_action and render the acting cards last
// draft".
//
// fixtures/captured/load-action-ruby-oracle.json is what
// oracle-capture-load-action-ruby.rb (tests/server/) recorded by running
// the PINNED DECK's own method (decko-0.20.0/lib/card_controller/rest.rb:56-61)
// over the four cells that decide the behavior, and the card gem's own
// last_draft_content (card-1.110.0/lib/card/content/all.rb:42-44).
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE CONDITION is `params[:edit_draft] && card.drafts.present?`
//      (rest.rb:58). Ruby tests the PARAM'S TRUTHINESS, not its value: a
//      present ?edit_draft=false is the STRING "false", which is TRUTHY in
//      Ruby, so the content IS replaced. A port that parses the value as a
//      boolean would take the opposite branch on that cell.
//
//   2. THE REPLACEMENT is the card's last draft's content, and the card
//      side's own selection is `drafts.last.card_changes.last.value`
//      (content/all.rb:42-44): the LAST draft, and within it the LAST card
//      change.
//
//   3. THE DRAFTS GATE: with the param present but no drafts on the card,
//      the content is untouched.
//
//   4. THE ACTION SELECTION happens either way: the controller selects the
//      action from the params before it looks at the drafts.
//
// The port's own state, pinned below: the emitter exists (the history mod's
// "continue editing" link) and NOTHING consumes the param. That is the open
// divergence, pinned so it cannot be closed by accident: a lane that ports
// the consumption has to change the scan's expectation on purpose, and to
// say why in the commit.
//
// The row's fix also needs a seam the port does not have yet, and the commit
// message names it: the port's render entry takes the HISTORY params
// (src/card/render.ts:1147 render(cardName, view, params: HistoryRenderParams)),
// not the request's query string, so the URL's edit_draft flag never
// reaches the render. Consuming it needs a host-to-render content seam.
//
// DATA: the oracle's own stubs. No deck, no account, no live service.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ActWriter } from "../../src/card/history/write-path.js";
import { lastDraftContent } from "../../src/card/mod-loader/mods/card-mod-history.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "../deploy/fixtures/configured-deck-served-deltas.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/load-action-ruby-oracle.json"), "utf8"),
) as {
  loadAction: Array<{ label: string; outcome: string; selectedAction: number; content: string }>;
  lastDraftContent: Array<{ drafts: number; value: string }>;
};

/** Every source file under src/ whose text mentions edit_draft. */
function editDraftMentions(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      editDraftMentions(full, out);
    } else if (/\.(ts|mjs|js)$/.test(entry)) {
      if (readFileSync(full, "utf8").includes("edit_draft")) {
        out.push(path.relative(REPO, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

// ORDER IS LOAD-BEARING: this describe runs FIRST in the file because the
// engine boots below bind the process-wide mod loader to their own storage;
// a leg that boots another engine first (the render-entry legs below) leaves
// that binding pointing at its own storage, and the HTTP legs then resolve
// views through it and 404. Measured in this lane: this file's legs pass in
// exactly this order and fail in the other.
describe("the read path's edit_draft consumption, at the HTTP layer (the edge)", () => {
  function realDeck(storage: RenderTestStorage) {
    return {
      fetcher: storage.fetcher,
      render: storage.engine,
      servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
    };
  }

  /** The card_actions/card_changes rows Ruby's drafts would answer: one
   *  draft-true action on the card, carrying the draft content. The deck
   *  seed is the action-route suite's own (the same shell the other page
   *  legs run against), with the draft rows pinned to a real actor card. */
  async function seedDraftedCard(storage: RenderTestStorage): Promise<void> {
    await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
    await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
    await seedCard(storage, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
    await seedCard(storage, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
    await seedCard(storage, { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" });
    await seedCard(storage, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 52, dbContent: "{}" });
    await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
    await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
    await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
    await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
    await seedCard(storage, { id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout" });
    await seedCard(storage, { id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>` });
    await seedCard(storage, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>` });
    await seedCard(storage, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>` });
    await seedCard(storage, { id: 31001, name: "Front", typeId: 2, dbContent: "SAVED CONTENT" });
    await seedCard(storage, { id: 31002, name: "*home", codename: "home", typeId: 52, dbContent: "Front" });
    // The draft through the port's own draft-save machinery: the rows a
    // real draft save makes (the act, the draft-true update action, the
    // db_content change), written by the same code the write path runs.
    const writer = new ActWriter({
      driver: storage.counting,
      actorId: 8,
      ipAddress: "127.0.0.1",
      now: () => new Date("2026-10-23T00:00:00Z"),
    });
    await writer.saveDraft({ cardId: 31001, content: "DRAFT CONTENT" });
    await storage.fetcher.codenames.ensureLoaded();
  }

  it("GET /<mark>?edit_draft=true renders the draft's content", async () => {
    const storage = await createRenderTestStorage();
    await seedDraftedCard(storage);
    const res = await handleEngineRequest(
      new Request("https://script-placeholder.bunny.run/Front?edit_draft=true"),
      realDeck(storage),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("DRAFT CONTENT");
    expect(body).not.toContain("SAVED CONTENT");
    // THE PER-REQUEST LIFETIME, at the HTTP layer: the NEXT request without
    // the flag, on the same deck and engine, answers the SAVED content -
    // the transient root's store died at the page boundary.
    const plain = await handleEngineRequest(
      new Request("https://script-placeholder.bunny.run/Front"),
      realDeck(storage),
    );
    expect(plain.status).toBe(200);
    const plainBody = await plain.text();
    expect(plainBody).toContain("SAVED CONTENT");
    expect(plainBody).not.toContain("DRAFT CONTENT");
  });

  it("GET /<mark>?edit_draft=false renders the draft TOO (Ruby's string truthiness, the capture's own cell)", async () => {
    const storage = await createRenderTestStorage();
    await seedDraftedCard(storage);
    const res = await handleEngineRequest(
      new Request("https://script-placeholder.bunny.run/Front?edit_draft=false"),
      realDeck(storage),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("DRAFT CONTENT");
  });

  it("GET /<mark> without the flag renders the saved content", async () => {
    const storage = await createRenderTestStorage();
    await seedDraftedCard(storage);
    const res = await handleEngineRequest(
      new Request("https://script-placeholder.bunny.run/Front"),
      realDeck(storage),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SAVED CONTENT");
    expect(body).not.toContain("DRAFT CONTENT");
  });
});

describe("the read path's edit_draft consumption, against the pinned deck gem", () => {
  it("the deck gem replaces the content only when the param is present AND the card has drafts", () => {
    const byLabel = new Map(ORACLE.loadAction.map((row) => [row.label, row]));
    // No param at all: the saved content stands.
    expect(byLabel.get("no edit_draft")!.content).toBe("SAVED CONTENT");
    // The param present but no drafts: the saved content stands.
    expect(byLabel.get("edit_draft true, no drafts")!.content).toBe("SAVED CONTENT");
    // The param present with drafts: the draft's content replaces it.
    expect(byLabel.get("edit_draft true, with drafts")!.content).toBe("DRAFT CONTENT");
    // And the cell a boolean-parsing port would get wrong: the param's
    // VALUE is the string "false", which is TRUTHY in Ruby, so the content
    // IS replaced.
    expect(byLabel.get("edit_draft false")!.content).toBe("DRAFT CONTENT");
  });

  it("the action is selected before the drafts are consulted", () => {
    for (const row of ORACLE.loadAction) {
      expect(row.selectedAction, row.label).toBe(1);
    }
  });

  it("the card side picks the LAST draft's LAST card change", () => {
    expect(ORACLE.lastDraftContent).toEqual([
      { drafts: 2, value: "SECOND DRAFT" },
      { drafts: 1, value: "NEWER CHANGE" },
    ]);
  });

  it("the port's last-draft reader answers the LAST draft's LAST change, card-scoped", async () => {
    // Ruby: Card#drafts (card.rb:173) is the card's draft-true actions in id
    // order - NO actor scope - and last_draft_content is drafts.last
    // .card_changes.last.value (content/all.rb:42-44). The port's reader is
    // the same scope; the drafts here are seeded through the port's own
    // draft-save machinery (ActWriter.saveDraft), so the rows are the ones a
    // real draft save makes.
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 31001, name: "Drafted", typeId: 2, dbContent: "SAVED CONTENT" });
    const writer = new ActWriter({
      driver: storage.counting,
      actorId: 8,
      ipAddress: "127.0.0.1",
      now: () => new Date("2026-10-23T00:00:00Z"),
    });
    await writer.saveDraft({ cardId: 31001, content: "FIRST DRAFT" });
    await writer.saveDraft({ cardId: 31001, content: "NEWER CHANGE" });
    expect(await lastDraftContent(storage.counting, 31001)).toBe("NEWER CHANGE");
    // And a card with no draft-true action answers undefined - the
    // untouched-content cell.
    await seedCard(storage, { id: 31002, name: "Undrafted", typeId: 2, dbContent: "plain" });
    expect(await lastDraftContent(storage.counting, 31002)).toBeUndefined();
  });

  it("the render entry carries the host-to-render content override, for this render alone", async () => {
    // Ruby's load_action mutates the in-memory card BEFORE the view renders
    // (rest.rb:58-60); the port's render entry takes the override bytes and
    // applies them to the render's own record - never a cache write, so a
    // second render without the override sees the saved content again.
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 31001, name: "Drafted", typeId: 2, dbContent: "SAVED CONTENT" });
    const withDraft = await storage.engine.render("Drafted", "content", { contentOverride: "DRAFT CONTENT" });
    expect(withDraft).toContain("DRAFT CONTENT");
    expect(withDraft).not.toContain("SAVED CONTENT");
    const withoutDraft = await storage.engine.render("Drafted", "content");
    expect(withoutDraft).toContain("SAVED CONTENT");
    expect(withoutDraft).not.toContain("DRAFT CONTENT");
  });

  it("the port consumes the flag now: the scan expectation changed ON PURPOSE", () => {
    // THE SCAN'S EXPECTATION WAS CHANGED BY THIS LANDING, as the pin
    // demanded: the register's B11 blocker said a lane porting the
    // consumption 'has to change the scan's expectation on purpose and to
    // say why in the commit'. Round five's B11 commit is that lane. The
    // consumption lives in three files under src/: the history mod gained
    // the CARD-scoped last-draft reader beside its act-scoped draftActs,
    // the render seam gained the contentOverride field, and the render
    // entry applies it. The two hosts (the edge request core and the
    // staging server) read the flag and compute the override; they sit
    // outside src/ and are pinned at the HTTP layer in the legs below.
    const mentions = editDraftMentions(path.join(REPO, "src"));
    expect(mentions.sort()).toEqual([
      "src/card/history/render-seam.ts",
      "src/card/mod-loader/mods/card-mod-history.ts",
      "src/card/render.ts",
      "src/card/render/page.ts",
    ]);
    // The emitter's own URL still carries the flag, which is what a reader
    // follows to reach the draft.
    const emitter = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-history.ts"),
      "utf8",
    );
    expect(emitter).toContain("?edit_draft=true");
  });
});
