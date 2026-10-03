// The mod-porting-harness probe for card-mod-comment — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-comment.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-comment`).
//
// Every oracle line carries provenance (the script that produced it, the
// gemSource line ranges extracted verbatim, the ruby version). This file
// replays each oracle against the TS port: the request params, the auth
// state, the session bag and the pending content go IN; the appended content
// and the session bag's post-save state must match the Ruby oracle bytes.
//
// RED discipline: while the session-sticky author behavior is unported
// (set/all/comment.rb:6 `Env.session[:comment_author] = comment_author` +
// the reader's session arm, comment.rb:16-19), the session scenarios fail
// here — that failure IS the harness working. The port lands in
// src/card/mod-loader/mods/card-mod-comment.ts + the ModEventSaveInput
// session seam (src/card/mod-loader/mod-event-dispatch.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  addCommentEventFn,
  cleanComment,
} from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import type { ModEventSaveInput } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  request?: { comment?: string; comment_author?: string | null };
  auth?: { signedIn?: boolean; name?: string | null };
  sessionBefore?: { comment_author?: string | null } | null;
  contentBefore?: string;
  contentAfter?: string;
  sessionAfter?: { comment_author?: string | null } | null;
  bytes?: string;
  provenance?:
    | string
    | {
        strategy?: string;
        script?: string;
        ruby?: string;
      };
}

function harnessOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-comment.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine);
}

// The oracle capture's frozen clock (the ruby script's StubZoneClock).
const frozenNow = (): Date => new Date(Date.UTC(2026, 9, 2, 12, 0, 0));

describe("card-mod-comment harness oracles (static-ruby capture, verbatim gem source)", () => {
  const lines = harnessOracles();

  it("the capture exists and carries provenance on every line", () => {
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const line of lines) {
      expect(line.provenance !== undefined || line.kind === "existing-capture-ref").toBe(true);
    }
    expect(
      lines.some((l) => l.kind === "existing-capture-ref"),
    ).toBe(true);
  });

  for (const line of lines) {
    if (line.kind === "pure-bytes") {
      it(`pure bytes: ${line.scenario} (${line.gemSource})`, () => {
        expect(line.bytes).toBeDefined();
        // clean_comment's multiline wrap: every line <p>-wrapped, blank
        // lines &nbsp; (comment.rb:21-25, extracted verbatim by the script).
        expect(cleanComment("line one\n\nline three")).toBe(line.bytes);
      });
    }
    if (line.kind !== "event-state-machine") continue;

    it(`state machine: ${line.scenario} (${line.gemSource})`, async () => {
      const request = line.request ?? {};
      const auth = line.auth ?? {};
      // the session bag rides the save input (Ruby's Env.session); the
      // oracle's snake_case comment_author key maps to the port's
      // camelCase commentAuthor field.
      const sessionBag: { commentAuthor?: string } = {};
      const beforeAuthor = line.sessionBefore?.comment_author ?? null;
      if (beforeAuthor !== null) sessionBag.commentAuthor = beforeAuthor;

      let applied: string | undefined;
      const save: ModEventSaveInput = {
        comment: request.comment,
        commentAuthor: request.comment_author ?? undefined,
        signedInActorName: auth.signedIn === true ? (auth.name ?? undefined) : undefined,
        now: frozenNow,
        pendingContent: line.contentBefore,
        setContent: (dbContent) => {
          applied = dbContent;
        },
        commentApplied: false,
        session: sessionBag,
      };
      await addCommentEventFn(save);
      // the event's self.content= mutation (or its absence for a blank
      // comment) — the oracle's contentAfter is the pending write.
      expect(applied ?? line.contentBefore).toBe(line.contentAfter);
      // the session-sticky write (comment.rb:6): the resolved author lands
      // in the session bag; nil stays nil.
      expect(sessionBag.commentAuthor ?? null).toBe(
        line.sessionAfter?.comment_author ?? null,
      );
    });
  }
});
