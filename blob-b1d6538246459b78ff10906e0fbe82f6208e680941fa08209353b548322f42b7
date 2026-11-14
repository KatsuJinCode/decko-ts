// The follower change notice, graded on Ruby's own template and views.
//
// THE ROW. cap-W5 ("Watcher notified of updates to included and plus cards
// (mail)", tools/edge-signed-in-exercise/capabilities.json id W5) is carried
// as out_of_scope with the reason "the local harness does not run an SMTP
// sink; mail content and count are graded by Decko's own specs, not in the
// browser". That reason described the harness as it was. The harness owns a
// mail capture now (the owned in-process sink armed by requiresMail,
// tools/edge-signed-in-exercise.mjs), so the mail is reachable, and the row's
// blocker says the remaining work is a REGISTRY BINDING decision.
//
// This module is that binding, in the only form the house accepts: the mail
// is graded by a PREDICATE, not by a substring. The check that existed
// (checks-content-flows.mjs, the W5 group) asks whether a notice was
// delivered and whether the delivered text CONTAINS the changed card's name.
// That is a loose claim: a mail whose subject is "Harness_CF_Followed_abc"
// and whose body says nothing else passes it, and a mail with Ruby's exact
// shape but a body that never names what changed also passes it.
//
// WHAT RUBY SENDS. The notice is the follower_notification_email template
// (card-mod-follow-0.20.0 data/real.yml:65-99) filled from the notify views
// (set/all/notify/base_views.rb, set/all/notify/html_views.rb) and gated by
// set/all/notify.rb. The template's own words are the contract:
//
//   :subject: '{{_user|name}} {{_|last_action_verb}} "{{_|name}}"'
//   :text_message: |-
//     "{{_|name}}" was just {{_|last_action_verb}} by {{_user|name}}.
//     {{_|list_of_changes}}
//     {{_|subedits}}
//     See the card: {{_|url}}
//     You received this email because you're following "{{_|followed}}".
//     Use this link to unfollow {{_|unfollow_url}}
//
// Four clauses are graded here, each with its own leg, so a red names WHICH
// claim broke:
//
//   1. THE SUBJECT. actor, then the verb, then the card in double quotes.
//      The verb is last_action_verb (base_views.rb:45-47):
//      `"#{notification_act&.main_action&.action_type || 'edite'}d"` - so
//      "created", "updated", "deleted", and the "edited" fallback when the
//      act has no action of its own. The set is CLOSED: a subject carrying
//      any other word is not this template.
//
//   2. THE BODY. The text part opens with the card in quotes, "was just",
//      the verb, "by" and the actor (the template's first line), and carries
//      the follower's own sentence "You received this email because you're
//      following "<label>"." The label is the follow option's description of
//      the followed set (base_views.rb:33-39, the :followed view), and Ruby
//      has a fallback for the no-set case: "*followed set of cards*". A
//      notice that names NO followed set is not this template.
//
//   3. THE CHANGES. list_of_changes (base_views.rb:6-11) walks
//      RELEVANT_FIELDS_BY_ACTION (base_views.rb:1-3) - create: cardtype,
//      content; update: name, cardtype, content; delete: content - and
//      labels each item through notification_action_label (base_views.rb:
//      91-96): "new" for an update, "deleted" for a delete, and NOTHING for a
//      create. Each item is "  <label> <field>: <value>".
//
//   4. THE COUNT. One act, one notice (update_includers.feature:33, "Templated
//      cards should only send one email when added or updated"). A notice
//      per changed field is not this template, and neither is two notices for
//      one act.
//
// AND THE SILENCE. The other half of the row's oracle is that a change that
// is NOT notable sends nothing at all (update_includers.feature:27, :31, :68;
// the gate is notable_change? at notify.rb:38-41 and the follower filters at
// notify.rb:50-54, which skips a follower with no account and skips the
// act's own actor). A predicate that can only see mail cannot grade silence,
// so silence is graded on the COUNT of notices, handed in by the driver.
//
// ANTI-VACUITY.
//   1. A missing mail is a named failure (noNotice), not a skipped grade.
//   2. The subject is parsed from the RIGHT: the card is the last quoted
//      run and the verb is the word before it, so a card whose own name
//      contains " updated " cannot be misread as the verb.
//   3. The followed label is extracted, not rebuilt from the expectation, so
//      a label of "" is a failure rather than a match against a quoted empty
//      string.
//   4. The verb set is closed, and the CHANGES leg checks the label the verb
//      requires: a "created" notice whose change item says "new content" is
//      a different template, and the label is what tells them apart.
//   5. The expectation is handed in by the driver. A predicate that derived
//      the actor, the card or the verb from the mail it is grading would
//      grade nothing.
//
// WHAT THIS DOES NOT CLAIM. It grades the NOTICE a follower receives: its
// subject, its body clauses, its change list, its count, and the silence of
// the two oracle negatives. It does not grade WHO is followed, that the
// follow rule was written, or the unfollow link - the link is cap-W6's row
// and has its own predicate (lib/unfollow-link-in-mail.mjs).

