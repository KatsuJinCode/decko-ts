// Basename view dispatch — verification of the 17 `rendered-via-basename`
// views: names that sit in HTML_VIEWS (the shared view table) but that
// their mod's own manifest does NOT register and that SHARED_PROVENANCE
// does not cite this mod as the source of.
//
// Such a name still dispatches when a different mod's port is reached by
// the basename. This test loads each mod and actually renders the view to
// verify the dispatch: if a `rendered-via-basename` row renders bytes
// (because a different mod's port is reached by the basename), the row IS
// rendered on this tree; if the render raises, the row is genuinely
// missing.
//
// Probe cards:
//   - one card per mod, named per the probe conventions the sibling
//     tests use; the views are not type-scoped in the engine, so a
//     single card per mod is sufficient to exercise the dispatch.
//
// The rendered bytes are persisted to a JSON sidecar quoting concrete
// bytes per (mod, view). That sidecar IS committed
// (tests/card/mod-loader/lane-raises-parity-17-bytes.json) and the
// committed file is authoritative: the render bytes carry fresh
// data-slot-id tokens on every run, so an unconditional rewrite stamped
// a changed sidecar into the tree on every suite run, dirtying it. The
// write is therefore OPT-IN via WRITE_BASENAME_VIEW_ARTIFACT=1 —
// the same gate pattern as DEPTH_SWEEP_WRITE_ARTIFACT in
// tests/card/render/depth-sweep.test.ts. The assertions run on every
// execution; only the sidecar refresh is gated.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import cardModEmail from "../../../src/card/mod-loader/mods/card-mod-email.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import cardModScript from "../../../src/card/mod-loader/mods/card-mod-script.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";
import cardModStyle from "../../../src/card/mod-loader/mods/card-mod-style.js";

// Sidecar refresh is opt-in (see header): the render/raise assertions below
// run on every execution; lane-raises-parity-17-bytes.json is rewritten only
// when WRITE_BASENAME_VIEW_ARTIFACT=1.
const ARTIFACT_WRITE_REQUESTED = process.env.WRITE_BASENAME_VIEW_ARTIFACT === "1";

interface Target {
  mod: string;
  view: string;
  /** The probe card name to render against. */
  probe: string;
}

const TARGETS: Target[] = [
  // card-mod-account (2 views: set/self/signin.rb)
  { mod: "card-mod-account", view: "open", probe: "Oracle Account Open Probe" },
  { mod: "card-mod-account", view: "title", probe: "Oracle Account Title Probe" },
  // card-mod-bootstrap (3 views)
  {
    mod: "card-mod-bootstrap",
    view: "bar_middle",
    probe: "Oracle Bootswatch Bar Middle Probe",
  },
  {
    mod: "card-mod-bootstrap",
    view: "bar_right",
    probe: "Oracle Bootswatch Bar Right Probe",
  },
  { mod: "card-mod-bootstrap", view: "core", probe: "Oracle Bootswatch Core Probe" },
  // card-mod-email (1 view)
  { mod: "card-mod-email", view: "core", probe: "Oracle Email Core Probe" },
  // card-mod-format (1 view: set/type/mod.rb :bar_right)
  {
    mod: "card-mod-format",
    view: "bar_right",
    probe: "Oracle Format Bar Right Probe",
  },
  // card-mod-permissions (1 view)
  {
    mod: "card-mod-permissions",
    view: "core",
    probe: "Oracle Permissions Core Probe",
  },
  // card-mod-rules (4 views: set/rule/bar_view.rb)
  { mod: "card-mod-rules", view: "bar", probe: "Oracle Rules Bar Probe" },
  {
    mod: "card-mod-rules",
    view: "bar_bottom",
    probe: "Oracle Rules Bar Bottom Probe",
  },
  {
    mod: "card-mod-rules",
    view: "bar_middle",
    probe: "Oracle Rules Bar Middle Probe",
  },
  {
    mod: "card-mod-rules",
    view: "bar_right",
    probe: "Oracle Rules Bar Right Probe",
  },
  // card-mod-script (1 view)
  { mod: "card-mod-script", view: "core", probe: "Oracle Script Core Probe" },
  // card-mod-search (2 views)
  { mod: "card-mod-search", view: "bar", probe: "Oracle Search Bar Probe" },
  {
    mod: "card-mod-search",
    view: "title",
    probe: "Oracle Search Title Probe",
  },
  // card-mod-style (2 views)
  { mod: "card-mod-style", view: "box", probe: "Oracle Style Box Probe" },
  { mod: "card-mod-style", view: "core", probe: "Oracle Style Core Probe" },
];

