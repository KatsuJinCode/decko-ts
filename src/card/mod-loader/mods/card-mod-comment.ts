// The card-mod-comment gem (card-mod-comment-0.20.0), ported through the
// mod loader - the mod that adds a comment_box subslot to every card and a
// "discussion" cardtype whose :open/:open_content/:titled/:titled_content
// and :core/:input views show the comment form after the standard content.
//
// The gem's tree (the installed
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
// - set/all/comment.rb:14-19 attr_writer :comment_author + the reader's
//   SESSION-STICKY arm — `Env.session[:comment_author] = comment_author`
//   (the port resolves the author per save through ModEventSaveInput; the
//   staging route layer carries no session-mutation surface yet, so a
//   follow-up save does not remember a previous author — the named
//   remainder, ladder: degraded-labeled)
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
//
// PORTED 2026-09-29 (the fresh oracle capture
// fixtures/oracle-surfaces/comment.jsonl pins the bytes):
// - set/all/comment.rb:5-12 event :add_comment, :prepare_to_store, on:
//   :save, when: :comment — registered below with the real body; the
//   action engine applies it at the prepare_to_store position (before the
//   row write, the port's SP seam) through ModEventSaveInput.setContent.
// - set/all/comment.rb:14-25 clean_comment + the comment_author reader's
//   non-sticky arms (cleanComment / commentAuthorLabel below).
// - set/all/comment.rb:27-44 comment_with_signature + comment_signature +
//   the format comment_author's two arms (commentWithSignature /
//   commentSignature / commentAuthorFor below).

import type { ViewContext, ViewFn } from "../../render/format.js";
import { HTML_VIEWS } from "../../render/views.js";
import { h } from "../../render/slot-html.js";
import type { DeckoModManifest, ModEventCard } from "../mod-manifest.js";
import type { ModEventContext, ModEventSaveInput } from "../mod-event-dispatch.js";

/** card-1.110.0 lib/card/format/content.rb:70-72 - Ruby's output():
 *  Array.wrap(content).flatten.compact.join "\n" (nils drop; empty strings
 *  are Ruby-truthy and stay). The comment_buttons array rides this. */
function output(parts: (string | undefined | null)[]): string {
  return parts
    .filter((part): part is string => part !== undefined && part !== null)
    .join("\n");
}

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

/** set/all/comment.rb:55-62 hidden_comment_fields: nil unless the card is
 *  new (so the nonexistent card takes the authored name); for a new card
 *  Rails' hidden_field_tag "card[name]", card.name renders
 *  `<input type="hidden" name="card[name]" id="card_name" value="..."
 *  autocomplete="off" />` (the id derives from the name; Rails 7.2's
 *  tag builder carries autocomplete="off"). Oracle-pinned by the
 *  board-stage3 engage_tab capture (the new Oracle Basics+discussion
 *  child). */
function hiddenCommentFields(card: ViewContext["fmt"]["card"]): string {
  if (card.id !== undefined) return "";
  return (
    `<input type="hidden" name="card[name]" id="card_name"` +
    ` value="${h(card.name.s)}" autocomplete="off" />`
  );
}

/** set/all/comment.rb:63-65 comment_box: `text_area :comment, rows: 3` -
 *  Rails' text_area (FormTagHelper via decko's builder) emits
 *  `<textarea rows="3" class=" form-control" name="card[comment]"
 *  id="card_comment">\n</textarea>` (the empty value stays newline-wrapped;
 *  the leading space in class is Rails' append-style class merge). Oracle
 *  bytes: the board-stage3 engage_tab capture. */
function commentTextArea(): string {
  return (
    `<textarea rows="3" class=" form-control" name="card[comment]"` +
    ` id="card_comment">\n</textarea>`
  );
}

/** set/all/comment.rb:67-70 comment_buttons: wraps comment_author_label +
 *  comment_submit_button in a <div class="comment-buttons"> - the array
 *  rides output()'s compact (content.rb:70-72), so a nil author label
 *  contributes nothing. */
function commentButtons(ctx: ViewContext): string {
  return `<div class="comment-buttons">${commentAuthorLabel(ctx)}${commentSubmitButton()}</div>`;
}

/** set/all/comment.rb:74-77 comment_author_label: NIL when
 *  Auth.signed_in? (output().compact drops it - the signed-in capture arms
 *  render no label); the anonymous branch renders the label + the
 *  comment_author text field. Auth.signed_in? rides the engine's session
 *  (viewer/pageSession - the follow seam's Auth.current pattern). */
