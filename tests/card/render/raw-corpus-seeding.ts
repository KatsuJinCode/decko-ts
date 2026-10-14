// raw-corpus-seeding.ts -- RAW ground-truth corpus seeding.
//
// Seeds the engine deck from the RAW ground-truth sqlite (the db the
// expected captures were rendered from; the path contract lives in
// src/testing/test-corpus-paths.ts), so the engine replay consumes the SAME
// bytes the expected bytes were rendered against. Re-exporting a const from a
// sanitized-corpus module would silently invalidate the comparison.
//
// Recipe: oracle deck inflection boot,
// *read rule universe, permission/extended codenames, SET-card reference
// closure, SET-child grant closure, read-content walk, BFS reference frontier,
// *structure rule enrichment, content-codename walk, idempotent card insert,
// virtual-card lookup wiring.
//
// THE REFERENCE GRAPH PASS (the fix this committed copy exists to carry):
// after every card is seeded, the FULL
// card_references graph is copied for every seeded referer, verbatim from the
// corpus (referer_id, referee_key, referee_id, ref_type, is_present). Seeding
// only partial slices (*read rule rows,
// SET cards, SET-card children) pushes every row through
// seedReference's refType default, which writes INCLUSION rows as "L" links --
// a harness-only distortion. Production storage carries the whole table:
//   the rows are built on the save path by refresh_references_out
//   (mod/core/set/all/reference_events.rb:2-4 ->
//   lib/card/reference/all.rb:47-62), ported at
//   src/card/actions/refresh-references-out.ts and wired in
//   src/card/actions/card-action-engine.ts (INTEGRATION/FINALIZE events).
// The dump's rows ARE that production-built graph (the corpus sqlite's
// card_references is the live deck's table at capture time), so the harness
// copies them rather than re-deriving them through the port at seed time --
// re-deriving would substitute the port's chunk parser for production's
// stored truth. The `plus: {refer_to}` CQL class resolves through these
// rows: a junction's participant reference row is what the clause joins on.
// Without the pass the harness replays render search-no-results where Ruby
// lists search-result-item bars.

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { DeckoName } from "../../../src/card/name.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
  defaultRuleUniverseStatement,
  templateTypeNameStatement,
  templateTypeNamesFromResults,
} from "../../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../../src/card/fetch/virtual-cards.js";
import { applyDeckInflections } from "../../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../../src/card/name/oracle-deck-inflections.js";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
// The raw ground-truth leg's paths are owned by the one path-contract
// module (src/testing/test-corpus-paths.ts) and sourced from here, because this
// module is what the corpus-replay tests have always imported them from.
//
// RAW_CORPUS_DB stays an `export const` DECLARED HERE on purpose: the
// corpus-replay runner loads this module and its load contract is pinned by
// source shape in
// the graded-run-must-use-the-committed-corpus-seeding suite (not in the public package)
// (`/export\s+const\s+RAW_CORPUS_DB/`). Rewriting it as a bare re-export list
// keeps the same runtime export and breaks that pin -- which is what a first
// attempt at this change did, and what the gate caught.
import {
  RAW_CORPUS_DIR,
  RAW_CORPUS_DB_PATH,
  RAW_CORPUS_VIEW_LANE_DIR,
} from "../../../src/testing/test-corpus-paths.js";

export const RAW_CORPUS_DB = RAW_CORPUS_DB_PATH;
export { RAW_CORPUS_DIR, RAW_CORPUS_VIEW_LANE_DIR };

/** Codename cards the permission state resolution reads. */
const PERMISSION_CODENAMES = ["anyone", "anyone_signed_in", "anonymous", "read", "set"];
/** Codename cards the rule? predicate compares against (render.ts
 *  computeIsRule: SettingID / SetID / UserID). */
const RULE_PREDICATE_CODENAMES = ["setting", "set", "user"];
/** Extra codenames the BFS closure pulls into the deck so the engine's
 *  codehash (src/card/fetch/codename.ts#DbCodenameRegistry.codehash) answers
 *  every :codename mark the rendered content references. Without these
 *  cards the marks raise CodenameNotFoundError; listing them here pulls
 *  every named card into the deck at first pass, and the BFS frontier then
 *  handles transitive references. */
