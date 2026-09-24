// adversarial-probes.mjs — adversarial differential probe battery for the
// Cloudflare card-shaping URL surface (benchmarks/cf-scale lane).
//
// PURPOSE (operator-approved 2026-09-23 window): fire every adversarial probe
// class the /<card-name> URL surface can receive, record LOCAL-expected
// behavior (the engine booted locally under miniflare over the targeted
// Cloudflare deck + a crafted scratch deck), then diff the REMOTE deployed
// worker against those expectations and print per-batch D1 arithmetic
// (rows-read / request count) with 20% headroom against the 5M reads /
// 100k requests daily free limits, so the window decision comes from one
// output block.
//
// MODES (mutually exclusive):
//   node benchmarks/cf-scale/adversarial-probes.mjs --write-scratch-deck
//       Write tmp/adversarial-probe-scratch-deck.sql (the crafted cards).
//   node benchmarks/cf-scale/adversarial-probes.mjs --local [--record]
//       Boot deploy/worker.ts under miniflare (workerd, local D1) over
//       db/migrations 0001 + deploy/cf-scale-deck/seed.sql + the scratch
//       deck, run every probe, print the behavior table. --record writes
//       probe-expectations.json (the local-expected baseline).
//   node benchmarks/cf-scale/adversarial-probes.mjs --remote --base-url https://...
//       Fire the same battery at the deployed worker, diff each probe's
//       status/sentinels against probe-expectations.json, and print the
//       per-batch rows-read/request arithmetic from /__metrics deltas.
//
// ABSOLUTELY NO Cloudflare contact from this file: no wrangler, no --remote
// deploys, nothing but HTTPS GET/POST to the --base-url the operator names.
// Applying the scratch deck to the REMOTE D1 is the lead's step; this file
// only prints the commands and their write-cost arithmetic.
//
// The local boot mirrors tests/deploy/deploy-worker-miniflare.test.ts
// (vite bundle of deploy/worker.ts with the node:crypto alias, miniflare-5
// options via convertV4MiniflareOptions) — the proven workerd path, so the
// URL semantics measured locally are workerd's, not undici's.
//
// Rows-read honesty: production D1 reports meta.rows_read and the worker's
// /__metrics aggregate sums it exactly (deploy/src/worker-metrics.ts:237-252
// labels the emulation fallback). MEASURED 2026-09-23: this machine's local
// workerd D1 DOES surface meta.rows_read, so --local prints exact LOCAL
// SQLite scan counts (production D1's distributed engine may count
// differently) and --remote prints exact production /__metrics deltas. A
// per-cost-class model remains in the code only as a fallback for runs
// where the runtime hides the counters; it is never presented as measured.

import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SCRATCH_SQL_PATH = join(REPO, "tmp", "adversarial-probe-scratch-deck.sql");
const DEBUG_DIR = join(REPO, "tmp", "adversarial-probe-debug");
const EXPECTATIONS_PATH = join(HERE, "probe-expectations.json");
const STAMP = "2026-09-23 00:00:00.000";

// ---------------------------------------------------------------------------
// Daily free limits the arithmetic block reports against (5M reads / 100k
// requests / 100k writes) and the 20% headroom factor the ask mandates.
// ---------------------------------------------------------------------------
const LIMIT_ROWS_READ = 5_000_000;
const LIMIT_REQUESTS = 100_000;
const LIMIT_ROWS_WRITTEN = 100_000;
const HEADROOM = 1.2;
/** Row count of the scratch deck (lazy — buildScratchDeckRows reads
 *  module consts that must finish initializing first). */
const scratchRowCount = () => buildScratchDeckRows().length;

