#!/usr/bin/env node
// build-class-cards.mjs: build EVERY mapped class page as a decko CARD TREE in
// the running demo scratch deck, at parity with the library it came from.
//
//   node scripts/class-as-cards/build-class-cards.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--values-dir <dir>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// THE PAGES (the library-finish lane, 2026-10-26): EVERY playable stem the
// library's media table maps - 79 of them - becomes a class page through this
// one builder, published afterwards under the demos zone's dated key. The
// builder loops; nothing is done by hand. Each page carries the same shape
// the library's own class page has: two columns (the video column and the
// transcript/chapters column beside it, collapsing narrow), the recording
// playing in the page in OUR player (the mod's class_player view: a native
// video element fed by the recording's stream, never a third-party embed
// iframe), the moments timeline drawn on the player where the library has
// moments, the dynamic transcript tool, the moments, the chapters. The class
// cards carry the class's REAL name - the same name the library's own class
// list shows (its proposedName ladder, snapshotted into the values files) -
// as their card name, the subcards' headings show only the subcard's own
// name (the class-sections mod's hide-the-parent-prefix heading), every page
// renders fully signed out, no section explains the demo, and no handbook
// excerpt is quoted: the library carries no class-to-handbook reference in
// its data (the tags are themes, the handbook's technique terms are not tags
// and carry no taggings), and the brief's rule is match or remove.
//
// The tree per class (the class card is named for the class's real name):
//
//   <Class name>             (HTML; two columns)
//     +Video Player          (HTML; rendered by the mod's class_player view,
//                             with the moments timeline on the player)
//     +Transcript            (HTML; rendered by the mod's transcript_tool view)
//     +Moment Index          (HTML; rendered by the mod's moment_index view)
//     +What This Class Adds  (HTML)
//     +Concepts              (HTML)
//     +About This Class      (HTML; the library's description of the class)
//     +Related Classes       (HTML)
//     +Comments              (HTML)
//     +Page Bundle           (HTML)
//
// A class the library holds no transcript, moments or summary for (60 of the
// 79) gets the SAME shape with honest empty states in the sections whose
// data does not exist - the sections say the library has not reached this
// class yet, and never pretend.
//
// Sections the older trees carried and this page does not nest - the
// handbook excerpt (removed per the match-or-remove rule above), the old
// static chapter and transcript dumps, the demo-disclosure cards ("What Is
// Real Here", "The Three Classes") - are EMPTIED and their read rules moved
// back to the signed-in default, so no published page and no signed-out URL
// serves them.
//
// The cards are HTML-type: the class card's own content carries the
// two-column grid and the small theater-toggle script, which the default
// content cleaner would strip out of a Basic card. The section bodies the
// mod views render are the mod's output and bypass cleaning either way.
//
// The values (transcript cues, moments, segments, summary, speaker totals,
// concepts, the player URL and the Bunny stream mapping) are COPIES of the
// library's own data, snapshotted read-only into one file per class under
// tmp/class-as-cards-20261025/ (snapshot-all-class-values.mjs in the
// brandonDojoTech library-finish lane folder wrote them, importing the
// library's own name, segment and concept computations). Nothing here reads
// the library at build time or at render time.
//
// Exit code 0 when every card was written, read back and probed signed out,
// 1 otherwise. Nothing here deploys anywhere and nothing outside the loopback
// address is contacted.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_VALUES_DIR = join(repoRoot, "tmp", "class-as-cards-20261025");
const DEFAULT_OUT = join(repoRoot, "tmp", "class-as-cards-20261025", "library-finish-build-receipt.json");

// Overridden by --library-base: the address card content names for the
// library. The default is the machine-local serving instance; a deck built
// for a hosted surface names that surface's library address instead.
let LIBRARY_BASE = "https://library.culturesmith.help";

// How many sibling classes the Related Classes section lists: the recorded
// classes nearest to this one by date (two before, two after), with the
// library's own class index carrying the rest of the corpus. Listing all 78
// siblings would bury the section; the nearest four are the classes a
// visitor most plausibly continues with.
const SIBLINGS_BEFORE = 2;
const SIBLINGS_AFTER = 2;

