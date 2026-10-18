#!/usr/bin/env node
// Exhaustively exercises the enumerated site interactions from the
// instrument-coverage matrix, against one engine, on the locally-hosted deck.
// This is the standing enumeration check: every enumerated user action in the
// matrix (190 today, more as the enumeration grows) is driven through its
// real browser path on the running engine. Per-action outcomes roll up to
// per-kind and per-surface histograms and the runner reports its own total.
//
//   node reference-harness/browser/run-exhaustive.mjs \
//     --engine reference-harness/browser/engines/ts.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     --matrix C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json \
//     --out tmp/exhaustive-runs/<date> [--filter <regex>] [--signin admin] \
//     [--actor-card-name <card>] [--fail-fast 0]
//
// LIVE-WALK PROFILE (host-override): the identical journeys can be pointed at
// ANY base URL the operator names, without code changes, by attaching instead
// of booting. The target is a RUNNING engine — for proof and rehearsal that is
// always a LOCAL mock (reference-harness/browser/serve-local-mock-engine.mjs);
// pointing at anything else is an operator decision this runner records but
// never initiates:
//
//   node reference-harness/browser/run-exhaustive.mjs \
//     --engine reference-harness/browser/engines/live.json \
//     --base-url http://127.0.0.1:4603 \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     --matrix <matrix.json> --out <out> [--filter <regex>] \
//     [--write-mode read-only|scratch-allowlist] [--scratch-allowlist <file>]
//
//   --base-url <url> | env DECKO_LIVE_BASE
//       Attach to the engine already serving this origin instead of booting
//       one (engines/live.json is the matching host-override profile; giving
//       it with a booting profile like ts.json, or giving --base-url with no
//       way to reach the host, is refused). Absent -> a local boot, as above.
//   --write-mode read-only|scratch-allowlist|full   (env HARNESS_WRITE_MODE)
//       Default: read-only whenever --base-url/DECKO_LIVE_BASE is present
//       (fail-safe: an attached host is never written to until the operator
//       names a mode), full for a locally booted engine (which stages a
//       throwaway deck copy).
//       - read-only skips EVERY write-path action (card create/update/delete/
//         upload/mail — including the GET /update/<mark> first-class write
//         route) and grades read journeys only; actions whose subject is the
//         write itself are graded "skipped_write", never pass, never fail.
//       - scratch-allowlist admits a write only when the card it targets
//         carries an operator-approved scratch prefix from
//         --scratch-allowlist <file> (env HARNESS_SCRATCH_ALLOWLIST; one
//         prefix per line, e.g. "Harness_*", # comments). The file is read AT
//         RUN TIME: ABSENT or empty means every write is skipped (fail-safe).
//   Session operations (sign-in POST /update/*signin, sign-out) stay
//   permitted in every mode: they create no card, change no card, send no
//   mail, and are how signed-in read journeys authenticate.
//   The target host and the write mode are recorded in EVERY run report
//   (provenance.json "target", run-meta.json "target" and "writeGate",
//   run.md's target lines) — a receipt never leaves the host ambiguous.
//   Enforcement is two layers (lib/live-walk-profile.mjs): a browser-route
//   backstop that aborts any page-driven write the mode refuses, and a guard
//   on the request-context channel that routes cannot see (measured:
//   context.request bypasses context.route).
//
// The matrix is the action source (the enumeration the handoff named as the
// ~1,500 raw interactive elements -> 48 affordance classes -> 125+ actions ->
// 190 enumerated action rows in today's matrix). This runner consumes the
// matrix's `actions` array, decodes the English description of each action,
// groups by surface (one page visit per unique surface, plus each additional
// page the SURFACES entry declares), and for each action
// drives an interaction plan: locate-affordance, observe-page, optionally
// click-fill-submit, observe-after. Each step inside the plan counts as one
// interaction. The runner's total interaction count is the sum across all
// actions and almost always lands in the hundreds to over 1,000, vs the 51
// journeys the paired-battery runner drives.
//
// GRADING (adversarial finding F3): an affirmative finding grades ONLY from
// an exact-control match — an interactive control whose whole visible label
// is the hint (text hints), or the hint's literal control selector (css and
// field hints). Every locate records which strategy hit ("exact-control",
// "text-locate" — a whole-text non-control element, "substring-fallback" —
// prose containing the hint) and whether it is passCarrying; text/substring
// hits are witness evidence in the action's sequence and never pass an
// action. The old ladder graded a substring fallback hit like a found
// affordance, so a page with zero interactive controls could pass an 'Edit'
// hint on the strength of its prose.
//
// Clean identity (source.commit + source.dirty) is captured at start; the
// runner refuses to run from a dirty tree, by the same fail-closed rule the
// journey evidence validator uses. The run's <out>/provenance.json binds
// (commit, dirty, distSha256, fixtureSha256, matrixSha256) so the receipts
// identify the run exactly. The harness browser-machinery (lib/launch.mjs,
// lib/engines.mjs, lib/observe.mjs) is reused unchanged; this entry point
// adds the enumeration-driven probe loop beside the data-driven journey loop
// in run-journeys.mjs.
//
// The output:
//   <out>/provenance.json   source.commit / dirty / distSha256 / matrix sha256
//   <out>/actions/<ACT-NNN>.json   one per action, with the probe sequence
//   <out>/run-meta.json     totals, per-kind histogram, per-surface histogram
//   <out>/run.md            human-readable summary

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, lstatSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine, attachEngine } from "./lib/engines.mjs";
import { SNAPSHOT_JS, normalizeObservation } from "./lib/observe.mjs";
import { affordanceTargetProbes } from "./lib/exhaustive-affordance-targets.mjs";
import { richEditorsReady } from "./lib/editor-ready.mjs";
import { resolveLiveWalkProfile, targetProvenance, installWriteGateRoute, guardRequest } from "./lib/live-walk-profile.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");

// ----------------------- argv + provenance ----------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "");
  args[k] = process.argv[i + 1];
}
for (const k of ["engine", "fixture", "matrix", "out"]) {
  if (!args[k]) throw new Error(`--${k} is required`);
}
const engineManifest = path.resolve(args.engine);
const engine = loadEngine(engineManifest);
// Live-walk profile: target override (--base-url / DECKO_LIVE_BASE) and write
// mode, resolved once and refused early (lib/live-walk-profile.mjs). Resolved
// BEFORE the provenance write so every receipt names its host and mode from
// the first byte.
const liveWalk = resolveLiveWalkProfile({ args, env: process.env, engine });
const writeGateBlocked = [];
const recordBlockedWrite = (entry) => {
  writeGateBlocked.push(entry);
  console.log(`[run-exhaustive] write-gate blocked ${entry.method} ${entry.url} — ${entry.reason}`);
};
const fixtureDir = path.resolve(args.fixture);
const matrixPath = path.resolve(args.matrix);
const out = path.resolve(args.out);
const failFast = args["fail-fast"] !== "0";
const filterRe = args.filter ? new RegExp(args.filter) : null;
const signinActor = args.signin ?? "admin";
const actorCardName = args["actor-card-name"] ?? null;
mkdirSync(out, { recursive: true });

