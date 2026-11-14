// The `implicit_mark` ladder, measured against the PINNED DECK's own method.
//
// The completeness register's B9 row grades the port on `implicit_mark`
// (mark.rb:28-40, "home fallback"). The row's note named the method and
// the fallback but not the LADDER that decides which branch answers, nor
// what the fallback answers when the rule is missing, blank or set.
//
// fixtures/captured/implicit-mark-ruby-oracle.json is what
// oracle-capture-implicit-mark-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own implicit_mark, home_mark and the PINNED
// card gem's own Card::Rule.global_setting:
//
//   the ladder  decko-0.20.0/lib/card_controller/mark.rb:28-44
//                 when initial_setup?            -> prepare_setup_card!; ""
//                 when (name = mark_from_card_hash) -> name
//                 when view_does_not_require_name? -> ""
//                 else                            -> home_mark
//   the rule    card-1.110.0/lib/card/rule.rb:5-9
//                 Auth.as_bot { (card = Card[name]) &&
//                   !card.db_content.strip.empty? && card.db_content }
//
// The port's own home-mark resolution is measured over a real deck here;
// the two serving hosts' mark SOURCE (the ?mark= query's precedence over
// the rule) is measured in tests/deploy/bunny-edge-home-mark.test.ts (the
// serving host) and tests/deploy/staging-home-mark-endpoint.test.ts (the
// staging host).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { homeMarkContent } from "../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/implicit-mark-ruby-oracle.json"), "utf8"),
) as {
  ladder: Record<
    string,
    {
      mark: string | null;
      cardContent: string | null;
      asBotCalls: number;
      ruleLookups: string[];
      error: string | null;
    }
  >;
  explicitMarks: Record<string, { answer: string | null; error: string | null }>;
  homeMark: Record<
    string,
    { cardContent: string | null; answer: string | null; asBotCalls: number; error: string | null }
  >;
  sources: {
    mark: Array<{ line: number; text: string }>;
    rule: Array<{ line: number; text: string }>;
  };
};

describe("the implicit_mark ladder, against the pinned deck gem", () => {
  it("the body carries a card name: that name IS the mark", () => {
    // mark.rb:33-34 - `(name = mark_from_card_hash)` wins over the home
    // fallback, and the fallback is not even read.
    const row = ORACLE.ladder.markFromCardHash;
    expect(row.error).toBeNull();
    expect(row.mark).toBe("Target");
    expect(row.asBotCalls).toBe(0);
  });

  it("a view that needs no name answers the empty mark", () => {
    // mark.rb:35-36 - view_does_not_require_name? answers "".
    const row = ORACLE.ladder.viewDoesNotRequireName;
    expect(row.error).toBeNull();
    expect(row.mark).toBe("");
    expect(row.asBotCalls).toBe(0);
  });

  it("otherwise the home fallback answers, and the rule is read AS THE BOT", () => {
    // mark.rb:37-38 -> home_mark (mark.rb:42-44), and rule.rb:5-9 reads
    // the setting through Auth.as_bot.
    const row = ORACLE.ladder.homeFallback;
    expect(row.error).toBeNull();
    expect(row.mark).toBe("Front");
    expect(row.asBotCalls).toBe(1);
    expect(row.ruleLookups).toEqual(["home"]);
  });

  it("a blank rule content falls back to Home, and a missing rule too", () => {
    // rule.rb:5-9 - `!card.db_content.strip.empty?` - so a whitespace-only
    // content is NOT a setting, and the `|| "Home"` answers.
    expect(ORACLE.ladder.homeFallbackBlankRule.mark).toBe("Home");
    expect(ORACLE.ladder.homeFallbackMissingRule.mark).toBe("Home");
    expect(ORACLE.homeMark.ruleSet.answer).toBe("Front");
    expect(ORACLE.homeMark.ruleBlank.answer).toBe("Home");
    expect(ORACLE.homeMark.ruleMissing.answer).toBe("Home");
  });

  it("the setup branch cannot be stood up: its type id is a runtime constant", () => {
    // mark.rb:30-31 - prepare_setup_card! sets params[:card] = { type_id:
    // Card.default_accounted_type_id }, and that type id is the account
    // mod's `UserID` (card-mod-account-0.20.0/set/all/account.rb:3-5), a
    // constant the pinned gemset never assigns. The capture records the
    // raise rather than inventing a type id; the setup branch's own
    // subject is row B10.
    const row = ORACLE.ladder.initialSetup;
    expect(row.error).toContain("default_accounted_type_id");
    expect(row.mark).toBeNull();
  });

  it("an explicit mark is answered as given, including the empty one", () => {
    // mark.rb:17-18 - explicit_mark answers the mark as given. The empty
    // mark is in the record because a request can carry one (a query's
    // ?mark= with no value), and the hosts must not turn it into the home
    // mark silently.
    expect(ORACLE.explicitMarks[""].answer).toBe("");
    expect(ORACLE.explicitMarks["Front"].answer).toBe("Front");
  });

  it("the pinned sources say all of it out loud", () => {
    const homeMark = ORACLE.sources.mark.find((row) => row.text.includes("global_setting"));
    expect(homeMark).toBeDefined();
    expect(homeMark!.text).toContain("Card::Rule.global_setting(:home) || \"Home\"");
    const rule = ORACLE.sources.rule.find((row) => row.text.includes("as_bot"));
    expect(rule).toBeDefined();
  });
});

describe("the port's home fallback", () => {
  async function deckWithHomeRule(content: string | null): Promise<RenderTestStorage> {
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
    await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
    await seedCard(storage, { id: 31001, name: "Front", typeId: 2, dbContent: "Front body prose" });
    if (content !== null) {
      await seedCard(storage, { id: 31002, name: "*home", codename: "home", typeId: 52, dbContent: content });
    }
    await storage.fetcher.codenames.ensureLoaded();
    return storage;
  }

  it("the *home rule's content is the mark when it is set", async () => {
    // src/card/render/page.ts homeMarkContent - the port's home_mark
    // (mark.rb:42-44) over the globalSettingContent seam.
    const storage = await deckWithHomeRule("Front");
    expect(await homeMarkContent(storage.engine)).toBe("Front");
  });

  it("a blank rule content falls back to Home", async () => {
    const storage = await deckWithHomeRule("   ");
    expect(await homeMarkContent(storage.engine)).toBe("Home");
  });

  it("a missing rule falls back to Home", async () => {
    const storage = await deckWithHomeRule(null);
    expect(await homeMarkContent(storage.engine)).toBe("Home");
  });
});
