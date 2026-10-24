// The TYPED NEW-CARD CREATES pin (registry row cap-C2, "Create a Basic and a
// Date card through /new/<Type>").
//
// ORACLE-PINNED: fixtures/captured/new-card-types.json, captured from the
// pinned gemset (card-mod-format-0.20.0, card-mod-date-0.20.0,
// card-mod-edit-0.20.0 and card-1.110.0) by
// tests/card/mod-loader/oracle-capture-new-card-types.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-format-0.20.0 set/type/basic.rb - THE BASIC TYPE: the whole
//      file is `def pod_type; nil; end` - the Basic card has no pod, and
//      every one of its renders comes from the All::* sets.
//   2. card-mod-date-0.20.0 set/type/date.rb - THE DATE TYPE: `input_type`
//      is `:calendar`, and the :core view renders
//      `::Date.parse(card.content).strftime "%B %-d, %Y"`.
//   3. card-mod-format-0.20.0 lib/card/path.rb - THE ROUTE'S SHAPE:
//      `new_cardtype` renders `"#{action}/#{mark}#{query}"`.
//   4. card-mod-edit-0.20.0 set/all/new.rb - THE CREATE FORM: the :new view
//      is gated on `perms: :create`, and `new_success` is
//      `{ mark: card.rule(:thanks) || "_self" }`.
//   5. card-1.110.0 lib/card/env/success/target.rb - THE TARGET: a name
//      target is the card with that name.
//
// The port side is the format mod's Basic type, the date mod's Date type
// and its core view, and the action engine's type resolution.
//
// The instrument is the harness's own create loop, which drives BOTH routes
// to a STORED card and grades the landing. The row's own recorded gap was
// that opening the form does not demonstrate creating the card, so the
// stored card's own TYPE is now graded too: the route's mark names the
// type the create must produce, and the deck's codename row for that mark
// is the type card (the codename "basic" is the type card NAMED "RichText"
// on this deck, and "date" is the Date type card).
//
// ONE NAMED DIVERGENCE. Ruby's Date type owns `def input_type; :calendar;
// end`, and the port has no input-type registry, so the Date card's EDIT
// form does not offer the calendar widget. That is the port's own recorded
// skip (src/card/mod-loader/mods/card-mod-date.ts names it), it is not this
// row's contract, and the pin names it here rather than hiding it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/new-card-types.json", import.meta.url),
    "utf8",
  ),
);
const portFormat = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-format.ts",
    import.meta.url,
  ),
  "utf8",
);
const portDate = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-date.ts",
    import.meta.url,
  ),
  "utf8",
);
const portViews = readFileSync(
  new URL("./../../../src/card/render/views.ts", import.meta.url),
  "utf8",
);
const portTypes = readFileSync(
  new URL(
    "./../../../src/card/actions/type-resolution.ts",
    import.meta.url,
  ),
  "utf8",
);
const typedFixture = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs",
    import.meta.url,
  ),
  "utf8",
);
const harness = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise.mjs", import.meta.url),
  "utf8",
);
const roster = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const ROW_CHECKS = [
  "create route shows signed-in chrome and a card form: /new/Basic",
  "create route shows signed-in chrome and a card form: /new/Date",
  "create a Basic card through /new/Basic (landed on it, and it is stored)",
  "create a Date card through /new/Date (landed on it, and it is stored)",
];

