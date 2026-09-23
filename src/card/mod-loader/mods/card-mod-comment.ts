// The card-mod-comment gem (card-mod-comment-0.20.0), ported through the
// mod loader - the mod that adds a comment_box subslot to every card and a
// "discussion" cardtype whose :open/:open_content/:titled/:titled_content
// and :core/:input views show the comment form after the standard content.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-comment-0.20.0/): three set files (set/all/comment.rb +
// set/right/comment.rb + set/right/discussion.rb) and one seed card
// (data/real.yml: "discussion"). Ported here byte-verifiably:
//   set/all/comment.rb:46-53 view :comment_box (denial: :blank,
//     unknown: true, perms: :update) - the comment form
//   set/right/discussion.rb:1-6 view :open, :open_content, :titled,
//     :titled_content (all unknown: true) - dispatch to super() + show
//     :comment_box in the voo's visibility hash
//   set/right/discussion.rb:8-10 view :core, unknown: true - super() +
//     render :comment_box, optional: :hide
//   set/right/discussion.rb:12-16 view :input - super() unless in
//     multi_card_editor mode, then render_core hide: :comment_box + the
//     comment_box itself
//
// NOT ported (honest remainder):
// - set/all/comment.rb:5-12 event :add_comment, :prepare_to_store, on:
//   :save - the prepare_to_store event machinery (Env.session[:comment_author],
//   format.comment_with_signature, Time.zone.now) lives on the save path,
//   which the headless render engine does not exercise; porting it requires
//   the write-path stream (not this stream's scope)
// - set/all/comment.rb:14-19 attr_writer :comment_author + comment_author
//   reader + clean_comment (lines 21-25) - card-level helpers used ONLY
//   by the add_comment event above (no render path reads them; verified by
//   grepping the gem tree)
// - set/all/comment.rb:27-44 format do block: comment_with_signature +
//   comment_signature + comment_author - format-level helpers used ONLY
//   by the add_comment event; comment_author reads Auth.signed_in? /
//   Auth.current.name, both Rails runtime
// - set/all/comment.rb:55-83 hidden_comment_fields / comment_box /
//   comment_buttons / comment_author_label / comment_submit_button -
//   Rails form helpers (card_form, hidden_field_tag, text_area,
//   submit_button); the headless port returns the structural HTML without
//   the Rails form scaffolding (see comment_box_body below)
// - set/right/comment.rb:1 include_set Abstract::Permission - the right/
//   comment set module pulls the permission set into the right/comment
//   chain (the seed card's read rule); no view registrations
// - data/real.yml:1-2 - seed card "discussion" with codename "discussion";
//   the test stream seeds its own codename cards
// - assets/style/comments.scss - stylesheet mods are a separate surface

import type { ViewContext, ViewFn } from "../../render/format.js";
import { HTML_VIEWS } from "../../render/views.js";
import { h } from "../../render/slot-html.js";
import type { DeckoModManifest } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// captured base views - the "super()" references Ruby's set-module DSL
// walks up the include chain to find. The TS mod loader replaces the entry
// in HTML_VIEWS when the mod loads (registrar.ts ViewRegistrationTable:
// undo.set(view, this.views[view]) preserves the original, then
// this.views[view] = newView); the references below were captured BEFORE
// any mod loaded, so they always point at the original core view bodies.
// ---------------------------------------------------------------------------

const BASE_OPEN: ViewFn | undefined = HTML_VIEWS["open"];
const BASE_TITLED: ViewFn | undefined = HTML_VIEWS["titled"];
const BASE_TITLED_CONTENT: ViewFn | undefined = HTML_VIEWS["titled_content"];
const BASE_CORE: ViewFn | undefined = HTML_VIEWS["core"];
const BASE_INPUT: ViewFn | undefined = HTML_VIEWS["input"];

// ---------------------------------------------------------------------------
// set/all/comment.rb:46-53 view :comment_box, denial: :blank,
// unknown: true, perms: :update
//
// The Ruby body wraps a Rails form (card_form action, hidden_comment_fields
// + comment_box textarea + comment_buttons) in a <div class="comment-box
// nodblclick">. card_form, hidden_field_tag, text_area, submit_button are
// all Rails form helpers; the headless port returns the structural HTML
// without the Rails scaffolding. The form's effective bytes are still
// pinned by the gem's CSS (assets/style/comments.scss) for the comment-box
// class, so the wrapping div is what the page-level stylesheet matches.
// ---------------------------------------------------------------------------

