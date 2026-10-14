// The port's side of the Ruby-mod comparison: boots the TypeScript engine with
// the default (hand-ported) mod deck plus one unported Ruby card-mod loaded
// through ruby.wasm, renders the requested views, fires the requested create
// events through the port's event dispatcher, and prints one JSON object.
//
//   node tools/ruby-mods/port-run.mjs <plan.json>
//
// plan.json: { deck, deckJson, modDir, renders: [{card, view}],
//              events: [{name, content}] }
// The deck file must be a private copy: boot adds the port's freshness table.

import { readFileSync } from "node:fs";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import {
  defaultDeckEventRuntime,
  defaultDeckSources,
  portedBundleOrder,
} from "../../src/card/mod-loader/default-mod-deck.js";
import { ModLoader, setDefaultModLoader } from "../../src/card/mod-loader.js";
import { setDefaultContentOverrideRegistry } from "../../src/card/render/content-overrides.js";
import { setDefaultModEventRegistry } from "../../src/card/mod-loader/mod-event-registry.js";
import { modEngineHost } from "../../src/card/mod-loader/mod-engine-host.js";
import { runModEventStage, type ModEventSaveInput } from "../../src/card/mod-loader/mod-event-dispatch.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import {
  structureRuleUniverseStatement,
  structureRuleTypesFromResults,
  structureUniverseFromResults,
} from "../../src/card/rules/structure.js";
import { setCaptureWallClock } from "../../src/card/wall-clock.js";
import { setDeckEnvironment } from "../../src/card/render/deck-origin.js";
import { setRaiseAllRenderingErrors } from "../../src/card/render/format.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { loadRubyMod } from "../../src/card/mod-loader/ruby-mod/ruby-mod-source.js";

interface Plan {
  deck: string;
  deckJson: string;
  modDir: string;
  renders: { card: string; view: string }[];
  events: { name: string; content: string }[];
}

const plan = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Plan;
const spec = JSON.parse(readFileSync(plan.deckJson, "utf8"));
console.log = (...args: unknown[]) => process.stderr.write(args.map(String).join(" ") + "\n");

applyDeckInflections(ORACLE_DECK_INFLECTIONS);
setCaptureWallClock(new Date(spec.clock));
setDeckEnvironment({ origin: spec.environment?.origin, defaultHtmlView: spec.environment?.default_html_view });
setRaiseAllRenderingErrors(false);

const t0 = performance.now();
const ruby = await loadRubyMod(plan.modDir);
const tRubyLoaded = performance.now();

// The deck's mod directory comes after the gem mods, as Cardio::Mod::Dirs
// orders an app's mod/ after its bundled gems.
const loader = new ModLoader([...defaultDeckSources(), ruby.source]);
loader.resolveOrder({ gemMods: portedBundleOrder(), deckModDirs: [{ listing: [ruby.source.manifest.name] }] });
loader.load();
setDefaultModLoader(loader);
setDefaultContentOverrideRegistry(loader.contentOverrideRegistry());
setDefaultModEventRegistry(loader.eventRegistry());

const driver = new LocalSqliteDriver({ path: plan.deck, readonly: false });
await driver.query(
  `CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0)`,
  [],
);
await driver.query(`INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, []);
const fetcher = new FetchEngine(driver);
fetcher.installNameEnvironment();
const ids = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE trash = 0", [])).rows.map((r) => Number(r.id));
await fetcher.warmLexicon(ids);
const [universe] = await driver.batch([structureRuleUniverseStatement()]);
fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
  contents: structureUniverseFromResults(universe),
  ruleTypeIds: structureRuleTypesFromResults(universe),
});
const engine = new RenderEngine(fetcher);
engine.renderAbsentCards = true;
const anon = await fetcher.fetchByName("Anonymous");
engine.viewer = { signedIn: false, actorId: anon?.id };
const host = modEngineHost(engine, fetcher);
await loader.installInto(host);
const tBooted = performance.now();

const renders: { card: string; view: string; html?: string; error?: string; ms: number }[] = [];
for (const r of plan.renders) {
  const s = performance.now();
  try {
    const html = await engine.renderRaw(r.card, r.view);
    renders.push({ ...r, html: html === null ? "" : String(html), ms: performance.now() - s });
  } catch (e) {
    renders.push({ ...r, error: String((e as Error)?.stack ?? e), ms: performance.now() - s });
  }
}

// Events: the create act's prepare_to_store walk, through the port's
// dispatcher, with the save input seam that carries `self.content =`.
const events: { name: string; content: string; stored?: string; fired: string[]; skipped: unknown[]; failed: string[] }[] = [];
for (const ev of plan.events) {
  let pending = ev.content;
  const saveInput: ModEventSaveInput = {
    comment: undefined,
    commentAuthor: undefined,
    signedInActorName: undefined,
    now: () => new Date(spec.clock),
    pendingContent: pending,
    setContent(c: string) {
      pending = c;
      (this as { pendingContent: string }).pendingContent = c;
    },
    commentApplied: false,
  };
  const report = await runModEventStage(
    defaultDeckEventRuntime(host),
    "prepare_to_store",
    {
      name: ev.name,
      action: "create",
      dbContent: ev.content,
      key: ev.name.toLowerCase().replace(/ /g, "_"),
      act: { action: "create" },
    },
    { driver, lexicon: fetcher.lexicon, fetch: fetcher },
    saveInput,
  );
  events.push({
    ...ev,
    stored: pending,
    fired: [...report.fired],
    skipped: [...report.skipped],
    failed: report.failed.map((f) => `${f.event}: ${String((f.error as Error)?.message ?? f.error)}`),
  });
}

process.stdout.write(
  JSON.stringify({
    setFiles: ruby.setFiles,
    registrations: ruby.registrations,
    timings: {
      rubyModLoadMs: tRubyLoaded - t0,
      engineBootMs: tBooted - tRubyLoaded,
    },
    renders,
    events,
  }) + "\n",
);
await driver.close?.();
