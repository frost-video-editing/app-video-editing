import { test, expect } from "@playwright/test";

test("renders the editor workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Electron で起動してください")).toBeVisible();
  await expect(page.getByText("このアプリはローカルの FFmpeg 実行を使うため、ブラウザ単体では動きません。")).toBeVisible();
});