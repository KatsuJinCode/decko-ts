// View permission directives for the captured html-format surface: which
// views check read permission at all, and which view a denial renders
// instead.
//
// Ruby truth (card-1.110.0 lib/card/view/permission.rb):
// - view_perms (permission.rb:13-15): `setting(:perms) || :read` — every
//   view checks :read unless its definition carries a perms directive.
// - skip_check? (permission.rb:25-27): skip when the render options carry
//   skip_perms or the view's perms is :none.
//
// The registry below is the directive table for the views the port
// registers (src/card/render/views.ts). Per the Set::Format machinery
// (lib/card/set/format/abstract_format/view_opts.rb:59-64), a directive
// becomes a `_view_<name>__<setting>` method on the module where `view`
// ran — the BASE format module for `format do` blocks — and format
// subclasses (HtmlFormat) inherit it even when they redefine the view
// BODY (card-mod-format set/all/title.rb does exactly that: base :title is
// `perms: :none` at line 2, html :title at line 12 only replaces the
// block). That inheritance is why the corpus capture records full :title
// renders for cards whose :closed/:open/:content views are denied.
//
// `denial:` directives (view_setting(:denial, view), format/error.rb:27-31)
// name the view a denial renders instead of :denial. The captured surface
// has one: :menu (card-mod-format set/all/html/menu.rb:8 `denial: :blank`).

/** The perms directive a view resolves to ("read" is Ruby's default). */
export type ViewPerms = "read" | "none";

/** Views whose definition carries `perms: :none` — they render without any
 *  permission check (view/permission.rb:25-27 skip_check?). */
const PERMS_NONE = new Set<string>([
  // card-mod-format set/all/title.rb:2 (base format; html body redefined
  // at :12, directive inherited — see the module doc)
  "title",
  // card-mod-format set/all/base.rb:109 `view :blank, compact: true,
  // perms: :none` (reachable as a denial target)
  "blank",
]);

/** view_setting(:denial, view) — the view a denial renders instead of
 *  :denial (format/error.rb:27-31). Absent for a view means :denial (the
 *  quiet/loud span). */
const DENIAL_VIEW = new Map<string, string>([
  // card-mod-format set/all/html/menu.rb:8 `view :menu, denial: :blank`
  ["menu", "blank"],
]);

/** permission.rb:13-15 `setting(:perms) || :read` for the ported views. */
export function viewPerms(view: string): ViewPerms {
  return PERMS_NONE.has(view) ? "none" : "read";
}

/** format/error.rb:27-31 view_for_denial — the replacement view name for a
 *  denied render (undefined = Ruby's :denial view). */
export function viewDenialView(view: string): string | undefined {
  return DENIAL_VIEW.get(view);
}

/**
 * The denial view's rendered bytes for the captured html surface.
 *
 * :denial (card-mod-format set/all/html/error.rb:75-77) renders
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
 * @denied_task is the failing task from view_perms (permission.rb:56-64
 * denied_task + format/error.rb:28) — "read" for this port (every checked
 * view's perms is the :read default).
 *
 * The loud branch (error.rb:191-210, the framed "Sorry" page) only fires
 * for focal renders (main? true) — a page-layer concern; the engine never
 * sets main, so it is unreachable here (documented remainder in
 * docs/permissions-port-notes.md).
 */
export function quietDenial(task = "read"): string {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}
