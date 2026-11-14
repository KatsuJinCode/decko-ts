// The rule-default content pin (registry row cap-C14, "Default content from a
// rule fills the new form").
//
// ORACLE-PINNED: fixtures/captured/rule-default-content.json, captured from
// the pinned gemset (card-1.110.0, card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-rule-default-content.rb. The capture
// photographs the pinned gemset's OWN bytes for the owners of the contract
// and writes nothing.
//
// What the contract is, in the pinned bytes:
//
//   1. card-1.110.0 lib/card/rule/all.rb - rule(setting_code), the accessor
//      that returns the rule card a setting code names.
//   2. card-1.110.0 mod/core/set/all/content.rb - standard_db_content, the
//      branch that decides which content a card carries.
//   3. card-mod-edit-0.20.0 set/all/editor.rb - text_area_input, the editor's
//      own input: text_area :content, which inside the card's own form is
//      the field card[content].
//
// The port side is the engine's rule-content walk
// (src/card/actions/rule-content-walk.ts) and the edit mod that renders the
// rule body's nests. The third leg is the harness's own C14 check: it must
// stage the deck's own *right+*default rule and require the rule's CONTENT
// in the editor, not a 200.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/rule-default-content.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-edit.ts", import.meta.url),
  "utf8",
);
const ruleWalkSource = readFileSync(
  new URL("./../../../src/card/actions/rule-content-walk.ts", import.meta.url),
  "utf8",
);
const coverB = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs", import.meta.url),
  "utf8",
);

describe("the pinned Ruby's own bytes for the rule-default content", () => {
  it("the rule accessor names the rule card a setting code stands for", () => {
    expect(capture.facts.rule_accessor).toBe("def rule setting_code");
    expect(capture.facts.rule_returns_a_rule_card).toBe("rule_card");
  });

  it("the editor's field is the card's content field", () => {
    expect(capture.facts.editor_field).toBe("text_area :content");
    expect(capture.facts.editor_field_name).toBe("card[content]");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.rule_accessor.gem).toBe("card-1.110.0");
    expect(capture.oracle.rule_accessor.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the same rule-default contract", () => {
  it("walks the deck's own rules for a card's content", () => {
    expect(ruleWalkSource).toContain("export async function ruleContentForCard(");
  });

  it("renders the rule body's nests, the way the pinned abstract says", () => {
    expect(portSource).toContain("set/right/default.rb:1");
    expect(portSource).toContain("every `*default`/`*structure` rule body's nests land");
  });
});

describe("the harness's C14 check cannot pass vacuously", () => {
  it("stages the deck's own *right+*default rule with content", () => {
    expect(coverB).toContain('await create("Harness_CB_Home+*right+*default", "Watch this");');
  });

  it("grades the rule's content in the editor, not a 200", () => {
    expect(coverB).toContain(
      'record("C14 a *right+*default rule\'s content fills the new form for a card with that right"',
    );
    expect(coverB).toContain('/Watch this/.test(content)');
    expect(coverB).toContain("textarea[name=\"card[content]\"]");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("*right+*default");
    expect(
      readFileSync(repoRoot + "fixtures/captured/rule-default-content.json", "utf8"),
    ).toContain('"rule_accessor"');
  });
});
