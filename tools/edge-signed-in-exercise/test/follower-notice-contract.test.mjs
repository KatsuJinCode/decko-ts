// cap-W5 - the follower notice, pinned against the Ruby bytes.
//
// WHAT IS PINNED, AND WHERE EACH PIN LIVES.
//
// 1. THE REAL RUBY MAIL. fixtures/captured/six-oracle-mails.json is the
//    committed capture of the real Ruby oracle's own mail delivery
//    (tools/oracle/mail_oracles_capture.rb, six scenarios, ActionMailer test
//    delivery, ruby 3.3.12). Two of its scenarios ARE this row:
//    watcher_on_type_notify (a follower of the "Basic+*type" set is mailed
//    when a card of that type is updated) and includer_template_notify (a
//    follower of a set that INCLUDES a subcard is mailed when that subcard
//    is updated - the "included and plus cards" the row names). Every
//    positive assertion in this file runs on THOSE bytes: the predicate must
//    grade Ruby's own delivered mail green.
//
// 2. THE RUBY SOURCE THE TEMPLATE AND THE VIEWS COME FROM. The capture
//    carries the rendered mail, not the rules that produced it, so the
//    contract clauses are pinned on committed Ruby SOURCE, vendored verbatim
//    from the gem and sha256-pinned here (test 1):
//      fixtures/vendor/card-mod-follow-0.20.0/data/real.yml
//        the follower_notification_email template (subject, text_message,
//        html_message)
//      fixtures/vendor/card-mod-follow-0.20.0/set/all/notify.rb
//        notable_change? and the follower filters
//      fixtures/vendor/card-mod-follow-0.20.0/set/all/notify/base_views.rb
//        RELEVANT_FIELDS_BY_ACTION, notification_action_label, the :followed
//        and :last_action_verb views
//      fixtures/vendor/card-mod-follow-0.20.0/set/all/notify/html_views.rb
//        the html list wrapping the same change items
//    A drift in any of them fails the pin by name instead of the predicate
//    quietly grading a contract Ruby no longer has.
//
// WHAT IS NOT CLAIMED. No signed-in run happens here, so nothing below says
// the live mail passes. These are the notice's shape and its contract,
// graded on Ruby's own bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  parseFollowerNoticeSubject,
  parseFollowedLabel,
  followerNoticeTextItems,
  followerNoticeHtmlItems,
  followerNoticeSubjectLeg,
  followerNoticeBodyLeg,
  followerNoticeChangesLeg,
  followerNoticeContract,
  oneFollowerNoticePerAct,
  noFollowerNotice,
  FOLLOWER_NOTICE_VERBS,
  FOLLOWER_NOTICE_RELEVANT_FIELDS,
  FOLLOWER_NOTICE_LABELS,
  FOLLOWER_NOTICE_CHECKS,
} from "../lib/follower-notice-contract.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-follow-0.20.0/", import.meta.url);
const ORACLE_MAILS = new URL("../../../fixtures/captured/six-oracle-mails.json", import.meta.url);

const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The sha256 of each vendored file, taken when the copy was made from
 *  decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-follow-0.20.0/. */
const VENDORED = {
  "data/real.yml": "491a8d19f18ae92cfe8aa22f06aa0058f4ecef60f4ae2f33012a81369243893c",
  "set/all/notify.rb": "576f78df5a2b989f6f07fbf49df56695f0102af46184b43809cb2d7998196320",
  "set/all/notify/base_views.rb": "e8f3da4a7c2bd315a69096c93d3cf8e1b509abacc5ee7873b168f1d2b1148ed3",
  "set/all/notify/html_views.rb": "b32b66d1a3bcb3f38deceded75c6b9b7d17927b08e6b60086f2456d2d8f659dd",
};

const oracleMails = JSON.parse(readFileSync(ORACLE_MAILS, "utf8"));

/** The real Ruby's own delivered notice for one scenario. */
function rubyNotice(scenario) {
  const arm = oracleMails.scenarios[scenario];
  assert.ok(arm !== undefined, `committed oracle capture has no scenario ${scenario}`);
  const delivered = arm.delivered;
  assert.equal(delivered.length, 1, `${scenario} delivered ${delivered.length} notices`);
  const mail = delivered[0];
  return { subject: mail.subject, textBody: mail.text_body, htmlBody: mail.html_body };
}

