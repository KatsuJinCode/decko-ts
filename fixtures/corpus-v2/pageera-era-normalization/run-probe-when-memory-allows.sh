#!/usr/bin/env bash
# run-probe-when-memory-allows.sh -- gate the era probe on free physical
# memory before launching it.
#
# MECHANISM, stated because it is why this file exists. R2's lane (r2-era-
# normalization-lane.md step 5) records the probe dying twice with
# `SqliteError: disk I/O error` (SQLITE_IOERR_READ) at
# tests/card/render/raw-corpus-seeding.ts:300, and a bare readFileSync of the
# 217 MB corpus db dying with ERR_MEMORY_ALLOCATION_FAILED, at 2.5 GB free of
# 31.8 GB. better-sqlite3 surfaces an allocation failure on the read path as
# SQLITE_IOERR_READ, so the "I/O error" is the SYMPTOM of heap exhaustion, not
# a damaged database (the db's sha256 still equalled the engine pin after the
# first occurrence). The large consumers on this box are OTHER sessions'
# processes, which this lane does not own and must not kill. So the probe waits
# for headroom instead of the lane killing anything.
#
# USAGE: ./run-probe-when-memory-allows.sh <min-free-MB> <logfile> <cmd...>
set -u
MIN_MB="${1:?min free MB}"; shift
LOG="${1:?logfile}"; shift

free_mb() {
  powershell -NoProfile -Command "\$os=Get-CimInstance Win32_OperatingSystem; [math]::Round(\$os.FreePhysicalMemory/1KB)" 2>/dev/null | tr -d '\r'
}

WAITED=0
while :; do
  F="$(free_mb)"
  if [ -z "$F" ]; then echo "MEMORY-GATE: could not read free memory; running anyway" | tee -a "$LOG"; break; fi
  echo "MEMORY-GATE free=${F}MB need=${MIN_MB}MB waited=${WAITED}s" | tee -a "$LOG"
  if [ "$F" -ge "$MIN_MB" ]; then break; fi
  if [ "$WAITED" -ge 1800 ]; then
    echo "MEMORY-GATE: gave up after ${WAITED}s at ${F}MB free (need ${MIN_MB}MB); running anyway and recording it" | tee -a "$LOG"
    break
  fi
  sleep 30
  WAITED=$((WAITED + 30))
done

echo "PROBE-LAUNCH free=$(free_mb)MB cmd=$*" | tee -a "$LOG"
"$@" >>"$LOG" 2>&1
RC=$?
echo "PROBE-EXIT rc=$RC free=$(free_mb)MB" | tee -a "$LOG"
exit $RC
