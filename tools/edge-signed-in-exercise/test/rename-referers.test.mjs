// The R1 referer leg - "referers updated" - graded on the card_references rows
// Ruby actually rewrites on a rename.
//
//   node --test tools/edge-signed-in-exercise/test/rename-referers.test.mjs
//
// PINNED AGAINST COMMITTED RUBY BYTES:
//
// 1. fixtures/captured/email-templates-raw-oracle.json carries 7,944
//    card_references rows read out of the real Ruby deck (provenance: the
//    pass17-int raw ground-truth deck, extracted read-only). Test 1 asserts the
//    row shape the predicate assumes is Ruby's, not invented: the columns are
//    exactly referer_id/referee_id/referee_key, and 532 of the rows carry a
//    NULL referee_id. That null is why the predicate grades a stale row as
//    "old key WITH a live id" only - a null id is unmap_referees
//    (reference.rb:31-32), a legal Ruby state after a rename, and grading it as
//    a failure would reject Ruby output.
//
// 2. reference-harness/browser/journeys/synthetic-v1.json is the committed
//    journey corpus the harness grades against Ruby on every run. Test 2 asserts
//    the leg this module answers is named there, and that the journey gets to
//    it by renaming and THEN visiting the referring card.
//
// 3. fixtures/captured/edit-name-type.json is the committed Ruby capture of the
//    rename form itself (edit_name / name_form, two targets x three actors).
//    Test 3 asserts the form the battery drives is the one Ruby renders.
//
// Tests 4 and 5 are the negative arms: the two failures a text-only check cannot
// see, and one it can.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardKey, referersFollowRename, refererReferenceRows, renameFormShape } from "../lib/rename-referers.mjs";

const ORACLE = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/email-templates-raw-oracle.json", import.meta.url), "utf8"),
);
const JOURNEYS = JSON.parse(
  readFileSync(new URL("../../../reference-harness/browser/journeys/synthetic-v1.json", import.meta.url), "utf8"),
).journeys;
const EDIT_NAME = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/edit-name-type.json", import.meta.url), "utf8"),
);

test("Ruby's own reference rows carry the shape the predicate grades", () => {
  assert.equal(Array.isArray(ORACLE.references), true);
  assert.equal(ORACLE.references.length > 0, true);
  const columns = new Set(ORACLE.references.flatMap((row) => Object.keys(row)));
  assert.deepEqual([...columns].sort(), ["referee_id", "referee_key", "referer_id"]);
  // A null referee_id is a real, common Ruby state (unmap_referees and
  // Reference.clean, reference.rb:31-32,37), so the predicate must not treat it
  // as a stale reference. Reading them proves the arm the predicate tolerates.
  const nullId = ORACLE.references.filter((row) => row.referee_id === null);
  assert.equal(nullId.length > 0, true);
  // refererReferenceRows drops rows with no referee_key rather than grading
  // them; every Ruby row here has one.
  const rows = refererReferenceRows(ORACLE.references, nullId[0].referer_id);
  assert.equal(rows.length > 0, true);
  assert.equal(rows.every((row) => typeof row.referee_key === "string"), true);
  // A null id survives the read as null, not as 0 or undefined.
  assert.equal(rows.filter((row) => row.referee_id === null).length > 0, true);
});

test("the leg is named in the committed journey corpus, reached by renaming then visiting the referrer", () => {
  const journey = JOURNEYS.find((j) => j.id === "rename-topic-with-referers-admin");
  assert.equal(journey !== undefined, true);
  assert.equal(journey.covers.includes("referers updated"), true);
  const values = journey.steps.filter((s) => "fill" in s).map((s) => s.value);
  const visits = journey.steps.filter((s) => "visit" in s).map((s) => s.visit);
  // It fills a NEW name, then visits a DIFFERENT card: the assertion is about
  // the referer, not about the renamed card.
  assert.equal(values.length, 1);
  assert.equal(values[0], "Topic Zero One");
  assert.equal(visits.includes("/Topic_001?view=edit_name"), true);
  assert.equal(visits.includes("/Note_001"), true);
});

