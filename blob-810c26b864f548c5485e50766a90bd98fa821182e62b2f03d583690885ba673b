// cap-W6 - the unfollow link in the follower mail, pinned against the Ruby
// bytes.
//
// WHAT IS PINNED, AND WHERE EACH PIN LIVES.
//
// 1. THE REAL RUBY MAIL. fixtures/captured/six-oracle-mails.json is the
//    committed capture of the real Ruby oracle's own mail delivery. Both
//    its follower scenarios carry Ruby's unfollow URL, byte for byte:
//
//      /update/Tova+*follow?card%5Bsubcards%5D%5BBasic%2B%2Atype%2BTova%2B%2Afollow%5D=%2Anever
//
//    which is base_views.rb:49-55: the follower's follow card, an update,
//    and the rule set to the never option as a SUB card. The predicate must
//    grade Ruby's own delivered link green.
//
// 2. THE REAL RUBY TEMPLATE. fixtures/captured/email-templates-raw-oracle.json
//    is the committed capture of the raw deck's email-template cards as Ruby
//    rendered them, and it carries the follower_notification_email's own
//    html message and text message:
//
//      <a href="">Unfollow</a> to stop receiving these emails.
//      Use this link to unfollow
//
//    That is the template's OWN rendering of the link, with the empty href
//    the view produces when there is no live follow rule. It is the pin for
//    the anchor text and for the text part's clause.
//
// 3. THE RUBY SOURCE FOR THE NEVER OPTION. The link's query carries the
//    never option, whose content is "*never" (set/all/follow/stop_follow_link.rb:6,
//    StopFollowLink's @rule_content). That gem file is vendored verbatim and
//    sha256-pinned here (test 1), the same discipline the card-mod-search
//    vendor uses.
//
// WHAT IS NOT CLAIMED. No signed-in run happens here, so nothing below says
// the live link passes. These are the link's shape and its contract, graded
// on Ruby's own bytes. The EFFECT leg (following the link stops the rule)
// needs a live deck and is exercised by the battery, not here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  readUnfollowLink,
  findUnfollowAnchor,
  findUnfollowTextUrl,
  unfollowLinkInMail,
  UNFOLLOW_ANCHOR_TEXT,
  UNFOLLOW_TEXT_CLAUSE,
  NEVER_OPTION,
  UNFOLLOW_LINK_CHECKS,
} from "../lib/unfollow-link-in-mail.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-follow-0.20.0/", import.meta.url);
const ORACLE_MAILS = new URL("../../../fixtures/captured/six-oracle-mails.json", import.meta.url);
const RAW_TEMPLATES = new URL("../../../fixtures/captured/email-templates-raw-oracle.json", import.meta.url);

const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "set/all/follow/stop_follow_link.rb": "6f6c36bbaeaa2a2b36af99105fbcb8dc11a1dc63c8a4ef8abeb4c61714f8ee1a",
};

const oracleMails = JSON.parse(readFileSync(ORACLE_MAILS, "utf8"));
const rawTemplates = JSON.parse(readFileSync(RAW_TEMPLATES, "utf8"));

/** The real Ruby's own delivered notice for one scenario. */
function rubyNotice(scenario) {
  const arm = oracleMails.scenarios[scenario];
  assert.ok(arm !== undefined, `committed oracle capture has no scenario ${scenario}`);
  const mail = arm.delivered[0];
  return { subject: mail.subject, textBody: mail.text_body, htmlBody: mail.html_body };
}

/** What the driver knows: the follower's live follow rule for the followed
 *  set, read from the capture's own input. */
function rubyExpectation(scenario) {
  const arm = oracleMails.scenarios[scenario];
  return { ruleName: arm.input.follow_rule.name, optionBefore: arm.input.follow_rule.option };
}

/** The template card's own parts, as Ruby rendered them. */
function rubyTemplate() {
  const html = rawTemplates.views["21796"].content;
  const text = rawTemplates.views["21797"].content;
  return { html, text };
}

test("the vendored Ruby stop-follow source is the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-follow-0.20.0`);
  }
});

