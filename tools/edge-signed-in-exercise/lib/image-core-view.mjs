// The CHANGE half of "upload and change an image": after a second image is
// uploaded through the Image edit form and saved, the card must show the NEW
// image.
//
// WHAT RUBY'S SCENARIO ASKS FOR, features/attach.feature:
//
//   Scenario: Uploading and changing an image
//     When I go to new Image
//     And I upload the image "image.png"
//     Then I should see file "image.png 34.3 KB"
//     And I fill in "card_name" with "a test image"
//     And I press "Submit"
//     Then I should see an image of size "large" and type "png"
//     And I edit "a test image"
//     And I upload the image "image2.jpg"
//     Then I should see file "image2.jpg 69.8 KB"
//     When I press "Save and Close"
//     Then I should see an image of size "large" and type "jpg"
//
// The LAST line is the row. "and change" is not "an image exists"; it is that
// the type moved from png to jpg while the size stayed large. A check that
// reads "there is an <img>" is satisfied by the FIRST upload and can never see
// the second.
//
// THE BYTES, vendored verbatim from the gem under
// fixtures/vendor/card-mod-carrierwave-0.20.0/set/type/image/html_views.rb (the
// test asserts its sha256 so the vendored copy cannot drift):
//
//   view :core do
//     return card.attachment.read.html_safe if svg?
//     with_valid_source do |source|
//       image_tag source, alt: card.name
//     end
//   end
//
//   view :full_width do
//     with_valid_source { |source| image_tag source, alt: card.name, class: "w-100" }
//   end
//
//   def with_valid_source
//     handle_source do |source|
//       if source.blank? || source == "missing"
//         invalid_image source        # -> "<!-- invalid image for NAME; source: SRC -->"
//       else
//         yield source
//       end
//     end
//   end
//   def preview ... _render_core size: :medium ... end
//
// Three consequences the predicate grades. The core view is an image_tag whose
// alt is the CARD NAME (so a missing alt means the wrong object). Its src is the
// attachment's source for the requested size - determine_image_size
// (set/type/image.rb:44-57): the requested size, else the main card's :large,
// else :medium - which is why Ruby asserts a SIZE on an image assertion. And an
// invalid source renders the `invalid_image` COMMENT, not an <img>: a page can
// therefore satisfy "there is an image element elsewhere" while this card's own
// core view is an invalid-image comment.
//
// Registry row cap-F3 (tools/edge-signed-in-exercise/capabilities.json, id F3)
// recorded that only the upload half was bound and that "no F3-named check
// asserts the 'and change' half; that leg is measured by F4's coded-image
// replacement and F6's replace leg, which credit those rows". True, and the
// consequence is that THIS row's second half had no check of its own. This
// module is that check, and it grades the transition rather than the state.

/** The three sizes determine_image_size can return (set/type/image.rb:44-57). */
export const IMAGE_SIZES = Object.freeze(["small", "medium", "large"]);

/** Every <img> the html renders, as {attrs}. */
export function imageTags(html) {
  return [...String(html).matchAll(/<img\b([^>]*?)\/?>/gi)].map((match) => {
    const attrs = {};
    for (const attr of match[1].matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
    }
    return attrs;
  });
}

/** The `<!-- invalid image for NAME; source: SRC -->` comment html_views.rb's
 *  invalid_image renders. Its presence is Ruby's own statement that the card's
 *  image is broken, so a leg that reads "there is an <img> somewhere" must not
 *  accept it. */
export function invalidImageComment(html) {
  const match = /<!--\s*invalid image for ([^;]*);\s*source:\s*(.*?)\s*-->/i.exec(String(html));
  return match === null ? null : { name: match[1].trim(), source: match[2].trim() };
}

/** The lower-cased extension of a src or filename, without the dot. */
export function sourceExtension(src) {
  const path = String(src ?? "").split(/[?#]/)[0];
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  return match === null ? null : match[1].toLowerCase();
}

/**
 * One image leg, graded. `evidence`:
 *   cardName        the Image card's name (image_tag's alt)
 *   html            the rendered card view
 *   requestedSize   the size the view asked for ("large" on the main card)
 *   extension       the extension of the image now stored ("jpg")
 *   supersededExtension  the extension it replaced ("png"), when this leg is a
 *                      CHANGE rather than a first upload
 *
 * Returns {ok, failures, image}.
 */
export function imageCoreShows(evidence) {
  const { cardName, html, requestedSize, extension } = evidence;
  const failures = [];

  const invalid = invalidImageComment(html);
  // An invalid source renders a comment, so the absence of an <img> here is
  // Ruby's own answer, not a missing element.
  if (invalid !== null) failures.push("invalidImageComment");

  const images = imageTags(html);
  if (images.length === 0) {
    failures.push("noImageTag");
    return { ok: false, failures, image: null, invalid };
  }

  // The core view is image_tag source, alt: card.name (html_views.rb view
  // :core). Grade the FIRST img: the core view is what the card slot renders,
  // and Ruby's assertion is about that one.
  const image = images[0];
  if (image.alt === undefined || image.alt === "") failures.push("noAlt");
  else if (image.alt !== String(cardName ?? "")) failures.push("altNotCardName");

  const src = image.src ?? "";
  if (src === "") failures.push("noSrc");

  // The size Ruby asserts: the source must be the requested size's version.
  // determine_image_size falls back to :large on the main card and :medium
  // elsewhere (set/type/image.rb:44-57), so a size of "medium" on a main card
  // is the wrong fallback, not a variant naming scheme.
  const wanted = requestedSize ?? "large";
  if (!IMAGE_SIZES.includes(wanted)) failures.push("unknownRequestedSize");
  else if (wanted !== "medium" && !new RegExp(`(?:^|[-/.])${wanted}(?:[-/.]|$)`, "i").test(src)) {
    failures.push("sizeNotInSource");
  }

  // The type, and for a CHANGE the fact that the type MOVED. This is the leg:
  // an <img> whose extension is still the old one has not changed, whatever the
  // chip beside it says.
  const actual = sourceExtension(src);
  if (extension !== null && extension !== undefined) {
    if (actual === null) failures.push("sourceHasNoExtension");
    else if (actual !== String(extension).toLowerCase()) failures.push("wrongExtension");
  }
  const superseded = evidence.supersededExtension;
  if (superseded !== null && superseded !== undefined && actual === String(superseded).toLowerCase()) {
    failures.push("stillSupersededExtension");
  }

  return { ok: failures.length === 0, failures, image, invalid };
}