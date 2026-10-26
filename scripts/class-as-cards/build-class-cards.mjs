#!/usr/bin/env node
// build-class-cards.mjs: build the class page as a decko CARD TREE in the
// running demo scratch deck, at parity with the library it came from.
//
//   node scripts/class-as-cards/build-class-cards.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--values <class-values.json>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// The 2026-10-26 parity bar (the operator's three named gaps): the page lays
// out in TWO COLUMNS like the library's class page (the video/player column
// and the transcript/chapters column, collapsing to one column narrow); the
// transcript is the library's DYNAMIC TOOL, not a wall of text (chapter list
// beside the transcript pane, a chapter click moves both, the current line
// stays lit); and every element of the library's class page is present at
// parity (title, speakers, moments, chapters, handbook excerpt, related
// classes, the video itself, the concept strip, the library-written row,
// comments). The parity walk each element answers is recorded in the
// receipt's parityWalk field.
//
// The tree:
//
//   Class GMT20260401-212639                  (HTML; the class card, two columns)
//     +Video Player         (HTML; rendered by the mod's class_player view)
//     +Transcript           (HTML; rendered by the mod's transcript_tool view)
//     +Moment Index         (HTML; rendered by the mod's moment_index view)
//     +What This Class Adds (HTML)
//     +Handbook Excerpt     (HTML)
//     +Concepts             (HTML)
//     +Library Row          (HTML)
//     +Related Classes      (HTML)
//     +Comments             (HTML)
//     +Page Bundle          (HTML)
//
// The cards are HTML-type: the class card's own content carries the
// two-column grid and the small theater-toggle script, which the default
// content cleaner would strip out of a Basic card (the same reason the
// front-door lane used HTML-type doors). The section bodies the mod views
// render (player, tool, moment index) are the mod's output and bypass
// cleaning either way.
//
// The values (transcript cues, moments, segment names, summary, speaker
// totals, concepts, the player URL and the Bunny stream mapping) are COPIES
// of the library's own data for this class, snapshotted into
// class-values.json from the library's rendered pages (read-only). The two
// systems stay decoupled: nothing here reads the library at build time or at
// render time, and the decko page points at the library only through the
// copied URLs in card content.
//
// Exit code 0 when every card was written and read back, 1 otherwise.
// Nothing here deploys anywhere and nothing outside the loopback address is
// contacted.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_VALUES = join(repoRoot, "tmp", "class-as-cards-20261025", "class-values.json");
const DEFAULT_BUNNY_MAP = join(repoRoot, "tmp", "class-as-cards-20261025", "bunny-map.json");
const DEFAULT_OUT = join(repoRoot, "tmp", "class-as-cards-20261025", "class-cards-build-receipt.json");

// Overridden by --library-base: the address card content names for the
// library. The default is the machine-local serving instance; a deck built
// for a hosted surface names that surface's library address instead.
let LIBRARY_BASE = "https://library.culturesmith.help";
const RECORDING_ID = "GMT20260401-212639_Recording";
const CLASS_CARD = `Class ${RECORDING_ID.replace("_Recording", "")}`;
const PLAYER_URL = () => `${LIBRARY_BASE}/player/${RECORDING_ID}?embed=1&compact=1`;
const COMPARISON_CARD = "Class As Cards Demo";
// the sibling recorded classes the Related Classes card links (they live in
// this deck as pages of their own, built by the library-inside lane)
const SIBLING_CARDS = ["Class GMT20260408-213111", "Class GMT20260425-160021"];

// Speaker names in the transcript data carry family names; the demo renders
// given names only. The mapping is by the full names the data carries.
const GIVEN_NAMES = new Map([
  ["Brandon Williamscraig", "Brandon"],
  ["Ash Morgan", "Ash"],
  ["Julian Wilner", "Julian"],
]);
const givenName = (name) => GIVEN_NAMES.get(name) ?? String(name);

// The handbook excerpt the class sits beside, the library's own handbook page
// whose teaching the class's summary names (the same excerpt the
// library-inside lane quotes; text is Brandon's own words, read-only).
const HANDBOOK = {
  page: "About Aikido",
  path: "/wiki/about-aikido",
  quote:
    "There are no contests in the Art of Peace. A true warrior is invincible because they contest with nothing. Defeat means to defeat the mind of contention that we harbor within.",
  attribution:
    "O-Sensei, as the handbook page \"About Aikido\" carries it. The handbook text is Brandon's own words; the library links his terms and built the glossary index.",
};

