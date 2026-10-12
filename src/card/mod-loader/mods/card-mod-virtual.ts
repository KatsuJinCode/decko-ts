// The card-mod-virtual gem (card-mod-virtual-0.20.0), ported through the
// mod loader - the virtual-card materialization mod (the card_virtuals
// cache: virtual cards never save their own row; their content is
// materialized into a card_virtuals row keyed by (left_id, right_id)).
//
// The gem's tree (the installed
// card-mod-virtual-0.20.0/): one set file (set/abstract/virtual_cache.rb),
// one lib file (lib/card/virtual.rb), no mod.yml, no views, no assets. The
// compat report (tools/compat-report/mod-compat-report.json,
// card-mod-virtual-0.20.0 entry) confirms: 0 html views declared, 0
// missing; 1 set module, 1 lib file; the only hooks are the two
// prepare_to_store events save_virtual_content / delete_virtual_content.
// This module ports BOTH files in full:
//
// - lib/card/virtual.rb - the Card::Virtual record model over the
//   card_virtuals table (the table exists in the shared schema,
//   src/server/schema.ts card_virtuals + db/schema.sqlite.sql:164-174, and
//   this is its first engine consumer): Virtual.fetch / Virtual.save /
//   Virtual.delete (virtual.rb:22-35) with the find/create keying from
//   where_card (virtual.rb:64-72, left_id|left_key + right_id; the
//   non-compound sentinel right_id -2, virtual.rb:82-88), the
//   validate_card raise (virtual.rb:90-104 - Ruby's 3-arg Kernel#raise
//   shape preserved: message = the card name, the descriptive text lands
//   in the backtrace slot, including the source's "count not cacheable"
//   typo), the record-level update/touch (virtual.rb:8-11), card_id and
//   cardname (virtual.rb:13-19), plus the Card::Cache[Virtual] analog -
//   a temp-only cache (card-1.110.0 lib/card/cache.rb:16-20: @shared
//   exists only with a :store opt, and a headless engine has none) with
//   Temporary's fetch/read/write/delete semantics
//   (lib/card/cache/temporary.rb:26-33, 47-50, 57-59).
// - set/abstract/virtual_cache.rb - the abstract set module: virtual? /
//   virtual_content / db_content / updated_at (virtual_cache.rb:3-19),
//   the two event bodies with their abort :success markers
//   (virtual_cache.rb:21-29), history?/followable? pinned false
//   (virtual_cache.rb:35-41), and delete/delete! as update trash: true
//   delegating to the ActWriter write path (virtual_cache.rb:43-51).
//
// NOT ported :
// - the abort pipeline itself: `abort :success` unwinds the surrounding
//   save so the virtual card's own cards row is never written - the TS
//   engine has no save-transaction pipeline to unwind yet (same later-wave
//   note as card-mod-history's events); the event bodies here return the
//   abort marker and the caller plays it. The Virtual side effects (the
//   card_virtuals writes) run for real and are proven against storage.
// - event execution wiring: the mod's events[] ARE pinned on the manifest
//   below (the events surface in
//   mod-manifest.ts ModSetModuleFile.events). The fn bodies are
//   documented stubs - the Ruby body needs the SQL driver (card_virtuals
//   INSERT/UPDATE/DELETE), the VirtualRecordCache (the Card::Cache[Virtual]
//   analog), and the deterministic clock (sqlDateTime); none of those
//   surfaces ride the current ModEngineHost (the body receives only
//   ModEventCard + ModEngineHost - see mod-manifest.ts:172-184). Stubs
//   cite the Ruby body lines and name the seam each one would call into;
//   the real wired bodies belong to a later change that grows the host
//   shape (or moves the events into the write path's stage seam where
//   driver + clock are in scope).

