// The write surface dispatches the asset-save refusal gate to the host
// compilers: a `*all+*style` save through handleWriteRequest with a
// scssCompiler in the WriteRouteContext rebuilds the site stylesheet (the
// compiled bytes land in the output card's file), and the same save on a
// host that passes no compiler is refused with a named error before
// anything is written — exactly the gate the edge hosts relied on before
// they carried compilers, and the seam cloudflare-write-routes.ts now
// dispatches to (libsass-wasm.ts / coffee-npm-compiler.ts).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import {
  handleWriteRequest,
  type WriteRouteContext,
  type WriteRouteRequest,
} from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { libsassWasmCompiler } from "../../src/server/libsass-wasm.js";
import type { ScssCompiler } from "../../src/card/assets/scss-compiler.js";
import { uglifyHarmonySyntaxError } from "../../src/card/assets/uglify-harmony-compile-engine.js";
import { makeWriteRouteServer } from "./write-routes-test-bridge.js";

const SET_TYPE_ID = 2;
const POINTER_TYPE_ID = 20;
const FILE_TYPE_ID = 21;
const SKIN_TYPE_ID = 22;
const SCSS_TYPE_ID = 23;
const JOE_ID = 90;
const IDS = {
  all: 1,
  update: 3,
  anyone: 6,
  signedIn: 7,
  self: 9,
  updateRule: 10,
  style: 40,
  assetInput: 41,
  assetOutput: 42,
  styleMods: 43,
  skin: 44,
  allStyle: 45,
  output: 46,
};

let storage: RenderTestStorage;
let baseCtx: WriteRouteContext;
let filesDir: string;
let joeToken = "";

async function seedDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
  // the rule minimum (the same shape write-routes tests seed): *all, the
  // update permission rule, and Joe User's account
  await byId(IDS.all, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(IDS.update, "*update", { codename: "update" });
  await byId(IDS.anyone, "Anyone", { codename: "anyone" });
  await byId(IDS.signedIn, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(IDS.self, "*self", { codename: "self" });
  await seedCard(s, { id: 11, leftId: IDS.all, rightId: IDS.update, typeId: SET_TYPE_ID, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, IDS.signedIn, "anyone signed in");
  await byId(JOE_ID, "Joe User");
  await byId(73, "*create", { codename: "create" });
  await seedCard(s, { id: 74, leftId: IDS.all, rightId: 73, typeId: SET_TYPE_ID, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 74, IDS.signedIn, "anyone signed in");
  // the style asset shape (the codenames the asset events read)
  await byId(IDS.style, "*style", { codename: "style" });
  await byId(IDS.assetInput, "*asset input", { codename: "asset_input" });
  await byId(IDS.assetOutput, "*asset output", { codename: "asset_output" });
  await byId(20, "Pointer", { codename: "pointer", typeId: SET_TYPE_ID });
  await byId(21, "File", { codename: "file", typeId: SET_TYPE_ID });
  await byId(22, "Bootswatch skin", { codename: "bootswatch_skin", typeId: SET_TYPE_ID });
  await byId(23, "SCSS", { codename: "scss", typeId: SET_TYPE_ID });
  await byId(24, "style: mods", { codename: "style_mods", typeId: POINTER_TYPE_ID, dbContent: "" });
  await byId(25, "Other Skin", { typeId: SKIN_TYPE_ID });
  await byId(IDS.skin, "Probe Skin", { typeId: SKIN_TYPE_ID });
  await byId(IDS.allStyle, "*all+*style", {
    leftId: IDS.all,
    rightId: IDS.style,
    typeId: POINTER_TYPE_ID,
    dbContent: "Other Skin",
  });
  await byId(IDS.output, "*all+*style+*asset output", {
    leftId: IDS.allStyle,
    rightId: IDS.assetOutput,
    typeId: FILE_TYPE_ID,
    dbContent: ":all+:style+:asset_output/defaults.css",
  });
}

function writeRequest(pathname: string, body: string): WriteRouteRequest {
  return {
    method: "PUT",
    pathname,
    host: "127.0.0.1",
    headers: { "content-type": "application/json", authorization: `Bearer ${joeToken}` },
    body,
  };
}

function ctxWith(compilers: { scss?: ScssCompiler } = {}): WriteRouteContext {
  return {
    ...baseCtx,
    attachmentStore: new LocalAttachmentStore(filesDir),
    ...(compilers.scss === undefined ? {} : {
      scssCompiler: compilers.scss,
    }),
  };
}

const outputContent = async (): Promise<string> =>
  (await storage.counting.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [IDS.output])).rows[0]!.db_content;
const ruleContent = async (): Promise<string> =>
  (await storage.counting.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [IDS.allStyle])).rows[0]!.db_content;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedDeck(storage);
  baseCtx = { driver: storage.counting, fetcher: storage.fetcher };
  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  filesDir = mkdtempSync(join(tmpdir(), "write-routes-compiler-dispatch-"));
}, 60_000);

afterAll(() => {
  storage?.close();
  rmSync(filesDir, { recursive: true, force: true });
});