test("the rename form Ruby renders carries the referer control, offered UNCHECKED", () => {
  let graded = 0;
  let denials = 0;
  for (const [target, captured] of Object.entries(EDIT_NAME.targets)) {
    for (const [actor, views] of Object.entries(captured.views)) {
      const shape = renameFormShape(views.name_form);
      if (actor === "anonymous") {
        // :name_form is perms :update (edit_name.rb:6-8 in the port's
        // transcription), so Ruby renders the denial span, not a form. Grading
        // it as a form would demand a rename control nobody may use.
        assert.equal(views.name_form.includes("denied"), true, `${target}/${actor} denial`);
        assert.deepEqual(shape.failures, ["noRenameForm"], `${target}/${actor}`);
        denials += 1;
        continue;
      }
      assert.deepEqual(shape.failures, [], `${target}/${actor}: ${shape.failures.join(", ")}`);
      // Ruby: card[skip] = update_referer_content, inside div.skip-referers,
      // labelled "do not update references to this name".
      assert.equal(shape.skipReferers.name, "card[skip]");
      assert.equal(shape.skipReferers.value, "update_referer_content");
      assert.equal(shape.skipReferers.checked, false);
      assert.equal(shape.renameButton, "submit");
      assert.equal(shape.slotterMode, "update-origin");
      assert.equal(/^\/update\/.+\?id=\d+$/.test(shape.action), true, `${target}/${actor} action`);
      graded += 1;
    }
  }
  assert.equal(graded, Object.keys(EDIT_NAME.targets).length * 2);
  assert.equal(denials, Object.keys(EDIT_NAME.targets).length);
});

test("the name field the battery types into is Ruby's card[name] input", () => {
  const views = EDIT_NAME.targets.basic_note.views.bot;
  const shape = renameFormShape(views.name_form);
  assert.equal(shape.nameField, "Oracle Basics");
});

test("a form with the referer opt-out ON by default fails: it inverts the capability", () => {
  const views = EDIT_NAME.targets.basic_note.views.bot.name_form;
  const inverted = views.replace(
    'name="card[skip]" id="card_skip" value="update_referer_content"',
    'name="card[skip]" id="card_skip" value="update_referer_content" checked',
  );
  assert.notEqual(inverted, views);
  const shape = renameFormShape(inverted);
  assert.equal(shape.ok, false);
  assert.deepEqual(shape.failures, ["skipReferersCheckedByDefault"]);
});

test("a page with no rename form fails rather than grading some other form", () => {
  const shape = renameFormShape("<div><form action='/update/Other'><input name='card[name]' /></form></div>");
  assert.equal(shape.ok, false);
  assert.deepEqual(shape.failures, ["noRenameForm"]);
});

/** A rename whose every leg held, built from the row shapes test 1 read. */
function passing() {
  return {
    oldName: "Harness rename body",
    newName: "Harness rename body_renamed",
    renamedId: 4242,
    writeStatus: 200,
    newStatus: 200,
    oldGoneInDb: true,
    references: [{ referer_id: 7, referee_key: cardKey("Harness rename body_renamed"), referee_id: 4242, ref_type: "L", is_present: 1 }],
    referrerContent: "<p>[[Harness rename body_renamed]]</p>",
  };
}

test("a rename whose reference rows were re-pointed at the new id passes every leg", () => {
  const verdict = referersFollowRename(passing());
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.renamedId, 4242);
});

test("text rewritten but referee_id left stale fails, which a content-string check cannot see", () => {
  const stale = passing();
  // The referrer's text names the new card, so any check that greps stored
  // content passes. The row still carries the OLD key at the OLD id: every
  // reference query, rule and follow in Ruby reads this table
  // (reference_query.rb:5-6), so the reference is now to a card that no longer
  // exists.
  stale.references = [{ referer_id: 7, referee_key: cardKey(stale.oldName), referee_id: 999, ref_type: "L", is_present: 1 }];
  const verdict = referersFollowRename(stale);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("staleRefereeKey"), true);
  assert.equal(verdict.failures.includes("refereeIdNotRemapped"), true);
});

