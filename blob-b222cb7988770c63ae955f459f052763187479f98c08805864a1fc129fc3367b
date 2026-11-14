// smell-evaluate-follow-operations-parity.test.ts - the row
// smell-evaluate-follow-operations.
//
// WHAT THIS IS. The row's own instruments are the journey runner
// (reference-harness/browser/run-journeys.mjs) and the follow-operation grader
// (reference-harness/browser/evaluate-follow-operations.mjs), run against the
// three journey definitions in
// reference-harness/browser/journeys/acceptance-follow-operations.json on the
// synthetic-v1 fixture.
//
// The two captures under fixtures/captured/smell-row-r4-2026-10-24/ are the
// ROUND 4 legs' own output - the port on engines/ts.json and the pinned Ruby
// oracle on engines/ruby33.json - and this file COMPARES them as the row's
// historical record. Every capture assertion below is a statement about what
// each engine did AT ROUND 4, not about the current tree: the follow
// operations contracts (the row's product bar) have since been landed on the
// port, so the port leg's refusals recorded here no longer describe it.
//
// WHAT THE RECORD SHOWS:
//
//   - the ADMIN FOLLOW leg: the same address, the same 200 and the same
//     follow state on both legs. This leg still describes the port.
//
//   - the MEMBER UNFOLLOW leg: the same address, the same 422 and the same
//     retained following state on both legs at r4. The port's write refused
//     because the follow preference permit required the preference's set
//     card to exist as a stored row, where Ruby's preference? resolves a
//     virtual pattern set (rule/all.rb:45, fetch/results.rb:16-33), so the
//     act fell to the standard rules whose sides walk denied the missing
//     side. The permit now resolves the virtual set (view-task-rules.ts
//     followPreferencePermit), and the write lands.
//
//   - the MAIL UNFOLLOW leg diverged in the MAIL BODY at r4: the port's mail
//     carried the flat follow record's own update route with
//     card[content]=*never (the 2026-10-18 usability repair), while the
//     source's mail carried the follower's own dashboard route with
//     card[subcards][<follow record>]=*never. The contracts name the
//     dashboard route as the wire target, so the mail link now carries the
//     stock shape again and the owner's dashboard write is permitted (the
//     recorded product divergence in followPreferencePermit).
//
//   - the grader's own r4 verdicts are as they stand in the captures: the
//     port failed 1 of 3 and the source's evidence could not be graded at
//     all, because the stock oracle references a Font Awesome kit this
//     machine cannot reach and the evidence gate fails closed on it.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on the contracts' own evaluator run against a live journey run, not
// on these frozen captures.

import { describe, expect, it } from "vitest";

import { capture, journey, portSource } from "./smell-row-r4-captures.js";

const ROW = "evaluate-follow-operations";
const ADMIN = "follow-admin-operation-persistence";
const MEMBER = "unfollow-member-operation-persistence";
const MAIL = "unfollow-mail-operation-persistence";

const port = capture(ROW, "ts");
const source = capture(ROW, "ruby33");

describe("smell-evaluate-follow-operations: the round 4 record, both legs", () => {
  it("the admin follow leg agreed: the same address, the same 200, the same state", () => {
    const portLeg = journey(port, ADMIN);
    const sourceLeg = journey(source, ADMIN);
    expect(portLeg.completed).toBe(true);
    expect(sourceLeg.completed).toBe(true);
    expect(portLeg.updateRequests).toEqual(sourceLeg.updateRequests);
    expect(portLeg.updateRequests[0]!.path).toBe("/update/Topic_008+*self+Ada_Admin+*follow");
    expect(portLeg.updateRequests[0]!.status).toBe(200);
    expect(portLeg.finalObservation!.text).toBe(sourceLeg.finalObservation!.text);
  });

  it("the member unfollow leg recorded the same refusal on both legs: the same address, the same 422, the same retained state", () => {
    const portLeg = journey(port, MEMBER);
    const sourceLeg = journey(source, MEMBER);
    expect(portLeg.updateRequests).toEqual(sourceLeg.updateRequests);
    expect(portLeg.updateRequests[0]!.path).toBe("/update/Topic_009+*self+Mira_Member+*follow");
    expect(portLeg.updateRequests[0]!.status).toBe(422);
    expect(portLeg.finalObservation!.text).toBe(sourceLeg.finalObservation!.text);
    expect(portLeg.finalObservation!.text).toContain("following");
  });

  it("the mail unfollow leg diverged in the mail body each engine wrote at r4", () => {
    const portLeg = journey(port, MAIL);
    const sourceLeg = journey(source, MAIL);
    // Both mails say the recipient is following the same set.
    expect(portLeg.mailFollowedLabel).toBe("everything");
    expect(sourceLeg.mailFollowedLabel).toBe("everything");
    // The r4 port link was the flat follow record's own route.
    expect(portLeg.mailUnfollowUrl).toContain("/update/*all+Mira_Member+*follow");
    expect(portLeg.mailUnfollowUrl).toContain("card%5Bcontent%5D=%2Anever");
    // The source's link is the follower's own dashboard route.
    expect(sourceLeg.mailUnfollowUrl).toContain("/update/Mira_Member+*follow");
    expect(sourceLeg.mailUnfollowUrl).toContain("card%5Bsubcards%5D");
    expect(portLeg.mailUnfollowUrl).not.toBe(sourceLeg.mailUnfollowUrl);
  });

  it("at r4 the port's link completed the unfollow where the source's link was refused", () => {
    const portLeg = journey(port, MAIL);
    const sourceLeg = journey(source, MAIL);
    expect(portLeg.updateRequests[0]!.status).toBe(303);
    expect(portLeg.finalObservation!.text).toContain("0 followers");
    expect(sourceLeg.updateRequests[0]!.status).toBe(403);
    expect(sourceLeg.finalObservation!.text).toContain("following");
    expect(sourceLeg.finalObservation!.text).toContain("1 follower");
  });

  it("the port's source now carries the contracts' mechanism: the stock link shape and the virtual-set permit", () => {
    const source = portSource("src/card/notify/follow-mail-views.ts");
    // The mail link carries the stock dashboard mark with the rule name
    // posted as a subcard (base_views.rb:49-55), plus the soft success
    // flavor so the update answers itself at 200.
    expect(source).toContain("const dashboardMark = DeckoName.parse(`${input.followerName}+*follow`).urlKey;");
    expect(source).toContain("cgiEscape(`card[subcards][${ruleName}]`)");
    expect(source).toContain("success[redirect]");
    const permit = portSource("src/card/permissions/view-task-rules.ts");
    // The preference permit resolves the set part virtually (Ruby's
    // fetch_type_id semantics) and carries the recorded dashboard arm.
    expect(permit).toContain("parseSetName(setName).spec !== undefined");
    expect(permit).toContain("if (parts.length === 2)");
  });

  it("the r4 grader failed the port 1 of 3 and could not grade the source at all", () => {
    expect(port.grader.verdict).toBe("fail");
    expect(port.grader.passed).toBe(1);
    expect(port.grader.total).toBe(3);
    expect(port.grader.problems).toContain(
      "unfollow-mail-operation-persistence: successful GET /update/Mira_Member+*follow required",
    );
    expect(source.grader.verdict).toBe("fail");
    expect(source.grader.passed).toBe(0);
    expect(source.grader.problems.some((problem) => problem.includes("required asset failed /1366963381.js"))).toBe(
      true,
    );
  });
});
