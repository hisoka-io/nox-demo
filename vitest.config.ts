import { defineConfig } from "vitest/config";
import path from "path";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
