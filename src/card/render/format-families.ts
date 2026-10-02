// The non-html format families: csv, rss, json — the port of
// card-mod-format-0.20.0's csv.rb / rss.rb / json.rb + data.rb view
// families (the engine's main view table is the html format; these three
// are the `/:mark(.:format)` route's other arms, engine_routes.rb:22
// `get "/:mark(.:format)" => "card#read"`).
//
// The bytes are the FRESH RUBY ORACLE CAPTURE:
// fixtures/oracle-surfaces/{csv,rss,rss-enabled,json}.jsonl, captured from
// the oracle app (corpus-v2.sqlite3 disposable copy
// write-conformance-surfaces1.sqlite3; corpus sha256 819b8884… unchanged
// across the run — the capture wrote nothing). The tests
// pin the captured bytes; the gem sources cite the mechanics.
//
// Oracle truths this module preserves (each discovered by capture, not
// from reading the gems):
// 1. CSV `:titled` raises NoMethodError ("undefined method `each' for an
//    instance of String") for any card whose items are not all known
//    cards: `item_names` parses EVERY card's db_content as a newline list
//    (Home's two content lines became two virtual cards whose :row nest
//    renders "" — and CSV.generate_line("") raises). Only cards whose
//    items all resolve (e.g. the List card *all+*read) render, as
//    "Name,Type\n" + one CSV line per item's [name, type] row.
// 2. RSS `:feed` returns "RSS feeds disabled" unless Cardio.config
//    .rss_enabled (default FALSE — lib/card/mod/format.rb:4). Enabled,
//    the feed renders the channel + one item per raw_feed_items ([card]),
//    and pub_date's `.to_s(:rfc822)` RAISES ArgumentError on the oracle's
//    Rails 7.2 stack ("wrong number of arguments (given 1, expected 0)") —
//    Builder ensure-closes the open tags and the view's rescue appends
//    `<error>\n\nERROR rendering RSS: …\n\n <backtrace></error>` AFTER
//    `</rss>`. The port reproduces the raise shape; the backtrace lines
//    are environment-specific (Ruby file paths in the capture) and are
//    the accepted-and-labeled byte class here.
// 3. JSON show defaults to :molecule, pretty-printed (2-space), keys in
//    Ruby's insertion order; `page_details` adds url (over the atom's
//    .json url, keeping the key position) + requested_at. A list-family
//    card's :content is item_names (an array — the json format's own
//    override, 01_list/other_views.rb "JSON views"); every other card's
//    :content is the raw db_content. A basic card's json :items are its
//    NEST targets (json.rb overrides item_cards to nested_cards; the
//    list-family block re-overrides to the parsed items).
//
// Not ported here (honest remainders, named):
// - Search-type cards as csv/json items ride the claimed
//   found_by/search execution surface (no oracle capture exists for a
//   search card in these formats); executeSearch's
//   pre-executed map is a page-flow artifact. A search card's content
//   falls to the raw-string :content arm here.
// - Relative ({{_self+…}}) nest references as json items: contextual
//   resolution rides the claimed nest machinery; only absolute and
//   :codename marks resolve here.
// - `?compress=true` (JSON.generate single-line) and `max_depth` params.
// - The `structure` override arm of atom's content gate (data.rb `!
//   card.structure`): the captured cards carry structure nil; rule-driven
//   structure detection for these families rides the rules machinery.
// - The rss format's view aliases onto html-format views (:open → :titled
//   etc.) — the feed is the only route-reachable rss shape (show defaults
//   :feed).

import { referencedNames } from "./nest-syntax.js";
import type { RenderCard } from "./format.js";

/** The engine surfaces the format families read. Structural (the
 *  RenderEngine satisfies it; tests can stand in a subset). */
export interface FormatEngineSurface {
  /** Cache-first card resolution (memoized render cards). */
  fetchRenderCard(name: string): RenderCard | undefined;
  /** Async warm for names the closure prefetch did not chase. */
  prepareItemForRender(name: string): Promise<RenderCard | undefined>;
  /** The html render (rss feed_item_description's :open_content). */
  render(name: string, view: string): Promise<string>;
  /** The codename registry's id→name read (async: loads the codehash on
   *  demand — a bare engine has a cold memo, so the sync peek is not
   *  enough here). The fetcher's `codenames.nameForId` is the wiring. */
  codenameById(typeId: number): Promise<string | undefined>;
}

