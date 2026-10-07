// tools/d1-trickle/trickle-lib.mjs — the pure parts of the D1 trickle
// importer: SQL literals, statement batching under D1's limits, the ordered
// import plan, the daily write budget, and the manifest of complete pages.
// No I/O here except what callers pass in, so every rule is unit-tested.

/** D1 limits the batching respects (Cloudflare docs, "D1 Limits"; cited in
 *  brandonDojoTech recovery/CLOUDFLARE-HOSTING.md). The statement cap is
 *  100 KB; 90,000 bytes leaves room for the INSERT head. Bound parameters
 *  are capped at 100 per statement. */
export const D1_MAX_STATEMENT_BYTES = 100_000;
export const DEFAULT_STATEMENT_BYTES = 90_000;
export const D1_MAX_BOUND_PARAMS = 100;

/** A value as an exact SQLite literal, or undefined when it cannot be one
 *  (strings holding NUL, which a literal cannot carry). */
export function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`non-finite number ${v} has no SQL literal`);
    if (Number.isInteger(v)) return String(v);
    // Shortest round-trip form; SQLite parses it back to the same double.
    const s = String(v);
    return /[.eE]/.test(s) ? s : `${s}.0`;
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") {
    if (v.includes("\u0000")) return undefined;
    return `'${v.replace(/'/g, "''")}'`;
  }
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  throw new Error(`unsupported value type ${typeof v}`);
}

const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** INSERT OR IGNORE statements for rows of one table. Rows are packed into
 *  multi-row literal INSERTs up to maxBytes; a row whose literal form will
 *  not fit (or holds a NUL) goes alone with its long or NUL-bearing values
 *  bound as parameters. OR IGNORE makes a re-send after a crash cost no
 *  writes (measured on local D1: 0 rows written for a present row). */
export function insertStatements(table, columns, rows, { maxBytes = DEFAULT_STATEMENT_BYTES } = {}) {
  const head = `INSERT OR IGNORE INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES `;
  const enc = new TextEncoder();
  const out = [];
  let pending = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pending.length === 0) return;
    out.push({ sql: head + pending.join(","), params: [], rows: pending.length });
    pending = [];
    pendingBytes = 0;
  };
  for (const row of rows) {
    const lits = columns.map((c) => sqlLiteral(row[c]));
    const tuple = lits.includes(undefined) ? undefined : `(${lits.join(",")})`;
    const tupleBytes = tuple === undefined ? Infinity : enc.encode(tuple).length;
    if (tupleBytes + enc.encode(head).length <= maxBytes) {
      if (pendingBytes + tupleBytes + 1 + enc.encode(head).length > maxBytes) flush();
      pending.push(tuple);
      pendingBytes += tupleBytes + 1;
      continue;
    }
    // Alone, with the long values bound. Binding every value would need one
    // parameter per column; binding only the long ones keeps the count low.
    flush();
    const params = [];
    const parts = columns.map((c, i) => {
      const lit = lits[i];
      if (lit !== undefined && enc.encode(lit).length <= 1024) return lit;
      params.push(row[c]);
      return "?";
    });
    if (params.length > D1_MAX_BOUND_PARAMS) throw new Error(`row of ${table} needs ${params.length} bound values`);
    const sql = `${head}(${parts.join(",")})`;
    if (enc.encode(sql).length > maxBytes) throw new Error(`row of ${table} does not fit one statement even with bound values`);
    out.push({ sql, params: params.map((p) => (typeof p === "bigint" ? Number(p) : p)), rows: 1 });
  }
  flush();
  return out;
}

/** Split a list into chunks whose cost (sum of costOf) stays at or under
 *  maxCost; an item over maxCost on its own still gets its own chunk. */