// ---------------------------------------------------------------------------
// The probe battery.
//
// Each probe: id, batch, method/path/body, costClass (for the modeled
// rows-read range), checks (declarative), oracle (what the Ruby prototype
// pins, with cite, when determinable), and note.
//
// check kinds: status (exact), contains / notContains (body substrings),
// minOccurrences {needle, n}, json {rowsAtLeast, rowsAtMost, countEquals,
// errorContains} (parsed-JSON body assertions).
// ---------------------------------------------------------------------------
const PROBES = [
  // ----- batch 00-control: prove the deck is the deck ----------------------
  { id: "home-renders", batch: "00-control", path: "/", costClass: "closure",
    checks: { status: 200, contains: ["card-view"] },
    oracle: "Ruby: root page renders Home :open (deploy/worker.ts:400-403).",
    note: "targeted deck control" },
  { id: "status", batch: "00-control", path: "/_status", costClass: "point",
    checks: { status: 200, contains: ["\"ok\": true"] },
    oracle: "deploy/worker.ts:319-341 — COUNT(*) health JSON.",
    note: "engine + database health" },
  { id: "scale-page-open", batch: "00-control", path: "/Scale%20Page%201x", costClass: "closure",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "Multi-word name via %20; key alias space->underscore (src/card/name.ts:97-105 simpleKey).",
    note: "the canonical %20 form of an ordinary card" },
  { id: "scale-page-json", batch: "00-control", path: "/Scale%20Page%201x.json", costClass: "point",
    checks: { status: 200, contains: ["\"key\": \"scale_page_1x\""] },
    oracle: "deploy/worker.ts:261-284 record JSON; row key from the targeted generator convention.",
    note: "record JSON control" },

  // ----- batch 01-name-encoding: '+' vs %20 vs %2B and key aliases --------
  { id: "plus-rewritten-to-space", batch: "01-name-encoding", path: "/Scale+Page+1x", costClass: "closure",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "DELIBERATE DIVERGENCE from decko: deploy/worker.ts:233-239 decodeName rewrites '+' to ' ' BEFORE decoding, so the URL plus can never reach the engine as the DeckoName joint ('+'). In card-1.110.0/Decko, /A+B is the junction URL (Card::Name.joint = '+', prototype/lib/cardname.rb JOINT). Junctions are reachable here only via %2B.",
    note: "decko would junction-split this; ours renders the simple card" },
  { id: "pct20-space", batch: "01-name-encoding", path: "/Scale%20Page%202x", costClass: "closure",
    checks: { status: 200, contains: ["Scale page 2."] },
    oracle: "same shape as scale-page-open on a second card; kept so remote diffs catch cache-key errors between the two forms",
    note: "second ordinary card via %20" },
  { id: "pct2b-encoded-plus-is-junction", batch: "01-name-encoding", path: "/Scale%2BPage", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "MEASURED MECHANISM (finding, the headline of this batch): %2B does NOT survive to the engine — by the time decodeName sees the path the escape is already a literal '+', and its `raw.replace(/\\+/g, ' ')` (deploy/worker.ts:235) rewrites it to a space BEFORE decoding. The engine receives 'Scale Page' (space form), key 'scale_page' — no such row -> 404. Combined with the literal-plus rewrite this means JUNCTION NAMES ARE UNREACHABLE OVER HTTP in every form ('+' -> space; '%2B' -> '+' -> space). In Ruby/decko /A+B IS the junction URL (Card::Name.joint '+', prototype/lib/cardname.rb). Verified by the debug dump of targeted-compound-junction (the not-found message shows the requested name with a space where the joint should be).",
    note: "%2B is rewritten to space too — compounds unreachable (finding)" },
  { id: "underscore-alias", batch: "01-name-encoding", path: "/scale_page_1x", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "key aliases: simpleKey collapses case+separators (src/card/name.ts:97-105); Ruby simple_key same (prototype/lib/cardname.rb:106-115).",
    note: "lowercase underscore form resolves to the same row" },
  { id: "hyphen-alias", batch: "01-name-encoding", path: "/Scale-Page-1x", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "'-' is not \\p{L}\\p{M}\\p{Nd}\\p{Pc} so it keys as '_' (name.ts:66-67 NOT_OK_FOR_KEY).",
    note: "hyphen alias" },
  { id: "dot-alias", batch: "01-name-encoding", path: "/Scale.Page.1x", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "same NOT_OK_FOR_KEY class as hyphen ('.' -> '_').",
    note: "dot alias" },
  { id: "encoded-underscore", batch: "01-name-encoding", path: "/Scale%5FPage%5F1x", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "decodeURIComponent then key-alias; identical to the literal underscore form.",
    note: "%5F" },
  { id: "case-insensitive", batch: "01-name-encoding", path: "/DEPTH%20ROOT", costClass: "point",
    checks: { status: 200, contains: ["Depth level 0"] },
    oracle: "key derivation lowercases (underscore guard, name/inflect.ts:172-180); lookups are key-equality (retrieve.ts:257-264).",
    note: "all-caps URL of a letter-only name" },
  { id: "digit-uppercase-key-divergence", batch: "01-name-encoding", path: "/Scale%20Page%201X", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "NOT a fetch bug — a deck-seeding artifact this probe pins: underscore() inserts a camel boundary between a digit and a following uppercase ('1X' -> '1_X', inflect.ts:176-178, the ActiveSupport /([a-z\\d])([A-Z])/ rule), so the ENGINE key of 'Scale Page 1X' is 'scale_page_1_x' while targeted-test-deck.mjs:40 seeded the naive key 'scale_page_1x'. Ruby's ActiveSupport underscore inserts the same boundary (activesupport lib/active_support/inflector/methods.rb), so the port is faithful; any name with digit+uppercase is unreachable by URL on a deck seeded with the naive key rule.",
    note: "digit+uppercase name — engine key vs seeded key divergence" },
  { id: "compound-by-plus-renders-simple", batch: "01-name-encoding", path: "/Depth+Level+1", costClass: "point",
    checks: { status: 200, contains: ["Depth level 1"] },
    oracle: "plus->space again: this is the SIMPLE card 'Depth Level 1', not a junction (divergence documented at plus-rewritten-to-space).",
    note: "targeted-deck chain member via plus form" },
  { id: "pct2b-junction-unknown", batch: "01-name-encoding", path: "/Depth%2BLevel%2B1", costClass: "point",
    checks: { status: 200, contains: ["Depth level 1"] },
    oracle: "MEASURED, mechanism solved by the targeted-compound-junction dump: %2B becomes '+' then decodeName rewrites it to a space (deploy/worker.ts:235), so this URL is the SIMPLE card 'Depth Level 1' — which renders, expanding its 32-level chain (~54KB). Not a junction resolution at all; pinned so any future decodeName fix flips this probe visibly.",
    note: "%2B form collapses to the simple card 'Depth Level 1' (measured)" },
  { id: "targeted-compound-junction", batch: "01-name-encoding", path: "/Scale%20Page%201x%2BScale%20Page%20501x", costClass: "closure",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "THE HEADLINE FINDING, pinned: this REAL targeted-deck junction row (dimension 5; left_id/right_id; the engine renders it fine when called directly — verify-targeted-deck.test.ts:69-76) is UNREACHABLE over HTTP: the debug dump shows the not-found message carries the name with a SPACE where the joint belongs ('Scale Page 1x Scale Page 501x'). Same fate for the 50 compound pairs and the chain junction rows. Ruby/decko addresses compounds as /A+B; the port's HTTP surface cannot address them at all. Report, not fix (deploy/ is outside this lane's ownership).",
    note: "real junction row 404s over HTTP — compound names unreachable (finding)" },
  { id: "targeted-chain-junction", batch: "01-name-encoding", path: "/Depth%20Root%2BDepth%20Level%201", costClass: "closure",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "same compound-unreachable mechanism (space-rewrite) for the 32-chain's own junction row.",
    note: "chain junction row via %2B — same 404 (finding)" },
  { id: "pct2f-slash-in-name-unknown", batch: "01-name-encoding", path: "/Scale%2FPage", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "%2F decodes to '/' inside the name; DeckoName does not split on '/' (only '+', name.ts:232-234), so this is the simple name 'Scale/Page' — no such card.",
    note: "encoded slash inside a name" },
  { id: "crafted-slash-name-renders", batch: "01-name-encoding", path: "/Probe%20Slash%2FName", costClass: "point",
    checks: { status: 200, contains: ["probe slash name body."] },
    oracle: "'/' is a legal simple-name character (key: slash -> '_'); card crafted in the scratch deck.",
    note: "card whose NAME contains a literal slash" },
  { id: "id-mark-tilde-9", batch: "01-name-encoding", path: "/~9", costClass: "point",
    checks: { status: 500, contains: ["id doesn't exist: 9"] },
    oracle: "MEASURED (finding): '~9' enters Name.id_from_string! (retrieve.ts:163-177, name.ts:240-253); when the Lexicon does not know id 9 on the worker's fetch path it raises NameNotFoundError 'id doesn't exist: 9' -> 500 error page. Ruby: bad_mark raises Card::Error::NotFound (name.rb:104-106) which decko's controller renders as its not-found page — ours 500s. The row exists (Scale Page 1x = id 9, targeted-test-deck.mjs insertion order), so this is a fetch-path lexicon warming gap, not a missing row.",
    note: "~id mark URL — 500 on the deployed surface (measured)" },
  { id: "codename-mark", batch: "01-name-encoding", path: "/:search_type", costClass: "point",
    checks: { status: 500 },
    oracle: "MEASURED (finding): ':search_type' resolves through the codename registry (retrieve.ts:179-188, name.ts:244-252); on the worker fetch path the registry is unwarmed -> CodenameNotFoundError -> 500. The codename EXISTS in the deck (cards.codename 'search_type', targeted seed id 2). Ruby: CodenameNotFound -> not_found_codename view (format/nest/fetch.rb:27-35).",
    note: "codename mark URL — 500 on the deployed surface (measured)" },
  { id: "double-slash-collapsed", batch: "01-name-encoding", path: "//Scale%20Page%201x", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "deploy/worker.ts:368 trailing-slash strip only; leading '//' leaves pathname.slice(1) = '/Scale…' — MEASURED behavior recorded; the leading-slash residue makes the name '/Scale Page 1x' (unknown) or renders, depending on WHATWG normalization — that measurement IS the probe.",
    note: "leading double slash" },
  { id: "trailing-slash", batch: "01-name-encoding", path: "/Scale%20Page%201x/", costClass: "point",
    checks: { status: 200, contains: ["Scale page 1."] },
    oracle: "deploy/worker.ts:352,368 — one trailing-slash strip; '/Home/' and '/Home' are one card.",
    note: "trailing slash normalization" },
  { id: "dot-segments-normalize-to-home", batch: "01-name-encoding", path: "/Scale%20Page%201x/..", costClass: "point",
    checks: { status: 200 },
    oracle: "WHATWG URL normalizes '/X/..' to '/' before the worker sees the path — measures whether the probe path survives as '/' (home) or the card.",
    note: "dot-segment traversal in the URL parser" },

  // ----- batch 02-unicode-percent ------------------------------------------
  { id: "unicode-nfc-name", batch: "02-unicode-percent", path: "/Probe%20Caf%C3%A9%20Card", costClass: "point",
    checks: { status: 200, contains: ["probe café card body."] },
    oracle: "é is \\p{L}: kept in the key (name.ts:66 NOT_OK_FOR_KEY keeps letters). Row key crafted to engine simpleKey.",
    note: "NFC é in name and key" },
  { id: "unicode-nfd-name-not-found", batch: "02-unicode-percent", path: "/Probe%20Cafe%CC%81%20Card", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "NFD 'e'+U+0301: U+0301 is \\p{M} (kept), so the decomposed key differs from the NFC key — no Unicode normalization happens in simpleKey (name.ts:97-105 has no normalize()). Ruby cardname simple_key likewise has none.",
    note: "same visual name, decomposed — must not resolve" },
  { id: "emoji-name", batch: "02-unicode-percent", path: "/Probe%20%F0%9F%9A%80%20Card", costClass: "point",
    checks: { status: 200, contains: ["probe rocket card body."] },
    oracle: "🚀 is \\p{So}: NOT_OK_FOR_KEY replaces it -> key collapses to probe_card (name.ts:66-67, 97-105).",
    note: "emoji in name" },
  { id: "malformed-percent-400", batch: "02-unicode-percent", path: "/%E0%A4%A", costClass: "point",
    harnessSensitive: true,
    checks: { status: 500 },
    oracle: "HARNESS-SENSITIVE (measured): the 500 is 'TypeError: Invalid URL string' thrown by MINIFLARE'S dispatchFetch client before the worker runs (debug dump) — a local-harness artifact, NOT worker behavior. The worker itself would decodeName-catch the URIError -> 400 (deploy/worker.ts:233-239). The remote diff should treat any divergence here as environment, not engine. Ruby/Rack leaves malformed sequences literal (no throw).",
    note: "truncated UTF-8 percent sequence — local 500 is a harness artifact" },

  // ----- batch 03-empty-long-trailing --------------------------------------
  { id: "space-only-name", batch: "03-empty-long-trailing", path: "/%20", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "name ' ' -> DeckoName rubyStrip -> '' -> key '' -> fetch miss -> 404 (render.ts:220-222 message; deploy/worker.ts:256). Ruby: fetch of a blank mark is nil (format/nest/fetch.rb retrieve_existing 'mark.present?'), page unknown -> 404.",
    note: "name that strips to empty" },
  { id: "trailing-dot-name", batch: "03-empty-long-trailing", path: "/Probe%20Trailing%20Dot.", costClass: "point",
    checks: { status: 200, contains: ["probe trailing dot body."] },
    oracle: "'.' keys as '_' then split(/_+/).filter drops the empty tail (name.ts:97-105) — resolves to the same row as the crafted name WITH the dot.",
    note: "trailing dot in name" },
  { id: "trailing-dash-name", batch: "03-empty-long-trailing", path: "/Probe%20Trailing%20Dash-", costClass: "point",
    checks: { status: 200, contains: ["probe trailing dash body."] },
    oracle: "same drop-the-empty-tail rule for '-'.",
    note: "trailing dash in name" },
  { id: "existing-name-500-char", batch: "03-empty-long-trailing", path: `/Probe%20Long%20Name%20${"a".repeat(484)}`, costClass: "point",
    checks: { status: 200, contains: ["probe long name body."] },
    oracle: "500-char simple name (16-char stem + 484 a's), crafted to exist; key derivation is length-unbounded.",
    note: "crafted 500-char name, exists" },
  { id: "missing-name-500-char", batch: "03-empty-long-trailing", path: `/Probe%20Absent%20${"b".repeat(487)}`, costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "500-char name (13-char stem + 487 b's) with no row -> 404 (error.rb:23-27).",
    note: "500-char name, does not exist" },
  { id: "existing-name-500-char-json", batch: "03-empty-long-trailing", path: `/Probe%20Long%20Name%20${"a".repeat(484)}.json`, costClass: "point",
    checks: { status: 200, contains: ["probe long name body."] },
    oracle: ".json suffix route (deploy/worker.ts:407-415).",
    note: "500-char name via .json" },
  { id: "bare-dot-path", batch: "03-empty-long-trailing", path: "/.", costClass: "point",
    checks: { status: 200, contains: ["card-view"] },
    oracle: "WHATWG normalizes '/.' to '/'; empty path -> Home (deploy/worker.ts:400-403).",
    note: "single dot segment" },
  { id: "dotdot-path", batch: "03-empty-long-trailing", path: "/..", costClass: "point",
    checks: { status: 200, contains: ["card-view"] },
    oracle: "same dot-segment normalization.",
    note: "dot-dot segment" },

  // ----- batch 04-routing-methods ------------------------------------------
  { id: "view-suffix-not-routed", batch: "04-routing-methods", path: "/Scale%20Page%201x/open", costClass: "point",
    checks: { status: 404, contains: ["No route for"] },
    oracle: "deploy surface has NO view segment (deploy/worker.ts:419-421 — 'no slashes in this surface'); the ROOT worker.js:57-62 DOES route views. Ruby decko routes /name/view. Surface narrowing is deliberate; recorded so the remote diff flags regressions.",
    note: "slash-path rejected" },
  { id: "post-card-405", batch: "04-routing-methods", method: "POST", path: "/Scale%20Page%201x", costClass: "point",
    checks: { status: 405, contains: ["method not allowed"] },
    oracle: "deploy/worker.ts:396-398.",
    note: "POST to card route" },
  { id: "get-api-query-405", batch: "04-routing-methods", path: "/api/query", costClass: "point",
    checks: { status: 405, contains: ["POST a JSON body"] },
    oracle: "deploy/worker.ts:389-391 — the /api/query 405 body is the POST hint, not the generic 'method not allowed' (measured).",
    note: "GET on POST-only endpoint" },
  { id: "post-status-405", batch: "04-routing-methods", method: "POST", path: "/_status", costClass: "point",
    checks: { status: 405, contains: ["method not allowed"] },
    oracle: "deploy/worker.ts:371.",
    note: "POST to status" },
  { id: "deep-path-404", batch: "04-routing-methods", path: "/no/route/here", costClass: "point",
    checks: { status: 404, contains: ["No route for"] },
    oracle: "deploy/worker.ts:419-421.",
    note: "multi-segment path" },
  { id: "missing-card-html-404", batch: "04-routing-methods", path: "/Probe%20Totally%20Missing", costClass: "point",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "render throws 'card not found: X' (render.ts:220-222); deploy/worker.ts:256 maps to 404 — CONVERGES with Ruby's 404 (error.rb:23-27).",
    note: "ordinary unknown card" },
  { id: "json-suffix-empty-name-400", batch: "04-routing-methods", path: "/.json", costClass: "point",
    checks: { status: 400, contains: ["empty card name"] },
    oracle: "deploy/worker.ts:407-414: '.json' with empty stem -> 400.",
    note: ".json with no name" },

  // ----- batch 05-denial-nesting -------------------------------------------
  { id: "denied-card-denial-span", batch: "05-denial-nesting", path: "/Restricted%20Page%207", costClass: "closure",
    checks: { status: 200, contains: ["denied"], notContains: ["Restricted body 7"] },
    oracle: "*self read rule denies anonymous; denial view replaces the body (src/card/permissions/; Ruby view/permission.rb altered_view). Body bytes must never leak through the HTML page.",
    note: "targeted-deck denied card" },
  { id: "denied-card-json-LEAK-CHECK", batch: "05-denial-nesting", path: "/Restricted%20Page%207.json", costClass: "point",
    checks: { status: 200, contains: ["Restricted body 7"] },
    oracle: "KNOWN HOLE (finding, reported not fixed): cardRecordJson (deploy/worker.ts:261-284) fetches by name with NO read-rule check and returns FULL db_content — a denied card's body leaks over the .json route. Ruby: GET of a denied card renders the denial (ok_to_read? fails, error.rb:27-31). This probe ASSERTS THE LEAK so the remote window measures it; if the hole is ever closed, this probe flips and the diff will say so.",
    note: ".json route has no permission gate — expected leak" },
  { id: "denied-parent-render", batch: "05-denial-nesting", path: "/Probe%20Restricted%20Parent", costClass: "closure",
    checks: { status: 200, contains: ["denied"], notContains: ["restricted parent body"] },
    oracle: "scratch-deck card with a *self rule no anonymous grant reaches (same wiring as targeted-test-deck.mjs:126-134; render.ts:744-761 canReadByStoredRule).",
    note: "crafted denied parent" },
  { id: "readable-child-of-denied-parent", batch: "05-denial-nesting", path: "/Probe%20Restricted%20Parent%2BProbe%20Child", costClass: "closure",
    checks: { status: 404, contains: ["Card not found"] },
    oracle: "MEASURED — blocked by the compound-unreachable finding, not by permissions: the %2B joint rewrites to a space (deploy/worker.ts:235) so the composed name never reaches the engine (debug dump). The permission QUESTION (does a rule-less composed child of a denied parent render — render.ts:740-743 'rule-less seeds stay allowed'; Ruby rule inheritance oracle-unknown) is answered by the NEXT probe, which reaches the same junction through a nest inside a readable card, bypassing the URL layer entirely.",
    note: "denied parent + composed child via URL — 404 (compound-unreachable finding)" },
  { id: "readable-child-via-nest", batch: "05-denial-nesting", path: "/Probe%20Nest%20Of%20Junction%20Child", costClass: "closure",
    checks: { status: 200, contains: ["junction child body — readable via composed name."] },
    oracle: "the composed child 'Probe Restricted Parent+Probe Child' reached through {{...}} in a readable card (no URL rewrite in the nest path): renders 200 with the child body, denial NOT inherited — the port's rule-less-allowed semantics (render.ts:740-761). Ruby inheritance behavior not determinable from the prototype overlay (rule resolution needs the permissions mod's live walk) — oracle-unknown, measured behavior pinned.",
    note: "composed child via nest — renders, denial not inherited (measured)" },
  { id: "nest-of-denied-renders-denial", batch: "05-denial-nesting", path: "/Probe%20Nest%20Of%20Restricted", costClass: "closure",
    checks: { status: 200, contains: ["denied"], notContains: ["restricted parent body"] },
    oracle: "a readable card nesting a denied card renders the denial span inline, page 200 (format.ts:300-309 viewPermissionDenial; Ruby view/permission.rb:46-50).",
    note: "denial propagates inline, not as a page error" },

  // ----- batch 06-cycles-depth ---------------------------------------------
  { id: "self-inclusion", batch: "06-cycles-depth", path: "/Probe%20Self%20Loop", costClass: "cycle",
    checks: { status: 500, contains: ["nest depth exceeded"] },
    oracle: "RUBY DIVERGENCE (finding): Ruby raises Card::Error::UserError 'Man, you're too deep.  (Too many levels of nests at a time)' at format depth >= 20 (Card.config.max_depth=20, prototype/lib/cardio/railtie.rb:17; monitor_depth prototype/lib/card/format/error.rb:32-38; invoked from prototype/lib/card/view.rb:86). A NESTED render rescues to an INLINE message (render.rb:115-119 rescue_view -> quiet_error, error.rb:75-85), so Ruby's page is 200 with 20 levels then the message. Ours nests to depth 42 (render.ts:347 maxDepth:42; format.ts:492-494 throw) and the WHOLE PAGE 500s. Termination is by depth counter in both — neither loops forever.",
    note: "A includes A — terminates at the depth guard" },
  { id: "cycle-two", batch: "06-cycles-depth", path: "/Probe%20Cycle%20A", costClass: "cycle",
    checks: { status: 500, contains: ["nest depth exceeded"] },
    oracle: "same depth-guard termination as self-inclusion; Ruby inline 'too deep' at 20. Prefetch CTE terminates by UNION dedup (prefetch.ts:17,145,191).",
    note: "A includes B includes A" },
  { id: "cycle-three", batch: "06-cycles-depth", path: "/Probe%20Cycle%20C1", costClass: "cycle",
    checks: { status: 500, contains: ["nest depth exceeded"] },
    oracle: "same class.",
    note: "3-cycle C1->C2->C3->C1" },
  { id: "pointer-to-self", batch: "06-cycles-depth", path: "/Probe%20Self%20Pointer", costClass: "cycle",
    checks: { status: 200, contains: ["Probe Self Pointer"] },
    oracle: "MEASURED: pointer items render through the :bar item view (views.ts pointer path via nestRecord), and :bar does not re-expand core content — so a self-listing pointer TERMINATES at one nesting level instead of recursing. Ruby's pointer item view choice determines the same fork (bar vs content); the termination here is by view shape, not the depth counter.",
    note: "pointer card listing itself — bounded by item view (measured)" },
  { id: "self-search", batch: "06-cycles-depth", path: "/Probe%20Self%20Search", costClass: "cycle",
    checks: { status: 200, contains: ["Probe Self Search"] },
    oracle: "MEASURED: card_list renders its items as :bar; the search card lists itself once (searchResults memoization, render.ts:1276-1284) and the bar view does not re-run the search — recursion terminates by view shape. (On D1 the match itself fails — REGEXP — so the measured body is the empty/failed-list shape; the check pins whatever the local workerd measured.)",
    note: "search card whose query matches itself — bounded (measured)" },
  { id: "nest-of-cycle-page-500", batch: "06-cycles-depth", path: "/Probe%20Nest%20Of%20Cycle", costClass: "cycle",
    checks: { status: 500, contains: ["nest depth exceeded"] },
    oracle: "KEY RUBY DIVERGENCE: root card is readable; the CYCLE lives at nest depth 1+. Ruby rescues the depth-20 UserError in the NON-focal subformat and renders the message INLINE — page 200 with readable content then 'Man, you're too deep...' (render.rb:115-119, error.rb:75-85 quiet path). Ours throws out of the root render -> whole page 500.",
    note: "readable root, cycle nested inside — inline vs page-failing" },
  { id: "depth-20-chain-ok", batch: "06-cycles-depth", path: "/Probe%20Deep%20D20%20Root", costClass: "cycle",
    checks: { status: 200, contains: ["probe deep d20 l19 leaf."] },
    oracle: "chain of 20 cards = max format depth 19 < 20: legal in Ruby (max_depth=20) AND in the port (42). Convergence pinned at the Ruby boundary.",
    note: "chain depth exactly at Ruby's boundary minus one" },
  { id: "depth-21-chain-ok-locally", batch: "06-cycles-depth", path: "/Probe%20Deep%20D21%20Root", costClass: "cycle",
    checks: { status: 200, contains: ["probe deep d21 l20 leaf."] },
    oracle: "chain of 21 = depth 20 >= Ruby max_depth: RUBY RAISES 'too deep' here; the port renders (guard at 42, render.ts:347). Measured local behavior recorded; divergence cited in the ledger.",
    note: "chain one past Ruby's boundary — port still renders" },
  { id: "depth-32-targeted-chain", batch: "06-cycles-depth", path: "/Depth%20Root", costClass: "cycle",
    checks: { status: 200, contains: ["The deepest content of the 32-level chain."] },
    oracle: "the SHIPPED targeted deck's own dimension-2 chain renders fine locally (verify-targeted-deck.test.ts:41-44) but is UNRENDERABLE under the Ruby oracle: depth 32 >= max_depth 20 -> UserError. Any Ruby-parity claim about this deck must mention this (render.ts:223 maxDepth comment says 'decko default 42'; the vendored prototype pins 20).",
    note: "targeted deck 32-deep chain vs Ruby max 20" },
  { id: "depth-44-chain", batch: "06-cycles-depth", path: "/Probe%20Deep%20D44%20Root", costClass: "cycle",
    checks: { statusIn: [200, 500] },
    oracle: "MEASURED ENGINE NONDETERMINISM (finding, same class as nest-of-bad-cql): 500 (nest depth exceeded at 42) on six consecutive battery runs, then 200 with the full 75KB chain rendered on run 7 — the deep-chain nest targets sometimes fail to resolve/prepare (prefetch fallback rounds, MAX_FALLBACK_ROUNDS=25, prefetch.ts:60) so the unknown-nest path renders instead of recursing into the depth guard. The ordering hazard lives in render.ts/prefetch.ts (not this lane's files) — reported. Probe pins the OBSERVED ENVELOPE {200,500}; anything outside it on the remote is a real divergence. Ruby: 44-deep is past max_depth=20 — always the inline too-deep error (deterministic).",
    note: "44-deep chain — locally nondeterministic {200,500}" },
  { id: "nest-of-missing-unknown-view", batch: "06-cycles-depth", path: "/Probe%20Nest%20Of%20Missing", costClass: "closure",
    checks: { status: 200, notContains: ["nest depth exceeded", "Render error"] },
    oracle: "unknown NEST target renders the unknown-card view, page 200 (format.ts:476-483 buildUnknownNestCard; Ruby format/nest/fetch.rb new_card 'Card.fetch cardish, new:' — fetch miss does NOT raise).",
    note: "nest of a nonexistent card — must NOT error" },

  // ----- batch 07-cql-search-cards -----------------------------------------
  { id: "cql-control", batch: "07-cql-search-cards", path: "/All%20Scale%20Page%20Probe", costClass: "scan",
    checks: { status: 200 },
    oracle: "FINDING (measured): the search renders EMPTY on the worker — the CQL `match` modifier compiles to SQLite's REGEXP operator (src/cql/sqlite-regexp.ts:5-12), and workerd D1 cannot host the custom UDF, so executeQuery fails at run time; runSearch swallows the failure into [] (render.ts:1332-1334, 'search_error view is wave 3'). Locally under better-sqlite3 the UDF IS registered (registerSqliteRegexpFunction) and the card renders its list — verify-targeted-deck.test.ts:78-81 proves that side. So the corpus-targeted search surface is silently empty on Cloudflare. Check pins the measured workerd shape.",
    note: "valid search card — empty on D1 (REGEXP UDF unavailable), renders locally" },
  { id: "cql-not-json", batch: "07-cql-search-cards", path: "/Probe%20Bad%20CQL%20Not%20Json", costClass: "closure",
    checks: { status: 500, contains: ["Invalid JSON search query: this is not json"] },
    oracle: "PARITY: card-mod-search-0.20.0 set/abstract/cql_search.rb:29-34 raises Card::Error::BadQuery 'Invalid JSON search query: #{query}' (message byte-pinned in render/errors.ts:25-31); ours raises the same class+message — but at ROOT the Ruby decko error-page status is controller-layer (not in the prototype overlay); ours is a 500 (deploy/worker.ts:254-257).",
    note: "malformed CQL JSON inside a search card" },
  { id: "cql-empty", batch: "07-cql-search-cards", path: "/Probe%20Bad%20CQL%20Empty", costClass: "closure",
    checks: { status: 500, contains: ["can't run search with empty content"] },
    oracle: "PARITY of message: cql_search.rb:36-38 empty_query_error!. Same root-status caveat as cql-not-json.",
    note: "empty search content" },
  { id: "cql-unknown-key-swallowed", batch: "07-cql-search-cards", path: "/Probe%20CQL%20Unknown%20Key", costClass: "closure",
    checks: { status: 200 },
    oracle: "RUBY DIVERGENCE (finding): valid JSON with an unknown CQL key — Ruby's Card::Query raises Card::Error::BadQuery during query build (card-1.110.0 lib/card/query.rb); the port's runSearch CATCHES executeQuery failures and returns [] ('search_error view is wave 3', render.ts:1332-1334) -> empty list, page 200. Ruby: focal BadQuery -> error page. Measured local: 200.",
    note: "valid JSON, bogus CQL key — swallowed to empty" },
  { id: "cql-limit-zero", batch: "07-cql-search-cards", path: "/Probe%20CQL%20Limit%20Zero", costClass: "scan",
    checks: { status: 200 },
    oracle: "limit:0 = UNLIMITED in Ruby ('can be 0 or less to force no limit', cql_search.rb:43-44 comment) — but on the worker the `match` REGEXP failure (see cql-control) empties the result BEFORE the limit matters: measured 200 with a near-empty list. The REAL cost bomb on this surface is /api/query (batch 08), which reaches the scan without the UDF-dependent modifier.",
    note: "unlimited search card — emptied by the REGEXP gap on D1" },
  { id: "cql-limit-huge", batch: "07-cql-search-cards", path: "/Probe%20CQL%20Limit%20Huge", costClass: "scan",
    checks: { status: 200 },
    oracle: "same REGEXP-emptying as cql-limit-zero on the worker; on a UDF-capable runtime this clamps to the match set (2000 items).",
    note: "limit 999999 — same failure class on D1" },
  { id: "cql-referred-by-cycle", batch: "07-cql-search-cards", path: "/Probe%20CQL%20Referred%20By%20Cycle", costClass: "scan",
    checks: { status: 200 },
    oracle: "referred_to_by walks the reference index; the referred card is the self-loop card whose render is fine (only its own page nests). Measures search-over-cyclic-reference cost, not a render cycle.",
    note: "search reaching into a cycle member" },
  { id: "nest-of-bad-cql-500-vs-inline", batch: "07-cql-search-cards", path: "/Probe%20Nest%20Of%20Bad%20CQL", costClass: "closure",
    checks: { statusIn: [200, 500] },
    oracle: "MEASURED ENGINE NONDETERMINISM (finding): identical worker code and deck produced 500 five consecutive battery runs (runs 1-5: whole-page 'Invalid JSON search query' — the BadQuery thrown out of prepareSearches, render.ts:1254-1298) and 200 on run 6 (the nested search card was NOT enriched/typeCode-tagged before the BFS reached it, so no runSearch ran and the nest rendered as unknown; 4.8KB debug dump). The prepare-ordering hazard lives in render.ts (not this lane's file) — reported. This probe pins the OBSERVED ENVELOPE {200,500}; a remote result outside it means the remote engine's ordering differs from every local run. Ruby oracle for comparison: quiet_error rescues the nested BadQuery INLINE at 200 with the message embedded (render.rb:115-119, error.rb:75-85) — a THIRD shape, deterministic.",
    note: "readable root nesting a malformed search card — locally nondeterministic {200,500}" },

  // ----- batch 08-cql-api (direct executor, no render) ---------------------
  { id: "api-query-ok", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "scan",
    body: { cql: { match: "Scale Page", limit: 5 } },
    checks: { status: 500, contains: ["CQL execution failed"] },
    oracle: "MEASURED (finding): `match` compiles to the REGEXP operator; workerd D1 has no REGEXP UDF (src/cql/sqlite-regexp.ts:5-12 — registration is LocalSqliteDriver-only, and deploy/worker.ts registers nothing) -> run-time 'no such function: REGEXP' -> executeQuery throws a NON-CqlBadQuery error -> apiQuery's fallback 500 'CQL execution failed' (deploy/worker.ts:310-316). Every CQL statement using match/regex is 500 on the deployed surface while working locally.",
    note: "bounded match CQL — 500 on D1 (REGEXP UDF unavailable)" },
  { id: "api-query-limit-zero-full-scan", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "scan",
    body: { cql: { match: "Scale Page", limit: 0 } },
    checks: { status: 500, contains: ["CQL execution failed"] },
    oracle: "same REGEXP failure gates BEFORE the limit semantics; the unlimited-scan cost bomb is unreachable THROUGH match on D1 — but reachable through restriction-free scans (api-query-no-clause-full-deck, measured 1.88MB response).",
    note: "match+limit:0 — same REGEXP 500" },
  { id: "api-query-no-clause-full-deck", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "scan",
    body: { cql: { limit: 0 } },
    checks: { status: 200, json: { rowsAtLeast: 100 } },
    oracle: "no restrictions at all: whole non-trashed deck in one response.",
    note: "whole-deck scan + full row dump" },
  { id: "api-query-count", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "scan",
    body: { cql: { return: "count", match: "Scale Page" } },
    checks: { status: 500 },
    oracle: "return:count skips limit/order (execute.ts:126-138) but the match REGEXP failure still 500s (measured).",
    note: "count path — REGEXP 500 on D1" },
  { id: "api-query-bogus-key-400", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    body: { cql: { bogus_attribute: 1 } },
    checks: { status: 400, json: { errorContains: "bad CQL" } },
    oracle: "CqlBadQuery -> 400 (deploy/worker.ts:310-313). Ruby: Card::Error::BadQuery — the /api/query mapping is ours; Ruby controllers map BadQuery to 400-equivalent (unprocessable) — controller layer not in the overlay.",
    note: "bad CQL over the API is rejected, NOT swallowed (contrast cql-unknown-key-swallowed)" },
  { id: "api-query-found-by-refused", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    body: { cql: { found_by: "Probe Self Loop" } },
    checks: { status: 500 },
    oracle: "MEASURED (finding): found_by is refused at generate time (execute.ts:86-93 doc: 'the generator refuses them') but the refusal does NOT surface as CqlBadQuery -> the 400 bad-CQL branch (deploy/worker.ts:310-313) never fires; the client sees 500. A refused-by-design statement is indistinguishable from an engine crash on this surface.",
    note: "unported CQL modifier — 500 not 400 (measured)" },
  { id: "api-query-string-cql", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    body: { cql: "{\"return\":\"count\"}" },
    checks: { status: 200, json: { countAtLeast: 0 } },
    oracle: "string-encoded CQL accepted (deploy/worker.ts:294-301).",
    note: "JSON-encoded string form" },
  { id: "api-query-body-not-json", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    bodyRaw: "this is not json",
    checks: { status: 400, contains: ["not valid JSON"] },
    oracle: "deploy/worker.ts:287-291.",
    note: "garbage body" },
  { id: "api-query-array-rejected", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    body: { cql: [] },
    checks: { status: 400 },
    oracle: "arrays rejected (deploy/worker.ts:302-304) — no [[]] nesting bomb.",
    note: "array CQL rejected" },
  { id: "api-query-missing-cql", batch: "08-cql-api", method: "POST", path: "/api/query", costClass: "point",
    body: { query: {} },
    checks: { status: 400 },
    oracle: "deploy/worker.ts:302-304.",
    note: "wrong envelope key" },

  // ----- batch 09-large-content --------------------------------------------
  { id: "huge-content-100k", batch: "09-large-content", path: "/Probe%20Huge%20Content", costClass: "huge",
    checks: { status: 200, minOccurrences: [{ needle: "probe huge content paragraph", n: 100 }] },
    oracle: "60KB single-card body (D1 caps a single SQL statement at 100KB, so the crafted card targets 60KB) — point read + full render; rows-read stays point-class, response bytes are the cost.",
    note: "huge single-card content" },
  { id: "large-doc-16k", batch: "09-large-content", path: "/Large%20Doc%201", costClass: "huge",
    checks: { status: 200 },
    oracle: "targeted deck dimension 4 control.",
    note: "16KB targeted large card" },
];

