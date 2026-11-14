// The `*previous` mark, measured against the PINNED DECK's own method.
//
// The completeness register's B8 row grades the port on `load_mark`
// (mark.rb:12-14, "the `*previous` mark -> hard_redirect to the previous
// location"). The row's note named the method and the redirect but not the
// ANSWER: what the previous location is, what shape the redirect takes,
// and what happens when the visitor has no history.
//
// fixtures/captured/previous-mark-ruby-oracle.json is what
// oracle-capture-previous-mark-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own interpret_mark and the PINNED card gem's
// own previous_location:
//
//   the mark    decko-0.20.0/lib/card_controller/mark.rb:10-20
//                 when "*previous"
//                   hard_redirect Card::Env.previous_location
//   the answer  decko-0.20.0/lib/card_controller/response.rb:39-50
//                 def hard_redirect url, status=302
//                   url = card_url url
//                   if Card::Env.ajax?
//                     render json: { redirect: url }
//                   else
//                     redirect_to url, status: status
//                   end
//                 end
//   the target  card-1.110.0/lib/card/env/location_history.rb:6-21
//                 session[:history] ||= [Env::Location.card_path("")]
//                 previous_location -> location_history&.last
//
// The port's own answer is measured over the real edge request core in
// tests/deploy/bunny-edge-previous-mark-redirect.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  previousLocation,
  readVisitorSession,
  saveLocation,
  visitorSessionCookie,
} from "../../src/card/session/visitor-session.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/previous-mark-ruby-oracle.json"), "utf8"),
) as {
  origin: string;
  withHistory: {
    previousLocation: string;
    redirected: { url: string; status: number } | null;
    rendered: { json: Record<string, string> } | null;
    error: string | null;
  };
  withoutHistory: {
    previousLocation: string;
    redirected: { url: string; status: number } | null;
    error: string | null;
  };
  ajaxFlavor: {
    previousLocation: string;
    redirected: { url: string; status: number } | null;
    rendered: { json: Record<string, string> } | null;
    error: string | null;
  };
  sources: {
    mark: Array<{ line: number; text: string }>;
    hardRedirect: Array<{ line: number; text: string }>;
    locationHistory: Array<{ line: number; text: string }>;
  };
};

describe("the *previous mark, against the pinned deck gem", () => {
  it("the pinned interpret_mark hard-redirects to the previous location", () => {
    expect(ORACLE.withHistory.error).toBeNull();
    expect(ORACLE.withHistory.previousLocation).toBe("https://deck.test/Welcome?tab=1");
    // Ruby's hard_redirect: absolute via card_url, 302 for an ordinary
    // request.
    expect(ORACLE.withHistory.redirected).toEqual({
      url: "https://deck.test/Welcome?tab=1",
      status: 302,
    });
    expect(ORACLE.withHistory.rendered).toBeNull();
  });

  it("an empty history bottoms out at the deck root", () => {
    // location_history.rb:7 - `session[:history] ||= [Env::Location.
    // card_path("")]` - so the stack's last entry is the deck root, and
    // card_url makes it absolute.
    expect(ORACLE.withoutHistory.error).toBeNull();
    expect(ORACLE.withoutHistory.previousLocation).toBe("/");
    expect(ORACLE.withoutHistory.redirected).toEqual({
      url: "https://deck.test/",
      status: 302,
    });
  });

  it("the ajax flavor answers the {redirect: url} JSON instead of a 302", () => {
    expect(ORACLE.ajaxFlavor.error).toBeNull();
    expect(ORACLE.ajaxFlavor.redirected).toBeNull();
    expect(ORACLE.ajaxFlavor.rendered).toEqual({
      json: { redirect: "https://deck.test/Welcome?tab=1" },
    });
  });

  it("the pinned sources say all of it out loud", () => {
    const mark = ORACLE.sources.mark.find((row) => row.text.includes("hard_redirect"));
    expect(mark).toBeDefined();
    expect(mark!.text).toContain("hard_redirect Card::Env.previous_location");
    const redirect = ORACLE.sources.hardRedirect.find((row) => row.text.includes("card_url"));
    expect(redirect).toBeDefined();
    const history = ORACLE.sources.locationHistory.find((row) => row.text.includes("card_path"));
    expect(history).toBeDefined();
  });
});

describe("the port's previous location", () => {
  it("answers the history's last entry, and the root when the history is empty", () => {
    // src/card/session/visitor-session.ts - previousLocation is the port's
    // previous_location (location_history.rb:19-21). The empty-history
    // bottom-out is the deck root, exactly as the pinned capture measured.
    const visit = readVisitorSession(undefined);
    expect(previousLocation(visit)).toBe("/");
    saveLocation(visit, "https://deck.test/Old");
    saveLocation(visit, "https://deck.test/Welcome?tab=1");
    expect(previousLocation(visit)).toBe("https://deck.test/Welcome?tab=1");
  });

  it("survives the cookie round trip the serving hosts use", () => {
    // The hosts carry the history in their own cookie; the module
    // serializes it, so a capture that rebuilt the cookie format would be
    // measuring its own reimplementation.
    const visit = readVisitorSession(undefined);
    saveLocation(visit, "https://deck.test/Welcome?tab=1");
    const cookie = visitorSessionCookie(visit);
    const restored = readVisitorSession(cookie);
    expect(previousLocation(restored)).toBe("https://deck.test/Welcome?tab=1");
  });
});
