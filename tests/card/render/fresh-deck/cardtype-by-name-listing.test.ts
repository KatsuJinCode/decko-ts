// A cardtype's page lists the cards of that type: the stock
// `Cardtype+*type+*structure` rule nests `{{+:type+:by_name|content}}`, a
// VirtualSearch family card (card-mod-search set/right/by_name.rb,
// `found_by: "_left", sort_by: "name"`). Ruby's Right pattern matches the
// family by the right card's codename, and the stock seed names this card
// `by name`, without the leading "*" most family cards carry; the port used
// to key the family on starred names, so the nest fell to the unknown-card
// path, and once known its search had not been executed before the sync
// render, so it showed no results. Ruby's recorded renders of the
// synthetic-v1 deck's five custom types are the expectation.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { virtualSearchCqlFor } from "../../../../src/card/fetch/virtual-search-cards.js";
import { DeckoName } from "../../../../src/card/name.js";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("VirtualSearch family membership by codename", () => {
  it("matches the stock seed's unstarred sort cards", () => {
    expect(virtualSearchCqlFor(DeckoName.parse("Topic+*type+by name"))).toBe(
      '{"found_by":"_left","sort_by":"name"}',
    );
  });

  it("follows the card that holds the codename when the engine can resolve it", () => {
    const holders = new Map([["count", "*count_1"]]);
    const resolve = (codename: string) => holders.get(codename);
    expect(virtualSearchCqlFor(DeckoName.parse("Notes+*count 1"), resolve)).toBe(
      '{"found_by":"_left","return":"count"}',
    );
    expect(virtualSearchCqlFor(DeckoName.parse("Notes+*count"), resolve)).toBeUndefined();
  });
});

describe("cardtype by-name listing against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["core", "anonymous", "Topic"],
    ["core", "member", "Memo"],
    ["core", "anonymous", "Memo"],
    ["core", "member", "Tag"],
    ["page", "anonymous", "Note"],
    ["page", "member", "Brief"],
  ])("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);

  it("lists the type's cards sorted by name", async () => {
    const answer = await session.render("Topic", { view: "core" });
    expect(answer.html).toContain('class="card-list card-list-bar search-result-list"');
    expect(answer.html).toContain('data-card-name="Topic 001"');
    expect(answer.html!.indexOf('data-card-name="Topic 001"')).toBeLessThan(
      answer.html!.indexOf('data-card-name="Topic 002"'),
    );
  }, 60_000);
});
