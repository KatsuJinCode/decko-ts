// run-authed-parity-against-bunny-edge.mjs — SIGNED-IN parity sample against
// the Bunny TRIAL edge (target identified by BUNNY_SCRIPT_ID / BUNNY_RELEASE_ID,
// operator-supplied, never committed).
//
// WHAT THIS MEASURES, in this order, per URL:
//   1. ANON vs AUTHED. The same URL fetched twice — once bare, once with
//      `Cookie: decko_ts_session=<token>` for an account this lane seeded —
//      compared byte-for-byte after the engine's own per-request
//      data-slot-id randomization is neutralized. This is the ask's question:
//      does the deployed edge serve a DIFFERENT page to a signed-in viewer?
//   2. AUTHED vs RUBY ORACLE, where an oracle capture exists for (name, view).
//      The oracle stores the BARE card body (tools/oracle/capture-dual-lane-
//      page-and-view.rb:281) while the edge wraps the same engine body in
//      layoutPage (deploy/…/bunny-edge-engine-entry.ts via worker.ts:156-160),
//      so the shell is stripped with STRICT anchors: both the opening and the
//      closing anchor must match or the row is reported as a shell-extraction
//      failure and is NEVER silently compared.
//   3. The signed-in header/nav assertion: whether the shell's nav block
//      changes between the anon and the authed fetch of the same URL.
//
// REQUEST BUDGET: the ask caps this at ~100 requests, sequential. Two fetches
// per URL x N URLs, so the sample is sized to stay inside it.
//
// SECRETS: DB creds read by key name, bearer only, never printed. The session
// token is read from the seeder's output file (a token this lane minted for an
// account this lane created) and is only ever sent as a Cookie header.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { readFile as rf } from "node:fs/promises";

const EDGE = "https://decko-edge-wm2um.bunny.run";
// The deployment target is operator input, never committed to the public
// tree: the tool refuses to run rather than default to an unnamed deploy.
function requireEnv(name) {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    console.error(`MISSING INPUT: set ${name} (the deployed edge's ${name === "BUNNY_SCRIPT_ID" ? "script" : "release"} id) before running this tool.`);
    process.exit(1);
  }
  return v.trim();
}
const SCRIPT_ID = requireEnv("BUNNY_SCRIPT_ID");
const RELEASE_ID = requireEnv("BUNNY_RELEASE_ID");
const SEED_OUT = new URL("./throwaway-account-seed-output.json", import.meta.url);
const ORACLE_ROOT = "C:/localProjects/decko-ts-lane-postfix-canvas/tmp/raw-ground-truth/expected-v2";
const OUT = new URL("./authed-parity-sample.json", import.meta.url);

// ---------------------------------------------------------------------------
// The sample: Home, an owned-card view set, account/settings surfaces, a
// sample of readable content cards, and a denied-card view. Sized at 50 so
// 2 fetches each = 100 requests, the ask's cap.
// ---------------------------------------------------------------------------
const OWNED = "AuthedParityProbe";
const URLS = [
  // Home / root
  { path: "/", label: "home-root" },
  { path: "/Home", label: "home-card" },
  { path: "/Home/content", label: "home-content" },
  { path: "/Home/closed", label: "home-closed" },
  { path: "/Home/title", label: "home-title" },
  // The owned card this lane seeded (the throwaway account holder)
  { path: `/${OWNED}`, label: "owned-card-open" },
  { path: `/${OWNED}/content`, label: "owned-card-content" },
  { path: `/${OWNED}/closed`, label: "owned-card-closed" },
  { path: `/${OWNED}/title`, label: "owned-card-title" },
  { path: `/${OWNED}/titled`, label: "owned-card-titled" },
  { path: `/${OWNED}/bar`, label: "owned-card-bar" },
  { path: `/${OWNED}/naked`, label: "owned-card-naked" },
  { path: `/${OWNED}/history`, label: "owned-card-history" },
  // The account junction + its field cards (the account surface)
  { path: `/${OWNED}+*account`, label: "owned-account-open" },
  { path: `/${OWNED}+*account/content`, label: "owned-account-content" },
  { path: `/${OWNED}+*account/closed`, label: "owned-account-closed" },
  // Account / settings surfaces of the deck
  { path: "/*account settings", label: "account-settings-open" },
  { path: "/*account settings/content", label: "account-settings-content" },
  { path: "/Setting", label: "setting-open" },
  { path: "/Setting/content", label: "setting-content" },
  { path: "/*signin", label: "signin-open" },
  { path: "/*signin/content", label: "signin-content" },
  { path: "/*signin/title", label: "signin-title" },
  { path: "/*signout", label: "signout-open" },
  // The denied card (this deck's stored-rule denial; /api/card proof below)
  { path: "/Taking Stock", label: "denied-open" },
  { path: "/Taking Stock/content", label: "denied-content" },
  { path: "/Taking Stock/closed", label: "denied-closed" },
  { path: "/api/card/Taking Stock", label: "denied-api-json" },
  // Readable content cards sampled from the trial deck's named rows
  { path: "/About", label: "readable-about" },
  { path: "/About/content", label: "readable-about-content" },
  { path: "/Hello World", label: "readable-hello-world" },
  { path: "/Hello World/content", label: "readable-hello-world-content" },
  { path: "/RichText", label: "readable-richtext" },
  { path: "/RichText/content", label: "readable-richtext-content" },
  { path: "/Decko Bot 1", label: "readable-decko-bot" },
  { path: "/Decko Bot 1/content", label: "readable-decko-bot-content" },
  { path: "/Anonymous", label: "readable-anonymous" },
  { path: "/Anonymous/content", label: "readable-anonymous-content" },
  { path: "/Anyone", label: "readable-anyone" },
  { path: "/Role", label: "readable-role" },
  { path: "/Cardtype", label: "readable-cardtype" },
  { path: "/Person", label: "readable-person" },
  { path: "/Brandon Williamscraig", label: "readable-person-1" },
  { path: "/Jordan Sample", label: "readable-person-2" },
  { path: "/David Williams", label: "readable-person-3" },
  { path: "/Brandon Williamscraig/content", label: "readable-person-1-content" },
  { path: "/Jordan Sample/content", label: "readable-person-2-content" },
  { path: "/Search", label: "readable-search" },
  { path: "/Search/content", label: "readable-search-content" },
  { path: "/List", label: "readable-list" },
  { path: "/*all/content", label: "readable-all-content" },
  { path: "/*all", label: "readable-all-open" },
  { path: "/api/card/About", label: "readable-about-api" },
];

