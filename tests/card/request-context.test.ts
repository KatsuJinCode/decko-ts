// Live renders run concurrently in one isolate, each in its own request
// context: the name environment, the name scope's memos and the boot bundle
// must never leak between two renders that interleave across awaits.
import { describe, expect, it } from "vitest";
import { requestContextAvailable, runInRequestContext } from "../../src/card/request-context.js";
import { getNameEnvironment, setNameEnvironment, type NameEnvironment } from "../../src/card/name/environment.js";
import { DeckoName } from "../../src/card/name.js";
import { bootCacheIsEmpty, resetBootCache, storeBootBundle } from "../../src/card/render/boot-cache.js";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("request context", () => {
  it("is available on this runtime", () => {
    expect(requestContextAvailable()).toBe(true);
  });

  it("keeps each render's environment, name scope and boot bundle its own", async () => {
    const global: NameEnvironment = { mainName: "global" };
    setNameEnvironment(global);
    const seen: string[] = [];
    const render = (name: string) =>
      runInRequestContext(getNameEnvironment(), async () => {
        expect(getNameEnvironment()).toBe(global);
        setNameEnvironment({ mainName: name });
        DeckoName.beginRequestScope();
        storeBootBundle({ driver: { name } } as never);
        for (let i = 0; i < 5; i += 1) {
          await tick();
          seen.push(`${name}:${getNameEnvironment()?.mainName}`);
          expect(getNameEnvironment()?.mainName).toBe(name);
          expect(DeckoName.requestScopeIsClosed()).toBe(false);
          expect(bootCacheIsEmpty()).toBe(false);
        }
        resetBootCache();
        DeckoName.endRequestScope();
        expect(DeckoName.requestScopeIsClosed()).toBe(true);
      });
    await Promise.all([render("a"), render("b"), render("c")]);
    // they interleaved, and outside them nothing changed
    expect(seen.slice(0, 3).sort()).toEqual(["a:a", "b:b", "c:c"]);
    expect(getNameEnvironment()).toBe(global);
    expect(DeckoName.requestScopeIsClosed()).toBe(true);
    expect(bootCacheIsEmpty()).toBe(true);
    setNameEnvironment(undefined);
  });
});
