// dual-lane-verifier-fast.kill-scoping.test.mjs -- kill-path coverage.
//
// CONTRACT BEING GUARDED (see
// docs/parity-method.md): a deadline kill
// touches ONLY the breaching phase's own recorded pid subtree
// (killPhaseTree) -- never a sibling phase's tree, no matter how the
// phases overlap at 2 workers. killOwnTree, whose kill roots are every
// entry in the global liveChildren registry, remains only for
// whole-runner shutdown (SIGINT/SIGTERM/runner-error/stalled-exit
// residual). If that scoping ever regressed to a global kill, sibling
// phases mid-render would die with their completed work lost -- these
// tests fail first.
//
// These tests exercise the REAL kill machinery against REAL process trees of
// the same shape the runner spawns (shell:true => recorded pid is a cmd.exe
// shell, with node -> grandchild node descending beneath it -- mirroring
// npx -> vitest -> vitest workers). No corpus, no repo vitest suite, no Ruby;
// wall clock is a few seconds per test.
//
//   killPhaseTree   kills the target tree; the returned killed set covers the
//                   whole subtree AND excludes the sibling tree entirely (the
//                   invariant: no sibling or later-phase process is touched)
//   listDescendants walks strictly downward from the given root only
//   killOwnTree     global shutdown semantics preserved: every child registered
//                   via recordLiveChild (the production registration path) dies
//   import safety   importing the verifier module must not spawn or exit
//                   (entry guard) -- implicit: this file imports it and runs

import { expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { describeOrSkipLoud } from "../tests/support/describe-with-corpus.ts";
import {
  killOwnTree,
  killPhaseTree,
  listDescendants,
  recordLiveChild,
} from "./dual-lane-verifier-fast.mjs";

function pidAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"], {
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  return r.status === 0 && String(r.stdout).includes(`,"${pid}",`);
}

// Spawn a tree shaped like a real phase child: with shell:true the recorded
// child.pid is the shell; node -> grandchild descend beneath it. The
// grandchild pid is reported by the middle node on stdout ("GRANDCHILD=<pid>").
// Single-quote discipline throughout: the outer command carries the script in
// double quotes for cmd.exe, so the script itself may contain none.
function spawnPhaseShapedTree() {
  const midScript =
    "const cp=require('node:child_process');" +
    "const g=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});" +
    "process.stdout.write('GRANDCHILD='+g.pid);" +
    "setInterval(()=>{},1000);";
  return spawn(`node -e "${midScript}"`, {
    shell: true,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function readGrandchildPid(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("grandchild pid never reported")), 10_000);
    let buf = "";
    const on = (c) => {
      buf += c.toString();
      const m = /GRANDCHILD=(\d+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        child.stdout.off("data", on);
        resolve(Number(m[1]));
      }
    };
    child.stdout.on("data", on);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function expectDead(pid, what) {
  // taskkill /F is fast but not instant at the tasklist level; poll briefly.
  for (let i = 0; i < 25; i++) {
    if (!pidAlive(pid)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`expected pid ${pid} dead (${what}) but it is still alive`);
}

// The kill machinery under test is win32-only (taskkill/tasklist/powershell
// snapshot) and loud-refuses on other hosts (PLATFORM-OPS gate in
// prepareRunState). Gate the suite the same way coderay-byte-identity gates
// its corpus fixtures: skip cleanly where the platform branch is missing
// instead of failing red on a host the instrument has never supported — and
// say so in the output, never a silent skip.
describeOrSkipLoud(
  process.platform !== "win32",
  "tools/dual-lane-verifier-fast.kill-scoping.test.mjs",
  "process.platform === 'win32' — the kill machinery under test is win32-only (taskkill/tasklist/powershell snapshot) and loud-refuses on other hosts (PLATFORM-OPS gate in prepareRunState)",
)("dual-lane-verifier-fast kill scoping (sweep defect guard)", () => {
  it("deadline-scoped killPhaseTree kills ONLY its own phase tree; the sibling tree survives untouched", async () => {
    const target = spawnPhaseShapedTree();
    const sibling = spawnPhaseShapedTree();
    try {
      const gcTarget = await readGrandchildPid(target);
      const gcSibling = await readGrandchildPid(sibling);

      const res = killPhaseTree(target.pid, "phase TARGET (test)", "deadline:test-scoping");

      expect(res.root).toBe(target.pid);
      expect(res.snapshotFailed).toBe(false);
      // the whole target subtree was targeted: shell + mid + grandchild
      expect(res.killed).toContain(target.pid);
      expect(res.killed).toContain(gcTarget);
      // THE INVARIANT: nothing outside the target tree was targeted or touched
      for (const pid of [sibling.pid, gcSibling]) {
        expect(res.killed).not.toContain(pid);
        expect(pidAlive(pid)).toBe(true);
      }
      // the target tree is gone
      await expectDead(target.pid, "target shell");
      await expectDead(gcTarget, "target grandchild");
    } finally {
      killPhaseTree(sibling.pid, "phase SIBLING cleanup (test)", "test-cleanup");
    }
  }, 25_000);

  it("listDescendants walks strictly downward: finds the root's grandchild, never a sibling root", async () => {
    const a = spawnPhaseShapedTree();
    const b = spawnPhaseShapedTree();
    try {
      const gcA = await readGrandchildPid(a);
      await readGrandchildPid(b);
      const found = listDescendants([a.pid]);
      expect(found).toContain(gcA);
      expect(found).not.toContain(b.pid);
    } finally {
      killPhaseTree(a.pid, "cleanup A (test)", "test-cleanup");
      killPhaseTree(b.pid, "cleanup B (test)", "test-cleanup");
    }
  }, 25_000);

  it("killOwnTree keeps its global shutdown semantics: every recordLiveChild-registered tree dies (interrupt path)", async () => {
    const a = spawnPhaseShapedTree();
    const b = spawnPhaseShapedTree();
    const gcA = await readGrandchildPid(a);
    const gcB = await readGrandchildPid(b);
    recordLiveChild(a.pid, "phase A (test)");
    recordLiveChild(b.pid, "phase B (test)");
    killOwnTree("test:interrupt-shutdown");
    await expectDead(a.pid, "registered tree A shell");
    await expectDead(b.pid, "registered tree B shell");
    await expectDead(gcA, "tree A grandchild");
    await expectDead(gcB, "tree B grandchild");
  }, 25_000);
});