// Speaker names in the transcript data carry family names; the demo renders
// given names only. The mapping is by the full names the data carries; any
// other name renders its FIRST whitespace-delimited word (the given name),
// so no family name can reach a page through an unmapped speaker.
const GIVEN_NAMES = new Map([
  ["Brandon Williamscraig", "Brandon"],
  ["Ash Morgan", "Ash"],
  ["Julian Wilner", "Julian"],
]);
const givenName = (name) => GIVEN_NAMES.get(name) ?? String(name).trim().split(/\s+/)[0] ?? String(name);

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

function videoPlayerContent(values) {
  const recordingId = values.recording.id;
  const lines = [`${LIBRARY_BASE}/player/${recordingId}?embed=1&compact=1`];
  if (values.bunny?.original) lines.push(`@bunny ${values.bunny.original}`);
  if (values.bunny?.poster) lines.push(`@poster ${values.bunny.poster}`);
  // the moments timeline's data: the recording's length, then one line per
  // moment (the mod's class_player view parses this same line shape the
  // moment_index view parses)
  lines.push(`@duration ${values.recording.duration}`);
  for (const m of values.moments) {
    lines.push(`${m.start}|${m.end}|${m.title || "Moment"}|${m.color ?? ""}`);
  }
  return lines.join("\n");
}

function momentIndexContent(values) {
  const lines = [`@base ${LIBRARY_BASE}/classes/${values.recording.id}`];
  for (const seg of values.segments) {
    lines.push(`# ${seg.name} | ${seg.start}-${seg.end}`);
  }
  for (const m of values.moments) {
    lines.push(`${m.start}|${m.end}|${m.title}|${m.color ?? ""}`);
  }
  return lines.join("\n");
}

// The dynamic transcript tool's values: cues, speakers (shortened to given
// names), chapters. The pipe and the newline never appear in a cue's text,
// so the line format stays parseable.
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
    const text = String(cue.text ?? "").replaceAll("|", "/").replace(/\s*\n\s*/g, " ").trim();
    lines.push(`${cue.start}|${cue.end}|${givenName(cue.speaker)}|${text}`);
  }
  return lines.join("\n");
}

function whatThisClassAddsContent(values) {
  if (values.segments.length === 0) {
    return '<p class="muted">The library has not cut this class into sections yet. The recording plays in full on this page.</p>';
  }
  const intro =
    "<p>Every class opens with check-in, bow-in and stretching and closes with a bow-out. " +
    `The <a href="${LIBRARY_BASE}/classes/backbone" target="_blank" rel="noopener">class backbone</a> is the same every time. ` +
    "This is what <strong>this</strong> class does with the rest of the hour:</p>";
  const items = values.segments
    .map(
      (seg) =>
        `<li style="margin:.18rem 0"><a href="${LIBRARY_BASE}/classes/${values.recording.id}?t=${Math.round(seg.start)}" target="_blank" rel="noopener">${esc(seg.name)}</a>` +
        ` <span class="muted" style="font-size:.85rem">· ${fmtTs(seg.start)}-${fmtTs(seg.end)} · ${seg.momentCount ?? ""}</span></li>`,
    )
    .join("\n");
  const note =
    '<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">Moment counts per section, from the library\'s index: ' +
    values.segments.map((s) => `${fmtTs(s.start)}-${fmtTs(s.end)}: ${s.momentCount}`).join(", ") + '.</p>';
  return [intro, `<ul style="margin:.1rem 0 .2rem;padding-left:1.1rem">${items}</ul>`, note].join("\n");
}

// The concept strip, the library's two-door pill: the left half searches the
// concept across every class in the library (with its moment count); the
// right half says how many moments of THIS class carry it.
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

// The About This Class section's content: the library's description of the
// class, its drafting note, and the link to the class page in the library.
// The section card carried the internal name "+Library Row" (the row this
// content occupies in the library's own UI) and that internal name leaked
// as the visitor-facing accordion heading on every class page; the
// contrast lane of 2026-10-26 renamed the card to the visitor-facing
// "About This Class" and put the old cards on the retire list below.
function libraryRowContent(values) {
  // the copied summaryHtml carries a stray trailing close tag from the page
  // it was copied off; in an uncleaned HTML card it would close whatever div
  // is open when it renders (it broke the two-column grid on the first
  // build), so it goes
  const summary = values.summaryHtml.replace(/<\/div>\s*$/, "");
  if (!summary) {
    return [
      '<p class="muted">The library has not written a description for this class yet.</p>',
      `<p class="muted" style="font-size:.85rem;margin:.1rem 0">The class page in the library: <a href="${LIBRARY_BASE}/classes/${values.recording.id}" target="_blank" rel="noopener">${esc(values.recording.title)}</a>.</p>`,
    ].join("\n");
  }
  return [
    summary,
    `<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">${esc(values.summaryNote)}</p>`,
    `<p class="muted" style="font-size:.85rem;margin:.1rem 0">The class page in the library: <a href="${LIBRARY_BASE}/classes/${values.recording.id}" target="_blank" rel="noopener">${esc(values.recording.title)}</a>.</p>`,
  ].join("\n");
}