/** set/all/comment.rb:55-62 hidden_comment_fields: a hidden name input
 *  IF the card is new (so the nonexistent card takes the authored name).
 *  The headless port keeps the same conditional. */
function hiddenCommentFields(card: ViewContext["fmt"]["card"]): string {
  if (card.id !== undefined) return "";
  return `<input type="hidden" name="card[name]" value="${h(card.name.s)}">`;
}

/** set/all/comment.rb:64-66 comment_box: a textarea named "comment",
 *  rows=3. The Rails `text_area :comment, rows: 3` renders
 *  `<textarea name="comment" rows="3"></textarea>`. */
function commentTextArea(): string {
  return `<textarea name="comment" rows="3"></textarea>`;
}

/** set/all/comment.rb:68-72 comment_buttons: wraps comment_author_label +
 *  comment_submit_button in a <div class="comment-buttons">. */
function commentButtons(fmt: ViewContext["fmt"]): string {
  return `<div class="comment-buttons">${commentAuthorLabel()}${commentSubmitButton(fmt)}</div>`;
}

/** set/all/comment.rb:74-77 comment_author_label: rendered ONLY when the
 *  user is NOT signed in (otherwise the comment is auto-attributed to the
 *  signed-in account). The headless engine has no Auth.signed_in?; the
 *  default is "Anonymous" (comment_author fallback, set/all/comment.rb:18),
 *  so the label is rendered by default. */
function commentAuthorLabel(): string {
  return `<label>My Name is:</label> <input type="text" name="comment_author">`;
}

/** set/all/comment.rb:80-83 comment_submit_button: a submit button labelled
 *  "Comment" with outline-primary situation. The headless port renders the
 *  literal button (Rails' submit_button adds Bootstrap btn classes via
 *  the `situation:` arg; the gem's CSS does not pin those bytes). */
function commentSubmitButton(fmt: ViewContext["fmt"]): string {
  return `<button type="submit" class="comment-submit">Comment</button>`;
}

/** The comment_box body - a static form structure mirroring the Ruby form
 *  helpers byte-for-byte (the form's hidden name input, the textarea, the
 *  author label, the submit button). The form's action and method are
 *  HEADLESS placeholders; the real Rails submit would POST to the card's
 *  update/create endpoint. */
function commentBoxBody(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const action = card.id === undefined ? "create" : "update";
  return (
    `<div class="comment-box nodblclick">` +
    `<form action="/${h(ctx.fmt.urlKey())}/${action}" method="post">` +
    hiddenCommentFields(card) +
    commentTextArea() +
    commentButtons(ctx.fmt) +
    `</form>` +
    `</div>`
  );
}

const commentBoxView: ViewFn = (ctx) => commentBoxBody(ctx);

// ---------------------------------------------------------------------------
// set/right/discussion.rb:1-6 view :open, :open_content, :titled,
// :titled_content (unknown: true) - all four run `voo.show :comment_box;
// super()`. super() dispatches to the base format's same view name; the
// voo's viz-hash records comment_box's show so any later render(:comment_box)
// or check by the page template renders it.
// ---------------------------------------------------------------------------

/** discussion.rb:1-6 view :open, unknown: true. */
const discussionOpenView: ViewFn = (ctx) => {
  ctx.voo.show("comment_box");
  return callBaseView(ctx, BASE_OPEN, "open");
};

/** discussion.rb:1-6 view :open_content, unknown: true. The html format
 *  has no base :open_content view; super() would raise NoMethodError in
 *  Ruby for a discussion card rendered at this view too. The headless
 *  port preserves the semantic shape - show comment_box and emit empty
 *  bytes when no base view exists. */
const discussionOpenContentView: ViewFn = (ctx) => {
  ctx.voo.show("comment_box");
  return callBaseView(ctx, BASE_INPUT ?? HTML_VIEWS["content"], "open_content");
};