// ---------------------------------------------------------------------------
// Scratch deck generator — the crafted cards the targeted deck lacks.
// Rows are INSERTs into `cards` following the SAME conventions as
// benchmarks/cf-scale/targeted-test-deck.mjs (2020 NULL-name junction rows;
// read rules wired as read_rule_class + read_rule_id; type ids from the
// targeted seed: Note=6, Pointer=7, Search cardtype card id=2).
//
// KEY RULE: the `key` column must equal the ENGINE's simpleKey of the name
// (src/card/name.ts:97-105), not the targeted generator's naive regex —
// every scratch name is chosen so the two agree (no trailing-s words, no
// inflection-rule suffixes), and the local run asserts every render probe
// finds its card, which fails loudly if the keys drift.
// ---------------------------------------------------------------------------

const SCRATCH_BASE_ID = 10000;

function sqlString(value) {
  return typeof value === "string"
    ? `'${value.replace(/'/g, "''")}'`
    : value === null || value === undefined
      ? "NULL"
      : String(value);
}

/** Faithful simpleKey for the scratch vocabulary (ASCII + é):
 *  underscore(name) -> replace non \\p{L}\\p{M}\\p{Nd}\\p{Pc}\\* with '_' ->
 *  split on _+ -> drop empties -> stableKey each -> join '_'.
 *  stableKey singularizes once with idempotence check; the scratch
 *  vocabulary contains no word any singular rule can alter (verified
 *  against src/card/name/inflect.ts:40-95), so identity is correct here. */
