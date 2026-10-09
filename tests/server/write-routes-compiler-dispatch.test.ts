// The write surface dispatches the asset-save refusal gate to the host
// compilers: a `*all+*style` save through handleWriteRequest with a
// scssCompiler in the WriteRouteContext rebuilds the site stylesheet (the
// compiled bytes land in the output card's file), and the same save on a
// host that passes no compiler is refused with a named error before
// anything is written — exactly the gate the edge hosts relied on before
// they carried compilers, and the seam cloudflare-write-routes.ts now
// dispatches to (libsass-wasm.ts / coffee-npm-compiler.ts).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function ctxWith(compilers: { scss?: (source: string, style: string) => Promise<string> } = {}): WriteRouteContext {
  return {
    ...baseCtx,
    attachmentStore: new LocalAttachmentStore(filesDir),
    ...(compilers.scss === undefined ? {} : {
      scssCompiler: async (source: string, style: string) => compilers.scss!(source, style),
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
});
