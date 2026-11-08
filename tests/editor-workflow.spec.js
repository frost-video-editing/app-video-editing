import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

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

async function installTauriMock(page, sourceList = sources, probes = probeResults, mediaOrigin = "http://127.0.0.1:5173") {
  await page.addInitScript(({ sourceList, probes, mediaOrigin }) => {
    window.__testCalls = [];
    window.__TAURI_INTERNALS__ = {
      convertFileSrc(filePath) {
        return `${mediaOrigin}/media/${encodeURIComponent(filePath)}`;
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
  }, { sourceList, probes, mediaOrigin });
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
  await page.getByRole("button", { name: "Select Media" }).click();

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

test("fits actual landscape and portrait video frames inside the preview", async ({ page }) => {
  const videoSources = [
    { filePath: "C:\\media\\landscape.webm", fileName: "landscape.webm", width: 1920, height: 1080 },
    { filePath: "C:\\media\\portrait.webm", fileName: "portrait.webm", width: 1080, height: 1920 }
  ];
  const probes = Object.fromEntries(videoSources.map(({ filePath, width, height }) => [
    filePath,
    { duration: 1, width, height, hasAudio: false, mimeType: "video/webm" }
  ]));

  await installTauriMock(page, videoSources, probes);
  for (const source of videoSources) {
    const body = execFileSync(ffmpegPath, [
      "-v", "error", "-f", "lavfi", "-i", `testsrc=size=${source.width}x${source.height}:rate=1`,
      "-frames:v", "1", "-c:v", "libvpx", "-deadline", "realtime", "-f", "webm", "pipe:1"
    ]);
    await page.route(`**/media/${encodeURIComponent(source.filePath)}`, (route) => route.fulfill({
      status: 200,
      contentType: "video/webm",
      body
    }));
  }

  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  for (const source of videoSources) {
    await page.locator(".source-table tbody tr").getByRole("button", { name: source.fileName }).click();
    const video = page.locator("video.preview-video");
    await expect.poll(() => video.evaluate((element) => element.videoWidth)).toBe(source.width);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 700 }]) {
      await page.setViewportSize(viewport);
      const bounds = await video.evaluate((element) => {
        const videoRect = element.getBoundingClientRect();
        const stageRect = element.closest(".preview-stage").getBoundingClientRect();
        return {
          left: videoRect.left - stageRect.left,
          top: videoRect.top - stageRect.top,
          right: stageRect.right - videoRect.right,
          bottom: stageRect.bottom - videoRect.bottom
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.top).toBeGreaterThanOrEqual(-1);
      expect(bounds.right).toBeGreaterThanOrEqual(-1);
      expect(bounds.bottom).toBeGreaterThanOrEqual(-1);
      await expect(video).toHaveCSS("object-fit", "contain");
      await expect.poll(() => video.evaluate((element) => {
        const videoRect = element.getBoundingClientRect();
        const overlayRect = element.closest(".preview-stage").querySelector(".preview-crop-overlay").getBoundingClientRect();
        const scale = Math.min(videoRect.width / element.videoWidth, videoRect.height / element.videoHeight);
        const frameWidth = element.videoWidth * scale;
        const frameHeight = element.videoHeight * scale;
        return Math.max(
          Math.abs(overlayRect.left - (videoRect.left + (videoRect.width - frameWidth) / 2)),
          Math.abs(overlayRect.top - (videoRect.top + (videoRect.height - frameHeight) / 2)),
          Math.abs(overlayRect.width - frameWidth),
          Math.abs(overlayRect.height - frameHeight)
        );
      })).toBeLessThanOrEqual(2);
    }
  }
});

test("fits an actual image inside the preview", async ({ page }) => {
  const image = sources[2];
  await installTauriMock(page, [image]);
  await page.route(`**/media/${encodeURIComponent(image.filePath)}`, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="red"/></svg>'
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  const preview = page.locator("img.preview-image");
  await expect.poll(() => preview.evaluate((element) => element.naturalWidth)).toBe(1280);
  const bounds = await preview.evaluate((element) => {
    const imageRect = element.getBoundingClientRect();
    const stageRect = element.closest(".preview-stage").getBoundingClientRect();
    return {
      left: imageRect.left - stageRect.left,
      top: imageRect.top - stageRect.top,
      right: stageRect.right - imageRect.right,
      bottom: stageRect.bottom - imageRect.bottom
    };
  });
  for (const edge of Object.values(bounds)) expect(edge).toBeGreaterThanOrEqual(-1);
  await expect(preview).toHaveCSS("object-fit", "contain");
});

for (const mediaType of ["video", "audio"]) {
  test(`plays ${mediaType} audio from an authorized cross-origin media URL`, async ({ page }) => {
  const mediaSource = mediaType === "video"
    ? { filePath: "C:\\media\\sound.webm", fileName: "sound.webm" }
    : { filePath: "C:\\media\\sound.ogg", fileName: "sound.ogg" };
  await installTauriMock(page, [mediaSource], {
    [mediaSource.filePath]: {
      duration: 3,
      width: mediaType === "video" ? 320 : 0,
      height: mediaType === "video" ? 180 : 0,
      hasAudio: true,
      mimeType: mediaType === "video" ? "video/webm" : "audio/ogg"
    }
  }, "http://localhost:5173");
  await page.addInitScript(() => {
    const createSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function createMediaElementSource(element) {
      const source = createSource.call(this, element);
      const analyser = this.createAnalyser();
      source.connect(analyser);
      analyser.connect(this.destination);
      window.__testAudioAnalyser = analyser;
      return source;
    };
  });
  const input = mediaType === "video"
    ? ["-f", "lavfi", "-i", "testsrc=size=320x180:rate=10"]
    : [];
  const videoOutput = mediaType === "video" ? ["-c:v", "libvpx", "-deadline", "realtime"] : [];
  const body = execFileSync(ffmpegPath, [
    "-v", "error", ...input, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "3", ...videoOutput, "-c:a", "libopus", "-f", mediaType === "video" ? "webm" : "ogg", "pipe:1"
  ]);
  await page.route(`http://localhost:5173/media/${encodeURIComponent(mediaSource.filePath)}`, (route) => route.fulfill({
    status: 200,
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5173" },
    contentType: mediaType === "video" ? "video/webm" : "audio/ogg",
    body
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const analyser = window.__testAudioAnalyser;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  }), { timeout: 5000 }).toBeGreaterThan(0.01);
  });
}

test("imports a video onto the timeline and enables seeking and cutting", async ({ page }) => {
  await installTauriMock(page);
  await installMediaMock(page);
  await page.goto("/");
  await expect(page.locator(".time-total")).toHaveText("00:00:00");
  await page.getByRole("button", { name: "Select Media" }).click();
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
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await video.evaluate((element) => {
    element.currentTime = 4;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:04");

  await page.getByRole("button", { name: "Pause", exact: true }).click();
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
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0);
  await expect(page.locator(".time-total")).toHaveText("00:00:08");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:00.000 / 00:08.000");
  await page.locator(".timeline-time-input").fill("00:00:03");
  await page.locator(".timeline-time-input").press("Enter");
  await expect.poll(() => page.locator("audio.preview-audio").evaluate((element) => element.currentTime)).toBe(3);
  await expect(page.locator(".preview-transport__time")).toHaveText("00:03.000 / 00:08.000");
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
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
  await expect(page.locator(".time-total")).toHaveText("00:00:19");
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2);
  await expect(page.locator(".time-total")).toHaveText("00:00:19");
  await page.evaluate((source) => { window.__selectedSources = [source]; }, thirdVideo);
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(3);
  await expect(page.locator(".time-total")).toHaveText("00:00:25");
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:19");
});

test("aligns short video segments and seeking with the total timeline duration", async ({ page }) => {
  const secondVideo = { filePath: "C:\\media\\short.mp4", fileName: "short.mp4" };
  await installTauriMock(page, [sources[0], secondVideo], {
    [sources[0].filePath]: { ...probeResults[sources[0].filePath], duration: 0.4 },
    [secondVideo.filePath]: { ...probeResults[sources[0].filePath], duration: 0.2 }
  });
  await installMediaMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();

  await expect(page.locator(".time-total")).toHaveText("00:00:00.600");
  const blocks = page.locator(".timeline-lane--main .timeline-segment-block");
  await expect(blocks).toHaveCount(2);
  const lane = page.locator(".timeline-lane--main .timeline-segments");
  const laneBounds = await lane.boundingBox();
  const firstBounds = await blocks.nth(0).boundingBox();
  const secondBounds = await blocks.nth(1).boundingBox();
  expect(Math.abs(firstBounds.width / laneBounds.width - 2 / 3)).toBeLessThan(0.01);
  expect(Math.abs((secondBounds.x - laneBounds.x) / laneBounds.width - 2 / 3)).toBeLessThan(0.01);
  expect(Math.abs(secondBounds.x + secondBounds.width - (laneBounds.x + laneBounds.width))).toBeLessThan(2);

  const handle = page.locator(".timeline-adjustment-handle");
  await handle.scrollIntoViewIfNeeded();
  const handleBounds = await handle.boundingBox();
  await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + handleBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(laneBounds.x + laneBounds.width / 2, handleBounds.y + handleBounds.height / 2);
  await page.mouse.up();
  await expect.poll(() => page.locator("video.preview-video").evaluate((element) => element.currentTime)).toBeCloseTo(0.3, 2);
});

test("reduces timeline duration when video segments are deleted", async ({ page }) => {
  const secondVideo = { filePath: "C:\\media\\second.mp4", fileName: "second.mp4" };
  const thirdVideo = { filePath: "C:\\media\\third.mp4", fileName: "third.mp4" };
  await installTauriMock(page, [sources[0], secondVideo, thirdVideo], {
    ...probeResults,
    [secondVideo.filePath]: { ...probeResults[sources[0].filePath], duration: 7 },
    [thirdVideo.filePath]: { ...probeResults[sources[0].filePath], duration: 6 }
  });
  await installMediaMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".time-total")).toHaveText("00:00:25");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:00.000 / 00:25.000");
  await page.locator(".timeline-time-input").fill("00:00:05");
  await page.locator(".timeline-time-input").press("Enter");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:05.000 / 00:25.000");
  await page.locator(".timeline-table tbody tr").nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator(".time-total")).toHaveText("00:00:18");
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:05");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:05.000 / 00:18.000");
  await page.locator(".timeline-time-input").fill("00:00:17");
  await page.locator(".timeline-time-input").press("Enter");
  await page.locator(".timeline-table tbody tr").nth(1).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator(".time-total")).toHaveText("00:00:12");
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:12");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:12.000 / 00:12.000");
  await expect.poll(() => page.locator("video.preview-video").evaluate((element) => element.currentTime)).toBe(12);
  await page.locator(".timeline-table tbody tr").first().getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".time-total")).toHaveText("00:00:00");
  await expect(page.locator(".timeline-time-input")).toHaveValue("00:00:00");
  await expect(page.locator(".preview-transport__time")).toHaveText("00:00.000 / 00:00.000");
});