const STEP_TIMEOUT = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);
const editorSettle = process.env.HARNESS_EDITOR_SETTLE ?? "1";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function execGit(...gitArgs) {
  return spawnSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
}
function treeDigest(root) {
  if (!existsSync(root)) return null;
  const hash = createHash("sha256");
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(file);
      else hash.update(path.relative(root, file).replaceAll("\\", "/") + "\0" + sha256(readFileSync(file)) + "\n");
    }
  };
  visit(root);
  return hash.digest("hex");
}

const sourceCommit = execGit("rev-parse", "HEAD");
const dirtyPorcelain = execGit("status", "--porcelain", "--untracked-files=normal");
const sourceDirty = !!dirtyPorcelain;
const distSha256 = treeDigest(path.join(repo, "dist"));
const matrixBytes = readFileSync(matrixPath);
const matrixSha256 = sha256(matrixBytes);
const matrix = JSON.parse(matrixBytes.toString("utf8"));
const fixtureSha256 = treeDigest(fixtureDir);

const provenance = {
  format: "decko-exhaustive-evidence/1",
  runId: args["run-id"] ?? randomUUID(),
  startedAt: new Date().toISOString(),
  runner: { node: process.version, platform: process.platform, editorSettle, offline: process.env.HARNESS_OFFLINE ?? null },
  source: { commit: sourceCommit, dirty: sourceDirty, statusPorcelain: dirtyPorcelain },
  artifacts: { distSha256 },
  fixtureSha256,
  matrixSha256,
  matrixSource: path.relative(repo, matrixPath) || matrixPath,
  engine: path.relative(repo, engineManifest) || engineManifest,
  engineMode: engine.mode ?? "boot",
  filter: args.filter ?? null,
  signinActor,
  // The host this run drives and the write mode it runs under — recorded for
  // EVERY run, local boot or host override (lib/live-walk-profile.mjs).
  target: targetProvenance(liveWalk),
};
writeFileSync(path.join(out, "provenance.json"), JSON.stringify(provenance, null, 2));

// Fail-closed identity gate (mirrored from journey-evidence-validation.mjs):
// the source tree must be clean, the commit a full SHA-1, and the matrix
// must hold at least one action. A dirty tree means edits to the engine
// would not show in the receipts; the run could not be re-derived from the
// provenance. Refuse and exit non-zero rather than silently mislabel.
if (sourceDirty) {
  console.error(`[run-exhaustive] refusing to run: source tree is dirty (git status reports ${dirtyPorcelain.split("\n").filter(Boolean).length} entries). Commit or stash first.`);
  process.exit(2);
}
if (!sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit)) {
  console.error(`[run-exhaustive] refusing to run: source commit is not a full SHA-1 (got: ${JSON.stringify(sourceCommit)}).`);
  process.exit(2);
}
if (!matrix?.actions?.length) throw new Error(`matrix has no actions: ${matrixPath}`);

const actions = matrix.actions.filter((a) => {
  if (!filterRe) return true;
  return filterRe.test(a.id) || filterRe.test(a.surface || "") || filterRe.test(a.action || "");
});
console.log(`[run-exhaustive] source=${sourceCommit.slice(0, 10)} ${sourceDirty ? "dirty" : "clean"} dist=${distSha256?.slice(0, 10) ?? "(none)"} matrix=${matrixSha256.slice(0, 10)} actions selected: ${actions.length} of ${matrix.actions.length}`);

