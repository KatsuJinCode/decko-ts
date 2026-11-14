// Helper process for mysql-lifetime.test.ts: starts a MySQL server, reports
// its pid, and then waits. The test force-kills this process without letting
// it run any exit hook, and checks that the server does not outlive it.

// The import path is held in a variable so Node runs the TypeScript directly
// (type stripping) without the typecheck's extension rules.
const serverModule = new URL("./mysql-server.ts", import.meta.url).href;
const { startMysqlServer } = (await import(serverModule)) as {
  startMysqlServer: () => Promise<import("./mysql-server.js").MysqlServer>;
};

const server = await startMysqlServer();
const { readFileSync } = await import("node:fs");
const connection = await server.connect();
const [rows] = await connection.query("SELECT @@pid_file AS pidFile");
const pidFile = (rows as Array<{ pidFile: string }>)[0]!.pidFile;
const serverPid = Number(readFileSync(pidFile, "utf8").trim());
await connection.end();
process.stdout.write(`READY ${JSON.stringify({ pid: server.pid, serverPid, pidFile, port: server.port, datadir: server.datadir })}\n`);
setInterval(() => undefined, 60_000);
