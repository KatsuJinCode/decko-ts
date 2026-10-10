#!/usr/bin/env node
// The composed deck's registration census: every view, set module, setting,
// pattern and event the engine can serve after the default mod deck loads,
// walked exactly the way mod-loader.ts's phase-2 walk walks it.
//
// This census is the coverage index's source of truth for the seconds
// corpus: a corpus page list covers the engine exhaustively when, for every
// row below in the html-visible surface, at least one render operation
// reaches the registration that serves it.
//
//   node reference-harness/corpus/composed-deck-registration-census.mjs [out.json]
//
// Writes the census JSON (default stdout). Deterministic: same source tree,
// same bytes. No database is opened; the census is over registration tables,
// which exist before and independent of any deck's data.

import { register } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
register(pathToFileURL(path.join(repo, "tools/oracle/typescript-source-loader.mjs")).href, import.meta.url);

const viewsModule = await import(pathToFileURL(path.join(repo, "src/card/render/views.ts")).href);
const loaderModule = await import(pathToFileURL(path.join(repo, "src/card/mod-loader.ts")).href);
const deckModule = await import(pathToFileURL(path.join(repo, "src/card/mod-loader/default-mod-deck.ts")).href);

const HTML_VIEWS = viewsModule.HTML_VIEWS;
const { ModLoader } = loaderModule;
const { defaultDeckSources, portedBundleOrder } = deckModule;

// ---- the manifest walk: (mod, setPath, shortname, kind, formatKey, view) -----
// Mirrors tests/card/mod-loader/view-dispatch-flat-record-format-scope-census
// .test.ts's censusEntries(): the same surface the loader's phase-2 walk
// feeds, read from the manifests without loading anything.
function manifestRows() {
  const rows = [];
  for (const { manifest } of defaultDeckSources()) {
    for (const file of manifest.setModules ?? []) {
      const setPath = file.setPath;
      const shortname = loaderModule.setModuleShortname(setPath);
      for (const [formatKey, block] of Object.entries(file.formats ?? {})) {
        for (const view of block.views ?? []) {
          rows.push({ mod: manifest.name, setPath, shortname, formatKey, view: view.view });
        }
      }
    }
  }
  return rows;
}

// ---- the live walk: one ModLoader over the composed sources ------------------
function composedCensus() {
  const seedViews = Object.keys(HTML_VIEWS).sort();
  // The engine's live table IS the shared HTML_VIEWS record: the loader
  // registers into the record it is given, and every RenderEngine hands its
  // formats exactly that object (render.ts `this.views = HTML_VIEWS`).
  // This is a one-shot census process, so composing into the shared record
  // - what the deck boot itself does - is the measurement.
  const loader = new ModLoader(defaultDeckSources());
  loader.resolveOrder({ gemMods: portedBundleOrder() });
  const report = loader.load();
  const liveViews = Object.keys(HTML_VIEWS).sort();
  const modViews = liveViews.filter((v) => !seedViews.includes(v)).sort();
  const overriddenViews = liveViews.filter((v) => seedViews.includes(v)).sort();
  return {
    report,
    seedViews,
    liveViews,
    modOnlyViews: modViews,
    seedViewsOverriddenByMods: overriddenViews,
    seedOnlyViews: seedViews.filter((v) => !liveViews.includes(v)).sort(),
  };
}

/** The census over the composed default deck. Exported for the ops
 *  generator, which asserts every live view is exercised by at least one
 *  corpus operation. */
export function computeCensus() {
  const composed = composedCensus();
  // Anchored set modules (type/right/self/rule/type_plus_right) serve views
  // through the loader's view-CHAIN machinery, not the flat record, so the
  // html-visible universe is the flat record's keys PLUS every view the
  // manifests declare under an html-visible format key (html, or base - the
  // root format HtmlFormat inherits from). Foreign format keys (json, js,
  // email_text, email_html) are not html-reachable: an html render rejects
  // them (the flat-record format-scope census pins that).
  const htmlVisibleFormatKeys = new Set(["html", "base"]);
  const chainViews = [...new Set(
    manifestRows().filter((r) => htmlVisibleFormatKeys.has(r.formatKey)).map((r) => r.view),
  )].sort();
  const foreignFormatRows = manifestRows().filter((r) => !htmlVisibleFormatKeys.has(r.formatKey));
  const serveableViews = [...new Set([...composed.liveViews, ...chainViews])].sort();
  return {
    format: "composed-deck-registration-census/1",
    generatedBy: "reference-harness/corpus/composed-deck-registration-census.mjs",
    modsInLoadOrder: composed.report.modNames,
    registeredPatternCodes: composed.report.registeredPatternCodes,
    registeredSetModules: composed.report.registeredSetModules,
    registeredSettings: composed.report.registeredSettings,
    registeredContentOverrides: composed.report.registeredContentOverrides,
    registeredEvents: composed.report.registeredEvents,
    views: {
      live: serveableViews,
      flatRecordViews: composed.liveViews,
      chainServedViews: chainViews.filter((v) => !composed.liveViews.includes(v)),
      seedOnly: composed.seedOnlyViews,
      modOnly: composed.modOnlyViews,
      seedOverridden: composed.seedViewsOverriddenByMods,
      foreignFormatViewRows: foreignFormatRows.map((r) => `${r.mod} ${r.setPath} ${r.formatKey} ${r.view}`),
      counts: {
        seed: composed.seedViews.length,
        flatRecord: composed.liveViews.length,
        chainServedOnly: chainViews.filter((v) => !composed.liveViews.includes(v)).length,
        live: serveableViews.length,
        modOnly: composed.modOnlyViews.length,
        seedOverridden: composed.seedViewsOverriddenByMods.length,
      },
    },
    manifestRows: manifestRows(),
  };
}

const census = computeCensus();

// Only the CLI entry writes the dump; importers (generate-ops.mjs) call
// computeCensus() directly.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const out = process.argv[2];
  const text = JSON.stringify(census, null, 2) + "\n";
  if (out) {
    writeFileSync(out, text);
    console.log(`wrote ${out}: ${census.views.live.length} live views, ${census.modsInLoadOrder.length} mods, ${census.manifestRows.length} manifest rows`);
  } else {
    process.stdout.write(text);
  }
}
