#!/usr/bin/env node
// build-class-cards.mjs: build the class page as a decko CARD TREE in the
// running demo scratch deck.
//
//   node scripts/class-as-cards/build-class-cards.mjs
//     [--base-url http://127.0.0.1:3117]
//     [--credentials <file>]
//     [--values <class-values.json>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// The operator's question: the library's class page has a section per thing
// it shows (video player, library access, transcript, moment index, what
// this class adds, the library row, comments) - shouldn't each of those be
// a subcard, all laid out inside decko's own system? This script builds that
// page for ONE class (GMT20260401-212639_Recording) as real cards through
// the engine's own write path (POST / and PUT /<card>, the same calls the
// signed-in editor makes), so the cards land with the engine's actions,
// references and nest closure.
//
// The tree:
//
//   Class GMT20260401-212639                  (Basic; the class card)
//     +Video Player         (Basic; rendered by the mod's class_player view)
//     +Transcript           (Basic; speaker-attributed text)
//     +Moment Index         (Basic; rendered by the mod's moment_index view)
//     +What This Class Adds (Basic)
//     +Library Row          (Basic)
//     +Comments             (Basic)
//
// The class card's nests select the two mod views in the nest syntax
// ({{<card>|class_player}}, {{<card>|moment_index}}). A mod's set module
// binds through a card's CODENAME (Ruby's module_key rule), which a
// write-path-created cardtype does not carry - so the mod ships ANCHORLESS
// all-set views (docs/mod-dsl.md's word-count shape) instead of cardtype
// sets, and the deck stays plain Basic cards.
//
// The values (transcript text, moments, segment names, summary, the player
// URL) are COPIES of the library's own data for this class, snapshotted into
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

const DEFAULT_BASE_URL = "http://127.0.0.1:3117";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_VALUES = join(repoRoot, "tmp", "class-as-cards-20261025", "class-values.json");
const DEFAULT_OUT = join(repoRoot, "tmp", "class-as-cards-20261025", "class-cards-build-receipt.json");

const LIBRARY_BASE = "http://127.0.0.1:8899";
const RECORDING_ID = "GMT20260401-212639_Recording";
const CLASS_CARD = `Class ${RECORDING_ID.replace("_Recording", "")}`;
const PLAYER_URL = `${LIBRARY_BASE}/player/${RECORDING_ID}?embed=1&compact=1`;
const COMPARISON_CARD = "Class As Cards Demo";

// Speaker names in the transcript data carry family names; the demo renders
// given names only. The mapping is by the full names the data carries.
const GIVEN_NAMES = new Map([
  ["Brandon Williamscraig", "Brandon"],
  ["Ash Morgan", "Ash"],
  ["Julian Wilner", "Julian"],
]);

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

function videoPlayerContent() {
  return PLAYER_URL;
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

function transcriptContent(values) {
  const head =
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">' +
    `Transcript, by speaker: ${values.transcript.length} cues, ` +
    `${values.speakers.length} speakers ` +
    `(${values.speakers.map((s) => GIVEN_NAMES.get(s.name) ?? s.name).join(", ")}). ` +
    "Speaker names are shortened to given names here. The live library keeps transcript text behind its player; this card holds the text the library's own data carries for this class.</p>";
  const parts = [head];
  let run = null;
  const flush = () => {
    if (!run) return;
    parts.push(
      `<p style="margin:.45rem 0"><strong>${esc(GIVEN_NAMES.get(run.speaker) ?? run.speaker)}</strong> ` +
        `<span style="font-family:ui-monospace,monospace;font-size:.78rem;color:#5a6570">${fmtTs(run.start)}</span><br>` +
        `${esc(run.texts.join(" "))}</p>`,
    );
    run = null;
  };
  for (const cue of values.transcript) {
    if (run && run.speaker === cue.speaker) {
      run.texts.push(cue.text);
      run.end = cue.end;
    } else {
      flush();
      run = { speaker: cue.speaker, start: cue.start, end: cue.end, texts: [cue.text] };
    }
  }
  flush();
  return parts.join("\n");
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
        ` <span class="muted" style="font-size:.85rem">· ${fmtTs(seg.start)}–${fmtTs(seg.end)} · ${seg.momentCount ?? ""}</span></li>`,
    )
    .join("\n");
  const note =
    '<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">Moment counts per section, from the library\'s index: ' +
    values.segments.map((s) => `${fmtTs(s.start)}–${fmtTs(s.end)}: ${s.momentCount}`).join(", ") + '.</p>';
  return [intro, `<ul style="margin:.1rem 0 .2rem;padding-left:1.1rem">${items}</ul>`, note].join("\n");
}

function libraryRowContent(values) {
  return [
    values.summaryHtml,
    `<p class="muted" style="font-size:.85rem;margin:.35rem 0 .1rem">${esc(values.summaryNote)}</p>`,
    `<p class="muted" style="font-size:.85rem;margin:.1rem 0">On the live page this row is the library's own view of the class: <a href="${LIBRARY_BASE}/classes/${RECORDING_ID}" target="_blank" rel="noopener">the class page in the library</a>.</p>`,
  ].join("\n");
}

