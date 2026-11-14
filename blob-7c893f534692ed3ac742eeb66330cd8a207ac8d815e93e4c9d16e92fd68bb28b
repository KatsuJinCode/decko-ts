// smell-act082-type-select-all-options-parity.test.ts - the row
// smell-discovery-pageonly-ranks101-110-act082-type-select-all-options.
//
// WHAT THIS IS. The row's own instrument is a browser probe that opens the
// card board's type row and reads the type select's whole option set. The
// row closes when the port offers what the SOURCE offers.
//
// The probe names its engine in one line, so tools/smell-act082-legs/run-leg.mjs
// runs the probe's own body against either leg and the only difference
// between the two captures is the engine. The captures under
// fixtures/captured/smell-act082-r3-2026-10-24/ are those two legs' own
// output.
//
// WHAT IT ASSERTS:
//
//   - the two legs offer the SAME 33 options in the SAME order, with the
//     same selected value. The captured option lists are compared, not
//     restated, so a fixture that no longer says what it says fails here.
//
//   - the cardtype created through the app is in NEITHER leg's option list,
//     so the row's gap is the source's behavior and not the port's
//     divergence.
//
//   - the form that owns the select is the same on both legs: the same
//     action shape, the same field set (carrying card[type] and assign) and
//     the same submit controls.
//
//   - the port's own source still renders the select's option list the way
//     the capture describes it, so a port that changed the select fails the
//     pin and the row cannot stay closed on a stale measurement.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closed to DONE because its own verification ran and matched, and the
// roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, portSource } from "./smell-act082-captures.js";

const ROW = "type-select-all-options";

type Option = { v: string; t: string; sel: boolean };
type Control = { tag: string; type: string | null; cls: string; text: string };

type Evidence = {
  found: boolean;
  value: string;
  optionCount: number;
  options: Option[];
  formAction: string;
  formFields: { name: string; type: string | null; value: string }[];
  submitControls: Control[];
};

function evidence(leg: "ts" | "ruby33"): Evidence {
  return capture(ROW, leg).captures["q2-all-options.json"] as Evidence;
}

describe("smell-act082-type-select-all-options: the type select's option set", () => {
  it("both legs offer the same 33 options in the same order", () => {
    const oracle = evidence("ruby33");
    const port = evidence("ts");
    expect(port.found).toBe(true);
    expect(port.optionCount).toBe(33);
    expect(port.optionCount).toBe(oracle.optionCount);
    expect(port.options.map((option) => option.v)).toEqual(oracle.options.map((option) => option.v));
    expect(port.value).toBe(oracle.value);
    expect(port.value).toBe("PlainText");
  });

  it("neither leg offers the cardtype created through the app, so the row's gap is the source's behavior", () => {
    for (const leg of ["ts", "ruby33"] as const) {
      const options = evidence(leg).options.map((option) => option.v);
      expect(options.some((option) => option.startsWith("Book_"))).toBe(false);
      // The plain cardtypes are the set, on both legs.
      expect(options).toContain("PlainText");
      expect(options).toContain("RichText");
    }
  });

  it("the form that owns the select is the same on both legs", () => {
    const oracle = evidence("ruby33");
    const port = evidence("ts");
    expect(port.formAction).toMatch(/^\/update\/[^/]+$/);
    expect(oracle.formAction).toMatch(/^\/update\/[^/]+$/);
    const names = (value: Evidence): string[] => value.formFields.map((field) => field.name);
    expect(names(port)).toEqual(names(oracle));
    expect(names(port)).toContain("card[type]");
    expect(names(port)).toContain("assign");
    const controls = (value: Evidence): string[] => value.submitControls.map((control) => control.cls);
    expect(controls(port)).toEqual(controls(oracle));
  });

  it("the port still renders the select's option list the way the capture describes it", () => {
    const edit = portSource("src/card/mod-loader/mods/card-mod-edit.ts");
    // The select's name, and the option list the capture counts: the
    // createable types PLUS the card's own current type.
    expect(edit).toContain('<select name="card[type]" id="card_type"');
    expect(edit).toContain("const createable = fmt.createableTypes();");
    expect(edit).toContain("if (fmt.card.id !== undefined && !createableSet.has(current))");
  });
});
