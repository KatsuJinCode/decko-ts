// The card_references READ surface and the maintenance sweep
// (lib/card/reference.rb, lib/card/reference/all.rb) as the port carries
// them in src/card/actions/reference-read.ts. Each case runs the real
// functions against real SQLite storage seeded with cards and reference
// rows, and pins the Ruby body's branch for that case:
//
//   referer            (reference.rb:7-9)     Card[referer_id]
//   referer_cards_...  (all.rb:21-23)         uniq ids -> cards, nils out
//   referees_...       (all.rb:35-37)         uniq keys -> fetch new:{}
//   nestees            (all.rb:31-33)         the ref_type "I" rows only
//   name_referers      (all.rb:41-43)         out-rows keyed to my key
//   each_card          (reference.rb:66-71)   live cards, id order
//   recreate_all       (reference.rb:53-57)   wipe, then rebuild per card
//
// Fixture ids (actions-test-storage seedStandardDeck): RichText 2,
// Cardtype 3, *all 7, Pudding 50, Set 300.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import type { FetchEngine } from "../../../src/card/fetch.js";
import {
  eachCard,
  nameReferers,
  nestees,
  recreateAll,
  referer,
  refererCardsFromReferences,
  refereesFromReferences,
  type ReferenceReadRow,
} from "../../../src/card/actions/reference-read.js";

let storage: ActionsTestStorage;
let fetch: FetchEngine;

async function insertReference(
  refererId: number,
  refereeKey: string,
  refereeId: number | null,
  refType: string,
): Promise<void> {
  await storage.driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, ?, NULL)`,
    [refererId, refereeKey, refereeId, refType],
  );
}

beforeEach(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  fetch = storage.engine;
});

afterEach(() => {
  storage.close();
});

describe("referer (reference.rb:7-9)", () => {
  it("answers the card the row's referer_id points at", async () => {
    const card = await referer(fetch, { referer_id: 50, referee_id: null, referee_key: null, ref_type: null });
    expect(card?.id).toBe(50);
    expect(card?.name?.s).toBe("Pudding");
  });

  it("an unlinked row answers undefined (Card[nil] is nil)", async () => {
    const card = await referer(fetch, { referer_id: null, referee_id: 50, referee_key: null, ref_type: null });
    expect(card).toBeUndefined();
  });
});

describe("refererCardsFromReferences (all.rb:21-23)", () => {
  it("uniques the referer ids and drops the unlinked rows", async () => {
    const rows: ReferenceReadRow[] = [
      { referer_id: 50, referee_id: null, referee_key: "pudding", ref_type: "L" },
      { referer_id: 50, referee_id: null, referee_key: "pudding", ref_type: "L" },
      { referer_id: null, referee_id: 2, referee_key: "rich_text", ref_type: "L" },
      { referer_id: 2, referee_id: null, referee_key: "rich_text", ref_type: "L" },
    ];
    const cards = await refererCardsFromReferences(fetch, rows);
    expect(cards.map((c) => c.id)).toEqual([50, 2]);
  });
});

describe("refereesFromReferences (all.rb:35-37)", () => {
  it("resolves known keys to their cards, once per distinct key", async () => {
    const rows: ReferenceReadRow[] = [
      { referer_id: 50, referee_id: 2, referee_key: "rich_text", ref_type: "L" },
      { referer_id: 50, referee_id: 2, referee_key: "rich_text", ref_type: "L" },
      { referer_id: 50, referee_id: 50, referee_key: "pudding", ref_type: "I" },
    ];
    const cards = await refereesFromReferences(fetch, rows);
    expect(cards.map((c) => c.id).sort((x, y) => x - y)).toEqual([2, 50]);
  });

  it("an unknown key answers a NEW card (Card.fetch key, new: {})", async () => {
    const rows: ReferenceReadRow[] = [
      { referer_id: 50, referee_id: null, referee_key: "not_yet_created", ref_type: "L" },
    ];
    const cards = await refereesFromReferences(fetch, rows);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.isNew).toBe(true);
    expect(cards[0]!.name?.s).toBe("not_yet_created");
  });
});

describe("nestees (all.rb:31-33)", () => {
  it("keeps only the INCLUSION rows' referees", async () => {
    const rows: ReferenceReadRow[] = [
      { referer_id: 50, referee_id: 2, referee_key: "rich_text", ref_type: "L" },
      { referer_id: 50, referee_id: 50, referee_key: "pudding", ref_type: "I" },
    ];
    const cards = await nestees(fetch, rows);
    expect(cards.map((c) => c.id)).toEqual([50]);
  });
});

describe("nameReferers (all.rb:41-43)", () => {
  it("answers the live cards whose out-rows key the given key", async () => {
    await insertReference(50, "shared_key", 2, "L");
    await insertReference(2, "shared_key", 2, "L");
    await insertReference(7, "shared_key", 2, "L");
    const cards = await nameReferers(storage.driver, fetch, "shared_key");
    expect(cards.map((c) => c.id).sort((x, y) => x - y)).toEqual([2, 7, 50]);
  });

  it("does not answer a trashed referer", async () => {
    const ghost = await seedCard(storage, { name: "Ghost Referer", trash: true });
    await insertReference(ghost.id, "ghost_key", null, "L");
    const cards = await nameReferers(storage.driver, fetch, "ghost_key");
    expect(cards).toEqual([]);
  });
});

describe("eachCard (reference.rb:66-71)", () => {
  it("visits every live card in id order and skips trashed rows", async () => {
    const ghost = await seedCard(storage, { name: "Ghost Walker", trash: true });
    const visited: number[] = [];
    await eachCard(storage.driver, fetch, (card) => {
      visited.push(card.id);
    });
    expect(visited).toEqual([...visited].sort((x, y) => x - y));
    expect(visited).not.toContain(ghost.id);
    expect(visited).toContain(50);
  });
});

describe("recreateAll (reference.rb:53-57)", () => {
  it("wipes the table and rebuilds rows from the stored content", async () => {
    // a stale row that no live content justifies, plus a real nest in
    // Pudding's content rebuilt from scratch
    await insertReference(50, "stale_leftover", null, "L");
    await storage.driver.query("UPDATE cards SET db_content = '{{RichText}}' WHERE id = 50", []);
    await recreateAll(storage.driver, { id: (n) => fetch.lexicon.id(n) });
    const stale = await storage.selectAll<{ n: number }>(
      "SELECT COUNT(*) AS n FROM card_references WHERE referee_key = 'stale_leftover'",
    );
    expect(Number(stale[0]?.n)).toBe(0);
    const rebuilt = await storage.selectAll<{ referer_id: number; referee_key: string; ref_type: string }>(
      "SELECT referer_id, referee_key, ref_type FROM card_references WHERE referer_id = 50",
    );
    expect(rebuilt.some((r) => r.referee_key === "rich_text" && r.ref_type === "I")).toBe(true);
  });
});
