#!/usr/bin/env node
// build-storefront-home.mjs: build the storefront home pitch page as REAL CARDS
// in the running demo scratch deck.
//
//   node scripts/storefront-home/build-storefront-home.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// The operator's directive (brandonDojoTech
// tmp/fleet-standing-queue/briefs/homepage-design-storefront.md): the live
// culturesmith.com Home page is what we are replacing, and the pitch is GOOD
// DESIGN: an ambient video hero (no controls, hover for audio), product-line
// sections that are visually distinct at a glance, living elements (a class
// moment as an inline card, a handbook excerpt styled as it renders, the
// three ways to be here as clickable doors), and the site's own brand chrome.
//
// The page is ONE design, built the decko way, over the demo deck:
//   1. SIGNS IN as the deck's owner account (the demo scratch copy arms the
//      write path, DECKO_WRITE_PATH=1).
//   2. CREATES the page's cards under their own "Storefront Home" namespace,
//      through the engine's own write path (POST / and PUT /<card>), so the
//      cards land with the engine's actions, references and nest closure.
//      Every card's content stays inside the engine's save-time HTML
//      whitelist for card content (content-clean.js: p, h1-h3, blockquote,
//      a, em, strong, ul/li and the rest; no class attributes, no video
//      tags). That is the deck's sane XSS default, the same wall the
//      class-as-cards lane documented.
//   3. SEATS THE VIEW: a Layout card - the deck's own per-card skin
//      mechanism - carrying the storefront skin as CSS scoped to
//      .cs-storefront, the hero's controls-less video embed, and the
//      hover-for-audio script. A layout's content renders verbatim (the
//      Default Layout itself ships script and style), which is what makes it
//      the right home for the video element card content cannot carry. The
//      layout dresses each content card by the slot address the engine
//      renders (data-card-name), so every word on the page is card content
//      and every visual treatment is the skin's. The deck's global skin, the
//      Home card and every other page are untouched.
//   4. SETS THE READ RULES: the deck's default for this type is "Anyone
//      Signed In" (BasicCs+*read), so each card carries the same per-card
//      "+*self+*read -> [[Anyone]]" override the class-as-cards lane set,
//      and a signed-out visitor reads the page.
//   5. READS EVERY CARD BACK through the engine into a receipt.
//
// The hero video is the library's own proven Bunny mapping for the
// GMT20260401-212639 class recording (media_remote row, status finished, one
// of the library's 19 mappings), played controls-less with a bounded media
// fragment (#t=458,518, the opening breath drill the inline moment card
// quotes). Probed live before the build: the pull zone answers 206 to this
// page's own origin referrer.
//
// GUARDS, enforced in code before anything is written: English only, no
// em-dashes, no family names in anything this lane writes (given names
// only), no secrets in the receipt.
//
// Exit code 0 when every card was written and read back and the rendered
// page passes its checks, 1 when any step failed. Nothing here deploys
// anywhere and nothing outside the loopback address is contacted except the
// deck's own Bunny pull zone (the account already in use).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_OUT_DIR = join(repoRoot, "tmp", "homepage-storefront-20261026");
const DEFAULT_OUT = join(DEFAULT_OUT_DIR, "storefront-build-receipt.json");

const PAGE = "Storefront Home";
const LAYOUT_CARD = "Storefront Layout";
const LAYOUT_RULE = `${PAGE}+*self+*layout`;

// The hero's video: the library's own media_remote mapping for the class the
// class-as-cards lane already exercised (read-only snapshot,
// brandonDojoTech/tmp/library-on-bunny-2026-10-25/local-data/library.db,
// 19 rows, all provider=bunny status=finished). The pull zone's referrer
// rule answers 206 to this page's origin (probed 2026-10-25 with a range
// request carrying Referer http://127.0.0.1:3118/).
const BUNNY_HOST = "vz-177c889c-f94.b-cdn.net";
const HERO_GUID = "9ea773fd-e9fb-49f7-81d4-c4aee4d07595";
const HERO_POSTER = `https://${BUNNY_HOST}/${HERO_GUID}/thumbnail.jpg`;
const HERO_SRC = `https://${BUNNY_HOST}/${HERO_GUID}/original#t=458,518`;
const LIBRARY_BASE = "https://culturesmith-library.bunny.run";

// ---------------------------------------------------------------------------
// The cards, in the order a visitor meets them. Content keeps to the tags
// the engine's save-time whitelist allows; the skin reads the structure
// (first p as the eyebrow, h2 as the display line, links as doors).
//
// Voice: the conflict-done-well framing the live page and the front door
// already carry. Every door points at a real thing: a card in this deck or a
// page of the working library. Family names render as given names only.
// ---------------------------------------------------------------------------

