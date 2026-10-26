#!/usr/bin/env node
// build-directions-b.mjs: build two front-door directions as real cards in the
// running demo deck (127.0.0.1:3118), through the engine's own write path.
//
//   node scripts/frontdoor-directions-b/build-directions-b.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--bunny-map <bunny-map.json>]
//     [--activity-photo <jpg>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// Everything is created with the same POST / and PUT /<card> calls the
// signed-in editor uses, so the cards land with the engine's own actions,
// references and nest closure. Nothing is poked into the database.
//
// DESIGN PASS 2026-10-26 (operator notes on the first renders):
//   5. Product grid: each tile carries a real thumbnail at its top showing
//      what that page is. The thumbnails are frames from the recorded
//      classes (the Bunny pull zone answers this page's referrer) except
//      the training tile, which carries the deck's own album photo of a
//      workshop circle, embedded as a data URL because the local deck copy
//      holds no image attachments.
//   6. Three doors: an image per door. The guest door shows a class in the
//      dojo (a recording frame), the member door shows the deck's own
//      activity photo, the student door shows a frame from the recorded
//      classes.
//   3. Words law: every quoted line set in type is Brandon's own recorded
//      words from the working sessions of 2026-10-16 and 2026-10-20, cited
//      to the session ("Brandon, working session" + date; no family name in
//      any card). Sources read this pass: brandonDojoTech
//      docs/plans/writing-for-brandon.md (rule 4, the universal-conflict
//      framing, 2026-10-16 session) and docs/reports/
//      meeting-summary-and-action-items-2026-10-20-1115.md (the 2026-10-20
//      11:15 session: the organization door's video proof, point 8; the
//      front page asking which one you came for, point 1; the citizen the
//      standard forms, point 12).
//   7. Calm CSS entrance animations and small SVG ornaments where images do
//      not serve; the page must not feel bare bones.
//
//   Direction 1, "Product grid": a storefront of the product lines, each a
//   visually self-contained tile with its own thumbnail, accent, one-line
//   pitch and one door. Cards: Culturesmith+Product Grid Door plus four tile
//   cards, seated by the per-card layout rule on the Product Grid Layout card.
//
//   Direction 2, "Three doors": the three ways to be here (Guest, Member,
//   Student) as three calm cards, each showing the place it opens. Cards:
//   Culturesmith+Three Doors plus three door cards, seated by the per-card
//   layout rule on the Three Doors Layout.
//
// SKIN MECHANISM (same mechanism the deck's own front door uses): a
// Layout-type card holds the page shell and the skin's stylesheet, and the
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
// English only, no em-dashes, no family name, no secrets. Nothing here
// deploys anywhere and nothing outside the loopback address is contacted.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS =
  "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_BUNNY_MAP = join(repoRoot, "tmp", "class-as-cards-20261025", "bunny-map.json");
const DEFAULT_ACTIVITY_PHOTO = join(repoRoot, "tmp", "homepage-variants-20261026", "assets", "hero-27689-135167.jpg");
const DEFAULT_OUT = join(repoRoot, "tmp", "frontdoor-design-pass-20261026", "directions-b-build-receipt.json");

const GRID_DOOR = "Culturesmith+Product Grid Door";
const GRID_LAYOUT = "Product Grid Layout";
const THREE_DOORS = "Culturesmith+Three Doors";
const THREE_LAYOUT = "Three Doors Layout";

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    credentials: DEFAULT_CREDENTIALS,
    bunnyMap: DEFAULT_BUNNY_MAP,
    activityPhoto: DEFAULT_ACTIVITY_PHOTO,
    out: DEFAULT_OUT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--bunny-map": args.bunnyMap = resolve(value); i += 1; break;
      case "--activity-photo": args.activityPhoto = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      case "--help":
        console.log(
          "build-directions-b: build the two front-door directions as real cards\n" +
          "  --base-url <url>          the running deck (default http://127.0.0.1:3118)\n" +
          "  --credentials <file>      the deck owner's credentials file\n" +
          "  --bunny-map <file>        the library's Bunny pull zone map\n" +
          "  --activity-photo <jpg>    the deck's album photo, embedded as a data URL\n" +
          "  --out <file>              receipt path (default tmp/frontdoor-design-pass-20261026/directions-b-build-receipt.json)\n" +
          "  --dry-run                 print the plan, write nothing",
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

for (const [label, path] of [["credentials", args.credentials], ["bunny map", args.bunnyMap], ["activity photo", args.activityPhoto]]) {
  if (!existsSync(path)) {
    console.error(`build-directions-b: no ${label} file at ${path}`);
    process.exit(2);
  }
}

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));
const bunnyMap = JSON.parse(readFileSync(args.bunnyMap, "utf8"));
const pullZone = `https://${bunnyMap.pullZoneHost}`;
const ACTIVITY_PHOTO_DATA_URL = `data:image/jpeg;base64,${readFileSync(args.activityPhoto).toString("base64")}`;