const fmtTs = (sec) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- the section cards' content, from the copied values ---------------------

// The Bunny mapping for this class's recording: a VALUES snapshot read out
// of the library's own data (the media_remote table + pull zone flag), taken
// read-only into bunny-map.json. The deck copies values; it never reads the
// library. When the map is present the Video Player card embeds the real
// stream; without it the card keeps the honest play panel.
function videoPlayerContent(bunny) {
  const lines = [PLAYER_URL()];
  if (bunny?.original) lines.push(`@bunny ${bunny.original}`);
  if (bunny?.poster) lines.push(`@poster ${bunny.poster}`);
  return lines.join("\n");
}

function momentIndexContent(values) {
  const lines = [`@base ${LIBRARY_BASE}/classes/${RECORDING_ID}`];
  for (const seg of values.segments) {
    lines.push(`# ${seg.name} | ${seg.start}-${seg.end}`);
  }
  for (const m of values.moments) {
    lines.push(`${m.start}|${m.end}|${m.title}|${m.dotColor ?? ""}`);
  }
  return lines.join("\n");
}

// The dynamic transcript tool's values: the same data the library's player
// payload carries, in the line format the class-sections mod's transcript_tool
// view parses (see the mod header). Cues keep their speaker (shortened to the
// given name here) and their times; the pipe and the newline never appear in
// a cue's text, so the line format stays parseable.
function transcriptToolContent(values) {
  const lines = [
    "@video cs-class-video",
    `@duration ${values.recording.duration}`,
    ...values.speakers.map((s) => `@speaker ${givenName(s.name)}|${Math.round(s.seconds)}|${s.cues}`),
  ];
  for (const seg of values.segments) {
    lines.push(`# ${seg.name} | ${seg.start}-${seg.end}`);
  }
  const sorted = [...values.transcript].sort((a, b) => a.start - b.start);
  for (const cue of sorted) {
    const text = String(cue.text ?? "").replaceAll("|", "/").replaceAll(/\s*\n\s*/g, " ").trim();
    lines.push(`${cue.start}|${cue.end}|${givenName(cue.speaker)}|${text}`);
  }
  return lines.join("\n");
}

function whatThisClassAddsContent(values) {
  const intro =
    "<p>Every class opens with check-in, bow-in and stretching and closes with a bow-out. " +
    `The <a href="${LIBRARY_BASE}/classes/backbone" target="_blank" rel="noopener">class backbone</a> is the same every time. ` +
    "This is what <strong>this</strong> class does with the rest of the hour:</p>";
  const items = values.segments
    .map(
      (seg) =>
        `<li style="margin:.18rem 0"><a href="${LIBRARY_BASE}/classes/${RECORDING_ID}?t=${Math.round(seg.start)}" target="_blank" rel="noopener">${esc(seg.name)}</a>` +
        ` <span class="muted" style="font-size:.85rem">· ${fmtTs(seg.start)}-${fmtTs(seg.end)} · ${seg.momentCount ?? ""}</span></li>`,
    )
    .join("\n");
  const note =
    '<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">Moment counts per section, from the library\'s index: ' +
    values.segments.map((s) => `${fmtTs(s.start)}-${fmtTs(s.end)}: ${s.momentCount}`).join(", ") + '.</p>';
  return [intro, `<ul style="margin:.1rem 0 .2rem;padding-left:1.1rem">${items}</ul>`, note].join("\n");
}

// The handbook excerpt beside the class: the quote, its attribution, and the
// link to the whole handbook page, the same information and affordances the
// library's handbook carries for this teaching.
function handbookExcerptContent() {
  return [
    `<blockquote style="margin:.2rem 0 .4rem;padding:.35rem .9rem;border-left:3px solid #d8d2c4;color:#3a372f"><p style="margin:.1rem 0">${esc(HANDBOOK.quote)}</p></blockquote>`,
    `<p class="muted" style="font-size:.85rem;margin:.1rem 0">${esc(HANDBOOK.attribution)}</p>`,
    `<p style="font-size:.9rem;margin:.2rem 0">The whole page lives in the library's handbook: <a href="${LIBRARY_BASE}${HANDBOOK.path}" target="_blank" rel="noopener">${esc(HANDBOOK.page)}</a>.</p>`,
  ].join("\n");
}

