// junction-edit-modal.oracle.test.mjs — the E11b instrument's expectations,
// pinned to RUBY's own captured bytes.
//
// WHAT THIS PINS. The E11b check ("the +summary junction's own edit modal
// targets the junction card with its stored content") grades four facts
// about the edit modal a nested card's edit link opens:
//
//   1. the form carries the persisted-record dom id "edit_card_<id>"
//   2. the form posts to the card's own /update/ route
//   3. the form sits inside the junction card's own slot (data-card-id)
//   4. the content field is the card[content] textarea, holding the card's
//      stored content
//
// A live DOM proves only that the port agrees with itself. This test reads
// the same four facts out of the COMMITTED REAL-RUBY capture - the render of
// the same views by the real Ruby engine against the pinned gems - and
// grades them with the SAME contract function the check uses
// (lib/junction-edit-modal.mjs). Ruby's own bytes must satisfy the
// contract the port is held to.
//
// THE ARMS, READ FROM THE CAPTURE, NOT TRANSCRIBED.
//
//   probe-view:136:edit_form@set/all/edit_content.rb
//     <div id="decko_bot-edit_form-view" class="card-slot edit_form-view
//     ... data-card-id="1" ...><form class="card-form slotter autosave"
//     id="edit_card_1" ... action="/update/Decko_Bot" ...>
//
//   probe-view:133:content_formgroup@set/all/form.rb
//     <div class="form-group card-editor" data-card-id="1" ...><label
//     for="card_content">Content</label>...<textarea rows="3"
//     class="tinymce-textarea d0-card-content form-control"
//     id="decko_bot-1" name="card[content]">&lt;p&gt;...&lt;/p&gt;
//     </textarea></div>
//
// The arms are read out of
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
// by id, so a capture that moves or changes turns this test red instead of
// leaving a stale expectation behind.
//
// No browser, no network, no deck.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { editModalFactsFromMarkup, editModalContract, readAttributes, decodeEntities } from "../lib/junction-edit-modal.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(HERE, "..", "..", "..", "reference-harness", "fixtures", "synthetic-v2-mod-probes", "expected", "render.jsonl");

