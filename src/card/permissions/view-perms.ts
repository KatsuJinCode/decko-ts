// View permission contract for the captured html-format surface: which task
// each view requires, which renders skip the check entirely, which view a
// denial renders instead, and the denial markup itself.
//
// Ruby mechanism (card-1.110.0 lib/card/view/permission.rb):
// - view_perms (permission.rb:13-15): `setting(:perms) || :read` — every
//   view checks :read unless its definition carries a perms directive.
//   `setting(:perms, view)` -> format.view_setting (permission.rb:29-32 ->
//   format/render.rb:55-57 `try` of the directive method) -> nil when the
//   view definition carries no directive (view_opts.rb:17 VIEW_SETTINGS
//   includes :perms; :52-56 define_view_setting_method stores the literal).
// - altered_view (permission.rb:19-23): `return if skip_check?;
//   alter_unknown || denial` — the voo#ok_view chain (view.rb:85-88) runs
//   BEFORE view dispatch (render.rb:59-63 view_method raises the
//   unsupported-view UserError only after a passed check), so a failed
//   check on ANY checked view — ported or not — renders the denial
//   substitution instead of the view.
// - skip_check? (permission.rb:25-27):
//   `normalized_options[:skip_perms] || view_perms == :none`.
//   :skip_perms is the documented render/nest option (view/options.rb:73
//   "do not check permissions for this view (Boolean)"), set explicitly
//   (card-mod-account set/self/signin.rb:201 nests its signin fields with
//   skip_perms: true) or by the UNDERSCORE render form: RENDER_METHOD_RE
//   (format/method_delegation.rb:5-9) captures a leading `_` and
//   render_args (:48-55) sets `args[:skip_perms] = true if underscore`.
// - denial (permission.rb:46-50):
//   `format.view_for_denial requested_view, (crud?(task) && task)`.
// - denied_task (permission.rb:56-64): `Array.wrap(view_perms).find` —
//   the first failing task; CRUD tasks (`crud?`, :52-54) check
//   `format.ok? task`, any other symbol calls that method on the format
//   (`format.send task` — set-scoped predicates like
//   card-mod-account right/account views' :verify_url_ok?).
//
// The check chain behind format.ok? (card-1.110.0 lib/card/format/
// error.rb:5-8 `task = :create if task == :update && card.new_card?;
// card.ok? task` -> card-mod-permissions set/all/permissions.rb:35-45
// ok? memoizes `send "ok_to_#{action}?"`) lives in view-task-rules.ts for
// the non-read tasks; ok_to_read? is ported in read-rules.ts.
//
// Registry scoping: Ruby directives are SET-scoped (a view defined on a
// set carries its own directives, and format subclasses inherit the BASE
// module's directive when they only redefine the view body — per the
// Set::Format machinery, view_opts.rb:59-64; card-mod-format
// set/all/title.rb redefines the :title body at :12 while the :none
// directive at :2 persists). This port's registry is NAME-keyed for the
// all-set html surface it renders — the same flat choice the unknown-view
// registry in src/card/render/format.ts makes. Set-scoped directives that
// would collide (card-mod-layout set/right/enabled_roles.rb:35 defines a
// :none :edit_inline on that right set vs the all-set :update at
// card-mod-edit set/all/edit_inline.rb:2) resolve to the ALL-SET entry,
//

/** Ruby's CRUD task set (permission.rb:11 CRUD = create read update delete). */
export type CrudTask = "read" | "create" | "update" | "delete";

/** What a view's perms directive resolves to (permission.rb:13-15).
 *  - check: false        -> perms: :none (skip_check? short-circuits)
 *  - check: true, CRUD   -> denied_task checks format.ok?(task)
 *  - check: true, method -> denied_task calls format.send(method); ported
 *    method predicates (can_configure?, cardtype.rb:68-70) resolve through
 *    the gate input's predicateAllowed hook — the unported remainder still
 *    treats them as passing. */
export type ViewPermsResolution =
  | { readonly check: false }
  | { readonly check: true; readonly predicate: false; readonly task: CrudTask }
  | { readonly check: true; readonly predicate: true; readonly task: string };

