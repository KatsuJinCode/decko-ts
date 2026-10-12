// M4 — render-time validation sweep: Date-type cards (type_code "date")
// with non-date content raise `Date::Error: invalid date` (Ruby stdlib
// Date.parse). Ruby raises on the dispatched content views (:open and
// :content) for Date-typed cards whose content is a random string, and
// never for views that do not parse the content.
//
// Port parity: same class (`Date::Error`) with the same literal message
// ("invalid date"), raised at the view-dispatch boundary — so the replay
// handler emits the exact CAPTURE_ERROR sentinel bytes the recorded
// surface carries.

import { describe, expect, it } from "vitest";
import {
  DATE_ERROR_CLASS_NAME,
  DateError,
  dateError,
  isValidDateContent,
} from "../../../src/card/render/errors.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

describe("Date::Error — Date-type card parse failure (M4 sweep)", () => {
  // ----- the class itself ---------------------------------------------------

  it("class name is the Ruby literal 'Date::Error'", () => {
    expect(DateError.name).toBe(DATE_ERROR_CLASS_NAME);
    expect(DATE_ERROR_CLASS_NAME).toBe("Date::Error");
  });

  it("constructor.name matches the corpus sentinel's class prefix", () => {
    const err = dateError();
    expect(err.constructor.name).toBe("Date::Error");
    expect(err.name).toBe("Date::Error");
  });

  it("default message is the literal 'invalid date'", () => {
    const err = dateError();
    expect(err.message).toBe("invalid date");
  });

  // ----- the content validator ---------------------------------------------

  it("isValidDateContent rejects random alphabetic content the deck carries", () => {
    // Every invalid Date-card content class the deck carries is rejected
    // by the validator; the same call raises in Ruby.
    for (const content of ["brcvtwrvz", "kieqzamnqc", "iaqgzhboog", "gneyrpsuto", "hswzwafijw"]) {
      expect(isValidDateContent(content)).toBe(false);
    }
  });

  it("isValidDateContent rejects empty content", () => {
    expect(isValidDateContent("")).toBe(false);
  });

  it("isValidDateContent accepts common date formats JS understands", () => {
    // JS Date.parse is stricter than Ruby's Date.parse (the port is
    // strict-by-construction); valid ISO 8601 inputs are accepted by
    // both engines.
    expect(isValidDateContent("2023-01-15")).toBe(true);
    expect(isValidDateContent("January 15, 2023")).toBe(true);
  });

  // ----- the render pipeline surfaces the raise ----------------------------

  it("rendering :open of a Date-type card with non-date content raises DateError", async () => {
    // A Date-typed card with random-string content raises Date::Error on
    // its :open view.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
      await seedCard(storage, {
        id: 1135,
        name: "broken date one",
        typeId: 90,
        dbContent: "brcvtwrvz",
      });
      let captured: unknown;
      try {
        await storage.engine.render("broken_date_one", "open");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.constructor.name).toBe("Date::Error");
      expect(err.message).toBe("invalid date");
    } finally {
      storage.close();
    }
  });

  it("rendering :content of a Date-type card with non-date content raises DateError", async () => {
    // The same validation fires on :content — the view-gated raise runs
    // for whichever dispatched content view is requested.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
      await seedCard(storage, {
        id: 1211,
        name: "broken date two",
        typeId: 90,
        dbContent: "iaqgzhboog",
      });
      let captured: unknown;
      try {
        await storage.engine.render("broken_date_two", "content");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err.constructor.name).toBe("Date::Error");
      expect(err.message).toBe("invalid date");
    } finally {
      storage.close();
    }
  });

  it("rendering :open of a Date-type card with valid ISO content does not raise", async () => {
    // Sanity pin: valid date content must render, not raise.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 90, name: "Date", codename: "date", typeId: 2 });
      await seedCard(storage, {
        id: 500,
        name: "good date",
        typeId: 90,
        dbContent: "2023-01-15",
      });
      const html = await storage.engine.render("good_date", "open");
      expect(typeof html).toBe("string");
      expect(html).toContain("good_date-open-view");
    } finally {
      storage.close();
    }
  });

  // ----- date-shaped fixture: type card name is NOT "Date" -----------------
  //
  // The unit fixtures above seed the Date type card with `name: "Date"`
  // — a typeName-keyed gate (`card.typeName === "Date"`) would match
  // them and hide the bug from the test bed. Real decks carry Date cards
  // whose type card has a different NAME but the codename "date". This
  // fixture reproduces that shape so the codename-keyed gate is locked by
  // the parity: a future revert to typeName would leave such cards
  // silently unvalidated.

  it("rendering :open of a Date-type card whose type card name is NOT 'Date' still raises DateError (corpus:1135 corpus-shaped fixture)", async () => {
    // The type card's NAME is the random string "evog", but its codename
    // (the codehash lookup the engine uses) is "date". A typeName gate
    // skips it; a typeCode gate fires.
    //
    // The fixture uses the simple card shape (`name: "evog+*right+*default"`
    // would require the side cards `*right` / `*default` to exist too;
    // the gate under test is type-card-name-independent, so we collapse
    // the compound to a one-name card whose type card's name is "evog"
    // and codename is "date" — the invariant under test).
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      // The type card: name="evog" (NOT "Date"), codename="date".
      await seedCard(storage, { id: 17, name: "evog", codename: "date", typeId: 2 });
      // The simple card shape whose :open view raises — a random-string
      // name and content; only the type card's (name, codename) shape
      // matters for the gate.
      await seedCard(storage, {
        id: 1135,
        name: "brcvtwrvz card",
        typeId: 17,
        dbContent: "brcvtwrvz",
      });
      let captured: unknown;
      try {
        await storage.engine.render("brcvtwrvz_card", "open");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.constructor.name).toBe("Date::Error");
      expect(err.message).toBe("invalid date");
    } finally {
      storage.close();
    }
  });

  it("rendering :content of a Date-type card whose type card name is NOT 'Date' still raises DateError (corpus:1211 corpus-shaped fixture)", async () => {
    // Same type-card shape, different content — the gate keys on the
    // codename regardless of the content bytes.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 17, name: "evog", codename: "date", typeId: 2 });
      await seedCard(storage, {
        id: 1211,
        name: "iaqgzhboog card",
        typeId: 17,
        dbContent: "iaqgzhboog",
      });
      let captured: unknown;
      try {
        await storage.engine.render("iaqgzhboog_card", "content");
      } catch (err) {
        captured = err;
      }
      const err = captured as Error;
      expect(err.constructor.name).toBe("Date::Error");
      expect(err.message).toBe("invalid date");
    } finally {
      storage.close();
    }
  });

  it("rendering :closed and :title of a Date-type card with non-date content does NOT raise (corpus:1135 corpus shape)", async () => {
    // Lazy-parse seam: Ruby's Date.parse fires only inside the dispatched
    // content views (:open/:content), never for :closed/:title. An eager
    // prepare-phase raise fired on every view; the raise now lives at the
    // dispatch boundary (engine.resolveView), view-gated on :open/:content.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 17, name: "evog", codename: "date", typeId: 2 });
      await seedCard(storage, {
        id: 1135,
        name: "broken date card",
        typeId: 17,
        dbContent: "brcvtwrvz",
      });
      const closedHtml = await storage.engine.render("broken_date_card", "closed");
      expect(closedHtml).toContain("broken_date_card-closed-view");
      const titleHtml = await storage.engine.render("broken_date_card", "title");
      expect(typeof titleHtml).toBe("string");
      // The parsing views still raise at the dispatch boundary.
      let openCaptured: unknown;
      try {
        await storage.engine.render("broken_date_card", "open");
      } catch (err) {
        openCaptured = err;
      }
      expect((openCaptured as Error)?.constructor.name).toBe("Date::Error");
      let contentCaptured: unknown;
      try {
        await storage.engine.render("broken_date_card", "content");
      } catch (err) {
        contentCaptured = err;
      }
      expect((contentCaptured as Error)?.constructor.name).toBe("Date::Error");
    } finally {
      storage.close();
    }
  });

  // ----- the replay sentinel contract --------------------------------------

  it("the raised error reproduces the exact CAPTURE_ERROR sentinel bytes the corpus:1135 capture recorded", () => {
    // Direct byte-equality pin: the sentinel for a raising :open view is
    //   CAPTURE_ERROR: Date::Error: invalid date
    const err = dateError();
    const sentinel = `CAPTURE_ERROR: ${err.constructor.name}: ${err.message}`;
    expect(sentinel).toBe("CAPTURE_ERROR: Date::Error: invalid date");
  });
});
