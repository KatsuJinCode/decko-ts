// The card-mod-api_key gem (card-mod-api_key-0.20.0), ported through the mod
// loader - the structure + every mod-specific view the headless render path
// can faithfully emit.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-api_key-0.20.0/):
//   set/right/api_key.rb          - the *api_key right set's events, methods,
//                                   and format-block views (:core/:current/
//                                   :token_link/:buttons/:generate_button +
//                                   json :token; titled/content/titled_content
//                                   pass-throughs)
//   set/right/api_key/core.haml   - :core HAML template (top + buttons)
//   set/right/api_key/current.haml- :current HAML template (readonly field)
//   set/right/account.rb          - the *account right set's :api_key view
//                                   (field_nest :api_key on the +*api_key child)
//   lib/card/auth/api_key.rb      - Card::Auth::ApiKey mixin
//                                   (signin_with_api_key, find_account_by_
//                                   api_key, api_keys, api_request?)
//   lib/card_controller/api_key.rb- CardController::ApiKey mixin
//                                   (X-API-Key header -> authenticators)
//   config/locales/en.yml         - 9 i18n strings (api_key_label,
//                                   api_key_generate, api_key_regenerate,
//                                   api_key_generating, api_key_get_jwt_token,
//                                   api_key_invalid, api_key_taken,
//                                   api_key_not_found, api_key_incorrect)
//   data/real.yml                 - *api_key cardtype (right-read/update/
//                                   delete restricted to *help_desk)
//
// Ported here as faithfully as a headless engine permits:
//   - set/right/api_key.rb's html views (:core, :current, :token_link,
//     :buttons, :generate_button) - the HTML body is reproduced from the
//     HAML templates; the :titled/:titled_content/:content pass-throughs
//     re-route to :core via super()-equivalent
//   - set/right/api_key.rb's json view (:token) - the JSON shape
//     `{token: <encoded>}` is preserved; the encoded value is a sentinel
//     because the JWT path (Card::Auth::Token.encode via the JWT gem)
//     needs a live Rails runtime
//   - set/right/account.rb's html view (:api_key) - nests the +*api_key
//     child card with view :core (field_nest :api_key)
//
// NOT ported here (honest remainder, see docs/mod-loader-port-notes.md):
//   - lib/card/auth/api_key.rb + lib/card_controller/api_key.rb: the
//     Card::Auth::ApiKey mixin and the CardController::ApiKey mixin. The
//     lib/ files add methods to Card::Auth and CardController (NOT set
//     modules); the mod loader's manifest surface only carries set/
//     files, so lib/ methods do not have a registration slot here. They
//     also depend on the `jwt` gem, Card::Auth::Token, and the live
//     request/header surface - none of which is ported
//   - event :generate_api_key + event :validate_api_key + the
//     authenticate_api_key / generate / generate! / simple_token /
//     api_key_taken? / api_key_validation_error / history? / ok_to_read? /
//     ok_to_create? methods: these are persistence + auth semantics that
//     ride the save/validate/event cycle (prepare_to_validate, :validate
//     on :save, :changed => :content, the Card::Auth.find_account_by_*
//     lookup, the SecureRandom.base64 key generation, Card::Auth::Token.
//     encode). The TS port has no save/validate/event surface today
//   - the include_set Abstract::AccountField directive: that set is
//     card-mod-account's surface; the api_key set inherits its methods
//     (history?, ok_to_read?, ok_to_create?). Those methods rely on
//     Auth.current_account - not ported
//   - config/locales/en.yml: the 9 i18n strings are inlined below into
//     the LOCALE constant; there is no i18n surface in TS
//   - data/real.yml: the *api_key cardtype's read/update/delete rule
//     (*help_desk-only) is a permissions-set file outside the mod
//     loader's surface; the TS port's deck schema already declares
//     *api_key
//   - perms: :update gate on :buttons/:generate_button: the perms
//     config IS registered (the mod-loader view-config table records
//     it); the perms gate itself (view/permission.rb#task_allowed?) is
//     not exercised in the headless render path

import type { ViewContext, ViewFn } from "../../render/format.js";
import type { DeckoModManifest } from "../mod-manifest.js";
import { superView } from "../mod-view-helpers.js";

