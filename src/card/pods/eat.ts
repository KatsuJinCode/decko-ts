// Eat: import a Decko pod — the port of `decko eat`.
//
// Ruby (card-1.110.0 lib/cardio/mod/eat.rb, eat/edibles.rb,
// lib/card/director/card_class.rb Card.ensure!, lib/card/director/all.rb
// save_if_needed! / save_needed? / test_field_changing?,
// mod/core/set/all/states.rb pristine? / user_changes?):
//
//   each edible:  Auth.current_id = edible.delete(:user) || --user || Decko Bot
//                 freeze the clock at edible.delete(:time), if given
//                 Card.ensure! edible        (errors are reported, the run goes on)
//
//   Card.ensure!: the card named by :codename (else :name) is fetched and the
//   pod's attributes assigned, or a new card is built from them. In the
//   default conflict mode it is saved only when PRISTINE — new, or touched by
//   nobody but Decko Bot — and only when a tracked field (name, db_content,
//   trash, type_id, codename) actually changes or a field card needs saving.
//
// Not carried, and refused loudly when a pod asks for them: attachment
// uploads (:file / :image keys read from a mod's data/files), the advanced
// codename-vs-name conflict resolution, and the :defer / :override modes.

import type { FetchEngine } from "../fetch.js";
import type { CardActionEngine } from "../actions/card-action-engine.js";
import type { SubcardInput } from "../actions/types.js";
import type { CardsRow } from "../../server/schema.js";
import { DeckoName } from "../name.js";
import { loadYaml, YamlMap, YamlSymbol, type YamlValue } from "./pod-yaml.js";

export interface PodActor {
  id: number;
  name: string;
}

export interface EatOptions {
  /** `decko eat --user`: the account items without :user act as. Decko Bot otherwise. */
  defaultActor: PodActor;
}

export interface EatReport {
  items: number;
  created: number;
  updated: number;
  /** Pristine cards whose attributes already matched: no save, no act. */
  unchanged: number;
  /** Cards someone other than Decko Bot has edited: left alone (default mode). */
  skippedNotPristine: string[];
  errors: { item: string; error: string }[];
}

export class EatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EatError";
  }
}

const DECKO_BOT_ID = 1;

/** Eat a pod YAML document. `engineFor` builds the write engine for an
 *  actor and an optional frozen clock. */
