// ACT-155 / W4: the set-membership predicate behind every registered
// content override, measured against REAL Decko starred card names.
//
// WHAT THIS FILE IS. The pin carried by commit 8948c305 recorded the
// defect: cardBelongsToSet (src/card/render/content-overrides.ts) keyed the
// right/* arm on the right part's name KEY, and no card a Decko deck
// produces carries that shape. Its four legs were `it.fails` so the file
// stayed green while the defect stood and went RED when somebody fixed
// the matcher. This file is those four legs with the answers the port now
// gives, plus the registry-path legs (the codename registry is
// authoritative when it can answer) and the negative legs (anchor
// distinctness, left-type discrimination, the unstarred control).
//
// RUBY ORACLE, one predicate behind two surfaces:
//   card-mod-follow-0.20.0/set/right/followers.rb:17-19 puts
//     `left.follow_set_card.prototype.follower_names` in the view, through
//     the `right/followers` override registered at
//     src/card/mod-loader/mods/card-mod-follow.ts:1661;
//   card-mod-date-0.20.0's right/when_created + right/when_last_edited
//     overrides use the same `right` pattern.
//   Ruby's membership rule is Card#in_set? (card-1.110.0
//     lib/card/set/pattern/all.rb:62-64): the card's PATTERNS' module keys
//     against the set module's shortname. A module key is built from the
//     anchor card's CODENAME (lib/card/set/pattern/base.rb:21-29 over
//     `anchor_codenames` :39-43), and the anchor of the right pattern is
//     the right part's card (mod/core/set_pattern/07_right.rb:22-24:
//     `card.name.tag`).
//
// DECK FACTS (measured on the pinned deck
// C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3,
// 21676 cards, read this session):
//   id 22725  name "*followers"       codename "followers"       key "*follower"
//   id 22720  name "*follow"           codename "follow"          key "*follow"
//   id 11739  name "*when created"     codename "when_created"    key "*when_created"
//   id 11742  name "*when last edited" codename "when_last_edited" key "*when_last_edited"
// The star marker is why the key comparison could never answer: the card's
// KEY is singularized ("*followers" -> "*follower") while its CODENAME is
// the name underscored ("followers"), and the set module's path is
// "right/followers" - the codename. Decko looks cards up by key, so the
// names "*followers" and "*follower" are the same card.
//
// The safe_set_keys strings below are the engine's own output for these
// cards (src/card/set-patterns/card-patterns.ts, measured this session with
// the left card's type as the deck has it) - the type_plus_right token
// carries the LEFT card's type, which is not in the card's own name.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardBelongsToSet } from "../../../src/card/render/content-overrides.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";
import { DeckoName } from "../../../src/card/name.js";

/** the engine's safe_set_keys for the cards below, measured this session. */
const SET_KEYS: Record<string, string> = {
  "Home+*followers":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xfollower TYPE_PLUS_RIGHT-basic-Xfollower SELF-home-Xfollower",
  "Mira Member+*follow":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xfollow TYPE_PLUS_RIGHT-user-Xfollow SELF-mira_member-Xfollow",
  "Home+*when created":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xwhen_created TYPE_PLUS_RIGHT-basic-Xwhen_created SELF-home-Xwhen_created",
  "Home+*when last edited":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xwhen_last_edited TYPE_PLUS_RIGHT-basic-Xwhen_last_edited SELF-home-Xwhen_last_edited",
  "A+when_created":
    "ALL ALL_PLUS TYPE-rich_text RIGHT-when_created TYPE_PLUS_RIGHT-rich_text-when_created SELF-a-when_created",
  "A+when last edited":
    "ALL ALL_PLUS TYPE-rich_text RIGHT-when_last_edited TYPE_PLUS_RIGHT-rich_text-when_last_edited SELF-a-when_last_edited",
  "Home+*follow":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xfollow TYPE_PLUS_RIGHT-basic-Xfollow SELF-home-Xfollow",
  "Home+*follower":
    "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-Xfollower TYPE_PLUS_RIGHT-basic-Xfollower SELF-home-Xfollower",
};

/** The pinned deck's codename registry, as the name environment sees it. */
const DECK_CODENAMES: Record<number, string> = {
  22725: "followers",
  22720: "follow",
  11739: "when_created",
  11742: "when_last_edited",
};
const DECK_IDS: Record<string, number> = {
  "*follower": 22725,
  "*follow": 22720,
  "*when_created": 11739,
  "*when_last_edited": 11742,
};

function realCard(name: string, setKeys?: string) {
  const parsed = DeckoName.parse(name);
  return {
    name: parsed,
    key: parsed.key,
    id: 1,
    typeId: 2,
    typeName: "RichText",
    dbContent: "",
    setKeys: setKeys ?? SET_KEYS[name] ?? "",
    record: {},
  } as unknown as Parameters<typeof cardBelongsToSet>[0];
}

