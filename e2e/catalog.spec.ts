import { expect, test } from "@playwright/test";

test("header shows the global stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-stat="movies"]')).toHaveText("12,214");
  await expect(page.locator('[data-stat="shows"]')).toHaveText("4,862");
  await expect(page.locator('[data-stat="seasons"]')).toHaveText("8,874");
  await expect(page.locator('[data-stat="period"]')).toHaveText("2023-06-12 – 2026-10-04");
});

test("grid has 20 titles and next/previous change them", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("#titles li");
  await expect(cards).toHaveCount(20);
  const name = page.locator("#titles li .name").first();
  const first = (await name.textContent()) ?? "";
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("#page-info")).toContainText("Page 2 of 854");
  await expect(cards).toHaveCount(20);
  await expect(name).not.toHaveText(first);
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(name).toHaveText(first);
});

test("pager is reachable and operable by keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#titles li")).toHaveCount(20);
  await page.keyboard.press("Tab"); // skip link
  await page.keyboard.press("Tab"); // Previous (disabled -> skipped) -> Next
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#page-info")).toContainText("Page 2");
});

test("no horizontal scroll at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.locator("#titles li")).toHaveCount(20);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});

test("shows an error when the API fails", async ({ page }) => {
  await page.route("**/api/titles*", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Could not load titles.");
});
