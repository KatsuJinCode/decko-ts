// The retrieval half of Card::Fetch, ported from card-1.110.0
// lib/card/fetch.rb (mark normalization), lib/card/fetch/retrieve.rb
// (cache-vs-db retrieval ladder) and lib/card/mark.rb (id_or_name).
//
// Retrieval order (retrieve.rb#retrieve_existing):
//   1. retrieve_from_cache - Card cache by key (names) or via the Lexicon
//      (ids); cached new? cards are dropped when look_in_trash is set so
//      the db version is fetched (retrieve.rb:15-17 + comment).
//   2. retrieve_from_db    - {key:} for simple name marks, {id:} for
//      integer marks / "~id" / codename marks / compound names (through
//      Lexicon.id); `trash = false` unless look_in_trash
//      (retrieve.rb#retrieval_from_db_query).

import { DeckoName, type Nameish } from "../name.js";
import { NameNotFoundError, CodenameNotFoundError } from "../name/errors.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import type { CardRecord } from "./card-record.js";
import type { DbLexicon } from "./lexicon.js";
import type { DbCodenameRegistry } from "./codename.js";

/** Mark regexes (lib/card/name.rb:16-17). */
const ID_MARK_REGEXP = /^~(\d+)$/;
const CODENAME_MARK_REGEXP = /^:(\w+)$/;

/** A mark argument with arrays flattened out. */
type FlatArg = number | string | DeckoName | CardRecord | CodenameMarkArg;

function flattenArgs(args: readonly FetchArg[]): FlatArg[] {
  const out: FlatArg[] = [];
  const walk = (items: readonly FetchArg[]): void => {
    for (const item of items) {
      if (Array.isArray(item)) walk(item);
      else out.push(item as FlatArg);
    }
  };
  walk(args);
  return out;
}

/** Ruby Symbol argument surface (see src/card/name.ts CodenameMark). */
export interface CodenameMarkArg {
  readonly codename: string;
}

/** Everything Card.fetch accepts as a mark (fetch/card_class.rb doc +
 *  mark.rb#id_or_name); arrays flatten and compose into one name. */
export type FetchArg =
  | number
  | string
  | DeckoName
  | CardRecord
  | CodenameMarkArg
  | readonly FetchArg[];

/**
 * The normalized mark (fetch/retrieve.rb#mark_type/#mark_value): after
 * Card.id_or_name a mark is either an Integer id or a Card::Name.
 * `outOfRange` carries the ActiveModel::RangeError case rescued at
 * fetch.rb:34-36.
 */
export type FetchMark =
  | { kind: "id"; id: number }
  | { kind: "name"; name: DeckoName }
  | { kind: "outOfRange"; digits: string };

export interface MarkOptions {
  /** opts[:new][:supercard] - relative name marks are absolutized against
   *  it (fetch.rb#normalize_mark). */
  newSupercardName?: Nameish;
}

function isCodenameMark(arg: FlatArg): arg is CodenameMarkArg {
  // DeckoName must be excluded BEFORE the `in` check: it carries a
  // `codename` GETTER (name_variants.rb port) and `in` sees prototype members
  return typeof arg === "object" && arg !== null && !(arg instanceof DeckoName) && "codename" in arg;
}

function isCardRecord(arg: FlatArg): arg is CardRecord {
  return (
    typeof arg === "object" &&
    arg !== null &&
    !isCodenameMark(arg) &&
    !(arg instanceof DeckoName) &&
    "key" in arg
  );
}

/**
 * Card.id_or_name (lib/card/mark.rb#id_or_name): flatten the args; a single
 * mark resolves to an id when it can (Integer / "~id" / ":codename" /
 * Card#id), otherwise everything composes into a Card::Name.
 */