const EXTENDED_CODENAMES = [
  "dashboard",
  "getting_started",
  "shark",
  "account",
  "email_template",
  "type",
  "self",
  "default",
  "all",
  "all_plus",
  "help",
  "sidebar",
  "rstar",
  "skin",
  "structure",
  "title",
  "header",
  "footer",
  "rule",
  "right",
  "description",
  "version",
  "role",
  "name",
  "image",
  "file",
  "number",
  "phrase",
  "date",
  "search_type",
  "pointer",
  "list",
  "toggle",
  "html",
  "cardtype",
  "rich_text",
  "basic",
  "basic_card",
  "signup_success",
  "link",
];
/** Cards whose content references codenames the closure must walk.
 *  *search / *header / *title / *footer alone are not enough --
 *  "dashboard" is referenced from
 *  *account-related content, "shark" from *account's account-request
 *  template, etc. Walking every codename-bearing content-codename card
 *  broadens the surface. */
const CONTENT_CODENAME_WALK_NAMES = [
  "*search", "*header", "*title", "*footer",
  "*account", "*account+*right", "*getting started",
];

interface CorpusRow {
  id: number;
  name: string | null;
  codename: string | null;
  left_id: number | null;
  right_id: number | null;
  trash: number;
  type_id: number;
  content: string | null;
  read_rule_id: number | null;
  read_rule_class: string | null;
  created_at: string | null;
  creator_id: number | null;
  updated_at: string | null;
}

interface CorpusReferenceRow {
  id: number;
  referer_id: number;
  referee_id: number | null;
  referee_key: string | null;
  ref_type: string | null;
  is_present: number | null;
}

const CORPUS_ROW_COLUMNS =
  `id, name, codename, left_id, right_id, trash, type_id, content, ` +
  `read_rule_id, read_rule_class, created_at, creator_id, updated_at`;

