// The capture feed: a committed, self-describing proof of a capability that
// the full signed-in harness cannot grade on its own.
//
// The grader is this repo's own (lib/local-policy.mjs verifiedCapabilities,
// lines 44-56): a check name is credited when a RESULT carries that name and
// passed. The results it reads come from a harness report's `results` array.
// Row cap-C13 is the one row whose capability is proved by a DIFFERENT
// instrument - the reference-harness probe
// reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs,
// which drives the templated card end to end (a Cardtype with a templated
// right, a create from its pre-filled template, and an in-place edit of the
// nested subcard through Save and Close) and grades eight legs.
//
// The roster recorded why the row stayed uncounted: "the registry keeps the
// row uncounted because the full-harness report never carries this check name
// (the probe feeds nothing into it) ... closing the row needs the probe
// results bound into a capture feed or an explicit registry decision, not
// more capability work." This module is that feed: it turns the probe's
// committed receipt into the results shape the grader consumes, WITHOUT
// weakening the grader - a receipt with a red leg, a failure count, or a
// different check name produces a result that does not pass, and the grader
// then leaves the row exactly where it was.
//
// The receipt's own facts answer Ruby's scenario:
//   decko-ruby-reference/decko features/structure.feature:20-33
//     Scenario: Create and edit templated card
//       When I create Movie card "Star Wars" with plusses: director/lead
//       And I go to card "Star Wars"
//       Then In the main card content I should see "George Lucas"
//       And In the main card content I should see "Harrison Ford"
//       When I edit "Star Wars" with plusses: G. Lucas / H. Ford
//       And I go to card "Star Wars"
//       Then In the main card content I should see "G. Lucas"
//       And In the main card content I should see "H. Ford"
//       And In the main card content I should see "true dat"
//
// which the receipt's compound halves answer one for one: the form serves the
// template (the scenario's "I should see '+director'"), the card is created
// from that template (the typed plusses are stored and shown), the nested
// editor is present and Save and Close applies the edit, and the untouched
// default right keeps its own content ("true dat").

/** The Ruby scenario each recorded fact answers, by name. */
export const RUBY_SCENARIO = {
  formServesTemplate: "features/structure.feature:15-18 - the structure rule's template is in the create form",
  cardCreatedFromTemplate: "features/structure.feature:21-26 - the typed plusses are stored and shown in the card's main content",
  nestedEditorPresent: "features/structure.feature:27 - the edit form carries the nested subcard's editor",
  saveAndCloseApplied: "features/structure.feature:27-32 - the edited plusses are stored and shown",
  plainRightEditorEmpty: "features/structure.feature:10-11 - the untemplated right carries no template, so the pre-fill is attributable to the templated one",
  nestedRowHeldTemplateBeforeEdit: "features/structure.feature:21-26 - the nested row holds the template before the edit",
  sessionSurvived: "features/structure.feature:8 - the signed-in session covers the whole drive",
};

/** The receipt's GRADED legs: the ones the probe asserted. A leg recorded with
 *  `graded: false` is an observation, not a result, and never counts. */
export function gradedLegs(receipt) {
  const legs = Array.isArray(receipt?.legs) ? receipt.legs : [];
  return legs.filter((leg) => leg?.graded !== false);
}

/** The recorded facts, flattened: the compound halves and the controls. */
export function recordedFacts(receipt) {
  const c13 = receipt?.c13 ?? {};
  const halves = c13.compoundHalves ?? {};
  const controls = c13.controls ?? {};
  return {
    formServesTemplate: halves.templatedCreate?.formServesTemplate ?? null,
    cardCreatedFromTemplate: halves.templatedCreate?.cardCreatedFromTemplate ?? null,
    nestedEditorPresent: halves.nestedEdit?.nestedEditorPresent ?? null,
    saveAndCloseApplied: halves.nestedEdit?.saveAndCloseApplied ?? null,
    plainRightEditorEmpty: controls.plainRightEditorEmpty ?? null,
    nestedRowHeldTemplateBeforeEdit: controls.nestedRowHeldTemplateBeforeEdit ?? null,
    sessionSurvived: controls.sessionSurvived ?? null,
  };
}

/** The facts that answer a Ruby assertion but are not recorded are the gap. */
export function missingRubyFacts(receipt) {
  const facts = recordedFacts(receipt);
  return Object.keys(RUBY_SCENARIO).filter((key) => facts[key] !== true);
}

/**
 * The result rows the grader consumes: {check, pass, evidence}. The check
 * name is the receipt's own, so it can only ever credit the row that
 * registered that name. `pass` is true ONLY when every graded leg is green,
 * the receipt's own failure count is zero, the receipt's own summary says so,
 * and every Ruby-answered fact is recorded. Anything else yields pass false -
 * a feed cannot launder a red run, and it never drops the result (an absent
 * result and a red result are different facts, and the grader treats them
 * differently).
 */
export function resultsFromProbeReceipt(receipt) {
  const check = typeof receipt?.checkName === "string" ? receipt.checkName : null;
  const legs = gradedLegs(receipt);
  const redLegs = legs.filter((leg) => leg?.ok !== true).map((leg) => leg?.leg ?? "(unnamed)");
  const failures = Number(receipt?.failures ?? 0);
  const facts = recordedFacts(receipt);
  const missing = missingRubyFacts(receipt);
  const summaryGreen = receipt?.c13?.allLegsGreen === true;
  const pass =
    check !== null &&
    legs.length > 0 &&
    redLegs.length === 0 &&
    failures === 0 &&
    summaryGreen &&
    missing.length === 0;
  return [
    {
      check,
      pass,
      evidence: {
        instrument: "reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs",
        receipt: "reference-harness/browser/probe-receipts/probe-c13-run3-result.json",
        sourceCommit: receipt?.source?.commit ?? null,
        sourceDirty: receipt?.source?.dirty ?? null,
        distSha256: receipt?.source?.distSha256 ?? null,
        fixtureSha256: receipt?.source?.fixtureSha256 ?? null,
        legs: legs.map((leg) => ({ leg: leg.leg ?? null, ok: leg.ok === true })),
        redLegs,
        failures,
        allLegsGreen: summaryGreen,
        facts,
        missingRubyFacts: missing,
        rubyScenario: RUBY_SCENARIO,
      },
    },
  ];
}