// ---------------------------------------------------------------------------
// The mod's config/locales/en.yml strings, inlined (no i18n surface in TS).
// ---------------------------------------------------------------------------

/** en.yml:2-10 - every string the api_key gem's set files reference via
 *  t(:api_key_*) (api_key.rb:34, 38, 78, 90, 91, 101). The other 3
 *  strings (api_key_invalid, api_key_taken, api_key_not_found,
 *  api_key_incorrect) are consumed by the unported validate_api_key event
 *  (set/right/api_key.rb:8-11) and the unported authenticate_api_key
 *  method (set/right/api_key.rb:33-38); they're listed for completeness
 *  but not referenced from any view body. */
const LOCALE = {
  api_key_label: "API Key",
  api_key_generate: "Generate API Key",
  api_key_regenerate: "Regenerate API Key",
  api_key_generating: "Generating API Key",
  api_key_get_jwt_token: "get a JWT token",
  // validate_api_key event strings (api_key.rb:9-10):
  api_key_invalid:
    "Invalid API Key; must contain 20+ alphanumeric characters only",
  api_key_taken: "API Key taken",
  // authenticate_api_key method strings (api_key.rb:56-59):
  api_key_not_found: "no API key found",
  api_key_incorrect: "API key mismatch",
} as const;

/** api_key.rb:4-6 event :generate_api_key, :prepare_to_validate,
 *  trigger: :required - the sub-card trigger input on the form. The TS
 *  port has no event system; the trigger name is preserved in the form's
 *  hidden input name so an upstream event handler keys on the same string. */
const GENERATE_API_KEY_TRIGGER = "generate_api_key";

// ---------------------------------------------------------------------------
// set/right/api_key.rb - the methods on the *api_key right set
// ---------------------------------------------------------------------------

/** api_key.rb:108-110 `def input_type; :text_field; end`. The right-set
 *  override of card-mod-format set/all/inputs.rb's input_type - the input
 *  type the form renders for the api_key value. */
function inputType(): "text_field" {
  return "text_field";
}

/** api_key.rb:112-114 `def core_top_view; :current; end`. The HAML
 *  template (core.haml) renders `core_top_view` (the api_key-specific
 *  override is :current). */
function coreTopView(): "current" {
  return "current";
}

/** api_key.rb:96-98 `def generate_button_hidden_tags; {card: {trigger:
 *  :generate_api_key}}; end`. Rails' nested-param convention produces
 *  `name="card[trigger]"`. */
function generateButtonHiddenTags(): string {
  return `<input type="hidden" name="card[trigger]" value="${GENERATE_API_KEY_TRIGGER}" />`;
}

/** api_key.rb:100-102 `def generate_button_text; card.content.present? ?
 *  t(:api_key_regenerate) : t(:api_key_generate); end`. The blank content
 *  branch is the "no key yet" path (an api_key card right after create). */
function generateButtonText(content: string): string {
  return content.length > 0 ? LOCALE.api_key_regenerate : LOCALE.api_key_generate;
}

/** api_key.rb:104-106 `def generate_button_situation; :primary; end`. The
 *  Bootstrap `btn-primary` class on the submit button. */
function generateButtonSituation(): "primary" {
  return "primary";
}

/** The form's POST action: the card-mod-format path helper renders
 *  `card_path(card, format: :html, view: :edit)` - the api_key card's URL
 *  with the edit view. The TS port has no path helper; the byte shape is
 *  `/<card_key>?view=edit`. */
function cardEditPath(cardName: string): string {
  const key = cardName.replace(/\s+/g, "_").toLowerCase();
  return `/${key}?view=edit`;
}

/** The token endpoint URL: `card_path(card, format: :json, view: :token)`
 *  - the same card URL with json + token. */
function cardTokenPath(cardName: string): string {
  const key = cardName.replace(/\s+/g, "_").toLowerCase();
  return `/${key}.json?view=token`;
}

// ---------------------------------------------------------------------------
// set/right/api_key.rb - format :html views
// ---------------------------------------------------------------------------