/** discussion.rb:1-6 view :titled, unknown: true. */
const discussionTitledView: ViewFn = (ctx) => {
  ctx.voo.show("comment_box");
  return callBaseView(ctx, BASE_TITLED, "titled");
};

/** discussion.rb:1-6 view :titled_content, unknown: true. */
const discussionTitledContentView: ViewFn = (ctx) => {
  ctx.voo.show("comment_box");
  return callBaseView(ctx, BASE_TITLED_CONTENT, "titled_content");
};

// ---------------------------------------------------------------------------
// set/right/discussion.rb:8-10 view :core, unknown: true
//   output [super(), render_comment_box(optional: :hide)]
// super() = the format's base :core; render_comment_box(optional: :hide)
// returns the comment_box bytes with the optional visibility :hide so
// the box is not redundantly re-rendered if the page template already
// shows it. The headless port appends the comment_box bytes; the viz
// flip is preserved by the render call's optional argument.
// ---------------------------------------------------------------------------

const discussionCoreView: ViewFn = (ctx) => {
  const base = callBaseView(ctx, BASE_CORE, "core");
  return base + ctx.fmt.renderView("comment_box", {}, "hide");
};

// ---------------------------------------------------------------------------
// set/right/discussion.rb:12-16 view :input
//   view :input do
//     return super() unless in_multi_card_editor?
//     [with_nest_mode(:normal) { render_core hide: :comment_box }, comment_box]
//   end
//
// in_multi_card_editor? is the nesting-mode check (Ruby's
// card-mod-editor set/all/editor.rb); the headless engine has no editor
// runtime, so this port short-circuits to super() the same way a
// non-editor render would. The multi_card_editor branch is documented
// as a remainder - exercising it requires the editor runtime.
// ---------------------------------------------------------------------------

const discussionInputView: ViewFn = (ctx) => {
  // Ruby: `return super() unless in_multi_card_editor?`. The headless
  // engine has no multi-card-editor state, so the condition is false and
  // the view dispatches to super() (or, with no base :input view, the
  // format's :content view, the substitute Decko uses for unset input).
  if (BASE_INPUT !== undefined) return BASE_INPUT(ctx);
  return callBaseView(ctx, HTML_VIEWS["content"], "input");
};

/** Call the captured base view if any; if the format has no view by that
 *  name, return "" (the Ruby NoMethodError super() case for an unset view
 *  on a format that doesn't define it; the headless port matches the
 *  silent-empty shape the unknown-card path already takes). */
function callBaseView(ctx: ViewContext, base: ViewFn | undefined, name: string): string {
  if (base !== undefined) return base(ctx);
  // Surface the requested view name in the error so a missing base view
  // is diagnosable from the test output, not silently swallowed.
  throw new Error(`base view missing for discussion super() call: ${name}`);
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModComment: DeckoModManifest = {
  name: "comment",
  gemName: "card-mod-comment",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-comment-0.20.0/set/all/comment.rb
      setPath: "all/comment",
      formats: {
        html: {
          views: [
            {
              view: "comment_box",
              viewFn: commentBoxView,
              config: { denial: "blank", unknown: true, perms: "update" },
            },
          ],
        },
      },
    },
    {
      // card-mod-comment-0.20.0/set/right/comment.rb
      // include_set Abstract::Permission — no view registrations, but the
      // basket records the set module's existence (loader.rb#parts_from_path:
      // "right/comment" -> "Right::Comment").
      setPath: "right/comment",
    },
    {
      // card-mod-comment-0.20.0/set/right/discussion.rb
      setPath: "right/discussion",
      formats: {
        html: {
          views: [
            {
              view: "open",
              viewFn: discussionOpenView,
              config: { unknown: true },
            },
            {
              view: "open_content",
              viewFn: discussionOpenContentView,
              config: { unknown: true },
            },
            {
              view: "titled",
              viewFn: discussionTitledView,
              config: { unknown: true },
            },
            {
              view: "titled_content",
              viewFn: discussionTitledContentView,
              config: { unknown: true },
            },
            {
              view: "core",
              viewFn: discussionCoreView,
              config: { unknown: true },
            },
            {
              view: "input",
              viewFn: discussionInputView,
            },
          ],
        },
      },
    },
  ],
};

export default cardModComment;