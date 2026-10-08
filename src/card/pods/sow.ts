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
import { dumpYaml, loadYaml, sym, YamlMap, YamlSymbol, type YamlValue } from "./pod-yaml.js";
import { existsSync, readFileSync } from "node:fs";
import { listItemStrings } from "../actions/list-content.js";
import { resolveTypeId } from "../actions/type-resolution.js";

export interface SowOptions {
  /** `-c`: a CQL statement (JSON object); run with `limit: 0` unless it sets one. */
  cql?: Record<string, unknown>;
  /** `-n`: card names (comma-separated on the command line). */
  names?: string[];
  /** `-f`: field tags — each card's `<name>+<tag>` content rides as a field. */
  fieldTags?: string[];
  /** `--items` with `-n` (card_source.rb cards_from_name): `"only"` sows the
   *  named cards' item cards instead of the cards, `true` the cards and then
   *  their item cards. */
  items?: "only" | true;
  /** `--url` (remote_source.rb): the pod is read from this address (a local
   *  path, or an http(s) URL) instead of the deck. */
  url?: string;
  /** `--remote`: the pod of the card named by `-n` on another deck,
   *  `<remote>/<name url_key>/pod.yml`. */
  remote?: string;
  /** `-m` (yaml_dump.rb dump, sow.rb merge_data): the mod data file the pod
   *  is merged into; items matching an existing item by codename or name
   *  replace it, the others are appended. */
  mergeInto?: string;
  /** Reads a remote pod (an injection point for tests); defaults to fetch(). */
  readUrl?: (url: string) => Promise<string>;
}

export class SowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SowError";
  }
}

/** The pod items for the selected cards, in selection order. */
export async function sowItems(fetch: FetchEngine, opts: SowOptions): Promise<YamlValue[]> {
  const source = remoteSource(opts);
  if (source !== undefined) return podFromUrl(source, opts);
  if (opts.names !== undefined && opts.names.length > 0 && opts.items !== undefined) {
    return itemPods(fetch, opts);
  }
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

/** The pod YAML for the selected cards — byte-identical to Ruby's. With
 *  `mergeInto` the merged data file's YAML (Sow#output_hash). */
export async function sowYaml(fetch: FetchEngine, opts: SowOptions): Promise<string> {
  const items = await sowItems(fetch, opts);
  if (opts.mergeInto !== undefined && existsSync(opts.mergeInto)) {
    return dumpYaml(await mergeData(fetch, loadYaml(readFileSync(opts.mergeInto, "utf8")), items));
  }
  return dumpYaml(items);
}

/** remote_source.rb remote_source: `--remote` needs `-n` and names that
 *  card's pod on the remote deck; `--url` is the address itself. */
function remoteSource(opts: SowOptions): string | undefined {
  if (opts.remote !== undefined) {
    const name = opts.names?.join(",");
    if (name === undefined || name === "") throw new SowError("must specify name (-n)");
    // URI.join(remote, "/#{url_key}/", "pod.yml")
    return new URL(`/${DeckoName.parse(name).urlKey}/pod.yml`, opts.remote).toString();
  }
  return opts.url;
}

/** pod_from_url: the YAML read from the address, wrapped in an array. */
async function podFromUrl(source: string, opts: SowOptions): Promise<YamlValue[]> {
  let text: string;
  if (/^https?:/i.test(source)) {
    const read = opts.readUrl ?? (async (u: string) => {
      const res = await fetchUrl(u);
      if (!res.ok) throw new SowError(`${u} not available\n${res.status}`);
      return res.text();
    });
    text = await read(source);
  } else {
    text = readFileSync(source, "utf8");
  }
  let doc: YamlValue;
  try {
    doc = loadYaml(text);
  } catch {
    throw new SowError(`Url ${source} provided invalid yaml`);
  }
  return Array.isArray(doc) ? doc : doc === null ? [] : [doc];
}

const fetchUrl = (url: string): Promise<Response> => globalThis.fetch(url);

/** card_source.rb cards_from_name with --items: the named cards' item cards
 *  (each card's item names, absolutized against its name; an item naming no
 *  card is a new card, as Card.fetch(name, new: {}) builds it), alone or
 *  after the cards. */
async function itemPods(fetch: FetchEngine, opts: SowOptions): Promise<YamlValue[]> {
  const rows = await selectRows(fetch, { names: opts.names });
  const tags = await fieldTagMarks(fetch, opts.fieldTags ?? []);
  const out: YamlValue[] = [];
  if (opts.items === true) for (const row of rows) out.push(await podHash(fetch, row, tags));
  for (const row of rows) {
    const owner = (await fetch.fetchById(Number(row.id)))?.name;
    if (owner === undefined) continue;
    for (const item of listItemStrings(row.db_content)) {
      let itemName: DeckoName;
      try {
        itemName = DeckoName.parse(item).absoluteName(owner);
      } catch {
        continue; // clean_item_name rescues NotFound (an unresolvable mark)
      }
      const record = await fetch.fetchByName(itemName.s);
      if (record !== undefined && record.id !== undefined && !record.trash) {
        out.push(await podHash(fetch, await rowOf(fetch, record.id), tags));
      } else {
        out.push(await newCardPodHash(fetch, itemName));
      }
    }
  }
  return out;
}

/** pod_hash of a card that does not exist yet: its name and the type a new
 *  card of that name gets; no content, no fields. */
async function newCardPodHash(fetch: FetchEngine, name: DeckoName): Promise<YamlMap> {
  const typeId = await resolveTypeId(fetch, { name: name.s });
  const entries: [YamlValue, YamlValue][] = [
    [sym("name"), await podName(fetch, name)],
    [sym("type"), await podType(fetch, { type_id: typeId } as CardsRow)],
  ];
  return new YamlMap(entries.filter(([, v]) => !blank(v)));
}

/** sow.rb merge_data: each new item replaces the old item with the same
 *  codename or name (target_index), or is appended. */
async function mergeData(fetch: FetchEngine, oldDoc: YamlValue, items: YamlValue[]): Promise<YamlValue[]> {
  const target: YamlValue[] = Array.isArray(oldDoc) ? [...oldDoc] : oldDoc === null ? [] : [oldDoc];
  for (const item of items) {
    if (!(item instanceof YamlMap)) {
      target.push(item);
      continue;
    }
    const code = item.get(sym("codename"));
    const key = await podNameKey(fetch, item.get(sym("name")));
    let index = -1;
    for (let i = 0; i < target.length && index < 0; i++) {
      const t = target[i];
      if (!(t instanceof YamlMap)) continue;
      const sameCode = !blank(code) && yamlEqual(code, t.get(sym("codename")));
      if (sameCode || (await podNameKey(fetch, t.get(sym("name")))) === key) index = i;
    }
    if (index >= 0) target[index] = item;
    else target.push(item);
  }
  return target;
}

function yamlEqual(a: YamlValue | undefined, b: YamlValue | undefined): boolean {
  if (a instanceof YamlSymbol && b instanceof YamlSymbol) return a.name === b.name;
  return a === b;
}

/** `item[:name].to_name` as a key: a string's key, or a parts list (each a
 *  codename Symbol or a name) composed. */
async function podNameKey(fetch: FetchEngine, v: YamlValue | undefined): Promise<string> {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (const p of v) parts.push(p instanceof YamlSymbol ? ((await codenameName(fetch, p.name)) ?? `:${p.name}`) : String(p));
    return DeckoName.parse(parts.join("+")).key;
  }
  if (v instanceof YamlSymbol) return DeckoName.parse((await codenameName(fetch, v.name)) ?? `:${v.name}`).key;
  return DeckoName.parse(String(v)).key;
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
