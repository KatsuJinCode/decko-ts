// checks-w4-follow-views.mjs - the W4 probe: it opens the followers list and
// the all-followed-cards view on the signed-in deck and grades what came back
// against the pinned Ruby's own bytes.
//
// THE ROW. cap-W4 ("Followers list and 'all followed cards' view",
// tools/edge-signed-in-exercise/capabilities.json id W4) is the one follow row
// no signed-in run ever opened. Its finding says so in its own words: "no
// id-prefixed check ran for this row ... W1's evidence lists the '1 follower'
// and 'all followed cards' links but never opens either view, so the followers
// list and the all-followed-cards view are unmeasured and this row needs a
// probe, not a binding."
//
// So this is a PROBE, not a binding: it creates its own fixture, follows two
// cards as the member, opens both views, and reconciles what the pages show
// against the deck's own stored follow rules.
//
// WHAT THE PROBE DOES, IN ORDER:
//
//   1. the MEMBER creates three cards: two she will follow (A and B) and one
//      nobody will follow (C, the control);
//   2. the MEMBER follows A and B from their Engage tabs, the way a person
//      does (the follow link is clicked, not synthesized);
//   3. the ADMINISTRATOR follows A as well, so the followers list has more
//      than one name in it - a list that can only ever hold one name cannot
//      be graded "exactly";
//   4. the member's Engage tab on A is read: the followers link (its target
//      and its own label, which carries the count) and the overview link
//      (its target and its literal text);
//   5. the followers view of A, of B and of C is OPENED and read;
//   6. the member's all-followed-cards dashboard is OPENED and read;
//   7. the expected follower set of each card is computed from the DECK
//      (the stored follow preference rows and the option each one carries),
//      never assumed, and the rendered names are compared with it.
//
// THE RECONCILIATION IS THE POINT. The follower count and the follower list
// are the same walk in Ruby (follower_names is follower_ids.map(&:name), and
// the count is follower_ids.size), so a view that shows one name while the
// board says "2 followers" is a defect. The expected set is read out of the
// deck's stored rules - the same rows the notifications read - so the probe
// never grades the port against the port.
//
// WHAT IS NOT CLAIMED HERE: the follow MAIL and the unfollow link in that
// mail are the W5 and W6 rows' contracts, and stopping a follow is W2's
// contract. This module claims only the two VIEWS the W4 row names.

import { createTypedFixture, fixtureCard } from "./lib/typed-fixture.mjs";
import { engageTabLegs } from "./lib/engage-tab.mjs";
import {
  W4_CHECKS,
  allFollowedCardsVerdict,
  followerCountFrom,
  followersLinkTargets,
  followersListVerdict,
  overviewLinkTargets,
  readCreateFormPresent,
  readFollowEditorRows,
  readPointerList,
} from "./lib/w4-follow-views.mjs";

export const meta = {
  topic: "w4-follow-views",
  capabilityIds: ["W4"],
};

/** The deck's own follow preference rows: every stored `Set+User+*follow`
 * rule, with the set it belongs to, the account that holds it and the option
 * it carries. The rows are read through the junction rows, because a
 * compound card's name is composed at the fetch layer and is not stored in
 * the `name` column. */
function storedFollowRules(database) {
  const follow = database
    .prepare("SELECT id FROM cards WHERE codename='follow' AND trash=0 LIMIT 1")
    .get();
  if (follow === undefined) return [];
  return database
    .prepare(
      `SELECT r.id AS rule_id, r.db_content AS content, r.left_id AS user_set_id,
              us.left_id AS set_id, u.name AS user_name, u.id AS user_id
         FROM cards r
         JOIN cards us ON us.id = r.left_id
         JOIN cards u  ON u.id = us.right_id
        WHERE r.right_id = ? AND r.trash = 0 AND us.trash = 0 AND u.trash = 0`,
    )
    .all(follow.id);
}

/** The sets a card belongs to, in the order Ruby walks them (the specific
 * set first): the card's own self set, its type's type set, and the
 * deck-wide *all set. */
function setChainIds(database, card) {
  const ids = [];
  const self = database
    .prepare(
      "SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1",
    )
    .get(card.id);
  if (self !== undefined) ids.push(self.id);
  if (card.type_id !== undefined && card.type_id !== null) {
    const type = database
      .prepare(
        "SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='type' AND f.trash=0 LIMIT 1",
      )
      .get(card.type_id);
    if (type !== undefined) ids.push(type.id);
  }
  const all = database
    .prepare("SELECT id FROM cards WHERE codename='all' AND trash=0 LIMIT 1")
    .get();
  if (all !== undefined) ids.push(all.id);
  return ids;
}

/** Does the stored option apply to this account for this card?
 *   *always  applies to every account (set/self/always.rb:5)
 *   *never   applies to none (set/self/never.rb:5)
 *   *created applies to the card's creator (set/self/created.rb:5-7)
 *   *edited  applies to the card's editors (set/self/edited.rb:5-8) */