export function chunkByCost(items, costOf, maxCost) {
  const out = [];
  let cur = [];
  let curCost = 0;
  for (const it of items) {
    const c = costOf(it);
    if (cur.length > 0 && curCost + c > maxCost) {
      out.push(cur);
      cur = [];
      curCost = 0;
    }
    cur.push(it);
    curCost += c;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Rows written one inserted row costs on D1: the table row plus one entry
 *  per index (measured locally; Cloudflare's docs say indexes add writes). */
export function rowWriteCost(indexCount) {
  return 1 + indexCount;
}

/**
 * The ordered import plan.
 *
 * input:
 *   schema        [{sql}]                       tier 1 DDL
 *   wholeTables   [{table, rows}]               tier 1 small tables
 *   baseIds       Set<number>                   tier 2 card ids
 *   baseRefIds    Set<number>                   tier 2 referers (permission rules)
 *   fixedPages    [{page, ids, refIds, status}] tier 3 (closures: card rows, and
 *                                               the cards whose references)
 *   poolPages     [{page, ids, refIds, status}] tier 4, in pool order
 *   allCardIds    number[]                      tier 5 is what is left
 *   refsByReferer Map<number, number[]>
 *   orphanRefs    number[]
 *   cardCost, refCost                           rows written per row
 *   unitCost      max predicted rows written per unit
 *
 * Every card row, and every card's set of reference rows, is in exactly
 * one unit. A page's `needsUnit` is the
 * highest unit index holding any of its ids; it is complete once every unit
 * up to that one is done. A page whose closure did not close (status other
 * than "closed") is complete only when the whole deck is in.
 */
export function buildPlan(input) {
  const { schema, wholeTables, baseIds, baseRefIds = new Set(), fixedPages, poolPages, allCardIds, refsByReferer, orphanRefs, cardCost, refCost, unitCost } = input;
  const units = [];
  // Card rows and reference rows (keyed by referer card) are placed
  // separately: a page may need a card without the references it owns.
  const unitOfCard = new Map();
  const unitOfRefs = new Map();
  const refsCost = (id) => (refsByReferer.get(id)?.length ?? 0) * refCost;
  units.push({ tier: 1, kind: "schema", label: "schema and indexes", statements: schema.length, cost: 0 });
  for (const t of wholeTables) {
    units.push({ tier: 1, kind: "table", label: `table ${t.table}`, table: t.table, rows: t.rows, cost: t.rows * (t.cost ?? 1) });
  }
  units.push({ tier: 1, kind: "stats", label: "planner statistics", cost: 0 });
  const addCards = (tier, label, cardIds, refIds) => {
    const items = [
      ...[...new Set(cardIds)].filter((id) => !unitOfCard.has(id)).map((id) => ({ id, refs: false, cost: cardCost })),
      ...[...new Set(refIds)].filter((id) => !unitOfRefs.has(id) && refsCost(id) > 0).map((id) => ({ id, refs: true, cost: refsCost(id) })),
    ].sort((a, b) => a.id - b.id || Number(a.refs) - Number(b.refs));
    for (const chunk of chunkByCost(items, (x) => x.cost, unitCost)) {
      const i = units.length;
      const ids = chunk.filter((x) => !x.refs).map((x) => x.id);
      const refs = chunk.filter((x) => x.refs).map((x) => x.id);
      units.push({ tier, kind: "cards", label, ids, refs, cost: chunk.reduce((n, x) => n + x.cost, 0) });
      for (const id of ids) unitOfCard.set(id, i);
      for (const id of refs) unitOfRefs.set(id, i);
    }
  };
  // Boot tier: its card rows and the permission rules' reference rows;
  // other reference rows a page reads arrive with that page (its closure
  // names them), the rest in tier 5.
  addCards(2, "boot: rules, types, codenames, users, roles", baseIds, baseRefIds);
  const bootEnd = units.length - 1;
  const pages = [];
  const pageEntry = (p, tier) => {
    const refIds = p.refIds ?? [];
    addCards(tier, `page ${p.page}`, p.ids, refIds);
    let needs = bootEnd;
    for (const id of p.ids) if (unitOfCard.has(id)) needs = Math.max(needs, unitOfCard.get(id));
    for (const id of refIds) if (unitOfRefs.has(id)) needs = Math.max(needs, unitOfRefs.get(id));
    pages.push({ page: p.page, tier, status: p.status, needsUnit: p.status === "closed" ? needs : null });
  };
  for (const p of fixedPages) pageEntry(p, 3);
  for (const p of poolPages) pageEntry(p, 4);
  addCards(5, "rest of the deck", allCardIds, allCardIds);
  for (const chunk of chunkByCost(orphanRefs, () => refCost, unitCost)) {
    units.push({ tier: 5, kind: "refs", label: "references without a card", ids: chunk, cost: chunk.length * refCost });
  }
  units.forEach((u, i) => (u.index = i));
  return { units, pages, totalCost: units.reduce((n, u) => n + u.cost, 0) };
}

/** UTC calendar day: D1's daily limits reset at 00:00 UTC. */
export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** The write allowance left today. `used` is the larger of this importer's
 *  own ledger and any account-wide reading the caller supplies. */
export function remainingToday({ dailyLimit, share, used }) {
  return Math.max(0, Math.floor(dailyLimit * share) - used);
}

/** Whether the next unit fits today's allowance. A unit is never split
 *  across days, so the run stops at the first unit that does not fit. */
export function unitFits(unit, remaining) {
  return unit.cost <= remaining;
}

/** Fresh or loaded checkpoint, normalised. */
export function normaliseCheckpoint(cp, planHash) {
  const base = { planHash, unitsDone: 0, inflight: null, days: {}, runs: [] };
  if (!cp) return base;
  if (cp.planHash !== planHash) {
    throw new Error("checkpoint belongs to a different plan; refusing to mix them (start a new state directory, or rebuild the plan deliberately)");
  }
  return { ...base, ...cp };
}

export function recordUsage(cp, day, { rowsWritten = 0, rowsRead = 0, requests = 0 }) {
  const d = (cp.days[day] ??= { rowsWritten: 0, rowsRead: 0, requests: 0 });
  d.rowsWritten += rowsWritten;
  d.rowsRead += rowsRead;
  d.requests += requests;
  return d;
}

/** Which pages can be served from the partial database now. */
export function manifest(plan, unitsDone) {
  const lastDone = unitsDone - 1;
  const deckComplete = unitsDone >= plan.units.length;
  const complete = [];
  const waiting = [];
  for (const p of plan.pages) {
    const ok = deckComplete || (p.needsUnit !== null && p.needsUnit <= lastDone);
    (ok ? complete : waiting).push(p.page);
  }
  const cost = (n) => plan.units.slice(0, n).reduce((s, u) => s + u.cost, 0);
  return {
    units_done: unitsDone,
    units_total: plan.units.length,
    rows_written_planned_done: cost(unitsDone),
    rows_written_planned_total: plan.totalCost,
    deck_complete: deckComplete,
    tier_done: Math.max(0, ...plan.units.slice(0, unitsDone).map((u) => u.tier)),
    complete_pages: complete,
    pages_waiting: waiting.length,
  };
}

/** Mask the per-render random slot ids, the only bytes allowed to differ
 *  between two renders of the same data: data-slot-id="..." and the same
 *  attribute HTML-escaped inside another attribute (popover content). */
export function maskSlots(s) {
  return s.replace(/data-slot-id="[^"]*"/g, 'data-slot-id=""').replace(/data-slot-id=&quot;[0-9a-f]*&quot;/g, "data-slot-id=&quot;&quot;");
}

// ---------------------------------------------------------------------------
// Page closures (used by closure.mjs)

/** Columns whose integer values name cards: id, snake_case *_id and the
 *  engine's camelCase aliases (readRuleId, ruleId, partyId, sid, ...). */
const ID_COLUMN = /^(id|sid|.*_id|.*[a-z]Id)$/;
export function idsInRows(rows) {
  const ids = new Set();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (ID_COLUMN.test(k) && (typeof v === "number" || typeof v === "bigint") && Number.isSafeInteger(Number(v))) ids.add(Number(v));
    }
  }
  return ids;
}

/** For an aggregate statement whose answer names no card (a search count),
 *  a query listing the card ids it aggregates over: the "witnesses" that
 *  must be present for the count to come out the same. Undefined when the
 *  statement has no recognised shape. */
export function witnessSql(sql) {
  const m = /^\s*SELECT\s+(?:DISTINCT\s+)?coalesce\(count\(distinct\s+(\w+)\.id\),\s*0\)\s+as\s+count\s+FROM/i.exec(sql);
  if (m) return sql.replace(m[0], `SELECT DISTINCT ${m[1]}.id AS id FROM`);
  // A one-table lookup that projects no id (SELECT type_id FROM cards
  // WHERE name = ? ...): the rows it found are its witnesses.
  const one = /^\s*SELECT\s+(?:(?!\bFROM\b)[\s\S])*?\bFROM\s+cards(?:\s+(?!WHERE\b)(\w+))?\s+(?=WHERE\b)/i.exec(sql);
  if (one && !/\b(JOIN|GROUP\s+BY|UNION)\b|,\s*cards\b/i.test(sql.slice(one[0].length - 6)) && !/\bCOUNT\(/i.test(one[0])) {
    return sql.replace(one[0], `SELECT ${one[1] ?? "cards"}.id AS id FROM cards${one[1] ? ` ${one[1]}` : ""} `);
  }
  const g = /^\s*SELECT\s+(?:(?!\bFROM\b)[\s\S])*?\bCOUNT\((?:(?!\bFROM\b)[\s\S])*?\bFROM\s+cards\s+(?=WHERE\b)/i.exec(sql);
  if (g && !/\bGROUP\s+BY\b/i.test(sql)) return sql.replace(g[0], "SELECT cards.id AS id FROM cards ");
  return undefined;
}