test("the pinned Ruby source carries the never option the unfollow link writes", () => {
  const stop = readVendor("set/all/follow/stop_follow_link.rb").toString("utf8");
  // stop_follow_link.rb:4-12 - StopFollowLink is the link that stops a
  // follow, and its rule content is the never option.
  assert.match(stop, /class StopFollowLink < FollowLink/);
  assert.match(stop, /@rule_content = "\*never"/);
  // The follow link's own hover text is the same word the template uses.
  assert.match(stop, /@hover_text = "unfollow"/);
});

test("the committed Ruby template carries the anchor text and the text clause", () => {
  const template = rubyTemplate();
  // The html part: the link is an anchor whose text is "Unfollow", and the
  // href is EMPTY here because Ruby's view returns "" with no live rule.
  assert.ok(template.html.includes(`<a href="">${UNFOLLOW_ANCHOR_TEXT}</a> to stop receiving these emails.`));
  // The text part: the clause, with nothing after it for the same reason.
  assert.ok(template.text.includes(UNFOLLOW_TEXT_CLAUSE));
  const anchor = findUnfollowAnchor(template.html);
  assert.notEqual(anchor, null);
  assert.equal(anchor.text, UNFOLLOW_ANCHOR_TEXT);
  assert.equal(anchor.href, "");
  // The text part's clause carries no url here, and the reader says so
  // rather than inventing one.
  assert.equal(findUnfollowTextUrl(template.text), "");
});

test("the real Ruby unfollow link grades green on the link's own contract", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const expected = rubyExpectation("watcher_on_type_notify");
  assert.equal(expected.ruleName, "Basic+*type+Tova+*follow");
  // The option is seeded as always; the effect leg needs the AFTER state,
  // which no capture of a delivery can carry, so it is not claimed here.
  assert.equal(expected.optionBefore, "*always");

  const verdict = unfollowLinkInMail(mail, { ruleName: expected.ruleName });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  // The shape is recorded, not graded: Ruby's link is the subcards form.
  assert.equal(verdict.shape, "subcards");
  // The link is an update of the follower's follow card.
  assert.equal(verdict.link.name, "Tova+*follow");
  // And it carries the never option, percent-decoded.
  const carried = Object.values(verdict.link.params).join(" ");
  assert.ok(carried.includes(NEVER_OPTION));
});

test("the real Ruby unfollow link of an including set grades green too", () => {
  const mail = rubyNotice("includer_template_notify");
  const expected = rubyExpectation("includer_template_notify");
  assert.equal(expected.ruleName, "Oracle Recipe Card+ingredient+*self+Tova+*follow");
  const verdict = unfollowLinkInMail(mail, { ruleName: expected.ruleName });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
});

