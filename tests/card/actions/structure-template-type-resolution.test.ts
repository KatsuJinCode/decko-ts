// The *structure branch of new_card_template resolving in the action
// layer's SINGLE type authority.
//
// Ruby truth (card-mod-content-0.20.0 set/all/templating.rb:52-59):
//   def new_card_template
//     default = rule_card :default, skip_modules: true          # :53
//     return default unless (structure = dup_structure default&.type_id)
//     ...                                                       # :54-58
//   end
//   def dup_structure type_id                                   # :61-65
//     dup_card = dup
//     dup_card.type_id = type_id || Card.default_type_id
//     dup_card.structure_rule_card                              # :44-48 (_self nils)
//   end
// and type.rb:76-78 `type_id_from_template = name && template&.type_id` —
// so a NEW card's db-side type is the governing *STRUCTURE rule card's own
// type when one resolves, the *default rule's type otherwise.
//
// Corpus exposure (census over a sha-verified raw copy
// 6A44DFDC20CA941E66DA6BA08ADD7F1A5CF35EC1A3BA75CC43A70920E609440E): 139
// live *structure rule rows; 8,780
// new-card names resolve one; 2,164 of them with a structure type DIFFERENT
// from the default-leg answer (the census's examples are all *right-class
// rules: "*input type+*right -> *right+*right+*structure"). The port's
// templateTypeId (src/card/actions/type-resolution.ts) walks only the
// *default leg before this port — these arms pin the structure leg in the
// same shape the syncenv-cold-fidelity probes pin the default leg
// .
//
// Arms:
//   S1  name-scoped *structure rule on the *right set: the side resolves
//       the STRUCTURE rule's type, not the global default's.
//   S2  "_self" content nils the rule card (structure_rule_card, :47) and
//       the walk does NOT continue: the answer falls to the default leg /
//       defaultTypeId tail.
//   S3  no *structure rule anywhere: the default-leg behavior is unchanged
//.
//   S4  dup typing (dup_structure :63): a `Phrase+*type+*structure` rule is
//       reached ONLY because the dup is typed Phrase by the *default rule —
//       without the dup's type the *type candidate cannot apply.
//   S5  a NULL-content *structure rule still supplies its TYPE (only _self
//       nils the card; structured CONTENT is the one that falls through on
//       nil, content/all.rb:25-27).
//   S6  write path: engine.createCard applies the structure-resolved type —
//       gate and write share resolveTypeId (single type authority).
//   S7  name-scoped *default rule + "_self" *structure rule: the DEFAULT
//       rule's type answers (templating.rb:54 `return default` fires when
//       dup_structure hands back the :47 nil) — NOT the global *all+*default
//       tail. The _self branch's return is the default leg's answer, which
//       is undefined-safe: when that leg also missed, Ruby's template is nil
//       and the caller's tail is correct (S2's shape).
//   S8  name-scoped *default + a normal *structure rule on the SAME set:
//       the structure rule's type still wins — the fix's guard arm (the
//       default leg's answer must not preempt a resolvable structure).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { resolveTypeId } from "../../../src/card/actions/type-resolution.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";
import { resetSetTypeAssignments } from "../../../src/card/set-patterns/set-type-assignment.js";

const SET_TYPE_ID = 2;
const SETTING_TYPE_ID = 21; // the Setting cardtype card (codename "setting") —
// the SettingID the rule-cache Setting gate reads (type-resolution.ts:177-188,
// card-1.110.0 lib/card/rule/cache.rb:18)
const ANYONE_ID = 6;
const RICHTEXT_TYPE_ID = 3;
const PHRASE_TYPE_ID = 50;
const LAYOUT_TYPE_ID = 51;

async function seedSkeleton(s: ActionsTestStorage, defaultTypeId: number): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  // Real-deck shape (card-1.110.0 mod/core cards.yml): the setting cards the
  // template walk's cache.rb:18 gates read are Setting-typed, and the
  // Setting cardtype card exists so codename "setting" resolves. The walk
  // reads ONLY *default (default leg) and *structure (structure leg); the
  // Setting cardtype card's own type is never read.
  await seedCard(s, { id: 21, name: "Setting", codename: "setting", typeId: RICHTEXT_TYPE_ID });
  await seedCard(s, {
    id: 14, name: "*structure", codename: "structure", typeId: SETTING_TYPE_ID,
  });
  await seedCard(s, {
    id: 17, name: "*default", codename: "default", typeId: SETTING_TYPE_ID,
  });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 3, name: "Rich Text", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 33, name: "*all+*default", leftId: 1, rightId: 17, typeId: defaultTypeId });
}

