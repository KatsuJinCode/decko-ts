// Independent, additive product checks. Never changes reference comparisons.
import { stable } from "../../runner/normalize.mjs";
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const object = v => v && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) => object(v) && Object.keys(v).every(k => allowed.includes(k));
const strings = v => Array.isArray(v) && v.every(x => typeof x === "string" && x.length > 0);

export function evaluateFollowOperations({ results, definitions, policy, defaultPolicy = {}, candidate, hashes, loadProblems = [], meta }) {
  const problems = [...loadProblems], perJourney = [];
  const add = (id, text) => problems.push(`${id}: ${text}`);
  if (!/^[a-f0-9]{40}$/.test(candidate ?? "")) add("integrity", "exact candidate commit required");
  if (!Array.isArray(definitions) || !definitions.length || new Set(definitions.map(d => d.id)).size !== definitions.length) add("integrity", "unique nonempty definitions required");
  if (!keys(policy, ["format", "scope", "journeys"]) || policy?.format !== "decko-follow-operation-contracts/1" || !object(policy.journeys) || !equal(Object.keys(policy.journeys).sort(), definitions.map(d => d.id).sort())) add("policy", "policy must cover exactly the defined journeys without unknown fields");
  if (!equal(Object.keys(results).sort(), definitions.map(d => d.id).sort())) add("integrity", "missing or extra result");
  const runIds = new Set(), artifactIds = new Set();
  if (!meta || !Number.isFinite(Date.parse(meta.completedAt)) || !Array.isArray(meta.journeys) || !equal(meta.journeys.map(j => j.id).sort(), definitions.map(d => d.id).sort())) add("integrity", "complete run metadata required");
  for (const definition of definitions) {
    const id = definition.id, before = problems.length, r = results[id], p = r?.provenance, c = policy?.journeys?.[id];
    if (!r) { add(id, "missing result"); continue; }
    if (r.completed !== true || r.error || !Array.isArray(r.steps) || !equal(r.steps.map(s => s.step), definition.steps) || !r.steps.every((s, i) => s.i === i && s.outcome === "ok")) add(id, "complete successful step evidence required");
    const labels = definition.steps.filter(s => s.observe).map(s => s.observe);
    if (!Array.isArray(r.observations) || !equal(r.observations.map(o => o.label), labels) || new Set(labels).size !== labels.length) add(id, "exact observation evidence required");
    const fresh = definition.steps.findIndex(s => s.fresh_session === true), restart = definition.steps.findIndex(s => s.restart === true);
    const reload = definition.steps.findIndex(s => s.observe === c?.reload?.label);
    if (!(fresh >= 0 && restart > fresh && reload > restart && definition.steps.slice(restart + 1, reload).some(s => s.signin) && definition.steps.slice(restart + 1, reload).some(s => s.visit))) add(id, "reload must follow fresh profile, restart, login and visit");
    const restarted = r.steps?.[restart]?.restart;
    if (!Number.isInteger(restarted?.previousPid) || !Number.isInteger(restarted?.pid) || restarted.pid <= 0 || restarted.previousPid <= 0 || restarted.pid === restarted.previousPid || !Number.isFinite(restarted.bootMs) || restarted.bootMs < 0) add(id, "actual owned restart receipt required");
    if (p?.format !== "decko-browser-evidence/1" || p.source?.commit !== candidate || p.source?.dirty !== false || !/^[a-f0-9]{64}$/.test(p.source?.diffSha256 ?? "")) add(id, "clean candidate provenance required");
    for (const key of ["fixtureSha256", "journeysSha256", "contractsSha256", "engineSha256"]) if (!hashes?.[key] || p?.[key] !== hashes[key]) add(id, `${key} mismatch`);
    if (!p?.runId || !equal(meta?.provenance, p) || meta?.journeys?.find(j => j.id === id)?.completed !== true) add(id, "result/run metadata identity mismatch");
    if (p?.buildReceipt?.sourceCommit !== candidate || p?.buildReceipt?.sourceDiffSha256 !== p?.source?.diffSha256 || p?.buildReceipt?.distSha256 !== p?.artifacts?.distSha256 || !/^[a-f0-9]{64}$/.test(p?.artifacts?.distSha256 ?? "")) add(id, "bound build receipt required");
    if (!r.browserVersion || !r.runtime?.node || !r.runtime?.engine || !Array.isArray(r.network) || !Array.isArray(r.mail) || !object(r.rows)) add(id, "browser/runtime/network/mail/row evidence required");
    runIds.add(p?.runId); artifactIds.add(p?.artifacts?.distSha256);
    for (const n of r.network ?? []) if (["image", "font", "stylesheet", "script"].includes(n.resourceType) && (n.failure || !Number.isInteger(n.status) || n.status >= 400)) add(id, `required asset failed ${n.path}`);
    for (const o of r.observations ?? []) {
      if (o.status !== 200 || typeof o.text !== "string" || typeof o.mainText !== "string" || !Array.isArray(o.structure) || !Array.isArray(o.fields)) add(id, `successful observation required: ${o.label}`);
      const expectations = [defaultPolicy.journeys?.[id]?.[o.label], definition.steps.find(s => s.observe === o.label)?.expect].filter(Boolean);
      for (const e of expectations) {
        if (e.status !== undefined && e.status !== o.status) add(id, `existing policy status failed: ${o.label}`);
        for (const t of e.textIncludes ?? []) if (!o.text.includes(t)) add(id, `existing policy text missing: ${t}`);
        for (const t of e.textExcludes ?? []) if (o.text.includes(t)) add(id, `existing policy failure text: ${t}`);
        for (const t of e.structureIncludes ?? []) if (!o.structure.join("\n").includes(t)) add(id, `existing policy structure missing: ${t}`);
      }
    }
    if (!keys(c, ["actions", "state", "notification", "reload"]) || !Array.isArray(c.actions) || !c.actions.length || !c.actions.every(a => keys(a, ["method", "path", "status"]) && ["GET", "POST"].includes(a.method) && typeof a.path === "string" && a.path.startsWith("/update/") && a.status === 200) || !keys(c.state, ["mode", "id", "field", "value"]) || !["inserted", "updated"].includes(c.state.mode) || !["string", "number"].includes(typeof c.state.id) || c.state.field !== "db_content" || !["*always", "*never"].includes(c.state.value) || !keys(c.notification, ["count", "to", "subject"]) || !Number.isInteger(c.notification.count) || c.notification.count < 0 || c.notification.count > 1 || (c.notification.count === 1 && (!strings(c.notification.to) || !c.notification.to.length || typeof c.notification.subject !== "string" || !c.notification.subject.length)) || !keys(c.reload, ["label", "mainTextIncludes", "mainTextExcludes", "structureIncludes"]) || !labels.includes(c.reload.label) || !strings(c.reload.mainTextIncludes) || !c.reload.mainTextIncludes.length || !strings(c.reload.mainTextExcludes) || !strings(c.reload.structureIncludes) || !c.reload.structureIncludes.length) {
      add(id, "invalid/unknown operation policy"); perJourney.push({ id, pass: false }); continue;
    }
    for (const action of c.actions) {
      const actual = (r.network ?? []).filter(n => n.origin === "local" && n.method === action.method && n.path === action.path);
      if (actual.length !== 1 || actual[0].status !== 200 || actual[0].failure) add(id, `successful ${action.method} ${action.path} required`);
    }
    const mutations = r.rows?.cards?.[c.state.mode] ?? [];
    const row = mutations.find(row => row.id === c.state.id);
    const value = c.state.mode === "inserted" ? row?.[c.state.field] : row?.changes?.[c.state.field]?.[1];
    if (value !== c.state.value) add(id, `persisted ${c.state.id} ${c.state.field}=${c.state.value} required`);
    if ((r.mail ?? []).length !== c.notification.count || (c.notification.count === 1 && (!equal(r.mail[0]?.to, c.notification.to) || r.mail[0]?.subject !== c.notification.subject || !r.mail[0]?.text))) add(id, "expected real notification evidence required");
    const observed = r.observations?.find(o => o.label === c.reload.label);
    if (!observed) add(id, "fresh reload observation missing");
    else {
      for (const t of c.reload.mainTextIncludes) if (!observed.mainText?.includes(t)) add(id, `reload state missing ${t}`);
      for (const t of c.reload.mainTextExcludes) if (observed.mainText?.includes(t)) add(id, `reload retains failed state ${t}`);
      for (const t of c.reload.structureIncludes) if (!observed.structure?.join("\n").includes(t)) add(id, `reload structure missing ${t}`);
    }
    perJourney.push({ id, pass: problems.length === before });
  }
  if (runIds.size !== 1 || artifactIds.size !== 1) add("integrity", "mixed run/artifact evidence");
  return { format: "decko-follow-operation-report/1", candidateOnly: true, additive: true, policyEvaluation: "Post-capture candidate-only operation requirements; no captured policy, Ruby expectations or observations changed", parityAcceptance: false, productionAcceptance: false, candidate, verdict: problems.length ? "fail" : "pass", problems, perJourney };
}
