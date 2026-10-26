#!/usr/bin/env node
// build-directions-b.mjs: build two front-door directions as real cards in the
// running demo deck (127.0.0.1:3118), through the engine's own write path.
//
//   node scripts/frontdoor-directions-b/build-directions-b.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// Everything is created with the same POST / and PUT /<card> calls the
// signed-in editor uses, so the cards land with the engine's own actions,
// references and nest closure. Nothing is poked into the database.
//
// The two directions (tmp/fleet-standing-queue/briefs/frontdoor-directions-b.md):
//
//   Direction 1, "Product grid": a storefront of the product lines, each a
//   visually self-contained tile with its own accent, its one-line pitch and
//   one door. Cards: Culturesmith+Product Grid Door plus four tile cards,
//   seated by the per-card layout rule on the Product Grid Layout card.
//
//   Direction 2, "Three doors, almost nothing": the radical minimum. The
//   three ways to be here (Guest, Member, Student) as three huge calm cards
//   on an otherwise empty page. Cards: Culturesmith+Three Doors plus three
//   door cards, seated by the per-card layout rule on the Three Doors Layout.
//
// SKIN MECHANISM (same mechanism the deck's own front door uses):
// a Layout-type card holds the page shell and the skin's stylesheet, and the
// per-card rule "<door>+*self+*layout" binds the door card to it, so GET
// /<door> renders the whole page through the engine. Both skins keep the
// site's real chrome: {{:header|core}} (the deck's own navbar) and
// {{:footer|content}} (the deck's own footer). Every style selector is
// prefixed (pgd-, td-) so no other page is touched and the deck-wide CSS
// card is never edited.
//
// THE LANDING PAGE IS NOT TOUCHED. Other front-door lanes build in this same
// deck and Home is shared; seating a direction on Home is one PUT once a
// direction is picked, and it is deliberately left out of this build.
//
// Wording sources: the framing line is the deck's own (Culturesmith+Front
// Door); the Library pitch is the deck's own Student Door line; the training
// pitch compresses the Conflict Done Well card's own text; the certification
// names are the zero-friction ones; Guardians of Peace is framed as a
// community standard, not a product. English only, no em-dashes, no family
// name, no secrets. Nothing here deploys anywhere and nothing outside the
// loopback address is contacted.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS =
  "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_OUT = join(repoRoot, "tmp", "frontdoor-directions-b-20261026", "build-receipt.json");

const GRID_DOOR = "Culturesmith+Product Grid Door";
const GRID_LAYOUT = "Product Grid Layout";
const THREE_DOORS = "Culturesmith+Three Doors";
const THREE_LAYOUT = "Three Doors Layout";

