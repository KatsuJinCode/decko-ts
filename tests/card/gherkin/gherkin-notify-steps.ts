// Gherkin step helpers for the update_includers feature ("Updates for
// Children of watched
// cards"). Each function mirrors one upstream step, executed against the
// notify machinery the engine owns: the
// save path's default follow-notify hook (card-action-engine.ts
// dispatchSavePathIntegrations), the rule-algebra follower walk
// (notify/follower-resolver.ts — direct + indirect), and the deck-backed
// follower_notification_email template (notify/deck-resolvers.ts).

import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { Actor } from "../../../src/card/actions/index.js";
import { CaptureTransport } from "../../../src/card/notify/index.js";
import { DeckoName } from "../../../src/card/name.js";
import { givenStandardDeck, freshWorld, closeWorld, type GherkinWorld } from "./gherkin-steps.js";
import { installGherkinNameEnvironment, seedCard, TYPE_IDS } from "./gherkin-storage.js";

// ---------------------------------------------------------------------------
// ids — disjoint from the standard deck's 1..309 range
// ---------------------------------------------------------------------------

/** The follow machinery's codename cards and the notify deck's fixture
 *  cards (the shape the preference SQL joins: sets typed Set, settings
 *  typed Setting, users typed User — notify/follower-resolver.ts
 *  preferenceRows). */
export const NOTIFY_IDS = {
  setting: 410, // the Setting cardtype (codename setting), typed itself
  set: 300, // reused: seedStandardDeck seeds the codename "set" card at 300
  allFollowFieldsRule: 312, // the *all+*follow fields default rule row (310/311
  // are seedStandardDeck's *read setting and *all+*read rule)
  user: 420, // the User cardtype (codename user)
  book: 421, // the Book cardtype (the feature's cardtype)
  phrase: 4, // reused: the Phrase codename card (scenario 5's PlainText structure)
  self: 422, // *self
  type: 423, // *type
  follow: 424, // *follow (setting)
  followFields: 425, // *follow fields (setting)
  always: 426, // *always (setting/option)
  never: 427, // *never
  created: 428, // *created
  edited: 429, // *edited
  template: 430, // follower notification email
  account: 431, // *account
  email: 432, // *email
  ulysses: 440,
} as const;

/** The actors the feature's Background uses (update_includers.feature:10-13
 *  — Joe User signs in and acts; Joe Camel watches Ulysses+*self; Joe
 *  Admin watches Book+*type). The ids are this deck's seeded user-row ids
 *  (the 44x range — the standard deck's auto-ids take 9 and below); the
 *  actor exclusion (notify.rb:51) compares these ids with the seeded
 *  follower rows, so the actor objects and the rows must agree. */
export const JOE_ADMIN: Actor = { id: 441, name: "Joe Admin" };
export const JOE_USER: Actor = { id: 449, name: "Joe User" };
export const JOE_CAMEL: Actor = { id: 442, name: "Joe Camel" };

// ---------------------------------------------------------------------------
// world
// ---------------------------------------------------------------------------

/** The notify world: the gherkin world plus an action engine whose save
 *  path dispatches the follow-notify hook into a CaptureTransport (the
 *  hook the engine installs by default; the transport is the only
 *  swap). */
export interface NotifyWorld {
  world: GherkinWorld;
  /** The engine with the capture transport — every act must run through
   *  it for the mails to be observable. */
  engine: CardActionEngine;
  transport: CaptureTransport;
}

export async function freshNotifyWorld(actor: Actor = JOE_USER): Promise<NotifyWorld> {
  const world = await freshWorld({ actor });
  await givenNotifyDeck(world);
  const transport = new CaptureTransport("gherkin-notify");
  const engine = new CardActionEngine(world.storage.fetcher, {
    actor,
    ipAddress: "127.0.0.1",
    notifyTransport: transport,
    // hook failures are swallowed by the dispatch (mail must not break the
    // save); surface them on the console so a silent [] capture is never
    // mistaken for "no followers".
    notifyLogger: (line) => console.log(line),
  });
  world.engine = engine;
  return { world, engine, transport };
}

export async function closeNotifyWorld(nw: NotifyWorld): Promise<void> {
  await closeWorld(nw.world);
}

/** The signed-in swap ("I am signed in as X" / "I am signed in as Joe
 *  Admin") — a new engine over the same deck with that actor, keeping the
 *  capture transport. */
export function givenSignedInAs(nw: NotifyWorld, actor: Actor): void {
  nw.world.actor = actor;
  nw.world.engine = new CardActionEngine(nw.world.storage.fetcher, {
    actor,
    ipAddress: "127.0.0.1",
    notifyTransport: nw.transport,
  });
  nw.engine = nw.world.engine;
}

