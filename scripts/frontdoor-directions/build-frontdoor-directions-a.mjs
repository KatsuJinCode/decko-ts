#!/usr/bin/env node
// build-frontdoor-directions-a.mjs: build TWO front-door directions as real
// cards in the running demo scratch deck (lane frontdoor-directions-a).
//
//   node scripts/frontdoor-directions/build-frontdoor-directions-a.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--credentials <file>]
//     [--media <media-remote.json>]
//     [--class-values <class-values.json>]
//     [--bunny-map <bunny-map.json>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// DESIGN PASS 2026-10-26 (operator notes on the first renders):
//   1. The April 21 2026 class poster (a shot of Eric) is off the wall.
//   2. The library hero line is value-framed at the operator's direction
//      ("years of knowledge, one click away" was his spitball); no recorded
//      Brandon words exist for that slot.
//   3. Words law: every quoted line set in type is Brandon's own recorded
//      words from the working sessions of 2026-10-16 and 2026-10-20, cited
//      to the session. Sources read this pass:
//      brandonDojoTech docs/plans/writing-for-brandon.md (rule 4, the
//      universal-conflict framing, 2026-10-16 session) and docs/reports/
//      meeting-summary-and-action-items-2026-10-20-1115.md (the 2026-10-20
//      11:15 session: the victory condition and the leadership bar, points
//      1 and 12). Citations in the cards read "Brandon, working session"
//      with the date; no family name appears in any card.
//   4. Editorial contents entries carry small real thumbnails (frames from
//      the recorded classes).
//   7. Small SVG ornaments and calm CSS entrance animations where images do
//      not serve; the page must not feel bare bones.
//
// HOW IT RENDERS THROUGH THE ENGINE: each direction is a Layout card (the
// page shell: the site's real header and footer nests, the deck's compiled
// asset bundles from this host's /files routes, and the direction's own
// stylesheet) plus the door card whose content carries the page body, seated
// with the deck's own per-card layout rule (<door>+*self+*layout).
//
// The Home card is NOT touched: other lanes own the landing page this week.
//
// Class imagery: the pull zone answers a signed-in-page referrer with the
// poster frames of every mapped recording (19 of 19 probed 2026-10-26). The
// wall shows 18 of them; the April 21 recording is held back per operator
// note 1. Where the library has not yet named a recording, the wall shows
// the recording's date, and the page says so.
//
// Exit code 0 when every card was written and read back and both pages
// answer signed out with their direction markers, 1 otherwise. Nothing here
// deploys anywhere and nothing outside the loopback address is written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_MEDIA = join(repoRoot, "tmp", "storefront-lane-media-remote.json");
const DEFAULT_CLASS_VALUES = join(repoRoot, "tmp", "class-as-cards-20261025", "class-values.json");
const DEFAULT_BUNNY_MAP = join(repoRoot, "tmp", "class-as-cards-20261025", "bunny-map.json");
const DEFAULT_OUT = join(repoRoot, "tmp", "frontdoor-design-pass-20261026", "directions-a-build-receipt.json");

const LIB_DOOR = "Culturesmith+Front Door Library";
const LIB_LAYOUT = "Library First Layout";
const ED_DOOR = "Culturesmith+Front Door Editorial";
const ED_LAYOUT = "Editorial Layout";

const LIBRARY_BASE = "https://culturesmith-library.bunny.run";
const BUNDLE_TAGS =
  '<link rel="stylesheet" href="/files/~45514/0000000001.css">\n' +
  '<script src="/files/~50617/0000000002.js"></script>';

// Operator note 1, 2026-10-26: this recording's poster is a shot of Eric;
// it comes off the front page.
const ERIC_RECORDING_ID = "GMT20260421-012936_Recording";

// --- values ------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    credentials: DEFAULT_CREDENTIALS,
    media: DEFAULT_MEDIA,
    classValues: DEFAULT_CLASS_VALUES,
    bunnyMap: DEFAULT_BUNNY_MAP,
    out: DEFAULT_OUT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--media": args.media = resolve(value); i += 1; break;
      case "--class-values": args.classValues = resolve(value); i += 1; break;
      case "--bunny-map": args.bunnyMap = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      default:
        console.error(`build-frontdoor-directions-a: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "GMT20260401-212639_Recording" -> { iso: "2026-04-01", pretty: "April 1, 2026" } */
function recordingDate(recordingId) {
  const m = /GMT(\d{4})(\d{2})(\d{2})/.exec(recordingId);
  if (!m) return { iso: "", pretty: "Recorded class" };
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const pretty = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  return { iso, pretty };
}

const minutes = (sec) => Math.round(sec / 60);

/** The wall rows, oldest first, the snapshotted class first as featured. */
function buildWall(media, classValues, pullZoneHost) {
  const featuredId = classValues.title ? "GMT20260401-212639_Recording" : "";
  const rows = media.map((r) => ({
    id: r.recording_id,
    guid: r.remote_id,
    poster: `https://${pullZoneHost}/${r.remote_id}/thumbnail.jpg`,
    date: recordingDate(r.recording_id),
    mins: minutes(r.duration_sec),
    featured: r.recording_id === featuredId,
  }));
  rows.sort((a, b) => (a.date.iso < b.date.iso ? -1 : a.date.iso > b.date.iso ? 1 : a.id < b.id ? -1 : 1));
  return rows;
}

