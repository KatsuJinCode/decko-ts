// Helper process for mysql-lifetime.test.ts: starts a MySQL server, reports
// its pid, and then waits. The test force-kills this process without letting
// it run any exit hook, and checks that the server does not outlive it.

import { startMysqlServer } from "./mysql-server.ts";

const server = await startMysqlServer();
const pid = server.pid;
process.stdout.write(`READY ${pid}\n`);
setInterval(() => undefined, 60_000);
