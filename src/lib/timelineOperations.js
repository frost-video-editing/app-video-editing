/**
 * Timeline operation handlers for video editing.
 * Handles cut, copy, paste, delete, and segment manipulation operations.
 */

import {
  extractRange,
  removeRange,
  insertSegmentsAt,
  timelineDuration,
  segmentDuration,
  splitSegmentsAtTimelinePositions,
  splitSegmentsAtPreviewTime,
  createFullTimeline,
} from './videoTimeline.js';
import { formatVideoTime } from './videoTimeline.js';

/**
 * Copy selected timeline range to clipboard
 */
export function createHandleCopySelection({
  segments,
  selectionStart,
  selectionEnd,
  setClipboard,
  setClipBank,
  setPlayheadWithPreview,
  messages,
}) {
  return () => {
    if (selectionStart === selectionEnd) {
      messages.setErrorMessage(editorMessages.nothingToCopy);
      return;
    }

    const copied = extractRange(segments, selectionStart, selectionEnd);
    setClipboard(copied);
    setClipBank((current) => [copied, ...current].slice(0, 20));
    setPlayheadWithPreview(selectionEnd);
    messages.setStatusMessage(
      `範囲をコピーしました。長さ ${formatVideoTime(timelineDuration(copied))}`
    );
    messages.clearErrorOnly();
  };
}

/**
 * Delete selected timeline range
 */
export function createHandleDeleteSelection({
  segments,
  selectionStart,
  selectionEnd,
  playhead,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  clamp,
  messages,
}) {
  return () => {
    if (selectionStart === selectionEnd) {
      messages.setErrorMessage("削除する範囲を指定してください。");
      return;
    }

    pushUndoSnapshot();
    const nextSegments = removeRange(segments, selectionStart, selectionEnd);
    setSegments(nextSegments);
    const nextEnd = timelineDuration(nextSegments);
    setSelectionStart(clamp(selectionStart, 0, nextEnd));
    setSelectionEnd(clamp(selectionEnd, 0, nextEnd));
    setPlayheadWithPreview(clamp(playhead, 0, nextEnd));
    messages.setStatusMessage("選択範囲を削除しました。");
    messages.clearErrorOnly();
  };
}

/**
 * Delete a specific segment by index
 */
export function createHandleDeleteSegment({
  segments,
  playhead,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  clamp,
  messages,
}) {
  return (index) => {
    if (index < 0 || index >= segments.length) {
      return;
    }

    pushUndoSnapshot();
    const nextSegments = segments.filter((_, segmentIndex) => segmentIndex !== index);
    const nextDuration = timelineDuration(nextSegments);
    setSegments(nextSegments);
    setSelectionStart((current) => clamp(current, 0, nextDuration));
    setSelectionEnd((current) => clamp(current, 0, nextDuration));
    setPlayheadWithPreview(clamp(playhead, 0, nextDuration));
    messages.setStatusMessage(`パーツ ${index + 1} を削除しました。`);
    messages.clearErrorOnly();
  };
}

/**
 * Cut (split) at current playhead position
 */
export function createHandleCut({
  segments,
  playhead,
  totalDuration,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  setCutMarkers,
  pushUndoSnapshot,
  clamp,
  messages,
}) {
  return () => {
    const splitTime = clamp(Number(playhead) || 0, 0, totalDuration);
    if (splitTime <= 0 || splitTime >= totalDuration) {
      messages.setErrorMessage(editorMessages.cantCutAtEnds);
      return;
    }

    const next = splitSegmentsAtTimelinePositions(segments, [splitTime]);
    if (!next) {
      messages.setErrorMessage(editorMessages.cantCutHere);
      return;
    }

    if (
      next.length === segments.length &&
      next.every(
        (segment, index) =>
          segment.start === segments[index]?.start && segment.end === segments[index]?.end
      )
    ) {
      messages.setErrorMessage(editorMessages.alreadyCutHere);
      return;
    }

    pushUndoSnapshot();
    setSegments(next);
    setCutMarkers((current) => [...current.slice(-99), splitTime]);

    setSelectionStart(splitTime);
    setSelectionEnd(splitTime);
    setPlayheadWithPreview(splitTime);
    messages.setStatusMessage(
      `${formatVideoTime(splitTime)} でタイムラインを分割しました。`
    );
    messages.clearErrorOnly();
  };
}