function commentAuthorLabel(ctx: ViewContext): string {
  const signedIn =
    ctx.fmt.engine.viewer?.signedIn === true ||
    ctx.fmt.engine.pageSession?.signedIn === true;
  if (signedIn) return "";
  return `<label>My Name is:</label> <input type="text" name="comment_author">`;
}

/** set/all/comment.rb:79-82 comment_submit_button: `submit_button text:
 *  "Comment", type: :submit, disable_with: "Commenting", situation:
 *  "outline-primary"` - Rails' button_tag with the Bootstrap situation
 *  class. Oracle bytes: the board-stage3 engage_tab capture. */
function commentSubmitButton(): string {
  return (
    `<button name="button" type="submit" data-disable-with="Commenting"` +
    ` class="btn btn-outline-primary">Comment</button>`
  );
}

/** set/all/comment.rb:46-53 view :comment_box body: `wrap_with :div,
 *  class: "comment-box nodblclick" do card_form action do
 *  [hidden_comment_fields, comment_box, comment_buttons] end end` with
 *  action = card.new_card? ? :create : :update (comment.rb:48-49).
 *
 *  card_form (card-mod-edit set/all/form.rb:193-200) is Rails form_for on
 *  the card with card_form_opts (:210-216): class "card-form" + "slotter"
 *  (form.rb:219-220, no redirect), + "autosave" on :update only
 *  (:221); url = path(action:) (:232-235 - :create -> "/card/create",
 *  :update -> "/update/<mark>"); remote -> data-remote="true". The
 *  CREATE branch is oracle-pinned byte-exact by the board-stage3
 *  engage_tab capture: form_for on an UNSAVED record emits id="new_card"
 *  and NO _method patch spoof (the patch tag is the PERSISTED-record
 *  quirk createCardForm documents); the utf8 enqueuer rides every form.
 *  The UPDATE branch follows the same machinery (autosave + patch spoof +
 *  the update path) - rendered-unpinned, like the pre-board comment_box. */
