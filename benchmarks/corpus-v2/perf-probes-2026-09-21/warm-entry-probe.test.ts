// Warm per-entry cost probe: how fast is a render on the fully prewarmed
// deck? Instrument for the sensible-driver work (2026-09-23); runs only
// when invoked directly, not part of any suite gate.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import DatabaseModule from "better-sqlite3";
const Database = (DatabaseModule as unknown as { default?: typeof DatabaseModule }) ?? DatabaseModule;
import { createStructureSeededStorageFor, readShardLines } from "../../../tests/card/render/structure-corpus-seeding.js";
import { prewarmStaticDeck } from "../prewarm-static-deck.js";

it("measures warm ms/entry on 80 shard-0 entries", { timeout: 600_000 }, async () => {
  const corpus = new Database("benchmarks/corpus-v2/bench-corpus-v2.sqlite3", { readonly: true });
  const ids = corpus.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r: any) => r.id);
  corpus.close();
  const storage = await createStructureSeededStorageFor(new Set(ids));
  const t0 = Date.now();
  await prewarmStaticDeck(storage);
  console.log("[probe] prewarm ms:", Date.now() - t0);
  const lines = readShardLines("fixtures/corpus/shard-000000.jsonl").slice(0, 20);
  const entries: { name: string; view: string; expected: string }[] = [];
  for (const line of lines) {
    if (line.views) for (const [view, html] of Object.entries(line.views)) {
      entries.push({ name: line.name, view, expected: html as string });
    }
  }
  const target = entries.find((e) => e.view === "closed") ?? entries[0];
  const t1 = Date.now();
  let statLine = "n/a";
  try {
    await storage.engine.render(target.name, target.view);
  } catch { /* ignore */ }
  const dt = Date.now() - t1;
  const targetStats = storage.engine.lastRenderStats;
  statLine = JSON.stringify({ batches: targetStats?.batches, statements: targetStats?.statements, fallbackRounds: targetStats?.fallbackRounds, cards: targetStats?.cards });
  console.log(`[probe] TARGET ${target.name}:${target.view} wallMs=${dt} stats=${statLine}`);

  // closureWarm audit: which cards stay cold despite the prewarm?
  {
    const eng = storage.engine as unknown as {
      closureWarm(record: unknown): boolean;
      fetcher: { retrieveFromCacheById(id: number): Promise<{ key?: string } | undefined> };
    };
    let cold = 0;
    const coldKeys: string[] = [];
    for (const line of readShardLines("fixtures/corpus/shard-000000.jsonl")) {
      if (!line.name) continue;
      const rec = await storage.fetcher.fetchByName(line.name);
      if (rec === undefined) continue;
      if (!eng.closureWarm(rec)) {
        cold += 1;
        if (coldKeys.length < 5) coldKeys.push(rec.key ?? line.name);
      }
    }
    console.log("[probe] closureWarm audit: cold cards =", cold);
    console.log("[probe] cold sample:", coldKeys.join(", "));
  }

  // same-entry repeats: separates per-CARD first-render cost from per-VIEW cost
  const repeat = sample[0];
  for (let i = 0; i < 3; i++) {
    const t2 = Date.now();
    try { await storage.engine.render(repeat.name, repeat.view); } catch { /* ignore */ }
    console.log(`[probe] repeat#${i} ${repeat.name}:${repeat.view} wallMs=${Date.now() - t2}`);
  }
  const stats = storage.engine.lastRenderStats;
  console.log("[probe] lastRenderStats:", JSON.stringify(stats));
  expect(sample.length).toBeGreaterThan(0);
  storage.close();
}, 600_000);
