import { defineConfig } from "vitest/config";
import path from "node:path";
import AlphabeticalSequencer from "./tests/sequencer";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    sequence: { sequencer: AlphabeticalSequencer },
    testTimeout: 60000,
    hookTimeout: 120000,
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: ["tests/global-setup.ts"],
  },
});