// Related classes: the recorded classes nearest this one by date (their
// pages are card trees like this one), then the library's own class index
// for the rest of the corpus. The static snapshot builder rewrites the
// sibling links to the published pages on the demos zone.
function relatedClassesContent(cls, allClasses) {
  const byDate = [...allClasses].sort((a, b) =>
    String(a.values.recording.date ?? "").localeCompare(String(b.values.recording.date ?? "")) ||
    String(a.id).localeCompare(String(b.id)),
  );
  const i = byDate.findIndex((c) => c.id === cls.id);
  const before = byDate.slice(Math.max(0, i - SIBLINGS_BEFORE), i);
  const after = byDate.slice(i + 1, i + 1 + SIBLINGS_AFTER);
  const siblings = [...before, ...after];
  const items = siblings
    .map(
      (sib) =>
        `<li style="margin:.18rem 0"><a href="/${encodeURIComponent(sib.cardName)}">${esc(sib.cardName)}</a>` +
        ` <span class="muted" style="font-size:.85rem">a recorded class of this deck</span></li>`,
    )
    .join("\n");
  return [
    '<p style="margin:.1rem 0 .4rem">More classes:</p>',
    `<ul style="margin:.1rem 0 .5rem;padding-left:1.1rem">${items}</ul>`,
    `<p style="margin:.1rem 0">Every other class in the corpus: <a href="${LIBRARY_BASE}/classes" target="_blank" rel="noopener">the library's class index</a>.</p>`,
  ].join("\n");
}

function commentsContent() {
  return [
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">Comments are written by members of the dojo.</p>',
    "<p class=\"muted\">No comments yet. Have a question about a moment? Comments, likes, and reports are open to members on the library's class page.</p>",
  ].join("\n");
}

// The two-column grid, the source's own shape (the library class page's
// .duo: one 58% column and its sibling at 1100px and wider, one stacked
// column below). The theater toggle stretches the media column for a watch.
// The page heading is the card's own name (the class's real name), so the
// content carries the byline only.
function classCardContent(cls, allClasses) {
  const values = cls.values;
  const byline = `${values.title.meta.replace(/\s+auto-detected.*$/i, "").trim()}`;
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
    // ink on the light panels (the class-page contrast fix, 2026-10-26):
    // the skin's body ink is #aaa, readable on the dark page background
    // but washed out on the white accordion bodies; the panels carry the
    // near-black primary ink and the muted role the readable secondary
    // ink (#5a6570, 5.9:1 on white). Same rules the class-sections mod
    // ships in its page bundle, so the page is right from either source.
    ".class-section > .accordion-header .accordion-button{color:#1c2733}",
    ".class-section .accordion-body{color:#1c2733}",
    ".class-section .accordion-body .muted{color:#5a6570}",
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
  const cc = cls.cardName;
  return [
    `<p class="muted" style="margin:.1rem 0">${esc(byline)}` +
      ` <button type="button" id="cs-duo-theater" style="font:inherit;font-size:.78rem;padding:.12rem .6rem;border:1px solid #9aa7b2;border-radius:4px;background:#fff;color:#1c2733;cursor:pointer;margin-left:.4rem">Expand player</button></p>`,
    duoCss,
    '<div class="cs-duo">',
    '<div class="cs-duo-col cs-duo-media">',
    `{{${cc}+Video Player|class_player}}`,
    `{{${cc}+What This Class Adds|section_accordion}}`,
    `{{${cc}+About This Class|section_accordion}}`,
    "</div>",
    '<div class="cs-duo-col cs-duo-side">',
    `{{${cc}+Transcript|transcript_tool}}`,
    `{{${cc}+Moment Index|moment_index}}`,
    `{{${cc}+Concepts|section_accordion}}`,
    `{{${cc}+Comments|section_accordion}}`,
    `{{${cc}+Related Classes|section_accordion}}`,
    "</div>",
    "</div>",
    `{{${cc}+Page Bundle|page_bundle}}`,
    theaterScript,
  ].join("\n");
}

