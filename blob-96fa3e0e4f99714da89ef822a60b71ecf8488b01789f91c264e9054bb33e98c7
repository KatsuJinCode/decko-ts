// The restart-persistence verdict: grade a journey run against the restart
// contract its own definitions declare. The journeys (the original's recorded
// behavior, carried in reference-harness/browser/journeys/) perform stateful
// writes, restart the port's OWN serving host, then re-perform the read side
// and assert the saved value. This module checks the run's receipt of that
// contract:
//   - every step recorded outcome "ok" (the runner records the failure
//     otherwise; a completed journey with a non-ok step is a fail here);
//   - every `restart` step carries real restart evidence: the previous pid
//     and the new pid are distinct process identities and the boot took time
//     (lib/engines.mjs#restart returns {previousPid, pid, bootMs} for the
//     owned child it killed and respawned on the same staged deck and files -
//     the boot path the repo carries, never another process);
//   - the read side after the LAST restart re-performed: at least one
//     read-bearing step (visit/signin/click/mail_link) and at least one
//     recorded observation follow it;
//   - every post-restart assert/wait step in the definition has its recorded
//     outcome "ok": the journey's own recorded original behavior held after
//     the restart.
// A state that did not survive surfaces as a failed post-restart
// assert/wait step or a failed read-side step; this verdict names the step,
// it does not reinterpret it.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadJourneyResults } from "./journey-evidence-validation.mjs";
import { sha256 } from "./journey-provenance.mjs";

/** Grade ONE journey definition against its run result. */
export function gradeRestartJourney(definition, result) {
  const problems = [];
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  if (definition.steps.length !== steps.length) {
    problems.push(`step count differs: definition ${definition.steps.length}, run ${steps.length}`);
  }
  for (const step of steps) {
    if (step.outcome !== "ok") problems.push(`step ${step.i} outcome ${step.outcome}: ${step.error ?? ""}`.trimEnd());
  }
  const restartSteps = steps.filter((s) => s.step?.restart !== undefined);
  if (restartSteps.length === 0) problems.push("no restart step ran");
  for (const step of restartSteps) {
    const evidence = step.restart;
    if (!evidence || typeof evidence !== "object") problems.push(`step ${step.i}: restart evidence missing`);
    else if (evidence.previousPid === evidence.pid) {
      problems.push(`step ${step.i}: restart evidence names one pid (${evidence.pid}) for both sides`);
    } else if (!Number.isFinite(evidence.bootMs) || evidence.bootMs <= 0) {
      problems.push(`step ${step.i}: restart bootMs missing`);
    }
  }
  const lastRestartIndex = steps.reduce((acc, s, i) => (s.step?.restart !== undefined ? i : acc), -1);
  if (lastRestartIndex !== -1) {
    const after = steps.slice(lastRestartIndex + 1);
    const readSide = after.filter((s) => ["visit", "signin", "click", "mail_link"].some((k) => s.step?.[k] !== undefined));
    if (readSide.length === 0) problems.push("no read-side step after the last restart");
    if (!after.some((s) => s.step?.observe !== undefined)) problems.push("no observation after the last restart");
    // The definition's post-restart assert/wait steps are the recorded
    // original behavior; the run must show each of them ok.
    const kindsOf = (step) => Object.keys(step ?? {}).filter((k) => k !== "note");
    let definitionIndex = -1;
    for (const step of steps) {
      do {
        definitionIndex++;
      } while (definitionIndex < definition.steps.length && kindsOf(definition.steps[definitionIndex]).length === 0);
      if (definitionIndex >= definition.steps.length) break;
      const expected = definition.steps[definitionIndex];
      if ((expected.assert !== undefined || expected.wait !== undefined) && step.outcome !== "ok") {
        problems.push(`post-restart recorded assertion at step ${step.i} did not hold`);
      }
    }
  }
  return { id: definition.id, problems, restarts: restartSteps.map((s) => s.restart), steps: steps.length };
}

/** Grade a whole run directory against a journeys definition file.
 *  `candidate` is the exact full source commit the run's provenance must
 *  name; a dirty tree or a build receipt from another commit fails closed. */
export function gradeRestartPersistence({ run, journeysFile, candidate }) {
  const definitionBytes = readFileSync(journeysFile);
  const definitions = JSON.parse(definitionBytes).journeys ?? [];
  const loaded = loadJourneyResults(run);
  const problems = [...loaded.problems];

  const restartDefinitions = definitions.filter((j) => j.steps?.some((s) => s.restart !== undefined));
  if (restartDefinitions.length === 0) problems.push("no journey in the definition carries a restart step");

  const perJourney = restartDefinitions.map((definition) => {
    const result = loaded.results[definition.id];
    if (result === undefined) {
      return { id: definition.id, pass: false, problems: ["no run result"], restarts: [], steps: 0 };
    }
    const graded = gradeRestartJourney(definition, result);
    return { id: definition.id, pass: graded.problems.length === 0, ...graded };
  });
  const skippedJourneys = definitions.filter((j) => !restartDefinitions.includes(j)).map((j) => j.id);
  for (const id of Object.keys(loaded.results)) {
    if (!definitions.some((j) => j.id === id)) problems.push(`unexpected run result: ${id}`);
  }

  let meta = null;
  const metaPath = path.join(run, "run-meta.json");
  if (existsSync(metaPath)) {
    meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const commit = meta?.provenance?.source?.commit;
    if (commit !== candidate) problems.push(`run provenance names commit ${String(commit)}, not the candidate`);
    if (meta?.provenance?.source?.dirty) problems.push("run provenance records a dirty tree");
    const receipt = meta?.provenance?.buildReceipt;
    if (receipt?.sourceCommit !== undefined && receipt.sourceCommit !== candidate) {
      problems.push(`build receipt names commit ${String(receipt?.sourceCommit)}, not the candidate`);
    }
  } else {
    problems.push("run-meta.json missing");
  }

  const pass = problems.length === 0 && perJourney.length > 0 && perJourney.every((j) => j.pass);
  return {
    format: "decko-restart-persistence-verdict/1",
    verdict: pass ? "pass" : "fail",
    candidate,
    journeysFile,
    run,
    perJourney,
    skippedJourneys,
    problems,
    integrity: {
      journeysSha256: sha256(definitionBytes),
      runMetaSha256: meta ? sha256(readFileSync(metaPath)) : null,
    },
  };
}
