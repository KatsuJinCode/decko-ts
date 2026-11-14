// The add_comment save event (card-mod-comment set/all/comment.rb:4-12) —
// the E6 surface, ported through the mod-event seam and pinned against the
// FRESH Ruby oracle capture taken 2026-09-29:
// fixtures/oracle-surfaces/comment.jsonl (append bytes, multi-line wrap,
// blank-comment no-op, anonymous denial).
//
// Capture provenance: the oracle app on the disposable corpus copy
// (write-conformance-surfaces1.sqlite3; the corpus sha256 is unchanged —
// the no-write proof is in WORK_DIR/
// surfaces-batch1-lane.md). The capture ran the saves under
// Card::Auth.as_bot with NO HTTP session, so Auth.signed_in? was false and
// the rendered author fell to the "Anonymous (Not signed in)" arm — a
// capture-context artifact. This port's save engine KNOWS its actor, so a
// signed-in save renders the gem's signed-in arm "[[Joe User]]"
// (comment.rb:38-40 — gem-source-pinned, rendered-unpinned here; the
// anonymous ARM's bytes are pinned through the direct helper assertions
// below, and the anonymous WRITE denial is pinned against the capture's
// anonymous_denied line).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  ANON,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModComment, {
  addCommentEventFn,
  appendComment,
  cleanComment,
  commentAuthorFor,
  commentModEventPredicates,
  commentSignature,
  rubyTimestamp,
} from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface CaptureLine {
  card: string;
  format: string;
  view: string;
  bytes?: string;
  error?: string;
  unchanged?: boolean;
}

function capture(): Map<string, CaptureLine> {
  const lines = readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/comment.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as CaptureLine);
  return new Map(lines.map((l) => [`${l.format}|${l.view}`, l]));
}

const FROZEN = new Date("2026-09-29T12:00:00.000Z");
const clock = (): Date => new Date(FROZEN);

/** The comment mod's registry (the same registration the SetLoader phase
 *  performs engine-wide when the mod is loaded). */
function commentRegistry() {
  const loader = new ModLoader([{ manifest: cardModComment }]);
  loader.resolveOrder({ gemMods: ["comment"] });
  loader.load();
  return loader.eventRegistry();
}

function commentEngine(
  storage: ActionsTestStorage,
  actor: typeof JOE | typeof ANON | null = JOE,
): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: commentRegistry(),
    predicates: commentModEventPredicates,
  };
  return new CardActionEngine(storage.engine, {
    actor,
    ipAddress: "192.0.2.7",
    now: clock,
    modEvents: runtime,
  });
}

async function contentOf(
  storage: ActionsTestStorage,
  cardId: number,
): Promise<string | null> {
  const row = await storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return row?.db_content ?? null;
}

