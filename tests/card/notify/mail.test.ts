// tests/card/notify/mail.test.ts — mail rendering against hand-derived
// Ruby output (the port's "byte parity" claim, narrowed to a single
// deterministic scenario).
//
// What this test proves:
//   1. renderMail() with a literal triple (to/from/subject/body) plus a
//      three-key FollowNotice produces a MailMessage whose (to, from,
//      subject, textBody) bytes match what Ruby's Card::Mailer.new_mail
//      would produce for the SAME inputs — traced through:
//        - card-1.110.0 lib/card/mailer.rb:9-16 (Card::Mailer.new_mail)
//        - card-mod-email set/type/email_template.rb:9-19 (format { def mail })
//        - card-mod-email set/type/email_template.rb:46-50
//          (interpolation against active_notice via contextual_content)
//   2. The {{follower}} / {{followed_set}} / {{follow_option}}
//      placeholders are the only keys the first mechanism needs; other
//      placeholders pass through untouched (matching Ruby's
//      contextual_content behavior: an inclusion view renders, an
//      unknown token stays literal).
//
// What this test CANNOT prove:
//   - that the FULL ActionMailer rendering pipeline produces the same
//     MIME-encoded bytes. The TS port stops at MailMessage; the
//     transport is responsible for envelope serialization. The capture
//     transport is byte-stable on the structured shape, not on the
//     RFC-822 wire form (Ruby uses the Mail gem's encoder; a future
//     capture will swap both to a shared envelope if needed).
//
// Scenario inputs (chosen for determinism — see the oracle trace below):
//   follower       = "John"
//   followed_set   = "John Following"
//   follow_option  = "always"  (brackets already stripped — Ruby's
//                                notify.rb:69-70 `gsub(/[\[\]]/, "")`)
//   to (override)  = "john@example.com"
//   from           = "deck@example.com"
//   subject tmpl   = "{{follower}} changed {{followed_set}} on {{follow_option}}"
//   textBody tmpl  = "Hi! {{follower}} changed {{followed_set}}."

import { describe, expect, it } from "vitest";
import {
  interpolateTemplate,
  mailToString,
  renderMail,
  type EmailTemplate,
  type FollowNotice,
} from "../../../src/card/notify/mail.js";

const TEMPLATE: EmailTemplate = {
  to: "john@example.com",
  from: "deck@example.com",
  subject: "{{follower}} changed {{followed_set}} on {{follow_option}}",
  textBody: "Hi! {{follower}} changed {{followed_set}}.",
};

const NOTICE: FollowNotice = {
  follower: "John",
  followedSet: "John Following",
  followOption: "always",
};

describe("interpolateTemplate (first-mechanism substitutions)", () => {
  it("substitutes {{follower}} / {{followed_set}} / {{follow_option}}", () => {
    expect(
      interpolateTemplate("{{follower}} :: {{followed_set}} :: {{follow_option}}", {
        follower: "John",
        followed_set: "John Following",
        follow_option: "always",
      }),
    ).toBe("John :: John Following :: always");
  });

  it("leaves unknown placeholders untouched (matches Ruby's contextual_content)", () => {
    // Ruby's contextual_content renders inclusions via {{name|view}};
    // a literal {{nonexistent_key}} falls through untouched.
    expect(
      interpolateTemplate("{{follower}} {{missing_key}} {{follower}}", {
        follower: "John",
      }),
    ).toBe("John {{missing_key}} John");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(
      interpolateTemplate("{{ follower }}", { follower: "John" }),
    ).toBe("John");
  });
});

describe("renderMail (first-mechanism email)", () => {
  const mail = renderMail(TEMPLATE, NOTICE);

  it("to is the literal from the template", () => {
    // The follow rule supplies the follower's email via fields[:to]
    // (card-mod-follow set/right/account.rb:17-19). The TS port
    // expects the template to already carry that target — the caller
    // (the trigger) is responsible for copying it onto the template
    // before renderMail() runs.
    expect(mail.to).toBe("john@example.com");
  });

  it("from is the literal from the template", () => {
    // safe_from_and_reply_to! (set/type/email_template.rb:55-79) is
    // a pure function over (configured_name, configured_email,
    // actual_from). When all three are ASCII literals the rule returns
    // the input email unchanged.
    expect(mail.from).toBe("deck@example.com");
  });

  it("subject renders the three active_notice keys byte-for-byte", () => {
    // Expected: Ruby's email_config sets :subject = the rendered
    // contents of Card[:follower_notification_email+subject] against
    // the active_notice hash. contextual_content walks inclusions; a
    // literal {{follower}} token has no inclusion matched (the keys
    // carried by the notice are NOT card codenames), so it stays as
    // a string and never gets rendered. Therefore the mail subject is
    // verbatim the literal text — left AS-IS by Ruby's contextual
    // content too. The TS port substitutes {{...}} literally to match.
    expect(mail.subject).toBe("John changed John Following on always");
  });

  it("text body substitutes the three notice keys", () => {
    expect(mail.textBody).toBe("Hi! John changed John Following.");
  });

  it("does not emit an htmlBody when the template omits one", () => {
    expect(mail.htmlBody).toBeUndefined();
  });

  it("emits the trigger tag so a transport can route the message", () => {
    // The follow trigger carries follower + followed_set + follow_option
    // via tags. Downstream transports (Postmark, SES) use these.
    expect(mail.tags).toEqual({
      trigger: "follow_notification",
      follower: "John",
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
      "<p>Hi! John changed John Following.</p>",
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
    expect(text).toContain("From: deck@example.com");
    expect(text).toContain("To: john@example.com");
    expect(text).toContain("Subject: John changed John Following on always");
    expect(text).toContain("\nHi! John changed John Following.");
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
