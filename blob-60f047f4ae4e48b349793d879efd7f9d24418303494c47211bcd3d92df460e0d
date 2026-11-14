#!/usr/bin/env node
// build-home-variants.mjs: build two home-page design variants as REAL CARDS
// in the running demo scratch deck, each a credible replacement for the live
// Culturesmith Home page.
//
//   node scripts/homepage-variants/build-home-variants.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--assets <dir>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// The live Home page (reference-live-home-signed-in.png, 2026-10-25 audit) is
// a dark slate page: top navbar, centered hero photo, a bold intro column, an
// italic proposals line with Make Contact, a subscribe/Zoom line, and a
// centered "Meet Brandon Williamscraig" block. Its content lives in this
// deck's own cards (HomeHTMLheader and the Home card in the source deck the
// demo scratch copy imports), so both variants carry the SAME content the
// live page serves, recomposed. Nothing here reads or writes the live site.
//
// The two variants, per the lane brief:
//
// - Variant A, "the same site, sharper": the live page's exact structure
//   (navbar chrome, centered hero, intro, proposals line, subscribe/Zoom,
//   meet-brandon) with the typography, spacing and hierarchy visibly better
//   made: a measured reading column, real line height, one accent rule per
//   section instead of full-width grey rules, emphasis carried by one strong
//   phrase instead of all-bold paragraphs, and a quiet warm accent for links.
//
// - Variant B, "the decko-native home": the same content recomposed as a
//   card composition the way decko renders - the hero as a full-width card,
//   the intro as a card, the three doors (practice / team / library) as
//   three cards in one grid row, the proposals line as a call-to-action
//   card, the connect line and the meet-brandon block as closing cards.
//   Every element on the page is a real card, styled by the variant's skin.
//
// HOW THE VARIANTS RENDER THROUGH THE ENGINE (no static mockups):
// - Every content card is written through the engine's own write path
//   (POST / and PUT /<card>, the same calls the signed-in editor makes).
// - Each variant seats its own page shell the way this deck seats every
//   view: a Layout card ("Home Variant X Layout") and the per-card layout
//   rule ("Culturesmith+Home Variant X+*self+*layout") - the same mechanism
//   as *all+*layout ("Default Layout") and the front door's layout.
// - The layout content carries the skin: a <link> to the deck's compiled
//   stylesheet served locally (/files/~45514/0000000001.css, 219,593 bytes,
//   byte-identical to vm-skin-compiled.css, sha256-pinned in the faithful
//   build receipt of 2026-10-26), the five chrome layout rules that pinned
//   compile predates (copied verbatim from the same receipt), the navbar
//   logo bytes as a data URI (the rendered logo src names a storage host
//   this machine cannot resolve), and the variant's own CSS in <style>.
//   Layout bodies pass raw HTML through (format.ts processLayoutContent
//   processes only nest/link chunks), so the skin reaches the wire.
// - Card content is sanitized by the engine (class attributes and frame
//   tags are stripped; inline styles and data-URI images survive - probed
//   before this build), so every card carries inline styles only, and the
//   per-card surfaces are styled from the layout CSS through the slot
//   wrappers' data-card-name attributes.
//
// Guards honored here: English only; no em-dashes or en-dashes anywhere;
// the page hides the one Opportunities menu item that carries a family
// surname (the faithful build's rule); "Brandon Williamscraig" appears only
// as the meet-brandon label the live page itself serves and the lane brief
// names; no secrets; nothing outside the loopback address is contacted by
// this script; nothing deploys.
//
// Exit code 0 when every card was written and read back and both variant
// pages render with their markers, 1 otherwise.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_ASSETS = join(repoRoot, "tmp", "homepage-variants-20261026", "assets");
const DEFAULT_OUT = join(repoRoot, "tmp", "homepage-variants-20261026", "home-variants-build-receipt.json");

