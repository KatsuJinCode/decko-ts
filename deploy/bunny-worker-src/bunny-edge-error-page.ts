// deploy/bunny-worker-src/bunny-edge-error-page.ts — the edge's full-chrome
// error pages, ported from the staging host's error builder.
//
// WHY THIS EXISTS: the edge answered card 404s, render 500s, and
// render-budget 503s with the bare worker.ts layoutPage shell (measured at
// one point in the edge's history: card 404 = 749 B, 0 <link>, 0 <script>,
// no <nav>, no footer) while a deployed deck serves Decko's full-chrome
// error pages. The staging host's builder (vm-staging-server.mjs:1339-1549 and its
// helper chain) is the Ruby-faithful ground truth; this module carries that
// builder's byte shape, with the platform deltas named inline:
//
//   - not_found (404) and server_error (500) are Decko's two error shapes,
//     built exactly as the staging host builds them (renderDeckoErrorPage,
//     vm-staging-server.mjs:1497-1549): the deck's default layout body drives
//     the whole page shell, *header/*footer nest into it through literal
//     reads + token substitution, and the error body region is the recorded
//     slot HTML (the not_found slot with the noindex head line; the
//     "Wild Card!" deck error block).
//   - The budget 503 has NO staging shape (the deadline is an edge concept),
//     so its BODY REGION is the edge's own Slow-render text re-homed into
//     the same chrome; the Retry-After / X-Decko-Edge-Budget / no-store
//     contract stays with the caller (bunny-edge-engine-request.ts). Its
//     chrome build is grace-bounded (EDGE_ERROR_PAGE_GRACE_MS): when the
//     deadline fired because the database is slow or dead, the error page
//     must not become a second long wait.
//   - Builder failure falls back to the staging builder's own contract
//     (vm-staging-server.mjs:1494-1497: "falls back to the previous minimal
//     stubs so the server's error path can never 500 a second time"): the
//     minimal htmlResponse stubs for not_found/server_error.
//
// NAMED DEVIATIONS from the staging builder (byte-neutral):
//   - resolveCardStoredName: staging scans `SELECT name FROM cards WHERE
//     trash = 0` (a whole-deck row walk — the pattern the edge's
//     query scoping avoids); the edge resolves the stored name
//     through the deck's own FetchEngine#fetchByName (one targeted query,
//     the Ruby-faithful name-key resolution). Only the server_error title
//     consumes it; the not_found title comes from the URL display form +
//     *title.
//   - The staging htmlResponse's `Connection: close` / `Keep-Alive` headers
//     are Node-origin transport specifics and are not ported; every response
//     here carries Content-Type + `Cache-Control: no-store`, the same pair
//     the request core's html() helper sets.
//   - The staging host memoizes the *title read process-wide; the edge
//     re-reads it per error page (one bounded query on a cold path).
//
// SDK-free by construction (no "@bunny.net/edgescript-sdk" import), so
// vitest loads it directly — the same testability pattern as
// bunny-edge-page-shell.ts and bunny-edge-engine-request.ts.

import type { FetchEngine } from "../../src/card/fetch.js";
import { DeckoName } from "../../src/card/name.js";
import { newSlotId } from "../../src/card/render/slot-html.js";
import { SERVER_ERROR_HTML } from "../../src/card/render/debug-server-error.js";
import { escapeHtml } from "./bunny-edge-lineage-worker-surface.js";
import { EMPTY_SERVED_DELTAS, type ServedEnvironmentDeltas } from "./bunny-edge-served-deltas.js";

/** The deck the error pages build from. Structural, so tests can pass the
 *  real engines over the in-memory sqlite deck (the request core's Deck
 *  shape satisfies it; only the FetchEngine is consumed). */
export interface ErrorPageDeck {
  fetcher: FetchEngine;
  /** The deployment's served-environment deltas (deployment configuration,
   *  EMPTY by default). Every deck card id, asset URL and version pin this
   *  chrome used to hard-code reads through here — see
   *  bunny-edge-served-deltas.ts and the module header's finding-9 note. */
  servedDeltas?: ServedEnvironmentDeltas;
}

/** The deltas for this deck, defaulting to the stock (empty) set so a
 *  deployment that configures nothing builds a deck-neutral error page. */
function deltasOf(deck: ErrorPageDeck): ServedEnvironmentDeltas {
  return deck.servedDeltas ?? EMPTY_SERVED_DELTAS;
}

/** The literal-read driver surface this module uses (SQLDatabaseDriver's
 *  query, named structurally so any driver satisfies it). */
