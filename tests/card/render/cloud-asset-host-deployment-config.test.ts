// Pin for the deployment cloud asset host (close-71-with-live lane).
//
// WHAT IT LOCKS
//   1. DEFAULT: with no deployment host set, every cloud attachment URL the
//      engine derives carries the capture's fog form
//      `http://s3.amazonaws.com//files/<id>/<leaf>` — byte-identical to the
//      pre-config engine (the Ruby default the oracle bytes pin; the graded
//      corpus freezes that form on 6,552 expectation lines).
//   2. DEPLOYMENT OVERRIDE: setDeploymentCloudAssetHost(SPACES_HOST) flips
//      every emission site that has no per-engine imageCdnHost to the
//      DigitalOcean Spaces form live serves
//      (`https://production-storage.r1.cdn.objectstore
//      .com/files/<id>/<leaf>` — live-check-71: DO 34/34 pages, s3 = 0
//      occurrences). The per-engine imageCdnHost keeps precedence where a
//      caller passes it, so the edge deployment's existing per-engine
//      setting still wins at the sites that read it.
//   3. IDENTITY: unset again, the fog form returns exactly (the override is
//      a process-wide test/deployment setting; afterEach restores it so no
//      other suite ever sees it).
import { describe, expect, it, afterEach } from "vitest";
import {
  derivedCloudAttachmentSource,
  FOG_CLOUD_URL_HOST,
  getDeploymentCloudAssetHost,
  setDeploymentCloudAssetHost,
} from "../../../src/card/render/views.js";
import { cloudAttachmentUrl } from "../../../src/card/render/head-views.js";

const SPACES_HOST =
  "https://production-storage.r1.cdn.objectstore.example";
const DO_PREFIX = `${SPACES_HOST}/files/`;
const FOG_PREFIX = "http://s3.amazonaws.com//files/";

afterEach(() => {
  setDeploymentCloudAssetHost(undefined);
});

describe("deployment cloud asset host", () => {
  it("defaults to the fog form byte-exactly (Ruby default preserved)", () => {
    expect(getDeploymentCloudAssetHost()).toBeUndefined();
    // The corpus attachment identifier shape: (bucket)/<id>/<stored>.<ext>;
    // the derived filename is the [-2] [/.] split segment (1.doc).
    expect(derivedCloudAttachmentSource("(my_bucket)/14547/61887.abr.1.doc")).toBe(
      `${FOG_PREFIX}14547/1.doc`,
    );
    // The favicon/image-variant path (head-views cloudAttachmentUrl, :small).
    expect(cloudAttachmentUrl("(my_bucket)/103/3649.JPG", "small")).toBe(
      `${FOG_PREFIX}103/3649-small.jpg`,
    );
    expect(FOG_CLOUD_URL_HOST).toBe("http://s3.amazonaws.com/");
  });

  it("deployment host flips every no-imageCdnHost emission to the Spaces form", () => {
    setDeploymentCloudAssetHost(SPACES_HOST);
    expect(derivedCloudAttachmentSource("(my_bucket)/14547/61887.abr.1.doc")).toBe(
      `${DO_PREFIX}14547/1.doc`,
    );
    expect(cloudAttachmentUrl("(my_bucket)/103/3649.JPG", "small")).toBe(
      `${DO_PREFIX}103/3649-small.jpg`,
    );
    // The css/js mod-asset emission path rides the same helper through
    // cloudAttachmentUrl: the deck's compiled asset output content
    // "(my_bucket)/45514/9999999999.css" -> the live DO form.
    expect(cloudAttachmentUrl("(my_bucket)/45514/9999999999.css")).toBe(
      `${DO_PREFIX}45514/9999999999.css`,
    );
  });

  it("a caller-passed imageCdnHost still wins over the deployment host", () => {
    setDeploymentCloudAssetHost(SPACES_HOST);
    expect(
      derivedCloudAttachmentSource(
        "(my_bucket)/103/3649.jpg",
        "https://edge-specific-host.example",
      ),
    ).toBe("https://edge-specific-host.example/files/103/3649.jpg");
  });

  it("unset restores the fog form exactly", () => {
    setDeploymentCloudAssetHost(SPACES_HOST);
    setDeploymentCloudAssetHost(undefined);
    expect(derivedCloudAttachmentSource("(my_bucket)/14547/61887.abr.1.doc")).toBe(
      `${FOG_PREFIX}14547/1.doc`,
    );
  });
});
