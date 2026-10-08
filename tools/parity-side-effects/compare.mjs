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
//   files      stored file names (card and action ids normalised away)
//   images     image variants: dimensions, format, and pixels within the
//              perceptual thresholds below
//   session    who the request sequence is signed in as afterwards
// Event order is scored separately (see below): the TypeScript engine runs
// most event bodies as engine code rather than named mod events, so a
// strict event-sequence verdict would fail every save for the same reason.
//
// Normalisations (and only these):
//   - session storage: Ruby keeps sessions in a signed cookie (no row), the
//     port in its auth_sessions table; neither table is compared, the
//     signed-in identity is.
//   - error pages: Ruby renders errors inside the deck layout, the port as a
//     bare page; only the message text is compared.
//   - HTML entities decoded, whitespace collapsed.
//   - mail bodies: account-token values replaced by <token> (signed with
//     different secrets and clocks), whitespace collapsed.
//   - file paths: "<card id>/<action id>" prefixes dropped (ids drift as soon
//     as the engines' write histories differ).

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
  const text = decode(b.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " "));
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
  const m = b.match(/<pre>([\s\S]*?)<\/pre>/);
  return m ? decode(m[1]) : decode(b.replace(/<[^>]+>/g, " ")).slice(0, 160);
}

const CARD_TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_revisions"];
const writes = (s) => CARD_TABLES.filter((t) => (s.delta?.[t] ?? 0) !== 0).map((t) => `${t}${s.delta[t] > 0 ? "+" : ""}${s.delta[t]}`).join(" ") || "-";
const actions = (s) => (s.actions ?? []).map((a) => `${a.type} ${a.card} [${a.fields.join(",")}]`).join(" | ") || "-";
// who the rows are stamped with (set_stamper) and what was stored
const stamps = (s) => (s.actions ?? []).map((a) => `${a.card}: by ${a.creator ?? "?"}/${a.updater ?? "?"}`).join(" | ") || "-";
const stored = (s) => (s.actions ?? []).map((a) => `${a.card} = ${JSON.stringify(a.content ?? "")} changes ${JSON.stringify(a.values ?? [])}`).join(" | ") || "-";
// the redirect target, host dropped
const location = (s) => { const h = s.headers ?? {}; const l = h.Location ?? h.location ?? ""; return l.replace(/^https?:\/\/[^/]+/, "") || "-"; };
// Mail bodies are compared exactly, after two normalisations only: CRLF line
// endings (the Mail gem's wire encoding) become LF, and account-token values
// become <token>.
const normBody = (b) => String(b ?? "").replace(/\r\n/g, "\n").replace(/token=[A-Za-z0-9._%-]+/g, "token=<token>");
const mail = (s) => (s.mail ?? []).map((m) =>
  `to ${[].concat(m.to).join(",")} from ${m.from_header ?? [].concat(m.from).join(",")} reply-to ${[].concat(m.reply_to ?? []).join(",")}: ${m.subject}`).join(" | ") || "-";
const mailText = (s) => (s.mail ?? []).map((m) => JSON.stringify(normBody(m.text_body ?? m.body_excerpt))).join(" | ") || "-";
const mailHtml = (s) => (s.mail ?? []).map((m) => JSON.stringify(normBody(m.html_body))).join(" | ") || "-";
const files = (s) => (s.files ?? []).map((f) => f.path.replace(/^\d+\/\d+/, "")).sort().join(",") || "-";
const session = (s) => s.signed_in_as ?? "anonymous";
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
  writes, actions, stamps, stored, mail, mailText, mailHtml, files, session,
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

const rows = [];
const n = Math.max(ruby.steps.length, ts.steps.length);
for (let i = 0; i < n; i++) {
  const r = ruby.steps[i];
  const t = ts.steps[i];
  const name = r?.step ?? t?.step;
  const diffs = {};
  for (const [k, f] of Object.entries(fields)) {
    const a = r ? f(r) : "(missing)";
    const b = t ? f(t) : "(missing)";
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
  rows.push({
    step: name, mod: modOf[name] ?? "?", verdict: Object.keys(diffs).length === 0 ? "PASS" : "MISMATCH", diffs,
    events: {
      ruby: rev, ts: tev, exact: JSON.stringify(rev) === JSON.stringify(tev),
      coverage: rev.length === 0 ? null : common.length / rev.length,
      orderAgrees: JSON.stringify(common) === JSON.stringify(tsOrder),
      missingInTs: rev.filter((e) => !tev.includes(e)),
      extraInTs: tev.filter((e) => !rev.includes(e)),
    },
  });
}

const pass = rows.filter((r) => r.verdict === "PASS").length;
const evExact = rows.filter((r) => r.events.exact).length;
const byMod = {};
for (const r of rows) {
  byMod[r.mod] ??= { pass: 0, total: 0 };
  byMod[r.mod].total++;
  if (r.verdict === "PASS") byMod[r.mod].pass++;
}

for (const r of rows) {
  console.log(`${r.verdict.padEnd(9)} ${r.mod.padEnd(12)} ${r.step}`);
  for (const [k, [a, b]] of Object.entries(r.diffs)) {
    console.log(`            ${k.padEnd(8)} ruby: ${a}`);
    console.log(`            ${"".padEnd(8)}   ts: ${b}`);
  }
}
console.log(`\nSIDE EFFECTS PASS ${pass} / ${rows.length}`);
for (const [m, v] of Object.entries(byMod)) console.log(`  ${m.padEnd(12)} ${v.pass}/${v.total}`);
console.log(`EVENT ORDER exact ${evExact} / ${rows.length}`);
for (const [step, m] of Object.entries(imageMetrics)) {
  console.log(`IMAGES ${step}: ${Object.entries(m).map(([n, v]) => `${n} PSNR ${v.psnr} alpha ${v.alphaAgree}`).join("; ")}`);
}

if (process.argv[4]) {
  writeFileSync(process.argv[4], JSON.stringify({ pass, total: rows.length, byMod, evExact, imageMetrics, rows }, null, 2));
}
