// The file sender for an unregistered format suffix (row D4), measured
// against the PINNED deck's own dispatch and the PINNED deck's own file
// route, with the port's own read grammar RUN.
//
// The register's D4 row grades the port PARTIAL: "Ruby's general file
// mapping (ANY unregistered format suffix on a card URL sends the file,
// decko-0.20.0/lib/card_controller/response.rb:102-113) is absent; the
// port only serves bytes under /files/ (src/server/file-routes.ts), so
// /Card.bin 404s everywhere". The row's fix: the read path grows the
// file-sender arm.
//
// The pinned ground is the COMMITTED captures
// (tests/server/oracle-capture-format-registry-ruby.rb and
// tests/server/oracle-capture-explicit-file-route-ruby.rb, whose fixtures
// are fixtures/captured/format-registry-ruby-oracle.json and
// fixtures/captured/explicit-file-route-ruby-oracle.json).
//
// WHAT THIS FILE ADDS is the row's closure: the port's own read grammar
// RUN over the paths in question, beside the pinned answers, so the
// missing arm is pinned by the port's own behaviour and not by a reading
// of it.
//
//   THE PINNED DISPATCH SENDS AN UNREGISTERED SUFFIX TO THE FILE
//   SENDER, and the pinned file route is the deck's OWN /files/ shape
//   (the first route in the table, the explicit_file one).
//
//   THE PORT'S READ GRAMMAR SPLITS ONE SUFFIX AND ONE ONLY, the json
//   one: /Alpha.json is the card "Alpha" in the json format, and
//   /Alpha.bin is the card named "Alpha.bin", which no deck carries, so
//   the request 404s. The port's bytes are served under /files/, the
//   pinned explicit-file route's own shape.
//
//   SO THE ROW'S ARM IS NOT LANDED, and this commit says so: the pinned
//   read answers the card's FILE, and the port's read answers a card
//   that does not exist.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RegistryOracle {
  registered: string[];
  dispatch: Array<{ label: string; requested: string; formatName: string | null }>;
}

interface FileRouteOracle {
  filesWebPath: string;
  registeredFormats: string[];
  filesRoutes: Array<{ verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number }>;
  routeTableSize: number;
  dispatch: Array<{ label: string; requested: string; params: Record<string, string>; formatName: string | null }>;
  respond: Array<{ label: string; format: string; status: number; branch: string; sentFile: string[] | null }>;
}

interface Oracle {
  routerAnswers: Record<string, Array<{ path: string; verb: string; matched: boolean; answer: { path: string; defaults: Record<string, string> } | null }>>;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
}

const REGISTRY = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/format-registry-ruby-oracle.json"), "utf8"),
) as RegistryOracle;

const FILE_ROUTE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/explicit-file-route-ruby-oracle.json"), "utf8"),
) as FileRouteOracle;

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as Oracle;

describe("the PINNED deck's own dispatch (D4)", () => {
  it("an unregistered suffix answers the FILE format, and a registered one answers its own name", () => {
    const byLabel = new Map(REGISTRY.dispatch.map((row) => [row.label, row]));
    expect(byLabel.get("bin (unregistered)")?.formatName).toBe("file");
    expect(byLabel.get("zzz (unregistered)")?.formatName).toBe("file");
    expect(byLabel.get("css")?.formatName).toBe("css");
  });

  it("the explicit_file param sends a suffix to the file sender too", () => {
    const byLabel = new Map(REGISTRY.dispatch.map((row) => [row.label, row]));
    expect(byLabel.get("bin with the explicit_file param")?.formatName).toBe("file");
  });

  it("the file format at 200 IS the file sender, and it sends the bytes", () => {
    const answered = FILE_ROUTE.respond.find(
      (row) => row.label === "the file format at 200 is the file sender",
    );
    expect(answered?.status).toBe(200);
    expect(answered?.branch).toBe("send_file");
    expect(answered?.sentFile).not.toBeNull();
  });

  it("the deck's own explicit file route is the /files/ shape", () => {
    expect(FILE_ROUTE.filesWebPath).toBe("files");
    expect(FILE_ROUTE.filesRoutes[0]?.patterns).toContain("/:mark/:rev_id(-:size).:format");
    expect(FILE_ROUTE.filesRoutes[0]?.requirements["explicit_file"]).toBe("true");
  });
});

describe("the PINNED router's own answer at those paths (D4)", () => {
  it("an unregistered suffix on a card URL still reaches the card read arm", () => {
    const answer = ORACLE.routerAnswers["D4"].find((row) => row.path === "/Alpha.bin");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["action"]).toBe("read");
  });

  it("the deck's own /files/ route is the explicit-file one", () => {
    const answer = ORACLE.routerAnswers["D4"].find(
      (row) => row.path === "/files/Alpha/42.png",
    );
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["explicit_file"]).toBe("true");
  });
});

describe("the port's own read grammar, RUN (D4)", () => {
  it("the port does NOT split the .bin suffix: it is part of the card's name", () => {
    const parsed = parsePath("/Alpha.bin");
    expect("kind" in parsed).toBe(false);
    if (!("kind" in parsed)) {
      expect(parsed.name).toBe("Alpha.bin");
      expect(parsed.format).toBeUndefined();
    }
  });

  it("the .json suffix splits only when the request names a json view, and .bin never splits", () => {
    // The port's own one-segment arm: the .json suffix is split ONLY when
    // the request carries an explicit json view (the Select2 editors'
    // /:search.json?view=image_complete shape). Without that view, the
    // suffix stays part of the card's name, exactly as the .bin suffix
    // always does.
    const plain = parsePath("/Alpha.json");
    expect("kind" in plain).toBe(false);
    if (!("kind" in plain)) {
      expect(plain.name).toBe("Alpha.json");
      expect(plain.format).toBeUndefined();
    }
    const withView = parsePath("/Alpha.json", new URLSearchParams("view=image_complete"));
    expect("kind" in withView).toBe(false);
    if (!("kind" in withView)) {
      expect(withView.name).toBe("Alpha");
      expect(withView.view).toBe("image_complete");
      expect(withView.format).toBe("json");
    }
  });

  it("the port's own bytes are served under /files/, the pinned route's own shape", () => {
    for (const entry of ORACLE.portSurface["D4"]) {
      const source = readFileSync(path.join(REPO, entry.file), "utf8").split("\n");
      for (const quote of entry.lines) {
        expect(source[quote.line - 1], `${entry.file}:${quote.line}`).toBe(quote.text);
      }
    }
    const fileRoutes = readFileSync(path.join(REPO, "src/server/file-routes.ts"), "utf8");
    expect(fileRoutes).toContain('"files"');
  });
});