test("a link that targets something that is not an update fails unfollowTargetNotAnUpdate", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const broken = { ...mail, htmlBody: mail.htmlBody.replace(/href="\/update\/[^"]*"/, 'href="/Tova+*follow"') };
  const verdict = unfollowLinkInMail(broken, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowTargetNotAnUpdate"));
});

test("a link that targets a card that is not a follow card fails unfollowTargetNotAFollowCard", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const broken = { ...mail, htmlBody: mail.htmlBody.replace(/href="\/update\/[^"]*"/, 'href="/update/Some+Card"') };
  const verdict = unfollowLinkInMail(broken, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowTargetNotAFollowCard"));
});

test("a link that does not name the follower's rule fails unfollowRuleNotNamed", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  // The rule name is percent-encoded in the link, so the mutation is made
  // on the encoded form: a comparison against the raw query would fail on
  // a correct link.
  const broken = {
    ...mail,
    htmlBody: mail.htmlBody.replace(
      "Basic%2B%2Atype%2BTova%2B%2Afollow",
      "Other%2B%2Atype%2BSomeone%2B%2Afollow",
    ),
  };
  const verdict = unfollowLinkInMail(broken, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowRuleNotNamed"));
});

test("a link that does not carry the never option fails unfollowNeverNotCarried", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const broken = { ...mail, htmlBody: mail.htmlBody.replace(/%2Anever/g, "%2Aalways") };
  const verdict = unfollowLinkInMail(broken, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowNeverNotCarried"));
});

test("a mail with no Unfollow anchor fails unfollowAnchorMissing", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const stripped = { ...mail, htmlBody: mail.htmlBody.replace(/<a [^>]*>Unfollow<\/a>/g, "") };
  const verdict = unfollowLinkInMail(stripped, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowAnchorMissing"));
});

test("a mail whose Unfollow anchor has an empty href fails unfollowHrefEmpty", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const emptied = { ...mail, htmlBody: mail.htmlBody.replace(/href="\/update\/[^"]*"/, 'href=""') };
  const verdict = unfollowLinkInMail(emptied, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowHrefEmpty"));
});

test("a mail with no text clause fails unfollowTextClauseMissing", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const stripped = { ...mail, textBody: mail.textBody.replace(/Use this link to unfollow[^\n]*/, "") };
  const verdict = unfollowLinkInMail(stripped, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowTextClauseMissing"));
});

test("a mail whose two halves carry different links fails unfollowLinkHalfMismatch", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const broken = {
    ...mail,
    textBody: mail.textBody.replace(/\/update\/[^ ]*/, "/update/Tova+*follow?card%5Bcontent%5D=%2Anever"),
  };
  const verdict = unfollowLinkInMail(broken, { ruleName: "Basic+*type+Tova+*follow" });
  assert.ok(verdict.failures.includes("unfollowLinkHalfMismatch"));
});

test("the effect legs name a rule that was not always and one that did not stop", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const notAlways = unfollowLinkInMail(mail, { ruleName: "Basic+*type+Tova+*follow", optionBefore: "*never", optionAfter: "*never" });
  assert.ok(notAlways.failures.includes("followRuleWasNotAlways"));
  const didNotStop = unfollowLinkInMail(mail, { ruleName: "Basic+*type+Tova+*follow", optionBefore: "*always", optionAfter: "*always" });
  assert.ok(didNotStop.failures.includes("followRuleDidNotStop"));
  // The effect, when it happened, is green.
  const stopped = unfollowLinkInMail(mail, { ruleName: "Basic+*type+Tova+*follow", optionBefore: "*always", optionAfter: "*never" });
  assert.equal(stopped.ok, true);
});

test("the shape is recorded: Ruby's subcards form and the port's content form are told apart", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  assert.equal(unfollowLinkInMail(mail, {}).shape, "subcards");
  // The port's own shape (src/card/notify/follow-mail-views.ts:265-269):
  // the rule card's own content, under the rule's own name.
  const portUrl = "/update/Basic+*type+Tova+*follow?card%5Bcontent%5D=%2Anever";
  const portMail = {
    ...mail,
    htmlBody: mail.htmlBody.replace(/href="\/update\/[^"]*"/, `href="${portUrl}"`),
    textBody: mail.textBody.replace(/\/update\/[^ ]*/, portUrl),
  };
  const verdict = unfollowLinkInMail(portMail, { ruleName: "Basic+*type+Tova+*follow" });
  // The same claims hold: the rule is named, the never option is carried,
  // the target is a follow card, and both halves agree.
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.shape, "content");
  assert.equal(verdict.link.name, "Basic+*type+Tova+*follow");
});

test("a relative url and an absolute url are read the same way", () => {
  // Ruby's own capture carries a relative url; the port builds an absolute
  // one. The predicate reads the path and the query, so both land on the
  // same link.
  const relative = readUnfollowLink("/update/Tova+*follow?card%5Bcontent%5D=%2Anever");
  const absolute = readUnfollowLink("http://127.0.0.1:4603/update/Tova+*follow?card%5Bcontent%5D=%2Anever");
  assert.equal(relative.path, absolute.path);
  assert.equal(relative.name, "Tova+*follow");
  assert.deepEqual(relative.params, absolute.params);
  assert.equal(relative.params["card[content]"], "*never");
});

test("the check names name their own legs", () => {
  assert.match(UNFOLLOW_LINK_CHECKS.present, /carries the Unfollow link/);
  assert.match(UNFOLLOW_LINK_CHECKS.rule, /names the follower's live follow rule/);
  assert.match(UNFOLLOW_LINK_CHECKS.stops, /stops the follow rule/);
});