export async function normalizeMark(
  args: readonly FetchArg[],
  opts: MarkOptions,
  lexicon: DbLexicon,
  codenames: DbCodenameRegistry,
): Promise<FetchMark | undefined> {
  const flat = flattenArgs(args);
  const mark: FlatArg | undefined = flat.length <= 1 ? flat[0] : undefined;

  if (mark === undefined) {
    // mark.size > 1 -> Card::Name[mark] -> compose parts
    const name = await nameFromMarkParts(flat, lexicon, codenames);
    return absolutize({ kind: "name", name }, opts);
  }

  const id = await idFromMark(mark, lexicon, codenames);
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id)) return { kind: "outOfRange", digits: String(id) };
    return { kind: "id", id };
  }
  if (typeof id === "object" && id !== null && "outOfRange" in id) {
    return { kind: "outOfRange", digits: id.outOfRange };
  }
  // idFromMark returned undefined -> Card::Name[mark]
  const name = await nameFromMark(mark, lexicon, codenames);
  return absolutize({ kind: "name", name }, opts);
}

/** fetch.rb#normalize_mark: relative name marks become absolute against
 *  opts[:new][:supercard]. */
function absolutize(mark: FetchMark & { kind: "name" }, opts: MarkOptions): FetchMark {
  if (opts.newSupercardName === undefined || opts.newSupercardName === null) return mark;
  const supercard = DeckoName.parse(opts.newSupercardName as Exclude<Nameish, null | undefined>);
  return { kind: "name", name: mark.name.absoluteName(supercard) };
}

/** mark.rb#id_from_mark: Integer / Symbol (Codename.id!) / String
 *  (Name.id_from_string!) / Card (#id). Symbols and validated mark strings
 *  RAISE when unknown (codename.rb#id!, name.rb#bad_mark) - they never
 *  fall through to a name. Returns undefined for everything else, which
 *  then becomes a name mark. */
async function idFromMark(
  mark: FlatArg,
  lexicon: DbLexicon,
  codenames: DbCodenameRegistry,
): Promise<number | undefined | { outOfRange: string }> {
  if (typeof mark === "number") {
    return Number.isSafeInteger(mark) ? mark : { outOfRange: String(mark) };
  }
  if (typeof mark === "string") {
    return idFromStringStrict(mark, lexicon, codenames);
  }
  if (isCodenameMark(mark)) {
    // Codename.id! (codename.rb:89) - unknown codename raises
    const id = await codenames.id(mark.codename);
    if (id === undefined) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${mark.codename}`);
    }
    return id;
  }
  if (isCardRecord(mark)) return mark.id;
  return undefined; // Card::Name marks are not ids
}

/** Name.id_from_string! (lib/card/name.rb:66-69): "~1234" -> the id, but
 *  only when the Lexicon knows it (from_id_from_string, name.rb:84-88) -
 *  otherwise bad_mark raises Card::Error::NotFound (name.rb:104-106).
 *  ":codename" resolves through the codename registry (CodenameNotFound on
 *  unknown, name.rb:107-109). Anything else is not a mark string. */
async function idFromStringStrict(
  str: string,
  lexicon: DbLexicon,
  codenames: DbCodenameRegistry,
): Promise<number | undefined | { outOfRange: string }> {
  const idMatch = ID_MARK_REGEXP.exec(str);
  if (idMatch !== null) {
    const digits = idMatch[1] as string;
    const id = Number(digits);
    if (!Number.isSafeInteger(id)) return { outOfRange: digits };
    const known = await lexicon.name(id);
    if (known === undefined || known.s === "") {
      throw new NameNotFoundError(`id doesn't exist: ${digits}`);
    }
    return id;
  }
  const codeMatch = CODENAME_MARK_REGEXP.exec(str);
  if (codeMatch !== null) {
    const codename = codeMatch[1] as string;
    const id = await codenames.id(codename);
    if (id === undefined) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${codename}`);
    }
    return id;
  }
  return undefined;
}

/** Card::Name[mark] (lib/card/name.rb#from_cardish): Card -> its name;
 *  Integer -> Lexicon.name; Symbol -> Codename.name!; String/nil -> new;
 *  Array -> compose. */
async function nameFromMark(
  mark: FlatArg | undefined,
  lexicon: DbLexicon,
  codenames: DbCodenameRegistry,
): Promise<DeckoName> {
  if (mark === null || mark === undefined) return DeckoName.parse("");
  if (mark instanceof DeckoName) return mark;
  if (typeof mark === "string") return DeckoName.parse(mark);
  if (typeof mark === "number") {
    const name = await lexicon.name(mark);
    return name ?? DeckoName.parse("");
  }
  if (isCodenameMark(mark)) {
    const name = await codenames.name(mark.codename);
    if (name === undefined) {
      throw new CodenameNotFoundError(`codename doesn't exist: ${mark.codename}`);
    }
    return name;
  }
  if (isCardRecord(mark)) return mark.name ?? DeckoName.parse("");
  return DeckoName.parse("");
}

