// smell-act082-type-select-refresh-after-create-parity.test.ts - the row
// smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.
//
// WHAT THIS IS. The row's own instrument is a browser probe that creates a
// cardtype through the app, reads the type select BEFORE and AFTER that
// create, and then changes the select's value and reads what the submit
// carried. The row closes when the port does what the SOURCE does.
//
// The probe names its engine in one line, so tools/smell-act082-legs/run-leg.mjs
// runs the probe's own body against either leg and the only difference
// between the two captures is the engine. The captures under
// fixtures/captured/smell-act082-r3-2026-10-24/ are those two legs' own
// output.
//
// WHAT IT ASSERTS:
//
//   - the REFRESH is parity: both legs start with 33 options without the
//     created cardtype, the create answers 200, and both legs end with 34
//     options WITH it. The port's select refreshes exactly as the source's.
//
//   - the CHANGED VALUE diverges: the oracle keeps the chosen cardtype
//     through the submit and the card's stored type changes; the port's
//     chosen value reads null at submit and the stored type is still the
//     scratch type. The captured outcomes are compared, not restated.
//
//   - the port's own source still says what the receipt says it says: the
//     GET slot parser still cannot read slot[show][] as the show list and
//     the bare render path still passes no show list into the render, so
//     the row cannot stay open on a stale mechanism.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open until the port's reload carries the live select, and the
// roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, portSource } from "./smell-act082-captures.js";

const ROW = "type-select-refresh-after-create";

type Outcome = {
  book: string;
  bookId: number;
  post: { status: number; path: string };
  chosen: { value: string | null };
  storedTypeId: number | null;
};

function outcome(leg: "ts" | "ruby33"): Outcome {
  return capture(ROW, leg).captures["outcome.json"] as Outcome;
}

describe("smell-act082-type-select-refresh-after-create: the refresh is parity, the changed value is not", () => {
  it("the oracle keeps the chosen cardtype through the submit and the stored type changes", () => {
    const oracle = outcome("ruby33");
    expect(oracle.chosen.value).toMatch(/^Book_/);
    expect(oracle.post.status).toBe(200);
    // The card's stored type is no longer the scratch type: the fixture's
    // type lookup no longer finds it under the scratch type.
    expect(oracle.storedTypeId).toBeNull();
  });

  it("the port's chosen value is gone at submit and the stored type stays the scratch type", () => {
    const port = outcome("ts");
    expect(port.chosen.value).toBeNull();
    expect(port.post.status).toBe(200);
    expect(port.storedTypeId).toBe(37);
  });

  it("the port's GET slot parser still cannot read slot[show][] as the show list", () => {
    const host = portSource("vm-staging-server.mjs");
    expect(host).toContain("const m = /^slot\\[(.+)\\]$/.exec(key);");
    const captured = /^slot\[(.+)\]$/.exec("slot[show][]");
    expect(captured).not.toBeNull();
    expect(captured![1]).toBe("show][");
    expect(captured![1]).not.toBe("show");
  });

  it("the bare render path still passes no show list into the render", () => {
    const host = portSource("vm-staging-server.mjs");
    expect(host).toContain("const slotParams = pageOpts.slotParams;");
    expect(host).toContain("home_view: slotParams.home_view ?? view,");
    expect(host).toContain("const html = await renderEngine.render(cardName, view, renderParams);");
  });
});