const posterUrl = (pullZoneHost, recordingId, media) => {
  const row = media.find((r) => r.recording_id === recordingId);
  if (!row) throw new Error(`no media row for ${recordingId}`);
  return `https://${pullZoneHost}/${row.remote_id}/thumbnail.jpg`;
};

// --- direction 1: Library-first ----------------------------------------------

const libCss = `
.w-lib-page{background:#0e1114;color:#e8e6e1;margin:0}
.w-lib-hero{position:relative;overflow:hidden;padding:6rem 1.5rem 4.75rem;text-align:center}
.w-lib-hero>*{position:relative}
.w-lib-hero-bg{position:absolute;inset:-4% 0;background:url("__HERO_POSTER__") center/cover no-repeat;
  animation:wLibDrift 24s ease-out both;transform-origin:50% 40%}
@keyframes wLibDrift{from{transform:scale(1.09)}to{transform:scale(1)}}
.w-lib-hero-veil{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(10,12,15,.8) 0%,rgba(10,12,15,.68) 42%,rgba(10,12,15,.94) 88%,#0e1114 100%)}
.w-lib-kicker{font-size:.78rem;letter-spacing:.46em;color:#c8b89a;text-transform:uppercase;margin:0 0 1.15rem}
.w-lib-h1{font-family:Georgia,'Times New Roman',serif;font-size:clamp(2.1rem,4.2vw,3.3rem);line-height:1.14;
  margin:0 auto 1.5rem;max-width:19em;font-weight:600;color:#f4f2ed;text-wrap:balance}
.w-lib-search{display:flex;gap:.5rem;justify-content:center;max-width:640px;margin:0 auto}
.w-lib-search input[type=text]{flex:1;font-size:1.15rem;padding:.85rem 1.1rem;border-radius:8px;border:1px solid #3a4048;background:#171b20;color:#f0eee9;outline:none}
.w-lib-search input[type=text]:focus{border-color:#c8b89a}
.w-lib-search button{font-size:1.05rem;padding:.85rem 1.6rem;border-radius:8px;border:0;background:#c8b89a;color:#17130a;font-weight:600;cursor:pointer}
.w-lib-search button:hover{background:#d8c9ad}
.w-lib-corpus{font-size:.95rem;color:#b9b4a8;margin:1.15rem auto 0}
.w-lib-orn{display:flex;align-items:center;gap:.9rem;max-width:1280px;margin:0 auto;padding:0 1.5rem}
.w-lib-orn .w-lib-orn-line{flex:1;height:1px;background:linear-gradient(90deg,rgba(200,184,154,0),rgba(200,184,154,.55))}
.w-lib-orn .w-lib-orn-line:last-child{background:linear-gradient(90deg,rgba(200,184,154,.55),rgba(200,184,154,0))}
.w-lib-orn svg{flex:none;opacity:.9}
.w-lib-wall{max-width:1280px;margin:0 auto;padding:2.4rem 1.5rem 1.6rem;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.w-lib-card{position:relative;display:block;border-radius:10px;overflow:hidden;background:#171b20;border:1px solid #262c33;
  transition:transform .18s ease,box-shadow .18s ease;
  opacity:0;transform:translateY(16px);animation:wLibUp .85s ease forwards;animation-delay:calc(var(--i)*45ms)}
@keyframes wLibUp{to{opacity:1;transform:none}}
.w-lib-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.55)}
.w-lib-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;transition:transform .3s ease}
.w-lib-card:hover img{transform:scale(1.04)}
.w-lib-play{position:absolute;top:.6rem;right:.6rem;width:30px;height:30px;border-radius:99px;
  background:rgba(10,12,15,.55);display:flex;align-items:center;justify-content:center;opacity:.9;transition:opacity .18s ease,background .18s ease}
.w-lib-card:hover .w-lib-play{opacity:1;background:rgba(200,184,154,.85)}
.w-lib-card .w-lib-cap{position:absolute;left:0;right:0;bottom:0;padding:1.6rem .8rem .55rem;
  background:linear-gradient(180deg,rgba(10,12,15,0),rgba(10,12,15,.92));font-size:.85rem;color:#e8e6e1}
.w-lib-card .w-lib-date{font-weight:600}
.w-lib-card .w-lib-min{color:#b9b4a8;margin-left:.4rem}
.w-lib-featured{grid-column:span 2;grid-row:span 1}
.w-lib-featured img{aspect-ratio:2/1}
.w-lib-featured .w-lib-title{font-size:1.25rem;font-weight:600;color:#f4f2ed;display:block;margin:.15rem 0 .3rem}
.w-lib-chip{display:inline-block;font-size:.72rem;padding:.14rem .5rem;margin:.12rem .25rem 0 0;border-radius:99px;border:1px solid #4a4436;color:#d8cbae}
.w-lib-quiet{max-width:1280px;margin:0 auto;padding:1.6rem 1.5rem 2.4rem;border-top:1px solid rgba(255,255,255,.12)}
.w-lib-quiet-label{font-size:.75rem;letter-spacing:.3em;color:#8b867b;text-transform:uppercase;margin:0 0 .9rem}
.w-lib-quiet-row{display:flex;flex-wrap:wrap;gap:2.2rem}
.w-lib-quiet-item{flex:1;min-width:240px;font-size:.92rem;color:#b9b4a8;display:flex;gap:.85rem;align-items:flex-start}
.w-lib-quiet-item svg{flex:none;margin-top:.15rem;opacity:.9}
.w-lib-quiet-item a{color:#e8e6e1;font-weight:600;text-decoration:none;border-bottom:1px solid #c8b89a;transition:color .15s ease}
.w-lib-quiet-item a:hover{color:#c8b89a}
.w-lib-note{max-width:1280px;margin:0 auto;padding:0 1.5rem 2.6rem;font-size:.8rem;color:#7d786d}
.w-lib-note a{color:#a49e8f}
@media (prefers-reduced-motion: reduce){
  .w-lib-hero-bg,.w-lib-card{animation:none!important;opacity:1!important;transform:none!important}
  .w-lib-card,.w-lib-card img{transition:none!important}
}
@media (max-width:1100px){.w-lib-wall{grid-template-columns:repeat(2,1fr)}}
@media (max-width:640px){.w-lib-wall{grid-template-columns:1fr}.w-lib-search{flex-direction:column}}
`;