function engineKey(name) {
  const underscored = /[A-Z-]|::/.test(name)
    ? name.replace(/::/g, "/")
        .replace(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z\d])(?=[A-Z])/g, "_")
        .replace(/-/g, "_")
        .toLowerCase()
    : name;
  return underscored
    .replace(/[^\p{L}\p{M}\p{Nd}\p{Pc}*]+/gu, "_")
    .split(/_+/)
    .filter((p) => p !== "")
    .join("_");
}

export function buildScratchDeckRows() {
  const cards = []; // {id, name, key, leftId, rightId, typeId, content, ruleClass, ruleId, label}
  let nextId = SCRATCH_BASE_ID;
  const add = (c) => {
    const id = c.id ?? nextId++;
    cards.push({ id, typeId: 6, ...c, id });
    return id;
  };

  // cycles ------------------------------------------------------------------
  add({ name: "Probe Self Loop", content: "Self loop root.\n\n{{Probe Self Loop}}", label: "A includes A" });
  const cycleA = add({ name: "Probe Cycle A", content: "Cycle A body.\n\n{{Probe Cycle B}}", label: "2-cycle" });
  add({ name: "Probe Cycle B", content: "Cycle B body.\n\n{{Probe Cycle A}}", label: "2-cycle" });
  const c1 = add({ name: "Probe Cycle C1", content: "Cycle C1 body.\n\n{{Probe Cycle C2}}", label: "3-cycle" });
  add({ name: "Probe Cycle C2", content: "Cycle C2 body.\n\n{{Probe Cycle C3}}", label: "3-cycle" });
  add({ name: "Probe Cycle C3", content: "Cycle C3 body.\n\n{{Probe Cycle C1}}", label: "3-cycle" });

  // pointer to self -----------------------------------------------------------
  add({ name: "Probe Self Pointer", typeId: 7, content: "[[Probe Self Pointer]]", label: "pointer lists itself" });

  // self-referential search ---------------------------------------------------
  add({ name: "Probe Self Search", typeId: 2, content: `{"match":"Probe Self Search","limit":5}`, label: "search matches itself" });

  // deep chains ---------------------------------------------------------------
  // chain(prefix, size): root + size-1 links, root nests L1, Li nests L(i+1).
  const chain = (prefix, size, leafBody) => {
    let childName = `${prefix} L${size - 1}`;
    add({ name: childName, content: leafBody, label: `${prefix} leaf` });
    for (let i = size - 2; i >= 1; i -= 1) {
      const name = `${prefix} L${i}`;
      add({ name, content: `${prefix} L${i} nests its child.\n\n{{${childName}}}`, label: prefix });
      childName = name;
    }
    add({ name: `${prefix} Root`, content: `${prefix} root nests L1.\n\n{{${childName}}}`, label: `${prefix} root` });
  };
  chain("Probe Deep D20", 20, "probe deep d20 l19 leaf.");
  chain("Probe Deep D21", 21, "probe deep d21 l20 leaf.");
  chain("Probe Deep D44", 44, "probe deep d44 l43 leaf.");

  // denied parent + readable composed child ----------------------------------
  const ruleId = add({ name: "Probe Restricted Access Rule", content: "Rule card with no granting references — anonymous readers are denied.", label: "read rule" });
  const restrictedParent = add({
    name: "Probe Restricted Parent",
    content: "restricted parent body — must not leak.",
    ruleClass: "*self",
    ruleId,
    label: "denied parent",
  });
  add({ name: "Probe Child", content: "probe child body.", label: "readable child part" });
  const probeChildId = SCRATCH_BASE_ID + cards.findIndex((c) => c.name === "Probe Child");
  add({
    leftId: restrictedParent,
    rightId: probeChildId,
    content: "junction child body — readable via composed name.",
    label: "composed child of denied parent (NULL-name junction row)",
  });

  // nest helpers ---------------------------------------------------------------
  add({ name: "Probe Nest Of Restricted", content: "Readable wrapper nesting a denied card:\n\n{{Probe Restricted Parent}}", label: "denial inline" });
  add({ name: "Probe Nest Of Junction Child", content: "Readable wrapper nesting the composed child of a denied parent:\n\n{{Probe Restricted Parent+Probe Child}}", label: "composed child via nest (bypasses URL rewrite)" });
  add({ name: "Probe Nest Of Cycle", content: "Readable wrapper nesting the self loop:\n\n{{Probe Self Loop}}", label: "cycle inline vs page 500" });
  add({ name: "Probe Nest Of Missing", content: "Readable wrapper nesting a missing card:\n\n{{Probe Missing Nest Target}}", label: "unknown nest view" });
  add({ name: "Probe Nest Of Bad CQL", content: "Readable wrapper nesting a malformed search card:\n\n{{Probe Bad CQL Not Json}}", label: "BadQuery inline vs page 500" });

  // CQL search-card variants ---------------------------------------------------
  add({ name: "Probe Bad CQL Not Json", typeId: 2, content: "this is not json", label: "BadQuery: invalid JSON" });
  add({ name: "Probe Bad CQL Empty", typeId: 2, content: "", label: "BadQuery: empty content" });
  add({ name: "Probe CQL Unknown Key", typeId: 2, content: `{"bogus_modifier":"x"}`, label: "valid JSON, unknown CQL key" });
  add({ name: "Probe CQL Limit Zero", typeId: 2, content: `{"match":"Scale Page","limit":0}`, label: "unlimited search" });
  add({ name: "Probe CQL Limit Huge", typeId: 2, content: `{"match":"Scale Page","limit":999999}`, label: "huge-limit search" });
  add({ name: "Probe CQL Referred By Cycle", typeId: 2, content: `{"referred_to_by":"Probe Self Loop","limit":10}`, label: "search over cyclic reference" });

  // name-shape cards -------------------------------------------------------------
  add({ name: "Probe Slash/Name", content: "probe slash name body.", label: "literal slash in name" });
  add({ name: "Probe Café Card", content: "probe café card body.", label: "NFC é" });
  add({ name: "Probe 🚀 Card", content: "probe rocket card body.", label: "emoji" });
  add({ name: "Probe Trailing Dot.", content: "probe trailing dot body.", label: "trailing dot" });
  add({ name: "Probe Trailing Dash-", content: "probe trailing dash body.", label: "trailing dash" });
  add({ name: `Probe Long Name ${"a".repeat(500 - "Probe Long Name ".length)}`, content: "probe long name body.", label: "500-char name" });

  // huge content -------------------------------------------------------------------
  // 60KB, not 100KB: D1's max SQL statement length is 100KB, and this deck
  // must survive `wrangler d1 execute` on the remote window too (the first
  // 100KB draft failed locally with D1_ERROR statement too long: SQLITE_TOOBIG).
  add({
    name: "Probe Huge Content",
    content: "probe huge content paragraph. Dense synthetic text. ".repeat(1400).slice(0, 60_000),
    label: "60KB body (under the D1 100KB per-statement limit)",
  });

  return cards;
}