describe("E6 add_comment — the save event through the seam", () => {
  it("a signed-in comment appends the captured block shape", async () => {
    const storage = await createActionsTestStorage();
    // the write-rule machinery a real deck bootstraps (seedStandardDeck's
    // *all+*update -> [[Anyone]]): the deny-by-default write gate refuses a
    // rule-less deck's save, which would shadow the comment machinery under
    // test (verdict-semantics MEDIUM-2; sweep fix, semantics-followups)
    await seedStandardDeck(storage);
    const card = await seedCard(storage, {
      name: "Supercard",
      dbContent: "body before comment",
    });
    const engine = commentEngine(storage, JOE);
    await engine.updateCard({ cardId: card.id, comment: "first comment" });
    const content = await contentOf(storage, card.id);
    // the append mechanics match the capture (after_signed_in_comment):
    // base + "\n<hr>\n" + <p>-wrapped lines + "\n" + the author div. The
    // author arm differs from the capture's (that runner had no HTTP
    // session, so Ruby's Auth.signed_in? was false even under as_bot); the
    // gem's signed-in arm is "[[Auth.current.name]]" (comment.rb:38-40).
    const captured = capture().get("save|after_signed_in_comment")?.bytes ?? "";
    const capturedTail = captured.slice(captured.indexOf("\n<hr>\n"));
    const expectedTail = capturedTail.replace(
      "Anonymous (Not signed in)",
      "[[Joe User]]",
    );
    expect(content).toBe("body before comment" + expectedTail);
    expect(content).toContain(
      '<div class="w-comment-author">[[Joe User]].....2026-09-29 12:00:00 UTC</div>',
    );
  });

  it("a multi-line comment wraps every line, blank lines become &nbsp;", async () => {
    const storage = await createActionsTestStorage();
    // the write-rule machinery a real deck bootstraps (seedStandardDeck's
    // *all+*update -> [[Anyone]]): the deny-by-default write gate refuses a
    // rule-less deck's save, which would shadow the comment machinery under
    // test (verdict-semantics MEDIUM-2; sweep fix, semantics-followups)
    await seedStandardDeck(storage);
    const card = await seedCard(storage, {
      name: "Supercard",
      dbContent: "body before comment",
    });
    const engine = commentEngine(storage, JOE);
    await engine.updateCard({ cardId: card.id, comment: "line one\n\nline three" });
    const content = await contentOf(storage, card.id);
    // the capture (after_multiline_comment): "\n<hr>\n<p>line one</p>\n<p>&nbsp;</p>\n<p>line three</p>\n" + div
    expect(content).toContain(
      "\n<hr>\n<p>line one</p>\n<p>&nbsp;</p>\n<p>line three</p>\n<div class=\"w-comment-author\">",
    );
  });

  it("a blank (present but empty) comment appends nothing", async () => {
    const storage = await createActionsTestStorage();
    // the write-rule machinery a real deck bootstraps (seedStandardDeck's
    // *all+*update -> [[Anyone]]): the deny-by-default write gate refuses a
    // rule-less deck's save, which would shadow the comment machinery under
    // test (verdict-semantics MEDIUM-2; sweep fix, semantics-followups)
    await seedStandardDeck(storage);
    const card = await seedCard(storage, {
      name: "Supercard",
      dbContent: "body before comment",
    });
    const engine = commentEngine(storage, JOE);
    await engine.updateCard({ cardId: card.id, comment: "" });
    const captured = capture().get("save|after_blank_comment");
    expect(captured?.unchanged).toBe(true);
    expect(await contentOf(storage, card.id)).toBe("body before comment");
  });

  it("an anonymous save is denied before the comment machinery runs", async () => {
    const storage = await createActionsTestStorage();
    // NO write-rule fallback here: the deck stays rule-less so the save is
    // denied by the deny-by-default write gate itself (who_can -> [] ->
    // among? -> false, permissions.rb:47-49/:100-118) — the same
    // permission-denial mechanism class as the capture's "Permission
    // denied" line; granting [[Anyone]] would let the save through.
    const card = await seedCard(storage, {
      name: "Supercard",
      dbContent: "body before comment",
    });
    const engine = commentEngine(storage, ANON);
    // the capture (anonymous_denied): ActiveRecord::RecordInvalid
    // "Permission denied You don't have permission to update Supercard" —
    // the port's equivalent is the permission-denied CardActionError.
    const captured = capture().get("save|anonymous_denied");
    expect(captured?.error).toContain("Permission denied");
    await expect(
      engine.updateCard({ cardId: card.id, comment: "anon should be denied" }),
    ).rejects.toThrow();
    expect(await contentOf(storage, card.id)).toBe("body before comment");
  });

  it("a create with a comment appends onto the created content", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = commentEngine(storage, JOE);
    const result = await engine.createCard({
      name: "Fresh Card",
      content: "the body",
      comment: "created with comment",
    });
    const content = await contentOf(storage, result.cardId);
    expect(content).toBe(
      "the body\n<hr>\n<p>created with comment</p>\n" +
        '<div class="w-comment-author">[[Joe User]].....2026-09-29 12:00:00 UTC</div>',
    );
  });

  it("without the comment mod loaded, a comment param rides along inert", async () => {
    // Ruby: the event exists only when the mod is loaded. The engine with
    // NO modEvents runtime has no add_comment body — the save succeeds and
    // the content is untouched.
    const storage = await createActionsTestStorage();
    // same real-deck rule shape as the arms above: the save itself must be
    // allowed so the arm proves the ABSENCE of the comment event, not the
    // write gate's deny-on-empty
    await seedStandardDeck(storage);
    const card = await seedCard(storage, { name: "Supercard", dbContent: "body" });
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: clock,
    });
    await engine.updateCard({ cardId: card.id, comment: "nobody listens" });
    expect(await contentOf(storage, card.id)).toBe("body");
  });

  // The Env.session carry (comment.rb:6 writes the resolved author into
  // the session before the blank skip; the reader's session arm :16-19
  // wins over the params). The caller-side wiring (2026-10-19, the
  // mods-first-half lane): UpdateCardInput.commentAuthorSession is the
  // caller's bag - the engine passes it as the save input's session, the
  // event mutates it in place, and the route's cookie re-serialization
  // carries it to the next request.
  it("a save carrying a session bag sticks its author; the next save reads the session arm first", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const card = await seedCard(storage, {
      name: "Sticky Author Probe",
      dbContent: "base",
    });
    // ANON + the deck's *anonymous codename card: the engine reads the
    // actor AS the anonymous session (isAnonymousSession), so the
    // signed-in "[[Name]]" arm stays out of the way and the card-level
    // resolution + the session arm are what the bytes show - Ruby's
    // Auth.signed_in? false shape. Writes stay allowed (the actor is the
    // anonymous ACCOUNT, not the read-only null session).
    const anonCard = await seedCard(storage, { name: "*anonymous", codename: "anonymous", typeId: 14 });
    const engine = commentEngine(storage, { id: anonCard.id, name: "*anonymous" } as typeof ANON);
    const bag: { commentAuthor?: string } = {};
    await engine.updateCard({
      cardId: card.id,
      comment: "first comment",
      commentAuthor: "Zebra",
      commentAuthorSession: bag,
    });
    // comment.rb:6: the CARD-LEVEL resolution (session -> params ->
    // "Anonymous") lands in the session even though the actor is signed in.
    expect(bag.commentAuthor).toBe("Zebra");
    let content = await contentOf(storage, card.id);
    expect(content).toContain("Zebra (Not signed in)");

    // The SECOND save in the same session: the reader takes the session
    // arm FIRST (comment.rb:16-19) - the freshly posted author loses to
    // the sticky one, exactly as in Ruby.
    await engine.updateCard({
      cardId: card.id,
      comment: "second comment",
      commentAuthor: "Yak",
      commentAuthorSession: bag,
    });
    content = await contentOf(storage, card.id);
    expect(content).toContain("first comment");
    expect(content).toContain("Zebra (Not signed in)");
    expect(content).not.toContain("Yak");
    // ...and the session keeps its first author (the write re-resolves
    // session-first, so the sticky value is self-perpetuating).
    expect(bag.commentAuthor).toBe("Zebra");
    storage.close();
  });

  it("an anonymous save with no declared author sticks Anonymous (comment.rb:6 fallback)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const card = await seedCard(storage, { name: "Anon Author Probe", dbContent: "base" });
    const anonCard = await seedCard(storage, { name: "*anonymous", codename: "anonymous", typeId: 14 });
    const engine = commentEngine(storage, { id: anonCard.id, name: "*anonymous" } as typeof ANON);
    const bag: { commentAuthor?: string } = {};
    await engine.updateCard({ cardId: card.id, comment: "anon comment", commentAuthorSession: bag });
    expect(bag.commentAuthor).toBe("Anonymous");
    storage.close();
  });
});