/** The update_includers deck. Beyond the standard deck (the write rules
 *  + the codename environment) it seeds, in the shapes the machinery
 *  reads:
 *  - the Set/Setting/User cardtype codename cards (the preference SQL's
 *    join keys — follower-resolver.ts preferenceRows),
 *  - the follow settings and options (*follow, *follow fields, *always,
 *    *never, *created, *edited — the follow machinery's codenames),
 *  - the *all+*follow fields default rule with content "*nests"
 *    (the stock deck's default — every
 *    card's included fields are followed),
 *  - the Book cardtype (update_includers.feature:11 "I create Book card
 *    Ulysses"),
 *  - the three users with +*account+*email children (the delivery targets,
 *    notify/follower-resolver.ts followerEmail).
 *  The followers' watch preferences and the followed cards are per-
 *  scenario (the Background's watching steps), not deck-level. */
export async function givenNotifyDeck(world: GherkinWorld): Promise<void> {
  await givenStandardDeck(world);
  const s = world.storage;
  // cardtype codename cards. Set is reused at 300 (seedStandardDeck);
  // Setting is typed itself so the setting rows' typeId resolves.
  await seedCard(s, { id: NOTIFY_IDS.setting, name: "Setting", codename: "setting", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.user, name: "User", codename: "user", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: NOTIFY_IDS.book, name: "Book", codename: "book", typeId: TYPE_IDS.cardtype });
  // the Phrase codename card (scenario 5's PlainText structure card —
  // typeNameToCode maps PlainText? no: the port's Phrase cardtype; the
  // upstream step "PlainText card" maps to the phrase codename).
  await seedCard(s, { id: TYPE_IDS.phrase, name: "Phrase", codename: "phrase", typeId: TYPE_IDS.cardtype });
  // the set-pattern codename cards the walked sets point at.
  await seedCard(s, { id: NOTIFY_IDS.self, name: "*self", codename: "self", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.type, name: "*type", codename: "type", typeId: NOTIFY_IDS.setting });
  // the follow settings + options.
  await seedCard(s, { id: NOTIFY_IDS.follow, name: "*follow", codename: "follow", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.followFields, name: "*follow fields", codename: "follow_fields", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.always, name: "*always", codename: "always", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.never, name: "*never", codename: "never", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.created, name: "*created", codename: "created", typeId: NOTIFY_IDS.setting });
  await seedCard(s, { id: NOTIFY_IDS.edited, name: "*edited", codename: "edited", typeId: NOTIFY_IDS.setting });
  // the stock default: *all+*follow fields = *nests — every card's
  // INCLUDED fields are followed. Set-typed
  // row (left = the *all card id 7, right = the setting), typeId = the
  // Set codename card's id (the preference/rule SQL's sets.type_id key).
  await seedCard(s, {
    id: NOTIFY_IDS.allFollowFieldsRule,
    leftId: 7,
    rightId: NOTIFY_IDS.followFields,
    typeId: NOTIFY_IDS.set,
    dbContent: "*nests",
  });
  // the follower notification email template — the subject/text
  // shapes interpolateTemplate resolves:
  // {{_user|name}} / {{_|last_action_verb}} / {{_|name}}.
  await seedCard(s, {
    id: NOTIFY_IDS.template,
    name: "follower notification email",
    dbContent: "",
  });
  // explicit ids on every deck seed (433-435 + the tag cards 436-439):
  // without AUTOINCREMENT the auto id is max(rowid)+1, so an auto-id seed
  // between the explicit 4xx ids collides with the next explicit one.
  // The tag cards exist so the template children's compound names resolve
  // (deck-resolvers.ts reads "follower notification email+*subject" etc.
  // by name).
  await seedCard(s, { id: 436, name: "*subject", typeId: TYPE_IDS.phrase });
  await seedCard(s, { id: 437, name: "*text message", typeId: TYPE_IDS.phrase });
  await seedCard(s, { id: 438, name: "*html message", typeId: TYPE_IDS.phrase });
  await seedCard(s, { id: 439, name: "*from", typeId: TYPE_IDS.phrase });
  await seedCard(s, {
    id: 433,
    name: "follower notification email+*from",
    leftId: NOTIFY_IDS.template,
    rightId: 439,
    dbContent: "Decko Bot",
  });
  await seedCard(s, {
    id: 434,
    name: "follower notification email+*subject",
    leftId: NOTIFY_IDS.template,
    rightId: 436,
    dbContent: `{{_user|name}} {{_|last_action_verb}} "{{_|name}}"`,
  });
  await seedCard(s, {
    id: 435,
    name: "follower notification email+*text message",
    leftId: NOTIFY_IDS.template,
    rightId: 437,
    dbContent:
      '"{{_|name}}" was just {{_|last_action_verb}} by {{_user|name}}.\n' +
      "\nYou received this email because you're following \"{{_|followed}}\".\n",
  });
  // the account codename cards the delivery-target lookup reads
  // (<user>+*account+*email — follower-resolver.ts followerEmail).
  await seedCard(s, { id: NOTIFY_IDS.account, name: "*account", codename: "account", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: NOTIFY_IDS.email, name: "*email", codename: "email", typeId: TYPE_IDS.cardtype });
  // the three users + their delivery addresses. Every seed carries an
  // explicit id (441-448 + the users): the cards table has no
  // AUTOINCREMENT, so an auto-id seed between explicit ids collides with
  // the next explicit one.
  const userEmailIds: Array<{ actor: Actor; email: string; junctionId: number; emailId: number }> = [
    { actor: JOE_ADMIN, email: "joe@admin.com", junctionId: 443, emailId: 444 },
    { actor: JOE_CAMEL, email: "joe@camel.com", junctionId: 445, emailId: 446 },
    { actor: JOE_USER, email: "joe@user.com", junctionId: 447, emailId: 448 },
  ];
  for (const user of userEmailIds) {
    await seedCard(s, { id: user.actor.id, name: user.actor.name, typeId: NOTIFY_IDS.user });
    await givenUserEmail(world, user.actor.name, user.email, {
      junctionId: user.junctionId,
      emailId: user.emailId,
    });
  }
  await installGherkinNameEnvironment(s);
}