/** The verbs last_action_verb can produce (base_views.rb:45-47:
 *  `"#{action_type}d"`, with the 'edite' fallback). Closed on purpose: a
 *  subject carrying any other word is not this template. */
export const FOLLOWER_NOTICE_VERBS = Object.freeze(["created", "updated", "deleted", "edited"]);

/** The verbs the HTML part can show. The text part uses last_action_verb
 *  (base_views.rb:45-47); the html part renders the history mod's own
 *  last_action_verb (card-mod-history set/all/history/views.rb:55-65):
 *  "added" for a create, "deleted" for a delete, and the "edited" history
 *  link otherwise. */
export const FOLLOWER_NOTICE_HTML_VERBS = Object.freeze(["added", "edited", "deleted"]);

/** RELEVANT_FIELDS_BY_ACTION (base_views.rb:1-3), keyed by the notice's verb.
 *  create: cardtype, content; update: name, cardtype, content; delete:
 *  content. */
export const FOLLOWER_NOTICE_RELEVANT_FIELDS = Object.freeze({
  created: Object.freeze(["cardtype", "content"]),
  updated: Object.freeze(["name", "cardtype", "content"]),
  deleted: Object.freeze(["content"]),
});

/** notification_action_label (base_views.rb:91-96): "new" for an update,
 *  "deleted" for a delete, and null for a create - the case statement has
 *  no create arm, so the label renders empty. */
export const FOLLOWER_NOTICE_LABELS = Object.freeze({
  created: null,
  updated: "new",
  deleted: "deleted",
});

/** The template's follow sentence, in the two forms the template carries
 *  (data/real.yml:80 and :97). The text form quotes the label, the html
 *  form wraps it in <strong>. */
const FOLLOWING_SENTENCE = "You received this email because you're following";

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The subject, parsed from the right.
 *
 * The template is `<actor> <verb> "<card>"` (data/real.yml:71), so the card
 * is the LAST quoted run and the verb is the word in front of it. Parsing
 * from the right is what keeps a card named "a updated b" from being read
 * as a different verb.
 *
 * Returns {ok, failures, actor, verb, card}.
 */
export function parseFollowerNoticeSubject(subject) {
  const failures = [];
  const text = String(subject ?? "");
  const close = text.lastIndexOf('"');
  const open = close < 0 ? -1 : text.lastIndexOf('"', close - 1);
  if (close < 0 || open < 0) {
    failures.push("subjectNotQuoted");
    return { ok: false, failures, actor: null, verb: null, card: null };
  }
  const card = text.slice(open + 1, close);
  const head = text.slice(0, open).trimEnd();
  const verbMatch = new RegExp(`^(.*) (${FOLLOWER_NOTICE_VERBS.join("|")})$`).exec(head);
  if (verbMatch === null) {
    failures.push("subjectVerbUnknown");
    return { ok: false, failures, actor: null, verb: null, card };
  }
  const actor = verbMatch[1];
  const verb = verbMatch[2];
  if (actor === "") failures.push("subjectActorMissing");
  if (card === "") failures.push("subjectCardMissing");
  return { ok: failures.length === 0, failures, actor, verb, card };
}

/**
 * The followed label the notice names, read out of the mail.
 *
 * The text form is `... following "<label>".` and the label may itself
 * carry quotes - Ruby's own option description is `all "Basics"` - so the
 * label is everything between the first quote after the sentence and the
 * LAST `".` in the part. Returns {text, html}; a missing sentence is null.
 */
export function parseFollowedLabel(mail) {
  const text = String(mail?.textBody ?? "");
  const html = String(mail?.htmlBody ?? "");
  const out = { text: null, html: null };
  const start = text.indexOf(`${FOLLOWING_SENTENCE} "`);
  if (start >= 0) {
    // Past the sentence, past the space, past the opening quote: the label
    // is what remains up to the LAST `".`, because the label may itself
    // carry quotes (Ruby's own option description is `all "Basics"`).
    const rest = text.slice(start + FOLLOWING_SENTENCE.length + 2);
    const end = rest.lastIndexOf('".');
    out.text = end >= 0 ? rest.slice(0, end) : null;
  }
  const htmlMatch = new RegExp(`${escapeRe(FOLLOWING_SENTENCE)}\\s*<strong>([\\s\\S]*?)</strong>`).exec(html);
  if (htmlMatch !== null) out.html = htmlMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return out;
}

