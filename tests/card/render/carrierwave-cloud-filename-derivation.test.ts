// carrierwave-cloud-filename-derivation.test.ts — the CARRIERWAVE-FILENAME
// suite's pin: Ruby renders attachment filenames from CARD DATA, never the
// stored key. The engine emitted the stored identifier verbatim on cloud
// content; Ruby's render chain derives `filename = "#{action_id}#{extension}"`
// from db_content and deliberately ignores the stored identifier on
// retrieval.
//
// Ruby chain (all citations verified on disk directly):
//  - last_content_action_id = db_content.to_s.split(%r{[/.]})[-2], .to_i when
//    Object#number? (card-mod-carrierwave-0.20.0 set/type/file.rb:11-15;
//    card-1.110.0 config/initializers/01_core_extensions/object.rb:3-6
//    `true if Float(self) rescue false`)
//  - extension = File.extname(model.content).downcase
//    (lib/carrier_wave/file_card_uploader.rb:155-162, from-content arm)
//  - filename = "#{action_id}#{extension}" (file_card_uploader.rb:147-153);
//    valid? = extension.present? (:143-145) -> extension-less renders ""
//  - retrieval ignores the stored identifier: "we can construct the filename
//    from db data. So we don't need the identifier"
//    (lib/carrier_wave/file_card_uploader/path.rb:28-43); retrieve_dir =
//    upload_dir = "#{files_base_dir}/#{id}" — the CARD-ID directory
//    (set/abstract/attachment/paths.rb:5-12)
//  - fog public_url = "#{asset_host}/#{encoded_path}" (carrierwave-3.1.4
//    lib/carrierwave/storage/fog.rb:365-372); the capture's asset host
//    (trailing slash -> the oracle's double slash) + /files/ web path is the
//    views.ts FOG_CLOUD_URL_HOST shape already pinned for images
//  - contextualize_path (html) keeps ^https?: URLs as-is
//    (card-mod-format-0.20.0 set/all/path.rb:74-77; card-1.110.0
//    lib/card/env/location.rb:6-16)
//
// ORACLE ACCEPTANCE BYTES: Jonas Verhove page (expected-v2 page-lane
// recapture-raw-shard-000010.jsonl entry 14542, page_html offset ~12792):
//   <a href='http://s3.amazonaws.com//files/14547/1.doc'>Download +description+CV</a>
// rendered from card 14547 db_content `(my_bucket)/14547/61887.abr.1.doc`
// (bench-corpus-raw.sqlite3, sha256
// 6A44DFDC20CA941E66DA6BA08ADD7F1A5CF35EC1A3BA75CC43A70920E609440E) — the
// filename 1.doc is the [-2] split segment; the stored key 61887.abr.1.doc
// appears NOWHERE in the oracle page.

import { describe, expect, it } from "vitest";
import {
  cloudImageUrl,
  derivedCloudAttachmentSource,
  formatFileCore,
  lastContentActionIdFromDbContent,
} from "../../../src/card/render/views.js";
import { cloudAttachmentUrl } from "../../../src/card/render/head-views.js";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

describe("lastContentActionIdFromDbContent (set/type/file.rb:11-15)", () => {
  it("parses the [-2] [/.] split segment: 61887.abr.1.doc -> 1", () => {
    expect(lastContentActionIdFromDbContent("(my_bucket)/14547/61887.abr.1.doc")).toBe(1);
  });
  it("plain action-id keys parse to themselves", () => {
    expect(lastContentActionIdFromDbContent("(my_bucket)/1490/8871.JPG")).toBe(8871);
    // (my_bucket)/14547/1.doc -> segments [my_bucket, 14547, 1, doc] -> [-2] "1"
    expect(lastContentActionIdFromDbContent("(my_bucket)/14547/1.doc")).toBe(1);
  });
  it("non-numeric [-2] segments -> null (Ruby falls to the Time.now stand-in)", () => {
    expect(lastContentActionIdFromDbContent("(my_bucket)/1490/Photo.JPG")).toBeNull();
    expect(lastContentActionIdFromDbContent("(my_bucket)/1187/7146..</p>")).toBeNull();
  });
  it("number? is Kernel#Float semantics: exponents/underscores pass, to_i stops at first non-digit", () => {
    // the [-2] segment is the second-from-last of the [/.] split — the
    // interesting segment must sit just before the extension
    expect(lastContentActionIdFromDbContent("x/y/1e3.doc")).toBe(1);
    expect(lastContentActionIdFromDbContent("x/y/1_000.doc")).toBe(1);
    expect(lastContentActionIdFromDbContent("x/y/+5.doc")).toBe(5);
    expect(lastContentActionIdFromDbContent("x/y/ 1 .doc")).toBe(1);
    expect(lastContentActionIdFromDbContent("x/y/1_.doc")).toBeNull();
    // "x/1e3/y.doc"'s [-2] segment is "y" — non-numeric
    expect(lastContentActionIdFromDbContent("x/1e3/y.doc")).toBeNull();
  });
  it("Ruby String#split drops trailing empty fields", () => {
    expect(lastContentActionIdFromDbContent("a/b/")).toBeNull();
    expect(lastContentActionIdFromDbContent("a/b/1.")).toBeNull(); // ["a","b","1"] -> [-2] "b"
  });
  it("null/undefined content -> null", () => {
    expect(lastContentActionIdFromDbContent(null)).toBeNull();
    expect(lastContentActionIdFromDbContent(undefined)).toBeNull();
  });
});