const VA = "Culturesmith+Home Variant A";
const VB = "Culturesmith+Home Variant B";
const LAYOUT_A = "Home Variant A Layout";
const LAYOUT_B = "Home Variant B Layout";
const LIBRARY_URL = "https://culturesmith-library.bunny.run";
// The deck's compiled stylesheet from the local /files route (the route the
// class page's page_bundle view loads). Verified 200, 219,593 bytes.
const LOCAL_SKIN_HREF = "/files/~45514/0000000001.css";

// The five chrome layout rules the pinned skin compile predates, copied
// verbatim from the faithful build receipt (2026-10-26): without them the
// navbar wraps onto two rows and the search box sits at a third width.
const CHROME_PATCH = [
  ".d0-nav-container{flex-wrap:inherit;display:flex;width:100%;justify-content:space-between}",
  ".d0-search-box{width:100%}",
  ".search-box-nav{flex:1 0 50%}",
  ".search-box-nav .search-box-form{width:100%}",
  ".search-box-form{width:100%}",
].join("\n");

// Navbar logo: hide the unresolvable storage-host img, draw the pinned bytes
// (logo-3643-small.jpg, sha256 75bfba4d..., verified against the faithful
// receipt) as the brand link's own background.
const logoDataUri = (assets) =>
  `data:image/jpeg;base64,${readFileSync(join(assets, "logo-3643-small.jpg")).toString("base64")}`;
const heroDataUri = (assets) =>
  `data:image/jpeg;base64,${readFileSync(join(assets, "hero-27689-135167.jpg")).toString("base64")}`;

const NAV_CSS = (assets) => `/* chrome rules the pinned compile predates (faithful receipt 2026-10-26) */
${CHROME_PATCH}
/* the navbar logo bytes, embedded: the rendered src names a storage host this machine cannot resolve */
.nav-logo img{display:none}
.nav-logo::before{content:"";display:inline-block;width:90px;height:18px;vertical-align:middle;background:url(${logoDataUri(assets)}) left center/100% 100% no-repeat}
/* the Opportunities menu item that carries a family surname stays off this page (faithful build rule) */
.main-nav .dropdown-item[href="/Brandon_WilliamsCraig"]{display:none}`;

// --- variant A: the same site, sharper --------------------------------------

const HERO_IMG = (assets) =>
  `<p style="text-align:center;margin:0"><img src="${heroDataUri(assets)}" alt="A class in session: a circle of practitioners standing in the dojo" style="width:500px;max-width:100%;height:auto"></p>`;

const INTRO_HTML =
  "<p style=\"margin:0\">Culturesmith is a consultancy and online seminar devoted to building dynamic systems that live, learn, and work through conflict. Leaders and teams practice <strong>[[Conflict Done Well]]</strong> in order to become continually more effective. Individuals learn to understand the systems they live in, recover from trauma, and respond creatively to difference and stress.</p>";

const PROPOSALS_HTML =
  '<p style="margin:0"><em>We are accepting project proposals and new consulting clients at this time. Please <strong>[[Make Contact]]</strong>.</em></p>';

const CONNECT_HTML =
  "<p style=\"margin:0\">Please [[Subscribe_to_my_newsletter|subscribe to our email list]] and [[Conflict Done Well+Online Classes|Zoom classes]] to learn about others who are exploring this work.</p>";

const MEET_HTML = [
  '<p style="text-align:center;margin:0 0 .5rem">Meet <strong>[[Brandon WilliamsCraig|Brandon Williamscraig]]</strong></p>',
  '<p style="text-align:center;margin:0 0 .5rem">[[Recommendations]]</p>',
  '<p style="text-align:center;margin:0">[[About|Learn more...]]</p>',
].join("\n");

