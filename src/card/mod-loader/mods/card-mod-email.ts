// The card-mod-email gem (card-mod-email-0.20.0), ported through the mod
// loader - the mod that adds email-template cardtypes, the email_text /
// email_html format families, the *to/*from/*cc/*bcc/*subject/*attach/
// *text_message/*html_message right-side settings, and the email-document
// wrapper that turns an html render into a multipart email body.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-email-0.20.0/): 14 set rb files across abstract/all/right/type
// patterns, 1 HAML template (right/html_message/content_with_link.haml),
// and 2 lib files (the email_text/email_html format class registrations).
//
// The compat report (tools/compat-report/mod-compat-report.json entry for
// card-mod-email-0.20.0) lists the mod-specific views NOT covered by the
// compiled-in HTML_VIEWS as `compact_missing` and `email_page`. The
// `compact_missing` redefinition lives in set/all/email_text.rb (format
// :email_text) and set/all/email_html.rb (format :email_html); both are
// `view :compact_missing do "" end` - the empty-body override of the core
// compact-missing view (card-mod-format set/all/error.rb:1-4 already
// returns "" for the base/html formats). Ported here as the mod's two
// empty-body registrations under their respective email formats.
//
// The `email_page` view is wrapped in :email_document (the email-envelope
// wrapper, with `<style>` inline from the +*email stylesheet card, the
// doctype, body.d0-email-body wrapper). Its `:email_stylesheet` lookup
// is `:email_stylesheet.card.format(:css).render_compiled` (a SCSS
// compile step that lives in card-mod-scss / card-mod-style, not ported).
// The render_core bytes are the html format's :core view (already in
// HTML_VIEWS); the only mod-specific shape is the envelope wrapper. The
// port below captures the envelope WITHOUT the stylesheet bytes (the
// inline `<style>` block is empty - the stylesheet lookup returns
// blank when the SCSS format is absent, which is what Ruby's
// `render_compiled` returns on an empty stylesheet card, and the css
// gem's not-portable engine is absent here). The envelope bytes come
// straight from set/all/email_html.rb:2-14.
//
// Ported here:
// - set/all/email_text.rb:1-13           view :unknown, view :compact_missing
//   (both return "") + view :last_action (delegates to history's
//   :last_action_verb; history mod is not ported, so the body returns ""
//   - the view entry still registers so the loader's basket/registry
//   matches the gem's tree)
// - set/all/email_html.rb:1-41           format :html :email_document wrapper,
//   view :email_page (wrap: :email_document, body = core bytes), format
//   :email_html def show + view :unknown + view :compact_missing
//
// NOT ported (honest remainder, with one-word reasons):
// - set/abstract/email_field.rb:         rails (chunk_list pointer-arg
//   autodetect toggle, email_address? regex, email_address_from_card
//   helper, item_names with relative-name absolutization - all helper
//   methods, no views to register)
// - set/abstract/test_context.rb:        rails (view :core wraps super in
//   card.with_context test_context_card - left/right fetcher ladder is
//   not on the engine; the @context_card accessor lives in Card::Env)
// - set/right/bcc.rb, cc.rb, from.rb,    include_set + assign_type only;
//   subject.rb, to.rb                    no views (assign_type :list / :phrase
//                                        drives the type code; rails-runtime)
// - set/right/text_message.rb:           rails (view :core dispatches to
//   card.format(:email_text).render_core - email_text format is not in the
//   TS render layer; the format method on RenderFormat is not modeled)
// - set/right/html_message.rb:           haml (:content_with_link,
//   simple_core: super() + path(view: :email_page, layout: :none) - the
//   path helper is a rails route helper not present in the TS engine)
// - set/type/email_template.rb:          rails (clean_html?, deliver, mail,
//   message_body, body_method_and_args, text_and_html_message,
//   multipart_mixed, html_body, text_body, add_attachments,
//   each_valid_attachment, attachment_name - all Mail::Message / Net::SMTP
//   machinery, SIDE EFFECTS not portable in a headless engine)
// - set/type/email_template/email_config.rb: rails (email_config walks
//   EMAIL_FIELDS through special_email_field_method / standard_email_field
//   which use Auth.as, format_opts.merge format: :email_text,
//   field_card.account&.email - account ladder + Auth.as are not ported)
// - set/type/email_template/html.rb:     rails (edit_fields + view :core =
//   render_read_form - multi-card form editor is not in the TS engine)
// - lib/card/format/email_html_format.rb: format-class registration
//   (`@@aliases["email"] = "email_html"`, view_caching? false). The TS
//   engine has no format-class surface; the html-side alias is the
//   render layer's job, not the mod's
// - lib/card/format/email_text_format.rb: format-class registration
//   (chunk_list override). Same: format-class surface absent in TS
// - data/real.yml + data/test.yml +      data fixtures (signups@decko.org,
//   the email_stylesheet cardtype, etc.) - the TS render engine has no
//   card-creation path the mod loader should drive

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/all/email_text.rb:4-5 view :unknown: literally `""`. Email text
 *  format's unknown-card render is empty - recipients see no broken
 *  marker for a card the email renderer could not resolve. */
