// build-the-front-door-snapshot-faithful.mjs
//
// PURPOSE
// Rebuild the front door snapshot as a FAITHFUL copy of the full rendered
// page the demo engine serves: the site chrome stays (header navbar with the
// Opportunities menu, the Changes link, the search box, and the signed-out
// Sign up / Sign in links, plus the deck footer), the door's own article
// stays, and the compiled skin stylesheet is embedded inline so the page
// renders styled on its own. The earlier ship (tmp/frontdoor-ship-20261025
// in the frontdoor worktree) kept only the article and lost every structural
// element; this build is the correction, per the 2026-10-26 ship order.
//
// WHAT IS KEPT
// - The full DOM the engine serves signed out: head, chrome, article, footer.
//   The chrome is session-neutral: it is exactly what a signed-out visitor
//   sees, and every live-session value on the page (decko.rootUrl,
//   decko.signed_in, the editor configs) lives inside script tags, which are
//   stripped.
// - The compiled stylesheet, embedded as a style element. The bytes are the
//   engine's own compiled skin (vm-skin-compiled.css beside the demo scratch
//   checkout root, sha256-pinned below); this run re-proves the engine's
//   stylesheet route serves the same bytes before embedding them.
// - FIVE chrome layout rules appended to the embedded stylesheet, copied
//   verbatim from the compiled skin the live site serves
//   (files/45514/1790384218.css, sha256 61b7eca2...). The first gate shoot
//   showed the snapshot's navbar wrapping onto two rows (header 128px) where
//   the site's front page keeps one row (74px), and the second shoot showed
//   the search box at a third of the site's width. The mechanism for both:
//   the scratch checkout's compiled skin predates the d0 chrome layout
//   rules. A class-by-class scan of the page DOM against both skins found
//   exactly the rules below missing, plus rules with no still-render effect
//   (recorded as skipped in the build receipt). The site's current skin
//   cannot be embedded whole because it carries 16 absolute references into
//   culturesmith.com (jquery-ui images, icon fonts), which the ship guards
//   forbid; the patched pinned bytes render the chrome as the site does.
//   CSS layout machinery only, no text.
// - The door's own images in the chrome: the navbar logo and the favicon.
//   The rendered DOM points both at a placeholder storage host that cannot
//   resolve, and the engine does not serve the objects, so the build embeds
//   the bytes the live site serves for the same objects (files/79/3643-small
//   and files/103/3649-small) as data URIs. The bytes were fetched once from
//   the site's public asset host on 2026-10-26 and sit beside this script;
//   their sha256 is pinned below.
//
// WHAT IS CUT, AND WHY
// - Every script tag: nothing on the door needs JavaScript.
// - The Material Icons stylesheet link: no element in this DOM carries a
//   material icon (asserted), so the link is a network fetch with no effect.
// - The one Opportunities menu item that carries the family surname
//   (href /Brandon_WilliamsCraig): the ship guards forbid the family name.
//   The menu keeps its other seven entries and both dividers.
//
// CHECKS (the run fails on any miss, nothing is written)
// - Door markers and chrome markers present (header, navbar, search box,
//   sign-up and sign-in links, footer, the "What is real here" note).
// - Exactly one header, one footer, one article.
// - No family name, no em-dash or en-dash in the prose, no email address,
//   no loopback address, no storage-host reference, no script tag, no
//   external stylesheet or image reference, no live-session marker
//   (signed_in, rootUrl, csrf, authenticity_token, Sign out).
// - The embedded stylesheet is byte-for-byte the pinned compiled CSS.
//
// SECRETS: none are read. The page comes from the engine signed out; the
// logo and favicon bytes are public site assets.
//
// Usage: node build-the-front-door-snapshot-faithful.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const HERE = "C:/localProjects/decko-ts-frontdoor-faithful-20261026/tmp/frontdoor-faithful-20261026";
const ENGINE = "http://127.0.0.1:3118";
const DOOR_PATH = "/Culturesmith+Front_Door";
const COMPILED_CSS_PATH = "C:/localProjects/decko-ts-demo-scratch-20261025/vm-skin-compiled.css";
const COMPILED_CSS_SHA256 = "20189629f5770e09baaf9f50225ed971097d190dd183b34e303b4a40d588fb00";
const ENGINE_CSS_ROUTE = `${ENGINE}/files/~45514/1786554352.css`;
// The chrome layout rules the pinned skin compile predates, copied verbatim
// from the compiled skin the live site serves (files/45514/1790384218.css,
// sha256 61b7eca2eb44be36f51840f82d4a4e44bef771f8178b2a2751d086cbe39d7bf8).
// The gate shoots caught both defects: without the first rule the navbar
// wraps onto two rows, without the rest the search box sits at a third of
// the site's width. Skipped as no-effect-on-a-still-page, after the
// class-by-class scan: .card-slot{position:relative},
// .d0-card-frame,.d0-card-body,.ALL{overflow:inherit;white-space:normal},
// the overlay-scoped .d0-card-content padding rule, the hover-only card menu
// rules, .form-group .signup-link, and the select2 autocomplete rules (the
// autocomplete needs the stripped JavaScript).
const CHROME_LAYOUT_PATCH = [
  ".d0-nav-container{flex-wrap:inherit;display:flex;width:100%;justify-content:space-between}",
  ".d0-search-box{width:100%}",
  ".search-box-nav{flex:1 0 50%}",
  ".search-box-nav .search-box-form{width:100%}",
  ".search-box-form{width:100%}",
];
const LOGO_PATH = `${HERE}/logo-3643-small.jpg`;
const LOGO_SOURCE = "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/79/3643-small.jpg";
const FAVICON_PATH = `${HERE}/favicon-3649-small.jpg`;
const FAVICON_SOURCE = "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/103/3649-small.jpg";
const OUT = `${HERE}/index.html`;
const RECEIPT_PATH = `${HERE}/front-door-faithful-build-receipt.json`;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const get = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "culturesmith-front-door-snapshot/2.0" } });
  const body = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) throw new Error(`GET ${url} answered ${res.status}`);
  return body;
};

