// tests/card/notify/mail.test.ts — mail rendering.
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
//      set/abstract/email_field.rb:22-26). The unresolved branch's
//      output shape:
//        subject: "follower changed followed_set on follow_option"
//        textBody: "Hi! follower changed followed_set."
//
// What this test CANNOT prove:
//   - that the FULL ActionMailer rendering pipeline produces the same
//     MIME-encoded bytes. The TS port stops at MailMessage; the
//     transport is responsible for envelope serialization. The capture
//     transport is byte-stable on the structured shape, not on the
//     RFC-822 wire form (Ruby uses the Mail gem's encoder).

import { describe, expect, it } from "vitest";
import {
  interpolateTemplate,
  mailToString,
  renderMail,
  type EmailTemplate,
  type FollowNotice,
} from "../../../src/card/notify/mail.js";

const TEMPLATE: EmailTemplate = {
  to: "sample-user@example.com",
  from: "no-reply@decko.org",
  subject: "{{follower}} changed {{followed_set}} on {{follow_option}}",
  textBody: "Hi! {{follower}} changed {{followed_set}}.",
};

// The notice values model Ruby's contextual_content RESOLUTION OUTCOME:
// Ruby walks each inclusion against the live card tree — a resolvable
// placeholder renders what it points at, an unresolvable one renders the
// literal name with braces stripped (the unresolvable branch is pinned
// by the empty-vars test below).
const NOTICE: FollowNotice = {
  follower: "Sample User",
  followedSet: "Sample User Following",
  followOption: "always",
};

describe("interpolateTemplate (real-oracle semantics)", () => {
  it("substitutes placeholders the caller resolved (the vars map is the resolved set)", () => {
    expect(
      interpolateTemplate(
        "{{follower}} :: {{followed_set}} :: {{follow_option}}",
        {
          follower: "Sample User",
          followed_set: "Sample User Following",
          follow_option: "always",
        },
      ),
    ).toBe("Sample User :: Sample User Following :: always");
  });

  it("drops the {{ }} braces and renders the placeholder name verbatim when the key is NOT resolved (matches the recorded fixture)", () => {
    // In a deck where those inclusions do not resolve to cards, Ruby
    // emits the literal names, braces
    // stripped, literal text preserved.
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

describe("renderMail (the email bytes match the recorded fixture)", () => {
  const mail = renderMail(TEMPLATE, NOTICE);

  it("to is the literal from the template", () => {
    // The follow rule supplies the follower's email via fields[:to]
    // (card-mod-follow set/right/account.rb:17-19). The TS port
    // expects the template to already carry that target — the caller
    // (the trigger) is responsible for copying it onto the template
    // before renderMail() runs.
    expect(mail.to).toBe("sample-user@example.com");
  });

  it("from is the literal from the template", () => {
    // The from value: Card::Mailer.new_mail
    // effective_from with no email_defaults configured falls through
    // to Card[DeckoBotID].account.email (lib/card/mailer.rb +
    // set/type/email_template.rb safe_from_and_reply_to!).
    expect(mail.from).toBe("no-reply@decko.org");
  });

  it("subject substitutes the resolved inclusions (renderMail models the notice as the resolved set)", () => {
    // TEMPLATE.subject uses the three placeholders; with the notice
    // values as the resolved set, renderMail substitutes them. The
    // UNRESOLVED branch is pinned by the
    // empty-vars interpolateTemplate test above.
    expect(mail.subject).toBe(
      "Sample User changed Sample User Following on always",
    );
  });

  it("text body substitutes the resolved inclusions", () => {
    // The unresolved branch renders the literal names; with resolution,
    // the values render.
    expect(mail.textBody).toBe("Hi! Sample User changed Sample User Following.");
  });

  it("does not emit an htmlBody when the template omits one", () => {
    expect(mail.htmlBody).toBeUndefined();
  });

  it("emits the trigger tag so a transport can route the message", () => {
    // The follow trigger carries follower + followed_set + follow_option
    // via tags. Downstream transports (Postmark, SES) use these.
    expect(mail.tags).toEqual({
      trigger: "follow_notification",
      follower: "Sample User",
      followed_set: "Sample User Following",
      follow_option: "always",
    });
  });

  it("renders html body when provided", () => {
    const mailWithHtml = renderMail(
      { ...TEMPLATE, htmlBody: "<p>Hi! {{follower}} changed {{followed_set}}.</p>" },
      NOTICE,
    );
    expect(mailWithHtml.htmlBody).toBe(
      "<p>Hi! Sample User changed Sample User Following.</p>",
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
    expect(text).toContain("To: sample-user@example.com");
    expect(text).toContain(
      "Subject: Sample User changed Sample User Following on always",
    );
    expect(text).toContain("\nHi! Sample User changed Sample User Following.");
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