/**
 * Views whose definition carries `perms: :none` — skip_check? renders them
 * without any permission check (permission.rb:25-27). All-set (+ base
 * format) directives the html surface inherits, per gem file:
 * - card-mod-format set/all/title.rb:2,16,20 (title, title_link,
 *   title_no_link — the html body redefinitions keep the :none directive)
 * - card-mod-format set/all/base.rb:14,26,27,28,31,35,39 (name, key,
 *   linkname, url, url_link, link, nav_link), base.rb:109 (blank)
 * - card-mod-format set/all/html/header.rb:5,15 (header, header_title)
 * - card-mod-format set/all/html/head.rb:21,31,35,37,41,54,61 (page_title,
 *   head, meta_tags, page_title_tag, favicon_tag, rss_links,
 *   stylesheet_tags)
 * - card-mod-format set/all/error.rb:2,6,10,14,18,23 (compact_missing,
 *   unknown, server_error, denial, not_found, bad_address);
 *   set/all/html/error.rb:33,53 (the html compact_missing/errors bodies)
 * - card-mod-format set/all/html/frame.rb:2 (flash)
 * - card-mod-script set/all/head_javascript.rb:9,17,25,29 (script_variables,
 *   javascript_tags, script_calls, javascript_include_tag)
 * - card-mod-layout set/all/navbar_links.rb:2 (navbar_links)
 * - card-mod-follow set/all/notify/base_views.rb:13,33,41,49 (subedits,
 *   followed, follower, unfollow_url)
 *
 * last_action is NOT here (was, citing card-mod-email set/all/email_text.rb:10
 * `perms: :none`): the live registry does not resolve it to :none — the
 * view-registry-directives oracle capture (2026-09-29,
 * fixtures/captured/view-registry-directives-oracle.json) records
 * view_setting(:perms, :last_action) = nil, because card-mod-history
 * set/all/history/views.rb:46 redefines `view :last_action` with no directive
 * and is the operative definition on this surface (card-mod-follow's
 * html_views.rb:2 carries the same plain form, commented out). Nil ->
 * permission.rb:15's :read fallback. Capture-pinned over the gem citation.
 */
const PERMS_NONE = new Set<string>([
  "title",
  "title_link",
  "title_no_link",
  "name",
  "key",
  "linkname",
  "url",
  "url_link",
  "link",
  "nav_link",
  "blank",
  "header",
  "header_title",
  "page_title",
  "head",
  "meta_tags",
  "page_title_tag",
  "favicon_tag",
  "rss_links",
  "stylesheet_tags",
  "compact_missing",
  "unknown",
  "server_error",
  "denial",
  "not_found",
  "bad_address",
  "errors",
  "subedits",
  "followed",
  "follower",
  "unfollow_url",
  "flash",
  "javascript_include_tag",
  "javascript_tags",
  "script_calls",
  "script_variables",
  "navbar_links",
]);

/**
 * Views with a non-default CRUD `perms:` directive (all-set definitions;
 * everything else
 * card-mod-edit set/all/edit_content.rb:28 (edit), edit_name.rb:2,6
 * (edit_name, name_form), edit_type.rb:2,8 (edit_type, edit_type_form),
 * edit_inline.rb:2 (edit_inline), form.rb:20 (edit_in_form),
 * editing.rb:3 (board) — all :update; new.rb:4,8,19,23 (new,
 * new_in_modal, simple_new, new_fields) — all :create;
 * card-mod-comment set/all/comment.rb:46 (comment_box) — :update;
 * card-mod-format set/all/html/head.rb:34-39 (universal_edit_button) —
 * :update, oracle-pinned 2026-09-28: the captured bot/sara arms render the
 * wiki link while the anonymous arms render "" (denial: :blank), so the
 * directive must resolve before the gate can deny anonymous.
 *
 * configure_button is a METHOD-predicate perms view — the ported one:
 * card-mod-format set/type/cardtype.rb:61
 * `view :configure_button, cache: :never, denial: :blank,
 * perms: :can_configure?` (ruby's denied_task does
 * `format.send :can_configure?`, permission.rb:61 — cardtype.rb:68-70:
 * `Card.fetch(card, :type, :structure, new: {}).ok? :update`). The
 * predicate resolves through ViewPermsGateInput.predicateAllowed.
 */
const VIEW_PERMS_DIRECTIVES: Record<string, CrudTask | string> = {
  edit: "update",
  edit_name: "update",
  name_form: "update",
  edit_type: "update",
  edit_type_form: "update",
  edit_inline: "update",
  edit_in_form: "update",
  board: "update",
  comment_box: "update",
  universal_edit_button: "update",
  new: "create",
  new_in_modal: "create",
  simple_new: "create",
  new_fields: "create",
  // card-mod-tinymce_editor set/all/reference_editor/nest_editor.rb:22
  // (`perms: :create`) and nest_image.rb:13 (`perms: :create`) — the
  // reference-editor nest views; view-registry-directives-oracle.json
  // captures both as perms "create" on the live surface.
  nest_content: "create",
  new_image: "create",
  configure_button: "can_configure?",
  // card-mod-format set/type/cardtype.rb:53 `view :configure_link,
  // cache: :never, perms: :can_configure?` - the helper view the
  // configure_button body calls, same predicate (cardtype.rb:57-59).
  configure_link: "can_configure?",
};

const CRUD_TASKS: readonly CrudTask[] = ["read", "create", "update", "delete"];

