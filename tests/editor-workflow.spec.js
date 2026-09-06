import { test, expect } from "@playwright/test";

const sources = [
  { filePath: "C:\\media\\scene.mp4", fileName: "scene.mp4" },
  { filePath: "C:\\media\\voice.mp3", fileName: "voice.mp3" },
  { filePath: "C:\\media\\poster.png", fileName: "poster.png" }
];

const probeResults = {
  "C:\\media\\scene.mp4": { duration: 12, width: 1920, height: 1080, hasAudio: true, mimeType: "video/mp4" },
  "C:\\media\\voice.mp3": { duration: 8, width: 0, height: 0, hasAudio: true, mimeType: "audio/mpeg" },
  "C:\\media\\poster.png": { duration: 0, width: 1280, height: 720, hasAudio: false, mimeType: "image/png" }
};

async function installTauriMock(page) {
  await page.addInitScript(({ sourceList, probes }) => {
    window.__testCalls = [];
    window.__TAURI_INTERNALS__ = {
      convertFileSrc(filePath) {
        return `http://127.0.0.1:5173/media/${encodeURIComponent(filePath)}`;
      },
      transformCallback() {
        return 1;
      },
      async invoke(command, args = {}) {
        window.__testCalls.push({ command, args });
        if (command === "select_source") return sourceList;
        if (command === "probe_video") return probes[args.payload.filePath];
        if (command === "select_output") return { filePath: "C:\\output\\edited.mp4" };
        if (command === "export_video") return { outputPaths: [args.payload.outputPath] };
        if (command === "plugin:event|listen") return 1;
        if (command === "plugin:event|unlisten") return null;
        return null;
      }
    };
  }, { sourceList: sources, probes: probeResults });
}

test("imports multiple media types and exports the edited timeline", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");

  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("scene.mp4")).toBeVisible();
  await expect(page.getByText("voice.mp3")).toBeVisible();
  await expect(page.getByText("poster.png")).toBeVisible();

  const sourceRows = page.locator(".source-table tbody tr");
  await sourceRows.nth(0).getByRole("button", { name: "タイムラインへ追加" }).click();
  await sourceRows.nth(1).getByRole("button", { name: "タイムラインへ追加" }).click();
  await sourceRows.nth(2).getByRole("button", { name: "タイムラインへ追加" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(3);

  await sourceRows.nth(1).getByRole("button", { name: "voice.mp3" }).click();
  await expect(sourceRows.nth(1)).toHaveClass(/source-row--active/);
  await expect(page.locator("audio.preview-audio")).toBeVisible();
  await expect(page.locator("audio.preview-audio")).toHaveAttribute("src", /voice\.mp3/);

  await sourceRows.nth(2).getByRole("button", { name: "poster.png" }).click();
  await expect(sourceRows.nth(2)).toHaveClass(/source-row--active/);
  await expect(page.locator("img.preview-image")).toBeVisible();

  await page.getByRole("button", { name: /コピー/ }).click();
  await page.getByRole("button", { name: /貼る/ }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(5);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();
  await page.getByRole("button", { name: "JP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "メディアソース" })).toBeVisible();

  await page.locator(".export-panel button").click();
  await expect(page.locator(".export-confirm-overlay")).toBeVisible();
  await page.locator(".export-confirm-actions button").last().click();

  await expect.poll(async () => page.evaluate(() => window.__testCalls.filter(({ command }) => command === "export_video").length)).toBe(1);
  const exportCall = await page.evaluate(() => window.__testCalls.find(({ command }) => command === "export_video"));
  expect(exportCall.args.payload.segments).toHaveLength(5);
  expect(exportCall.args.payload.segments.map(({ mediaType }) => mediaType)).toEqual(["video", "video", "video", "audio", "image"]);
});