const DIAMOND_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">' +
  '<rect x="3.2" y="3.2" width="7.6" height="7.6" transform="rotate(45 7 7)" fill="none" stroke="#c8b89a" stroke-width="1.1"/></svg>';
const PLAY_SVG =
  '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">' +
  '<path d="M3 1.8v7.4l6-3.7z" fill="#e8e6e1"/></svg>';
const QUIET_ICONS = {
  training:
    '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.4" fill="none" stroke="#c8b89a" stroke-width="1.1"/><path d="M6.6 12.6c1-2.6 2.4-4 3.4-4s2.4 1.4 3.4 4" fill="none" stroke="#c8b89a" stroke-width="1.1" stroke-linecap="round"/></svg>',
  certification:
    '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="8" r="4.6" fill="none" stroke="#c8b89a" stroke-width="1.1"/><path d="M7.6 11.6 6.4 16l3.6-1.9L13.6 16l-1.2-4.4" fill="none" stroke="#c8b89a" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  guardians:
    '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.4 16 5v4.6c0 3.8-2.6 6.4-6 8-3.4-1.6-6-4.2-6-8V5z" fill="none" stroke="#c8b89a" stroke-width="1.1" stroke-linejoin="round"/></svg>',
};

const libLayoutContent = (heroPoster) =>
  [
    // A plain body tag: the deck's own h-100 flex body pins height to the
    // viewport and a full-page capture then repeats the overflow; the
    // direction's footer needs no sticky-bottom machinery.
    "<body>",
    BUNDLE_TAGS,
    `<style>${libCss.replace("__HERO_POSTER__", heroPoster)}</style>`,
    '<div class="w-lib-page">',
    "  <header>{{:header|core}}</header>",
    '  <section class="w-lib-hero">',
    '    <div class="w-lib-hero-bg" aria-hidden="true"></div>',
    '    <div class="w-lib-hero-veil" aria-hidden="true"></div>',
    '    <p class="w-lib-kicker">The Library</p>',
    '    <h1 class="w-lib-h1">Years of knowledge, one click away.</h1>',
    '    <form role="search" class="w-lib-search" action="/*search" accept-charset="UTF-8" method="get">' +
    '<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />' +
    '<input type="text" name="query[keyword]" class="w-lib-q" autocomplete="off" placeholder="Search the classes" />' +
    "<button type=\"submit\">Search</button></form>",
    '    <p class="w-lib-corpus">__CORPUS_LINE__</p>',
    "  </section>",
    '  <main>{{_main|content}}</main>',
    "</div>",
    '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
    "</body>",
  ].join("\n");