/** Multi-mark fetch (Card.fetch "A", "B") composes the parts into one name. */
async function nameFromMarkParts(
  parts: readonly FlatArg[],
  lexicon: DbLexicon,
  codenames: DbCodenameRegistry,
): Promise<DeckoName> {
  const resolved: string[] = [];
  for (const part of parts) {
    resolved.push((await nameFromMark(part, lexicon, codenames)).s);
  }
  return DeckoName.compose(resolved);
}

// ---------------------------------------------------------------------------
// retrieve.rb#retrieve_from_db
// ---------------------------------------------------------------------------

export interface DbRetrievalResult {
  row: CardsRow | undefined;
  /** retrieve.rb:24: @fresh_from_db = true if card.present? && !card.trash */
  freshFromDb: boolean;
}

export interface DbRetrievalOptions {
  lookInTrash: boolean;
}

/** retrieval_from_db_query_base (retrieve.rb:35-41): simple name marks look
 *  up by key; everything else resolves an id first (integer marks directly,
 *  name marks through the Lexicon). A nil query returns no card at all
 *  (retrieve.rb:22-23 `query ? Card.where(query).take : nil`). */
export async function retrieveFromDb(
  driver: SQLDatabaseDriver,
  mark: FetchMark,
  opts: DbRetrievalOptions,
  lexicon: DbLexicon,
): Promise<DbRetrievalResult> {
  // retrieval_from_db_query (retrieve.rb:28-33): trash = false unless look_in_trash
  const trashClause = opts.lookInTrash ? "" : " AND trash = 0";

  if (mark.kind === "name" && mark.name.isSimple) {
    // { key: mark_value } - mark_value is mark.key (retrieve.rb:54)
    const result = await driver.query<CardsRow>(
      `SELECT * FROM cards WHERE key = ?${trashClause} LIMIT 1`,
      [mark.name.key],
    );
    return finish(result.rows[0]);
  }

  if (mark.kind === "outOfRange") {
    return { row: undefined, freshFromDb: false };
  }

  // id_from_mark (retrieve.rb:43-45): :id marks use the value directly;
  // :key marks go through Lexicon.id. Pass the DeckoName itself, not
  // name.key: simple-name lexes (the db/key_lex alias) hold the raw
  // name string "Organizer(s)" whose canonical key is "organizer_"; passing
  // name.key "organizer_" re-parses to key "organizer" via
  // DeckoName.parse, which never matches the seedCard-written "organizer_".
  const id = mark.kind === "id" ? mark.id : await lexicon.id(mark.name);
  if (id === undefined) return { row: undefined, freshFromDb: false };
  const result = await driver.query<CardsRow>(
    `SELECT * FROM cards WHERE id = ?${trashClause} LIMIT 1`,
    [id],
  );
  return finish(result.rows[0]);
}

function finish(row: CardsRow | undefined): DbRetrievalResult {
  return { row, freshFromDb: row !== undefined && !row.trash };
}