interface ErrorPageDriver {
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

// ---------------------------------------------------------------------------
// Deck identity — DEPLOYMENT CONFIGURATION, not constants
// ---------------------------------------------------------------------------
//
// Every value in this block used to be a module constant pinned from one
// specific deck, so every deployment served that deck's card ids, asset URLs
// and version string. Each is now a field on the deployment's
// ServedEnvironmentDeltas (bunny-edge-served-deltas.ts), EMPTY by default:
//
//   notFoundType / allCardId / layoutPointerId / pointerTypeId  the deck
//     card ids the chrome's not_found slot and default-layout lookup read.
//     Unset, the not_found slot renders with NO type chip and NO type
//     attributes, and the default-layout lookup has no ids to query with —
//     so the builder's own fallback (the minimal stub, below) answers rather
//     than guessing another deck's layout rule.
//   mainCssUrl / mainJsUrl / logoUrl / faviconUrl / siteTitleDefault  the
//     head's asset URLs and boot-value fallbacks. Unset, the chrome links no
//     compiled CSS or main script and falls back to a stock site title.
//   footerVersionPin  the version the credit block prints. Unset, the credit
//     block prints the deck's own stored bytes with no rewrite.
//
// The builder's fallback contract is unchanged and is what an UNCONFIGURED
// deployment leans on: a chrome it cannot build answers the minimal stub, so
// the error path can never 500 a second time.

/** Grace bound for the budget-503 chrome build (module header): when the
 *  render budget fired because the database is slow or dead, the error page
 *  itself must not become a second long wait. Past the grace the builder's
 *  fallback (the bare stub page) answers. Named here so the caller's
 *  contract is greppable. */
export const EDGE_ERROR_PAGE_GRACE_MS = 5_000;

// ---------------------------------------------------------------------------
// Minimal-response helpers
// ---------------------------------------------------------------------------

/** The request core's html() pair (Content-Type + no-store) — re-declared
 *  here because importing it would make a cycle
 *  (bunny-edge-engine-request.ts imports this module). Headers are
 *  byte-identical; the pins assert no-store on every surface. */
function errorResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** The staging host's minimal document shape (htmlResponse,
 *  vm-staging-server.mjs:515-530) — the builder's fallback stubs and the
 *  router's no-route stub are built on it. The staging origin's
 *  Connection: close header is a Node transport detail and is not ported
 *  (module header). */
function minimalHtmlResponse(status: number, body: string, title: string): Response {
  return errorResponse(
    status,
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
  );
}

/** The not_found fallback stub, byte-verbatim from
 *  vm-staging-server.mjs:1535-1541. */
function minimalNotFoundResponse(cardName: string): Response {
  return minimalHtmlResponse(
    404,
    `<h1>Card not found</h1><pre>${escapeHtml(`card not found: ${cardName}`)}</pre>` +
      `<p><a href="/">Home</a> · <a href="/_status">status</a></p>`,
    "Card not found",
  );
}

/** The server_error fallback stub, byte-verbatim from
 *  vm-staging-server.mjs:1543-1547 (the BUILDER's own failure message, not
 *  the original render's). */
function minimalServerErrorResponse(builderMessage: string): Response {
  return minimalHtmlResponse(
    500,
    `<h1>Render error</h1><pre>${escapeHtml(builderMessage)}</pre>`,
    "Render error",
  );
}

/** The staging ROUTER's no-route stub (vm-staging-server.mjs:2203): paths
 *  that are not card names get this minimal answer, NOT the full-chrome
 *  card not_found page — a different route class on staging and on live's
 *  Rails router alike. The title is the edge's existing "Not found" (the
 *  staging default title is the staging origin's own process name). */
export function noRouteNotFoundResponse(pathname: string): Response {
  return minimalHtmlResponse(
    404,
    `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)}</pre>`,
    "Not found",
  );
}

// ---------------------------------------------------------------------------
// Literal card reads (vm-staging-server.mjs:794-824, 970-979, 1033-1056)
// ---------------------------------------------------------------------------

async function deckRows<T>(
  deck: ErrorPageDeck,
  sql: string,
  params: unknown[],
): Promise<{ rows: T[] }> {
  const driver = deck.fetcher.driver as ErrorPageDriver;
  return await driver.query<T>(sql, params);
}

interface ErrorPageBootValues {
  siteTitle: string;
  logoUrl: string;
  faviconUrl: string;
}

