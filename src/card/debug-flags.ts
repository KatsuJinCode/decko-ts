// Opt-in diagnostic flags. A flag is on only when its environment variable
// is exactly "1"; runtimes without `process` (the edge worker) read every
// flag as off. Read per call so a test or a probe can toggle a flag without
// reloading modules.
export function debugFlag(name: string): boolean {
  if (typeof process === "undefined" || typeof process.env !== "object") return false;
  return process.env[name] === "1";
}