// ============================================================================
// Surface -> URL table. Maps every matrix surface name to the page the runner
// drives. Each surface has a signin mode ("form" = sign in via the form;
// "none" = clear cookies and stay anonymous), the actor to sign in as, and
// optionally additional pages to round out per-action observation coverage
// (e.g. /new/Basic, /new/RichText for the create surfaces).
// All pages are local to the engine's origin; no edge or public hosts.
// ============================================================================
const SURFACES = {
  "1. sign in, and stay signed in": { signin: "form", card: "/*signin", actor: signinActor },
  "2. styling and console on signed-in pages": { signin: "form", card: "/", actor: signinActor },
  // /Date_1's EDIT view (fixture cards Date 1/2/3, type Date): the earlier
  // /2011_12_14 names no card in the fixture, so the surface could only ever
  // serve a not_found page (ACT-012's red ran against that 404, never against
  // a Date card). The card's content view carries no date input — the picker
  // the surface's actions describe renders only on the edit view
  // (ACT-013's input[type=date], verified rendered at /Date_1?view=edit).
  "3. edit a Date card": { signin: "form", card: "/Date_1?view=edit", actor: signinActor },
  "4. edit a RichText card (TinyMCE, nest dialog, link button)": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/new?card[type]=RichText"] },
  "5. create a card every way the site offers": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/new/Basic", "/new/RichText", "/new/Date", "/Some_New_Name", "/new", "/card/new", "/*search?query[keyword]=zz_no_such_card_harness"] },
  "6. delete a card": { signin: "form", card: "/", actor: signinActor },
  "7. rename, history, search, changes, sign out and back in": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/*search", "/Home+name_form"] },
  "7b. further signed-in capabilities (Decko's own browser tests as the checklist)": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/*signin", "/Home+board"] },
  // The member's Delete control lives on a card's EDIT view, not on the deck
  // home the surface used to visit: probed signed in as the fixture's member
  // (mira.member) against synthetic-v1, /Date_1 -> 0 Delete controls while
  // /Date_1?view=edit -> 1, href="/delete/Date_1?success[mark]=*previous..."
  // (ACT-061's and ACT-062's "Delete" locate could never match on "/").
  "8. ordinary (non-admin) account permissions": { signin: "form", card: "/Date_1?view=edit", actor: "member" },
  "9. timings": { signin: "form", card: "/", actor: signinActor },
  "cleanup": { signin: "form", card: "/", actor: signinActor },
  "edit: nest dialog (group 4 rows + cover-b row)": { signin: "form", card: "/", actor: signinActor },
  "account (password reset)": { signin: "none", card: "/*signin/edit?slot[hide][]=menu", actor: signinActor },
  "cover-b. account: settings page and change email (A1, A3)": { signin: "form", card: "/" + (actorCardName ?? "Harness_Admin") + "/Account", actor: signinActor },
  "cover-b. create: duplicate name, URL presets (C8, C10)": { signin: "form", card: "/new/Basic", actor: signinActor },
  "cover-b. create: pointer inputs (checkbox, select) (C16, C18)": { signin: "form", card: "/new/RichText", actor: signinActor },
  "cover-b. create: structured cards and rule defaults (C12, C14)": { signin: "form", card: "/new", actor: signinActor },
  "cover-b. edit: board name change, account tab, history tab (E17, E19, E21)": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/Home+name_form", "/Home+board"] },
  "cover-b. edit: editor buttons (link, nest image) (E6, E8)": { signin: "form", card: "/new/RichText", actor: signinActor },
  "cover-b. edit: plain input, edit type in board (E10, E12)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. edit: pointer editing (E23)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. edit: type for a rule (E14)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7)": { signin: "form", card: "/new/File", actor: signinActor },
  // The Follow control is rendered by the board's Engage tab (card-mod-edit.ts's
  // followSectionView -> followButton), not by the card page the surface used to
  // visit: probed signed in as admin against synthetic-v1, "/Home+board" and
  // "/Home+board?view=engage_tab" render 0 a.follow-link, while
  // "/Date_1?view=engage_tab" renders 1 a.follow-link plus the
  // data-cy="follow-overview" link (ACT-088's "Follow" locate could never match
  // on the old page).
  "cover-b. follow: follow a card and a type from the board (W1, W3)": { signin: "form", card: "/Date_1?view=engage_tab", actor: signinActor },
  "cover-b. more odd-position capabilities (C6, E3, E16, E18, E22, H1, M1, N5, S3, S5)": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/*signin"] },
  "cover-b. permissions: member denied read and edit of a restricted card (P1, P3)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. permissions: rule sets (*right, *type plus right, *self) (P5)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. rename (R1)": { signin: "form", card: "/", actor: signinActor },
  "cover-b. search, layouts and references (N1, N3, N8, N11)": { signin: "form", card: "/", actor: signinActor, additionalPages: ["/*search?query[keyword]=Harness"] },
  "cover-b. session: sign-in refusals and the signed-out links (S2, S4)": { signin: "none", card: "/*signin", actor: signinActor },
  "final main-browser asset audit": { signin: "form", card: "/", actor: signinActor },
  "owner audit required checks": { signin: "form", card: "/", actor: signinActor },
  "owner request-log replay; fixture administrator actor": { signin: "form", card: "/", actor: signinActor },
  "recent-changes feed": { signin: "form", card: "/*recent", actor: signinActor },
  "image card standalone page": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext"), actor: signinActor },
  "sign-in route while signed in": { signin: "form", card: "/*signin", actor: signinActor },
  "restricted-card board": { signin: "form", card: "/", actor: signinActor },
  "comments on cards": { signin: "form", card: "/", actor: signinActor },
  "wanted-card flow": { signin: "none", card: "/*search?query[keyword]=zz_no_such_card_harness", actor: signinActor },
  "plus-card creation": { signin: "form", card: "/", actor: signinActor },
  "type-scoped creation": { signin: "form", card: "/", actor: signinActor },
  "navbox autocomplete": { signin: "form", card: "/", actor: signinActor },
  "recent feed": { signin: "form", card: "/*recent", actor: signinActor },
  "hashtag navigation": { signin: "form", card: "/", actor: signinActor },
  "RSS feed": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext") + ".rss", actor: signinActor },
  "accordions": { signin: "form", card: "/", actor: signinActor },
  "help popover": { signin: "form", card: "/", actor: signinActor },
  "role checkboxes": { signin: "form", card: "/" + (actorCardName ?? "Harness_Admin") + "/Account", actor: signinActor },
  // The history surface's affordances live on a card's own /history view.
  // Both halves of the old URL were defective: the engine routes the
  // LOWERCASE view path (measured 2026-10-18 on the regrade build - a
  // capitalized "/History" path segment is not a view route and answers 422),
  // and the default card name Harness_richtext names no card in synthetic-v1
  // (the deck's fixture names carry spaces - "Topic 001"), so the surface
  // visit rendered a new-card form for a missing card (ACT-176's surface
  // observation in the 2026-10-18 regrade).
  "history": { signin: "form", card: "/" + (actorCardName ?? "Topic 001") + "/history", actor: signinActor },
  "related-card panel": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext"), actor: signinActor },
  "error pages": { signin: "none", card: "/no_such_card_harness", actor: signinActor },
  "case-handling": { signin: "form", card: "/", actor: signinActor },
  "slug round-trip": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext"), actor: signinActor },
  "cross-cutting: result ordering": { signin: "form", card: "/*recent", actor: signinActor },
  "cross-cutting: render-mode semantics": { signin: "form", card: "/", actor: signinActor },
  "cross-cutting: persistence across reload": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext"), actor: signinActor },
  "cross-cutting: case-insensitivity guarantees": { signin: "form", card: "/*search?query[keyword]=HARNESS", actor: signinActor },
  "cross-cutting: plurality and slug pinning": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext"), actor: signinActor },
  "cross-cutting: pagination math": { signin: "form", card: "/*search?query[keyword]=Harness&page=2", actor: signinActor },
  "cross-cutting: feed dedup": { signin: "form", card: "/*recent", actor: signinActor },
  "cross-cutting: affordance visibility per role": { signin: "form", card: "/", actor: signinActor },
  "cross-cutting: empty vs error rendering": { signin: "form", card: "/*search?query[keyword]=zzzz_no_match_anything", actor: signinActor },
  "search (whole-count correctness)": { signin: "form", card: "/*search?query[keyword]=Harness", actor: signinActor },
  "capability catalog: session": { signin: "form", card: "/*signin", actor: signinActor },
  "capability catalog: create": { signin: "form", card: "/new/Basic", actor: signinActor },
  "capability catalog: edit": { signin: "form", card: "/", actor: signinActor },
  // R4 ("Refuse to delete a system card") probes a codenamed system card, and
  // the deck renders its Delete control on the card's EDIT view: probed signed
  // in as admin against synthetic-v1, "/*credit" -> 0 Delete controls while
  // "/*credit?view=edit" -> 1, href="/delete/*credit?success[mark]=*previous..."
  // The refusal half of R4 is not a locate probe; it is witnessed by the
  // engine's own test (tests/card/actions/delete.test.ts, "refuses codenamed
  // (system) cards" -> code protected-card, zero card_actions) and by
  // tools/edge-signed-in-exercise/checks-system-delete-refusal.mjs.
  "capability catalog: rename-delete": { signin: "form", card: "/*credit?view=edit", actor: signinActor },
  "capability catalog: permissions": { signin: "form", card: "/", actor: signinActor },
  "capability catalog: files": { signin: "form", card: "/new/File", actor: signinActor },
  "capability catalog: search": { signin: "form", card: "/*search?query[keyword]=Harness", actor: signinActor },
  "capability catalog: history": { signin: "form", card: "/" + (actorCardName ?? "Harness_richtext") + "/History", actor: signinActor },
  "capability catalog: follow": { signin: "form", card: "/" + (actorCardName ?? "Home+board"), actor: signinActor },
  // A2's "sign in with the new password" and A4's "Sign up for a new account
  // (anonymous), then sign in" (ACT-158, ACT-159) name the sign-in page's
  // affordances; the account page itself renders neither a "Sign in" nor a
  // "Sign up" control, so the surface declares the page its contracts share.
  "capability catalog: account": { signin: "form", card: "/" + (actorCardName ?? "Harness_Admin") + "/Account", actor: signinActor, additionalPages: ["/*signin"] },
};

// ============================================================================
// Per-action probe. Decodes the English description and drives a sequence of
// browser-level interactions. Each entry in `sequence` is one interaction;
// the runner aggregates (sequence.length + observations.length) per action
// to produce the run's total interaction count.
// ============================================================================
const exact = (s) => new RegExp(`^\\s*${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function settle(page) {
  await page.waitForLoadState("load", { timeout: STEP_TIMEOUT }).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT;
  let quiet = 0;
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate(() => (typeof window.jQuery === "function" ? window.jQuery.active : 0) + (document.readyState === "complete" ? 0 : 1))
      .catch(() => 1);
    quiet = busy === 0 ? quiet + 1 : 0;
    if (quiet >= 3) {
      if (editorSettle === "1") {
        await page.waitForFunction(richEditorsReady, null, { timeout: STEP_TIMEOUT }).catch(() => {});
      }
      await page
        .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: STEP_TIMEOUT })
        .catch(() => {});
      return;
    }
    await page.waitForTimeout(100);
  }
}

// Affordance hints extracted from the action text. Each hint produces one
// locate interaction in the per-action sequence; presence/absence counts
// toward the action's outcome.
function affordanceHints(text) {
  const hints = [];
  const lower = String(text ?? "").toLowerCase();
  // Quoted phrases are usually the affordance label. A single-quote pair
  // only counts when the opener is not preceded by a word character and the
  // closer is not followed by one: a possessive or contraction apostrophe is
  // not a quote pair. Decoding one minted an unfillable prose hint - ACT-124
  // located "s session answers as the owner" (the fragment between the
  // possessive apostrophes in "the owner's session ... as the owner's did
  // not") and ACT-084 located "s type can be changed in the board". Both reds
  // were guaranteed by the extractor, on the ts engine and on the Ruby oracle
  // alike. Double-quoted spans are unchanged.
  const quoted = String(text ?? "").match(/"([^"]{2,40})"|(?<![A-Za-z0-9])'([^']{2,40})'(?![A-Za-z0-9])/g);
  if (quoted) for (const m of quoted) {
    const v = m.replace(/^['"]|['"]$/g, "");
    if (v.length >= 2 && !/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(v)) hints.push({ kind: "text", value: v });
  }
  // Field names carry "*" as a marker ("*email", "*password", ...). A "*"
  // directly after "/" is a URL path token (/*search, /*new, /delete/*signin),
  // not a field reference — decoding it minted an unfillable
  // .RIGHT-<name> field hint (ACT-039's "the Changes link (/*search)" red).
  const fields = String(text ?? "").match(/(?<!\/)\*(\w+)/g);
  if (fields) for (const m of fields) hints.push({ kind: "field", value: m });
  // Common UI verbs -> a known label or selector.
  if (/\bsign[- ]?in\b/i.test(text)) hints.push({ kind: "text", value: "Sign in" });
  if (/\bsign[- ]?out\b/i.test(text)) hints.push({ kind: "text", value: "Sign out" });
  if (/\bsave\b/i.test(text)) hints.push({ kind: "text", value: "Save" });
  if (/\bsave and close\b/i.test(text)) hints.push({ kind: "text", value: "Save and close" });
  if (/\bsave as current\b/i.test(text)) hints.push({ kind: "text", value: "Save as current" });
  if (/\bdelete\b/i.test(text)) hints.push({ kind: "text", value: "Delete" });
  if (/\bedit\b/i.test(text)) hints.push({ kind: "text", value: "Edit" });
  if (/\bcancel\b/i.test(text)) hints.push({ kind: "text", value: "Cancel" });
  if (/\bclose\b/i.test(text)) hints.push({ kind: "text", value: "Close" });
  // "follow the mailed link" (ACT-126, A5 password reset) is the actor
  // opening a link from their mailbox - prose, not a page label. Minting the
  // "Follow" hint from it guaranteed a permanent affordance-not-found red on
  // the anonymous reset page regardless of engine state (the same extractor
  // class as "the local copy" minting "Copy" for the cleanup surface, and
  // "referers follow" in exhaustive-affordance-targets.mjs case 3).
  if (/\bfollow\b/i.test(text) && !/\bfollow\s+(?:the\s+)?(?:mailed|reset|password)\s+link\b/i.test(text)) hints.push({ kind: "text", value: "Follow" });
  if (/\bunfollow\b/i.test(text)) hints.push({ kind: "text", value: "Unfollow" });
  if (/\breset password\b/i.test(text)) hints.push({ kind: "text", value: "Reset password" });
  // The noun order "a password reset" (ACT-126: "request a password reset")
  // names the same button the verb order names; the extractor was
  // order-sensitive and minted nothing for it, leaving the action's only
  // hints to the mailed-link prose misfire above.
  if (/\bpassword reset\b/i.test(text) && !/\breset password\b/i.test(text)) hints.push({ kind: "text", value: "Reset password" });
  if (/\bsign up\b/i.test(text)) hints.push({ kind: "text", value: "Sign up" });
  if (/\bcut\b/i.test(text)) hints.push({ kind: "text", value: "Cut" });
  if (/\bcopy\b/i.test(text)) hints.push({ kind: "text", value: "Copy" });
  if (/\bpaste\b/i.test(text)) hints.push({ kind: "text", value: "Paste" });
  if (/\bupload\b/i.test(text)) hints.push({ kind: "css", value: "input[type=file]" });
  // The navbox is card-mod-search's search_box.haml: `.d0-search-box` wrapping
  // `search_form`'s <form role="search" class="search-box-form"> around the
  // input[name="query[keyword]"] that search_box.rb's search_box_contents emits.
  // `.navbox` is NOT a class the reference emits: its only two hits in the gem
  // tree are the 2023 fix-old-navbar data transform, which REWRITES a
  // {{*navbox|navbar}} nest into {{:search|search_box}}, and a jasmine support
  // yml. Decko's own cucumber steps type into `.search-box-form`
  // (decko/features/step_definitions/select2_steps.rb:1-3). So
  // `.navbox input[name*=query]` matched nothing on any rendered page of any
  // engine: ACT-057 (keyword search from the navbox returns the run's card) and
  // ACT-103 (N1 the navbox offers suggestions and Enter runs the search) were
  // guaranteed reds on the ts engine and on the Ruby oracle alike while the
  // affordance they name was present and correct.
  if (/\bsearch keyword\b|\bkeyword search\b|\bnavbox\b|\bquick search\b/i.test(text)) hints.push({ kind: "css", value: ".search-box-form input[name*='query']" });
  if (/\baccount tab\b/i.test(text)) hints.push({ kind: "text", value: "Account" });
  if (/\bguide tab\b/i.test(text)) hints.push({ kind: "text", value: "Guide" });
  if (/\bengage tab\b/i.test(text)) hints.push({ kind: "text", value: "Engage" });
  if (/\bhistory tab\b/i.test(text)) hints.push({ kind: "text", value: "History" });
  if (/\brules tab\b/i.test(text)) hints.push({ kind: "text", value: "Rules" });
  return hints;
}

// The locate ladder's strategies, most to least specific (adversarial
// finding F3). Only "exact-control" is pass-carrying: it matched an
// interactive control (a, button, submit/button input, a.btn) whose whole
// visible label is the hint — the affordance found the way a person uses it.
// The css and field hint kinds are literal control selectors, so they are
// exact-control by construction. The two text fallbacks are witness evidence
// only: "text-locate" matched a NON-control element whose whole text is the
// hint (a heading, a table cell), and "substring-fallback" matched any
// element merely CONTAINING the hint (prose). The old ladder returned the
// substring fallback when no exact control matched and graded its hit like a
// found affordance — a page with zero interactive controls passed an 'Edit'
// hint because its prose said "edit". Both tiers stay in the ladder (they
// still locate, and every locate records which tier hit) but never carry a
// pass.
const STRATEGY_EXACT_CONTROL = "exact-control";
const STRATEGY_TEXT_LOCATE = "text-locate";
const STRATEGY_SUBSTRING_FALLBACK = "substring-fallback";

async function locateByHint(page, hint) {
  switch (hint.kind) {
    case "text": {
      const v = hint.value;
      const exactRe = new RegExp(`^\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      const exactControlLoc = page.locator("a, button, input[type=submit], input[type=button], a.btn").filter({ hasText: exactRe, visible: true });
      const wholeTextLoc = page.getByText(v, { exact: true });
      const substringLoc = page.getByText(v, { exact: false });
      const tiers = {
        [STRATEGY_EXACT_CONTROL]: await exactControlLoc.count().catch(() => 0),
        // Playwright's getByText exact:true is case-sensitive whole-string
        // (still whitespace-trimmed); as a witness tier that is fine — it is
        // evidence of a same-text non-control element, never a grade.
        [STRATEGY_TEXT_LOCATE]: await wholeTextLoc.count().catch(() => 0),
        [STRATEGY_SUBSTRING_FALLBACK]: await substringLoc.count().catch(() => 0),
      };
      const strategy =
        tiers[STRATEGY_EXACT_CONTROL] > 0 ? STRATEGY_EXACT_CONTROL : tiers[STRATEGY_TEXT_LOCATE] > 0 ? STRATEGY_TEXT_LOCATE : STRATEGY_SUBSTRING_FALLBACK;
      const locator = strategy === STRATEGY_EXACT_CONTROL ? exactControlLoc.first() : strategy === STRATEGY_TEXT_LOCATE ? wholeTextLoc.first() : substringLoc.first();
      return { locator, strategy, tiers };
    }
    case "css":
      return { locator: page.locator(hint.value).first(), strategy: STRATEGY_EXACT_CONTROL };
    case "field": {
      const safeKey = hint.value.toLowerCase().replace(/\s+/g, "_").replace(/\*/g, "X");
      return {
        locator: page.locator(`.RIGHT-${safeKey} input.d0-card-content, .RIGHT-${safeKey} textarea.d0-card-content`).first(),
        strategy: STRATEGY_EXACT_CONTROL,
      };
    }
    default:
      return null;
  }
}

