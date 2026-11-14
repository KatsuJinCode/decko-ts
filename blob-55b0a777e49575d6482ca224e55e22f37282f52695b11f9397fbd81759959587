// P1.4.b + E4.2.a oracle replay: the read-rule DERIVE arm and the codename
// cache reset, anchored to the live-Ruby probe
// (fixtures/captured/codename-reset-and-read-rule-union-oracle.json, written
// by tools/oracle/read-rule-union-and-codename-reset-probe.rb against a
// DISPOSABLE COPY of the oracle deck — the copy is mutated by design, every
// write enumerated in the fixture's provenance block; the canonical deck is
// untouched).
//
// Ruby truth under test:
// - P1.4.b (card-mod-permissions set/all/permissions.rb:139-144 ok_to_read?):
//   `self.read_rule_id ||= permission_rule_id :read` — the STORED column and
//   the live DERIVATION are two distinct inputs. The probe showed both arms
//   on real deck rows: card 605's stored column (rule 10) DENIES Anonymous
//   while NULLing it makes the derive arm GRANT (stored_ok_read false,
//   derived_ok_read true — deck drift between column and derivation), and a
//   governed readable twin is byte-identical stored vs derived
//   (public_derived_matches_stored true). This suite reproduces both shapes
//   deterministically on the seeded deck.
// - E4.2.a (card-1.110.0 lib/card/codename.rb:118-120 codehash memo +
//   :80-84 reset_cache; mod/core/set/all/codename.rb:9-13 event
//   :reset_codename_cache, :integrate, changed: :codename): the memo has NO
//   db fallthrough, so a raw-SQL codename write stays invisible until a real
//   save fires the event; the probe pinned stale_id_lookup nil,
//   memo_unchanged_by_raw_sql true, fresh_id_lookup_after_save 605,
//   memo_was_reset true.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  actionEngine,
  createActionsTestStorage,
  seedStandardDeck,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { quietDenial } from "../../../src/card/permissions/index.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    `${REPO_ROOT}/fixtures/captured/codename-reset-and-read-rule-union-oracle.json`,
    "utf8",
  ),
);

const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 4;

let storage: RenderTestStorage | undefined;

/** The fork-recount permission deck (same ids as
 *  tests/card/permissions/read-permission.test.ts) PLUS the drift shape the
 *  probe captured on oracle card 605: a card whose STORED read_rule_id
 *  points at the denying *type rule while its live derivation finds a
 *  granting one (Open Type+*type+*read -> [[Anyone]]). */