describe("the pinned Ruby's own bytes for the two typed creates", () => {
  it("the Basic type has no pod", () => {
    expect(capture.facts.basic_pod_type_method).toBe("def pod_type");
    expect(capture.facts.basic_pod_type_value).toBe("nil");
  });

  it("the Date type owns the calendar input and its own core view", () => {
    expect(capture.facts.date_input_type_method).toBe("def input_type");
    expect(capture.facts.date_input_type_value).toBe(":calendar");
    expect(capture.facts.date_core_view).toBe("view :core do");
    expect(capture.facts.date_core_render).toBe(
      '::Date.parse(card.content).strftime "%B %-d, %Y"',
    );
  });

  it("the route's shape is the same for every type", () => {
    expect(capture.facts.new_cardtype_path).toBe(
      '"#{action}/#{mark}#{query}"',
    );
    expect(capture.facts.new_cardtype_guard).toBe(
      "return unless action.in?(%i[new type]) && mark.present?",
    );
  });

  it("the create form is gated on create and lands on the card itself", () => {
    expect(capture.facts.new_view).toBe(
      "view :new, perms: :create, unknown: true, cache: :never do",
    );
    expect(capture.facts.new_success).toBe(
      '{ mark: card.rule(:thanks) || "_self" }',
    );
    expect(capture.facts.success_target_card_fetch).toBe(
      "Card.fetch @name.to_name.absolute(name_context), new: @new_args",
    );
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.basic_type.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.date_input_type.gem).toBe("card-mod-date-0.20.0");
    expect(capture.oracle.new_success.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.success_target_card.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port registers the Basic type as the file Ruby has", () => {
    expect(portFormat).toContain("set/type/basic.rb:1-3");
    expect(portFormat).toContain("def pod_type; nil; end");
    expect(portFormat).toContain('setPath: "type/basic",');
  });

  it("the port registers the Date type and renders Ruby's own core view", () => {
    expect(portDate).toContain('setPath: "type/date",');
    expect(portViews).toContain("return formatDateCore(fmt.card.dbContent);");
    expect(portViews).toContain(
      'const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });',
    );
    expect(portViews).toContain("return `${month} ${day}, ${year}`;");
  });

  it("the port resolves a type NAME to its own id", () => {
    expect(portTypes).toContain("export async function resolveTypeId(");
  });

  it("the port's own date mod NAMES the input-type divergence", () => {
    expect(portDate).toContain(
      "The TS engine has",
    );
    expect(portDate).toContain(
      "no input-type registry today; the mod-registrar's ModSetModuleFile",
    );
  });
});

describe("the harness's C2 legs cannot pass vacuously", () => {
  it("the harness records all four of the row's checks", () => {
    for (const name of ROW_CHECKS) {
      expect(
        harness.includes(`record(\`${name}\``) ||
          harness.includes(`record("${name}"`) ||
          harness.includes(`create route shows signed-in chrome and a card form: `),
        `the harness records the check "${name}"`,
      ).toBe(true);
    }
  });

  it("the create leg grades the STORED type, not only the store", () => {
    expect(harness).toContain(
      "expectedTypeId = fixtureType(database(), way.label).id;",
    );
    expect(harness).toContain(
      "ok: write !== undefined && write.status < 400 && storedRow !== null && expectedTypeId !== null && storedRow.type_id === expectedTypeId && landing.ok,",
    );
  });

  it("the fixture helper resolves the type by the deck's own codename", () => {
    expect(typedFixture).toContain(
      "const codes={basic:'basic',",
    );
    expect(typedFixture).toContain(
      "SELECT id,name,type_id FROM cards WHERE codename=? AND trash=0",
    );
    expect(typedFixture).toContain(
      "In this deck, codename basic is RichText; the ordinary card\n// named basic is not a cardtype and must never become a fallback fixture type.",
    );
  });

  it("the roster declares the row's four checks and nothing else", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "C2");
    expect(row).toBeDefined();
    expect(row.status).toBe("covered");
    expect(row.checks).toEqual(ROW_CHECKS);
  });

  it("the grader credits the row only when all four pass", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "C2");
    const all = ROW_CHECKS.map((check) => ({ check, pass: true }));
    expect(
      verifiedCapabilities([row], all).find((c: { id: string }) => c.id === "C2")
        ?.status,
    ).toBe("covered");
    expect(
      verifiedCapabilities([row], all.slice(1)).find(
        (c: { id: string }) => c.id === "C2",
      )?.status,
    ).not.toBe("covered");
    expect(
      verifiedCapabilities([row], [
        ...all,
        { check: all[0].check, pass: false },
      ]).find((c: { id: string }) => c.id === "C2")?.status,
    ).not.toBe("covered");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("stored as a card of that type");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/new-card-types.json",
        "utf8",
      ),
    ).toContain('"date_input_type_value"');
  });
});
