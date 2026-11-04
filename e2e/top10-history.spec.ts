import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openBridgerton(page: Page) {
  await page.goto("/");
  await expect(page.locator("#titles li").first()).toBeVisible();
  await page.getByLabel("Title contains").fill("Bridgerton");
  await page.getByLabel("Kind").selectOption({ label: "Shows" });
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: /^Bridgerton/ }).first().click();
  return page.getByRole("region", { name: "Bridgerton" });
}

test("a show's detail charts its top 10 history, with a text alternative", async ({ page }) => {
  const detail = await openBridgerton(page);
  await expect(detail.getByRole("heading", { name: "Top 10 history" })).toBeVisible();
  await expect(detail.getByText("21 weeks in the weekly top 10, from 2024-05-06 to 2026-03-23. Best rank: 1.")).toBeVisible();
  await expect(detail.getByRole("img", { name: /21 weeks in the weekly top 10/ })).toBeVisible();
  await detail.getByText("Week by week", { exact: true }).click();
  const weeks = detail.locator(".chart-weeks li");
  await expect(weeks).toHaveCount(21);
  await expect(weeks.first()).toHaveText(/^Week of 2024-05-06: #\d+$/);
  await expect(detail.locator(".chart-dot")).toHaveCount(21);
  expect(await detail.locator(".chart-line").count()).toBeGreaterThan(1);
});

test("if the history fails, the rest of the detail still shows and the person is told", async ({ page }) => {
  await page.route("**/api/titles/*/*/top10-history", (route) => route.fulfill({ status: 500, body: "{}" }));
  const detail = await openBridgerton(page);
  await expect(detail.getByText("Could not load the top 10 history.")).toBeVisible();
  await expect(detail.getByText("Total hours viewed")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  for (const [label, size] of [["desktop", { width: 1280, height: 800 }], ["mobile 360px", { width: 360, height: 740 }]] as const) {
    test(`the chart passes WCAG AA and does not scroll sideways: ${scheme}, ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      const detail = await openBridgerton(page);
      await expect(detail.getByRole("img", { name: /weekly top 10/ })).toBeVisible();
      await detail.getByText("Week by week", { exact: true }).click();
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      );
      expect(violations).toEqual([]);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }
}
