// The shared surface of the TWO Workers entries: worker.ts (the root entry
// wrangler.toml `main` ships — the Deploy-to-Cloudflare button's surface)
// and deploy/worker.ts (deploy/wrangler.toml's harness). The twins drifted
// once already — the button shipped a blanket-500 catch while deploy/
// worker.ts mapped missing cards 404, and a test-deploy caught it. This
// module is the part of that surface BOTH entries must answer IDENTICALLY,
// extracted so they cannot drift again;
// tests/deploy/worker-twins-shared-surface-parity.test.ts drives both
// shipped entries through one fixture and pins the parity.
//
// Web-standard only (no Node APIs), like both entries.

import type { SQLDatabaseDriver } from "./driver.js";
import { DeckoName } from "../card/name.js";
import type { FetchEngine } from "../card/fetch.js";

// ---------------------------------------------------------------------------
// Error -> HTTP status mapping
// ---------------------------------------------------------------------------

/** The rendered-error page shape both entries answer with. */
export interface RenderErrorPage {
  readonly status: number;
  readonly title: string;
}

/**
 * Map an engine error MESSAGE to the HTTP status + page title:
 *
 *   - `card not found: X`  -> 404 "Card not found"
 *   - `id doesn't exist: N` / `codename doesn't exist: X` -> 404
 *     (the name layer's mark-resolution failures, which are the same
 *     not-found condition expressed as an unusable URL mark)
 *   - `view (X) not supported ...` -> 422 "Unsupported view"
 *     (a user error: the request named a view this engine does not
 *     implement, raised in src/card/render/format.ts:79-81. Only a
 *     genuine server fault earns a 500.)
 *   - anything else -> 500 "Render error"
 *
 * The discriminators are the error MESSAGES the engine throws (every
 * raise site formats through `Error` with these prefixes); entries catch
 * at the page boundary where only the message survives.
 */
export function mapRenderError(message: string): RenderErrorPage {
  if (/^card not found: /.test(message)) return { status: 404, title: "Card not found" };
  if (/^id doesn't exist: /.test(message) || /^codename doesn't exist: /.test(message)) {
    return { status: 404, title: "Card not found" };
  }
  if (/^view \(/.test(message)) return { status: 422, title: "Unsupported view" };
  return { status: 500, title: "Render error" };
}

// ---------------------------------------------------------------------------
// Hardened name decode
// ---------------------------------------------------------------------------

/**
 * decodeURIComponent that returns undefined on malformed input instead of
 * throwing. The '+' must survive into the name: it is the card-name JOINT,
 * so /Demo%20Guide+Section%20One is the junction "Demo Guide+Section One"
 * whose canonical engine key is "demo_guide+section_one" (left.key + joint
 * + right.key, name.ts #key).
 *
 * Rewriting '+' to a space here is tempting — it lets multi-word simple
 * names ride the bare-plus URL form — and it breaks junctions in EVERY
 * encoding ('+' -> space; '%2B' -> '+' -> space) while the engine still
 * composes junction keys WITH the joint. Every compound GET then 404s.
 * Junctions are addressed as /A+B and multi-word simple names as /A%20B (or
 * the underscore alias form); decode only, never re-interpret.
 */
export function decodeName(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// History view params
// ---------------------------------------------------------------------------

/**
 * The view named by the query string: the first NON-BLANK of `view` then
 * `v`, undefined when neither is present. The value rides VERBATIM into the
 * engine; the path view never falls through to params. All worker entries
 * share this one copy.
 */
export function queryViewFromUrl(url: URL): string | undefined {
  for (const key of ["view", "v"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") return value;
  }
  return undefined;
}

/** The query keys the history views read (render.ts HistoryRenderParams —
 *  the act/action selectors and the act-list paging keys). Other views
 *  ignore them, so passing them unconditionally is the faithful shape: the
 *  views pick what they need out of the full param set. */
const HISTORY_PARAM_KEYS = [
  "act_id",
  "action_id",
  "page",
  "act_seq",
  "action_view",
  "hide_diff",
  "act_context",
] as const;

/**
 * Extract the history-view params from a request's query string, for the
 * render call's HistoryRenderParams argument. BOTH entries must call this
 * and pass the result: an entry whose render call omits the argument makes
 * `?act_id=` silently render the no-param fallback rather than fail.
 */
export function historyViewParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of HISTORY_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) params[key] = value;
  }
  return params;
}

