import { useCallback, useEffect, useMemo } from "react";
import {
  clamp,
  createFullTimeline,
  insertSegmentsAt,
  removeRange,
  segmentDuration,
  splitSegmentsAtPreviewTime,
  splitSegmentsAtTimelinePositions,
  timelineDuration,
  formatVideoTime
} from "../lib/videoTimeline.js";
import { createHandleCopySelection } from "../lib/timelineOperations.js";
import { editorMessages } from "../lib/editorMessages.js";
import useLanguage from "./useLanguage.jsx";

// Owns copy, delete, cut, paste, insert, and segment reorder actions.
export default function useTimelineEditingActions({
  segments,
  selectionStart,
  selectionEnd,
  selectedRange,
  selectedDuration,
  playhead,
  totalDuration,
  clipboard,
  clipboardDuration,
  setClipboard,
  setClipBank,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setSelectedSegmentIndex,
  setCutMarkers,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  messages,
  addOperationLog
}) {
  const { t } = useLanguage();
  const handleCopy = useMemo(() => {
    const copySelection = createHandleCopySelection({
      segments,
      selectionStart,
      selectionEnd,
      setClipboard,
      setClipBank,
      setPlayheadWithPreview,
      messages
    });
    return () => {
      copySelection();
      addOperationLog("copy");
    };
  }, [addOperationLog, messages, segments, selectionEnd, selectionStart, setClipBank, setClipboard, setPlayheadWithPreview, t]);

  const handleDelete = useCallback(() => {
    if (selectedDuration === 0) {
      messages.setErrorMessage(editorMessages.noSelection);
      return;
    }
    pushUndoSnapshot();
    setSegments(removeRange(segments, selectedRange.start, selectedRange.end));
    setSelectionEnd(selectedRange.start);
    setPlayheadWithPreview(selectedRange.start);
    messages.setStatusMessage(t("selectionDeleted"));
    messages.clearErrorOnly();
    addOperationLog("delete");
  }, [addOperationLog, messages, pushUndoSnapshot, selectedDuration, selectedRange, segments, setPlayheadWithPreview, setSegments, setSelectionEnd, t]);

  const handleDeleteSegment = useCallback((index) => {
    if (index < 0 || index >= segments.length) return;
    pushUndoSnapshot();
    const nextSegments = segments.filter((_, segmentIndex) => segmentIndex !== index);
    const nextDuration = timelineDuration(nextSegments);
    setSegments(nextSegments);
    setSelectionStart((current) => clamp(current, 0, nextDuration));
    setSelectionEnd((current) => clamp(current, 0, nextDuration));
    setPlayheadWithPreview(clamp(playhead, 0, nextDuration));
    messages.setStatusMessage(t("partDeleted", index + 1));
    messages.clearErrorOnly();
    addOperationLog("delete");
  }, [addOperationLog, messages, playhead, pushUndoSnapshot, segments, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, t]);

  const handleCut = useCallback(() => {
    const splitTime = clamp(Number(playhead) || 0, 0, totalDuration);
    if (splitTime <= 0 || splitTime >= totalDuration) {
      messages.setErrorMessage(t("cannotCutAtEnds"));
      return;
    }
    const next = splitSegmentsAtTimelinePositions(segments, [splitTime]);
    if (!next) {
      messages.setErrorMessage(editorMessages.cantCutHere);
      return;
    }
    if (next.length === segments.length && next.every((segment, index) => segment.start === segments[index]?.start && segment.end === segments[index]?.end)) {
      messages.setErrorMessage(editorMessages.alreadyCutHere);
      return;
    }
    pushUndoSnapshot();
    setSegments(next);
    setCutMarkers((current) => [...current.slice(-99), splitTime]);
    setSelectionStart(splitTime);
    setSelectionEnd(splitTime);
    setPlayheadWithPreview(splitTime);
    messages.setStatusMessage(t("timelineSplit", formatVideoTime(splitTime)));
    messages.clearErrorOnly();
    addOperationLog("cut");
  }, [addOperationLog, messages, playhead, pushUndoSnapshot, segments, setCutMarkers, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, totalDuration, t]);

  const moveSegment = useCallback((index, direction) => {
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= segments.length) return;
    pushUndoSnapshot();
    const nextSegments = [...segments];
    [nextSegments[index], nextSegments[targetIndex]] = [nextSegments[targetIndex], nextSegments[index]];
    let nextStart = 0;
    for (let segmentIndex = 0; segmentIndex < targetIndex; segmentIndex += 1) {
      nextStart += segmentDuration(nextSegments[segmentIndex]);
    }
    const nextEnd = nextStart + segmentDuration(nextSegments[targetIndex]);
    setSegments(nextSegments);
    setSelectedSegmentIndex(targetIndex);
    setSelectionStart(nextStart);
    setSelectionEnd(nextEnd);
    setPlayheadWithPreview(nextStart, nextSegments);
    messages.setStatusMessage(t("partMoved", targetIndex + 1));
    messages.clearErrorOnly();
  }, [messages, pushUndoSnapshot, segments, setPlayheadWithPreview, setSegments, setSelectedSegmentIndex, setSelectionEnd, setSelectionStart, t]);

  const handlePaste = useCallback(() => {
    if (!clipboard.length) {
      messages.setErrorMessage(editorMessages.nothingToPaste);
      return;
    }
    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipboard);
    const insertedDuration = timelineDuration(clipboard);
    setSegments(nextSegments);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    messages.setStatusMessage(t("pastedDuration", formatVideoTime(insertedDuration)));
    messages.clearErrorOnly();
    addOperationLog("paste");
  }, [addOperationLog, clipboard, messages, playhead, pushUndoSnapshot, segments, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, t]);

  const handleInsertClip = useCallback((clip) => {
    if (!clip) return;
    const clipSegments = Array.isArray(clip) ? clip : [clip];
    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipSegments);
    const insertedDuration = timelineDuration(clipSegments);
    setSegments(nextSegments);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    messages.setStatusMessage(t("clipInsertedDuration", formatVideoTime(insertedDuration)));
    messages.clearErrorOnly();
  }, [messages, playhead, pushUndoSnapshot, segments, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, t]);

  return { handleCopy, handleDelete, handleDeleteSegment, handleCut, moveSegment, handlePaste, handleInsertClip };
}


