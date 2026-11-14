// build-self-contained-test-fixtures.mjs — build the COMMITTED miniature
// test fixtures (test-corpus-shard-000000.jsonl, test-corpus-shard-000014.jsonl,
// test-corpus.sqlite3) from the machine-local anonymized corpus
// (fixtures/corpus/shard-000000.jsonl, fixtures/corpus/shard-000014.jsonl,
// benchmarks/corpus-v2/bench-corpus-v2.sqlite3 — all gitignored).
//
// WHAT THIS IS: the dev-time builder for the self-contained test fixtures.
// The COMMITTED artifacts it writes are what the test suite reads at run
// time; this script is needed only to REBUILD them (corpus refresh, new
// pinned entries). It never runs at test time and is never needed on a
// machine that only runs the suite.
//
// EXTRACTION CONTRACT (self-contained-tests lane, 2026-10-01):
// - Shard entries ship VERBATIM from the anonymized capture (the corpus
//   shards are sanitize_corpus.py output: random-string names, scrambled
//   content; the recapture precedent ships the same shape tracked —
//   fixtures/corpus-v2/recapture/). No entry is synthesized.
// - The sqlite ships the VERBATIM anonymized rows of the closure every
//   fixture-reading test needs: each shipped entry's side/type/reference
//   closure, the full *read rule universe, the full *structure rule
//   universe (139), the *help/*thanks/*layout/*default/*create/... rule
//   rows whose settings appear in shipped entry names, the role/members
//   read-party structure, and the holder-583 account subtree the auth
//   flows re-issue credentials against. Column convention matches
//   bench-corpus-v2 exactly (cards.`content`) so every consumer query is
//   unchanged; the auth fixtures' copy-time rename/top-up machinery runs
//   over it unchanged too.
// - Privacy: entries and rows are scanned for the standing scrub triggers
//   (email addresses, 8-digit dates combined with BD/BW initials, long
//   personal-name shapes) before write; the builder FAILS if any scan
//   hits so a human looks rather than bytes shipping silently. The
//   sanitized corpus's own anonymization (verified 2026-10-01: holder 583
//   name/email are scrambles) is the primary defense; this scan is the
//   belt-and-suspenders gate.
//
// Usage: node fixtures/test-corpus/build-self-contained-test-fixtures.mjs
//   [--corpus <path-to-bench-corpus-v2.sqlite3>]
//   [--shard-dir <path-to-fixtures/corpus>]
// Writes into this directory. Deterministic given identical inputs.

import {
  createHash,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, "node_modules", "better-sqlite3"));

// --- source resolution (builder-only; loud failure is correct) ----------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const CORPUS_DB = path.resolve(
  argValue("--corpus") ??
    process.env.DECKO_TS_CORPUS_V2 ??
    path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3"),
);
const SHARD_DIR = path.resolve(
  argValue("--shard-dir") ?? path.join(REPO_ROOT, "fixtures", "corpus"),
);
const SHARD_0 = path.join(SHARD_DIR, "shard-000000.jsonl");
const SHARD_14 = path.join(SHARD_DIR, "shard-000014.jsonl");

for (const p of [CORPUS_DB, SHARD_0, SHARD_14]) {
  if (!existsSync(p)) {
    console.error(`source missing: ${p}`);
    console.error("The builder reads the machine-local anonymized corpus; pass --corpus/--shard-dir.");
    process.exit(2);
  }
}

// --- the pinned-entry selectors (one line per consuming test) -----------
// permission-corpus-replay.test.ts DENIED_PICKS / READABLE_PICKS / DENIED_TITLE_PICKS
const PERM_REPLAY_IDS = [28, 33, 34, 41, 44, 95, 1, 15, 55, 66];
// help-popover-corpus-replay.test.ts PROOF_ENTRIES
const HELP_POPOVER_IDS = [53, 61, 79, 81, 82, 86, 241, 247, 252, 255, 256, 317, 318, 89];
// set-card-views-corpus-parity.test.ts TARGET_IDS
const SET_CARD_VIEW_IDS = [217, 268, 273, 294, 300, 302, 315];
// unknown-nest-corpus-replay.test.ts PROOF_ENTRIES
const UNKNOWN_NEST_IDS = [639, 640, 643, 1120];
// date-cardtype-view.test.ts corpus:1135 (+ every type_code=date entry below)
const DATE_PIN_IDS = [1135];
// image-cardtype-view.test.ts corpus:79 (type_code=image) + 1631
const IMAGE_PIN_IDS = [79, 1631];
// file-cardtype-view.test.ts corpus:808 + 3737
const FILE_PIN_IDS = [808, 3737];
// mini-bar-cols-setting.test.ts corpus:67
const MINI_BAR_IDS = [67];
// pointer-list-* tests: *home (77), *all+*layout (275), *star+*create (6551),
// 792 (open-view no-content-wrap)
const POINTER_LIST_IDS = [77, 275, 6551, 792];
// closed-view-structure-content-bench.test.ts target card (by name)
const CLOSED_VIEW_BENCH_NAME = "ynxkmsesggismplqulbsud";