export function buildScratchDeckSql() {
  const cards = buildScratchDeckRows();
  const lines = [
    "-- adversarial-probe-scratch-deck.sql — crafted cards for the",
    "-- benchmarks/cf-scale adversarial probe battery (generated by",
    "-- benchmarks/cf-scale/adversarial-probes.mjs --write-scratch-deck).",
    "-- Apply AFTER db migrations + deploy/cf-scale-deck/seed.sql (type ids",
    "-- Note=6 / Pointer=7 / Search-cardtype id=2 come from that seed).",
    `-- ${cards.length} card rows, 0 reference rows (the read path parses`,
    "-- content; it does not read card_references).",
    "",
  ];
  for (const c of cards) {
    const key = c.name !== undefined && c.name !== null ? engineKey(c.name) : null;
    lines.push(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content) VALUES (` +
        `${sqlString(c.id)}, ${sqlString(c.name ?? null)}, ${sqlString(key)}, NULL, ` +
        `${sqlString(c.leftId ?? null)}, ${sqlString(c.rightId ?? null)}, NULL, ` +
        `'${STAMP}', '${STAMP}', 1, 1, ${sqlString(c.ruleClass ?? null)}, ${sqlString(c.ruleId ?? null)}, NULL, 0, ${sqlString(c.typeId ?? 6)}, ${sqlString(c.content ?? null)});`,
    );
  }
  lines.push("");
  return { sql: lines.join("\n"), count: cards.length };
}

// ---------------------------------------------------------------------------
// Probe execution
// ---------------------------------------------------------------------------

async function fireProbe(dispatch, probe) {
  const init = { method: probe.method ?? "GET" };
  if (probe.bodyRaw !== undefined) {
    init.body = probe.bodyRaw;
    init.headers = { "Content-Type": "application/json" };
  } else if (probe.body !== undefined) {
    init.body = JSON.stringify(probe.body);
    init.headers = { "Content-Type": "application/json" };
  }
  let response;
  let body = "";
  let threw = null;
  try {
    response = await dispatch(probe.path, init);
    body = await response.text();
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  const result = threw !== null
    ? { probe, threw, checks: {} }
    : { probe, status: response.status, bodyBytes: Buffer.byteLength(body), checks: evaluateChecks(probe.checks ?? {}, response.status, body) };
  // Keep the raw body of every probe whose checks did not all pass, plus
  // every 4xx/5xx — the mechanism evidence for the findings ledger (tmp/,
  // scratch space).
  if (
    !result.threw &&
    (Object.values(result.checks).some((v) => v === false) || response.status >= 400)
  ) {
    try {
      mkdirSync(DEBUG_DIR, { recursive: true });
      writeFileSync(join(DEBUG_DIR, `${probe.id}.txt`), `PATH: ${probe.path}\nSTATUS: ${response.status}\n\n${body.slice(0, 200_000)}`, "utf8");
    } catch { /* dump best-effort */ }
  }
  return result;
}

function evaluateChecks(checks, status, body) {
  const out = {};
  if (checks.statusIn !== undefined) out.statusOk = checks.statusIn.includes(status);
  else out.statusOk = status === checks.status;
  for (const needle of checks.contains ?? []) out[`contains:${needle.slice(0, 40)}`] = body.includes(needle);
  for (const needle of checks.notContains ?? []) out[`notContains:${needle.slice(0, 40)}`] = !body.includes(needle);
  for (const m of checks.minOccurrences ?? []) {
    let count = 0;
    let idx = 0;
    while ((idx = body.indexOf(m.needle, idx)) !== -1 && count < m.n) {
      count += 1;
      idx += m.needle.length;
    }
    out[`minOccurrences:${m.needle.slice(0, 30)}>=${m.n}`] = count >= m.n;
  }
  if (checks.json) {
    try {
      const parsed = JSON.parse(body);
      if (checks.json.rowsAtLeast !== undefined) out[`json.rows>=${checks.json.rowsAtLeast}`] = Array.isArray(parsed.rows) && parsed.rows.length >= checks.json.rowsAtLeast;
      if (checks.json.rowsAtMost !== undefined) out[`json.rows<=${checks.json.rowsAtMost}`] = Array.isArray(parsed.rows) && parsed.rows.length <= checks.json.rowsAtMost;
      if (checks.json.countEquals !== undefined) out[`json.count==${checks.json.countEquals}`] = parsed.count === checks.json.countEquals;
      if (checks.json.countAtLeast !== undefined) out[`json.count>=${checks.json.countAtLeast}`] = typeof parsed.count === "number" && parsed.count >= checks.json.countAtLeast;
      if (checks.json.errorContains !== undefined) out[`json.error~${checks.json.errorContains}`] = typeof parsed.error === "string" && parsed.error.includes(checks.json.errorContains);
    } catch {
      out["json.parse"] = false;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// /__metrics deltas (exact rows-read on production D1)
// ---------------------------------------------------------------------------

async function readMetrics(dispatch) {
  const response = await dispatch("/__metrics", { method: "GET" });
  if (response.status !== 200) return { available: false, status: response.status };
  const json = await response.json();
  return {
    available: true,
    sinceIso: json.sinceIso,
    requestCount: json.requestCount,
    queryCount: json.queryCount,
    rowsRead: json.rowsRead,
    rowsWritten: json.rowsWritten,
    errors: json.errors,
    requestsWithRowsReadEstimate: json.requestsWithRowsReadEstimate,
  };
}

function delta(after, before) {
  if (!after.available || !before.available) return { available: false };
  const rotated = after.sinceIso !== before.sinceIso;
  return {
    available: true,
    rotated,
    requests: rotated ? null : after.requestCount - before.requestCount,
    queries: rotated ? null : after.queryCount - before.queryCount,
    rowsRead: rotated ? null : after.rowsRead - before.rowsRead,
    rowsReadEstimateRequests: rotated
      ? null
      : after.requestsWithRowsReadEstimate - before.requestsWithRowsReadEstimate,
    rowsWritten: rotated ? null : after.rowsWritten - before.rowsWritten,
    errors: rotated ? null : after.errors - before.errors,
  };
}

// Modeled rows-read ranges per cost class — FALLBACK ONLY, used when a
// runtime hides meta.rows_read (measured: this machine's workerd surfaces
// it, so the local run reports exact counts instead). Deck sizes:
// ~2,530 targeted rows + ~115 scratch rows.
const DECK_ROWS = 2530;
const MODEL = {
  point: [2, 8], // one index seek + row, few statements
  closure: [DECK_ROWS, 3 * DECK_ROWS], // cold CTE: resolved seed scans cards + per-frontier seeks
  cycle: [DECK_ROWS, 4 * DECK_ROWS], // closure walk + deep nest chain fetches
  scan: [DECK_ROWS, 6 * DECK_ROWS], // match scans + item fetches
  huge: [2, 16], // point read, big payload
};

// ---------------------------------------------------------------------------
// Arithmetic block — the one-block window decision
// ---------------------------------------------------------------------------

function printArithmetic(batchStats, { mode, label }) {
  const rows = [];
  let totalRowsReadExact = 0;
  let totalRowsReadModeled = 0;
  let totalRequests = 0;
  let totalRowsWrittenExact = 0;
  let totalRowsWrittenEstimated = 0;
  console.log(`\n=== per-batch arithmetic (${mode}${label ? `, ${label}` : ""}) — limits: ${LIMIT_ROWS_READ.toLocaleString()} reads/day, ${LIMIT_REQUESTS.toLocaleString()} requests/day, ${LIMIT_ROWS_WRITTEN.toLocaleString()} writes/day, headroom ×${HEADROOM} ===`);
  console.log("batch                  probes  requests  rows-read (exact | modeled range)   %ofReadLimit(×1.2)  %ofReqLimit(×1.2)  rows-written   %ofWriteLimit(×1.2)  verdict");
  for (const b of batchStats) {
    const metricsOk = b.metrics?.available && !b.metrics.rotated;
    const measured = metricsOk ? b.metrics.rowsRead : null;
    const estReqs = metricsOk ? b.metrics.rowsReadEstimatedRequests ?? 0 : null;
    // Reads are EXACT only when every statement in the delta carried
    // meta.rows_read (est-req delta 0). MEASURED 2026-09-23/24: the workerd
    // D1 emulation boots inconsistently — some boots report rows_read per
    // statement (runs 5/6: 3.56-3.66M battery totals), others hide it and
    // the estimator zeroes them (run 7: 21.7K "exact" — a lie the est-req
    // flag exposes). When estimates are mixed in, the measured number is a
    // LOWER BOUND only; the budget math takes the conservative
    // max(measured, modeledHigh).
    const readsExact = metricsOk && measured !== null && estReqs === 0;
    const modeledLow = b.probes.filter((p) => p.costClass).reduce((s, p) => s + (MODEL[p.costClass]?.[0] ?? 0), 0);
    const modeledHigh = b.probes.filter((p) => p.costClass).reduce((s, p) => s + (MODEL[p.costClass]?.[1] ?? 0), 0);
    const requests = metricsOk ? b.metrics.requests : b.probeCount;
    const rowsRead = readsExact ? measured : modeledLow;
    const rowsReadHigh = readsExact ? measured : Math.max(measured ?? 0, modeledHigh);
    totalRowsReadExact += readsExact ? measured : 0;
    totalRowsReadModeled += rowsReadHigh;
    totalRequests += requests ?? 0;
    // WRITE SIDE: /__metrics rowsWritten delta. The battery itself is
    // SELECT-only (GET renders + POST /api/query with no write statements),
    // so the honest per-batch number is the measured delta — which the
    // estimator may report as 0-with-estimate-flags on runtimes that hide
    // meta.rows_written. Either way it is PRINTED, never omitted: the
    // 100k/day write cap is a first-class budget axis.
    // NaN-hardened: a runtime that hides meta.rows_written makes the delta
    // undefined-undefined = NaN, which IS typeof "number" — Number.isFinite
    // is the honest gate; NaN prints as an estimate, never as a number.
    const rowsWrittenRaw = metricsOk ? b.metrics.rowsWritten : undefined;
    const rowsWritten = Number.isFinite(rowsWrittenRaw) ? rowsWrittenRaw : 0;
    const rowsWrittenEstimated = !Number.isFinite(rowsWrittenRaw);
    totalRowsWrittenExact += rowsWrittenEstimated ? 0 : rowsWritten;
    if (rowsWrittenEstimated) totalRowsWrittenEstimated += 1;
    const readPct = ((rowsRead * HEADROOM) / LIMIT_ROWS_READ) * 100;
    const readPctHigh = ((rowsReadHigh * HEADROOM) / LIMIT_ROWS_READ) * 100;
    const reqPct = ((requests * HEADROOM) / LIMIT_REQUESTS) * 100;
    const writePct = ((rowsWritten * HEADROOM) / LIMIT_ROWS_WRITTEN) * 100;
    const worstPct = Math.max(readPctHigh, reqPct, writePct);
    const verdict =
      worstPct < 1 ? "OK" : worstPct < 10 ? "OK (<10%)" : "REVIEW";
    rows.push({
      batch: b.batch,
      probes: b.probeCount,
      requests,
      reads:
        readsExact
          ? `${measured.toLocaleString()} (exact)`
          : metricsOk && measured !== null
            ? `meas ${measured.toLocaleString()} + est-reqs ${estReqs} → ≤${rowsReadHigh.toLocaleString()} (conservative)`
            : `${rowsRead.toLocaleString()}–${rowsReadHigh.toLocaleString()} (modeled)`,
      readPct: readsExact ? readPct.toFixed(3) : `${readPct.toFixed(3)}–${readPctHigh.toFixed(3)}`,
      reqPct: reqPct.toFixed(4),
      writes: `${rowsWritten.toLocaleString()}${rowsWrittenEstimated ? " (est)" : ""}`,
      writePct: writePct.toFixed(4),
      verdict,
      rotated: b.metrics?.rotated === true,
    });
  }
  for (const r of rows) {
    console.log(
      `${r.batch.padEnd(22)} ${String(r.probes).padStart(6)} ${String(r.requests ?? "?").padStart(9)}  ${r.reads.padEnd(34)} ${String(r.readPct).padStart(12)}% ${String(r.reqPct).padStart(12)}%  ${r.writes.padStart(14)} ${String(r.writePct).padStart(12)}%  ${r.verdict}${r.rotated ? "  [isolate rotated: delta unreliable, probes-count shown]" : ""}`,
    );
  }
  const batteryReadsHigh = Math.max(totalRowsReadExact, totalRowsReadModeled);
  const batteryReqs = totalRequests;
  const batteryWrites = totalRowsWrittenExact; // measured; scratch-deck apply (115 rows) is separate
  const batteryReadPct = ((batteryReadsHigh * HEADROOM) / LIMIT_ROWS_READ) * 100;
  const batteryReqPct = ((batteryReqs * HEADROOM) / LIMIT_REQUESTS) * 100;
  const batteryWritePct = ((batteryWrites * HEADROOM) / LIMIT_ROWS_WRITTEN) * 100;
  const maxRepeatsReads = batteryReadsHigh === 0 ? Infinity : Math.floor(LIMIT_ROWS_READ / (HEADROOM * batteryReadsHigh));
  const maxRepeatsReqs = batteryReqs === 0 ? Infinity : Math.floor(LIMIT_REQUESTS / (HEADROOM * batteryReqs));
  const maxRepeatsWrites = batteryWrites === 0 ? Infinity : Math.floor(LIMIT_ROWS_WRITTEN / (HEADROOM * batteryWrites));
  const binding = Math.min(maxRepeatsReads, maxRepeatsReqs, maxRepeatsWrites);
  const bindingName =
    binding === maxRepeatsReads ? "ROWS-READ" : binding === maxRepeatsWrites ? "ROWS-WRITTEN" : "REQUESTS";
  console.log(
    `\nBATTERY TOTAL: ${batteryReqs.toLocaleString()} requests, reads ${totalRowsReadExact > 0 ? `${totalRowsReadExact.toLocaleString()} (exact)` : `≤ ${batteryReadsHigh.toLocaleString()} (modeled upper)`}, writes ${batteryWrites.toLocaleString()}${totalRowsWrittenEstimated > 0 ? ` (${totalRowsWrittenEstimated} batch deltas estimated — see est flags)` : " (exact)"}`,
  );
  console.log(
    `BATTERY ×${HEADROOM} headroom: ${batteryReadPct.toFixed(3)}% of the 5M daily reads, ${batteryReqPct.toFixed(4)}% of the 100k daily requests, ${batteryWritePct.toFixed(4)}% of the 100k daily writes.`,
  );
  console.log(
    `WRITE-SIDE NOTE: the battery is SELECT-only; the one-time scratch-deck apply adds ${scratchRowCount()} rows_written (${((scratchRowCount() * HEADROOM * 100) / LIMIT_ROWS_WRITTEN).toFixed(3)}% of the daily write cap with headroom) — counted once, not per repeat.`,
  );
  console.log(
    `Safe repeats of the full battery in one day within 20% headroom: reads → ${Number.isFinite(maxRepeatsReads) ? maxRepeatsReads.toLocaleString() : "unbounded"}, requests → ${Number.isFinite(maxRepeatsReqs) ? maxRepeatsReqs.toLocaleString() : "unbounded"}, writes → ${Number.isFinite(maxRepeatsWrites) ? maxRepeatsWrites.toLocaleString() : "unbounded"} → the binding limit is ${bindingName}.`,
  );
}

// ---------------------------------------------------------------------------
// Local boot (mirrors tests/deploy/deploy-worker-miniflare.test.ts)
// ---------------------------------------------------------------------------

/** The dispatcher the battery fires through. --remote: global fetch against
 *  the operator-named base URL. (--local dispatches through miniflare's
 *  dispatchFetch — real workerd, no TCP server: miniflare 5 exposes no
 *  startServer on the instance, and the repo's miniflare proof test uses
 *  dispatchFetch for exactly that reason.) */
function makeDispatch(baseUrl) {
  return async (path, init) => fetch(baseUrl + path, init);
}

async function bootLocal() {
  const { build } = await import("vite");
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const { CloudflareD1Adapter } = await import(
    pathToFileURL(join(REPO, "src", "server", "drivers", "d1.ts")).href,
  );
  const { splitSqlStatements } = await import(
    pathToFileURL(join(REPO, "tools", "migrate", "import.mjs")).href,
  );

  const WORKER_ENTRY = join(REPO, "deploy", "worker.ts");
  const CRYPTO_SHIM = join(REPO, "deploy", "shims", "node-crypto-shim.ts");
  const MIGRATIONS = join(REPO, "deploy", "migrations", "0001-schema.sql");
  const TARGETED_SEED = join(REPO, "deploy", "cf-scale-deck", "seed.sql");

  console.log("bundling deploy/worker.ts with vite (same alias table as deploy/wrangler.toml)…");
  const viteResult = await build({
    configFile: false,
    logLevel: "warn",
    resolve: { alias: [{ find: "node:crypto", replacement: CRYPTO_SHIM }] },
    ssr: { noExternal: true },
    build: {
      write: false,
      minify: false,
      target: "es2022",
      ssr: true,
      rollupOptions: { input: WORKER_ENTRY, output: { format: "esm", entryFileNames: "adversarial-probe-worker.mjs" } },
    },
  });
  const outputs = Array.isArray(viteResult) ? viteResult : [viteResult];
  const chunk = outputs[0].output.find((c) => c.type === "chunk");
  const bundle = chunk.code;
  if (!bundle.includes("class MetricsRecorder") && bundle.length < 10_000) {
    throw new Error("bundle suspiciously small — the engine graph did not come along");
  }

  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      d1Databases: { DB: "decko-adversarial-probe" },
    }),
  );
  const binding = await mf.getD1Database("DB");
  const adapter = new CloudflareD1Adapter(binding);

  const apply = async (sqlPath, splitter) => {
    const text = readFileSync(sqlPath, "utf8");
    const statements = splitter(text).filter(Boolean);
    // Chunked batch: one transaction per chunk (the shape
    // tests/deploy/deploy-worker-miniflare.test.ts uses for its seed).
    // 50 statements/chunk keeps every chunk far under any per-request size
    // cap while still collapsing ~3,400 round trips into ~70.
    for (let i = 0; i < statements.length; i += 50) {
      const chunk = statements.slice(i, i + 50).map((sql) => ({ sql, params: [] }));
      await adapter.batch(chunk);
    }
  };
  console.log("applying migrations 0001 + targeted cf-scale deck + scratch deck…");
  await apply(MIGRATIONS, splitSqlStatements);
  await apply(TARGETED_SEED, splitSqlStatements);
  await apply(SCRATCH_SQL_PATH, splitSqlStatements);

  const dispatch = async (path, init) =>
    mf.dispatchFetch(`https://decko-probe.test${path}`, init);
  return { mf, dispatch };
}

async function runBattery(dispatch, { metrics = true, only = null } = {}) {
  const batches = [];
  const allBatchNames = [...new Set(PROBES.map((p) => p.batch))];
  // --only b1,b2: run a subset. BUDGET REALITY (measured, local workerd D1
  // meta.rows_read): one FULL battery costs ~3.6M rows-read — over the
  // operator-authorized HALF of the 5M daily limit even before headroom —
  // so the remote window MUST run batches selectively.
  const batchNames = only
    ? allBatchNames.filter((b) => only.split(",").map((s) => s.trim()).includes(b))
    : allBatchNames;
  for (const batchName of batchNames) {
    const probes = PROBES.filter((p) => p.batch === batchName);
    const before = metrics ? await readMetrics(dispatch) : { available: false };
    const results = [];
    for (const probe of probes) {
      const r = await fireProbe(dispatch, probe);
      results.push(r);
      const checkValues = Object.values(r.checks ?? {});
      const allOk = !r.threw && checkValues.every(Boolean);
      console.log(
        `[${probe.id}] ${r.threw ? `THREW: ${r.threw}` : `status=${r.status} ${r.bodyBytes ? `${(r.bodyBytes / 1024).toFixed(1)}KB` : ""}`} ${allOk ? "check-ok" : `CHECKS: ${JSON.stringify(r.checks)}`}`,
      );
    }
    const after = metrics ? await readMetrics(dispatch) : { available: false };
    batches.push({ batch: batchName, probes: results, probeCount: probes.length, metrics: delta(after, before) });
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { mode: null, record: false, baseUrl: null, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-scratch-deck") args.mode = "write-scratch-deck";
    else if (a === "--local") args.mode = "local";
    else if (a === "--remote") args.mode = "remote";
    else if (a === "--record") args.record = true;
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--only") args.only = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mode === "write-scratch-deck") {
    const { sql, count } = buildScratchDeckSql();
    mkdirSync(dirname(SCRATCH_SQL_PATH), { recursive: true });
    writeFileSync(SCRATCH_SQL_PATH, sql, "utf8");
    console.log(`wrote ${SCRATCH_SQL_PATH} (${count} card rows)`);
    console.log(`write cost: ${count} rows_written ≈ ${((count / LIMIT_ROWS_WRITTEN) * 100).toFixed(2)}% of the 100k daily write budget (×${HEADROOM} headroom: ${(((count * HEADROOM) / LIMIT_ROWS_WRITTEN) * 100).toFixed(2)}%)`);
    console.log("remote apply (lead's window, NOT run here):");
    console.log(`  npx wrangler d1 execute decko-ts-demo-db --remote --file tmp/adversarial-probe-scratch-deck.sql`);
    return;
  }

  if (args.mode === "local") {
    let scratchReady = true;
    try {
      readFileSync(SCRATCH_SQL_PATH);
    } catch {
      scratchReady = false;
    }
    if (!scratchReady) {
      console.log("scratch deck missing — generating it first…");
      const { sql } = buildScratchDeckSql();
      mkdirSync(dirname(SCRATCH_SQL_PATH), { recursive: true });
      writeFileSync(SCRATCH_SQL_PATH, sql, "utf8");
    }
    const { mf, dispatch } = await bootLocal();
    try {
      const batches = await runBattery(dispatch, { only: args.only });
      printArithmetic(batches, { mode: "local/workerd", label: "rows-read = local workerd D1 meta.rows_read (real SQLite scan counts; production D1 may count differently)" });
      if (args.record) {
        const expectations = {
          generatedAt: new Date().toISOString(),
          howToRegenerate: "node benchmarks/cf-scale/adversarial-probes.mjs --local --record",
          decks: "deploy/cf-scale-deck/seed.sql + tmp/adversarial-probe-scratch-deck.sql over deploy/migrations/0001-schema.sql",
          surface: "deploy/worker.ts under miniflare workerd (deploy/wrangler.toml main)",
          limitContext: { rowsReadDaily: LIMIT_ROWS_READ, requestsDaily: LIMIT_REQUESTS, rowsWrittenDaily: LIMIT_ROWS_WRITTEN, headroom: HEADROOM },
          batches: batches.map((b) => ({
            batch: b.batch,
            metricsDelta: b.metrics,
            probes: b.probes.map((p) => ({
              id: p.probe.id,
              path: p.probe.path,
              method: p.probe.method ?? "GET",
              ...(p.probe.body !== undefined ? { body: p.probe.body } : {}),
              ...(p.probe.bodyRaw !== undefined ? { bodyRaw: p.probe.bodyRaw } : {}),
              costClass: p.probe.costClass,
              ...(p.probe.statusIn ? { statusIn: p.probe.statusIn } : {}),
              ...(p.probe.harnessSensitive ? { harnessSensitive: true } : {}),
              ...(p.threw !== undefined ? { threw: p.threw } : { status: p.status, checks: p.checks }),
              oracle: p.probe.oracle,
              note: p.probe.note,
            })),
          })),
        };
        writeFileSync(EXPECTATIONS_PATH, JSON.stringify(expectations, null, 2), "utf8");
        console.log(`\nwrote ${EXPECTATIONS_PATH}`);
      }
    } finally {
      await mf?.dispose();
    }
    return;
  }

  if (args.mode === "remote") {
    if (!args.baseUrl) throw new Error("--remote requires --base-url https://<worker>.workers.dev");
    const baseUrl = args.baseUrl.replace(/\/+$/, "");
    let expectations;
    try {
      expectations = JSON.parse(readFileSync(EXPECTATIONS_PATH, "utf8"));
    } catch {
      throw new Error(`missing/broken ${EXPECTATIONS_PATH} — run --local --record first`);
    }
    const expected = new Map();
    for (const b of expectations.batches) for (const p of b.probes) expected.set(p.id, p);

    console.log(`firing the battery at ${baseUrl} — the scratch deck MUST already be applied (see --write-scratch-deck)`);
    const batches = await runBattery(makeDispatch(baseUrl), { only: args.only });
    printArithmetic(batches, { mode: "remote/exact /__metrics deltas", label: baseUrl });

    console.log("\n=== remote vs local-expected diff ===");
    let diverged = 0;
    for (const b of batches) {
      for (const p of b.probes) {
        const exp = expected.get(p.probe.id);
        if (exp === undefined) {
          console.log(`DIVERGE [${p.probe.id}]: no local expectation recorded`);
          diverged += 1;
          continue;
        }
        const expAllOk = Object.values(exp.checks ?? {}).every(Boolean);
        const gotAllOk = !p.threw && Object.values(p.checks ?? {}).every(Boolean);
        const statusOk = !p.threw && (exp.statusIn ? exp.statusIn.includes(p.status) : p.status === exp.status);
        const tag = exp.harnessSensitive ? "HARNESS-SENSITIVE " : "";
        if (expAllOk && gotAllOk && statusOk) {
          console.log(`${tag}converge [${p.probe.id}] status=${p.status}`);
        } else {
          diverged += 1;
          console.log(
            `${tag}DIVERGE [${p.probe.id}] expected status=${exp.statusIn ? exp.statusIn.join("/") : exp.status} checksAllOk=${expAllOk}; got ${p.threw ? `THREW: ${p.threw}` : `status=${p.status} checks=${JSON.stringify(p.checks)}`}`,
          );
        }
      }
    }
    console.log(`\n${diverged === 0 ? "ALL CONVERGE" : `${diverged} DIVERGENCES`} (local-expected baseline: ${expectations.generatedAt})`);
    return;
  }

  console.log("usage: adversarial-probes.mjs --write-scratch-deck | --local [--record] | --remote --base-url URL");
  process.exitCode = args.mode === null ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