// ---------------------------------------------------------------------------
// Direction 1: the Product Grid skin.
// Four tiles, four accents: Library (deep blue), Conflict Done Well training
// (vermilion), Certification (amber), Guardians of Peace (green). Explicit
// background and text colors are set together on every element so the page
// keeps its contrast under a browser's forced dark mode.
// ---------------------------------------------------------------------------
const GRID_LAYOUT_CONTENT = [
  "<style>",
  "/* Product Grid skin. Scoped to pgd- classes inside .pgd-main; no other",
  "   page and no deck-wide card is touched. */",
  ".pgd-main { background: #f7f5f1; color: #26221c; padding-bottom: 4rem; }",
  ".pgd-head { max-width: 1100px; margin: 0 auto; padding: 3rem 1.25rem 0; text-align: center; }",
  ".pgd-kicker { font-size: .8rem; letter-spacing: .22em; text-transform: uppercase; color: #8a8071; margin: 0 0 .9rem; }",
  ".pgd-headline { font-size: 1.65rem; line-height: 1.4; font-weight: 300; color: #26221c; margin: 0; }",
  ".pgd-grid { max-width: 1240px; margin: 2.6rem auto 0; padding: 0 1.25rem; display: grid;",
  "  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 1.4rem; }",
  ".pgd-tile { background: #ffffff; color: #26221c; border: 1px solid #e4dfd6; border-top: 4px solid var(--pgd-accent, #26221c);",
  "  border-radius: 10px; padding: 1.7rem 1.5rem 1.6rem; display: flex; flex-direction: column; align-items: flex-start; }",
  ".pgd-tile-icon { color: var(--pgd-accent, #26221c); }",
  ".pgd-tile-icon .material-icons { font-size: 2.6rem; }",
  ".pgd-eyebrow { font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: #8a8071; margin: 1rem 0 .25rem; }",
  ".pgd-name { font-size: 1.35rem; font-weight: 600; color: #26221c; margin: 0 0 .5rem; }",
  ".pgd-pitch { font-size: .98rem; line-height: 1.55; color: #4a443a; margin: 0 0 1.4rem; }",
  ".pgd-door-btn { margin-top: auto; display: inline-block; background: var(--pgd-accent, #26221c); color: #ffffff !important;",
  "  font-size: .92rem; font-weight: 600; padding: .55rem 1.1rem; border-radius: 999px; text-decoration: none; }",
  ".pgd-door-btn:hover { filter: brightness(1.08); color: #ffffff; text-decoration: none; }",
  ".pgd-library { --pgd-accent: #14567f; }",
  ".pgd-training { --pgd-accent: #b0431f; }",
  ".pgd-certification { --pgd-accent: #a07310; }",
  ".pgd-guardians { --pgd-accent: #2e6b34; }",
  ".pgd-note { max-width: 900px; margin: 2.4rem auto 0; padding: 0 1.25rem; font-size: .82rem; line-height: 1.6; color: #8a8071; text-align: center; }",
  "</style>",
  '<body class="d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="pgd-main flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

const tile = (cls, icon, eyebrow, name, pitch, doorHref, doorLabel) =>
  [
    `<div class="pgd-tile ${cls}">`,
    `  <div class="pgd-tile-icon"><span class="material-icons">${icon}</span></div>`,
    `  <div class="pgd-eyebrow">${eyebrow}</div>`,
    `  <h3 class="pgd-name">${name}</h3>`,
    `  <p class="pgd-pitch">${pitch}</p>`,
    `  <a class="pgd-door-btn" href="${doorHref}">${doorLabel}</a>`,
    `</div>`,
  ].join("\n");

const GRID_DOOR_CONTENT = [
  '<div class="pgd-head">',
  '  <p class="pgd-kicker">Culturesmith</p>',
  "  <h2 class=\"pgd-headline\">All of business and life is a sea of conflict. Most organizations improvise. We give them a jumpstart.</h2>",
  "</div>",
  '<div class="pgd-grid">',
  `{{${GRID_DOOR}+Library Tile}}`,
  `{{${GRID_DOOR}+Training Tile}}`,
  `{{${GRID_DOOR}+Certification Tile}}`,
  `{{${GRID_DOOR}+Guardians Tile}}`,
  "</div>",
  '<p class="pgd-note">One of two front-door directions built as real cards in this deck. The tile marks are the engine\'s own icon font, not photography: the deck holds no product imagery yet. The Guardians of Peace page exists here and is still empty, so its door opens a page held ready for the proposal text.</p>',
].join("\n");

const GRID_CARDS = [
  {
    name: `${GRID_DOOR}+Library Tile`,
    role: "direction 1 tile: the recorded classes",
    content: tile(
      "pgd-library",
      "play_circle_filled",
      "The recorded classes",
      "The Library",
      "Every recorded class, searchable, with the handbook alongside.",
      "https://culturesmith-library.bunny.run",
      "Enter the Library",
    ),
  },
  {
    name: `${GRID_DOOR}+Training Tile`,
    role: "direction 1 tile: Conflict Done Well training",
    content: tile(
      "pgd-training",
      "sports_martial_arts",
      "For teams and organizations",
      "Conflict Done Well",
      "Improved conflict skills mean more effective teamwork and creative problem-solving, for individuals and groups.",
      "/Conflict_Done_Well",
      "See the training",
    ),
  },
  {
    name: `${GRID_DOOR}+Certification Tile`,
    role: "direction 1 tile: the certification names",
    content: tile(
      "pgd-certification",
      "verified_user",
      "For practitioners and organizations",
      "Certification",
      "Peace Practices Approved marks the organization; Conflict Done Well Certified marks the practitioner.",
      "/Make_Contact",
      "Start with a conversation",
    ),
  },
  {
    name: `${GRID_DOOR}+Guardians Tile`,
    role: "direction 1 tile: the community standard",
    content: tile(
      "pgd-guardians",
      "groups",
      "A community standard",
      "Guardians of Peace",
      "An open proposal to the world, not a product: the standard the certification names descend from.",
      "/Guardians_of_Peace",
      "Read the proposal",
    ),
  },
];

// ---------------------------------------------------------------------------
// Direction 2: the Three Doors skin.
// An almost empty page. Three huge calm cards, one sentence each, serif
// display type, no imagery anywhere. Explicit color pairs everywhere so the
// page keeps its contrast under a browser's forced dark mode.
// ---------------------------------------------------------------------------
const THREE_LAYOUT_CONTENT = [
  "<style>",
  "/* Three Doors skin. Scoped to td- classes inside .td-main; no other page",
  "   and no deck-wide card is touched. */",
  ".td-main { background: #fbfaf7; color: #29241d; }",
  ".td-stage { max-width: 1240px; margin: 0 auto; padding: 4.5rem 2rem 5.5rem; }",
  ".td-kicker { text-align: center; font-size: .8rem; letter-spacing: .3em; text-transform: uppercase; color: #96896f; margin: 0 0 1rem; }",
  ".td-line { text-align: center; font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;",
  "  font-size: 2.4rem; font-weight: 400; color: #29241d; margin: 0; }",
  ".td-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3rem; margin-top: 4rem; }",
  "@media (max-width: 900px) { .td-cards { grid-template-columns: 1fr; gap: 2.5rem; } }",
  ".td-door { border-top: 2px solid #d9d2c2; padding-top: 1.7rem; }",
  ".td-num { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 1rem; color: #96896f; margin: 0 0 .4rem; }",
  ".td-name { font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;",
  "  font-size: 3rem; font-weight: 400; line-height: 1.1; color: #29241d; margin: 0 0 .2rem; }",
  ".td-world { font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #96896f; margin: 0 0 1.1rem; }",
  ".td-sentence { font-size: 1.08rem; line-height: 1.65; color: #45403a; margin: 0 0 1.6rem; max-width: 30ch; }",
  ".td-link { font-size: .95rem; font-weight: 600; color: #7a4a12 !important; text-decoration: none;",
  "  border-bottom: 2px solid #d9c49a; padding-bottom: .15rem; }",
  ".td-link:hover { color: #5c370d; border-bottom-color: #7a4a12; text-decoration: none; }",
  ".td-note { margin: 4.5rem auto 0; max-width: 720px; text-align: center; font-size: .82rem; line-height: 1.6; color: #96896f; }",
  "</style>",
  '<body class="d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="td-main flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

const doorCard = (num, name, world, sentence, href, label) =>
  [
    `<div class="td-door">`,
    `  <p class="td-num">${num}</p>`,
    `  <h3 class="td-name">${name}</h3>`,
    `  <p class="td-world">${world}</p>`,
    `  <p class="td-sentence">${sentence}</p>`,
    `  <a class="td-link" href="${href}">${label}</a>`,
    `</div>`,
  ].join("\n");

const THREE_DOORS_CONTENT = [
  '<div class="td-stage">',
  '  <p class="td-kicker">Culturesmith</p>',
  '  <p class="td-line">Three ways to be here.</p>',
  '<div class="td-cards">',
  `{{${THREE_DOORS}+Guest Door}}`,
  `{{${THREE_DOORS}+Member Door}}`,
  `{{${THREE_DOORS}+Student Door}}`,
  "</div>",
  '<p class="td-note">One of two front-door directions built as real cards in this deck. There is nothing else on the page on purpose: the three doors point at real places in the deck and the working library.</p>',
  "</div>",
].join("\n");

const THREE_CARDS = [
  {
    name: `${THREE_DOORS}+Guest Door`,
    role: "direction 2 door: guest, practice",
    content: doorCard(
      "One",
      "Guest",
      "practice",
      "Come watch a class or join one, and try the first practice for yourself.",
      "/Make_Contact",
      "Make contact",
    ),
  },
  {
    name: `${THREE_DOORS}+Member Door`,
    role: "direction 2 door: member, team",
    content: doorCard(
      "Two",
      "Member",
      "team",
      "Bring the practice to your team, school, or organization.",
      "/Conflict_Done_Well",
      "Bring it to your team",
    ),
  },
  {
    name: `${THREE_DOORS}+Student Door`,
    role: "direction 2 door: student, library",
    content: doorCard(
      "Three",
      "Student",
      "library",
      "The Library holds every recorded class, searchable, with the handbook alongside.",
      "https://culturesmith-library.bunny.run",
      "Enter the Library",
    ),
  },
];

// The whole build, in write order: layouts first (a rule may name its layout
// the moment the rule lands), then doors and their children, then the rules
// that seat each door in its layout.
//
// Doors and their pieces are HTML-type cards: the engine's HTML type stores
// raw HTML (content-clean.ts NO_CLEAN_TYPE_CODENAMES; the deck's own *footer
// card is HTML type), so the skin's class hooks survive the save. A
// RichText save strips every class except the deprecated w- allowance, which
// the first build run proved on these exact cards.
const LAYOUTS = [
  { name: GRID_LAYOUT, role: "direction 1 layout: the Product Grid skin", content: GRID_LAYOUT_CONTENT },
  { name: THREE_LAYOUT, role: "direction 2 layout: the Three Doors skin", content: THREE_LAYOUT_CONTENT },
];

const DOORS = [
  { name: GRID_DOOR, role: "direction 1 door: the landing card a visitor meets", content: GRID_DOOR_CONTENT },
  ...GRID_CARDS,
  { name: THREE_DOORS, role: "direction 2 door: the landing card a visitor meets", content: THREE_DOORS_CONTENT },
  ...THREE_CARDS,
];

const RULES = [
  { name: `${GRID_DOOR}+*self+*layout`, role: "seats direction 1 on its layout", content: GRID_LAYOUT },
  { name: `${THREE_DOORS}+*self+*layout`, role: "seats direction 2 on its layout", content: THREE_LAYOUT },
];

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      case "--help":
        console.log(
          "build-directions-b: build the two front-door directions as real cards\n" +
          "  --base-url <url>       the running deck (default http://127.0.0.1:3118)\n" +
          "  --credentials <file>   the deck owner's credentials file\n" +
          "  --out <file>           receipt path (default tmp/frontdoor-directions-b-20261026/build-receipt.json)\n" +
          "  --dry-run              print the plan, write nothing",
        );
        process.exit(0);
        break;
      default:
        console.error(`build-directions-b: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.credentials)) {
  console.error(
    `build-directions-b: no credentials file at ${args.credentials}\n` +
      "  The demo scratch copy seeds it: node scripts/demo-scratch-copy/build-demo-deck.mjs",
  );
  process.exit(2);
}

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));

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

async function writeCard(card, type) {
  const existing = await request(`${cardPath(card.name)}.json`);
  const path = existing.status === 200 ? cardPath(card.name) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const body = { card: { name: card.name, content: card.content } };
  if (type) body.card.type = type;
  const res = await request(path, { method, body: JSON.stringify(body) });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  const readBack = ok ? await request(`${cardPath(card.name)}.json`) : null;
  const readJson = readBack?.status === 200 ? JSON.parse(readBack.body) : {};
  const stored = readJson?.db_content ?? "";
  const storedType = readJson?.type_name ?? "";
  const firstTextLine = card.content
    .split("\n")
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .find((line) => line.length > 0) ?? "";
  const probe = firstTextLine.slice(0, 40);
  const written = stored.includes(probe);
  const firstClass = card.content.match(/class="([^"]+)"/)?.[1];
  const classesKept = firstClass === undefined || stored.includes(firstClass);
  const typeKept = type === undefined || storedType === type;
  return { ok: ok && written && classesKept && typeKept, method, path, status: res.status, readStatus: readBack?.status ?? null, readBytes: readBack?.bytes ?? 0, storedType, written, classesKept, typeKept };
}

// 1. sign in
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, { status: res.status });
  if (cookie === "") {
    console.error("build-directions-b: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

const inventory = [];

// 2. the layouts
for (const layout of LAYOUTS) {
  if (args.dryRun) { console.log(`would write layout: ${layout.name}`); continue; }
  const result = await writeCard(layout, "Layout");
  record(`layout: ${layout.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: layout.name, role: layout.role, ...result });
}

// 3. the doors and their children (HTML type, so the classes survive the save)
for (const card of DOORS) {
  if (args.dryRun) { console.log(`would write: ${card.name}`); continue; }
  const result = await writeCard(card, "HTML");
  record(`card: ${card.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: card.name, role: card.role, ...result });
}

// 4. the seating rules
for (const rule of RULES) {
  if (args.dryRun) { console.log(`would write rule: ${rule.name}`); continue; }
  const result = await writeCard(rule);
  record(`rule: ${rule.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: rule.name, role: rule.role, ...result });
}

// 5. read each door back through the engine, through its own layout, and
// confirm the landing page carries neither direction (this build never PUTs
// Home; other front-door lanes share that card)
const views = [];
if (!args.dryRun) {
  const homeRes = await request(`${cardPath("Home")}.json`);
  const homeContent = homeRes.status === 200 ? JSON.parse(homeRes.body)?.db_content ?? "" : "";
  const homeClean = !homeContent.includes(GRID_DOOR) && !homeContent.includes(THREE_DOORS);
  record(
    "landing: Home untouched",
    homeRes.status === 200 && homeClean,
    `GET /Home -> ${homeRes.status}, neither direction nested ${homeClean}`,
    { status: homeRes.status, homeClean },
  );
  views.push({ path: "/Home", status: homeRes.status, homeUntouched: homeClean });

  for (const door of [GRID_DOOR, THREE_DOORS]) {
    const res = await request(cardPath(door));
    const usesGrid = door === GRID_DOOR;
    const marker = usesGrid ? "pgd-main" : "td-main";
    const layoutLive = res.body.includes(marker);
    record(`view: ${door}`, res.status === 200 && layoutLive, `GET ${cardPath(door)} -> ${res.status}, ${res.bytes} bytes, skin live ${layoutLive}`, { status: res.status, bytes: res.bytes, skinLive: layoutLive });
    views.push({ path: cardPath(door), status: res.status, bytes: res.bytes, skinLive: layoutLive });
  }
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  directions: {
    productGrid: { door: GRID_DOOR, layout: GRID_LAYOUT, url: `${args.baseUrl}/${encodeURIComponent(GRID_DOOR)}` },
    threeDoors: { door: THREE_DOORS, layout: THREE_LAYOUT, url: `${args.baseUrl}/${encodeURIComponent(THREE_DOORS)}` },
  },
  homeCard: "not touched (shared with the other front-door lanes; seating a picked direction on Home is one PUT)",  cards: inventory,
  views,
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
