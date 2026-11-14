// card-mod-format set/all/html/error.rb, the html :server_error view and
// :debug_server_error, the view a server error report picks instead when
// the session's *debugger card is on (card-1.110.0 lib/card/error.rb
// ServerError.view):
//
//   view :server_error, template: :haml
//
//   view :debug_server_error, wrap: { modal: { size: :full } } do
//     error_page = BetterErrors::ErrorPage.new Card::Error.current,
//                                              "PATH_INFO" => request.env["REQUEST_URI"]
//     haml :debug_server_error, {}, error_page
//   end
//
// :server_error is what a production visitor sees for a server error: the
// deck's "Wild Card!" block (set/all/html/server_error.haml, the bytes the
// live site serves). It names no card, no exception and no code.
//
// :debug_server_error RAISES in stock Ruby. better_errors reaches a deck
// only through card-mod-monkey, a development-group gem, so in a deck built
// from its generated Gemfile the constant lookup at error.rb:5 raises
// "NameError: uninitialized constant Card::Set::All::Html::Error::BetterErrors"
// on every card (tools/oracle/debug-server-error-probe.rb; the stock
// synthetic-v2 capture pins it on view:admin:Note 001:debug_server_error,
// where the quiet non-focal rescue renders the admin debug span around the
// NameError). The port raises the same error on the same condition (the
// gem is not installed); the
// debug PAGE the view was meant to show (source, locals, a live console)
// still never renders — the raise precedes it, exactly as in Ruby.

import type { ViewFn } from "./format.js";
import { MOD_SPECS } from "../mod-loader/mods/core-admin-runtime.js";

/** Ruby's NameError (an uninitialized constant). */
class NameError extends Error {
  override name = "NameError";
}

/** set/all/html/server_error.haml as Haml renders it: attribute values in
 *  single quotes, one element per line, the h4 text on its own line. */
export const SERVER_ERROR_HTML =
  `<div class='border border-danger text-center p-3'>\n` +
  `<h1>Wild Card!</h1>\n` +
  `<h2 class='alert-danger'>500 Server Error</h2>\n` +
  `<h4 class='p-3'>\n` +
  `Yuck, sorry about that.\n` +
  `</h4>\n` +
  `</div>\n`;

/** view :server_error, template: :haml (set/all/html/error.rb:2). */
export const serverErrorHtmlView: ViewFn = () => SERVER_ERROR_HTML;

/** The installed mod that brings the better_errors gem into a deck:
 *  card-mod-monkey depends on it and is the only card-mod gem that does.
 *  BetterErrors is defined in the Ruby process exactly when that gem is
 *  loaded. */
const BETTER_ERRORS_MOD = "monkey";

/** view :debug_server_error (set/all/html/error.rb:4-8). The body's first
 *  expression is the constant lookup `BetterErrors::ErrorPage`
 *  (card-mod-format-0.20.0 set/all/html/error.rb:5). The port makes the same
 *  check against the installed gem set (MOD_SPECS): without card-mod-monkey
 *  the constant is undefined and the lookup raises stock Ruby's NameError.
 *  With it installed, Ruby would build the better_errors page; the engine
 *  has no port of BetterErrors::ErrorPage, so it says so instead of
 *  rendering anything that would pass for it. */
export const debugServerErrorView: ViewFn = () => {
  if (MOD_SPECS[BETTER_ERRORS_MOD] === undefined) {
    throw new NameError(
      "uninitialized constant Card::Set::All::Html::Error::BetterErrors",
    );
  }
  throw new Error(
    "debug_server_error: BetterErrors::ErrorPage (better_errors, via card-mod-monkey) is not ported",
  );
};