/** Resolves a `:codename` mark to the card's real name (the fetch layer's
 *  codename registry — `fetcher.codenames.name(mark)`). */
export type CodenameMarkResolver = (
  mark: string,
) => Promise<string | undefined>;

export interface FormatShowOptions {
  /** The URL context Card::Path renders from. Ruby's runner oracle had no
   *  request host, so captured paths are relative ("/Home"); an HTTP
   *  caller passes its origin and gets the absolute URLs Ruby-on-HTTP
   *  emits. Default "" (the captured shape). */
  urlBase?: string;
  /** Cardio.config.rss_enabled (lib/card/mod/format.rb:4 — default false).
   *  Only the rss family reads it. */
  rssEnabled?: boolean;
  /** Clock seam: pub_date's fallback and json's requested_at
   *  (Time.zone.now / Time.now). Default = now. */
  now?: () => Date;
  /** The :codename mark resolver (see above). */
  resolveCodenameMark?: CodenameMarkResolver;
}

export type NonHtmlFormatName = "csv" | "rss" | "json";

// ---------------------------------------------------------------------------
// shared card surface
// ---------------------------------------------------------------------------

/** The card fields the families read, normalized off RenderCard. */
interface FormatCard {
  id: number | undefined;
  name: string;
  typeName: string | undefined;
  /** The type CODE (the list-family dispatch key). Filled by the resolvers
   *  through the registry's async read — the enrichment memo is warm only
   *  on the page flow's prefetch path, so a bare engine's sync field can
   *  be undefined here. */
  typeCode: string | undefined;
  codename: string | undefined;
  dbContent: string;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  /** mod/core/set/all/states.rb unknown? (a fetch miss is a NEW card). */
  unknown: boolean;
}

