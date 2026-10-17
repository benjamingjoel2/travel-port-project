import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next's guard module throws outside a React server bundle; tests import server code directly.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
