# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor-workflow.spec.js >> imports multiple media types and exports the edited timeline
- Location: tests\editor-workflow.spec.js:39:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'メディアを選択' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - contentinfo [ref=e2]: © 2026 Frosty Editor. All rights reserved.
  - generic [ref=e5]:
    - generic [ref=e6]: "[plugin:vite:oxc] Transform failed with 5 errors: [PARSE_ERROR] Identifier `segmentDuration` has already been declared ╭─[ src/VideoEditorApp.jsx:1:27 ] │ 1 │ import { formatVideoTime, segmentDuration, timelineDuration, timelineSegmentAtTime, timelineSegmentStart, timelineToSourceTime } from \"./lib/videoTimeline.js\"; │ ───────┬─────── │ ╰───────── `segmentDuration` has already been declared here │ 5 │ segmentDuration, │ ───────┬─────── │ ╰───────── It can not be redeclared here ───╯ [PARSE_ERROR] Identifier `timelineDuration` has already been declared ╭─[ src/VideoEditorApp.jsx:1:44 ] │ 1 │ import { formatVideoTime, segmentDuration, timelineDuration, timelineSegmentAtTime, timelineSegmentStart, timelineToSourceTime } from \"./lib/videoTimeline.js\"; │ ────────┬─────── │ ╰───────── `timelineDuration` has already been declared here │ 6 │ timelineDuration, │ ────────┬─────── │ ╰───────── It can not be redeclared here ───╯ [PARSE_ERROR] Identifier `timelineSegmentAtTime` has already been declared ╭─[ src/VideoEditorApp.jsx:1:62 ] │ 1 │ import { formatVideoTime, segmentDuration, timelineDuration, timelineSegmentAtTime, timelineSegmentStart, timelineToSourceTime } from \"./lib/videoTimeline.js\"; │ ──────────┬────────── │ ╰──────────── `timelineSegmentAtTime` has already been declared here │ 7 │ timelineSegmentAtTime, │ ──────────┬────────── │ ╰──────────── It can not be redeclared here ───╯ [PARSE_ERROR] Identifier `timelineToSourceTime` has already been declared ╭─[ src/VideoEditorApp.jsx:1:107 ] │ 1 │ import { formatVideoTime, segmentDuration, timelineDuration, timelineSegmentAtTime, timelineSegmentStart, timelineToSourceTime } from \"./lib/videoTimeline.js\"; │ ──────────┬───────── │ ╰─────────── `timelineToSourceTime` has already been declared here │ 8 │ timelineToSourceTime, │ ──────────┬───────── │ ╰─────────── It can not be redeclared here ───╯ [PARSE_ERROR] Identifier `formatVideoTime` has already been declared ╭─[ src/VideoEditorApp.jsx:1:10 ] │ 1 │ import { formatVideoTime, segmentDuration, timelineDuration, timelineSegmentAtTime, timelineSegmentStart, timelineToSourceTime } from \"./lib/videoTimeline.js\"; │ ───────┬─────── │ ╰───────── `formatVideoTime` has already been declared here │ 10 │ formatVideoTime, │ ───────┬─────── │ ╰───────── It can not be redeclared here ────╯"
    - generic [ref=e7]: C:/Users/kenta/デスクトップ/Git/Public/app/app-video-editing/src/VideoEditorApp.jsx
    - generic [ref=e8]: at transformWithOxc (file:///C:/Users/kenta/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/Git/Public/app/app-video-editing/node_modules/vite/dist/node/chunks/node.js:4103:19) at TransformPluginContext.transform (file:///C:/Users/kenta/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/Git/Public/app/app-video-editing/node_modules/vite/dist/node/chunks/node.js:4174:26) at EnvironmentPluginContainer.transform (file:///C:/Users/kenta/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/Git/Public/app/app-video-editing/node_modules/vite/dist/node/chunks/node.js:30932:51) at async loadAndTransform (file:///C:/Users/kenta/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/Git/Public/app/app-video-editing/node_modules/vite/dist/node/chunks/node.js:20671:26) at async viteTransformMiddleware (file:///C:/Users/kenta/%E3%83%87%E3%82%B9%E3%82%AF%E3%83%88%E3%83%83%E3%83%97/Git/Public/app/app-video-editing/node_modules/vite/dist/node/chunks/node.js:25205:20)
    - generic [ref=e9]:
      - text: Click outside, press Esc key, or fix the code to dismiss.You can also disable this overlay by setting
      - code [ref=e10]: server.hmr.overlay
      - text: to
      - code [ref=e11]: "false"
      - text: in
      - code [ref=e12]: vite.config.js
      - text: .
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const sources = [
  4  |   { filePath: "C:\\media\\scene.mp4", fileName: "scene.mp4" },
  5  |   { filePath: "C:\\media\\voice.mp3", fileName: "voice.mp3" },
  6  |   { filePath: "C:\\media\\poster.png", fileName: "poster.png" }
  7  | ];
  8  | 
  9  | const probeResults = {
  10 |   "C:\\media\\scene.mp4": { duration: 12, width: 1920, height: 1080, hasAudio: true, mimeType: "video/mp4" },
  11 |   "C:\\media\\voice.mp3": { duration: 8, width: 0, height: 0, hasAudio: true, mimeType: "audio/mpeg" },
  12 |   "C:\\media\\poster.png": { duration: 0, width: 1280, height: 720, hasAudio: false, mimeType: "image/png" }
  13 | };
  14 | 
  15 | async function installTauriMock(page) {
  16 |   await page.addInitScript(({ sourceList, probes }) => {
  17 |     window.__testCalls = [];
  18 |     window.__TAURI_INTERNALS__ = {
  19 |       convertFileSrc(filePath) {
  20 |         return `http://127.0.0.1:5173/media/${encodeURIComponent(filePath)}`;
  21 |       },
  22 |       transformCallback() {
  23 |         return 1;
  24 |       },
  25 |       async invoke(command, args = {}) {
  26 |         window.__testCalls.push({ command, args });
  27 |         if (command === "select_source") return sourceList;
  28 |         if (command === "probe_video") return probes[args.payload.filePath];
  29 |         if (command === "select_output") return { filePath: "C:\\output\\edited.mp4" };
  30 |         if (command === "export_video") return { outputPaths: [args.payload.outputPath] };
  31 |         if (command === "plugin:event|listen") return 1;
  32 |         if (command === "plugin:event|unlisten") return null;
  33 |         return null;
  34 |       }
  35 |     };
  36 |   }, { sourceList: sources, probes: probeResults });
  37 | }
  38 | 
  39 | test("imports multiple media types and exports the edited timeline", async ({ page }) => {
  40 |   await installTauriMock(page);
  41 |   await page.goto("/");
  42 | 
> 43 |   await page.getByRole("button", { name: "メディアを選択" }).click();
     |                                                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
  44 |   await expect(page.locator(".source-table tbody tr")).toHaveCount(3);
  45 |   await expect(page.getByText("scene.mp4")).toBeVisible();
  46 |   await expect(page.getByText("voice.mp3")).toBeVisible();
  47 |   await expect(page.getByText("poster.png")).toBeVisible();
  48 | 
  49 |   const sourceRows = page.locator(".source-table tbody tr");
  50 |   await sourceRows.nth(0).getByRole("button", { name: "タイムラインへ追加" }).click();
  51 |   await sourceRows.nth(1).getByRole("button", { name: "タイムラインへ追加" }).click();
  52 |   await sourceRows.nth(2).getByRole("button", { name: "タイムラインへ追加" }).click();
  53 |   await expect(page.locator(".timeline-segment-block")).toHaveCount(3);
  54 | 
  55 |   await sourceRows.nth(1).getByRole("button", { name: "voice.mp3" }).click();
  56 |   await expect(sourceRows.nth(1)).toHaveClass(/source-row--active/);
  57 |   await expect(page.locator("audio.preview-audio")).toBeVisible();
  58 |   await expect(page.locator("audio.preview-audio")).toHaveAttribute("src", /voice\.mp3/);
  59 | 
  60 |   await sourceRows.nth(2).getByRole("button", { name: "poster.png" }).click();
  61 |   await expect(sourceRows.nth(2)).toHaveClass(/source-row--active/);
  62 |   await expect(page.locator("img.preview-image")).toBeVisible();
  63 | 
  64 |   await page.getByRole("button", { name: /コピー/ }).click();
  65 |   await page.getByRole("button", { name: /貼る/ }).click();
  66 |   await expect(page.locator(".timeline-segment-block")).toHaveCount(5);
  67 | 
  68 |   await page.getByRole("button", { name: "EN", exact: true }).click();
  69 |   await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();
  70 |   await page.getByRole("button", { name: "JP", exact: true }).click();
  71 |   await expect(page.getByRole("heading", { name: "メディアソース" })).toBeVisible();
  72 | 
  73 |   await page.locator(".export-panel button").click();
  74 |   await expect(page.locator(".export-confirm-overlay")).toBeVisible();
  75 |   await page.locator(".export-confirm-actions button").last().click();
  76 | 
  77 |   await expect.poll(async () => page.evaluate(() => window.__testCalls.filter(({ command }) => command === "export_video").length)).toBe(1);
  78 |   const exportCall = await page.evaluate(() => window.__testCalls.find(({ command }) => command === "export_video"));
  79 |   expect(exportCall.args.payload.segments).toHaveLength(5);
  80 |   expect(exportCall.args.payload.segments.map(({ mediaType }) => mediaType)).toEqual(["video", "video", "video", "audio", "image"]);
  81 | });
  82 | 
```