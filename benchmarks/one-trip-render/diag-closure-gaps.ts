// benchmarks/one-trip-render/diag-closure-gaps.ts
// WHAT THIS IS: the closure-gap diagnostic — which cards the current render
// reads that the include+side+type edge closure misses, and the statements
// that fetch them. Decides which edge classes the builder must add before
// the superset pin can pass. Lane-internal diagnostic; not part of the
// module surface.
//
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:better-sqlite3 --external:sass --external:coffeescript \
//     --outfile=benchmarks/one-trip-render/diag-closure-gaps.mjs \
//     benchmarks/one-trip-render/diag-closure-gaps.ts
//   node benchmarks/one-trip-render/diag-closure-gaps.mjs --page Home

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { DeckoName } from "../../src/card/name.js";
import { referencedNames } from "../../src/card/render/nest-syntax.js";

const MIRROR = "benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

function cardIdsFromRows(rows: unknown[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const id = rec["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id)) continue;
    if ("key" in rec || "type_id" in rec || "db_content" in rec || "trash" in rec || "left_id" in rec) {
      ids.push(id);
    }
  }
  return ids;
}

class Cap implements SQLDatabaseDriver {
  statements: { sql: string; params: unknown[]; cardIds: number[] }[] = [];
  constructor(private inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const r = await this.inner.query<T>(sql, params);
    this.statements.push({ sql, params, cardIds: cardIdsFromRows(r.rows as unknown[]) });
    return r;
  }
  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    const res = await this.inner.batch(stmts);
    res.forEach((r, i) =>
      this.statements.push({
        sql: (stmts[i] as { sql?: string })?.sql ?? "",
        params: (stmts[i] as { params?: unknown[] })?.params ?? [],
        cardIds: cardIdsFromRows(r.rows as unknown[]),
      }),
    );
    return res;
  }
}

interface CardsRowish {
  id: number;
  name: string | null;
  key: string | null;
  left_id: number | null;
  right_id: number | null;
  type_id: number;
  db_content: string | null;
  codename: string | null;
  trash: number;
}

