// The create-form preset pin (registry row cap-C10, "Presetting card content
// from the URL (?card[content]=...)").
//
// ORACLE-PINNED: fixtures/captured/new-card-preset.json, captured from the
// pinned gemset (card-1.110.0, card-mod-edit-0.20.0, decko-0.20.0) by
// tests/card/mod-loader/oracle-capture-new-card-preset.rb. The capture
// photographs the pinned gemset's OWN bytes for the four owners of the
// contract - the fetch options that read the request's card hash, the new
// view's name field, the editor's input, and the write route's create arm -
// and it performs ZERO writes and reads no deck.
//
// What the contract is, in the pinned bytes:
//
//   1. card_class.rb:129 - the new card's fetch options are built from the
//      request's card hash ("new: card_params"), so /new/<Type>?card[name]=X
//      &card[content]=Y names the card and fills the editor.
//   2. new.rb:103-109 - new_view_name renders the hidden "card[name]" field
//      (the named shape) or the name prompt (the unnamed shape).
//   3. editor.rb:46-49 - the editor's own input is text_area :content, and
//      the form is the card's own form (new.rb:45 card_form :create), so the
//      rendered field name is "card[content]".
//   4. rest.rb:15 - a new card is CREATED on the write route; an existing one
//      is updated. The preset therefore has to reach a create.
//
// The port side is the edge's signed-in new-card form
// (deploy/bunny-worker-src/bunny-edge-new-card-form.ts). This pin proves the
// port carries the contract the pinned Ruby states: the SAME field names, and
// the preset's own values in them.
//
// The third leg is the harness's own C10 check. A capability row closes on a
// check that can pass VACUOUSLY only if the check itself is pinned, so the
// check's condition is read here and required to ask for the marker in the
// editor AND in the stored card's page - not for a 200.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { signedInNewCardFormBodyHtml } from "../../../deploy/bunny-worker-src/bunny-edge-new-card-form.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(new URL("./../../../fixtures/captured/new-card-preset.json", import.meta.url), "utf8"),
);
const coverB = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs", import.meta.url),
  "utf8",
);

describe("the pinned Ruby's own bytes for the create-form preset", () => {
  it("the request's card hash is what the new card is built from", () => {
    expect(capture.oracle.card_class_fetch.marker).toBe("Env.hash(params[:card])");
    expect(capture.oracle.card_class_fetch.source).toContain("params[:card]");
    expect(capture.facts.request_card_hash).toBe("params[:card]");
  });

  it("the name field and the editor field carry the pinned names", () => {
    expect(capture.facts.name_field_name).toBe("card[name]");
    expect(capture.facts.content_field_name).toBe("card[content]");
    expect(capture.oracle.new_view_name.source).toContain('hidden_field_tag "card[name]"');
    expect(capture.oracle.editor_input.source).toMatch(/text_area\s+:content/);
    expect(capture.oracle.create_arm.source).toContain("card.new_card? ? create");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.card_class_fetch.gem).toBe("card-1.110.0");
    expect(capture.oracle.card_class_fetch.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the same preset contract", () => {
  const name = "Harness_preset";
  const marker = "<p>Harness preset marker</p>";
  const html = signedInNewCardFormBodyHtml("RichText", 39120, "rich_text", name, marker);

  it("the form's name field carries the preset name under the pinned field name", () => {
    expect(html).toContain('name="card[name]"');
    expect(html).toContain(`value="${name}"`);
  });

  it("the editor's field carries the preset content under the pinned field name", () => {
    expect(html).toContain('name="card[content]"');
    // The preset is ESCAPED on the way into the form, the way Ruby's own
    // text_area escapes the card's content.
    expect(html).toContain("&lt;p&gt;Harness preset marker&lt;/p&gt;");
    expect(html).not.toContain("<p>Harness preset marker</p>");
  });

  it("the Date branch of the editor carries the same field name", () => {
    const dateForm = signedInNewCardFormBodyHtml("Date", 17, "date", name, "2011-12-14");
    expect(dateForm).toContain('name="card[content]"');
    expect(dateForm).toContain('value="2011-12-14"');
  });
});

describe("the harness's C10 check cannot pass vacuously", () => {
  it("asks for the marker in the editor and in the stored card", () => {
    expect(coverB).toContain('record("C10 content preset in the /new URL fills the editor and is stored on the card"');
    expect(coverB).toContain("String(prefilled ?? \"\").includes(marker)");
    expect(coverB).toContain("after.html.includes(marker)");
  });

  it("reads the editor's content under the pinned field name", () => {
    expect(coverB).toContain('textarea[name="card[content]"]');
  });
});

// The capture is read from the repository root as well, so a renamed or
// moved fixture fails the pin instead of silently reading nothing.
describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("card[name]");
    expect(readFileSync(repoRoot + "fixtures/captured/new-card-preset.json", "utf8")).toContain(
      '"request_card_hash"',
    );
  });
});
