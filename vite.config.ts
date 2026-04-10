import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
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