function libDoorContent(wall, classValues) {
  const shown = wall.filter((r) => !r.featured && r.id !== ERIC_RECORDING_ID);
  const featured = wall.find((r) => r.featured);
  const parts = [];
  parts.push('  <div class="w-lib-orn" aria-hidden="true">');
  parts.push(`    <span class="w-lib-orn-line"></span>${DIAMOND_SVG}<span class="w-lib-orn-line"></span>`);
  parts.push("  </div>");
  parts.push('<div class="w-lib-wall">');
  if (featured) {
    const chips = classValues.segments
      .map((s) => `<span class="w-lib-chip">${escapeHtml(s.name.split(" · ")[0])}</span>`)
      .join("");
    parts.push(
      `<a class="w-lib-card w-lib-featured" style="--i:0" href="${LIBRARY_BASE}/classes/${featured.id}" rel="noopener">` +
        `<img src="${featured.poster}" alt="A moment from the class of ${featured.date.pretty}">` +
        `<span class="w-lib-play" aria-hidden="true">${PLAY_SVG}</span>` +
        '<span class="w-lib-cap"><span class="w-lib-date">' + featured.date.pretty + "</span>" +
        '<span class="w-lib-min">' + featured.mins + ' min</span>' +
        '<span class="w-lib-title">' + escapeHtml(classValues.title.h1) + "</span>" +
        chips + "</span></a>",
    );
  }
  shown.forEach((r, i) => {
    parts.push(
      `<a class="w-lib-card" style="--i:${i + 1}" href="${LIBRARY_BASE}/classes/${r.id}" rel="noopener">` +
        `<img src="${r.poster}" alt="A moment from the class of ${r.date.pretty}">` +
        `<span class="w-lib-play" aria-hidden="true">${PLAY_SVG}</span>` +
        '<span class="w-lib-cap"><span class="w-lib-date">' + r.date.pretty + "</span>" +
        '<span class="w-lib-min">' + r.mins + " min</span></span></a>",
    );
  });
  parts.push("</div>");
  parts.push('<div class="w-lib-quiet">');
  parts.push('  <p class="w-lib-quiet-label">Beyond the classes</p>');
  parts.push('  <div class="w-lib-quiet-row">');
  parts.push(
    `    <p class="w-lib-quiet-item">${QUIET_ICONS.training}<span><a href="/Conflict_Done_Well">Conflict Done Well training</a><br>the method, brought to teams, schools and organizations</span></p>`,
  );
  parts.push(
    `    <p class="w-lib-quiet-item">${QUIET_ICONS.certification}<span><a href="/Make_Contact">Certification</a><br>Conflict Done Well Certified for practitioners, Peace Practices Approved for organizations</span></p>`,
  );
  parts.push(
    `    <p class="w-lib-quiet-item">${QUIET_ICONS.guardians}<span><a href="/Guardians_of_Peace">Guardians of Peace</a><br>the open community standard, not a product</span></p>`,
  );
  parts.push("  </div>");
  parts.push("</div>");
  parts.push(
    '<p class="w-lib-note">A design proposal rendered in the decko demo. Real here: the search (the site\'s own), every link, and the class posters, pulled from the recorded classes (the April 21, 2026 poster is held back at the operator\'s direction). Titles show recording dates because the library has named one of these recordings in this deck so far. Machine-assisted, prepared for review.</p>',
  );
  return parts.join("\n");
}

// --- direction 2: Editorial ----------------------------------------------------

