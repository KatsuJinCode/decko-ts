// The card-mod-email gem (card-mod-email-0.20.0), ported through the mod
// loader - the mod that adds email-template cardtypes, the email_text /
// email_html format families, the *to/*from/*cc/*bcc/*subject/*attach/
// *text_message/*html_message right-side settings, and the email-document
// wrapper that turns an html render into a multipart email body.
//
// The gem's tree (the installed
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
// - set/all/email_text.rb:1-13           view :unknown + view
//   :compact_missing (both return "") + view :last_action (the real
//   _render_last_action_verb delegation - the verb EmailTextFormat sees
//   is card-mod-follow's BASE-format notify last_action_verb, see the
//   emailTextLastActionView docblock for the full chain read)
// - set/all/email_html.rb:1-41           format :html :email_document wrapper,
//   view :email_page (wrap: :email_document, body = core bytes), format
//   :email_html def show + view :unknown + view :compact_missing
//
// NOT ported (honest remainder, with one-word reasons):
// - set/abstract/email_field.rb:         rails (chunk_list pointer-arg
//   autodetect toggle, email_address? regex, email_address_from_card
//   helper, item_names with relative-name absolutization - all helper
//   methods, no views to register)
// - set/abstract/test_context.rb:        the set module itself stays
//   view-less (its format :html view :core is ported ONTO the three
//   concrete set modules that include_set it - right/subject,
//   right/text_message, right/html_message - because the loader has no
//   include_set seam and a FLAT registration would hijack every card's
//   :core; see the note on the test-context seam below; the flat record
//   carries the same three arms through the emailScopedCoreView
//   dispatcher for the loader-less graded lane). Its format
//   :email_html view :core (process_content render_raw) is NOT ported -
//   the email_html format's own :core surface has no captured reader.
// - set/right/bcc.rb, cc.rb, from.rb,    include_set + assign_type only;
//   subject.rb, to.rb                    no views (the assign_type lines
//                                        ride the setModules' assignsType
//                                        field - the Set::Type.assignment
//                                        registry port)
// - set/right/text_message.rb:           view :core IS ported (the
//   TestContext seam + the email_text :core dispatch). assign_type
//   :plain_text rides assignsType.
// - set/right/html_message.rb:           haml (:content_with_link,
//   simple_core: super() + path(view: :email_page, layout: :none) - the
//   path helper is a rails route helper not present in the TS engine) -
//   :content ported (below); view :core (the TestContext seam's super()
//   wrap) ported (below)
// - set/type/email_template.rb:          rails (clean_html?, deliver, mail,
//   message_body, body_method_and_args, text_and_html_message,
//   multipart_mixed, html_body, text_body, add_attachments,
//   each_valid_attachment, attachment_name - all Mail::Message / Net::SMTP
//   machinery, SIDE EFFECTS not portable in a headless engine)
// - set/type/email_template/email_config.rb: rails (email_config walks
//   EMAIL_FIELDS through special_email_field_method / standard_email_field
//   which use Auth.as, format_opts.merge format: :email_text,
//   field_card.account&.email - account ladder + Auth.as are not ported)
// - set/type/email_template/html.rb:     view :core = render_read_form IS
//   ported (below - the explicit edit_fields arm; live-probed:
//   normalized_edit_field_config(:to) == ["welcome email+*to",
//   {:title=>"welcome email+*to"}]). edit_fields itself is the EMAIL_FIELDS
//   constant + [:test_context] (html.rb:2-4).
// - lib/card/format/email_html_format.rb: format-class registration
//   (`@@aliases["email"] = "email_html"`, view_caching? false). The TS
//   engine has no format-class surface; the html-side alias is the
//   render layer's job, not the mod's
// - lib/card/format/email_text_format.rb: format-class registration
//   (chunk_list override). The format NAME is modeled now
//   (RenderFormatOptions.formatName + the HTML_DESCENDED_FORMATS fallback
//   rule in mod-loader.ts viewChain - EmailTextFormat < TextFormat <
   // Format never sees the html method table); the chunk_list