/** What the driver knows about the act, read from the capture's own input. */
function rubyExpectation(scenario) {
  const arm = oracleMails.scenarios[scenario];
  const act = arm.input.act;
  const followed = arm.input.follow_rule.set_card;
  // The follow option's description of the set card: the capture's delivered
  // mail is the only place it is spelled out, so the expectation is read
  // from the SAME committed bytes the predicate grades.
  const label = parseFollowedLabel(rubyNotice(scenario)).text;
  return {
    actor: act.actor,
    cardName: act.card,
    verb: act.verb,
    followedLabel: label,
    followedSetName: followed,
    change: { field: "content", value: "row8 update v2" },
  };
}

test("the vendored Ruby notify source is the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-follow-0.20.0`);
  }
});

test("the pinned Ruby source carries the notice contract this row grades", () => {
  const real = readVendor("data/real.yml").toString("utf8");
  // data/real.yml:65-99 - the follower_notification_email template. Its
  // subject is the actor, the verb and the card in quotes; the subject leg
  // grades that shape and nothing else.
  assert.match(real, /:codename: follower_notification_email/);
  assert.match(real, /:subject: '\{\{_user\|name\}\} \{\{_\|last_action_verb\}\} "\{\{_\|name\}\}"'/);
  // The follower's own sentence, in both parts of the template.
  assert.match(real, /You received this email because you're following <strong>\{\{_\|followed\}\}<\/strong>\./);
  assert.match(real, /You received this email because you're following "\{\{_\|followed\}\}"\./);

  const base = readVendor("set/all/notify/base_views.rb").toString("utf8");
  // base_views.rb:1-3 - the fields each action type may report. The source
  // wraps the hash across three lines, so the pin reads the whole clause
  // rather than one line of it.
  assert.match(
    base,
    /RELEVANT_FIELDS_BY_ACTION = \{ create: %i\[cardtype content\],\s+update: %i\[name cardtype content\],\s+delete: %i\[content\] \}\.freeze/,
  );
  // base_views.rb:91-96 - the item labels. A create has NO label arm.
  assert.match(base, /when :update then "new"/);
  assert.match(base, /when :delete then "deleted"/);
  // base_views.rb:88 - the item's own shape.
  assert.match(base, /wrap_list_item "  #\{notification_action_label action\} #\{field\}: #\{value\}"/);
  // base_views.rb:45-47 - the verb.
  assert.match(base, /"#\{notification_act&\.main_action&\.action_type \|\| 'edite'\}d"/);
  // base_views.rb:33-39 - the followed label, and Ruby's own fallback.
  assert.match(base, /option_card\.description set_card/);
  assert.match(base, /"\*followed set of cards\*"/);

  const notify = readVendor("set/all/notify.rb").toString("utf8");
  // notify.rb:38-41 - the gate that makes a change notable, and the two
  // filters (no account, the act's own actor) the silence legs rest on.
  assert.match(notify, /def notable_change\?/);
  assert.match(notify, /!silent_change\? && current_act_card\? &&/);
  assert.match(notify, /Card::Auth\.current_id != DeckoBotID\) && followable\?/);
  assert.match(notify, /next if !follower\.account \|\| \(follower == act\.actor\)/);

  const html = readVendor("set/all/notify/html_views.rb").toString("utf8");
  // html_views.rb:10-12 - the html part wraps the same item in a list.
  assert.match(html, /def wrap_list_item item\n    "<li>#\{item\}<\/li>\\n"/);
});

test("the real Ruby notice for a watched type grades green on every leg", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const expected = rubyExpectation("watcher_on_type_notify");
  // The expectation is read from the capture's own input, so the grade is
  // against what Ruby recorded, not against a hand-written guess.
  assert.equal(expected.actor, "Jonas");
  assert.equal(expected.cardName, "Oracle Follow Card");
  assert.equal(expected.verb, "updated");
  // The followed label is the option's description of the set card.
  assert.equal(expected.followedLabel, 'all "Basics"');

  const verdict = followerNoticeContract(mail, expected);
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.legs.subject.parsed.verb, "updated");
  assert.equal(verdict.legs.subject.parsed.card, "Oracle Follow Card");
  assert.equal(verdict.legs.body.label.text, 'all "Basics"');
  assert.equal(verdict.legs.body.label.html, 'all "Basics"');
  assert.deepEqual(
    verdict.legs.changes.items.map((item) => [item.label, item.field, item.value]),
    [["new", "content", "row8 update v2"]],
  );
});

