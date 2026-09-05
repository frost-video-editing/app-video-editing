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
- CPU: Intel i7 13700F
- GPU: NVidia GeForce RTX 3060 Ti
- RAM: 64GB
- Storage: NVMe SSD
- OS: Windows 11
- FFmpeg: 6.1
- frost-video-editing: v1.1.0

**Test Case**
- Source video: 4K, 60fps, 10 minutes
- Crop: 1920x1080
- Timeline: 5 segments
- Export: Separate-file MP4 with GPU encoding

**Results**

- Export time: 12 minutes
- Average CPU usage: 45%
- Average GPU usage: 70%
- Output file size: 2.5GB


## License

Free for personal and commercial use.
However, you need to contact the author and developer for commercial use.

Please see the [LICENSE](LICENSE) file for more details.


### Support

If you find this app useful, please consider supporting its development. 
Your support helps maintain and improve the app.

Support: <a href="https://github.com/sponsors/KFrost-Sponsor" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; cursor: pointer;">GitHub Sponsors</a>