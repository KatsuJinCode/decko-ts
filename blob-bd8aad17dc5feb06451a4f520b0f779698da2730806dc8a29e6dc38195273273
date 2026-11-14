// The C6 harness predicate — "search for a nonexistent name offers a create
// link" — graded against the bytes Ruby's own views render.
//
//   node --test tools/edge-signed-in-exercise/test/search-create-offer.test.mjs
//
// The positive fixture is the COMMITTED RUBY CAPTURE of the item's own label:
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
// arm probe-view:500:add_autocomplete_item@set/all/autocomplete.rb (the live
// Ruby render of the gem's verbatim autocomplete_item.haml). The capture is
// read from the file, not transcribed, and the class order in it - Haml's
// explicit class attribute BEFORE the static shorthand - is the byte the
// predicate grades.
//
// Registry row cap-C6 (tools/edge-signed-in-exercise/capabilities.json, id C6)
// recorded "Whole-page create/new regex can match unrelated navbar; no
// result-specific link." The predicate it replaces was
// /create|new card|\/new\//i over the whole search page. Tests 4 and 5 are the
// pages that regex cannot tell apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createOfferFor,
  createOfferDestination,
  offersCreateLink,
  rubyNameFromMark,
  urlKey,
} from "../lib/search-create-offer.mjs";

/** The committed Ruby source of the fold this row's destination leg grades:
 *  card-1.110.0 lib/card/fetch/card_class.rb (the repo's own copy of it,
 *  prototype/lib/card/fetch/card_class.rb). */
const RUBY_CARD_CLASS = readFileSync(
  new URL("../../../prototype/lib/card/fetch/card_class.rb", import.meta.url),
  "utf8",
);

const CAPTURE_LINES = readFileSync(
  new URL(
    "../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl",
    import.meta.url,
  ),
  "utf8",
)
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));

const captureArm = (id) => CAPTURE_LINES.find((line) => line.id === id)?.result?.html ?? null;

const RUBY_ADD_LABEL = captureArm("probe-view:500:add_autocomplete_item@set/all/autocomplete.rb");
const RUBY_GOTO_LABEL = captureArm("probe-view:508:goto_autocomplete_item@set/all/autocomplete.rb");

const TERM = "Oracle Missing Card";

/** The create offer's label for a given term. The captured Ruby bytes ARE the
 *  oracle for the label's shape (the class order, the icon division, the
 *  label division, the quoting); the one substitution is the name inside the
 *  label division, because the label's text IS the card's name
 *  (search.rb:47-49 autocomplete_label = card.name) and the captured card was
 *  named "Decko Bot". Nothing else in the captured bytes is touched. */
const labelFor = (term) => RUBY_ADD_LABEL.replace("Decko Bot", term);

/** The items Ruby assembles for a name that does not exist: the search entry
 *  (search.rb:96-98) and the create offer (search.rb:100-106). */
function items(term = TERM, label = labelFor(TERM)) {
  return [
    {
      url: `https://decko.test/*search?query%5Bkeyword%5D=${encodeURIComponent(term)}`,
      action: "search",
      value: term,
      label: labelFor(term),
    },
    {
      url: `https://decko.test/${urlKey(term)}`,
      action: "add",
      value: term,
      label,
    },
  ];
}

const destination = (term = TERM) => ({
  status: 200,
  formOffered: true,
  nameFieldValue: term,
  createFormAction: "/card/create",
});

test("the committed Ruby capture holds the item's own bytes", () => {
  assert.ok(RUBY_ADD_LABEL !== null, "the add_autocomplete_item arm is in the capture");
  assert.ok(RUBY_GOTO_LABEL !== null, "the goto_autocomplete_item arm is in the capture");
  // Haml's class order: the explicit class attribute first, the static
  // shorthand second.
  assert.ok(RUBY_ADD_LABEL.startsWith("<div class='autocomplete-item-add autocomplete-item'>"));
  assert.ok(RUBY_GOTO_LABEL.startsWith("<div class='autocomplete-item-goto autocomplete-item'>"));
});