const emailTextUnknownView: ViewFn = () => "";

/** set/all/email_text.rb:6-8 view :compact_missing: literally `""`. Same
 *  shape as the core :compact_missing (card-mod-format set/all/error.rb:
 *  1-4 returns "" with perms: :none + compact: true), restated for the
 *  email_text format so the loader records the registration. The
 *  perms/compact flags from the source are noted but not enforced: the
 *  core TS path does not consult the format's perms/compact table from
 *  the loader (the same gap card-mod-help's :help_text view has, where
 *  the engine's read-check fires uniformly). */
const emailTextCompactMissingView: ViewFn = () => "";

/** set/all/email_text.rb:10-12 view :last_action, perms: :none, cache:
 *  :never: `_render_last_action_verb`. The verb is card-mod-history
 *  set/all/history/views.rb:55-65's :last_action_verb view (a
 *  case-on-action-type dispatch: :create -> "added", :delete ->
 *  "deleted", otherwise a link_to_view :history "edited"). card-mod-
 *  history is NOT ported - so the email_text :last_action's body has
 *  no resolved verb to render. The body returns "" here; the view
 *  entry still registers so the loader's table matches the gem's
 *  tree (the verdict notes 5 views declared across html/email_html/
 *  email_text formats - this is the one email_text view whose bytes
 *  depend on a not-ported sibling mod). */
const emailTextLastActionView: ViewFn = () => "";

/** set/all/email_html.rb:34-36 view :unknown (format :email_html):
 *  literally `""`. Same empty-body shape as the email_text format's
 *  :unknown above. */
const emailHtmlUnknownView: ViewFn = () => "";

/** set/all/email_html.rb:38-40 view :compact_missing (format :email_html):
 *  literally `""`. */
const emailHtmlCompactMissingView: ViewFn = () => "";

/** set/all/email_html.rb:21-23 view :email_page (format :html), wrap:
 *  :email_document: `render_core`. The :email_document wrapper
 *  (set/all/email_html.rb:2-14) emits the HTML email envelope - the
 *  doctype, html/head with `<meta http-equiv="Content-type"...>` and
 *  inline `<style>...</style>`, then the body wrapping the page core
 *  in `<body class="d0-email-body">`. The original wrapper pulls the
 *  stylesheet from `:email_stylesheet.card.format(:css).render_compiled`
 *  (set/all/email_html.rb:17-19); the CSS format and SCSS compile are
 *  not ported, so the port emits the wrapper with an empty `<style>`
 *  block (the bytes the wrapper would render when the stylesheet card
 *  is absent / has no compiled body). The interior is the html format's
 *  :core view - renderCore() composes it from the existing
 *  HTML_VIEWS.core entry via `ctx.fmt.renderView("core")`. */
const emailDocumentWrapper =
  "<!DOCTYPE html>\n" +
  '<html>' + "\n" +
  "  <head>\n" +
  '    <meta http-equiv="Content-type" content="text/html;charset=UTF-8"/>\n' +
  "    <style></style>\n" +
  "  </head>\n" +
  '  <body class="d0-email-body">' + "\n" +
  "    INTERIOR\n" +
  "  </body>\n" +
  "</html>";