/** The change items the text part carries, one per line, in Ruby's own
 *  shape: "  <label> <field>: <value>" (base_views.rb:88 + :109-111). */
export function followerNoticeTextItems(textBody) {
  const items = [];
  for (const line of String(textBody ?? "").split("\n")) {
    const m = /^ {2,3}(?:(new|deleted) )?(name|cardtype|content): ?(.*)$/.exec(line);
    if (m === null) continue;
    items.push({ label: m[1] ?? null, field: m[2], value: m[3] });
  }
  return items;
}

/** The change items the html part carries, one per <li> (html_views.rb:
 *  10-12 renders the same item inside a list element). */
export function followerNoticeHtmlItems(htmlBody) {
  const items = [];
  for (const m of String(htmlBody ?? "").matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const parsed = /^(?:(new|deleted) )?(name|cardtype|content): ?(.*)$/.exec(text);
    if (parsed === null) continue;
    items.push({ label: parsed[1] ?? null, field: parsed[2], value: parsed[3] });
  }
  return items;
}

/**
 * The SUBJECT leg: the notice names its actor, its verb and its card the
 * way Ruby's template does.
 *
 * `expected` carries what the driver knows (the actor who made the change,
 * the card that changed, the verb that act recorded). The mail is parsed
 * independently and then compared, so a mail that names the right card in
 * the wrong sentence is a failure, not a match.
 */
export function followerNoticeSubjectLeg(mail, expected) {
  const failures = [];
  const parsed = parseFollowerNoticeSubject(mail?.subject);
  for (const failure of parsed.failures) failures.push(failure);
  if (parsed.card !== null && expected?.cardName !== undefined && parsed.card !== expected.cardName) {
    failures.push("subjectCardMismatch");
  }
  if (parsed.actor !== null && expected?.actor !== undefined && parsed.actor !== expected.actor) {
    failures.push("subjectActorMismatch");
  }
  if (parsed.verb !== null && expected?.verb !== undefined && parsed.verb !== expected.verb) {
    failures.push("subjectVerbMismatch");
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], parsed };
}

/**
 * The BODY leg: the notice body carries Ruby's "was just <verb> by <actor>"
 * and "because you're following" clauses.
 *
 * The text part is graded on the template's own opening line and on the
 * followed sentence; the html part is graded on the known-card anchors the
 * template nests ({{_|link}}, {{_user|link}}) and on the same followed
 * sentence. The html part's VERB is the history mod's, not last_action_verb's
 * ("added" where the text says "created"), so the two parts are graded on
 * their own contracts and not against each other.
 */
export function followerNoticeBodyLeg(mail, expected) {
  const failures = [];
  const text = String(mail?.textBody ?? "");
  const html = String(mail?.htmlBody ?? "");
  if (text.trim() === "" && html.trim() === "") failures.push("emptyBody");

  // The text part's opening line: "<card>" was just <verb> by <actor>.
  if (text.trim() !== "") {
    const verb = expected?.verb ?? "([a-z]+)";
    const pattern = new RegExp(
      `^"${escapeRe(expected?.cardName ?? '[^"]*')}" was just (${escapeRe(verb)}) by ${escapeRe(expected?.actor ?? ".+?")}\\.`,
      "m",
    );
    if (!pattern.test(text)) failures.push("bodyOpeningClauseMissing");
  }

  // The followed sentence, with a label that is not empty. BOTH parts of the
  // template carry the sentence (data/real.yml:80 and :97), so a part that
  // is present must carry it: a mail that lost the sentence in its text
  // part is not this template, and neither is one that lost it in the html
  // part.
  const label = parseFollowedLabel(mail);
  if (text.trim() !== "" && label.text === null) failures.push("followedSentenceMissing");
  if (html.trim() !== "" && label.html === null) failures.push("followedSentenceMissing");
  if (label.text !== null && label.text.trim() === "") failures.push("followedLabelEmpty");
  if (label.html !== null && label.html.trim() === "") failures.push("followedLabelEmpty");
  if (expected?.followedLabel !== undefined) {
    if (label.text !== null && label.text !== expected.followedLabel) failures.push("followedLabelMismatch");
    if (label.html !== null && label.html !== expected.followedLabel) failures.push("followedLabelMismatch");
  }

  // The html part's two known-card anchors: the changed card and the actor.
  if (html.trim() !== "") {
    if (expected?.cardName !== undefined && !html.includes(`title="${expected.cardName}"`)) {
      failures.push("bodyCardLinkMissing");
    }
    if (expected?.actor !== undefined && !html.includes(`title="${expected.actor}"`)) {
      failures.push("bodyActorLinkMissing");
    }
    if (!/was just/i.test(html)) failures.push("bodyVerbClauseMissing");
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)], label };
}