/** permission.rb:13-15 `setting(:perms) || :read` for the registry. */
export function resolveViewPerms(view: string): ViewPermsResolution {
  if (PERMS_NONE.has(view)) return { check: false };
  const directive = VIEW_PERMS_DIRECTIVES[view];
  if (directive === undefined) {
    return { check: true, predicate: false, task: "read" };
  }
  if ((CRUD_TASKS as readonly string[]).includes(directive)) {
    return { check: true, predicate: false, task: directive as CrudTask };
  }
  return { check: true, predicate: true, task: directive };
}

/** permission.rb:13-15 collapsed to the pre-task-wave shape ("none" skips
 *  the check; every checked view resolves :read on this port's surface —
 *  the non-read CRUD tasks ride viewRequiresTask/resolveViewPerms).
 *  Legacy alias kept for the read-permission wave's consumers. */
export type ViewPerms = "read" | "none";

/** permission.rb:13-15 collapsed to the pre-task-wave shape ("none" skips
 *  the check; every checked view resolves :read on this port's surface —
 *  the non-read CRUD tasks ride viewRequiresTask/resolveViewPerms). */
export function viewPerms(view: string): ViewPerms {
  return resolveViewPerms(view).check ? "read" : "none";
}

/** True when the view resolves to a NON-read check — the engine's trigger
 *  for precomputing ok_to_<task>? verdicts (see the coordinator patch in
 *). Views that skip (perms :none) never need
 *  verdicts. */
export function viewRequiresTask(view: string): boolean {
  const resolution = resolveViewPerms(view);
  return resolution.check && !resolution.predicate && resolution.task !== "read";
}

/** permission.rb:25-27 `normalized_options[:skip_perms]` — the documented
 *  Boolean render/nest option (view/options.rb:73). */
export function renderOptSkipPerms(renderOpts: Record<string, unknown>): boolean {
  return renderOpts["skip_perms"] === true;
}

/** format/error.rb:27-31 view_for_denial — `view_setting(:denial, view) ||
 *  :denial`. The captured surface (view-registry-directives-oracle.json,
 *  2026-09-29) carries FIVE denial: :blank directives on the surveyed
 *  cards: menu (menu.rb:8), edit_link (menu.rb:16), list_of_changes
 *  (card-mod-follow set/all/notify/base_views.rb:6), comment_box
 *  (card-mod-comment set/all/comment.rb:46), universal_edit_button
 *  (html/head.rb:39 — its Anonymous blank arm is additionally pinned in
 *  bar-box-format-views.json 2026-09-28). comment_box is still a non-ported
 *  view, listed for the record. configure_button joins as a SET-scoped one
 *  (card-mod-format set/type/cardtype.rb:61 `denial: :blank`, invisible to
 *  the all-set survey) — live serves zero configure strings for the
 *  anonymous surface (live_News_Item.html is 74KB with no "configure" byte;
 *  the denied render degrades to EMPTY, not the quiet-denial span). Absent =
 *  Ruby's :denial view. */
const DENIAL_VIEW = new Map<string, string>([
  ["menu", "blank"],
  ["edit_link", "blank"],
  ["list_of_changes", "blank"],
  ["universal_edit_button", "blank"],
  ["comment_box", "blank"],
  ["configure_button", "blank"],
]);

/** format/error.rb:27-31 view_for_denial — the replacement view name for a
 *  denied render (undefined = Ruby's :denial view). */
export function viewDenialView(view: string): string | undefined {
  return DENIAL_VIEW.get(view);
}

/**
 * The denial view's rendered bytes for the captured html surface.
 *
 * :denial (card-mod-format set/all/html/error.rb:83-85) renders
 * `focal? ? loud_denial : quiet_denial`. The engine render surface is
 * non-focal in every captured context (capture-corpus.rb renders
 * `card.format.render(view)`: show_layout? true, main? false ->
 * html_format.rb:16 focal? false), so the quiet branch is the byte oracle:
 *
 *     def quiet_denial                       # error.rb:185-189
 *       wrap_with :span, class: "denied" do
 *         "<!-- Sorry, you don't have permission (#{@denied_task}) -->"
 *       end
 *     end
 *
 * @denied_task is `crud?(task) && task` (permission.rb:49 -> error.rb:28) —
 * the task symbol for CRUD tasks, FALSE for method-predicate tasks (Ruby
 * string interpolation of false is "", so those spans read "..." between
 * the parens). The corpus pins the read label 124,632 times and never any
 * other task.
 *
 * The loud branch (error.rb:191-210, the framed "Sorry" page) only fires
 * for focal renders (main? true) — a page-layer concern; the engine never
 * sets main, so it is unreachable here (documented remainder in
 * ).
 */
export function quietDenial(task = "read"): string {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}