async function ensureBootValues(deck: ErrorPageDeck): Promise<ErrorPageBootValues> {
  const deltas = deltasOf(deck);
  const result: ErrorPageBootValues = {
    // The *title read overrides these fallbacks; without a configured
    // fallback a deck that stores no *title gets the stock label below
    // rather than another deck's site name.
    siteTitle: deltas.siteTitleDefault ?? "Deck",
    logoUrl: deltas.logoUrl ?? "",
    faviconUrl: deltas.faviconUrl ?? "",
  };
  try {
    const { rows } = await deckRows<{ name?: string | null; db_content?: string | null }>(
      deck,
      "SELECT name, db_content FROM cards WHERE name IN ('*title', '*favicon', '*logo') AND trash = 0",
      [],
    );
    for (const row of rows) {
      if (row.name === "*title") {
        const raw = row.db_content;
        if (typeof raw === "string" && raw.trim().length > 0) {
          result.siteTitle = raw.trim();
        }
      }
      // *favicon and *logo: a deck that stores neither keeps the configured
      // fallback URLs (empty when the deployment configures none, so the
      // head carries no favicon/logo reference at all rather than a broken
      // link to a file id from another deck's bucket).
    }
  } catch {
    // Keep the defaults if the lookup fails.
  }
  return result;
}

async function fetchCardDbContent(deck: ErrorPageDeck, name: string): Promise<string> {
  try {
    const { rows } = await deckRows<{ db_content?: string | null }>(
      deck,
      "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    const row = rows[0];
    if (rows.length > 0 && row !== undefined && typeof row.db_content === "string") {
      return row.db_content as string;
    }
  } catch {}
  return "";
}

async function fetchCardTypeId(deck: ErrorPageDeck, name: string): Promise<number | undefined> {
  try {
    const { rows } = await deckRows<{ type_id?: number | string | null }>(
      deck,
      "SELECT type_id FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    const typeId = rows[0]?.type_id;
    if (rows.length > 0 && typeId !== null && typeId !== undefined) return Number(typeId);
  } catch {}
  return undefined;
}

async function fetchCardBodyByName(
  deck: ErrorPageDeck,
  name: string,
): Promise<string | undefined> {
  try {
    const { rows } = await deckRows<{ db_content?: string | null }>(
      deck,
      "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    const row = rows[0];
    if (row !== undefined && typeof row.db_content === "string") return row.db_content;
  } catch {}
  return undefined;
}

/** The stored display name for a card, resolved through the deck's own
 *  FetchEngine (module-header deviation note: replaces staging's
 *  whole-table scan with the Ruby-faithful name-key lookup). */
async function resolveCardStoredName(deck: ErrorPageDeck, slugName: string): Promise<string> {
  try {
    const record = await deck.fetcher.fetchByName(slugName);
    if (record !== undefined && record.name !== undefined) return record.name.s;
  } catch {}
  return slugName;
}

// ---------------------------------------------------------------------------
// Navbar / footer builders (vm-staging-server.mjs:894-968, 981-1031, 1081-1120)
// ---------------------------------------------------------------------------

/** Parse a deck wiki-link list: each line `[[Target|label]]`, empty lines
 *  ignored (vm-staging-server.mjs:983-995). */
function parseWikiLinkList(content: string): { target: string; label: string }[] {
  const out: { target: string; label: string }[] = [];
  if (typeof content !== "string") return out;
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const m = /^\[\[([^\]\[|]+?)(?:\|([^\]\[]+?))?\]\]$/.exec(line);
    if (m === null) continue;
    out.push({ target: m[1] !== undefined ? m[1].trim() : "", label: (m[2] ?? m[1]).trim() });
  }
  return out;
}

type DropdownItem =
  | { kind: "divider" }
  | { kind: "external"; target: string; label: string }
  | { kind: "link"; target: string; label: string };

/** Parse a Pointer dropdown card's db_content (vm-staging-server.mjs:1002-1031). */
function parseDropdownList(content: string): DropdownItem[] {
  const out: DropdownItem[] = [];
  if (typeof content !== "string") return out;
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === "*dropdown divider") {
      out.push({ kind: "divider" });
      continue;
    }
    const wl = /^\[\[([^\]\[|]+?)(?:\|([^\]\[]+?))?\]\]$/.exec(line);
    if (wl !== null) {
      const target = wl[1] !== undefined ? wl[1].trim() : "";
      const label = (wl[2] ?? wl[1]).trim();
      out.push({ kind: "link", target, label });
      continue;
    }
    const ext = /^(https?:\/\/\S+)\|(\S.*)$/.exec(line);
    if (ext !== null) {
      out.push({ kind: "external", target: ext[1] ?? "", label: (ext[2] ?? "").trim() });
      continue;
    }
    out.push({ kind: "link", target: line, label: line });
  }
  return out;
}

/** The navbar links renderer, ported verbatim — including the live deck's
 *  double-wrapped dropdown li (A-17), the external-URL and Adminu drops, the
 *  trailing denied span, and the "\r\n" item separator
 *  (vm-staging-server.mjs:894-968). */