const HERO_CONTENT = [
  "<p>Culturesmith</p>",
  "<h1>All of business and life is a sea of conflict.</h1>",
  "<p>Most organizations improvise. We teach the art: <strong>Conflict Done Well</strong>. Culturesmith is a consultancy and online seminar devoted to building dynamic systems that live, learn, and work through conflict.</p>",
  `<p><a href="${LIBRARY_BASE}/classes">Enter the Library</a> <a href="#cs-ways">Three ways to be here</a></p>`,
].join("\n");

const LIBRARY_CONTENT = [
  "<p><em>The Library</em></p>",
  "<h2>Every recorded class, searchable.</h2>",
  "<p>The video, the transcript, and the moments that make them teaching. Sixteen public classes and counting, each one a page of the dojo.</p>",
  `<p><a href="${LIBRARY_BASE}/search">Search the Library: breath, shomen uchi, conflict at the door&#8230;</a></p>`,
  "<p>",
  `  <a href="${LIBRARY_BASE}/classes/GMT20260401-212639_Recording">Wed, Apr 1: Foundational square breathing and unclenched breath holds</a>`,
  `  <a href="${LIBRARY_BASE}/classes/GMT20260404-150833_Recording">Sat, Apr 4</a>`,
  `  <a href="${LIBRARY_BASE}/classes/GMT20260407-012553_Recording">Mon evening, Apr 6</a>`,
  `  <a href="${LIBRARY_BASE}/classes/GMT20260408-213111_Recording">Wed, Apr 8</a>`,
  `  <a href="${LIBRARY_BASE}/classes/GMT20260411-150019_Recording">Sat, Apr 11</a>`,
  `  <a href="${LIBRARY_BASE}/classes/GMT20260516-160928_Recording">Sat, May 16</a>`,
  `  <a href="${LIBRARY_BASE}/classes">Every class, month by month</a>`,
  "</p>",
  `<p>{{${PAGE}+Class Moment}}</p>`,
].join("\n");

const MOMENT_CONTENT = [
  "<p><em>Class moment &#183; Wed, Apr 1 &#183; 07:38 &#183; opening breath drill</em></p>",
  "<blockquote>&ldquo;Put your hand on your front and your back, and breathe so you push your hands apart.&rdquo;</blockquote>",
  "<p>Brandon, teaching</p>",
  `<p><a href="/Class%20GMT20260401-212639">This class, as cards</a> &#183; <a href="${LIBRARY_BASE}/classes/GMT20260401-212639_Recording">In the Library</a></p>`,
].join("\n");

const TRAINING_CONTENT = [
  "<p><em>For teams and organizations</em></p>",
  "<h2>Conflict Done Well training</h2>",
  "<p>A practice your team can stand in, built from [[aikido]], [[Martial Nonviolence]], and [[Peace Practices]], and brought to meetings, classrooms, hospitals, and teams.</p>",
  "<h3>1 &#183; Meet the conflict</h3>",
  "<p>A workshop: your team watches itself work, and names what it does under pressure.</p>",
  "<h3>2 &#183; Build the practice</h3>",
  "<p>A season of training: the breath, the posture, and the redirect, on the mat and in the room.</p>",
  "<h3>3 &#183; Keep it</h3>",
  "<p>The practice becomes yours: instructors inside your organization, carrying the standard.</p>",
  '<p><a href="/Conflict%20Done%20Well">What Conflict Done Well is</a> &#183; <a href="/Make%20Contact">Bring it to your team</a></p>',
].join("\n");

const CERT_CONTENT = [
  "<p><em>Certification</em></p>",
  "<h2>Two names, one standard.</h2>",
  "<h3>CDW Certified</h3>",
  "<p>For the practitioner: you can do conflict well, and a certifying teacher has watched you do it. <a href=\"/Make%20Contact\">Ask about certification</a></p>",
  "<h3>Peace Practices Approved</h3>",
  "<p>For the organization that runs the practice: your program carries the standard, and your instructors carry the name. <a href=\"/Make%20Contact\">Apply for approval</a></p>",
].join("\n");

const GOP_CONTENT = [
  "<p><em>The open community standard</em></p>",
  "<h2>Guardians of Peace</h2>",
  "<p>An open proposal to the world: a community standard, not a product. The certification names above descend from the Guardians of Peace Credential, proposed in 2010.</p>",
  '<p><a href="/Guardians%20of%20Peace">Read the proposal</a></p>',
].join("\n");