// Frames from the recorded classes (recording ids from the library's media
// map, probed answering 200 to this page's referrer on 2026-10-26):
//   guest door   GMT20260516-150842  a class in the dojo, teacher and students
//   student door GMT20260506-213002  two practitioners in movement
//   grid: library  GMT20260422-213706  two partners training
//   grid: training GMT20260407-012553  hands-on technique work
//   grid: certification GMT20260404-150833  a teacher and students bowing
//   grid: guardians GMT20260425-145604  an all-ages class practicing together
const POSTERS = {
  guestDoor: `${pullZone}/473264ea-0ded-4afc-8453-243d95b7cea3/thumbnail.jpg`,
  studentDoor: `${pullZone}/bfff3c0d-8587-4a03-9fe9-8075b664c014/thumbnail.jpg`,
  gridLibrary: `${pullZone}/0d499b8c-1258-4215-954d-7b930d02181e/thumbnail.jpg`,
  gridTraining: `${pullZone}/e96b1181-0b1d-4b10-aaee-26126818e919/thumbnail.jpg`,
  gridCertification: `${pullZone}/137098df-a27d-4351-aadb-828908824736/thumbnail.jpg`,
  gridGuardians: `${pullZone}/806c3fce-e8d1-4071-91b6-31a03013995a/thumbnail.jpg`,
};

