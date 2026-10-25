// The SIGNED-OUT SIGN-IN PAGE'S TWO LINKS pin (registry row cap-S4,
// "Sign-in link to sign up, and link to reset password").
//
// ORACLE-PINNED: fixtures/captured/signin-page-links.json, captured from the
// pinned gemset (card-mod-account-0.20.0 and card-mod-format-0.20.0) by
// tests/card/mod-loader/oracle-capture-signin-page-links.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/self/signin.rb - THE TWO LINKS:
//      `signup_link` is `link_to_card :signup, t(:account_or_sign_up), path:
//      { action: :new, mark: :signup }` and `reset_password_link` is
//      `link_to_view :edit, t(:account_reset_password), path: { slot: { hide:
//      :board_link } }`; `signin_button` is the third control in the block.
//   2. card-mod-account-0.20.0 set/self/signin/core.haml - THE BLOCK: the
//      `.form-group.signin-buttons` division holds `.reset-password-link`,
//      `.signin-button` and `.signup-button`, in that order.
//   3. card-mod-account-0.20.0 config/locales/en.yml - THE THREE TEXTS:
//      account_or_sign_up is "...or sign up!", account_reset_password is
//      "Reset password" and account_sign_in is "Sign in".
//   4. card-mod-format-0.20.0 set/all/links.rb - THE ANCHOR SHAPES: the path
//      goes into the href, a card link carries the known/wanted class, and a
//      view link is a remote nofollow slotter.
//   5. card-mod-format-0.20.0 lib/card/path.rb - THE TWO DESTINATIONS:
//      "new/<mark>" for the sign-up card and "<mark>/<view>" for the reset
//      view.
//   6. card-mod-format-0.20.0 lib/card/path/cast_params.rb - THE SLOT HIDE
//      SERIALIZATION: a scalar slot hide is wrapped by `Array.wrap`, which is
//      why the key carries the `[]` suffix.
//
// The port side is the sign-in form's own emitter
// (src/card/render/signin-core-form-view.ts).
//
// The instrument is the harness's own signed-out check, and its predicate
// (tools/edge-signed-in-exercise/lib/signin-page-links.mjs) reads each link
// by TEXT and DESTINATION together, so the page's ordinary "Sign in" nav
// link can never stand in for the reset link. That is the defect the row's
// recorded finding named.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/signin-page-links.json", import.meta.url),
    "utf8",
  ),
);
const portForm = readFileSync(
  new URL("./../../../src/card/render/signin-core-form-view.ts", import.meta.url),
  "utf8",
);
const predicate = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/signin-page-links.mjs",
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

const ROW_CHECK =
  "the signed-out sign-in page links to sign up and to reset the password";