const MOD_LOADERS: Record<string, { manifest: unknown }> = {
  "card-mod-account": { manifest: cardModAccount },
  "card-mod-bootstrap": { manifest: cardModBootstrap },
  "card-mod-email": { manifest: cardModEmail },
  "card-mod-format": { manifest: cardModFormat },
  "card-mod-permissions": { manifest: cardModPermissions },
  "card-mod-rules": { manifest: cardModRules },
  "card-mod-script": { manifest: cardModScript },
  "card-mod-search": { manifest: cardModSearch },
  "card-mod-style": { manifest: cardModStyle },
};

let storage: RenderTestStorage | undefined;
const loaders: Record<string, ModLoader> = {};

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // Codename-bearing cards the engine's enrichment reads.
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });

  // A distinct probe card per (mod, view) — names carry the mod
  // namespace so a failure points at the right target.
  for (const t of TARGETS) {
    await seedCard(s, { id: 700 + TARGETS.indexOf(t), name: t.probe, dbContent: "probe" });
  }

  // Each mod gets its own loader; every loader registers the mod
  // and exposes the views the test exercises.
  for (const modId of Object.keys(MOD_LOADERS)) {
    const entry = MOD_LOADERS[modId];
    // ModSource expects a DeckoModManifest; the casts here pin the
    // nine manifest imports to that interface.
    const loader = new ModLoader([entry as unknown as ConstructorParameters<typeof ModLoader>[0][number]]);
    loader.load();
    bindModLoaderToEngine(s, loader);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
    loaders[modId] = loader;
  }
}, 120_000);

afterAll(() => {
  for (const l of Object.values(loaders)) l.reset();
  storage?.close();
});

describe("17 rendered-via-basename views: do they actually render?", () => {
  // The render results collected here feed the opt-in sidecar write
  // (see ARTIFACT_WRITE_REQUESTED) so the committed sidecar quotes
  // concrete bytes per (mod, view), not just a "passed" boolean. The
  // list is keyed by mod+view.
  const results: Record<string, { view: string; bytes: string; length: number }> = {};

  for (const t of TARGETS) {
    it(`${t.mod} :${t.view} renders without UnsupportedViewError on ${t.probe}`, async () => {
      const s = storage!;
      const out = await s.engine.render(t.probe, t.view);
      expect(typeof out).toBe("string");
      // no length-assertion: the instrument classifies the row on
      // DISPATCH existence, not on byte shape; a baseline "" render
      // (the engine's :core view, say, on a probe with no content)
      // is a valid render that proves the basename dispatch is live.
      // Bytes are pinned by the sibling tests for the mod's own
      // views; this suite's gate is "does it render, not what does
      // it render" - a row classified "rendered-via-basename" can
      // route through any sibling mod's port.
      results[`${t.mod}/${t.view}`] = {
        view: t.view,
        bytes: out,
        length: out.length,
      };
    });
  }

  it("NONE of the 17 raises UnsupportedViewError — every basename dispatches to a registered port", async () => {
    const s = storage!;
    for (const t of TARGETS) {
      await expect(
        s.engine.render(t.probe, t.view),
      ).resolves.not.toThrow();
    }
  });

  it("sanity: an unrelated name DOES raise UnsupportedViewError", async () => {
    const s = storage!;
    // A name that no mod registers confirms the dispatch gate is real.
    await expect(
      s.engine.render("Oracle Account Open Probe", "no_such_view_basename_probe"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("captures the byte evidence to the committed JSON sidecar", async () => {
    // The sidecar IS committed
    // (tests/card/mod-loader/lane-raises-parity-17-bytes.json) and the
    // committed file is authoritative. The render bytes carry fresh
    // data-slot-id tokens on every run, so an unconditional rewrite
    // dirtied the tree on every suite run. Refresh is opt-in via
    // WRITE_BASENAME_VIEW_ARTIFACT=1 (the DEPTH_SWEEP_WRITE_ARTIFACT
    // gate pattern in tests/card/render/depth-sweep.test.ts); the
    // key-count assertion here and the render assertions above run on
    // every execution either way.
    expect(Object.keys(results).length).toBe(TARGETS.length);
    if (ARTIFACT_WRITE_REQUESTED) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { join, dirname } = await import("node:path");
      const path = join(
        process.cwd(),
        "tests",
        "card",
        "mod-loader",
        "lane-raises-parity-17-bytes.json",
      );
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(results, null, 2));
    }
  });
});
