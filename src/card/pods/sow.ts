// Sow: export cards as a Decko pod — the port of `decko sow`.
//
// Ruby (card-1.110.0 lib/cardio/mod/sow.rb, sow/card_source.rb,
// card-mod-format-0.20.0 set/all/data.rb, set/type/basic.rb,
// card-mod-list-0.20.0 set/abstract/id_list.rb, card-mod-content-0.20.0
// set/all/templating.rb):
//
//   pod_hash = { name: pod_name, type: pod_type, codename: codename,
//                content: pod_content, fields: pod_fields(field_tags) }.compact_blank
//   pod_name    = simple? ? name.s : name.part_names.map(&:codename_or_string)
//   pod_type    = type_name.codename_or_string   (nil for RichText, type/basic.rb)
//   pod_content = structure ? nil : db_content   (item names for id lists)
//
// Cards come from a CQL statement (`decko sow -c`, run with limit 0) or a
// comma-separated name list (`-n`). The YAML is `new_data.to_yaml` (Sow#dump
// writes the same string into a mod's data/<podtype>.yml).

import type { FetchEngine } from "../fetch.js";
import type { CardsRow } from "../../server/schema.js";
import { DeckoName } from "../name.js";
import { executeQuery, parseOptionsWithLexicon } from "../../cql/execute.js";
import { findRule } from "../rules/lookup.js";
import { ruleWalkPatternInput } from "../actions/rule-content-walk.js";
import { dumpYaml, sym, YamlMap, type YamlSymbol, type YamlValue } from "./pod-yaml.js";

export interface SowOptions {
  /** `-c`: a CQL statement (JSON object); run with `limit: 0` unless it sets one. */
  cql?: Record<string, unknown>;
  /** `-n`: card names (comma-separated on the command line). */
  names?: string[];
  /** `-f`: field tags — each card's `<name>+<tag>` content rides as a field. */
  fieldTags?: string[];
}

export class SowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SowError";
  }
}

/** The pod items for the selected cards, in selection order. */
export async function sowItems(fetch: FetchEngine, opts: SowOptions): Promise<YamlMap[]> {
  const rows = await selectRows(fetch, opts);
  const tags = await fieldTagMarks(fetch, opts.fieldTags ?? []);
  const out: YamlMap[] = [];
  const firstByKey = new Map<string, CardsRow>();
  for (const row of rows) out.push(await podHash(fetch, await asRubyFetches(fetch, row, firstByKey), tags));
  return out;
}

/** The card Ruby's search hands to pod_hash for a result row. Ruby fetches
 *  each row's card through its name, and the card cache is keyed by the
 *  name's key: two rows that compose to the same name — junctions whose
 *  left part no longer exists, both named "+<right>" — both come back as
 *  whichever was fetched first. The pod then repeats that card and omits
 *  the other; the port does the same so a pod reads identically from
 *  either engine. */
async function asRubyFetches(
  fetch: FetchEngine,
  row: CardsRow,
  firstByKey: Map<string, CardsRow>,
): Promise<CardsRow> {
  const name = (await fetch.fetchById(Number(row.id)))?.name;
  if (name === undefined) return row;
  const first = firstByKey.get(name.key);
  if (first !== undefined) return first;
  firstByKey.set(name.key, row);
  return row;
}

/** The pod YAML for the selected cards — byte-identical to Ruby's. */
export async function sowYaml(fetch: FetchEngine, opts: SowOptions): Promise<string> {
  return dumpYaml(await sowItems(fetch, opts));
}

async function selectRows(fetch: FetchEngine, opts: SowOptions): Promise<CardsRow[]> {
  if (opts.names !== undefined && opts.names.length > 0) {
    const rows: CardsRow[] = [];
    for (const raw of opts.names) {
      const name = raw.trim();
      const record = await fetch.fetchByName(name);
      if (record === undefined || record.id === undefined) throw new SowError(`card not found: ${name}`);
      rows.push(await rowOf(fetch, record.id));
    }
    return rows;
  }
  if (opts.cql !== undefined) {
    const statement = { limit: 0, ...opts.cql };
    // card names in the statement resolve through the lexicon, as Ruby's
    // Card::Lexicon answers them (query/value.rb id_from_val)
    const result = await executeQuery(fetch.driver, statement, { parse: parseOptionsWithLexicon(fetch.lexicon) });
    if (!("rows" in result)) throw new SowError("a CQL count statement selects no cards");
    return result.rows;
  }
  throw new SowError("must specify either name (-n) or CQL (-c)");
}

async function rowOf(fetch: FetchEngine, id: number): Promise<CardsRow> {
  const { rows } = await fetch.driver.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [id]);
  if (rows[0] === undefined) throw new SowError(`card not found: ~${id}`);
  return rows[0];
}

/** field_tag_marks: each tag's codename (a Symbol) or its name. */
async function fieldTagMarks(fetch: FetchEngine, tags: string[]): Promise<(string | YamlSymbol)[]> {
  const out: (string | YamlSymbol)[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag === "") continue;
    out.push(await codenameOrString(fetch, DeckoName.parse(tag.replace(/^:/, ""))));
  }
  return out;
}

