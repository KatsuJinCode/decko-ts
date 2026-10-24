// The NEW-CARD ROUTE AND THE LANDING pin (registry row cap-C1, "Create a
// RichText card through /new/RichText and land on it").
//
// ORACLE-PINNED: fixtures/captured/new-card-landing.json, captured from the
// pinned gemset (card-1.110.0, card-mod-format-0.20.0 and
// card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-new-card-landing.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-1.110.0 lib/card/fetch/card_class.rb - THE TYPED ROUTE: the
//      `/new/:type` shortcut is `opts[:type] ||= params[:type] if
//      params[:type]`, and the card's own name comes from the mark.
//   2. card-mod-format-0.20.0 lib/card/path.rb - THE ROUTE'S SHAPE:
//      `new_cardtype` renders `"#{action}/#{mark}#{query}"`.
//   3. card-mod-edit-0.20.0 set/all/new.rb - THE CREATE FORM: the :new view
//      is gated on `perms: :create`, `framed_create_form` merges
//      `success: new_success` into the form's options, `new_form_opts` is
//      the form's own `data-main-success`, and `new_success` is
//      `{ mark: card.rule(:thanks) || "_self" }` - the card itself when no
//      thanks rule answers.
//   4. card-1.110.0 lib/card/env/success/target.rb - THE TARGET: a name
//      target is the card with that name.
//
// The port side is the edit mod's new-card view
// (src/card/mod-loader/mods/card-mod-edit.ts) and the write route's typed
// shortcut (src/server/write-routes.ts).
//
// The instrument is the harness's own create leg, and its landing predicate
// (tools/edge-signed-in-exercise/lib/new-card-landing.mjs) is what closes
// the row's recorded gap: the landing was not part of the predicate, so a
// create that stayed on the form still passed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/new-card-landing.json", import.meta.url),
    "utf8",
  ),
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const portWriteRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
  "utf8",
);
const landingPredicate = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/new-card-landing.mjs",
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

const ROW_CHECK = "create a RichText card via /new/RichText and land on it";

describe("the pinned Ruby's own bytes for the new-card route and the landing", () => {
  it("the typed route presets the type and names the card", () => {
    expect(capture.facts.uri_fetch_type_shortcut).toBe(
      "opts[:type] ||= params[:type] if params[:type] # for /new/:type shortcut.",
    );
    expect(capture.facts.uri_fetch_name).toBe(
      'opts[:name] ||= Name[params[:mark]]&.tr "_", " "',
    );
  });

  it("the route's shape is action/mark", () => {
    expect(capture.facts.new_cardtype_path).toBe(
      '"#{action}/#{mark}#{query}"',
    );
    expect(capture.facts.new_cardtype_guard).toBe(
      "return unless action.in?(%i[new type]) && mark.present?",
    );
  });

  it("the create form is gated on create and carries the success target", () => {
    expect(capture.facts.new_view).toBe(
      "view :new, perms: :create, unknown: true, cache: :never do",
    );
    expect(capture.facts.framed_create_form_success).toBe(
      "form_opts.reverse_merge! success: new_success",
    );
    expect(capture.facts.new_form_opts).toBe(
      '{ "data-main-success": JSON(redirect: true) }',
    );
  });

  it("the success mark is the card itself when no thanks rule answers", () => {
    expect(capture.facts.new_success).toBe(
      '{ mark: card.rule(:thanks) || "_self" }',
    );
  });

  it("the target is the named card", () => {
    expect(capture.facts.success_target_card_fetch).toBe(
      "Card.fetch @name.to_name.absolute(name_context), new: @new_args",
    );
    expect(capture.facts.success_process_name).toBe("@name = Name[value]");
    expect(capture.facts.success_process_previous).toBe(
      'when "*previous", ":previous", :previous',
    );
    expect(capture.facts.success_process_url).toBe('when %r{^(http|/)}');
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.uri_fetch_opts.gem).toBe("card-1.110.0");
    expect(capture.oracle.success_target_card.gem).toBe("card-1.110.0");
    expect(capture.oracle.new_cardtype.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.new_success.gem).toBe("card-mod-edit-0.20.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's new view posts the success mark the card itself", () => {
    expect(portEdit).toContain("export const newView: ViewFn = (ctx) => {");
    expect(portEdit).toContain(
      'hiddenFieldTag("success[mark]", newSuccessMark(ctx)),',
    );
    expect(portEdit).toContain('return rule.dbContent ?? "_self";');
    expect(portEdit).toContain('return "_self";');
  });

  it("the port's create form posts to the create route with the main success", () => {
    expect(portEdit).toContain('action: "/card/create",');
    expect(portEdit).toContain(
      '` data-main-success="{&quot;redirect&quot;:true}"`,',
    );
  });

  it("the port carries the typed shortcut", () => {
    expect(portWriteRoutes).toContain(
      'if (typed !== null) return { verb: "create", typeShortcut: markToName(typed[1]), json: false };',
    );
  });
});

describe("the harness's C1 leg cannot pass vacuously", () => {
  it("the harness records the row's check", () => {
    expect(harness).toContain(`record("${ROW_CHECK}",`);
  });

  it("the landing is part of the predicate", () => {
    expect(harness).toContain("const landing = landedOnNewCard({");
    expect(harness).toContain(
      "created1.writeStatus !== null && created1.writeStatus < 400 && created1.exists && landing.ok",
    );
  });

  it("the landing predicate reads the MAIN SLOT's own card id", () => {
    expect(landingPredicate).toContain(
      "landedOnCreatedCard:\n      mainCardId !== null && createdCardId !== null && mainCardId === createdCardId,",
    );
    expect(landingPredicate).toContain(
      "return { ok: legs.landedOnCardPath || legs.landedOnCreatedCard, legs };",
    );
  });

  it("the roster declares the row's check and nothing else", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "C1");
    expect(row).toBeDefined();
    expect(row.status).toBe("covered");
    expect(row.checks).toEqual([ROW_CHECK]);
  });

  it("the grader credits the row only when the check passes", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "C1");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: true }]).find(
        (c: { id: string }) => c.id === "C1",
      )?.status,
    ).toBe("covered");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: false }]).find(
        (c: { id: string }) => c.id === "C1",
      )?.status,
    ).not.toBe("covered");
    expect(
      verifiedCapabilities([row], []).find((c: { id: string }) => c.id === "C1")
        ?.status,
    ).not.toBe("covered");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("lands on the card the create made");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/new-card-landing.json",
        "utf8",
      ),
    ).toContain('"new_success"');
  });
});
