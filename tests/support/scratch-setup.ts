// Vitest setup file: after each test file's own hooks have run, remove every
// scratch directory the file created through scratchDir().
import { afterAll } from "vitest";
import { cleanupScratch } from "./scratch-dir.mjs";

afterAll(() => {
  cleanupScratch();
});
