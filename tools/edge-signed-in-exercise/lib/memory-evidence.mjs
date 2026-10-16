import { getHeapStatistics } from 'node:v8';

// Aggregate counters only: no heap snapshot, request values or credentials.
export function memoryEvidence(stage, counters = {}) {
  const memory = process.memoryUsage();
  const heap = getHeapStatistics();
  return { at: new Date().toISOString(), stage, pid: process.pid,
    rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal,
    external: memory.external, arrayBuffers: memory.arrayBuffers,
    heapLimit: heap.heap_size_limit, heapAvailable: heap.total_available_size,
    ...counters };
}
