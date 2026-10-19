// Register C10 (decko-completeness-register-2026-10-18.md:818): the
// read-path GET *previous hard redirect. The register: "Ported on the WRITE
// path as the success-mark redirect via session location history ... the
// READ-path GET /*previous hard-redirect has no arm (routes-actions B8)".
//
// RUBY ORACLE (read this session):
// - card_controller/mark.rb:10-14 interpret_mark: the "*previous" mark
//   hard_redirects Card::Env.previous_location — a before_action, so it
//   runs BEFORE any view resolution on every route whose :mark carries it.
// - lib/card/env/location_history.rb:19-21 previous_location =
//   location_history&.last, with :6-8 seeding session[:history] =
//   [card_path("")] — the default is never empty ("/" in the port's
//   visitor session).
// - card_controller/response.rb:40-47 hard_redirect: card_url makes the
//   URL absolute; Env.ajax? answers JSON {redirect: url} (200) instead of
//   a 302 (the client resets its own location).
//
// The arm lives in worker-shared-surface.ts (previousMarkRedirect) so the
// twin Worker entries (worker.ts and the bunny edge engine this harness
// drives) cannot drift; both call it at their mark-resolution point.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  visitorSessionCookie,
  type VisitorSession,
} from "../../src/card/session/visitor-session.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string, headers?: Record<string, string>): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`, { headers });
}

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 30, name: "Readable Thing", typeId: 2, dbContent: "readable body" });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

function visitCookie(history: string[]): string {
  const state: VisitorSession = { cards: {}, history };
  return visitorSessionCookie(state);
}

describe("C10: the read-path *previous mark hard-redirects to the previous location", () => {
  it("GET /*previous 302s to the history's last entry (absolute, as stored)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/%2Aprevious", {
          Cookie: visitCookie(["https://script-placeholder.bunny.run/Readable_Thing"]),
        }),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://script-placeholder.bunny.run/Readable_Thing",
      );
    } finally {
      storage.close();
    }
  });

  it("the seeded default: no history entry answers the home path (location_history.rb:6-8)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      // no cookie at all — the session is fresh, history seeds with "/"
      const noCookie = await handleEngineRequest(
        edgeGet("/%2Aprevious"),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      expect(noCookie.status).toBe(302);
      expect(noCookie.headers.get("Location")).toBe(
        "https://script-placeholder.bunny.run/",
      );
    } finally {
      storage.close();
    }
  });

  it("ajax answers JSON {redirect} (hard_redirect's Env.ajax? arm)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/%2Aprevious", {
          Cookie: visitCookie(["https://script-placeholder.bunny.run/Readable_Thing"]),
          "X-Requested-With": "XMLHttpRequest",
        }),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        redirect: "https://script-placeholder.bunny.run/Readable_Thing",
      });
    } finally {
      storage.close();
    }
  });

  it("the redirect runs before view resolution (/*previous/<view> redirects too)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/%2Aprevious/titled", {
          Cookie: visitCookie(["https://script-placeholder.bunny.run/Readable_Thing"]),
        }),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://script-placeholder.bunny.run/Readable_Thing",
      );
    } finally {
      storage.close();
    }
  });

  it("the deprecated asset prefixes answer card#asset's exact 404 (rest.rb:22-27)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      for (const pathname of [
        "/assets/style.css",
        "/assets/deep/nested/path.css",
        "/javascripts/app.js",
        "/jasmine/suite/spec.js",
      ]) {
        const res = await handleEngineRequest(
          edgeGet(pathname),
          { fetcher: storage.fetcher, render: storage.engine },
          {},
        );
        expect(res.status, pathname).toBe(404);
        expect(await res.text(), pathname).toBe(
          "Decko installation error: missing public directory symlinks",
        );
      }
    } finally {
      storage.close();
    }
  });

  it("any other starred mark is an ordinary card name (no redirect)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const res = await handleEngineRequest(
        edgeGet("/%2Aread", {}),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      expect(res.status).not.toBe(302);
    } finally {
      storage.close();
    }
  });
});