test("a rename that writes no reference at all fails the remap leg", () => {
  const none = passing();
  none.references = [];
  const verdict = referersFollowRename(none);
  assert.deepEqual(verdict.failures, ["refereeIdNotRemapped"]);
});

test("a null referee_id under the old key is unmap_referees, not a stale reference", () => {
  const unmapped = passing();
  // reference.rb:31-32 writes referee_id: nil when the referee is gone. That is
  // Ruby's own output, so the predicate must accept it.
  unmapped.references = [
    { referer_id: 7, referee_key: cardKey(unmapped.oldName), referee_id: null, ref_type: "L", is_present: 1 },
    { referer_id: 7, referee_key: cardKey(unmapped.newName), referee_id: unmapped.renamedId, ref_type: "L", is_present: 1 },
  ];
  assert.deepEqual(referersFollowRename(unmapped).failures, []);
});

test("every other leg fails on its own evidence", () => {
  const write = passing();
  write.writeStatus = 409;
  assert.equal(referersFollowRename(write).failures.includes("write"), true);

  const noWrite = passing();
  noWrite.writeStatus = null;
  assert.equal(referersFollowRename(noWrite).failures.includes("write"), true);

  const status = passing();
  status.newStatus = 404;
  assert.equal(referersFollowRename(status).failures.includes("newCardStatus"), true);

  const noId = passing();
  noId.renamedId = null;
  assert.equal(referersFollowRename(noId).failures.includes("renamedId"), true);

  const liveOld = passing();
  liveOld.oldGoneInDb = false;
  assert.equal(referersFollowRename(liveOld).failures.includes("oldNameStillLive"), true);

  const staleText = passing();
  staleText.referrerContent = `<p>[[${staleText.oldName}]]</p>`;
  const textVerdict = referersFollowRename(staleText);
  assert.equal(textVerdict.failures.includes("contentStaleLink"), true);
  assert.equal(textVerdict.failures.includes("contentNotRewritten"), true);

  // The labelled link form [[name|label]] is the one a rename rewrites too.
  const labelled = passing();
  labelled.referrerContent = `<p>[[${labelled.oldName}|see this]]</p><p>[[${labelled.newName}|see this]]</p>`;
  assert.equal(referersFollowRename(labelled).failures.includes("contentStaleLink"), true);
});
test("the reference table stores the card's KEY, and the grade compares the KEY", () => {
  // THE DEFECT THIS PINS. The signed-in run of 2026-10-22 recorded the R1 leg
  // as failures ["refereeIdNotRemapped"] with the row
  //   {referee_key: "harness_rename_mvjqjstp_renamed", referee_id: 53181}
  // and renamedId 53181 - a rename that had re-pointed the row at the new id
  // exactly as Ruby's map_referees does. The row's key is the card's KEY
  // (card-1.110.0 lib/card/reference.rb:26-27 re-points the rows whose
  // referee_key is the renamed card's key), and the grade compared it with
  // the NAME.
  assert.equal(cardKey("Harness_rename_mvjqjstp_renamed"), "harness_rename_mvjqjstp_renamed");
  assert.equal(cardKey("Harness rename body"), "harness_rename_body");
  assert.equal(cardKey("HarnessRename"), "harness_rename");
  assert.equal(cardKey("a/b"), "a_b");
  // The row keyed by the new card's KEY with the new id IS the remap.
  const verdict = referersFollowRename({
    oldName: "Harness_rename_mvjqjstp",
    newName: "Harness_rename_mvjqjstp_renamed",
    renamedId: 53181,
    writeStatus: 200,
    newStatus: 200,
    oldGoneInDb: true,
    references: [{ referer_id: 7, referee_key: "harness_rename_mvjqjstp_renamed", referee_id: 53181, ref_type: "L", is_present: 1 }],
    referrerContent: "<p>[[Harness_rename_mvjqjstp_renamed]]</p>",
  });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  // And a row still carrying the OLD key with a live id is the stale case.
  const stale = referersFollowRename({
    oldName: "Harness_rename_mvjqjstp",
    newName: "Harness_rename_mvjqjstp_renamed",
    renamedId: 53181,
    writeStatus: 200,
    newStatus: 200,
    oldGoneInDb: true,
    references: [{ referer_id: 7, referee_key: "harness_rename_mvjqjstp", referee_id: 53181, ref_type: "L", is_present: 1 }],
    referrerContent: "<p>[[Harness_rename_mvjqjstp_renamed]]</p>",
  });
  assert.equal(stale.failures.includes("staleRefereeKey"), true);
});

