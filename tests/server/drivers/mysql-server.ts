// A real MySQL server for the MySQL driver's tests, started as a child process
// from the official MySQL Community Server binaries (cdn.mysql.com), with no
// system install and no third-party server package.
//
// The binaries are fetched and checksum-verified by tools/mysql/fetch-mysql.mjs
// into a cache directory (default: the sibling of the repository checkout,
// C:/localProjects/.mysql-test-cache; override with DECKO_MYSQL_CACHE). Each
// test server gets its own data directory under the OS temp directory, on the
// loopback interface only, and is shut down and deleted when the suite ends.
//
// Every child process is spawned with windowsHide: true, so no console window
// is shown on Windows.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection, type Connection } from "mysql2/promise";

/** The MySQL Community Server release the tests run against. */
export const MYSQL_VERSION = "8.4.11";

const here = dirname(fileURLToPath(import.meta.url));

/** The directory the fetch tool unpacks the vendor binaries into. */
export function mysqlCacheDir(): string {
  return process.env.DECKO_MYSQL_CACHE ?? resolve(here, "../../../../.mysql-test-cache");
}

/** The MySQL base directory (the one holding bin/mysqld). */
export function mysqlBaseDir(): string {
  if (process.env.DECKO_MYSQL_BASEDIR) return process.env.DECKO_MYSQL_BASEDIR;
  if (process.platform !== "win32") {
    throw new Error(
      "no MySQL base directory: set DECKO_MYSQL_BASEDIR to a MySQL " + MYSQL_VERSION + " install (Linux binaries are not fetched by tools/mysql/fetch-mysql.mjs)",
    );
  }
  return join(mysqlCacheDir(), MYSQL_VERSION, `mysql-${MYSQL_VERSION}-winx64`);
}

function mysqldPath(): string {
  const base = mysqlBaseDir();
  const exe = join(base, "bin", process.platform === "win32" ? "mysqld.exe" : "mysqld");
  if (!existsSync(exe)) {
    throw new Error(
      `MySQL ${MYSQL_VERSION} server binary not found at ${exe}. Run: node tools/mysql/fetch-mysql.mjs`,
    );
  }
  return exe;
}

function runToCompletion(command: string, args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ code, output }));
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (typeof address === "object" && address ? resolvePort(address.port) : rejectPort(new Error("no port"))));
    });
  });
}

export interface MysqlServer {
  /** The TCP port the server listens on, on 127.0.0.1. */
  readonly port: number;
  /** A connection as root (initialized with an empty root password). */
  connect(database?: string): Promise<Connection>;
  /** Shut the server down and delete its data directory. */
  stop(): Promise<void>;
}

/**
 * Start a fresh MySQL server on an ephemeral loopback port with an empty data
 * directory. Throws, with the reason, if the binaries are missing or the server
 * does not come up within the timeout.
 */
export async function startMysqlServer(): Promise<MysqlServer> {
  const mysqld = mysqldPath();
  const basedir = mysqlBaseDir();
  const datadir = mkdtempSync(join(tmpdir(), "decko-mysql-"));
  const errorLog = join(datadir, "error.log");
  let child: ChildProcess | undefined;
  try {
    const init = await runToCompletion(mysqld, [
      "--no-defaults",
      `--basedir=${basedir}`,
      `--datadir=${join(datadir, "data")}`,
      "--initialize-insecure",
      `--log-error=${errorLog}`,
    ]);
    if (init.code !== 0) throw new Error(`mysqld --initialize-insecure failed (${init.code}): ${init.output}`);

    const port = await freePort();
    child = spawn(
      mysqld,
      [
        "--no-defaults",
        `--basedir=${basedir}`,
        `--datadir=${join(datadir, "data")}`,
        `--port=${port}`,
        "--bind-address=127.0.0.1",
        "--mysqlx=OFF",
        "--skip-named-pipe",
        "--character-set-server=utf8mb3",
        "--collation-server=utf8mb3_unicode_ci",
        `--log-error=${errorLog}`,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    const running = child;
    let exited = false;
    running.on("exit", () => (exited = true));

    const connectOnce = (database?: string) =>
      createConnection({ host: "127.0.0.1", port, user: "root", password: "", database, charset: "utf8mb4" });

    const deadline = Date.now() + 60_000;
    let ready = false;
    while (!ready) {
      if (exited) throw new Error(`mysqld exited before it accepted connections; see ${errorLog}`);
      if (Date.now() > deadline) throw new Error(`mysqld did not accept connections within 60 s; see ${errorLog}`);
      try {
        const probe = await connectOnce();
        await probe.end();
        ready = true;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    const stop = async () => {
      try {
        const admin = await connectOnce();
        await admin.query("SHUTDOWN").catch(() => undefined);
        await admin.end().catch(() => undefined);
      } catch {
        /* already down */
      }
      const gone = Date.now() + 30_000;
      while (!exited && Date.now() < gone) await new Promise((r) => setTimeout(r, 100));
      if (!exited) running.kill();
      rmSync(datadir, { recursive: true, force: true });
    };

    return { port, connect: (database?: string) => connectOnce(database), stop };
  } catch (error) {
    child?.kill();
    rmSync(datadir, { recursive: true, force: true });
    throw error;
  }
}