//   :references override is the content layer's concern, not the mod's
// - data/real.yml + data/test.yml +      data fixtures (signups@decko.org,
//   the email_stylesheet cardtype, etc.) - the TS render engine has no
//   card-creation path the mod loader should drive

import type { ViewContext, ViewFn } from "../../render/format.js";
import {
  contentWithLinkBody,
  emailTemplateCoreBody,
  htmlMessageCoreBody,
  subjectCoreBody,
  textMessageCoreBody,
} from "../../render/views.js";
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
 *  :never: `_render_last_action_verb` - the underscore render (card core
 *  format/method_delegation.rb:6-18 RENDER_METHOD_RE: the leading
 *  underscore -> render_args sets skip_perms: true). WHAT THE VERB
 *  RENDERS (full chain, read 2026-10-01): _render_last_action_verb is
 *  render!(:last_action_verb, skip_perms: true); the view method lookup
 *  is respond_to?(:_view_last_action_verb) on the format instance
 *  (format/render.rb:68-78 view_method/supports_view?). The HISTORY
 *  mod's last_action_verb (card-mod-history-0.20.0
 *  set/all/history/views.rb:55-65, `format :html` - the added/deleted/
 *  edited-anchor case) is filed under HtmlFormat
 *  (register_all_set_format, card-1.110.0 lib/card/set/format.rb:120-144)
 *  and EmailTextFormat < TextFormat < Format (card-mod-email-0.20.0
 *  lib/card/format/email_text_format.rb:6; card-mod-format-0.20.0
 *  lib/card/format/text_format.rb:6) never sees it. The verb
 *  EmailTextFormat DOES see is card-mod-follow-0.20.0
 *  set/all/notify/base_views.rb:44-46's BASE-format
 *  `view :last_action_verb, cache: :never do
 *  "#{notification_act&.main_action&.action_type || 'edite'}d" end`
 *  (notification_act = act || card.acts.last, base_views.rb:117-119;
 *  main_action = action_on(card_id) || actions.first, card-mod-history
 *  lib/card/act.rb:105-107): "created"/"updated"/"deleted", "edited"
 *  with no act. Base-format all-set modules are included into
 *  Card::Format ITSELF (card-1.110.0 lib/card/set/registrar.rb:79-84
 *  process_base_format_modules -> format_class.add_set_modules), so
 *  every format class inherits the notify verb and the html class's
 *  history arm shadows it only IN html.
 *
 *  The port composes single-source: this body DELEGATES to the
 *  last_action_verb dispatch with skip_perms (the underscore
 *  semantics; view-perms.ts renderOptSkipPerms) - the dispatch answers
 *  the flat notify variant (render/views.ts#lastActionVerbNotifyView,
 *  the port's recorded notify-arm body: "edited" on the render path,
 *  where act rows are not read) because the email_text chain carries
 *  no last_action_verb registration (format scoping, mod-loader.ts
 *  viewChain) and email_text is not html-descended (no html-chain
 *  fallback - HTML_DESCENDED_FORMATS).
 *
 *  Byte census (2026-10-01, sha-verified corpus copy 6A44DFDC...):
 *  13,176 captured oracle entries, ZERO render :last_action in any
 *  format - the four entries carrying "last_action" bytes are the
 *  follower notification email template's authored
 *  `{{_|last_action_verb}}` source; 42 entries carry the html
 *  :last_action span (the history surface, which stays). The bytes
 *  are therefore GEM-SOURCE-DERIVED (RENDERED-UNPINNED), the same
 *  disclosed basis as the history mod's :last_action arm. */
