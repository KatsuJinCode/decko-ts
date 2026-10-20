import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reapOrphanedBrowsers } from "../lib/launch.mjs";

// A dead process id: spawn-and-exit is not needed; a pid far above the OS range never exists.
const DEAD_PID = 2 ** 30 + 7;

test("a launch ends the browsers of dead runs and removes their profiles, and leaves live ones", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reap-test-"));
  try {
    const dead = path.join(tmp, "decko-browser-profile-dead1");
    const live = path.join(tmp, "decko-browser-profile-live1");
    const legacy = path.join(tmp, "decko-browser-profile-legacy");
    for (const d of [dead, live, legacy]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(dead, ".decko-owner.json"), JSON.stringify({ pid: DEAD_PID }));
    fs.writeFileSync(path.join(live, ".decko-owner.json"), JSON.stringify({ pid: process.pid }));
    const roots = [
      { pid: 111, commandLine: `chrome.exe --user-data-dir="${dead}" --headless` },
      { pid: 222, commandLine: `chrome.exe --user-data-dir="${live}" --headless` },
    ];
    const killed = [];
    const reaped = reapOrphanedBrowsers({ tmp, list: () => roots, kill: (pid) => killed.push(pid) });
    assert.deepEqual(reaped, [dead]);
    assert.deepEqual(killed, [111]);
    assert.equal(fs.existsSync(dead), false);
    assert.equal(fs.existsSync(live), true);
    assert.equal(fs.existsSync(legacy), true, "a profile with no owner record is left alone");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