async function renderNavbarLinks(deck: ErrorPageDeck): Promise<string> {
  const deltas = deltasOf(deck);
  const mainMenuContent = await fetchCardDbContent(deck, "*main menu");
  const items = parseWikiLinkList(mainMenuContent);
  const parts: string[] = [`<ul class="navbar-nav">`];
  for (const item of items) {
    const targetType = await fetchCardTypeId(deck, item.target);
    // With no configured Pointer type id the dropdown branch can never be
    // identified, so every item renders the plain link arm — the stock
    // shape, rather than another deck's dropdown structure.
    const isPointer = deltas.pointerTypeId !== undefined && targetType === deltas.pointerTypeId;
    if (item.target.startsWith("*") && isPointer) {
      const childContent = await fetchCardDbContent(deck, item.target);
      const children = parseDropdownList(childContent);
      parts.push(
        `<li class="nav-item"><li class="nav-item dropdown"><a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown"><span class="card-title" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span></a>\n`,
      );
      parts.push(`<div class="dropdown-menu">`);
      for (const child of children) {
        if (child.kind === "divider") {
          parts.push(`<div class="dropdown-divider"></div>\n`);
        } else if (child.kind === "external") {
          // Dropped: the live deck omits external entries (the anonymous
          // user gets a denied span for them instead).
          continue;
        } else if (child.target === "Adminu") {
          // Dropped: the live deck shows the trailing denied span instead.
          continue;
        } else {
          // Card::Name#to_url_key: spaces AND "$" become "_".
          const childKey = child.target.replace(/ /g, "_").replace(/\$/g, "_");
          parts.push(
            `<a class="dropdown-item known-card" href="/${escapeHtml(childKey)}"><span class="card-title" title="${escapeHtml(child.target)}">${escapeHtml(child.label)}</span></a>\n`,
          );
        }
      }
      parts.push(`<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`);
      // The "\r\n" separator is the byte shape the staging host emits
      // (vm-staging-server.mjs:952-957).
      parts.push(`</div></li></li>\r\n`);
    } else {
      const hrefKey = item.target.replace(/ /g, "_").replace(/\$/g, "_");
      parts.push(
        `<li class="nav-item"><a class="nav-link known-card" href="/${escapeHtml(hrefKey)}"><span class="card-title" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span></a></li>`,
      );
    }
  }
  parts.push(`</ul>`);
  return parts.join("");
}

/** The footer content: *credit_image + the version pin, wrapped in the
 *  Xfooter content-view slot (vm-staging-server.mjs:1081-1120). Single
 *  escape only on the slot JSON — the byte form the staging host emits. */
async function renderFooterContent(deck: ErrorPageDeck): Promise<string> {
  const creditImage = await fetchCardDbContent(deck, "*credit_image");
  // The footer version pin is deployment configuration. With no
  // pin configured the credit block prints the deck's own stored bytes and
  // makes no version claim of its own.
  const version = deltasOf(deck).footerVersionPin;
  // The *credit_image card's db_content ends "</svg>\n"; strip the
  // trailing newline so the template's own "\n" supplies the one live
  // serves (vm-staging-server.mjs:1093-1098).
  const svg = (creditImage.length > 0 ? creditImage : "").replace(/\n$/, "");
  const versionLine =
    version === undefined ? "" : `<a href="http://decko.org">Decko v${escapeHtml(version)}</a>\n`;
  const body =
    `<div class="d-flex justify-content-center align-items-center">\n` +
    `  ${svg}\n` +
    versionLine +
    `\n` +
    `</div>`;
  const slot = {
    view: "content",
    nest_name: "*footer",
    nest_syntax: ":footer|content",
    show: ["content"],
    home_view: "content",
  };
  // The slot wrapper's card identity is deployment configuration too: a
  // deployment that configures none carries no data-card-id / type
  // attributes rather than another deck's card ids.
  const deltas = deltasOf(deck);
  const cardIdAttr =
    deltas.footerCardId === undefined ? "" : ` data-card-id="${escapeHtml(deltas.footerCardId)}"`;
  const typeIdAttr =
    deltas.footerTypeId === undefined ? "" : ` data-card-type-id="${escapeHtml(deltas.footerTypeId)}"`;
  const typeNameAttr =
    deltas.footerTypeName === undefined
      ? ""
      : ` data-card-type-name="${escapeHtml(deltas.footerTypeName)}"`;
  return (
    `<div id="Xfooter-content-view" class="card-slot content-view ALL TYPE-html STAR SELF-Xfooter d0-card-content"${cardIdAttr} data-card-name="*footer"${typeIdAttr}${typeNameAttr} data-card-link-name="*footer" data-slot="${escapeHtml(JSON.stringify(slot))}">${body}</div>`
  );
}

/** Substitute the literal nest-syntax tokens in the *header HTML
 *  (vm-staging-server.mjs:1300-1336). */
