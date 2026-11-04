import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator("#titles li");
const ready = (page: Page) => expect(cards(page).first()).toBeVisible();

async function search(page: Page, f: { q?: string; kind?: string; year?: string; sort?: string }) {
  if (f.q !== undefined) await page.getByLabel("Title contains").fill(f.q);
  if (f.kind) await page.getByLabel("Kind").selectOption({ label: f.kind });
  if (f.year !== undefined) await page.getByLabel("Release year").fill(f.year);
  if (f.sort) await page.getByLabel("Sort by").selectOption({ label: f.sort });
  await page.getByRole("button", { name: "Search" }).click();
}

test("every search input has a visible label", async ({ page }) => {
  await page.goto("/");
  for (const label of ["Title contains", "Kind", "Release year", "Sort by"]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
});

test('searching "love" in movies shows only movies whose title contains "love"', async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await search(page, { q: "love", kind: "Movies" });
  await expect(page.locator("#page-info")).toHaveText("Page 1 of 16 (302 titles)");
  const names = await page.locator("#titles .name").allTextContents();
  const metas = await page.locator("#titles .meta").allTextContents();
  expect(names).toHaveLength(20);
  expect(names.every((n) => /love/i.test(n))).toBe(true);
  expect(metas.every((m) => m.startsWith("Movie ·"))).toBe(true);
});

test("a year filter works and warns that unknown years are hidden", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.getByText("Titles whose release year is unknown are hidden")).toBeHidden();
  await search(page, { kind: "Shows", year: "2020" });
  await expect(page.getByText("Titles whose release year is unknown are hidden")).toBeVisible();
  await expect(page.locator("#page-info")).toContainText("titles)");
  // Poll: the grid repaints after the request, so one read can catch the old list half replaced.
  await expect.poll(async () => {
    const metas = await page.locator("#titles .meta").allTextContents();
    return metas.length > 0 && metas.every((m) => m === "Show · 2020");
  }).toBe(true);
});

test("sorting by hours puts the most viewed first and 'no data' last", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Sort by").selectOption({ label: "Hours viewed (most first)" });
  await expect(page.locator("#titles .name").first()).toHaveText("Suits (2011)");
  await expect(page.locator("#titles .hours").first()).toHaveText("1827.4 M h");
  // Within a narrower list, every title with hours comes before every "no data" one.
  await search(page, { q: "troll", kind: "Movies" });
  await expect(page.locator("#page-info")).toContainText("titles)");
  const labels = await page.locator("#titles .hours").allTextContents();
  const firstNoData = labels.indexOf("no data");
  expect(firstNoData).toBeGreaterThan(0);
  expect(labels.slice(0, firstNoData).every((l) => /h$/.test(l) && l !== "no data")).toBe(true);
  expect(labels.slice(firstNoData).every((l) => l === "no data")).toBe(true);
});

test("no matches says so instead of showing an empty page", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await search(page, { q: "zzzzqqqqxx" });
  await expect(page.locator("#status")).toHaveText("No titles match your search.");
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
});

test("a movie's detail shows year, runtime, hours and weeks in the top 10", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await search(page, { q: "Through My Window", kind: "Movies" });
  await page.getByRole("button", { name: /Through My Window/ }).first().click();
  const detail = page.getByRole("region", { name: "Through My Window" });
  await expect(detail).toBeVisible();
  await expect(page.getByRole("heading", { name: "Through My Window", level: 2 }).last()).toBeFocused();
  const fact = (k: string) => detail.locator("dt", { hasText: k }).locator("xpath=following-sibling::dd[1]");
  await expect(fact("Release year")).toHaveText("2022");
  await expect(fact("Runtime")).toHaveText("114 min");
  await expect(fact("Hours viewed")).toHaveText("41.7 M h");
  await expect(fact("Weeks in the top 10 (as published by Netflix)")).toHaveText("18");
});

test("a movie with no semi-annual data says 'no data', not 0 h", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Sort by").selectOption({ label: "Hours viewed (most first)" });
  await page.getByLabel("Kind").selectOption({ label: "Movies" });
  await page.getByLabel("Title contains").fill("Troll");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator("#titles .hours").filter({ hasText: "no data" }).first()).toBeVisible();
  await expect(page.locator("#titles .hours").filter({ hasText: /^0 h$/ })).toHaveCount(0);
});

test("a show's detail lists its seasons with hours per season", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await search(page, { q: "Bridgerton", kind: "Shows" });
  await page.getByRole("button", { name: /^Bridgerton/ }).first().click();
  const detail = page.getByRole("region", { name: "Bridgerton" });
  await expect(detail.getByText("Total hours viewed")).toBeVisible();
  await expect(detail.locator("dd", { hasText: "1456.8 M h" })).toBeVisible();
  const seasons = detail.locator(".seasons li");
  await expect(seasons.nth(0)).toHaveText("Season 1374.3 M h");
  await expect(seasons.nth(1)).toHaveText("Season 2348.7 M h");
  await expect(seasons.nth(2)).toHaveText("Season 3733.8 M h");
});

test("title buttons are real buttons reachable and operable with the keyboard", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByLabel("Title contains").fill("Through My Window");
  await page.keyboard.press("Enter"); // submit the form from the text box
  const open = page.getByRole("button", { name: /Through My Window/ }).first();
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#detail-body dd", { hasText: "41.7 M h" })).toBeVisible();
});

test("if the detail fails the person sees why", async ({ page }) => {
  await page.route("**/api/movies/*", (r) => r.fulfill({ status: 500, body: "boom" }));
  await page.goto("/");
  await ready(page);
  await search(page, { kind: "Movies" });
  await cards(page).first().getByRole("button").click();
  await expect(page.locator("#detail-status")).toHaveText("Could not load details.");
});

for (const scheme of ["light", "dark"] as const) {
  for (const [label, size] of [["desktop", { width: 1280, height: 800 }], ["mobile 360px", { width: 360, height: 800 }]] as const) {
    test(`filters and an open detail pass WCAG AA and do not scroll sideways: ${scheme}, ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await ready(page);
      await search(page, { q: "Bridgerton", kind: "Shows", year: "2020" });
      await page.getByRole("button", { name: /^Bridgerton/ }).first().click();
      await expect(page.locator(".seasons li").first()).toBeVisible();
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      );
      expect(violations).toEqual([]);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }
}

test("controls are big enough to tap on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await ready(page);
  for (const label of ["Title contains", "Kind", "Release year", "Sort by"]) {
    const box = await page.getByLabel(label).boundingBox();
    expect(box!.height, label).toBeGreaterThanOrEqual(44);
  }
  const first = await cards(page).first().getByRole("button").boundingBox();
  expect(first!.height).toBeGreaterThanOrEqual(44);
});
