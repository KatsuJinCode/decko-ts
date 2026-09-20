// Type resolution for the action layer — how a save turns `:type_id` /
// `:type_code` / `:type` args (or nothing) into cards.type_id.
//
// Ruby truth (card-1.110.0 mod/core/set/all/type.rb):
//   event :validate_type, :validate, changed: :type_id, on: :save do
//     errors.add :type, t(:core_error_no_such_type) unless type_name   # :24-30
//   end
//   def ensure_type_id lookup                                          # :62-70
//     new_type_id = type_id_from_code || type_id_from_template
//   ...
//   def extract_type_id! args={}                                       # :81-92
//     when (type_id = args.delete(:type_id)&.to_i)  then (zero? ? nil : type_id)
//     when (type_code = args.delete(:type_code)&.to_sym) then type_id_from_codename
//     when (type_name = args.delete :type)          then type_id_from_cardname
//   end
//   def type_id_from_codename code   # :96-99  -> Card::Codename.id code
//   def type_id_from_cardname name   # :100-103 -> name.card_id (Lexicon)
//   def default_type_id              # :3-5     -> Card.fetch_type_id %i[all default]

import { DeckoName, type Nameish } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import { CardActionError, type TypeSpec } from "./types.js";

/** Resolve the cards.type_id for a create/update, or throw type-unknown.
 *  Precedence is extract_type_id!'s: explicit typeId > typeCode > typeName,
 *  then Card.default_type_id when nothing was given (ensure_type_id fills
 *  the blank on :create). */
export async function resolveTypeId(
  fetcher: FetchEngine,
  spec: TypeSpec,
): Promise<number> {
  if (spec.typeId !== undefined && spec.typeId !== 0) {
    await assertTypeCardExists(fetcher, spec.typeId);
    return spec.typeId;
  }
  if (spec.typeCode !== undefined) {
    // type_id_from_codename via type_id_or_error (type.rb:104-110):
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
