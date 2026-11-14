// The validate-stage errors.add seam: the one place a mod event body adds
// errors to the acting card and refuses the save, the way Ruby's validate
// events do.
//
// RUBY. A validate-stage event body adds errors to the acting card
// (card-mod-list set/abstract/01_list/events.rb:18/:32
// `errors.add :content, <message>`), and when the stage ends with errors
// standing the save refuses: the controller answers 422 and renders the
// errors - the HTML errors view's standard_errors alert carries ONE
// "<KEY>: <message>" paragraph per error (card-mod-format
// set/all/html/error.rb:120-134) and the JSON errors view answers
// {attribute => message}, a later message for the same attribute replacing
// an earlier one (error.rb's format :json view :errors).
//
// THE PORT. The mod-event dispatch awaits each event body and binds its
// result to nothing (mod-event-dispatch.ts runEvent), so the only way a
// validate-stage body refuses the save is a THROW - the carrier every
// ported validate body already uses (the engine's refuseContentChange /
// refuseTypeChange callbacks, card-action-engine.ts; :validate_number and
// :validate_json in card-mod-format.ts). This seam composes that throw the
// way Ruby's errors array composes the refusal: every message rides along
// (the alert body is Ruby's standard_errors lines, "CONTENT: <message>"
// per error, and write-routes.ts jsonErrorsViewHash reads those same lines
// back when no explicit attribute map is given), and the explicit
// attribute map carries the LAST message per attribute, which is Ruby's
// JSON view answer for repeated attributes.
//
// The write route maps the "user-error" code to 422 (errorStatus), the
// status Ruby's validation failure carries.

import { CardActionError } from "../actions/types.js";

/** errors.add + the refusal, for one validate-stage body. `attribute` is
 *  Ruby's error key symbol ("content"); `messages` are the bare messages
 *  in the order the body added them. One throw per save: Ruby's events add
 *  ALL their messages before the save checks errors.any?, so a body that
 *  found several problems reports several, not just the first. */
export function addValidationErrors(
  cardName: string,
  attribute: string,
  messages: readonly string[],
): never {
  if (messages.length === 0) {
    // errors.add with nothing to add is a caller bug, not a validation
    // outcome: the guard keeps the seam honest rather than inventing an
    // empty refusal.
    throw new Error(
      `addValidationErrors: no messages to add for :${attribute} on ${cardName}`,
    );
  }
  const key = attribute.toUpperCase();
  const last = messages[messages.length - 1]!;
  throw new CardActionError(
    "user-error",
    messages.join("\n"),
    messages.map((message) => `${key}: ${message}`).join("\n"),
    { [attribute]: last },
    cardName,
  );
}
