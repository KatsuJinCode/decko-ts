// The `setup` before_action, measured against the PINNED DECK's own method.
//
// The completeness register's B6 row grades the port on the `setup`
// before_action (rest.rb:31-35, "cache renew + asset refresh + Env.reset").
// The row's fix was "structural-equivalent documented", which says nothing
// about what the pinned method DOES, so this row's evidence is the pinned
// method, executed.
//
// fixtures/captured/setup-before-action-ruby-oracle.json is what
// oracle-capture-setup-before-action-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own `setup` over recording doubles:
//
//   the method  decko-0.20.0/lib/card_controller/rest.rb:31-35
//                 def setup
//                   Card::Cache.renew
//                   Card::Assets.refresh unless params[:explicit_file]
//                   Card::Env.reset self
//                 end
//   the table   decko-0.20.0/lib/card_controller.rb:20-25
//                 before_action :setup, except: [:asset]
//                 before_action :authenticate, except: [:asset]
//                 before_action :load_mark, only: [:read]
//                 before_action :load_card, except: [:asset]
//                 before_action :load_action, only: [:read]
//                 before_action :refresh_card, only: %i[create update delete]
//
// The row's own verdict is PARTIAL, and the capture is what makes the
// partiality concrete: the second of the three actions is GATED on
// params[:explicit_file], and the port's seam honours the same gate.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createReadAssetRefresh } from "../../src/card/actions/asset-read-refresh.js";
import { DeckoName } from "../../src/card/name.js";
import { runInRequestContext } from "../../src/card/request-context.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/setup-before-action-ruby-oracle.json"), "utf8"),
) as {
  setupMethod: {
    plain: {
      cacheRenewals: number;
      assetsRefreshes: number;
      envResets: number;
      envResetTookController: boolean;
      error: string | null;
    };
    explicitFile: {
      cacheRenewals: number;
      assetsRefreshes: number;
      envResets: number;
      envResetTookController: boolean;
      error: string | null;
    };
    source: Array<{ line: number; text: string }>;
  };
  beforeActionTable: Array<{ name: string; only: string[]; except: string[] }>;
  actionsForRead: string[];
  actionsForAsset: string[];
  actionsForUpdate: string[];
};

describe("the setup before_action, against the pinned deck gem", () => {
  it("the pinned method renews the cache, refreshes the assets and resets the environment", () => {
    expect(ORACLE.setupMethod.plain.error).toBeNull();
    expect(ORACLE.setupMethod.plain.cacheRenewals).toBe(1);
    expect(ORACLE.setupMethod.plain.assetsRefreshes).toBe(1);
    expect(ORACLE.setupMethod.plain.envResets).toBe(1);
    // Card::Env.reset self - the reset is handed the controller.
    expect(ORACLE.setupMethod.plain.envResetTookController).toBe(true);
  });

  it("and the asset refresh is gated on params[:explicit_file]", () => {
    // rest.rb:33 - `Card::Assets.refresh unless params[:explicit_file]`.
    // The gate is the row's whole non-trivial shape: the cache renew and
    // the environment reset still run, only the refresh is skipped.
    expect(ORACLE.setupMethod.explicitFile.error).toBeNull();
    expect(ORACLE.setupMethod.explicitFile.cacheRenewals).toBe(1);
    expect(ORACLE.setupMethod.explicitFile.assetsRefreshes).toBe(0);
    expect(ORACLE.setupMethod.explicitFile.envResets).toBe(1);
  });

  it("the method's own source says the gate out loud", () => {
    const refreshLine = ORACLE.setupMethod.source.find((row) => row.text.includes("Card::Assets.refresh"));
    expect(refreshLine).toBeDefined();
    expect(refreshLine!.text).toContain("unless params[:explicit_file]");
  });

  it("the method runs for every action except the asset action", () => {
    expect(ORACLE.actionsForRead).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
    expect(ORACLE.actionsForUpdate).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(ORACLE.actionsForAsset).toEqual([]);
    const setup = ORACLE.beforeActionTable.find((entry) => entry.name === "setup");
    expect(setup).toEqual({ name: "setup", only: [], except: ["asset"] });
  });
});