const emailPageView: ViewFn = (ctx: ViewContext) => {
  const core = ctx.fmt.renderView("core");
  // Wrap: :email_document substitutes INTERIOR with the interior bytes
  // (wrap.rb#interior, the heredoc interpolation pattern in
  // set/all/email_html.rb:11). The bytes mirror the heredoc exactly,
  // including the leading two-space indent inside the body block
  // preserved by squish_heredoc... no, ruby <<~ strips it. The heredoc
  // uses <<~ (squiggly) which DOES strip common leading whitespace; the
  // emitted bytes therefore have no leading indent on the body. The
  // text below matches squiggly semantics.
  const interior = core;
  return emailDocumentWrapper.replace("INTERIOR", interior);
};

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
const setModules: ModSetModuleFile[] = [
  // pattern: abstract
  {
    // set/abstract/email_field.rb:1-40 - format base block (chunk_list
    // override) + format :email_text block (email_addresses,
    // email_address?, email_address_from_card, email_addresses_from_card_
    // content helper methods). No views.
    setPath: "abstract/email_field",
  },
  {
    // set/abstract/test_context.rb:1-31 - format :html block (view :core,
    // cache :never, with private contextualizing + test_context_card
    // helpers) + format :email_html block (view :core =
    // process_content render_raw). Both views wrap super()/raw through
    // card.with_context test_context_card - the left.fetch ladder +
    // Card.with_context + @context_card accessor are not on the TS
    // engine. Not ported.
    setPath: "abstract/test_context",
  },
  // pattern: all
  {
    // set/all/email_html.rb:1-41 - format :html block (wrapper :email_
    // document, email_styles method, view :email_page wrap: :email_
    // document) + format :email_html block (def show, view :unknown,
    // view :compact_missing). Ported: :email_page (html) + :unknown +
    // :compact_missing (email_html).
    setPath: "all/email_html",
    formats: {
      html: {
        views: [
          { view: "email_page", viewFn: emailPageView, config: { wrap: "email_document" } },
        ],
      },
      email_html: {
        views: [
          { view: "unknown", viewFn: emailHtmlUnknownView },
          { view: "compact_missing", viewFn: emailHtmlCompactMissingView },
        ],
      },
    },
  },
  {
    // set/all/email_text.rb:1-13 - format :email_text block. Ported all
    // three views (empty-body for two, delegation-stub for :last_action
    // whose bytes come from the not-ported history mod).
    setPath: "all/email_text",
    formats: {
      email_text: {
        views: [
          { view: "unknown", viewFn: emailTextUnknownView },
          { view: "compact_missing", viewFn: emailTextCompactMissingView },
          // perms: :none + cache: :never from the source (view_opts.rb:
          // 17, render.rb:51). The TS render path consults the mod's
          // view-config table for these flags (format.ts integration
          // patch note in docs/mod-loader-port-notes.md); until that
          // patch lands, the registration shape is the closest mirror.
          {
            view: "last_action",
            viewFn: emailTextLastActionView,
            config: { perms: "none", cache: "never" },
          },
        ],
      },
    },
  },
  // pattern: right
  {
    // set/right/bcc.rb - include_set Abstract::EmailField +
    // assign_type :list. No views.
    setPath: "right/bcc",
  },
  {
    // set/right/cc.rb - same shape.
    setPath: "right/cc",
  },
  {
    // set/right/from.rb - same shape.
    setPath: "right/from",
  },
  {
    // set/right/subject.rb - include_set Abstract::TestContext +
    // assign_type :phrase. No views.
    setPath: "right/subject",
  },
  {
    // set/right/to.rb - include_set Abstract::EmailField +
    // assign_type :list. No views.
    setPath: "right/to",
  },
  {
    // set/right/text_message.rb - include_set Abstract::TestContext +
    // assign_type :plain_text + format :html view :core (contextualizing
    // + card.format(:email_text).render_core). Not ported: email_text
    // format method not on TS engine.
    setPath: "right/text_message",
  },
  {
    // set/right/html_message.rb - include_set Abstract::TestContext +
    // def clean_html? + format :html view :content (haml
    // :content_with_link, simple_core: super()). Not ported: HAML
    // template + path helper not on TS engine.
    setPath: "right/html_message",
  },
  // pattern: type
  {
    // set/type/email_template.rb - clean_html?, deliver, mail, message_
    // body, body_method_and_args, text_and_html_message, multipart_mixed,
    // html_body, text_body, add_attachments, each_valid_attachment,
    // attachment_name. All Mail::Message / Net::SMTP machinery. Not
    // ported: rails.
    setPath: "type/email_template",
  },
  {
    // set/type/email_template/email_config.rb - email_config,
    // email_html_message_field, email_field_from_card,
    // special_email_field_method, standard_email_field, safe_from_and_
    // reply_to!, email_from_field_value, configured_from_name_and_email.
    // Auth.as + format(:email_text) dispatch not on TS engine. Not ported.
    setPath: "type/email_template/email_config",
  },
  {
    // set/type/email_template/html.rb - format :html edit_fields +
    // view :core = render_read_form. Not ported: rails form editor.
    setPath: "type/email_template/html",
  },
];

const cardModEmail: DeckoModManifest = {
  name: "email",
  gemName: "card-mod-email",
  group: "gem",
  setModules,
};

export default cardModEmail;