test("preserves video durations shorter than 100 milliseconds", async ({ page }) => {
  await installTauriMock(page, [sources[0]], {
    [sources[0].filePath]: { ...probeResults[sources[0].filePath], duration: 0.05 }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".time-total")).toHaveText("00:00:00.050");
});

test("reports a video with an unknown duration instead of adding a clip", async ({ page }) => {
  await installTauriMock(page, [sources[0]], {
    [sources[0].filePath]: { ...probeResults[sources[0].filePath], duration: 0 }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".timeline-segment-block")).toHaveCount(0);
  await expect(page.getByText("Unable to get the duration of this media.")).toBeVisible();
});

test("keeps the expanded timeline lanes and playhead visible at different viewport widths", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Select Media" }).click();
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

  await page.getByRole("button", { name: "Select Media" }).click();
  await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("scene.mp4")).toBeVisible();
  await expect(page.getByText("voice.mp3")).toBeVisible();
  await expect(page.getByText("poster.png")).toBeVisible();

  const sourceRows = page.locator(".source-table tbody tr");
  await sourceRows.nth(1).getByRole("button", { name: "Add to Timeline" }).click();
  await sourceRows.nth(2).getByRole("button", { name: "Add to Timeline" }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(3);

  await sourceRows.nth(1).getByRole("button", { name: "voice.mp3" }).click();
  await expect(sourceRows.nth(1)).toHaveClass(/source-row--active/);
  await expect(page.locator("audio.preview-audio")).toBeVisible();
  await expect(page.locator("audio.preview-audio")).toHaveAttribute("src", /voice\.mp3/);

  await sourceRows.nth(2).getByRole("button", { name: "poster.png" }).click();
  await expect(sourceRows.nth(2)).toHaveClass(/source-row--active/);
  await expect(page.locator("img.preview-image")).toBeVisible();

  await page.getByRole("button", { name: /Copy/ }).click();
  await page.getByRole("button", { name: /Paste/ }).click();
  await expect(page.locator(".timeline-segment-block")).toHaveCount(5);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();
  await page.getByRole("button", { name: "JP", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();

  await page.locator(".export-panel button").click();
  await expect(page.locator(".export-confirm-overlay")).toBeVisible();
  await page.locator(".export-confirm-actions button").last().click();

  await expect.poll(async () => page.evaluate(() => window.__testCalls.filter(({ command }) => command === "export_video").length)).toBe(1);
  const exportCall = await page.evaluate(() => window.__testCalls.find(({ command }) => command === "export_video"));
  expect(exportCall.args.payload.segments).toHaveLength(5);
  expect(exportCall.args.payload.segments.map(({ mediaType }) => mediaType)).toEqual(["video", "video", "video", "audio", "image"]);
});