/**
 * The CHANGES leg: the notice lists the changed field the way Ruby's
 * list_of_changes does.
 *
 * The verb decides which fields are relevant (RELEVANT_FIELDS_BY_ACTION) and
 * which label each item carries (notification_action_label). The value the
 * driver expected is compared with the text part's item, which is the plain
 * rendering of the field.
 */
export function followerNoticeChangesLeg(mail, expected) {
  const failures = [];
  const items = followerNoticeTextItems(mail?.textBody);
  const htmlItems = followerNoticeHtmlItems(mail?.htmlBody);
  if (items.length === 0 && htmlItems.length === 0) {
    failures.push("noChangeListed");
    return { ok: false, failures, items, htmlItems };
  }
  const verb = expected?.verb;
  const relevant = verb === undefined ? null : FOLLOWER_NOTICE_RELEVANT_FIELDS[verb] ?? null;
  const label = verb === undefined ? null : FOLLOWER_NOTICE_LABELS[verb];
  for (const item of items) {
    if (relevant !== null && !relevant.includes(item.field)) failures.push("changeFieldNotRelevant");
    if (label !== null && item.label !== label) failures.push("changeLabelMismatch");
    if (label === null && item.label !== null) failures.push("changeLabelMismatch");
    if (item.value.trim() === "") failures.push("changeValueEmpty");
  }
  if (expected?.change?.field !== undefined) {
    const hit = items.find((item) => item.field === expected.change.field);
    if (hit === undefined) {
      failures.push("changedFieldNotListed");
    } else if (expected.change.value !== undefined && hit.value.trim() !== String(expected.change.value).trim()) {
      failures.push("changeValueMismatch");
    }
  }
  return { ok: failures.length === 0, failures: [...new Set(failures)], items, htmlItems };
}

/**
 * The whole contract for one delivered notice.
 *
 * `mail`     the delivered message: {subject, textBody, htmlBody}
 * `expected` what the driver knows: {actor, cardName, verb, followedLabel,
 *             change: {field, value}}
 *
 * Returns {ok, failures, legs}. `failures` is the union of the legs', so a
 * red names the claim that broke and the legs say which part of the notice
 * was wrong.
 */
export function followerNoticeContract(mail, expected) {
  const legs = {
    subject: followerNoticeSubjectLeg(mail, expected),
    body: followerNoticeBodyLeg(mail, expected),
    changes: followerNoticeChangesLeg(mail, expected),
  };
  const failures = [...new Set([...legs.subject.failures, ...legs.body.failures, ...legs.changes.failures])];
  if (mail === undefined || mail === null) failures.push("noNotice");
  return { ok: failures.length === 0, failures, legs };
}

/**
 * The COUNT leg: one act, one notice.
 *
 * The oracle names it (update_includers.feature:33, "Templated cards should
 * only send one email when added or updated"). A templated card's act
 * carries several changed fields and still produces ONE notice, so a count
 * above one is a different behaviour, and a count of zero is no notice at
 * all. The notices are handed in by the driver; the count is graded here.
 */
export function oneFollowerNoticePerAct(notices) {
  const list = Array.isArray(notices) ? notices : [];
  const failures = [];
  if (list.length === 0) failures.push("noNotice");
  if (list.length > 1) failures.push("moreThanOneNotice");
  return { ok: failures.length === 0, failures, count: list.length };
}

/**
 * The SILENCE leg: a change that is not notable sends nothing.
 *
 * The oracle's negatives (update_includers.feature:27, :31, :68) are "Then
 * No notification should be sent". Silence is a COUNT of zero, and a count
 * of one is a failure, not a pass.
 */
export function noFollowerNotice(notices) {
  const list = Array.isArray(notices) ? notices : [];
  const failures = list.length === 0 ? [] : ["noticeWasSent"];
  return { ok: failures.length === 0, failures, count: list.length };
}

/** The check names each leg records, so the evidence names its own leg. */
export const FOLLOWER_NOTICE_CHECKS = Object.freeze({
  subject: "the follower notice names its actor, its verb and its card the way Ruby's template does",
  body: "the follower notice body carries Ruby's 'was just updated by' and 'because you're following' clauses",
  changes: "the follower notice lists the changed field the way Ruby's list_of_changes does",
  onePerAct: "one act sends one follower notice, not one per changed field",
  silence: "a change that is not notable sends no follower notice at all",
});
