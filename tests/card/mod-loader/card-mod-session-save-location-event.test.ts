// save_current_location (completeness register, events table row
// card-mod-session; register verdict PARTIAL "body disposition not
// individually audited this pass").
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-session-0.20.0/set/all/location_history.rb:
//
//   location_history.rb:6-8
//     event :save_current_location, before: :show_page, on: :read do
//       Env.save_location self
//     end
//
//   # with its own guards, location_history.rb:12-17 / :47-51
//   def save_location(card)
//     ...
//     return unless save_location?(card)
//     Env.session.location_history.push(request.url) ... uniq!
//   end
//
// DISPOSITION: MECHANISM PORTED, READ-PATH HOOK PARTIAL — named, with the
// exact line that is wired and the exact one that is not.
//
// What the port HAS (all read this session):
// - the mechanism: saveLocation + shouldSaveLocation + locationHistory in
//   card/session/visitor-session.ts, ported from location_history.rb
//   (push, then uniq keeping the FIRST occurrence; the location-shaped-URL
//   test; HISTORY_LIMIT);
// - the guard: shouldSaveLocation is save_location? — HTML, not ajax, a
//   known card, and not the signin card (location_history.rb:47-51);
// - a cookie-level host hook: pageViewCookie
//   (visitor-session.ts:178), which applies the guard, saves, and returns a
//   Set-Cookie value only when the state changed;
// - ONE wired live caller: the write route's ERROR-page arm
//   (write-routes.ts:2262-2268) saves the location when an HTML non-ajax
//   request renders a known card's error page — the same show_page
//   situation, cited there by this very event name.
//
// What the port does NOT have: pageViewCookie has no caller outside its own
// unit test, and the ordinary card-page render host does not call
// saveLocation at all. So on a plain GET of a card page the history does
// not grow, where Ruby's `before: :show_page` hook would grow it.
//
// That is why the registration stays fn-less AND the mod file's own note is
// right in substance ("the read-path EVENT hook is unwired") — the audit's
// contribution is to make the boundary measurable rather than approximate:
// these tests FAIL if the ordinary read host stops being absent (a lane
// wiring it would trip the absence check and force this row's verdict to be
// re-derived) and FAIL if the mechanism rots.
//
// No Ruby engine was executed for this row in this session.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  locationHistory,
  pageViewCookie,
  saveLocation,
  shouldSaveLocation,
} from "../../../src/card/session/visitor-session.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModSession from "../../../src/card/mod-loader/mods/card-mod-session.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

function sessionSource(): string {
  return readFileSync(
    new URL("../../../src/card/session/visitor-session.ts", import.meta.url),
    "utf8",
  );
}

describe("save_current_location (location_history.rb:6-8) — the declaration", () => {
  it("carries before: show_page and NO stage of its own, exactly as Ruby declares", () => {
    const decl = declaredEvents(cardModSession).find((d) => d.event === "save_current_location");
    expect(decl, "save_current_location not declared").toBeDefined();
    expect(decl!.setPath).toBe("all/location_history");
    // events.rb:6 — `before: :show_page`. Ruby clears @stage for a before:
    // event, so the declaration must carry NO `at`. That is the shape.
    expect(decl!.before).toBe("show_page");
    expect(decl!.at).toBeUndefined();
    // on: :read has no arm in the port's trigger union; the mod file records
    // it in prose at the registration. Pinned so a future trigger union
    // gains the read arm deliberately.
    expect(decl!.on).toBeUndefined();
  });

  it("is in no save stage — show_page is outside the nine save stages", () => {
    const registry = defaultDeckEventRuntime().registry;
    const stages = ["initialize", "prepare_to_store", "prepare_to_validate", "validate",
      "store", "integrate", "finalize"] as const;
    for (const stage of stages) {
      expect(
        registry.forStage(stage).some((e) => e.event === "save_current_location"),
        `save_current_location appeared in ${stage} — show_page is not a save stage`,
      ).toBe(false);
    }
    // and it IS registered, so the declaration is real (the loader's
    // resolveOrder is void, so the registry is the thing to read)
    const loader = new ModLoader([{ manifest: cardModSession }]);
    loader.resolveOrder({ gemMods: ["session"] });
    loader.load();
    expect(loader.eventRegistry().all().some((e) => e.event === "save_current_location")).toBe(true);
    loader.reset();
  });
});

