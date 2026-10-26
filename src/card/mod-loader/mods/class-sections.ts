// class-sections: a deck-local demo mod for the class-as-cards proof
// (2026-10-25). The library's class page carries sections a Basic card
// cannot render by default: a video player that plays the recording, and a
// moment index whose rows are structured data (timestamps, domain dots,
// deep links into the player). This mod closes exactly those two gaps as
// mod-provided views; every other section of the class page (transcript,
// what the class adds, the library-written row, comments) renders fine as
// plain card content, which is the point the demo makes: basic cards carry
// the sections they can carry, and a mod exists only where the default does
// not work.
//
// HOW THE VIEWS BIND, and why not through new cardtypes: a mod's set module
// binds to cards through the anchor's CODENAME (Ruby's Pattern::Base#
// module_key camelizes anchor_codenames; set-keys-to-modules.ts ported it,
// including the "a codename-less anchor builds no module key" rule). A
// cardtype a demo creates through the write path carries no codename - in
// Ruby, mod-owned cardtypes get theirs from the mod's data/real.yml seed -
// so set("type/class_player") on a created card never fires. The mod-provided
// view is therefore ANCHORLESS (set/all/..., the DSL docs' word-count
// example), reachable from every card, and the CARD selects it in the nest
// syntax: {{<card>|class_player}}. The two views are the mod; the deck
// stays plain.
//
// What each view renders:
//
// - class_player: the card's content is ONE line, the embed URL of the
//   recording's player. The view renders that URL as the class player
//   iframe, with the caption line under it. The entitlement wording the
//   library computes per viewer ("sign in for a free preview", "full
//   playback is a student feature") is NOT ported: this demo renders one
//   honest static caption, because entitlements live in the library, and
//   the demo copies values, not live rules.
//
// - moment_index: the card's content is the index in a plain line format,
//   one entry per line:
//
//       @base <url>            the base URL moment rows deep-link into
//       # <name> | <start>-<end>   a named segment row (the section bar)
//       <start>|<end>|<title>|<color>   one moment row (color optional)
//
//   The view parses those lines and renders the index the library draws:
//   segment rows on the palette colors, moment rows with a domain dot,
//   monospace timestamps, and every row linking to `<base>?t=<sec>`, which
//   the library's own class page seeks its embedded player to. The
//   timestamps and titles are VALUES copied from the library's data for
//   the class; the view reads them from the card's own content, so the two
//   systems stay decoupled.
//
// - side_by_side: the demo's comparison page. The card's content is two
//   lines:
//
//       left: <url>
//       right: <url>
//
//   The view renders the two URLs as side-by-side iframes with a flex row.
//   This view exists because a Basic card's content cannot carry an iframe:
//   the engine strips iframe tags from card content (the sane XSS default),
//   while a MOD VIEW's output renders as the mod wrote it - which is the
//   demo's whole argument in one data point. It also loads the deck's own
//   compiled asset bundles from the local /files routes (see page_bundle).
//
// - page_bundle: emits <link> + <script> tags loading the deck's own
//   compiled asset bundles from THIS HOST's /files routes
//   (/files/~45514/0000000001.css, /files/~50617/0000000002.js - the same
//   bytes the layout shell links). The deck's stored asset URLs name the
//   production storage host, which does not resolve on this machine (the
//   runbook's "compiled CSS and JS bytes are not in the corpus" limit is
//   about the stored URLs, not the bytes: the local routes serve them).
//   With the bundle loaded, the engine's own accordion markup (the open
//   view's data-bs-toggle collapse) works: the subcards expand and
//   collapse with the deck's real JavaScript, no custom code.
//
// - transcript_tool: the library player's speaker view, ported (2026-10-26,
//   the class-cards parity lane). The source is the player's transcript
//   panel (modules/player-chapters/public/player.js in the library
//   checkout): cues grouped into speaker turns, a chip per speaker that
//   filters the view, a timestamp button per turn that seeks the player, a
//   copy button per turn that copies the start-end pair, and the follow
//   highlight that keeps the line being spoken lit and scrolled into view
//   while the video plays (never scroll-jacking while paused). The chapter
//   list sits beside the pane; clicking a chapter moves the transcript to
//   that chapter's first turn and seeks the video where the page carries
//   one (the Bunny embed's mapping). The card's content is a plain line
//   format, the values copied from the library's data:
//
//       @video <dom-id>                  the video element to seek (optional)
//       @duration <seconds>              the recording length for the readout
//       @speaker <name>|<seconds>|<cues> one chip per line, most time first
//       # <name> | <start>-<end>         a chapter row (same line shape the
//                                        moment_index view parses)
//       <start>|<end>|<speaker>|<text>   one transcript cue
//
// - class_player / moment_index / section_accordion: each renders its card
//   as ONE accordion item in the engine's own open-view shape (Bootstrap
//   accordion markup: accordion-item / accordion-header / the collapse
//   target), so a class page nests its section subcards through these
//   views and every section expands and collapses with the deck's own
//   JavaScript (loaded by page_bundle). section_accordion renders the
//   card's own core view inside the accordion - the plain sections
//   (transcript, what this class adds, library row, comments) nest through
//   it; class_player and moment_index render their structured bodies in
//   the same wrapper.
//
// WHY THE PLAYER IS A LINK AND NOT AN IFRAME: the library answers every
// route with Content-Security-Policy frame-ancestors 'self'
// (library core/server.mjs:97, a deliberate security default), so a decko
// page on its own port cannot frame the library's player - the frame
// stays blank. A mod can close a RENDERING gap; it cannot and should not
// reach around another system's framing policy. The player view therefore
// renders a play panel that deep-links into the library player, and the
// moment index rows link the same way (each carries its timestamp).
//
// Honest scope: no editing UI, no perms beyond the deck's defaults, and
// the views are cache-never so an edit to a card shows on the next render.