async function seedAllCreateAnyone(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, {
    id: 10, name: "*all+*create", leftId: 1, rightId: 4,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, ANYONE_ID, "anyone");
}

/** The census's dominant class: a *structure rule on a *right SET anchored
 *  on the name's RIGHT part — the corpus's "*right+*right+*structure"
 *  governing every `<X>+*right` rule slot (63 of the 139 live *structure
 *  rule rows are *right-class; the census's type-delta examples are all
 *  this shape). A junction whose right part is *type ("Fruit+*type") walks
 *  the candidate "*type+*right+*structure" (anchor = name.right). */
async function seedFruitStructureDeck(structureContent: string | null): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, RICHTEXT_TYPE_ID);
  await seedCard(s, { id: 50, name: "Phrase", codename: "phrase", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 18, name: "*right", codename: "right" });
  await seedCard(s, { id: 55, name: "Fruit", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 56, name: "*type+*right", leftId: 8, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 62, name: "*type+*right+*structure", leftId: 56, rightId: 14,
    typeId: PHRASE_TYPE_ID, dbContent: structureContent ?? undefined,
  });
  await seedAllCreateAnyone(s);
  return s;
}

/** The dup-typing deck: the *default rule types Fruit fields Phrase, and a
 *  `Phrase+*type+*structure` rule (Rich Text) is reachable ONLY through the
 *  dup's default-derived type (dup_structure, templating.rb:63). */
async function seedDupTypingDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, RICHTEXT_TYPE_ID);
  await seedCard(s, { id: 50, name: "Phrase", codename: "phrase", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 18, name: "*right", codename: "right" });
  await seedCard(s, { id: 55, name: "Fruit", typeId: SET_TYPE_ID });
  // The *right set card for Fruit fields (Set-typed per cache.rb:17) and the
  // name-scoped *default rule hanging off it — the junction chain the S4 arm
  // describes (rule left_id must point at the SET card, not at "Fruit").
  await seedCard(s, {
    id: 60, name: "Fruit+*right", leftId: 55, rightId: 18, typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 61, name: "Fruit+*right+*default", leftId: 60, rightId: 17,
    typeId: PHRASE_TYPE_ID,
  });
  await seedCard(s, { id: 91, name: "Phrase+*type", leftId: 50, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 92, name: "Phrase+*type+*structure", leftId: 91, rightId: 14,
    typeId: RICHTEXT_TYPE_ID,
  });
  await seedAllCreateAnyone(s);
  return s;
}

/** The default-vs-_self deck (S7/S8): a NAME-SCOPED *default rule and a
 *  *structure rule on the SAME set, both resolvable for the queried name.
 *  "Fruit+*type" right-anchors on "*type", so both rules hang off the
 *  "*type+*right" set card (56, Set-typed per cache.rb:17): 63 = the
 *  *default rule (Phrase 50), 62 = the *structure rule (Layout 51, content
 *  per arm). THREE distinct types so every mis-route is observationally
 *  unique: 51 structure / 50 default rule / 3 the global *all+*default
 *  tail the caller falls to when templateTypeId answers undefined. */
async function seedDefaultStructureDeck(structureContent: string | null): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, RICHTEXT_TYPE_ID);
  await seedCard(s, { id: 50, name: "Phrase", codename: "phrase", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 51, name: "Layout", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 18, name: "*right", codename: "right" });
  await seedCard(s, { id: 56, name: "*type+*right", leftId: 8, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 63, name: "*type+*right+*default", leftId: 56, rightId: 17,
    typeId: PHRASE_TYPE_ID,
  });
  await seedCard(s, {
    id: 62, name: "*type+*right+*structure", leftId: 56, rightId: 14,
    typeId: LAYOUT_TYPE_ID, dbContent: structureContent ?? undefined,
  });
  return s;
}

