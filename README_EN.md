# VideoEditing – Local Video Editor

A local-first video editor built with Electron + React + FFmpeg. Everything is processed on your machine.

## Features

- **Crop** — Trim the image with editable left/top/right/bottom margins
- **Cut** — Extract a selected range from the timeline
- **Paste** — Insert copied segments at the current position
- **Partial delete** — Remove a selected range from the timeline
- **Export** — Render the final composition to MP4

## Development Setup

```bash
npm install
npm run dev
```

## Workflow

1. Choose a source video.
2. Set crop values and the cut range.
3. Use copy/cut/delete/paste to shape the timeline.
4. Choose output path and export.
