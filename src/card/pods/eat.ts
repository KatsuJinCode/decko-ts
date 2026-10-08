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
// The :conflict modes (:default, :defer, :override) and the codename-vs-name
// resolution follow Card.ensure (card_class.rb), including the override
// failure described at ensureAdvanced.

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
  // Names an override moved aside, still resolving to the moved card for
  // the rest of the run (see ensureAdvanced).
  const staleNames = new Map<string, number>();
  const report: EatReport = { items: items.length, created: 0, updated: 0, unchanged: 0, skippedNotPristine: [], errors: [] };
  for (const item of items) {
    if (!(item instanceof YamlMap)) {
      // each_card_hash: `raise Card::Error, "inedible pod data: #{item}"`
      throw new EatError(`inedible pod data: ${String(item)}`);
    }
    const label = describe(item);
    try {
      const outcome = await ensure(fetch, engineFor, item, opts, staleNames);
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
  staleNames: Map<string, number>,
): Promise<Outcome> {
  const a = attrs(item);
  for (const key of ["file", "image", "storage_type", "mod"]) {
    if (a.has(key)) throw new EatError(`pod attachments are not supported (:${key})`);
  }
  const mode = conflictMode(a.get("conflict"));
  const actor = await resolveActor(fetch, a.get("user"), opts.defaultActor);
  const now = clockFor(a.get("time"));
  const engine = engineFor(actor, now);

  const codename = asString(a.get("codename"));
  const name = a.has("name") ? await resolveName(fetch, a.get("name")) : undefined;
  if (codename === undefined && name === undefined) throw new EatError("Card.ensure must have name or codename");

  const typeSpec = typeSpecOf(a.get("type"));
  const content = a.has("content") ? toContent(a.get("content")) : undefined;
  const subcards = await fieldSubcards(fetch, a.get("fields"));
  const wanted: Wanted = { name, codename, typeSpec, content, subcards };

  // fetch_for_ensure: the card named by the codename (else the name), and,
  // when both are given and the name belongs to a different live card, that
  // other card.
  let row: CardsRow | undefined;
  let other: CardsRow | undefined;
  if (codename !== undefined) {
    row = await liveRowByCodename(fetch, codename);
    if (name !== undefined) {
      const nameId = staleNames.get(name.key) ?? (await liveIdByName(fetch, name));
      if (nameId !== undefined && nameId !== row?.id) other = await rowById(fetch, nameId);
    }
  } else if (name !== undefined) {
    const id = await liveIdByName(fetch, name);
    row = id !== undefined ? await rowById(fetch, id) : undefined;
  }

  if (codename !== undefined && other !== undefined) {
    return ensureAdvanced(fetch, engine, mode, row, other, wanted, staleNames);
  }
  // ensure_purity_simple
  if (row === undefined) return createWanted(engine, wanted, name);
  const attempt = mode === "override" ? true : mode === "default" ? await pristine(fetch, row) : false;
  if (!attempt) return mode === "defer" ? "unchanged" : "skipped";
  return saveIfNeeded(fetch, engine, row, wanted);
}

type ConflictMode = "default" | "defer" | "override";

/** with_conflict_mode: the item's :conflict, :default when absent. */
function conflictMode(v: YamlValue | undefined): ConflictMode {
  if (v === undefined || v === null) return "default";
  const mode = (v instanceof YamlSymbol ? v.name : String(v)).replace(/^:/, "");
  if (mode === "default" || mode === "defer" || mode === "override") return mode;
  // invalid_conflict_mode! (card_class.rb)
  throw new EatError(`invalid conflict mode: ${mode}. Must be defer, default, or override`);
}

interface Wanted {
  name: DeckoName | undefined;
  codename: string | undefined;
  typeSpec: { typeCode?: string; typeName?: string };
  content: string | undefined;
  subcards: Record<string, SubcardInput>;
}

/** Card.new(opts).save!: new cards are pristine and always need saving. */
async function createWanted(
  engine: CardActionEngine,
  wanted: Wanted,
  name: DeckoName | undefined,
): Promise<Outcome> {
  if (name === undefined) throw new EatError(`no card has codename :${wanted.codename} and the pod gives no name`);
  await engine.createCard({
    name: name.s,
    ...(wanted.content !== undefined ? { content: wanted.content } : {}),
    ...wanted.typeSpec,
    ...(wanted.codename !== undefined ? { codename: wanted.codename } : {}),
    ...(Object.keys(wanted.subcards).length > 0 ? { subcards: wanted.subcards } : {}),
  });
  return "created";
}

/** save_if_needed!: the assigned attributes saved when a tracked field
 *  changes (name, db_content, type_id, codename) or a field card needs
 *  saving. `keepName` leaves the card its own name (name_before_act). */
async function saveIfNeeded(
  fetch: FetchEngine,
  engine: CardActionEngine,
  row: CardsRow,
  wanted: Wanted,
  opts: { keepName?: boolean } = {},
): Promise<Outcome> {
  const current = await fetch.fetchById(row.id);
  const name = opts.keepName === true ? undefined : wanted.name;
  const nameChanging = name !== undefined && (await nameIsChanging(fetch, row, current?.name, name));
  const contentChanging = wanted.content !== undefined && wanted.content !== (row.db_content ?? "");
  let typeChanging = false;
  let typeId: number | undefined;
  if (wanted.typeSpec.typeCode !== undefined || wanted.typeSpec.typeName !== undefined) {
    typeId = await resolveTypeId(fetch, wanted.typeSpec);
    typeChanging = typeId !== undefined && typeId !== row.type_id;
  }
  const codenameChanging = wanted.codename !== undefined && wanted.codename !== (row.codename ?? undefined);
  const fieldsNeedSave = await subcardsNeedSave(fetch, current?.name, wanted.subcards);
  if (!nameChanging && !contentChanging && !typeChanging && !codenameChanging && !fieldsNeedSave) return "unchanged";
  if (nameChanging || contentChanging || typeChanging || fieldsNeedSave) {
    await engine.updateCard({
      cardId: row.id,
      ...(nameChanging && name !== undefined ? { name: name.s } : {}),
      ...(contentChanging && wanted.content !== undefined ? { content: wanted.content } : {}),
      ...(typeChanging && typeId !== undefined ? { typeId } : {}),
      ...(fieldsNeedSave ? { subcards: wanted.subcards } : {}),
    });
  }
  // The codename column is stored with the save (codename is not a history
  // field, so it leaves no change row).
  if (codenameChanging && wanted.codename !== undefined) {
    await fetch.driver.query("UPDATE cards SET codename = ? WHERE id = ?", [wanted.codename, row.id]);
  }
  return "updated";
}

/** ensure_purity_advanced: the codename names one card (or none yet) and
 *  the name another live card. */
async function ensureAdvanced(
  fetch: FetchEngine,
  engine: CardActionEngine,
  mode: ConflictMode,
  card: CardsRow | undefined,
  other: CardsRow,
  wanted: Wanted,
  staleNames: Map<string, number>,
): Promise<Outcome> {
  const otherName = (await fetch.fetchById(other.id))?.name ?? DeckoName.parse(other.name ?? "");
  if (mode === "defer") {
    // ensure_advanced_defer: only when the codename card does not exist yet,
    // created under an alternative of the taken name.
    if (card !== undefined) return "unchanged";
    return createWanted(engine, wanted, await alternativeName(fetch, otherName));
  }
  if (mode === "default") {
    // ensure_advanced_default
    if (card !== undefined && !(await pristine(fetch, card))) return "skipped";
    if (card === undefined && (await pristine(fetch, other))) {
      return saveIfNeeded(fetch, engine, other, wanted);
    }
    // ensure_non_conflicting_name: a new card takes an alternative name, an
    // existing one keeps its own.
    if (card === undefined) return createWanted(engine, wanted, await alternativeName(fetch, otherName));
    return saveIfNeeded(fetch, engine, card, wanted, { keepName: true });
  }
  // ensure_advanced_override
  if (card === undefined) return saveIfNeeded(fetch, engine, other, wanted);
  const moved = await alternativeName(fetch, otherName);
  await engine.updateCard({ cardId: other.id, name: moved.s });
  staleNames.set(otherName.key, other.id);
  // Ruby then saves the codename card under the name the other card has just
  // left, and the uniqueness check still finds that name taken (within the
  // run its Lexicon keeps the old key's id), so the save fails and the other
  // card stays renamed. Later items of the same run that give the old name
  // with a codename still find the moved card (staleNames), as Ruby does. A
  // Ruby defect the port reproduces so an import ends in the same state;
  // recorded in recovery/parity-team/persistence.md.
  throw new EatError(`Validation failed: Name must be unique; '${moved.s}' already exists.`);
}

/** Name#alternative (card-1.110.0 lib/card/name/card_class.rb
 *  generate_alternative_name): "<name> 1", counted up (String#next!) while
 *  a card with that name exists. */
async function alternativeName(fetch: FetchEngine, name: DeckoName): Promise<DeckoName> {
  for (let n = 1; ; n++) {
    const candidate = DeckoName.parse(`${name.s} ${n}`);
    if ((await fetch.lexicon.id(candidate)) === undefined) return candidate;
  }
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
