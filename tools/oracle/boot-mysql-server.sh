#!/usr/bin/env bash
# boot-mysql-server.sh - start the oracle harness MySQL-rung server
# (docs/oracle-harness.md "MySQL rung") and wait until it answers.
#
# Portable MariaDB 11.4.5 in userspace: loopback-only 127.0.0.1:33061,
# dedicated datadir, no Windows service. Idempotent: exits 0 if the
# server is already up. Stop it with: mariadb-admin -h 127.0.0.1 -P 33061
# -u root shutdown (or let it die with the shell that spawned it).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARIADB="$REPO_ROOT/tools/oracle/portable-mariadb/mariadb-11.4.5-winx64"
CLIENT_LIB="$REPO_ROOT/tools/oracle/mysql-client-scratch/lib"
INI="$REPO_ROOT/tools/oracle/mysql-server/my.ini"

if "$MARIADB/bin/mariadb-admin.exe" -h 127.0.0.1 -P 33061 -u root ping >/dev/null 2>&1; then
  echo "mysql-rung server already up (127.0.0.1:33061)"
  exit 0
fi

if [ ! -d "$REPO_ROOT/tools/oracle/mysql-server/data" ]; then
  echo "datadir missing - initializing"
  "$MARIADB/bin/mariadb-install-db.exe" -d "C:/localProjects/decko-ts/tools/oracle/mysql-server/data" \
    -c "C:/localProjects/decko-ts/tools/oracle/mysql-server/my.ini"
fi

"$MARIADB/bin/mariadbd.exe" "--defaults-file=$INI" --standalone &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if "$MARIADB/bin/mariadb-admin.exe" -h 127.0.0.1 -P 33061 -u root ping >/dev/null 2>&1; then
    echo "mysql-rung server up (pid $SERVER_PID, 127.0.0.1:33061)"
    echo "RUBY_DLL_PATH for decko commands: $CLIENT_LIB"
    exit 0
  fi
  sleep 1
done

echo "server failed to become ready" >&2
exit 1
