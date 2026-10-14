// createReadAssetRefresh (src/card/actions/asset-read-refresh.ts): the read-time
// trigger for Card::Assets.refresh. The trigger's gate is Ruby's
// (card-mod-assets lib/card/assets.rb:13-14, 74-91; decko-0.20.0
// lib/card_controller/rest.rb:33): eager refreshes every request, never
// refreshes none, cautious refreshes once per shared-cache generation, and an
// explicit-file request skips the refresh. The refresh is a counting fake here;
// the engine's own refresh is pinned by the battery and the style-asset tests.

import { describe, expect, it } from "vitest";

import { createReadAssetRefresh } from "../../../src/card/actions/asset-read-refresh.js";

function counter() {
  const calls = { n: 0 };
  return { calls, refresh: async () => void (calls.n += 1) };
}

describe("createReadAssetRefresh", () => {
  it("cautious (a deployed site) refreshes on the first request only", async () => {
    const { calls, refresh } = counter();
    const trigger = createReadAssetRefresh({ mode: "cautious", refresh });
    const ran = [await trigger.beforeRead(), await trigger.beforeRead(), await trigger.beforeRead()];
    expect({ ran, refreshes: calls.n }).toEqual({ ran: [true, false, false], refreshes: 1 });
  });

  it("cautious refreshes nothing when the shared cache is off (assets.rb:87)", async () => {
    const { calls, refresh } = counter();
    const trigger = createReadAssetRefresh({ mode: "cautious", sharedCache: false, refresh });
    expect([await trigger.beforeRead(), await trigger.beforeRead()]).toEqual([false, false]);
    expect(calls.n).toBe(0);
  });

  it("eager (development) refreshes on every request", async () => {
    const { calls, refresh } = counter();
    const trigger = createReadAssetRefresh({ mode: "eager", refresh });
    await trigger.beforeRead();
    await trigger.beforeRead();
    expect(calls.n).toBe(2);
  });

  it("never refreshes", async () => {
    const { calls, refresh } = counter();
    const trigger = createReadAssetRefresh({ mode: "never", refresh });
    await trigger.beforeRead();
    expect(calls.n).toBe(0);
  });

  it("an explicit-file request skips the refresh and leaves the marker unset (rest.rb:33)", async () => {
    const { calls, refresh } = counter();
    const trigger = createReadAssetRefresh({ mode: "cautious", refresh });
    expect(await trigger.beforeRead({ explicitFile: true })).toBe(false);
    expect(await trigger.beforeRead({ explicitFile: false })).toBe(true);
    expect(calls.n).toBe(1);
  });

  it("a failing refresh rejects the request and keeps the marker set, as Ruby's write precedes its refresh", async () => {
    let attempts = 0;
    const trigger = createReadAssetRefresh({
      mode: "cautious",
      refresh: async () => {
        attempts += 1;
        throw new Error("storing the site stylesheet requires the engine's attachmentStore option");
      },
    });
    await expect(trigger.beforeRead()).rejects.toThrow("attachmentStore");
    expect(await trigger.beforeRead()).toBe(false);
    expect(attempts).toBe(1);
  });
});