async function substituteHeaderTokens(
  deck: ErrorPageDeck,
  headerHtml: string,
  boot: ErrorPageBootValues,
): Promise<string> {
  if (typeof headerHtml !== "string" || headerHtml.length === 0) return headerHtml;
  let out = headerHtml.replace(/\{\{:home\|home_path\}\}/g, "/");
  out = out.replace(
    /\{\{:logo\|core;size:small\}\}/g,
    `<img alt="*logo" src="${escapeHtml(boot.logoUrl)}" />`,
  );
  out = out.replace(/\{\{:title\|core\}\}/g, escapeHtml(boot.siteTitle));
  const navLinks = await renderNavbarLinks(deck);
  out = out.replace(/\{\{:main_menu\|navbar_links\}\}/g, navLinks);
  out = out.replace(
    /\{\{:search\|search_box\}\}/g,
    `<div class='d0-search-box'>\n` +
      `<form role="search" class="search-box-form" action="/*search" accept-charset="UTF-8" method="get"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" /></form>\n` +
      `</div>\n`,
  );
  out = out.replace(
    /\{\{:account_links\|navbar_links\}\}/g,
    `<ul class="navbar-nav"><li class="nav-item"><a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a></li>\n` +
      `<li class="nav-item"><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></li></ul>`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// The default layout (vm-staging-server.mjs:1460-1492)
// ---------------------------------------------------------------------------

interface DefaultLayout {
  layoutName: string;
  layoutBody: string;
}

/** Resolve *all+*layout (the deck-wide Default Layout rule) without a card
 *  context — the error surfaces are laid out by the deck's default layout on
 *  live. Throws when the layout body is missing (the caller's fallback
 *  serves the minimal stub, exactly the staging contract). */
async function resolveDefaultLayout(deck: ErrorPageDeck): Promise<DefaultLayout> {
  const deltas = deltasOf(deck);
  // The default-layout rule's two anchors are the deck's OWN *all and *layout
  // card ids, which differ per deck. Without them there is
  // nothing to query with, so the builder falls back to its minimal stub —
  // the same contract as a missing layout body, and the honest answer for a
  // deployment that has not told us which layout rule is its default.
  if (deltas.allCardId === undefined || deltas.layoutPointerId === undefined) {
    throw new Error(
      "no default-layout rule anchors configured; set DECKO_SERVED_ALL_CARD_ID and " +
        "DECKO_SERVED_LAYOUT_POINTER_ID (or the DECKO_SERVED_DELTAS allCardId/layoutPointerId " +
        "fields) so the error page can resolve this deck's Default Layout",
    );
  }
  let dbContent: string | undefined;
  try {
    const { rows } = await deckRows<{ id?: number | string | null; db_content?: string | null }>(
      deck,
      "SELECT id, db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1",
      [deltas.allCardId, deltas.layoutPointerId],
    );
    const row = rows[0];
    if (row !== undefined && typeof row.db_content === "string") dbContent = row.db_content;
  } catch {}
  const layoutName =
    typeof dbContent === "string" && dbContent.length > 0 ? dbContent : "Default Layout";
  let layoutBody = "";
  const body = await fetchCardBodyByName(deck, layoutName);
  if (typeof body === "string") layoutBody = body;
  if (typeof layoutBody !== "string" || layoutBody.length === 0) {
    throw new Error(
      `default layout "${layoutName}" has no body in the corpus; cannot build the error page chrome`,
    );
  }
  return { layoutName, layoutBody };
}

// ---------------------------------------------------------------------------
// The error body regions (vm-staging-server.mjs:1376-1442)
// ---------------------------------------------------------------------------

/** The not_found outer slot's data-slot JSON: exactly what a Default Layout
 *  page's main slot carries (vm-staging-server.mjs:1376-1391). Key order
 *  matches SLOT_KEYS order on live. */
function notFoundSlotOptionsJson(): string {
  return JSON.stringify({
    view: "titled",
    nest_name: "_main",
    nest_syntax: "_main|titled",
    hide: ["menu", "help"],
    main: true,
    home_view: "titled",
    main_view: true,
    layout: "Default Layout",
  });
}

/** The main-slot bytes for the not_found page — the staging host's slot div,
 *  verbatim except the per-name fields and the per-request slot id
 *  (vm-staging-server.mjs:1393-1426). escapeHtml single-escapes the slot
 *  JSON's quotes — the byte form the staging host emits. */
function buildNotFoundSlotHtml(
  deck: ErrorPageDeck,
  displayName: string,
  nameKey: string,
  urlKey: string,
): string {
  const slotJson = notFoundSlotOptionsJson();
  // The not-found card's TYPE identity is deployment configuration. Unset,
  // the slot carries no TYPE- class chip and no type attributes — the stock
  // shape, rather than another deck's default type card.
  const notFoundType = deltasOf(deck).notFoundType;
  const typeChip = notFoundType === undefined ? "" : ` TYPE-${notFoundType.classToken}`;
  const typeIdAttr =
    notFoundType === undefined ? "" : ` data-card-type-id="${escapeHtml(notFoundType.id)}"`;
  const typeNameAttr =
    notFoundType === undefined ? "" : ` data-card-type-name="${escapeHtml(notFoundType.name)}"`;
  return (
    `<div id="${escapeHtml(`${nameKey}-not_found-view`)}" ` +
    `class="card-slot not_found-view ALL${typeChip}" ` +
    `data-card-name="${escapeHtml(displayName)}"` +
    typeIdAttr +
    typeNameAttr +
    ` ` +
    `data-card-link-name="${escapeHtml(urlKey)}" ` +
    `data-slot-id="${newSlotId()}" ` +
    `data-slot="${escapeHtml(slotJson)}">` +
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="Not Found">Not Found</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text"><h2>\n` +
    `Could not find\n` +
    `<em>\n` +
    `${escapeHtml(displayName)}\n` +
    `</em>\n` +
    `</h2>\n` +
    `\n` +
    `<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
    `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create it.</div>` +
    `</div></div></div>`
  );
}

/** The main-slot bytes for the server-error page — Decko's deck error block,
 *  byte-verbatim from live_Introduction.html. No card-slot wrap, no name
 *  interpolation inside the block; the requested name shows only in the
 *  <title> (vm-staging-server.mjs:1428-1442). The bytes are the engine's
 *  html :server_error view, shared so the page and the view cannot drift. */
function buildServerErrorSlotHtml(): string {
  return SERVER_ERROR_HTML;
}

/** URL display form for a name with no stored card row: Decko's URL
 *  semantics fold "_" to " " (vm-staging-server.mjs:1444-1450). */
function urlDisplayNameForSlug(slugName: string): string {
  return slugName.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// wrapWithLayout (vm-staging-server.mjs:1159-1294) — the full-chrome doc
// ---------------------------------------------------------------------------

interface WrapPageOpts {
  /** A complete extra <head> line incl. its trailing "\n" (the not_found
   *  shape's noindex line — the only head delta between the two error
   *  shapes on live). */
  headExtraLine?: string;
  /** The full "<name> - <site title>" string. Undefined -> the stored-name
   *  title (the server_error shape's semantics). */
  titleText?: string;
}

/** Wrap the rendered error region in the default layout's body and the outer
 *  HTML doc, byte-for-byte the staging host's wrapWithLayout. */
async function wrapWithLayout(
  deck: ErrorPageDeck,
  cardName: string,
  viewHtml: string,
  layout: DefaultLayout,
  pageOpts: WrapPageOpts,
): Promise<string> {
  const boot = await ensureBootValues(deck);
  // Resolved only when the title needs it (the server_error shape; the
  // not_found shape passes titleText) — byte-neutral, one query fewer on
  // the not_found path (module-header deviation note).
  const storedName =
    pageOpts.titleText === undefined ? await resolveCardStoredName(deck, cardName) : "";
  // Read *header db_content verbatim so the literal nest-syntax tokens
  // survive into the substitution step (vm-staging-server.mjs:1164-1172).
  const rawHeaderHtml = await fetchCardDbContent(deck, "*header");
  const footerHtml = await renderFooterContent(deck);
  const headerHtml = await substituteHeaderTokens(deck, rawHeaderHtml, boot);
  const bodyProcessed = viewHtml;
  const pageTitle = pageOpts.titleText ?? `${storedName} - ${boot.siteTitle}`;
  const deltas = deltasOf(deck);
  const cssUrl = deltas.mainCssUrl ?? "";
  const jsUrl = deltas.mainJsUrl ?? "";
  // The head's remote <script> tags, each a COMPLETE tag supplied by the
  // deployment (their SRI hashes belong to the files that deployment serves,
  // so they are configuration, not something this builder can derive).
  const remoteScriptTags =
    deltas.headScripts === undefined
      ? ""
      : deltas.headScripts.map((tag) => `${tag}\n`).join("");
  if (typeof layout.layoutBody !== "string" || layout.layoutBody.length === 0) {
    throw new Error(
      `layout body missing or empty for card ${cardName} (layout: ${layout.layoutName}); ` +
        `live serves an error page for empty layouts, so no Default-Layout body is imported (audit A-11)`,
    );
  }
  const bodyTagMatch = /<body(\s[^>]*)?>/.exec(layout.layoutBody);
  if (bodyTagMatch === null) {
    throw new Error(
      `layout body for ${layout.layoutName} carries no <body> tag; cannot build the shell`,
    );
  }
  const bodyOpenEnd = bodyTagMatch.index + bodyTagMatch[0].length;
  const bodyCloseStart = layout.layoutBody.lastIndexOf("</body>");
  if (bodyCloseStart < bodyOpenEnd) {
    throw new Error(
      `layout body for ${layout.layoutName} carries no closing </body>; cannot build the shell`,
    );
  }
  const layoutInner = layout.layoutBody.slice(bodyOpenEnd, bodyCloseStart);
  // Replacer functions (not replacement strings) so card content that
  // contains "$" sequences can never be read as special replacement
  // patterns (vm-staging-server.mjs:1224-1237).
  const renderedInner = layoutInner
    .replace(/\{\{:header\|core\}\}/g, () => headerHtml)
    .replace(/\{\{:footer\|content\}\}/g, () => footerHtml)
    // A `<p>{{*foot|core}}</p>` nest in the layout renders `<p></p>` for
    // the anonymous viewer — the nest contributes zero bytes — so the shell
    // builder strips it rather than leaving an empty paragraph.
    .replace(/\{\{\*foot\|core\}\}/g, () => "")
    .replace(
      /\{\{_main(?:\s*\|\s*([A-Za-z0-9_]+))?\}\}/g,
      () => `<div id="main">${bodyProcessed}</div>`,
    );
  const unresolvedTokens = renderedInner.match(/\{\{[^}]*\}\}/g);
  if (unresolvedTokens !== null) {
    // Same visibility the staging host gives itself (console.warn); the
    // tokens stay as the layout's own bytes, never silently dropped.
    console.warn(
      `[bunny-edge-error-page] layout ${layout.layoutName} carries tokens the shell builder does not resolve: ${unresolvedTokens.join(", ")}`,
    );
  }
  return (
    `      <!DOCTYPE HTML>\n` +
    `      <html class="h-100">\n` +
    `        <head>\n` +
    `          <title>${escapeHtml(pageTitle)}</title>\n` +
    `<meta charset='UTF-8'>\n` +
    `<meta content='width=device-width, initial-scale=1.0' name='viewport'>\n` +
(pageOpts.headExtraLine ?? "") +
    `\n` +
    // The favicon and the compiled CSS link are emitted only when the
    // deployment configured URLs for them: an unconfigured deck
    // gets no reference to another deck's asset files.
    (boot.faviconUrl === "" ? "" : `<link rel="shortcut icon" href="${escapeHtml(boot.faviconUrl)}" />\n`) +
    `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />\n` +
    (cssUrl === "" ? "" : `<link media="all" rel="stylesheet" type="text/css" href="${escapeHtml(cssUrl)}" />\n`) +
    `\n` +
    // The remote script tags are the deployment's own, verbatim (their SRI
    // hashes belong to the files that deployment serves, so they cannot be
    // derived here). Unconfigured, the head carries none of them.
    remoteScriptTags +
    (jsUrl === "" ? "" : `<!-- MAIN DECKO JAVASCRIPT -->\n<script src="${escapeHtml(jsUrl)}"></script>\n`) +
    `<script>\n` +
    `//<![CDATA[\n` +
    `decko.rootUrl='${escapeHtml(deltas.rootUrl ?? "")}';\n` +
    `decko.doubleClick='signed_in';\n` +
    `decko.cssPath='${escapeHtml(cssUrl)}';\n` +
    `decko.signed_in=false;\n` +
    `\n` +
    `//]]>\n` +
    `</script>\n` +
    `<script>\n` +
    `//<![CDATA[\n` +
    `decko.setAceConfig('{\n  \\"default\\": {\\n  \\"showGutter\\": true,\\n  \\"theme\\": \\"ace/theme/github\\",\\n  \\"printMargin\\": false,\\n  \\"tabSize\\": 2,\\n  \\"useSoftTabs\\": true,\\n  \\"maxLines\\": 30\\n  }\\n}\\n')\n` +
    `\n` +
    `decko.setTinyMCEConfig('{\n  \\"theme\\": \\"silver\\",\\n  \\"menubar\\": \\"edit view insert format table\\",\\n  \\"plugins\\": \\"autoresize code lists hr link autolink table\\",\\n  \\"toolbar1\\": \\"formatselect | bold italic strikethrough forecolor backcolor | deckolink nest |   | numlist bullist outdent indent  | removeformat\\",\n  \\"width\\":\\"100%\\",\n  \\"auto_resize\\":true,\\n  \\"autoresize_max_height\\": 500,\\n  \\"relative_urls\\":false,\\n  \\"extended_valid_elements\\": \\"a[name|href|target|title|onclick],img[class|src|border=0|alt|title|hspace|vspace|width|height|align|onmouseover|onmouseout|name],hr[class|width|size|noshade],font[face|size|color|style],span[class|align|style]\"\n }\\n')\n` +
    `\n` +
    `$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })\n` +
    `//]]>\n` +
    `</script>\n` +
    `        </head>\n` +
    `        ${layout.layoutBody.slice(bodyTagMatch.index, bodyOpenEnd)}${renderedInner}</body>\n` +
    `      </html>\n`
  );
}

// ---------------------------------------------------------------------------
// The grace bound (edge adaptation of the staging builder's fallback)
// ---------------------------------------------------------------------------

/** Race the chrome build against a grace bound; a build failure or a grace
 *  loss answers with the fallback bytes (the staging builder's own
 *  "never 500 a second time" contract, plus the edge's grace bound for the
 *  budget path). graceMs <= 0 = unbounded build (try/catch only). */
async function buildBytesWithGrace(
  graceMs: number,
  build: () => Promise<string>,
  fallback: () => string,
): Promise<string> {
  if (!Number.isFinite(graceMs) || graceMs <= 0) {
    try {
      return await build();
    } catch {
      return fallback();
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const graceLost = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("error page grace exceeded")), graceMs);
    // Never hold the isolate open on the grace timer alone.
    (timer as { unref?: () => void }).unref?.();
  });
  const buildPromise = build();
  try {
    return await Promise.race([buildPromise, graceLost]);
  } catch {
    return fallback();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A rejection arriving after the race settled must not become an
    // unhandled rejection.
    buildPromise.catch(() => {});
  }
}

