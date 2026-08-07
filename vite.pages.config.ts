import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = process.cwd();

export default defineConfig({
  base: "/SXXY-html/",
  root: resolve(projectRoot, "static-site"),
  publicDir: resolve(projectRoot, "public"),
  plugins: [react()],
  css: {
    postcss: resolve(projectRoot, "postcss.config.mjs"),
  },
  build: {
    outDir: resolve(projectRoot, "pages-dist"),
    emptyOutDir: true,
  },
});
