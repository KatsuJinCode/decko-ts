// The mod-porting-harness probe for card-mod-history — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-history.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-history`).
//
// The capture holds the view :board_act oracle lines (the mod-porting
// wave-1 lane): the BoardActRenderer chain's renderer-string bytes,
// extracted VERBATIM from the gems by the static-ruby script
// tools/mod-porting-harness/ruby-oracles/card-mod-history/board-act-view.rb
// (its header documents every stub; the title bytes are cross-checked in
// that script against the live capture fixtures/captured/board-views.json's
// history-tab pill anchor).
//
// Each line is replayed against the ported composition cores
// (boardProbeSurface in src/card/mod-loader/mods/card-mod-history.ts — the
// SAME functions the view body calls). The oracle's documented
// time_ago_in_words stub (frozen 86_400 s delta -> "1 day") makes the
// edited-ago phrase an INPUT; the piece split below reads the oracle's own
// " | " composition so the replay is table-driven by the capture.
//
// RED discipline: while board_act is unported, every scenario fails here —
// that failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { boardProbeSurface } from "../../../src/card/mod-loader/mods/card-mod-history.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  overlayTitle?: string;
  title?: string;
  subtitle?: string;
  relativeTitle?: string;
  details?: string;
  breadcrumb?: Record<string, string>;
  classyActionList?: string;
  opts?: { actSeq?: string; actionView?: string; hideDiff?: boolean };
  capturedAnchor?: string;
}

function boardOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-history.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine)
    .filter((l) => l.behaviorId === "view:board_act");
}

/** The documented act-row facts the oracle drives (board-act-view.rb's
 *  build_world): act_seq "3", actor "Decko Bot", the frozen 1-day bucket
 *  ("1 day"), one approved update action. */
const ACT_SEQ = "3";
const ACTOR_NAME = "Decko Bot";
const EDITED_AGO = "1 day ago"; // act_renderer.rb:105-109 edited_ago = "#{time_ago_in_words} ago" - the WHOLE phrase rides inside wrap_with(:small, edited_ago)
const UPDATE_SUMMARY = '<i class="notranslate material-icons">edit</i><small> </small>';

/** The oracle's overlayTitle is [left, summary, subtitle?, rollback?]
 *  compact-joined " | " — split it back into the pieces so each replay
 *  feeds the SAME cores the view composes with. */
function splitPieces(overlayTitle: string): string[] {
  return overlayTitle.slice("<div>".length, -"</div>".length).split(" | ");
}

