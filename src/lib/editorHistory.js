import { sourceToTimelineTime, timelineDuration } from "./videoTimeline.js";

// Returns shallow copies of timeline segments so history snapshots remain immutable.
export function cloneSegments(segments) {
  return (segments || []).map((segment) => ({ ...segment }));
}

// Converts stored cut markers into positions usable by a restored timeline.
export function restoreCutMarkers(markers, segments) {
  const totalDuration = timelineDuration(segments);
  return (markers || []).map((marker) => {
    const raw = marker && typeof marker === "object"
      ? { start: Number(marker.start) || 0, end: Number(marker.end) || 0 }
      : { start: Number(marker) || 0, end: Number(marker) || 0 };
    const mappedStart = sourceToTimelineTime(segments, raw.start);
    const mappedEnd = sourceToTimelineTime(segments, raw.end);
    return {
      start: mappedStart !== null && mappedStart <= totalDuration ? mappedStart : raw.start,
      end: mappedEnd !== null && mappedEnd <= totalDuration ? mappedEnd : raw.end
    };
  });
}

// Copies the editor values that must be restored by a single undo operation.
export function createEditorSnapshot(editorState) {
  return {
    segments: cloneSegments(editorState.segments),
    selectionStart: editorState.selectionStart,
    selectionEnd: editorState.selectionEnd,
    playhead: editorState.playhead,
    clipboard: cloneSegments(editorState.clipboard),
    clipBank: (editorState.clipBank || []).map((clip) => cloneSegments(clip)),
    cutMarkers: (editorState.cutMarkers || []).map((marker) => ({ ...marker })),
    crop: { ...editorState.crop },
    audioGainPercent: Number(editorState.audioGainPercent || 100),
    audioNormalize: Boolean(editorState.audioNormalize),
    isCropPreviewLocked: Boolean(editorState.isCropPreviewLocked),
    outputPath: editorState.outputPath,
    previewCurrentTime: editorState.previewCurrentTime
  };
}

// Rebuilds a safe, independent state object from an undo snapshot.
export function restoreEditorSnapshot(snapshot) {
  const segments = cloneSegments(snapshot?.segments);
  return {
    segments,
    selectionStart: Number(snapshot?.selectionStart) || 0,
    selectionEnd: Number(snapshot?.selectionEnd) || 0,
    playhead: Number(snapshot?.playhead) || 0,
    clipboard: cloneSegments(snapshot?.clipboard),
    clipBank: (snapshot?.clipBank || []).map((clip) => cloneSegments(clip)),
    cutMarkers: restoreCutMarkers(snapshot?.cutMarkers, segments),
    crop: { ...snapshot?.crop },
    audioGainPercent: Number(snapshot?.audioGainPercent || 100),
    audioNormalize: Boolean(snapshot?.audioNormalize),
    isCropPreviewLocked: Boolean(snapshot?.isCropPreviewLocked),
    outputPath: snapshot?.outputPath || "",
    previewCurrentTime: Number(snapshot?.previewCurrentTime) || 0
  };
}