// ---------------------------------------------------------------------------
// Deck-boot name-environment prime
// ---------------------------------------------------------------------------

interface PrimeIdRow {
  id: number;
  name: string | null;
  left_id: number | null;
  right_id: number | null;
}

/** Junction cards store NULL name columns and ride left_id/right_id
 *  (db/schema.sqlite.sql). Compose their names recursively, left-associative,
 *  cycle-guarded. Returns the row list plus a name-of resolver the CQL
 *  primer (deploy entry) reuses for its key->id map. */
export function composeJunctionNames(rows: PrimeIdRow[]): {
  rows: PrimeIdRow[];
  nameOf: (id: number) => string | undefined;
} {
  const byId = new Map<number, PrimeIdRow>();
  const idToName = new Map<number, string>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      idToName.set(row.id, name.s);
    }
  }
  const composing = new Set<number>();
  const composedName = (id: number): string | undefined => {
    const direct = idToName.get(id);
    if (direct !== undefined) return direct;
    if (composing.has(id)) return undefined;
    const row = byId.get(id);
    if (row === undefined || row.left_id === null || row.right_id === null) return undefined;
    composing.add(id);
    try {
      const left = composedName(row.left_id);
      const right = composedName(row.right_id);
      if (left === undefined || right === undefined) return undefined;
      const joined = `${left}${DeckoName.JOINT}${right}`;
      idToName.set(id, joined);
      return joined;
    } finally {
      composing.delete(id);
    }
  };
  return { rows, nameOf: composedName };
}

/**
 * Install the fetcher's DB-backed name environment and warm it from the
 * deck's card rows — the boot-time composition BOTH entries run (and the
 * local engine boots with: FetchEngine#warmLexicon + installNameEnvironment).
 *
 * Mark resolution for "~<id>" and ":<codename>" strings (name.ts parse ->
 * idFromString) is synchronous and reads ONLY the warm caches through the
 * engine's peek adapters, so the boot has to install the adapters and warm
 * the caches BEFORE the first request. Without this, "/~9" answers 500 with
 * "id doesn't exist: 9" and "/:search_type" 500s with "codename doesn't
 * exist: search_type" — every mark URL is unusable. The lexicon warm reuses
 * the row load above (no second full scan); the codename codehash is its
 * own small query.
 */
export async function installDeckNameEnvironment(
  driver: SQLDatabaseDriver,
  fetcher: FetchEngine,
): Promise<void> {
  const { rows } = await driver.query<PrimeIdRow>(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const { nameOf } = composeJunctionNames(rows);
  fetcher.installNameEnvironment();
  await fetcher.codenames.ensureLoaded();
  for (const row of rows) {
    if (row.left_id !== null && row.right_id !== null) {
      const joined = nameOf(row.id);
      if (joined === undefined) continue;
      fetcher.lexicon.write(row.id, DeckoName.parse(joined), [row.left_id, row.right_id]);
    } else if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      fetcher.lexicon.write(row.id, name, row.name);
    }
  }
}

/**
 * A card's stored content as the JSON surfaces may show it. A password
 * card's content is its digest, which is never shown to anyone, owner and
 * administrators included — it renders as "encrypted".
 */
export function publicDbContent(record: { name?: DeckoName; dbContent?: string }): string {
  if (record.name?.rightName?.key === "*password") return "encrypted";
  return record.dbContent ?? "";
}