/**
 * Paste clipboard contents at playhead position
 */
export function createHandlePaste({
  segments,
  playhead,
  clipboard,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  messages,
}) {
  return () => {
    if (!clipboard.length) {
      messages.setErrorMessage(editorMessages.nothingToPaste);
      return;
    }

    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipboard);
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(clipboard);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    messages.setStatusMessage(
      `貼り付けました。長さ ${formatVideoTime(insertedDuration)} を挿入しました。`
    );
    messages.clearErrorOnly();
  };
}

/**
 * Insert a clip from clipBank at playhead position
 */
export function createHandleInsertClip({
  segments,
  playhead,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  messages,
}) {
  return (clip) => {
    if (!clip) return;
    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(
      segments,
      playhead,
      Array.isArray(clip) ? clip : [clip]
    );
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(Array.isArray(clip) ? clip : [clip]);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    messages.setStatusMessage(
      `クリップを挿入しました。長さ ${formatVideoTime(insertedDuration)}`
    );
    messages.clearErrorOnly();
  };
}

/**
 * Reset timeline to full duration
 */
export function createHandleResetTimeline({
  metadata,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  setClipboard,
  pushUndoSnapshot,
  createFullTimelineFunc,
  messages,
}) {
  return () => {
    if (!metadata.duration) {
      return;
    }
    pushUndoSnapshot();
    setSegments(createFullTimelineFunc(metadata.duration));
    setSelectionStart(0);
    setSelectionEnd(metadata.duration);
    setPlayheadWithPreview(0);
    setClipboard([]);
    messages.setStatusMessage("タイムラインを初期状態に戻しました。");
    messages.clearErrorOnly();
  };
}

/**
 * Split at selected timeline range boundaries
 */
export function createHandleSplitAtSelection({
  segments,
  selectedRange,
  selectedDuration,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  messages,
}) {
  return () => {
    if (selectedDuration <= 0) {
      const splitTimes = [selectedRange.start, selectedRange.end];
      const next = splitSegmentsAtTimelinePositions(segments, splitTimes);
      if (!next) {
        messages.setErrorMessage("選択範囲で分割できる場所がありません。");
        return;
      }
      if (
        next.length === segments.length &&
        next.every((s, i) => s.start === segments[i]?.start && s.end === segments[i]?.end)
      ) {
        messages.setErrorMessage("選択範囲は既にセグメント境界に分かれています。");
        return;
      }

      pushUndoSnapshot();
      setSegments(next);
      setSelectionStart(selectedRange.start);
      setSelectionEnd(selectedRange.end);
      setPlayheadWithPreview(selectedRange.start);
      messages.setStatusMessage(
        `選択範囲 ${formatVideoTime(selectedRange.start)} - ${formatVideoTime(
          selectedRange.end
        )} で分割しました。`
      );
      messages.clearErrorOnly();
      return;
    }

    // Handle preview-based split (legacy fallback)
  };
}

/**
 * Split at current preview playhead time
 */
export function createHandleSplitAtPreviewTime({
  segments,
  playhead,
  previewCurrentTime,
  previewVideoRef,
  setSegments,
  setSelectionStart,
  setSelectionEnd,
  setPlayheadWithPreview,
  pushUndoSnapshot,
  messages,
}) {
  return () => {
    const sourceTime = Number(previewVideoRef.current?.currentTime) || previewCurrentTime;
    const result = splitSegmentsAtPreviewTime(segments, sourceTime, playhead);

    if (!result) {
      messages.setErrorMessage(
        "現在の画面位置では分割できません。セグメントの内側で停止してください。"
      );
      return;
    }

    pushUndoSnapshot();
    setSegments(result.nextSegments);
    setSelectionStart(result.timelineSplitTime);
    setSelectionEnd(result.timelineSplitTime);
    setPlayheadWithPreview(result.timelineSplitTime);
    messages.setStatusMessage(
      `画面の位置 ${formatVideoTime(sourceTime)} で分割しました。`
    );
    messages.clearErrorOnly();
  };
}
