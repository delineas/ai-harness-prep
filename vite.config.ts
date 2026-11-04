import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  build: { outDir: "../../dist", emptyOutDir: true },
  test: { root: ".", include: ["src/**/*.test.ts"] },
  server: { proxy: { "/api": "http://localhost:3000" } },
});
