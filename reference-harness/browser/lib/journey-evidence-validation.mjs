import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, treeDigest } from "./journey-provenance.mjs";

export function loadJourneyResults(dir) {
  const results = {}, problems = [];
  if (!dir || !existsSync(dir)) return { results, problems: [`missing results directory: ${dir}`] };
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json") && !f.startsWith("run-meta"))) {
    try {
      const value = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      if (typeof value.id !== "string" || !value.id) { problems.push(`invalid result id: ${file}`); continue; }
      if (Object.hasOwn(results, value.id)) problems.push(`duplicate result id: ${value.id}`);
      else results[value.id] = value;
    } catch (error) { problems.push(`unreadable result ${file}: ${error.message}`); }
  }
  return { results, problems };
}
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function validateJourneyEvidence(args, expected, actual) {
  const problems = [...expected.problems.map(p => `reference: ${p}`), ...actual.problems.map(p => `actual: ${p}`)];
  const journeyFile = args.journeys ?? new URL("../journeys/synthetic-v1.json", import.meta.url);
  const fixture = args.fixture ?? new URL("../../fixtures/synthetic-v1", import.meta.url);
  const definitionBytes = readFileSync(journeyFile);
  const definitions = JSON.parse(definitionBytes).journeys;
  const filter = args.filter ? new RegExp(args.filter) : null;
  const selected = definitions.filter(j => !filter || filter.test(j.id));
  const ids = selected.map(j => j.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate journey definition ids");
  if (!ids.length) problems.push("empty journey selection");
  if (filter) problems.push("partial selection is diagnostic only");
  const contractsPath = args.contracts ?? new URL("../journeys/product-contracts.json", import.meta.url);
  const contractBytes = readFileSync(contractsPath);
  const productContracts = JSON.parse(contractBytes);
  const contracts = productContracts.journeys;
  const hashes = { contractsSha256: sha256(contractBytes), journeysSha256: sha256(definitionBytes), fixtureSha256: treeDigest(fixture instanceof URL ? fileURLToPath(fixture) : path.resolve(fixture)) };
  const candidate = args.candidate;
  if (!/^[a-f0-9]{40}$/.test(candidate ?? "")) problems.push("--candidate must name the exact full source commit");
  for (const [side, loaded] of [["reference", expected], ["actual", actual]]) {
    for (const id of Object.keys(loaded.results)) if (!ids.includes(id)) problems.push(`${side}: unexpected journey ${id}`);
    const runs = new Set(), sources = new Set(), artifacts = new Set();
    for (const journey of selected) {
      const result = loaded.results[journey.id];
      if (!result) { problems.push(`${side}: missing journey ${journey.id}`); continue; }
      const prefix = `${side}/${journey.id}`;
      if (result.completed !== true) problems.push(`${prefix}: not completed`);
      const steps = result.steps ?? [];
      if (steps.length !== journey.steps.length || !steps.every((s,i) => s.i === i && s.outcome === "ok" && equal(s.step, journey.steps[i]))) problems.push(`${prefix}: step evidence does not match complete definition`);
      const labels = (result.observations ?? []).map(o => o.label);
      const wanted = journey.steps.filter(s => Object.hasOwn(s,"observe")).map(s => s.observe);
      if (new Set(labels).size !== labels.length || !equal(labels,wanted)) problems.push(`${prefix}: missing, duplicate or unexpected observations`);
      if (!Array.isArray(result.mail) || !result.rows || typeof result.rows !== "object") problems.push(`${prefix}: missing mail or row evidence`);
      for (const o of result.observations ?? []) {
        if (typeof o.url !== "string" || typeof o.text !== "string" || !Array.isArray(o.structure) || !Array.isArray(o.fields)) problems.push(`${prefix}/${o.label}: incomplete observation evidence`);
        if (!Number.isInteger(o.status) || o.status >= 500 || o.status < 200) problems.push(`${prefix}/${o.label}: user-visible HTTP ${o.status}`);
      }
      if (side === "actual" && result.provenance?.engine === "ts-production" && (result.runtime?.passwordHash !== "pbkdf2" || result.runtime?.assetRefresh !== "cautious" || !result.runtime?.scssCompilerConfigured || !/^[a-f0-9]{64}$/.test(result.runtime?.scssCompilerSha256 ?? ""))) problems.push(`${prefix}: production settings do not match PBKDF2/cautious/verified compiler configuration`);
      if (side === "actual") {
        for (const request of result.network ?? []) {
          if (["script", "stylesheet", "font", "image"].includes(request.resourceType) && (request.failure || request.status >= 400)) problems.push(`${prefix}: required ${request.resourceType} failed ${request.status ?? request.failure} at ${request.path}`);
        }
        if (productContracts.network?.[journey.id]?.successfulWrites) {
          const writes = (result.network ?? []).filter(r => ["POST", "PUT", "PATCH", "DELETE"].includes(r.method) && r.origin === "local");
          if (!writes.length || writes.some(r => r.failure || r.status < 200 || r.status >= 400)) problems.push(`${prefix}: product requires successful recorded write requests`);
        }
        const observations = new Map((result.observations ?? []).map(o => [o.label,o]));
        const required = { ...(contracts[journey.id] ?? {}), ...Object.fromEntries(journey.steps.filter(s => s.observe && s.expect).map(s => [s.observe,s.expect])) };
        for (const [label, expectation] of Object.entries(required)) {
          const observation = observations.get(label);
          if (!observation) { problems.push(`${prefix}/${label}: product observation missing`); continue; }
          if (expectation.status !== undefined && expectation.status !== observation.status) problems.push(`${prefix}/${label}: product expected HTTP ${expectation.status}, got ${observation.status}`);
          for (const text of expectation.textIncludes ?? []) if (!observation.text?.includes(text)) problems.push(`${prefix}/${label}: product text missing ${JSON.stringify(text)}`);
          for (const text of expectation.textExcludes ?? []) if (observation.text?.includes(text)) problems.push(`${prefix}/${label}: product failure text present ${JSON.stringify(text)}`);
        }
      }
      const p = result.provenance;
      if (!p || p.format !== "decko-browser-evidence/1") { problems.push(`${prefix}: missing provenance`); continue; }
      for (const [key, value] of Object.entries(hashes).filter(([key]) => key !== "contractsSha256")) if (p[key] !== value) problems.push(`${prefix}: ${key} mismatch`);
      if (p.source?.dirty !== false) problems.push(`${prefix}: source was dirty`);
      if (!/^[a-f0-9]{40}$/.test(p.source?.commit ?? "")) problems.push(`${prefix}: invalid source commit`);
      if (side === "actual" && p.source?.commit !== candidate) problems.push(`${prefix}: wrong candidate commit`);
      if (!p.runId) problems.push(`${prefix}: missing run identity`);
      runs.add(p.runId); sources.add(p.source?.commit); artifacts.add(p.artifacts?.distSha256);
      if (!result.browserVersion) problems.push(`${prefix}: missing actual browser version`);
      if (side === "reference" && !/^3\.3\./.test(result.runtime?.ruby ?? "")) problems.push(`${prefix}: reference runtime is not recorded Ruby3.3`);
      if (side === "actual" && (p.buildReceipt?.sourceCommit !== p.source?.commit || p.buildReceipt?.sourceDiffSha256 !== p.source?.diffSha256 || p.buildReceipt?.distSha256 !== p.artifacts?.distSha256)) problems.push(`${prefix}: build receipt does not bind current source and artifact`);
      if (side === "actual" && (!/^[a-f0-9]{64}$/.test(p.artifacts?.distSha256 ?? "") || !result.runtime?.node)) problems.push(`${prefix}: missing Node artifact/runtime identity`);
    }
    if (runs.size !== 1 || sources.size !== 1 || (side === "actual" && artifacts.size !== 1)) problems.push(`${side}: mixed or missing run/source/artifact identity`);
  }
  return { ids, candidate: candidate ?? null, hashes, problems };
}