describe("the mechanism, pinned by behaviour (location_history.rb:12-17, :47-51)", () => {
  it("save_location? — HTML, not ajax, a known card, and not the signin card", () => {
    expect(shouldSaveLocation({ known: true, html: true, ajax: false })).toBe(true);
    expect(shouldSaveLocation({ known: false, html: true, ajax: false })).toBe(false);
    expect(shouldSaveLocation({ known: true, html: false, ajax: false })).toBe(false);
    expect(shouldSaveLocation({ known: true, html: true, ajax: true })).toBe(false);
    expect(
      shouldSaveLocation({ known: true, html: true, ajax: false, codename: "signin" }),
    ).toBe(false);
  });

  it("save_location pushes the URL and uniq keeps the FIRST occurrence (not the last)", () => {
    const state = { cards: {} };
    // locationHistory seeds ["\/"] on first use — Ruby's Env.session
    // location_history starts the same way.
    saveLocation(state, "http://h/A");
    saveLocation(state, "http://h/B");
    saveLocation(state, "http://h/A");
    // Ruby: push then `uniq!` — a repeat does NOT move to the end, so A
    // stays FIRST. Under last-wins dedupe this would read ["/", "B", "A"].
    expect(locationHistory(state)).toEqual(["/", "http://h/A", "http://h/B"]);
  });

  it("save_location ignores a non-location URL (the LOCATION test)", () => {
    const state = { cards: {} };
    saveLocation(state, "mailto:someone@example.invalid");
    expect(locationHistory(state)).toEqual(["/"]);
  });

  it("pageViewCookie applies the guard and returns a cookie ONLY when the state changed", () => {
    // guarded off: no cookie at all
    expect(pageViewCookie(undefined, "http://h/A", { known: false, html: true, ajax: false })).toBeUndefined();
    expect(pageViewCookie(undefined, "http://h/*signin", { known: true, html: true, ajax: false, codename: "signin" })).toBeUndefined();
    // guarded on: a cookie carrying the new history
    const cookie = pageViewCookie(undefined, "http://h/A", { known: true, html: true, ajax: false });
    expect(cookie, "a saved location produced no cookie").toBeDefined();
  });
});

describe("the READ-PATH HOOK boundary, stated precisely", () => {
  it("the write route's error-page arm saves the location, citing this event by name", () => {
    const route = readFileSync(
      new URL("../../../src/server/write-routes.ts", import.meta.url),
      "utf8",
    );
    expect(route).toContain("event :save_current_location");
    expect(route).toContain("saveLocation(visit, requestUrl(req))");
  });

  it("pageViewCookie has no caller outside its own module and tests — the ORDINARY read hook is absent", () => {
    // This is the honest half of the verdict. If a lane wires the normal
    // card-page render to it, this test FAILS and the row's verdict must be
    // re-derived (the gap closes) rather than silently staying "partial".
    const files = [
      "../../../src/server/write-routes.ts",
      "../../../src/server/cloudflare-write-routes.ts",
      "../../../src/card/render/page.ts",
      "../../../src/card/render.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(
        src.includes("pageViewCookie"),
        `${rel} now calls pageViewCookie — re-derive save_current_location's verdict`,
      ).toBe(false);
    }
  });

  it("the mod file states the boundary, and keeps naming the mechanism", () => {
    const mod = readFileSync(
      new URL("../../../src/card/mod-loader/mods/card-mod-session.ts", import.meta.url),
      "utf8",
    );
    // the unwired read-path hook is acknowledged, not glossed
    expect(mod).toMatch(/read-path EVENT hook is unwired|read path runs no card events/);
    // and the ported mechanism it defers to is named
    expect(mod).toContain("saveLocation");
  });

  it("the mechanism module cites Ruby's lines, so the port keeps its provenance", () => {
    const src = sessionSource();
    expect(src).toContain("location_history.rb:12-17");
    expect(src).toContain("location_history.rb:47-51");
  });
});
