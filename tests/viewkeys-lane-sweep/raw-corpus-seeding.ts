// raw-corpus-seeding.ts -- 2026-09-24 RAW ground-truth seeding.
// Self-contained copy of the *structure corpus seeding recipe (the proven
// structure-corpus-seeding.ts + permission-corpus-seeding.ts pair) that
// points at the RAW ground-truth sqlite
// (tmp/raw-ground-truth/bench-corpus-raw.sqlite3) instead of the
// SANITIZED corpus-v2 (benchmarks/corpus-v2/bench-corpus-v2.sqlite3).
//
// The point of the inline copy: identity. The capture rendered from
// bench-corpus-raw.sqlite3; the engine seed must consume the SAME
// bench-corpus-raw.sqlite3. Re-exporting the const CORPUS_DB from the
// permission-corpus-seeding module would route the seed back through
// the sanitized sqlite and silently invalidate the comparison.
//
// Behavior is unchanged: same id-set closure walk, same read-rule
// universe, same *structure rule universe enrichment, same transitive
// side/type fixpoint, same virtual-card lookup wiring.

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { DeckoName } from "../../src/card/name.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../../tests/card/render/render-test-storage.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { bootOracleDeckInflections } from "./oracle-deck-inflection-config.js";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
export const RAW_CORPUS_DB = path.join(
  REPO_ROOT,
  "tmp",
  "raw-ground-truth",
  "bench-corpus-raw.sqlite3",
);

/** Codename cards the permission state resolution reads. */
const PERMISSION_CODENAMES = ["anyone", "anyone_signed_in", "anonymous", "read", "set"];
/** Codename cards the rule? predicate compares against (render.ts
 *  computeIsRule: SettingID / SetID / UserID). */
