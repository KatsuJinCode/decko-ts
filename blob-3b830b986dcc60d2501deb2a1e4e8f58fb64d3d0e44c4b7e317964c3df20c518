// director-act-lifecycle.test.ts - the port's answer to the act half of
// Ruby's Card::Director (card-1.110.0/lib/card/director.rb).
//
// Ruby keeps an act on a DIRECTOR object: the act card's own director is
// the act's main director (director.rb#main?), `main_director` finds that
// director from anywhere in the act (director.rb#main_director), `need_act`
// creates the act once and shares it with every director in the act
// (director.rb#need_act), and a card that joins the act is appointed to
// it (director.rb#appoint).
//
// The port has no director objects and no director registry: the act is
// the ActWriter's row, and the writer holds the act id and the act card's
// id. These cases pin that shape against real SQLite storage, so the
// claims the port makes about Ruby's director are checked against rows.
//
// The Ruby methods with NO port counterpart are named in the port's own
// source (src/card/history/write-path.ts, the ActWriter class doc):
// director.rb#head?, director.rb#unregister and director.rb#replace_card.
// There is nothing to pin for them here: the port holds no director chain
// and no director registry to point at.

import { afterEach, beforeEach, expect, it } from "vitest";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModEventRegistry } from "../../../src/card/mod-loader/mod-event-registry.js";
import {
  createActionsTestStorage,
  fakeClock,
  JOE,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

let storage: ActionsTestStorage;
beforeEach(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
});
afterEach(() => storage.close());

type ActRow = { id: number; card_id: number | null; actor_id: number | null };
type ActionRow = {
  id: number;
  card_id: number;
  card_act_id: number;
  super_action_id: number | null;
  action_type: number;
};

function engine(stages: string[] = []) {
  const registry = new ModEventRegistry();
  for (const stage of stages) {
    registry.register({
      event: `observe_${stage}`,
      at: stage as "validate" | "store",
      setPath: "all/lifecycle_control",
      modName: "lifecycle_control",
      fn: async () => {},
    });
  }
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    now: fakeClock(),
    modEvents: { registry },
  });
}

it("one request is one act, and the act row names the request's act card (director.rb#need_act, director.rb#main_director)", async () => {
  const result = await engine().createCard({
    name: "Act Parent",
    content: "parent",
    subcards: { "+child": { content: "child" } },
  });
  expect(result).not.toBeNull();

  // ONE act row for the whole request: the act is created once and shared
  // by every card saved in it (Ruby's need_act, director.rb:195-200).
  const acts = await storage.selectAll<ActRow>("SELECT id, card_id, actor_id FROM card_acts");
  expect(acts).toHaveLength(1);
  // The act names its MAIN card: the request's own card, not the card that
  // joined it (Ruby's main?, director.rb:160-162).
  expect(acts[0].card_id).toBe(result!.cardId);
  expect(acts[0].actor_id).toBe(JOE.id);
});

it("a card that joins the act is appointed to it: its action row carries the act id and it is not the act card (director.rb#appoint)", async () => {
  const result = await engine().createCard({
    name: "Act Parent",
    content: "parent",
    subcards: { "+child": { content: "child" } },
  });
  expect(result).not.toBeNull();

  const acts = await storage.selectAll<ActRow>("SELECT id, card_id, actor_id FROM card_acts");
  expect(acts).toHaveLength(1);
  const actId = acts[0].id;

  const actions = await storage.selectAll<ActionRow>(
    "SELECT id, card_id, card_act_id, super_action_id, action_type FROM card_actions ORDER BY id",
  );
  expect(actions.length).toBeGreaterThan(1);

  // EVERY card saved in the request rides the SAME act: the joining card's
  // action row carries the act id, exactly as Ruby's act is shared by the
  // act card and the directors that joined it.
  expect(actions.every((a) => a.card_act_id === actId)).toBe(true);

  // The joining card is not the act card: the act card's own action has no
  // super action (it is the act's root), and the joining card's action is
  // chained under it.
  const actCardAction = actions.find((a) => a.card_id === result!.cardId);
  expect(actCardAction).toBeDefined();
  expect(actCardAction!.super_action_id).toBeNull();
  const joining = actions.find((a) => a.card_id !== result!.cardId);
  expect(joining).toBeDefined();
  expect(joining!.super_action_id).not.toBeNull();
});

it("a second request is a second act: the act belongs to the request, not to the card (director.rb#need_act)", async () => {
  const first = await engine().createCard({ name: "Act Parent", content: "parent" });
  expect(first).not.toBeNull();

  const second = await engine().updateCard({ cardId: first!.cardId, content: "parent v2" });
  expect(second).not.toBeNull();

  const acts = await storage.selectAll<ActRow>("SELECT id, card_id, actor_id FROM card_acts ORDER BY id");
  expect(acts).toHaveLength(2);
  expect(acts.map((a) => a.card_id)).toEqual([first!.cardId, first!.cardId]);
  // The two acts are distinct rows, so the second request did not reuse
  // the first request's act.
  expect(acts[0].id).not.toBe(acts[1].id);
});

it("the joining card runs its own stage walk, so it is caught up to the act's stage by itself (Ruby's reset_stage, director.rb:185-189)", async () => {
  const order: string[] = [];
  const registry = new ModEventRegistry();
  for (const stage of ["validate", "store"] as const) {
    registry.register({
      event: `observe_${stage}`,
      at: stage,
      setPath: "all/lifecycle_control",
      modName: "lifecycle_control",
      fn: async card => {
        order.push(`${stage}:${card.name}`);
      },
    });
  }
  const actEngine = new CardActionEngine(storage.engine, {
    actor: JOE,
    now: fakeClock(),
    modEvents: { registry },
  });

  await actEngine.createCard({
    name: "Act Parent",
    content: "parent",
    subcards: { "+child": { content: "child" } },
  });

  // The joining card runs the act's stages itself: it validates, and it
  // stores, inside the act. The act card's own validate runs first
  // (Ruby's breadth-first stage walk), and the joining card's stages are
  // its own walk from "initialize".
  expect(order).toContain("validate:Act Parent");
  expect(order).toContain("validate:Act Parent+child");
  expect(order).toContain("store:Act Parent+child");
  expect(order).toContain("store:Act Parent");
  const childValidate = order.indexOf("validate:Act Parent+child");
  const parentStore = order.indexOf("store:Act Parent");
  expect(childValidate).toBeGreaterThanOrEqual(0);
  expect(parentStore).toBeGreaterThan(childValidate);
});