/** api_key.rb:70-71 `view :core, unknown: true, template: :haml`. The
 *  HAML template (core.haml):
 *
 *    .api-key-core.p-1
 *      .api-key-top.d-flex.my-2.py-3.border-bottom.justify-content-between.w-100
 *        - if card.content.present?
 *          = render core_top_view        # = :current
 *      .api-key-buttons.d-flex.my-2.py-3.justify-content-between.w-100
 *        = render_buttons                # = :buttons
 *
 *  The top section is conditional on card.content (api_key.rb:113 - the
 *  `if card.content.present?` guard before `render core_top_view`). The
 *  buttons section renders unconditionally (the generate button is shown
 *  even when no key exists yet - that's the "Generate API Key" branch). */
const coreView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  let top = "";
  if (card.dbContent.length > 0) {
    top = `<div class="api-key-top d-flex my-2 py-3 border-bottom justify-content-between w-100">${ctx.fmt.renderView(coreTopView())}</div>`;
  }
  const buttons = `<div class="api-key-buttons d-flex my-2 py-3 justify-content-between w-100">${ctx.fmt.renderView("buttons")}</div>`;
  return `<div class="api-key-core p-1">${top}${buttons}</div>`;
};

/** api_key.rb:72 `view :current, unknown: true, template: :haml`. The
 *  HAML template (current.haml):
 *
 *    .current-api-key.nodblclick
 *      %label{ for: :current_api_key }
 *        = t :api_key_label
 *      = text_field_tag :current_api_key, card.content, readonly: true
 *
 *  Rails text_field_tag with readonly: true emits an <input type="text"
 *  readonly="readonly" />. The TS port emits the same shape. */
const currentView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  const value = card.dbContent;
  return (
    `<div class="current-api-key nodblclick">` +
    `<label for="current_api_key">${LOCALE.api_key_label}</label>` +
    `<input type="text" id="current_api_key" name="current_api_key" value="${value}" readonly="readonly" />` +
    `</div>`
  );
};

/** api_key.rb:73-75 `view :titled, :titled_content, :content, unknown:
 *  true { super() }`. The `super()` call delegates to the parent class's
 *  same view - in TS terms, walking the per-card MRO chain for the SAME
 *  view name (set/format.rb:146-150 + view_definition.rb:18-21) and
 *  rendering the next entry's view fn. The api_key set is the
 *  most-specific contribution for these views; the chain contains it
 *  followed by the parent's same view (All::* or Right::* depending on
 *  what other mods loaded). When no further entry exists in the chain
 *  superView returns "" (the same way Ruby's super() past the base
 *  raises NoMethodError - the headless port returns "" so callers don't
 *  crash during composition; mod-view-helpers.ts:74-79 documents the
 *  fallback). */
const titledView: ViewFn = (ctx) => superView(ctx, "Right::ApiKey", ctx.voo.requestedView);
const titledContentView: ViewFn = (ctx) => superView(ctx, "Right::ApiKey", ctx.voo.requestedView);
const contentView: ViewFn = (ctx) => superView(ctx, "Right::ApiKey", ctx.voo.requestedView);

/** api_key.rb:77-79 `view :token_link do link_to t(:api_key_get_jwt_token),
 *  path: {format: :json, view: :token} end`. The link href is the
 *  api_key card's URL with format: :json + view: :token. */
const tokenLinkView: ViewFn = (ctx) => {
  const href = cardTokenPath(ctx.fmt.card.name.s);
  return `<a href="${href}">${LOCALE.api_key_get_jwt_token}</a>`;
};

/** api_key.rb:81-83 `view :buttons, perms: :update, unknown: true do
 *  render_generate_button end`. The :generate_button view does the work
 *  - :buttons is just the unknown: true + perms: :update entry point. */
const buttonsView: ViewFn = (ctx) => ctx.fmt.renderView("generate_button");

/** api_key.rb:85-94 `view :generate_button, perms: :update, unknown: true
 *  do card_form :update do [hidden_tags(...), submit_button(text: ...,
 *  situation: :primary, disable_with: ...)] end end`. The TS port emits
 *  the same form structure: a POST form with the hidden trigger input
 *  and a primary-class submit button. The Rails `card_form :update`
 *  helper emits <form action="..." method="post" class="card-form
 *  update-form"> with a hidden CSRF token (Rails' protect_from_forgery
 *  default) - the CSRF token is omitted here because the headless render
 *  path does not model sessions, and the structural tests assert the
 *  trigger + button bytes (the same way the HAML template the mod
 *  replaces asserted them). */
