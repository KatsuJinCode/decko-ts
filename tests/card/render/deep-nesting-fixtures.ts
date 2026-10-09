// The deep-nesting fixture decks, shared by the fixture sweep
// (deep-nesting-fixture-sweep.test.ts) and the round-trip attribution
// generator (deep-nesting-trip-attribution.test.ts).
//
// Card names are the ones benchmarks/run_ruby_deep_nesting_bench.rb seeds
// (BenchDN prefix), so the Ruby and TypeScript engines measure decks with the
// same names and the same nesting. The Ruby harness fills leaf bodies with
// random letters; these use a fixed 200-byte filler. Body size, not its bytes,
// is what the query and round-trip counts depend on.

import { seedCard, type RenderTestStorage } from "./render-test-storage.js";

export const PARITY_CHAIN_DEPTHS = [1, 2, 4, 8, 16] as const;
export const DEEP_RENDERABLE_CHAIN_DEPTHS = [10, 20] as const;
export const DEEP_REJECTED_CHAIN_DEPTHS = [50, 100, 200] as const;
export const FANOUTS = [1, 4, 16, 50, 100, 200] as const;
export const TREES = [
  { depth: 4, fanout: 4 }, // 1 + 4 + 16 + 64 + 256 = 341 cards
  { depth: 3, fanout: 10 }, // 1 + 10 + 100 + 1000 = 1111 cards
] as const;

export const PREFIX = "BenchDN";

const pad = (n: number, w: number): string => String(n).padStart(w, "0");

/** Deterministic body filler of `bytes` letters. */
export function filler(bytes: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const unit = alphabet.repeat(Math.ceil(bytes / alphabet.length));
  return unit.slice(0, bytes);
}

export const chainName = (depth: number, i: number): string =>
  `${PREFIX}_chain_open_d${pad(depth, 2)}_n${pad(i, 2)}`;
export const fanChildName = (f: number, i: number): string => `${PREFIX}_fan_f${pad(f, 2)}_c${pad(i, 2)}`;
export const fanRootName = (f: number): string => `${PREFIX}_fan_f${pad(f, 2)}_root`;
export const treeRootName = (d: number, f: number): string =>
  `${PREFIX}_tree_d${pad(d, 2)}_f${pad(f, 2)}_root`;
export const treeNodeName = (d: number, f: number, level: number, j: number): string =>
  `${PREFIX}_tree_d${pad(d, 2)}_f${pad(f, 2)}_l${pad(level, 2)}_n${pad(j, 4)}`;

/** Cards in a tree fixture, root included. */
export const treeCards = (depth: number, fanout: number): number =>
  1 + Array.from({ length: depth }, (_, i) => Math.pow(fanout, i + 1)).reduce((a, b) => a + b, 0);

async function seedRichTextType(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
}

/** A chain: level i nests level i + 1; the last level carries body text. */
export async function seedChain(storage: RenderTestStorage, depth: number): Promise<void> {
  await seedRichTextType(storage);
  for (let i = 1; i <= depth; i++) {
    const content =
      i < depth ? `level ${i} body {{${chainName(depth, i + 1)}|open}}` : `leaf body ${filler(200)}`;
    await seedCard(storage, {
      id: 100 + i,
      name: chainName(depth, i),
      typeId: 2,
      dbContent: content,
    });
  }
}

/** A fan: one root nesting `fanout` leaves side by side. */
export async function seedFan(storage: RenderTestStorage, fanout: number): Promise<void> {
  await seedRichTextType(storage);
  for (let i = 0; i < fanout; i++) {
    await seedCard(storage, {
      id: 1000 + i,
      name: fanChildName(fanout, i),
      typeId: 2,
      dbContent: `fan leaf ${filler(200)}`,
    });
  }
  const nests = Array.from({ length: fanout }, (_, i) => `{{${fanChildName(fanout, i)}|open}}`);
  await seedCard(storage, {
    id: 999,
    name: fanRootName(fanout),
    typeId: 2,
    dbContent: nests.join("\n"),
  });
}

/** A whole inclusion tree: root -> f^1 -> ... -> f^depth leaves. Every
 *  level's nodes nest all their children; the leaves carry body text. */
export async function seedTree(storage: RenderTestStorage, depth: number, fanout: number): Promise<void> {
  await seedRichTextType(storage);
  let nextId = 2000;
  for (let level = depth; level >= 1; level--) {
    const count = Math.pow(fanout, level);
    for (let j = 1; j <= count; j++) {
      const content =
        level < depth
          ? Array.from({ length: fanout }, (_, k) => {
              const childIndex = (j - 1) * fanout + k + 1;
              return `{{${treeNodeName(depth, fanout, level + 1, childIndex)}|open}}`;
            }).join("\n")
          : `tree leaf ${filler(200)}`;
      await seedCard(storage, {
        id: nextId++,
        name: treeNodeName(depth, fanout, level, j),
        typeId: 2,
        dbContent: content,
      });
    }
  }
  const rootChildren = Array.from({ length: fanout }, (_, k) => {
    return `{{${treeNodeName(depth, fanout, 1, k + 1)}|open}}`;
  }).join("\n");
  await seedCard(storage, {
    id: 1999,
    name: treeRootName(depth, fanout),
    typeId: 2,
    dbContent: rootChildren,
  });
}
