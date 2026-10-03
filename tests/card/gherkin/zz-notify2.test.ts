import { describe, it, expect } from "vitest";
import {
  closeNotifyWorld,
  freshNotifyWorld,
  givenWatching,
  JOE_USER,
  type NotifyWorld,
} from "./gherkin-notify-steps.js";

describe("notify debug3", () => {
  it("watches the save-path dispatch", async () => {
    let nw: NotifyWorld | undefined;
    try {
      nw = await freshNotifyWorld(JOE_USER);
      await nw.engine.createCard({ name: "Ulysses", typeCode: "book", content: "{{+author}} {{+illustrator}}" });
      await givenWatching(nw.world, "Joe Camel", "Ulysses+*self");
      const f = nw.world.storage.fetcher;
      const t = await f.fetchByName("follower notification email");
      const subj = await f.fetchByName("follower notification email+*subject");
      console.log("TEMPLATE CARD:", t?.id, "SUBJ:", subj?.id, subj?.dbContent);
      console.log("BEFORE CREATE captured:", nw.transport.count());
      await nw.engine.createCard({ name: "Ulysses+Author", content: "James Joyce" });
      console.log("AFTER CREATE captured:", nw.transport.count(), JSON.stringify(nw.transport.captured().map((m) => ({ to: m.to, subject: m.subject }))));
      expect(nw.transport.count()).toBeGreaterThan(0);
    } finally {
      if (nw) await closeNotifyWorld(nw);
    }
  });
});
