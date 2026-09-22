// Scratch probe (archive): per-render wall time for 15 DISTINCT corpus
// entries on the shard-0 enriched deck, with the driver's prepare cache in
// place. First entry is cold (compiles the statement set); the rest show
// the steady-state per-entry cost the capstone replay will run at.
import { describe, expect, it, afterAll } from "vitest";
import {
  createStructureSeededStorageFor,
} from "../../../tests/card/render/structure-corpus-seeding.js";
import { readShardLines } from "../../../tests/card/render/permission-corpus-seeding.js";

let storage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;
afterAll(() => {
  storage?.close();
});

describe("prepare-cache steady-state render cost", () => {
  it("times 15 distinct renders", { timeout: 3_600_000 }, async () => {
    const lines = readShardLines();
    const ids = new Set(lines.map((l) => l.id));
    storage = await createStructureSeededStorageFor(ids);

    const times: number[] = [];
    for (const line of lines.slice(0, 15)) {
      const views = Object.keys(line.views ?? {}).filter(
        (v) => !((line.views ?? {})[v] as string).startsWith("<span class=\"denied\""),
      );
      if (views.length === 0) continue;
      const t = Date.now();
      await storage.engine.render(line.name, views[0] as string);
      times.push(Date.now() - t);
    }
    const [first, ...rest] = times;
    const avg = Math.round(rest.reduce((a, b) => a + b, 0) / Math.max(1, rest.length));
    console.log(
      `RENDER_MS first=${first} avg_rest=${avg} all=[${times.join(",")}] entries=${times.length}`,
    );
    expect(times.length).toBeGreaterThan(5);
  });
});