describe("the write surface's compiler seam (the edge refusal gate's dispatch)", () => {
  it("Node Uglifier validation preserves a valid script and history after malformed updates", async () => {
    await seedCard(storage, { id: 80, name: "JavaScript", codename: "java_script", typeId: SET_TYPE_ID });
    await seedCard(storage, { id: 81, name: "HTTP JavaScript", typeId: 80, dbContent: "var before = 1;" });
    await seedCard(storage, { id: 83, name: "PlainText", codename: "plain_text", typeId: SET_TYPE_ID });
    await seedCard(storage, { id: 82, name: "HTTP Ordinary Script Text", typeId: 83, dbContent: "before" });
    const context = { ...ctxWith(), javascriptValidator: uglifyHarmonySyntaxError };
    const bridge = await makeWriteRouteServer(storage, context, { get: "record-404" });
    const put = (name: string, content: string) => fetch(`${bridge.url}/${encodeURIComponent(name)}.json`, {
      method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${joeToken}` },
      body: JSON.stringify({ card: { content } }),
    });
    const rows = () => Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_virtuals", "card_references"]
      .map(async table => [table, (await storage.counting.query(`SELECT * FROM ${table} ORDER BY rowid`, [])).rows]));
    try {
      expect((await put("HTTP JavaScript", "let x = 1; const f = n => n + x;")).status).toBe(200);
      const before = await rows();
      const denied = await put("HTTP JavaScript", "var invalid = ;");
      expect(denied.status).toBe(422);
      expect(await denied.text()).toContain("Unexpected token: punc (;)");
      expect(await rows()).toEqual(before);
      expect((await put("HTTP Ordinary Script Text", "var invalid = ;")).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => bridge.server.close(error => error ? reject(error) : resolve()));
    }
  });
  it("a *all+*style save with a scssCompiler in the context compiles and stores the site stylesheet", async () => {
    const seen: { source: string; style: string }[] = [];
    const response = await handleWriteRequest(
      ctxWith({
        scss: async (source, style) => {
          seen.push({ source, style });
          return "/* compiled by the host compiler */";
        },
      }),
      writeRequest("/*all+*style.json", JSON.stringify({ card: { content: "Probe Skin" } })),
    );
    expect(response?.status, `body: ${response?.body}`).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].style).toBe("compressed");
    expect(typeof seen[0].source).toBe("string");
    // (the sparse deck's assembled SCSS is bootstrap scaffold only; the
    // assembly itself is pinned against the oracle in the skin-stylesheet
    // tests and in edge-compiler-byte-identity.test.ts)
    // the compiled bytes are the output card's new local file, no action of its own
    const m = /^~46\/(\d+)\.css$/.exec(await outputContent());
    expect(m).not.toBeNull();
    expect(readFileSync(join(filesDir, "46", `${m![1]}.css`), "utf8")).toBe("/* compiled by the host compiler */");
    const outputActions = await storage.counting.query("SELECT id FROM card_actions WHERE card_id = ?", [IDS.output]);
    expect(outputActions.rows).toHaveLength(0);
  });

  it("the same save without a compiler is refused with a named error, nothing written", async () => {
    const before = { output: await outputContent(), rule: await ruleContent() };
    const response = await handleWriteRequest(
      ctxWith(),
      writeRequest("/*all+*style.json", JSON.stringify({ card: { content: "Probe Skin" } })),
    );
    expect(response?.status).toBe(422);
    expect(response?.body).toContain("scssCompiler");
    expect(await outputContent()).toBe(before.output);
    expect(await ruleContent()).toBe(before.rule);
  });

  it("HTTP rejects malformed CSS before content, history or the last valid stylesheet changes", async () => {
    await seedCard(storage, { id: 70, name: "CSS", codename: "css", typeId: SET_TYPE_ID });
    await seedCard(storage, { id: 71, name: "HTTP CSS", typeId: 70, dbContent: ".probe { color: red; }" });
    await seedCard(storage, { id: 72, name: "HTTP Plain", dbContent: ".probe { color:" });
    const context = ctxWith({ scss: libsassWasmCompiler() });
    const bridge = await makeWriteRouteServer(storage, context, { get: "record-404" });
    const put = async (name: string, card: Record<string, unknown>, extra = {}) => fetch(`${bridge.url}/${encodeURIComponent(name)}.json`, {
      method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${joeToken}` },
      body: JSON.stringify({ card, ...extra }),
    });
    const snapshot = async () => ({
      rows: await Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_virtuals", "card_references", "deck_data_version", "sqlite_sequence"]
        .map(async table => [table, (await storage.counting.query(`SELECT * FROM ${table} ORDER BY rowid`, [])).rows])),
      files: readdirSync(filesDir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
        .map(entry => join(entry.parentPath, entry.name)).sort().map(path => [path.slice(filesDir.length), readFileSync(path).toString("base64")]),
    });
    try {
      expect((await put("*all+*style", { content: "HTTP CSS" })).status).toBe(200);
      expect((await put("HTTP CSS", { content: ".probe { color: blue; }" })).status).toBe(200);
      const identifier = await outputContent();
      const match = /^~46\/(\d+)\.css$/.exec(identifier)!;
      expect(readFileSync(join(filesDir, "46", `${match[1]}.css`), "utf8")).toContain(".probe{color:blue}");
      const before = await snapshot();
      for (const extra of [{}, { draft: "true" }]) {
        const response = await put("HTTP CSS", { content: ".probe { color:" }, extra);
        expect(response.status).toBe(422);
        expect(await response.text()).toContain("content");
        expect(await snapshot()).toEqual(before);
      }
      for (const [name, card] of [
        ["HTTP Plain", { type_id: 70 }],
        ["HTTP CSS", { content: ".probe { color: red; }", subcards: { "+nested": { type_id: 70, content: "", subcards: { "+css": { type_id: 70, content: ".probe { color:" } } } } }],
      ] as const) {
        const response = await put(name, card);
        const body = await response.text();
        expect(response.status, `${name}: ${body}`).toBe(422);
        expect(body).toContain("content");
        expect(await snapshot()).toEqual(before);
      }
      const read = await fetch(`${bridge.url}/HTTP_CSS.json`);
      expect(await read.json()).toMatchObject({ dbContent: ".probe { color: blue; }" });
    } finally {
      await new Promise<void>((resolve, reject) => bridge.server.close(error => error ? reject(error) : resolve()));
    }
  });
});
