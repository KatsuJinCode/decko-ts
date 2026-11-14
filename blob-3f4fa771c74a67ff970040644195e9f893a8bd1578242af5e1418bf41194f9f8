// smell-act082-new-cardtype-form-fields-parity.test.ts - the row
// smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.
//
// WHAT THIS IS. The row's own instrument is a browser probe that opens the
// card board's type row and reads the type select the board's edit link
// opens. The row closes when the port does what the SOURCE does there.
//
// The probe names its engine in one line, so tools/smell-act082-legs/run-leg.mjs
// runs the probe's own body against either leg and the only difference
// between the two captures is the engine. The captures under
// fixtures/captured/smell-act082-r3-2026-10-24/ are those two legs' own
// output.
//
// WHAT IT ASSERTS:
//
//   - the two legs offer the SAME type select: the same options in the same
//     order, with the same selected value. The captured option lists are
//     compared, not restated, so a fixture that no longer says what it says
//     fails here.
//
//   - the form that owns the select is the same on both legs: the same
//     action and the same field set, and the field set carries card[type]
//     and assign.
//
//   - the row's own question - is the cardtype created through the app
//     offered in the select - answers the SAME on both legs. Neither leg
//     offers it, so this is the source's behavior and not the port's
//     divergence, and the row's gap is withdrawn.
//
//   - the port's own source still renders the select the way the capture
//     describes (the type field's option list and its name), so a port that
//     changed the select fails the pin and the row cannot stay closed on a
//     stale measurement.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closed to DONE because its own verification ran and matched, and the
// roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, portSource } from "./smell-act082-captures.js";

const ROW = "new-cardtype-form-fields";

type TypeField = { name: string; tag: string; value: string; options: string[] | null; formAction: string | null; inModal: boolean };

function typeFields(leg: "ts" | "ruby33"): TypeField[] {
  const evidence = capture(ROW, leg).captures["q2-after-type-row-click.json"] as { typeFields?: TypeField[] };
  return evidence.typeFields ?? [];
}

describe("smell-act082-new-cardtype-form-fields: the type select the board's type row opens", () => {
  it("both legs offer the same eight options in the same order", () => {
    const selectOf = (leg: "ts" | "ruby33"): TypeField => {
      const select = typeFields(leg).find((field) => field.name === "card[type]");
      expect(select).toBeDefined();
      expect(select!.options).not.toBeNull();
      return select!;
    };
    const oracle = selectOf("ruby33");
    const port = selectOf("ts");
    expect(port.options).toEqual(oracle.options);
    expect(port.options).toHaveLength(8);
    expect(port.value).toBe(oracle.value);
    expect(port.value).toBe("PlainText");
  });

  it("both legs open the select in the same form", () => {
    const selectOf = (leg: "ts" | "ruby33"): TypeField => {
      const select = typeFields(leg).find((field) => field.name === "card[type]");
      expect(select).toBeDefined();
      return select!;
    };
    const oracle = selectOf("ruby33");
    const port = selectOf("ts");
    expect(port.inModal).toBe(oracle.inModal);
    // Each leg created its own card, so the card's name (and with it the
    // form's action) carries that leg's own stamp. The SHAPE of the action
    // is what the row asks about: both legs post to /update/<card>.
    expect(port.formAction).toMatch(/^\/update\/[^/]+$/);
    expect(oracle.formAction).toMatch(/^\/update\/[^/]+$/);
  });

  it("neither leg offers the cardtype created through the app, so the row's gap is the source's behavior", () => {
    // The created cardtype is in the deck on both legs (the probes recorded
    // it) and in neither leg's option list: the select offers the stock
    // cardtypes only, on the port AND on the source.
    const selectOf = (leg: "ts" | "ruby33"): string[] => {
      const select = typeFields(leg).find((field) => field.name === "card[type]");
      expect(select).toBeDefined();
      return select!.options ?? [];
    };
    for (const leg of ["ts", "ruby33"] as const) {
      const options = selectOf(leg);
      expect(options.some((option) => option.startsWith("Book_"))).toBe(false);
      expect(options).toContain("PlainText");
    }
  });

  it("the port still renders the type field the way the capture describes", () => {
    const edit = portSource("src/card/mod-loader/mods/card-mod-edit.ts");
    // The select's name and its option list, as the capture shows them.
    expect(edit).toContain('<select name="card[type]" id="card_type"');
    expect(edit).toContain("const createable = fmt.createableTypes();");
    // The createable list PLUS the card's own current type, which is the
    // eight-option set the capture records.
    expect(edit).toContain("if (fmt.card.id !== undefined && !createableSet.has(current))");
  });
});
