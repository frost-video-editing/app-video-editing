# VideoEditing – Local Video Editor

A desktop video editor for crop, trim, and timeline editing. Built with Electron + React + FFmpeg. All processing happens locally—no cloud uploads, no data transmission. Open source for transparency.

## Why this application?

Commercial video editors often upload files to the cloud, requiring long waits and raising privacy concerns about hidden data transfers. This app runs entirely on your machine using a locally bundled FFmpeg, keeping your video files and workflows private and fast.

## Features

- **Crop** — Drag a crop area on the preview or enter numeric coordinates.
- **Timeline editing** — Cut, delete, copy, and paste video segments to arrange them.
- **Separate-file export** — Each timeline item is saved as its own MP4.
- **Audio control** — Adjust volume (0–200%) and enable simple normalization.
- **Crop-resolution choice** — Export at original resolution or at the crop's actual resolution.
- **Hardware encoding** — Auto-detects NVIDIA, Intel, or AMD H.264 encoders. Falls back to CPU if unavailable.
- **Progress window** — Shows real-time export status with per-segment progress.

## Export

Crop operations require re-encoding. For CPU encoding, the app uses H.264 with `libx264 -fast -crf 18`. When a GPU encoder is available, it uses a faster, quality-balanced setting. On systems with 4+ cores, up to two timeline items are processed concurrently, with threads divided to avoid CPU contention.

Disabling **Keep original resolution after crop** exports at the crop's actual resolution—faster, smaller files, and sharper results when upscaling is not needed.

## Development Setup

```bash
npm install
npm run dev
```

## Workflow

1. Select a source video.
2. Set crop, preview, and cut the timeline.
3. Use copy/delete/paste to arrange segments.
4. Export to MP4 (one file per timeline item).

## License

Free for personal and commercial use.
However, you need to contact the author and developer for commercial use.

Please see the [LICENSE](LICENSE) file for more details.