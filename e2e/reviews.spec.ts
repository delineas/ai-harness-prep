import { expect, test } from "@playwright/test";

test("a user reviews a title; the text renders literally; a moderator hides it", async ({ page }) => {
  await page.goto("/");
  await page.locator("#titles .card-btn").first().click();
  await page.getByLabel("Acting as").selectOption({ label: "Ana" });
  await page.getByLabel("Rating (1 to 5)", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.locator("#review-status")).toHaveText("The rating must be a whole number from 1 to 5.");
  await page.getByLabel("Rating (1 to 5)", { exact: true }).fill("5");
  await page.getByLabel("Your review", { exact: true }).fill('<img src=x onerror="alert(1)">');
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.locator(".review-body")).toHaveText('<img src=x onerror="alert(1)">');
  await expect(page.locator(".review img")).toHaveCount(0);
  await page.getByLabel("Acting as").selectOption({ label: "María (moderator)" });
  await page.getByRole("button", { name: "Hide review by Ana" }).click();
  await expect(page.locator(".badge")).toHaveText("Hidden");
});