const PAGE_BUNDLE_TAGS =
  '<link rel="stylesheet" href="/files/~45514/0000000001.css">\n' +
  '<script src="/files/~50617/0000000002.js"></script>\n' +
  // The deck's compiled style output carries no bootstrap stylesheet (the
  // JS bundle carries bootstrap's JS), so the accordion's one load-bearing
  // rule and its small surface style ship here.
  '<style>\n' +
  '.accordion-collapse.collapse:not(.show){display:none}\n' +
  '.class-section > .accordion-header .accordion-button{display:flex;justify-content:space-between;align-items:center;width:100%;padding:.55rem .9rem;background:#f6f3ec;border:1px solid #d8d2c4;border-radius:6px;cursor:pointer;font:inherit;text-align:left;color:inherit}\n' +
  '.class-section > .accordion-header .accordion-button::after{content:"";width:.6rem;height:.6rem;border-right:2px solid #7a6f5a;border-bottom:2px solid #7a6f5a;transform:rotate(45deg);transition:transform .15s ease;flex:none;margin-left:.5rem}\n' +
  '.class-section > .accordion-header .accordion-button.collapsed::after{transform:rotate(-45deg)}\n' +
  '.class-section > .accordion-collapse > .accordion-body{border:1px solid #d8d2c4;border-top:0;border-radius:0 0 6px 6px;padding:.7rem .9rem;background:#fff}\n' +
  '.class-section{margin:0 0 .5rem}\n' +
  '</style>';

/** The card's name for the accordion header. */
function cardTitle(ctx: { fmt: { card: { name: { s: string } } } }): string {
  return ctx.fmt.card.name.s;
}

/** One accordion item in the engine's own open-view shape (views.ts
 *  accordionBarHtml): a header button carrying data-bs-toggle=collapse,
 *  the collapse target div rendered open. The id derives from the card's
 *  safe key, so two nests of the same card share one toggle state, and
 *  two different cards never collide. */
function accordionWrap(ctx: { fmt: { card: { name: { s: string; safeKey: string } } } }, bodyHtml: string): string {
  const safeKey = ctx.fmt.card.name.safeKey;
  const collapseId = `card-${safeKey}-class-section-collapse-id`;
  return [
    '<div class="accordion-item class-section">',
    '<h2 class="accordion-header nodblclick w-100">',
    `<button class="accordion-button" data-bs-target="#${collapseId}" data-bs-toggle="collapse" type="button">`,
    `<strong>${esc(cardTitle(ctx))}</strong>`,
    "</button>",
    "</h2>",
    `<div class="accordion-collapse collapse show" id="${collapseId}">`,
    '<div class="accordion-body">',
    bodyHtml,
    "</div>",
    "</div>",
    "</div>",
  ].join("\n");
}

import { defineMod } from "../mod-dsl.js";
import { str } from "../../render/format.js";

/** The segment bar palette, the library's SEG_PALETTE order (the colors the
 *  library's class page paints section rows with). */
