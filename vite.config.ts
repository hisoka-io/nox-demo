import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import wasm from "vite-plugin-wasm";

// Railway passes the deployed commit as a build argument (see Dockerfile).
const BUILD_COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").trim().toLowerCase();

/** Adds `<meta name="build-commit">` so `curl` shows which commit is live. */
function buildCommitMeta(commit: string): Plugin {
  return {
    name: "build-commit-meta",
    transformIndexHtml() {
      if (!/^[0-9a-f]{7,64}$/.test(commit)) return [];
      return [{ tag: "meta", attrs: { name: "build-commit", content: commit }, injectTo: "head" }];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), buildCommitMeta(BUILD_COMMIT)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["@hisoka-io/nox-wasm"],
  },
  define: {
    "process.stderr": JSON.stringify({ write: () => {} }),
    "process.env": JSON.stringify({}),
  },
  worker: {
    format: "es",
  },
});