// ---------------------------------------------------------------------------
// Normalization: the engine randomizes data-slot-id per request (the same
// rule the oracle capture already applied — its rows carry
// data-slot-id="RANDOMIZED"). Neutralize both sides identically.
// ---------------------------------------------------------------------------
const SLOT_ID = /data-slot-id=(["'])[0-9a-fA-F]+\1/g;
const normalize = (s) => s.replace(SLOT_ID, 'data-slot-id="RANDOMIZED"');

/** Strict shell strip. The edge serves layoutPage(title, body); the oracle
 *  stores the bare body. Returns null when the anchors do not BOTH match, so
 *  an unextractable row is reported rather than compared against garbage. */
function stripShell(html) {
  const open = /<div class="nav">[\s\S]*?<\/div><div /.exec(html);
  if (open === null) return null;
  const start = open.index + open[0].length;
  const end = html.lastIndexOf("</body></html>");
  if (end <= start) return null;
  return html.slice(start, end);
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        offset: i,
        left: a.slice(Math.max(0, i - 60), i + 60),
        right: b.slice(Math.max(0, i - 60), i + 60),
        left_len: a.length,
        right_len: b.length,
      };
    }
  }
  if (a.length === b.length) return null;
  return {
    offset: n,
    left: a.slice(Math.max(0, n - 60), n + 60),
    right: b.slice(Math.max(0, n - 60), n + 60),
    left_len: a.length,
    right_len: b.length,
  };
}

function navBlock(html) {
  const m = /<div class="nav">[\s\S]*?<\/div>/.exec(html);
  return m === null ? null : m[0];
}

async function get(path, cookie) {
  const headers = cookie === null ? {} : { Cookie: cookie };
  const res = await fetch(EDGE + encodeURI(path), { headers, redirect: "manual" });
  const body = await res.text();
  return { status: res.status, body, setCookie: res.headers.get("set-cookie") };
}

/** Load the oracle's (name, view) -> body index from the view-lane shards. */
async function loadOracle() {
  const index = new Map();
  const dir = `${ORACLE_ROOT}/view-lane`;
  if (!existsSync(dir)) return { index, loaded: 0, note: "oracle view-lane dir absent" };
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).length;
  let loaded = 0;
  for (let f = 0; f < files; f++) {
    const p = `${dir}/recapture-raw-shard-${String(f).padStart(6, "0")}.jsonl`;
    if (!existsSync(p)) continue;
    const text = await rf(p, "utf8");
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const name = row?.name;
      const views = row?.views;
      if (typeof name !== "string" || views === null || typeof views !== "object") continue;
      for (const [view, body] of Object.entries(views)) {
        if (typeof body !== "string") continue;
        index.set(`${name}|${view}`, body);
        loaded++;
      }
    }
  }
  return { index, loaded, shards: files };
}