const WAYS_CONTENT = [
  "<h2>Three ways to be here.</h2>",
  `<h3>Guest</h3><p>Watch any class, free. Start with the opening breath drill. <a href="${LIBRARY_BASE}/classes">Enter as a guest</a></p>`,
  `<h3>Member</h3><p>Join the dojo: every live class, the handbook, the community. <a href="${LIBRARY_BASE}/membership/join">Become a member</a></p>`,
  '<h3>Student</h3><p>Train toward certification with Brandon, on the mat and online. <a href="/Make%20Contact">Train as a student</a></p>',
].join("\n");

const HANDBOOK_CONTENT = [
  "<p><em>From the dojo handbook &#183; Conflict Done Well</em></p>",
  "<blockquote>The founder specifically directed: Aikido teachers explicitly and implicitly promise improved physical and psychological conflict skills which reach beyond the dojo. In most aikido dojos, however, physical balance control and redirection is practiced on the mat but nonviolent conflict resolution (psychological balance control and redirective communication) is not.</blockquote>",
  `<p>The handbook text is Brandon's own. The library linked the terms and built the glossary. <a href="${LIBRARY_BASE}/wiki/conflict-done-well">Read the whole page</a></p>`,
].join("\n");

const MEET_CONTENT = [
  "<h2>Meet Brandon.</h2>",
  "<p>If we just had a conversation that you found stimulating, the next step is small.</p>",
  '<p><a href="/New%20Connection%20Ask">The new connection ask</a> &#183; <a href="/Make%20Contact">Make contact</a></p>',
].join("\n");

const PAGE_CONTENT = [
  `{{${PAGE}+Hero}}`,
  `{{${PAGE}+The Library}}`,
  `{{${PAGE}+Training}}`,
  `{{${PAGE}+Certification}}`,
  `{{${PAGE}+Guardians of Peace}}`,
  `{{${PAGE}+Ways Here}}`,
  `{{${PAGE}+Handbook Excerpt}}`,
  `{{${PAGE}+Meet Brandon}}`,
].join("\n");

const CARDS = [
  { name: `${PAGE}+Hero`, role: "the hero's copy: kicker, display line, lede, the two doors", content: HERO_CONTENT },
  { name: `${PAGE}+The Library`, role: "product line: the Library, with the search pill, class chips, and the inline moment nest", content: LIBRARY_CONTENT },
  { name: `${PAGE}+Class Moment`, role: "living element: a real class moment as an inline card", content: MOMENT_CONTENT },
  { name: `${PAGE}+Training`, role: "product line: Conflict Done Well training for teams and organizations", content: TRAINING_CONTENT },
  { name: `${PAGE}+Certification`, role: "product line: CDW Certified and Peace Practices Approved", content: CERT_CONTENT },
  { name: `${PAGE}+Guardians of Peace`, role: "product line: the open community standard", content: GOP_CONTENT },
  { name: `${PAGE}+Ways Here`, role: "living element: the three ways to be here as clickable doors", content: WAYS_CONTENT },
  { name: `${PAGE}+Handbook Excerpt`, role: "living element: the handbook excerpt, styled as it renders", content: HANDBOOK_CONTENT },
  { name: `${PAGE}+Meet Brandon`, role: "the closing band: meet the teacher, the live page's own invitation", content: MEET_CONTENT },
  { name: PAGE, role: "the page card: nests every section", content: PAGE_CONTENT },
];