// The concept strip, the library's two-door pill: the left half searches the
// concept across every class in the library (with its moment count); the
// right half says how many moments of THIS class carry it. The right half's
// per-class browse link needs the library's tag ids, which the values
// snapshot does not carry, so it renders as the count alone (recorded in the
// receipt's parityWalk).
function conceptsContent(values) {
  const pills = (values.concepts ?? [])
    .map(
      (t) =>
        `<span style="display:inline-flex;white-space:nowrap;margin:0 .5rem .45rem 0;vertical-align:middle">` +
        `<a href="${LIBRARY_BASE}/search?mode=semantic&q=${encodeURIComponent(t.label)}" target="_blank" rel="noopener" ` +
        `style="display:inline-block;border-radius:999px 0 0 999px;border:1px solid #9aa7b2;border-right:0;margin-right:0;padding:.24rem .65rem .24rem .75rem;text-decoration:none;color:inherit">` +
        `${esc(t.label)}<span style="font-size:.72rem;color:#5a6570"> ${esc(String(t.nAll))}</span></a>` +
        `<span style="display:inline-block;border-radius:0 999px 999px 0;border:1px solid #9aa7b2;padding:.24rem .65rem .24rem .6rem;font-size:.72rem;background:#f6f3ec">in this class · ${esc(String(t.nInClass))}</span></span>`,
    )
    .join("\n");
  return [
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">The concepts this class teaches, with how many moments carry each across every class in the library, and how many in this class. The name searches the concept across the whole library.</p>',
    pills || '<p class="muted">Concept tagging has not reached this class yet.</p>',
  ].join("\n");
}

function libraryRowContent(values) {
  // the copied summaryHtml carries a stray trailing close tag from the page
  // it was copied off; in an uncleaned HTML card it would close whatever div
  // is open when it renders (it broke the two-column grid on the first
  // build), so it goes
  const summary = values.summaryHtml.replace(/<\/div>\s*$/, "");
  return [
    summary,
    `<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">${esc(values.summaryNote)}</p>`,
    `<p class="muted" style="font-size:.85rem;margin:.1rem 0">On the live page this row is the library's own view of the class: <a href="${LIBRARY_BASE}/classes/${RECORDING_ID}" target="_blank" rel="noopener">the class page in the library</a>.</p>`,
  ].join("\n");
}

// Related classes: the other recorded classes that live in this deck as pages
// of their own, then the library's own class index for the rest of the corpus.
function relatedClassesContent() {
  const items = SIBLING_CARDS.map(
    (name) =>
      `<li style="margin:.18rem 0"><a href="/${encodeURIComponent(name)}">${esc(name.replace("Class ", "Class "))}</a>` +
      ` <span class="muted" style="font-size:.85rem">a recorded class of this deck, as a card tree like this one</span></li>`,
  ).join("\n");
  return [
    '<p style="margin:.1rem 0 .4rem">More classes, at parity with the library\'s class index:</p>',
    `<ul style="margin:.1rem 0 .5rem;padding-left:1.1rem">${items}</ul>`,
    `<p style="margin:.1rem 0">Every other class in the corpus: <a href="${LIBRARY_BASE}/classes" target="_blank" rel="noopener">the library's class index</a>.</p>`,
  ].join("\n");
}

function commentsContent() {
  return [
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">Comments here are written by members of the dojo. They are neither Brandon nor the library.</p>',
    "<p class=\"muted\">No comments yet. Have a question about a moment? Comments, likes, and reports are open to members on the library's class page.</p>",
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0">The real state, copied: this class has zero visible comments in the library today. Posting lives in the library; this card shows the section as decko card content.</p>',
  ].join("\n");
}