/** The deck's lexicon + codename registry, installed as the name
 *  environment (the engine installs it at boot: fetch.ts#installNameEnvironment). */
function installDeckNameEnvironment(): void {
  setNameEnvironment({
    lexicon: {
      name: (id: number) => {
        for (const [key, keyId] of Object.entries(DECK_IDS)) {
          if (keyId === id) return key;
        }
        return undefined;
      },
      id: (key: string) => DECK_IDS[key],
    },
    codename: {
      id: (codename: string) => {
        for (const [id, name] of Object.entries(DECK_CODENAMES)) {
          if (name === codename) return Number(id);
        }
        return undefined;
      },
      name: (codename: string) =>
        Object.values(DECK_CODENAMES).includes(codename) ? codename : undefined,
      nameForId: (id: number) => DECK_CODENAMES[id],
    },
  });
}

beforeEach(() => {
  setNameEnvironment(undefined);
});

afterEach(() => {
  setNameEnvironment(undefined);
});

describe("ACT-155: the right/* arm on REAL starred Decko card names", () => {
  it("Home+*followers belongs to right/followers (the follower-set override fires)", () => {
    const card = realCard("Home+*followers");
    // the star marker rides on the key, never on the codename
    expect(card.name.rightName?.key).toBe("*follower");
    expect(cardBelongsToSet(card, "right/followers")).toBe(true);
  });

  it("Mira Member+*follow belongs to type_plus_right/user/follow (the user-follow override fires)", () => {
    // the type_plus_right anchor is the LEFT card's type plus the right
    // part's card (08_type_plus_right.rb:30-32); the left type reaches the
    // predicate through the card's safe_set_keys, the only place the render
    // enrichment writes it.
    expect(cardBelongsToSet(realCard("Mira Member+*follow"), "type_plus_right/user/follow")).toBe(true);
  });

  it("the date family fires on real starred cards (same predicate, same defect)", () => {
    expect(cardBelongsToSet(realCard("Home+*when created"), "right/when_created")).toBe(true);
    expect(cardBelongsToSet(realCard("Home+*when last edited"), "right/when_last_edited")).toBe(true);
  });

  it("CONTROL: the synthetic unstarred names the committed pins use DO match", () => {
    expect(cardBelongsToSet(realCard("A+when_created"), "right/when_created")).toBe(true);
    expect(cardBelongsToSet(realCard("A+when last edited"), "right/when_last_edited")).toBe(true);
  });

  it("anchor distinctness survives the codename comparison", () => {
    expect(cardBelongsToSet(realCard("Home+*when created"), "right/when_last_edited")).toBe(false);
    expect(cardBelongsToSet(realCard("Home+*when last edited"), "right/when_created")).toBe(false);
    expect(cardBelongsToSet(realCard("Home+*followers"), "right/follow")).toBe(false);
  });

  it("the type_plus_right arm discriminates the LEFT card's type", () => {
    // the same right anchor on a Basic-typed left card is a different set
    const basic = realCard("Home+*follow");
    expect(cardBelongsToSet(basic, "type_plus_right/user/follow")).toBe(false);
    expect(cardBelongsToSet(basic, "type_plus_right/basic/follow")).toBe(true);
  });
});

describe("ACT-155: the codename registry is authoritative when it can answer", () => {
  it("the registry's codename answers for a card whose name spelling differs", () => {
    // Decko looks cards up by KEY: "*follower" and "*followers" are the
    // same card (id 22725, codename "followers"). The name-derived
    // spelling cannot know that - it reads "follower" - so with the
    // registry installed the set is right/followers, and without it the
    // name spelling answers right/follower.
    installDeckNameEnvironment();
    expect(cardBelongsToSet(realCard("Home+*follower"), "right/followers")).toBe(true);
    expect(cardBelongsToSet(realCard("Home+*follower"), "right/follower")).toBe(false);
  });

  it("without the registry the name-derived spelling stands in", () => {
    setNameEnvironment(undefined);
    expect(cardBelongsToSet(realCard("Home+*follower"), "right/follower")).toBe(true);
    expect(cardBelongsToSet(realCard("Home+*follower"), "right/followers")).toBe(false);
  });

  it("the registry answers the date family's anchors too", () => {
    installDeckNameEnvironment();
    expect(cardBelongsToSet(realCard("Home+*when created"), "right/when_created")).toBe(true);
    expect(cardBelongsToSet(realCard("Home+*when last edited"), "right/when_last_edited")).toBe(true);
  });
});
