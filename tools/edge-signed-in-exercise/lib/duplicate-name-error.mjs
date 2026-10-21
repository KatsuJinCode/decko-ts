// The visible validation error a refused duplicate-name create shows, read
// off the bytes Ruby renders.
//
//   card-1.110.0 mod/core/set/all/name_events.rb:3-9,12-20
//     event :validate_name, :validate, on: :save, changed: :name do
//       validate_legality_of_name
//       return if errors.any?
//       Card.write_to_temp_cache self
//       validate_uniqueness_of_name
//     end
//     event :validate_uniqueness_of_name do
//       return unless (existing_id = Lexicon.id key) && existing_id != id
//       return unless (existing_card = Card.where(id: existing_id, trash: false).take)
//       errors.add :name, t(:core_error_name_exists, name: existing_card.name)
//     end
//   card-1.110.0 mod/core/config/locales/en.yml:15
//     core_error_name_exists: must be unique; '%{name}' already exists.
//
// The error is a normal (non-:abort) error, so it renders through
// standard_error_message (card-mod-format-0.20.0 set/all/error.rb:32-40 ->
// set/all/html/error.rb:133-134):
//
//   "<p><strong>NAME:</strong> must be unique; 'Home' already exists.</p>"
//
// inside the errors alert (set/all/html/error.rb:120-127 standard_errors =
// alert "warning", true; card-mod-layout-0.20.0 set/all/alert.rb:10-15
// appends "alert-dismissible " WITH its trailing space, and classy joins the
// list with another, so the class string carries TWO spaces before the
// card-error-msg class_up adds).
//
// The committed oracle is the write battery's own Ruby answer:
// reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
// step "create-duplicate-name" (status 422), whose body carries exactly:
//
//   <div class="alert alert-warning alert-dismissible  card-error-msg" role="alert">
//   <button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>
//   <h4 class="alert-heading error">Problems with Parity Probe Card</h4>
//   <p><strong>NAME:</strong> must be unique; &#39;Parity Probe Card&#39; already exists.</p></div>
//
// Registry row cap-C8 (tools/edge-signed-in-exercise/capabilities.json, id C8)
// recorded "Refusal and unchanged Home checked; visible validation error is
// not asserted." The harness graded /already|taken|exists/i over the whole
// page after the refused submit - a regex any page mentioning a word can
// satisfy, with no check that the error was SHOWN, no attribute, and no
// message. This module reads the alert, its heading and its message.

/** Ruby's alert class list, byte for byte: "alert-dismissible " keeps its
 *  trailing space and classy joins with another, so there are TWO spaces
 *  before card-error-msg (card-mod-layout-0.20.0 set/all/alert.rb:10-15 and
 *  card-mod-format-0.20.0 set/all/html/error.rb:63). */
export const RUBY_ALERT_CLASS = "alert alert-warning alert-dismissible  card-error-msg";

/** Ruby's message for a name that is taken
 *  (card-1.110.0 mod/core/config/locales/en.yml:15). The apostrophes are
 *  HTML-escaped by Ruby's `h` (set/all/html/error.rb:134). */
export function rubyNameExistsMessage(name) {
  return `must be unique; &#39;${name}&#39; already exists.`;
}

/** The error alert's own region: the div with Ruby's alert classes, its
 *  heading and its messages. */
export function errorAlertRegion(html) {
  const source = String(html);
  const open = /<div\b[^>]*class="([^"]*)"[^>]*role="alert"[^>]*>/i.exec(source);
  if (open === null) return null;
  const classes = open[1];
  const start = open.index;
  const scanner = /<(\/?)div\b(?:"[^"]*"|[^>"])*?>/g;
  scanner.lastIndex = start + open[0].length;
  let depth = 0;
  for (let hit = scanner.exec(source); hit !== null; hit = scanner.exec(source)) {
    if (hit[1] === "/") {
      if (depth === 0) return { classes, inner: source.slice(start + open[0].length, hit.index) };
      depth -= 1;
    } else if (!/\/>$/.test(hit[0])) {
      depth += 1;
    }
  }
  return null;
}

/**
 * The duplicate-name error, as the page shows it. `name` is the card whose
 * name was already taken.
 */
export function duplicateNameError(html, name) {
  const failures = [];
  const alert = errorAlertRegion(html);
  if (alert === null) {
    return { ok: false, failures: ["noErrorAlert"], alert: null, heading: null, message: null };
  }
  // The class list, byte for byte.
  if (alert.classes !== RUBY_ALERT_CLASS) failures.push("alertClass");
  // The heading: "Problems with <card name>" (set/all/html/error.rb:120-127
  // and the t(:format_problems_name) string).
  const heading = /<h4 class="alert-heading error">([^<]*)<\/h4>/.exec(alert.inner);
  const headingText = heading === null ? null : heading[1];
  if (headingText !== `Problems with ${name}`) failures.push("heading");
  // The message: the standard_error_message paragraph, with Ruby's escaped
  // apostrophes.
  const message = /<p><strong>NAME:<\/strong> ([^<]*)<\/p>/.exec(alert.inner);
  const messageText = message === null ? null : message[1];
  if (messageText !== rubyNameExistsMessage(name)) failures.push("message");
  return {
    ok: failures.length === 0,
    failures,
    alert: { classes: alert.classes },
    heading: headingText,
    message: messageText,
  };
}

/**
 * The check's own predicate: the error is SHOWN (the alert is in the visible
 * part of the page, not a hidden template) and it is the duplicate-name
 * error. `visibleClasses` is the class list the browser reports for the
 * alert element; an element with `display: none` or `hidden` is not shown.
 */
export function showsVisibleValidationError(html, name, visibleClasses = null) {
  const error = duplicateNameError(html, name);
  const failures = [...error.failures];
  if (visibleClasses !== null && visibleClasses !== RUBY_ALERT_CLASS) {
    failures.push("notVisible");
  }
  return { ok: failures.length === 0, failures, error };
}
