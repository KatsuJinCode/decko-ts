// The Home mark, measured against the PINNED DECK's own method and the
// PINNED seed's own value.
//
// The completeness register's C6 row grades the port on the Home mark
// ("`*home` global rule, mark.rb:42-44"). The row's note named the rule
// read but not the VALUE the pinned deck ships, nor the exact read shape.
//
// fixtures/captured/home-mark-ruby-oracle.json is what
// oracle-capture-home-mark-ruby.rb (tests/server/) recorded by EXECUTING
// the PINNED DECK's own home_mark over the three rule states, and by
// reading the PINNED seed's own *home row out of
// card-mod-defaults-0.20.0/data/real.yml:
//
//   the method  decko-0.20.0/lib/card_controller/mark.rb:42-44
//                 def home_mark
//                   Card::Rule.global_setting(:home) || "Home"
//                 end
//   the read    card-1.110.0/lib/card/rule.rb:5-9
//                 Auth.as_bot { (card = Card[name]) &&
//                   !card.db_content.strip.empty? && card.db_content }
//
// The port's home-mark resolution over a live deck is measured in
// tests/server/implicit-mark-parity.test.ts (the homeMarkContent seam,
// one case per rule state), the serving host's bare arm in
// tests/deploy/bunny-edge-home-mark.test.ts, and the staging host's in
// tests/deploy/staging-home-mark-endpoint.test.ts.

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
  readFileSync(path.join(REPO, "fixtures/captured/home-mark-ruby-oracle.json"), "utf8"),
) as {
  homeMark: Record<
    string,
    { cardContent: string | null; answer: string | null; asBotCalls: number; ruleLookups: string[]; error: string | null }
  >;
  pinnedSeed: {
    file: string;
    homeRow: { name: string; type: string; codename: string; content: string } | null;
  };
  sources: {
    mark: Array<{ line: number; text: string }>;
    rule: Array<{ line: number; text: string }>;
  };
};

describe("the home mark, against the pinned deck gem and seed", () => {
  it("the pinned seed ships *home with content Home", () => {
    // The agreement that made the port's hardcoded "Home" invisible until
    // a rule was edited: the value every fresh pinned deck answers is
    // exactly "Home".
    expect(ORACLE.pinnedSeed.homeRow).toEqual({
      name: "*home",
      type: "pointer",
      codename: "home",
      content: "Home",
    });
  });

  it("the rule is read AS THE BOT, by the home codename", () => {
    // rule.rb:5-9 reads through Auth.as_bot; the capture records one bot
    // read per home read, and the lookup is the "home" codename.
    expect(ORACLE.homeMark.ruleSet.asBotCalls).toBe(1);
    expect(ORACLE.homeMark.ruleSet.ruleLookups).toEqual(["home"]);
  });

  it("the answer is the rule content, or Home when it is blank or missing", () => {
    expect(ORACLE.homeMark.ruleSet).toMatchObject({ cardContent: "Front", answer: "Front", error: null });
    expect(ORACLE.homeMark.ruleBlank).toMatchObject({ cardContent: "   ", answer: "Home", error: null });
    expect(ORACLE.homeMark.ruleMissing).toMatchObject({ cardContent: null, answer: "Home", error: null });
  });

  it("the pinned sources say all of it out loud", () => {
    const homeMark = ORACLE.sources.mark.find((row) => row.text.includes("global_setting"));
    expect(homeMark).toBeDefined();
    expect(homeMark!.text).toContain("Card::Rule.global_setting(:home) || \"Home\"");
    const strip = ORACLE.sources.rule.find((row) => row.text.includes("strip.empty?"));
    expect(strip).toBeDefined();
  });
});

describe("the port's home mark", () => {
  async function deckWithHomeRule(content: string | null): Promise<RenderTestStorage> {
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
    await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
    if (content !== null) {
      await seedCard(storage, { id: 31002, name: "*home", codename: "home", typeId: 52, dbContent: content });
    }
    await storage.fetcher.codenames.ensureLoaded();
    return storage;
  }

  it("answers the seeded value, the edited value, and the fallback, exactly as the pinned method does", async () => {
    // The seeded deck (the pinned seed's own content).
    expect(await homeMarkContent((await deckWithHomeRule("Home")).engine)).toBe("Home");
    // An edited rule moves the mark - the case the hardcoded "Home" could
    // never follow.
    expect(await homeMarkContent((await deckWithHomeRule("Front")).engine)).toBe("Front");
    // Blank falls back (rule.rb:5-9's strip check); missing falls back.
    expect(await homeMarkContent((await deckWithHomeRule("   ")).engine)).toBe("Home");
    expect(await homeMarkContent((await deckWithHomeRule(null)).engine)).toBe("Home");
  });

  it("THE READ FOLLOWS THE RULE once the write path's expiry has run", async () => {
    // The row's own subject: the Home mark is a READ of the *home global
    // rule (mark.rb:42-44), not a boot-time constant. The read goes through
    // the engine's fetcher, so it follows the rule card's content once the
    // card has been expired - and every save on the port expires the card
    // it wrote (the hosts' own write path does exactly that).
    //
    // The mechanism measured here, both halves: a raw database edit with
    // NO expiry is INVISIBLE to the read (the fetcher's card entry is
    // cached), and the same edit with the write path's expiry IS visible.
    // That is the whole dependency between "the mark follows the rule" and
    // "the mark is read per request".
    const storage = await deckWithHomeRule("Home");
    expect(await homeMarkContent(storage.engine)).toBe("Home");
    await storage.counting.query("UPDATE cards SET db_content = ? WHERE name = ?", [
      "Front",
      "*home",
    ]);
    // Without the expiry: the cached entry still answers the old value.
    expect(await homeMarkContent(storage.engine)).toBe("Home");
    // With the write path's expiry (what every save on the port performs
    // on the card it wrote): the read follows the rule.
    storage.fetcher.expireName("*home");
    expect(await homeMarkContent(storage.engine)).toBe("Front");
    storage.close();
  });
});
