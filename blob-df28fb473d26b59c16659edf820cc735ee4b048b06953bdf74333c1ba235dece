import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Reserve every output before launching a host/browser. Attempts are immutable. */
export function admitJourneyOutput({ out, suffix, ids, runId }) {
  mkdirSync(out, { recursive: true });
  const reserved = path.join(out, ".journey-reservations");
  mkdirSync(reserved, { recursive: true });
  for (const file of [`server${suffix}.log`, `progress${suffix}.txt`, `run-meta${suffix}.json`, ...ids.map(id => `${id}.json`)]) {
    if (existsSync(path.join(out, file))) throw new Error(`refusing to overwrite prior journey evidence: ${file}; use a new output directory`);
  }
  for (const id of ids) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`unsafe journey output id: ${id}`);
    if (existsSync(path.join(out, id))) throw new Error(`prior journey HTML exists: ${id}; use a new output directory`);
    writeFileSync(path.join(reserved, `${id}.json`), JSON.stringify({ id, runId, suffix, admittedAt: new Date().toISOString() }) + "\n", { flag: "wx" });
  }
  // Exclusive log admission also protects empty/interrupted shard attempts.
  writeFileSync(path.join(out, `server${suffix}.log`), "", { flag: "wx" });
}
