// The comment box's update-permission verdict: the _left rule-value
// inheritance (census M8, Joan_Callahan_20230902+discussion:open -1073).
//
// Ruby mechanism (card-mod-permissions set/all/permissions.rb:55-71):
//
//   def permission_rule_id action
//     if compound? && rule(action).match?(/^\[?\[?_left\]?\]?$/)
//       left_permission_rule_id action
//     else
//       rule_card_id action
//     end
//   end
//
// For a COMPOUND card whose applicable *update rule's VALUE is "_left"
// ("inherit from left"), the who-can rule recurses to the LEFT card's own
// *update rule. The graded pair pins the surface: Joan_Callahan_20230902+
// discussion's own chain first resolves *all plus+*update = rule 6571
// (content "_left"), so the verdict recurses to Joan Callahan 20230902
// (45129), whose *self rule (45186) grants "Anyone" -- the anonymous
// viewer's update PASSES and the comment-box form renders (the pair's
// closing bytes, recaptcha site key per the live deployment config).
//
// Guards pin the same walk's other three outcomes:
//   - Klickstein continues+discussion resolves its OWN *self rule (9841,
//     "Anyone") before any _left -- the form already renders today and
//     must keep rendering;
//   - Perennial Wisdom Tradition/Work Week/MNv ITM discussions also first
//     resolve 6571 ("_left"), but their LEFT cards carry no *update rule,
//     so the recursion lands on the same _left rule from a SIMPLE card --
//     compound? is false there (permissions.rb:56), rule_card_id answers
//     6571 whose "_left" content parses no party items, who_can -> [] ->
//     among? -> false -- the boxes stay blank.
//
// Env-gated like every corpus-replay suite (the seed costs ~40s):
//   COMMENT_BOX_LEFT_INHERIT_REPLAY=1

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { setDeploymentFollowLiveConfig } from "../../../src/card/render/deployment-follow-live-config.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const KAYLA_PAIR = path.join(
  REPO_ROOT,
  "tmp",
  "view187-census",
  "probe-armed-w37",
  "expected--Joan_Callahan_20230902_discussion__open.html",
);

const REPLAY_REQUESTED = process.env.COMMENT_BOX_LEFT_INHERIT_REPLAY === "1";

/** The graded form bytes: the comment-box div of the Kayla open pair,
 *  from its opening tag through the form close (the region the verdict
 *  gates; slot ids and page chrome around it are not this pin's subject). */
function kaylaCommentBoxBytes(): string {
  const html = readFileSync(KAYLA_PAIR, "utf8");
  const start = html.indexOf('<div class="comment-box nodblclick">');
  const close = html.indexOf("</form></div>", start);
  if (start < 0 || close < 0) throw new Error("kayla pair: comment-box region not found");
  return html.slice(start, close + "</form></div>".length);
}

describe("comment box: the _left update-rule inheritance walk", () => {
  it(
    "renders the inherited-grant form, keeps the self-rule and no-rule outcomes",
    { timeout: 240_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/comment-box-left-rule-update-inheritance-pins.test.ts", "REPLAY_REQUESTED");
        return;
      }
      // The graded environment's live deployment constants (the probe
      // harness's own binding; the live recaptcha site key rides the form).
      setDeploymentFollowLiveConfig({
        serializerEra: "live",
        defaultHtmlViewNest: "content",
        mainStylesheetRevisionDigits: "0000000001",
        footerDeckoVersion: "0.19.1",
        recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
        deckoRootUrl: "https://example.com/",
      });

      const db = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      db.close();

      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
      try {
        const expectedForm = kaylaCommentBoxBytes();
        expect(expectedForm).toContain("Joan_Callahan_20230902+discussion");
        expect(expectedForm).toContain("6LSYNTHETICLIVEKEY00000000000000000000AA");

        // THE PIN: the inherited-grant form renders (RED at base: the
        // engine's _left-less walk denies update, the gate blanks the box).
        const kaylaOpen = await storage.engine.render(
          "Joan Callahan 20230902+discussion",
          "open",
        );
        expect(kaylaOpen, "kayla: the comment-box form must render").toContain(
          expectedForm,
        );

        // GUARD: the self-rule grant (Klickstein) keeps rendering its form.
        const klickOpen = await storage.engine.render(
          "Klickstein continues+discussion",
          "open",
        );
        expect(klickOpen, "klickstein: the self-rule form must keep rendering").toContain(
          '<div class="comment-box nodblclick">',
        );

        // GUARDS: the no-left-rule blanks stay blank.
        for (const name of [
          "Perennial Wisdom Tradition+discussion",
          "Work Week+discussion",
          "MNv Instructor Training Manual ITM+discussion",
        ]) {
          const open = await storage.engine.render(name, "open");
          expect(open, `${name}: no comment box`).not.toContain(
            '<div class="comment-box nodblclick">',
          );
        }
      } finally {
        storage.close();
      }
    },
  );
});
