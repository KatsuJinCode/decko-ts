// Diagnostic logging in the render and fetch paths is opt-in.
//
// format.ts printed an `ENGINE-NEST` line for every nest and lexicon.ts a
// `LEX-DEBUG` line for account-email names on every render, unconditionally:
// dozens of stdout lines per page. They are now gated behind
// DECKO_ENGINE_NEST_TRACE=1 (read once at module load) and DECKO_LEX_TRACE=1
// (read per call), both off by default.
import { describe, it, expect, afterEach, vi } from "vitest";
import { itOrSkipLoud } from "../../support/describe-with-corpus.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
  vi.restoreAllMocks();
  delete process.env.DECKO_LEX_TRACE;
});

async function deck(): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 30, name: "Host", typeId: 2, dbContent: "{{Guest}}" });
  await seedCard(s, { id: 31, name: "Guest", typeId: 2, dbContent: "guest body" });
  return s;
}

const tagged = (spy: { mock: { calls: unknown[][] } }, tag: string): number =>
  spy.mock.calls.filter((args: unknown[]) => args[0] === tag).length;

describe("diagnostic logging is gated behind env flags", () => {
  itOrSkipLoud(!(process.env.DECKO_ENGINE_NEST_TRACE !== "1"), "tests/card/render/debug-logging-gated.test.ts", "process.env.DECKO_ENGINE_NEST_TRACE !== \"1\"")(
    "a render prints no ENGINE-NEST / LEX-DEBUG lines by default",
    async () => {
      storage = await deck();
      const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const html = await storage.engine.render("Host", "core");
      await storage.fetcher.fetchByName("Probe Signup+*account");
      expect(html).toContain("guest body");
      expect(tagged(spy, "ENGINE-NEST")).toBe(0);
      expect(tagged(spy, "LEX-DEBUG")).toBe(0);
    },
  );

  it("DECKO_LEX_TRACE=1 produces no lexicon output: the development trace was removed as narration, not gated", async () => {
    process.env.DECKO_LEX_TRACE = "1";
    storage = await deck();
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await storage.fetcher.fetchByName("Probe Signup+*account");
    expect(tagged(spy, "LEX-DEBUG")).toBe(0);
  });
});
