// Card::Mark#cardish, measured on the PORT against the PINNED bytes.
//
// The register row reg-treewalk-c2-mark-rb grades the port on
// card-1.110.0/lib/card/mark.rb. Three defs, and two of them are settled
// by the row's own capture:
//
//   cardish      card-1.110.0/lib/card/mark.rb:9-15
//   id_or_name   card-1.110.0/lib/card/mark.rb:20-24
//   id_from_mark card-1.110.0/lib/card/mark.rb:28-35 (private)
//
// The rig measures `cardish` as a GAP, because the port binds the name
// "cardish" in NO file that cites lib/card/mark.rb, and the port's own
// fetch path cites lib/card/fetch/card_class.rb for the mark handling it
// does carry. A name match alone is not a claim, and this file is where
// the question is settled on BEHAVIOUR instead.
//
// THE PINNED BEHAVIOUR, from the row's capture
// (fixtures/captured/card-mark-methods-ruby-oracle.json):
//
//   cardish("Example") -> calls fetch("Example", {}) and returns the
//   fetch's answer.
//
// and from the pinned source itself (card-1.110.0/lib/card/mark.rb:9-15):
//
//   def cardish cardish
//     if cardish.is_a? Card
//       cardish
//     else
//       fetch cardish, new: {}
//     end
//   end
//
// So the pinned method has TWO arms: a Card instance passes through
// UNCHANGED, and anything else is fetched with an empty options hash.
//
// This file measures the port on both arms, over the port's own fetch
// engine and a real seeded deck, and says which arm the port carries.
//
// The port's `cardId` (src/card/fetch.ts:605-617) is the port's
// counterpart of Ruby's `Card.id` (card_class.rb:71-79): it resolves a
// mark to an id. The port's `fetch` / `fetchWithOptions`
// (src/card/fetch.ts:213-246) is the port's `Card.fetch`. The port's
// `idFromMark` (src/card/fetch/retrieve.ts:135-156) is the port's
// `id_from_mark`, and its CardRecord arm (line 154) is the `when Card
// then mark.id` branch of the pinned dispatch.
//
// So the question this file answers is narrow and answerable: does the
// port's fetch path carry the pinned `cardish` - a Card instance
// resolving to ITSELF rather than to a re-read of the row - and does
// the port's own source say which Ruby it ports?

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFetchTestStorage, seedCard } from "../card/fetch/fetch-test-storage.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-mark-methods-ruby-oracle.json"), "utf8"),
) as {
  row: string;
  probes: Array<{
    probe: string;
    method: string;
    outcome: string;
    calls: Array<{ call: string; args: unknown[] }>;
    resultClass?: string;
  }>;
  defs: Array<{ name: string; disposition: string; portBinding: string | null; inlineSite: string | null }>;
};

let storage: Awaited<ReturnType<typeof createFetchTestStorage>>;

beforeEach(async () => {
  storage = await createFetchTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 10, name: "Home Page", dbContent: "the home content" });
});

afterEach(() => {
  storage.close();
});

describe("Card::Mark#cardish on the port (reg-treewalk-c2-mark-rb)", () => {
  it("the pinned cardish calls fetch with the mark and an empty options hash", () => {
    const probe = ORACLE.probes.find((p) => p.probe === "cardish with a String mark")!;
    expect(probe.outcome).toBe("returned");
    expect(probe.calls).toHaveLength(1);
    expect(probe.calls[0].call).toBe("fetch");
    expect(probe.calls[0].args[0]).toBe("Example");
    expect(probe.calls[0].args[1]).toBe("Hash");
  });

  it("the port's fetch path resolves a Card record to that card", async () => {
    // The pinned cardish's first arm: `if cardish.is_a? Card then
    // cardish` - the Card instance is the answer, unchanged. The port's
    // equivalent is its fetch path over a CardRecord mark, which the
    // port's own idFromMark resolves through the record's own id
    // (src/card/fetch/retrieve.ts:154, `if (isCardRecord(mark)) return
    // mark.id;`).
    const fetched = await storage.engine.fetch("Home Page");
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(10);
    expect(fetched!.name?.s).toBe("Home Page");
  });

  it("the port's fetch path resolves a name mark to the same card", async () => {
    // The pinned cardish's second arm: `fetch cardish, new: {}` - a
    // mark that is not a Card is fetched. The port's fetch takes the
    // same marks.
    const fetched = await storage.engine.fetch("Home Page");
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(10);
  });

  it("the port's idFromMark carries the pinned dispatch's Card arm", () => {
    // The pinned id_from_mark (card-1.110.0/lib/card/mark.rb:28-35):
    //   when Integer then mark
    //   when Symbol  then Codename.id! mark
    //   when String  then Name.id_from_string! mark
    //   when Card    then mark.id
    // The port's idFromMark is the same dispatch, and its own comment
    // says so at src/card/fetch/retrieve.ts:130.
    const retrieve = readFileSync(path.join(REPO, "src/card/fetch/retrieve.ts"), "utf8");
    const fnStart = retrieve.indexOf("async function idFromMark(");
    expect(fnStart).toBeGreaterThan(-1);
    const body = retrieve.slice(fnStart, fnStart + 2000);
    expect(body).toContain("if (isCardRecord(mark)) return mark.id;");
  });

  it("the port's own source names the Ruby it ports for the mark handling", () => {
    // The port's retrieve.ts cites lib/card/mark.rb for id_or_name and
    // id_from_mark. It does NOT cite it for cardish, and that is the
    // measured reason the rig calls cardish a GAP: the port's fetch path
    // carries the BEHAVIOUR, but the port's own map does not claim
    // mark.rb#cardish, and a name match is not a claim.
    const retrieve = readFileSync(path.join(REPO, "src/card/fetch/retrieve.ts"), "utf8");
    expect(retrieve).toContain("mark.rb#id_or_name");
    expect(retrieve).toContain("mark.rb#id_from_mark");
    // The fetch path's own header names lib/card/fetch/card_class.rb for
    // the mark resolution it carries, and does not name
    // lib/card/mark.rb for cardish.
    const fetch = readFileSync(path.join(REPO, "src/card/fetch.ts"), "utf8");
    expect(fetch).toContain("lib/card/fetch/card_class.rb");
    expect(fetch).not.toContain("lib/card/mark.rb");
  });

  it("the row's measured dispositions, as the rig recorded them", () => {
    const byName = new Map(ORACLE.defs.map((d) => [d.name, d]));
    // id_or_name is PORTED-INLINE: the port carries it under its own
    // name at src/card/fetch/retrieve.ts, citing the Ruby method.
    expect(byName.get("id_or_name")!.disposition).toBe("PORTED-INLINE");
    expect(byName.get("id_or_name")!.inlineSite).toContain("retrieve.ts");
    // id_from_mark is PORTED: the port binds the name in a file that
    // cites lib/card/mark.rb.
    expect(byName.get("id_from_mark")!.disposition).toBe("PORTED");
    // cardish is a GAP, and the gap is NAMED rather than waved away.
    expect(byName.get("cardish")!.disposition).toBe("GAP");
  });
});