import type { SQLDatabaseDriver, SQLStatement } from "../../../server/driver.js";
import type { CardVirtualsRow, SQLDateTime } from "../../../server/schema.js";
import { sqlDateTime } from "../../history/act.js";
import type { SavedAction, ActWriter, CardFieldState } from "../../history/write-path.js";
import type { CardRecord } from "../../fetch/card-record.js";
import { isNewCard, isRealCard } from "../../fetch/card-record.js";
import { DeckoName } from "../../name.js";
import type { DeckoModManifest, ModEventFn } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// the Card::Cache[Virtual] analog - temp-only class cache
// ---------------------------------------------------------------------------

/**
 * Card::Cache[Virtual] (virtual.rb:37-39) for a headless engine: the
 * Temporary-only shape. Ruby initializes a Shared cache only when a :store
 * opt is given (card-1.110.0 lib/card/cache.rb:16-20 - `@shared = Shared.new
 * opts if opts[:store]`); the engine has no shared cache store configured, so
 * every op lands in the temp hash (lib/card/cache/temporary.rb:22-24).
 *
 * Temporary#fetch is exist?-based (temporary.rb:47-50: `exist?(key) ?
 * read(key) : write(key, yield)`), so the port's fetch consults has() rather
 * than a falsy read - a present row is a hit even where a falsy read would
 * miss. Rows are CardVirtualsRow objects (ActiveRecord attribute hashes).
 */
export class VirtualRecordCache {
  /** temporary.rb:23 `@store = {}`. */
  private store = new Map<string, CardVirtualsRow>();

  /** temporary.rb:26-28 read: `@store[key]`. */
  read(key: string): CardVirtualsRow | undefined {
    return this.store.get(key);
  }

  /** temporary.rb:31-33 write: `@store[key] = value` (the after_write_to_temp_cache
   *  callback and MAX_KEYS eviction are Cardio-config-driven; config absent here). */
  write(key: string, value: CardVirtualsRow): CardVirtualsRow {
    this.store.set(key, value);
    return value;
  }