const emailTextLastActionView: ViewFn = (ctx: ViewContext) =>
  ctx.fmt.renderView("last_action_verb", { skip_perms: true });

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
  // Ruby's body is `render_core` (set/all/email_html.rb:11-13) - a
  // method_missing api_render delegation whose render! opens its OWN
  // wrap_and_render rescue scope (render.rb:96-100). In the serving posture
  // that rescue is QUIET (html_format.rb:16-18 focal? = main? = false), so a
  // raising core becomes the delegated render's VALUE (the verbatim
  // unknown-codename span) and the :email_document wrapper still completes
  // around it - the oracle's 271-byte email_page with the span inside the
  // body. The former bare renderView call let the error escape to the root's
  // rescue, which dropped the wrapper.
  const core = ctx.fmt.renderDelegated("core");
  // Wrap: :email_document substitutes INTERIOR with the interior bytes
  // (wrap.rb#interior, the heredoc interpolation pattern in
  // set/all/email_html.rb:11). The heredoc is squiggly (<<~), so the
  // body carries no leading indent; the bytes below match squiggly
  // semantics.
  const interior = core;
  return emailDocumentWrapper.replace("INTERIOR", interior);
};

/** card-mod-email-0.20.0 set/right/html_message.rb:8-10 view :content —
 *  the BODY is homed on the flat record (views.ts contentWithLinkBody, the
 *  same loader-less seam as the three :core bodies below: the graded page
 *  lane binds no loader, and the read_form field slots dispatch :content
 *  on the +*html message field); this registration delegates single-source.
 *  It used to be exported but held back, because registering it made it
 *  mask the shared :content deck-wide; that masking was a dispatch defect
 *  (a chain-miss fell through to a set-scoped override) and it is fixed —
 *  see the note on the right/html_message set module below and the guard
 *  in tests/card/mod-loader/view-set-scope-fallback.test.ts; the flat
 *  surface now carries the same scoping through its dispatcher
 *  (emailScopedContentView), so the mod-side registration and the
 *  loader-less dispatch answer identically. */
const contentWithLinkView: ViewFn = contentWithLinkBody;

// ---------------------------------------------------------------------------
// the Abstract::TestContext include_set seam + the message/template cores
// (p20-email-views lane; the roleviews receipt's leftovers 1-3)
//
// The three html :core BODIES live in render/views.ts (htmlMessageCoreBody,
// textMessageCoreBody, emailTemplateCoreBody) — the graded page-lane
// harness binds NO mod loader, so the bodies must sit on the flat record
// the loader-less dispatch reads; the flat `core` entry there is a scope
// dispatcher (emailScopedCoreView) whose guards reproduce the set-module
// applicability. The registrations below keep the mod's view table
// matching the gem tree (the basket/view-table assertions) and dispatch
// through the chain for loader-bound engines — the SAME functions, so the
// two surfaces cannot drift (the raise-leadview :lead single-source
// idiom).
// ---------------------------------------------------------------------------

/** set/right/text_message.rb format :html view :core — see views.ts
 *  textMessageCoreBody. */
const textMessageCoreView: ViewFn = textMessageCoreBody;

/** set/abstract/test_context.rb's format :html view :core, mixed into
 *  right/html_message by include_set — see views.ts htmlMessageCoreBody. */
const htmlMessageCoreView: ViewFn = htmlMessageCoreBody;

/** set/abstract/test_context.rb's format :html view :core, mixed into
 *  right/subject by include_set — see views.ts subjectCoreBody. The
 *  subject right is the THIRD include_set concrete module (with
 *  right/text_message and right/html_message) whose :core the abstract's
 *  contextualizing wraps; the registration was missing from this manifest
 *  while the flat record already carried the arm, so a loader-bound
 *  engine and the loader-less graded lane disagreed on the subject
 *  field's core dispatch. */
const subjectCoreView: ViewFn = subjectCoreBody;

/** set/type/email_template/html.rb format :html view :core
 *  (= render_read_form) — see views.ts emailTemplateCoreBody. */
