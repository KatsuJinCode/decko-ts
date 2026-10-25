// smell-evaluate-follow-operations-parity.test.ts - the row
// smell-evaluate-follow-operations.
//
// WHAT THIS IS. The row's own instruments are the journey runner
// (reference-harness/browser/run-journeys.mjs) and the follow-operation grader
// (reference-harness/browser/evaluate-follow-operations.mjs), run against the
// three journey definitions in
// reference-harness/browser/journeys/acceptance-follow-operations.json on the
// synthetic-v1 fixture. The row closes when the port does what the SOURCE does.
//
// Both legs ran the same three journeys on the same fixture: the port on
// engines/ts.json, the pinned Ruby oracle on engines/ruby33.json. The two
// captures under fixtures/captured/smell-row-r4-2026-10-24/ are those legs'
// own output, and this file COMPARES them rather than restating them.
//
// WHAT IT ASSERTS:
//
//   - the ADMIN FOLLOW leg is parity: the same address, the same 200 and the
//     same follow state on both legs.
//
//   - the MEMBER UNFOLLOW leg is parity: the same address, the same 422 and
//     the same retained following state on both legs. The contract the grader
//     enforces there is a demand the source itself does not satisfy.
//
//   - the MAIL UNFOLLOW leg DIVERGES, and it diverges in the MAIL BODY: the
//     port's notification mail carries the flat follow record's own update
//     route with card[content]=*never, while the source's mail carries the
//     follower's own card route with card[subcards][<follow record>]=*never.
//     The port's link therefore answers 303 and the unfollow completes, where
//     the source's link answers 403 and the follow is kept.
//
//   - the port's own source still says what the receipt says it says: the
//     unfollow URL is an accepted usability repair that emits the follow
//     record's own route, so the row cannot stay open on a stale mechanism.
//
//   - the grader's own verdicts are as they stand: the port fails 1 of 3 and
//     the source's evidence cannot be graded at all, because the stock oracle
//     references a Font Awesome kit this machine cannot reach and the
//     evidence gate fails closed on it.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open until the contract the grader enforces matches the behaviour the
// product owner decides on, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture, journey, portSource } from "./smell-row-r4-captures.js";

const ROW = "evaluate-follow-operations";
const ADMIN = "follow-admin-operation-persistence";
const MEMBER = "unfollow-member-operation-persistence";
const MAIL = "unfollow-mail-operation-persistence";

const port = capture(ROW, "ts");
const source = capture(ROW, "ruby33");

describe("smell-evaluate-follow-operations: two legs agree on two journeys and diverge on the mail unfollow", () => {
  it("the admin follow leg is parity: the same address, the same 200, the same state", () => {
    const portLeg = journey(port, ADMIN);
    const sourceLeg = journey(source, ADMIN);
    expect(portLeg.completed).toBe(true);
    expect(sourceLeg.completed).toBe(true);
    expect(portLeg.updateRequests).toEqual(sourceLeg.updateRequests);
    expect(portLeg.updateRequests[0]!.path).toBe("/update/Topic_008+*self+Ada_Admin+*follow");
    expect(portLeg.updateRequests[0]!.status).toBe(200);
    expect(portLeg.finalObservation!.text).toBe(sourceLeg.finalObservation!.text);
  });

  it("the member unfollow leg is parity: the same address, the same 422, the same retained state", () => {
    const portLeg = journey(port, MEMBER);
    const sourceLeg = journey(source, MEMBER);
    expect(portLeg.updateRequests).toEqual(sourceLeg.updateRequests);
    expect(portLeg.updateRequests[0]!.path).toBe("/update/Topic_009+*self+Mira_Member+*follow");
    expect(portLeg.updateRequests[0]!.status).toBe(422);
    expect(portLeg.finalObservation!.text).toBe(sourceLeg.finalObservation!.text);
    expect(portLeg.finalObservation!.text).toContain("following");
  });

  it("the mail unfollow leg diverges in the mail body each engine writes", () => {
    const portLeg = journey(port, MAIL);
    const sourceLeg = journey(source, MAIL);
    // Both mails say the recipient is following the same set.
    expect(portLeg.mailFollowedLabel).toBe("everything");
    expect(sourceLeg.mailFollowedLabel).toBe("everything");
    // The port's unfollow link is the flat follow record's own route.
    expect(portLeg.mailUnfollowUrl).toContain("/update/*all+Mira_Member+*follow");
    expect(portLeg.mailUnfollowUrl).toContain("card%5Bcontent%5D=%2Anever");
    // The source's unfollow link is the follower's own card route.
    expect(sourceLeg.mailUnfollowUrl).toContain("/update/Mira_Member+*follow");
    expect(sourceLeg.mailUnfollowUrl).toContain("card%5Bsubcards%5D");
    expect(portLeg.mailUnfollowUrl).not.toBe(sourceLeg.mailUnfollowUrl);
  });

  it("the port's link completes the unfollow where the source's link is refused", () => {
    const portLeg = journey(port, MAIL);
    const sourceLeg = journey(source, MAIL);
    expect(portLeg.updateRequests[0]!.status).toBe(303);
    expect(portLeg.finalObservation!.text).toContain("0 followers");
    expect(sourceLeg.updateRequests[0]!.status).toBe(403);
    expect(sourceLeg.finalObservation!.text).toContain("following");
    expect(sourceLeg.finalObservation!.text).toContain("1 follower");
  });

  it("the port's own source still emits the follow record's route as an accepted repair", () => {
    const source = portSource("src/card/notify/follow-mail-views.ts");
    expect(source).toContain("const followMark = DeckoName.parse(ruleName).urlKey;");
    expect(source).toContain("?${cgiEscape(\"card[content]\")}=${cgiEscape(\"*never\")}");
    expect(source).toContain("Stock's virtual user+follow dashboard route can require a denied parent");
  });

  it("the grader fails the port 1 of 3 and cannot grade the source at all", () => {
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
