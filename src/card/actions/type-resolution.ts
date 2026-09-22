// Type resolution for the action layer — how a save turns `:type_id` /
// `:type_code` / `:type` args (or nothing) into cards.type_id.
//
// Ruby truth (card-1.110.0 mod/core/set/all/type.rb):
//   event :validate_type, :validate, changed: :type_id, on: :save do
//     errors.add :type, t(:core_error_no_such_type) unless type_name   # :24-30
//   end
//   def ensure_type_id lookup                                          # :58-66
//     new_type_id = type_id_from_code || type_id_from_template
//   ...
//   def type_id_from_code                                              # :68-76
//     return if simple?                                               # :69 — SIMPLE short-circuit
//     each_type_assigning_module_key do |module_key|
//       type_id = Card::Set::Type.assignment[module_key]&.card_id      # :72
//       return type_id if type_id
//     end
//     nil
//   end
//   def extract_type_id! args={}                                       # :87-96
//     when (type_id = args.delete(:type_id)&.to_i)  then (zero? ? nil : type_id)
//     when (type_code = args.delete(:type_code)&.to_sym) then type_id_from_codename
//     when (type_name = args.delete :type)          then type_id_from_cardname
//   end
//   def type_id_from_codename code   # :98-101 -> Card::Codename.id code
//   def type_id_from_cardname name   # :102-105 -> name.card_id (Lexicon)
//   def default_type_id              # :3-5     -> Card.fetch_type_id %i[all default]
//
// The full precedence on :create with no explicit type args is therefore
// (Card.new args -> handle_type -> ensure_type_id):
//   extract_type_id!  (nil when no type_id/type_code/type in args)
//   || type_id_from_code || type_id_from_template
//   || default_type_id at the FETCH level (Card.fetch_type_id %i[all default])
// validate_type (:24-30) raises when none of the above resolve. The walk
// here mirrors that chain in TS, with the type-assignment walk sitting
// between the explicit-arg check and the default. See
// src/card/set-patterns/set-type-assignment.ts for the registry port.

import { DeckoName, type Nameish } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import { CardActionError, type TypeSpec } from "./types.js";
import { resolveAssignedTypeIdForCard } from "../set-patterns/set-type-assignment.js";

/** Resolve the cards.type_id for a create/update, or throw type-unknown.
 *  Precedence is extract_type_id!'s (type.rb:87-96): explicit typeId >
 *  typeCode > typeName. When none was given the type-assignment walk runs
 *  (type.rb:68-76 — same shape as ensure_type_id's type_id_from_code; the
 *  walk fires only for COMPOUND cards, exactly like Ruby's `simple?`
 *  guard). Finally, if neither an explicit arg nor an assignment hits,
 *  Card.default_type_id (type.rb:3-5, *all+*default rule card's type_id)
 *  is the fallback the port keeps for parity with Ruby's
 *  `ensure_type_id -> nil -> fetch sets default` behavior. */
export async function resolveTypeId(
  fetcher: FetchEngine,
  spec: TypeSpec & { name?: Nameish },
): Promise<number> {
  if (spec.typeId !== undefined && spec.typeId !== 0) {
    await assertTypeCardExists(fetcher, spec.typeId);
    return spec.typeId;
  }
  if (spec.typeCode !== undefined) {
    // type_id_from_codename via type_id_or_error (type.rb:98-101):
    // a missing codename adds "<val> is not a known type."
    const id = await fetcher.codenames.id(spec.typeCode);
    if (id === undefined) {
      throw new CardActionError("type-unknown", `${spec.typeCode} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  if (spec.typeName !== undefined) {
    // type_id_from_cardname via Card#card_id (the Lexicon lookup).
    const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);
    if (id === undefined) {
      throw new CardActionError("type-unknown", `${String(spec.typeName)} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  // type_id_from_code (type.rb:68-76) — the type-assignment walk. Fires
  // only when a name is present and the card is COMPOUND (the simple?
  // guard, type.rb:69, sits in findAssignedTypeName). The walk returns
  // undefined for unresolvable cases (no registration, no anchor
  // codenames), exactly like Ruby's `Card::Set::Type.assignment[...]`
  // returning nil.
  if (spec.name !== undefined) {
    const assignedId = await resolveAssignedTypeIdForCard(fetcher, {
      name: spec.name,
      isNew: true, // ensureSides creates a NEW card; ensure_type_id is a new-arg flow
    });
    if (assignedId !== undefined) return assignedId;
  }
  return defaultTypeId(fetcher);
}

/** Card.default_type_id (type.rb:3-5): `Card.fetch_type_id %i[all default]`
 *  — the type_id of the `*all+*default` rule card itself (seed truth:
 *  mod/core/data/fixtures/real/cards.yml cards_011 = id 11, left_id 7 =
 *  `*all`, right_id 8 = `*default`, type_id 2 = the basic cardtype).
 *  `fetch_type_id` is `fetch(*mark, skip_modules: true)&.type_id`
 *  (fetch/card_class.rb:92-94). */
export async function defaultTypeId(fetcher: FetchEngine): Promise<number> {
  const ruleCard = await fetcher.fetchWithOptions(
    [{ codename: "all" }, { codename: "default" }],
    { skipModules: true },
  );
  if (ruleCard === undefined || ruleCard.typeId === undefined) {
    // validate_type (type.rb:24-30): the default rule names no resolvable
    // type card -> "no such type".
    throw new CardActionError("type-unknown", "no such type (default type rule is missing)");
  }
  return ruleCard.typeId;
}

/** validate_type (type.rb:24-30): `errors.add :type, :no_such_type unless
 *  type_name` — type_name resolves the type CARD (type.rb:32-35
 *  `quick_fetch(type_id)&.name`), so the id must name a live card. */
export async function assertTypeCardExists(
  fetcher: FetchEngine,
  typeId: number,
): Promise<void> {
  const typeCard = await fetcher.fetchById(typeId, { skipModules: true });
  if (typeCard === undefined || typeCard.trash) {
    throw new CardActionError("type-unknown", "no such type");
  }
}