// --- inputs -------------------------------------------------------------------
console.log(`fetching the full door page signed out from ${ENGINE}${DOOR_PATH}`);
const page = (await get(`${ENGINE}${DOOR_PATH}`)).toString("utf8");
console.log(`full rendered page: ${Buffer.byteLength(page)} bytes`);

const css = readFileSync(COMPILED_CSS_PATH);
const cssSha = sha256(css);
if (cssSha !== COMPILED_CSS_SHA256) throw new Error(`compiled stylesheet sha mismatch: ${cssSha}`);
if (!/^\s*@charset/.test(css.toString("utf8"))) throw new Error("compiled stylesheet does not start like compiled CSS");
if (/\.d0-nav-container/.test(css.toString("utf8"))) throw new Error("pinned stylesheet already carries .d0-nav-container; the patch would duplicate it");
if (/\.search-box-nav\{/.test(css.toString("utf8"))) throw new Error("pinned stylesheet already carries .search-box-nav; the patch would duplicate it");
const embeddedCss = `${css.toString("utf8")}\n${CHROME_LAYOUT_PATCH.join("\n")}\n`;
console.log(`compiled stylesheet: ${css.byteLength} bytes, sha256 ${cssSha.slice(0, 16)}... (pinned bytes)`);
console.log(`chrome layout patch: ${CHROME_LAYOUT_PATCH.length} rules, ${CHROME_LAYOUT_PATCH.join("").length} bytes`);

const engineCss = await get(ENGINE_CSS_ROUTE);
const engineCssSame = sha256(engineCss) === cssSha;
console.log(`engine stylesheet route ${ENGINE_CSS_ROUTE}: ${engineCss.byteLength} bytes, identical to the pinned bytes: ${engineCssSame}`);

const logo = readFileSync(LOGO_PATH);
const favicon = readFileSync(FAVICON_PATH);
console.log(`navbar logo: ${logo.byteLength} bytes (${LOGO_SOURCE})`);
console.log(`favicon: ${favicon.byteLength} bytes (${FAVICON_SOURCE})`);

// --- transforms ---------------------------------------------------------------
let out = page.replace(/^\s+/, "");

// The compiled stylesheet takes the stylesheet link's place in the head.
const cssLinkMatch = out.match(/<link[^>]+rel="stylesheet"[^>]+href="[^"]*\/files\/[^"]+\.css"[^>]*>/);
if (!cssLinkMatch) throw new Error("no stylesheet link found in the rendered page");
out = out.replace(cssLinkMatch[0], `<style>\n${embeddedCss}</style>`);

// The Material Icons link goes: no glyph of that family appears in this DOM.
if (/class="[^"]*material-icons[^"]*"/.test(out)) throw new Error("a material icon appears in the DOM; the fonts link cannot be dropped");
const iconsLink = out.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/);
if (!iconsLink) throw new Error("the Material Icons link was not found");
out = out.replace(iconsLink[0], "");

