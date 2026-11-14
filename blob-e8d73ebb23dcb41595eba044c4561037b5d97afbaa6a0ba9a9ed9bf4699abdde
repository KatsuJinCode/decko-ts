#!/usr/bin/env node
// fetch-mysql.mjs — download, verify and unpack the official MySQL Community
// Server binaries the MySQL driver tests run against, with no system install.
//
//   node tools/mysql/fetch-mysql.mjs [--cache <dir>]
//
// The archive is fetched from cdn.mysql.com (Oracle's own CDN) and its MD5 is
// compared with the checksum Oracle publishes beside it before anything is
// unpacked. The cache directory defaults to the sibling of the repository
// checkout, named .mysql-test-cache, and is overridden with
// --cache or DECKO_MYSQL_CACHE; it is outside the repository and never inside
// Downloads. The unpacked directory is left in place for later runs.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const VERSION = process.env.DECKO_MYSQL_VERSION ?? "8.4.11";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const args = process.argv.slice(2);
const cacheIndex = args.indexOf("--cache");
const CACHE =
  (cacheIndex >= 0 ? args[cacheIndex + 1] : undefined) ??
  process.env.DECKO_MYSQL_CACHE ??
  resolve(REPO_ROOT, "..", ".mysql-test-cache");

if (process.platform !== "win32") {
  console.error("fetch-mysql.mjs fetches the Windows binaries; on other platforms point DECKO_MYSQL_BASEDIR at a local MySQL " + VERSION + " install");
  process.exit(2);
}

const base = `https://cdn.mysql.com//Downloads/MySQL-8.4/mysql-${VERSION}-winx64.zip`;
const downloads = join(CACHE, "downloads");
const archive = join(downloads, `mysql-${VERSION}-winx64.zip`);
const target = join(CACHE, VERSION, `mysql-${VERSION}-winx64`);

function fetch(url, destination) {
  return new Promise((ok, fail) => {
    const child = spawn("curl", ["-L", "--fail", "--silent", "--show-error", "-o", destination, url], {
      windowsHide: true,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`curl exited ${code} for ${url}`))));
  });
}

function md5(path) {
  return new Promise((ok, fail) => {
    execFile("certutil", ["-hashfile", path, "MD5"], { windowsHide: true }, (error, stdout) => {
      if (error) return fail(error);
      const match = /[0-9a-f]{32}/i.exec(stdout);
      if (!match) return fail(new Error(`could not read the MD5 of ${path}`));
      ok(match[0].toLowerCase());
    });
  });
}

function extract(archivePath, into) {
  return new Promise((ok, fail) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${into}' -Force`],
      { windowsHide: true, stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`Expand-Archive exited ${code}`))));
  });
}

mkdirSync(downloads, { recursive: true });
if (!existsSync(archive)) await fetch(base, archive);
const expected = (await fetchText(`${base}.md5`)).split(/\s+/)[0].toLowerCase();
const actual = await md5(archive);
if (expected !== actual) throw new Error(`checksum mismatch for ${archive}: expected ${expected}, got ${actual}`);
console.log(`verified md5 ${actual}`);

mkdirSync(join(CACHE, VERSION), { recursive: true });
await extract(archive, join(CACHE, VERSION));
console.log(`MySQL ${VERSION} unpacked at ${join(CACHE, VERSION, `mysql-${VERSION}-winx64`)}`);

async function fetchText(url) {
  return new Promise((ok, fail) => {
    execFile("curl", ["-L", "--fail", "--silent", "--show-error", url], { windowsHide: true, maxBuffer: 1 << 20 }, (error, stdout) =>
      error ? fail(error) : ok(String(stdout)),
    );
  });
}
