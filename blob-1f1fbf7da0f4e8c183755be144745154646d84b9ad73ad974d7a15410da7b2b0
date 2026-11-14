// The fetch row's class-level helpers (card_class.rb#fetch_from_cast,
// card_class.rb#fetch_name, fetch/all.rb#refresh,
// card_class.rb#standard_uri_fetch, results.rb#type_id_from_new_opts) and
// the validate_opts! guard, over real SQLite storage.
//
// The behaviour pins come from the pinned bodies: the Ruby sources cited in
// each case name the lines the port mirrors, and the storage is the same
// seeded-row deck the fetch suite uses.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFetchTestStorage,
  seedCard,
  type FetchTestStorage,
} from "./fetch-test-storage.js";
import {
  fetchFromCast,
  fetchName,
} from "../../../src/card/fetch.js";

let storage: FetchTestStorage;
let engine: FetchTestStorage["engine"];

beforeEach(async () => {
  storage = await createFetchTestStorage();
  engine = storage.engine;
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 10, name: "Home Page", dbContent: "the home content" });
});

afterEach(() => {
  storage.close();
});

describe("card_class.rb#fetch_from_cast (:58-63)", () => {
  it("fetches by the cast's id when it carries one", async () => {
    const card = await fetchFromCast(engine, { id: "10" });
    expect(card?.id).toBe(10);
    expect(card?.name?.s).toBe("Home Page");
  });

  it("fetches by the cast's name with the cast riding the new-opts", async () => {
    const card = await fetchFromCast(engine, { name: "Fresh Form", content: "cast content" });
    // Ruby: fetch(cast[:name], { new: cast }) - a new-card placeholder
    // carrying the cast's content.
    expect(card?.isNew).toBe(true);
    expect(card?.name?.s).toBe("Fresh Form");
    expect(card?.dbContent).toBe("cast content");
  });

  it("takes the id branch for id 0 (Ruby's cast[:id] ? is a truthy test)", async () => {
    // id 0 is truthy in Ruby, so the id branch runs; the port's fetch
    // answers undefined for a row no deck has.
    const card = await fetchFromCast(engine, { id: 0, name: "Home Page" });
    expect(card).toBeUndefined();
  });
});

describe("card_class.rb#fetch_name (:85-89)", () => {
  it("answers the fetched card's name", async () => {
    const name = await fetchName(engine, "Home Page");
    expect(name?.s).toBe("Home Page");
  });

  it("answers undefined for an unknown mark (Ruby's nil&.name)", async () => {
    const name = await fetchName(engine, "No Such Card");
    expect(name).toBeUndefined();
  });
});

describe("fetch/all.rb#refresh (:22-30)", () => {
  it("is the identity without force (Ruby's first line)", async () => {
    const card = await engine.fetchByName("Home Page");
    const same = await engine.refreshCard(card!, false);
    expect(same).toBe(card);
  });

  it("re-reads the LIVE row with force, past the cache", async () => {
    const card = await engine.fetchByName("Home Page");
    expect(card?.dbContent).toBe("the home content");
    // Someone else's write lands behind this engine's cache:
    await storage.driver.query("UPDATE cards SET db_content = ? WHERE id = 10", [
      "written behind the cache",
    ]);
    const refreshed = await engine.refreshCard(card!, true);
    expect(refreshed?.dbContent).toBe("written behind the cache");
  });

  it("answers undefined for a card without an id (Ruby's `return unless id`)", async () => {
    const card = await engine.fetchByName("No Such Card", { new: {} });
    expect(card?.isNew).toBe(true);
    expect(await engine.refreshCard(card!, true)).toBeUndefined();
  });
});

describe("card_class.rb#standard_uri_fetch (:117-126)", () => {
  it("builds the absent card from the card opts (the new: ride)", async () => {
    const card = await engine.standardUriFetch(
      { mark: "Form Page" },
      { content: "uri content", typeId: 2 },
    );
    expect(card?.isNew).toBe(true);
    expect(card?.name?.s).toBe("Form Page");
    expect(card?.dbContent).toBe("uri content");
    expect(card?.typeId).toBe(2);
  });

  it("assigns the opts onto a REAL card only when params[:assign] runs", async () => {
    const card = await engine.standardUriFetch(
      { mark: "Home Page", assign: true },
      { content: "preview content", typeId: 2 },
    );
    expect(card?.isNew).toBe(false);
    expect(card?.dbContent).toBe("preview content");
    expect(card?.typeId).toBe(2);
  });

  it("does not assign onto a new (not real?) card without params[:assign]", async () => {
    const card = await engine.standardUriFetch(
      { mark: "Form Page" },
      { content: "uri content", typeId: 2 },
    );
    // Ruby: `card.assign_attributes card_opts if params[:assign] && card&.real?`
    // - without assign the new card keeps exactly what the new: ride built.
    expect(card?.dbContent).toBe("uri content");
  });
});

describe("results.rb#type_id_from_new_opts (:110-114) through the renew wiring", () => {
  it("resolves the type code through the codename registry", async () => {
    const card = await engine.fetchByName("Form Page", { new: { typeCode: "basic" } });
    expect(card?.typeId).toBe(2);
  });

  it("answers an undefined type for an unknown code (Codename.id's nil)", async () => {
    const card = await engine.fetchByName("Form Page", { new: { typeCode: "no_such_code" } });
    expect(card?.typeId).toBeUndefined();
  });

  it("prefers the explicit type_id when one rides the opts", async () => {
    const card = await engine.fetchByName("Form Page", {
      new: { typeId: 2, typeCode: "no_such_code" },
    });
    expect(card?.typeId).toBe(2);
  });
});

describe("`validate_opts!` (fetch.rb:43-47)", () => {
  it("refuses the contradictory new + skip_virtual pair", async () => {
    await expect(
      engine.fetchWithOptions(["Home Page"], { new: {}, skipVirtual: true }),
    ).rejects.toThrow("fetch called with new args and skip_virtual");
  });
});
