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
// DELIBERATE DIFFERENCE for :debug_server_error. Stock Ruby cannot render
// it: better_errors reaches a deck only through card-mod-monkey, a
// development-group gem, so in a deck built from its generated Gemfile the
// constant lookup raises "NameError: uninitialized constant
// Card::Set::All::Html::Error::BetterErrors" on every card
// (tools/oracle/debug-server-error-probe.rb). That is a crash, which the
// port does not copy; and the page it was meant to show (source, locals,
// the backtrace, a live console) must never reach a production visitor. The
// port renders the :server_error view in its place, through the same
// render! a view body's render_server_error takes, so the two cannot
// drift: the page neither crashes nor reveals anything a visitor could not
// already see.

import type { ViewFn } from "./format.js";

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

/** view :debug_server_error (set/all/html/error.rb:4-8), rendered as
 *  :server_error (see the header: a deliberate difference from Ruby's
 *  NameError). */
export const debugServerErrorView: ViewFn = ({ fmt }) => fmt.renderDelegated("server_error");