function commentsContent() {
  return [
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">Comments here are written by members of the dojo. They are neither Brandon nor the library.</p>',
    "<p class=\"muted\">No comments yet. Have a question about a moment? Comments, likes, and reports are open to members on the library's class page.</p>",
    '<p class="muted" style="font-size:.85rem;margin:.1rem 0">The real state, copied: this class has zero visible comments in the library today. Posting lives in the library; this card shows the section as decko card content.</p>',
  ].join("\n");
}

function classCardContent(values) {
  return [
    `<h1 style="margin:0 0 .15rem">${esc(values.title.h1)}</h1>`,
    `<p class="muted" style="margin:.1rem 0">${esc(values.title.meta)} · auto-detected · proposed name</p>`,
    '<p style="margin:.4rem 0 .6rem">Every section of the library\'s class page for this class, as a subcard of this one. Each subcard renders through the deck-local <code>class-sections</code> mod\'s accordion views, so a section expands and collapses; the player and moment index bodies are the mod\'s, the rest are the subcards\' own content.</p>',
    `{{${CLASS_CARD}+Video Player|class_player}}`,
    `{{${CLASS_CARD}+Transcript|section_accordion}}`,
    `{{${CLASS_CARD}+Moment Index|moment_index}}`,
    `{{${CLASS_CARD}+What This Class Adds|section_accordion}}`,
    `{{${CLASS_CARD}+Library Row|section_accordion}}`,
    `{{${CLASS_CARD}+Comments|section_accordion}}`,
    `{{${CLASS_CARD}+Page Bundle|page_bundle}}`,
  ].join("\n");
}

function pageBundleContent() {
  return "Loads the deck's own compiled asset bundles from this host's /files routes, rendered by the class-sections mod's page_bundle view. The deck's stored asset URLs name the production storage host, which does not resolve on this machine; the local routes carry the same bytes, and with them the engine's accordion toggles work.";
}

// --- the write path ----------------------------------------------------------

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, values: DEFAULT_VALUES, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--values": args.values = resolve(value); i += 1; break;
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