/** What the gate needs from its host: the per-task verdict source (the
 *  engine's precomputed ok_to_<task>? state — read from the verdict map,
 *  non-read through the isTaskDenied hook) plus the normalized render
 *  options and the new-card flag the format already holds. */
export interface ViewPermsGateInput {
  /** The voo's normalized options — skip_perms rides here
   *  (permission.rb:26). */
  readonly renderOpts: Record<string, unknown>;
  /** format/error.rb:6 — `task = :create if task == :update &&
   *  card.new_card?`. Ruby new_card? = not in the database; the port's
   *  equivalent for prepared render cards is id === undefined. */
  readonly isNewCard?: boolean;
  /** format/error.rb:5-8 ok? — undefined means "cannot be verified"
   *  (the port's rule-less/partial-deck divergence, same contract as
   *  canReadByRuleLookup in read-rules.ts). */
  readonly taskAllowed: (task: CrudTask) => boolean | undefined;
  /** THIS render's format class name ("html" default). The denial VIEW's
   *  body is format-dependent: the html override is
   *  `focal? ? loud_denial : quiet_denial` (set/all/html/error.rb:75-77 —
   *  the quiet span), while the BASE format's :denial is
   *  `focal? ? t(:format_denial) : ""` (set/all/error.rb:13-15) — EMPTY
   *  for a nested render. The email_text dispatch (card-mod-email's
   *  text-message :core) renders through the base lineage
   *  (EmailTextFormat < TextFormat < Format), so its denials are "":
   *  exactly why the follower notification's TEXT message renders
   *  `was just  by` (double space) where the html message renders the
   *  span. Optional: absent means the html shape (every caller
   *  outside the email-text format). */
  readonly formatName?: string;
  /** permission.rb:61 method predicates — `format.send task` for the
   *  non-CRUD perms directives. can_configure? (cardtype.rb:68-70) is the
   *  one ported predicate; the hook returns undefined for predicates it
   *  cannot verify. Optional: an absent hook leaves every predicate
   *  view unverified-allowed (the documented remainder). */
  readonly predicateAllowed?: (predicate: string) => boolean | undefined;
}

/**
 * The altered_view denial decision for a KNOWN card (permission.rb:19-23
 * after the caller handled alter_unknown): undefined = render the view;
 * a string = the denial bytes that REPLACE the whole view (the check runs
 * before hooks and dispatch, so nothing else of the view renders).
 *
 * Order per permission.rb:
 *   1. skip_check? (:25-27) — perms :none or the skip_perms option
 *   2. denial (:46-50) — first failing task of view_perms (CRUD tasks
 *      check the precomputed ok_to_<task>? verdicts; METHOD predicates
 *      resolve through the optional predicateAllowed hook — can_configure?
 *      is the one ported predicate (cardtype.rb:68-70); an absent hook or
 *      an unported predicate keeps the documented remainder: allowed)
 *   3. view_for_denial (format/error.rb:27-31) — `denial:`-configured
 *      views render that view instead of :denial; :blank renders "".
 */
export function viewPermissionDenial(
  view: string,
  input: ViewPermsGateInput,
): string | undefined {
  const resolution = resolveViewPerms(view);
  if (!resolution.check) return undefined; // permission.rb:26 view_perms == :none
  if (renderOptSkipPerms(input.renderOpts)) return undefined; // :26 skip_perms
  let deniedLabel: string;
  if (resolution.predicate) {
    // permission.rb:61 format.send task — method predicates route through
    // the gate input's predicateAllowed hook; only a FAILING predicate
    // denies (denied_task's `find` semantics).
    if (input.predicateAllowed?.(resolution.task) !== false) return undefined;
    // permission.rb:49 crud?(task) && task — false for method predicates
    // (Ruby interpolates it as "").
    deniedLabel = "";
  } else {
    let task = resolution.task;
    if (task === "update" && input.isNewCard === true) task = "create"; // format/error.rb:6
    if (input.taskAllowed(task) !== false) return undefined; // denied_task: only a FAILING task denies
    deniedLabel = task; // permission.rb:49 crud? && task — CRUD tasks label the span
  }
  if (viewDenialView(view) === "blank") return ""; // view_for_denial -> :blank renders ""
  // The :denial view's format body (set/all/error.rb:13-15 vs
  // set/all/html/error.rb:75-77): non-html formats render the BASE :denial,
  // which for a NESTED (non-focal) render is "". Every email_text dispatch
  // is nested (it is the body of the html-message page's :core), so the
  // base bytes are "" here; the focal branch (t(:format_denial)) is a
  // documented remainder — no captured surface renders a focal email_text
  // denial.
  if (input.formatName !== undefined && input.formatName !== "html") return "";
  return quietDenial(deniedLabel);
}
