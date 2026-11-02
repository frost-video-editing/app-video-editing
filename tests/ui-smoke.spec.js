import { test, expect } from "@playwright/test";

test("renders the editor workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Start up this on desktop version")).toBeVisible();
  await expect(page.getByText("This app doesn't support browser usage as it relies on local FFmpeg execution.")).toBeVisible();
});