describe("E6 add_comment — the helper byte shapes (comment.jsonl + gem source)", () => {
  it("cleanComment wraps lines, blank lines become &nbsp; (the capture's multi-line bytes)", () => {
    const captured = capture().get("save|after_multiline_comment")?.bytes ?? "";
    expect(captured).toContain("<p>line one</p>\n<p>&nbsp;</p>\n<p>line three</p>");
    expect(cleanComment("line one\n\nline three")).toBe(
      "<p>line one</p>\n<p>&nbsp;</p>\n<p>line three</p>",
    );
  });

  it("the signature div is author + ..... + the Ruby timestamp (capture-exact)", () => {
    const captured = capture().get("format|comment_signature_anonymous")?.bytes ?? "";
    expect(captured).toBe(
      '<div class="w-comment-author">Anonymous (Not signed in).....2026-09-29 12:00:00 UTC</div>',
    );
    expect(commentSignature("Anonymous (Not signed in)", FROZEN)).toBe(captured);
    expect(rubyTimestamp(FROZEN)).toBe("2026-09-29 12:00:00 UTC");
  });

  it("the author arms: signed-in [[]] vs (Not signed in) with the param fallback", () => {
    expect(commentAuthorFor({ signedInActorName: "Joe User", commentAuthor: undefined })).toBe(
      "[[Joe User]]",
    );
    // the capture's format|comment_signature_anonymous ran with
    // Env.params[:comment_author] = "Riley" → "Riley (Not signed in)"
    // is the param arm's shape (the capture's OWN author fell through to
    // "Anonymous" because the runner's Env.params carried no comment_author).
    expect(commentAuthorFor({ signedInActorName: undefined, commentAuthor: "Riley" })).toBe(
      "Riley (Not signed in)",
    );
    expect(commentAuthorFor({ signedInActorName: undefined, commentAuthor: undefined })).toBe(
      "Anonymous (Not signed in)",
    );
  });

  it("appendComment joins with \\n<hr>\\n, and compact drops a NIL content", () => {
    // comment.rb:8 `[content, format.comment_with_signature].compact.join
    // "\n<hr>\n"`: compact drops a NIL content, so a card with NO content
    // receives the signature ALONE, with no separator. An EMPTY content is
    // not nil, so it keeps the separator.
    expect(appendComment(undefined, "hi", "Anonymous (Not signed in)", FROZEN)).toBe(
      "<p>hi</p>\n<div class=\"w-comment-author\">Anonymous (Not signed in).....2026-09-29 12:00:00 UTC</div>",
    );
    expect(appendComment("", "hi", "Anonymous (Not signed in)", FROZEN)).toBe(
      "\n<hr>\n<p>hi</p>\n<div class=\"w-comment-author\">Anonymous (Not signed in).....2026-09-29 12:00:00 UTC</div>",
    );
    expect(appendComment("body", "hi", "[[Joe User]]", FROZEN)).toBe(
      "body\n<hr>\n<p>hi</p>\n<div class=\"w-comment-author\">[[Joe User]].....2026-09-29 12:00:00 UTC</div>",
    );
  });

  it("the event body is a no-op without a save input or with a blank comment", async () => {
    await addCommentEventFn({
      comment: undefined,
      commentAuthor: undefined,
      signedInActorName: undefined,
      now: clock,
      pendingContent: "x",
      setContent: () => {
        throw new Error("must not be called");
      },
      commentApplied: false,
    });
    const save = {
      comment: "",
      commentAuthor: undefined,
      signedInActorName: undefined,
      now: clock,
      pendingContent: "x",
      setContent: () => {
        throw new Error("must not be called");
      },
      commentApplied: false,
    };
    await addCommentEventFn(save);
    expect(save.commentApplied).toBe(false);
  });
});
