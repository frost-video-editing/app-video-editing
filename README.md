# Frosty Studio

Frost Studio is a desktop video editor for crop, trim, and timeline editing. Built with Tauri + React + Go + FFmpeg. All processing happens locally—no cloud uploads, no data transmission. Open source for transparency.


## Why this application?

Commercial video editors often upload files to the cloud, requiring long waits and raising privacy concerns about hidden data transfers. This app runs entirely on your machine using a locally bundled FFmpeg, keeping your video files and workflows private and fast.


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

- **Crop** — Drag a crop area on the preview or enter numeric coordinates.
- **Timeline editing** — Cut, delete, copy, and paste video segments to arrange them.
- **Separate-file export** — Each timeline item is saved as its own MP4.
- **Audio control** — Adjust volume (0–200%) and enable simple normalization.
- **Crop-resolution choice** — Export at original resolution or at the crop's actual resolution.
- **Hardware encoding** — Auto-detects NVIDIA, Intel, or AMD H.264 encoders. Falls back to CPU if unavailable.
- **Progress window** — Shows real-time export status with per-segment progress.


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

- **Can I export audio only?** — Yes. Use the **Audio only** button on a timeline segment, or enable **Export audio only** in the export confirmation.
- **Does it support subtitles?** — Not currently. Subtitle editing and subtitle burning are not supported yet.
- **Is there a timeline zoom?** — Not currently. The timeline supports cutting, copying, pasting, deleting, and rearranging segments.
- **Can I drag-and-drop files?** — Not currently. Use the source video picker to select a file. Timeline segments can be rearranged by dragging them.


## Export

Crop operations require re-encoding. For CPU encoding, the app uses H.264 with `libx264 -fast -crf 18`. When a GPU encoder is available, it uses a faster, quality-balanced setting. On systems with 4+ cores, up to two timeline items are processed concurrently, with threads divided to avoid CPU contention.

Disabling **Keep original resolution after crop** exports at the crop's actual resolution—faster, smaller files, and sharper results when upscaling is not needed.


## Development Setup

```bash
npm install
npm run build:exporter
npm run dev
```


## Workflow

1. Select a source video.
2. Set crop, preview, and cut the timeline.
3. Use copy/delete/paste to arrange segments.
4. Export to MP4 (one file per timeline item).


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


## License

Free for personal and commercial use.
However, you need to contact the author and developer for commercial use.

Please see the [LICENSE](LICENSE) file for more details.


### Support

If you find this app useful, please consider supporting its development. 
Your support helps maintain and improve the app.

Support: <a href="https://github.com/sponsors/KFrost-Sponsor" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; cursor: pointer;">GitHub Sponsors</a>