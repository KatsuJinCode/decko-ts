// compare.mjs -- diff the Ruby and TypeScript side-effect traces step by step.
//
//   node compare.mjs <ruby.json> <ts.json> [report.json]
//
// Per step, these must be equal for a PASS:
//   status     the HTTP status
//   errors     the validation / denial messages the user is shown
//   writes     row-count deltas of the card tables (cards, acts, actions,
//              changes, references, revisions)
//   actions    the card actions written, in id order: card name, action
//              type, and the card_changes field list
//   mail       captured outgoing mail: recipients and subject
//   files      stored file names (card and action ids normalised away) and,
//              for files other than images, the sha256 of their bytes
//   images     image variants: dimensions, format, and pixels within the
//              perceptual thresholds below
//   virtuals   card_virtuals rows (card-mod-virtual: the `+*asset input`
//              content of skins and stylesheets) created, changed or
//              deleted: the card, the content length and sha256
//   session    who the request sequence is signed in as afterwards
// Event order counts in the verdict where Ruby's order is deterministic: for
// the steps tools/parity-side-effects/event-order-evidence.json lists, the
// events both engines ran must come in the same order. The TypeScript engine
// runs most event bodies as engine code rather than named mod events, so the
// order is compared over the events both engines ran, not over every Ruby
// event (coverage is reported separately, as before). Steps outside that set
// are not graded on order, and the summary names how many.
//
// Normalisations (and only these):
//   - session storage: Ruby keeps sessions in a signed cookie (no row), the
//     port in its auth_sessions table; neither table is compared, the
//     signed-in identity is.
//   - error pages: Ruby renders errors inside the deck layout, the port as a
//     bare page; only the message text is compared. A server error is the
//     deployed "Wild Card!" block on both sides (the recording runs Ruby the
//     way a deployed site does, see tools/parity-side-effects/ruby/drive.rb), so it is compared by that
//     block, not by an exception message.
//   - HTML entities decoded, whitespace collapsed.
//   - mail bodies: account-token values replaced by <token> (signed with
//     different secrets and clocks), whitespace collapsed.
//   - file paths: "<card id>/<action id>" prefixes dropped (ids drift as soon
//     as the engines' write histories differ; a history-less card's file is
//     named by the clock's epoch seconds instead of an action id).
//   - card_virtuals: a row whose only change is its updated_at (Virtual#update
//     touching an unchanged row) is a timestamp and is not reported.

import { readFileSync, writeFileSync } from "node:fs";

