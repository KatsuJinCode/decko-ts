// smell-act082-save-post-body-parity.test.ts - the row
// smell-discovery-pageonly-ranks101-110-act082-save-post-body.
//
// WHAT THIS IS. The row's own instrument is a browser probe that opens the
// card board's type row, changes the live type select's value to the
// cardtype it created through the app, and captures the POST body the card's
// own Save fires. The row closes when the port posts what the SOURCE posts.
//
// The probe names its engine in one line, so tools/smell-act082-legs/run-leg.mjs
// runs the probe's own body against either leg and the only difference
// between the two captures is the engine. The captures under
// fixtures/captured/smell-act082-r3-2026-10-24/ are those two legs' own
// output.
//
// WHAT IT ASSERTS:
//
//   - the ORACLE's posted body carries card[type] (the chosen cardtype) and
//     the assign hidden field.
//
//   - the PORT's posted body carries NEITHER, and every other field is the
//     same on both legs. The captured bodies are decoded and compared here,
//     not restated, so a fixture that no longer says what it says fails.
//
//   - the port's own source still says what the receipt says it says: the
//     GET slot parser still cannot read slot[show][] as the show list, the
//     bare render path still passes no show list into the render, the
//     renderer still accepts one, and the update route still maps
//     card["type"] to the type name. A port that grew the show-list
//     plumbing fails this pin, so the row cannot stay open on a stale
//     mechanism.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open until the port's reload carries the live select, and the
// roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, postedFields, portSource } from "./smell-act082-captures.js";

const ROW = "save-post-body";

describe("smell-act082-save-post-body: what the card's Save posts after the type value changes", () => {
  it("the oracle posts the chosen cardtype and the assign field", () => {
    const oracleFields = postedFields(capture(ROW, "ruby33"));
    expect(oracleFields["card[type]"]).toMatch(/^Book_/);
    expect(oracleFields["assign"]).toBe("true");
  });

  it("the port posts neither the changed type nor assign, and every other field matches", () => {
    const oracleFields = postedFields(capture(ROW, "ruby33"));
    const portFields = postedFields(capture(ROW, "ts"));
    expect(portFields["card[type]"]).toBeUndefined();
    expect(portFields["assign"]).toBeUndefined();
    // Everything else the form carries is the same on both legs, so the
    // divergence is the type field's own two fields and nothing else.
    expect(Object.keys(portFields).sort()).toEqual(
      Object.keys(oracleFields)
        .filter((key) => key !== "card[type]" && key !== "assign")
        .sort(),
    );
  });

  it("the port's GET slot parser still cannot read slot[show][] as the show list", () => {
    const host = portSource("vm-staging-server.mjs");
    expect(host).toContain("const m = /^slot\\[(.+)\\]$/.exec(key);");
    // That parser's capture group, applied to the key the live type field's
    // own href carries, is "show][" and NOT "show".
    const captured = /^slot\[(.+)\]$/.exec("slot[show][]");
    expect(captured).not.toBeNull();
    expect(captured![1]).toBe("show][");
    expect(captured![1]).not.toBe("show");
  });

  it("the bare render path still passes no show list into the render", () => {
    const host = portSource("vm-staging-server.mjs");
    // The bare branch reads the slot context for main and home_view only.
    expect(host).toContain("const slotParams = pageOpts.slotParams;");
    expect(host).toContain("home_view: slotParams.home_view ?? view,");
    // And the render it then issues carries no show list.
    expect(host).toContain("const html = await renderEngine.render(cardName, view, renderParams);");
  });

  it("the renderer still accepts a show list, so the gap is the delivery and not the renderer", () => {
    const format = portSource("src/card/render/format.ts");
    expect(format).toContain('const optShow = this.opts["show"];');
    expect(format).toContain("for (const view of normalizeVisibilityList(optShow)) this.viz.set(view, \"show\");");
    expect(format).toContain("function normalizeVisibilityList(value: unknown): string[] {");
  });

  it("the port's update route still maps card[\"type\"] to the type name", () => {
    // The server would honour the type it is given; the row's gap is that
    // the client never sends it.
    expect(portSource("src/server/write-routes.ts")).toContain('typeName: card["type"],');
  });
});