function formatCardOf(card: RenderCard): FormatCard {
  const rec = card.record as unknown as Record<string, unknown>;
  const asDate = (v: unknown): Date | undefined => {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
    if (typeof v !== "string") return undefined;
    // SQL datetime strings ("2025-07-01 17:29:22", optional ".fff") are
    // UTC (the seed default 2026-09-19 00:00:00.000 convention); a bare
    // new Date() would parse them in the machine's local zone.
    const d = v.includes("T")
      ? new Date(v)
      : new Date(`${v.replace(" ", "T")}${v.includes(".") ? "" : ".000"}Z`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return {
    id: card.id,
    name: card.name.s,
    typeName: card.typeName,
    typeCode: card.typeCode,
    codename:
      typeof rec["codename"] === "string" ? (rec["codename"] as string) : undefined,
    dbContent: card.dbContent,
    createdAt: asDate(rec["createdAt"]),
    updatedAt: asDate(rec["updatedAt"]),
    unknown: card.unknown === true,
  };
}

/** Fill the typeCode through the registry's async read (memoized inside
 *  the registry's codehash — no module state here). */
async function withTypeCode(
  card: FormatCard,
  renderCard: RenderCard | undefined,
  engine: FormatEngineSurface,
): Promise<FormatCard> {
  if (card.typeCode === undefined && renderCard?.typeId !== undefined) {
    card.typeCode = await engine.codenameById(renderCard.typeId);
  }
  return card;
}

/** The item-name parse every card shares (collection item.rb item_names:
 *  the content read as a newline list, [[ ]] marks stripped). The csv
 *  probe: Home's two content lines became two virtual cards; the List
 *  card's "Anyone" content one item. */
function itemNamesOf(card: FormatCard): string[] {
  return card.dbContent
    .split(/\n+/)
    .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
    .filter((s) => s !== "");
}

/** The list-family type codes (Abstract::List's includers the json
 *  :content override reaches: the List cardtype + Pointer, which includes
 *  List). */
const LIST_FAMILY_TYPE_CODES = new Set(["list", "pointer"]);

/** The URI path form of a card name ("/Aikido_Oak_Cliff+Gallery" — spaces
 *  to underscores, the "+" joint kept). */
function cardPath(name: string): string {
  return `/${name.replace(/ /g, "_")}`;
}

// ---------------------------------------------------------------------------
// CSV (card-mod-format set/all/csv.rb)
// ---------------------------------------------------------------------------

/** CSV.generate_line's field quoting subset (the captured rows need none
 *  of it; the quoting is the csv gem's minimal-quote default: quote only
 *  fields containing the separator, a quote, or a newline). */
export function csvGenerateLine(row: unknown): string {
  if (!Array.isArray(row)) {
    // Ruby: undefined method `each' for an instance of String (NoMethodError
    // at csv.rb generate_line — the capture's Home/show_default_titled error;
    // Ruby 3.3's backtick-apostrophe method quoting is verbatim).
    throw new Error("undefined method `each' for an instance of String");
  }
  const fields = (row as unknown[]).map((field) => {
    const s = field === null || field === undefined ? "" : String(field);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  });
  return `${fields.join(",")}\n`;
}

/** csv.rb:40-42 view :header — `[%w[Name Type]]`. */
export function csvHeader(): unknown[] {
  return ["Name", "Type"];
}

/** csv.rb:35-37 view :row — `nests.map` over the two _self nests
 *  (view :name, view :type): the ARRAY [name, type] (the array is what
 *  CSV.generate_line consumes one level up — the *all+*read capture's
 *  "Anyone,Role\n"). */
export function csvRow(card: FormatCard): unknown[] {
  return [card.name, card.typeName ?? ""];
}

/** One :titled body row: a KNOWN item renders :row (the [name, type]
 *  array); an UNKNOWN item's nest falls to :unknown = "" (csv.rb:44-46) —
 *  a STRING, which generate_line rejects (oracle truth 1). */
function csvItemRow(item: FormatCard): unknown {
  return item.unknown ? "" : csvRow(item);
}

/** csv.rb:31-33 view :body — `card.item_cards.map { |item_card| nest
 *  item_card }`: each item nested with the csv default_nest_view :titled
 *  (the List probe: render_body => ["Name,Type\n"] — the item Anyone's
 *  own titled, header only, its items empty). An unknown item renders ""
 *  (the Home probe: render_body => ["", ""]). */
export async function csvBody(
  engine: FormatEngineSurface,
  card: FormatCard,
  opts: FormatShowOptions,
): Promise<unknown[]> {
  const items = await resolveItems(engine, card, opts);
  const rows: unknown[] = [];
  for (const item of items) {
    rows.push(await csvItemTitled(engine, item, opts));
  }
  return rows;
}

/** One item's :titled bytes: its own header + its items' rows — the same
 *  titled recursion Ruby's nest runs. */
async function csvItemTitled(
  engine: FormatEngineSurface,
  item: FormatCard,
  opts: FormatShowOptions,
): Promise<string> {
  if (item.unknown) return "";
  const items = await resolveItems(engine, item, opts);
  let out = csvGenerateLine(csvHeader());
  for (const sub of items) out += csvGenerateLine(csvItemRow(sub));
  return out;
}

/** csv.rb:20-24 view :titled — `voo.items[:view] ||= :row;
 *  (render_header + render_body).map { |row| CSV.generate_line row }.join`.
 *  With the items view pinned to :row each body row is the item's
 *  [name, type] array (the capture: "Anyone,Role\n"); any string row
 *  raises (generate_line's NoMethodError — csvGenerateLine throws it). */
export async function csvTitled(items: FormatCard[]): Promise<string> {
  const rows: unknown[] = [csvHeader()];
  for (const item of items) rows.push(csvItemRow(item));
  return rows.map((row) => csvGenerateLine(row)).join("");
}

// ---------------------------------------------------------------------------
// RSS (card-mod-format set/all/rss.rb)
// ---------------------------------------------------------------------------

/** The default-state bytes (rss_enabled false — the config default AND the
 *  captured default-state bytes for every card). */
export const RSS_DISABLED_BYTES = "RSS feeds disabled";

/** Builder::XmlMarkup text escaping (xmlbase: & < > in text — the capture
 *  shows the error element's `#<…>` as `#&lt;…&gt;`). */
function xmlEscapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ruby Time#to_s (TimeWithZone default): "YYYY-MM-DD HH:MM:SS UTC" (the
 *  json molecule's created_at/updated_at/requested_at and the comment
 *  signature's clock shape). */
export function rubyTimestamp(d: Date): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/** The Rails 7.2 ArgumentError pub_date raises on the oracle stack
 *  (time_with_zone.rb to_s(:rfc822) — the :rfc822 argument form was
 *  removed in Rails 7.0). The port reproduces the RAISE (oracle truth 2):
 *  the message is the capture's verbatim inspect text; only the backtrace
 *  lines are environment-specific. */
const PUB_DATE_INSPECT =
  "#<ArgumentError: wrong number of arguments (given 1, expected 0)>";

/** rss.rb:61-63 pub_date — `(card.updated_at || Time.zone.now).to_s(:rfc822)`
 *  raises BEFORE emitting pubDate/link/guid. */
function pubDate(): string {
  throw new Error(PUB_DATE_INSPECT);
}

/** rss.rb:39-50 view :feed_item — title, description (the item's
 *  :open_content), pubDate → the raise. The emitted prefix UP TO the
 *  raise is what the capture pins:
 *  `<item><title>…</title><description>…</description>`. */
async function rssFeedItemPrefix(
  item: FormatCard,
  openContent: (item: FormatCard) => Promise<string>,
): Promise<string> {
  const description = item.unknown ? "" : await openContent(item);
  return (
    `<item><title>${xmlEscapeText(item.name)}</title>` +
    `<description>${xmlEscapeText(description)}</description>`
  );
}

/** rss.rb:14-31 view :feed — the instruct + rss + channel frame, the feed
 *  body, and the rescue's error element (Builder ensure-closes the open
 *  tags before the error appends — the capture's exact shape:
 *  `…</description></item></channel></rss><error>…</error>`).
 *
 *  feed_body's items (rss.rb:33-38 raw_feed_items): the base default is
 *  [card], but the list-family override (card-mod-list 01_list/
 *  other_views.rb:84-85) is card.item_cards — the capture's *all+*read
 *  feed item is Anyone, not the card itself. Search-type feeds ride the
 *  search_with_params override (search_views.rb:25) — the named search
 *  remainder above. */
export async function rssFeed(
  card: FormatCard,
  items: FormatCard[],
  globalTitle: string,
  openContent: (item: FormatCard) => Promise<string>,
  opts: FormatShowOptions,
): Promise<string> {
  const urlBase = opts.urlBase ?? "";
  const feedTitle = `${globalTitle} : ${card.name.replace(/^\*/, "")}`;

  const head =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">` +
    `<channel>` +
    `<title>${xmlEscapeText(feedTitle)}</title>` +
    `<description></description>` +
    `<link>${xmlEscapeText(urlBase + cardPath(card.name))}</link>`;

  const prefixes: string[] = [];
  for (const item of items) {
    prefixes.push(await rssFeedItemPrefix(item, openContent));
  }
  const body = prefixes.join("");
  try {
    pubDate();
    // unreachable: pubDate raises on the oracle stack (oracle truth 2)
    return `${head}${body}</item></channel></rss>`;
  } catch (error) {
    // The rescue (rss.rb:27-30): `@xml.error "\n\nERROR rendering RSS:
    // #{e.inspect}\n\n #{e.backtrace}"` — Builder having ensure-closed
    // </item></channel></rss> first (the capture's shape). The backtrace
    // is the environment-specific byte class (Ruby file paths in the
    // capture); the port emits a one-line TS label.
    const message = error instanceof Error ? error.message : String(error);
    const backtraceLine =
      "format-families.ts (TypeScript port; the Ruby capture's backtrace is " +
      "environment-specific)";
    return (
      `${head}${body}</item></channel></rss>` +
      `<error>\n\nERROR rendering RSS: ${xmlEscapeText(message)}\n\n ${backtraceLine}</error>`
    );
  }
}

// ---------------------------------------------------------------------------
// JSON (card-mod-format set/all/json.rb + set/all/data.rb)
// ---------------------------------------------------------------------------

/** data.rb nucleus — { id, name, type, url } + codename when present. */
function jsonNucleus(card: FormatCard, urlBase: string): Record<string, unknown> {
  const nucleus: Record<string, unknown> = {
    id: card.id ?? null,
    name: card.name,
    type: card.typeName ?? "",
    url: `${urlBase}${cardPath(card.name)}.json`,
  };
  if (card.codename !== undefined) nucleus["codename"] = card.codename;
  return nucleus;
}

/** The json :content arm (data.rb `view :content` vs the list-family
 *  override): list-family cards render item_names (an array); every other
 *  card renders the raw db_content. */
function jsonContent(card: FormatCard): unknown {
  if (card.typeCode !== undefined && LIST_FAMILY_TYPE_CODES.has(card.typeCode)) {
    return itemNamesOf(card);
  }
  return card.dbContent;
}

/** data.rb atom — nucleus + content when known (&& !structure, the named
 *  remainder). */
function jsonAtom(card: FormatCard, urlBase: string): Record<string, unknown> {
  const atom = jsonNucleus(card, urlBase);
  if (!card.unknown) atom["content"] = jsonContent(card);
  return atom;
}

/** json.rb show → :molecule — atom.merge(items:, links:, ancestors:,
 *  html_url:, type: nest(type_card, :nucleus), created_at:, updated_at:)
 *  wrapped by page_details (url + requested_at), pretty-printed.
 *  Ruby Hash#merge keeps the ORIGINAL key position when replacing a
 *  value, so the type-nest lands at atom's `type` slot and page_details'
 *  url lands at the atom url slot (the probe's key order: id, name, type,
 *  url, [codename], content, items, links, ancestors, html_url,
 *  created_at, updated_at, requested_at). */
function jsonMolecule(parts: {
  card: FormatCard;
  items: FormatCard[];
  ancestors: FormatCard[];
  urlBase: string;
  now: () => Date;
  typeCard: FormatCard | undefined;
}): string {
  const { card, items, ancestors, urlBase, now, typeCard } = parts;
  const molecule = jsonAtom(card, urlBase);
  molecule["items"] = items.map((item) => jsonAtom(item, urlBase));
  molecule["links"] = [];
  // the ancestors view nests each part with view :nucleus (data.rb:47-51) —
  // NUCLEUS, no content (the capture's *all/*read ancestor objects).
  molecule["ancestors"] = ancestors.map((a) => jsonNucleus(a, urlBase));
  molecule["html_url"] = urlBase + cardPath(card.name);
  if (typeCard !== undefined) molecule["type"] = jsonNucleus(typeCard, urlBase);
  if (card.createdAt !== undefined) molecule["created_at"] = rubyTimestamp(card.createdAt);
  if (card.updatedAt !== undefined) molecule["updated_at"] = rubyTimestamp(card.updatedAt);
  // page_details (json.rb:52-55): url + requested_at.
  molecule["url"] = urlBase + cardPath(card.name);
  molecule["requested_at"] = rubyTimestamp(now());
  // stringify (json.rb:56-59): JSON.pretty_generate (no compress param).
  return JSON.stringify(molecule, null, 2);
}

// ---------------------------------------------------------------------------
// resolution helpers
// ---------------------------------------------------------------------------

async function resolveCard(
  engine: FormatEngineSurface,
  cardName: string,
): Promise<FormatCard> {
  await engine.prepareItemForRender(cardName);
  const card = engine.fetchRenderCard(cardName);
  if (card === undefined) {
    // The routes never reach a missing card as a renderable format show —
    // Ruby's fetch raises Card::Error::NotFound before the format runs.
    const err = new Error(`invalid card name: ${cardName}`) as Error & {
      notFound?: boolean;
    };
    err.notFound = true;
    throw err;
  }
  return withTypeCode(formatCardOf(card), card, engine);
}

/** Resolve one item NAME to its FormatCard; a fetch miss is the virtual
 *  card (Ruby's Card.fetch new:) with the parsed name and no type. */
async function resolveItem(
  engine: FormatEngineSurface,
  name: string,
): Promise<FormatCard> {
  const known = await engine.prepareItemForRender(name);
  if (known !== undefined) {
    return withTypeCode(formatCardOf(known), known, engine);
  }
  return {
    id: undefined,
    name,
    typeName: undefined,
    typeCode: undefined,
    codename: undefined,
    dbContent: "",
    createdAt: undefined,
    updatedAt: undefined,
    unknown: true,
  };
}

async function resolveItems(
  engine: FormatEngineSurface,
  card: FormatCard,
  opts: FormatShowOptions,
): Promise<FormatCard[]> {
  const out: FormatCard[] = [];
  for (const name of itemNamesOf(card)) {
    out.push(await resolveItem(engine, name));
  }
  void opts;
  return out;
}

/** The json item_cards override: list-family cards → the parsed items;
 *  every other card → its nest targets (json.rb's nested_cards — the
 *  Home capture's single *getting started item). */
async function resolveJsonItems(
  engine: FormatEngineSurface,
  card: FormatCard,
  opts: FormatShowOptions,
): Promise<FormatCard[]> {
  if (card.typeCode !== undefined && LIST_FAMILY_TYPE_CODES.has(card.typeCode)) {
    return resolveItems(engine, card, opts);
  }
  const out: FormatCard[] = [];
  for (const ref of referencedNames(card.dbContent)) {
    let name = ref.name;
    if (name.startsWith(":")) {
      // the codename mark's registry key is the stored (underscored) form
      const resolved = await opts.resolveCodenameMark?.(
        name.slice(1).replace(/ /g, "_"),
      );
      if (resolved === undefined) continue;
      name = resolved;
    }
    const known = await engine.prepareItemForRender(name);
    if (known === undefined) continue; // nested_cards carries only real cards
    out.push(await withTypeCode(formatCardOf(known), known, engine));
  }
  return out;
}

/** Card::Name#ancestors resolved as cards (cardname-0.20.0 pieces.rb:24-26
 *  `pieces.reject { |p| p == self }` — the name's individual parts:
 *  "*all+*read" → ["*all", "*read"], the capture's exact pair; simple
 *  names have none). A fetch miss is the virtual card (Ruby's nest of a
 *  new card still renders a nucleus). */
async function resolveAncestors(
  engine: FormatEngineSurface,
  card: FormatCard,
): Promise<FormatCard[]> {
  const parts = card.name.split("+");
  if (parts.length < 2) return [];
  const out: FormatCard[] = [];
  for (const part of parts) out.push(await resolveItem(engine, part));
  return out;
}

/** Rule.global_setting(:title) — the *all+*title rule card's content. */
async function readGlobalTitle(engine: FormatEngineSurface): Promise<string> {
  const rule = await engine.prepareItemForRender("*all+*title");
  return rule?.dbContent ?? "";
}

/** The :open_content html render (the rss feed_item_description). */
async function openContent(
  engine: FormatEngineSurface,
  item: FormatCard,
): Promise<string> {
  if (item.unknown) return "";
  try {
    return await engine.render(item.name, "open_content");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// the dispatch entry
// ---------------------------------------------------------------------------

/** One format show (the route's `card#read` for a non-html format):
 *  csv show defaults :titled, rss :feed, json :molecule. */
export async function renderFormatShow(
  engine: FormatEngineSurface,
  cardName: string,
  format: NonHtmlFormatName,
  opts: FormatShowOptions = {},
): Promise<string> {
  const now = opts.now ?? (() => new Date());
  const card = await resolveCard(engine, cardName);
  if (format === "csv") {
    // show (csv.rb:5-8): view ||= :titled.
    const items = await resolveItems(engine, card, opts);
    return csvTitled(items);
  }
  if (format === "rss") {
    // show (rss.rb:10-13): view ||= :feed; the config gate first
    // (rss.rb:17 — `return "RSS feeds disabled" unless …rss_enabled`).
    if (opts.rssEnabled !== true) return RSS_DISABLED_BYTES;
    const globalTitle = await readGlobalTitle(engine);
    const feedItems =
      card.typeCode !== undefined && LIST_FAMILY_TYPE_CODES.has(card.typeCode)
        ? await resolveItems(engine, card, opts)
        : [card];
    return rssFeed(
      card,
      feedItems,
      globalTitle,
      (item) => openContent(engine, item),
      opts,
    );
  }
  // json: show (json.rb:20-24) defaults :molecule.
  const items = await resolveJsonItems(engine, card, opts);
  const ancestors = await resolveAncestors(engine, card);
  const typeCard =
    card.typeName === undefined
      ? undefined
      : await resolveItem(engine, card.typeName);
  return jsonMolecule({ card, items, ancestors, urlBase: opts.urlBase ?? "", now, typeCard });
}
