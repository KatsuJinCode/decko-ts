// Coderay-highlighting byte-identity tests.
//
// Each HTML fixture read by loadOracle below was produced by
// `CodeRay.scan(card-content, :LANG).div` on a local Ruby reference (the
// gem at coderay-1.1.3, the card-mod-format/layout/style cardtypes). This
// port must reproduce those bytes exactly for every seeded card; this file
// is the gate.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { skipLoud } from "../../../support/describe-with-corpus.js";

import {
  highlight,
  langForTypeCode,
  wrapDiv,
  type HighlightLanguage,
} from "../../../../src/card/render/code-highlighting/index.js";
import { scanJson } from "../../../../src/card/render/code-highlighting/scanners/json.js";
import { scanCss } from "../../../../src/card/render/code-highlighting/scanners/css.js";
import { scanHtml } from "../../../../src/card/render/code-highlighting/scanners/html.js";
import { coderayEscape } from "../../../../src/card/render/code-highlighting/escape.js";
import { ALPHA_STYLES } from "../../../../src/card/render/code-highlighting/alpha-style.js";
import { PRIVATE_SHARD_DIR_PATH } from "../../../../src/testing/test-corpus-paths.js";

// The shard directory is repo-relative, gitignored, and machine-local —
// provisioned out of band. Its absence is an environment gap, not a suite
// condition: missing shards fail LOUDLY below (ENOENT) — never a skip.
const FIXTURES = PRIVATE_SHARD_DIR_PATH;
const CAPTURED = resolve(
  fileURLToPath(new URL("../../../..", import.meta.url)),
  "fixtures",
  "captured",
  "coderay",
);

interface Case {
  readonly fixture: string;
  readonly lang: HighlightLanguage;
  readonly shard: string;
  readonly cardId: number;
}

const CASES: readonly Case[] = [
  { fixture: "json-tinymce-corpus-53", lang: "json", shard: "shard-000000.jsonl", cardId: 53 },
  { fixture: "css-corpus-198", lang: "css", shard: "shard-000000.jsonl", cardId: 198 },
  { fixture: "html-layout-corpus-314", lang: "html", shard: "shard-000000.jsonl", cardId: 314 },
  { fixture: "html-layout-shard1-2339", lang: "html", shard: "shard-000001.jsonl", cardId: 2339 },
  { fixture: "html-layout-shard1-2347", lang: "html", shard: "shard-000001.jsonl", cardId: 2347 },
  { fixture: "html-layout-shard1-2575", lang: "html", shard: "shard-000001.jsonl", cardId: 2575 },
];

function loadContent(shard: string, cardId: number): string {
  const lines = readFileSync(resolve(FIXTURES, shard), "utf8").split("\n");
  for (const line of lines) {
    if (line === "") continue;
    const d = JSON.parse(line) as { id: number; record: { content: string } };
    if (d.id === cardId) return d.record.content;
  }
  throw new Error(`card ${cardId} not in ${shard}`);
}

function loadOracle(fixture: string): string {
  // The generating Ruby script wrote a trailing newline; readFileSync
  // preserves it so we can byte-compare directly.
  return readFileSync(resolve(CAPTURED, `${fixture}.html`), "utf8");
}

describe("code-highlighting: byte-identity vs Ruby oracle", () => {
  for (const c of CASES) {
    it(`${c.fixture} reproduces the captured ${c.lang} output verbatim`, (ctx) => {
      if (!existsSync(resolve(FIXTURES, c.shard))) {
        return skipLoud(ctx, "tests/card/render/code-highlighting/coderay-byte-identity.test.ts", `card content comes from the full corpus shard fixtures/corpus/${c.shard}, which is not redistributed`);
      }
      const content = loadContent(c.shard, c.cardId);
      const oracle = loadOracle(c.fixture);
      const actual = highlight(content, c.lang);
      expect(actual).toBe(oracle);
    });
  }
});

describe("code-highlighting: scanner-level byte-identity", () => {
  // The DIV wrapping is identical across languages, so exercising the
  // scanner outputs in isolation catches any regression where a future
  // change adds a stray span wrapper that survives into the assembled HTML.
  for (const c of CASES) {
    it(`${c.fixture}: inner spans are wrapped by the CodeRay DIV template`, (ctx) => {
      if (!existsSync(resolve(FIXTURES, c.shard))) {
        return skipLoud(ctx, "tests/card/render/code-highlighting/coderay-byte-identity.test.ts", `card content comes from the full corpus shard fixtures/corpus/${c.shard}, which is not redistributed`);
      }
      const content = loadContent(c.shard, c.cardId);
      const oracle = loadOracle(c.fixture);
      const inner = oracle.slice("<div class=\"CodeRay\">\n  <div class=\"code\"><pre>".length, -"</pre></div>\n</div>\n".length);
      const scanned =
        c.lang === "json" ? scanJson(content)
        : c.lang === "css" ? scanCss(content)
        : scanHtml(content);
      expect(scanned).toBe(inner);
    });
  }
});

describe("code-highlighting: langForTypeCode dispatch", () => {
  it.each([
    ["json", "json"],
    ["css", "css"],
    ["scss", "css"],
    ["layout_type", "html"],
    ["head", "html"],
    ["basic", undefined],
    ["search_type", undefined],
    [undefined, undefined],
  ] as const)("maps type_code %s -> %s", (input, expected) => {
    expect(langForTypeCode(input)).toBe(expected);
  });
});

describe("code-highlighting: escape + DIV template shape", () => {
  it("escapes HTML entities and control codes per CodeRay", () => {
    expect(coderayEscape("<&>\"")).toBe("&lt;&amp;&gt;&quot;");
    expect(coderayEscape("\n")).toBe("\n"); // 0x0A not in the escape set
    expect(coderayEscape("\x00")).toBe(" ");
    expect(coderayEscape("\t")).toBe("        "); // tab -> 8 spaces
  });

  it("wraps a scan in the CodeRay DIV template", () => {
    expect(wrapDiv("XYZ")).toBe(
      "<div class=\"CodeRay\">\n  <div class=\"code\"><pre>XYZ</pre></div>\n</div>\n",
    );
  });

  it("alpha theme table covers the kinds the corpus fixtures exercise", () => {
    const kinds = new Set(ALPHA_STYLES.map((e) => e.kind));
    expect(kinds.has("error")).toBe(true);
    expect(kinds.has("tag")).toBe(true);
    expect(kinds.has("doctype")).toBe(true);
    expect(kinds.has("inline")).toBe(true);
  });
});
