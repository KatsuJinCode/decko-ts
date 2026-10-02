// COLD-engine probes for the sync-environment fidelity contract: the
// type-assignment walk behind virtualSidePart -> resolveTypeId must answer
// from the db-backed data, never from the SYNC name environment
// (fetch.ts:666 installNameEnvironment; warm-only peek adapters
// fetch.ts:661-664), which Ruby never needs (Card::Name#codename
// resolves through the db-backed lexicon/codename cards at Card.new time,
// mod/core/set/all/initialize.rb:54 + mod/core/set/all/type.rb:58-66).
// The write path's walk is the DRIVER-BACKED one (set-type-assignment.ts
// findAssignedTypeNameDriverBacked — Lexicon + codehash through the async
// registries, the db-backed data Ruby answers), and resolveTypeId's
// default fallback walks the full rule_card(:default) set-candidate chain
// (templating.rb:52-53 -> rule/all.rb:13-15) instead of hard-coding the
// global *all+*default card.
//
// What each arm measures (contract doc: docs/sync-env-cold-write-contract.md):
//   T1  global *default template deck, COLD, Editor-locked chain type:
//       the *default chain resolves *all+*default (type-resolution.ts
//       defaultTypeId tail) through the ASYNC driver-backed registries
//       (retrieve.ts:142-149, nameFromMarkParts), so the side still
//       carries the chain type and the verdict matches Ruby. NOT divergent.
//   T2  same deck cold, Anyone-open chain type: side WRITTEN with the
//       chain type — gate and write agree cold, bytes match Ruby.
//   M   mechanism pin: the SYNC findAssignedTypeName helper (render-side
//       new-card typing, render.ts:1784) still answers through the sync
//       env peeks — COLD-dead (undefined) and WARM-live ("phrase") for the
//       same registration. The WRITE path no longer rides it: its walk is
//       the driver-backed one, which is exactly why P1 flips below.
//   P1  codename-assignment deck, COLD, Editor-locked assigned type:
//       FLIPPED TO RUBY (was the measured divergence — cold create
//       ALLOWED, side written the global default 42): the driver-backed
//       walk resolves Right::All -> "phrase" cold, the side's verdict is
//       the TYPE-CHECKED one (Phrase+*type+*create, Editor) and the write
//       would apply the same type — cold deny, no rows, warm or cold.
//   P2  same deck WARM (install + warm the two entries the walk's anchors
//       need, exactly the composition serving boots run at boot): Ruby's
//       deny, unchanged — parity now holds in BOTH environment states.
//   N1  the template chain's name-scoped reach: FLIPPED TO RUBY (was
//       ignored warm-or-cold) — resolveTypeId's fallback walks the
//       rule_card(:default) candidates, so the *right-set *default rule
//       (Editor-locked type 90) gates the side cold and warm alike.
//
// P1 and N1 pin the Ruby verdicts; before the fix they pinned the
// contract's DIVERGENCE side (the measured over-allow), and
// docs/sync-env-cold-write-contract.md section 3 records both states.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { type CardActionError } from "../../../src/card/actions/types.js";
import {
  findAssignedTypeName,
  registerSetTypeAssignment,
  resetSetTypeAssignments,
} from "../../../src/card/set-patterns/set-type-assignment.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

const SET_TYPE_ID = 2;
const SETTING_TYPE_ID = 21; // the Setting cardtype card (codename "setting") —
// the card cache.rb:18's `settings.type_id = #{SettingID}` filter compares
// against; the N1 rule's right part (*default) is typed with it.
const ANON_CARD_ID = 11;
const EDITOR_ID = 7;
const ANYONE_ID = 6;

/** Codename + rule skeleton (the secverify suite's seedSkeleton shape):
 *  `defaultTypeId` (type-resolution.ts:95-112) is the *all+*default rule
 *  card's own type_id — Card.default_type_id (mod/core/set/all/type.rb:3-5). */
async function seedSkeleton(s: ActionsTestStorage, defaultTypeId: number): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*update", codename: "update" });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 21, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(s, { id: 17, name: "*default", codename: "default", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 42, name: "Rich Text", typeId: 3 });
  await seedCard(s, { id: 33, name: "*all+*default", leftId: 1, rightId: 17, typeId: defaultTypeId });
}

/** *all+*create -> [[Anyone]] fallback (id 10). */
async function seedAllCreateAnyone(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, {
    id: 10, name: "*all+*create", leftId: 1, rightId: 4,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, ANYONE_ID, "anyone");
}

/** Signup trunk (ids 12/13/14): Signup+*type+*create -> [[Anyone]] — the
 *  junction's own explicit type stays Anyone-open so the SIDE walk decides. */
async function seedSignupTrunk(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 13, name: "Signup+*type", leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, name: "Signup+*type+*create", leftId: 13, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 14, ANYONE_ID, "anyone");
}