describe("card-mod-history harness probe: view :board_act (the wave-1 oracle replay)", () => {
  const oracles = boardOracles();

  it("the harness captured the board_act oracle lines", () => {
    expect(oracles.length).toBe(8);
  });

  it("replays opts_from_params (act_listing.rb:29-32)", () => {
    const line = oracles.find((l) => l.scenario === "opts_from_params");
    expect(line).toBeDefined();
    // the oracle emits the RUBY hash's keys (snake_case)
    const raw = (line?.opts ?? {}) as Record<string, unknown>;
    expect(boardProbeSurface.actListingOptsFromParams({ actSeq: "3" }, null)).toEqual({
      actSeq: raw.act_seq,
      actionView: raw.action_view,
      hideDiff: raw.hide_diff,
    });
  });

  it("replays overlay_title_current_act (board_act_renderer.rb:11-17,35-41)", () => {
    const line = oracles.find((l) => l.scenario === "overlay_title_current_act");
    expect(line).toBeDefined();
    const pieces = splitPieces(line!.overlayTitle!);
    expect(pieces.length).toBe(2); // no subtitle, no rollback: current act, own card
    const title = boardProbeSurface.boardTitleForProbe({
      actSeq: ACT_SEQ,
      actorName: ACTOR_NAME,
      editedAgo: EDITED_AGO,
      summary: UPDATE_SUMMARY,
    });
    expect(title).toEqual(line!.title);
    const overlay = boardProbeSurface.boardOverlayTitleForProbe({
      actSeq: ACT_SEQ,
      actorName: ACTOR_NAME,
      editedAgo: EDITED_AGO,
      summary: UPDATE_SUMMARY,
      subtitle: "",
      rollback: null,
    });
    expect(overlay).toEqual(line!.overlayTitle);
  });

  it("replays overlay_title_other_card_and_rollback (subtitle + revert arms)", () => {
    const line = oracles.find((l) => l.scenario === "overlay_title_other_card_and_rollback");
    expect(line).toBeDefined();
    const pieces = splitPieces(line!.overlayTitle!);
    expect(pieces.length).toBe(4); // subtitle (act on child) + revert anchor
    expect(boardProbeSurface.boardSubtitleForProbe("Oracle Basics+child", "Oracle Basics")).toEqual(
      line!.subtitle,
    );
    expect(boardProbeSurface.boardRelativeTitleForProbe("Oracle Basics+child", "Oracle Basics")).toEqual(
      line!.relativeTitle,
    );
    const overlay = boardProbeSurface.boardOverlayTitleForProbe({
      actSeq: ACT_SEQ,
      actorName: ACTOR_NAME,
      editedAgo: EDITED_AGO,
      summary: UPDATE_SUMMARY,
      subtitle: line!.subtitle ?? "",
      rollback: pieces[3] ?? null,
    });
    expect(overlay).toEqual(line!.overlayTitle);
  });

  it("replays overlay_title_draft (the autosaved-draft arm)", () => {
    const line = oracles.find((l) => l.scenario === "overlay_title_draft");
    expect(line).toBeDefined();
    const pieces = splitPieces(line!.overlayTitle!);
    expect(pieces.length).toBe(3); // subtitle absent, the draft anchor present
    const overlay = boardProbeSurface.boardOverlayTitleForProbe({
      actSeq: ACT_SEQ,
      actorName: ACTOR_NAME,
      editedAgo: EDITED_AGO,
      summary: UPDATE_SUMMARY,
      subtitle: "",
      rollback: pieces[2] ?? null,
    });
    expect(overlay).toEqual(line!.overlayTitle);
  });

  it("replays details_capping_and_approval (act_renderer.rb:54-58,91-103)", () => {
    const line = oracles.find((l) => l.scenario === "details_capping_and_approval");
    expect(line).toBeDefined();
    // the oracle's row set: 21 approved (900000..900020), 1 unreadable
    // (900100), 5 more approved (900200..900204) - the AR markers encode
    // the rendered SELECTION
    const oracleIds = (line!.details ?? "")
      .match(/AR\((\d+)\)/g)
      ?.map((m) => Number(m.slice(3, -1)));
    expect(oracleIds?.length).toBe(21);
    const mixed = [
      ...Array.from({ length: 21 }, (_, i) => ({ id: 900000 + i, readable: true })),
      { id: 900100, readable: false },
      ...Array.from({ length: 5 }, (_, i) => ({ id: 900200 + i, readable: true })),
    ];
    const approved = mixed.filter((a) => a.readable);
    expect(boardProbeSurface.boardDetailSelectionForProbe(approved)).toEqual(oracleIds);
  });

  it("replays breadcrumb_data (card-mod-edit board.rb:73-77)", () => {
    const line = oracles.find((l) => l.scenario === "breadcrumb_data");
    expect(line).toBeDefined();
    expect(boardProbeSurface.breadcrumbData("History")).toEqual(line!.breadcrumb);
  });

  it("replays board_link_title_capture_crosscheck (the captured pill bytes)", () => {
    const line = oracles.find((l) => l.scenario === "board_link_title_capture_crosscheck");
    expect(line).toBeDefined();
    const title = boardProbeSurface.boardTitleForProbe({
      actSeq: ACT_SEQ,
      actorName: ACTOR_NAME,
      editedAgo: EDITED_AGO,
      summary: UPDATE_SUMMARY,
    });
    expect(title).toEqual(line!.title);
    // the LIVE capture's pill anchor embeds these exact bytes
    expect(line!.capturedAnchor).toContain(title);
  });

  it("replays action_list_class_up (history_board.rb:22)", () => {
    const line = oracles.find((l) => l.scenario === "action_list_class_up");
    expect(line).toBeDefined();
    expect(boardProbeSurface.actionListClass()).toEqual(line!.classyActionList);
  });
});
