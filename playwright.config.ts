import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  webServer: { command: "rm -f data/e2e-app.db && node src/main.ts", url: "http://localhost:3100/api/stats", env: { PORT: "3100", APP_DB: "data/e2e-app.db" }, reuseExistingServer: false },
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