const EXPLICIT_IDS = new Set([
  ...PERM_REPLAY_IDS,
  ...HELP_POPOVER_IDS,
  ...SET_CARD_VIEW_IDS,
  ...UNKNOWN_NEST_IDS,
  ...DATE_PIN_IDS,
  ...IMAGE_PIN_IDS,
  ...FILE_PIN_IDS,
  ...MINI_BAR_IDS,
  ...POINTER_LIST_IDS,
]);

const DENIAL_LABEL_RE = /Sorry, you don't have permission \(([a-z_]*)\)/g;
const DENIAL_SPAN_CAP = 20; // bound the census sample (view-perms-table)
// structure-corpus-replay.test.ts samples 14 entries from the template-pending
// set with a deterministic stride; the builder replicates that exact selection
// so the committed shard carries precisely the entries the default run replays.
const STRUCTURE_SAMPLE = 14;
// wave E cross-reference: set-card views owns these ids' coverage
const OWNED_BY_SET_CARD_VIEWS = new Set([217, 268, 273, 294, 300, 302, 315]);

// --- load shard-000000, select entries -----------------------------------
const lines0 = readFileSync(SHARD_0, "utf8").split("\n").filter((l) => l.trim() !== "");
const shard0 = lines0.map((l) => JSON.parse(l));

const db = new Database(CORPUS_DB, { readonly: true });

// *structure template contents (the structure-corpus-replay predicate)
const structureTemplateContents = () => {
  const rows = db
    .prepare(
      `SELECT rules.content AS c FROM cards rules ` +
        `JOIN cards settings ON rules.right_id = settings.id ` +
        `WHERE settings.name = '*structure' AND rules.trash = 0 AND rules.content IS NOT NULL`,
    )
    .all();
  return new Set(rows.map((r) => r.c));
};

const templates = structureTemplateContents();

/** The test's own selection: template-pending entries with non-denied,
 *  non-CAPTURE_ERROR views, minus the wave-E set, then the stride sample. */
function structureSampleEntries() {
  const entries = [];
  for (const entry of shard0) {
    if (entry.record === undefined) continue;
    if (OWNED_BY_SET_CARD_VIEWS.has(entry.id)) continue;
    if (!templates.has(entry.record.content)) continue;
    const views = {};
    for (const [view, html] of Object.entries(entry.views ?? {})) {
      if (html.startsWith('<span class="denied"')) continue;
      if (html.startsWith("CAPTURE_ERROR")) continue;
      views[view] = html;
    }
    if (Object.keys(views).length > 0) {
      entries.push({ id: entry.id, name: entry.name, views });
    }
  }
  if (entries.length <= STRUCTURE_SAMPLE) return entries;
  const stride = Math.floor(entries.length / STRUCTURE_SAMPLE);
  const out = [];
  for (let i = 0; i < entries.length && out.length < STRUCTURE_SAMPLE; i += stride) {
    out.push(entries[i]);
  }
  return out;
}

const structureSampleIds = new Set(structureSampleEntries().map((e) => e.id));
const selected = [];
const denialEntries = [];
for (const entry of shard0) {
  const explicit = EXPLICIT_IDS.has(entry.id);
  const isDate = entry.record?.type_code === "date";
  const isTemplate = structureSampleIds.has(entry.id);
  const isBench = entry.name === CLOSED_VIEW_BENCH_NAME;
  if (explicit || isDate || isTemplate || isBench) selected.push(entry);
  else {
    const views = Object.values(entry.views ?? {});
    if (views.some((v) => DENIAL_LABEL_RE.test(v))) {
      if (denialEntries.length < DENIAL_SPAN_CAP) denialEntries.push(entry);
    }
    DENIAL_LABEL_RE.lastIndex = 0;
  }
}
const entryByName = new Map(selected.map((e) => [e.name, e]));
const benchEntry = entryByName.get(CLOSED_VIEW_BENCH_NAME);
if (benchEntry === undefined) {
  console.error(`closed-view bench entry ${CLOSED_VIEW_BENCH_NAME} not found in shard-000000`);
  process.exit(2);
}
// denial-span census entries (view-perms-table): prefer entries carrying the
// span so the committed scan still sees a non-empty label set of exactly read.
const selectedIds = new Set(selected.map((e) => e.id));
for (const d of denialEntries) {
  if (!selectedIds.has(d.id)) {
    selected.push(d);
    selectedIds.add(d.id);
  }
}