describe("the port's own three actions", () => {
  it("the asset-read refresh seam honours the pinned method's gate", async () => {
    // src/card/actions/asset-read-refresh.ts - the port's
    // `Card::Assets.refresh unless params[:explicit_file]`. The seam's
    // `explicitFile` argument IS Ruby's params[:explicit_file] (rest.rb:33).
    let refreshed = 0;
    const seam = createReadAssetRefresh({
      mode: "eager",
      refresh: async () => {
        refreshed += 1;
      },
    });

    expect(await seam.beforeRead({ explicitFile: false })).toBe(true);
    expect(refreshed).toBe(1);

    // The gate: an explicit-file request skips the refresh, exactly as the
    // pinned method does.
    expect(await seam.beforeRead({ explicitFile: true })).toBe(false);
    expect(refreshed).toBe(1);
  });

  it("the per-request scope drops the request's memos when the request ends", () => {
    // The port's structural equivalent of `Card::Cache.renew`'s per-request
    // half (card-1.110.0/lib/card/cache/class_methods.rb:20-36 renews the
    // shared cache and resets every per-class temporary cache): the request
    // scope of the name memos (DeckoName.beginRequestScope) is opened per
    // request and dropped with it, so nothing a request memoized outlives
    // it. That is the property the port can show; the shared-cache half of
    // renew has no port equivalent and is named below.
    const owner = {};
    expect(DeckoName.requestScopeIsClosed()).toBe(true);
    DeckoName.beginRequestScope();
    try {
      const memo = DeckoName.requestMemo(owner)!;
      memo.set("k", "v");
      expect(memo.get("k")).toBe("v");
    } finally {
      DeckoName.endRequestScope();
    }
    expect(DeckoName.requestScopeIsClosed()).toBe(true);
    expect(DeckoName.requestMemo(owner)).toBeUndefined();
  });

  it("each request context gets its own scope, so two requests cannot read each other's", async () => {
    // `Card::Env.reset self` (card-1.110.0/lib/card/env.rb:25-29) makes the
    // environment request-scoped. The port's equivalent is the request
    // context (src/card/request-context.ts): one call tree, one name
    // environment, one name scope, one boot bundle.
    const seen: Array<string | undefined> = [];
    const owner = {};
    await Promise.all([
      runInRequestContext(undefined, async () => {
        DeckoName.beginRequestScope();
        try {
          DeckoName.requestMemo(owner)!.set("k", "first");
          await new Promise((resolve) => setTimeout(resolve, 1));
          seen.push(DeckoName.requestMemo(owner)?.get("k") as string | undefined);
        } finally {
          DeckoName.endRequestScope();
        }
      }),
      runInRequestContext(undefined, async () => {
        DeckoName.beginRequestScope();
        try {
          DeckoName.requestMemo(owner)!.set("k", "second");
          await new Promise((resolve) => setTimeout(resolve, 1));
          seen.push(DeckoName.requestMemo(owner)?.get("k") as string | undefined);
        } finally {
          DeckoName.endRequestScope();
        }
      }),
    ]);
    expect(seen.sort()).toEqual(["first", "second"]);
  });
});

describe("the named gap: the edge host does not run the asset refresh", () => {
  // MEASURED, not asserted from memory. The staging server wires the seam
  // (vm-staging-server.mjs: the createReadAssetRefresh import and the
  // beforeRead call); the serving host's own module graph does not reach it
  // at all. Ruby would refresh the asset inputs once per cache lifetime on
  // the serving host too, so the port is INCOMPLETE there - a real gap,
  // which is why the row stays PARTIAL and this gap is named here rather
  // than left for the next reader to re-derive.
  const deployDir = path.join(REPO, "deploy");

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|mjs|js)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no serving-host source reaches the asset-read refresh seam", () => {
    const hits = sourceFiles(deployDir).filter((file) =>
      /createReadAssetRefresh|asset-read-refresh|beforeRead/.test(readFileSync(file, "utf8")),
    );
    expect(hits).toEqual([]);
  });

  it("the staging host does wire it", () => {
    const staging = readFileSync(path.join(REPO, "vm-staging-server.mjs"), "utf8");
    expect(staging).toContain("createReadAssetRefresh");
    expect(staging).toContain("beforeRead");
  });

  it("NAMED REMAINDER: what the edge host needs to wire the seam is named here", () => {
    // The seam is the seam, but the edge's READ path has no action engine
    // to run it through: the refresh runs
    // CardActionEngine#refreshReadAssetInputs
    // (src/card/actions/card-action-engine.ts:3890), and the edge's read
    // request core builds no action engine at all. Only the WRITE path
    // builds one (src/server/write-routes.ts:1873
    // createCardActionEngineForSession), and it builds it per session, for
    // a write.
    //
    // The staging host wires the seam because it builds the action
    // engine's whole collaborator set (vm-staging-server.mjs:644: the
    // attachment store, the SCSS and Coffee compilers, the asset and
    // script compressors, the JavaScript validator). That set is what the
    // edge host would need too, so the remainder is named with its price
    // rather than as a one-line omission.
    const edge = readFileSync(
      path.join(REPO, "deploy/bunny-worker-src/bunny-edge-engine-request.ts"),
      "utf8",
    );
    expect(edge).not.toContain("createReadAssetRefresh");
    expect(edge).not.toContain("createCardActionEngineForSession");
    const write = readFileSync(path.join(REPO, "src/server/write-routes.ts"), "utf8");
    expect(write).toContain("createCardActionEngineForSession");
  });
});
