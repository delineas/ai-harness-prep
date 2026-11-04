import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Collects everything a person would call "broken" but a visual check would miss. */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console.error: ${m.text()}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()}`));
  return problems;
}

const loaded = (page: Page) => expect(page.locator("#titles li")).toHaveCount(20);

test("a person can read the catalog and page through it without any error", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  await expect(page).toHaveTitle("Netflix Explorer");
  await expect(page.getByRole("heading", { level: 1, name: "Netflix Explorer" })).toBeVisible();
  await loaded(page);
  await expect(page.locator("#status")).toHaveText("");
  await expect(page.locator("#stats")).toHaveAttribute("aria-busy", "false");

  // Every card shows a real name and "Movie|Show · year".
  const names = await page.locator("#titles .name").allTextContents();
  expect(names.every((n) => n.trim().length > 0)).toBe(true);
  for (const meta of await page.locator("#titles .meta").allTextContents()) {
    expect(meta).toMatch(/^(Movie|Show) · (\d{4}|year unknown)$/);
  }
  await expect(page.locator("#page-info")).toHaveText("Page 1 of 854 (17,076 titles)");

  for (const expected of ["Page 2", "Page 3"]) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("#page-info")).toContainText(expected);
    await loaded(page);
  }
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.locator("#page-info")).toContainText("Page 2");
  expect(problems).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  for (const [label, size] of [["desktop", { width: 1280, height: 800 }], ["mobile 360px", { width: 360, height: 800 }]] as const) {
    test(`accessibility (WCAG 2.1 AA, incl. contrast): ${scheme}, ${label}`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await loaded(page);
      await expect(page.locator('[data-stat="movies"]')).toHaveText("12,214");
      await page.screenshot({ path: testInfo.outputPath("page1.png"), fullPage: true });
      await testInfo.attach(`${scheme} ${label}`, { path: testInfo.outputPath("page1.png"), contentType: "image/png" });

      const scan = async () =>
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
          (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        );
      expect(await scan()).toEqual([]);

      // Disabled state (page 1) is covered above; check the state after paging too.
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.locator("#page-info")).toContainText("Page 2");
      expect(await scan()).toEqual([]);
    });
  }
}

test("keyboard focus is clearly visible", async ({ page }) => {
  await page.goto("/");
  await loaded(page);
  await page.keyboard.press("Tab"); // skip link
  const skip = page.getByRole("link", { name: "Skip to titles" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport(); // the skip link must appear when focused
  const next = page.getByRole("button", { name: "Next", exact: true });
  for (let i = 0; i < 60 && !(await next.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(next).toBeFocused();
  // Same for a title button and a form field: focus must be visible everywhere, not only on the pager.
  for (const target of [page.getByLabel("Title contains"), page.locator("#titles li button").first()]) {
    await target.focus();
    const o = await target.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(o.style).not.toBe("none");
    expect(o.width).toBeGreaterThanOrEqual(2);
  }
  await next.focus();
  const outline = await next.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("skip link moves focus to the titles", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Titles" })).toBeFocused();
});

test("buttons are big enough to tap on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await loaded(page);
  for (const name of ["Previous", "Next"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  }
});

test("while a page loads the person is told, and the message goes away", async ({ page }) => {
  await page.goto("/");
  await loaded(page);
  await page.route("**/api/titles*", async (r) => {
    await new Promise((res) => setTimeout(res, 400));
    await r.continue();
  });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("#status")).toHaveText("Loading…");
  await expect(page.locator("#page-info")).toContainText("Page 2");
  await expect(page.locator("#status")).toHaveText("");
});

test("if statistics fail, the titles still work and the person sees why", async ({ page }) => {
  await page.route("**/api/stats", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator("#stats")).toHaveText("Could not load statistics.");
  await expect(page.locator("#stats")).toHaveAttribute("aria-busy", "false");
  await loaded(page);
});

test("a server error on titles is shown, not a blank screen", async ({ page }) => {
  await page.route("**/api/titles*", (r) => r.fulfill({ status: 500, body: "boom" }));
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Could not load titles.");
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
});