const ruby = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ts = JSON.parse(readFileSync(process.argv[3], "utf8"));
const scenarios = JSON.parse(readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"));
for (const [engine, trace] of [["ruby", ruby], ["ts", ts]]) {
  if ((trace.network_blocked ?? []).length > 0) {
    console.error(`${engine} trace recorded ${trace.network_blocked.length} blocked network attempt(s); the run is invalid`);
    process.exit(3);
  }
}
const modOf =Object.fromEntries(scenarios.steps.map((s) => [s.name, s.mod]));
const methodOf = Object.fromEntries(scenarios.steps.map((s) => [s.name, s.method]));

const decode = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// A JSON error reply, compared whole: its exact text with requested_at
// replaced (each engine's own clock), or null when the body is not JSON.
function jsonError(step) {
  const b = String(step.body ?? "");
  if (!(step.status >= 400) || !b.trimStart().startsWith("{")) return null;
  try { JSON.parse(b); } catch { return null; }
  return b.replace(/"requested_at": "[^"]*"/, '"requested_at": "<time>"');
}

function rubyErrors(step) {
  const j = jsonError(step);
  if (j !== null) return j;
  const b = String(step.body ?? "");
  if (step.status === 403) {
    const m = b.match(/Sorry![\s\S]*?<\/div>/);
    return m ? decode(m[0].replace(/<[^>]+>/g, " ")) : "(denied)";
  }
  if (!(step.status >= 400)) return "";
  const text = decode(b.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " "));
  // A server error as a deployed site answers it: card-mod-format's
  // set/all/html/server_error.haml, the "Wild Card!" block. It carries no
  // exception message and no backtrace — that is the point of recording the
  // oracle the way it runs (tools/parity-side-effects/ruby/drive.rb sets
  // rescue_all_in_controller), so the message the two engines used to be
  // compared on is no longer on the page and the ports of the same view are
  // compared instead. Cut structurally, like the alert below: the deck
  // layout around it is chrome the port has no counterpart for.
  const wild = b.match(/<div class='border border-danger[^>]*>([\s\S]*?)<\/div>/);
  if (step.status >= 500 && wild) {
    return decode(wild[1].replace(/<[^>]+>/g, " "));
  }
  // The errors-view alert. The capture was the "Problems … b&w_logo" cut
  // below, which needs the deck layout Ruby's alert is normally rendered
  // inside; when Ruby renders the alert as a bare page there is no footer to
  // bound it, the cut missed, and the 160-char fallback returned the page's
  // title and heading instead of the message the port shows. The alert is
  // cut structurally instead (its own </div> bounds it), which is what the
  // port's twin does, and the <h4> heading is left out because the capture
  // starts at the "KEY:" token.
  const alert = b.match(/class="[^"]*card-error-msg"[^>]*>([\s\S]*?)<\/div>/);
  if (alert !== null) {
    const shown = [...alert[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => decode(p[1].replace(/<[^>]+>/g, " ")));
    if (shown.length > 0) return shown.join(" ");
  }
  const m = text.match(/Problems(?: with .*?)?\s((?:[A-Z_*+ ]+:.*?)+?)\s*b&w_logo/) ??
            text.match(/Problems(?: with .*?)?\s(.*?)\s*b&w_logo/);
  if (m) return m[1].trim();
  const h = text.match(/(Routing Error.*?)(?:Rails\.root|$)/);
  return h ? h[1].slice(0, 160) : text.slice(0, 160);
}

function tsErrors(step) {
  const j = jsonError(step);
  if (j !== null) return j;
  const b = String(step.body ?? "");
  if (!(step.status >= 400)) return "";
  if (step.status === 403) {
    const m = b.match(/<pre>([\s\S]*?)<\/pre>/);
    return m ? decode(m[1]) : "(denied)";
  }
  try {
    const j = JSON.parse(b);
    if (j?.error?.message) return j.error.message;
  } catch { /* html */ }
  const pre = b.match(/<pre>([\s\S]*?)<\/pre>/);
  if (pre) return decode(pre[1]);
  // The counterpart rubyErrors' server_error cut: the port renders the same
  // "Wild Card!" block (src/card/render/debug-server-error.ts SERVER_ERROR_HTML,
  // set/all/html/server_error.haml), so it is cut the same way. The <pre> arm
  // above and this one never match the same page, so their order is free.
  const wild = b.match(/<div class='border border-danger[^>]*>([\s\S]*?)<\/div>/);
  if (step.status >= 500 && wild) return decode(wild[1].replace(/<[^>]+>/g, " "));
  // The counterpart rubyErrors' `Problems … b&w_logo` cut (:82-84) had no
  // equivalent here, and the asymmetry was the whole defect: both engines
  // render the SAME errors-view alert (card-mod-format set/all/html/error.rb
  // :54-66 — the card-error-msg div, the "Problems with <card>" heading, one
  // <p><strong>KEY:</strong> message</p> per error), but Ruby renders it
  // inside the deck layout, where the b&w_logo footer bounds the capture,
  // while the port's bare page has no such footer. Falling through to the
  // 160-char tag-strip therefore kept the page's <title> ("Error
  // (signin-failure)") and the heading in the compared value, so every alert
  // step mismatched on a wrapper the two engines never disagreed about.
  //
  // The alert is cut structurally instead (the div's own </div> bounds it),
  // and the <h4> heading is left out because Ruby's capture starts at an
  // UPPER-ish "KEY:" token — which is precisely what skips that heading.
  const alert = b.match(/class="[^"]*card-error-msg"[^>]*>([\s\S]*?)<\/div>/);
  if (alert !== null) {
    const shown = [...alert[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => decode(p[1].replace(/<[^>]+>/g, " ")));
    if (shown.length > 0) return shown.join(" ");
  }
  return decode(b.replace(/<[^>]+>/g, " ")).slice(0, 160);
}

const CARD_TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_revisions", "card_virtuals"];
const writes = (s) => CARD_TABLES.filter((t) => (s.delta?.[t] ?? 0) !== 0).map((t) => `${t}${s.delta[t] > 0 ? "+" : ""}${s.delta[t]}`).join(" ") || "-";
const actions = (s) => (s.actions ?? []).map((a) => `${a.type} ${a.card} [${a.fields.join(",")}]`).join(" | ") || "-";
// who the rows are stamped with (set_stamper) and what was stored
const stamps = (s) => (s.actions ?? []).map((a) => `${a.card}: by ${a.creator ?? "?"}/${a.updater ?? "?"}`).join(" | ") || "-";
const stored = (s) => (s.actions ?? []).map((a) => `${a.card} = ${JSON.stringify(a.content ?? "")} changes ${JSON.stringify(a.values ?? [])}`).join(" | ") || "-";
// the redirect target, host dropped; a rev_id (the action id of a cached
// upload) normalised, as ids drift with the engines' write histories
const location = (s) => {
  const h = s.headers ?? {};
  const l = h.Location ?? h.location ?? "";
  return l.replace(/^https?:\/\/[^/]+/, "").replace(/rev_id=\d+/, "rev_id=<id>") || "-";
};
// Mail bodies are compared exactly, after three normalisations only: CRLF line
// endings (the Mail gem's wire encoding) become LF, account-token values
// become <token>, and the follower notice's unfollow link becomes
// <unfollow-url>.
//
// The unfollow link is the one byte range the port deliberately does not copy.
// Stock's link POSTs the recipient's virtual `User+*follow` dashboard with a
// subcard write; under the deck's permissions that request answers 403 and
// leaves the preference unchanged — a live-Ruby control documents the same 403
// (docs/reports/unfollow-direct-preference-repair-2026-10-18.md, the lead's
// narrow decision recorded 2026-10-17). The port therefore targets the
// recipient's existing owned preference directly: same rule, same `*never`
// value, different transport shape (`/update/<rule>?card[content]=*never`
// instead of `/update/<user>+*follow?card[subcards][<rule>]=*never`). This
// normalisation folds BOTH engines' shapes onto one token, so the divergence
// the lead approved is disclosed here instead of masquerading as a regression
// — and every other byte of every mail is still compared exactly: a link that
// stops matching `/update/...*never` (wrong target, dropped, retargeted)
// fails this battery again, because the raw bytes then differ. The repaired
// link's exact emitted bytes and its HTTP semantics (303 + stored `*never`,
// 403 for anonymous and foreign-owner variants) are pinned over real requests
// by tests/deploy/bunny-account-mail-http.test.ts ("mail unfollow edits the
// recipient's existing preference without granting dashboard or
// foreign-preference writes").
const normBody = (b) => String(b ?? "")
  .replace(/\r\n/g, "\n")
  .replace(/token=[A-Za-z0-9._%-]+/g, "token=<token>")
  .replace(/https?:\/\/[^\s"'<>]*\/update\/[^\s"'<>]*(?:%2A|\*)never[^\s"'<>]*/g, "<unfollow-url>");
const mail = (s) => (s.mail ?? []).map((m) =>
  `to ${[].concat(m.to).join(",")} from ${m.from_header ?? [].concat(m.from).join(",")} reply-to ${[].concat(m.reply_to ?? []).join(",")}: ${m.subject}`).join(" | ") || "-";
const mailText = (s) => (s.mail ?? []).map((m) => JSON.stringify(normBody(m.text_body ?? m.body_excerpt))).join(" | ") || "-";
const mailHtml = (s) => (s.mail ?? []).map((m) => JSON.stringify(normBody(m.html_body))).join(" | ") || "-";
const files = (s) => (s.files ?? [])
  .map((f) => `${f.path.replace(/^\d+\/\d+/, "")}${f.sha256 ? ` sha256:${f.sha256}` : ""}`).sort().join(",") || "-";
const virtuals = (s) => (s.virtuals ?? [])
  .map((v) => `${v.change} ${v.card} ${v.length} ${v.sha256.slice(0, 16)}`).join(" | ") || "-";
const session = (s) => s.signed_in_as ?? "anonymous";
// Session-type card contents kept in the visitor's session, by card key.
const sessionCards = (s) => JSON.stringify(Object.fromEntries(Object.entries(s.session_cards ?? {}).sort()));
// A closed account's holder is renamed ANON-<12 random hex digits> (in URLs,
// its url key ANON_<hex>).
const anon = (x) => x.replace(/ANON([-_])[0-9a-f]{12}/g, "ANON$1<hex>");
// Image variants. Byte identity with ImageMagick is not attainable (another
// encoder and filter implementation), so each variant is compared on:
//   dimensions  exact
//   format      exact (the file signature: PNG, JPEG, WebP, GIF)
//   pixels      PSNR of the two images composited over white must be at
//               least IMAGE_PSNR_MIN dB, and their opaque/transparent
//               masks must agree on at least IMAGE_ALPHA_AGREE of pixels.
// The thresholds and the measurements behind them are in the report.
const IMAGE_PSNR_MIN = 35;
const IMAGE_ALPHA_AGREE = 0.98;
const photon = await import("@cf-wasm/photon");
const signature = (b) =>
  b[0] === 0x89 && b[1] === 0x50 ? "png" : b[0] === 0xff && b[1] === 0xd8 ? "jpeg"
    : b[0] === 0x52 && b[8] === 0x57 ? "webp" : b[0] === 0x47 && b[1] === 0x49 ? "gif" : "other";
function decodeImage(b64) {
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const img = photon.PhotonImage.new_from_byteslice(bytes);
  const out = { format: signature(bytes), w: img.get_width(), h: img.get_height(), px: img.get_raw_pixels() };
  img.free();
  return out;
}
function imageDistance(a, b) {
  let se = 0, agree = 0;
  const n = a.w * a.h;
  for (let i = 0; i < n; i++) {
    const aa = a.px[i * 4 + 3] / 255, ba = b.px[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const d = (a.px[i * 4 + c] * aa + 255 * (1 - aa)) - (b.px[i * 4 + c] * ba + 255 * (1 - ba));
      se += d * d;
    }
    if ((aa > 0.5) === (ba > 0.5)) agree++;
  }
  const mse = se / (n * 3);
  return { psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), alphaAgree: agree / n };
}
const variants = (s) => Object.fromEntries((s.files ?? [])
  .filter((f) => f.b64 !== undefined && /-(icon|small|medium|large)\.[a-z]+$/.test(f.path))
  .map((f) => [f.path.replace(/^\d+\/\d+/, ""), decodeImage(f.b64)]));
const imageMetrics = {};
function imagesVerdict(r, t, step) {
  const rv = variants(r), tv = variants(t);
  const names = [...new Set([...Object.keys(rv), ...Object.keys(tv)])].sort();
  if (names.length === 0) return ["-", "-"];
  const rs = [], ts = [];
  for (const n of names) {
    const a = rv[n], b = tv[n];
    rs.push(a ? `${n} ${a.format} ${a.w}x${a.h}` : `${n} missing`);
    if (!a || !b) { ts.push(b ? `${n} ${b.format} ${b.w}x${b.h}` : `${n} missing`); continue; }
    if (a.format !== b.format || a.w !== b.w || a.h !== b.h) { ts.push(`${n} ${b.format} ${b.w}x${b.h}`); continue; }
    const m = imageDistance(a, b);
    (imageMetrics[step] ??= {})[n] = { psnr: Number(m.psnr.toFixed(2)), alphaAgree: Number(m.alphaAgree.toFixed(4)) };
    const ok = m.psnr >= IMAGE_PSNR_MIN && m.alphaAgree >= IMAGE_ALPHA_AGREE;
    ts.push(ok ? `${n} ${b.format} ${b.w}x${b.h}` : `${n} ${b.format} ${b.w}x${b.h} PSNR ${m.psnr.toFixed(1)} alpha ${m.alphaAgree.toFixed(3)}`);
  }
  return [rs.join(", "), ts.join(", ")];
}

// Ruby errors on denial read "Sorry! Please sign in or sign up to do that."
// for every anonymous denial; compare like for like.
const fields = {
  status: (s) => String(s.status),
  location,
  writes, actions, stamps, stored, mail, mailText, mailHtml, files, virtuals, session, sessionCards,
};

// ---- event order: the ordered list of distinct event names each engine
// ran for the step. Score = steps whose TS list equals Ruby's exactly;
// coverage = share of Ruby's events the TS engine also ran as named events.
const eventNames = (s, isRuby) => {
  const seen = [];
  for (const e of s.events ?? []) {
    const n = isRuby ? e[1] : e[1];
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
};

// ---- deliberate differences. A step may carry
//   "deliberate": { "why": "...", "ruby": {field: value}, "ts": {field: value} }
// naming the fields where the port deliberately does not copy Ruby (a
// security hole or a crash, per the parity brief). Such a step passes as
// DELIBERATE only when every differing field is pinned and each engine shows
// exactly its pinned value; any other difference, or a pinned field on which
// the engines now agree, is a MISMATCH.
const deliberateOf = Object.fromEntries(scenarios.steps.filter((s) => s.deliberate).map((s) => [s.name, s.deliberate]));
//   "consequences": [field...], "absentIn": "ruby" | "ts"
// names the fields that differ only because one engine refused or crashed:
// each may differ when the engine named by absentIn shows nothing ("-") there.
function deliberateVerdict(name, diffs) {
  const pin = deliberateOf[name];
  if (pin === undefined) return null;
  const pinned = new Set([...Object.keys(pin.ruby ?? {}), ...Object.keys(pin.ts ?? {})]);
  const consequences = new Set(pin.consequences ?? []);
  const broken = [];
  for (const [k, [a, b]] of Object.entries(diffs)) {
    if (consequences.has(k)) {
      const absent = pin.absentIn === "ruby" ? a : b;
      if (absent !== "-") broken.push(`${k}: ${pin.absentIn} shows ${JSON.stringify(absent)}, expected nothing`);
    } else if (!pinned.has(k)) broken.push(`${k} differs but is not pinned`);
    else {
      if (pin.ruby?.[k] !== undefined && pin.ruby[k] !== a) broken.push(`${k}: ruby shows ${JSON.stringify(a)}, pinned ${JSON.stringify(pin.ruby[k])}`);
      if (pin.ts?.[k] !== undefined && pin.ts[k] !== b) broken.push(`${k}: ts shows ${JSON.stringify(b)}, pinned ${JSON.stringify(pin.ts[k])}`);
    }
  }
  for (const k of pinned) if (!(k in diffs)) broken.push(`${k}: pinned difference no longer differs`);
  return broken;
}

// ---- event order in the verdict, for the steps whose Ruby order is deterministic.
// event-order-evidence.mjs derives the set from two fresh Ruby runs and the
// committed recording; a step outside it is not graded on order (its recorded
// order is not established), and the summary says how many were left out.
const orderEvidence = JSON.parse(readFileSync(new URL("./event-order-evidence.json", import.meta.url), "utf8"));
const orderDeterministic = new Set(orderEvidence.deterministic);

const rows = [];
const n = Math.max(ruby.steps.length, ts.steps.length);
for (let i = 0; i < n; i++) {
  const r = ruby.steps[i];
  const t = ts.steps[i];
  const name = r?.step ?? t?.step;
  const diffs = {};
  for (const [k, f] of Object.entries(fields)) {
    const a = r ? anon(f(r)) : "(missing)";
    const b = t ? anon(f(t)) : "(missing)";
    if (a !== b) diffs[k] = [a, b];
  }
  if (r && t) {
    const [ri, ti] = imagesVerdict(r, t, name);
    if (ri !== ti) diffs.images = [ri, ti];
  }
  const re = r ? rubyErrors(r) : "";
  const te = t ? tsErrors(t) : "";
  // GETs are answered from the fetch layer on the TypeScript side (no page
  // body), so only their status is compared.
  if (re !== te && methodOf[name] !== "get") diffs.errors = [re, te];
  const rev = r ? eventNames(r, true) : [];
  const tev = t ? eventNames(t, false) : [];
  const common = rev.filter((e) => tev.includes(e));
  const tsOrder = tev.filter((e) => common.includes(e));
  // Event order counts in the verdict where Ruby's order is deterministic: the
  // events both engines ran must come in the same order.
  const orderGraded = orderDeterministic.has(name);
  if (orderGraded && JSON.stringify(common) !== JSON.stringify(tsOrder)) {
    diffs.events = [common.join(" > "), tsOrder.join(" > ")];
  }
  const broken = deliberateVerdict(name, diffs);
  const verdict = broken === null ? (Object.keys(diffs).length === 0 ? "PASS" : "MISMATCH")
    : broken.length === 0 ? "DELIBERATE" : "MISMATCH";
  rows.push({
    step: name, mod: modOf[name] ?? "?", verdict, diffs,
    ...(broken === null ? {} : { deliberate: { why: deliberateOf[name].why, broken } }),
    events: {
      ruby: rev, ts: tev, exact: JSON.stringify(rev) === JSON.stringify(tev),
      coverage: rev.length === 0 ? null : common.length / rev.length,
      orderAgrees: JSON.stringify(common) === JSON.stringify(tsOrder),
      orderGraded,
      missingInTs: rev.filter((e) => !tev.includes(e)),
      extraInTs: tev.filter((e) => !rev.includes(e)),
    },
  });
}

const pass = rows.filter((r) => r.verdict === "PASS").length;
const deliberate = rows.filter((r) => r.verdict === "DELIBERATE").length;
const evExact = rows.filter((r) => r.events.exact).length;
const byMod = {};
for (const r of rows) {
  byMod[r.mod] ??= { pass: 0, deliberate: 0, total: 0 };
  byMod[r.mod].total++;
  if (r.verdict === "PASS") byMod[r.mod].pass++;
  if (r.verdict === "DELIBERATE") byMod[r.mod].deliberate++;
}

for (const r of rows) {
  console.log(`${r.verdict.padEnd(9)} ${r.mod.padEnd(12)} ${r.step}`);
  for (const [k, [a, b]] of Object.entries(r.diffs)) {
    console.log(`            ${k.padEnd(8)} ruby: ${a}`);
    console.log(`            ${"".padEnd(8)}   ts: ${b}`);
  }
  for (const x of r.deliberate?.broken ?? []) console.log(`            pin      ${x}`);
}
console.log(`\nSIDE EFFECTS PASS ${pass} / ${rows.length}; deliberate differences pinned ${deliberate}; mismatches ${rows.length - pass - deliberate}`);
for (const [m, v] of Object.entries(byMod)) console.log(`  ${m.padEnd(12)} ${v.pass}/${v.total}${v.deliberate ? ` (+${v.deliberate} deliberate)` : ""}`);
const orderRows = rows.filter((r) => r.events.orderGraded);
const orderBad = orderRows.filter((r) => !r.events.orderAgrees).map((r) => r.step);
console.log(`EVENT ORDER exact ${evExact} / ${rows.length} (informational; the verdict uses the deterministic steps below)`);
console.log(`EVENT ORDER in verdict: ${orderRows.length - orderBad.length} / ${orderRows.length} deterministic steps agree; ${rows.length - orderRows.length} not established (see event-order-evidence.json)${orderBad.length ? `; disagreeing: ${orderBad.join(", ")}` : ""}`);
for (const [step, m] of Object.entries(imageMetrics)) {
  console.log(`IMAGES ${step}: ${Object.entries(m).map(([n, v]) => `${n} PSNR ${v.psnr} alpha ${v.alphaAgree}`).join("; ")}`);
}

if (process.argv[4]) {
  writeFileSync(process.argv[4], JSON.stringify({ pass, deliberate, total: rows.length, byMod, evExact, imageMetrics, rows }, null, 2));
}