export async function eatYaml(
  fetch: FetchEngine,
  engineFor: (actor: PodActor, now?: () => Date) => CardActionEngine,
  yaml: string,
  opts: EatOptions,
): Promise<EatReport> {
  const doc = loadYaml(yaml);
  const items = Array.isArray(doc) ? doc : doc === null ? [] : [doc];
  const report: EatReport = { items: items.length, created: 0, updated: 0, unchanged: 0, skippedNotPristine: [], errors: [] };
  for (const item of items) {
    if (!(item instanceof YamlMap)) {
      // each_card_hash: `raise Card::Error, "inedible pod data: #{item}"`
      throw new EatError(`inedible pod data: ${String(item)}`);
    }
    const label = describe(item);
    try {
      const outcome = await ensure(fetch, engineFor, item, opts);
      if (outcome === "created") report.created++;
      else if (outcome === "updated") report.updated++;
      else if (outcome === "unchanged") report.unchanged++;
      else report.skippedNotPristine.push(label);
    } catch (error) {
      report.errors.push({ item: label, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

function describe(item: YamlMap): string {
  const name = item.get(new YamlSymbol("name"));
  const codename = item.get(new YamlSymbol("codename"));
  if (Array.isArray(name)) return name.map(String).join("+");
  if (name !== undefined && name !== null) return String(name);
  return codename !== undefined ? String(codename) : "(unnamed)";
}

/** The item's keys as Ruby's symbolize_keys! leaves them. */
function attrs(item: YamlMap): Map<string, YamlValue> {
  const out = new Map<string, YamlValue>();
  for (const [k, v] of item.entries) out.set(k instanceof YamlSymbol ? k.name : String(k), v);
  return out;
}

type Outcome = "created" | "updated" | "unchanged" | "skipped";

async function ensure(
  fetch: FetchEngine,
  engineFor: (actor: PodActor, now?: () => Date) => CardActionEngine,
  item: YamlMap,
  opts: EatOptions,
): Promise<Outcome> {
  const a = attrs(item);
  for (const key of ["file", "image", "storage_type", "mod"]) {
    if (a.has(key)) throw new EatError(`pod attachments are not supported (:${key})`);
  }
  const conflict = a.get("conflict");
  if (conflict !== undefined && conflict !== null && String(conflict).replace(/^:/, "") !== "default") {
    throw new EatError(`conflict mode ${String(conflict)} is not supported`);
  }
  const actor = await resolveActor(fetch, a.get("user"), opts.defaultActor);
  const now = clockFor(a.get("time"));
  const engine = engineFor(actor, now);

  const codename = asString(a.get("codename"));
  const name = a.has("name") ? await resolveName(fetch, a.get("name")) : undefined;
  if (codename === undefined && name === undefined) throw new EatError("Card.ensure must have name or codename");

  // fetch_for_ensure
  let row: CardsRow | undefined;
  if (codename !== undefined) {
    row = await liveRowByCodename(fetch, codename);
    if (name !== undefined) {
      const nameId = await liveIdByName(fetch, name);
      if (nameId !== undefined && nameId !== row?.id) {
        throw new EatError(`codename :${codename} and name "${name.s}" name different cards (advanced conflict)`);
      }
    }
  } else if (name !== undefined) {
    const id = await liveIdByName(fetch, name);
    row = id !== undefined ? await rowById(fetch, id) : undefined;
  }

  const typeSpec = typeSpecOf(a.get("type"));
  const content = a.has("content") ? toContent(a.get("content")) : undefined;
  const subcards = await fieldSubcards(fetch, a.get("fields"));

  if (row === undefined) {
    // Card.new(opts); new cards are pristine; save_needed? (new?) is true.
    if (name === undefined) throw new EatError(`no card has codename :${codename} and the pod gives no name`);
    await engine.createCard({
      name: name.s,
      ...(content !== undefined ? { content } : {}),
      ...typeSpec,
      ...(codename !== undefined ? { codename } : {}),
      ...(Object.keys(subcards).length > 0 ? { subcards } : {}),
    });
    return "created";
  }

  if (!(await pristine(fetch, row))) return "skipped";

  // test_field_changing? over the assigned attributes
  const current = await fetch.fetchById(row.id);
  const nameChanging = name !== undefined && (await nameIsChanging(fetch, row, current?.name, name));
  const contentChanging = content !== undefined && content !== (row.db_content ?? "");
  let typeChanging = false;
  let typeId: number | undefined;
  if (typeSpec.typeCode !== undefined || typeSpec.typeName !== undefined) {
    typeId = await resolveTypeId(fetch, typeSpec);
    typeChanging = typeId !== undefined && typeId !== row.type_id;
  }
  const codenameChanging = codename !== undefined && codename !== (row.codename ?? undefined);
  if (codenameChanging) throw new EatError(`changing a card's codename (:${codename}) is not supported`);
  const fieldsNeedSave = await subcardsNeedSave(fetch, current?.name, subcards);
  if (!nameChanging && !contentChanging && !typeChanging && !fieldsNeedSave) return "unchanged";

  await engine.updateCard({
    cardId: row.id,
    ...(nameChanging && name !== undefined ? { name: name.s } : {}),
    ...(contentChanging && content !== undefined ? { content } : {}),
    ...(typeChanging && typeId !== undefined ? { typeId } : {}),
    ...(fieldsNeedSave ? { subcards } : {}),
  });
  return "updated";
}

function asString(v: YamlValue | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof YamlSymbol) return v.name;
  return String(v);
}

function toContent(v: YamlValue | undefined): string {
  if (v === undefined || v === null) return "";
  if (v instanceof YamlSymbol) return `:${v.name}`;
  if (Array.isArray(v)) return v.map((x) => toContent(x)).join("\n");
  return String(v);
}

/** A pod name: a string, or a list of parts each a codename Symbol or a name. */
async function resolveName(fetch: FetchEngine, v: YamlValue | undefined): Promise<DeckoName> {
  if (typeof v === "string") return DeckoName.parse(v);
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (const part of v) {
      if (part instanceof YamlSymbol) {
        const row = await liveRowByCodename(fetch, part.name);
        if (row === undefined) throw new EatError(`unknown codename in name: :${part.name}`);
        const partName = (await fetch.fetchById(row.id))?.name;
        if (partName === undefined) throw new EatError(`codename :${part.name} has no name`);
        parts.push(partName.s);
      } else {
        parts.push(String(part));
      }
    }
    return DeckoName.parse(parts.join("+"));
  }
  if (v instanceof YamlSymbol) {
    const row = await liveRowByCodename(fetch, v.name);
    const n = row !== undefined ? (await fetch.fetchById(row.id))?.name : undefined;
    if (n === undefined) throw new EatError(`unknown codename: :${v.name}`);
    return n;
  }
  throw new EatError(`unreadable pod name: ${String(v)}`);
}

function typeSpecOf(v: YamlValue | undefined): { typeCode?: string; typeName?: string } {
  if (v === undefined || v === null) return {};
  if (v instanceof YamlSymbol) return { typeCode: v.name };
  return { typeName: String(v) };
}

async function resolveTypeId(
  fetch: FetchEngine,
  spec: { typeCode?: string; typeName?: string },
): Promise<number | undefined> {
  if (spec.typeCode !== undefined) return (await liveRowByCodename(fetch, spec.typeCode))?.id;
  if (spec.typeName !== undefined) return liveIdByName(fetch, DeckoName.parse(spec.typeName));
  return undefined;
}

async function fieldSubcards(fetch: FetchEngine, v: YamlValue | undefined): Promise<Record<string, SubcardInput>> {
  const out: Record<string, SubcardInput> = {};
  if (!(v instanceof YamlMap)) return out;
  for (const [mark, value] of v.entries) {
    let tag: string;
    if (mark instanceof YamlSymbol) {
      const row = await liveRowByCodename(fetch, mark.name);
      const n = row !== undefined ? (await fetch.fetchById(row.id))?.name?.s : undefined;
      if (n === undefined) throw new EatError(`unknown field codename: :${mark.name}`);
      tag = n;
    } else {
      tag = String(mark);
    }
    if (value instanceof YamlMap) throw new EatError(`field hashes with attributes are not supported (+${tag})`);
    out[`+${tag}`] = { content: toContent(value) };
  }
  return out;
}

async function subcardsNeedSave(
  fetch: FetchEngine,
  parent: DeckoName | undefined,
  subcards: Record<string, SubcardInput>,
): Promise<boolean> {
  for (const [key, sub] of Object.entries(subcards)) {
    const full = `${parent?.s ?? ""}${key}`;
    const existing = await fetch.fetchByName(full);
    if (existing === undefined || existing.id === undefined) return true;
    if ((sub.content ?? "") !== (existing.dbContent ?? "")) return true;
  }
  return false;
}

/** name_is_changing? (lib/card/dirty.rb): the name column changed, or for a
 *  compound name either side id. */
async function nameIsChanging(
  fetch: FetchEngine,
  row: CardsRow,
  current: DeckoName | undefined,
  next: DeckoName,
): Promise<boolean> {
  if (next.isSimple) return row.left_id !== null || row.name !== next.s;
  if (row.left_id === null) return true;
  const left = next.leftName !== undefined ? await fetch.lexicon.id(next.leftName) : undefined;
  const right = next.rightName !== undefined ? await fetch.lexicon.id(next.rightName) : undefined;
  void current;
  return (left ?? null) !== row.left_id || (right ?? null) !== row.right_id;
}

/** pristine? (states.rb:87-93) for an existing card. */
async function pristine(fetch: FetchEngine, row: CardsRow): Promise<boolean> {
  if (row.created_at === row.updated_at && Number(row.creator_id) === DECKO_BOT_ID) return true;
  const { rows } = await fetch.driver.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card_actions JOIN card_acts ON card_acts.id = card_actions.card_act_id
     WHERE card_actions.card_id = ? AND (card_actions.draft IS NULL OR card_actions.draft = 0)
       AND card_acts.actor_id != ?`,
    [row.id, DECKO_BOT_ID],
  );
  return Number(rows[0]?.n ?? 0) === 0;
}

async function resolveActor(fetch: FetchEngine, user: YamlValue | undefined, fallback: PodActor): Promise<PodActor> {
  if (user === undefined || user === null) return fallback;
  const name = user instanceof YamlSymbol ? undefined : DeckoName.parse(String(user));
  const row =
    user instanceof YamlSymbol
      ? await liveRowByCodename(fetch, user.name)
      : name !== undefined
        ? await rowById(fetch, (await liveIdByName(fetch, name)) ?? -1)
        : undefined;
  if (row === undefined) return fallback; // `item_user&.card_id || ...`
  return { id: row.id, name: (await fetch.fetchById(row.id))?.name?.s ?? String(user) };
}

/** time_machine: "+N" / "-N" seconds from now, an epoch integer, or a time
 *  string; the save runs at that frozen moment. */
function clockFor(v: YamlValue | undefined): (() => Date) | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  let at: Date;
  if (typeof v === "number") at = new Date(v * 1000);
  else if (/^[+-]\d+$/.test(String(v))) at = new Date(Date.now() + Number(String(v)) * 1000);
  else at = new Date(String(v));
  if (Number.isNaN(at.getTime())) throw new EatError(`unreadable :time ${String(v)}`);
  return () => at;
}

async function rowById(fetch: FetchEngine, id: number): Promise<CardsRow | undefined> {
  const { rows } = await fetch.driver.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [id]);
  return rows[0];
}

async function liveRowByCodename(fetch: FetchEngine, codename: string): Promise<CardsRow | undefined> {
  const { rows } = await fetch.driver.query<CardsRow>(
    "SELECT * FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1",
    [codename],
  );
  return rows[0];
}

/** Card.id(name): the live card's id (the lexicon resolves names, the
 *  retrieval filters trash). */
async function liveIdByName(fetch: FetchEngine, name: DeckoName): Promise<number | undefined> {
  const record = await fetch.fetchByName(name.s);
  if (record === undefined || record.id === undefined || record.trash) return undefined;
  return record.id;
}