// The storefront skin: one Layout card. A layout's content renders verbatim
// (the Default Layout itself ships script and style), so this card carries:
//   - the skin: CSS scoped to .cs-storefront, dressing each section card by
//     the slot address the engine renders (data-card-name);
//   - the hero's controls-less video embed (the one element card content
//     cannot carry under the deck's XSS whitelist), with its poster;
//   - the audio affordance pill and the hover-for-audio script.
// The site's own chrome stays: {{:header|core}} renders the site bar (logo,
// Opportunities, Changes, search, sign-in) and {{:footer|content}} the foot.
const LAYOUT_CONTENT = `<link rel="stylesheet" href="/files/~45514/0000000001.css">
<script src="/files/~50617/0000000002.js"></script>
<style>
/* The deck's compiled bundles, served from this host's own /files routes
   (the deck's stored asset URLs name a cloud host this machine cannot
   resolve; the staging server serves the same bytes locally, the same way
   the class-as-cards lane's page_bundle view does). This skin's own rules
   follow, so they win ties against the bundle. */
/* Storefront home skin. Scoped to .cs-storefront: nothing outside the
   storefront page is styled. Base: the site's own dark slate. Sections are
   dressed by the slot address the engine renders for each card. */
.cs-storefront { background: linear-gradient(180deg, #20242a 0%, #1a1e23 100%); color: #c9cdd2; padding: 0 0 3.5rem; }
.cs-storefront a { color: #9fd8d2; }
.cs-storefront h1, .cs-storefront h2, .cs-storefront h3 { color: #f2ede2; font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif; letter-spacing: .01em; }

/* The hero stage: full bleed, ambient video, no controls ever. The copy is
   the Hero card's own rendered content, pulled up over the stage. */
.cs-storefront .cs-hero-stage { position: relative; width: 100vw; margin-left: calc(50% - 50vw); height: 84vh; min-height: 560px; overflow: hidden; background: #101317; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
.cs-storefront .cs-hero-media { position: absolute; inset: 0; }
.cs-storefront .cs-ambient { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.02); }
.cs-storefront .cs-hero-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,19,23,.3) 0%, rgba(16,19,23,.08) 42%, rgba(26,30,35,.72) 78%, #1a1e23 100%); }
.cs-storefront [data-card-name="Storefront Home+Hero" i] { position: relative; z-index: 3; max-width: 62rem; margin: -38vh auto 0; padding: 0 1rem; }
.cs-storefront [data-card-name="Storefront Home+Hero" i] p:first-child { text-transform: uppercase; letter-spacing: .34em; font-size: .8rem; color: #9fd8d2; margin: 0 0 .9rem; }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 { font-size: 3rem; line-height: 1.12; margin: 0 0 1.1rem; text-shadow: 0 2px 24px rgba(0,0,0,.55); }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 + p { font-size: 1.16rem; line-height: 1.6; color: #dfe3e7; max-width: 46rem; margin: 0 0 1.8rem; }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 + p + p a { display: inline-block; margin: 0 .8rem .6rem 0; padding: .62rem 1.35rem; border-radius: 999px; border: 1px solid rgba(242,237,226,.4); color: #f2ede2; text-decoration: none; font-weight: 600; font-size: .98rem; background: rgba(16,19,23,.35); }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 + p + p a:first-child { background: #2f9e93; border-color: #2f9e93; }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 + p + p a:hover { background: rgba(16,19,23,.55); }
.cs-storefront [data-card-name="Storefront Home+Hero" i] h1 + p + p a:first-child:hover { background: #37b2a6; }
/* The chrome's logo image points at the deck's stored asset host, which does
   not resolve on this machine; on this page the word beside it carries the
   brand instead of a broken image. */
body:has(.cs-storefront) header img[alt="*logo"] { display: none; }

/* Buttons: every section's doors. */
.cs-storefront .cs-btn, .cs-storefront [data-card-name] p > a { display: inline-block; }

/* Sections: each product line its own shape and accent. */
.cs-storefront [data-card-name="Storefront Home+The Library" i],
.cs-storefront [data-card-name="Storefront Home+Training" i],
.cs-storefront [data-card-name="Storefront Home+Certification" i],
.cs-storefront [data-card-name="Storefront Home+Guardians of Peace" i],
.cs-storefront [data-card-name="Storefront Home+Ways Here" i],
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i],
.cs-storefront [data-card-name="Storefront Home+Meet Brandon" i] { margin: 2.4rem auto 0; max-width: 72rem; padding: 2.1rem 2.3rem 1.9rem; }
.cs-storefront [data-card-name] p:first-child { margin: 0; }
.cs-storefront [data-card-name] p:first-child em { text-transform: uppercase; letter-spacing: .26em; font-size: .74rem; font-weight: 700; font-style: normal; }
.cs-storefront [data-card-name] h2 { font-size: 2rem; margin: .4rem 0 .5rem; }
.cs-storefront [data-card-name] h2 + p { font-size: 1.07rem; line-height: 1.6; color: #c9cdd2; max-width: 48rem; margin: 0 0 1rem; }

/* The Library: a glass card with a teal edge. */
.cs-storefront [data-card-name="Storefront Home+The Library" i] { background: linear-gradient(160deg, rgba(47,158,147,.15) 0%, rgba(32,36,42,.6) 55%); border: 1px solid rgba(85,199,186,.35); border-radius: 18px; }
.cs-storefront [data-card-name="Storefront Home+The Library" i] p:first-child em { color: #55c7ba; }
.cs-storefront [data-card-name="Storefront Home+The Library" i] h2 + p + p a { display: inline-block; width: 100%; max-width: 40rem; padding: .78rem 1.2rem; border-radius: 999px; background: rgba(16,19,23,.6); border: 1px solid rgba(85,199,186,.45); color: #dfe3e7; text-decoration: none; font-size: .98rem; margin: 0 0 1rem; }
.cs-storefront [data-card-name="Storefront Home+The Library" i] h2 + p + p a:hover { border-color: #55c7ba; }
.cs-storefront [data-card-name="Storefront Home+The Library" i] h2 + p + p + p a { display: inline-block; padding: .38rem .85rem; margin: 0 .5rem .55rem 0; border-radius: 8px; background: rgba(16,19,23,.5); border: 1px solid rgba(201,205,210,.25); color: #c9cdd2; text-decoration: none; font-size: .86rem; }
.cs-storefront [data-card-name="Storefront Home+The Library" i] h2 + p + p + p a:hover { border-color: #55c7ba; color: #e9edef; }

/* The inline class moment: a teal-edged quote card inside the Library. */
.cs-storefront [data-card-name="Storefront Home+Class Moment" i] { margin: 1.2rem 0 0; padding: 1.2rem 1.5rem; border-left: 4px solid #55c7ba; border-radius: 10px; background: rgba(16,19,23,.55); max-width: none; }
.cs-storefront [data-card-name="Storefront Home+Class Moment" i] p:first-child em { color: #55c7ba; text-transform: uppercase; letter-spacing: .18em; font-size: .78rem; }
.cs-storefront [data-card-name="Storefront Home+Class Moment" i] blockquote { margin: .5rem 0; font-family: Georgia, 'Palatino Linotype', serif; font-size: 1.22rem; line-height: 1.5; color: #f2ede2; }
.cs-storefront [data-card-name="Storefront Home+Class Moment" i] blockquote + p { margin: 0 0 .5rem; font-size: .88rem; color: #9aa0a6; }
.cs-storefront [data-card-name="Storefront Home+Class Moment" i] p:last-child { margin: 0; font-size: .9rem; }

/* Training: a copper band with numbered steps. */
.cs-storefront [data-card-name="Storefront Home+Training" i] { background: linear-gradient(140deg, rgba(178,107,50,.17) 0%, rgba(32,36,42,.6) 60%); border: 1px solid rgba(217,154,91,.35); border-left: 6px solid #b26b32; border-radius: 12px; }
.cs-storefront [data-card-name="Storefront Home+Training" i] p:first-child em { color: #d99a5b; }
.cs-storefront [data-card-name="Storefront Home+Training" i] h3 { font-size: 1.2rem; margin: 1rem 0 .3rem; color: #e8c49e; }
.cs-storefront [data-card-name="Storefront Home+Training" i] h3 + p { margin: 0 0 .3rem; max-width: 46rem; font-size: .95rem; line-height: 1.55; color: #b9bec4; }

/* Certification: violet doors. */
.cs-storefront [data-card-name="Storefront Home+Certification" i] { background: linear-gradient(150deg, rgba(179,154,236,.15) 0%, rgba(32,36,42,.6) 60%); border: 1px solid rgba(179,154,236,.35); border-radius: 18px; }
.cs-storefront [data-card-name="Storefront Home+Certification" i] p:first-child em { color: #b39aec; }
.cs-storefront [data-card-name="Storefront Home+Certification" i] h3 { font-size: 1.45rem; margin: 1.1rem 0 .35rem; }
.cs-storefront [data-card-name="Storefront Home+Certification" i] h3 + p { margin: 0; max-width: 52rem; font-size: .97rem; line-height: 1.55; color: #b9bec4; }

/* Guardians of Peace: centered, indigo glow. */
.cs-storefront [data-card-name="Storefront Home+Guardians of Peace" i] { text-align: center; background: linear-gradient(170deg, rgba(85,102,199,.17) 0%, rgba(32,36,42,.6) 65%); border: 1px solid rgba(147,166,242,.4); box-shadow: 0 0 32px rgba(85,102,199,.18) inset; border-radius: 18px; }
.cs-storefront [data-card-name="Storefront Home+Guardians of Peace" i] p:first-child em { color: #93a6f2; }
.cs-storefront [data-card-name="Storefront Home+Guardians of Peace" i] h2 + p { margin-left: auto; margin-right: auto; }

/* Three ways to be here: three columns of doors. */
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] { background: rgba(32,36,42,.5); border: 1px solid rgba(201,205,210,.22); border-radius: 18px; column-count: 3; column-gap: 2.2rem; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h2, .cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3, .cs-storefront [data-card-name="Storefront Home+Ways Here" i] p { break-inside: avoid; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h2 { column-span: all; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3 { font-size: 1.35rem; margin: 1rem 0 .3rem; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3:nth-of-type(1) { color: #55c7ba; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3:nth-of-type(2) { color: #d99a5b; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3:nth-of-type(3) { color: #b39aec; }
.cs-storefront [data-card-name="Storefront Home+Ways Here" i] h3 + p { margin: 0; font-size: .95rem; line-height: 1.55; color: #b9bec4; max-width: none; }

/* The handbook excerpt: paper, serif, the way the handbook renders. */
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i] { max-width: 52rem; background: #f6efe1; color: #2b2620; border-radius: 8px; box-shadow: 0 14px 34px rgba(0,0,0,.4); }
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i] p:first-child em { color: #8a6d4a; }
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i] blockquote { margin: .7rem 0; font-family: Georgia, 'Palatino Linotype', serif; font-size: 1.18rem; line-height: 1.62; color: #2b2620; }
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i] p:last-child { margin: 0; font-size: .92rem; color: #5c534a; }
.cs-storefront [data-card-name="Storefront Home+Handbook Excerpt" i] a { color: #1f6f66; }

/* Meet Brandon: the centered closing band. */
.cs-storefront [data-card-name="Storefront Home+Meet Brandon" i] { text-align: center; background: rgba(47,158,147,.1); border: 1px solid rgba(47,158,147,.35); border-radius: 18px; }
.cs-storefront [data-card-name="Storefront Home+Meet Brandon" i] h2 + p { margin-left: auto; margin-right: auto; }

/* The audio affordance: muted by default; the hover state is driven by the
   layout's script, which fades the video's audio in and out. */
.cs-storefront .cs-audio-pill { position: absolute; top: 1.3rem; right: 1.5rem; z-index: 4; display: flex; align-items: center; gap: .45rem; padding: .42rem .95rem; border-radius: 999px; border: 1px solid rgba(242,237,226,.35); background: rgba(16,19,23,.55); color: #e8e3d8; font-size: .85rem; letter-spacing: .04em; backdrop-filter: blur(6px); }
.cs-storefront .cs-audio-pill::before { content: "\\266A"; font-size: .95rem; color: #9fd8d2; }
.cs-storefront .cs-pill-live { display: none; }
.cs-storefront .cs-hero-stage.is-audible .cs-audio-pill { border-color: #2f9e93; box-shadow: 0 0 14px rgba(47,158,147,.5); }
.cs-storefront .cs-hero-stage.is-audible .cs-pill-muted { display: none; }
.cs-storefront .cs-hero-stage.is-audible .cs-pill-live { display: inline; }
</style>
<body class="d-flex flex-column h-100">
  <header>{{:header|core}}</header>
  <article class="container flex-shrink-0 cs-storefront" role="main">
    <div class="cs-hero-stage">
      <div class="cs-hero-media">
        <video class="cs-ambient" muted loop autoplay playsinline preload="auto" poster="${HERO_POSTER}" src="${HERO_SRC}"></video>
        <div class="cs-hero-scrim"></div>
      </div>
      <div class="cs-audio-pill"><span class="cs-pill-muted">Hover for sound</span><span class="cs-pill-live">Sound on</span></div>
    </div>
    <div class="cs-main">{{_main|content}}</div>
  </article>
  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>
  <script>
  (function () {
    function ready(fn) {
      if (document.readyState !== "loading") { fn(); }
      else { document.addEventListener("DOMContentLoaded", fn); }
    }
    ready(function () {
      var stage = document.querySelector(".cs-hero-stage");
      if (stage && !stage.getAttribute("data-cs-hero-bound")) {
        stage.setAttribute("data-cs-hero-bound", "1");
        var video = stage.querySelector("video.cs-ambient");
        var raf = null;
        var fadeVolume = function (to) {
          if (raf !== null) { window.cancelAnimationFrame(raf); raf = null; }
          var step = function () {
            var now = video.volume;
            var delta = to - now;
            if (Math.abs(delta) < 0.035) { video.volume = to; raf = null; return; }
            video.volume = now + delta * 0.14;
            raf = window.requestAnimationFrame(step);
          };
          raf = window.requestAnimationFrame(step);
        };
        stage.addEventListener("pointerenter", function () {
          video.muted = false;
          fadeVolume(0.55);
          stage.classList.add("is-audible");
        });
        stage.addEventListener("pointerleave", function () {
          fadeVolume(0);
          stage.classList.remove("is-audible");
          window.setTimeout(function () {
            if (!stage.classList.contains("is-audible")) { video.muted = true; }
          }, 500);
        });
      }
      var ways = document.querySelector('[data-card-name="Storefront Home+Ways Here" i]');
      if (ways && !ways.id) { ways.id = "cs-ways"; }
    });
  })();
  </script>
</body>`;

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
      default:
        console.error(`build-storefront-home: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

// GUARDS, enforced before anything is written.
function assertGuards(strings) {
  const failures = [];
  for (const [label, text] of strings) {
    if (text.includes("\u2014")) failures.push(`${label}: em-dash`);
    if (/Williamscraig/i.test(text)) failures.push(`${label}: family name (Williamscraig)`);
    if (/Wilner/i.test(text)) failures.push(`${label}: family name (Wilner)`);
  }
  return failures;
}

const args = parseArgs(process.argv.slice(2));

const guardInputs = [
  ...CARDS.map((c) => [`card ${c.name}`, c.content]),
  ["layout", LAYOUT_CONTENT],
];
const guardFailures = assertGuards(guardInputs);
if (guardFailures.length > 0) {
  console.error("build-storefront-home: GUARD FAILURES (nothing written):");
  for (const f of guardFailures) console.error(`  ${f}`);
  process.exit(1);
}

if (!existsSync(args.credentials)) {
  console.error(
    `build-storefront-home: no credentials file at ${args.credentials}\n` +
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

// 1. sign in
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, {
    status: res.status,
  });
  if (cookie === "") {
    console.error("build-storefront-home: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

// 2. the cards
const inventory = [];
let allOk = true;

for (const card of CARDS) {
  if (args.dryRun) {
    console.log(`would write: ${card.name} (${card.role})`);
    continue;
  }
  const existing = await request(`${cardPath(card.name)}.json`);
  const path = existing.status === 200 ? cardPath(card.name) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const res = await request(path, {
    method,
    body: JSON.stringify({ card: { name: card.name, content: card.content } }),
  });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  const readBack = ok ? await request(`${cardPath(card.name)}.json`) : null;
  const stored = readBack?.status === 200 ? readBack.body : "";
  const probe = card.content.split("\n")[0].replace(/<[^>]+>/g, "").slice(0, 40);
  const written = stored.includes(probe);
  allOk = allOk && ok && written;
  record(`card: ${card.name}`, ok && written, `${method} ${path} -> ${res.status}; read back ${readBack?.status ?? "-"}, ${readBack?.bytes ?? 0} bytes`, {
    method,
    status: res.status,
    readStatus: readBack?.status ?? null,
    readBytes: readBack?.bytes ?? 0,
    contentPresent: written,
  });
  inventory.push({
    name: card.name,
    role: card.role,
    write: method,
    writeStatus: res.status,
    readStatus: readBack?.status ?? null,
    bytes: readBack?.bytes ?? 0,
  });
}

// 3. the read rules: the deck's default for this type is "Anyone Signed In"
// (BasicCs+*read), so every card carries the per-card override the
// class-as-cards lane set: "+*self+*read" -> "[[Anyone]]".
const READ_RULE_TARGETS = [...CARDS.map((c) => c.name), LAYOUT_CARD];
for (const name of READ_RULE_TARGETS) {
  const ruleName = `${name}+*self+*read`;
  if (args.dryRun) {
    console.log(`would write: ${ruleName} -> [[Anyone]]`);
    continue;
  }
  const existing = await request(`${cardPath(ruleName)}.json`);
  const path = existing.status === 200 ? cardPath(ruleName) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const res = await request(path, {
    method,
    body: JSON.stringify({ card: { name: ruleName, content: "[[Anyone]]" } }),
  });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  allOk = allOk && ok;
  record(`read rule: ${ruleName}`, ok, `${method} ${path} -> ${res.status}; content [[Anyone]]`, {
    status: res.status,
  });
}

// 4. the view: the layout card (the storefront skin) and the per-card rule
if (!args.dryRun) {
  const layoutExisting = await request(`${cardPath(LAYOUT_CARD)}.json`);
  const layoutRes = await request(layoutExisting.status === 200 ? cardPath(LAYOUT_CARD) : "/", {
    method: layoutExisting.status === 200 ? "PUT" : "POST",
    body: JSON.stringify({ card: { name: LAYOUT_CARD, content: LAYOUT_CONTENT, type: "Layout" } }),
  });
  const layoutOk = layoutRes.status === 200 || layoutRes.status === 303 || layoutRes.status === 302;
  allOk = allOk && layoutOk;
  record("view: layout card", layoutOk, `POST/PUT ${LAYOUT_CARD} -> ${layoutRes.status}`, {
    status: layoutRes.status,
    location: layoutRes.headers.get("location"),
  });

  const ruleExisting = await request(`${cardPath(LAYOUT_RULE)}.json`);
  const ruleRes = await request(ruleExisting.status === 200 ? cardPath(LAYOUT_RULE) : "/", {
    method: ruleExisting.status === 200 ? "PUT" : "POST",
    body: JSON.stringify({ card: { name: LAYOUT_RULE, content: LAYOUT_CARD } }),
  });
  const ruleOk = ruleRes.status === 200 || ruleRes.status === 303 || ruleRes.status === 302;
  allOk = allOk && ruleOk;
  record("view: layout rule", ruleOk, `POST/PUT ${LAYOUT_RULE} -> ${ruleRes.status}`, {
    status: ruleRes.status,
  });
}

// 5. read the rendered page back through the engine (signed out) and check
// the load-bearing markup survived the render.
if (!args.dryRun) {
  const page = await fetch(`${args.baseUrl}/${encodeURIComponent(PAGE)}`, { redirect: "manual" });
  const html = await page.text();
  const articleStart = html.indexOf('<article class="container flex-shrink-0 cs-storefront"');
  const article = articleStart >= 0 ? html.slice(articleStart) : html;
  const sections = ["Hero", "The Library", "Training", "Certification", "Guardians of Peace", "Ways Here", "Handbook Excerpt", "Meet Brandon"];
  // The engine canonicalizes single-word junction parts ("+Hero") to
  // lowercase in the rendered data-card-name; match case-insensitively.
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slotAttr = (s) => new RegExp(`data-card-name="Storefront Home\\+${esc(s)}"`, "i");
  const checks = {
    pageStatus: page.status,
    layoutApplied: html.includes("cs-storefront") && html.includes("cs-hero-stage"),
    videoPresent: article.includes("<video") && article.includes(`${BUNNY_HOST}/${HERO_GUID}/original`),
    videoNoControls: !/cs-ambient[^>]*\scontrols[\s>]/.test(article),
    videoMutedAutoplayLoop: /cs-ambient[^>]*\smuted/.test(article) && /cs-ambient[^>]*\sautoplay/.test(article) && /cs-ambient[^>]*\sloop/.test(article),
    heroCopySlotPresent: slotAttr("Hero").test(article),
    sectionsPresent: sections.every((s) => slotAttr(s).test(article)),
    momentQuotePresent: article.includes("breathe so you push your hands apart"),
    handbookPresent: article.includes("psychological balance control and redirective communication"),
    chromeHeaderPresent: html.includes("Opportunities") && html.includes("Changes"),
    chromeSigninPresent: /sign in|Sign in|Sign In/.test(html),
    heroAudioJsPresent: html.includes("pointerenter") && html.includes("fadeVolume"),
    audioPillPresent: article.includes("cs-audio-pill") && article.includes("Hover for sound"),
    noFamilyNameInLaneContent: !/Williamscraig/i.test(article) && !/Wilner/i.test(article),
    noEmDashInPage: !html.includes("\u2014"),
  };
  const htmlOk = page.status === 200 && Object.entries(checks).every(([k, v]) => k === "pageStatus" || v === true);
  allOk = allOk && htmlOk;
  for (const [k, v] of Object.entries(checks)) {
    if (k !== "pageStatus" && !v) console.log(`FAIL  render check: ${k}`);
  }
  const greenCount = Object.entries(checks).filter(([k]) => k !== "pageStatus").filter(([, v]) => v).length;
  record(
    "render: page checks",
    htmlOk,
    `GET /${encodeURIComponent(PAGE)} -> ${page.status}, ${html.length} bytes; ${greenCount}/${Object.keys(checks).length - 1} checks green`,
    checks,
  );
  mkdirSync(dirname(args.out), { recursive: true });
  const receipt = {
    builtAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    pageUrl: `${args.baseUrl}/${encodeURIComponent(PAGE)}`,
    pageCard: PAGE,
    layoutCard: LAYOUT_CARD,
    layoutRule: LAYOUT_RULE,
    heroVideo: { host: BUNNY_HOST, guid: HERO_GUID, src: HERO_SRC, poster: HERO_POSTER, mappingSource: "library media_remote row for GMT20260401-212639_Recording (brandonDojoTech/tmp/library-on-bunny-2026-10-25/local-data/library.db, 19 rows)" },
    cards: inventory,
    renderChecks: checks,
    guards: {
      emDash: "none in any written content; checked in the rendered page too",
      familyNames: "none in anything this lane writes; the site chrome's own Opportunities menu lists the deck's pre-existing member cards, which is the demo deck's content, not this lane's",
      secrets: "receipt carries no credentials",
    },
    steps,
    passed: allOk,
  };
  writeFileSync(args.out, JSON.stringify(receipt, null, 2));
  console.log(`receipt: ${args.out}`);
}

if (args.dryRun) {
  console.log("dry run: nothing written");
  process.exit(0);
}
process.exit(allOk ? 0 : 1);