interface FullChromeErrorPageOptions {
  status: number;
  /** The error body region HTML (the {{_main}} substitution's content). */
  viewHtml: string;
  /** The full <title> text. Undefined -> "<stored name> - <site title>"
   *  (the server_error shape's title semantics). */
  titleText?: string;
  /** A complete extra <head> line incl. its trailing "\n". */
  headExtraLine?: string;
  cardName: string;
  /** The bare fallback document, served whenever the chrome cannot be
   *  built (missing layout, failing reads) or the grace is lost. */
  fallbackHtml: string;
  /** Grace bound in ms; <= 0 or undefined = unbounded build. */
  graceMs?: number;
}

/** Build the full-chrome error response; any failure inside the builder or a
 *  lost grace answers with `fallbackHtml` (same status, no-store). */
export async function renderFullChromeErrorPage(
  deck: ErrorPageDeck,
  options: FullChromeErrorPageOptions,
): Promise<Response> {
  const bytes = await buildBytesWithGrace(
    options.graceMs ?? 0,
    async () => {
      const layout = await resolveDefaultLayout(deck);
      return await wrapWithLayout(deck, options.cardName, options.viewHtml, layout, {
        titleText: options.titleText,
        headExtraLine: options.headExtraLine,
      });
    },
    () => options.fallbackHtml,
  );
  return errorResponse(options.status, bytes);
}