const variantACards = (assets) => [
  { name: `${VA}`, role: "variant A main card: nests the five sections in the live order", content: [
    `{{${VA}+Hero Photo|content}}`,
    `{{${VA}+Intro|content}}`,
    `{{${VA}+Proposals Line|content}}`,
    `{{${VA}+Connect Line|content}}`,
    `{{${VA}+Meet Brandon|content}}`,
  ].join("\n") },
  { name: `${VA}+Hero Photo`, role: "the live page's centered hero photo", content: HERO_IMG(assets) },
  { name: `${VA}+Intro`, role: "the live intro paragraph, emphasis carried by one strong phrase", content: INTRO_HTML },
  // "Proposals Line" and "Connect Line", not "+Proposals"/"+Connect": the engine
  // resolves a compound name by resolving its SIDES, so a right part named
  // "Proposals" or "Connect" binds the junction to this deck's legacy
  // "Proposal" (id 3652, shared with other pages) and "connect" (id 28400)
  // cards - the same trap the front-door build documented for "Methods".
  { name: `${VA}+Proposals Line`, role: "the live italic proposals line with Make Contact", content: PROPOSALS_HTML },
  { name: `${VA}+Connect Line`, role: "the live subscribe and Zoom classes line", content: CONNECT_HTML },
  { name: `${VA}+Meet Brandon`, role: "the live meet-brandon block with Recommendations and Learn more", content: MEET_HTML },
];