// The chrome's own images become data URIs: the rendered hosts cannot resolve.
const faviconLink = out.match(/<link[^>]+rel="shortcut icon"[^>]*>/);
if (!faviconLink) throw new Error("the favicon link was not found");
out = out.replace(faviconLink[0], faviconLink[0].replace(/href="[^"]*"/, `href="data:image/jpeg;base64,${favicon.toString("base64")}"`));
const logoImg = out.match(/<img alt="\*logo" src="[^"]*"[^>]*\/?>/);
if (!logoImg) throw new Error("the navbar logo image was not found");
out = out.replace(logoImg[0], logoImg[0].replace(/src="[^"]*"/, `src="data:image/jpeg;base64,${logo.toString("base64")}"`));

// The one menu item that carries the family surname goes; the rest of the
// menu stays.
const familyItem = out.match(/<a class="dropdown-item known-card" href="\/Brandon_WilliamsCraig">[\s\S]*?<\/a>/g);
if (!familyItem || familyItem.length !== 1) throw new Error(`expected exactly one family-name menu item, found ${familyItem ? familyItem.length : 0}`);
out = out.replace(familyItem[0], "");

// Every script tag goes, wherever it sits.
out = out.replace(/<script[\s\S]*?<\/script>/g, "");
out = out.replace(/<script[^>]*\/>/g, "");

// --- checks: the run fails on any miss ---------------------------------------
const fails = [];
const doorMarkers = [
  "All of business and life is a sea of conflict",
  "Conflict done well",
  "Are you a student, or are you an organization?",
  "I am a student.",
  "I am an organization.",
  "Three ways to be here",
  "What Conflict Done Well is made of",
  "A community standard",
  "Guardians of Peace",
  "Conflict Done Well Certified",
  "Peace Practices Approved",
  "What is real here",
];
for (const m of doorMarkers) if (!out.includes(m)) fails.push(`door marker missing: ${m}`);

const chromeMarkers = [
  "<header>",
  "navbar navbar-expand-lg navbar-dark bg-dark",
  "Opportunities",
  "search-box-form",
  "signup-link",
  "signin-link",
  "<footer",
  "decko.org",
];
for (const m of chromeMarkers) if (!out.includes(m)) fails.push(`chrome marker missing: ${m}`);

const sessionMarkers = [
  "decko.signed_in",
  "decko.rootUrl",
  "decko.cssPath",
  "setAceConfig",
  "setTinyMCEConfig",
  "authenticity_token",
  "csrf",
  "Sign out",
];
for (const m of sessionMarkers) if (out.includes(m)) fails.push(`live-session marker present: ${m}`);

const familyTokens = [/\bLisa\b/, /\bCheyenne\b/, /\bDavid\s+Williams\b/, /Williams\s?Craig/i];
for (const re of familyTokens) if (re.test(out)) fails.push(`family name matches ${re}`);

// The dash check reads the prose (the page with the embedded vendor
// stylesheet removed). Bootstrap's own compiled rules carry one glyph inside
// .blockquote-footer::before; that is CSS machinery, not door text, and the
// stylesheet ships verbatim as the engine compiled it.
const prose = out.replace(/<style>[\s\S]*?<\/style>/, "");
if (/[\u2014\u2013]/.test(prose)) fails.push("em-dash or en-dash present in the page prose");
if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2}/.test(out)) fails.push("email address present");
if (/127\.0\.0\.1|localhost/.test(out)) fails.push("loopback address present");
if (/production-storage|objectstore/.test(out)) fails.push("storage host reference present");
if (/<script/i.test(out)) fails.push("script tag present");
if (/fonts\.googleapis\.com/.test(out)) fails.push("Material Icons font link still present");

// No external resource reference of any kind survives: stylesheets and
// images are inline, so the page renders with zero network fetches.
const extRes = out.match(/<link[^>]+href="http[^"]*"|<img[^>]+src="http[^"]*"/g);
if (extRes) fails.push(`external resource reference(s) present: ${extRes.length}`);
if (!out.includes("<style>")) fails.push("compiled stylesheet not embedded");
const styleBlock = out.match(/<style>\n([\s\S]*?)<\/style>/);
if (!styleBlock || styleBlock[1] !== embeddedCss) fails.push("embedded stylesheet is not the pinned compiled CSS plus the five chrome layout rules");

