// The UNREGISTERED format suffix, measured against the PINNED DECK's own
// dispatch.
//
// The completeness register's D4 row (register-routes) grades the port
// PARTIAL: "Ruby's general file mapping (ANY unregistered format suffix on
// a card URL sends the file, decko-0.20.0/lib/card_controller/response.rb:
// 102-113) is absent; the port only serves bytes under /files/
// (src/server/file-routes.ts), so /Card.bin 404s everywhere".
//
// fixtures/captured/format-registry-ruby-oracle.json is what
// oracle-capture-format-registry-ruby.rb (tests/server/) recorded by
// loading the PINNED MOD's own format files (they register themselves) and
// then running the PINNED DECK's own dispatch over both kinds of suffix.
//
// THE MECHANISM, from the deck's own method
// (decko-0.20.0/lib/card_controller/response.rb:99-113):
//
//   def format_name_from_params
//     rf = requested_format
//     explicit_file_format?(rf) ? :file : rf.to_sym
//   end
//
//   def explicit_file_format? rf
//     params[:explicit_file] || !Card::Format.registered.member?(rf)
//   end
//
// So the REGISTRY decides: a registered format renders as that format, and
// an UNREGISTERED one is the FILE sender. The capture runs the deck's own
// method and says: ".bin" and ".zzz" are not registered, so both answer
// "file", while the registered suffixes answer their own names.
//
// The port's answer, pinned below: the read grammar does not split a
// suffix off a one-segment card URL, so /Card.bin is read as the card named
// "Card.bin" and the request 404s. That is the row's claim, now pinned at
// the grammar level with the shape it takes.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/format-registry-ruby-oracle.json"), "utf8"),
) as {
  registered: string[];
  dispatch: Array<{ label: string; requested: string; formatName: string | null; errorMessage?: string }>;
};

const byLabel = new Map(ORACLE.dispatch.map((row) => [row.label, row]));

describe("the unregistered format suffix, against the pinned deck gem", () => {
  it("the deck gem sends an unregistered suffix to the file sender", () => {
    expect(byLabel.get("bin (unregistered)")!.formatName).toBe("file");
    expect(byLabel.get("zzz (unregistered)")!.formatName).toBe("file");
  });

  it("and a registered suffix to its own format, which is the control", () => {
    expect(byLabel.get("css")!.formatName).toBe("css");
    expect(byLabel.get("json")!.formatName).toBe("json");
    expect(byLabel.get("html")!.formatName).toBe("html");
  });

  it("the explicit_file param sends a registered suffix to the file sender too", () => {
    expect(byLabel.get("bin with the explicit_file param")!.formatName).toBe("file");
  });

  it("the port reads /Card.bin as a card named Card.bin, so it 404s", () => {
    // The port's read grammar does not split a suffix off a one-segment
    // card URL (the .json suffix is the one exception, and it is a view
    // format). The name therefore carries the suffix, the card named
    // "Card.bin" does not exist, and the request 404s - the row's claim.
    const parsed = parsePath("/Card.bin");
    expect(parsed).toMatchObject({ name: "Card.bin", view: "open" });
    // The contrast: Ruby's route is ":mark(.:format)", so the mark is
    // "Card" and the format is "bin", and the file sender answers.
    expect(byLabel.get("bin (unregistered)")!.requested).toBe("bin");
  });
});