const emailTemplateCoreView: ViewFn = emailTemplateCoreBody;

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
    // process_content render_raw). The format :html view :core IS ported -
    // mixed onto the three concrete including modules (the include_set
    // seam; see the htmlMessageCoreView registration below and views.ts's
    // contextualizingTestContext). The format :email_html :core
    // (process_content render_raw) is NOT ported - no captured reader of
    // the email_html :core surface.
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
    // three views (empty-body for :unknown/:compact_missing; :last_action
    // is the _render_last_action_verb delegation - the verb resolves
    // through the follow mod's base-format notify arm, see
    // emailTextLastActionView).
    setPath: "all/email_text",
    formats: {
      email_text: {
        views: [
          { view: "unknown", viewFn: emailTextUnknownView },
          { view: "compact_missing", viewFn: emailTextCompactMissingView },
          // perms: :none + cache: :never from the source (view_opts.rb:
          // 17, render.rb:51). The TS render path consults the mod's
          // view-config table for these flags (format.ts integration
          // patch note until that
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
    assignsType: "list",
  },
  {
    // set/right/cc.rb - same shape.
    setPath: "right/cc",
    assignsType: "list",
  },
  {
    // set/right/from.rb - same shape.
    setPath: "right/from",
    assignsType: "list",
  },
  {
    // set/right/subject.rb - include_set Abstract::TestContext +
    // assign_type :phrase + format :html view :core (the TestContext
    // seam's super() wrap, mixed in by include_set - the same body the
    // flat record dispatches for the subject scope, views.ts
    // subjectCoreBody).
    setPath: "right/subject",
    assignsType: "phrase",
    formats: {
      html: {
        views: [{ view: "core", viewFn: subjectCoreView }],
      },
    },
  },
  {
    // set/right/to.rb - include_set Abstract::EmailField +
    // assign_type :list. No views.
    setPath: "right/to",
    assignsType: "list",
  },
  {
    // set/right/text_message.rb - include_set Abstract::TestContext +
    // assign_type :plain_text + format :html view :core (the TestContext
    // seam + the email_text :core dispatch - both ported above).
    setPath: "right/text_message",
    assignsType: "plain_text",
    formats: {
      html: {
        views: [{ view: "core", viewFn: textMessageCoreView }],
      },
    },
  },
  {
    // set/right/html_message.rb - include_set Abstract::TestContext +
    // def clean_html? + format :html view :content (haml
    // :content_with_link, simple_core: super()).
    //
    // :content IS a shared view name (the engine's main content
    // renderer), and this registration was held back for one measured
    // reason: with the mod loaded, a plain RichText card's :content
    // flipped from
    //   <div id="plain_probe-content-view" class="card-slot content-view ...">
    // to the email's
    //   <div class='simple-core'>...
    // THE MASKING IS FIXED and the fix is in the dispatch, not here (the
    // measurement and the two fallbacks that caused it are traced in
    // tests/card/mod-loader/view-set-scope-fallback.test.ts). Ruby scopes
    // this view to cards carrying a *html_message right: the module goes
    // to Set.modules[:nonbase_format] and only a card whose own pattern
    // module keys name Right::HtmlMessage picks it up
    // (pattern/all.rb:49-55, pattern/base.rb:35-38). The registration is
    // deliberately NOT on the flat base-format record.
    setPath: "right/html_message",
    formats: {
      html: {
        views: [
          { view: "content", viewFn: contentWithLinkView },
          // set/abstract/test_context.rb's format :html view :core, mixed
          // in by include_set (the seam note on contextualizing above):
          // `view :core, cache: :never do contextualizing { super() } end`.
          { view: "core", viewFn: htmlMessageCoreView },
        ],
      },
    },
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
    // view :core = render_read_form. BOTH ported (emailTemplateCoreView
    // above; the explicit edit_fields arm, live-probed).
    setPath: "type/email_template/html",
    formats: {
      html: {
        views: [{ view: "core", viewFn: emailTemplateCoreView }],
      },
    },
  },
];

const cardModEmail: DeckoModManifest = {
  name: "email",
  gemName: "card-mod-email",
  group: "gem",
  setModules,
};

export default cardModEmail;