const generateButtonView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  const text = generateButtonText(card.dbContent);
  const action = cardEditPath(card.name.s);
  const hidden = generateButtonHiddenTags();
  const buttonClass = `btn btn-${generateButtonSituation()}`;
  const submit = `<button type="submit" class="${buttonClass}" data-disable-with="${LOCALE.api_key_generating}">${text}</button>`;
  return `<form action="${action}" method="post" class="card-form update-form">${hidden}${submit}</form>`;
};

// ---------------------------------------------------------------------------
// set/right/api_key.rb - format :json views
// ---------------------------------------------------------------------------

/** api_key.rb:63-67 `format :json; view :token do {token: card.simple_token}
 *  end`. card.simple_token is `Card::Auth::Token.encode(accounted.id)`
 *  (api_key.rb:48-50) - a JWT encoding that requires the `jwt` gem and
 *  Card::Auth::Token. The TS port has no JWT surface; the JSON shape
 *  `{token: <encoded>}` is preserved with a sentinel so a JSON-shape test
 *  pins the format while an implementation note points at the runtime
 *  dependency. */
const tokenJsonView: ViewFn = (ctx) => {
  const token = "<jwt-token-pending-runtime>";
  return `{"token":${JSON.stringify(token)}}`;
};

// ---------------------------------------------------------------------------
// set/right/account.rb - the *account right set's :api_key view
// ---------------------------------------------------------------------------

/** account.rb:1-9 `card_accessor :api_key; delegate :authenticate_api_key,
 *  to: :api_key_card; format :html do view :api_key do field_nest :api_key
 *  end end`. card_accessor :api_key adds a method that returns the
 *  +*api_key child card of an account. field_nest nests that child with
 *  view :core. The TS port nests `<account>+*api key` (the child card
 *  composed from the account + the *api_key right). */
const apiKeyView: ViewFn = (ctx) => {
  const childName = `${ctx.fmt.card.name.s}+*api key`;
  return ctx.fmt.nest({
    syntax: `{{${childName}|core}}`,
    name: childName,
    options: { view: "core", extra: {} },
    comment: undefined,
  });
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModApiKey: DeckoModManifest = {
  name: "api_key",
  gemName: "card-mod-api_key",
  group: "gem",
  setModules: [
    {
      // card-mod-api_key-0.20.0/set/right/api_key.rb
      setPath: "right/api_key",
      formats: {
        html: {
          views: [
            // api_key.rb:70-71 view :core, unknown: true, template: :haml
            { view: "core", viewFn: coreView, config: { unknown: true } },
            // api_key.rb:72 view :current, unknown: true, template: :haml
            { view: "current", viewFn: currentView, config: { unknown: true } },
            // api_key.rb:73-75 view :titled, :titled_content, :content, unknown: true
            { view: "titled", viewFn: titledView, config: { unknown: true } },
            { view: "titled_content", viewFn: titledContentView, config: { unknown: true } },
            { view: "content", viewFn: contentView, config: { unknown: true } },
            // api_key.rb:77-79 view :token_link
            { view: "token_link", viewFn: tokenLinkView },
            // api_key.rb:81-83 view :buttons, perms: :update, unknown: true
            { view: "buttons", viewFn: buttonsView, config: { unknown: true, perms: "update" } },
            // api_key.rb:85-94 view :generate_button, perms: :update, unknown: true
            {
              view: "generate_button",
              viewFn: generateButtonView,
              config: { unknown: true, perms: "update" },
            },
          ],
        },
        json: {
          views: [
            // api_key.rb:63-67 format :json view :token
            { view: "token", viewFn: tokenJsonView },
          ],
        },
      },
    },
    {
      // card-mod-api_key-0.20.0/set/right/account.rb
      setPath: "right/account",
      formats: {
        html: {
          views: [
            // account.rb:5-9 view :api_key: `field_nest :api_key`
            { view: "api_key", viewFn: apiKeyView },
          ],
        },
      },
    },
  ],
};

export default cardModApiKey;