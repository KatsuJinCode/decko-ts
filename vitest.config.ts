import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
