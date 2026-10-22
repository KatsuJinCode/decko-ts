// The F3 change leg - an image's type must MOVE when a new image is uploaded
// through the edit form - graded on the bytes Ruby renders.
//
//   node --test tools/edge-signed-in-exercise/test/image-core-view.test.mjs
//
// PINNED AGAINST COMMITTED RUBY REFERENCE BYTES:
//
// fixtures/vendor/card-mod-carrierwave-0.20.0/set/type/image/html_views.rb is
// copied verbatim out of the gem; test 1 asserts its sha256. Tests 2-4 read the
// structure out of it - image_tag source, alt: card.name; the invalid_image
// comment; preview's _render_core size: :medium - rather than restating it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  IMAGE_SIZES,
  imageCoreShows,
  imageTags,
  invalidImageComment,
  sourceExtension,
} from "../lib/image-core-view.mjs";

const VIEW = readFileSync(
  new URL("../../../fixtures/vendor/card-mod-carrierwave-0.20.0/set/type/image/html_views.rb", import.meta.url),
);

test("the vendored Ruby image view is byte-identical to the gem's", () => {
  assert.equal(
    createHash("sha256").update(VIEW).digest("hex"),
    "501a1325cde72f3a4e994ed6b3b60f06158b0aa846ddcbe4ad8a2e5d22f90e10",
  );
});

