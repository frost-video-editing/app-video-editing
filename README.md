# Frosty Studio

Frost Studio is a desktop media editor for video, audio, and image sources. Built with Tauri + React + Go + FFmpeg. All processing happens locally—no cloud uploads, no data transmission. Open source for transparency.


## Technology Stack

| Technology | Description |
| --- | --- |
| **Tauri** | Desktop application shell and native system integration. |
| **React** | Frontend UI components and editor state management. |
| **JavaScript** | Frontend application logic. |
| **Vite** | Frontend development server and production bundler. |
| **Go** | Native media export process orchestration. |
| **FFmpeg / FFprobe** | Local media probing, processing, encoding, and export. |
| **Playwright** | Browser-based UI and workflow testing. |


## Why this application?

Commercial media editors often upload files to the cloud, requiring long waits and raising privacy concerns about hidden data transfers. This app runs entirely on your machine using a locally bundled FFmpeg, keeping your media files and workflows private and fast.


## Why Go instead of Rust?

Go was chosen for the native video-processing component because:

- **FFmpeg integration** — The exporter coordinates FFmpeg processes and exchanges JSON with Electron.
- **Concurrent exports** — Goroutines make it straightforward to export multiple timeline segments concurrently.
- **Minimal implementation overhead** — The standard library covers everything the exporter needs: process control, file operations, JSON, and synchronization.
- **Easy distribution** — Go produces cross-platform single binaries, simplifying maintenance and distribution on Windows and macOS.

Rust would also be a strong choice, but Go was a better fit for this project because:

- **FFmpeg does the heavy work** — Fine-grained memory control and maximum CPU performance were not the primary bottlenecks because FFmpeg performs the video encoding.
- **Less complexity** — Go provides the implementation and build workflow we needed without adding unnecessary complexity.


## Features

| Feature | Description |
| --- | --- |
| **Crop** | Drag a crop area on the preview or enter numeric coordinates.
| **Media sources** | Import video, audio, and image files into one source library.
| **Preview** | Preview video, audio, and image sources.
| **Timeline editing** | Cut, delete, copy, and paste media segments to arrange them.
| **Multi-source timeline** | Combine segments from multiple source files in one timeline.
| **Separate-file export** | Each timeline item is saved as its own output file.
| **Audio control** | Adjust volume (0–200%) and enable simple normalization.
| **Crop-resolution choice** | Export at original resolution or at the crop's actual resolution.
| **Hardware encoding** | Auto-detects NVIDIA, Intel, or AMD H.264 encoders. Falls back to CPU if unavailable.
| **Progress window** | Shows real-time export status with per-segment progress.


## Operation Logs

Operation logs are stored locally in the application's WebView `localStorage`. They are not uploaded to a server and are not written by the Go exporter.

- Log data key: `videoEditor.operationLogs`
- Log settings key: `videoEditor.operationLogSettings`
- Maximum retained logs: 500 entries
- Clearing logs from the log viewer removes the stored log data

On Windows, the WebView2 data is normally under:

```text
C:\Users\<ユーザー名>\AppData\Local\com.frost.videoeditor\EBWebView\Default\Local Storage\leveldb\
```

The exact folder can vary by Tauri/WebView2 runtime version. The logs are stored in LevelDB files rather than a directly readable `operationLogs.json` file.


## FAQ

- **Can I use audio and image files?** — Yes. Audio and image sources can be previewed, added to the timeline, and included in exports. Images use a five-second default duration.
- **Can I export audio only?** — Yes. Use the **Audio only** button on a timeline segment, or enable **Export audio only** in the export confirmation.
- **Does it support subtitles?** — Not currently. Subtitle editing and subtitle burning are not supported yet.
- **Is there a timeline zoom?** — Not currently. The timeline supports cutting, copying, pasting, deleting, and rearranging segments.
- **Can I drag-and-drop files?** — Not currently. Use the media picker to select files. Timeline segments can be rearranged by dragging them.


## Export

Crop operations require re-encoding. The Standard CPU profile uses H.264 with `libx264 -preset veryfast -crf 18`. The High quality profile uses `libx264 -preset slow -crf 14`, or a quality target of 15 with a supported NVIDIA, Intel, or AMD H.264 encoder. The encoder-specific quality scales are not directly comparable. High quality can take longer and produce larger files; it is still lossy and does not restore detail missing from the source. When neither video nor audio processing is needed, eligible exports copy the original streams without re-encoding. On systems with 4+ cores, up to two cropped timeline items are processed concurrently, with threads divided to avoid CPU contention.

Disabling **Keep original resolution after crop** exports at the crop's actual resolution—faster, smaller files, and sharper results when upscaling is not needed.


## Development Setup

```bash
npm install
npm run build:exporter
npm run react:start
```

If a Tauri build fails after moving the project or because of stale Cargo build metadata, stop running builds and run `npm run tauri:clean` from the project root. This removes generated Cargo build outputs from the configured target directory; the next Tauri build will recreate them and take longer.


## Workflow

1. Select one or more video, audio, or image sources.
2. Preview the media, add sources to the timeline, and arrange segments.
3. Set crop where applicable, then cut, copy, delete, or paste timeline ranges.
4. Export the timeline (one output file per timeline item).

Newly imported videos are appended to the timeline automatically and will be included in exports. Audio and images remain in the media library until added to the timeline. When the timeline is empty, the preview playhead can seek through a loaded video or audio source without adding it.
The default cut shortcut (`S`) requires a segment on the timeline and a playhead position between its ends. Shortcuts are ignored while typing in an input field.


## Benchmark

**Environment**

- **Reference 1**

| Item | Value |
| --- | --- |
| CPU | Intel i7 13700F |
| GPU | NVidia GeForce RTX 3060 Ti |
| RAM | 64GB |
| Storage | NVMe SSD |
| OS | Windows 11 |
| FFmpeg | 6.1 |
| frost-video-editing | v1.3.0 |


**Reference Export Record**

- **Reference 1 Export Record**

This video export completed in **1 minute and 25.97 seconds**.

**Settings**

| Item | Value |
| --- | --- |
| Output resolution | 1920x1080 |
| Export profile | Standard |
| Preserve original resolution after cropping | Enabled |
| Scaling algorithm | High quality (Lanczos) |
| Audio | Yes |
| Crop | 0% on all edges |
| Audio gain | 100% |
| Audio normalization | Disabled |


**Export Details**

| Item | Value |
| --- | --- |
| Segment count | 10 |
| Output file count | 10 |
| Output duration by file | `#1 00:11:56 / #2 00:13:14 / #3 00:10:37 / #4 00:17:38 / #5 00:18:38 / #6 00:18:02 / #7 00:19:51 / #8 00:18:38 / #9 00:18:26 / #10 00:12:43` |
| Total output duration | 2 hours 39 minutes and 49 seconds |
| Source video duration | 2 hours 39 minutes and 49 seconds |
| Export time | 1 minute and 25.97 seconds |


## **License**

Free for personal and commercial use.
However, you need to contact the author and developer for commercial use.


### **Support**

If you find this app useful, please consider supporting its development. 
Your support helps maintain and improve the app.

<a href="https://www.buymeacoffee.com/kfrost533" target="_blank"><img src="./img/buyMeATea.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>