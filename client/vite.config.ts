import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import mkcert from "vite-plugin-mkcert";
import path from "path";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), mkcert()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