test("the real Ruby notice for a followed set that includes a subcard grades green", () => {
  // This is the row's own wording: "updates to included and plus cards".
  const mail = rubyNotice("includer_template_notify");
  const expected = rubyExpectation("includer_template_notify");
  assert.equal(expected.cardName, "Oracle Recipe Card");
  // The followed label is the INCLUDING set, not the changed card: Ruby
  // names the set the follower watches (base_views.rb:33-39).
  assert.equal(expected.followedLabel, "Oracle Recipe Card+ingredient");

  const verdict = followerNoticeContract(mail, expected);
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
});

test("the subject is parsed from the right, so a card whose name holds the verb is not misread", () => {
  const parsed = parseFollowerNoticeSubject('Jonas updated "a updated b"');
  assert.equal(parsed.card, "a updated b");
  assert.equal(parsed.verb, "updated");
  assert.equal(parsed.actor, "Jonas");
  assert.equal(parsed.ok, true);
});

test("a subject with no quoted card fails subjectNotQuoted", () => {
  const parsed = parseFollowerNoticeSubject("Jonas updated Oracle Follow Card");
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failures.includes("subjectNotQuoted"));
});

test("a subject with a verb outside Ruby's set fails subjectVerbUnknown", () => {
  const parsed = parseFollowerNoticeSubject('Jonas touched "Oracle Follow Card"');
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failures.includes("subjectVerbUnknown"));
});

test("the subject leg names the wrong card, the wrong actor and the wrong verb", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const expected = rubyExpectation("watcher_on_type_notify");
  const wrongCard = followerNoticeSubjectLeg(mail, { ...expected, cardName: "Some Other Card" });
  assert.ok(wrongCard.failures.includes("subjectCardMismatch"));
  const wrongActor = followerNoticeSubjectLeg(mail, { ...expected, actor: "Someone Else" });
  assert.ok(wrongActor.failures.includes("subjectActorMismatch"));
  const wrongVerb = followerNoticeSubjectLeg(mail, { ...expected, verb: "created" });
  assert.ok(wrongVerb.failures.includes("subjectVerbMismatch"));
});

test("a notice with no follow sentence fails followedSentenceMissing", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const stripped = { ...mail, textBody: mail.textBody.replace(/You received this email because you're following[^\n]*\n/, "") };
  const leg = followerNoticeBodyLeg(stripped, rubyExpectation("watcher_on_type_notify"));
  assert.equal(leg.ok, false);
  assert.ok(leg.failures.includes("followedSentenceMissing"));
});

test("a follow sentence with an empty label fails followedLabelEmpty", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  // The label is emptied where the template puts it, so the sentence is
  // still there and the claim that fails is the LABEL, not the sentence.
  const emptied = {
    ...mail,
    textBody: mail.textBody.replace(
      /You received this email because you're following ".*?"\./,
      'You received this email because you\'re following "".',
    ),
  };
  const leg = followerNoticeBodyLeg(emptied, rubyExpectation("watcher_on_type_notify"));
  assert.equal(leg.ok, false);
  assert.ok(leg.failures.includes("followedLabelEmpty"));
});

test("a notice that does not name the changed card in its body fails bodyCardLinkMissing", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const stripped = { ...mail, htmlBody: mail.htmlBody.replace(/title="Oracle Follow Card"/g, 'title="redacted"') };
  const leg = followerNoticeBodyLeg(stripped, rubyExpectation("watcher_on_type_notify"));
  assert.equal(leg.ok, false);
  assert.ok(leg.failures.includes("bodyCardLinkMissing"));
});

test("a change item of a field the action type cannot report fails changeFieldNotRelevant", () => {
  // A delete may report content only (base_views.rb:1-3). A "deleted name"
  // item is a delete's label on a field the delete cannot report, and the
  // relevant-field rule is what tells them apart.
  const items = followerNoticeTextItems("  deleted name: Old Name");
  assert.equal(items.length, 1);
  const leg = followerNoticeChangesLeg(
    { textBody: "  deleted name: Old Name", htmlBody: "" },
    { verb: "deleted", change: { field: "content", value: "Old Name" } },
  );
  assert.equal(leg.ok, false);
  assert.ok(leg.failures.includes("changeFieldNotRelevant"));
  // The field the delete DID report is missing from the notice.
  assert.ok(leg.failures.includes("changedFieldNotListed"));
});

