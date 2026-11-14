// Real child-process lifecycle controls; these are not Decko acceptance journeys.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEngine } from "../lib/engines.mjs";

test("owned host restart preserves its staged data and stop awaits process/port closure", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "decko-lifecycle-test-"));
  let server;
  try {
    mkdirSync(path.join(root, "deck/files"), { recursive: true });
    writeFileSync(path.join(root, "deck/deck.sqlite3"), "initial-data");
    writeFileSync(path.join(root, "deck/files/marker"), "file-data");
    writeFileSync(path.join(root, "deck.json"), "{}");
    writeFileSync(path.join(root, "host.mjs"), `
      import http from "node:http"; import fs from "node:fs";
      const server = http.createServer((req,res) => {
        res.setHeader("connection", "close");
        if(req.url === "/write") fs.writeFileSync(process.env.HARNESS_DECK, "persisted-data");
        if(req.url === "/read") res.end(fs.readFileSync(process.env.HARNESS_DECK));
        else if(req.url === "/__harness/mail") res.end("[]");
        else res.end("ready");
      }); server.listen(Number(process.env.HARNESS_PORT), "127.0.0.1");
    `);
    server = await startEngine({ name: "lifecycle-test", command: [process.execPath, "host.mjs"], dir: root }, root);
    await fetch(server.base + "/write");
    const restarted = await server.restart();
    assert.notEqual(restarted.previousPid, restarted.pid);
    assert.throws(() => process.kill(restarted.previousPid, 0), /ESRCH/);
    assert.equal(await fetch(server.base + "/read").then(r => r.text()), "persisted-data");
    assert.equal(existsSync(path.join(server.files, "marker")), true);
    const staged = path.dirname(server.db);
    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot;
      try {
        process.env.SystemRoot = root; // missing executable: must fail closed
        await assert.rejects(server.stop(), /ENOENT/);
        assert.equal(existsSync(staged), true);
        assert.equal(await fetch(server.base + "/read").then(r => r.text()), "persisted-data");
      } finally { process.env.SystemRoot = systemRoot; }
    }
    await server.stop();
    assert.throws(() => process.kill(restarted.pid, 0), /ESRCH/);
    await assert.rejects(fetch(server.base + "/__harness/ready"));
    assert.equal(existsSync(staged), false);
    server = null;
  } finally {
    await server?.stop();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.equal(path.basename(root).startsWith("decko-lifecycle-test-"), true);
    rmSync(root, { recursive: true, force: true });
  }
});
