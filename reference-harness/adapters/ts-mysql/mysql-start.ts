// Starts the real MySQL server the ts-mysql adapter serves its deck from.
//
// The server is the official MySQL Community Server binaries (see
// tools/mysql/fetch-mysql.mjs), started as a hidden child process on
// 127.0.0.1 with a data directory under the OS temp directory. Every child
// process is spawned with windowsHide: true. The process-exit handlers stop
// the server when the adapter process ends.

import { startMysqlServer, type MysqlServer } from "../../../tests/server/drivers/mysql-server.js";

let server: Promise<MysqlServer> | undefined;

export function mysqlForHarness(): Promise<MysqlServer> {
  server ??= startMysqlServer().then((s) => {
    process.once("exit", () => s.kill());
    return s;
  });
  return server;
}