test("a create's change item carries no label, and an update's carries 'new'", () => {
  // notification_action_label (base_views.rb:91-96) has no create arm, so a
  // created notice's item reads "   content: value" with an empty label.
  const create = followerNoticeTextItems("   content: a new body");
  assert.equal(create.length, 1);
  assert.equal(create[0].label, null);
  assert.equal(create[0].field, "content");
  const createLeg = followerNoticeChangesLeg(
    { textBody: "   content: a new body", htmlBody: "" },
    { verb: "created", change: { field: "content", value: "a new body" } },
  );
  assert.deepEqual(createLeg.failures, []);
  // The same item with the update's label is a different template.
  const mislabelled = followerNoticeChangesLeg(
    { textBody: "  new content: a new body", htmlBody: "" },
    { verb: "created", change: { field: "content", value: "a new body" } },
  );
  assert.ok(mislabelled.failures.includes("changeLabelMismatch"));
});

test("a notice that lists no change at all fails noChangeListed", () => {
  const leg = followerNoticeChangesLeg({ textBody: "nothing here", htmlBody: "" }, { verb: "updated" });
  assert.equal(leg.ok, false);
  assert.ok(leg.failures.includes("noChangeListed"));
});

test("a change item with an empty value fails changeValueEmpty", () => {
  const leg = followerNoticeChangesLeg(
    { textBody: "  new content: ", htmlBody: "" },
    { verb: "updated" },
  );
  assert.ok(leg.failures.includes("changeValueEmpty"));
});

test("a notice that reports a different value than the act recorded fails changeValueMismatch", () => {
  const leg = followerNoticeChangesLeg(
    { textBody: "  new content: something else", htmlBody: "" },
    { verb: "updated", change: { field: "content", value: "row8 update v2" } },
  );
  assert.ok(leg.failures.includes("changeValueMismatch"));
});

test("a notice that does not list the changed field fails changedFieldNotListed", () => {
  const leg = followerNoticeChangesLeg(
    { textBody: "  new cardtype: Book", htmlBody: "" },
    { verb: "updated", change: { field: "content", value: "row8 update v2" } },
  );
  assert.ok(leg.failures.includes("changedFieldNotListed"));
});

test("the html part's change items are read out of the list elements", () => {
  const mail = rubyNotice("watcher_on_type_notify");
  const items = followerNoticeHtmlItems(mail.htmlBody);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "new");
  assert.equal(items[0].field, "content");
  assert.equal(items[0].value, "row8 update v2");
});

test("one act sends one notice: zero fails, two fails", () => {
  assert.ok(oneFollowerNoticePerAct([]).failures.includes("noNotice"));
  assert.ok(oneFollowerNoticePerAct([{}, {}]).failures.includes("moreThanOneNotice"));
  assert.equal(oneFollowerNoticePerAct([{}]).ok, true);
});

test("a change that is not notable sends no notice at all", () => {
  // update_includers.feature:27, :31, :68 - "Then No notification should be
  // sent". Silence is a count of zero; one notice is a failure.
  assert.equal(noFollowerNotice([]).ok, true);
  const spoken = noFollowerNotice([{}]);
  assert.equal(spoken.ok, false);
  assert.ok(spoken.failures.includes("noticeWasSent"));
});

test("the verb set and the relevant fields are the ones Ruby spells", () => {
  assert.deepEqual([...FOLLOWER_NOTICE_VERBS], ["created", "updated", "deleted", "edited"]);
  assert.deepEqual([...FOLLOWER_NOTICE_RELEVANT_FIELDS.updated], ["name", "cardtype", "content"]);
  assert.deepEqual([...FOLLOWER_NOTICE_RELEVANT_FIELDS.created], ["cardtype", "content"]);
  assert.deepEqual([...FOLLOWER_NOTICE_RELEVANT_FIELDS.deleted], ["content"]);
  assert.equal(FOLLOWER_NOTICE_LABELS.updated, "new");
  assert.equal(FOLLOWER_NOTICE_LABELS.deleted, "deleted");
  assert.equal(FOLLOWER_NOTICE_LABELS.created, null);
});

test("the check names name their own legs", () => {
  assert.match(FOLLOWER_NOTICE_CHECKS.subject, /^the follower notice names its actor/);
  assert.match(FOLLOWER_NOTICE_CHECKS.body, /because you're following/);
  assert.match(FOLLOWER_NOTICE_CHECKS.changes, /list_of_changes/);
  assert.match(FOLLOWER_NOTICE_CHECKS.onePerAct, /one follower notice/);
  assert.match(FOLLOWER_NOTICE_CHECKS.silence, /sends no follower notice/);
});
