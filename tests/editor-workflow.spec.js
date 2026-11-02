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

async function installTauriMock(page, sourceList = sources, probes = probeResults) {
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
        if (command === "select_source") return window.__selectedSources ?? sourceList;
        if (command === "probe_video") return probes[args.payload.filePath];
        if (command === "select_output") return { filePath: "C:\\output\\edited.mp4" };
        if (command === "export_video") return { outputPaths: [args.payload.outputPath] };
        if (command === "plugin:event|listen") return 1;
        if (command === "plugin:event|unlisten") return null;
        return null;
      }
    };
  }, { sourceList, probes });
}

async function installMediaMock(page) {
  await page.addInitScript(() => {
    const times = new WeakMap();
    const paused = new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() { return times.get(this) ?? 0; },
      set(value) { times.set(this, value); }
    });
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get() { return 4; } });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get() { return 12; } });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get() { return paused.get(this) ?? true; } });
    HTMLMediaElement.prototype.play = function play() {
      paused.set(this, false);
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      paused.set(this, true);
      this.dispatchEvent(new Event("pause"));
    };
  });
}

test("keeps the complete preview stage visible at desktop and mobile sizes", async ({ page }) => {
  await installTauriMock(page);
  await installMediaMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "メディアを選択" }).click();

  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    const stage = page.locator(".preview-stage");
    await stage.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const bounds = await stage.boundingBox();
    expect(bounds.height).toBeLessThanOrEqual(viewport.height * 0.6);
    expect(bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.locator("video.preview-video")).toHaveCSS("object-fit", "contain");
  }
});

test("imports a video onto the timeline and enables seeking and cutting", async ({ page }) => {
  await installTauriMock(page);
  await installMediaMock(page);
  await page.goto("/");
  await expect(page.locator(".time-total")).toHaveText("00:00:00");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(1);
  await expect(page.locator(".time-total")).toHaveText("00:00:12");

  await page.locator(".timeline-adjustment-handle").scrollIntoViewIfNeeded();
  const track = await page.locator(".timeline-track").boundingBox();
  const handle = await page.locator(".timeline-adjustment-handle").boundingBox();
  expect(track).not.toBeNull();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.75, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const video = page.locator("video.preview-video");
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(7);
  await expect(page.locator(".timeline-time-input")).not.toHaveValue("00:00:00");
  await expect(page.locator(".timeline-segment-block")).toHaveCount(1);

  await video.evaluate((element) => element.dispatchEvent(new Event("canplay")));
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "停止", exact: true })).toBeVisible();
  await video.evaluate((element) => {
    element.currentTime = 4;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:04");

  await page.getByRole("button", { name: "停止", exact: true }).click();
  await page.locator(".timeline-time-input").fill("00:00:06");
  await page.locator(".timeline-time-input").press("Enter");
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBe(6);

  await page.locator(".timeline-time-input").fill("00:00:05");
  await page.locator(".timeline-time-input").press("Enter");
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBe(5);
  await page.keyboard.press("s");
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
  await page.locator(".source-table tbody tr").first().getByRole("button", { name: "scene.mp4" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
});

test("keeps audio and images in source preview until manually added", async ({ page }) => {
  await installTauriMock(page, sources.slice(1));
  await installMediaMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0);
  await expect(page.locator(".time-total")).toHaveText("00:00:08");
  await page.locator(".timeline-time-input").fill("00:00:03");
  await page.locator(".timeline-time-input").press("Enter");
  await expect.poll(() => page.locator("audio.preview-audio").evaluate((element) => element.currentTime)).toBe(3);
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0);
});

test("appends all newly imported videos without duplicating them on reimport", async ({ page }) => {
  const secondVideo = { filePath: "C:\\media\\second.mp4", fileName: "second.mp4" };
  const thirdVideo = { filePath: "C:\\media\\third.mp4", fileName: "third.mp4" };
  await installTauriMock(page, [sources[0], secondVideo, sources[1]], {
    ...probeResults,
    [secondVideo.filePath]: { ...probeResults[sources[0].filePath], duration: 7 },
    [thirdVideo.filePath]: { ...probeResults[sources[0].filePath], duration: 6 }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
  await expect(page.locator(".time-total")).toHaveText("00:00:19");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
  await expect(page.locator(".time-total")).toHaveText("00:00:19");
  await page.evaluate((source) => { window.__selectedSources = [source]; }, thirdVideo);
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(3);
  await expect(page.locator(".time-total")).toHaveText("00:00:25");
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:19");
});

test("reports a video with an unknown duration instead of adding a clip", async ({ page }) => {
  await installTauriMock(page, [sources[0]], {
    [sources[0].filePath]: { ...probeResults[sources[0].filePath], duration: 0 }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0);
  await expect(page.getByText("この素材の長さを取得できません。")).toBeVisible();
});

test("keeps the expanded timeline lanes and playhead visible at different viewport widths", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "メディアを選択" }).click();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    const track = await page.locator(".timeline-track").boundingBox();
    const lanes = await page.locator(".timeline-lane").all();
    const scrubber = await page.locator(".timeline-scrubber").boundingBox();
    expect(track.height).toBe(180);
    expect(lanes).toHaveLength(2);
    for (const lane of lanes) {
      expect((await lane.boundingBox()).height).toBeGreaterThan(70);
    }
    expect(scrubber.height).toBeGreaterThanOrEqual(178);
  }
});

test("imports multiple media types and exports the edited timeline", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");

  await page.getByRole("button", { name: "メディアを選択" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("scene.mp4")).toBeVisible();
  await expect(page.getByText("voice.mp3")).toBeVisible();
  await expect(page.getByText("poster.png")).toBeVisible();

  const sourceRows = page.locator(".source-table tbody tr");
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
