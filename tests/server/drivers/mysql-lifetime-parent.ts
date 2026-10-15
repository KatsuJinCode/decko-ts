// Helper process for mysql-lifetime.test.ts: starts a MySQL server, reports
// its pid, and then waits. The test force-kills this process without letting
// it run any exit hook, and checks that the server does not outlive it.

// The import path is held in a variable so Node runs the TypeScript directly
// (type stripping) without the typecheck's extension rules.
const serverModule = new URL("./mysql-server.ts", import.meta.url).href;
const { startMysqlServer } = (await import(serverModule)) as {
  startMysqlServer: () => Promise<{ pid: number }>;
};

const server = await startMysqlServer();
process.stdout.write(`READY ${server.pid}\n`);
setInterval(() => undefined, 60_000);