function optionApplies(database, content, userId, card) {
  const lines = String(content ?? "")
    .split("\n")
    .map((line) => line.replace(/[\[\]]/g, "").trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    const option = database
      .prepare("SELECT codename FROM cards WHERE name=? AND trash=0 LIMIT 1")
      .get(line)?.codename;
    if (option === "always") return true;
    if (option === "never") continue;
    if (option === "created") {
      if (card.creator_id !== undefined && Number(card.creator_id) === Number(userId)) return true;
      continue;
    }
    if (option === "edited") {
      const editors = database
        .prepare(
          "SELECT DISTINCT ca.actor_id AS actor_id FROM card_actions a JOIN card_acts ca ON ca.id=a.card_act_id WHERE a.card_id=?",
        )
        .all(card.id)
        .map((row) => Number(row.actor_id));
      if (editors.includes(Number(userId))) return true;
      continue;
    }
  }
  return false;
}

/** The accounts the deck's stored rules make followers of this card. */
function expectedFollowers(database, card, rules) {
  const chain = new Set(setChainIds(database, card));
  const names = [];
  for (const rule of rules) {
    if (!chain.has(rule.set_id)) continue;
    if (!optionApplies(database, rule.content, rule.user_id, card)) continue;
    if (!names.includes(rule.user_name)) names.push(rule.user_name);
  }
  return names;
}

/** The number of follow preference rules the deck stores for one account -
 * the number of items the account's own dashboard must carry. */
function storedRuleCountFor(database, accountName, rules) {
  return rules.filter((rule) => rule.user_name === accountName).length;
}

/** The account's FOLLOWING rules - the rows the dashboard's active Follow
 * pane carries. Ruby's editor splits the rules by their option lines
 * (follow_editor_helper.rb: ignoring_rules_and_options takes the rules
 * whose items include *never, following_rules_and_options the rest), so a
 * rule whose every line is *never renders no Follow row. */
function followingRuleCountFor(database, accountName, rules) {
  const neverKey = "*never";
  return rules.filter((rule) => {
    if (rule.user_name !== accountName) return false;
    const lines = String(rule.content ?? "")
      .split("\n")
      .map((line) => line.replace(/[\[\]]/g, "").trim())
      .filter((line) => line.length > 0);
    return !lines.every((line) => line === neverKey);
  }).length;
}