function pageBundleContent() {
  return "Loads the deck's own compiled asset bundles from this host's /files routes, rendered by the class-sections mod's page_bundle view. The deck's stored asset URLs name the production storage host, which does not resolve on this machine; the local routes carry the same bytes, and with them the engine's accordion toggles work.";
}

// --- the write path ----------------------------------------------------------

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, valuesDir: DEFAULT_VALUES_DIR, out: DEFAULT_OUT, dryRun: false, verifyOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--values-dir": args.valuesDir = resolve(value); i += 1; break;
      case "--library-base": args.libraryBase = value.replace(/\/+$/, ""); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      // --verify-only: the cards are already written; re-probe every page
      // signed in and signed out and run every check, but skip the section
      // and class-card writes (the page probes and the retire pass still
      // run, so the verification is the full one, just without rewriting
      // 1600 cards whose bytes a previous run proved)
      case "--verify-only": args.verifyOnly = true; break;
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

// the classes: EVERY values snapshot in the values dir, one file per playable
// stem, ordered by recording date. The card name is the class's real name
// (title.h1), the same name the library's own class list shows.
const CLASSES = readdirSync(args.valuesDir)
  .filter((n) => /^class-values-GMT\d{8}-\d{6}\.json$/.test(n))
  .map((n) => {
    const id = n.match(/^class-values-(GMT\d{8}-\d{6})\.json$/)[1];
    const values = JSON.parse(readFileSync(join(args.valuesDir, n), "utf8"));
    if (values.recording.id !== `${id}_Recording`) {
      console.error(`build-class-cards: values at ${n} name ${values.recording.id}, expected ${id}_Recording`);
      process.exit(2);
    }
    return { id, values, cardName: values.title.h1 };
  })
  .sort((a, b) =>
    String(a.values.recording.date ?? "").localeCompare(String(b.values.recording.date ?? "")) ||
    a.id.localeCompare(b.id),
  );
if (CLASSES.length !== 79) {
  console.error(`build-class-cards: expected 79 class values files, found ${CLASSES.length}`);
  process.exit(2);
}
const nameSet = new Set();
for (const c of CLASSES) {
  if (nameSet.has(c.cardName)) {
    console.error(`build-class-cards: two classes carry the same name "${c.cardName}"; card names must be unique`);
    process.exit(2);
  }
  nameSet.add(c.cardName);
}
console.log(`classes: ${CLASSES.length} values snapshots, dates ${CLASSES[0].values.recording.date} to ${CLASSES[CLASSES.length - 1].values.recording.date}`);

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));