async function main(): Promise<void> {
  const page = arg("page", "Home");
  const base = new LocalSqliteDriver({ path: MIRROR, readonly: true });
  const cap = new Cap(base);
  const fetcher = new FetchEngine(cap);
  await fetcher.codenames.ensureLoaded();
  fetcher.installNameEnvironment();
  const render = new RenderEngine(fetcher);
  const html = await render.render(page, "open", {});
  console.log("html bytes", html.length, "statements", cap.statements.length);

  const touched = new Set<number>();
  for (const s of cap.statements) {
    // Boot folds are engine state, not page dependency data: the codename
    // registry's one-time load returns 100+ codenamed rows in ONE statement
    // and the payload can never cover them (they are a named residue
    // class). Exclude it from the touched reference.
    if (/FROM cards\s+WHERE codename IS NOT NULL/i.test(s.sql)) continue;
    for (const id of s.cardIds) touched.add(id);
  }

  const cards = (await base.query<CardsRowish>(
    'SELECT id, name, "key", left_id, right_id, type_id, db_content, codename, trash FROM cards WHERE trash=0',
    [],
  )).rows;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const names = new Map<number, string>();
  {
    let pending = [...cards];
    for (let pass = 0; pass < 64 && pending.length; pass++) {
      const still: CardsRowish[] = [];
      for (const c of pending) {
        if (c.name !== null) {
          names.set(c.id, c.name);
          continue;
        }
        if (c.left_id === null || c.right_id === null) {
          still.push(c);
          continue;
        }
        const l = names.get(c.left_id);
        const r = names.get(c.right_id);
        if (l === undefined || r === undefined) {
          still.push(c);
          continue;
        }
        names.set(c.id, `${l}+${r}`);
      }
      if (still.length === pending.length) break;
      pending = still;
    }
  }
  const keyIdMap = new Map<string, number>();
  for (const [id, name] of names) {
    try {
      keyIdMap.set(DeckoName.parse(name).key, id);
    } catch {
      /* skip */
    }
  }

  // closure: content refs (nest syntax) + sides + types (the current builder shape)
  const edges = new Map<number, Set<number>>();
  const addEdge = (a: number, b: number): void => {
    if (b === null || b === undefined) return;
    const s = edges.get(a);
    if (s === undefined) edges.set(a, new Set([b]));
    else s.add(b);
  };
  for (const c of cards) {
    if (c.db_content !== null && c.db_content !== "") {
      const selfName = names.get(c.id);
      if (selfName !== undefined) {
        for (const ref of referencedNames(c.db_content)) {
          if (ref.relative) continue;
          let abs;
          try {
            const p = DeckoName.parse(ref.name);
            abs = p.isAbsolute ? p : p.absoluteName(DeckoName.parse(selfName));
          } catch {
            continue;
          }
          const tid = keyIdMap.get(abs.key);
          if (tid !== undefined) addEdge(c.id, tid);
        }
      }
    }
    if (c.left_id !== null) addEdge(c.id, c.left_id);
    if (c.right_id !== null) addEdge(c.id, c.right_id);
    if (c.type_id > 0) addEdge(c.id, c.type_id);
  }

  const homeId = keyIdMap.get(DeckoName.parse(page).key);
  if (homeId === undefined) {
    console.log("page not found", page);
    return;
  }
  const seen = new Set<number>([homeId]);
  const q: number[] = [homeId];
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const t of edges.get(cur) ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        q.push(t);
      }
    }
  }

  const missing = [...touched].filter((id) => !seen.has(id));
  console.log("touched", touched.size, "closure", seen.size, "missing", missing.length);
  console.log("Home's own derived edges:", edges.get(homeId)?.size ?? 0);
  console.log("Home's own derived edge targets:", JSON.stringify([...(edges.get(homeId) ?? [])].slice(0, 30)));
  const homeContent = byId.get(homeId)?.db_content ?? "";
  console.log("Home content nests:", (homeContent.match(/\{\{/g) ?? []).length, "content bytes:", homeContent.length);
  const classify = (id: number): string => {
    const c = byId.get(id);
    if (c === undefined) return "no-row";
    const parts: string[] = [];
    if (c.codename !== null) parts.push(`codename=${c.codename}`);
    if (c.name !== null && /\+\*$/.test(c.name)) parts.push("rule-shape");
    if (c.name !== null && c.name.startsWith("*")) parts.push("setting-card");
    if (c.name === null) parts.push("junction");
    return parts.join(",");
  };
  const classCounts = new Map<string, number>();
  for (const id of missing) {
    const cls = classify(id) || "plain";
    classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
  }
  console.log("missing classes:", [...classCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
  for (const id of missing.slice(0, 25)) {
    const c = byId.get(id);
    const stmts = cap.statements.filter((s) => s.cardIds.includes(id));
    console.log(
      `--- ${id} [${c?.name ?? c?.key ?? "?"}] ${classify(id)}; fetched by:`,
    );
    for (const s of stmts.slice(0, 2)) {
      console.log("    ", s.sql.slice(0, 120).replace(/\s+/g, " "), JSON.stringify(s.params).slice(0, 70));
    }
  }
}

/** Shape census: groups the render's statements by SQL prefix with sample
 *  ids, so the shell-seed seam is grounded in the actual fetch families. */
async function shapeCensus(): Promise<void> {
  const base = new LocalSqliteDriver({ path: MIRROR, readonly: true });
  const cap = new Cap(base);
  const fetcher = new FetchEngine(cap);
  await fetcher.codenames.ensureLoaded();
  fetcher.installNameEnvironment();
  const render = new RenderEngine(fetcher);
  await render.render(arg("page", "Home"), "open", {});
  const shapes = new Map<string, { count: number; ids: Set<number>; sample: string }>();
  for (const st of cap.statements) {
    const key = st.sql.replace(/\s+/g, " ").slice(0, 100);
    const entry = shapes.get(key) ?? { count: 0, ids: new Set<number>(), sample: "" };
    entry.count += 1;
    for (const id of st.cardIds) entry.ids.add(id);
    if (!entry.sample) entry.sample = JSON.stringify(st.params).slice(0, 80);
    shapes.set(key, entry);
  }
  const rows = [...shapes.entries()].sort((a, b) => b[1].ids.size - a[1].ids.size);
  for (const [sql, info] of rows.slice(0, 30)) {
    console.log(`ids=${info.ids.size} calls=${info.count} params=${info.sample} :: ${sql}`);
  }
}

if (process.argv.includes("--shapes")) {
  shapeCensus().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
