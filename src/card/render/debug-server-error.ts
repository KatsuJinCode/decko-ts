// card-mod-format set/all/html/error.rb view :debug_server_error, the view a
// server error report picks when the session's *debugger card is on
// (card-1.110.0 lib/card/error.rb ServerError.view):
//
//   view :debug_server_error, wrap: { modal: { size: :full } } do
//     error_page = BetterErrors::ErrorPage.new Card::Error.current,
//                                              "PATH_INFO" => request.env["REQUEST_URI"]
//     haml :debug_server_error, {}, error_page
//   end
//
// BetterErrors is never loaded in a stock deck. The gem reaches a deck only
// through card-mod-monkey, a development-group dependency; the bundle a
// generated deck's Gemfile builds does not contain it. The
// constant is resolved before any argument is evaluated, so on every card,
// with or without a current server error, the view body raises
//
//   NameError: uninitialized constant Card::Set::All::Html::Error::BetterErrors
//
// (the message the oracle app logs; tools/oracle/debug-server-error-probe.rb).
// The render rescue then does what it does for any raise: a nested render
// becomes the quiet "Error rendering: <name> (debug_server_error view)"
// span, and a focal render propagates the error. The port raises the same
// error from the same place, so both rescues apply unchanged.

import type { ViewFn } from "./format.js";
import { uninitializedConstantError } from "./errors.js";

/** The set module the view body is evaluated in (Ruby's lexical scope for
 *  the constant lookup). */
const VIEW_SCOPE = "Card::Set::All::Html::Error";

/** view :debug_server_error (set/all/html/error.rb:4-8). */
export const debugServerErrorView: ViewFn = () => {
  throw uninitializedConstantError(VIEW_SCOPE, "BetterErrors");
};