// The per-page probe steps, shared by the surface card and every additional
// page a SURFACES entry declares: locate every affordance hint (per-page
// presence/absence is the per-action evidence), then run the per-class
// targeted probes against the page currently loaded.
async function runHintLocates(page, hints, sequence) {
  let firstLocated = null;
  for (const hint of hints) {
    try {
      const hit = await locateByHint(page, hint);
      if (!hit) {
        sequence.push({ interaction: "locate", hint, found: false, strategy: null, passCarrying: false });
        continue;
      }
      const count = await hit.locator.count().catch(() => 0);
      sequence.push({
        interaction: "locate",
        hint,
        found: count > 0,
        count,
        strategy: hit.strategy,
        // F3: true only for an exact-control hit; text-locate and
        // substring-fallback hits are witness evidence, never pass-carrying.
        passCarrying: hit.strategy === STRATEGY_EXACT_CONTROL && count > 0,
        // Text hints carry every tier's count, so the record shows which
        // strategies were present on the page even when a deeper tier is the
        // recorded hit. css/field hints have no ladder (control selectors).
        ...(hit.tiers ? { tiers: hit.tiers } : {}),
      });
      if (firstLocated == null && count > 0) firstLocated = { loc: hit.locator, hint };
    } catch (err) {
      sequence.push({ interaction: "locate", hint, error: String(err?.message ?? err) });
    }
  }
  return firstLocated;
}