/** Name#codename_or_string: the named card's codename as a Symbol, else the name. */
async function codenameOrString(fetch: FetchEngine, name: DeckoName): Promise<string | YamlSymbol> {
  const record = await fetch.fetchByName(name.s);
  const codename = record?.codename;
  return codename !== undefined && codename !== null && codename !== "" ? sym(codename) : name.s;
}

/** Ruby's `blank?`: nil, false, empty or whitespace-only strings, empty collections. */
function blank(v: YamlValue | undefined): boolean {
  if (v === undefined || v === null || v === false) return true;
  // String#blank?: /\A[[:space:]]*\z/ (Unicode White_Space: JavaScript's \s
  // plus NEL, minus the BOM)
  if (typeof v === "string") return [...v].every((ch) => (/\s/.test(ch) && ch.charCodeAt(0) !== 0xfeff) || ch.charCodeAt(0) === 0x85);
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof YamlMap) return v.entries.length === 0;
  return false;
}

async function podHash(fetch: FetchEngine, row: CardsRow, tags: (string | YamlSymbol)[]): Promise<YamlMap> {
  const record = await fetch.fetchById(Number(row.id));
  const name = record?.name;
  if (name === undefined) throw new SowError(`card ~${row.id} has no resolvable name`);
  const entries: [YamlValue, YamlValue][] = [
    [sym("name"), await podName(fetch, name)],
    [sym("type"), await podType(fetch, row)],
    [sym("codename"), row.codename !== null && row.codename !== "" ? sym(row.codename) : null],
    [sym("content"), await podContent(fetch, row, name)],
    [sym("fields"), await podFields(fetch, name, tags)],
  ];
  // compact_blank
  return new YamlMap(entries.filter(([, v]) => !blank(v)));
}

async function podName(fetch: FetchEngine, name: DeckoName): Promise<YamlValue> {
  if (name.isSimple) return name.s;
  const parts: YamlValue[] = [];
  for (const part of name.partNames) parts.push(await codenameOrString(fetch, part));
  return parts;
}

async function podType(fetch: FetchEngine, row: CardsRow): Promise<YamlValue> {
  if (row.type_id === null || row.type_id === undefined) return null;
  const typeCard = await fetch.fetchById(Number(row.type_id));
  if (typeCard === undefined) return null;
  // set/type/basic.rb: RichText (codename basic) cards carry no type.
  if (typeCard.codename === "basic") return null;
  if (typeCard.codename !== undefined && typeCard.codename !== null && typeCard.codename !== "") {
    return sym(typeCard.codename);
  }
  return typeCard.name?.s ?? null;
}

async function podContent(fetch: FetchEngine, row: CardsRow, name: DeckoName): Promise<YamlValue> {
  // structure: an existing card's applicable *structure rule (unless "_self")
  const pattern = await ruleWalkPatternInput(fetch, {
    name,
    id: Number(row.id),
    isNew: false,
    typeId: row.type_id ?? null,
  });
  const structure = await findRule(fetch, pattern, "*structure");
  if (structure !== undefined && (structure.rule.dbContent ?? "").trim() !== "_self") return null;
  if (await isIdList(fetch, row)) return idListItemNames(fetch, row.db_content ?? "");
  return row.db_content ?? null;
}

/** Abstract::IdList's one includer in the deck's mods: Role+*members
 *  (card-mod-account set/type_plus_right/role/members.rb). */
async function isIdList(fetch: FetchEngine, row: CardsRow): Promise<boolean> {
  if (row.left_id === null || row.right_id === null) return false;
  const right = await fetch.fetchById(Number(row.right_id));
  if (right?.codename !== "members") return false;
  const left = await fetch.fetchById(Number(row.left_id));
  if (left?.typeId === undefined || left.typeId === null) return false;
  const leftType = await fetch.fetchById(left.typeId);
  return leftType?.codename === "role";
}

/** id_list.rb pod_content: item_names.join("\n"), each line's id (the
 *  "~" stripped, to_i) as a card name; unknown ids drop out. */
async function idListItemNames(fetch: FetchEngine, content: string): Promise<string> {
  const names: string[] = [];
  for (const line of content.split(/\n/)) {
    const id = Number.parseInt(line.replace(/~/g, ""), 10);
    if (!Number.isFinite(id) || id === 0) continue;
    const card = await fetch.fetchById(id);
    if (card?.name !== undefined) names.push(card.name.s);
  }
  return names.join("\n");
}

async function podFields(fetch: FetchEngine, name: DeckoName, tags: (string | YamlSymbol)[]): Promise<YamlValue> {
  if (tags.length === 0) return null;
  const map = new YamlMap();
  for (const tag of tags) {
    const tagName = typeof tag === "string" ? tag : (await codenameName(fetch, tag.name)) ?? tag.name;
    const field = await fetch.fetchByName(`${name.s}+${tagName}`);
    if (field === undefined || field.id === undefined) continue;
    const row = await rowOf(fetch, field.id);
    const content = await podContent(fetch, row, field.name ?? DeckoName.parse(`${name.s}+${tagName}`));
    if (!blank(content)) map.set(tag, content);
  }
  return map;
}

async function codenameName(fetch: FetchEngine, codename: string): Promise<string | undefined> {
  const { rows } = await fetch.driver.query<{ id: number }>("SELECT id FROM cards WHERE codename = ?", [codename]);
  if (rows[0] === undefined) return undefined;
  return (await fetch.fetchById(Number(rows[0].id)))?.name?.s;
}