const edCss = `
.w-ed-page{background:#f7f3ea;color:#17150f;font-family:Georgia,'Times New Roman',serif;margin:0}
.w-ed-inner{max-width:860px;margin:0 auto;padding:3rem 1.5rem 2.6rem}
.w-ed-masthead{text-align:center;margin:0 0 3.2rem}
.w-ed-masthead .w-ed-site{font-size:1.9rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin:0}
.w-ed-masthead .w-ed-tag{font-size:.85rem;letter-spacing:.28em;text-transform:uppercase;color:#6b6353;margin:.5rem 0 0}
.w-ed-rule{border:0;border-top:1px solid #17150f;margin:1.2rem 0 0;transform-origin:center;animation:wEdRule .9s ease both}
.w-ed-rule-double{border:0;border-top:1px solid #17150f;border-bottom:1px solid #17150f;height:3px;margin:.9rem 0 0;transform-origin:center;animation:wEdRule .9s .12s ease both}
@keyframes wEdRule{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.w-ed-fleuron{margin:1.1rem auto 0;color:#a3987e;animation:wEdFade .9s .3s ease both}
.w-ed-cover{margin:0 0 3rem}
.w-ed-statement{font-size:clamp(2.4rem,5vw,3.9rem);line-height:1.12;font-weight:600;margin:0 0 1.3rem;animation:wEdFade .8s ease both}
.w-ed-sub{font-size:1.35rem;font-style:italic;color:#3d382d;margin:0 0 1.4rem;animation:wEdFade .8s .1s ease both}
.w-ed-stand{font-size:.85rem;letter-spacing:.32em;text-transform:uppercase;color:#6b6353;margin:0;animation:wEdFade .8s .18s ease both}
@keyframes wEdFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.w-ed-epigraph{margin:2.1rem 0 0;padding-left:1.3rem;border-left:2px solid #a3987e;animation:wEdFade .8s .28s ease both}
.w-ed-epigraph p{margin:0;font-size:1.18rem;font-style:italic;line-height:1.5;color:#2c2820}
.w-ed-cite{display:block;margin-top:.5rem;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;font-style:normal;color:#8a7f66}
.w-ed-contents-label{font-size:.8rem;letter-spacing:.34em;text-transform:uppercase;color:#6b6353;margin:2.6rem 0 .4rem}
.w-ed-entry{display:grid;grid-template-columns:88px 108px 1fr;gap:1.2rem;padding:1.3rem 0;border-top:1px solid #c9c1ad;align-items:start;
  opacity:0;transform:translateY(12px);animation:wEdEntry .7s ease forwards;animation-delay:calc(.35s + var(--i)*.12s)}
@keyframes wEdEntry{to{opacity:1;transform:none}}
.w-ed-num{font-size:2.1rem;font-weight:400;color:#a3987e;line-height:1}
.w-ed-thumb{display:block;width:108px;aspect-ratio:1/1;object-fit:cover;border:1px solid #c9c1ad;border-radius:2px;
  filter:sepia(.28) saturate(.92);transition:filter .25s ease,transform .25s ease}
.w-ed-entry:hover .w-ed-thumb{filter:sepia(0) saturate(1);transform:scale(1.03)}
.w-ed-title{font-size:1.45rem;font-weight:700;margin:0 0 .3rem}
.w-ed-title a{color:#17150f;text-decoration:none;border-bottom:2px solid #a3987e;transition:color .15s ease}
.w-ed-title a:hover{color:#5c4f2e}
.w-ed-desc{font-size:1.02rem;line-height:1.5;color:#3d382d;margin:0}
.w-ed-pullquote{margin:1.9rem 0 .4rem;padding:1.4rem 1.6rem;background:#efe9db;border-left:3px solid #a3987e;
  opacity:0;transform:translateY(10px);animation:wEdEntry .7s .62s ease forwards}
.w-ed-pullquote p{margin:0;font-size:1.3rem;font-style:italic;line-height:1.45;color:#2c2820}
.w-ed-note{border-top:1px solid #c9c1ad;margin-top:2rem;padding-top:.9rem;font-size:.85rem;font-style:italic;color:#6b6353}
.w-ed-note a{color:#6b6353}
@media (prefers-reduced-motion: reduce){
  .w-ed-rule,.w-ed-rule-double,.w-ed-fleuron,.w-ed-statement,.w-ed-sub,.w-ed-stand,.w-ed-epigraph,.w-ed-entry,.w-ed-pullquote{
    animation:none!important;opacity:1!important;transform:none!important}
  .w-ed-thumb{transition:none!important}
}
@media (max-width:640px){.w-ed-entry{grid-template-columns:64px 84px 1fr}.w-ed-num{font-size:1.6rem}.w-ed-thumb{width:84px}}
`;

const FLEURON_SVG =
  '<svg class="w-ed-fleuron" width="120" height="14" viewBox="0 0 120 14" aria-hidden="true">' +
  '<path d="M0 7h44M76 7h44" stroke="#a3987e" stroke-width="1"/>' +
  '<rect x="55.2" y="2.2" width="9.6" height="9.6" transform="rotate(45 60 7)" fill="none" stroke="#a3987e" stroke-width="1.1"/>' +
  '<circle cx="49" cy="7" r="1.4" fill="#a3987e"/><circle cx="71" cy="7" r="1.4" fill="#a3987e"/></svg>';

const edLayoutContent = () =>
  [
    // Plain body tag: same reason as the Library-first layout.
    "<body>",
    BUNDLE_TAGS,
    `<style>${edCss}</style>`,
    '<div class="w-ed-page">',
    "  <header>{{:header|core}}</header>",
    '  <main>{{_main|content}}</main>',
    "</div>",
    '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
    "</body>",
  ].join("\n");

