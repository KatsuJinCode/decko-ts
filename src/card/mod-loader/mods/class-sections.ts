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
            `<span class="muted" style="font-size:.78rem;display:block;margin-top:.5rem">It cannot be framed here: the library answers <code>frame-ancestors 'self'</code>, its own security default. Opened in a second window, it sits beside this page.</span></div>`,
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
  set("all/class_player", ({ format }) => {
    format("html", ({ view }) => {
      view("class_player", { cache: "never" }, (ctx) => {
        const embedUrl = ctx.fmt.renderRaw().trim();
        let body: string;
        if (embedUrl === "") {
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
            '<p style="font-size:.85rem;margin:.5rem .15rem 0">The recording plays in the library\'s own player: the library serves the video, keeps the entitlements, and answers with <code>frame-ancestors \'self\'</code>, so no page on another port can frame it. Every moment below links straight into it at its timestamp.</p>',
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
          '<p class="muted" style="font-size:.85rem;margin:.1rem 0 .5rem">The library cut this class into moments and named each one from the transcript. The cut points and the names are the machine\'s until they are approved. Every row plays from its timestamp in the library player.</p>',
        );
        if (index.segments.length > 0) {
          parts.push('<h3 style="margin:.2rem 0 .3rem;font-size:1rem">The class, section by section</h3>');
          parts.push('<ul style="list-style:none;padding:0;margin:0 0 .6rem">');
          index.segments.forEach((seg, i) => {
            const color = SEG_PALETTE[i % SEG_PALETTE.length];
            parts.push(
              `<li style="list-style:none;border-left:4px solid ${color};padding-left:.5rem;margin:.25rem 0">` +
                `<a href="${esc(index.base)}?t=${Math.round(seg.start)}" target="_blank" rel="noopener"><strong>${esc(seg.name)}</strong></a> ` +
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
                `<a href="${esc(index.base)}?t=${Math.round(m.start)}" target="_blank" rel="noopener">${esc(m.title)}</a></li>`,
            );
          }
          parts.push("</ul>");
        }
        return accordionWrap(ctx, parts.join("\n"));
      });
    });
  });
});
