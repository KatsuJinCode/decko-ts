import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { D1HttpExecutor, readCredsFile } from "../../../tools/d1-trickle/executors.mjs";

// Row: smell-cf-account-check.
//
// tools/d1-trickle/cf-account-check.mjs inspects the Cloudflare account a
// credentials file points at. It is read-only, but it is not harmless to run
// with the wrong file: it issues seven live Cloudflare API calls, one per probe,
// against whatever account id and token it manages to read. This row's roster
// entry is NOT-RUNNABLE because the only credentials file on the path of record
// carries CSEDGE_DB_* names, not the Cloudflare token and account id the script
// is pointed at, so there is nothing legitimate to run it with.
//
// The roster records the risk as "running with the Bunny file would fire live
// Cloudflare calls with an undefined token - not forced". That is a statement
// about the roster, not a guarantee from the script. This file pins the
// guarantee itself: the script must fail closed, before any request, when the
// named credentials are absent. Nothing here reads a real credential, points at
// a real credential, or makes a network call - the fixture below is written by
// this test and holds no secret.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const script = path.join(repo, "tools", "d1-trickle", "cf-account-check.mjs");

// Keys the harness reads, and values that are deliberately wrong for it. The
// point of the fixture is that the keys it does carry are not the ones asked
// for, which is the situation the roster hit.
const unrelatedCredentialFile = [
  "CSEDGE_DB_URL=http://127.0.0.1:1/v2/pipeline",
  "CSEDGE_DB_ID=fixture-only-not-a-credential",
  "CSEDGE_DB_READONLY_TOKEN=fixture-only-not-a-credential",
  "",
].join("\n");

// Replaces fetch with a recorder so a run can be measured without a request
// being made. The calls are written out on exit, from either path.
const FETCH_RECORDER = `import { writeFileSync } from "node:fs";
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), authorization: init?.headers?.Authorization ?? null });
  return { ok: true, status: 200, json: async () => ({ success: true, result: null }) };
};
const write = () => writeFileSync(process.env.FETCH_RECORDER_OUT, JSON.stringify(calls, null, 2));
process.on("exit", write);
`;

function runWithFixture(contents: string): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "cf-account-check-"));
  try {
    const creds = path.join(dir, "creds.env");
    writeFileSync(creds, contents);
    try {
      const stdout = execFileSync(
        process.execPath,
        [script, "--creds-file", creds, "--token-key", "CF_API_TOKEN", "--account-key", "CF_ACCOUNT_ID"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
      );
      return { status: 0, stdout, stderr: "" };
    } catch (error) {
      const failure = error as { status?: number | null; stdout?: string; stderr?: string };
      return { status: failure.status ?? null, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("cf-account-check refuses to reach Cloudflare without the credentials it was pointed at", () => {
  it("exits non-zero and reports nothing when the creds file lacks the named keys", () => {
    const run = runWithFixture(unrelatedCredentialFile);
    expect(run.status).not.toBe(0);
    // The refusal names the keys it wanted and the file it read, and nothing
    // else. A report here would mean the seven probes had run.
    expect(run.stderr).toMatch(/needs CF_ACCOUNT_ID and CF_API_TOKEN/);
    expect(run.stderr).not.toContain("fixture-only-not-a-credential");
    expect(run.stdout.trim()).toBe("");
  });

  it("refuses before the executor exists, so no request path can carry an undefined account", () => {
    // The seven request paths are built from the account id directly, not from
    // the executor's validated copy, so a guard that lives only inside
    // D1HttpExecutor still lets `/accounts/undefined/...` reach the wire. The
    // script is run here with fetch replaced by a recorder, so this measures the
    // requests it would have made without making any.
    const dir = mkdtempSync(path.join(tmpdir(), "cf-account-check-spy-"));
    try {
      const creds = path.join(dir, "creds.env");
      const calls = path.join(dir, "calls.json");
      const recorder = path.join(dir, "fetch-recorder.mjs");
      writeFileSync(creds, unrelatedCredentialFile);
      writeFileSync(recorder, FETCH_RECORDER);
      let status: number | null = null;
      try {
        execFileSync(
          process.execPath,
          [
            // --import takes a URL, not a bare Windows path.
            "--import",
            pathToFileURL(recorder).href,
            script,
            "--creds-file",
            creds,
            "--token-key",
            "CF_API_TOKEN",
            "--account-key",
            "CF_ACCOUNT_ID",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000, env: { ...process.env, FETCH_RECORDER_OUT: calls } },
        );
        status = 0;
      } catch (error) {
        status = (error as { status?: number | null }).status ?? null;
      }
      expect(status).not.toBe(0);
      // Zero requests. The script refused, so there was nothing to send.
      expect(JSON.parse(readFileSync(calls, "utf8"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads an absent key as absent rather than as an empty credential", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cf-account-check-keys-"));
    try {
      const creds = path.join(dir, "creds.env");
      writeFileSync(creds, unrelatedCredentialFile);
      // readCredsFile returning {} for keys it did not find is what makes the
      // script's own guard the thing standing between a wrong file and seven
      // live calls, so the shape of that return is asserted directly.
      expect(readCredsFile(creds, ["CF_API_TOKEN", "CF_ACCOUNT_ID"])).toEqual({});
      expect(readCredsFile(creds, ["CSEDGE_DB_ID"])).toEqual({ CSEDGE_DB_ID: "fixture-only-not-a-credential" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names the flag when a required one is left off, instead of a path type error", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cf-account-check-flags-"));
    try {
      const creds = path.join(dir, "creds.env");
      writeFileSync(creds, unrelatedCredentialFile);
      for (const [flag, argv] of [
        ["--creds-file", ["--token-key", "CF_API_TOKEN", "--account-key", "CF_ACCOUNT_ID"]],
        ["--token-key", ["--creds-file", creds, "--account-key", "CF_ACCOUNT_ID"]],
        ["--account-key", ["--creds-file", creds, "--token-key", "CF_API_TOKEN"]],
      ] as const) {
        let stderr = "";
        let status: number | null = null;
        try {
          execFileSync(process.execPath, [script, ...argv], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 30000,
          });
          status = 0;
        } catch (error) {
          const failure = error as { status?: number | null; stderr?: string };
          status = failure.status ?? null;
          stderr = failure.stderr ?? "";
        }
        expect(status, `${flag} omitted`).not.toBe(0);
        // The omission is named, not surfaced as readFileSync(undefined).
        expect(stderr, `${flag} omitted`).toContain(`needs ${flag}`);
        expect(stderr, `${flag} omitted`).not.toContain("ERR_INVALID_ARG_TYPE");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cannot construct an executor that would send an undefined bearer token", () => {
    expect(() => new D1HttpExecutor({ accountId: undefined, apiToken: undefined })).toThrow(
      /needs an explicit account id and API token/,
    );
    expect(() => new D1HttpExecutor({ accountId: "acct", apiToken: "" })).toThrow(
      /needs an explicit account id and API token/,
    );
    // Both halves, not just one: an account with no token would still put an
    // undefined bearer on the wire.
    expect(() => new D1HttpExecutor({ accountId: "", apiToken: "tok" })).toThrow(
      /needs an explicit account id and API token/,
    );
  });
});