// The two-column grid, the source's own shape (the library class page's
// .duo: one 58% column and its sibling at 1100px and wider, one stacked
// column below). The theater toggle mirrors the source's Expand player
// button: the media column takes the full row for a watch.
function classCardContent() {
  const duoCss = [
    "<style>",
    ".cs-duo{display:grid;grid-template-columns:1fr;gap:0 1.2rem;align-items:start}",
    ".cs-duo-col{min-width:0}",
    "@media (min-width:1100px){.cs-duo{grid-template-columns:58% 1fr}.cs-duo.cs-theater{grid-template-columns:1fr}}",
    // the deck's dark skin paints links white, which vanishes inside the
    // light accordion bodies the sections render in; the same scoped rule
    // the library-inside snapshot carries
    ".class-section .accordion-body a:not(.btn){color:#1a4f8a;text-decoration:underline}",
    ".class-section .accordion-body a.muted{color:#5a6570;text-decoration:none}",
    "</style>",
  ].join("\n");
  const theaterScript = [
    "<script>",
    "(function () {",
    "  var b = document.getElementById('cs-duo-theater');",
    "  var duo = document.querySelector('.cs-duo');",
    "  if (!b || !duo) return;",
    "  b.addEventListener('click', function () {",
    "    var on = duo.classList.toggle('cs-theater');",
    "    b.textContent = on ? 'Two columns' : 'Expand player';",
    "  });",
    "})();",
    "<" + "/script>",
  ].join("\n");
  return [
    `<h1 style="margin:0 0 .15rem">Foundational square breathing and unclenched breath holds</h1>`,
    `<p class="muted" style="margin:.1rem 0">Wednesday · 2026-04-01 · 63 min · auto-detected · proposed name ` +
      `<button type="button" id="cs-duo-theater" style="font:inherit;font-size:.78rem;padding:.12rem .6rem;border:1px solid #9aa7b2;border-radius:4px;background:#fff;color:#1c2733;cursor:pointer;margin-left:.4rem">Expand player</button></p>`,
    '<p style="margin:.4rem 0 .6rem">Every section of the library\'s class page for this class, as a subcard of this one, laid out as the library lays it out: the video column and the transcript/chapters column side by side, one column when the window is narrow. The transcript is the library\'s dynamic tool, not a wall of text: chapters beside the pane, a chapter click moves both, the spoken line stays lit.</p>',
    duoCss,
    '<div class="cs-duo">',
    '<div class="cs-duo-col cs-duo-media">',
    `{{${CLASS_CARD}+Video Player|class_player}}`,
    `{{${CLASS_CARD}+What This Class Adds|section_accordion}}`,
    `{{${CLASS_CARD}+Handbook Excerpt|section_accordion}}`,
    `{{${CLASS_CARD}+Library Row|section_accordion}}`,
    "</div>",
    '<div class="cs-duo-col cs-duo-side">',
    `{{${CLASS_CARD}+Transcript|transcript_tool}}`,
    `{{${CLASS_CARD}+Moment Index|moment_index}}`,
    `{{${CLASS_CARD}+Concepts|section_accordion}}`,
    `{{${CLASS_CARD}+Comments|section_accordion}}`,
    `{{${CLASS_CARD}+Related Classes|section_accordion}}`,
    "</div>",
    "</div>",
    `{{${CLASS_CARD}+Page Bundle|page_bundle}}`,
    theaterScript,
  ].join("\n");
}

function pageBundleContent() {
  return "Loads the deck's own compiled asset bundles from this host's /files routes, rendered by the class-sections mod's page_bundle view. The deck's stored asset URLs name the production storage host, which does not resolve on this machine; the local routes carry the same bytes, and with them the engine's accordion toggles work.";
}