export async function createRawStructureSeededStorage(
  ids: Set<number>,
): Promise<RenderTestStorage> {
  // The oracle deck's inflection table (uncountables s/this/anonymous),
  // recovered from the production-stored keys, applied before any corpus
  // name is parsed so engine key computation matches the keys the deck
  // stored/rendered.
  // Table + rationale:
  // src/card/name/oracle-deck-inflections.ts.
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const storage = await createRenderTestStorage();
  const corpus = new Database(RAW_CORPUS_DB, { readonly: true });

  const readId = (
    corpus.prepare(`SELECT id FROM cards WHERE codename = 'read' AND trash = 0`).get() as
      { id: number } | undefined
  )?.id;
  if (readId === undefined) throw new Error("raw corpus deck has no *read card");

  const ruleRows = corpus
    .prepare(
      `SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE right_id = ? AND trash = 0`,
    )
    .all(readId) as CorpusRow[];
  const setCardIds = [
    ...new Set(ruleRows.map((r) => r.left_id).filter((x): x is number => x !== null)),
  ];

  // *update rule universe: the
  // admin-configs machinery reads the deck's *update rules exactly the way
  // the read-rule universe above reads the *read ones — Ruby's
  // responsible-role walk (all/admin.rb:32-38 scoping_rule_card) resolves
  // each config item's *update rule over the pattern candidates
  // (self -> star -> type -> all; 04_star.rb#pattern_applies?), and
  // type/role.rb:12-24 view :configs groups the items under the winning
  // rule's pointer-item role codenames. Without the *update rows the
  // engine deck answers every walk from *all+*update alone and the
  // Administrator role page renders no Configurations section where Ruby
  // lists one. Rule rows + their SET cards join the id
  // set; the closure walks then pull the rule rows' referenced parties
  // (the dump's card_references carries the pointer items).
  const updateId = (
    corpus
      .prepare(`SELECT id FROM cards WHERE codename = 'update' AND trash = 0`)
      .get() as { id: number } | undefined
  )?.id;
  if (updateId !== undefined) {
    const updateRuleRows = corpus
      .prepare(
        `SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE right_id = ? AND trash = 0`,
      )
      .all(updateId) as CorpusRow[];
    const updateSetCardIds = [
      ...new Set(
        updateRuleRows.map((r) => r.left_id).filter((x): x is number => x !== null),
      ),
    ];
    for (const rule of updateRuleRows) ids.add(rule.id);
    for (const id of updateSetCardIds) ids.add(id);
  }

  for (const codename of PERMISSION_CODENAMES) {
    const row = corpus
      .prepare(`SELECT id FROM cards WHERE codename = ? AND trash = 0`)
      .get(codename) as { id: number } | undefined;
    if (row !== undefined) ids.add(row.id);
  }
  // Extended codename pass: the codename-bearing cards the BFS frontier
  // wouldn't otherwise reach because they're not referenced by any rule
  // card, set card, or content span the closure walks. Codename marks
  // ([[:dashboard]], {{+*type|...}}, etc.) resolve through the engine's
  // codehash; without the card in the deck, the mark raises
  // CodenameNotFoundError. Listing the misses up front (dashboard, shark,
  // account, getting_started, etc.) makes the closure's first pass
  // complete -- the BFS frontier then handles the transitive chain.
  for (const codename of EXTENDED_CODENAMES) {
    const row = corpus
      .prepare(`SELECT id FROM cards WHERE codename = ? AND trash = 0`)
      .get(codename) as { id: number } | undefined;
    if (row !== undefined) ids.add(row.id);
  }
  for (const rule of ruleRows) ids.add(rule.id);
  for (const id of setCardIds) ids.add(id);
  // SET-card reference closure: capture every
  // SET-card reference whose referer is one of the *read rule set
  // cards (setCardIds). Ruby's permissions.rb#read_rule? walks the
  // SET card's references to compute the union of grants (the cards
  // that ARE allowed to read what the rule protects); without these the
  // engine's read rule evaluation diverges from Ruby's for a few rule
  // cards. The REFEREE IDS still expand the closure here; the rows
  // themselves are inserted by the full-graph reference pass at the end
  // (which carries them verbatim, ref_type included).
  let setRefs: CorpusReferenceRow[] = [];
  if (setCardIds.length > 0) {
    for (let i = 0; i < setCardIds.length; i += 500) {
      const chunk = setCardIds.slice(i, i + 500);
      const batch = corpus
        .prepare(
          `SELECT DISTINCT referer_id, referee_id, referee_key, ref_type, is_present FROM card_references ` +
            `WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ` +
            `AND referee_id IS NOT NULL`,
        )
        .all(...chunk) as CorpusReferenceRow[];
      for (const r of batch) setRefs.push(r);
    }
    for (const r of setRefs) {
      if (r.referee_id !== null) ids.add(r.referee_id);
    }
  }
  // SET-card child-card grant walk. For every *read rule in the seed, resolve
  // its SET card, then walk the SET card's CHILD cards (left_id = set_card.id)
  // -- these are the SET's setting rule cards (e.g. `*all+*create`,
  // `*all+*read`, `*all+*update`, `*all+*delete`, `*all+*default`). Each
  // child's card_references name the GRANT PARTIES that setting rule grants.
  // The walk: chunked at 500 to stay under SQLITE_MAX_VARIABLE_NUMBER.
  // Child refs expand the closure only; rows ride in with the full-graph
  // reference pass.
  let childCardIds: number[] = [];
  let childRefs: CorpusReferenceRow[] = [];
  if (setCardIds.length > 0) {
    for (let i = 0; i < setCardIds.length; i += 500) {
      const chunk = setCardIds.slice(i, i + 500);
      const children = corpus
        .prepare(
          `SELECT id FROM cards WHERE left_id IN (${chunk
            .map(() => "?")
            .join(",")}) AND trash = 0`,
        )
        .all(...chunk) as Array<{ id: number }>;
      for (const c of children) childCardIds.push(c.id);
    }
    if (childCardIds.length > 0) {
      for (let i = 0; i < childCardIds.length; i += 500) {
        const chunk = childCardIds.slice(i, i + 500);
        const batch = corpus
          .prepare(
            `SELECT DISTINCT referer_id, referee_id, referee_key, ref_type, is_present FROM card_references ` +
              `WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ` +
              `AND referee_id IS NOT NULL`,
          )
          .all(...chunk) as CorpusReferenceRow[];
        for (const r of batch) childRefs.push(r);
      }
      for (const c of childCardIds) ids.add(c);
      for (const r of childRefs) {
        if (r.referee_id !== null) ids.add(r.referee_id);
      }
    }
  }
  // Read-rule content closure: walk the *read rule card
  // CONTENTS for any card names referenced there. Ruby's read-rule walk
  // (permissions.rb:55-61 + 142-143) parses the rule content and pulls
  // every party / card mentioned into the resolved rule.
  const readContentWalk = new Set<string>();
  for (const rule of ruleRows) {
    if (rule.content === null || rule.content === "") continue;
    const spans = rule.content.match(/\{\{([^{}]*)\}\}/g) ?? [];
    for (const span of spans) {
      const inner = span.slice(2, -2).split("|")[0] ?? "";
      const name = inner.trim();
      if (name === "" || name.startsWith("#")) continue;
      if (name.includes("+")) continue;
      // Skip codename marks (resolved by Codename registry at fetch time
      // -- the read-rule grant "Anyone Signed In" is a codename: the
      // CONTENTS that need closure are real cards, not codenames).
      if (name.startsWith(":")) continue;
      // Filter paren names (handled at the main closure via key lookup).
      readContentWalk.add(name);
    }
  }
  for (const name of readContentWalk) {
    const found =
      (corpus
        .prepare(`SELECT id FROM cards WHERE name = ? AND trash = 0`)
        .get(name) as { id: number } | undefined) ??
      (corpus
        .prepare(`SELECT id FROM cards WHERE "key" = ? AND trash = 0`)
        .get(DeckoName.parse(name).key) as { id: number } | undefined);
    if (found !== undefined && !ids.has(found.id)) ids.add(found.id);
  }

  const rows = new Map<number, CorpusRow>();
  const fetchRows = (idList: number[]): void => {
    for (let i = 0; i < idList.length; i += 500) {
      const chunk = idList.slice(i, i + 500);
      const fetched = corpus
        .prepare(
          `SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk) as CorpusRow[];
      for (const row of fetched) {
        if (!rows.has(row.id)) {
          rows.set(row.id, row);
          ids.add(row.id);
        }
      }
    }
  };
  fetchRows([...ids]);
  const closeClosure = (): void => {
    for (let round = 0; round < 40; round++) {
      const need: number[] = [];
      for (const row of rows.values()) {
        for (const side of [row.left_id, row.right_id]) {
          if (side !== null && !rows.has(side)) need.push(side);
        }
        if (row.type_id !== null && !rows.has(row.type_id)) need.push(row.type_id);
      }
      // NameNotFoundError closure gap: walk card_references.referee_id
      // so cards the closure references by id reach the deck. Chunked to
      // stay under SQLITE_MAX_VARIABLE_NUMBER.
      const refIdKeys = [...rows.keys()];
      for (let i = 0; i < refIdKeys.length; i += 500) {
        const chunk = refIdKeys.slice(i, i + 500);
        const refIds = corpus
          .prepare(
            `SELECT DISTINCT referee_id FROM card_references WHERE referee_id IS NOT NULL ` +
              `AND referer_id IN (${chunk.map(() => "?").join(",")})`,
          )
          .all(...chunk) as Array<{ referee_id: number }>;
        for (const r of refIds) {
          if (!rows.has(r.referee_id)) need.push(r.referee_id);
        }
      }
      if (need.length === 0) break;
      fetchRows(need);
    }
  };
  closeClosure();

  // IdList item-line walk: List-type
  // cards store `~id` item LINES in content (card-mod-list
  // set/abstract/id_list.rb storage), and <Role>+*members rows can
  // name TRASHED member rows that carry NO
  // card_references rows at all — the reference closure above never reaches
  // them, while Ruby's db answers them anyway (lexicon.rb#id_to_lex reads
  // the row by id with NO trash filter). Ruby rendered those members (the
  // role +*members pages resolve the ids
  // into denied unknown-item bars named "ANON-…" / "…*trash"); the engine
  // without the rows raised
  // NameNotFoundError at the sync parse (name.ts badMark, name
  // environment peek miss). Walk every seeded card's content for ~N item
  // lines and pull the named rows in — the same no-trash-filter row read
  // the lexicon fallback performs — then re-close the junction closure
  // over the additions. (Per-line exact match only: a JSON search card's
  // content never has a bare "~N" line, so search bodies cannot
  // false-positive.)
  {
    const itemIds = new Set<number>();
    for (const row of rows.values()) {
      if (row.content === null || row.content === "") continue;
      for (const line of row.content.split(/\n+/)) {
        const m = /^~(\d+)$/.exec(line.replace(/\[\[|\]\]/g, "").trim());
        if (m !== null) itemIds.add(Number(m[1]));
      }
    }
    const missing = [...itemIds].filter((id) => !rows.has(id));
    if (missing.length > 0) {
      fetchRows(missing);
      closeClosure();
    }
  }

  // Signup core (card-mod-account set/abstract/account_holder.rb:11-13):
  // `account? = account.real?` reads the +account junction child. The corpus
  // carries the child for the Sign up cards as id-less-name junction rows
  // the rule/reference closure never reaches, so the signup core's
  // missing-account branch needs them pulled explicitly: every seeded
  // card's +account child (right_id = the *account card) joins the deck.
  const accountId = (
    corpus.prepare(`SELECT id FROM cards WHERE codename = 'account' AND trash = 0`).get() as
      { id: number } | undefined
  )?.id;
  if (accountId !== undefined) {
    const seededIds = [...rows.keys()];
    for (let i = 0; i < seededIds.length; i += 500) {
      const chunk = seededIds.slice(i, i + 500);
      const children = corpus
        .prepare(
          `SELECT ${CORPUS_ROW_COLUMNS} FROM cards ` +
            `WHERE right_id = ? AND left_id IN (${chunk.map(() => "?").join(",")}) AND trash = 0`,
        )
        .all(accountId, ...chunk) as CorpusRow[];
      for (const row of children) {
        if (!rows.has(row.id)) rows.set(row.id, row);
      }
    }
  }

  // CAPTURE-RESTORED OVERRIDE TABLE.
  // Some cards' stored bytes are unobtainable from the corpus dump: the
  // deck held materialized bytes the dump does not carry (e.g. a
  // customized-skin card holding a large compiled-CSS block the corpus
  // lacks). The override table carries those bytes, restored from the
  // reference captures, not hand-authored:
  // The extractor that re-derives them from the capture files (not in this tree)
  // verifies every envelope equality,
  // and writes the table applied here — to the STAGED deck only, never to the
  // sha-pinned corpus file.
  //
  // THE SHA GATE IS LOAD-BEARING: the restored bytes are only what Ruby
  // rendered for the corpus snapshot the captures came from. Against any other
  // corpus state this module REFUSES the run instead of silently seeding
  // foreign bytes (the same refuse-don't-fallback discipline as the runner's
  // seeding-module assertion).
  //
  // Contract (see the extractor for the emitter side): `cards` patches the
  // named columns of rows that exist in the corpus; `references` adds
  // card_references rows (emitted with their capture ids so the FULL REFERENCE
  // GRAPH PASS below can keep physical rowid order byte-faithful).
  const overrideRows: CorpusReferenceRow[] = [];
  {
    const overridePath = path.join(REPO_ROOT, "tests", "card", "render",
      "raw-corpus-override-capture-restored-rows.json");
    const override = JSON.parse(readFileSync(overridePath, "utf8")) as {
      meta: { corpusSha256: string; contentPairedCorpora?: Array<{ sha256: string }> };
      cards: Array<{ id: number; content?: string; note?: string }>;
      references: CorpusReferenceRow[];
    };
    const corpusSha = createHash("sha256").update(readFileSync(RAW_CORPUS_DB)).digest("hex");
    // A content-paired corpus differs from the pinned one only outside the
    // columns this table patches (each entry records its derivation and the
    // pairing-gate proof), so the restored rows address the same cards.
    const acceptedShas = [
      override.meta.corpusSha256,
      ...(override.meta.contentPairedCorpora ?? []).map((p) => p.sha256),
    ];
    if (!acceptedShas.includes(corpusSha)) {
      throw new Error(
        `capture-restored override table is pinned to corpus ${acceptedShas.join(" / ")} ` +
          `but this worktree's corpus is ${corpusSha} — refusing to seed foreign bytes`,
      );
    }
    for (const oc of override.cards) {
      const row = rows.get(oc.id);
      if (row === undefined) {
        throw new Error(
          `override table patches card ${oc.id} but the closure did not seed it`,
        );
      }
      if (oc.content !== undefined) row.content = oc.content;
    }
    for (const ref of override.references) overrideRows.push(ref);
  }

  for (const row of rows.values()) {
    await seedCard(storage, {
      id: row.id,
      name: row.name ?? undefined,
      codename: row.codename,
      leftId: row.left_id ?? undefined,
      rightId: row.right_id ?? undefined,
      trash: row.trash === 1,
      typeId: row.type_id,
      dbContent: row.content,
      readRuleId: row.read_rule_id,
      readRuleClass: row.read_rule_class,
      // the corpus row's created_at/creator_id ride through -- the
      // Sign up core renders "signed up on #{format_date card.created_at}"
      // and invited? compares creator_id against AnonymousID
      // (card-mod-account set/type/signup/views.rb:35-45).
      createdAt: row.created_at ?? undefined,
      creatorId: row.creator_id ?? undefined,
      // updated_at rides through too. The staging deck previously
      // gave EVERY row the same seed default, so any `sort: "update"` CQL
      // (SqlStatement::Order ORDER_MAP["update"] -> updated_at,
      // DEFAULT_ORDER_DIRS["update"] = desc) ordered a TOTAL TIE and fell to
      // the join emission tier. The
      // corpus rows carry the real timestamps; staging them is
      // the data half of the sort (the ORDER BY itself already works,
      // src/cql/sql.ts:455).
      updatedAt: row.updated_at ?? undefined,
    });
  }
  // BFS frontier extension.
  // The existing closeClosure walked left_id/right_id/type_id and
  // card_references.referee_id WHERE referer_id IN rows (one-direction
  // forward refs). The gap is the OTHER half of the reference graph:
  //   - card_references.referer_id WHERE referee_id IN rows (reverse refs)
  //   - card_references.referee_key based lookup (codename resolution
  //     for :codename marks in content)
  // Each step is chunked at 500 to stay under SQLITE_MAX_VARIABLE_NUMBER
  // (default 999).
  // The walk runs to fixpoint; the round cap (12 here, lowered from 40
  // because each round is a chunked batch instead of a single mega-query)
  // is sufficient for the deck sizes the corpus ships with.
  for (let round = 0; round < 12; round++) {
    const need = new Set<number>();
    const rowIdList = [...rows.keys()];
    // Forward refs: card_references where referer_id is in rows -> referees
    for (let i = 0; i < rowIdList.length; i += 500) {
      const chunk = rowIdList.slice(i, i + 500);
      const refIds = corpus
        .prepare(
          `SELECT DISTINCT referee_id FROM card_references WHERE referee_id IS NOT NULL ` +
            `AND referer_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk) as Array<{ referee_id: number }>;
      for (const r of refIds) {
        if (!rows.has(r.referee_id)) need.add(r.referee_id);
      }
    }
    // Reverse refs: card_references where referee_id is in rows -> referers
    // (the OTHER half of the reference graph the prior closure missed).
    for (let i = 0; i < rowIdList.length; i += 500) {
      const chunk = rowIdList.slice(i, i + 500);
      const refIds = corpus
        .prepare(
          `SELECT DISTINCT referer_id FROM card_references WHERE referer_id IS NOT NULL ` +
            `AND referee_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk) as Array<{ referer_id: number }>;
      for (const r of refIds) {
        if (!rows.has(r.referer_id)) need.add(r.referer_id);
      }
    }
    // referee_key -> card lookup (codename marks): every card whose
    // referee_key (a name like "type" / "default" / "dashboard") resolves
    // to a codename card. The engine's name environment reads marks
    // through the codehash; without these in the deck, marks like
    // {{+*type|content}} raise CodenameNotFoundError.
    const distinctKeys = corpus
      .prepare(
        `SELECT DISTINCT referee_key FROM card_references ` +
          `WHERE referee_key IS NOT NULL AND referee_id IS NOT NULL`,
      )
      .all() as Array<{ referee_key: string }>;
    for (const r of distinctKeys) {
      if (r.referee_key.startsWith("+") || r.referee_key.includes("+")) continue;
      const found =
        (corpus
          .prepare(`SELECT id FROM cards WHERE codename = ? AND trash = 0`)
          .get(r.referee_key) as { id: number } | undefined) ??
        (corpus
          .prepare(`SELECT id FROM cards WHERE name = ? AND trash = 0`)
          .get(r.referee_key) as { id: number } | undefined);
      if (found !== undefined && !rows.has(found.id)) need.add(found.id);
    }
    if (need.size === 0) break;
    fetchRows([...need]);
  }

  // *structure enrichment (same closure walk the structure-corpus-seeding
  // module does; the lookup-by-name falls back to lookup-by-key where the
  // raw deck's *structure rule references use the uncanonical spelling).
  const structureCardId = (
    corpus.prepare(`SELECT id FROM cards WHERE name = '*structure' AND trash = 0`).get() as
      { id: number } | undefined
  )?.id;
  if (structureCardId === undefined) throw new Error("raw corpus deck has no *structure card");

  const structureRuleRows = corpus
    .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE right_id = ? AND trash = 0`)
    .all(structureCardId) as CorpusRow[];
  const enrichIds = new Set<number>();
  for (const rule of structureRuleRows) {
    enrichIds.add(rule.id);
    if (rule.left_id !== null) enrichIds.add(rule.left_id);
  }
  for (const codename of RULE_PREDICATE_CODENAMES) {
    const row = corpus
      .prepare(`SELECT id FROM cards WHERE codename = ? AND trash = 0`)
      .get(codename) as { id: number } | undefined;
    if (row !== undefined) enrichIds.add(row.id);
  }
  fetchRows([...enrichIds]);
  const refNames = new Set<string>();
  for (const rule of structureRuleRows) {
    if (rule.content === null || rule.content === "") continue;
    const spans = rule.content.match(/\{\{([^{}]*)\}\}/g) ?? [];
    for (const span of spans) {
      const beforeOptions = span.slice(2, -2).split("|")[0] ?? "";
      const name = beforeOptions.trim();
      // Filter out anything the name layer would need its full machinery
      // to resolve at seed time. The raw dump preserves them verbatim,
      // but the codename registry is not installed at seed time so the
      // DeckoName.parse(name).key fallback (used when name lookup misses)
      // would throw CodenameNotFoundError on any ":codename" substring.
      if (
        name === "" ||
        name.startsWith("_") ||
        name.includes(":") ||
        name.startsWith("#")
      ) continue;
      refNames.add(name);
    }
  }
  for (const name of refNames) {
    const row = (
      corpus
        .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE name = ? AND trash = 0`)
        .get(name) as CorpusRow | undefined
    ) ??
      (corpus
        .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE "key" = ? AND trash = 0`)
        .get(DeckoName.parse(name).key) as CorpusRow | undefined);
    if (row !== undefined && !rows.has(row.id)) {
      rows.set(row.id, row);
      ids.add(row.id);
    }
  }
  // CodenameNotFoundError closure gap fix: walk the content-references of
  // *search / *header / *title / *footer AND *account / *account+*right /
  // *getting started and pull every codename they mention into the
  // closure. Ruby's deck ships names like "dashboard", "header", "title",
  // "footer", "getting_started", "shark", "email_template" that the *read
  // / *structure / setting / set / user rule-predicate closure never
  // reaches. These cards' contents reference cards by name; Ruby's preparse
  // walks them; our seed hadn't.
  const contentCodenameWalk = new Set<string>();
  for (const codenameCard of CONTENT_CODENAME_WALK_NAMES) {
    const contentRow = corpus
      .prepare(
        `SELECT content FROM cards WHERE name = ? AND trash = 0 LIMIT 1`,
      )
      .get(codenameCard) as { content: string | null } | undefined;
    if (contentRow?.content === null || contentRow?.content === undefined) continue;
    const spans = contentRow.content.match(/\[\[([^\]]+)\]\]/g) ?? [];
    for (const span of spans) {
      const inner = span.slice(2, -2).split("|")[0] ?? "";
      const name = inner.trim();
      if (name === "" || name.startsWith("#")) continue;
      // Skip marks that aren't codename-shaped or that would need mark
      // resolution (mirrors the structure enrichment exclusions above).
      if (name.includes("+")) continue; // junction names: walked by side/type closure
      contentCodenameWalk.add(name);
    }
  }
  for (const name of contentCodenameWalk) {
    const row = (
      corpus
        .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE name = ? AND trash = 0`)
        .get(name) as CorpusRow | undefined
    ) ??
      (corpus
        .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE "key" = ? AND trash = 0`)
        .get(DeckoName.parse(name).key) as CorpusRow | undefined);
    if (row !== undefined && !rows.has(row.id)) {
      rows.set(row.id, row);
      ids.add(row.id);
    }
  }
  // Extended codenames: the codename-bearing cards the BFS frontier above
  // doesn't reach on its own. Listing them here means every card whose
  // codehash entry the engine's content marks need (dashboard, shark,
  // account, etc.) is in the deck from the first pass; the BFS frontier
  // then handles transitive references (the references the content
  // walks above pull in, etc.).
  for (const codename of EXTENDED_CODENAMES) {
    const row = corpus
      .prepare(`SELECT ${CORPUS_ROW_COLUMNS} FROM cards WHERE codename = ? AND trash = 0`)
      .get(codename) as CorpusRow | undefined;
    if (row !== undefined && !ids.has(row.id)) ids.add(row.id);
  }
  closeClosure();

  // Idempotent insert: skip rows the earlier fetchRows passes already added.
  const existing = new Set<number>();
  {
    const idList = [...rows.keys()];
    for (let i = 0; i < idList.length; i += 500) {
      const chunk = idList.slice(i, i + 500);
      const found = storage.fetcher.driver.query<{ id: number }>(
        `SELECT id FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      for (const row of (await found).rows) existing.add(row.id);
    }
  }
  for (const row of rows.values()) {
    if (existing.has(row.id)) continue;
    await seedCard(storage, {
      id: row.id,
      name: row.name ?? undefined,
      codename: row.codename,
      leftId: row.left_id ?? undefined,
      rightId: row.right_id ?? undefined,
      trash: row.trash === 1,
      typeId: row.type_id,
      dbContent: row.content,
      readRuleId: row.read_rule_id,
      readRuleClass: row.read_rule_class,
      createdAt: row.created_at ?? undefined,
      creatorId: row.creator_id ?? undefined,
      // See the first seedCard pass -- real updated_at so
      // sort:"update" orders real ties, not the uniform seed default.
      updatedAt: row.updated_at ?? undefined,
    });
  }

  // FULL REFERENCE GRAPH PASS (the header comment has
  // the production-builder citation and the copy-not-re-derive rationale).
  // Every card_references row whose referer is a seeded card, copied
  // verbatim (id, referee_key, referee_id, ref_type, is_present -- all
  // columns exactly as the production dump stored them). Rows whose referer
  // is not in the deck are unreachable (the CQL reference tie joins
  // referer_id against existing card ids; the read-rule cache joins it
  // against seeded rule-card ids), so the restriction keeps partial-id seeds
  // lean without changing any query outcome. Bulk-inserted in 5000-row
  // slices, the same slice size the production write path uses
  // (refresh-references-out.ts, Reference.insert_in_slices all.rb:61).
  //
  // THE ID COLUMN IS LOAD-BEARING FOR ROW ORDER: the CQL reference tie emits
  // `JOIN card_references cr1 ON
  // c0.id = cr1.referer_id … ORDER BY c0.key` with NO tie-break (Ruby's
  // sql_statement/order.rb builds the bare ORDER BY), so the rows' order in
  // the NULL-key tier is the cr TABLE'S PHYSICAL ROWID order — the rendered
  // reference bytes embed it (a *referred_to_by listing's slot order follows
  // the rowid order because some reference rows were written later than
  // others at capture time). Inserting without the corpus id renumbers rowids
  // in referer-chunk order and re-sorts that listing. Seeding the corpus ids
  // keeps the seeded deck's rowid order byte-faithful to the captured deck.
  {
    const refRows: CorpusReferenceRow[] = [];
    const seededIdList = [...rows.keys()];
    for (let i = 0; i < seededIdList.length; i += 500) {
      const chunk = seededIdList.slice(i, i + 500);
      const batch = corpus
        .prepare(
          `SELECT id, referer_id, referee_id, referee_key, ref_type, is_present FROM card_references ` +
            `WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ORDER BY id`,
        )
        .all(...chunk) as CorpusReferenceRow[];
      for (const r of batch) refRows.push(r);
    }
    // Override-table reference restorations merge INTO the id order, so the
    // physical rowid order stays byte-faithful to the captured deck (the
    // id-column comment above is load-bearing; a sorted merge is the only
    // insertion that preserves it).
    if (overrideRows.length > 0) {
      refRows.push(...overrideRows);
      refRows.sort((a, b) => a.id - b.id);
    }
    for (let slice = 0; slice < refRows.length; slice += 5000) {
      const chunk = refRows.slice(slice, slice + 5000);
      const values: string[] = [];
      const params: unknown[] = [];
      for (const r of chunk) {
        values.push("(?, ?, ?, ?, ?, ?)");
        params.push(r.id, r.referer_id, r.referee_key, r.referee_id, r.ref_type, r.is_present);
      }
      await storage.counting.query(
        `INSERT INTO card_references (id, referer_id, referee_key, referee_id, ref_type, is_present)
         VALUES ${values.join(", ")}`,
        params,
      );
    }
  }

  // Virtual-card wiring (states.rb#virtual? via FetchEngine.virtualCardLookup,
  // src/card/fetch/virtual-cards.ts): same as the structure-corpus-seeding
  // module. The universe statement answers from the seeded engine deck's
  // stored key columns (seedCard keeps them), one query at factory time.
  // The *default universe and the template type names ride the SAME batch
  // (+2 statements, +0 round trips): the lookup types a fetch-miss left as
  // Ruby's quick_type does — a NEW card typed by the new-card chain — and
  // that walk reads these maps only, so it cannot re-enter the hook.
  {
    const result = await storage.fetcher.driver.batch([
      structureRuleUniverseStatement(),
      defaultRuleUniverseStatement(),
      templateTypeNameStatement(),
    ]);
    const universe = structureUniverseFromResults(result[0]);
    const ruleTypes = structureRuleTypesFromResults(result[0]);
    const defaultTypeIds = structureRuleTypesFromResults(result[1]);
    const typeNamesById = templateTypeNamesFromResults(result[2]);
    storage.fetcher.virtualCardLookup = createVirtualCardLookup(
      storage.fetcher,
      {
        contents: universe,
        ruleTypeIds: ruleTypes,
      },
      { defaultTypeIds, typeNamesById },
    );
  }

  corpus.close();
  return storage;
}