test("the three graded facts are Ruby's own, read out of the vendored view", () => {
  const source = VIEW.toString("utf8");
  // view :core -> image_tag source, alt: card.name
  assert.equal(/view :core do[\s\S]*?image_tag source, alt: card\.name/.test(source), true);
  // alt is the CARD NAME, not the filename.
  assert.equal(/alt: card\.name/.test(source), true);
  // an invalid source renders a comment, not an <img>
  assert.equal(/invalid_image source/.test(source), true);
  assert.equal(/invalid image for #\{safe_name\}; source: #\{source\}/.test(source), true);
  // preview renders the medium version
  assert.equal(/_render_core size: :medium/.test(source), true);
  assert.deepEqual([...IMAGE_SIZES], ["small", "medium", "large"]);
});

test("the invalid-image comment is Ruby's own broken-image statement", () => {
  const html = '<div class="card-slot"><!-- invalid image for a test image; source: missing --></div>';
  const invalid = invalidImageComment(html);
  assert.equal(invalid !== null, true);
  assert.equal(invalid.name, "a test image");
  assert.equal(invalid.source, "missing");
  assert.equal(invalidImageComment('<img src="/files/1/a.png" alt="x">'), null);
});

test("the extension comes off the source, ignoring query and fragment", () => {
  assert.equal(sourceExtension("/files/1346/5026-large.png"), "png");
  assert.equal(sourceExtension("/files/1346/5026-large.jpg?v=2"), "jpg");
  assert.equal(sourceExtension("/files/1346/5026-large.JPG#top"), "jpg");
  assert.equal(sourceExtension("/files/1346/5026-large"), null);
  assert.equal(sourceExtension(""), null);
});

/** What html_views.rb's view :core renders for a card named `cardName` at
 *  `size`, given a stored file extension. */
function rubyCore(cardName, extension, size) {
  return `<div class="card-slot"><img src="/files/${cardName.length}/${cardName}-${size}.${extension}" alt="${cardName}" /></div>`;
}

test("a changed image whose type moved, at the size Ruby asserts, passes", () => {
  const verdict = imageCoreShows({
    cardName: "a test image",
    html: rubyCore("a test image", "jpg", "large"),
    requestedSize: "large",
    extension: "jpg",
    supersededExtension: "png",
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.image.alt, "a test image");
});

test("the image still carrying the OLD extension fails - the leg a state read cannot see", () => {
  const verdict = imageCoreShows({
    cardName: "a test image",
    html: rubyCore("a test image", "png", "large"),
    requestedSize: "large",
    extension: "jpg",
    supersededExtension: "png",
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("wrongExtension"), true);
  assert.equal(verdict.failures.includes("stillSupersededExtension"), true);
});

test("a card whose image is broken fails on Ruby's own comment, not on a missing <img>", () => {
  const verdict = imageCoreShows({
    cardName: "a test image",
    html: '<div class="card-slot"><!-- invalid image for a test image; source: missing --></div>',
    requestedSize: "large",
    extension: "jpg",
    supersededExtension: "png",
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("invalidImageComment"), true);
  assert.equal(verdict.failures.includes("noImageTag"), true);
});

test("an <img> with no alt is not this card's core view", () => {
  const verdict = imageCoreShows({
    cardName: "a test image",
    html: '<div class="card-slot"><img src="/files/11/a-large.jpg" /></div>',
    requestedSize: "large",
    extension: "jpg",
  });
  assert.equal(verdict.failures.includes("noAlt"), true);
});

test("an <img> whose alt names another card is not this card's core view", () => {
  const verdict = imageCoreShows({
    cardName: "a test image",
    html: '<div class="card-slot"><img src="/files/11/a-large.jpg" alt="some other card" /></div>',
    requestedSize: "large",
    extension: "jpg",
  });
  assert.equal(verdict.failures.includes("altNotCardName"), true);
});

test("the main card's fallback size is large, so a medium source is the wrong version", () => {
  // determine_image_size (set/type/image.rb:44-57): the requested size, else the
  // main card's :large, else :medium.
  const medium = imageCoreShows({
    cardName: "a test image",
    html: rubyCore("a test image", "jpg", "medium"),
    requestedSize: "large",
    extension: "jpg",
  });
  assert.equal(medium.failures.includes("sizeNotInSource"), true);
  // A preview legitimately asks for medium, so that arm is not graded as wrong.
  const preview = imageCoreShows({
    cardName: "a test image",
    html: rubyCore("a test image", "jpg", "medium"),
    requestedSize: "medium",
    extension: "jpg",
  });
  assert.deepEqual(preview.failures, []);
});

test("a source with no extension, and an unknown requested size, both fail", () => {
  const noExt = imageCoreShows({
    cardName: "a test image",
    html: '<div class="card-slot"><img src="/files/11/a-large" alt="a test image" /></div>',
    requestedSize: "large",
    extension: "jpg",
  });
  assert.equal(noExt.failures.includes("sourceHasNoExtension"), true);

  const unknownSize = imageCoreShows({
    cardName: "a test image",
    html: rubyCore("a test image", "jpg", "large"),
    requestedSize: "enormous",
    extension: "jpg",
  });
  assert.equal(unknownSize.failures.includes("unknownRequestedSize"), true);
});

test("every img on the page is read, so the core view can be told from a thumbnail", () => {
  const html =
    '<div class="attachment-preview"><img src="/files/1/a-medium.png" alt="a test image" /></div>' +
    rubyCore("a test image", "jpg", "large");
  assert.equal(imageTags(html).length, 2);
  const verdict = imageCoreShows({
    cardName: "a test image", html, requestedSize: "large", extension: "jpg", supersededExtension: "png",
  });
  // The FIRST img is the preview's medium version, so the leg reads it as not
  // the card's large core view - and says which way it failed.
  assert.equal(verdict.failures.includes("wrongExtension"), true);
  assert.equal(verdict.failures.includes("sizeNotInSource"), true);
});
test("the CALLER hands the predicate the card's own region, not the whole page", () => {
  // THE DEFECT THIS PINS. The predicate grades "the core view is what the
  // CARD SLOT renders" and takes the FIRST <img> of the html it is handed.
  // The caller handed it the WHOLE PAGE, and the first <img> on a card page
  // is the deck's own logo in the navbar (alt="*logo",
  // src=.../files/79/3643-small.jpg). So the F3 leg graded the LOGO: the
  // signed-in run of 2026-10-22 recorded the first upload as failures
  // ["altNotCardName","sizeNotInSource","wrongExtension"] and the change as
  // the same three, with sourceMoved false - on a page whose card rendered
  // its own image exactly as Ruby renders it (alt=card.name, the requested
  // size's source, the stored extension).
  //
  // The card's own content is the #main region - the scope the harness's own
  // F9 leg already uses (checks-upload-image-change.mjs:213,
  // document.querySelector("#main img")), and the scope the navbar's logo is
  // outside of.
  const coverB = readFileSync(new URL("../checks-cover-b.mjs", import.meta.url), "utf8");
  assert.match(coverB, /const cardRegion = async \(\) => page\.evaluate\(\(\) => \{/);
  assert.match(coverB, /document\.querySelector\('#main, main'\)/);
  assert.match(coverB, /html: uploadedCore \?\? uploaded\.html/);
  assert.match(coverB, /html: afterCore \?\? after\.html/);
  // The whole page is no longer what the predicate is handed.
  assert.equal(/html: uploaded\.html, requestedSize/.test(coverB), false);
  assert.equal(/html: after\.html, requestedSize/.test(coverB), false);

  // The predicate is untouched: it still grades the first img of the html it
  // is handed, so a page whose FIRST img is the logo still fails - which is
  // exactly what the caller has to scope away.
  const pageWithTheLogoFirst =
    '<img alt="*logo" src="https://cdn.example/files/79/3643-small.jpg">' +
    '<div id="main"><img alt="a test image" src="/files/1/a-large.png"></div>';
  const unscoped = imageCoreShows({
    cardName: "a test image", html: pageWithTheLogoFirst, requestedSize: "large", extension: "png",
  });
  assert.deepEqual(unscoped.failures, ["altNotCardName", "sizeNotInSource", "wrongExtension"], JSON.stringify(unscoped.failures));
  // The card's own region grades green.
  const scoped = imageCoreShows({
    cardName: "a test image", html: '<div id="main"><img alt="a test image" src="/files/1/a-large.png"></div>',
    requestedSize: "large", extension: "png",
  });
  assert.deepEqual(scoped.failures, [], JSON.stringify(scoped.failures));
});
