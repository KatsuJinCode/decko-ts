import { describe, it, expect } from "vitest";
import {
  closeNotifyWorld,
  freshNotifyWorld,
  givenWatching,
  JOE_USER,
  type NotifyWorld,
} from "./gherkin-notify-steps.js";

describe("notify debug3", () => {
  it("probes Banana+color(s) resolution and the watch-seed collision", async () => {
    let nw: NotifyWorld | undefined;
    try {
      nw = await freshNotifyWorld(JOE_USER);
      await nw.engine.createCard({ name: "Banana+colors", content: "yellow" });
      await nw.engine.createCard({ name: "Banana+flavor", content: "sweet" });
      const f = nw.world.storage.fetcher;
      for (const n of ["Banana", "Banana+color", "Banana+colors", "Banana+flavor"]) {
        const c = await f.fetchByName(n);
        console.log("FETCH", n, "->", c === undefined ? "undefined" : { id: c.id, key: c.key, leftId: c.leftId, rightId: c.rightId });
      }
      // what are the right-side cards 451 and 453, really?
      for (const id of [451, 453]) {
        const c = await f.fetchById(id);
        console.log("BYID", id, "->", c === undefined ? "undefined" : { id: c.id, name: c.name?.s, key: c.key, leftId: c.leftId, rightId: c.rightId });
      }
      const rows = await nw.world.storage.selectAll<{ id: number; key: string | null; left_id: number | null; right_id: number | null; type_id: number }>(
        "SELECT id, key, left_id, right_id, type_id FROM cards WHERE id >= 450 ORDER BY id",
      );
      console.log("ROWS>=450:", JSON.stringify(rows));
      await givenWatching(nw.world, "Joe Camel", "Banana+color+*self");
      console.log("watch 1 ok");
      await givenWatching(nw.world, "Joe Camel", "Banana+colors+*self");
      console.log("watch 2 ok");
      expect(true).toBe(true);
    } finally {
      if (nw) await closeNotifyWorld(nw);
    }
  });
});
