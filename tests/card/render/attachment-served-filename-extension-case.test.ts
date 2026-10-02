// attachment-served-filename-extension-case.test.ts -- the cd-smalls suite's
// RED pin for the attachment-filename-case class (7 pages, pass-15 content-div
// subclass "attachment-filename-case", receipt brandonDojoTech
// tmp/wrong-goal-hunt/cd-smalls-lane.md):
//
//   The 7 pages' ONLY diff region is an img src extension case: the engine
//   serves ".../8871-medium.JPG" where the oracle serves
//   ".../8871-medium.jpg" (Iris McGinnis 1490/8871, soul 18898/81618,
//   Mikaela Keepin 10011/38377, Andrew Porter 10065/38821,
//   Pacifica Graduate Institute 12002/51511-large, Henry Corbin
//   14812/63653, Paula Craig Birthday 18149/79523-large).
//
//   Ruby mechanism: the served filename is built by the decko uploader, and
//   its extension is DOWNCASED unconditionally --
//   card-mod-carrierwave-0.20.0 lib/carrier_wave/file_card_uploader.rb:155-163
//     def extension
//       case
//       when file&.extension.present?     then ".#{file.extension}"
//       when card_content = model.content then File.extname(card_content)
//       when orig = original_filename     then File.extname(orig)
//       else                              ""
//       end.downcase
//     end
//   -- and `filename` is `"#{action_id}#{extension}"` (line 148-154), so
//   every uploader-served URL (cloud fog URL, local /files path, and the
//   favicon's :link_tag through the same uploader) carries the lowercased
//   extension even though the STORED source keeps the upload's original
//   case ("(my_bucket)/1490/8871.JPG" in cards.content).
//   NOT downcased: web sources (image_tag passes the URL through verbatim)
//   and coded attachments (the URL is the literal mod-file disk path,
//   coded.rb -- case-sensitive on disk).

import { describe, expect, it } from "vitest";
import { cloudImageUrl, formatImageCore } from "../../../src/card/render/views.js";
import { cloudAttachmentUrl } from "../../../src/card/render/head-views.js";

describe("attachment served-filename extension case (uploader extension.downcase)", () => {
  // The oracle bytes for the 7 class pages, byte-for-byte (expected-v2
  // page-lane; the sources are the cards.content rows in
  // bench-corpus-raw.sqlite3).
  it.each([
    // Iris McGinnis: card 1490 source "(my_bucket)/1490/8871.JPG"
    ["(my_bucket)/1490/8871.JPG", "medium", "http://s3.amazonaws.com//files/1490/8871-medium.jpg"],
    // soul: card 18898, source ".../81618.JPG"
    ["(my_bucket)/18898/81618.JPG", "medium", "http://s3.amazonaws.com//files/18898/81618-medium.jpg"],
    // Mikaela Keepin: card 10011, ".../38377.JPG"
    ["(my_bucket)/10011/38377.JPG", "medium", "http://s3.amazonaws.com//files/10011/38377-medium.jpg"],
    // Andrew Porter: card 10065, ".../38821.JPG"
    ["(my_bucket)/10065/38821.JPG", "medium", "http://s3.amazonaws.com//files/10065/38821-medium.jpg"],
    // Henry Corbin: card 14812, ".../63653.JPG"
    ["(my_bucket)/14812/63653.JPG", "medium", "http://s3.amazonaws.com//files/14812/63653-medium.jpg"],
    // Pacifica Graduate Institute: card 12002, ".../51511.JPG" at size large
    ["(my_bucket)/12002/51511.JPG", "large", "http://s3.amazonaws.com//files/12002/51511-large.jpg"],
    // Paula Craig Birthday - Dallas 2013: card 18149, ".../79523.JPG" large
    ["(my_bucket)/18149/79523.JPG", "large", "http://s3.amazonaws.com//files/18149/79523-large.jpg"],
    // already-lowercase sources stay byte-identical (the 1000+ pins that
    // pass today must not move)
    ["(my_bucket)/103/3649.jpg", "medium", "http://s3.amazonaws.com//files/103/3649-medium.jpg"],
  ])(
    "cloud source %s at size %s serves %s",
    (source, size, expected) => {
      expect(cloudImageUrl(source, size)).toBe(expected);
    },
  );

  it("renders the img tag with the downcased extension (formatImageCore cloud branch)", () => {
    expect(formatImageCore("(my_bucket)/1490/8871.JPG", 8871, "Iris McGinnis+Image")).toBe(
      `<img alt="Iris McGinnis+Image" src="${cloudImageUrl("(my_bucket)/1490/8871.JPG", "medium")}" />`,
    );
  });

  it("favicon link tag downcases too (same uploader filename machinery)", () => {
    expect(cloudAttachmentUrl("(my_bucket)/103/3649.JPG", "small")).toBe(
      "http://s3.amazonaws.com//files/103/3649-small.jpg",
    );
  });

  it("mixed-case basename is preserved; only the extension downcases", () => {
    // The uploader downcases the EXTENSION only (filename = action_id +
    // extension.downcase; the action id is numeric, so any basename case
    // in a source path outside the uploader's filename -- e.g. a
    // bucket subdir -- is storage-side, not filename-side).
    expect(cloudImageUrl("(my_bucket)/1490/Photo.JPG", "medium")).toBe(
      "http://s3.amazonaws.com//files/1490/Photo-medium.jpg",
    );
  });
});
