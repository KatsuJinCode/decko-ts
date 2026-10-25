// smell-act082-select-owner-form-parity.test.ts - the row
// smell-discovery-pageonly-ranks101-110-act082-select-owner-form.
//
// WHAT THIS IS. The row's own instrument is a browser probe that opens the
// card board's type row, changes the live type select's value to the
// cardtype it created through the app, and clicks the card's Save. The row
// closes when the port's Save does what the SOURCE's Save does.
//
// The probe names its engine in one line, so tools/smell-act082-legs/run-leg.mjs
// runs the probe's own body against either leg and the only difference
// between the two captures is the engine. The captures under
// fixtures/captured/smell-act082-r3-2026-10-24/ are those two legs' own
// output.
//
// WHAT IT ASSERTS:
//
//   - the ORACLE's Save answers 200, the posted body carries card[type]
//     (the chosen cardtype) and assign, and the card's stored type is no
//     longer the scratch type.
//
//   - the PORT's Save NEVER FIRES: no POST is witnessed and the click times
//     out. The captured outcome is compared, not restated.
//
//   - the port's form is NOT missing the field: the probe's own DOM census
//     records the select inside the form that owns it, and the form's field
//     set is the SAME on both legs and carries card[type] and assign. So
//     the divergence is not a missing field.
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

import { capture, formFieldNames, portSource } from "./smell-act082-captures.js";

const ROW = "select-owner-form";

type Outcome = {
  valueAfter: string;
  ownership: { selectInForm: boolean; formAction: string; formFields: string[] };
  seen: { status?: number; error?: string };
  storedTypeId: number | null;
  isBook: boolean;
  posts: { path: string; postData?: string }[];
};

function outcome(leg: "ts" | "ruby33"): Outcome {
  return capture(ROW, leg).captures["outcome.json"] as Outcome;
}

describe("smell-act082-select-owner-form: what the card's Save does after the type value changes", () => {
  it("the oracle's Save answers 200 with the chosen cardtype in the body", () => {
    const oracle = outcome("ruby33");
    expect(oracle.seen.status).toBe(200);
    expect(oracle.posts.length).toBeGreaterThan(0);
    const fields: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(oracle.posts[0]!.postData ?? "")) fields[key] = value;
    expect(fields["card[type]"]).toMatch(/^Book_/);
    expect(fields["assign"]).toBe("true");
    // The card's stored type is no longer the scratch type.
    expect(oracle.storedTypeId).toBeNull();
  });

  it("the port's Save never fires, and the card's stored type stays the scratch type", () => {
    const port = outcome("ts");
    expect(port.posts.length).toBe(0);
    expect(port.seen.error).toBeTruthy();
    expect(port.storedTypeId).toBe(37);
    expect(port.isBook).toBe(false);
  });

  it("the port's form is not missing the field: the select is in the form and the field set matches the source", () => {
    const oracle = outcome("ruby33");
    const port = outcome("ts");
    expect(port.ownership.selectInForm).toBe(true);
    expect(port.ownership.formAction).toMatch(/^\/update\/[^/]+$/);
    // The form's field set is the same on both legs, and it carries the
    // type field and the assign hidden input.
    expect(port.ownership.formFields).toEqual(oracle.ownership.formFields);
    expect(port.ownership.formFields).toContain("card[type]");
    expect(port.ownership.formFields).toContain("assign");
    // And the select holds the chosen value on both legs, so the port's
    // field is not the thing that is wrong.
    expect(port.valueAfter).toMatch(/^Book_/);
    expect(oracle.valueAfter).toMatch(/^Book_/);
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
