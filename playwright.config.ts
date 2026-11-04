import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  webServer: { command: "node src/main.ts", url: "http://localhost:3100/api/stats", env: { PORT: "3100" }, reuseExistingServer: false },
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