/** Split "/<name>/<view>" into the (name, view) pair parsePath would make. */
const VIEWS = new Set([
  "open", "closed", "content", "title", "titled", "menu",
  "core", "card_list", "naked", "bar", "bar_left", "bar_middle",
  "bar_right", "bar_bottom",
  "history", "act", "action_summary",
]);
function splitPath(path) {
  const clean = path.replace(/\/+$/, "").replace(/^\/+/, "");
  if (clean === "") return { name: "Home", view: "open" };
  const seg = clean.split("/");
  if (seg.length === 1) return { name: decodeURIComponent(seg[0]), view: "open" };
  if (seg.length === 2 && VIEWS.has(seg[1])) return { name: decodeURIComponent(seg[0]), view: seg[1] };
  return { name: decodeURIComponent(seg[0] ?? ""), view: null };
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_OUT, "utf8"));
  const cookie = `decko_ts_session=${seed.rawToken}`;
  const oracle = await loadOracle();
  const rows = [];
  let requests = 0;

  for (const u of URLS) {
    const anon = await get(u.path, null);
    requests++;
    const authed = await get(u.path, cookie);
    requests++;

    const anonN = normalize(anon.body);
    const authedN = normalize(authed.body);
    const anonShell = stripShell(anonN);
    const authedShell = stripShell(authedN);

    // 1. anon vs authed — the ask's signed-in parity question
    let sessionVerdict;
    let sessionDiff = null;
    if (anon.status === 404 && authed.status === 404) {
      sessionVerdict = "absent-both";
    } else if (anonN === authedN && anon.status === authed.status) {
      sessionVerdict = "identical";
    } else {
      sessionVerdict = "divergent";
      sessionDiff = firstDiff(anonN, authedN);
    }

    // 2. authed vs oracle, where a capture exists
    const { name, view } = splitPath(u.path);
    const oracleBody = view === null ? undefined : oracle.index.get(`${name}|${view}`);
    let oracleVerdict = "no-oracle-capture";
    let oracleDiff = null;
    if (oracleBody !== undefined) {
      if (u.path.startsWith("/api/")) {
        oracleVerdict = "oracle-capture-is-html-not-json";
      } else if (authedShell === null) {
        oracleVerdict = "shell-extraction-failed";
      } else {
        const oN = normalize(oracleBody);
        if (authedShell === oN) {
          oracleVerdict = "identical";
        } else {
          oracleVerdict = "divergent";
          oracleDiff = firstDiff(authedShell, oN);
        }
      }
    }

    rows.push({
      path: u.path,
      label: u.label,
      name,
      view,
      anon_status: anon.status,
      authed_status: authed.status,
      anon_bytes: anon.body.length,
      authed_bytes: authed.body.length,
      session_verdict: sessionVerdict,
      session_first_diff: sessionDiff,
      nav_changed: navBlock(anonN) !== navBlock(authedN),
      anon_nav: navBlock(anonN),
      authed_nav: navBlock(authedN),
      oracle_verdict: oracleVerdict,
      oracle_bytes: oracleBody === undefined ? null : oracleBody.length,
      oracle_first_diff: oracleDiff,
      authed_has_set_cookie: authed.setCookie !== null,
    });
    process.stderr.write(
      `${rows.length}/${URLS.length} ${u.path} anon=${anon.status} authed=${authed.status} ${sessionVerdict} ${oracleVerdict}\n`,
    );
  }

  const tally = (key) => {
    const t = {};
    for (const r of rows) t[r[key]] = (t[r[key]] ?? 0) + 1;
    return t;
  };

  const out = {
    target: EDGE,
    release_id: "redacted",
    script_id: "redacted",
    account: "trial",
    sampled_at: new Date().toISOString(),
    account_holder: seed.HOLDER_NAME,
    session_token_source: "seeded this lane; raw token never printed to any report",
    oracle_shards_loaded: oracle.shards ?? 0,
    oracle_captures_indexed: oracle.loaded,
    url_count: URLS.length,
    requests_issued: requests,
    session_tally: tally("session_verdict"),
    oracle_tally: tally("oracle_verdict"),
    nav_changed_count: rows.filter((r) => r.nav_changed).length,
    authed_set_cookie_count: rows.filter((r) => r.authed_has_set_cookie).length,
    divergent_rows: rows.filter((r) => r.session_verdict === "divergent"),
    rows,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        out: OUT.pathname,
        requests_issued: requests,
        session_tally: out.session_tally,
        oracle_tally: out.oracle_tally,
        nav_changed_count: out.nav_changed_count,
        divergent_count: out.divergent_rows.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("HARNESS FAILED:", e.stack ?? e.message);
  process.exit(1);
});