// Owns timeline split and reset actions that coordinate editor state and notices.
export function useTimelineActions({
  segments,
  selectedDuration,
  selectedRange,
  previewVideoRef,
  previewCurrentTime,
  playhead,
  metadataDuration,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  setClipboard,
  pushUndoSnapshot,
  messages
}) {
  const { t } = useLanguage();
  const handleSplitAtPreview = useCallback(() => {
    if (!segments.length) {
      messages.setErrorMessage(t("chooseVideoFirst"));
      return;
    }

    if (selectedDuration > 0) {
      const next = splitSegmentsAtTimelinePositions(segments, [selectedRange.start, selectedRange.end]);
      if (!next) {
        messages.setErrorMessage(t("noSplitPointInSelection"));
        return;
      }
      if (next.length === segments.length && next.every((segment, index) => segment.start === segments[index]?.start && segment.end === segments[index]?.end)) {
        messages.setErrorMessage(t("alreadySegmentBoundary"));
        return;
      }
      pushUndoSnapshot();
      setSegments(next);
      setSelectionStart(selectedRange.start);
      setSelectionEnd(selectedRange.end);
      setPlayheadWithPreview(selectedRange.start);
      messages.setStatusMessage(t("selectionSplit", formatVideoTime(selectedRange.start), formatVideoTime(selectedRange.end)));
      messages.clearErrorOnly();
      return;
    }

    const sourceTime = Number(previewVideoRef.current?.currentTime) || previewCurrentTime;
    const result = splitSegmentsAtPreviewTime(segments, sourceTime, playhead);
    if (!result) {
      messages.setErrorMessage(t("cannotSplitAtPosition"));
      return;
    }

    pushUndoSnapshot();
    setSegments(result.nextSegments);
    setSelectionStart(result.timelineSplitTime);
    setSelectionEnd(result.timelineSplitTime);
    setPlayheadWithPreview(result.timelineSplitTime);
    messages.setStatusMessage(t("positionSplit", formatVideoTime(sourceTime)));
    messages.clearErrorOnly();
  }, [messages, playhead, previewCurrentTime, previewVideoRef, pushUndoSnapshot, selectedDuration, selectedRange, segments, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, t]);

  const handleResetTimeline = useCallback(() => {
    if (!metadataDuration) return;
    pushUndoSnapshot();
    setSegments(createFullTimeline(metadataDuration));
    setSelectionStart(0);
    setSelectionEnd(metadataDuration);
    setPlayheadWithPreview(0);
    setClipboard([]);
    messages.setStatusMessage(t("timelineReset"));
    messages.clearErrorOnly();
  }, [metadataDuration, messages, pushUndoSnapshot, setClipboard, setPlayheadWithPreview, setSegments, setSelectionEnd, setSelectionStart, t]);

  return { handleSplitAtPreview, handleResetTimeline };
}

// Keeps timeline selection and playhead values inside the current duration.
export function useTimelineDurationSync({
  totalDuration,
  setSelectionStart,
  setSelectionEnd,
  setPlayhead
}) {
  useEffect(() => {
    if (totalDuration <= 0) {
      setSelectionStart(0);
      setSelectionEnd(0);
      setPlayhead(0);
      return;
    }

    setSelectionStart((value) => clamp(value, 0, totalDuration));
    setSelectionEnd((value) => clamp(value, 0, totalDuration));
    setPlayhead((value) => clamp(value, 0, totalDuration));
  }, [setPlayhead, setSelectionEnd, setSelectionStart, totalDuration]);
}
