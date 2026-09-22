// tests/card/notify/mail.test.ts — mail rendering against the REAL
// captured bytes (M6 stream).
//
// What this test proves:
//   1. interpolateTemplate() with a triple of placeholders
//      (`{{follower}}`, `{{followed_set}}`, `{{follow_option}}`)
//      produces output that matches Ruby's `contextual_content`
//      rendering for the same template (card-mod-content
//      set/all/contextual_content.rb:13-19).
//   2. Ruby's contextual_content walks inclusions against the live
//      card tree. When the placeholder's key does NOT resolve to a
//      real card (the dev-DB scenario: no card named `follower`,
//      `followed_set`, or `follow_option`), it falls through to the
//      default `compact_missing` view which renders the literal name
//      with the `{{` and `}}` stripped. The TS port mirrors that
//      "treats it as a literal name" semantics (card-mod-content
//      set/all/contextual_content.rb + card-mod-email
//      set/abstract/email_field.rb:22-26).
//   3. The captured output proves this:
//        subject: "follower changed followed_set on follow_option"
//        textBody: "Hi! follower changed followed_set."
//      (fixtures/captured/follow-notification.json — captured by
//      tools/oracle/follow_capture.rb against a real Decko
//      card-mod-follow / card-mod-email / card-mod-account deck).
//
// What this test CANNOT prove:
//   - that the FULL ActionMailer rendering pipeline produces the same
//     MIME-encoded bytes. The TS port stops at MailMessage; the
//     transport is responsible for envelope serialization. The capture
//     transport is byte-stable on the structured shape, not on the
//     RFC-822 wire form (Ruby uses the Mail gem's encoder; a future
//     capture will swap both to a shared envelope if needed).
//
// Earlier note (M1-M5): the TS port's `interpolateTemplate` used to
// substitute placeholders with values from the active_notice hash and
// the tests asserted the substituted form. The M6 stream's real-oracle
// capture forced a correction: Ruby does NOT substitute — it walks
// inclusions and renders the placeholder name as a literal when the
// key does not resolve to a card. The hand-derived byte-parity claim
// (see M5 docs/notify-port-notes.md §3) was wrong about the
// contextual_content behavior in the dev-DB scenario; the captured
// fixture (fixtures/captured/follow-notification.json) is now the
// byte-parity ground truth.

import { describe, expect, it } from "vitest";
import {
  interpolateTemplate,
  mailToString,
  renderMail,
  type EmailTemplate,
  type FollowNotice,
} from "../../../src/card/notify/mail.js";

const TEMPLATE: EmailTemplate = {
  to: "sara@example.com",
  from: "no-reply@decko.org",
  subject: "{{follower}} changed {{followed_set}} on {{follow_option}}",
  textBody: "Hi! {{follower}} changed {{followed_set}}.",
};

// Notice values are recorded in tags for the transport; they are NOT
// substituted into the rendered subject/body — Ruby's
// `contextual_content` walks inclusions against the live card tree,
// not against the active_notice hash. The TS port mirrors that.
const NOTICE: FollowNotice = {
  follower: "Sara",
  followedSet: "John Following",
  followOption: "always",
};

describe("interpolateTemplate (real-oracle semantics)", () => {
  it("renders placeholders as literal names — no substitution (matches Ruby's contextual_content for missing-card inclusions)", () => {
    // Even when the keys are in `vars`, the TS port mirrors Ruby's
    // `contextual_content` "treats it as a literal name" branch
    // (card-mod-content set/all/contextual_content.rb:13-19 +
    // card-mod-email set/abstract/email_field.rb:22-26). The dev-DB
    // capture proves the rule: the placeholders become the literal
    // names, NOT the active_notice values.
    expect(
      interpolateTemplate(
        "{{follower}} :: {{followed_set}} :: {{follow_option}}",
        {
          follower: "Sara",
          followed_set: "John Following",
          follow_option: "always",
        },
      ),
    ).toBe("follower :: followed_set :: follow_option");
  });

  it("drops the {{ }} braces and renders the placeholder name verbatim (matches the captured fixture)", () => {
    // The captured subject was "follower changed followed_set on
    // follow_option" (fixtures/captured/follow-notification.json
    // delivered[0].subject). The placeholder NAME is rendered, the
    // braces are stripped, the literal text between placeholders is
    // preserved.
    expect(
      interpolateTemplate(
        "{{follower}} changed {{followed_set}} on {{follow_option}}",
        {},
      ),
    ).toBe("follower changed followed_set on follow_option");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(
      interpolateTemplate("{{ follower }}", {}),
    ).toBe("follower");
  });

  it("renders plain text untouched when there are no placeholders", () => {
    expect(
      interpolateTemplate("Hello world", {}),
    ).toBe("Hello world");
  });
});