test("the offer is read as Ruby's own items make it", () => {
  const verdict = createOfferFor(items(), TERM);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  // The create offer's action and value (search.rb:100-106).
  assert.equal(verdict.add.action, "add");
  assert.equal(verdict.add.value, TERM);
  // The destination: the card's own path, absolute (path.rb:35-44 standard,
  // the json format's contextualize_path = card_url).
  assert.equal(verdict.add.url, `https://decko.test/${urlKey(TERM)}`);
  // The label: the captured Ruby bytes, read for their class and their name.
  assert.deepEqual(verdict.label.classes, ["autocomplete-item-add", "autocomplete-item"]);
  assert.equal(verdict.label.text, TERM);
  // The search entry is there too, and is NOT the offer.
  assert.equal(verdict.search.action, "search");
});

test("url_key folds the name the way Ruby's cardname gem does", () => {
  // cardname-0.20.0 lib/cardname/variants.rb:8-13 - every run of characters
  // outside the key set folds to a single "_", and the ends are trimmed.
  assert.equal(urlKey("Oracle Missing Card"), "Oracle_Missing_Card");
  assert.equal(urlKey("  Oracle  Missing  Card  "), "Oracle_Missing_Card");
  assert.equal(urlKey("a/b"), "a_b");
  assert.equal(urlKey("RichText+discussion"), "RichText+discussion");
});

test("a goto item for the missing name is not the create offer (the cap-C6 defect)", () => {
  // search.rb:124-126: the exact name joins the goto items only when it is
  // KNOWN. A name that does not exist must not arrive as a goto suggestion.
  const withGoto = items();
  withGoto.push({
    url: `https://decko.test/${urlKey(TERM)}`,
    action: "goto",
    value: TERM,
    label: RUBY_GOTO_LABEL,
  });
  const verdict = createOfferFor(withGoto, TERM);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.failures, ["gotoItemForMissingName"]);
});

test("a page with only a navbar word is not the offer", () => {
  // The replaced regex passed on the navbar's own "new card" link, with no
  // offer item at all.
  const verdict = createOfferFor(
    [
      {
        url: "https://decko.test/*search?query%5Bkeyword%5D=x",
        action: "search",
        value: TERM,
        label: labelFor(TERM),
      },
    ],
    TERM,
  );
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("noAddItem"));
  // The search entry alone, with no create offer, is not an offer.
  const noSearch = items().filter((item) => item.action !== "search");
  assert.ok(createOfferFor(noSearch, TERM).failures.includes("noSearchItem"));
});

test("the offer's label must be Ruby's, and the value must be the term", () => {
  // A label from another item family is not the create offer.
  const wrongLabel = createOfferFor(items(TERM, RUBY_GOTO_LABEL.replace("Decko Bot", TERM)), TERM);
  assert.equal(wrongLabel.ok, false);
  assert.ok(wrongLabel.failures.includes("addLabelClass"));
  // The value must be the term that was searched.
  const wrongValue = items();
  wrongValue[1].value = "Something Else";
  const verdict = createOfferFor(wrongValue, TERM);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("addValue"));
  // A url that is not the card's own path is not the offer's destination.
  const wrongUrl = items();
  wrongUrl[1].url = "https://decko.test/somewhere/else";
  assert.ok(createOfferFor(wrongUrl, TERM).failures.includes("addUrl"));
});