function edDoorContent(pullZoneHost, media) {
  const thumb = (recordingId, alt) =>
    `<img class="w-ed-thumb" src="${posterUrl(pullZoneHost, recordingId, media)}" alt="${alt}" loading="lazy">`;
  const parts = [];
  parts.push('<div class="w-ed-inner">');
  parts.push('  <div class="w-ed-masthead">');
  parts.push('    <p class="w-ed-site">Culturesmith</p>');
  parts.push('    <p class="w-ed-tag">A publication about conflict done well</p>');
  parts.push('    <hr class="w-ed-rule">');
  parts.push('    <hr class="w-ed-rule-double">');
  parts.push(`    ${FLEURON_SVG}`);
  parts.push("  </div>");
  parts.push('  <div class="w-ed-cover">');
  parts.push('    <h1 class="w-ed-statement">All of business and life is a sea of conflict.</h1>');
  parts.push('    <p class="w-ed-sub">Most organizations improvise. We give them a jumpstart.</p>');
  parts.push('    <p class="w-ed-stand">Conflict done well</p>');
  parts.push('    <blockquote class="w-ed-epigraph">');
  parts.push('      <p>"everybody gets what they need and a shot at what they want."</p>');
  parts.push('      <cite class="w-ed-cite">Brandon, working session, October 20, 2026</cite>');
  parts.push("    </blockquote>");
  parts.push("  </div>");
  parts.push('  <p class="w-ed-contents-label">Contents</p>');
  const entry = (num, i, img, href, ext, title, desc) =>
    `<div class="w-ed-entry" style="--i:${i}"><span class="w-ed-num">${num}</span>` +
    img +
    `<div><p class="w-ed-title"><a href="${href}"${ext ? ' rel="noopener"' : ""}>${title}</a></p>` +
    `<p class="w-ed-desc">${desc}</p></div></div>`;
  parts.push(entry("01", 0, thumb("GMT20260411-160029_Recording", "Two practitioners facing each other on the mat"), `${LIBRARY_BASE}/classes`, true, "The Library", "Every recorded class, searchable, every moment named. Nineteen classes and counting."));
  parts.push(entry("02", 1, thumb("GMT20260407-012553_Recording", "Hands-on technique training in the dojo"), "/Conflict_Done_Well", false, "Conflict Done Well training", "Aikido, Martial Nonviolence and Peace Practices, brought to teams, schools and organizations."));
  parts.push(
    '  <div class="w-ed-pullquote"><p>"If you can\'t do conflict well, you\'re not qualified for a leadership position."</p>' +
    '<cite class="w-ed-cite">Brandon, working session, October 20, 2026</cite></div>',
  );
  parts.push(entry("03", 2, thumb("GMT20260404-150833_Recording", "A teacher and students bowing in the dojo"), "/Make_Contact", false, "Certification", "Conflict Done Well Certified for the practitioner. Peace Practices Approved for the organization."));
  parts.push(entry("04", 3, thumb("GMT20260425-145604_Recording", "A class of students of all ages practicing together"), "/Guardians_of_Peace", false, "Guardians of Peace", "An open community standard, proposed to the world. Not a product."));
  parts.push(
    '<p class="w-ed-note">A design proposal rendered in the decko demo: every link opens the site\'s real page, the words in quotation marks are Brandon\'s recorded words from the working sessions of October 16 and October 20, 2026, and the entry thumbnails are frames from the recorded classes. Machine-assisted, prepared for review.</p>',
  );
  parts.push("</div>");
  return parts.join("\n");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- the write path ------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

for (const [label, path] of [["credentials", args.credentials], ["media map", args.media], ["class values", args.classValues], ["bunny map", args.bunnyMap]]) {
  if (!existsSync(path)) {
    console.error(`build-frontdoor-directions-a: no ${label} file at ${path}`);
    process.exit(2);
  }
}

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));
const media = JSON.parse(readFileSync(args.media, "utf8"));
const classValues = JSON.parse(readFileSync(args.classValues, "utf8"));
const bunnyMap = JSON.parse(readFileSync(args.bunnyMap, "utf8"));
const pullZoneHost = bunnyMap.pullZoneHost;

if (!media.some((r) => r.recording_id === ERIC_RECORDING_ID)) {
  console.error(`build-frontdoor-directions-a: operator note 1 pins ${ERIC_RECORDING_ID} but the media map has no such row`);
  process.exit(2);
}

const wall = buildWall(media, classValues, pullZoneHost);
const totalMin = Math.round(media.reduce((sum, r) => sum + r.duration_sec, 0) / 60);
const corpusLine = `${media.length} recorded classes. ${(totalMin / 60).toFixed(1)} hours. Searchable moment by moment.`;
const heroPoster = wall.find((r) => r.featured)?.poster ?? wall[0].poster;
const displayedWallCount = wall.filter((r) => !r.featured && r.id !== ERIC_RECORDING_ID).length + 1;

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

/** Read "Anyone" on a write-path-created card, so a signed-out visitor sees it. */
async function openRead(name) {
  const rule = `${name}+*self+*read`;
  const w = await writeCard(rule, "Anyone");
  return { ok: w.ok, status: w.status, readStatus: w.readBack?.status ?? null, errorBody: w.errorBody };
}

