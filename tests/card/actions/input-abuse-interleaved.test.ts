// INPUT-ABUSE LANE: the interaction class — TWO operations in flight over
// the same hostile input, and a hostile-input card rename while its
// reference lives inside another card's rendered content. The
// concurrency driver shape is the concurrent-saves prior art
// (two CardActionEngines over one shared LocalSqliteDriver, Promise.all);
// the oracle for each outcome is the Ruby save semantics the action layer
// ports (name_events.rb validate_name/validate_key; renames refresh the
// referencing cards' content per mod/core set/all/references.rb).
//
// What each probe pins:
//
// 1. Two CONCURRENT creates of one URL-hostile name ("a/b"): the name
//    collides on the collapsed key "a_b" — exactly one save wins, the
//    other is refused with the graceful name-conflict (never a raw
//    storage exception), and one row exists.
// 2. Two CONCURRENT creates of DIFFERENT punctuation-only names ("!!!"
//    and "???"): both refused by validate_key (Key cannot be blank),
//    zero empty-key rows — the concurrent shape of the
//    input-abuse-name-validation pins.
// 3. A RENAME of a nest target while its reference sits in the host's
//    stored content: the save refreshes the reference (the port's
//    refresh-references-out), and the host's next render resolves the NEW
//    name — with an inflection-hostile name ("Naïve Café", whose key
//    collapses the diacritics) as the target.
// 4. A render racing an update of the nested card's content: the render
//    completes with bytes (old or new content, never a throw) — the
//    read side never breaks because a write is in flight.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  actionEngine,
  JOE,
  seedCard,
  seedReference,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { RenderEngine } from "../../../src/card/render.js";

let storage: ActionsTestStorage;
let renderEngine: RenderEngine | undefined;

async function freshDeck(): Promise<CardActionEngine> {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  await seedReadGrant();
  storage.engine.installNameEnvironment();
  renderEngine = new RenderEngine(storage.engine);
  return actionEngine(storage, JOE);
}

/** A SECOND engine over the SAME driver, the concurrent-saves prior-art
 *  shape (one CardActionEngine instance carries one save's state; two
 *  in-flight saves need two engines over one driver). */
function secondEngine(): CardActionEngine {
  const fetcher = new FetchEngine(storage.driver);
  return actionEngine({ ...storage, engine: fetcher }, JOE);
}

/** The stock read grant (*all+*read -> [[Anyone]]): *read rides the *all
 *  set seedStandardDeck already carries (id 7) and the Anyone party card
 *  (id 304), in the actions seed's own conventions. */
async function seedReadGrant(): Promise<void> {
  await seedCard(storage, { id: 9001, name: "*read", codename: "read" });
  const rule = await seedCard(storage, {
    id: 9002, name: "*all+*read", leftId: 7, rightId: 9001,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(storage, rule.id, 304, "anyone");
}

describe("two saves at once over hostile names", () => {
  it("two concurrent creates of 'a/b': one wins, one graceful name-conflict, one row", async () => {
    const engine = await freshDeck();
    try {
      const results = await Promise.allSettled([
        engine.createCard({ name: "a/b", content: "first" }),
        secondEngine().createCard({ name: "a/b", content: "second" }),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
      const reason = (results[1] as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(CardActionError);
      expect((reason as CardActionError).code).toBe("name-conflict");
      const rows = await storage.selectAll<{ id: number }>(
        "SELECT id FROM cards WHERE key = 'a_b'",
      );
      expect(rows.length).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("two concurrent creates of '!!!' and '???': both refused by validate_key, zero empty-key rows", async () => {
    const engine = await freshDeck();
    try {
      const results = await Promise.allSettled([
        engine.createCard({ name: "!!!", content: "bang" }),
        secondEngine().createCard({ name: "???", content: "query" }),
      ]);
      for (const result of results) {
        expect(result.status).toBe("rejected");
        const reason = (result as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(CardActionError);
        expect((reason as CardActionError).code).toBe("validation-failed");
        expect((reason as CardActionError).userMessage).toBe("KEY: cannot be blank");
      }
      const rows = await storage.selectAll<{ id: number }>(
        "SELECT id FROM cards WHERE key = ''",
      );
      expect(rows).toEqual([]);
    } finally {
      storage.close();
    }
  });
});

describe("a rename inside another card's rendered content", () => {
  it("renaming a nest target refreshes the reference; the host's next render resolves the new name", async () => {
    defaultDeckLoader();
    const engine = await freshDeck();
    try {
      // The target's name is inflection-hostile: the diacritics collapse in
      // the KEY (both engines' key alphabet), so the reference machinery
      // must track the same key the nest resolves by.
      const target = await engine.createCard({ name: "Naïve Café", content: "cafe body" });
      expect(target.cardId).toBeGreaterThan(0);
      const host = await engine.createCard({ name: "host page", content: "HEAD{{Naïve Café}}TAIL" });
      expect(host.cardId).toBeGreaterThan(0);

      // Rename the target; the save refreshes the host's stored reference.
      await engine.updateCard({ cardId: target.cardId, name: "Renamed Target" });

      // The host's next render resolves the NEW name.
      const rendered = await renderHostCore("host page");
      expect(rendered).toContain("HEAD");
      expect(rendered).toContain("TAIL");
      expect(rendered).toContain("Renamed Target");
      // The old name's slot is gone (its content body renders — the
      // renamed card carries it; what must NOT appear is the OLD slot).
      expect(rendered).not.toContain('data-card-name="Naïve Café"');
    } finally {
      setDefaultModLoader(undefined);
      storage.close();
    }
  });

  it("a render racing an update of the nested card completes with bytes, never a throw", async () => {
    defaultDeckLoader();
    const engine = await freshDeck();
    try {
      const target = await engine.createCard({ name: "Race Target", content: "OLD BODY" });
      const host = await engine.createCard({ name: "race host", content: "[{{Race Target}}]" });
      void host;
      // Warm once so the render has seated state to race against.
      const warm = await renderHostCore("race host");
      expect(warm).toContain("[");
      const renderPromise = renderHostCore("race host");
      const updatePromise = engine.updateCard({ cardId: target.cardId, content: "NEW BODY" });
      const [rendered, updated] = await Promise.all([
        renderPromise.then(
          (html) => `bytes:${html.length}`,
          (e) => `THREW ${e.constructor.name}: ${e.message}`,
        ),
        updatePromise.then(() => "updated", (e) => `update-threw ${e.constructor.name}`),
      ]);
      expect(updated).toBe("updated");
      expect(rendered).toMatch(/^bytes:\d+$/);
      // After both settle, the next render shows the new content.
      const after = await renderHostCore("race host");
      expect(after).toContain("NEW BODY");
    } finally {
      setDefaultModLoader(undefined);
      storage.close();
    }
  });
});

/** The host card's core view through a render engine over this storage
 *  (the render harness convention: prepare, then render). */
async function renderHostCore(name: string): Promise<string> {
  if (renderEngine === undefined) throw new Error("no render engine");
  const prepared = await renderEngine.prepareItemForRender(name);
  if (prepared === undefined) throw new Error(`${name} not preparable`);
  return renderEngine.render(name, "core");
}
