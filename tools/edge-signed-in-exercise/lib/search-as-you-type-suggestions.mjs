// search-as-you-type-suggestions.mjs — the instrument for the highest-traffic
// action in the search flow: the suggestion request the navbox fires on every
// keystroke.
//
// WHAT ACTION THIS PINS. The search box is in the navbar on every page
// (src/card/render/navbar-views.ts:267 renders
// `<input ... class="_search-box search-box ..." data-completepath="/*search/search_box_complete.json">`),
// and its autocomplete posts one request per keystroke. That is the highest
// request-rate action the search flow has: `/*search` itself answers once per
// submitted query, while this answers once per character typed.
//
// WHAT WAS RED AND UNDER-MEASURED. docs/registry/instrument-coverage-matrix.json
// row ACT-111, "row 1: search box suggestions answer within 1 s, signed out
// (first keystroke cold)", carries one fail entry (whole-harness, 2026-10-16T19:17Z).
// In the 2026-10-17T08:22Z run (.runtime/edge-signed-in/
// 2026-10-17T08-22-24-672Z-41160/report.md:83-84) BOTH session states were red
// against the owner's 1 s budget:
//
//   signed in   "202" 1023 ms, "2026" 962 ms   (report.md:83)
//   signed out  "202" 1316 ms cold, "2026" 1162 ms  (report.md:84)
//
// The only existing observation of this action is lib/owner-checks.mjs:22-57,
// which fires the three keystrokes in a browser page and records a boolean
// pass/fail per session. Two things it cannot tell the next wave:
//
//   1. WHERE the second went. It wraps `fetch` in `performance.now()`, so the
//      number is a browser round-trip; it never reads the Server-Timing header
//      the engine already emits. Without the engine's own auth/seat/db/render
//      split there is no way to tell a db-bound request from a render-bound one.
//   2. WHETHER THE ANSWER WAS RIGHT. It grades only status 200 and latency, so
//      a 200 that returns an empty array or an error object inside the JSON
//      passes. The user's action is "suggestions appear", not "a 200 came back".
//
// WHAT THIS CLOSES AND WHAT IT DOES NOT. It closes the attribution gap and the
// correctness gap for the endpoint the navbar names, measured in the same
// in-browser locus as owner-checks.mjs so the numbers compare. It does NOT
// close ACT-111 on its own: the budget is the owner's, set from the Bunny
// request logs for the deployed edge, and this runs on a local stack over a
// local deck copy. A pass here is evidence about this stack and this deck, not
// a claim about the deployed site; the deployment verdict stays with the
// live-acceptance lane.

// The owner's budget, read from the audit rows the check answers
// (lib/owner-checks.mjs:37 — `r.ms < 1000`).
export const SUGGESTIONS_BUDGET_MS = 1000;

// The owner's three keystrokes (lib/owner-checks.mjs:32). These are the terms
// the owner actually typed, not invented ones.
export const OWNER_KEYSTROKES = ["202", "2026", "202609"];

// The engine's Server-Timing shape: `auth;dur=0, seat;dur=0, db;dur=439;stmt=61,
// render;dur=807, total;dur=807`. Parsed, never string-matched, so a phase the
// engine adds later is carried through instead of dropped. A token carrying no
// `dur` is not a timing phase and is dropped with everything else, so an
// unparseable header reads as null ("no attribution available") rather than as
// a phase with nothing in it.
export function parseServerTiming(header) {
  if (typeof header !== "string" || header.trim() === "") return null;
  const phases = {};
  for (const part of header.split(",")) {
    const fields = part.trim().split(";").map((f) => f.trim()).filter(Boolean);
    const name = fields.shift();
    if (!name) continue;
    const entry = {};
    for (const field of fields) {
      const [key, value] = field.split("=");
      if (!key) continue;
      entry[key] = Number.isFinite(Number(value)) ? Number(value) : value;
    }
    if (typeof entry.dur !== "number") continue;
    phases[name] = entry;
  }
  return Object.keys(phases).length > 0 ? phases : null;
}

/**
 * The judge. One verdict for the whole session: every keystroke must have
 * answered 200, inside the budget, with a JSON array body — an array is what
 * the autocomplete consumes, so a 200 carrying an error object or an empty
 * body is a failure the boolean check would have called a pass.
 */
export function suggestionsWithinBudget(samples, budgetMs = SUGGESTIONS_BUDGET_MS) {
  if (!Array.isArray(samples) || samples.length === 0) return false;
  return samples.every(
    (s) =>
      s?.status === 200 &&
      typeof s?.ms === "number" &&
      s.ms < budgetMs &&
      s?.isArray === true &&
      typeof s?.count === "number" &&
      s.count > 0,
  );
}

/** Per-sample reasons, so a red receipt says which keystroke and why. */
export function suggestionsViolations(samples, budgetMs = SUGGESTIONS_BUDGET_MS) {
  if (!Array.isArray(samples) || samples.length === 0) return ["no samples were recorded"];
  const out = [];
  for (const s of samples) {
    if (s?.status !== 200) out.push(`${s?.term}: HTTP ${s?.status}`);
    if (typeof s?.ms !== "number") out.push(`${s?.term}: no wall time recorded`);
    else if (s.ms >= budgetMs) out.push(`${s?.term}: ${s.ms}ms >= ${budgetMs}ms budget`);
    if (s?.isArray !== true) out.push(`${s?.term}: body is not a JSON array (autocomplete would render nothing)`);
    else if (!(s.count > 0)) out.push(`${s?.term}: empty suggestion list`);
  }
  return out;
}

/** The endpoint, read off a rendered page rather than assumed. Returns null
 *  when the navbar did not render a search box, which is itself a finding. */
export function navbarCompletepathFrom(html) {
  const match = /data-completepath="([^"]*)"/.exec(html ?? "");
  return match?.[1] ?? null;
}

/** One keystroke, timed in the page — the same locus owner-checks.mjs uses, so
 *  the two measurements are comparable. */
export async function timeSuggest(page, origin, path, term) {
  return page.evaluate(
    async ({ origin, path, term }) => {
      const t0 = performance.now();
      const r = await fetch(`${origin}${path}?term=${encodeURIComponent(term)}`, {
        credentials: "include",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const body = await r.text();
      let parsed = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      return {
        term,
        status: r.status,
        ms: Math.round(performance.now() - t0),
        serverTiming: r.headers.get("server-timing"),
        isArray: Array.isArray(parsed),
        count: Array.isArray(parsed) ? parsed.length : null,
        bodyBytes: body.length,
      };
    },
    { origin, path, term },
  );
}

/** Fire the keystrokes in order and return the samples with the engine's own
 *  phase attribution attached. */
export async function measureSuggestionsInSession({ page, origin, path, terms = OWNER_KEYSTROKES }) {
  const samples = [];
  for (const term of terms) {
    const raw = await timeSuggest(page, origin, path, term);
    samples.push({ ...raw, serverTimingPhases: parseServerTiming(raw.serverTiming) });
  }
  return samples;
}