/** Template deck: *all+*default's type_id IS the chain type (90 = Exotic
 *  Type), locked to Editor (protect) or open to Anyone. Ruby resolves the
 *  missing side's type through the same chain at Card.new
 *  (templating.rb:16-59 new_card_template -> rule_card :default). */
async function seedTemplateDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 90);
  await seedCard(s, { id: 90, name: "Exotic Type", typeId: 3 });
  await seedCard(s, { id: 91, name: "Exotic Type+*type", leftId: 90, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 92, name: "Exotic Type+*type+*create", leftId: 91, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 92, protect ? EDITOR_ID : ANYONE_ID, protect ? "editor" : "anyone");
  await seedAllCreateAnyone(s);
  await seedSignupTrunk(s);
  return s;
}

/** Assignment deck: a *right type ASSIGNMENT maps the compound side part
 *  "Hatch+*all" to codename "phrase" (mod/core/set/right/autoname.rb:1
 *  `assign_type :phrase` shape; registration via registerSetTypeAssignment).
 *  The GLOBAL default here is plain Rich Text (42). */
async function seedPhraseDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 91, name: "Phrase", codename: "phrase", typeId: 3 });
  await seedCard(s, { id: 92, name: "Phrase+*type", leftId: 91, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 93, name: "Phrase+*type+*create", leftId: 92, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 93, protect ? EDITOR_ID : ANYONE_ID, protect ? "editor" : "anyone");
  await seedAllCreateAnyone(s);
  await seedSignupTrunk(s);
  return s;
}

/** COLD state: no name environment at all — setNameEnvironment(undefined)
 *  is the process-global truth (environment.ts:54), so every arm declares
 *  its state explicitly instead of inheriting the previous test's. */
function forceColdEnvironment(): void {
  setNameEnvironment(undefined);
}

/** WARM state: the serving-boot composition (deploy/worker.ts:233-250,
 *  vm-staging-server.mjs:1182-1195) scaled to the two entries the walk's
 *  *right anchor needs: the anchor name in the lexicon and the codehash. */
async function installWarmEnvironment(s: ActionsTestStorage): Promise<void> {
  await s.engine.lexicon.id("*all");
  await s.engine.codenames.ensureLoaded();
  s.engine.installNameEnvironment();
}

async function asError(p: Promise<unknown>): Promise<CardActionError | undefined> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError | undefined;
}

beforeEach(() => {
  forceColdEnvironment(); // every arm starts from the declared-cold state
  resetSetTypeAssignments();
});

afterEach(() => {
  resetSetTypeAssignments();
  setNameEnvironment(undefined); // leave no warm env for the next file
});

// -----------------------------------------------------------------------
// T arms: the global *default template path is COLD-SAFE
// -----------------------------------------------------------------------

describe("syncenv cold fidelity: the global *default template path (cold-safe)", () => {
  it("T1 (deny, COLD): Editor-locked chain type still denies — verdict matches Ruby", async () => {
    const s = await seedTemplateDeck(true);
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Paddy+Fresh Side", typeId: 12 }));
    // Ruby: missing side's type at Card.new via rule_card(:default) ->
    // *all+*default (type_id 90, Editor-locked) -> deny. The port's
    // defaultTypeId resolves the rule card through the ASYNC db-backed
    // registries, so the cold engine gives the same type-checked verdict.
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(20); // nothing written (20 seeded incl. the Setting cardtype card)
  });

  it("T2 (allow mirror, COLD): open chain type — side WRITTEN with the chain type 90", async () => {
    const s = await seedTemplateDeck(false);
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Paddy+Fresh Side", typeId: 12 });
    expect(result?.cardId).toBeDefined();
    const side = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE `key` = 'fresh_side'",
    );
    expect(side?.type_id).toBe(90); // gate and write agree cold; bytes match Ruby
    expect(await s.count("cards")).toBe(23); // junction + two sides (23 seeded incl. the Setting cardtype card)
  });
});

// -----------------------------------------------------------------------
// M arm: the mechanism — anchored module keys are what dies cold
// -----------------------------------------------------------------------

describe("syncenv cold fidelity: the assignment walk's environment dependence", () => {
  it("M: findAssignedTypeName is dead COLD and live WARM for the same registration", async () => {
    registerSetTypeAssignment("Right::All", "phrase"); // autoname.rb:1 shape
    const s = await seedPhraseDeck(true);
    const input = { name: "Hatch+*all", isNew: true };

    // COLD: the *right anchor's codename resolves through DeckoName#cardId
    // (name.ts:802-803, sync env peek) -> anchorCodenames null (instance.ts
    // :158-166) -> moduleKey null -> filtered -> no assignment.
    forceColdEnvironment();
    expect(findAssignedTypeName(input)).toBeUndefined();

    // WARM: the same registration resolves (Phrase+*type+*create then gates).
    await installWarmEnvironment(s);
    expect(findAssignedTypeName(input)).toBe("phrase");
  });
});

