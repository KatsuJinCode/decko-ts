// The form-stage hooks (card-mod-recaptcha-0.20.0 set/all/recaptcha.rb
// format :html, 74-104) - the captcha-remainders lane's server-side port.
// Ruby reaches two overrides from EVERY card_form through the format's
// module chain once the mod is loaded:
//
//   def hidden_form_tags action, opts      # :89-93
//     return super unless recaptcha?(opts) # :101-103 recaptcha?
//     super + recaptcha_token(action)      # :75-83 the widget bytes
//   end
//
//   def card_form_html_opts action, opts={} # :95-99
//     super
//     opts["data-recaptcha"] ||= "on" if recaptcha?(opts)
//     opts
//   end
//
// The port's seam: the composites below (recaptchaFormOn /
// recaptchaFormHtmlAttrs / recaptchaHiddenFormTags) compose per form, and
// the card_form substrate (mod-form-substrate.ts cardFormShell - the ported
// card_form, form.rb:193-240) emits the token bytes at Ruby's
// `hidden + output(yield(cform))` position (form.rb:195) via
// CardFormShellOpts.recaptchaTokenHtml. The browser recaptcha.js.coffee
// stays OUT of scope (the standing P6 decision gate) - these are the
// SERVER-side bytes only.

import { describe, expect, it } from "vitest";
import type { ViewContext } from "../../../src/card/render/format.js";
import {
  recaptchaFormOn,
  recaptchaFormHtmlAttrs,
  recaptchaHiddenFormTags,
  recaptchaTokenHtml,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";

async function substrate() {
  return await import("../../../src/card/mod-loader/mod-form-substrate.js");
}

const fakeCtx = {
  fmt: {
    card: { id: undefined, name: { s: "Sign up" } },
    urlKey: () => "Sign_up",
  },
} as unknown as ViewContext;

/** The guard-on recaptcha_on? inputs (recaptcha.rb:16-23, the anonymous
 *  signup shape): keys set, controller live, anonymous, no bypass, set-up
 *  deck, rule '1'. */
const guardOn = {
  siteKey: "site-key-from-config",
  secretKey: "secret-key-from-config",
  envController: true,
  signedIn: false,
  alwaysOk: false,
  needsSetup: false,
  captchaRuleContent: "1",
};

describe("recaptchaFormOn - the recaptcha? gate (recaptcha.rb:101-103)", () => {
  it("guard-on inputs with no recaptcha opt are ON", () => {
    expect(recaptchaFormOn(guardOn, undefined)).toBe(true);
  });

  it("opts[:recaptcha] == :off suppresses the hook even with the guard on (the signin form's opt, card-mod-account set/self/signin.rb:121)", () => {
    expect(recaptchaFormOn(guardOn, "off")).toBe(false);
  });

  it("a signed-in session is OFF before the opt is consulted (recaptcha.rb:20 !Auth.signed_in?)", () => {
    expect(recaptchaFormOn({ ...guardOn, signedIn: true }, undefined)).toBe(false);
  });

  it("a rule content of 'yes' is OFF (Card::Rule.toggle, rule.rb:11-13 - strip == '1')", () => {
    expect(recaptchaFormOn({ ...guardOn, captchaRuleContent: "yes" }, undefined)).toBe(false);
  });
});

describe("recaptchaFormHtmlAttrs - the card_form_html_opts override (recaptcha.rb:95-99)", () => {
  it("appends data-recaptcha=on AFTER the base + caller attrs (the ||= lands last in the html hash)", () => {
    const attrs = recaptchaFormHtmlAttrs(
      [
        ["class", "card-form slotter autosave"],
        ["data-slot-selector", "modal-origin"],
      ],
      true,
    );
    expect(attrs).toEqual([
      ["class", "card-form slotter autosave"],
      ["data-slot-selector", "modal-origin"],
      ["data-recaptcha", "on"],
    ]);
  });

  it("||= is first-write-wins: an existing data-recaptcha stands (recaptcha.rb:97)", () => {
    const attrs = recaptchaFormHtmlAttrs(
      [
        ["class", "card-form"],
        ["data-recaptcha", "off"],
      ],
      true,
    );
    expect(attrs).toEqual([
      ["class", "card-form"],
      ["data-recaptcha", "off"],
    ]);
  });

  it("a false gate returns the caller's attrs unchanged (the `if recaptcha?(opts)` arm)", () => {
    const attrs: ReadonlyArray<readonly [string, string]> = [["class", "card-form"]];
    expect(recaptchaFormHtmlAttrs(attrs, false)).toEqual([["class", "card-form"]]);
  });
});

describe("recaptchaHiddenFormTags - the hidden_form_tags override (recaptcha.rb:89-93)", () => {
  const SUPER = `<input type="hidden" name="success[view]" id="success_view" value="home" autocomplete="off" />`;

  it("a false gate returns super VERBATIM (the `return super` arm, :90)", () => {
    expect(recaptchaHiddenFormTags(SUPER, false, "update", "site-key")).toBe(SUPER);
  });

  it("a true gate appends the token bytes after super (super + recaptcha_token(action), :92)", () => {
    const tags = recaptchaHiddenFormTags(SUPER, true, "update", "KEY-123");
    expect(tags).toBe(SUPER + recaptchaTokenHtml("update", "KEY-123"));
    expect(tags).toContain(`data-action="update"`);
    expect(tags).toContain(`data-site-key="KEY-123"`);
  });
});

describe("the card_form substrate seam - CardFormShellOpts.recaptchaTokenHtml", () => {
  it("ABSENT: the shell is byte-identical to the pre-seam shape (form.rb:202-205 super only)", async () => {
    const { cardFormShell } = await substrate();
    const form = cardFormShell(fakeCtx, {
      formClass: "card-form slotter autosave",
      id: "edit_card_50",
      htmlAttrs: [["data-slot-selector", "modal-origin"]],
      action: "/update/Pudding",
      methodSpoof: "patch",
      success: undefined,
      body: "<BODY>",
    });
    expect(form).toBe(
      `<form class="card-form slotter autosave" id="edit_card_50" data-slot-selector="modal-origin"` +
      ` action="/update/Pudding" accept-charset="UTF-8" data-remote="true" method="post">` +
      `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
      `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
      `<BODY>` +
      `</form>`,
    );
  });

  it("PRESENT: the token bytes sit between the success tags and the body (form.rb:195 hidden + output(yield))", async () => {
    const { cardFormShell } = await substrate();
    const form = cardFormShell(fakeCtx, {
      formClass: "card-form slotter",
      id: "new_card",
      htmlAttrs: [],
      action: "/card/create",
      methodSpoof: null,
      success: { view: "home" },
      recaptchaTokenHtml: recaptchaTokenHtml("create", "KEY-123"),
      body: "<BODY>",
    });
    const successTags =
      `<input type="hidden" name="success[view]" id="success_view" value="home" autocomplete="off" />`;
    expect(form).toBe(
      `<form class="card-form slotter" id="new_card" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">` +
      `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
      successTags +
      recaptchaTokenHtml("create", "KEY-123") +
      `<BODY>` +
      `</form>`,
    );
  });

  it("the whole composition - gate on: data-recaptcha rides the attrs, the token rides the shell (the decorated card_form)", async () => {
    const { cardFormShell } = await substrate();
    // the consumer-side composition Ruby's format chain performs per form:
    // the class rides formClass (the base card_form_html_opts's add_class,
    // form.rb:218); the caller attrs are the extras beyond it.
    const gate = recaptchaFormOn(guardOn, undefined); // recaptcha? :101-103
    const htmlAttrs = recaptchaFormHtmlAttrs(
      [["data-slot-selector", "modal-origin"]],
      gate,
    ); // card_form_html_opts :95-99
    const form = cardFormShell(fakeCtx, {
      formClass: "card-form slotter autosave",
      id: "edit_card_50",
      htmlAttrs,
      action: "/update/Home",
      methodSpoof: "patch",
      success: undefined,
      recaptchaTokenHtml: recaptchaHiddenFormTags("", gate, "update", guardOn.siteKey),
      body: "<BODY>",
    });
    expect(form).toBe(
      `<form class="card-form slotter autosave" id="edit_card_50" data-slot-selector="modal-origin" data-recaptcha="on"` +
      ` action="/update/Home" accept-charset="UTF-8" data-remote="true" method="post">` +
      `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
      `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
      recaptchaTokenHtml("update", "site-key-from-config") +
      `<BODY>` +
      `</form>`,
    );
  });

  it("the whole composition - gate off (recaptcha: :off): byte-identical to the undecorated form", async () => {
    const { cardFormShell } = await substrate();
    const gate = recaptchaFormOn(guardOn, "off"); // the signin opt shape
    const htmlAttrs = recaptchaFormHtmlAttrs([["data-slot-selector", "modal-origin"]], gate);
    const tokenHtml = recaptchaHiddenFormTags("", gate, "update", guardOn.siteKey);
    expect(htmlAttrs).toEqual([["data-slot-selector", "modal-origin"]]);
    expect(tokenHtml).toBe("");
    const form = cardFormShell(fakeCtx, {
      formClass: "card-form slotter autosave",
      id: "edit_card_50",
      htmlAttrs,
      action: "/update/Home",
      methodSpoof: "patch",
      success: undefined,
      recaptchaTokenHtml: tokenHtml,
      body: "<BODY>",
    });
    expect(form).not.toContain("data-recaptcha");
    expect(form).not.toContain("recaptcha_token");
  });
});
