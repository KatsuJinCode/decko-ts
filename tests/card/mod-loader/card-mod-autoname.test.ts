// The autoname pin (registry row cap-C11, "Autoname cardtype (name generated
// on save)").
//
// ORACLE-PINNED: fixtures/captured/autoname.json, captured from the pinned
// gemset (card-1.110.0, card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-autoname.rb. The capture photographs
// the pinned gemset's OWN bytes for the owners of the contract and writes
// nothing.
//
// What the contract is, in the pinned bytes:
//
//   1. card-1.110.0 mod/core/set/all/autoname.rb - the event sets the name
//      when the card is STORED (on: :create, when: :autoname?), and
//      autoname? is a blank name AND a present autoname rule.
//   2. card-1.110.0 lib/card/name/all.rb - the generator: a name that already
//      exists advances to name.next, so the generated name is a FREE name.
//   3. card-mod-edit-0.20.0 set/all/new.rb - needs_name? (card.name.blank?
//      && !autoname?) decides whether the new form asks for a name at all,
//      and new_view_name renders the hidden card[name] field only when the
//      card is not autonamed.
//
// The port side is the engine's new-card name surface
// (src/card/mod-loader/mods/card-mod-edit.ts). The third leg is the
// harness's own C11 check, which must be bound to the row's exact name and
// must grade the STORED card's generated name, not a 200.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(new URL("./../../../fixtures/captured/autoname.json", import.meta.url), "utf8"),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-edit.ts", import.meta.url),
  "utf8",
);
const sharedCheck = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/checks-unmeasured-save-edit-create.mjs", import.meta.url),
  "utf8",
);
const catalogCheck = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/checks-catalog-edit-create.mjs", import.meta.url),
  "utf8",
);

describe("the pinned Ruby's own bytes for the autoname contract", () => {
  it("the name is set when the card is stored, and only when the card is autonamed", () => {
    expect(capture.facts.autoname_event).toContain("on: :create");
    expect(capture.facts.autoname_event).toContain("when: :autoname?");
    expect(capture.facts.autoname_predicate).toContain("name.blank?");
    expect(capture.facts.autoname_predicate).toContain("rule(:autoname)");
  });

  it("the generated name advances until it is free", () => {
    expect(capture.facts.name_advance).toBe("autoname name.next");
    expect(capture.oracle.name_generator.source).toContain("Card.exist?(name)");
  });

  it("the new form asks for a name only when the card is not autonamed", () => {
    expect(capture.facts.needs_name_predicate).toBe("card.name.blank? && !autoname?");
    expect(capture.oracle.new_view_name.source).toContain("elsif !autoname?");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.set_autoname_event.gem).toBe("card-1.110.0");
    expect(capture.oracle.set_autoname_event.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the same autoname contract", () => {
  it("reads the deck's own autoname setting, the way Ruby's rule(:autoname) does", () => {
    expect(portSource).toContain('engine.findSettingCard?.("autoname")');
  });

  it("asks for a name only when the card is blank and not autonamed, and cites the pinned line", () => {
    expect(portSource).toContain("new.rb:122-124");
    expect(portSource).toContain("card.name.blank? && !autoname?");
  });

  it("renders the hidden card[name] field only when the card is not autonamed", () => {
    expect(portSource).toContain("elsif !autoname?");
  });
});

describe("the harness's C11 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(catalogCheck).toContain(
      'ctx.record("C11 an autoname cardtype generates its name on save"',
    );
  });

  it("stages the stock type-set autoname rule and grades the stored name", () => {
    expect(sharedCheck).toContain("C11 a cardtype created with an autoname pattern stores a card with the generated name, not the empty name");
    expect(sharedCheck).toContain('const ruleName = cardtypeName + "+*type+*autoname";');
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("autoname");
    expect(
      readFileSync(repoRoot + "fixtures/captured/autoname.json", "utf8"),
    ).toContain('"autoname_event"');
  });
});
