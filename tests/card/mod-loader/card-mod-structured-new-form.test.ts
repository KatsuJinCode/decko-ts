// The structured-card new-form pin (registry row cap-C12, "Create a new
// structured card with its subcards (New structured card)").
//
// ORACLE-PINNED: fixtures/captured/structured-new-form.json, captured from the
// pinned gemset (card-1.110.0, card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-structured-new-form.rb. The capture
// photographs the pinned gemset's OWN bytes for the owners of the contract
// and writes nothing.
//
// What the contract is, in the pinned bytes:
//
//   1. card-1.110.0 mod/core/set/all/content.rb - standard_db_content: a
//      card WITH a structure keeps its own db_content and does not take the
//      structure's content over it.
//   2. card-1.110.0 mod/core/set/all/subcards.rb - the subcard surface the
//      structure's subcards live in.
//   3. card-mod-edit-0.20.0 set/all/form.rb - content_field, the form region
//      that renders the content (and the structure's subcards) on a new card.
//
// The port side is the engine's edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts), whose template nest view is
// where every *default/*structure rule body's nests land, the way the pinned
// card-mod-content abstract says. The third leg is the harness's own C12
// check: it must stage the deck's own structure rule and require BOTH of the
// structure's subcards to be offered, so the check cannot pass on one name.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/structured-new-form.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-edit.ts", import.meta.url),
  "utf8",
);
const coverB = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs", import.meta.url),
  "utf8",
);

describe("the pinned Ruby's own bytes for the structured new form", () => {
  it("a structured card keeps its own content and does not take the structure's", () => {
    expect(capture.facts.structure_branch).toBe("if structure");
    expect(capture.facts.structure_content_rule).toBe(
      "do not override db_content with content from structure",
    );
  });

  it("the form renders its content region, where the subcards are offered", () => {
    expect(capture.facts.form_content_region).toBe("def content_field");
    expect(capture.facts.form_renders_content).toBe("_render_input");
  });

  it("the subcards live in the card's own subcard surface", () => {
    expect(capture.oracle.subcards_surface.source).toContain("event :reject_empty_subcards");
    expect(capture.oracle.subcards_surface.source).toContain("drop_subcard(key)");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.standard_db_content.gem).toBe("card-1.110.0");
    expect(capture.oracle.standard_db_content.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the same structure contract", () => {
  it("every *default/*structure rule body's nests land in the template nest view", () => {
    expect(portSource).toContain("set/right/structure.rb:1");
    expect(portSource).toContain("every `*default`/`*structure` rule body's nests land");
    expect(portSource).toContain("export const templateNestView");
  });

  it("the template nest view is the pinned branch, with the field-only arm kept", () => {
    expect(portSource).toContain('if (name.fieldOnly) {');
    expect(portSource).toContain('withNestMode("normal"');
  });
});

describe("the harness's C12 check cannot pass vacuously", () => {
  it("stages the deck's own structure rule with two subcards", () => {
    expect(coverB).toContain('await create(`${movie}+*type+*structure`, "{{+director}} {{+lead}}");');
  });

  it("requires BOTH subcards on the new form", () => {
    expect(coverB).toContain(
      'record("C12 a structured card\'s new form offers its subcards (+director and +lead)"',
    );
    expect(coverB).toContain("form.status === 200 && hasDirector && hasLead");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("subcards");
    expect(
      readFileSync(repoRoot + "fixtures/captured/structured-new-form.json", "utf8"),
    ).toContain('"structure_branch"');
  });
});