/** Name-scoped default deck: a *default rule on the *right SET
 *  ("*all+*right+*default", type_id 90 Editor-locked) applies to the
 *  compound side part "Hatch+*all" in Ruby — template = rule_card(:default)
 *  (templating.rb:52-53) whose rule_card_id walks ALL set candidates in
 *  precedence order (lib/card/rule/all.rb:9-14 -> rule_id_lookup). The
 *  global *all+*default here is plain Rich Text (42). */
async function seedRightDefaultDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 90, name: "Exotic Type", typeId: 3 });
  await seedCard(s, { id: 91, name: "Exotic Type+*type", leftId: 90, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 92, name: "Exotic Type+*type+*create", leftId: 91, rightId: 4,
    dbContent: "[[Editor]]",
  });
  await seedReference(s, 92, EDITOR_ID, "editor");
  await seedCard(s, { id: 18, name: "*right", codename: "right" });
  await seedCard(s, { id: 19, name: "*all+*right", leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 20, name: "*all+*right+*default", leftId: 19, rightId: 17, typeId: 90 });
  await seedAllCreateAnyone(s);
  await seedSignupTrunk(s);
  return s;
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

describe("syncenv cold fidelity: the COLD divergence, flipped to Ruby (contract: docs/sync-env-cold-write-contract.md)", () => {
  it("P1 (COLD, FLIPPED TO RUBY): Editor-locked assignment side DENIES cold — no rows", async () => {
    registerSetTypeAssignment("Right::All", "phrase");
    const s = await seedPhraseDeck(true);
    const engine = anonEngine(s);
    // Ruby (env state irrelevant, db-backed): side "Hatch+*all" resolves to
    // Phrase (91) at Card.new -> Phrase+*type+*create (Editor) DENIES; no
    // rows. The cold port now rides the SAME db data: the write path's walk
    // is the driver-backed one (set-type-assignment.ts
    // findAssignedTypeNameDriverBacked — Lexicon card_id + Codename i2c via
    // the async registries), so Right::All resolves "phrase" with NO
    // environment installed, virtualSidePart hands the gate the typed part
    // (type 91), and the gate denies before the writer exists. (Pre-fix
    // this arm pinned the measured divergence: create ALLOWED, side
    // written the global default 42 — r3 dump job-1790879690737.)
    const err = await asError(engine.createCard({ name: "Hatch+*all+Pod", typeId: 12 }));
    expect(err?.code).toBe("permission-denied"); // Ruby verdict, cold
    expect(await s.count("cards")).toBe(20); // nothing written (20 seeded incl. the Setting cardtype card)
  });

  it("P2 (WARM control): the same deck + registration denies like Ruby once the environment is installed and warm", async () => {
    registerSetTypeAssignment("Right::All", "phrase");
    const s = await seedPhraseDeck(true);
    await installWarmEnvironment(s); // the serving boots run this pre-request
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Hatch+*all+Pod", typeId: 12 }));
    expect(err?.code).toBe("permission-denied"); // Ruby parity — warm AND cold now
    expect(await s.count("cards")).toBe(20); // nothing written (20 seeded incl. the Setting cardtype card)
  });
});

// -----------------------------------------------------------------------
// N arm: the template chain's name-scoped reach (warm-or-cold, adjacent
// to the cold observation — same contract owns it)
// -----------------------------------------------------------------------

describe("syncenv cold fidelity: name-scoped *default rules gate the side (rule_card(:default) candidate walk)", () => {
  it("N1 (FLIPPED TO RUBY): a *right-set *default rule (Editor-locked type 90) gates the side — deny, no rows", async () => {
    const s = await seedRightDefaultDeck();
    const engine = anonEngine(s);
    // RUBY: new_card_template -> rule_card(:default) walks ALL set
    // candidates (templating.rb:52-53 -> rule/all.rb:13-15 rule_id_lookup),
    // first existing wins -> "*all+*right+*default" (type_id 90,
    // Editor-locked) -> deny. The port's fallback now walks the same
    // candidates by set name (type-resolution.ts templateTypeId), so the
    // side resolves to 90 and the type-scoped create rule denies — cold
    // AND warm. (Pre-fix this arm pinned the gap: the fallback hard-coded
    // the global *all+*default card, side resolved 42, create allowed.)
    const err = await asError(engine.createCard({ name: "Hatch+*all+Pod", typeId: 12 }));
    expect(err?.code).toBe("permission-denied"); // Ruby: deny via the name-scoped template
    expect(await s.count("cards")).toBe(23); // nothing written (23 seeded incl. the Setting cardtype card)
  });
});