// --- the write path ----------------------------------------------------------

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, values: DEFAULT_VALUES, bunnyMap: DEFAULT_BUNNY_MAP, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--values": args.values = resolve(value); i += 1; break;
      case "--bunny-map": args.bunnyMap = resolve(value); i += 1; break;
      case "--library-base": args.libraryBase = value.replace(/\/+$/, ""); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      default:
        console.error(`build-class-cards: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.libraryBase) LIBRARY_BASE = args.libraryBase;

if (!existsSync(args.credentials)) {
  console.error(`build-class-cards: no credentials file at ${args.credentials}`);
  process.exit(2);
}
if (!existsSync(args.values)) {
  console.error(`build-class-cards: no values snapshot at ${args.values}`);
  process.exit(2);
}

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));
const values = JSON.parse(readFileSync(args.values, "utf8"));
// The Bunny values are optional: a map that names this recording's stream
// turns the Video Player card into the real embedded player.
const bunnyMapPath = args.bunnyMap;
const bunnyMap = existsSync(bunnyMapPath) ? JSON.parse(readFileSync(bunnyMapPath, "utf8")) : null;
const bunny =
  bunnyMap && bunnyMap.recordingId === RECORDING_ID
    ? { original: bunnyMap.original ?? "", poster: bunnyMap.poster ?? "" }
    : null;
if (bunnyMap && !bunny) {
  console.error(`build-class-cards: bunny map at ${bunnyMapPath} names ${bunnyMap.recordingId ?? "(nothing)"}, not ${RECORDING_ID}; ignoring it`);
}

// moment counts per segment (which segments own which moments), so the
// what-this-class-adds list carries the same counts the library prints.
for (const seg of values.segments) {
  seg.momentCount = values.moments.filter((m) => m.start >= seg.start - 0.01 && m.start <= seg.end + 0.01).length;
}

let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Origin", args.baseUrl);
  if (cookie !== "") headers.set("Cookie", cookie);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${args.baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie !== null) cookie = setCookie.split(";")[0];
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text, bytes: Buffer.byteLength(text) };
}

const cardPath = (name) => `/${encodeURIComponent(name)}`;

const steps = [];
function record(name, ok, detail, evidence) {
  steps.push({ name, ok, detail, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  return ok;
}

async function writeCard(name, content, type = "HTML") {
  const existing = await request(`${cardPath(name)}.json`);
  const path = existing.status === 200 ? cardPath(name) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const body = { card: { name, content } };
  if (type !== undefined) body.card.type = type;
  const res = await request(path, { method, body: JSON.stringify(body) });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  const readBack = ok ? await request(`${cardPath(name)}.json`) : null;
  return { ok, method, path, status: res.status, readBack, errorBody: ok ? "" : res.body.slice(0, 400) };
}

// Seat the card's read rule ("Anyone") through the write path - the deck's
// own rule mechanism, the same shape the front door used for layouts
// (<card>+*self+*layout). A write-path-created card defaults to read =
// "Anyone Signed In"; a demo the operator opens signed out needs the rule.
//
// THE RULE IS VERIFIED BEHAVIORALLY, not assumed: a card created and ruled
// within the same server boot can leave the rule unresolved (measured
// 2026-10-26: the deck answered 403 signed out while the rule card read
// "Anyone"; a content-changing rewrite of the rule re-binds it). So after
// the write, the card is fetched signed out; anything but 200 runs the
// repair cycle (Anyone Signed In, then Anyone) and probes again. A rule
// that still denies fails the build.
async function signedOutStatus(name) {
  const res = await fetch(`${args.baseUrl}${cardPath(name)}`, { redirect: "manual" });
  return res.status;
}

async function openRead(name) {
  const rule = `${name}+*self+*read`;
  const w = await writeCard(rule, "Anyone", undefined);
  let publicStatus = await signedOutStatus(name);
  let repaired = false;
  if (publicStatus !== 200) {
    await writeCard(rule, "Anyone Signed In", undefined);
    await writeCard(rule, "Anyone", undefined);
    publicStatus = await signedOutStatus(name);
    repaired = true;
  }
  return { ok: w.ok && publicStatus === 200, status: w.status, publicStatus, repaired, readStatus: w.readBack?.status ?? null, errorBody: w.errorBody };
}

// ── 1. sign in ───────────────────────────────────────────────────────────────
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, { status: res.status });
  if (cookie === "") {
    console.error("build-class-cards: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

// ── 2. the section cards ─────────────────────────────────────────────────────
const inventory = [];
const SECTIONS = [
  { name: `${CLASS_CARD}+Video Player`, view: "class_player", content: videoPlayerContent(bunny) },
  { name: `${CLASS_CARD}+Transcript`, view: "transcript_tool", content: transcriptToolContent(values) },
  { name: `${CLASS_CARD}+Moment Index`, view: "moment_index", content: momentIndexContent(values) },
  { name: `${CLASS_CARD}+What This Class Adds`, view: undefined, content: whatThisClassAddsContent(values) },
  { name: `${CLASS_CARD}+Handbook Excerpt`, view: undefined, content: handbookExcerptContent() },
  { name: `${CLASS_CARD}+Concepts`, view: undefined, content: conceptsContent(values) },
  { name: `${CLASS_CARD}+Library Row`, view: undefined, content: libraryRowContent(values) },
  { name: `${CLASS_CARD}+Related Classes`, view: undefined, content: relatedClassesContent() },
  { name: `${CLASS_CARD}+Comments`, view: undefined, content: commentsContent() },
  { name: `${CLASS_CARD}+Page Bundle`, view: "page_bundle", content: pageBundleContent() },
];

for (const section of SECTIONS) {
  if (args.dryRun) {
    console.log(`would write: ${section.name} (HTML, ${section.content.length} chars${section.view ? `, nest view |${section.view}` : ""})`);
    continue;
  }
  const w = await writeCard(section.name, section.content);
  const read = await openRead(section.name);
  const stored = w.readBack?.status === 200 ? w.readBack.body : "";
  const readType = stored ? (JSON.parse(stored).type_name ?? "?") : "-";
  record(
    `card: ${section.name}`,
    w.ok && read.ok && readType === "HTML" && read.publicStatus === 200,
    `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes, type ${readType}; rule -> ${read.status}, signed out -> ${read.publicStatus}${read.repaired ? " (rule re-bound by the repair cycle)" : ""}`,
    { status: w.status, readStatus: w.readBack?.status ?? null, readType, readRuleStatus: read.status, publicStatus: read.publicStatus, repaired: read.repaired, error: w.errorBody || read.errorBody },
  );
  inventory.push({ name: section.name, role: "section", type: readType, nestView: section.view ?? null, status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
}

// ── 3. the class card, the two-column page nesting every section ─────────────
if (!args.dryRun) {
  const w = await writeCard(CLASS_CARD, classCardContent());
  const read = await openRead(CLASS_CARD);
  record(
    `card: ${CLASS_CARD}`,
    w.ok && read.ok,
    `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes; read rule -> ${read.status}`,
    { status: w.status, readStatus: w.readBack?.status ?? null, readRuleStatus: read.status, error: w.errorBody || read.errorBody },
  );
  inventory.push({ name: CLASS_CARD, role: "class card", status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
}

// ── 4. read the page back through the engine ────────────────────────────────
if (!args.dryRun) {
  const pageRes = await request(cardPath(CLASS_CARD));
  const body = pageRes.body;
  const chipCount = (body.match(/class="cs-spk-chip/g) ?? []).length;
  const chapterCount = (body.match(/data-cs-chapter-start="/g) ?? []).length;
  const turnCount = (body.match(/class="cs-turn"/g) ?? []).length;
  const accordionCount = (body.match(/<div class="accordion-item class-section"/g) ?? []).length;
  const checks = {
    videoEmbedPresent: body.includes('id="cs-class-video"') && body.includes("/original"),
    twoColumns: body.includes('class="cs-duo"') && body.includes("58% 1fr") && body.includes("cs-duo-media") && body.includes("cs-duo-side"),
    gridIntact: body.includes("uke/partner safety.</p>") && !body.includes("partner safety.</p></div>"),
    theaterToggle: body.includes('id="cs-duo-theater"') && body.includes("cs-theater"),
    toolPresent: body.includes("cs-ttool-chapters") && body.includes("cs-ttool-turns") && body.includes("cs-ttool-now-val"),
    toolChapters: chapterCount === values.segments.length,
    toolChips: chipCount === 1 + values.speakers.length,
    toolTurns: turnCount >= 50,
    toolScript: body.includes("csClassPlayerSeek") && body.includes("timeupdate"),
    momentSeeksPlayer: body.includes("data-cs-seek") && body.includes("csClassPlayerSeek"),
    momentRowPresent: body.includes("window-0000 - opening breath drill"),
    segmentRowPresent: body.includes("The class, section by section"),
    handbookPresent: body.includes("There are no contests in the Art of Peace") && body.includes("/wiki/about-aikido"),
    conceptsPresent: body.includes("in this class · 6") && body.includes("/search?mode=semantic"),
    libraryRowPresent: body.toLowerCase().includes("the library wrote this description"),
    relatedPresent: body.includes(encodeURIComponent(SIBLING_CARDS[0])) && body.includes(encodeURIComponent(SIBLING_CARDS[1])) && body.includes(`${LIBRARY_BASE}/classes`),
    commentsPresent: body.includes("No comments yet"),
    speakersNamed: body.includes(">Brandon</strong>") && body.includes(">Ash</strong>") && body.includes(">Julian</strong>"),
    accordionsPresent: accordionCount === 9,
    bundleLoaded: body.includes("/files/~45514/0000000001.css") && body.includes("/files/~50617/0000000002.js"),
    framePolicyNotVisible: !/>[^<]*frame-ancestors/.test(body),
  };
  const allOk = pageRes.status === 200 && Object.values(checks).every(Boolean);
  record("page: class card page renders every element at parity", allOk, `GET ${cardPath(CLASS_CARD)} -> ${pageRes.status}, ${pageRes.bytes} bytes; ${turnCount} turns, ${chapterCount} chapter rows, ${chipCount} chips, ${accordionCount} accordion sections`, { status: pageRes.status, checks });
  inventory.push({ name: `page ${CLASS_CARD}`, role: "page check", checks, status: pageRes.status, bytes: pageRes.bytes });

  // the visitor's check: the SAME page fetched signed out must carry the
  // same nine sections (the admin session above can read sections whose
  // public rule silently failed - this one cannot)
  const anonRes = await fetch(`${args.baseUrl}${cardPath(CLASS_CARD)}`, { headers: { "user-agent": "build-class-cards signed-out check" } });
  const anonBody = await anonRes.text();
  const anonAccordionCount = (anonBody.match(/<div class="accordion-item class-section"/g) ?? []).length;
  const anonChecks = {
    status200: anonRes.status === 200,
    nineSections: anonAccordionCount === 9,
    conceptsPill: anonBody.includes("in this class · 6"),
    relatedLinks: anonBody.includes(encodeURIComponent(SIBLING_CARDS[0])) && anonBody.includes(encodeURIComponent(SIBLING_CARDS[1])),
    handbook: anonBody.includes("There are no contests in the Art of Peace"),
    toolTurns: (anonBody.match(/class="cs-turn"/g) ?? []).length >= 50,
    twoColumns: anonBody.includes('class="cs-duo"') && anonBody.includes("cs-duo-side"),
  };
  record("page: the signed-out page carries the same nine sections", Object.values(anonChecks).every(Boolean), `GET signed out -> ${anonRes.status}, ${anonAccordionCount} accordion sections`, { status: anonRes.status, anonChecks });
  inventory.push({ name: `page ${CLASS_CARD} (signed out)`, role: "signed-out page check", checks: anonChecks, status: anonRes.status });
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  libraryBase: LIBRARY_BASE,
  classCard: CLASS_CARD,
  valuesSnapshot: args.values,
  layout: "two columns at 1100px and wider (the media column 58%, the transcript/chapters column beside it), one stacked column below; the theater toggle stretches the media column",
  parityWalk: {
    "title (h1, day, duration, proposed-name badge)": "the class card's own header block",
    "the video itself (the recording, play and seek)": "the Video Player card's class_player view: the real Bunny stream in a <video> element, the moment and chapter rows seek it",
    "speakers (the inventory with speaking time, the filter)": "the transcript tool's chip row: one chip per speaker with its total speaking time, click filters the turns",
    "chapters (the named segments)": "the tool's chapter list beside the pane; each chapter seeks the video and moves the transcript; the What This Class Adds card lists them with moment counts",
    "moments (the moment cut, dots, timestamps)": "the Moment Index card's moment_index view: every row carries its dot, timestamp and the seek affordance",
    "transcript (the dynamic tool, not a wall of text)": "the Transcript card's transcript_tool view: turns grouped by speaker, timestamp and copy buttons, the follow highlight while the video plays",
    "handbook excerpt": "the Handbook Excerpt card: the quote, the attribution, the link to the whole handbook page",
    "related classes": "the Related Classes card: the sibling recorded classes of this deck, then the library's class index",
    "concepts strip": "the Concepts card: the library's two-door pill, the name searching the library-wide semantic search, the in-this-class count",
    "library-written summary row": "the Library Row card",
    comments: "the Comments card (the real state copied: zero visible comments; posting lives in the library)",
    "deliberately left out: the Ask Brandon card": "it posts questions to the library's live community API; the demo copies values, not live posting",
    "deliberately left out: the comments form, likes and reports": "posting lives in the library; the demo carries the honest pointer to it",
    "deliberately left out: drag-to-reorder and Reset card order": "the library's page chrome for its own card list; the decko card system is this demo's own argument",
    "deliberately left out: the concept pill's right-hand browse link": "the per-class browse link needs the library's tag ids, which the values snapshot does not carry; the count and the library-wide search door are present",
    "deliberately left out: the cut-the-blank-space skip checkbox": "it couples playback to the entitlement-gated player in the library; the demo's player is the copied stream, and the filter chip stays",
    "deliberately left out: entitlement captions (preview caps, sign-in pitches)": "entitlements live in the library; the demo renders one honest caption on the player card",
  },
  cards: inventory,
  passed: steps.length - failed.length,
  total: steps.length,
  steps,
};
if (!args.dryRun) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(receipt, null, 2) + "\n");
  console.log("");
  console.log(`${receipt.passed}/${receipt.total} checks passed`);
  console.log(`receipt: ${args.out}`);
}
process.exit(failed.length === 0 ? 0 : 1);
