// Exploration: the shape of the composed mod deck's registries.
import { defaultDeckLoader, defaultDeckSources } from "../../src/card/mod-loader/default-mod-deck.js";

const loader = defaultDeckLoader();
const sources = defaultDeckSources();
process.stdout.write(`mods ${loader.modNames().join(",")}\n`);
const m = sources.find((s) => s.manifest.name === "date")!.manifest;
for (const f of m.setModules ?? []) {
  process.stdout.write(`date ${f.setPath} formats=${Object.keys(f.formats ?? {}).join("/")} views=${Object.values(f.formats ?? {}).flatMap((b) => (b.views ?? []).map((v) => v.view)).join(",")} events=${(f.events ?? []).map((e) => e.event).join(",")}\n`);
}
const ch = loader.viewChain("ALL TYPE-date", "core");
process.stdout.write(`chain ${ch.map((e) => e.setModule).join(" > ")}\n`);
const ev = loader.eventRegistry().all().slice(0, 5);
process.stdout.write(`events ${JSON.stringify(ev.map((e) => ({ e: e.event, p: e.setPath, m: e.modName })))}\n`);