describe("the pinned Ruby's own bytes for the sign-in page's two links", () => {
  it("the sign-up link asks for the sign-up card's new-card path", () => {
    expect(capture.facts.signup_link_method).toBe("def signup_link");
    expect(capture.facts.signup_link_call).toBe(
      "link_to_card :signup, t(:account_or_sign_up),",
    );
    expect(capture.facts.signup_link_path).toBe(
      "path: { action: :new, mark: :signup }",
    );
  });

  it("the reset link asks for the edit view with the board link hidden", () => {
    expect(capture.facts.reset_password_link_method).toBe(
      "def reset_password_link",
    );
    expect(capture.facts.reset_password_link_call).toBe(
      "link_to_view :edit, t(:account_reset_password),",
    );
    expect(capture.facts.reset_password_link_path).toBe(
      "path: { slot: { hide: :board_link } }",
    );
  });

  it("the block holds the three controls in Ruby's own order", () => {
    expect(capture.facts.core_haml_buttons).toBe(".form-group.signin-buttons");
    expect(capture.facts.core_haml_reset_link).toBe(".reset-password-link");
    expect(capture.facts.core_haml_signin_button).toBe(".signin-button");
    expect(capture.facts.core_haml_signup_link).toBe(".signup-button");
    expect(capture.facts.signin_button_call).toBe(
      'button_tag t(:account_sign_in), situation: "primary"',
    );
  });

  it("the three texts are Ruby's own", () => {
    expect(capture.facts.or_sign_up_text).toBe("...or sign up!");
    expect(capture.facts.reset_password_text).toBe("Reset password");
    expect(capture.facts.sign_in_text).toBe("Sign in");
  });

  it("the anchors carry the shapes the predicate reads", () => {
    expect(capture.facts.link_to_href).toBe(
      "opts[:href] ||= path opts.delete(:path)",
    );
    expect(capture.facts.link_to_card_class).toBe(
      'add_class opts, (known ? "known-card" : "wanted-card")',
    );
    expect(capture.facts.link_to_view_remote).toBe(
      'opts.reverse_merge! remote: true, rel: "nofollow"',
    );
    expect(capture.facts.link_to_view_class).toBe(
      'add_class opts, "slotter"',
    );
  });

  it("the destinations are derived, not literals", () => {
    expect(capture.facts.new_cardtype_path).toBe(
      '"#{action}/#{mark}#{query}"',
    );
    expect(capture.facts.path_base_mark_view).toBe('"#{mark}/#{view}"');
    expect(capture.facts.cast_value_as_array).toBe("Array.wrap value");
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.signup_link.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.core_haml.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.link_to.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.new_cardtype.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.cast_path_value_as_array.gem).toBe(
      "card-mod-format-0.20.0",
    );
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port renders the same three texts", () => {
    expect(portForm).toContain('account_or_sign_up: "...or sign up!",');
    expect(portForm).toContain('account_reset_password: "Reset password",');
    expect(portForm).toContain('account_sign_in: "Sign in",');
  });

  it("the port's sign-up link is the new-card path with the known/wanted class", () => {
    expect(portForm).toContain(
      'const cls = known ? "known-card" : "wanted-card";',
    );
    expect(portForm).toContain(
      "return linkTo(SIGNIN_FORM_LOCALE.account_or_sign_up, cardPath(`new/${markUrlKey}`), {",
    );
  });

  it("the port's reset link is the remote nofollow slotter with the slot hide", () => {
    expect(portForm).toContain(
      "const href = cardPath(`${ctx.fmt.urlKey()}/edit?slot%5Bhide%5D%5B%5D=board_link`);",
    );
    expect(portForm).toContain(
      '`<a rel="nofollow" class="slotter" href="${href}" data-remote="true">` +',
    );
  });

  it("the port renders the block in Ruby's own order", () => {
    expect(portForm).toContain("`<div class='form-group signin-buttons'>\\n` +");
    expect(portForm).toContain("`<div class='reset-password-link'>\\n` +");
    expect(portForm).toContain("`<div class='signin-button'>\\n` +");
    expect(portForm).toContain("`<div class='signup-button'>\\n` +");
  });
});

describe("the harness's S4 leg cannot pass vacuously", () => {
  it("the harness records the row's check", () => {
    expect(harness).toContain(`record("${ROW_CHECK}", linksPresent, links);`);
  });

  it("the predicate reads each link by TEXT and DESTINATION together", () => {
    expect(predicate).toContain(
      "const signup =\n    page.find((a) => /or sign up!/i.test(a.text) && SIGNUP_HREF.test(a.href))?.href ?? null;",
    );
    expect(predicate).toContain(
      "const reset =\n    page.find((a) => /reset password/i.test(a.text) && RESET_HREF.test(a.href))?.href ?? null;",
    );
  });

  it("the reset destination is the shape Ruby's own path derives", () => {
    expect(predicate).toContain(
      "const RESET_HREF = /^\\/[^/?#]+\\/edit\\?slot%5Bhide%5D%5B%5D=board_link(?:&|$)/;",
    );
    expect(predicate).toContain("const SIGNUP_HREF = /^\\/new\\/[^/?#]+$/;");
  });

  it("the roster declares the row's check and nothing else", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S4");
    expect(row).toBeDefined();
    expect(row.status).toBe("covered");
    expect(row.checks).toEqual([ROW_CHECK]);
  });

  it("the grader credits the row only when the check passes", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S4");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: true }]).find(
        (c: { id: string }) => c.id === "S4",
      )?.status,
    ).toBe("covered");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: false }]).find(
        (c: { id: string }) => c.id === "S4",
      )?.status,
    ).not.toBe("covered");
    expect(
      verifiedCapabilities([row], []).find((c: { id: string }) => c.id === "S4")
        ?.status,
    ).not.toBe("covered");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("sign up");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/signin-page-links.json",
        "utf8",
      ),
    ).toContain('"reset_password_link_path"');
  });
});