async function runPerClassAsserts(page, text, sequence) {
  const t = text.toLowerCase();
  if (/\btinymce\b|\bnest button\b|\bnest dialog\b|\bnest plugin\b/.test(t)) {
    const editorPresent = await page.evaluate(() => !!window.tinyMCE).catch(() => false);
    const nestBtn = page.getByRole("button", { name: /nest/i }).first();
    const nestCount = await nestBtn.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "tinymce", count: editorPresent ? 1 : 0 });
    sequence.push({ interaction: "assert-present", selector: "nest-button", count: nestCount });
  }
  if (/\bdate picker\b|\bdate input\b|\bdate card\b/.test(t)) {
    const inp = page.locator("input[type=date]").first();
    const c = await inp.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "input[type=date]", count: c });
  }
  if (/\bsign[- ]?out link\b|\bsign[- ]?out\b/.test(t)) {
    const link = page.locator("a.signout-link").first();
    const c = await link.count();
    const href = c > 0 ? await link.getAttribute("href").catch(() => null) : null;
    sequence.push({ interaction: "assert-present", selector: "a.signout-link", count: c, href });
  }
  if (/\bsign[- ]?in form\b|\bsign-in fields\b|\bemail and password\b/.test(t)) {
    const email = page.locator("input[name='card[subcards][+*email][content]']").first();
    const pw = page.locator("input[name='card[subcards][+*password][content]']").first();
    const ec = await email.count().catch(() => 0);
    const pc = await pw.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "*email input", count: ec });
    sequence.push({ interaction: "assert-present", selector: "*password input", count: pc });
  }
  if (/\bmodals? open\b|\bmodal\b/.test(t)) {
    const modal = page.locator(".modal, [role=dialog]").first();
    const c = await modal.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "modal/dialog", count: c });
  }
  if (/\bfollowers?\b/.test(t)) {
    const followers = page.getByText(/followers?/i).first();
    const c = await followers.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "followers text", count: c });
  }
  if (/\bfile input\b|\bfile\b/.test(t)) {
    const fi = page.locator("input[type=file]").first();
    const c = await fi.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "input[type=file]", count: c });
  }
  if (/\bcss\b|\bstylesheet\b|\bstyle\b/.test(t)) {
    const link = page.locator("link[rel=stylesheet]").first();
    const c = await link.count().catch(() => 0);
    sequence.push({ interaction: "assert-present", selector: "stylesheet link", count: c });
  }
  if (/\bconsole errors?\b/.test(t)) {
    // The runner does not collect console errors itself (that's the
    // edge-signed-in-exercise's domain). Mark the interaction and let an
    // operator compare against the edge evidence in docs/runs.
    sequence.push({ interaction: "witness", selector: "console errors", note: "see tools/edge-signed-in-exercise.mjs group 2" });
  }
}

// A tiny helper to record one observation against the page.
async function observeAt(page, lastStatus, label) {
  await settle(page);
  const raw = await page.evaluate(SNAPSHOT_JS);
  return { label, at: Date.now(), url: page.url(), status: lastStatus ?? null, ...normalizeObservation({ ...raw, url: page.url(), status: lastStatus }) };
}

// Some matrix actions cannot be exercised in a browser under the local
// harness (no mail sink) or are descriptive cross-cutting contracts whose
// only witness is a different battery. Those get an `out_of_scope` outcome;
// the runner still visited the related page (one observation) and recorded
// the reason. Operators can still see what the matrix names but the run does
// not pretend to grade them.
function isOutOfScope(action) {
  const text = String(action.action ?? "");
  const notes = String(action.notes ?? "");
  const lower = (text + " " + notes).toLowerCase();
  if (action.kind === "test-type-gap") return false; // page-only witness lives in this run
  if (/mail sink|no mail sink|smtp sink/i.test(lower)) return true;
  if (/watcher notified|unfollow link in the email|w[5-6]/i.test(text) && /mail|email/.test(lower)) return true;
  if (/mail reset|reset link arrives by mail/.test(lower)) return true;
  if (/upstream-disabled|disabled_upstream/.test(lower)) return true;
  return false;
}