describe("derivedCloudAttachmentSource (file_card_uploader.rb:147-153 + path.rb:41-43)", () => {
  it("derives 1.doc from the Jonas Verhove stored key (oracle href)", () => {
    expect(derivedCloudAttachmentSource("(my_bucket)/14547/61887.abr.1.doc")).toBe(
      "http://s3.amazonaws.com//files/14547/1.doc",
    );
  });
  it("the double slash is the trailing-slash asset host + /files web path (fog public_url)", () => {
    // carrierwave-3.1.4 storage/fog.rb:365-372 "#{asset_host}/#{encoded_path}";
    // the derived retrieve path carries files_base_dir ("files") + card id:
    // "files/14547/1.doc" after the empty fog bucket.
    const src = derivedCloudAttachmentSource("(my_bucket)/14547/61887.abr.1.doc");
    expect(src.startsWith("http://s3.amazonaws.com//files/14547/")).toBe(true);
  });
  it("extension-less cloud content renders no source (valid? = extension.present?)", () => {
    // corpus cards 23981/24082 (file) + 24083/24347 (image): stored keys
    // without a dot — Ruby's file.valid? is false and handle_source
    // short-circuits to "" (set/type/file.rb:47-50 + file.rb:34-45).
    expect(derivedCloudAttachmentSource("(my_bucket)/23981/100500")).toBe("");
  });
  it("non-numeric [-2] keeps the stored basename (deterministic stand-in surrogate)", () => {
    // Ruby: action_id_stand_in = Time.now.to_i (file_card_uploader.rb:225-227)
    // — runtime state; the port keeps the stored name (10 corpus cards,
    // runtime-bound in every capture).
    expect(derivedCloudAttachmentSource("(my_bucket)/1490/Photo.JPG")).toBe(
      "http://s3.amazonaws.com//files/1490/Photo.jpg",
    );
  });
  it("image variants append to the DERIVED basename (full_filename versions override)", () => {
    // file_card_uploader.rb:274-281: version at the end, dash-separated —
    // "1.doc" at -medium is "1-medium.doc", not "61887.abr.1-medium.doc".
    expect(cloudImageUrl("(my_bucket)/14547/61887.abr.1.doc", "medium")).toBe(
      "http://s3.amazonaws.com//files/14547/1-medium.doc",
    );
  });
  it("downcases the derived extension only (181 uppercase-ext corpus identifiers)", () => {
    expect(cloudImageUrl("(my_bucket)/1490/8871.JPG", "medium")).toBe(
      "http://s3.amazonaws.com//files/1490/8871-medium.jpg",
    );
  });
  it("non-cloud content is not a cloud source", () => {
    expect(derivedCloudAttachmentSource("~/42/act_1.png")).toBe("");
    expect(derivedCloudAttachmentSource("https://example.com/a.png")).toBe("");
  });
  it("head-path cloudAttachmentUrl shares the derivation (favicon tag)", () => {
    expect(cloudAttachmentUrl("(my_bucket)/14547/61887.abr.1.doc")).toBe(
      "http://s3.amazonaws.com//files/14547/1.doc",
    );
  });
});

describe("file :core renders the derived cloud anchor (Jonas Verhove acceptance)", () => {
  async function seedMichaelDeck(): Promise<RenderTestStorage> {
    const storage = await createRenderTestStorage();
    await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
    await seedCard(storage, { id: 3, name: "RichText", codename: "rich_text", typeId: 2 });
    await seedCard(storage, { id: 20, name: "File", codename: "file", typeId: 2 });
    await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
    await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
    await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
    await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
    await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
    await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
    await seedCard(storage, {
      id: 910,
      leftId: 900,
      rightId: 901,
      typeId: 2,
      dbContent: "Probe Layout",
    });
    await seedCard(storage, {
      id: 911,
      name: "Probe Layout",
      typeId: 2,
      dbContent: "{{_main|titled}}",
    });
    // the REAL corpus shape (bench-corpus-raw.sqlite3 rows): the Person page
    // nests +description (14545, RichText carrying {{+CV}}), which nests the
    // File junction 14547 (left 14545, right "CV") holding the cloud
    // db_content. The oracle anchor's label is the file card's name
    // relativized against the page context: +description+CV.
    await seedCard(storage, {
      id: 14542,
      name: "Jonas Verhove",
      typeId: 3,
      dbContent: "<p>{{+description}}</p>",
    });
    await seedCard(storage, { id: 4167, name: "CV", typeId: 2 });
    await seedCard(storage, {
      id: 14545,
      leftId: 14542,
      rightId: 146,
      typeId: 3,
      dbContent: "<p>{{+CV}}</p>",
    });
    await seedCard(storage, { id: 146, name: "description", typeId: 2 });
    await seedCard(storage, {
      id: 14547,
      leftId: 14545,
      rightId: 4167,
      typeId: 20,
      dbContent: "(my_bucket)/14547/61887.abr.1.doc",
    });
    storage.fetcher.installNameEnvironment();
    return storage;
  }

  it("renders <a href='http://s3.amazonaws.com//files/14547/1.doc'>Download +description+CV</a>", async () => {
    const storage = await seedMichaelDeck();
    const page = await renderPageBytes(storage.engine, "Jonas Verhove");
    expect(page).toContain(
      "<a href='http://s3.amazonaws.com//files/14547/1.doc'>Download +description+CV</a>\n",
    );
    // the stored key appears NOWHERE in the oracle page — nor in ours
    expect(page).not.toContain("61887.abr.1.doc");
    expect(page).not.toContain("(my_bucket)");
  });

  it("formatFileCore derives the same anchor bytes from the same content", () => {
    expect(
      formatFileCore("(my_bucket)/14547/61887.abr.1.doc", {
        cardName: "Jonas Verhove+description+CV",
        contextNames: ["Jonas Verhove"],
      }),
    ).toBe("<a href='http://s3.amazonaws.com//files/14547/1.doc'>Download +description+CV</a>\n");
  });
});
