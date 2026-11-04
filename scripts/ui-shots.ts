// Starts the built app and saves screenshots to look at: light/dark x desktop/360px.
// Usage: npm run ui:shots [outDir]   (run `npm run build` first)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "test-results/ui-shots");
mkdirSync(out, { recursive: true });
const port = "3101";
const server = spawn("node", ["src/main.ts"], { env: { ...process.env, PORT: port }, stdio: "ignore" });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/stats`)).ok) break; } catch { /* not up yet */ }
    if (i > 50) throw new Error("server did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, width] of [["desktop", 1280], ["mobile", 360]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: scheme });
      await page.goto(`http://localhost:${port}/`);
      await page.locator("#titles li").first().waitFor();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab"); // show the focus ring on the first enabled control
      const file = join(out, `${scheme}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await page.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}
