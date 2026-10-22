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

/** The same message as the browser hands it back: the DECODED text.
 *
 *  The check reads the page through the browser, so what it reads is the DOM
 *  serialization, and a serializer writes the text content's apostrophe as
 *  an apostrophe - it does not re-escape it. The page's own bytes carry
 *  Ruby's `h` escapes (&#39;), and the signed-in page of 2026-10-22 carries
 *  the decoded form
 *  (.runtime/edge-signed-in/tranche6-base/report.md.raw/
 *  194-typed-fixture-create.html: `must be unique; 'Harness_CB_Cereal'
 *  already exists.`). Both are the same answer; the check accepts either,
 *  because a page read from the wire carries the first and a page read
 *  through the browser carries the second. */
export function rubyNameExistsMessageText(name) {
  return `must be unique; '${name}' already exists.`;
}

/** Every `role="alert"` region on the page, with its class list and its
 *  own inner content. The page carries MORE than one: Decko's own guide
 *  block is an alert too (the captured signed-in page carries
 *  `<div class="guide alert alert-secondary alert-dismissible " role="alert">`
 *  above the error), and the first one on the page is not the error. */
function alertRegions(html) {
  const source = String(html);
  const regions = [];
  const open = /<div\b([^>]*)>/gi;
  for (let m = open.exec(source); m !== null; m = open.exec(source)) {
    const attrs = m[1];
    if (!/role\s*=\s*["']alert["']/i.test(attrs)) continue;
    const classAttr = /class\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    const classes = classAttr === null ? "" : classAttr[2];
    const contentStart = m.index + m[0].length;
    const scanner = /<(\/?)div\b(?:"[^"]*"|[^>"])*?>/g;
    scanner.lastIndex = contentStart;
    let depth = 0;
    let inner = null;
    for (let hit = scanner.exec(source); hit !== null; hit = scanner.exec(source)) {
      if (hit[1] === "/") {
        if (depth === 0) {
          inner = source.slice(contentStart, hit.index);
          break;
        }
        depth -= 1;
      } else if (!/\/>$/.test(hit[0])) {
        depth += 1;
      }
    }
    if (inner === null) inner = source.slice(contentStart);
    regions.push({ classes, inner });
  }
  return regions;
}

/** The error alert's own region: the div with Ruby's alert classes, its
 *  heading and its messages.
 *
 *  THE DEFECT THIS FIXES. The region was the FIRST `div[role="alert"]` on
 *  the page, and on a signed-in Decko page the first one is the deck's own
 *  GUIDE alert (class "guide alert alert-secondary alert-dismissible "), not
 *  the error. The signed-in run of 2026-10-22 at this tip recorded the
 *  visible-error leg as failures ["alertClass","heading","message"] with
 *  heading null, message null and alertClasses null, on a page whose error
 *  alert carried Ruby's bytes exactly
 *  (.runtime/edge-signed-in/tranche6-base/report.md.raw/194-typed-fixture-create.html
 *  carries the whole answer: `<div class="alert alert-warning
 *  alert-dismissible  card-error-msg" role="alert">` with the
 *  "Problems with <card>" heading and the standard_error_message
 *  paragraph). The region is now the alert that carries the ERROR's own
 *  markers: Ruby's heading (set/all/html/error.rb:120-127), or the
 *  class_up "card-error-msg" (error.rb:63) when the heading is not there.
 *  The class list is then GRADED, so an alert with the right heading and
 *  the wrong class still reports "alertClass" instead of vanishing. */
export function errorAlertRegion(html) {
  const regions = alertRegions(html);
  if (regions.length === 0) return null;
  const byHeading = regions.find((region) =>
    /<h4 class="alert-heading error">/.test(region.inner),
  );
  if (byHeading !== undefined) return byHeading;
  const byErrorClass = regions.find((region) =>
    region.classes.split(/\s+/).includes("card-error-msg"),
  );
  if (byErrorClass !== undefined) return byErrorClass;
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
  // The message: the standard_error_message paragraph. Ruby's bytes carry
  // the `h`-escaped apostrophes; the browser's DOM serialization carries the
  // decoded text. Both are the same answer, and both are accepted.
  const message = /<p><strong>NAME:<\/strong> ([^<]*)<\/p>/.exec(alert.inner);
  const messageText = message === null ? null : message[1];
  if (
    messageText !== rubyNameExistsMessage(name) &&
    messageText !== rubyNameExistsMessageText(name)
  ) {
    failures.push("message");
  }
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

/**
 * The error alert out of the page's alerts, by Ruby's OWN class_up.
 *
 * The page carries more than one `role="alert"` element: Decko's own guide
 * block is one (the captured signed-in page carries `<div class="guide
 * alert alert-secondary alert-dismissible " role="alert">` above the
 * error), and the first one on the page is not the error. The error alert
 * is the one that carries "card-error-msg" (card-mod-format
 * set/all/html/error.rb:63, `class_up "alert", "card-error-msg"`).
 *
 * `alerts` is what the browser reports: one entry per role="alert"
 * element, with its class attribute and whether it is hidden.
 */
export function pickErrorAlert(alerts) {
  const list = Array.isArray(alerts) ? alerts : [];
  return (
    list.find((alert) =>
      String(alert?.classes ?? "")
        .split(/\s+/)
        .includes("card-error-msg"),
    ) ?? null
  );
}

/**
 * The refused create's error, read off the page the error is ON.
 *
 * `page` is the browser page. Both readings happen here, in this order,
 * and the caller must call this BEFORE it navigates anywhere else: the
 * next navigation replaces the page, and a visibility reading taken after
 * it belongs to a page that never carried the error. The signed-in run of
 * 2026-10-22 at this tip read it after the visit to /Home and recorded
 * alertClasses null, hidden null - the leg failed on a page whose error
 * alert carried Ruby's bytes exactly.
 *
 * The browser reports the MEASUREMENTS of every alert; the PICK is made
 * here, so the rule that chooses the error alert is testable without a
 * browser.
 */
export async function readRefusedCreateError(page) {
  const body = await page.content();
  const alerts = await page.evaluate(() => {
    return [...document.querySelectorAll('div[role="alert"]')].map((el) => {
      const style = window.getComputedStyle(el);
      return {
        classes: el.getAttribute("class"),
        hidden:
          style.display === "none" ||
          style.visibility === "hidden" ||
          el.getClientRects().length === 0,
      };
    });
  });
  return { body, visibleAlert: pickErrorAlert(alerts) };
}