// ---------------------------------------------------------------------------
// Direction 1: the Product Grid skin.
// Four tiles, four accents: Library (deep blue), Conflict Done Well training
// (vermilion), Certification (amber), Guardians of Peace (green). Each tile
// opens with a real photograph (operator note 5). Explicit background and
// text colors are set together on every element so the page keeps its
// contrast under a browser's forced dark mode.
// ---------------------------------------------------------------------------
const GRID_LAYOUT_CONTENT = [
  "<style>",
  "/* Product Grid skin. Scoped to pgd- classes inside .pgd-main; no other",
  "   page and no deck-wide card is touched. */",
  ".pgd-main { background: #f7f5f1; color: #26221c; padding-bottom: 4rem; }",
  ".pgd-head { max-width: 1100px; margin: 0 auto; padding: 3rem 1.25rem 0; text-align: center; }",
  ".pgd-kicker { font-size: .8rem; letter-spacing: .22em; text-transform: uppercase; color: #8a8071; margin: 0 0 .9rem;",
  "  opacity: 0; animation: pgdFade .7s ease both; }",
  ".pgd-headline { font-size: 1.65rem; line-height: 1.4; font-weight: 300; color: #26221c; margin: 0;",
  "  opacity: 0; animation: pgdFade .7s .08s ease both; }",
  ".pgd-orn { display: flex; align-items: center; justify-content: center; gap: .8rem; margin: 1.3rem auto 0;",
  "  opacity: 0; animation: pgdFade .7s .18s ease both; }",
  ".pgd-orn-line { width: 72px; height: 1px; background: #cfc6b4; }",
  "@keyframes pgdFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }",
  ".pgd-grid { max-width: 1240px; margin: 2.4rem auto 0; padding: 0 1.25rem; display: grid;",
  "  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 1.4rem; }",
  "  /* the deck nests each tile card inside a wrapper div; flex the wrapper so",
  "     every tile stretches to its row height and the doors align at the bottom */",
  ".pgd-grid > * { display: flex; }",
  ".pgd-tile { width: 100%; }",
  ".pgd-tile { background: #ffffff; color: #26221c; border: 1px solid #e4dfd6; border-top: 4px solid var(--pgd-accent, #26221c);",
  "  border-radius: 10px; overflow: hidden; display: flex; flex-direction: column;",
  "  transition: transform .2s ease, box-shadow .2s ease;",
  "  opacity: 0; transform: translateY(14px); animation: pgdTile .8s ease forwards; animation-delay: calc(.25s + var(--i)*.1s); }",
  "@keyframes pgdTile { to { opacity: 1; transform: none; } }",
  ".pgd-tile:hover { transform: translateY(-4px); box-shadow: 0 14px 30px rgba(38,34,28,.14); }",
  ".pgd-tile-media { aspect-ratio: 16 / 10; overflow: hidden; border-bottom: 1px solid #e4dfd6; background: #efece6; }",
  ".pgd-tile-media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s ease; }",
  ".pgd-tile:hover .pgd-tile-media img { transform: scale(1.05); }",
  ".pgd-tile-body { padding: 1.35rem 1.5rem 1.55rem; display: flex; flex-direction: column; align-items: flex-start; flex: 1; }",
  ".pgd-tile-icon { color: var(--pgd-accent, #26221c); }",
  ".pgd-tile-icon .material-icons { font-size: 2.3rem; }",
  ".pgd-eyebrow { font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: #8a8071; margin: .8rem 0 .25rem; }",
  ".pgd-name { font-size: 1.35rem; font-weight: 600; color: #26221c; margin: 0 0 .5rem; }",
  ".pgd-pitch { font-size: .98rem; line-height: 1.55; color: #4a443a; margin: 0 0 1.3rem; }",
  ".pgd-cap { font-size: .88rem; line-height: 1.55; font-style: italic; color: #4a443a; margin: 0 0 1.3rem;",
  "  padding-left: .8rem; border-left: 2px solid var(--pgd-accent, #cfc6b4); }",
  ".pgd-cite { display: block; margin-top: .4rem; font-size: .66rem; letter-spacing: .16em; text-transform: uppercase;",
  "  font-style: normal; color: #8a8071; }",
  ".pgd-door-btn { margin-top: auto; display: inline-block; background: var(--pgd-accent, #26221c); color: #ffffff !important;",
  "  font-size: .92rem; font-weight: 600; padding: .55rem 1.1rem; border-radius: 999px; text-decoration: none; }",
  ".pgd-door-btn:hover { filter: brightness(1.08); color: #ffffff; text-decoration: none; }",
  ".pgd-library { --pgd-accent: #14567f; }",
  ".pgd-training { --pgd-accent: #b0431f; }",
  ".pgd-certification { --pgd-accent: #a07310; }",
  ".pgd-guardians { --pgd-accent: #2e6b34; }",
  ".pgd-note { max-width: 900px; margin: 2.4rem auto 0; padding: 0 1.25rem; font-size: .82rem; line-height: 1.6; color: #8a8071; text-align: center; }",
  "@media (prefers-reduced-motion: reduce) {",
  "  .pgd-kicker, .pgd-headline, .pgd-orn, .pgd-tile { animation: none !important; opacity: 1 !important; transform: none !important; }",
  "  .pgd-tile, .pgd-tile-media img { transition: none !important; }",
  "}",
  "</style>",
  '<body class="d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="pgd-main flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

const PGD_DIAMOND =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' +
  '<rect x="2.8" y="2.8" width="6.4" height="6.4" transform="rotate(45 6 6)" fill="none" stroke="#a07310" stroke-width="1.1"/></svg>';

const tile = (cls, index, img, imgAlt, icon, eyebrow, name, pitch, cap, doorHref, doorLabel) =>
  [
    `<div class="pgd-tile ${cls}" style="--i:${index}">`,
    `  <div class="pgd-tile-media"><img src="${img}" alt="${imgAlt}"></div>`,
    `  <div class="pgd-tile-body">`,
    `  <div class="pgd-tile-icon"><span class="material-icons">${icon}</span></div>`,
    `  <div class="pgd-eyebrow">${eyebrow}</div>`,
    `  <h3 class="pgd-name">${name}</h3>`,
    `  <p class="pgd-pitch">${pitch}</p>`,
    ...(cap ? [`  <p class="pgd-cap">${cap}</p>`] : []),
    `  <a class="pgd-door-btn" href="${doorHref}">${doorLabel}</a>`,
    `  </div>`,
    `</div>`,
  ].join("\n");

const GRID_DOOR_CONTENT = [
  '<div class="pgd-head">',
  '  <p class="pgd-kicker">Culturesmith</p>',
  "  <h2 class=\"pgd-headline\">All of business and life is a sea of conflict. Most organizations improvise. We give them a jumpstart.</h2>",
  `  <div class="pgd-orn" aria-hidden="true"><span class="pgd-orn-line"></span>${PGD_DIAMOND}<span class="pgd-orn-line"></span></div>`,
  "</div>",
  '<div class="pgd-grid">',
  `{{${GRID_DOOR}+Library Tile}}`,
  `{{${GRID_DOOR}+Training Tile}}`,
  `{{${GRID_DOOR}+Certification Tile}}`,
  `{{${GRID_DOOR}+Guardians Tile}}`,
  "</div>",
  '<p class="pgd-note">One of two front-door directions built as real cards in this deck. The tile photographs are frames from the recorded classes and the deck\'s own album photo; the words in quotation marks are Brandon\'s recorded words from the working sessions of October 16 and 20, 2026. The Guardians of Peace page exists here and is still empty, so its door opens a page held ready for the proposal text.</p>',
].join("\n");

const GRID_CARDS = [
  {
    name: `${GRID_DOOR}+Library Tile`,
    role: "direction 1 tile: the recorded classes",
    content: tile(
      "pgd-library",
      0,
      POSTERS.gridLibrary,
      "Two partners training together in the dojo",
      "play_circle_filled",
      "The recorded classes",
      "The Library",
      "Every recorded class, searchable, with the handbook alongside.",
      "",
      "https://culturesmith-library.bunny.run",
      "Enter the Library",
    ),
  },
  {
    name: `${GRID_DOOR}+Training Tile`,
    role: "direction 1 tile: Conflict Done Well training",
    content: tile(
      "pgd-training",
      1,
      POSTERS.gridTraining,
      "Hands-on technique training in the dojo",
      "sports_martial_arts",
      "For teams and organizations",
      "Conflict Done Well",
      "Improved conflict skills mean more effective teamwork and creative problem-solving, for individuals and groups.",
      `"They need a video of seeing the people that look exactly like them and their people doing the thing that we're doing, and smiling."` +
        `<cite class="pgd-cite">Brandon, working session, October 20, 2026</cite>`,
      "/Conflict_Done_Well",
      "See the training",
    ),
  },
  {
    name: `${GRID_DOOR}+Certification Tile`,
    role: "direction 1 tile: the certification names",
    content: tile(
      "pgd-certification",
      2,
      POSTERS.gridCertification,
      "A teacher and students bowing in the dojo",
      "verified_user",
      "For practitioners and organizations",
      "Certification",
      "Peace Practices Approved marks the organization; Conflict Done Well Certified marks the practitioner.",
      "",
      "/Make_Contact",
      "Start with a conversation",
    ),
  },
  {
    name: `${GRID_DOOR}+Guardians Tile`,
    role: "direction 1 tile: the community standard",
    content: tile(
      "pgd-guardians",
      3,
      POSTERS.gridGuardians,
      "A class of students of all ages practicing together",
      "groups",
      "A community standard",
      "Guardians of Peace",
      "An open proposal to the world, not a product: the standard the certification names descend from.",
      `"a well-informed, thoughtful, subtle, honest citizen."` +
        `<cite class="pgd-cite">Brandon, working session, October 20, 2026</cite>`,
      "/Guardians_of_Peace",
      "Read the proposal",
    ),
  },
];

// ---------------------------------------------------------------------------
// Direction 2: the Three Doors skin.
// Three calm cards, one per way to be here, each opening with a real image of
// the place it leads to (operator note 6). Serif display type, generous
// whitespace. Explicit color pairs everywhere so the page keeps its contrast
// under a browser's forced dark mode.
// ---------------------------------------------------------------------------
const THREE_LAYOUT_CONTENT = [
  "<style>",
  "/* Three Doors skin. Scoped to td- classes inside .td-main; no other page",
  "   and no deck-wide card is touched. */",
  ".td-main { background: #fbfaf7; color: #29241d; }",
  ".td-stage { max-width: 1240px; margin: 0 auto; padding: 4.2rem 2rem 5.5rem; }",
  ".td-kicker { text-align: center; font-size: .8rem; letter-spacing: .3em; text-transform: uppercase; color: #96896f; margin: 0 0 1rem;",
  "  opacity: 0; animation: tdFade .7s ease both; }",
  ".td-line { text-align: center; font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;",
  "  font-size: 2.4rem; font-weight: 400; color: #29241d; margin: 0;",
  "  opacity: 0; animation: tdFade .7s .08s ease both; }",
  ".td-subquote { text-align: center; font-family: Georgia, 'Times New Roman', serif; font-style: italic;",
  "  font-size: 1.06rem; color: #6d6353; margin: 1rem auto 0; max-width: 46ch;",
  "  opacity: 0; animation: tdFade .7s .18s ease both; }",
  ".td-cite { display: block; margin-top: .45rem; font-size: .68rem; letter-spacing: .2em; text-transform: uppercase;",
  "  font-style: normal; color: #96896f; }",
  ".td-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3rem; margin-top: 3.6rem; }",
  "@media (max-width: 900px) { .td-cards { grid-template-columns: 1fr; gap: 2.5rem; } }",
  "  /* the deck nests each door card inside a wrapper div; flex the wrapper so",
  "     every door stretches to its row height and the links align at the bottom */",
  ".td-cards > * { display: flex; }",
  ".td-door { border-top: 2px solid #d9d2c2; padding-top: 1.7rem; width: 100%; display: flex; flex-direction: column; align-items: flex-start;",
  "  opacity: 0; transform: translateY(14px); animation: tdDoor .8s ease forwards; animation-delay: calc(.28s + var(--i)*.12s); }",
  "@keyframes tdFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }",
  "@keyframes tdDoor { to { opacity: 1; transform: none; } }",
  ".td-media { margin: 0 0 1.3rem; border-radius: 6px; overflow: hidden; aspect-ratio: 4 / 3; background: #efece6; }",
  ".td-media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }",
  ".td-door:hover .td-media img { transform: scale(1.04); }",
  ".td-num { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 1rem; color: #96896f; margin: 0 0 .4rem; }",
  ".td-name { font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif;",
  "  font-size: 3rem; font-weight: 400; line-height: 1.1; color: #29241d; margin: 0 0 .2rem; }",
  ".td-world { font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #96896f; margin: 0 0 1.1rem; }",
  ".td-sentence { font-size: 1.08rem; line-height: 1.65; color: #45403a; margin: 0 0 1.6rem; max-width: 30ch; }",
  ".td-link { font-size: .95rem; font-weight: 600; color: #7a4a12 !important; text-decoration: none;",
  "  border-bottom: 2px solid #d9c49a; padding-bottom: .15rem; margin-top: auto; }",
  ".td-link:hover { color: #5c370d; border-bottom-color: #7a4a12; text-decoration: none; }",
  ".td-note { margin: 4.5rem auto 0; max-width: 760px; text-align: center; font-size: .82rem; line-height: 1.6; color: #96896f; }",
  "@media (prefers-reduced-motion: reduce) {",
  "  .td-kicker, .td-line, .td-subquote, .td-door { animation: none !important; opacity: 1 !important; transform: none !important; }",
  "  .td-media img { transition: none !important; }",
  "}",
  "</style>",
  '<body class="d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="td-main flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

const doorCard = (num, index, img, imgAlt, name, world, sentence, href, label) =>
  [
    `<div class="td-door" style="--i:${index}">`,
    `  <div class="td-media"><img src="${img}" alt="${imgAlt}"></div>`,
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
  '  <p class="td-subquote">"the only thing the front page asks is which one you came for."' +
    '<cite class="td-cite">Brandon, working session, October 20, 2026</cite></p>',
  '<div class="td-cards">',
  `{{${THREE_DOORS}+Guest Door}}`,
  `{{${THREE_DOORS}+Member Door}}`,
  `{{${THREE_DOORS}+Student Door}}`,
  "</div>",
  '<p class="td-note">One of two front-door directions built as real cards in this deck. Each door opens with the place it leads to: a class in the dojo, the practice in a workshop, a frame from the recorded classes. The words in quotation marks are Brandon\'s recorded words from the working session of October 20, 2026.</p>',
  "</div>",
].join("\n");

const THREE_CARDS = [
  {
    name: `${THREE_DOORS}+Guest Door`,
    role: "direction 2 door: guest, practice",
    content: doorCard(
      "One",
      0,
      POSTERS.guestDoor,
      "A teacher working with two students in the dojo",
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
      1,
      ACTIVITY_PHOTO_DATA_URL,
      "A group practicing in a circle in a workshop",
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
      2,
      POSTERS.studentDoor,
      "Two practitioners in movement on the mat",
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

if (args.dryRun) {
  console.log("build-directions-b: dry run; the build would write:");
  for (const l of LAYOUTS) console.log(`  layout: ${l.name}`);
  for (const d of DOORS) console.log(`  card:   ${d.name} (${d.content.length} bytes)`);
  for (const r of RULES) console.log(`  rule:   ${r.name}`);
  process.exit(0);
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
  const result = await writeCard(layout, "Layout");
  record(`layout: ${layout.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: layout.name, role: layout.role, ...result });
}

// 3. the doors and their children (HTML type, so the classes survive the save)
for (const card of DOORS) {
  const result = await writeCard(card, "HTML");
  record(`card: ${card.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: card.name, role: card.role, ...result });
}

// 4. the seating rules
for (const rule of RULES) {
  const result = await writeCard(rule);
  record(`rule: ${rule.name}`, result.ok, `${result.method} ${result.path} -> ${result.status}; read back ${result.readStatus}, ${result.readBytes} bytes`, result);
  inventory.push({ name: rule.name, role: rule.role, ...result });
}

// 5. read each door back through the engine, through its own layout, and
// confirm the landing page carries neither direction (this build never PUTs
// Home; other front-door lanes share that card)
const views = [];
{
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

  const expectations = {
    [GRID_DOOR]: {
      marker: "pgd-main",
      contentChecks: {
        fourTileMedia: (body) => (body.match(/class="pgd-tile-media"/g) ?? []).length === 4,
        trainingQuote: (body) => body.includes("They need a video of seeing the people that look exactly like them"),
        guardiansQuote: (body) => body.includes("a well-informed, thoughtful, subtle, honest citizen."),
        citations: (body) => (body.match(/working session, October 20, 2026/g) ?? []).length === 2 && body.includes("October 16 and 20, 2026"),
        headlineFraming: (body) => body.includes("All of business and life is a sea of conflict."),
      },
    },
    [THREE_DOORS]: {
      marker: "td-main",
      contentChecks: {
        threeDoorMedia: (body) => (body.match(/class="td-media"/g) ?? []).length === 3,
        activityPhotoEmbedded: (body) => body.includes("data:image/jpeg;base64,"),
        sublineQuote: (body) => body.includes("the only thing the front page asks is which one you came for."),
        noFamilyName: (body) => !body.includes("Williamscraig"),
      },
    },
  };

  for (const door of [GRID_DOOR, THREE_DOORS]) {
    const res = await request(cardPath(door));
    const expect = expectations[door];
    const layoutLive = res.body.includes(expect.marker);
    const contentChecks = {};
    for (const [label, fn] of Object.entries(expect.contentChecks)) contentChecks[label] = fn(res.body);
    record(
      `view: ${door}`,
      res.status === 200 && layoutLive && Object.values(contentChecks).every(Boolean),
      `GET ${cardPath(door)} -> ${res.status}, ${res.bytes} bytes, skin live ${layoutLive}`,
      { status: res.status, bytes: res.bytes, skinLive: layoutLive, contentChecks },
    );
    views.push({ path: cardPath(door), status: res.status, bytes: res.bytes, skinLive: layoutLive, contentChecks });
  }
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  pass: "design-pass-20261026",
  directions: {
    productGrid: { door: GRID_DOOR, layout: GRID_LAYOUT, url: `${args.baseUrl}/${encodeURIComponent(GRID_DOOR)}` },
    threeDoors: { door: THREE_DOORS, layout: THREE_LAYOUT, url: `${args.baseUrl}/${encodeURIComponent(THREE_DOORS)}` },
  },
  homeCard: "not touched (shared with the other front-door lanes; seating a picked direction on Home is one PUT)",
  imagery: {
    posterFrames: POSTERS,
    activityPhoto: "the deck's own album photo, embedded as a data URL (the local deck copy holds no image attachments)",
  },
  words: {
    brandonQuotes: [
      { text: "All of business and life is a sea of conflict. Most organizations improvise. We give them a jumpstart.", session: "2026-10-16 working session", source: "brandonDojoTech docs/plans/writing-for-brandon.md rule 4" },
      { text: "They need a video of seeing the people that look exactly like them and their people doing the thing that we're doing, and smiling.", session: "2026-10-20 11:15 working session", source: "brandonDojoTech docs/reports/meeting-summary-and-action-items-2026-10-20-1115.md point 8" },
      { text: "the only thing the front page asks is which one you came for.", session: "2026-10-20 11:15 working session", source: "same record, point 1" },
      { text: "a well-informed, thoughtful, subtle, honest citizen.", session: "2026-10-20 11:15 working session", source: "same record, point 12" },
    ],
  },
  cards: inventory,
  views,
  passed: steps.length - failed.length,
  total: steps.length,
  steps,
};
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, JSON.stringify(receipt, null, 2) + "\n");
console.log("");
console.log(`${receipt.passed}/${receipt.total} checks passed`);
console.log(`receipt: ${args.out}`);
process.exit(failed.length === 0 ? 0 : 1);