const variantALayout = (assets) => [
  `<link rel="stylesheet" href="${LOCAL_SKIN_HREF}">`,
  "<style>",
  NAV_CSS(assets),
  "/* variant A: the same site, sharper - measured column, real rhythm, one accent */",
  "body.cs-home-a article.container{max-width:62rem;padding:0 1.5rem}",
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]){position:relative;max-width:46rem;margin:0 auto;padding:2.6rem 1rem;text-align:center}`,
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]) p{margin:0;font-size:1.17rem;line-height:1.75;color:#c6cad0;font-weight:400}`,
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]) strong{color:#f4f5f6;font-weight:600}`,
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]) a{color:#d9b26a;text-decoration:underline;text-decoration-color:rgba(217,178,106,.4);text-underline-offset:3px}`,
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]) a:hover{text-decoration-color:#d9b26a}`,
  `body.cs-home-a article [data-card-name]:not([data-card-name="${VA}"]):not([data-card-name="${VA}+Hero Photo"])::before{content:"";display:block;width:64px;height:3px;margin:0 auto 2.2rem;border-radius:2px;background:linear-gradient(90deg,rgba(217,178,106,0),#d9b26a,rgba(217,178,106,0))}`,
  // the hero's own rule is excluded IN the painting selector above: a separate
  // display:none override loses the specificity fight once :not() raises the
  // painting rule above two attribute selectors
  `body.cs-home-a article [data-card-name="${VA}+Hero Photo"]{padding-top:2.9rem}`,
  `body.cs-home-a article [data-card-name="${VA}+Hero Photo"] img{border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06)}`,
  `body.cs-home-a article [data-card-name="${VA}+Intro"] p{font-size:1.22rem;line-height:1.8}`,
  `body.cs-home-a article [data-card-name="${VA}+Proposals Line"] p{font-style:italic;font-size:1.26rem;color:#dcdfe3}`,
  `body.cs-home-a article [data-card-name="${VA}+Meet Brandon"]{padding-bottom:3.2rem}`,
  `body.cs-home-a article [data-card-name="${VA}+Meet Brandon"] p:first-child{font-size:1.3rem}`,
  `body.cs-home-a article [data-card-name="${VA}+Meet Brandon"] p:first-child strong{font-weight:700}`,
  `body.cs-home-a article [data-card-name="${VA}+Meet Brandon"] p+p{font-size:1.02rem}`,
  "</style>",
  '<body class="cs-home-a d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="container flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

// --- variant B: the decko-native home ---------------------------------------

const doorHtml = (title, line, linkLine) => [
  `<h3 style="margin:0 0 .55rem">${title}</h3>`,
  `<p style="margin:0 0 .9rem">${line}</p>`,
  `<p style="margin:0"><strong>${linkLine}</strong></p>`,
].join("\n");

const variantBCards = (assets) => [
  { name: `${VB}`, role: "variant B main card: the card composition, each element a real card", content: [
    `{{${VB}+Hero Card|content}}`,
    `{{${VB}+Intro Card|content}}`,
    `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.4rem;margin:0 0 1.4rem">{{${VB}+Door Practice|content}}`,
    `{{${VB}+Door Team|content}}`,
    `{{${VB}+Door Library|content}}</div>`,
    `{{${VB}+Proposals Card|content}}`,
    `{{${VB}+Connect Card|content}}`,
    `{{${VB}+Meet Brandon Card|content}}`,
  ].join("\n") },
  { name: `${VB}+Hero Card`, role: "the hero as a full-width card: the Conflict Done Well phrase as display line, the live photo under it", content: [
    '<p style="margin:0 0 1.4rem;font-size:2.1rem;font-weight:700;line-height:1.2">Conflict Done Well</p>',
    HERO_IMG(assets),
  ].join("\n") },
  { name: `${VB}+Intro Card`, role: "the intro as its own card", content: INTRO_HTML },
  { name: `${VB}+Door Practice`, role: "the practice door: the individual line of the live intro", content:
    doorHtml("Practice",
      "Individuals learn to understand the systems they live in, recover from trauma, and respond creatively to difference and stress.",
      "[[Conflict Done Well|Start with Conflict Done Well]]") },
  { name: `${VB}+Door Team`, role: "the team door: the leaders and teams line of the live intro", content:
    doorHtml("Team",
      "Leaders and teams practice Conflict Done Well in order to become continually more effective.",
      "[[Peace Practices|Peace Practices for organizations]]") },
  { name: `${VB}+Door Library`, role: "the library door: the recorded classes and the working library", content:
    doorHtml("Library",
      "The Library holds every recorded class, searchable, with the handbook alongside.",
      `<a href="${LIBRARY_URL}">Go to the Library</a> and [[Conflict Done Well+Online Classes|Zoom classes]]`) },
  { name: `${VB}+Proposals Card`, role: "the proposals line as a call-to-action card", content:
    '<p style="margin:0"><em>We are accepting project proposals and new consulting clients at this time.</em> <strong>[[Make Contact]]</strong></p>' },
  { name: `${VB}+Connect Card`, role: "the subscribe and Zoom classes line as a quiet closing card", content: CONNECT_HTML },
  { name: `${VB}+Meet Brandon Card`, role: "the meet-brandon block as the page's closing card", content: MEET_HTML },
];

function variantBLayout(assets) {
  return [
    `<link rel="stylesheet" href="${LOCAL_SKIN_HREF}">`,
    "<style>",
    NAV_CSS(assets),
    "/* variant B: the decko-native home - every element a real card on a surface */",
    "body.cs-home-b article.container{max-width:74rem;padding:0 1.5rem 2.5rem}",
    `body.cs-home-b article [data-card-name="${VB}+Hero Card"]{background:linear-gradient(180deg,#2e333a,#272b30);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:3rem 1.5rem 2.6rem;margin:1.6rem 0 1.4rem;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35)}`,
    `body.cs-home-b article [data-card-name="${VB}+Hero Card"] p:first-child{margin:0 0 1.4rem;font-size:2.1rem;font-weight:700;line-height:1.2;color:#f4f5f6;letter-spacing:.01em}`,
    `body.cs-home-b article [data-card-name="${VB}+Hero Card"] img{width:640px;max-width:100%;height:auto;border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.5)}`,
    `body.cs-home-b article [data-card-name="${VB}+Intro Card"]{background:#2c3138;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:2rem 2.4rem;margin:0 0 1.4rem;box-shadow:0 10px 26px rgba(0,0,0,.28)}`,
    `body.cs-home-b article [data-card-name="${VB}+Intro Card"] p{margin:0;font-size:1.14rem;line-height:1.75;color:#c6cad0;text-align:left}`,
    `body.cs-home-b article [data-card-name="${VB}+Intro Card"] strong{color:#f4f5f6}`,
    `body.cs-home-b article [data-card-name="${VB}+Door Practice"],body.cs-home-b article [data-card-name="${VB}+Door Team"],body.cs-home-b article [data-card-name="${VB}+Door Library"]{background:#2c3138;border:1px solid rgba(255,255,255,.06);border-top:3px solid #d9b26a;border-radius:14px;padding:1.5rem 1.6rem;margin:0;box-shadow:0 10px 26px rgba(0,0,0,.28)}`,
    `body.cs-home-b article [data-card-name="${VB}+Door Practice"] h3,body.cs-home-b article [data-card-name="${VB}+Door Team"] h3,body.cs-home-b article [data-card-name="${VB}+Door Library"] h3{margin:0 0 .55rem;font-size:1.02rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e8c98d}`,
    `body.cs-home-b article [data-card-name="${VB}+Door Practice"] p,body.cs-home-b article [data-card-name="${VB}+Door Team"] p,body.cs-home-b article [data-card-name="${VB}+Door Library"] p{margin:0 0 .85rem;font-size:.98rem;line-height:1.65;color:#bfc4ca;text-align:left}`,
    `body.cs-home-b article [data-card-name="${VB}+Door Practice"] p:last-child,body.cs-home-b article [data-card-name="${VB}+Door Team"] p:last-child,body.cs-home-b article [data-card-name="${VB}+Door Library"] p:last-child{margin:0}`,
    `body.cs-home-b article [data-card-name="${VB}+Door Practice"] a,body.cs-home-b article [data-card-name="${VB}+Door Team"] a,body.cs-home-b article [data-card-name="${VB}+Door Library"] a{color:#d9b26a;text-decoration:none;border-bottom:1px solid rgba(217,178,106,.4)}`,
    `body.cs-home-b article [data-card-name="${VB}+Proposals Card"]{background:rgba(217,178,106,.1);border:1px solid rgba(217,178,106,.35);border-radius:14px;padding:2.2rem 2rem;margin:0 0 1.4rem;text-align:center}`,
    `body.cs-home-b article [data-card-name="${VB}+Proposals Card"] p{margin:0;font-size:1.2rem;line-height:1.7;color:#e6e9ec;text-align:center}`,
    `body.cs-home-b article [data-card-name="${VB}+Proposals Card"] a{display:inline-block;background:#d9b26a;color:#1d2024;font-weight:700;font-style:normal;padding:.62rem 1.5rem;border-radius:999px;text-decoration:none;margin-left:.35rem}`,
    `body.cs-home-b article [data-card-name="${VB}+Connect Card"]{padding:1.1rem 1.5rem;margin:0 0 1.4rem;text-align:center}`,
    `body.cs-home-b article [data-card-name="${VB}+Connect Card"] p{margin:0;font-size:.98rem;line-height:1.7;color:#a9adb3;text-align:center}`,
    `body.cs-home-b article [data-card-name="${VB}+Connect Card"] a{color:#d9b26a;text-decoration:none;border-bottom:1px solid rgba(217,178,106,.4)}`,
    `body.cs-home-b article [data-card-name="${VB}+Meet Brandon Card"]{padding:1.8rem 1rem 2.4rem;text-align:center}`,
    `body.cs-home-b article [data-card-name="${VB}+Meet Brandon Card"] p{margin:0 0 .5rem;text-align:center;color:#c6cad0;font-size:1.05rem;line-height:1.7}`,
    `body.cs-home-b article [data-card-name="${VB}+Meet Brandon Card"] p:first-child{font-size:1.25rem;color:#e6e9ec}`,
    `body.cs-home-b article [data-card-name="${VB}+Meet Brandon Card"] p:first-child strong{font-weight:700;color:#f4f5f6}`,
    `body.cs-home-b article [data-card-name="${VB}+Meet Brandon Card"] a{color:#d9b26a;text-decoration:none;border-bottom:1px solid rgba(217,178,106,.4)}`,
    "</style>",
    '<body class="cs-home-b d-flex flex-column h-100">',
    "  <header>{{:header|core}}</header>",
    '  <article class="container flex-shrink-0" role="main">{{_main|content}}</article>',
    '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
    "</body>",
  ].join("\n");
}

// --- the write path ----------------------------------------------------------

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, assets: DEFAULT_ASSETS, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--assets": args.assets = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      default:
        console.error(`build-home-variants: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.credentials)) {
  console.error(`build-home-variants: no credentials file at ${args.credentials}`);
  process.exit(2);
}
for (const asset of ["logo-3643-small.jpg", "hero-27689-135167.jpg"]) {
  if (!existsSync(join(args.assets, asset))) {
    console.error(`build-home-variants: missing asset ${join(args.assets, asset)}`);
    process.exit(2);
  }
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

async function writeCard(name, content, type) {
  const existing = await request(`${cardPath(name)}.json`);
  const path = existing.status === 200 ? cardPath(name) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const body = { card: { name, content } };
  if (type !== undefined) body.card.type = type;
  const res = await request(path, { method, body: JSON.stringify(body) });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  const readBack = ok ? await request(`${cardPath(name)}.json`) : null;
  return { ok, method, path, status: res.status, readBack, errorBody: ok ? "" : res.body.slice(0, 300) };
}

// A write-path-created card defaults to read "Anyone Signed In"; the variant
// pages must render for a signed-out visitor, so every card this build
// creates gets the deck's own open read rule.
async function openRead(name) {
  const rule = `${name}+*self+*read`;
  const w = await writeCard(rule, "Anyone");
  return { ok: w.ok, status: w.status, readStatus: w.readBack?.status ?? null, errorBody: w.errorBody };
}

// Guards, checked against every byte this build writes.
function guardChecks(texts) {
  const joined = texts.join("\n");
  return {
    noEmDash: !joined.includes("\u2014"),
    noEnDash: !joined.includes("\u2013"),
    englishOnlyAscii: /^[\x00-\x7F]*$/.test(joined.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "")),
    noOperatorSurname: !joined.includes("Wilner"),
  };
}

// ── 1. sign in ───────────────────────────────────────────────────────────────
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, { status: res.status });
  if (cookie === "") {
    console.error("build-home-variants: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

const inventory = [];

// ── 2. the variant cards ─────────────────────────────────────────────────────
const allWrittenTexts = [];
for (const build of [
  { label: "A", cards: variantACards(args.assets), layout: variantALayout(args.assets) },
  { label: "B", cards: variantBCards(args.assets), layout: variantBLayout(args.assets) },
]) {
  const VB_OR_VA = build.label === "A" ? VA : VB;
  const LAYOUT = build.label === "A" ? LAYOUT_A : LAYOUT_B;

  for (const card of build.cards) {
    if (args.dryRun) {
      console.log(`would write: ${card.name} (${card.content.length} chars)`);
      continue;
    }
    const w = await writeCard(card.name, card.content);
    const read = await openRead(card.name);
    const stored = w.readBack?.status === 200 ? w.readBack.body : "";
    const readType = stored ? (JSON.parse(stored).type_name ?? "?") : "-";
    allWrittenTexts.push(card.content);
    record(
      `card: ${card.name}`,
      w.ok && read.ok,
      `${w.method} ${w.path} -> ${w.status}; read back ${w.readBack?.status ?? "-"}, ${w.readBack?.bytes ?? 0} bytes, type ${readType}; read rule -> ${read.status}`,
      { status: w.status, readStatus: w.readBack?.status ?? null, readType, readRuleStatus: read.status, error: w.errorBody || read.errorBody },
    );
    inventory.push({ name: card.name, variant: build.label, role: card.role, status: w.status, readStatus: w.readBack?.status ?? null, bytes: w.readBack?.bytes ?? 0 });
  }

  // ── 3. the view: the layout card and the per-card layout rule ──────────────
  if (!args.dryRun) {
    const lw = await writeCard(LAYOUT, build.layout, "Layout");
    const lread = await openRead(LAYOUT);
    allWrittenTexts.push(build.layout);
    record(`view: ${LAYOUT}`, lw.ok && lread.ok, `${lw.method} ${lw.path} -> ${lw.status}; read back ${lw.readBack?.status ?? "-"}, ${lw.readBack?.bytes ?? 0} bytes; read rule -> ${lread.status}`, {
      status: lw.status, readStatus: lw.readBack?.status ?? null, readRuleStatus: lread.status, error: lw.errorBody || lread.errorBody,
    });
    inventory.push({ name: LAYOUT, variant: build.label, role: "the variant's page shell (Layout card carrying the skin)", status: lw.status, readStatus: lw.readBack?.status ?? null, bytes: lw.readBack?.bytes ?? 0 });

    const ruleName = `${VB_OR_VA}+*self+*layout`;
    const rw = await writeCard(ruleName, LAYOUT);
    const rread = await openRead(ruleName);
    record(`view: ${ruleName}`, rw.ok && rread.ok, `${rw.method} ${rw.path} -> ${rw.status}; read rule -> ${rread.status}`, {
      status: rw.status, readRuleStatus: rread.status, error: rw.errorBody || rread.errorBody,
    });
    inventory.push({ name: ruleName, variant: build.label, role: "the per-card layout rule seating the variant's shell", status: rw.status, readStatus: rw.readBack?.status ?? null, bytes: rw.readBack?.bytes ?? 0 });
  }
}

// ── 4. both variant pages render through the engine ──────────────────────────
if (!args.dryRun) {
  for (const [label, variant, markers] of [
    ["A", VA, [LOCAL_SKIN_HREF, "cs-home-a", "Conflict Done Well", "consultancy and online seminar", "accepting project proposals", "subscribe to our email list", "Brandon Williamscraig", heroDataUri(args.assets).slice(0, 60)]],
    ["B", VB, [LOCAL_SKIN_HREF, "cs-home-b", "Conflict Done Well", "consultancy and online seminar", "accepting project proposals", "subscribe to our email list", "Brandon Williamscraig", "grid-template-columns", LIBRARY_URL]],
  ]) {
    // signed out: a fresh request with no session cookie, the way a visitor
    // and the render gate both meet the page
    const res = await fetch(`${args.baseUrl}${cardPath(variant)}`, { headers: { Origin: args.baseUrl } });
    const body = await res.text();
    const bytes = Buffer.byteLength(body);
    const missing = markers.filter((m) => !body.includes(m));
    const checks = {
      status200: res.status === 200,
      signedOut: !body.includes("Sign out"),
      allMarkersPresent: missing.length === 0,
      layoutSeated: body.includes(`cs-home-${label.toLowerCase()}`),
      skinLinked: body.includes(LOCAL_SKIN_HREF),
      navbarPresent: body.includes("navbar-brand") && body.includes("Search"),
      footerPresent: body.includes("<footer"),
    };
    record(
      `page: variant ${label} renders signed out`,
      Object.values(checks).every(Boolean),
      `GET ${cardPath(variant)} -> ${res.status}, ${bytes} bytes${missing.length ? `; MISSING: ${missing.map((m) => m.slice(0, 40)).join(" | ")}` : ""}`,
      { status: res.status, bytes, checks, missing },
    );
    inventory.push({ name: `page ${variant}`, variant: label, role: "signed-out page render check", status: res.status, bytes, checks });
  }
}

// ── 5. guards over everything written ────────────────────────────────────────
if (!args.dryRun) {
  const guards = guardChecks(allWrittenTexts);
  record("guards: written bytes", Object.values(guards).every(Boolean), JSON.stringify(guards), guards);
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  variants: { A: VA, B: VB, layoutA: LAYOUT_A, layoutB: LAYOUT_B },
  skin: { href: LOCAL_SKIN_HREF, bytes: 219593, sha256: "20189629f5770e09baaf9f50225ed971097d190dd183b34e303b4a40d588fb00" },
  assets: {
    hero: "hero-27689-135167.jpg (files/27689/135167-large.jpg, 500x334, fetched once from the site's public asset host per the faithful-build precedent)",
    logo: "logo-3643-small.jpg (sha256 75bfba4d..., verified against the faithful build receipt)",
  },
  guards: "English only; no em-dashes or en-dashes; no operator surname; the Opportunities menu item carrying a family surname is hidden by the variants' CSS; Brandon Williamscraig appears only as the live page's own meet-brandon label",
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