/** The capture's arms, by id. */
const arms = new Map();
for (const line of readFileSync(CAPTURE, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const arm = JSON.parse(trimmed);
  arms.set(arm.id, arm.result?.html ?? null);
}

const EDIT_FORM_ARM = "probe-view:136:edit_form@set/all/edit_content.rb";
const CONTENT_FIELD_ARM = "probe-view:133:content_formgroup@set/all/form.rb";

test("the oracle arms this test reads are in the committed capture", () => {
  assert.ok(arms.has(EDIT_FORM_ARM), `${EDIT_FORM_ARM} must be in the capture`);
  assert.ok(arms.has(CONTENT_FIELD_ARM), `${CONTENT_FIELD_ARM} must be in the capture`);
  assert.equal(typeof arms.get(EDIT_FORM_ARM), "string");
  assert.equal(typeof arms.get(CONTENT_FIELD_ARM), "string");
});

test("Ruby's own edit form carries the facts the E11b contract grades", () => {
  const facts = editModalFactsFromMarkup(arms.get(EDIT_FORM_ARM));
  assert.equal(facts.formId, "edit_card_1", "Rails' form_for dom id for a persisted card");
  assert.equal(facts.formAction, "/update/Decko_Bot", "the card's own update route");
  assert.equal(facts.targetCardId, 1, "the form sits inside the card's own slot");
});

test("Ruby's own content field carries the facts the E11b contract grades", () => {
  const facts = editModalFactsFromMarkup(arms.get(CONTENT_FIELD_ARM));
  assert.equal(facts.contentFieldName, "card[content]");
  assert.equal(facts.targetCardId, 1);
  // The capture's textarea body is the card's stored content, escaped by
  // Rails' content_tag (tag_helper.rb:44): the capture carries `&lt;p&gt;`
  // and a browser's DOM holds `<p>` again.
  assert.match(facts.contentValue, /^<p>/);
  assert.match(facts.contentValue, /<\/p>$/);
});

test("Ruby's own bytes satisfy the contract the E11b check enforces", () => {
  const formFacts = editModalFactsFromMarkup(arms.get(EDIT_FORM_ARM));
  const fieldFacts = editModalFactsFromMarkup(arms.get(CONTENT_FIELD_ARM));
  const facts = {
    formId: formFacts.formId,
    formAction: formFacts.formAction,
    targetCardId: formFacts.targetCardId,
    contentFieldName: fieldFacts.contentFieldName,
    contentValue: fieldFacts.contentValue,
  };
  const contract = editModalContract(facts, { expectedCardId: 1, expectedContent: facts.contentValue });
  assert.deepEqual(contract.problems, [], "Ruby's own bytes must satisfy the contract");
  assert.equal(contract.ok, true);
});

test("the contract rejects a form that is not the card's own", () => {
  const formFacts = editModalFactsFromMarkup(arms.get(EDIT_FORM_ARM));
  const fieldFacts = editModalFactsFromMarkup(arms.get(CONTENT_FIELD_ARM));
  const facts = {
    formId: formFacts.formId,
    formAction: formFacts.formAction,
    targetCardId: formFacts.targetCardId,
    contentFieldName: fieldFacts.contentFieldName,
    contentValue: fieldFacts.contentValue,
  };
  // A form that posts somewhere else.
  assert.equal(editModalContract({ ...facts, formAction: "/card/create" }, { expectedCardId: 1 }).ok, false);
  // A form with the new-record dom id instead of the persisted one.
  assert.equal(editModalContract({ ...facts, formId: "new_card" }, { expectedCardId: 1 }).ok, false);
  // A form that is inside ANOTHER card's slot.
  assert.equal(editModalContract({ ...facts, targetCardId: 99 }, { expectedCardId: 1 }).ok, false);
  // A content field that is not the card[content] textarea.
  assert.equal(editModalContract({ ...facts, contentFieldName: "card[name]" }, { expectedCardId: 1 }).ok, false);
  // An editor that carries another card's content.
  assert.equal(editModalContract(facts, { expectedCardId: 1, expectedContent: "something else" }).ok, false);
});

test("the reader accepts either quoting style, because Ruby writes the apostrophe", () => {
  // This gem's Haml attr_wrapper is the apostrophe, so Ruby's own bytes read
  // class='card-slot' while a browser's serialization reads class="card-slot".
  const apostrophe = "<div class='card-slot' data-card-id='7'><form class='card-form slotter' id='edit_card_7' action='/update/X'><textarea name='card[content]'>&lt;p&gt;x&lt;/p&gt;</textarea></form></div>";
  const facts = editModalFactsFromMarkup(apostrophe);
  assert.equal(facts.formId, "edit_card_7");
  assert.equal(facts.formAction, "/update/X");
  assert.equal(facts.targetCardId, 7);
  assert.equal(facts.contentFieldName, "card[content]");
  assert.equal(facts.contentValue, "<p>x</p>");
});

test("a form that posts off the owned origin is refused", () => {
  const formFacts = editModalFactsFromMarkup(arms.get(EDIT_FORM_ARM));
  const fieldFacts = editModalFactsFromMarkup(arms.get(CONTENT_FIELD_ARM));
  const facts = {
    formId: formFacts.formId,
    formAction: formFacts.formAction,
    targetCardId: formFacts.targetCardId,
    contentFieldName: fieldFacts.contentFieldName,
    contentValue: fieldFacts.contentValue,
  };
  // A relative action stays on the owned origin by construction.
  assert.equal(editModalContract(facts, { expectedCardId: 1, origin: "https://127.0.0.1:8443" }).ok, true);
  // An absolute action on another origin is not.
  const offOrigin = editModalContract({ ...facts, formAction: "https://elsewhere.example/update/X" }, { expectedCardId: 1, origin: "https://127.0.0.1:8443" });
  assert.equal(offOrigin.ok, false);
  assert.ok(offOrigin.problems.some((problem) => /off the owned origin/.test(problem)));
  // An absolute action on the owned origin is read by its path.
  const onOrigin = editModalContract({ ...facts, formAction: "https://127.0.0.1:8443/update/Decko_Bot" }, { expectedCardId: 1, origin: "https://127.0.0.1:8443" });
  assert.equal(onOrigin.ok, true);
});

test("the attribute reader and the entity decoder behave", () => {
  const attributes = readAttributes(` class="card-form slotter" id='edit_card_1' action="/update/X" data-remote="true"`);
  assert.equal(attributes.class, "card-form slotter");
  assert.equal(attributes.id, "edit_card_1");
  assert.equal(attributes.action, "/update/X");
  assert.equal(attributes["data-remote"], "true");
  assert.equal(decodeEntities("&lt;p&gt;a &amp; b&lt;/p&gt;"), "<p>a & b</p>");
});