test("the CALLER hands the predicate the form's own html, outer included", () => {
  // THE DEFECT THIS PINS, the other half. The predicate scopes to the form
  // (the one whose class carries "_rename-form") before it reads the name
  // field, the referer opt-out and the rename button, and the caller handed
  // it the form's INNER html - which does not carry the form. The signed-in
  // run of 2026-10-22 recorded the leg as failures ["noRenameForm"] on a page
  // whose rename form rendered exactly as Ruby renders it.
  const coverB = readFileSync(new URL("../checks-cover-b.mjs", import.meta.url), "utf8");
  assert.match(coverB, /renameFormShape\(await page\.locator\("#main form\._rename-form"\)\.first\(\)\.evaluate\(\(el\) => el\.outerHTML\)/);
  assert.equal(/renameFormShape\(await page\.locator\("#main form\._rename-form"\)\.first\(\)\.innerHTML\(\)/.test(coverB), false);
});

test("the skip-referers block is read with EITHER quote character", () => {
  // THE DEFECT THIS PINS, the third half. The committed Ruby capture of the
  // gem's own bytes writes `<div class='skip-referers pb-2'>` with the
  // apostrophe (this deck's Haml attr_wrapper), and the predicate required
  // exactly that. The page the harness reads carries the same block with
  // DOUBLE quotes, so the scope found nothing and the signed-in run of
  // 2026-10-22 recorded the leg as failures ["noSkipReferersBlock"] - with
  // the control itself found (card[skip]=update_referer_content, unchecked)
  // and the form's own action right.
  //
  // The committed Ruby bytes still grade green, and so do the bytes the page
  // carries.
  for (const [target, captured] of Object.entries(EDIT_NAME.targets)) {
    for (const [actor, views] of Object.entries(captured.views)) {
      if (actor === "anonymous") continue;
      const shape = renameFormShape(views.name_form);
      assert.equal(shape.failures.includes("noSkipReferersBlock"), false, `${target}/${actor}: ${JSON.stringify(shape.failures)}`);
      assert.equal(shape.skipReferers?.name, "card[skip]");
      assert.equal(shape.skipReferers?.value, "update_referer_content");
      assert.equal(shape.skipReferers?.checked, false);
    }
  }
  // The page's own quoting grades green too.
  const doubleQuoted = `<form class="_rename-form card-form slotter" action="/update/Name?id=1" data-slotter-mode="update-origin">` +
    `<input value="Name" autocomplete="off" class=" form-control" type="text" name="card[name]" id="card_name">` +
    `<div class="skip-referers pb-2">` +
    `<input type="checkbox" name="card[skip]" id="card_skip" value="update_referer_content">` +
    `<label class="ps-1">do not update references to this name</label>` +
    `</div>` +
    `<button name="button" type="submit" class="renamer btn btn-primary">Rename</button>` +
    `</form>`;
  const shape = renameFormShape(doubleQuoted);
  assert.deepEqual(shape.failures, [], JSON.stringify(shape.failures));
  assert.equal(shape.ok, true);
});