beforeEach(() => {
  setNameEnvironment(undefined); // declared-cold state per arm
  resetSetTypeAssignments();
});

afterEach(() => {
  resetSetTypeAssignments();
  setNameEnvironment(undefined);
});

describe("structure-template type resolution: new_card_template's *structure branch", () => {
  it("S1: a name-scoped *structure rule supplies the new side's type (not the global default)", async () => {
    const s = await seedFruitStructureDeck("{{+content}}");
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    // Ruby: template = dup_structure(default&.type_id) -> the
    // *type+*right+*structure rule card (candidate anchor = name.right,
    // the port's oracle-tested ruleNamesForCard algebra); type.rb:76-78
    // answers ITS type.
    expect(typeId).toBe(PHRASE_TYPE_ID);
  });

  it("S2: \"_self\" content nils the rule card and the answer falls to the default tail", async () => {
    const s = await seedFruitStructureDeck("_self");
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    // structure_rule_card (templating.rb:47) nils the _self card WITHOUT
    // continuing the walk; new_card_template returns the *default rule —
    // none name-scoped here, so the defaultTypeId tail (*all+*default, 3).
    expect(typeId).toBe(RICHTEXT_TYPE_ID);
  });

  it("S3: no *structure rule anywhere — the default-leg behavior is unchanged", async () => {
    const s = await seedFruitStructureDeck(null);
    await s.driver.query("DELETE FROM cards WHERE id = 62", []); // remove the structure rule
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    expect(typeId).toBe(RICHTEXT_TYPE_ID);
  });

  it("S4: dup typing — the *default rule's type makes a *type-set *structure rule reachable", async () => {
    const s = await seedDupTypingDeck();
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+leaf" });
    // The *default leg resolves Fruit+*right+*default (Phrase, 50); the DUP
    // is typed Phrase (dup_structure :63), so `Phrase+*type+*structure`
    // applies and the template is THAT rule (Rich Text, 3). Without the
    // dup's type the *type candidate cannot apply and the answer would be
    // the *default rule's 50.
    expect(typeId).toBe(RICHTEXT_TYPE_ID);
  });

  it("S5: a NULL-content *structure rule still supplies its TYPE", async () => {
    const s = await seedFruitStructureDeck(null); // dbContent NULL on rule 62
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    // Only _self nils the rule CARD (structure_rule_card :47); a NULL
    // db_content rule is still the template — its type applies (the
    // CONTENT fall-through is structured_content's, not this walk's).
    expect(typeId).toBe(PHRASE_TYPE_ID);
  });

  it("S6: the write path applies the structure-resolved type (single type authority)", async () => {
    const s = await seedFruitStructureDeck("{{+content}}");
    const engine = new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
    const result = await engine.createCard({ name: "Fruit+*type" });
    expect(result?.cardId).toBeDefined();
    const side = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(side?.type_id).toBe(PHRASE_TYPE_ID);
  });

  it("S7: name-scoped *default + \"_self\" *structure — the DEFAULT rule's type answers (templating.rb:54 return default)", async () => {
    const s = await seedDefaultStructureDeck("_self");
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    // Ruby: structure_rule_card (templating.rb:47) nils the _self card
    // WITHOUT continuing the walk; dup_structure (:61-65) hands that nil
    // back, so new_card_template's :54 `return default unless (structure =
    // ...)` makes the NAME-SCOPED *default rule ("*type+*right+*default",
    // Phrase 50) the template — its type answers. NOT undefined: undefined
    // would send the caller to its defaultTypeId tail, the global
    // *all+*default (Rich Text 3) — the latent divergence this arm pins.
    expect(typeId).toBe(PHRASE_TYPE_ID);
  });

  it("S8: name-scoped *default + normal *structure — the structure rule still wins (fix guard)", async () => {
    const s = await seedDefaultStructureDeck("{{+content}}");
    const typeId = await resolveTypeId(s.engine, { name: "Fruit+*type" });
    // templating.rb:54: structure PRESENT -> it is the template (the
    // *structure rule's own type, Layout 51); the default leg's Phrase 50
    // must not preempt it. Same deck as S7 minus the _self content.
    expect(typeId).toBe(LAYOUT_TYPE_ID);
  });
});