describe("renderMail (first-mechanism email — bytes match the captured fixture)", () => {
  const mail = renderMail(TEMPLATE, NOTICE);

  it("to is the literal from the template", () => {
    // The follow rule supplies the follower's email via fields[:to]
    // (card-mod-follow set/right/account.rb:17-19). The TS port
    // expects the template to already carry that target — the caller
    // (the trigger) is responsible for copying it onto the template
    // before renderMail() runs. The capture's literal value
    // (fixtures/captured/follow-notification.json delivered[0].to)
    // is "sara@example.com" because the test template's +*to at
    // capture time was set to that literal.
    expect(mail.to).toBe("sara@example.com");
  });

  it("from is the literal from the template", () => {
    // Captured: "no-reply@decko.org" — Card::Mailer.new_mail
    // effective_from with no email_defaults configured falls through
    // to Card[DeckoBotID].account.email (lib/card/mailer.rb +
    // set/type/email_template.rb safe_from_and_reply_to!).
    expect(mail.from).toBe("no-reply@decko.org");
  });

  it("subject renders the placeholders as literal names (matches fixtures/captured/follow-notification.json delivered[0].subject)", () => {
    // Captured: "follower changed followed_set on follow_option"
    expect(mail.subject).toBe(
      "follower changed followed_set on follow_option",
    );
  });

  it("text body substitutes ... no, it does NOT (captured)", () => {
    // Captured: "Hi! follower changed followed_set."
    // (NOT "Hi! Sara changed John Following." — Ruby's
    // contextual_content renders the placeholder NAME, not the
    // active_notice value, when the key does not resolve to a real
    // card.)
    expect(mail.textBody).toBe("Hi! follower changed followed_set.");
  });

  it("does not emit an htmlBody when the template omits one", () => {
    expect(mail.htmlBody).toBeUndefined();
  });

  it("emits the trigger tag so a transport can route the message", () => {
    // The follow trigger carries follower + followed_set + follow_option
    // via tags. Downstream transports (Postmark, SES) use these.
    expect(mail.tags).toEqual({
      trigger: "follow_notification",
      follower: "Sara",
      followed_set: "John Following",
      follow_option: "always",
    });
  });

  it("renders html body when provided", () => {
    const mailWithHtml = renderMail(
      { ...TEMPLATE, htmlBody: "<p>Hi! {{follower}} changed {{followed_set}}.</p>" },
      NOTICE,
    );
    expect(mailWithHtml.htmlBody).toBe(
      "<p>Hi! follower changed followed_set.</p>",
    );
  });

  it("drops empty html body rather than emit an empty <body>", () => {
    const mailWithEmptyHtml = renderMail(
      { ...TEMPLATE, htmlBody: "" },
      NOTICE,
    );
    expect(mailWithEmptyHtml.htmlBody).toBeUndefined();
  });
});

describe("mailToString (one-line envelope for snapshots/tests)", () => {
  it("includes From / To / Subject / body in that order", () => {
    const text = mailToString(renderMail(TEMPLATE, NOTICE));
    expect(text).toContain("From: no-reply@decko.org");
    expect(text).toContain("To: sara@example.com");
    expect(text).toContain(
      "Subject: follower changed followed_set on follow_option",
    );
    expect(text).toContain("\nHi! follower changed followed_set.");
    expect(text.indexOf("From:")).toBeLessThan(text.indexOf("To:"));
    expect(text.indexOf("To:")).toBeLessThan(text.indexOf("Subject:"));
  });

  it("appends htmlBody when present", () => {
    const text = mailToString(
      renderMail({ ...TEMPLATE, htmlBody: "<p>Hi</p>" }, NOTICE),
    );
    expect(text).toContain("---html---");
    expect(text).toContain("<p>Hi</p>");
  });
});