async function writeCard(name, content, type) {
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
async function openRead(name) {
  const rule = `${name}+*self+*read`;
  const w = await writeCard(rule, "Anyone");
  return { ok: w.ok, status: w.status, readStatus: w.readBack?.status ?? null, errorBody: w.errorBody };
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
  { name: `${CLASS_CARD}+Video Player`, view: "class_player", content: videoPlayerContent() },
  { name: `${CLASS_CARD}+Transcript`, view: undefined, content: transcriptContent(values) },
  { name: `${CLASS_CARD}+Moment Index`, view: "moment_index", content: momentIndexContent(values) },
  { name: `${CLASS_CARD}+What This Class Adds`, view: undefined, content: whatThisClassAddsContent(values) },
  { name: `${CLASS_CARD}+Library Row`, view: undefined, content: libraryRowContent(values) },
  { name: `${CLASS_CARD}+Comments`, view: undefined, content: commentsContent() },
  { name: `${CLASS_CARD}+Page Bundle`, view: "page_bundle", content: pageBundleContent() },
];

for (const section of SECTIONS) {
  if (args.dryRun) {
    console.log(`would write: ${section.name} (Basic, ${section.content.length} chars${section.view ? `, nest view |${section.view}` : ""})`);
    continue;
  }
  const w = await writeCard(section.name, section.content);
  const read = await openRead(section.name);
  const stored = w.readBack?.status === 200 ? w.readBack.body : "";
  const readType = stored ? (JSON.parse(stored).type_name ?? "?") : "-";
  // the deck's own default type for a write-path-created card here is
  // RichText (the seed deck's default); the demo needs no specific type.
  record(
    `card: ${section.name}`,
    w.ok && read.ok && ["Basic", "RichText"].includes(readType),
    `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes, type ${readType}; read rule -> ${read.status}`,
    { status: w.status, readStatus: w.readBack?.status ?? null, readType, readRuleStatus: read.status, error: w.errorBody || read.errorBody },
  );
  inventory.push({ name: section.name, role: "section", type: readType, nestView: section.view ?? null, status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
}

// ── 3. the class card, nesting every section ─────────────────────────────────
if (!args.dryRun) {
  const w = await writeCard(CLASS_CARD, classCardContent(values));
  const read = await openRead(CLASS_CARD);
  record(
    `card: ${CLASS_CARD}`,
    w.ok && read.ok,
    `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes; read rule -> ${read.status}`,
    { status: w.status, readStatus: w.readBack?.status ?? null, readRuleStatus: read.status, error: w.errorBody || read.errorBody },
  );
  inventory.push({ name: CLASS_CARD, role: "class card", status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
}

// ── 4. the side-by-side comparison page ─────────────────────────────────────
if (!args.dryRun) {
  // A Basic card's content cannot carry an iframe (the engine strips iframe
  // tags from content), so the panels card carries the two URLs and the
  // demo card nests it through the mod's side_by_side view, whose output
  // renders the iframe row.
  const panelsContent = `left: ${LIBRARY_BASE}/classes/${RECORDING_ID}\nright: /${encodeURIComponent(CLASS_CARD)}`;
  const panels = await writeCard(`${COMPARISON_CARD}+Panels`, panelsContent);
  const panelsRead = await openRead(`${COMPARISON_CARD}+Panels`);
  record(
    `card: ${COMPARISON_CARD}+Panels`,
    panels.ok && panelsRead.ok,
    `${panels.method} ${panels.path} -> ${panels.status}; read back ${panels.readBack?.status ?? "-"}; read rule -> ${panelsRead.status}`,
    { status: panels.status, readStatus: panels.readBack?.status ?? null, readRuleStatus: panelsRead.status, error: panels.errorBody || panelsRead.errorBody },
  );
  inventory.push({ name: `${COMPARISON_CARD}+Panels`, role: "side-by-side panels", status: panels.status, readStatus: panels.readBack?.status ?? null, bytes: panels.readBack?.bytes ?? 0 });

  const comparisonContent = [
    '<h1 style="margin:0 0 .2rem">The class page, two ways</h1>',
    '<p style="margin:.1rem 0 .6rem">Left: the library\'s class page as it serves today ' +
    `(<a href="${LIBRARY_BASE}/classes/${RECORDING_ID}">${LIBRARY_BASE}/classes/${RECORDING_ID}</a>). ` +
    'Right: the same class as a decko card tree ' +
    `(<a href="/${encodeURIComponent(CLASS_CARD)}">/${CLASS_CARD}</a>), ` +
    'every section a subcard of the class card. Two sections render through the deck-local <code>class-sections</code> mod\'s views; the rest are plain card content.</p>',
    `{{${COMPARISON_CARD}+Panels|side_by_side}}`,
  ].join("\n");
  const w = await writeCard(COMPARISON_CARD, comparisonContent);
  const compRead = await openRead(COMPARISON_CARD);
  record(
    `card: ${COMPARISON_CARD}`,
    w.ok && compRead.ok,
    `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes; read rule -> ${compRead.status}`,
    { status: w.status, readStatus: w.readBack?.status ?? null, readRuleStatus: compRead.status, error: w.errorBody || compRead.errorBody },
  );
  inventory.push({ name: COMPARISON_CARD, role: "side-by-side", status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });

  const compRes = await request(cardPath(COMPARISON_CARD));
  const body = compRes.body;
  const checks = {
    deckoIframe: (body.match(/<iframe/g) ?? []).length === 1,
    libraryLink: body.includes(LIBRARY_BASE) || body.includes(LIBRARY_BASE.replaceAll("&", "&amp;")),
    flexRow: body.includes("class-side-by-side"),
    framePolicyNote: body.includes("frame-ancestors"),
  };
  record("page: comparison renders both sides", compRes.status === 200 && Object.values(checks).every(Boolean), `GET ${cardPath(COMPARISON_CARD)} -> ${compRes.status}, ${compRes.bytes} bytes`, { status: compRes.status, checks });
}

// ── 5. read the page back through the engine ────────────────────────────────
if (!args.dryRun) {
  const pageRes = await request(cardPath(CLASS_CARD));
  const body = pageRes.body;
  const checks = {
    playLinkPresent: body.includes("Play this class") && (body.includes("/player/GMT20260401-212639_Recording") || body.includes("/player/GMT20260401-212639_Recording".replaceAll("&", "&amp;"))),
    transcriptSpeakers: body.includes(">Brandon</strong>") && body.includes(">Ash</strong>") && body.includes(">Julian</strong>"),
    segmentRowPresent: body.includes("The class, section by section"),
    momentRowPresent: body.includes("window-0000 - opening breath drill"),
    libraryRowPresent: body.toLowerCase().includes("the library wrote this description"),
    commentsPresent: body.includes("No comments yet"),
    accordionsPresent: (body.match(/<div class="accordion-item class-section"/g) ?? []).length === 6,
    bundleLoaded: body.includes("/files/~45514/0000000001.css") && body.includes("/files/~50617/0000000002.js"),
  };
  const allOk = pageRes.status === 200 && Object.values(checks).every(Boolean);
  record("page: class card page renders every section", allOk, `GET ${cardPath(CLASS_CARD)} -> ${pageRes.status}, ${pageRes.bytes} bytes`, { status: pageRes.status, checks });
  inventory.push({ name: `page ${CLASS_CARD}`, role: "page check", checks, status: pageRes.status, bytes: pageRes.bytes });
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  classCard: CLASS_CARD,
  valuesSnapshot: args.values,
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