async function probeAction(page, action, lastStatusRef, actors) {
  const surface = action.surface;
  const text = action.action ?? "";
  const meta = SURFACES[surface];
  const surfaceUrl = meta?.card ?? "/";
  const sequence = [];
  const observations = [];

  // 1. Visit the surface page.
  await page.goto(lastStatusRef.base + surfaceUrl, { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
  sequence.push({ interaction: "visit", url: surfaceUrl, status: lastStatusRef.status });
  let snap = await observeAt(page, lastStatusRef.status, "surface");
  observations.push(snap);

  // 2. Locate every affordance hint; presence/absence is the per-action evidence.
  // The cleanup surface's action ("every card the run created is removed from
  // the local copy", ACT-066) verifies ABSENCE — it has no positive
  // affordance to locate, and the verb extractor was minting a text hint
  // "Copy" from the phrase "the local copy", guaranteeing a permanent
  // affordance-not-found red regardless of engine state.
  const hints = surface === "cleanup" ? [] : affordanceHints(text);
  await runHintLocates(page, hints, sequence);

  // 3. Per-class targeted probes (the affordance-class detectors the matrix names).
  await runPerClassAsserts(page, text, sequence);

  // 3b. Affordance-target cases: actions whose affordance does not live on
  // the surface page (board tabs on a card's board view, the rename name
  // field, the card-name suggestions JSON). Probing them on the surface page
  // measured affordance-not-found against a page that never carries the
  // affordance - an aim artifact of the probe, not an engine verdict. Each
  // case drives the affordance's own page and asserts the engine's own
  // bytes, and an affordance that is genuinely absent still fails (ACT-024,
  // ACT-056, ACT-084, ACT-102 in the 2026-10-18 run).
  //
  // evaluate / pageRequest / newActorRequest serve the second-save conflict
  // case (E18): reading the edit form's conflict token off the page, saving
  // with the visiting actor's own session, and signing the SECOND editor in
  // on a fresh request context (the conflict predicate is false when the
  // intervening save is the submitting actor's own). pageRequest also serves
  // the owner-save row case (ACT-119): the row's POST /update/~<id> replay
  // must ride the signed-in session, not an anonymous request. Each created
  // context is closed before probeAction returns.
  const createdActorContexts = [];
  try {
    const targetProbes = await affordanceTargetProbes({
      text,
      base: lastStatusRef.base,
      goto: async (p) => { await page.goto(lastStatusRef.base + p, { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {}); },
      settle: () => settle(page),
      countSelector: async (selector) => await page.locator(selector).count().catch(() => 0),
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      // `page` serves the cases whose affordance is the control's own browser
      // event chain: the RichText edit form's Save click (ACT-020), the edit
      // modal's open/fill/Save-and-Close click (ACT-138) and the history
      // page's revert-link click (ACT-176). Under a host-override profile the
      // request contexts are guarded: context.request bypasses context.route
      // (measured), so the APIRequestContext channel carries its own gate and
      // refuses a refused write before any bytes leave for the target.
      page,
      writeGate: { profile: liveWalk },
      pageRequest: guardRequest(page.context().request, liveWalk, { onBlocked: recordBlockedWrite }),
      newActorRequest: async (actorName) => {
        const actor = (actors ?? {})[actorName];
        if (!actor?.email) throw new Error(`second-save conflict probe: no fixture actor "${actorName}"`);
        const actorContext = await page.context().browser().newContext();
        createdActorContexts.push(actorContext);
        actorContext.setDefaultTimeout(STEP_TIMEOUT);
        await installWriteGateRoute(actorContext, liveWalk, { onBlocked: recordBlockedWrite });
        // The sign-in form's action is /update/*signin (the browser sign-in
        // drives form[action="/update/*signin"]'s submit button); POSTing the
        // page URL /*signin itself is refused 403 (measured 2026-10-18 - the
        // GET route does not answer POSTs), which refused every actor sign-in
        // here.
        const signInResponse = await actorContext.request.post(lastStatusRef.base + "/update/*signin", {
          form: {
            "card[subcards][+*email][content]": actor.email,
            "card[subcards][+*password][content]": actor.password,
          },
        });
        if (signInResponse.status() >= 400) {
          throw new Error(`second editor sign-in as ${actorName} refused (${signInResponse.status()})`);
        }
        return guardRequest(actorContext.request, liveWalk, { onBlocked: recordBlockedWrite });
      },
    });
    sequence.push(...targetProbes);
  } catch (err) {
    sequence.push({ interaction: "assert-present", case: "affordance-target probes (driver threw)", required: true, selector: "affordance-target probes", count: 0, error: String(err?.message ?? err) });
  } finally {
    for (const actorContext of createdActorContexts.splice(0)) {
      await actorContext.close().catch(() => {});
    }
  }

  // 3c. Additional pages. A SURFACES entry's additionalPages name the further
  // pages the surface's actions share observation coverage with (the
  // signed-out sign-in page for the sign-in / sign-up / refusal contracts,
  // the create forms for the create surfaces). The table declared them since
  // dad99296 but probeAction never read them: it visited the surface card
  // only, so a hint whose affordance lives on a declared page was located on
  // a page that rightly renders none - after 6d829984's per-action session
  // identity, the signed-in reds of ACT-048, ACT-049, ACT-050, ACT-097,
  // ACT-158 and ACT-159 each sought 'Sign in' / 'Sign up' on "/" or the
  // account page. Each declared page is visited, observed, and probed with
  // the same hints and per-class asserts as the surface card. This only ever
  // ADDS find opportunities: the grade still passes when any locate or assert
  // finds its affordance on any of the action's pages, and a genuinely absent
  // affordance still fails.
  for (const extra of meta?.additionalPages ?? []) {
    await page.goto(lastStatusRef.base + extra, { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
    sequence.push({ interaction: "visit", url: extra, additional: true, status: lastStatusRef.status });
    observations.push(await observeAt(page, lastStatusRef.status, "additional " + extra));
    await runHintLocates(page, hints, sequence);
    await runPerClassAsserts(page, text, sequence);
  }

  // 4. Final observation; one per action.
  snap = await observeAt(page, lastStatusRef.status, "after-probe");
  observations.push(snap);

  // 5. Pass/fail. The action is exercised if at least one of its probes found
  // an affordance on the page; otherwise it is a page-only witness
  // (descriptive cross-cutting contract with no click target).
  const located = sequence.filter((s) => s.interaction === "locate");
  // F3 (adversarial review): an affirmative finding grades ONLY from an
  // exact-control match. A text-locate or substring-fallback hit is witness
  // evidence (the page talks about the affordance; it does not carry it) and
  // never passes an action: with only a witness hit the action's located
  // attempts still make it "fail", which is the honest grade for an
  // affordance the page does not offer as a control.
  const exactFound = located.some((l) => l.found && l.strategy === STRATEGY_EXACT_CONTROL);
  const witnessFound = located.some((l) => l.found && l.strategy !== STRATEGY_EXACT_CONTROL);
  const anyFound = located.some((l) => l.found); // legacy rollup: any strategy
  const asserted = sequence.filter((s) => s.interaction === "assert-present");
  const anyAsserted = asserted.some((a) => a.count > 0);

  // A write the live-walk mode declined (lib/exhaustive-affordance-targets.mjs
  // gateWrite) means the action's subject was not exercised: for every gated
  // case the write IS the claim the action probes, so the action is graded
  // "skipped_write" — never pass, never fail — whatever its read-side asserts
  // saw. Read-only journeys carry no write-skips and grade exactly as before.
  const writeSkipped = sequence.some((s) => s.interaction === "write-skipped");

  // Required-legs gating (adversarial reviews grading-integrity F1 and
  // blindness F1, 2026-10-18). The old rule ORed every leg, so one incidental
  // locate hit carried an action whose target-case contract legs all read 0 —
  // proven on recorded run data: ACT-062 graded pass in
  // 2026-10-18-regrade-slice4-proof with BOTH of its target-case asserts at
  // count 0, carried entirely by the generic "Delete" verb-hint locate. Every
  // assert a target case pushes is REQUIRED evidence (tagged with its case id
  // by lib/exhaustive-affordance-targets.mjs): when the probe sequence carries
  // ANY target-case entry, the case verdict outranks the OR of presence finds
  // — the action passes only when every required leg read > 0, a required leg
  // at 0 fails it regardless of locate hits, and the generic text-locate can
  // no longer carry an action that has a target case. A case that fired but
  // supplied no required leg (its affordance witness read 0 — case 18 with no
  // toggles) likewise fails: its contract is unwitnessed. Actions without a
  // target case grade exactly as before (F3's exact-control rule governs
  // them). A gated write still grades skipped_write ahead of everything: the
  // write IS those actions' claim, and the run declines to grade it.
  const requiredLegs = sequence.filter((s) => s.required === true);
  const requiredFailed = requiredLegs.filter((l) => !(l.count > 0));
  const hasTargetCase = sequence.some((s) => !!s.case);

  let outcome;
  if (isOutOfScope(action)) outcome = "out_of_scope";
  else if (writeSkipped) outcome = "skipped_write";
  else if (hasTargetCase) outcome = requiredLegs.length > 0 && requiredFailed.length === 0 ? "pass" : "fail";
  else if (exactFound || anyAsserted) outcome = "pass";
  else if (located.length > 0 || asserted.length > 0) outcome = "fail";
  else outcome = "page-only";

  return { sequence, observations, outcome, exactFound, witnessFound, anyFound, anyAsserted, located: located.length, asserted: asserted.length, requiredLegs: requiredLegs.length, requiredFailed: requiredFailed.length, hasTargetCase, writeSkipped };
}

// ============================================================================
// Sign in through the form, exactly as the journey runner does.
async function signIn(page, base, actor) {
  await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(actor.email, { timeout: STEP_TIMEOUT });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(actor.password, { timeout: STEP_TIMEOUT });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: STEP_TIMEOUT });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: STEP_TIMEOUT }).catch(() => {});
  const out = page.locator("a.signout-link").first();
  await out.waitFor({ state: "attached", timeout: STEP_TIMEOUT });
}

async function run() {
  const startedAt = new Date().toISOString();
  const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
  const actors = { ...spec.actors };
  const serverLog = path.join(out, "server.log");
  // Host-override profile attaches to the RUNNING engine the operator named;
  // a local profile boots one here, exactly as before.
  const server = liveWalk.override
    ? await attachEngine(engine, liveWalk.baseUrl)
    : await startEngine(engine, fixtureDir, { logFile: serverLog });
  console.log(`[run-exhaustive] ${liveWalk.override ? "attached to" : "engine booted"} ${engine.name} in ${server.bootMs} ms on ${server.base} (mode ${liveWalk.mode})`);
  // The receipt's host line is only complete once the base is known; rewrite
  // provenance.json with the resolved base before any action runs.
  provenance.target.resolvedBase = server.base;
  provenance.target.bootedByThisRun = !liveWalk.override;
  provenance.target.attachReachProbe = server.reachProbe ?? null;
  writeFileSync(path.join(out, "provenance.json"), JSON.stringify(provenance, null, 2));

  let browserHandle;
  try {
    browserHandle = await launchBrowser();
    const ctxb = browserHandle.context;
    // A non-loopback host-override target must be reachable at all: the
    // launch policy only admits loopback origins and the stock CDNs. The
    // admit route continues the target origin's own requests; the write-mode
    // gate (registered after it, so it runs BEFORE it) has already aborted
    // the writes its mode refuses before anything reaches this route.
    if (liveWalk.override && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(liveWalk.origin).hostname)) {
      await ctxb.route((url) => url.origin === liveWalk.origin, (route) => route.continue());
    }
    // The write-mode backstop: aborts any page-driven write the profile does
    // not admit, before the context's ordinary request policy runs. A no-op
    // for a locally booted engine (full mode).
    const writeRouteGate = await installWriteGateRoute(ctxb, liveWalk, { onBlocked: recordBlockedWrite });
    const page = ctxb.pages()[0] ?? (await ctxb.newPage());
    page.setDefaultTimeout(STEP_TIMEOUT);
    page.on("dialog", (d) => d.accept().catch(() => {}));
    const lastStatusRef = { base: server.base, status: null };
    ctxb.on("response", (r) => {
      try {
        if (r.request().isNavigationRequest() && r.frame() === r.frame()?.page()?.mainFrame()) lastStatusRef.status = r.status();
      } catch {
        // ignore navigation listeners that close unexpectedly
      }
    });

    const actionsDir = path.join(out, "actions");
    mkdirSync(actionsDir, { recursive: true });

    // Drive every action. Session identity is enforced per action: a
    // signin:"none" surface clears cookies (anonymous observation); a
    // signin:"form" surface whose actor differs from the context's current
    // actor signs in first. The earlier design signed each actor in once in
    // a pre-pass over the surface order and never re-established a session
    // afterwards, so the pre-pass's trailing signin:"none" surfaces
    // (cover-b. session, account (password reset)) cleared cookies and left
    // every one of the 190 actions probing anonymously — the whole
    // affordance-not-found fail class of the 2026-10-18 run (65 actions,
    // including ACT-012 ACT-039 ACT-064 ACT-092 ACT-119 ACT-143 ACT-173),
    // reproduced action-for-action in
    // .runtime/exhaustive/2026-10-18-slice3-prefix-repro.
    const perAction = [];
    let totalInteractions = 0;
    let activeActor = null;
    for (const action of actions) {
      const t0 = Date.now();
      const meta = SURFACES[action.surface];
      const actorName = meta?.actor ?? signinActor;
      if (meta?.signin === "none") {
        await ctxb.clearCookies().catch(() => {});
        activeActor = null;
      } else if (activeActor !== actorName) {
        const actor = actors[actorName] ?? actors.admin ?? actors.anonymous;
        if (actor?.email) {
          try {
            await signIn(page, server.base, actor);
            activeActor = actorName;
            console.log(`[run-exhaustive] signed in as ${actorName} (${actor.email}) for ${action.id}`);
          } catch (err) {
            console.error(`[run-exhaustive] sign-in for ${action.id} (${actorName}): ${err?.message ?? err}`);
          }
        }
      }

      let probe;
      try {
        probe = await probeAction(page, action, lastStatusRef, actors);
      } catch (err) {
        probe = { sequence: [{ interaction: "error", error: String(err?.message ?? err) }], observations: [], outcome: "error" };
      }
      const sequenceCount = probe.sequence.length;
      const observationsCount = probe.observations.length;
      const interactions = sequenceCount + observationsCount;
      totalInteractions += interactions;
      const record = {
        id: action.id,
        action: action.action,
        surface: action.surface,
        kind: action.kind,
        capability_id: action.capability_id ?? null,
        outcome: probe.outcome,
        interactions,
        sequence_count: sequenceCount,
        observation_count: observationsCount,
        anyFound: !!probe.anyFound,
        exactFound: !!probe.exactFound,
        witnessFound: !!probe.witnessFound,
        anyAsserted: !!probe.anyAsserted,
        located: probe.located ?? 0,
        asserted: probe.asserted ?? 0,
        target_case: !!probe.hasTargetCase,
        required_legs: probe.requiredLegs ?? 0,
        required_failed: probe.requiredFailed ?? 0,
        ms: Date.now() - t0,
        sequence: probe.sequence,
        observations: probe.observations.map((o) => ({ label: o.label, url: o.url, status: o.status, fields: o.fields, text_excerpt: String(o.mainText ?? "").slice(0, 500), structure_excerpt: (o.structure ?? []).slice(0, 60) })),
      };
      writeFileSync(path.join(actionsDir, `${action.id}.json`), JSON.stringify(record, null, 2));
      perAction.push(record);
      console.log(`[run-exhaustive] ${action.id} ${action.kind.padEnd(20)} ${probe.outcome.padEnd(11)} interactions=${String(interactions).padStart(4)} exactFound=${probe.exactFound ? 1 : 0} witnessFound=${probe.witnessFound ? 1 : 0} action="${String(action.action).slice(0, 70)}"`);
      if (failFast && probe.outcome === "error") {
        console.error(`[run-exhaustive] aborting on ${action.id}: probe error`);
        break;
      }
    }

    const totals = {
      actions_total: matrix.actions.length,
      actions_selected: actions.length,
      actions_exercised: perAction.length,
      total_interactions: totalInteractions,
      per_outcome: perAction.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {}),
      per_kind: {},
      per_kind_outcome: {},
      per_surface: {},
    };
    for (const r of perAction) {
      totals.per_kind[r.kind] = (totals.per_kind[r.kind] ?? 0) + 1;
      totals.per_kind_outcome[`${r.kind}|${r.outcome}`] = (totals.per_kind_outcome[`${r.kind}|${r.outcome}`] ?? 0) + 1;
      totals.per_surface[r.surface] = (totals.per_surface[r.surface] ?? 0) + 1;
    }

    const runMeta = {
      startedAt,
      finishedAt: new Date().toISOString(),
      server: { engine: engine.name, base: server.base, bootMs: server.bootMs, attached: !!server.attached, logFile: server.attached ? null : path.relative(repo, serverLog) },
      // Host + write mode of THIS run, and what the write gate did (every
      // run report names its target; lib/live-walk-profile.mjs).
      target: provenance.target,
      writeGate: {
        mode: liveWalk.mode,
        blockedWrites: writeGateBlocked.length,
        skippedWriteActions: totals.per_outcome.skipped_write ?? 0,
      },
      totals,
      per_action: perAction.map((r) => ({ id: r.id, kind: r.kind, surface: r.surface, outcome: r.outcome, interactions: r.interactions, sequence_count: r.sequence_count, observation_count: r.observation_count, exactFound: r.exactFound, witnessFound: r.witnessFound, target_case: r.target_case, required_legs: r.required_legs, required_failed: r.required_failed })),
    };
    writeFileSync(path.join(out, "run-meta.json"), JSON.stringify(runMeta, null, 2));
    writeRunMarkdown(path.join(out, "run.md"), runMeta, engine);
    console.log(`[run-exhaustive] DONE actions=${perAction.length} totalInteractions=${totalInteractions} out=${path.relative(repo, out)}`);
    await browserHandle.close();
    browserHandle = undefined;
    await server.stop();
  } catch (err) {
    console.error(`[run-exhaustive] FATAL ${err?.stack ?? err}`);
    if (browserHandle) await browserHandle.close().catch(() => {});
    await server.stop().catch(() => {});
    process.exit(1);
  }
}