// shard-000014: junction-depth entry 19334
const lines14 = readFileSync(SHARD_14, "utf8").split("\n").filter((l) => l.trim() !== "");
const entry19334 = lines14.map((l) => JSON.parse(l)).find((e) => e.id === 19334);
if (entry19334 === undefined) {
  console.error("junction-depth entry 19334 not found in shard-000014");
  process.exit(2);
}

// --- DB closure -----------------------------------------------------------
const CORPUS_ROW_COLUMNS =
  `id, name, key, codename, left_id, right_id, creator_id, updater_id, ` +
  `read_rule_class, read_rule_id, trash, type_id, content, created_at, updated_at`;

const rows = new Map();
const fetchRows = (idList) => {
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500);
    const fetched = db
      .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk);
    for (const row of fetched) if (!rows.has(row.id)) rows.set(row.id, row);
  }
};

const codenameId = (code) =>
  db.prepare("SELECT id FROM cards WHERE codename = ? AND trash = 0").get(code)?.id ?? null;

// 1. seed ids: shipped entries (by id AND by name — junction sides the
//    capture recorded under ids the shard line may not carry).
const ids = new Set(selectedIds);
ids.add(19334);
for (const entry of selected) {
  const byName = db.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(entry.name);
  if (byName !== undefined) ids.add(byName.id);
}
// holder 583 account subtree (auth flows)
ids.add(583);
// codename cards the permission/rule/render machinery resolves
const CODENAMES = [
  "anyone", "anyone_signed_in", "anonymous", "read", "set", "setting", "user",
  "account", "email", "password", "salt", "status", "layout", "default_layout",
  "title", "type", "structure", "right", "default", "self", "all", "all_plus",
  "help", "sidebar", "rstar", "skin", "create", "thanks", "members", "role",
  "content_option_view", "basic", "basic_card", "rich_text", "pointer", "list",
  "toggle", "html", "cardtype", "date", "image", "file", "number", "phrase",
  "search_type", "signup_success", "link", "plain_text", "role_dropdown",
  // page-chrome head path (page.ts headContent -> globalSettingContent
  // reads these as :codename marks; the registry must answer them)
  "favicon", "ace", "tiny_mce", "head", "style", "script", "home",
];
for (const c of CODENAMES) {
  const id = codenameId(c);
  if (id !== null) ids.add(id);
}
// 2. every SETTING whose name appears on a shipped entry: ALL its rule rows
//    + their left set cards (help popovers, layout chrome, bar cols, captcha,
//    input type, autoname, content options, *create rules, ...).
const settingNames = new Set();
for (const entry of selected) {
  const parts = entry.name.split("+");
  for (const part of parts) if (part.startsWith("*")) settingNames.add(part);
}
settingNames.add("*read");
settingNames.add("*structure");
settingNames.add("*default");
settingNames.add("*layout");
settingNames.add("*help");
settingNames.add("*title");
settingNames.add("*create");
const settingIds = new Set();
for (const name of settingNames) {
  const settingId = db.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(name)?.id;
  if (settingId === undefined) continue;
  ids.add(settingId);
  settingIds.add(settingId);
  const ruleRows = db
    .prepare("SELECT id, left_id FROM cards WHERE right_id = ? AND trash = 0")
    .all(settingId);
  for (const rule of ruleRows) {
    ids.add(rule.id);
    if (rule.left_id !== null) ids.add(rule.left_id);
  }
}
// 3. role/members read-party structure for the signin union math
const roleId = codenameId("role");
const membersId = codenameId("members");
if (roleId !== null && membersId !== null) {
  const roleLists = db
    .prepare("SELECT id, left_id FROM cards WHERE right_id = ? AND trash = 0")
    .all(membersId);
  for (const list of roleLists) {
    ids.add(list.id);
    if (list.left_id !== null) ids.add(list.left_id);
  }
}
// 4. *account junction + email/password/salt/status children for holder 583
const authAndLayoutIds = new Set([583]);
{
  const accountId = codenameId("account");
  const junction = db
    .prepare("SELECT id FROM cards WHERE left_id = 583 AND right_id = ? AND trash = 0")
    .get(accountId);
  if (junction !== undefined) {
    ids.add(junction.id);
    authAndLayoutIds.add(junction.id);
    for (const code of ["email", "password", "salt", "status"]) {
      const fieldId = codenameId(code);
      if (fieldId === null) continue;
      const child = db
        .prepare("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0")
        .get(junction.id, fieldId);
      if (child !== undefined) {
        ids.add(child.id);
        authAndLayoutIds.add(child.id);
      }
    }
  }
}
// 5. Default Layout + every *layout rule row (the auth fixtures restore the
//    layout identity in their copies; the rows must exist to restore)
{
  const layoutSettingId = codenameId("layout");
  const defaultLayoutId = codenameId("default_layout");
  if (defaultLayoutId !== null) {
    ids.add(defaultLayoutId);
    authAndLayoutIds.add(defaultLayoutId);
  }
  if (layoutSettingId !== null) {
    for (const rule of db
      .prepare("SELECT id, left_id FROM cards WHERE right_id = ? AND trash = 0")
      .all(layoutSettingId)) {
      ids.add(rule.id);
      if (rule.left_id !== null) ids.add(rule.left_id);
      // the layout TARGET cards (Default Layout et al) keep their bodies
      const targetId = rule.left_id;
      if (targetId !== null) authAndLayoutIds.add(targetId);
    }
  }
}
// 5.5 CONTENT-NEST closure pass. A kept entry's rendered content can nest
//    other cards (`{{name}}` / `{{name|view}}` — the engine resolves the
//    nest by NAME at render time). A nest target missing from the shard
//    subset leaves the replay with a rendered gap where the oracle pins
//    the nested bytes (round-7 proof: junction-depth corpus:19334 nests
//    its depth-3 child 19350; permission-replay corpus:581 nests 958 —
//    both only through content, invisible to the sides+types/reference
//    closure). Rule: transitively include every card referenced from kept
//    content — as a row with content kept, AND as a POINTER LINE in the
//    same shard file as the host entry, because every fixture-reading
//    test seeds the shard LINE ids (permission-corpus-seeding.ts seeds
//    readShardLines() ids; junction-depth-corpus-replay.test.ts seeds
//    its own line ids) and then only walks sides+type_id
//    (permission-corpus-seeding.ts:177-187). Pointer lines carry
//    {id, name} from the verbatim corpus row — no oracle bytes, no
//    record — so no replay test can accidentally pin a nest target's
//    views and the structure-template predicate
//    (structure-corpus-replay.test.ts proofEntries: `record === undefined`
//    skip) cannot classify them. Unknown nest names (no live row) stay
//    unseeded: Ruby rendered them as unknown in the capture, and both
//    corpora lack the row identically.
const nestPointerLines = { shard0: [], shard14: [] };
const nestContentKeep = new Set(); // nest targets: their bodies render inside the host's captured bytes
{
  const NEST_RE = /\{\{([^}]+)\}\}/g;
  const nestNames = (content) =>
    [...content.matchAll(NEST_RE)]
      .map((m) => m[1].split("|")[0].trim())
      .filter((n) => n !== "");
  const contentSeen = new Set();
  const nestQueue = []; // { row, shard }
  const nestFetch = `SELECT id, name, key, content FROM cards WHERE id = ? AND trash = 0`;
  const enqueueId = (id, shard) => {
    const row = db.prepare(nestFetch).get(id);
    if (row !== undefined && row.content !== null && !contentSeen.has(row.id)) {
      contentSeen.add(row.id);
      nestQueue.push({ row, shard });
    }
  };
  for (const entry of selected) {
    enqueueId(entry.id, "shard0");
    const byName = db.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(entry.name);
    if (byName !== undefined) enqueueId(byName.id, "shard0");
  }
  enqueueId(19334, "shard14");
  const nestLineIds = { shard0: new Set(), shard14: new Set() };
  while (nestQueue.length > 0) {
    const { row, shard } = nestQueue.shift();
    for (const nm of nestNames(row.content)) {
      const target =
        db.prepare("SELECT id, name, content FROM cards WHERE name = ? AND trash = 0").get(nm) ??
        db.prepare("SELECT id, name, content FROM cards WHERE key = ? AND trash = 0").get(nm.toLowerCase());
      if (target === undefined) continue;
      // Already shipped as a full capture entry (e.g. a proof entry another
      // entry nests): the verbatim line seeds the id — never emit a
      // duplicate pointer line for the same shard file.
      if (!selectedIds.has(target.id) && !nestLineIds[shard].has(target.id)) {
        nestLineIds[shard].add(target.id);
        nestPointerLines[shard].push({ id: target.id, name: target.name });
      }
      ids.add(target.id);
      nestContentKeep.add(target.id);
      if (target.content !== null && !contentSeen.has(target.id)) {
        contentSeen.add(target.id);
        nestQueue.push({ row: target, shard });
      }
    }
  }
}
// 5.6 SET-CARD RULE CLOSURE. The set-card-views consumer
//    (tests/card/render/set-card-views-corpus-parity.test.ts:98-151)
//    seeds each selector set card with a self+children+sides fixpoint
//    walk (children = rows with left_id = id — rule rows hanging on a
//    set, set-member cards of a set pattern), plus the same walk over
//    the set-type *help rule universe. The sides+types closure in step 6
//    has no children dimension, so this walk is replicated here
//    verbatim against the same corpus DB: the committed miniature must
//    carry every row that walk visits, or the engine's
//    hasExistingRuleFor memo (views.ts:3288-3290, bar_view.rb:11
//    `voo.hide :bar_nav unless existing_rule_card`) finds no stored rule
//    and renders hide:["bar_nav"] where the oracle pins home_view:"bar".
const setClosureWalkIds = new Set(); // every row the set-card-views walk visits (shape/permission math)
{
  const walkSetClosure = (seedIds) => {
    const visited = new Set(seedIds);
    const queue = [...seedIds];
    while (queue.length > 0) {
      const id = queue.shift();
      const walked = db
        .prepare("SELECT id, left_id, right_id, type_id FROM cards WHERE (id = ? OR left_id = ?) AND trash = 0")
        .all(id, id);
      for (const row of walked) {
        for (const side of [row.id, row.left_id, row.right_id, row.type_id]) {
          if (side !== null && !visited.has(side)) {
            visited.add(side);
            queue.push(side);
          }
        }
      }
    }
    return visited;
  };
  const setWalkIds = walkSetClosure(SET_CARD_VIEW_IDS);
  const setTypeId = codenameId("set");
  const settingTypeId = codenameId("setting");
  if (setTypeId !== null && settingTypeId !== null) {
    const helpRules = db
      .prepare(
        `SELECT r.id, r.left_id, r.right_id, r.type_id FROM cards r ` +
          `JOIN cards sets ON r.left_id = sets.id ` +
          `JOIN cards settings ON r.right_id = settings.id ` +
          `WHERE sets.type_id = ? AND settings.type_id = ? ` +
          `AND settings.codename = 'help' AND r.trash = 0 ` +
          `AND sets.trash = 0 AND settings.trash = 0`,
      )
      .all(setTypeId, settingTypeId);
    for (const rule of helpRules) {
      setWalkIds.add(rule.id);
      const seeds = [rule.left_id, rule.right_id, rule.type_id].filter((x) => x !== null);
      for (const id of walkSetClosure(seeds)) setWalkIds.add(id);
    }
  }
  for (const id of setWalkIds) {
    ids.add(id);
    setClosureWalkIds.add(id);
  }
}
// 5.7 FULL RULE UNIVERSE + SETTING CATALOG. Rule lookups walk candidate
//    chains in pattern-precedence order (src/card/rules/lookup.ts findRule
//    -> ruleNamesForCard) and take the first candidate that exists. A
//    missing CANDIDATE is harmless (the walk falls through), but a missing
//    WINNER flips the engine's existing-rule verdict: preloadVirtualRule-
//    Verdicts (src/card/render.ts:3622-3691) memoizes findRule's result
//    and prepareBar (views.ts:3288-3290, bar_view.rb:11 `voo.hide
//    :bar_nav unless existing_rule_card`) renders hide:["bar_nav"] where
//    the capture pins home_view:"bar" (the set-card-views nav's *head and
//    sibling bars). Duplicating the engine's pattern walk in the builder
//    would couple the fixture bytes to engine internals; shipping every
//    rule row SUBSUMES all chains — the winner in the corpus deck is by
//    definition a stored rule row, so both corpora resolve identical
//    winners for identical candidates. The Setting-type catalog ships
//    with it: the rules nav enumerates settings per group
//    (visibleSettingsForGroup), and a setting card missing from the mini
//    but present in the private deck diverges the same nav.
const ruleRowIds = new Set();
{
  const settingTypeId = codenameId("setting");
  if (settingTypeId !== null) {
    const allRuleRows = db
      .prepare(
        `SELECT r.id, r.left_id FROM cards r JOIN cards s ON r.right_id = s.id ` +
          `WHERE s.type_id = ? AND r.trash = 0`,
      )
      .all(settingTypeId);
    for (const r of allRuleRows) {
      ids.add(r.id);
      if (r.left_id !== null) ids.add(r.left_id);
      ruleRowIds.add(r.id);
    }
    for (const row of db
      .prepare("SELECT id FROM cards WHERE type_id = ? AND trash = 0")
      .all(settingTypeId)) {
      ids.add(row.id);
    }
  }
}
// 6. side/type closure to fixpoint + reference referees
const closeClosure = () => {
  for (let round = 0; round < 40; round++) {
    const need = [];
    for (const row of rows.values()) {
      for (const side of [row.left_id, row.right_id]) {
        if (side !== null && !rows.has(side)) need.push(side);
      }
      if (row.type_id !== null && !rows.has(row.type_id)) need.push(row.type_id);
    }
    for (let i = 0; i < [...rows.keys()].length; i += 500) {
      const chunk = [...rows.keys()].slice(i, i + 500);
      const refIds = db
        .prepare(
          `SELECT DISTINCT referee_id FROM card_references WHERE referee_id IS NOT NULL ` +
            `AND referer_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk);
      for (const r of refIds) if (!rows.has(r.referee_id)) need.push(r.referee_id);
    }
    const fresh = need.filter((id) => !rows.has(id));
    if (fresh.length === 0) break;
    fetchRows([...new Set(fresh)]);
    for (const id of fresh) ids.add(id);
  }
};
fetchRows([...ids]);
closeClosure();

// 7. card_references: every row whose referer is shipped (verbatim)
const refRows = [];
{
  const idList = [...rows.keys()];
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500);
    const batch = db
      .prepare(
        `SELECT id, referer_id, referee_key, referee_id, ref_type, is_present ` +
          `FROM card_references WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ORDER BY id`,
      )
      .all(...chunk);
    refRows.push(...batch);
  }
}

// 8. CONTENT TRIM: byte-parity replays need content only for rows the
//    engine RENDERS: the shipped entries themselves, everything reachable
//    through card_references from them (nested render targets), the rule
//    rows, the auth subtree, and the layout chrome. Side/type-closure-only
//    rows (set patterns' left targets, type cards, junction sides) exist
//    for the permission/shape math and render nothing — their content
//    (the corpus's multi-hundred-KB anonymized bodies) is nulled so the
//    committed miniature stays small. A replay whose captured bytes DID
//    embed such a body fails loudly in the suite and names the entry.
const contentKeep = new Set();
for (const entry of selected) {
  const byId = entry.id;
  contentKeep.add(byId);
  const byName = db.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(entry.name);
  if (byName !== undefined) contentKeep.add(byName.id);
}
{
  // forward reference BFS from the shipped entries
  const frontier = [...contentKeep];
  while (frontier.length > 0) {
    const chunk = frontier.splice(0, 500);
    const refereeIds = db
      .prepare(
        `SELECT DISTINCT referee_id FROM card_references WHERE referee_id IS NOT NULL ` +
          `AND referer_id IN (${chunk.map(() => "?").join(",")})`,
      )
      .all(...chunk);
    for (const r of refereeIds) {
      if (r.referee_id !== null && rows.has(r.referee_id) && !contentKeep.has(r.referee_id)) {
        contentKeep.add(r.referee_id);
        frontier.push(r.referee_id);
      }
    }
  }
  // junction descendants: a nest like <entry>+<child>+<grandchild> resolves
  // through the id-pair lexicon (left_id chains), NOT card_references — a
  // depth-3 child pulled in only by the side closure still has its body
  // rendered inside the entry's captured bytes. Keep content for every card
  // whose left_id transitively chains from a shipped entry.
  const descFrontier = [...selectedIds, 19334];
  const descendants = new Set();
  while (descFrontier.length > 0) {
    const chunk = descFrontier.splice(0, 500);
    const children = db
      .prepare(
        `SELECT id FROM cards WHERE left_id IN (${chunk.map(() => "?").join(",")})`,
      )
      .all(...chunk);
    for (const c of children) {
      if (rows.has(c.id) && !descendants.has(c.id)) {
        descendants.add(c.id);
        contentKeep.add(c.id);
        descFrontier.push(c.id);
      }
    }
  }
}
// rule rows (any card hanging off a setting of interest) keep content
for (const row of rows.values()) {
  if (row.right_id !== null && settingIds.has(row.right_id)) contentKeep.add(row.id);
}
// nest targets keep content (rendered inside the host entry's captured bytes)
for (const id of nestContentKeep) contentKeep.add(id);
// rule rows keep content (the full 5.7 universe): the Rules section / rule
// bars render the rule's stored value; a nulled value renders an empty bar
// where the capture shows the rule. 2030 rows, ~76 KB of content in this
// corpus. Set-member and shape-only rows stay trimmed — only the
// permission/shape math reads them.
for (const id of ruleRowIds) contentKeep.add(id);
// auth subtree + layout chrome keep content
for (const id of authAndLayoutIds) contentKeep.add(id);

let contentTrimmed = 0;
for (const row of rows.values()) {
  if (!contentKeep.has(row.id) && row.content !== null) {
    row.content = null;
    contentTrimmed++;
  }
}

// 9. CREDENTIAL SHAPE NORMALIZATION: the password-shape pin
//    (tests/card/auth/corpus-password-format.test.ts) asserts every stored
//    +*password digest is a 40-char lowercase salted-SHA-1 hex and every
//    +*salt is 40-char — Ruby's formula (card-1.110.0 lib/card/auth.rb:36-39).
//    The anonymizer scrambles those contents; re-issue them in the MINI DB
//    only (never in any corpus file) with deterministic generated values so
//    the committed rows carry the pinned shape. Values derive from sha256 of
//    the row id — no dictionary content, stable rebuilds.
{
  const passwordId = codenameId("password");
  const saltId = codenameId("salt");
  const statusId = codenameId("status");
  const hex = (n) => createHash("sha256").update(`decko-test-corpus-cred-${n}`).digest("hex");
  for (const row of rows.values()) {
    if (row.trash !== 0) continue;
    if (saltId !== null && row.right_id === saltId) {
      row.content = hex(`salt-${row.id}`).slice(0, 40);
    }
  }
  for (const row of rows.values()) {
    if (row.trash !== 0) continue;
    if (passwordId !== null && row.right_id === passwordId) {
      const saltRow = [...rows.values()].find(
        (r) => r.left_id === row.left_id && r.right_id === saltId,
      );
      const salt = saltRow?.content ?? hex(`salt-fallback-${row.id}`).slice(0, 40);
      row.content = createHash("sha1").update(`${salt}--${hex(`pw-${row.id}`)}--`).digest("hex");
    }
    if (statusId !== null && row.right_id === statusId) {
      row.content = "active";
    }
  }
}

// --- privacy scans (fail loud, never ship silently) -----------------------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EIGHT_DIGIT = /\b\d{8}\b/;
const BDBW = /\b(BD|BW)\b/;
let scanHits = [];
for (const row of rows.values()) {
  const c = row.content ?? "";
  if (EMAIL_RE.test(c)) scanHits.push(`email-like content in card ${row.id} (${row.name})`);
  if (EIGHT_DIGIT.test(c) && BDBW.test(c)) {
    scanHits.push(`8-digit-date+BD/BW shape in card ${row.id} (${row.name})`);
  }
}
for (const entry of [...selected, entry19334, ...nestPointerLines.shard0, ...nestPointerLines.shard14]) {
  const blob = JSON.stringify(entry);
  if (EMAIL_RE.test(blob)) scanHits.push(`email-like bytes in shard entry ${entry.id}`);
  if (/\b\d{8}\b/.test(blob) && /\b(BD|BW)\b/.test(blob)) {
    scanHits.push(`8-digit-date+BD/BW shape in shard entry ${entry.id}`);
  }
}
if (scanHits.length > 0) {
  console.error("PRIVACY SCAN HITS (builder refusing to write):");
  for (const h of scanHits) console.error("  " + h);
  process.exit(3);
}

// --- write artifacts -------------------------------------------------------
const outShard0 = [...selected, ...nestPointerLines.shard0]
  .slice()
  .sort((a, b) => a.id - b.id)
  .map((e) => JSON.stringify(e))
  .join("\n");
writeFileSync(path.join(HERE, "test-corpus-shard-000000.jsonl"), outShard0 + "\n");
const outShard14 = [entry19334, ...nestPointerLines.shard14]
  .slice()
  .sort((a, b) => a.id - b.id)
  .map((e) => JSON.stringify(e))
  .join("\n");
writeFileSync(path.join(HERE, "test-corpus-shard-000014.jsonl"), outShard14 + "\n");

const OUT_DB = path.join(HERE, "test-corpus.sqlite3");
for (const suffix of ["", "-wal", "-shm"]) {
  const p = OUT_DB + suffix;
  if (existsSync(p)) require("node:fs").rmSync(p);
}
const out = new Database(OUT_DB);
out.exec(`
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  name TEXT,
  key TEXT,
  codename TEXT,
  left_id INTEGER,
  right_id INTEGER,
  creator_id INTEGER,
  updater_id INTEGER,
  read_rule_class TEXT,
  read_rule_id INTEGER,
  trash INTEGER DEFAULT 0,
  type_id INTEGER,
  content TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE card_references (
  id INTEGER PRIMARY KEY,
  referer_id INTEGER,
  referee_key TEXT,
  referee_id INTEGER,
  ref_type TEXT,
  is_present INTEGER
);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX idx_cards_left ON cards(left_id);
CREATE INDEX idx_cards_right ON cards(right_id);
CREATE INDEX idx_cards_codename ON cards(codename);
CREATE INDEX idx_refs_referer ON card_references(referer_id);
CREATE INDEX idx_refs_referee ON card_references(referee_id);
`);
{
  const insert = out.prepare(
    `INSERT INTO cards (${CORPUS_ROW_COLUMNS}) VALUES ` +
      `(${CORPUS_ROW_COLUMNS.split(", ").map(() => "?").join(",")})`,
  );
  const sorted = [...rows.values()].sort((a, b) => a.id - b.id);
  out.transaction(() => {
    for (const row of sorted) {
      insert.run(
        row.id, row.name, row.key, row.codename, row.left_id, row.right_id,
        row.creator_id, row.updater_id, row.read_rule_class, row.read_rule_id,
        row.trash, row.type_id, row.content, row.created_at, row.updated_at,
      );
    }
  })();
  const insertRef = out.prepare(
    `INSERT INTO card_references (id, referer_id, referee_key, referee_id, ref_type, is_present) ` +
      `VALUES (?, ?, ?, ?, ?, ?)`,
  );
  out.transaction(() => {
    for (const r of refRows) {
      insertRef.run(r.id, r.referer_id, r.referee_key, r.referee_id, r.ref_type, r.is_present);
    }
  })();
  const metaRows = (() => {
    try {
      return db.prepare("SELECT key, value FROM meta").all();
    } catch {
      return []; // meta shape differs; the tests read none of it
    }
  })();
  if (metaRows.length > 0) {
    const insertMeta = out.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    out.transaction(() => {
      for (const m of metaRows) insertMeta.run(m.key, m.value);
    })();
  }
}
out.close();
db.close();

// --- report ----------------------------------------------------------------
const dbSize = readFileSync(OUT_DB).length;
const shardSize = readFileSync(path.join(HERE, "test-corpus-shard-000000.jsonl")).length;
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);
console.log(`cards shipped: ${rows.size}`);
console.log(`card_references shipped: ${refRows.length}`);
console.log(
  `shard-000000 entries shipped: ${selected.length} (of ${shard0.length}) + ${nestPointerLines.shard0.length} nest-target pointer lines`,
);
console.log(
  `shard-000014 entries shipped: 1 (id 19334) + ${nestPointerLines.shard14.length} nest-target pointer lines`,
);
console.log(`test-corpus.sqlite3: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`test-corpus-shard-000000.jsonl: ${(shardSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`sha256[0:12] db=${sha(OUT_DB)} shard0=${sha(path.join(HERE, "test-corpus-shard-000000.jsonl"))}`);
console.log("privacy scans: clean");