async function seedDeriveDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*read", codename: "read" });
  await seedCard(s, { id: 4, name: "Basic" });
  await seedCard(s, { id: 5, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 7, name: "Role A" });
  await seedCard(s, { id: 15, name: "*type", codename: "type" });
  await seedCard(s, { id: 16, name: "*self", codename: "self" });
  // *all+*read -> [[Anyone]]
  await seedCard(s, { id: 8, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 8, 5, "anyone");
  // Basic+*type+*read -> [[Role A]] (denies Anonymous)
  await seedCard(s, { id: 9, leftId: 4, rightId: 15, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 10, leftId: 9, rightId: 3, dbContent: "[[Role A]]" });
  await seedReference(s, 10, 7, "role_a");
  // governed cards
  await seedCard(s, {
    id: 11, name: "Readable Thing", typeId: BASIC_TYPE_ID,
    dbContent: "readable body", readRuleId: 8, readRuleClass: "*all",
  });
  await seedCard(s, {
    id: 12, name: "Secret Thing", typeId: BASIC_TYPE_ID,
    dbContent: "secret body", readRuleId: 10, readRuleClass: "*type",
  });
  // the DRIFT shape: Open Type + its type set + a GRANTING type read rule
  await seedCard(s, { id: 18, name: "Open Type" });
  await seedCard(s, { id: 19, leftId: 18, rightId: 15, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 20, leftId: 19, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 20, 5, "anyone");
  // card 17: stored column says the DENYING rule 10; its live derivation
  // (Open Type+*type+*read = rule 20, more specific than *all) GRANTS.
  await seedCard(s, {
    id: 17, name: "Drifted Thing", typeId: 18,
    dbContent: "drifted body", readRuleId: 10, readRuleClass: "*type",
  });
  // the oracle card-3 twin: governed, READABLE, and its stored column IS the
  // deriving rule (Open Type+*type+*read = 20) - stored == derived bytes.
  await seedCard(s, {
    id: 21, name: "Open Stored Thing", typeId: 18,
    dbContent: "open stored body", readRuleId: 20, readRuleClass: "*type",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeriveDeck(storage);
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("P1.4.b: the stored column and the derive arm are distinct inputs", () => {
  it("the probe's oracle arms are the anchor", () => {
    expect(fixture.p1_4_b.stored_ok_read).toBe(false);
    expect(fixture.p1_4_b.derived_ok_read).toBe(true);
    expect(fixture.p1_4_b.derived_matches_stored_verdict).toBe(false);
    expect(fixture.p1_4_b.public_derived_matches_stored).toBe(true);
    // the captured stored-arm bytes ARE the quiet denial span
    expect(fixture.p1_4_b.stored_titled).toBe(quietDenial());
  });

  it("stored column denies even though the derivation would grant", async () => {
    const s = storage!;
    // stored read_rule_id = 10 (Basic+*type+*read, [[Role A]]) -> denied
    expect(await s.engine.render("Drifted Thing", "content")).toBe(quietDenial());
  });

  it("NULLing the column hands the verdict to the live derivation", async () => {
    const s = storage!;
    await s.counting.query("UPDATE cards SET read_rule_id = NULL WHERE id = 17", []);
    s.engine.resetCaches();
    // the derive arm walks Open Type+*type+*read ([[Anyone]]) -> renders
    expect(await s.engine.render("Drifted Thing", "content")).toContain("drifted body");
  });

  it("the public twin: byte-identical stored vs derived (oracle card 3)", async () => {
    const s = storage!;
    // Open Stored Thing: stored rule 20 IS its deriving rule (the type rule
    // is more specific than *all, so the walk lands on the same one).
    // Slot ids normalize per the capture's own convention (wrap.rb's
    // SecureRandom hex -> RANDOMIZED, the fixture's recorded form).
    const norm = (h: string) =>
      h.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
    const stored = await s.engine.render("Open Stored Thing", "content");
    expect(stored).toContain("open stored body");
    await s.counting.query("UPDATE cards SET read_rule_id = NULL WHERE id = 21", []);
    s.engine.resetCaches();
    expect(norm(await s.engine.render("Open Stored Thing", "content"))).toBe(norm(stored));
  });

  it("Readable Thing NULLed: the derivation is MORE SPECIFIC than the *all column", async () => {
    const s = storage!;
    // stored *all+*read (8) grants; the derive arm finds Basic+*type+*read
    // (10) FIRST (more specific) -> denies. The stored column and the walk
    // disagree in the DENY direction here - the mirror image of the drift
    // card, and exactly Mystery Thing's existing pin.
    const stored = await s.engine.render("Readable Thing", "content");
    expect(stored).toContain("readable body");
    await s.counting.query("UPDATE cards SET read_rule_id = NULL WHERE id = 11", []);
    s.engine.resetCaches();
    expect(await s.engine.render("Readable Thing", "content")).toBe(quietDenial());
  });

  it("the deny twin: derivation over the same shape reaches the same verdict", async () => {
    const s = storage!;
    expect(await s.engine.render("Secret Thing", "content")).toBe(quietDenial());
    await s.counting.query("UPDATE cards SET read_rule_id = NULL WHERE id = 12", []);
    s.engine.resetCaches();
    // the walk finds Basic+*type+*read ([[Role A]]) FIRST -> still denied
    expect(await s.engine.render("Secret Thing", "content")).toBe(quietDenial());
  });
});

describe("E4.2.a: the codehash memo is stale until the save event resets it", () => {
  it("raw-SQL codename writes stay invisible until a codename save resets", async () => {
    const ts = await createActionsTestStorage();
    try {
      await seedStandardDeck(ts);
      const engine = actionEngine(ts) as CardActionEngine;

      // warm the memo (the seed deck's RichText row carries codename basic)
      const richTextId = await engine.fetch.codenames.id("basic");
      expect(richTextId).toBeDefined();

      // raw SQL write BYPASSES the engine (no event) -> memo goes STALE,
      // exactly Ruby's probe arm (stale_id_lookup nil,
      // memo_unchanged_by_raw_sql true)
      await ts.driver.query(
        "UPDATE cards SET codename = 'probestalecodename' WHERE id = ?",
        [richTextId],
      );
      await expect(engine.fetch.codenames.id("probestalecodename")).resolves
        .toBeUndefined();

      // the real save fires the reset (codenameChanged -> resetCache) and
      // the REBUILT memo reads the rows: both the new codename ...
      const created = await engine.createCard({
        name: "E42A Reset Probe",
        content: "",
        codename: "probelivecodename",
      });
      await expect(engine.fetch.codenames.id("probelivecodename")).resolves
        .toBe(created.cardId);
      // ... AND the raw-written one (the memo was rebuilt from the db, not
      // left frozen - the fixture's memo_was_reset observable)
      await expect(engine.fetch.codenames.id("probestalecodename")).resolves
        .toBe(richTextId);
    } finally {
      ts.close();
    }
  });

  it("the probe's oracle arms are the anchor", () => {
    expect(fixture.e4_2_a.stale_id_lookup).toBeNull();
    expect(fixture.e4_2_a.memo_unchanged_by_raw_sql).toBe(true);
    expect(fixture.e4_2_a.memo_was_reset).toBe(true);
    expect(fixture.e4_2_a.fresh_id_lookup_after_save).toBe(605);
  });
});