function commentBoxBody(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const isNew = card.id === undefined;
  const form = isNew
    ? `<form class="card-form slotter" id="new_card" action="/card/create"` +
      ` accept-charset="UTF-8" data-remote="true" method="post">`
    : `<form class="card-form slotter autosave" id="edit_card_${card.id}"` +
      ` action="/update/${h(ctx.fmt.urlKey())}" accept-charset="UTF-8"` +
      ` data-remote="true" method="post">` +
      `<input type="hidden" name="_method" value="patch" autocomplete="off" />`;
  // form.rb:198 `hidden + output(yield(cform))`: the utf8 enqueuer is part
  // of the form_for HIDDEN block (concatenated, no join newline); only the
  // view's own array rides output()'s "\n" join.
  const body =
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    output([
      hiddenCommentFields(card),
      commentTextArea(),
      commentButtons(ctx),
    ]);
  return `<div class="comment-box nodblclick">${form}${body}</form></div>`;
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
  // layout-whitespace lane (2026-09-29): Ruby is
  //   output [super(), render_comment_box(optional: :hide)]
  // (set/right/discussion.rb:8-10), and output
  // (card-1.110.0 lib/card/format/content.rb:68-70) joins with "\n" —
  // the separator stays even when the comment_box contributes "" (the
  // :update-denied blank). Page-mechanism census evidence: 27 sampled
  // +discussion pages fail by exactly that missing "\n" (e.g. corpus
  // 10375 Occupy oracle offset 26,405).
  //
  // board-stage3 lane (2026-09-29) composition correction: since the
  // layout-whitespace lane landed the discussion branch INSIDE the base
  // coreView (views.ts - the loader-less verifier path dispatches no
  // set-scoped override, so the base owns the emulation), this override's
  // BASE_CORE capture IS that same wrapper. Appending the box HERE on top
  // of it rendered the box TWICE (the engage_tab oracle arm caught it:
  // two adjacent comment-box divs). Ruby's override output is exactly
  // plain_core + "\n" + box - which is what the base branch emits - so
  // the override delegates; the voo.show("comment_box") the titled
  // override sets rides the inherited viz and flips the box's
  // optional-hidden default to shown inside that single render.
  return callBaseView(ctx, BASE_CORE, "core");
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

/** Call the captured base view; with no base view registered under that
 *  name this THROWS a named error - the port's stand-in for Ruby's
 *  NoMethodError on a super() whose format defines no such view. The
 *  error carries the requested view name so a missing base view is
 *  diagnosable from the test output rather than silently swallowed
 *  (discussionCoreView and discussionInputView both dispatch through
 *  here and surface the throw). */
function callBaseView(ctx: ViewContext, base: ViewFn | undefined, name: string): string {
  if (base !== undefined) return base(ctx);
  throw new Error(`base view missing for discussion super() call: ${name}`);
}

// ---------------------------------------------------------------------------
// the add_comment save event (set/all/comment.rb:5-44) — the E6 port
// ---------------------------------------------------------------------------

/** Ruby Time#to_s / TimeWithZone#to_s: "YYYY-MM-DD HH:MM:SS UTC" (the
 *  capture's signature clock bytes: "2026-09-29 12:00:00 UTC"). */
export function rubyTimestamp(d: Date): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/** comment.rb:21-25 clean_comment — every line wrapped `<p>…</p>`, blank
 *  lines `&nbsp;`. The capture: "line one\n\nline three" →
 *  "<p>line one</p>\n<p>&nbsp;</p>\n<p>line three</p>". */
export function cleanComment(comment: string): string {
  return comment
    .split("\n")
    .map((line) => `<p>${line.trim() === "" ? "&nbsp;" : line}</p>`)
    .join("\n");
}

/** comment.rb:31-35 comment_signature — the author + frozen-clock div
 *  (wrap_with :div, class: "w-comment-author"). */
export function commentSignature(author: string, now: Date): string {
  return `<div class="w-comment-author">${author}.....${rubyTimestamp(now)}</div>`;
}

/** comment.rb:36-41 comment_author (the format block): signed-in readers
 *  comment as "[[Name]]"; otherwise the card-level reader falls to
 *  params/session/"Anonymous" + " (Not signed in)". */
export function commentAuthorFor(save: {
  signedInActorName: string | undefined;
  commentAuthor: string | undefined;
}): string {
  if (save.signedInActorName !== undefined) return `[[${save.signedInActorName}]]`;
  const declared = save.commentAuthor ?? "Anonymous";
  return `${declared} (Not signed in)`;
}

/** comment.rb:7-9 the append: `[content, format.comment_with_signature]
 *  .compact.join "\n<hr>\n"`. */
export function appendComment(
  content: string | undefined,
  comment: string,
  author: string,
  now: Date,
): string {
  const base = content ?? "";
  return `${base}\n<hr>\n${cleanComment(comment)}\n${commentSignature(author, now)}`;
}

/** The event body (comment.rb:5-12): a blank-but-present comment sticks
 *  the session author and appends nothing (`return unless
 *  comment.present?`); a real comment appends
 *  `"\n<hr>\n" + clean_comment + "\n" + signature`. */
export async function addCommentEventFn(
  save: ModEventSaveInput,
): Promise<void> {
  const comment = save.comment;
  if (comment === undefined) return;
  // `Env.session[:comment_author] = comment_author if Env.session` — the
  // session-sticky write is the named remainder (no route-layer session
  // mutation surface yet).
  if (comment === "") return;
  const author = commentAuthorFor(save);
  save.setContent(appendComment(save.pendingContent, comment, author, save.now()));
  save.commentApplied = true;
}

/** The `when: :comment` predicate (comment.rb:4): the card's comment
 *  attribute is set exactly when the request carried the param — truthiness
 *  in Ruby, so "" PASSES the gate (the body then skips the blank). The
 *  SP-position application marks commentApplied, and the post-persist walk
 *  sees when-false (the body already ran where the mutation could land). */
export const commentModEventPredicates = {
  comment: (_card: ModEventCard, ctx?: ModEventContext): boolean =>
    ctx?.saveInput !== undefined &&
    ctx.saveInput.comment !== undefined &&
    !ctx.saveInput.commentApplied,
} as const;

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
      events: [
        {
          // comment.rb:4-12 — `event :add_comment, :prepare_to_store, on:
          // :save, when: :comment do ... end`. The body runs through
          // ModEventSaveInput (the action engine applies it at the SP
          // position, before the row write; the post-persist stage walk
          // sees when-false via commentApplied).
          event: "add_comment",
          at: "prepare_to_store",
          on: ["save"],
          when: "comment",
          fn: (card, _host, ctx) => {
            if (ctx.saveInput === undefined) return;
            void card;
            return addCommentEventFn(ctx.saveInput);
          },
        },
      ],
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