async function runW4FollowViewChecks(ctx) {
  const { stack, page, creds, record, visit, signIn, database, created, captureEvidence } = ctx;
  const group = ctx.group ?? ((name) => console.log(`\n== ${name}`));
  const admin = creds.admin;
  const member = creds.member;
  const ensure = (name) => {
    if (!created.includes(name)) created.push(name);
    return name;
  };
  const cardName = (label) => `Harness_W4_${label}_${Date.now().toString(36)}`;

  /** The Engage tab's own bytes: the followers link and the overview link. */
  const readEngageTab = async (card) => {
    const board = await visit(`/${card}/board`);
    await page.waitForTimeout(1200);
    const tab = page.locator(".board .nav-link", { hasText: "Engage" }).first();
    if ((await tab.count()) === 0) return { board, tab: false, legs: null, html: "" };
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const html = await page.content();
    return { board, tab: true, legs: engageTabLegs(html), html };
  };

  /** Follows the card as the SIGNED-IN account, by clicking the board's own
   * follow link, and reports what the deck stored. */
  const followCard = async (card) => {
    const before = ctx.ledger().length;
    const href = await page.evaluate(() => {
      const link = [...document.querySelectorAll("#main a, .board a")].find((a) =>
        /^(follow|following)$/i.test((a.textContent ?? "").replace(/\s+/g, " ").trim()),
      );
      return link === undefined ? null : link.getAttribute("href");
    });
    if (href === null) return { clicked: false, href: null, writes: [] };
    const rule = decodeURIComponent(href.split("?")[0].replace(/^\/update\//, ""));
    ensure(rule);
    const pending = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).origin === stack.origin &&
          new URL(response.url()).pathname.startsWith("/update/"),
        { timeout: 30_000 },
      )
      .then((response) => ({ status: response.status() }), () => ({ status: null }));
    await page
      .locator(`#main a[href="${href}"], .board a[href="${href}"]`)
      .first()
      .dispatchEvent("click")
      .catch(() => undefined);
    const seen = await pending;
    await page.waitForTimeout(1500);
    return {
      clicked: true,
      href,
      rule,
      writeStatus: seen.status,
      writes: ctx
        .linesSince(before)
        .filter((line) => line.method !== "GET")
        .map((line) => ({ path: line.path?.slice(0, 90), status: line.status })),
    };
  };

  /** The stored option of the sign-in's own rule on the card, read from the
   * deck (the same read the W2 module does: the card's self set, the
   * account's rule on it, the option card's content). */
  const storedOption = (cardNameValue, accountName) => {
    const card = fixtureCard(database(), cardNameValue);
    if (card === undefined) return null;
    const selfSet = database()
      .prepare(
        "SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1",
      )
      .get(card.id);
    if (selfSet === undefined) return null;
    const holder = database()
      .prepare("SELECT id FROM cards WHERE name=? AND trash=0 LIMIT 1")
      .get(accountName);
    if (holder === undefined) return null;
    const rule = database()
      .prepare("SELECT id FROM cards WHERE left_id=? AND right_id=? AND trash=0 LIMIT 1")
      .get(selfSet.id, holder.id);
    if (rule === undefined) return null;
    const option = database()
      .prepare(
        "SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='follow' AND f.trash=0 LIMIT 1",
      )
      .get(rule.id);
    return option?.db_content ?? null;
  };

  group("w4-follow-views. the followers list and the all-followed-cards view");

  // ---------------------------------------------------------------- the fixture
  await signIn(member);
  const followedA = ensure(cardName("followed_a"));
  const followedB = ensure(cardName("followed_b"));
  const unfollowed = ensure(cardName("unfollowed"));
  await createTypedFixture(ctx, { name: followedA, content: "Harness W4 followed card A", type: "Basic" });
  await createTypedFixture(ctx, { name: followedB, content: "Harness W4 followed card B", type: "Basic" });
  await createTypedFixture(ctx, { name: unfollowed, content: "Harness W4 unfollowed card", type: "Basic" });

  // The member follows A and B from their Engage tabs.
  const followA = await (async () => {
    await visit(`/${followedA}/board`);
    await page.waitForTimeout(1200);
    await page.locator(".board .nav-link", { hasText: "Engage" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1200);
    return followCard(followedA);
  })();
  const followB = await (async () => {
    await visit(`/${followedB}/board`);
    await page.waitForTimeout(1200);
    await page.locator(".board .nav-link", { hasText: "Engage" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1200);
    return followCard(followedB);
  })();

  // The administrator follows A too, so the followers list holds more than
  // one name and "exactly" has something to be exactly about.
  await signIn(admin);
  const adminFollow = await (async () => {
    await visit(`/${followedA}/board`);
    await page.waitForTimeout(1200);
    await page.locator(".board .nav-link", { hasText: "Engage" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1200);
    return followCard(followedA);
  })();
  await signIn(member);

  const rules = storedFollowRules(database());
  const cardRows = {
    [followedA]: fixtureCard(database(), followedA),
    [followedB]: fixtureCard(database(), followedB),
    [unfollowed]: fixtureCard(database(), unfollowed),
  };
  const expected = {
    [followedA]: expectedFollowers(database(), cardRows[followedA], rules),
    [followedB]: expectedFollowers(database(), cardRows[followedB], rules),
    [unfollowed]: expectedFollowers(database(), cardRows[unfollowed], rules),
  };

  // ------------------------------------------------- the board's two links
  const engage = await readEngageTab(followedA);
  const followersLink = engage.legs?.followers ?? null;
  const overviewLink = engage.legs?.overview ?? null;
  const countLabel = followersLink?.text ?? null;
  const renderedCount = followerCountFrom(countLabel);
  const linksOk =
    followersLink !== null &&
    followersLink.href !== null &&
    followersLinkTargets(followersLink.href, followedA) &&
    overviewLink !== null &&
    overviewLink.text === "all followed cards" &&
    overviewLink.href !== null &&
    overviewLinkTargets(overviewLink.href, member.name.replace(/\s+/g, "_"));

  // ---------------------------------------------------- the followers views
  const openFollowersView = async (card) => {
    const pageView = await visit(`/${card}+*followers`);
    const pageList = await page.evaluate(readPointerList);
    const contentView = await visit(`/${card}+*followers/content`);
    const contentList = await page.evaluate(readPointerList);
    const createForm = await page.evaluate(readCreateFormPresent);
    return {
      page: { status: pageView.status, list: pageList },
      content: { status: contentView.status, list: contentList },
      createForm,
      html: contentView.html,
    };
  };

  const viewA = await openFollowersView(followedA);
  const viewB = await openFollowersView(followedB);
  const viewC = await openFollowersView(unfollowed);

  // -------------------------------------------- the all-followed-cards view
  // The door the board's own link opens is the card at view=content
  // (board.rb board_link_opts), whose body is the follow editor - the tab
  // machinery's active Follow pane (user/follow.rb:39-43 over
  // follow_editor.haml). The rows are read where Ruby renders them
  // (readFollowEditorRows); the pointer-list surface this module read
  // before is the LIST family's core, which the dashboard's own :core
  // override shadows, so it never renders on either door.
  const dashboardPath = `/${member.name.replace(/\s+/g, "_")}+*follow`;
  const dashboard = await visit(dashboardPath);
  const dashboardRows = await page.evaluate(readFollowEditorRows);
  const dashboardPointerList = await page.evaluate(readPointerList);
  const dashboardCreateForm = await page.evaluate(readCreateFormPresent);
  const dashboardText = await page.evaluate(() => document.body.innerText);
  const dashboardContent = await visit(`${dashboardPath}/content`);
  const dashboardContentRows = await page.evaluate(readFollowEditorRows);
  const dashboardContentPointerList = await page.evaluate(readPointerList);
  const dashboardContentCreateForm = await page.evaluate(readCreateFormPresent);
  const dashboardContentText = await page.evaluate(() => document.body.innerText);

  const ruleCount = followingRuleCountFor(database(), member.name, rules);
  const storedRuleCount = storedRuleCountFor(database(), member.name, rules);

  // ------------------------------------------------------------ the verdicts
  const listVerdictA = followersListVerdict({
    list: viewA.content.list ?? viewA.page.list,
    expected: expected[followedA],
    createForm: viewA.createForm,
  });
  const listVerdictB = followersListVerdict({
    list: viewB.content.list ?? viewB.page.list,
    expected: expected[followedB],
    createForm: viewB.createForm,
  });
  const listVerdictC = followersListVerdict({
    list: viewC.content.list ?? viewC.page.list,
    expected: expected[unfollowed],
    createForm: viewC.createForm,
  });
  const overviewVerdict = allFollowedCardsVerdict({
    items:
      dashboardContentRows?.items ??
      dashboardRows?.items ??
      dashboardContentPointerList?.items ??
      dashboardPointerList?.items ??
      [],
    expected: [followedA, followedB],
    forbidden: [unfollowed],
    ruleCount,
    createForm: dashboardContentCreateForm === true || dashboardCreateForm === true,
  });

  const evidence = {
    cards: { followedA, followedB, unfollowed },
    follows: { memberA: followA, memberB: followB, adminA: adminFollow },
    stored: {
      memberA: storedOption(followedA, member.name),
      memberB: storedOption(followedB, member.name),
      adminA: storedOption(followedA, admin.name),
      rules: rules.map((rule) => ({
        set: rule.set_id,
        user: rule.user_name,
        content: rule.content,
      })),
      ruleCount,
      storedRuleCount,
    },
    expected: {
      [followedA]: expected[followedA],
      [followedB]: expected[followedB],
      [unfollowed]: expected[unfollowed],
    },
    engage: {
      tab: engage.tab,
      boardStatus: engage.board.status,
      followersLink,
      overviewLink,
      countLabel,
      renderedCount,
      linksOk,
    },
    views: {
      a: { page: viewA.page.status, content: viewA.content.status, verdict: listVerdictA, createForm: viewA.createForm },
      b: { page: viewB.page.status, content: viewB.content.status, verdict: listVerdictB, createForm: viewB.createForm },
      c: { page: viewC.page.status, content: viewC.content.status, verdict: listVerdictC, createForm: viewC.createForm },
    },
    overview: {
      path: dashboardPath,
      pageStatus: dashboard.status,
      contentStatus: dashboardContent.status,
      verdict: overviewVerdict,
      pageText: dashboardText.replace(/\s+/g, " ").slice(0, 300),
      contentText: dashboardContentText.replace(/\s+/g, " ").slice(0, 300),
      editorRows: {
        page: dashboardRows,
        content: dashboardContentRows,
      },
      pointerList: {
        page: dashboardPointerList,
        content: dashboardContentPointerList,
      },
      createForm: { page: dashboardCreateForm, content: dashboardContentCreateForm },
      tabs: { follow: /Follow/.test(dashboardText), ignore: /Ignore/.test(dashboardText) },
    },
    raw: captureEvidence(viewA.html, { check: "w4-followers-view", card: followedA }),
  };

  record(
    W4_CHECKS.followersList,
    listVerdictA.ok && listVerdictB.ok && expected[followedA].length >= 2,
    evidence,
  );
  record(
    W4_CHECKS.followersCount,
    linksOk &&
      renderedCount !== null &&
      renderedCount === expected[followedA].length &&
      renderedCount === listVerdictA.rendered.length,
    evidence,
  );
  record(W4_CHECKS.allFollowedCards, overviewVerdict.ok, evidence);
  record(
    W4_CHECKS.unfollowedControl,
    listVerdictC.ok && expected[unfollowed].length === 0,
    evidence,
  );
}

export const checks = [
  {
    name: "w4-follow-views: the followers list and the all-followed-cards view, opened and reconciled against the stored follow rules",
    only: "w4-follow-views",
    run: (ctx) => runW4FollowViewChecks(ctx),
  },
];