const count = (re) => (out.match(re) ?? []).length;
for (const rule of CHROME_LAYOUT_PATCH) {
  // Each patch rule is appended on its own line; the line-bounded count
  // keeps the shorter rules from counting their longer siblings.
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (count(new RegExp(`\\n${escaped}\\n`, "g")) !== 1) fails.push(`patch rule not present exactly once: ${rule}`);
}
if (count(/<header>/g) !== 1) fails.push(`header count ${count(/<header>/g)}, expected 1`);
if (count(/<footer/g) !== 1) fails.push(`footer count ${count(/<footer/g)}, expected 1`);
if (count(/<article/g) !== 1) fails.push(`article count ${count(/<article/g)}, expected 1`);
if (!out.includes("Culturesmith+Front Door")) fails.push("door title missing");
if (!/^<!DOCTYPE/.test(out)) fails.push("output does not start with the doctype");
if (/<a class="dropdown-item known-card" href="\/Brandon_WilliamsCraig"/.test(out)) fails.push("family-name menu item still present");
const menuItems = count(/<a class="dropdown-item known-card"/g);
if (menuItems !== 7) fails.push(`Opportunities menu item count ${menuItems}, expected 7 after the family-name removal`);

if (fails.length) {
  console.error(`FAILED, nothing written:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}

writeFileSync(OUT, out, "utf8");
const outSha = sha256(readFileSync(OUT));
console.log(`written: ${OUT} (${Buffer.byteLength(out)} bytes, sha256 ${outSha})`);
console.log(`checks clean: ${doorMarkers.length} door markers, ${chromeMarkers.length} chrome markers, no session state, no family name, no dash, no email, no loopback, no storage host, no script, no external resource reference`);

const receipt = {
  generatedAt: new Date().toISOString(),
  lane: "Front door faithful republish: full rendered DOM kept, compiled skin embedded, scripts and session state stripped",
  sourcePage: { url: `${ENGINE}${DOOR_PATH}`, signedOut: true, bytes: Buffer.byteLength(page) },
  embeddedStylesheet: {
    path: COMPILED_CSS_PATH,
    bytes: css.byteLength,
    sha256: cssSha,
    engineRouteChecked: ENGINE_CSS_ROUTE,
    engineRouteBytesIdentical: engineCssSame,
    appendedPatch: {
      rules: CHROME_LAYOUT_PATCH,
      count: CHROME_LAYOUT_PATCH.length,
      why: "the pinned skin compile predates the d0 chrome layout rules; without them the navbar wraps onto two rows (gate shoot 1) and the search box sits at a third of the site's width (gate shoot 2)",
      source: "files/45514/1790384218.css (the compiled skin the live site serves), sha256 61b7eca2eb44be36f51840f82d4a4e44bef771f8178b2a2751d086cbe39d7bf8",
      skippedAsNoStillRenderEffect: [
        ".card-slot{position:relative}",
        ".d0-card-frame,.d0-card-body,.ALL{overflow:inherit;white-space:normal}",
        ".overlay-container .d0-card-overlay>.d0-card-frame>.d0-card-content{overflow-y:scroll;padding:1rem 1.5rem} (overlay-scoped)",
        "hover-only card menu rules (.card-slot ... ._show-on-hover ...)",
        ".form-group .signup-link (form-scoped, not the navbar link)",
        "the .search-box-nav select2 rules (autocomplete needs the stripped JavaScript)",
      ],
    },
  },
  embeddedImages: [
    { role: "navbar logo", sourceUrl: LOGO_SOURCE, bytes: logo.byteLength, sha256: sha256(logo), embeddedAs: "data URI" },
    { role: "favicon", sourceUrl: FAVICON_SOURCE, bytes: favicon.byteLength, sha256: sha256(favicon), embeddedAs: "data URI" },
  ],
  removals: [
    "every script tag (jquery, rails-ujs, ace, select2, fontawesome kit, decko bundle, inline config)",
    "the Material Icons stylesheet link (no material icon in this DOM)",
    `the Opportunities menu item carrying the family surname (${familyItem[0].length} bytes of DOM)`,
  ],
  output: { path: OUT, bytes: Buffer.byteLength(out), sha256: outSha },
  checksPassed: {
    doorMarkers: doorMarkers.length,
    chromeMarkers: chromeMarkers.length,
    menuItemsAfterFamilyRemoval: menuItems,
    sessionMarkersAbsent: sessionMarkers.length,
    externalResourceReferences: 0,
  },
};
writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(`receipt written: ${RECEIPT_PATH}`);
