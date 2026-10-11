// card-mod-format set/all/demo.rb :demo, homed in the render layer so both
// the flat view registry (render/views.ts, the loader-less page surface) and the
// card-mod-format set/all registration dispatch the same body.
import type { ViewContext, ViewFn } from "./format.js";
import { h } from "./slot-html.js";
import { modSlotWrap } from "../mod-loader/mod-view-helpers.js";
import { cardFormShell } from "../mod-loader/mod-form-substrate.js";
import { allAdminConfigCodenamesOfCategory } from "../mod-loader/mods/core-mod.js";
import { recaptchaSiteKey } from "./deployment-follow-live-config.js";

/** The capture-era recaptcha site key (public: it ships in served HTML; the
 *  comment box in views.ts carries the same value). */
const CAPTURE_RECAPTCHA_SITE_KEY = "6LSYNTHETICCAPTUREKEY000000000000000000B";

/** set/all/demo.rb:23-25 demo_view - `Env.params[:demo_view] || :core`.
 *  The headless render has no Env.params surface (flashView's disclosed
 *  basis - the same request-bag absence), so the body computes :core for
 *  every engine render. */
const DEMO_VIEW_DEFAULT = "core";

/** set/all/demo.rb:31-35 view_select - `card_form :get, success:
 *  { view: :demo } do select_tag :demo_view, options_for_select(
 *  all_views_from_admin_config, demo_view), class: "_submit-on-select"
 *  end`. Corpus-pinned by Shark's getting-started page, which nests
 *  `{{:getting_started|demo}}`:
 *  - the form class is "card-form slotter" (form.rb card_form_html_opts:
 *    add_class appends "card-form", then "slotter");
 *  - the action is the bare mark: Card::Path prefixes only create, update
 *    and delete (card-mod-format lib/card/path.rb base), so :get adds none;
 *  - the persisted record's form_for emits the patch spoof;
 *  - for the anonymous reader card-mod-recaptcha's overrides add
 *    data-recaptcha="on" after the id and append recaptcha_token(:get) to
 *    the hidden tags, the script and the token input joined by output's
 *    newline. As with the comment box's capture-pinned form, the engine
 *    renders for the anonymous reader, and the key is the deployment's
 *    (capture-era fallback);
 *  - options_for_select marks the selected option in place and joins the
 *    options with a newline;
 *  - select_tag's class is the caller's verbatim "_submit-on-select". */
export const demoViewSelect = (ctx: ViewContext): string => {
  const { fmt } = ctx;
  const codenames = allAdminConfigCodenamesOfCategory(ctx, "views");
  const options = codenames
    .map(
      (c) =>
        `<option${c === DEMO_VIEW_DEFAULT ? ` selected="selected"` : ""} value="${h(c)}">${h(c)}</option>`,
    )
    .join("\n");
  const select = `<select name="demo_view" id="demo_view" class="_submit-on-select">${options}</select>`;
  const siteKey = recaptchaSiteKey() ?? CAPTURE_RECAPTCHA_SITE_KEY;
  // card-mod-recaptcha set/all/recaptcha.rb recaptcha_on? (:16-23):
  // `!Auth.signed_in?` — the wrap (data-recaptcha="on" in the form opts,
  // recaptcha_token(:get) in the hidden tags) renders only for a signed-out
  // session. The anonymous arm stays the capture's byte-for-byte; the
  // signed-in arm is the recaptcha_on? false path the Shark page pins for
  // the signed-in grades (no attribute, no script, no token input — the
  // same gate the comment box's wrap already applies).
  const signedIn =
    ctx.fmt.engine?.viewer?.signedIn === true || ctx.fmt.engine?.pageSession?.signedIn === true;
  const recaptchaAttrs: Array<[string, string]> = signedIn ? [] : [["data-recaptcha", "on"]];
  const recaptchaToken = signedIn
    ? ""
    : `<script src="https://www.google.com/recaptcha/api.js?render=${siteKey}"></script>\n` +
      `<input type="hidden" name="recaptcha_token" id="recaptcha_token" value=""` +
      ` data-site-key="${siteKey}" data-action="get" class="_recaptcha-token" autocomplete="off" />`;
  return cardFormShell(ctx, {
    formClass: "card-form slotter",
    id: `edit_card_${fmt.card.id}`,
    htmlAttrs: recaptchaAttrs,
    action: `/${fmt.urlKey()}`,
    methodSpoof: "patch",
    success: { view: "demo" },
    recaptchaTokenHtml: recaptchaToken,
    body: select,
  });
};

/** set/all/demo.rb:2-7 view :demo:
 *    frame do
 *      [view_select, wrap_with(:div, view_demo, class: "demo-slot")]
 *    end
 *  The frame is `frame` (html/frame.rb:9-11) -> the BOOTSTRAP override
 *  (wrapper.rb:2-7: d0-card-header card-header + d0-card-body card-body
 *  card-text class_ups) -> standard_frame (d0-card-frame card) ->
 *  with_frame - the established framedView composition. The body array
 *  joins with output()'s "\n" (content.rb:70-72). view_demo (:25-29) is
 *  wrap(true) { render demo_view } - a SECOND full slot wrap around the
 *  rendered view (both layers carry the :demo view identity; Ruby emits
 *  the duplicate id exactly so). demo_view is :core (the params absence
 *  above). */
export const demoView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  voo.classUp("d0-card-header", "card-header"); // wrapper.rb:3
  voo.classUp("d0-card-body", "card-body card-text"); // wrapper.rb:4
  voo.classUp("d0-card-frame", "card"); // wrapper.rb:12 (panel_state nil)
  voo.hide("help"); // with_frame, frame.rb:20
  fmt.addNameContext(); // frame.rb:21
  const header =
    `<div class="${voo.classy("d0-card-header")}">` +
    `<h2 class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</h2>\n` +
    `${fmt.renderView("menu")}</div>`;
  // demo.rb:25-29 view_demo's wrap(true) slot layer
  const demoInner = modSlotWrap(ctx, "demo", fmt.renderView(DEMO_VIEW_DEFAULT));
  const demoDiv = `<div class="demo-slot">${demoInner}</div>`; // wrap_with(:div, ..., class: "demo-slot")
  const body = `${demoViewSelect(ctx)}\n${demoDiv}`; // output([view_select, demo_div])
  const panel =
    `<div class="${voo.classy("d0-card-frame")}">` +
    `${header}\n\n` +
    `<div class="${voo.classy("d0-card-body")}">${body}</div></div>`;
  return modSlotWrap(ctx, "demo", panel);
};