async function buildDirection(door, layoutName, layoutContent, doorContent) {
  const inv = [];
  const layout = await writeCard(layoutName, layoutContent, "Layout");
  const layoutRead = await openRead(layoutName);
  let storedType = "-";
  if (layout.readBack?.status === 200) {
    try { storedType = JSON.parse(layout.readBack.body).type_name ?? "?"; } catch { storedType = "?"; }
  }
  record(
    `card: ${layoutName}`,
    layout.ok && layoutRead.ok && storedType === "Layout",
    `${layout.method} ${layout.path} -> ${layout.status}; read back ${layout.readBack?.status ?? "-"}, ${layout.readBack?.bytes ?? 0} bytes, type ${storedType}; read rule -> ${layoutRead.status}`,
    { status: layout.status, readStatus: layout.readBack?.status ?? null, storedType, readRuleStatus: layoutRead.status, error: layout.errorBody || layoutRead.errorBody },
  );
  inv.push({ name: layoutName, role: "layout", type: storedType, status: layout.status, bytes: layout.readBack?.bytes ?? 0 });

  const rule = `${door}+*self+*layout`;
  const ruleW = await writeCard(rule, layoutName);
  const ruleRead = await openRead(rule);
  record(
    `rule: ${rule}`,
    ruleW.ok && ruleRead.ok,
    `${ruleW.method} ${ruleW.path} -> ${ruleW.status}; content "${layoutName}"; read rule -> ${ruleRead.status}`,
    { status: ruleW.status, readRuleStatus: ruleRead.status, error: ruleW.errorBody || ruleRead.errorBody },
  );
  inv.push({ name: rule, role: "layout rule", status: ruleW.status });

  // HTML type, the pattern builder B proved: the engine's RichText sanitizer
  // strips every inline <svg> on save (verified this pass: the fleuron and
  // the wall's play badges vanished from the served page), while HTML-type
  // cards keep raw markup. The door bodies carry the ornaments, so they must
  // be HTML type.
  const doorW = await writeCard(door, doorContent, "HTML");
  const doorRead = await openRead(door);
  let doorType = "-";
  if (doorW.readBack?.status === 200) {
    try { doorType = JSON.parse(doorW.readBack.body).type_name ?? "?"; } catch { doorType = "?"; }
  }
  record(
    `card: ${door}`,
    doorW.ok && doorRead.ok && doorType === "HTML",
    `${doorW.method} ${doorW.path} -> ${doorW.status}; read back ${doorW.readBack?.status ?? "-"}, ${doorW.readBack?.bytes ?? 0} bytes, type ${doorType}; read rule -> ${doorRead.status}`,
    { status: doorW.status, readStatus: doorW.readBack?.status ?? null, doorType, readRuleStatus: doorRead.status, error: doorW.errorBody || doorRead.errorBody },
  );
  inv.push({ name: door, role: "door", type: doorType, status: doorW.status, bytes: doorW.readBack?.bytes ?? 0 });
  return inv;
}

function pageChecks(body, markers) {
  const checks = {};
  for (const [label, needle] of Object.entries(markers)) {
    checks[label] = body.includes(needle);
  }
  return checks;
}