  /** cache.rb:64-71 fetch: `@temp.fetch(key) { @shared ? @shared.fetch(key) : yield }`
   *  with temporary.rb:47-50's exist?-based temp fetch; no shared store headlessly. */
  async fetch(
    key: string,
    compute: () => Promise<CardVirtualsRow>,
  ): Promise<CardVirtualsRow> {
    const hit = this.store.get(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    this.store.set(key, value);
    return value;
  }

  /** temporary.rb:57-59 delete: `@store.delete key`. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** temporary.rb:76-79 exist?: `@store.key? key`. */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /** temporary.rb:66-69 reset: `@store = {}`. */
  reset(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// the card input shape (what Card::Virtual's class methods read off a card)
// ---------------------------------------------------------------------------

/** The `card.left&.id` / `card.right&.id` side-card ids (virtual.rb:76, 84 -
 *  parts.rb:6-10 left/right resolve through the supercard/fetch ladder).
 *  Consulted only when the card's own stored left_id/right_id is absent or
 *  non-positive (virtual.rb:75, 83 `card.left_id&.positive?`). */
export interface VirtualCardSideIds {
  readonly leftCardId?: number | undefined;
  readonly rightCardId?: number | undefined;
}

/** virtual.rb:74-80 left_id: compound? -> stored left_id if positive, else
 *  left&.id; simple -> the card's own id. `card.compound?` is
 *  `name.compound?` (cardname-0.20.0 lib/cardname/predicates.rb:13). */
export function virtualLeftId(
  card: CardRecord,
  sides?: VirtualCardSideIds,
): number | undefined {
  if (!card.name?.isCompound) return card.id; // virtual.rb:78 simple branch
  if (typeof card.leftId === "number" && card.leftId > 0) return card.leftId; // :76
  return sides?.leftCardId; // :76 `card.left&.id`
}

/** virtual.rb:82-88 right_id: compound? -> stored right_id if positive, else
 *  right&.id; simple -> the -2 sentinel (a non-junction virtual row hangs
 *  off right_id -2, the '*all-ish' catch-all slot). */
export function virtualRightId(
  card: CardRecord,
  sides?: VirtualCardSideIds,
): number | undefined {
  if (!card.name?.isCompound) return -2; // virtual.rb:86
  if (typeof card.rightId === "number" && card.rightId > 0) return card.rightId; // :84
  return sides?.rightCardId; // :84 `card.right&.id`
}

// ---------------------------------------------------------------------------
// the record model - lib/card/virtual.rb, class level
// ---------------------------------------------------------------------------

/** The 3-arg Kernel#raise of virtual.rb:103 (`raise Card::Error, card.name,
 *  "count not cacheable: ..."`) - Ruby maps raise(class, message,
 *  backtrace): Card::Error#initialize receives the card NAME as its message
 *  (card-1.110.0 lib/card/error.rb:21-26 - a String is not a Card, so
 *  `super(message)` keeps the name verbatim) and the descriptive string
 *  occupies the BACKTRACE slot. The port preserves both positions exactly,
 *  including the source's "count not cacheable" typo. */
export class VirtualCardError extends Error {
  /** virtual.rb:103 second raise arg - the card's name (error.message). */
  readonly cardName: string;

  /** virtual.rb:103 third raise arg - the backtrace-slot text. */
  readonly backtraceText: string;

  constructor(cardName: string, backtraceText: string) {
    super(cardName);
    this.name = "Card::Error";
    this.cardName = cardName;
    this.backtraceText = backtraceText;
  }
}

/** virtual.rb:90-104 validate_card: compound? -> needs left_id then
 *  needs right_id (in that order); simple -> needs id when the card has
 *  none; raises Card::Error only when a reason was found. */
export function validateVirtualCard(
  card: CardRecord,
  sides?: VirtualCardSideIds,
): void {
  const reason = card.name?.isCompound // :92-97 compound branch order
    ? virtualLeftId(card, sides)
      ? virtualRightId(card, sides)
        ? undefined
        : "needs right_id"
      : "needs left_id"
    : card.id
      ? undefined
      : "needs id"; // :98-99 simple branch
  if (reason === undefined) return; // :101 return unless reason
  const name = card.name?.s ?? "";
  throw new VirtualCardError(
    name, // raise arg 2: message = the card name
    `count not cacheable: card ${name} ${reason}`, // raise arg 3: backtrace slot
  );
}

/** virtual.rb:64-72 where_card: `query = { right_id: right_id(card) }`; a
 *  resolvable left_id narrows by it, else `left_key = card.name.left_key`
 *  (name.ts leftKey - the left part's key; nil for simple names, where
 *  left_id(card) is always set anyway). find_by_card (virtual.rb:60-62) is
 *  `where_card(card).take` - LIMIT 1, no ORDER BY (the (left_id, right_id)
 *  unique index - db/schema.sqlite.sql:172 - keeps the id-match single-row;
 *  left_key matches are unique in production data). */
function whereCardStatement(
  card: CardRecord,
  sides?: VirtualCardSideIds,
): { sql: string; params: unknown[] } {
  const rightId = virtualRightId(card, sides);
  const leftId = virtualLeftId(card, sides);
  if (leftId !== undefined && leftId !== null) {
    return {
      sql: "SELECT * FROM card_virtuals WHERE right_id = ? AND left_id = ? LIMIT 1",
      params: [rightId, leftId],
    };
  }
  return {
    sql: "SELECT * FROM card_virtuals WHERE right_id = ? AND left_key = ? LIMIT 1",
    params: [rightId, card.name?.leftKey ?? null],
  };
}

/** virtual.rb:60-62 find_by_card: `where_card(card).take`. */
export async function findVirtualByCard(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  sides?: VirtualCardSideIds,
): Promise<CardVirtualsRow | undefined> {
  const { sql, params } = whereCardStatement(card, sides);
  const result = await driver.query<CardVirtualsRow>(sql, params);
  return result.rows[0];
}

/** virtual.rb:52-58 create: validate_card, then create! with the four
 *  assigned columns (left_id, right_id, left_key, content); ActiveRecord
 *  stamps updated_at at creation (the table has no created_at -
 *  db/schema.sqlite.sql:164-171) and the returned record carries the
 *  assigned attributes (no re-SELECT, as Rails). */
async function createVirtual(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<CardVirtualsRow> {
  validateVirtualCard(card, sides); // virtual.rb:53
  const leftId = virtualLeftId(card, sides) ?? null; // :54 (validated non-nil)
  const rightId = virtualRightId(card, sides) ?? null; // :55 (validated non-nil)
  const leftKey = card.name?.leftKey ?? null; // :56 card.name.left_key
  const content = card.dbContent ?? null; // :57 card.virtual_content
  const stamp = sqlDateTime(now);
  const insert: SQLStatement = {
    sql:
      "INSERT INTO card_virtuals (left_id, right_id, left_key, content, updated_at) " +
      "VALUES (?, ?, ?, ?, ?)",
    params: [leftId, rightId, leftKey, content, stamp],
  };
  const result = await driver.batch([insert]);
  const id = result[0]?.lastInsertRowId;
  return {
    id: typeof id === "number" ? id : Number(id),
    left_id: leftId,
    right_id: rightId,
    content,
    left_key: leftKey,
    updated_at: stamp,
  };
}

/** virtual.rb:43-50 create_or_update: an existing row updates itself from
 *  card.virtual_content (the record-level `update`, below); a miss creates. */
async function createOrUpdateVirtual(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<CardVirtualsRow> {
  const existing = await findVirtualByCard(driver, card, sides); // virtual.rb:44
  if (existing !== undefined) {
    await virtualRecordUpdate(driver, existing, card.dbContent ?? null, now); // :45
    return existing;
  }
  return createVirtual(driver, card, now, sides); // :48
}

/** virtual.rb:22-26 fetch: `cache.fetch card.key do find_by_card(card) ||
 *  create(card) end` - the cache is keyed by the card's KEY (its
 *  downcased-spaceless name), not the row pair. */
export async function virtualFetch(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<CardVirtualsRow> {
  return cache.fetch(card.key ?? "", () =>
    (async () =>
      (await findVirtualByCard(driver, card, sides)) ??
      createVirtual(driver, card, now, sides))(),
  );
}

/** virtual.rb:28-30 save: `cache.write card.key, create_or_update(card)`. */
export async function virtualSave(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<CardVirtualsRow> {
  const row = await createOrUpdateVirtual(driver, card, now, sides);
  cache.write(card.key ?? "", row); // virtual.rb:29
  return row;
}

/** virtual.rb:32-35 delete: drop the cache entry, then delete the row when
 *  one exists (`find_by_card(card)&.delete` - ActiveRecord#delete is the
 *  straight DELETE, no callbacks). */
export async function virtualDelete(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  sides?: VirtualCardSideIds,
): Promise<void> {
  cache.delete(card.key ?? ""); // virtual.rb:33
  const row = await findVirtualByCard(driver, card, sides); // :34
  if (row === undefined) return;
  await driver.batch([
    { sql: "DELETE FROM card_virtuals WHERE id = ?", params: [row.id] },
  ]);
}

// ---------------------------------------------------------------------------
// the record model - lib/card/virtual.rb, instance level (CardVirtualsRow)
// ---------------------------------------------------------------------------

/** virtual.rb:8-11 Virtual#update: `content == new_content ? touch :
 *  update!(content: new_content); new_content` - same content touches
 *  (updated_at only, ActiveRecord#touch), changed content writes both
 *  (update! stamps updated_at alongside the assignment). Returns the new
 *  content either way (virtual.rb:10). */
export async function virtualRecordUpdate(
  driver: SQLDatabaseDriver,
  row: CardVirtualsRow,
  newContent: string | null,
  now: Date,
): Promise<string | null> {
  const stamp = sqlDateTime(now);
  const sql =
    row.content === newContent
      ? "UPDATE card_virtuals SET updated_at = ? WHERE id = ?" // touch
      : "UPDATE card_virtuals SET content = ?, updated_at = ? WHERE id = ?"; // update!
  const params =
    row.content === newContent ? [stamp, row.id] : [newContent, stamp, row.id];
  await driver.batch([{ sql, params }]);
  if (row.content !== newContent) row.content = newContent; // update! assigns
  row.updated_at = stamp;
  return newContent; // virtual.rb:10
}

/** virtual.rb:17-19 Virtual#cardname: `[left_id, right_id].cardname` -
 *  Array#cardname is Card::Name.compose (card-1.110.0 config/initializers/
 *  01_core_extensions/array.rb:14-16) whose parts resolve through
 *  Integer#cardname = Card::Lexicon.name (01_core_extensions/integer.rb:9-11);
 *  the id->name resolution is the caller's lexicon here. */
export function virtualRowCardname(
  row: CardVirtualsRow,
  nameOfId: (id: number) => string | undefined,
): DeckoName | undefined {
  const { left_id: leftId, right_id: rightId } = row;
  if (leftId === null || rightId === null) return undefined;
  const left = nameOfId(leftId);
  const right = nameOfId(rightId);
  if (left === undefined || right === undefined) return undefined;
  return DeckoName.compose([left, right]);
}

/** virtual.rb:13-15 Virtual#card_id: `Card.fetch left_id, right_id` - the
 *  two-id mark list composes the junction name "<left>+<right>" through
 *  id_or_name (card-1.110.0 lib/card/mark.rb:20-23 - non-Integer mark lists
 *  fall to Card::Name[mark], each part through Lexicon) and fetch resolves
 *  THAT card; the runtime fetch ladder is the engine's, so the port hands
 *  the composed mark to a caller fetcher. */
export function virtualRowCardId<T>(
  row: CardVirtualsRow,
  fetchCardByName: (name: DeckoName) => T | undefined,
  nameOfId: (id: number) => string | undefined,
): T | undefined {
  const name = virtualRowCardname(row, nameOfId);
  if (name === undefined) return undefined;
  return fetchCardByName(name);
}

// ---------------------------------------------------------------------------
// the set module - set/abstract/virtual_cache.rb
// ---------------------------------------------------------------------------

/** virtual_cache.rb:3-5 virtual?: `new?` (states.rb#new? - the shared
 *  isNewCard: (new_record? || !@from_trash.nil?) && !trash?). A virtual card
 *  is one whose row was never saved: its content lives in card_virtuals. */
export function isVirtualCard(card: CardRecord): boolean {
  return isNewCard(card);
}

/** virtual_cache.rb:9-11 virtual_content: `attributes["db_content"]` - the
 *  PENDING attribute the write path would store (not the cached row). */
export function virtualContent(card: CardRecord): string | undefined {
  return card.dbContent;
}

/** virtual_cache.rb:13-15 db_content (the override): `Virtual.fetch(self)&.
 *  content` - a virtual card's content READ materializes its row (fetch's
 *  find-or-create) and answers the cached content. */
export async function virtualDbContent(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<string | null | undefined> {
  return (await virtualFetch(driver, card, cache, now, sides)).content;
}

/** virtual_cache.rb:17-19 updated_at (the override): `Virtual.fetch(self)&.
 *  updated_at` - the CACHED row's stamp, not the cards row's. */
export async function virtualUpdatedAt(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<SQLDateTime | null | undefined> {
  return (await virtualFetch(driver, card, cache, now, sides)).updated_at;
}

/** virtual_cache.rb:21-24 event :save_virtual_content, :prepare_to_store,
 *  on: :save - body: `Virtual.save self; abort :success`. The Virtual side
 *  effect runs for real; the abort marker is returned for the caller to
 *  play (the save-unwind pipeline is a later change - see the header). */
export async function saveVirtualContent(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  now: Date,
  sides?: VirtualCardSideIds,
): Promise<"success"> {
  await virtualSave(driver, card, cache, now, sides); // virtual_cache.rb:22
  return "success"; // :23 abort :success
}

/** virtual_cache.rb:26-29 event :delete_virtual_content,
 *  :prepare_to_store, on: :delete - body: `Virtual.delete self; abort
 *  :success unless real?` - the abort (and thus the marker) fires only on
 *  an unreal (new?) card; a real card's delete proceeds. */
export async function deleteVirtualContent(
  driver: SQLDatabaseDriver,
  card: CardRecord,
  cache: VirtualRecordCache,
  sides?: VirtualCardSideIds,
): Promise<"success" | undefined> {
  await virtualDelete(driver, card, cache, sides); // virtual_cache.rb:27
  return isRealCard(card) ? undefined : "success"; // :28 abort :success unless real?
}

/** virtual_cache.rb:21,26 - the two event declarations, pinned as data for
 *  an engine-level events surface (mirrors the manifest events[] on
 *  abstract/virtual_cache below, same pattern as card-mod-integrate's
 *  OBSERVER_EVENT_DECLARATIONS). Read-only citation record. */
export const VIRTUAL_EVENT_DECLARATIONS = [
  { event: "save_virtual_content", stage: "prepare_to_store", on: "save" },
  { event: "delete_virtual_content", stage: "prepare_to_store", on: "delete" },
] as const;

// ---------------------------------------------------------------------------
// event bodies (the manifest events[] surface)
// ---------------------------------------------------------------------------
//
// The mod's events on abstract/virtual_cache:
//   - save_virtual_content at :prepare_to_store, on: :save
//   - delete_virtual_content at :prepare_to_store, on: :delete
// both per virtual_cache.rb:21-29.
//
// The bodies below are DOCUMENTED STUBS - the Ruby body needs three
// things ModEventFn cannot supply today:
//   1. SQLDatabaseDriver (card_virtuals INSERT/UPDATE/DELETE - the host
//      exposes host.batch() for generic statements but the driver carries
//      the exact connection this gem uses),
//   2. VirtualRecordCache (the Card::Cache[Virtual] analog, the temp-only
//      cache the port's Virtual.save/Virtual.delete write through - the
//      cache lives at the mod-process level, not the engine level),
//   3. Date clock (sqlDateTime - the port's deterministic fake clock,
//      supplied by the caller / the write-path writer, not by the host).
// The real bodies belong to a later change that widens ModEngineHost (or
// moves these events into the action engine's stage seam where driver +
// clock are in scope - card-mod-history.ts:1038-1065 documents the same
// shape). Each stub names the seam in its comment.

/** virtual_cache.rb:21-24 `event :save_virtual_content, :prepare_to_store,
 *  on: :save do Virtual.save self; abort :success end`. Body needs:
 *  - SQLDatabaseDriver (host + the card_virtuals schema seam),
 *  - VirtualRecordCache (the temp cache the mod owns),
 *  - Date clock (the write-path's deterministic clock).
 *  All three are out of scope for ModEventFn today; the stub records the
 *  load and the marker the Ruby body returns for the caller to play. */
export const saveVirtualContentEventFn: ModEventFn = (_card, _host) => {
  // SEAM: virtual_save(driver, card, cache, now, sides?) (virtual.rb:28-30)
  // needs SQLDatabaseDriver + VirtualRecordCache + Date; ModEngineHost
  // (mod-manifest.ts:308-341) exposes fetchRenderCard/isDenied/batch but
  // carries no driver / VirtualRecordCache / clock. The wired body lands
  // when the host widens (or the action engine's stage seam fires these
  // events instead). The Ruby abort :success marker lands with the body;
  // the caller plays it (the engine has no save-unwind pipeline yet).
  void _card;
  void _host;
};

/** virtual_cache.rb:26-29 `event :delete_virtual_content,
 *  :prepare_to_store, on: :delete do Virtual.delete self; abort :success
 *  unless real? end`. Same seam as save_virtual_content_event (the
 *  Card::Cache[Virtual] + driver + clock); the abort marker fires only
 *  on an unreal card (`abort :success unless real?`, virtual_cache.rb:28)
 *  - the `real?` predicate is `!new?`, which the mod's existing
 *  isRealCard (card-record.ts) already ports; the body guards with it
 *  in its future wired form. */
export const deleteVirtualContentEventFn: ModEventFn = (_card, _host) => {
  // SEAM: virtual_delete(driver, card, cache, sides?) (virtual.rb:32-35) +
  // the abort :success marker gated on isRealCard(card). The wired body
  // runs virtualDelete then returns "success" when !isRealCard(card).
  void _card;
  void _host;
};

/** virtual_cache.rb:35-37 history?: false - a virtual card keeps no acts.
 *  (The Ruby source's own TODO at :31-33 questions whether this is reachable
 *  given the unconditional abort; the pin preserves the shipped answer.) */
export const VIRTUAL_HISTORY_ENABLED = false;

/** virtual_cache.rb:39-41 followable?: false. */
export const VIRTUAL_FOLLOWABLE_ENABLED = false;

/** virtual_cache.rb:43-46 delete: `update trash: true` - the trash save runs
 *  although the card is new (the source's own comment); delegated to the
 *  ActWriter write path's trashCard (an update save with trash: true -
 *  write-path.ts trashCard). `update` reports failure as a falsy return:
 *  a no-op (already trashed) comes back null here. */
export function virtualDeleteCard(
  writer: ActWriter,
  input: { cardId: number; before: CardFieldState },
): Promise<SavedAction | null> {
  return writer.trashCard(input); // update trash: true
}

/** virtual_cache.rb:48-51 delete!: `update! trash: true` - the bang raises
 *  where `update` would have reported false (ActiveRecord::RecordNotSaved
 *  on a failed save); a null (no-op) result raises. */
export async function virtualDeleteCardBang(
  writer: ActWriter,
  input: { cardId: number; before: CardFieldState },
): Promise<SavedAction> {
  const saved = await writer.trashCard(input); // update! trash: true
  if (saved === null) {
    throw new Error("Failed to save the record"); // ActiveRecord::RecordNotSaved text
  }
  return saved;
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModVirtual: DeckoModManifest = {
  name: "virtual",
  gemName: "card-mod-virtual",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-virtual-0.20.0/set/abstract/virtual_cache.rb - the card
      // methods, predicates and delete delegates are exported above; the
      // two events ride manifest events[] below (mod-manifest.ts
      // ModSetModuleFile.events surface).
      // VIRTUAL_EVENT_DECLARATIONS is the matching citation record.
      setPath: "abstract/virtual_cache",
      events: [
        {
          // virtual_cache.rb:21 - `event :save_virtual_content,
          // :prepare_to_store, on: :save`. The body (`Virtual.save self;
          // abort :success`, :22-23) is a stub today - the host does not
          // carry the SQL driver / VirtualRecordCache / clock the wired
          // body needs (see saveVirtualContentEventFn above).
          event: "save_virtual_content",
          at: "prepare_to_store",
          on: ["save"],
          fn: saveVirtualContentEventFn,
        },
        {
          // virtual_cache.rb:26 - `event :delete_virtual_content,
          // :prepare_to_store, on: :delete`. The body (`Virtual.delete
          // self; abort :success unless real?`, :27-28) is a stub for the
          // same seam reasons; deleteVirtualContentEventFn cites them.
          event: "delete_virtual_content",
          at: "prepare_to_store",
          on: ["delete"],
          fn: deleteVirtualContentEventFn,
        },
      ],
    },
  ],
};

export default cardModVirtual;
