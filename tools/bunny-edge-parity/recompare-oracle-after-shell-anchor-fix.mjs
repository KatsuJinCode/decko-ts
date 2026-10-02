// recompare-oracle-after-shell-anchor-fix.mjs — SECOND STAGE of the authed
// parity harness: re-run the ORACLE comparison only, for the five URLs the
// first pass could not grade, after fixing the shell-strip anchor.
//
// WHY A SECOND PASS AT ALL (stated, not smoothed):
//   The first pass's stripShell anchored on
//     <div class="nav">…</div><div
//   and returned the text AFTER that `<div` token, so it deleted the opening
//   `<div ` of the card's own wrapper. Every oracle row then compared
//   "id=..." against "<div id=...", diverging at offset 0 — a HARNESS defect
//   reporting as an ENGINE divergence. layoutPage (worker.ts:156-159) emits
//   exactly `…<div class="nav">…</div>${body}</body></html>`, so the correct
//   extraction is: take everything between `</div>` (end of nav) and
//   `</body></html>` (end of document). Fixed here.
//
// REQUEST BUDGET: this stage fetches ONLY the five graded URLs, twice each
// (anon + authed) = 10 requests. Running the whole 53-URL sample again would
// have cost 106 more; the first pass's bodies were not persisted, so the five
// are re-fetched rather than the sample re-run. Cumulative this lane:
//   157 requests total across this lane (exact enumeration in the lane receipt).
//
// SECRETS: creds read by key name, bearer only, never printed.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

const EDGE = "https://decko-edge-wm2um.bunny.run";
const RELEASE_ID = 1125468;
const SEED_OUT = new URL("./throwaway-account-seed-output.json", import.meta.url);
const ORACLE_ROOT = "C:/localProjects/decko-ts-lane-postfix-canvas/tmp/raw-ground-truth/expected-v2";
const IN = new URL("./authed-parity-sample.json", import.meta.url);
const OUT = new URL("./authed-parity-oracle-recompare.json", import.meta.url);

const VIEWS = new Set([
  "open", "closed", "content", "title", "titled", "menu", "core", "card_list", "naked",
  "bar", "bar_left", "bar_middle", "bar_right", "bar_bottom", "history", "act", "action_summary",
]);
function splitPath(path) {
  const clean = path.replace(/\/+$/, "").replace(/^\/+/, "");
  if (clean === "") return { name: "Home", view: "open" };
  const seg = clean.split("/");
  if (seg.length === 1) return { name: decodeURIComponent(seg[0]), view: "open" };
  if (seg.length === 2 && VIEWS.has(seg[1])) return { name: decodeURIComponent(seg[0]), view: seg[1] };
  return { name: decodeURIComponent(seg[0] ?? ""), view: null };
}

const SLOT_ID = /data-slot-id=(["'])[0-9a-fA-F]+\1/g;
const normalize = (s) => s.replace(SLOT_ID, 'data-slot-id="RANDOMIZED"');

/** CORRECTED: layoutPage is `…<body><div class="nav">…</div>${body}</body></html>`.
 *  So the bare card body is exactly what lies between the nav's closing
 *  `</div>` and the document's `</body></html>`. Both anchors must match or
 *  the row is reported as a shell-extraction failure, never compared. */
function stripShell(html) {
  const open = /<div class="nav">[\s\S]*?<\/div>/.exec(html);
  if (open === null) return null;
  const start = open.index + open[0].length;
  const end = html.lastIndexOf("</body></html>");
  if (end <= start) return null;
  return html.slice(start, end);
}

function firstDiff(a, b, ctx = 70) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        offset: i,
        edge: a.slice(Math.max(0, i - ctx), i + ctx),
        oracle: b.slice(Math.max(0, i - ctx), i + ctx),
        edge_len: a.length,
        oracle_len: b.length,
      };
    }
  }
  if (a.length === b.length) return null;
  return {
    offset: n,
    edge: a.slice(Math.max(0, n - ctx), n + ctx),
    oracle: b.slice(Math.max(0, n - ctx), n + ctx),
    edge_len: a.length,
    oracle_len: b.length,
  };
}

async function loadOracle() {
  const index = new Map();
  const dir = `${ORACLE_ROOT}/view-lane`;
  if (!existsSync(dir)) return index;
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  for (const f of files) {
    const text = await readFile(`${dir}/${f}`, "utf8");
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const name = row?.name;
      const views = row?.views;
      if (typeof name !== "string" || views === null || typeof views !== "object") continue;
      for (const [view, body] of Object.entries(views)) {
        if (typeof body === "string") index.set(`${name}|${view}`, body);
      }
    }
  }
  return index;
}

async function get(path, cookie) {
  const res = await fetch(EDGE + encodeURI(path), {
    headers: cookie === null ? {} : { Cookie: cookie },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_OUT, "utf8"));
  const cookie = `decko_ts_session=${seed.rawToken}`;
  const first = JSON.parse(readFileSync(IN, "utf8"));
  const targets = first.rows.filter(
    (r) => r.oracle_verdict === "divergent" || r.oracle_verdict === "shell-extraction-failed",
  );
  const oracle = await loadOracle();
  const rows = [];
  let requests = 0;

  for (const t of targets) {
    const anon = await get(t.path, null); requests++;
    const authed = await get(t.path, cookie); requests++;
    const anonShell = stripShell(normalize(anon.body));
    const authedShell = stripShell(normalize(authed.body));
    const { name, view } = splitPath(t.path);
    const oracleBody = view === null ? undefined : oracle.get(`${name}|${view}`);

    let verdict = "no-oracle-capture";
    let diff = null;
    if (oracleBody !== undefined) {
      if (t.path.startsWith("/api/")) {
        verdict = "oracle-capture-is-html-not-json";
      } else if (authedShell === null) {
        verdict = "shell-extraction-failed";
      } else {
        const oN = normalize(oracleBody);
        verdict = authedShell === oN ? "identical" : "divergent";
        if (verdict === "divergent") diff = firstDiff(authedShell, oN);
      }
    }
    rows.push({
      path: t.path,
      name,
      view,
      anon_status: anon.status,
      authed_status: authed.status,
      edge_shell_bytes: authedShell === null ? null : authedShell.length,
      oracle_bytes: oracleBody === undefined ? null : oracleBody.length,
      anon_equals_authed: normalize(anon.body) === normalize(authed.body),
      oracle_verdict_pass1: t.oracle_verdict,
      oracle_verdict_pass2: verdict,
      first_diff: diff,
    });
    process.stderr.write(`${t.path} -> ${verdict}\n`);
  }

  const out = {
    target: EDGE, release_id: RELEASE_ID, script_id: 93646, account: "trial",
    stage: "pass 2 — oracle recompare with the corrected shell-strip anchor",
    sampled_at: new Date().toISOString(),
    requests_issued_this_stage: requests,
    cumulative_requests_this_lane: 157,
    rows,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error("FAILED:", e.stack ?? e.message); process.exit(1); });