test("the create form carries the NAME Ruby decodes the mark into, not the path segment", () => {
  // THE DEFECT THIS PINS. The destination leg compared the create form's name
  // field with the searched TERM verbatim. The signed-in run of 2026-10-22
  // recorded the leg as failures ["destinationNameField"] on a create form
  // that carried "zz no such card harness mvj8s7ka" for the address
  // /zz_no_such_card_harness_mvj8s7ka - a form that renders exactly as Ruby
  // renders it.
  //
  // THE ORACLE: the committed Ruby source of the decode,
  // card-1.110.0 lib/card/fetch/card_class.rb:128-133 uri_fetch_opts -
  //   opts[:name] ||= Name[params[:mark]]&.tr "_", " "
  // The mark is the path segment; the NAME is the mark with every underscore
  // folded to a space. The fold is in the name, not in the lookup (the two
  // spellings share one cardname key).
  assert.match(
    RUBY_CARD_CLASS,
    /def uri_fetch_opts params[\s\S]*?opts\[:name\] \|\|= Name\[params\[:mark\]\]&\.tr "_", " "/,
  );

  const underscored = "zz_no_such_card_harness_mvj8s7ka";
  // The address the offer names is the card's url_key (the term, underscored).
  assert.equal(urlKey(underscored), underscored);
  // The name Ruby derives from that mark.
  assert.equal(rubyNameFromMark(underscored), "zz no such card harness mvj8s7ka");
  // The form's name field carries the NAME, so the leg is green on it.
  const spaced = createOfferDestination(
    { status: 200, formOffered: true, nameFieldValue: "zz no such card harness mvj8s7ka" },
    underscored,
  );
  assert.equal(spaced.ok, true, spaced.failures.join(", "));
  // The path segment itself is NOT the name, so a form that carried the
  // underscored spelling fails.
  const raw = createOfferDestination(
    { status: 200, formOffered: true, nameFieldValue: underscored },
    underscored,
  );
  assert.equal(raw.ok, false);
  assert.deepEqual(raw.failures, ["destinationNameField"]);
  // A name that is neither spelling fails too.
  const other = createOfferDestination(
    { status: 200, formOffered: true, nameFieldValue: "Some Other Card" },
    underscored,
  );
  assert.deepEqual(other.failures, ["destinationNameField"]);
  // A term that is already spaced keeps its own spelling (the space-spelled
  // address and the underscored address are the same card).
  assert.equal(rubyNameFromMark(urlKey(TERM)), TERM);
  assert.equal(createOfferDestination(destination(), TERM).ok, true);
});

test("the destination must open the create form for that name", () => {
  // card-mod-format-0.20.0 set/all/html/error.rb:81-87: an unknown card
  // renders :new with status 200 when the viewer may create it, and 404
  // otherwise. A 404 is not a create offer.
  assert.equal(createOfferDestination(destination(), TERM).ok, true);
  const notFound = createOfferDestination({ ...destination(), status: 404 }, TERM);
  assert.equal(notFound.ok, false);
  assert.deepEqual(notFound.failures, ["destinationStatus"]);
  // A page with no form is not a create form.
  const noForm = createOfferDestination({ ...destination(), formOffered: false }, TERM);
  assert.deepEqual(noForm.failures, ["destinationHasNoForm"]);
  // A create form for a DIFFERENT name is not this offer.
  const otherName = createOfferDestination({ ...destination(), nameFieldValue: "Other Card" }, TERM);
  assert.deepEqual(otherName.failures, ["destinationNameField"]);
});

test("the check's own predicate needs the offer AND the destination", () => {
  const good = offersCreateLink(items(), TERM, destination());
  assert.equal(good.ok, true);
  assert.deepEqual(good.offerFailures, []);
  assert.deepEqual(good.destinationFailures, []);
  const noDestination = offersCreateLink(items(), TERM, { status: 404, formOffered: false, nameFieldValue: null });
  assert.equal(noDestination.ok, false);
  assert.deepEqual(noDestination.offerFailures, []);
  assert.ok(noDestination.destinationFailures.includes("destinationStatus"));
  const noOffer = offersCreateLink([], TERM, destination());
  assert.equal(noOffer.ok, false);
  assert.ok(noOffer.offerFailures.includes("noAddItem"));
});
