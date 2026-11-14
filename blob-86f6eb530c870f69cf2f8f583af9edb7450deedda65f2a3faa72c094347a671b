// sign-in-surfaces.mjs — the surfaces the signed-in exercise's sign-in group
// grades, written down so they can be pinned to RUBY's own captured bytes.
//
// THE ROWS THIS SERVES. The roster's sign-in group is six rows, and all six
// are graded by the same instrument:
//
//   mx-B-001  admin signs in through the sign-in form and stays signed in
//   mx-B-002  member signs in through the sign-in form and stays signed in
//   mx-B-003  home shows the account name and Sign out
//   mx-B-004  stays signed in across navigation
//   mx-B-005  stays signed in after browser Back
//   mx-B-006  stays signed in after reload
//
// THE ORACLE. The repository carries a committed capture of a real Ruby
// deck's rendered views:
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl.
// The arms that matter here are:
//
//   probe-view:17:core@set/self/signin.rb
//     <form class="card-form slotter autosave" id="edit_card_269"
//     recaptcha="off" action="/update/*signin" accept-charset="UTF-8"
//     data-remote="true" method="post">
//     -> the sign-in form is a card's own form and posts to the card's own
//        update route.
//
//   probe-view:26:open@set/self/signin.rb
//     <div id="Xsignin-open-view" class="card-slot open-view ...
//     data-card-name="*signin" data-card-link-name="*signin" ...>
//     -> the sign-in card's key is *signin, which is the path the exercise
//        signs in at.
//
//   probe-view:29:title@set/self/signin.rb
//     <span class="card-title" title="Sign In">Sign In</span>
//
//   probe-view:406:sign_out@set/self/account_links.rb
//     <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>
//     -> the sign-out link, its class and its href.
//
// WHAT IS RUBY'S AND WHAT IS THE PORT'S OWN. The sign-out link's class, its
// href and its text are Ruby's own bytes, and the port renders the same
// bytes (src/card/render/navbar-views.ts:369). The session cookie's NAME is
// the port's own (src/server/write-routes.ts:363, decko_ts_session), and so
// is the signed-in marker the page carries (decko.signed_in). Those two are
// named-instrument facts and are NOT claimed as oracle-matched; the sign-in
// form, the sign-in card's key and the sign-out link are.

/** The sign-in card's key, which is the path the exercise signs in at. */
export const SIGN_IN_CARD_KEY = "*signin";

/** The class Ruby's sign-out link carries (set/self/account_links.rb). */
export const SIGN_OUT_LINK_CLASS = "signout-link";

/** The port's own signed-in marker. Not Ruby's: Ruby knows a signed-in
 *  visitor by its session, not by a page marker. */
export const SIGNED_IN_MARKER_RE = /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/;

/** The attributes of one tag, read with either quoting style. */
function readAttributes(tagText) {
  const attributes = {};
  const pattern = /([:@A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tagText)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(match[1] in attributes)) attributes[match[1]] = value;
  }
  return attributes;
}

/**
 * Ruby's sign-out link, read out of a page's markup.
 * @param {string} html
 * @returns {{ href: string|null, text: string, classes: string[] }|null}
 */
export function signOutLinkElement(html) {
  const source = String(html ?? "");
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(source)) !== null) {
    const attributes = readAttributes(match[1]);
    const classes = String(attributes.class ?? "").split(/\s+/).filter(Boolean);
    if (!classes.includes(SIGN_OUT_LINK_CLASS)) continue;
    return { href: attributes.href ?? null, text: match[2].replace(/<[^>]*>/g, "").trim(), classes };
  }
  return null;
}

/**
 * Whether the page carries a sign-out link.
 *
 * The rule is Ruby's own shape first - an anchor carrying the signout-link
 * class - and the plain text second, so a page that renders the words
 * without the class is still read as signed in, exactly as before.
 */
export function hasSignOut(html) {
  if (signOutLinkElement(html) !== null) return true;
  return /Sign out/.test(String(html ?? ""));
}

/**
 * The action the sign-in form posts to, read out of a page's markup.
 * @param {string} html
 * @returns {string|null}
 */
export function signInFormAction(html) {
  const source = String(html ?? "");
  const formPattern = /<form\b([^>]*)>/gi;
  let match;
  while ((match = formPattern.exec(source)) !== null) {
    const attributes = readAttributes(match[1]);
    if (!String(attributes.action ?? "").includes(SIGN_IN_CARD_KEY)) continue;
    return attributes.action;
  }
  return null;
}