// ---------------------------------------------------------------------------
// The two Decko error shapes (vm-staging-server.mjs:1497-1549)
// ---------------------------------------------------------------------------

/** Decko's not_found page (vm-staging-server.mjs:1505-1511 + 1519-1529):
 *  the not_found slot + the noindex head line + the URL display form title,
 *  status 404 (format/error.rb page_status_for_unknown). Any failure inside
 *  the builder falls back to the staging minimal stub. */
export async function renderDeckoNotFoundErrorPage(
  deck: ErrorPageDeck,
  cardName: string,
): Promise<Response> {
  try {
    const layout = await resolveDefaultLayout(deck);
    const displayName = urlDisplayNameForSlug(cardName);
    const boot = await ensureBootValues(deck);
    const parsed = DeckoName.parse(displayName);
    const viewHtml = buildNotFoundSlotHtml(deck, displayName, parsed.key, parsed.urlKey);
    const body = await wrapWithLayout(deck, cardName, viewHtml, layout, {
      headExtraLine: `<meta content='noindex' name='robots'>\n`,
      titleText: `${displayName} - ${boot.siteTitle}`,
    });
    return errorResponse(404, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[bunny-edge-error-page] not_found build failed for ${cardName}: ${message}; serving minimal stub`,
    );
    return minimalNotFoundResponse(cardName);
  }
}

/** Decko's server_error page (vm-staging-server.mjs:1512-1518 + 1519-1529):
 *  the "Wild Card!" deck error block, no noindex, the stored-name title the
 *  same way the good pages title, status 500. Any failure inside the builder
 *  falls back to the staging minimal stub. */
export async function renderDeckoServerErrorPage(
  deck: ErrorPageDeck,
  cardName: string,
): Promise<Response> {
  try {
    const layout = await resolveDefaultLayout(deck);
    const viewHtml = buildServerErrorSlotHtml();
    const body = await wrapWithLayout(deck, cardName, viewHtml, layout, {});
    return errorResponse(500, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[bunny-edge-error-page] server_error build failed for ${cardName}: ${message}; serving minimal stub`,
    );
    return minimalServerErrorResponse(message);
  }
}