// ── 1. sign in ────────────────────────────────────────────────────────────────
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, { status: res.status });
  if (cookie === "") {
    console.error("build-frontdoor-directions-a: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

// ── 2. Home untouched, before and after ───────────────────────────────────────
const homeBefore = (await request("/Home.json")).body;

// ── 3. the two directions ─────────────────────────────────────────────────────
const inventory = [];
if (!args.dryRun) {
  inventory.push(
    ...(await buildDirection(LIB_DOOR, LIB_LAYOUT, libLayoutContent(heroPoster).replace("__CORPUS_LINE__", corpusLine), libDoorContent(wall, classValues))),
  );
  inventory.push(...(await buildDirection(ED_DOOR, ED_LAYOUT, edLayoutContent(), edDoorContent(pullZoneHost, media))));
}

// ── 4. read the pages back, signed out ───────────────────────────────────────
if (!args.dryRun) {
  const savedCookie = cookie;
  cookie = "";
  const libRes = await request(cardPath(LIB_DOOR));
  const libChecks = pageChecks(libRes.body, {
    heroIsValueFramed: libRes.body.includes("Years of knowledge, one click away."),
    heroSearchIsSiteSearch: libRes.body.includes('action="/*search"') && libRes.body.includes('name="query[keyword]"'),
    corpusLine: libRes.body.includes("recorded classes") && libRes.body.includes(`${(totalMin / 60).toFixed(1)} hours`),
    featuredRealTitle: libRes.body.includes(escapeHtml(classValues.title.h1)),
    wallAnchorCount: (libRes.body.match(/class="w-lib-card/g) ?? []).length === displayedWallCount,
    ericPosterAbsent: !libRes.body.includes("82ef1153-8ea5-4335-ba0b-6b424b1d47bf") && !libRes.body.includes(ERIC_RECORDING_ID),
    posterTags: (libRes.body.match(/thumbnail\.jpg/g) ?? []).length === displayedWallCount + 1,
    quietRowLinks: libRes.body.includes('href="/Conflict_Done_Well"') && libRes.body.includes('href="/Guardians_of_Peace"') && libRes.body.includes('href="/Make_Contact"'),
    ornamentDiamondSurvived: libRes.body.includes("rotate(45 7 7)"),
    playBadgesSurvived: (libRes.body.match(/w-lib-play" aria-hidden="true"><svg/g) ?? []).length === displayedWallCount,
    quietIconsSurvived: (libRes.body.match(/w-lib-quiet-item"><svg/g) ?? []).length === 3,
    provenanceLine: libRes.body.includes("A design proposal rendered in the decko demo"),
    realChromeHeader: libRes.body.includes("navbar-brand"),
    bundleLoaded: libRes.body.includes("/files/~45514/0000000001.css"),
  });
  record(
    "page: Library-first door renders signed out",
    libRes.status === 200 && Object.values(libChecks).every(Boolean),
    `GET ${cardPath(LIB_DOOR)} -> ${libRes.status}, ${libRes.bytes} bytes`,
    { status: libRes.status, checks: libChecks },
  );
  inventory.push({ name: `page ${LIB_DOOR}`, role: "page check", checks: libChecks, status: libRes.status, bytes: libRes.bytes });

  const edRes = await request(cardPath(ED_DOOR));
  const edChecks = pageChecks(edRes.body, {
    coverStatement: edRes.body.includes("All of business and life is a sea of conflict."),
    promise: edRes.body.includes("Most organizations improvise. We give them a jumpstart."),
    epigraphIsBrandons: edRes.body.includes("everybody gets what they need and a shot at what they want.") && edRes.body.includes("working session, October 20, 2026"),
    pullQuoteIsBrandons: edRes.body.includes("If you can&#39;t do conflict well, you&#39;re not qualified for a leadership position.") || edRes.body.includes("If you can't do conflict well, you're not qualified for a leadership position."),
    contentsLabel: edRes.body.includes("Contents"),
    fourEntries: (edRes.body.match(/class="w-ed-num"/g) ?? []).length === 4,
    fourThumbnails: (edRes.body.match(/class="w-ed-thumb"/g) ?? []).length === 4,
    entryLinks: edRes.body.includes(`${LIBRARY_BASE}/classes"`) && edRes.body.includes('href="/Conflict_Done_Well"') && edRes.body.includes('href="/Guardians_of_Peace"'),
    communityStandardFraming: edRes.body.includes("Not a product"),
    fleuronSurvived: edRes.body.includes('svg class="w-ed-fleuron"'),
    provenanceLine: edRes.body.includes("A design proposal rendered in the decko demo"),
    realChromeHeader: edRes.body.includes("navbar-brand"),
    bundleLoaded: edRes.body.includes("/files/~45514/0000000001.css"),
  });
  record(
    "page: Editorial door renders signed out",
    edRes.status === 200 && Object.values(edChecks).every(Boolean),
    `GET ${cardPath(ED_DOOR)} -> ${edRes.status}, ${edRes.bytes} bytes`,
    { status: edRes.status, checks: edChecks },
  );
  inventory.push({ name: `page ${ED_DOOR}`, role: "page check", checks: edChecks, status: edRes.status, bytes: edRes.bytes });

  cookie = savedCookie;
  const homeAfter = (await request("/Home.json")).body;
  record("landing: Home card untouched", homeBefore === homeAfter, `Home content byte-identical across the build`, {
    unchanged: homeBefore === homeAfter,
  });
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  pass: "design-pass-20261026",
  directions: { libraryFirst: LIB_DOOR, editorial: ED_DOOR },
  layouts: { libraryFirst: LIB_LAYOUT, editorial: ED_LAYOUT },
  corpus: {
    recordings: media.length,
    totalMinutes: totalMin,
    posterProbesOk: "19 of 19 on 2026-10-26",
    wallShows: displayedWallCount,
    heldBackPerOperatorNote1: ERIC_RECORDING_ID,
  },
  words: {
    valueframedHero: "operator-directed (his spitball applied); no recorded Brandon words exist for this slot",
    brandonQuotes: [
      { text: "everybody gets what they need and a shot at what they want.", session: "2026-10-20 11:15 working session", source: "brandonDojoTech docs/reports/meeting-summary-and-action-items-2026-10-20-1115.md point 12" },
      { text: "If you can't do conflict well, you're not qualified for a leadership position.", session: "2026-10-20 11:15 working session", source: "same record, point 12" },
      { text: "All of business and life is a sea of conflict. Most organizations improvise. We give them a jumpstart.", session: "2026-10-16 working session", source: "brandonDojoTech docs/plans/writing-for-brandon.md rule 4" },
    ],
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
