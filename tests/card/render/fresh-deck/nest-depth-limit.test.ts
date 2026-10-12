// The nest depth limit matches stock Ruby Decko 0.20.0: monitor_depth
// (card-1.110.0 format/error.rb:33-40) refuses a subformat at max_depth 20
// with the format_too_deep UserError, raised out of that subformat's render
// so the view that nested it renders the error. The reference harness's
// synthetic-v1 deck carries a 25-card chain and a two-card loop; Ruby's
// recorded renders are the expectation.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openHarnessSession, rubyRender, type HarnessSession } from "./harness-session.js";

describe("nest depth limit against the recorded Ruby renders", () => {
  let session: HarnessSession;
  beforeAll(async () => {
    session = await openHarnessSession();
  }, 120_000);
  afterAll(async () => {
    await session?.close();
  });

  it.each([
    ["core", "anonymous", "Chain 01"],
    ["core", "anonymous", "Chain 06"],
    ["core", "anonymous", "Chain 07"],
    ["core", "member", "Loop A"],
    ["core", "admin", "Loop B"],
    ["page", "anonymous", "Chain 01"],
    ["page", "anonymous", "Chain 05"],
    ["page", "admin", "Loop A"],
  ])("%s for %s: %s", async (kind, actor, card) => {
    const answer = await session.render(card, { actor, view: kind === "page" ? undefined : kind });
    expect(answer.error).toBeUndefined();
    expect(answer.html).toBe(rubyRender(`${kind}:${actor}:${card}`));
  }, 60_000);

  it("the twentieth card of a chain renders Ruby's too-deep message in place of its core", async () => {
    const answer = await session.render("Chain 01", { view: "core" });
    expect(answer.html).toContain("Depth 19.");
    expect(answer.html).not.toContain("Depth 20.");
    // Ruby (mods on) renders the 20th card's own titled view with the
    // too-deep denial as the quiet span inside it — the loud render-error
    // span was the engine's pre-round-9 behavior, corrected to the oracle.
    expect(answer.html).toContain("SELF-chain_20 TYPE-rich_text card-slot titled-view");
  }, 60_000);
});