// moment counts per segment (which segments own which moments), so the
// what-this-class-adds list carries the same counts the library prints.
for (const cls of CLASSES) {
  for (const seg of cls.values.segments) {
    seg.momentCount = cls.values.moments.filter((m) => m.start >= seg.start - 0.01 && m.start <= seg.end + 0.01).length;
  }
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
// own rule mechanism. A write-path-created card defaults to read =
// "Anyone Signed In"; a demo the operator opens signed out needs the rule.
//
// THE RULE IS WRITTEN AS A LINK ITEM ("[[Anyone]]"), not bare text, and
// VERIFIED BEHAVIORALLY. The engine joins the readable-rule set to
// card_references (src/card/permissions/read-rules.ts:226): a rule card
// grants only the parties its content REFERENCES, and the write path's
// reference maintenance creates those rows from the content's link chunks -
// a rule value saved as bare text carries no reference rows, so the rule
// resolves for nobody at render time even though the card itself answers
// (decko-ts issue 33; re-measured 2026-10-26). The link-item form makes the
// save create the row and stores the same bare value (probed this lane: a
// rule saved as "[[Anyone]]" is stored as "Anyone" with the referee row
// anyone/L beside it). A card created and ruled within the same server boot
// can still leave the rule unresolved (measured 2026-10-26: the deck
// answered 403 signed out while the rule card read "Anyone"; a
// content-changing rewrite of the rule re-binds it). So after the write,
// the card is fetched signed out; anything but 200 runs the repair cycle
// (Anyone Signed In, then Anyone, both as link items) and probes again. A
// rule that still denies fails the build.
const RULE_ANYONE = "[[Anyone]]";
const RULE_SIGNED_IN = "[[Anyone Signed In]]";

async function signedOutStatus(name) {
  const res = await fetch(`${args.baseUrl}${cardPath(name)}`, { redirect: "manual" });
  return res.status;
}

async function openRead(name) {
  const rule = `${name}+*self+*read`;
  const w = await writeCard(rule, RULE_ANYONE, undefined);
  let publicStatus = await signedOutStatus(name);
  let repaired = false;
  if (publicStatus !== 200) {
    await writeCard(rule, RULE_SIGNED_IN, undefined);
    await writeCard(rule, RULE_ANYONE, undefined);
    publicStatus = await signedOutStatus(name);
    repaired = true;
  }
  return { ok: w.ok && publicStatus === 200, status: w.status, publicStatus, repaired, readStatus: w.readBack?.status ?? null, errorBody: w.errorBody };
}

// A card the rebuilt page does not nest: emptied and moved back to the
// signed-in default, so no published page and no signed-out URL serves it.
// THE DENY IS PROBED ON THE JSON ROUTE: a denied card's HTML answer is the
// site's chrome-only shell at 200 (measured this lane), so the status alone
// cannot tell a denial from a grant there; the .json route answers 403 for
// a denied card and 200 for a granted one. Verified both ways: the emptied
// read-back, and the signed-out .json probe NOT answering 200.
async function retireCard(name) {
  const w = await writeCard(name, `(this section is not part of the class page)`, "HTML");
  const rule = `${name}+*self+*read`;
  await writeCard(rule, RULE_SIGNED_IN, undefined);
  // the deny can bind a beat after the rule save (measured 2026-10-26: the
  // rule rows are correct immediately but the first signed-out probe can
  // still hit the pre-save answer), so the settled state is probed, not the
  // instant one: up to three probes, a beat apart, before the repair cycle.
  let anon = await signedOutStatus(`${name}.json`);
  for (let settle = 0; settle < 3 && anon === 200; settle += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    anon = await signedOutStatus(`${name}.json`);
  }
  if (anon === 200) {
    await writeCard(rule, RULE_ANYONE, undefined);
    await writeCard(rule, RULE_SIGNED_IN, undefined);
    anon = await signedOutStatus(`${name}.json`);
    for (let settle = 0; settle < 3 && anon === 200; settle += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      anon = await signedOutStatus(`${name}.json`);
    }
  }
  return { ok: w.ok && anon !== 200, status: w.status, anonStatus: anon, errorBody: w.ok ? "" : w.errorBody };
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

const inventory = [];

// ── 2. per class: the section cards, the class card, the checks ─────────────
for (const cls of CLASSES) {
  const cc = cls.cardName;
  const values = cls.values;
  const hasTranscript = values.transcript.length > 0;
  const hasMoments = values.moments.length > 0;
  const hasSummary = Boolean(values.summaryHtml);
  console.log(`\n=== ${cc} (${values.recording.id}) ===`);
  const SECTIONS = [
    { name: `${cc}+Video Player`, view: "class_player", content: videoPlayerContent(values) },
    { name: `${cc}+Transcript`, view: "transcript_tool", content: transcriptToolContent(values) },
    { name: `${cc}+Moment Index`, view: "moment_index", content: momentIndexContent(values) },
    { name: `${cc}+What This Class Adds`, view: undefined, content: whatThisClassAddsContent(values) },
    { name: `${cc}+Concepts`, view: undefined, content: conceptsContent(values) },
    { name: `${cc}+About This Class`, view: undefined, content: libraryRowContent(values) },
    { name: `${cc}+Related Classes`, view: undefined, content: relatedClassesContent(cls, CLASSES) },
    { name: `${cc}+Comments`, view: undefined, content: commentsContent() },
    { name: `${cc}+Page Bundle`, view: "page_bundle", content: pageBundleContent() },
  ];

  for (const section of SECTIONS) {
    if (args.dryRun) {
      console.log(`would write: ${section.name} (HTML, ${section.content.length} chars${section.view ? `, nest view |${section.view}` : ""})`);
      continue;
    }
    if (args.verifyOnly) {
      // the write pass already ran; probe the card's presence and its public
      // rule behaviorally, and check the stored type
      const stored = await request(`${cardPath(section.name)}.json`);
      const readType = stored.status === 200 ? (JSON.parse(stored.body).type_name ?? "?") : "-";
      const publicStatus = await signedOutStatus(section.name);
      record(
        `card: ${section.name}`,
        stored.status === 200 && readType === "HTML" && publicStatus === 200,
        `verify-only: read back ${stored.status}, type ${readType}; signed out -> ${publicStatus}`,
        { readStatus: stored.status, readType, publicStatus },
      );
      inventory.push({ name: section.name, role: "section", type: readType, nestView: section.view ?? null, status: null, readStatus: stored.status, bytes: stored.bytes });
      continue;
    }
    const w = await writeCard(section.name, section.content);
    const read = await openRead(section.name);
    const stored = w.readBack?.status === 200 ? w.readBack.body : "";
    const readType = stored ? (JSON.parse(stored).type_name ?? "?") : "-";
    record(
      `card: ${section.name}`,
      w.ok && read.ok && readType === "HTML" && read.publicStatus === 200,
      `${w.method} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes, type ${readType}; signed out -> ${read.publicStatus}${read.repaired ? " (rule re-bound by the repair cycle)" : ""}`,
      { status: w.status, readStatus: w.readBack?.status ?? null, readType, publicStatus: read.publicStatus, repaired: read.repaired, error: w.errorBody || read.errorBody },
    );
    inventory.push({ name: section.name, role: "section", type: readType, nestView: section.view ?? null, status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
  }

  if (!args.dryRun) {
    let w = { ok: true, status: null, readBack: null, errorBody: "" };
    let read = { ok: true, publicStatus: null, repaired: false };
    if (args.verifyOnly) {
      const stored = await request(`${cardPath(cc)}.json`);
      const publicStatus = await signedOutStatus(cc);
      w = { ok: stored.status === 200, status: null, readBack: stored, errorBody: "" };
      read = { ok: stored.status === 200 && publicStatus === 200, publicStatus, repaired: false };
      record(
        `card: ${cc}`,
        w.ok && read.ok,
        `verify-only: read back ${stored.status}, ${stored.bytes} bytes; signed out -> ${publicStatus}`,
        { readStatus: stored.status, publicStatus },
      );
    } else {
      w = await writeCard(cc, classCardContent(cls, CLASSES));
      read = await openRead(cc);
      record(
        `card: ${cc}`,
        w.ok && read.ok,
        `${w.method} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes; signed out -> ${read.publicStatus}`,
        { status: w.status, readStatus: w.readBack?.status ?? null, publicStatus: read.publicStatus, error: w.errorBody || read.errorBody },
      );
    }
    inventory.push({ name: cc, role: "class card", status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });

    // the page read back through the engine, signed in
    const pageRes = await request(cardPath(cc));
    const body = pageRes.body;
    const chipCount = (body.match(/class="cs-spk-chip/g) ?? []).length;
    const chapterCount = (body.match(/data-cs-chapter-start="/g) ?? []).length;
    const turnCount = (body.match(/class="cs-turn"/g) ?? []).length;
    const accordionCount = (body.match(/<div class="accordion-item class-section"/g) ?? []).length;
    const timelineBlocks = (body.match(/class="cs-tl-block"/g) ?? []).length;
    const siblingLinks = relatedSiblingsOf(cls, CLASSES).map((s) => encodeURIComponent(s.cardName));
    const checks = {
      status200: pageRes.status === 200,
      // the engine escapes the apostrophe in a title attribute, so the
      // expected heading attribute accepts either spelling
      pageHeadingIsTitle: body.includes(`<span class="card-title" title="${esc(cc)}">`) || body.includes(`<span class="card-title" title="${esc(cc).replaceAll("'", "&#39;")}">`),
      videoEmbedPresent: body.includes('id="cs-class-video"') && body.includes("/original"),
      twoColumns: body.includes('class="cs-duo"') && body.includes("58% 1fr") && body.includes("cs-duo-media") && body.includes("cs-duo-side"),
      theaterToggle: body.includes('id="cs-duo-theater"') && body.includes("cs-theater"),
      timelineOnPlayer: hasMoments
        ? body.includes("cs-timeline") && timelineBlocks === values.moments.length
        : !body.includes("cs-timeline"),
      toolPresent: !hasTranscript || (body.includes("cs-ttool-chapters") && body.includes("cs-ttool-turns") && body.includes("cs-ttool-now-val")),
      toolChapters: chapterCount === values.segments.length,
      toolChips: hasTranscript ? chipCount === 1 + values.speakers.length : chipCount === 0,
      // turns are folded runs of one speaker: a single-speaker class folds to
      // one turn, so the floor is one turn per transcript, never a ratio
      toolTurns: hasTranscript ? turnCount >= 1 && turnCount <= values.transcript.length : turnCount === 0,
      toolScript: !hasTranscript || (body.includes("csClassPlayerSeek") && body.includes("timeupdate")),
      momentSeeksPlayer: !hasMoments || (body.includes("data-cs-seek") && body.includes("csClassPlayerSeek")),
      noProposedName: !body.toLowerCase().includes("proposed name") && !body.includes("auto-detected"),
      noMetaCards: !/what is real here/i.test(body) && !/the three classes/i.test(body) && !/demo card/i.test(body) && !/what is a sketch/i.test(body),
      noHandbookSection: !body.includes("Handbook Excerpt") && !body.includes("There are no contests in the Art of Peace"),
      conceptsPresent: values.concepts.length === 0 || (body.includes("in this class ·") && body.includes("/search?mode=semantic")),
      aboutThisClassPresent: hasSummary ? body.toLowerCase().includes("the library wrote this description") : body.includes("has not written a description for this class yet"),
      relatedPresent: siblingLinks.every((s) => body.includes(s)) && body.includes(`${LIBRARY_BASE}/classes`),
      commentsPresent: body.includes("No comments yet"),
      speakersNamed: values.speakers.every((s) => body.includes(`>${givenName(s.name)}</strong>`)),
      headingsCarryNoParentPrefix: !/accordion-button[^>]*>\s*<strong>[^<]*\+/.test(body),
      noSignInPrompt: !/sign in at the library/i.test(body) && !/student feature/i.test(body),
      accordionsPresent: accordionCount === 8,
      // the internal section name must never reach a visitor: the old
      // "+Library Row" card name is retired on every page, so any
      // occurrence in the render is a leak, not a label
      noInternalSectionName: !body.includes("Library Row"),
      bundleLoaded: body.includes("/files/~45514/0000000001.css") && body.includes("/files/~50617/0000000002.js"),
    };
    const allOk = Object.values(checks).every(Boolean);
    record(
      `page: ${cc} renders every element at parity`,
      allOk,
      `GET signed in -> ${pageRes.status}, ${pageRes.bytes} bytes; ${turnCount} turns, ${chapterCount} chapter rows, ${chipCount} chips, ${timelineBlocks} timeline blocks, ${accordionCount} accordion sections`,
      { status: pageRes.status, checks },
    );
    inventory.push({ name: `page ${cc}`, role: "page check", checks, status: pageRes.status, bytes: pageRes.bytes });

    // the visitor's check: the SAME page fetched signed out must carry the
    // same eight sections (the admin session above can read sections whose
    // public rule silently failed - this one cannot)
    const anonRes = await fetch(`${args.baseUrl}${cardPath(cc)}`, { headers: { "user-agent": "build-class-cards signed-out check" } });
    const anonBody = await anonRes.text();
    const anonAccordionCount = (anonBody.match(/<div class="accordion-item class-section"/g) ?? []).length;
    const anonChecks = {
      status200: anonRes.status === 200,
      eightSections: anonAccordionCount === 8,
      twoColumns: anonBody.includes('class="cs-duo"') && anonBody.includes("cs-duo-side"),
      videoPresent: anonBody.includes('id="cs-class-video"'),
      timelineOnPlayer: hasMoments ? anonBody.includes("cs-timeline") : true,
      toolTurns: !hasTranscript || ((anonBody.match(/class="cs-turn"/g) ?? []).length >= 1),
      conceptsPill: values.concepts.length === 0 || anonBody.includes("in this class ·"),
      relatedLinks: siblingLinks.every((s) => anonBody.includes(s)),
      noMetaCards: !/what is real here/i.test(anonBody) && !/the three classes/i.test(anonBody),
      noProposedName: !anonBody.toLowerCase().includes("proposed name"),
      noSignInPrompt: !/sign in at the library/i.test(anonBody),
      noInternalSectionName: !anonBody.includes("Library Row"),
    };
    record(
      `page: ${cc} signed out carries the same eight sections`,
      Object.values(anonChecks).every(Boolean),
      `GET signed out -> ${anonRes.status}, ${anonAccordionCount} accordion sections`,
      { status: anonRes.status, anonChecks },
    );
    inventory.push({ name: `page ${cc} (signed out)`, role: "signed-out page check", checks: anonChecks, status: anonRes.status });

    // retire the sections the rebuilt page does not nest: the handbook
    // excerpt (no matching handbook reference exists for any class - the
    // library's tags are themes and the handbook's terms carry no taggings),
    // the old static chapter and transcript dumps, the demo-disclosure
    // cards, and the old internal "+Library Row" section name (renamed to
    // the visitor-facing "About This Class"; the renamed cards below empty
    // and deny every page's leftover, so no published page and no
    // signed-out URL serves the internal name). Verified: emptied
    // read-back, and the signed-out fetch denied.
    // The old static transcript dump needs no retirement: the engine
    // resolved this build's "+Transcript" writes onto the existing
    // "+Transcripts" card (measured: both names answer the same card), so
    // the tool's content REPLACED the dump on that card.
    const retired = [`${cc}+Handbook Excerpt`, `${cc}+Chapters`, `${cc}+What Is Real Here`, `${cc}+The Three Classes`, `${cc}+Moments`, `${cc}+Library Row`];
    for (const name of retired) {
      const probe = await request(`${cardPath(name)}.json`);
      if (probe.status !== 200) {
        record(`retire: ${name}`, true, `not present (HTTP ${probe.status}); nothing to retire`, { status: probe.status });
        continue;
      }
      const r = await retireCard(name);
      record(`retire: ${name}`, r.ok, `emptied (HTTP ${r.status}); signed out -> ${r.anonStatus} (denied)`, { status: r.status, anonStatus: r.anonStatus });
      inventory.push({ name, role: "retired section", status: r.status, anonStatus: r.anonStatus });
    }
  }
}

// the sibling classes a page's Related Classes section lists (the same
// computation the content builder runs, so the checks and the snapshot
// builder's link rewrite agree with the pages)
function relatedSiblingsOf(cls, allClasses) {
  const byDate = [...allClasses].sort((a, b) =>
    String(a.values.recording.date ?? "").localeCompare(String(b.values.recording.date ?? "")) ||
    String(a.id).localeCompare(String(b.id)),
  );
  const i = byDate.findIndex((c) => c.id === cls.id);
  return [...byDate.slice(Math.max(0, i - SIBLINGS_BEFORE), i), ...byDate.slice(i + 1, i + 1 + SIBLINGS_AFTER)];
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  libraryBase: LIBRARY_BASE,
  classes: CLASSES.map((c) => ({ id: c.id, cardName: c.cardName, valuesSnapshot: `class-values-${c.id}.json` })),
  layout: "two columns at 1100px and wider (the media column 58%, the transcript/chapters column beside it), one stacked column below; the theater toggle stretches the media column",
  player: "the mod's class_player view: a native video element fed by the recording's own stream URL, the moments timeline drawn on the player where the library holds moments (one colored block per moment, click seeks); never a third-party embed iframe",
  headings: "the class card carries the class's real name as its name (the page heading); the class-sections mod's accordion wrapper shows an embedded subcard's own name only, never the parent prefix (the deck's reusable hide-the-parent-prefix setting)",
  access: "every built card probed signed out; a rule that denies runs the repair cycle and a rule that still denies fails the build",
  emptyStates: "classes without transcript, moments or summary (the library has not reached them) carry the same shape with honest no-data lines; nothing pretends",
  handbook: "no class carries a handbook excerpt: the library's data holds no class-to-handbook reference (its tags are themes; the handbook's technique terms are not tags and carry no taggings), so the section is removed per the match-or-remove rule",
  retiredSections: "Handbook Excerpt, the old static Chapters and Transcripts dumps, What Is Real Here, The Three Classes, the old Moments tree, and the old internal +Library Row section name (renamed About This Class): emptied and moved back to the signed-in default, verified denied signed out",
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