const RULE_PREDICATE_CODENAMES = ["setting", "set", "user"];
/** Extra codenames the BFS closure pulls into the deck so the engine's
 *  codehash (src/card/fetch/codename.ts#DbCodenameRegistry.codehash) answers
 *  every :codename mark the rendered content references. The
 *  per-class-mechanisms.json baseline lists distinctMissing for
 *  handler_raised:CodenameNotFoundError (52 entries across the full
 *  replay: dashboard 21, header 12, title 12, getting_started 3, footer 2,
 *  shark 1, email_template 1). The on-disk aggregate shards 0-3 reproduces
 *  dashboard 21, title 10, header 4, getting_started 2, type 1, shark 1,
 *  account 1 -- the codename-bearing cards whose content codename marks
 *  the closure previously missed. Listing them here pulls every named
 *  card into the deck at first pass; the BFS frontier then handles
 *  transitive references. */
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
/** Cards whose content references codenames the closure must walk. The
 *  existing code covers *search / *header / *title / *footer (per the
 *  per-class-mechanisms comment); the 4-shard on-disk aggregate shows
 *  those four alone are not enough -- "dashboard" is referenced from
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
}

const CORPUS_ROW_COLUMNS =
  `id, name, codename, left_id, right_id, trash, type_id, content, ` +
  `read_rule_id, read_rule_class, created_at, creator_id`;

export async function createRawStructureSeededStorage(
  ids: Set<number>,
): Promise<RenderTestStorage> {
  // The oracle deck's inflection table (uncountables s/this/anonymous),
  // recovered from the production-stored keys, applied before any corpus
  // name is parsed so engine key computation matches the keys the oracle
  // deck stored/rendered (participant_s, at_this_time, brandon_s ...).
  // Without this the 105-row key/inflection family diverges (merge-pass-2
  // finding A / view-lane class 3).
  bootOracleDeckInflections();
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
  const refs = corpus
    .prepare(
      `SELECT referer_id, referee_id, referee_key FROM card_references WHERE referer_id IN ` +
        `(${ruleRows.map(() => "?").join(",")})`,
    )
    .all(...ruleRows.map((r) => r.id)) as Array<{
    referer_id: number;
    referee_id: number | null;
    referee_key: string | null;
  }>;

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
  // CLUSTER 7 (read-rule-grant-vs-deny, 3 entries): capture every
  // SET-card reference whose referer is one of the *read rule set
  // cards (setCardIds). Ruby's permissions.rb#read_rule? walks the
  // SET card's references to compute the union of grants (the cards
  // that ARE allowed to read what the rule protects); without seeding
  // these references the engine's RefMap misses the grant chain and
  // the engine's read rule evaluation diverges from Ruby's for a few
  // rule cards (*all+*default, *all+*content option view,
  // *help+*right+*default, *sidebar+*self+*default; the byte-diff
  // surfaces as the entries in recapture-raw:*all:render:content,
  // :open and recapture-raw:Martial Nonviolence+Pages:render:content).
  // The setRefs are gathered here (chunked to 500 to keep the IN-list
  // under SQLITE_MAX_VARIABLE_NUMBER); the cards they reference are
  // pulled into the closure walk; the seedReference insertion happens
  // alongside the existing refs loop AFTER seedCard (the seedCard
  // path reads cards before the reference insert is meaningful for
  // a fully-warm engine, but the RefMap accepts ref rows whose
  // referer isn't yet seeded — re-rendering after the seed loop finds
  // the cards regardless).
  let setRefs: Array<{
    referer_id: number;
    referee_id: number | null;
    referee_key: string | null;
  }> = [];
  if (setCardIds.length > 0) {
    for (let i = 0; i < setCardIds.length; i += 500) {
      const chunk = setCardIds.slice(i, i + 500);
      const batch = corpus
        .prepare(
          `SELECT DISTINCT referer_id, referee_id, referee_key FROM card_references ` +
            `WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ` +
            `AND referee_id IS NOT NULL`,
        )
        .all(...chunk) as Array<{
        referer_id: number;
        referee_id: number | null;
        referee_key: string | null;
      }>;
      for (const r of batch) setRefs.push(r);
    }
    for (const r of setRefs) {
      if (r.referee_id !== null) ids.add(r.referee_id);
    }
  }
  // SET-card child-card grant walk (deep-read-rule / read-rule-grant-vs-deny
  // closure gap fix, 2026-09-25). For every *read rule in the seed, resolve
  // its SET card, then walk the SET card's CHILD cards (left_id = set_card.id)
  // — these are the SET's setting rule cards (e.g. `*all+*create`,
  // `*all+*read`, `*all+*update`, `*all+*delete`, `*all+*default`). Each
  // child's card_references name the GRANT PARTIES that setting rule grants
  // (e.g. `*all+*create` -> AnyoneSignedIn, `*all+*delete` -> Administrator,
  // `*all+*read` -> Anyone). Ruby's permissions.rb#read_rule? walks the SET
  // card's rule children via Card.where(matches_rule) and unions the grants;
  // the previous closure walked only refs FROM the *read rule cards
  // (ruleRows) and FROM the SET cards themselves (setRefs), missing the
  // grants named by the SET's other setting children. The walk here:
  //   1. resolve SET card ids from the *read rule rows (already in setCardIds)
  //   2. pull every child card id (left_id IN setCardIds) into childCardIds
  //   3. pull refs FROM childCardIds into childRefs (chunked at 500)
  //   4. add childRefs' referee_ids to ids (the grant party cards)
  //   5. add childCardIds themselves to ids (the SET's setting rule cards
  //      must be in the deck for the renderer's rule-card row lookups to
  //      find them via collectRules — see src/card/render.ts#collectRules)
  // Chunked at 500 to stay under SQLITE_MAX_VARIABLE_NUMBER (default 999).
  let childCardIds: number[] = [];
  let childRefs: Array<{
    referer_id: number;
    referee_id: number | null;
    referee_key: string | null;
  }> = [];
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
            `SELECT DISTINCT referer_id, referee_id, referee_key FROM card_references ` +
              `WHERE referer_id IN (${chunk.map(() => "?").join(",")}) ` +
              `AND referee_id IS NOT NULL`,
          )
          .all(...chunk) as Array<{
          referer_id: number;
          referee_id: number | null;
          referee_key: string | null;
        }>;
        for (const r of batch) childRefs.push(r);
      }
      for (const c of childCardIds) ids.add(c);
      for (const r of childRefs) {
        if (r.referee_id !== null) ids.add(r.referee_id);
      }
    }
  }
  // permission_denied_mismatch closure gap fix: walk the *read rule card
  // CONTENTS for any card names referenced there. Ruby's read-rule walk
  // (permissions.rb:55-61 + 142-143) parses the rule content and pulls
  // every party / card mentioned into the resolved rule; without these,
  // the engine denies where Ruby rendered (per-class-mechanisms.json:
  // permission_denied_mismatch, 14 entries, sampleCountEngineDeniesRuby
  // Renders 12).
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
      // NameNotFoundError closure gap fix: walk card_references.referee_id
      // so cards the closure references by id (e.g. *members -> user 393)
      // reach the deck. Card.[] and Card.fetch look up by id through the
      // Lexicon; without the closure these ids raise NameNotFoundError at
      // render time (per-class-mechanisms.json: handler_raised:NameNotFoundError,
      // 40 entries, distinct refs 583, 736, 727, 393, ...). Chunked to stay
      // under SQLite's SQLITE_MAX_VARIABLE_NUMBER (default 999).
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

  // R17 (signup core, card-mod-account set/abstract/account_holder.rb:11-13):
  // `account? = account.real?` reads the +account junction child. The corpus
  // carries the child for the Sign up cards as id-less-name junction rows
  // (e.g. id 46002: left 46001, right 100 = the *account codename card) the
  // rule/reference closure never reaches, so the signup core's
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
      // R17: the corpus row's created_at/creator_id ride through — the
      // Sign up core renders "signed up on #{format_date card.created_at}"
      // and invited? compares creator_id against AnonymousID
      // (card-mod-account set/type/signup/views.rb:35-45).
      createdAt: row.created_at ?? undefined,
      creatorId: row.creator_id ?? undefined,
    });
  }
  for (const ref of refs) {
    await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key);
  }
  // CLUSTER 7 follow-up: seed the SET-card references captured above
  // (the closure walk ran earlier — setRefs was collected at the same
  // point as rule-set ids were expanded). Same persist path as the
  // rules-as-referers loop above.
  for (const ref of setRefs) {
    await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key);
  }
  // SET-card child-card grant walk follow-up: seed the child-card references
  // captured above (childRefs + childCardIds were collected at the same point
  // as setRefs). Same persist path as the SET-card refs loop above.
  for (const ref of childRefs) {
    await seedReference(storage, ref.referer_id, ref.referee_id, ref.referee_key);
  }
  // BFS frontier extension (CLUSTER 1 / read-rule-grant-vs-deny residue,
  // handler_raised:NameNotFoundError, handler_raised:CodenameNotFoundError).
  // The existing closeClosure walked left_id/right_id/type_id and
  // card_references.referee_id WHERE referer_id IN rows (one-direction
  // forward refs). The gap is the OTHER half of the reference graph:
  //   - card_references.referer_id WHERE referee_id IN rows (reverse refs:
  //     find every card whose content references a card already in the
  //     closure; without this, the engine can't resolve Card.fetch(id)
  //     where id is the REFERRER of a seeded row)
  //   - card_references.referee_key based lookup (codename resolution
  //     for :codename marks in content -- the engine's name environment
  //     resolves marks through the codehash)
  // Each step is chunked at 500 to stay under SQLITE_MAX_VARIABLE_NUMBER
  // (default 999; the prior round-4 trace hit a disk-I/O error on a
  // single giant IN-list, the BFS frontier + 500-chunking is the fix).
  // The walk runs to fixpoint; the round cap (12 here, lowered from 40
  // because each round is a chunked batch instead of a single mega-query)
  // is sufficient for the live deck sizes the corpus ships with.
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
    // {{+*type|content}} raise CodenameNotFoundError. Chunked over the
    // distinct referee_key values currently in the corpus.
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
      //   - ""      : empty (skip)
      //   - "_x"    : relative reference (_self, _left, _main, ...)
      //   - "+:foo" : junction starting from _self into a codename mark
      //                (splitParts yields [":foo"], DeckoName.parse throws)
      //   - "+a+:b" : compound name whose right part is a codename mark
      //   - "## ..." : comment (Ruby's nest-syntax comment; not a name)
      // The corpus-v2 sanitize step rewrote these references to
      // anonymized tokens that never matched the regex, so the original
      // seeding never reached the codename lookup. Same exclusion here.
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
  // reaches (per-class-mechanisms.json: handler_raised:CodenameNotFoundError,
  // 52 entries, distinctMissing [dashboard 21, header 12, title 12,
  // getting_started 3, footer 2, shark 1, email_template 1]). These cards'
  // contents reference cards by name; Ruby's preparse walks them; our seed
  // hadn't. The CONTENT_CODENAME_WALK_NAMES list grew from {*search,
  // *header, *title, *footer} (the round-4 trace set) to include *account
  // and *getting started (the 4-shard on-disk aggregate shows the original
  // four miss "dashboard" 21, "type" 1, "shark" 1, "account" 1 -- all
  // referenced from *account's account_request template).
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

  // Idempotent insert: skip rows the permission seeding already added.
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
      // R17: the corpus row's created_at/creator_id ride through — the
      // Sign up core renders "signed up on #{format_date card.created_at}"
      // and invited? compares creator_id against AnonymousID
      // (card-mod-account set/type/signup/views.rb:35-45).
      createdAt: row.created_at ?? undefined,
      creatorId: row.creator_id ?? undefined,
    });
  }

  // Virtual-card wiring (states.rb#virtual? via FetchEngine.virtualCardLookup,
  // src/card/fetch/virtual-cards.ts): same as the structure-corpus-seeding
  // module. The universe statement answers from the seeded engine deck's
  // stored key columns (seedCard keeps them), one query at factory time.
  {
    const result = await storage.fetcher.driver.batch([structureRuleUniverseStatement()]);
    const universe = structureUniverseFromResults(result[0]);
    const ruleTypes = structureRuleTypesFromResults(result[0]);
    storage.fetcher.virtualCardLookup = createVirtualCardLookup(storage.fetcher, {
      contents: universe,
      ruleTypeIds: ruleTypes,
    });
  }

  corpus.close();
  return storage;
}