/** The delivery target for one user: the +*account junction + its +*email
 *  child (notify/follower-resolver.ts followerEmail reads
 *  <name>+*account+*email; empty emails deliver to no one). */
export async function givenUserEmail(
  world: GherkinWorld,
  userName: string,
  email: string,
  ids: { junctionId: number; emailId: number },
): Promise<void> {
  const junction = await seedCard(world.storage, {
    id: ids.junctionId,
    name: `${userName}+*account`,
    leftId: (await world.storage.fetcher.fetchByName(userName))!.id,
    rightId: NOTIFY_IDS.account,
    typeId: TYPE_IDS.richText,
  });
  await seedCard(world.storage, {
    id: ids.emailId,
    name: `${userName}+*account+*email`,
    leftId: junction.id,
    rightId: NOTIFY_IDS.email,
    typeId: TYPE_IDS.phrase,
    dbContent: email,
  });
}

/** "Given <user> is watching '<set>'": the follow
 *  preference card <set>+<user>+*follow with content "[[*always]]" — the
 *  link-bracket form the step writes. The card tree is
 *  <set>+<user> (left = the set card, right = the user) and
 *  <set>+<user>+*follow (left = that, right = the *follow setting),
 *  the shapes the preference SQL joins (sets typed Set, users typed
 *  User, settings typed Setting). */
export async function givenWatching(
  world: GherkinWorld,
  userName: string,
  setName: string,
  content: string = "[[*always]]",
): Promise<void> {
  const s = world.storage;
  const { anchor: anchorName, patternCardId } = splitSetPattern(setName);
  const user = await s.fetcher.fetchByName(userName);
  if (user === undefined) throw new Error(`watching: no such user ${userName}`);
  // the set card (e.g. "Ulysses+*self"): left = anchor, right = pattern.
  const anchor = await s.fetcher.fetchByName(anchorName);
  if (anchor === undefined) throw new Error(`watching: no such anchor ${anchorName}`);
  const setCard = await seedCard(s, {
    leftId: anchor.id,
    rightId: patternCardId,
    typeId: NOTIFY_IDS.set,
  });
  // the user-set junction + the preference card.
  const userSet = await seedCard(s, {
    leftId: setCard.id,
    rightId: user.id,
    typeId: NOTIFY_IDS.setting,
  });
  await seedCard(s, {
    leftId: userSet.id,
    rightId: NOTIFY_IDS.follow,
    typeId: NOTIFY_IDS.setting,
    dbContent: content,
  });
}

/** Split "<anchor>+*<pattern>" into the anchor name and the pattern
 *  codename card's id (the *self/*type cards the deck seeds). */
function splitSetPattern(setName: string): { anchor: string; patternCardId: number } {
  const name = DeckoName.parse(setName);
  const tag = name.tagName?.s ?? ""; // "*self" / "*type"
  const anchor = name.leftName?.s ?? "";
  const codename = tag.startsWith("*") ? tag.slice(1) : tag;
  const ids: Record<string, number> = {
    self: NOTIFY_IDS.self,
    type: NOTIFY_IDS.type,
  };
  const patternCardId = ids[codename];
  if (patternCardId === undefined) {
    throw new Error(`watching: unsupported set pattern ${setName}`);
  }
  return { anchor, patternCardId };
}
