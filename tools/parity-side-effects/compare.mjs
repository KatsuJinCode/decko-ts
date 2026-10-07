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
//   - file paths: "<card id>/<action id>" prefixes dropped (ids drift as soon
//     as the engines' write histories differ).

import { readFileSync, writeFileSync } from "node:fs";

const ruby = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ts = JSON.parse(readFileSync(process.argv[3], "utf8"));
const scenarios = JSON.parse(readFileSync(new URL("./scenarios.json", import.meta.url), "utf8"));
const modOf = Object.fromEntries(scenarios.steps.map((s) => [s.name, s.mod]));

const decode = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function rubyErrors(step) {
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
const mail = (s) => (s.mail ?? []).map((m) => `${m.to.join(",")}: ${m.subject}`).join(" | ") || "-";
const files = (s) => (s.files ?? []).map((f) => f.path.replace(/^\d+\/\d+/, "")).sort().join(",") || "-";
const session = (s) => s.signed_in_as ?? "anonymous";

// Ruby errors on denial read "Sorry! Please sign in or sign up to do that."
// for every anonymous denial; compare like for like.
const fields = {
  status: (s) => String(s.status),
  writes, actions, mail, files, session,
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
  const re = r ? rubyErrors(r) : "";
  const te = t ? tsErrors(t) : "";
  if (re !== te) diffs.errors = [re, te];
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

if (process.argv[4]) {
  writeFileSync(process.argv[4], JSON.stringify({ pass, total: rows.length, byMod, evExact, rows }, null, 2));
}