function writeRunMarkdown(file, meta, engine) {
  const lines = [];
  lines.push(`# Exhaustive enumeration run`);
  lines.push("");
  lines.push(`- Out dir: \`${path.relative(repo, out)}\``);
  lines.push(`- Engine: \`${engine.name}\` (${meta.server.engine}${meta.server.attached ? ", attached to a running host" : ", booted locally"})`);
  lines.push(`- Target host: \`${meta.target.host}\` (write mode: **${meta.target.mode}**)`);
  if (meta.target.mode === "scratch-allowlist") {
    const a = meta.target.scratchAllowlist ?? {};
    lines.push(`- Scratch allowlist: \`${a.path ?? "(none)"}\` ${a.present ? `present (sha256 ${a.sha256?.slice(0, 12)}), prefixes: ${(a.prefixes ?? []).join(", ") || "(none approved)"}` : "**ABSENT at run time — every write skipped (fail-safe)**"}`);
  }
  if (meta.writeGate.blockedWrites > 0) lines.push(`- Write gate blocked ${meta.writeGate.blockedWrites} page write(s); ${meta.writeGate.skippedWriteActions} action(s) graded skipped_write`);
  lines.push(`- Source commit: \`${sourceCommit}\``);
  lines.push(`- Source dirty: ${sourceDirty}`);
  lines.push(`- Matrix sha256: \`${matrixSha256}\``);
  lines.push(`- Fixture sha256: \`${fixtureSha256}\``);
  lines.push(`- Dist sha256: \`${distSha256 ?? "(no dist yet)"}\``);
  lines.push(`- Started: ${meta.startedAt}`);
  lines.push(`- Finished: ${meta.finishedAt}`);
  lines.push("");
  lines.push(`## Totals`);
  lines.push("");
  lines.push(`| metric | value |`);
  lines.push(`|---|---:|`);
  lines.push(`| actions in matrix | ${meta.totals.actions_total} |`);
  lines.push(`| actions selected | ${meta.totals.actions_selected} |`);
  lines.push(`| actions exercised | ${meta.totals.actions_exercised} |`);
  lines.push(`| **total interactions** | **${meta.totals.total_interactions}** |`);
  lines.push("");
  lines.push(`## Per outcome`);
  lines.push("");
  lines.push(`| outcome | count |`);
  lines.push(`|---|---:|`);
  for (const [k, v] of Object.entries(meta.totals.per_outcome ?? {})) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push(`## Per kind (action-level outcome count)`);
  lines.push("");
  lines.push(`| kind | count |`);
  lines.push(`|---|---:|`);
  for (const [k, v] of Object.entries(meta.totals.per_kind ?? {})) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push(`## Per kind and outcome`);
  lines.push("");
  lines.push(`| kind | outcome | count |`);
  lines.push(`|---|---|---:|`);
  for (const [k, v] of Object.entries(meta.totals.per_kind_outcome ?? {})) {
    const [kind, outcome] = k.split("|");
    lines.push(`| ${kind} | ${outcome} | ${v} |`);
  }
  lines.push("");
  lines.push(`## Per surface`);
  lines.push("");
  lines.push(`| surface | count |`);
  lines.push(`|---|---:|`);
  for (const [k, v] of Object.entries(meta.totals.per_surface ?? {})) {
    const lbl = k.length > 80 ? k.slice(0, 77) + "..." : k;
    lines.push(`| ${lbl} | ${v} |`);
  }
  writeFileSync(file, lines.join("\n") + "\n");
}

run().catch((err) => {
  console.error(`[run-exhaustive] ${err.stack ?? err}`);
  process.exit(1);
});