const SEG_PALETTE = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2", "#b279a2"];

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 458.1 -> "7:38", 3788.179 -> "63:08" (the library's m:ss clock). */
function fmtTs(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The player's clip stamp (player.js fmtClip): one hour or more grows an
 *  hours column, so 3712 -> "1:01:52" while 458.1 -> "7:38". */
function fmtClip(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

interface MomentRow {
  start: number;
  end: number;
  title: string;
  color: string | null;
}

interface SegmentRow {
  name: string;
  start: number;
  end: number;
}

interface ParsedIndex {
  base: string;
  segments: SegmentRow[];
  moments: MomentRow[];
}

/** "# name | start-end" -> { name, start, end }; null when not that shape. */
function parseSegmentLine(line: string): SegmentRow | null {
  const m = /^#\s*(.*?)\s*\|\s*([\d:.]+)\s*-\s*([\d:.]+)\s*$/.exec(line);
  if (!m) return null;
  return { name: m[1], start: parseSec(m[2]), end: parseSec(m[3]) };
}

/** "start|end|title|color" -> row; null when not that shape. */
function parseMomentLine(line: string): MomentRow | null {
  const parts = line.split("|");
  if (parts.length < 3) return null;
  const start = parseSec(parts[0]);
  const end = parseSec(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start,
    end,
    title: parts[2].trim(),
    color: parts[3]?.trim() ? parts[3].trim() : null,
  };
}

/** "7:38" or "458.1" -> seconds. */
function parseSec(text: string): number {
  const t = text.trim();
  if (t.includes(":")) {
    const [m, s] = t.split(":");
    return Number(m) * 60 + Number(s);
  }
  return Number(t);
}

function parseIndex(raw: string): ParsedIndex {
  const out: ParsedIndex = { base: "", segments: [], moments: [] };
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("@base ")) {
      out.base = t.slice("@base ".length).trim();
      continue;
    }
    const seg = parseSegmentLine(t);
    if (seg) {
      out.segments.push(seg);
      continue;
    }
    const moment = parseMomentLine(t);
    if (moment) out.moments.push(moment);
  }
  return out;
}

export default defineMod("class-sections", { group: "custom" }, ({ set }) => {
  // set/all/page_bundle.rb: the deck's compiled assets from the local
  // /files routes, so this host's pages carry the real skin and the real
  // accordion JavaScript.
  set("all/page_bundle", ({ format }) => {
    format("html", ({ view }) => {
      view("page_bundle", { cache: "never" }, () => PAGE_BUNDLE_TAGS);
    });
  });

  // set/all/section_accordion.rb: the card's own core view inside the
  // accordion wrapper - the plain sections nest through this view.
  set("all/section_accordion", ({ format }) => {
    format("html", ({ view }) => {
      view("section_accordion", { cache: "never" }, (ctx) => {
        return accordionWrap(ctx, str(ctx.fmt.renderDelegated("core")));
      });
    });
  });

  // set/all/side_by_side.rb: the comparison view, reachable from every card.
  set("all/side_by_side", ({ format }) => {
    format("html", ({ view }) => {
      view("side_by_side", { cache: "never" }, (ctx) => {
        let left = "";
        let right = "";
        for (const line of ctx.fmt.renderRaw().split("\n")) {
          const t = line.trim();
          if (t.toLowerCase().startsWith("left:")) left = t.slice(5).trim();
          if (t.toLowerCase().startsWith("right:")) right = t.slice(6).trim();
        }
        if (left === "" || right === "") {
          return '<p class="muted">This card\'s content needs a <code>left:</code> and a <code>right:</code> URL line.</p>';
        }
        // The library side is a LINK, not a frame: the library answers with
        // frame-ancestors 'self' (its own security default), so it refuses
        // to render inside a page on another port. The decko side frames
        // fine (same origin).
        return [
          '<div style="display:flex;gap:.6rem;align-items:stretch" class="class-side-by-side">',
          `<div style="flex:1;border:1px solid #d8d2c4;border-radius:6px;padding:.8rem 1rem;background:#f6f3ec">` +
            `<strong>The library's class page</strong><br>` +
            `<span style="font-size:.85rem">The current surface: the player, the access wording, the index, the transcript flag, the comments.</span><br>` +
            `<a class="btn btn-primary" style="margin-top:.5rem;display:inline-block;padding:.4rem 1.1rem" href="${esc(left)}" target="_blank" rel="noopener">Open the library page</a><br>` +
            // The framing mechanism stays off the visible card: it lives in
            // the mod header, docs/mod-dsl.md and this comment; the page
            // carries only what a reader does about it.
            '<!-- the library page cannot be framed here: the library answers frame-ancestors \'self\' (library core/server.mjs:97), its own security default; opened in a second window, it sits beside this page -->',
            `<span class="muted" style="font-size:.78rem;display:block;margin-top:.5rem">Opened in a second window, it sits beside this page.</span></div>`,
          `<div style="flex:1;border:1px solid #d8d2c4;border-radius:6px;padding:.8rem 1rem;background:#f6f3ec">` +
            `<strong>The same class as decko cards</strong><br>` +
            `<span style="font-size:.85rem">The card tree: the class card, a subcard per section, two sections rendered by the class-sections mod's views.</span><br>` +
            `<a class="btn btn-primary" style="margin-top:.5rem;display:inline-block;padding:.4rem 1.1rem" href="${esc(right)}" target="_blank" rel="noopener">Open the card page</a><br>` +
            `<span class="muted" style="font-size:.78rem;display:block;margin-top:.5rem">Framed below - it lives on this same origin, so it renders inline.</span></div>`,
          "</div>",
          `<iframe src="${esc(right)}" title="the class as decko cards" style="width:100%;height:1500px;border:1px solid #c8cdd2;border-radius:6px;margin-top:.6rem"></iframe>`,
          PAGE_BUNDLE_TAGS,
        ].join("\n");
      });
    });
  });

  // set/all/class_player.rb: the player view, reachable from every card.
  // The card's content is the library player URL, plus optional value lines:
  //
  //     @bunny <url>    the recording's Bunny stream ({guid}/original, the
  //                     URL the library's own player builds and plays)
  //     @poster <url>   the recording's poster frame ({guid}/thumbnail.jpg)
  //
  // With @bunny present the view embeds the real video element (native
  // play/pause and seek bar) and registers window.csClassPlayerSeek so the
  // moment_index rows on the same page seek THIS player instead of linking
  // out. Without it the view stays an honest play panel deep-linking into
  // the library, because a fake player is worse than a link.
  set("all/class_player", ({ format }) => {
    format("html", ({ view }) => {
      view("class_player", { cache: "never" }, (ctx) => {
        const raw = ctx.fmt.renderRaw();
        let embedUrl = "";
        let bunnyUrl = "";
        let posterUrl = "";
        for (const line of raw.split("\n")) {
          const t = line.trim();
          if (t === "") continue;
          if (t.toLowerCase().startsWith("@bunny ")) bunnyUrl = t.slice(7).trim();
          else if (t.toLowerCase().startsWith("@poster ")) posterUrl = t.slice(8).trim();
          else if (embedUrl === "") embedUrl = t;
        }
        let body: string;
        if (bunnyUrl !== "") {
          const playUrl = embedUrl.replace(/[?&]compact=1/, "").replace(/[?&]embed=1/, "");
          body = [
            '<div class="class-player">',
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem">',
            '<strong style="font-size:.95rem">Class player</strong>',
            `<a class="muted" style="font-size:.8rem" href="${esc(playUrl)}" target="_blank" rel="noopener">The class page in the library</a>`,
            "</div>",
            `<video id="cs-class-video" controls playsinline preload="metadata"` +
              (posterUrl !== "" ? ` poster="${esc(posterUrl)}"` : "") +
              ` style="width:100%;aspect-ratio:16/9;background:#111;border-radius:6px">` +
              `<source src="${esc(bunnyUrl)}" type="video/mp4">` +
              "</video>",
            '<p class="muted" style="font-size:.8rem;margin:.35rem .15rem 0">The recording streams from the library\'s own video store, the same stream the library\'s player serves; full playback there is a student feature.</p>',
            "<script>\n" +
              "(function () {\n" +
              "  function csSeek(sec) {\n" +
              "    var v = document.getElementById('cs-class-video');\n" +
              "    if (!v) return false;\n" +
              "    try { v.currentTime = sec; } catch (e) { }\n" +
              "    var p = v.play();\n" +
              "    if (p && p.catch) p.catch(function () { });\n" +
              "    return true;\n" +
              "  }\n" +
              "  window.csClassPlayerSeek = csSeek;\n" +
              "})();\n" +
              "<" + "/script>",
            "</div>",
          ].join("\n");
        } else if (embedUrl === "") {
          body = '<p class="muted">No player URL yet. Put the embed URL in this card\'s content.</p>';
        } else {
          const playUrl = embedUrl.replace(/[?&]compact=1/, "").replace(/[?&]embed=1/, "");
          body = [
            '<div class="class-player">',
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem">',
            '<strong style="font-size:.95rem">Class player</strong>',
            `<a class="muted" style="font-size:.8rem" href="${esc(playUrl)}" target="_blank" rel="noopener">The class page in the library</a>`,
            "</div>",
            `<a class="btn btn-primary" style="display:inline-block;padding:.55rem 1.4rem;font-size:1.05rem" href="${esc(playUrl)}" target="_blank" rel="noopener">Play this class</a>`,
            // The framing mechanism stays off the visible card: it lives in
            // the mod header, docs/mod-dsl.md and this comment.
            '<!-- no page on another port can frame the library player: the library answers frame-ancestors \'self\' (library core/server.mjs:97), its own security default -->',
            '<p style="font-size:.85rem;margin:.5rem .15rem 0">The recording plays in the library\'s own player: the library serves the video and keeps the entitlements. Every moment below links straight into it at its timestamp.</p>',
            '<p class="muted" style="font-size:.85rem;margin:.35rem .15rem 0">Full playback is a student feature there; sign in at the library for a free preview of every class.</p>',
            "</div>",
          ].join("\n");
        }
        return accordionWrap(ctx, body);
      });
    });
  });

  // set/all/moment_index.rb: the moment index view, reachable from every card.
  set("all/moment_index", ({ format }) => {
    format("html", ({ view }) => {
      view("moment_index", { cache: "never" }, (ctx) => {
        const index = parseIndex(ctx.fmt.renderRaw());
        const parts: string[] = [];
        if (index.base === "") {
          return '<p class="muted">No base link yet. Put an <code>@base &lt;url&gt;</code> line at the top of this card\'s content.</p>';
        }
        parts.push(
          '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">The library cut this class into moments and named each one from the transcript. The cut points and the names are the machine\'s until they are approved. When the class player above is on the page, a row seeks that player; otherwise it plays from its timestamp in the library player.</p>',
        );
        // Rows carry both the library deep link (the no-JS and no-embedded-
        // player fallback) and data-cs-seek, so the delegated listener below
        // can seek the embedded class player when one is on the page.
        const seekAttrs = (sec: number) =>
          ` href="${esc(index.base)}?t=${Math.round(sec)}" data-cs-seek="${Math.round(sec)}"`;
        if (index.segments.length > 0) {
          parts.push('<h3 style="margin:.2rem 0 .3rem;font-size:1rem">The class, section by section</h3>');
          parts.push('<ul style="list-style:none;padding:0;margin:0 0 .6rem">');
          index.segments.forEach((seg, i) => {
            const color = SEG_PALETTE[i % SEG_PALETTE.length];
            parts.push(
              `<li style="list-style:none;border-left:4px solid ${color};padding-left:.5rem;margin:.25rem 0">` +
                `<a${seekAttrs(seg.start)}><strong>${esc(seg.name)}</strong></a> ` +
                `<span class="muted" style="font-size:.85rem"> · ${fmtTs(seg.start)}–${fmtTs(seg.end)}</span></li>`,
            );
          });
          parts.push("</ul>");
        }
        parts.push('<h3 style="margin:.2rem 0 .3rem;font-size:1rem">Moments</h3>');
        if (index.moments.length === 0) {
          parts.push('<p class="muted">No moments in this index yet.</p>');
        } else {
          parts.push('<ul style="list-style:none;padding:0;margin:0">');
          for (const m of index.moments) {
            const dot =
              m.color !== null
                ? `<span style="display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:${esc(m.color)};margin-right:.35rem"></span>`
                : '<span style="display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:#c8cdd2;margin-right:.35rem"></span>';
            parts.push(
              `<li style="list-style:none;margin:.2rem 0">` +
                `<span style="font-family:ui-monospace,monospace;font-size:.82rem;color:#5a6570">${fmtTs(m.start)}</span> ` +
                dot +
                `<a${seekAttrs(m.start)}>${esc(m.title)}</a></li>`,
            );
          }
          parts.push("</ul>");
        }
        parts.push(
          "<script>\n" +
            "(function () {\n" +
            "  document.addEventListener('click', function (ev) {\n" +
            "    var a = ev.target && ev.target.closest ? ev.target.closest('a[data-cs-seek]') : null;\n" +
            "    if (!a) return;\n" +
            "    if (!window.csClassPlayerSeek) return;\n" +
            "    var sec = Number(a.getAttribute('data-cs-seek'));\n" +
            "    if (!Number.isFinite(sec)) return;\n" +
            "    if (window.csClassPlayerSeek(sec)) ev.preventDefault();\n" +
            "  }, true);\n" +
            "})();\n" +
            "<" + "/script>",
        );
        return accordionWrap(ctx, parts.join("\n"));
      });
    });
  });

  // set/all/transcript_tool.rb: the dynamic transcript tool, ported from the
  // library player's speaker view (the class-cards parity lane, 2026-10-26).
  // See the module header for the line format. The tool renders ONE accordion
  // item whose body is the chapter list beside the transcript pane, and one
  // small script wires them: chapter click moves the transcript and seeks the
  // video where the page carries one, turn timestamps seek, the copy button
  // copies the start-end pair, chips filter to one speaker, and the line
  // being spoken stays lit while the video plays.
  set("all/transcript_tool", ({ format }) => {
    format("html", ({ view }) => {
      view("transcript_tool", { cache: "never" }, (ctx) => {
        const parsed = parseTranscriptTool(ctx.fmt.renderRaw());
        if (parsed.cues.length === 0) {
          return accordionWrap(
            ctx,
            '<p class="muted">No transcript cues yet. Put <code>start|end|speaker|text</code> lines in this card\'s content.</p>',
          );
        }
        // turns: consecutive cues by the same speaker fold into one turn
        // (the player's grouping, player.js lines 614-629)
        const turns: Turn[] = [];
        for (const c of parsed.cues) {
          const last = turns[turns.length - 1];
          if (last && last.speaker === c.speaker) {
            last.end = Math.max(last.end, c.end);
            last.text += " " + c.text;
          } else {
            turns.push({ speaker: c.speaker, start: c.start, end: c.end, text: c.text });
          }
        }
        const rootId = `cs-ttool-${ctx.fmt.card.name.safeKey}`;
        const dur = parsed.duration > 0 ? parsed.duration : turns[turns.length - 1].end;
        const chip = (label: string, spk: string, active: boolean) =>
          `<button type="button" class="cs-spk-chip${active ? " cs-active" : ""}" data-spk="${esc(spk)}">${esc(label)}</button>`;
        const chipsHtml =
          chip("Everyone", "", true) +
          parsed.speakers.map((s) => chip(`${s.name} · ${fmtClip(s.seconds)}`, s.name, false)).join("");
        const chapterBtn = (seg: SegmentRow) =>
          `<button type="button" class="cs-chapter" data-cs-seek="${Math.round(seg.start)}"` +
          ` data-cs-chapter-start="${seg.start}" data-chapter-end="${seg.end}">` +
          `<span class="cs-ch-name">${esc(seg.name)}</span>` +
          `<span class="cs-ch-time">${fmtClip(seg.start)} - ${fmtClip(seg.end)}</span></button>`;
        const turnRow = (tn: Turn) =>
          `<div class="cs-turn" data-start="${tn.start}" data-spk="${esc(tn.speaker)}">` +
          `<span class="cs-turn-head">` +
          `<button type="button" class="cs-ttime" data-t="${tn.start}">${fmtClip(tn.start)}</button>` +
          `<button type="button" class="cs-tcopy" data-c="${esc(fmtClip(tn.start) + "-" + fmtClip(tn.end))}" title="Copy start-end for cutting a clip">⧉</button>` +
          `<strong class="cs-tspk">${esc(tn.speaker)}</strong>` +
          `</span>` +
          `<span class="cs-ttext">${esc(tn.text)}</span>` +
          `</div>`;
        const videoId = parsed.video;
        const body = [
          '<div class="cs-ttool" id="' + rootId + '" data-duration="' + dur + '">',
          "<style>" + TOOL_CSS + "</style>",
          '<p class="muted cs-ttool-note">The library\'s dynamic transcript tool, ported from its player: the chapter list beside the transcript pane. ' +
            "A chapter click moves the transcript to that chapter and seeks the video where the page carries one; the line being spoken stays lit while it plays; " +
            "a turn's timestamp seeks there and its copy button copies the start-end pair. " +
            `${parsed.cues.length} cues, ${parsed.speakers.length} speakers. Speaker names are shortened to given names here.</p>`,
          '<div class="cs-ttool-cols">',
          '<nav class="cs-ttool-chapters" aria-label="Chapters">',
          '<h4 class="cs-ttool-h">Chapters</h4>',
          parsed.segments.map(chapterBtn).join(""),
          "</nav>",
          '<div class="cs-ttool-pane">',
          '<div class="cs-speaker-chips">' + chipsHtml + "</div>",
          '<div class="cs-ttool-turns" tabindex="0" aria-label="Transcript, by speaker">',
          turns.map(turnRow).join(""),
          "</div>",
          '<p class="cs-ttool-nowline">Position <span class="cs-ttool-now-val">0:00</span>' +
            (dur > 0 ? " / " + fmtClip(dur) : "") +
            " · the lit line is where the video is</p>",
          "</div>",
          "</div>",
          "<script>\n" +
            "(function () {\n" +
            `  var root = document.getElementById('${rootId}');\n` +
            "  if (!root) return;\n" +
            "  var pane = root.querySelector('.cs-ttool-turns');\n" +
            "  var turns = Array.prototype.slice.call(root.querySelectorAll('.cs-turn'));\n" +
            "  var chapters = Array.prototype.slice.call(root.querySelectorAll('.cs-chapter'));\n" +
            "  var video = document.getElementById('" + videoId + "');\n" +
            "  var nowEl = root.querySelector('.cs-ttool-now-val');\n" +
            "  var dur = Number(root.getAttribute('data-duration')) || 0;\n" +
            "  function fmt(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }\n" +
            "  function seek(t) {\n" +
            "    if (window.csClassPlayerSeek && window.csClassPlayerSeek(t)) return true;\n" +
            "    if (video) { try { video.currentTime = t; } catch (e) { } var p = video.play(); if (p && p.catch) p.catch(function () { }); return true; }\n" +
            "    return false;\n" +
            "  }\n" +
            "  function follow(t) {\n" +
            "    var idx = -1;\n" +
            "    for (var i = 0; i < turns.length; i++) { if (Number(turns[i].getAttribute('data-start')) <= t) idx = i; else break; }\n" +
            "    turns.forEach(function (el, i) { el.classList.toggle('cs-now', i === idx); });\n" +
            "    chapters.forEach(function (el) {\n" +
            "      var on = Number(el.getAttribute('data-cs-chapter-start')) <= t && t < Number(el.getAttribute('data-chapter-end'));\n" +
            "      el.classList.toggle('cs-now', on);\n" +
            "    });\n" +
            "    if (nowEl) nowEl.textContent = fmt(t) + (dur ? ' / ' + fmt(dur) : '');\n" +
            "    var playing = video && !video.paused && !video.ended && video.currentTime > 0;\n" +
            "    if (playing && idx >= 0) {\n" +
            "      var row = turns[idx];\n" +
            "      var top = row.offsetTop - pane.offsetTop;\n" +
            "      if (top < pane.scrollTop || top > pane.scrollTop + pane.clientHeight - 48) pane.scrollTop = Math.max(0, top - 16);\n" +
            "    }\n" +
            "  }\n" +
            "  if (video) video.addEventListener('timeupdate', function () { follow(video.currentTime); });\n" +
            "  root.addEventListener('click', function (ev) {\n" +
            "    var el = ev.target && ev.target.closest ? ev.target : null;\n" +
            "    if (!el) return;\n" +
            "    var tt = el.closest('.cs-ttime');\n" +
            "    if (tt) { var t = Number(tt.getAttribute('data-t')); seek(t); follow(t); return; }\n" +
            "    var cp = el.closest('.cs-tcopy');\n" +
            "    if (cp) {\n" +
            "      var text = cp.getAttribute('data-c');\n" +
            "      if (navigator.clipboard && navigator.clipboard.writeText) {\n" +
            "        navigator.clipboard.writeText(text).then(function () {\n" +
            "          var old = cp.textContent; cp.textContent = 'Copied';\n" +
            "          setTimeout(function () { cp.textContent = old; }, 1200);\n" +
            "        }, function () { });\n" +
            "      }\n" +
            "      return;\n" +
            "    }\n" +
            "    var ch = el.closest('.cs-chapter');\n" +
            "    if (ch) {\n" +
            "      var start = Number(ch.getAttribute('data-cs-chapter-start'));\n" +
            "      var target = null;\n" +
            "      for (var j = 0; j < turns.length; j++) { if (Number(turns[j].getAttribute('data-start')) >= start - 0.5) { target = turns[j]; break; } }\n" +
            "      if (!target && turns.length) target = turns[turns.length - 1];\n" +
            "      if (target && pane) {\n" +
            "        pane.scrollTop = Math.max(0, target.offsetTop - pane.offsetTop - 12);\n" +
            "        turns.forEach(function (tn2) { tn2.classList.remove('cs-flash'); });\n" +
            "        target.classList.add('cs-flash');\n" +
            "        setTimeout(function () { target.classList.remove('cs-flash'); }, 1600);\n" +
            "      }\n" +
            "      seek(start);\n" +
            "      follow(start);\n" +
            "    }\n" +
            "  });\n" +
            "  var chips = Array.prototype.slice.call(root.querySelectorAll('.cs-spk-chip'));\n" +
            "  chips.forEach(function (c) {\n" +
            "    c.addEventListener('click', function () {\n" +
            "      var spk = c.getAttribute('data-spk') || '';\n" +
            "      chips.forEach(function (c2) { c2.classList.toggle('cs-active', c2 === c); });\n" +
            "      turns.forEach(function (tn) { tn.style.display = !spk || tn.getAttribute('data-spk') === spk ? '' : 'none'; });\n" +
            "    });\n" +
            "  });\n" +
            "  follow(0);\n" +
            "})();\n" +
            "<" + "/script>",
          "</div>",
        ].join("\n");
        return accordionWrap(ctx, body);
      });
    });
  });
});

const TOOL_CSS =
  ".cs-ttool-cols{display:flex;gap:.7rem;align-items:flex-start;flex-wrap:wrap}" +
  ".cs-ttool-chapters{flex:0 0 13.5rem;max-width:100%;display:flex;flex-direction:column;gap:.3rem}" +
  ".cs-ttool-chapters .cs-chapter{display:flex;flex-direction:column;gap:.1rem;text-align:left;cursor:pointer;" +
  "font:inherit;padding:.4rem .55rem;border:1px solid #d8d2c4;border-left:4px solid #b9ab8e;border-radius:6px;background:#f6f3ec;color:inherit}" +
  ".cs-ttool-chapters .cs-chapter.cs-now{border-left-color:#2e6f8e;background:#e3eef4}" +
  ".cs-ttool-chapters .cs-ch-name{font-weight:600;font-size:.85rem;line-height:1.3}" +
  ".cs-ttool-chapters .cs-ch-time{font-family:ui-monospace,monospace;font-size:.75rem;color:#5a6570}" +
  ".cs-ttool-pane{flex:1 1 18rem;min-width:0}" +
  ".cs-speaker-chips{display:flex;gap:.35rem;flex-wrap:wrap;margin:.1rem 0 .45rem}" +
  ".cs-speaker-chips .cs-spk-chip{font:inherit;font-size:.78rem;padding:.12rem .55rem;border:1px solid #9aa7b2;" +
  "border-radius:999px;background:#fff;color:#1c2733;cursor:pointer}" +
  ".cs-speaker-chips .cs-spk-chip.cs-active{border-color:#2e6f8e;color:#1f4f69;background:#e3eef4;font-weight:700}" +
  ".cs-ttool-turns{max-height:26rem;overflow:auto;border:1px solid #d8d2c4;border-radius:6px;background:#fff;padding:.15rem .2rem}" +
  ".cs-turn{padding:.28rem .4rem;border-bottom:1px solid #e4e9ee}" +
  ".cs-turn.cs-now{background:#e3eef4}" +
  ".cs-turn.cs-flash{background:#f1e9d7}" +
  ".cs-turn-head{display:inline-flex;gap:.3rem;align-items:baseline;margin-right:.4rem}" +
  ".cs-turn .cs-ttime{font:inherit;font-family:ui-monospace,monospace;font-size:.75rem;padding:.05rem .45rem;" +
  "border:1px solid #9aa7b2;border-radius:4px;background:#fff;color:#1c2733;cursor:pointer;min-width:3.1rem}" +
  ".cs-turn .cs-tcopy{font:inherit;font-size:.75rem;padding:.05rem .4rem;border:1px solid #9aa7b2;" +
  "border-radius:4px;background:#fff;color:#1c2733;cursor:pointer}" +
  ".cs-tspk{font-size:.78rem;color:#1f4f69;white-space:nowrap}" +
  ".cs-ttext{font-size:.9rem;line-height:1.45}" +
  ".cs-ttool-nowline{font-size:.8rem;color:#5a6570;margin:.3rem 0 0}" +
  ".cs-ttool-note{font-size:.85rem;margin:.1rem 0 .5rem}";

interface CueLine {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

interface Turn {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface SpeakerLine {
  name: string;
  seconds: number;
  cues: number;
}

interface ParsedTool {
  video: string;
  duration: number;
  speakers: SpeakerLine[];
  segments: SegmentRow[];
  cues: CueLine[];
}

function parseTranscriptTool(raw: string): ParsedTool {
  const out: ParsedTool = { video: "cs-class-video", duration: 0, speakers: [], segments: [], cues: [] };
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    if (t.startsWith("@video ")) {
      out.video = t.slice("@video ".length).trim() || out.video;
      continue;
    }
    if (t.startsWith("@duration ")) {
      out.duration = parseSec(t.slice("@duration ".length));
      continue;
    }
    if (t.startsWith("@speaker ")) {
      const parts = t.slice("@speaker ".length).split("|");
      const name = (parts[0] ?? "").trim();
      if (name !== "") {
        out.speakers.push({ name, seconds: parseSec(parts[1] ?? "0"), cues: Number(parts[2] ?? 0) || 0 });
      }
      continue;
    }
    const seg = parseSegmentLine(t);
    if (seg) {
      out.segments.push(seg);
      continue;
    }
    const parts = t.split("|");
    if (parts.length < 4) continue;
    const start = parseSec(parts[0]);
    const end = parseSec(parts[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.cues.push({ start, end, speaker: parts[2].trim() || "Unknown", text: parts.slice(3).join("|").trim() });
  }
  out.cues.sort((a, b) => a.start - b.start);
  return out;
}
