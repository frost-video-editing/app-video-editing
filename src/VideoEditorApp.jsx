import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  clamp,
  createFullTimeline,
  extractRange,
  insertSegmentsAt,
  removeRange,
  segmentDuration,
  timelineDuration,
  normalizeRange
} from "./lib/videoTimeline.js";
import TimelineVisualizer from "./components/TimelineVisualizer.jsx";
import LoadingIndicator from "./components/LoadingIndicator.jsx";
import CropOverlay, { computeSquareDraft, computeCropPercentFromSquare } from "./components/button/crop.jsx";

const emptyCrop = { left: 0, top: 0, right: 0, bottom: 0 };

function formatCrop(crop) {
  const parts = [];
  if (crop.left > 0) parts.push(`左 ${crop.left}%`);
  if (crop.top > 0) parts.push(`上 ${crop.top}%`);
  if (crop.right > 0) parts.push(`右 ${crop.right}%`);
  if (crop.bottom > 0) parts.push(`下 ${crop.bottom}%`);
  return parts.length ? parts.join(" / ") : "全体をそのまま出力";
}

function formatVideoTime(totalSeconds) {
  const total = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const fraction = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}

function normalizeCropInput(nextCrop) {
  return {
    left: clamp(Number(nextCrop.left) || 0, 0, 45),
    top: clamp(Number(nextCrop.top) || 0, 0, 45),
    right: clamp(Number(nextCrop.right) || 0, 0, 45),
    bottom: clamp(Number(nextCrop.bottom) || 0, 0, 45)
  };
}

export default function VideoEditorApp() {

  const editorApi = typeof window !== "undefined" ? window.editorApi : null;
  const loadStartTimeRef = useRef(null);
  const loadCompletionTimeoutRef = useRef(null);
  const exportStartTimeRef = useRef(null);
  const previewStageRef = useRef(null);
  const previewVideoRef = useRef(null);

  const [sourcePath, setSourcePath] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");

  const [metadata, setMetadata] = useState({ duration: 0, width: 0, height: 0, hasAudio: false });
  const [segments, setSegments] = useState([]);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [crop, setCrop] = useState(emptyCrop);
  const [clipboard, setClipboard] = useState([]);
  const [cutMarkers, setCutMarkers] = useState([]); // array of { start, end }
  const [outputPath, setOutputPath] = useState("");
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [status, setStatus] = useState("動画を選択してください。");
  const [errorText, setErrorText] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingIndeterminate, setLoadingIndeterminate] = useState(false);

  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportIndeterminate, setExportIndeterminate] = useState(false);
  const [exportSegments, setExportSegments] = useState(null);

  const [previewBounds, setPreviewBounds] = useState(null);
  const [isCropSelecting, setIsCropSelecting] = useState(false);
  const [cropDraft, setCropDraft] = useState(null);
  const [previewLoadProgress, setPreviewLoadProgress] = useState(0);
  const [previewLoadedUntil, setPreviewLoadedUntil] = useState(0);
  const [previewLoadMessage, setPreviewLoadMessage] = useState("未読み込み");
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewPlaybackRate, setPreviewPlaybackRate] = useState(1);
  const [isCropPreviewLocked, setIsCropPreviewLocked] = useState(false);
  const [undoStack, setUndoStack] = useState([]);

  const totalDuration = useMemo(() => timelineDuration(segments), [segments]);
  const selectedRange = useMemo(
    () => normalizeRange(selectionStart, selectionEnd, totalDuration),
    [selectionStart, selectionEnd, totalDuration]
  );

  const selectedDuration = Math.max(0, selectedRange.end - selectedRange.start);
  const clipboardDuration = useMemo(() => timelineDuration(clipboard), [clipboard]);

  const hasCrop = crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
  const currentCropBoxStyle = useMemo(() => {
    if (!previewBounds) {
      return null;
    }

    return {
      left: `${crop.left}%`,
      top: `${crop.top}%`,
      width: `${Math.max(0, 100 - crop.left - crop.right)}%`,
      height: `${Math.max(0, 100 - crop.top - crop.bottom)}%`
    };
  }, [crop, previewBounds]);

  const previewVideoStyle = useMemo(() => {
    if (!hasCrop || !isCropPreviewLocked) {
      return undefined;
    }

    const keptWidth = Math.max(1, 100 - crop.left - crop.right);
    const keptHeight = Math.max(1, 100 - crop.top - crop.bottom);

    // Use uniform scaling to avoid non-uniform stretching.
    const scale = 100 / Math.max(keptWidth, keptHeight);

    return {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transformOrigin: "top left",
      transform: `scale(${scale}) translate(-${crop.left}%, -${crop.top}%)`
    };
  }, [crop, hasCrop, isCropPreviewLocked]);

  const previewViewportStyle = useMemo(() => {
    if (!isCropPreviewLocked || !hasCrop || !previewBounds) {
      return undefined;
    }

    return {
      left: `${previewBounds.left}px`,
      top: `${previewBounds.top}px`,
      width: `${previewBounds.width}px`,
      height: `${previewBounds.height}px`
    };
  }, [hasCrop, isCropPreviewLocked, previewBounds]);


  const draftCropBoxStyle = useMemo(() => {
    if (!cropDraft || !previewBounds) {
      return null;
    }

    const left = Math.min(cropDraft.startX, cropDraft.endX);
    const top = Math.min(cropDraft.startY, cropDraft.endY);
    const width = Math.abs(cropDraft.endX - cropDraft.startX);
    const height = Math.abs(cropDraft.endY - cropDraft.startY);

    return {
      left: `${(left / previewBounds.width) * 100}%`,
      top: `${(top / previewBounds.height) * 100}%`,
      width: `${(width / previewBounds.width) * 100}%`,
      height: `${(height / previewBounds.height) * 100}%`
    };
  }, [cropDraft, previewBounds]);

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
  }, [totalDuration]);

  useEffect(() => {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage(sourceUrl ? "プレビューを読み込み中..." : "未読み込み");
    setIsPreviewReady(false);
    setPreviewCurrentTime(0);
    setIsPreviewPlaying(false);
    setIsCropPreviewLocked(false);
  }, [sourceUrl]);

  useEffect(() => {
    return () => {
      if (loadCompletionTimeoutRef.current) {
        clearTimeout(loadCompletionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editorApi?.onExportProgress) {
      return undefined;
    }

    return editorApi.onExportProgress((payload = {}) => {
      setExportMessage(payload.message || "動画を出力中...");
      setExportProgress(Number(payload.progress) || 0);
      setExportIndeterminate(Boolean(payload.indeterminate));
      setExportSegments(Array.isArray(payload.segments) ? payload.segments : null);
    });
  }, [editorApi]);

  useEffect(() => {
    if (!sourceUrl || !metadata.width || !metadata.height) {
      setPreviewBounds(null);
      return undefined;
    }

    function updatePreviewBounds() {
      const stage = previewStageRef.current;
      if (!stage) {
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) {
        return;
      }

      const widthScale = stageRect.width / metadata.width;
      const heightScale = stageRect.height / metadata.height;
      const scale = Math.min(widthScale, heightScale);
      const width = metadata.width * scale;
      const height = metadata.height * scale;

      setPreviewBounds({
        left: (stageRect.width - width) / 2,
        top: (stageRect.height - height) / 2,
        width,
        height
      });
    }

    updatePreviewBounds();

    const stage = previewStageRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined" && stage
      ? new ResizeObserver(() => updatePreviewBounds())
      : null;

    resizeObserver?.observe(stage);
    window.addEventListener("resize", updatePreviewBounds);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewBounds);
    };
  }, [sourceUrl, metadata.width, metadata.height]);

  function clearLoadCompletionTimeout() {
    if (loadCompletionTimeoutRef.current) {
      clearTimeout(loadCompletionTimeoutRef.current);
      loadCompletionTimeoutRef.current = null;
    }
  }

  function stopLoadingOverlay() {
    clearLoadCompletionTimeout();
    setIsLoading(false);
    setLoadingMessage("");
    setLoadingIndeterminate(false);
    setLoadingProgress(0);
    loadStartTimeRef.current = null;
  }

  function resetExportOverlay() {
    setExportProgress(0);
    setExportMessage("");
    setExportIndeterminate(false);
    exportStartTimeRef.current = null;
  }

  function resetCropSelection() {
    setCropDraft(null);
    setIsCropSelecting(false);
  }

  function setPlayheadWithPreview(nextPlayhead) {
    const safeTime = clamp(Number(nextPlayhead) || 0, 0, totalDuration);
    setPlayhead(safeTime);

    const video = previewVideoRef.current;
    if (video) {
      const delta = Math.abs((Number(video.currentTime) || 0) - safeTime);
      if (delta > 0.05) {
        video.currentTime = safeTime;
      }
    }
  }

  function cloneSegments(items) {
    return items.map((segment) => ({ ...segment }));
  }

  function createUndoSnapshot() {
    return {
      segments: cloneSegments(segments),
      selectionStart,
      selectionEnd,
      playhead,
      clipboard: cloneSegments(clipboard),
      cutMarkers: Array.isArray(cutMarkers) ? cutMarkers.map((m) => (m && typeof m === 'object' ? { start: m.start, end: m.end } : { start: Number(m) || 0, end: Number(m) || 0 })) : [],
      crop: { ...crop },
      isCropPreviewLocked,
      outputPath,
      previewCurrentTime
    };
  }

  function pushUndoSnapshot() {
    setUndoStack((current) => [...current.slice(-29), createUndoSnapshot()]);
  }

  function restoreUndoSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    setSegments(cloneSegments(snapshot.segments));
    setSelectionStart(snapshot.selectionStart);
    setSelectionEnd(snapshot.selectionEnd);
    setPlayheadWithPreview(snapshot.playhead);
    setClipboard(cloneSegments(snapshot.clipboard));
    setCutMarkers(Array.isArray(snapshot.cutMarkers) ? snapshot.cutMarkers.map((m) => (m && typeof m === 'object' ? { start: Number(m.start) || 0, end: Number(m.end) || 0 } : { start: Number(m) || 0, end: Number(m) || 0 })) : []);
    setCrop({ ...snapshot.crop });
    setIsCropPreviewLocked(Boolean(snapshot.isCropPreviewLocked));
    setOutputPath(snapshot.outputPath);
    setPreviewCurrentTime(snapshot.previewCurrentTime || 0);
    resetCropSelection();
    setErrorText("");
  }

  function handleUndo() {
    setUndoStack((current) => {
      if (!current.length) {
        setErrorText("これ以上戻せる操作がありません。");
        return current;
      }

      const next = [...current];
      const snapshot = next.pop();
      restoreUndoSnapshot(snapshot);
      setStatus("ひとつ前の状態に戻しました。");
      return next;
    });
    }
 
  function splitSegmentsAtPreviewTime(currentSegments, sourceTime, preferredTimelineTime) {
    const targetTime = Math.max(0, Number(sourceTime) || 0);
    const preferredTime = Math.max(0, Number(preferredTimelineTime) || 0);
    let cursor = 0;
    let preferredIndex = -1;

    for (let index = 0; index < currentSegments.length; index += 1) {
      const duration = segmentDuration(currentSegments[index]);
      const start = cursor;
      const end = cursor + duration;
      if (preferredTime >= start && preferredTime <= end) {
        preferredIndex = index;
        break;
      }
      cursor = end;
    }

    const candidateIndexes = [];
    if (preferredIndex >= 0) {
      candidateIndexes.push(preferredIndex);
    }
    for (let index = 0; index < currentSegments.length; index += 1) {
      if (index !== preferredIndex) {
        candidateIndexes.push(index);
      }
    }

    let timelineCursor = 0;
    const timelineStarts = currentSegments.map((segment) => {
      const start = timelineCursor;
      timelineCursor += segmentDuration(segment);
      return start;
    });

    for (const index of candidateIndexes) {
      const segment = currentSegments[index];
      const splitOffset = targetTime - Number(segment.start || 0);
      const duration = segmentDuration(segment);
      if (!(splitOffset > 0 && splitOffset < duration)) {
        continue;
      }

      const splitPoint = Number(segment.start) + splitOffset;
      const nextSegments = [];
      currentSegments.forEach((item, itemIndex) => {
        if (itemIndex !== index) {
          nextSegments.push({ ...item });
          return;
        }

        nextSegments.push({ start: item.start, end: splitPoint });
        nextSegments.push({ start: splitPoint, end: item.end });
      });

      return {
        nextSegments,
        timelineSplitTime: timelineStarts[index] + splitOffset
      };
    }

    return null;
  }

  function splitSegmentsAtTimelinePositions(currentSegments, splitTimes) {
    const total = timelineDuration(currentSegments);
    const times = Array.from(new Set((splitTimes || []).map((t) => Number(t) || 0))).sort((a, b) => a - b).filter((t) => t > 0 && t < total);
    if (!times.length) return null;

    let timelineCursor = 0;
    const nextSegments = [];

    for (const segment of currentSegments) {
      const segDuration = segmentDuration(segment);
      const segStartTime = timelineCursor;
      const segEndTime = timelineCursor + segDuration;

      const innerSplits = times.filter((t) => t > segStartTime && t < segEndTime).map((t) => segment.start + (t - segStartTime));

      if (!innerSplits.length) {
        nextSegments.push({ ...segment });
      } else {
        const boundaries = [segment.start, ...innerSplits, segment.end];
        for (let i = 0; i < boundaries.length - 1; i += 1) {
          const a = boundaries[i];
          const b = boundaries[i + 1];
          if (b - a > 1e-9) {
            nextSegments.push({ start: a, end: b });
          }
        }
      }

      timelineCursor = segEndTime;
    }

    return nextSegments;
  }

  function updatePreviewLoadState(video) {
    if (!video) {
      return;
    }

    const duration = Math.max(0, Number(video.duration) || Number(metadata.duration) || 0);
    let bufferedUntil = 0;

    if (video.buffered?.length) {
      for (let index = 0; index < video.buffered.length; index += 1) {
        bufferedUntil = Math.max(bufferedUntil, Number(video.buffered.end(index)) || 0);
      }
    }

    const loadedUntil = duration > 0 ? clamp(bufferedUntil, 0, duration) : 0;
    const complete = (duration > 0 && loadedUntil >= Math.max(duration - 0.25, duration * 0.98)) || video.readyState >= 4;
    const progress = complete ? 100 : duration > 0 ? (loadedUntil / duration) * 100 : video.readyState >= 1 ? 15 : 0;

    setPreviewLoadedUntil(complete ? duration : loadedUntil);
    setPreviewLoadProgress(progress);
    setIsPreviewReady(complete);

    if (complete) {
      setPreviewLoadMessage("プレビューの再生準備が完了しました。");
      return;
    }

    if (progress > 0) {
      setPreviewLoadMessage(`プレビューを読み込み中... ${Math.round(progress)}%`);
      return;
    }

    setPreviewLoadMessage("プレビューを読み込み中...");
  }

  function handlePreviewVideoLoadStart(event) {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage("プレビューを読み込み中...");
    setIsPreviewReady(false);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoProgress(event) {
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoReady(event) {
    setPreviewCurrentTime(Number(event.currentTarget.currentTime) || 0);
    updatePreviewLoadState(event.currentTarget);
  }

  function handlePreviewVideoWaiting(event) {
    updatePreviewLoadState(event.currentTarget);
    setPreviewLoadMessage("プレビューを追加で読み込み中...");
  }

  function handlePreviewVideoError() {
    setPreviewLoadProgress(0);
    setPreviewLoadedUntil(0);
    setPreviewLoadMessage("プレビューの読み込みに失敗しました。");
    setIsPreviewReady(false);
  }

  function handlePreviewTimeUpdate(event) {
    const currentTime = Number(event.currentTarget.currentTime) || 0;
    setPreviewCurrentTime(currentTime);
    setPlayhead((current) => Math.abs(current - currentTime) > 0.15 ? currentTime : current);
  }

  async function handleTogglePreviewPlayback() {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }

    try {
      if (video.paused) {
        await video.play();
        setIsPreviewPlaying(true);
      } else {
        video.pause();
        setIsPreviewPlaying(false);
      }
    } catch (error) {
      console.error("Failed to toggle preview playback", error);
      setErrorText("プレビューの再生操作に失敗しました。");
    }
  }

  useEffect(() => {
    const v = previewVideoRef.current;
    if (v) {
      v.playbackRate = previewPlaybackRate;
    }
  }, [previewPlaybackRate]);

  function handleTogglePreviewSpeed() {
    const next = previewPlaybackRate === 1 ? 0.5 : 1;
    setPreviewPlaybackRate(next);
    const v = previewVideoRef.current;
    if (v) v.playbackRate = next;
    setStatus(next === 1 ? "プレビュー速度を通常に戻しました。" : "プレビュー速度を低速（0.5×）にしました。");
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat) return;
      const code = e.code || e.key;
      if (code === "Space" || code === "Enter") {
        const target = e.target;
        const tag = target && target.tagName ? String(target.tagName).toLowerCase() : null;
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        e.preventDefault?.();
        handleTogglePreviewPlayback();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTogglePreviewPlayback]);

  function handleSplitAtPreview() {
    if (!segments.length) {
      setErrorText("先に動画を読み込んでください。");
      return;
    }

    // If a timeline range is selected, split at both boundaries.
    if (selectedDuration > 0) {
      const splitTimes = [selectedRange.start, selectedRange.end];
      const next = splitSegmentsAtTimelinePositions(segments, splitTimes);
      if (!next) {
        setErrorText("選択範囲で分割できる場所がありません。");
        return;
      }
      // if no change
      if (next.length === segments.length && next.every((s, i) => s.start === segments[i]?.start && s.end === segments[i]?.end)) {
        setErrorText("選択範囲は既にセグメント境界に分かれています。");
        return;
      }
      pushUndoSnapshot();
      setSegments(next);
      setSelectionStart(selectedRange.start);
      setSelectionEnd(selectedRange.end);
      setPlayheadWithPreview(selectedRange.start);
      setStatus(`選択範囲 ${formatVideoTime(selectedRange.start)} - ${formatVideoTime(selectedRange.end)} で分割しました。`);
      setErrorText("");
      return;
    }

    // Otherwise fall back to splitting at the current preview playhead
    const sourceTime = Number(previewVideoRef.current?.currentTime) || previewCurrentTime;
    const result = splitSegmentsAtPreviewTime(segments, sourceTime, playhead);

    if (!result) {
      setErrorText("現在の画面位置では分割できません。セグメントの内側で停止してください。");
      return;
    }

    pushUndoSnapshot();
    setSegments(result.nextSegments);
    setSelectionStart(result.timelineSplitTime);
    setSelectionEnd(result.timelineSplitTime);
    setPlayheadWithPreview(result.timelineSplitTime);
    setStatus(`画面の位置 ${formatVideoTime(sourceTime)} で分割しました。`);
    setErrorText("");
  }

  function getPreviewPoint(clientX, clientY) {
    const stage = previewStageRef.current;
    if (!stage || !previewBounds) {
      return null;
    }

    const stageRect = stage.getBoundingClientRect();
    return {
      x: clamp(clientX - stageRect.left - previewBounds.left, 0, previewBounds.width),
      y: clamp(clientY - stageRect.top - previewBounds.top, 0, previewBounds.height)
    };
  }


  function handlePreviewPointerDown(event) {
    if (!isCropSelecting) {
      return;
    }

    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setCropDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
  }

  function handleStartCropSelection() {
    if (!sourceUrl || !previewBounds) {
      return;
    }

    setCropDraft(null);
    setIsCropSelecting(true);
    setIsCropPreviewLocked(false);
    setStatus("プレビュー上をドラッグして、残したい範囲を指定してください。");
  }

  function handleToggleCropPreviewLock() {
    if (!hasCrop) {
      setErrorText("先に crop 範囲を指定してください。");
      return;
    }

    const nextLocked = !isCropPreviewLocked;
    setIsCropPreviewLocked(nextLocked);
    setErrorText("");
    setStatus(nextLocked ? "crop 範囲だけをプレビューに固定しました。" : "プレビュー全体の表示に戻しました。");
  }

  function handleClearCrop() {
    pushUndoSnapshot();
    setCrop(emptyCrop);
    setIsCropPreviewLocked(false);
    resetCropSelection();
    setErrorText("");
    setStatus("crop を解除しました。");
  }

  function handlePreviewPointerMove(event) {
    if (!cropDraft) {
      return;
    }

    const point = getPreviewPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    // Crop selection → always square. Use the larger axis so dragging to the corner
    // can expand the square to the full preview bounds, then clamp to bounds.
    setCropDraft((current) => {
      if (!current) return current;

      const dx = point.x - current.startX;
      const dy = point.y - current.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const desired = Math.max(absDx, absDy);

      // Pointer clamped within preview
      const px = clamp(point.x, 0, previewBounds.width);
      const py = clamp(point.y, 0, previewBounds.height);

      // Determine which corner the pointer represents relative to start
      const toRight = dx >= 0;
      const toBottom = dy >= 0;

      // Try to place square with pointer as the corner, then adjust to fit bounds
      let s = desired;
      let startX, startY, endX, endY;

      if (toRight && toBottom) {
        endX = px;
        endY = py;
        startX = endX - s;
        startY = endY - s;
        if (startX < 0) {
          startX = 0;
          endX = startX + s;
        }
        if (startY < 0) {
          startY = 0;
          endY = startY + s;
        }
        if (endX > previewBounds.width) {
          s = previewBounds.width - startX;
          endX = startX + s;
        }
        if (endY > previewBounds.height) {
          s = Math.min(s, previewBounds.height - startY);
          endY = startY + s;
        }
      } else if (!toRight && toBottom) {
        endX = px;
        endY = py;
        startX = endX + s;
        startY = endY - s;
        // when pointer is bottom-left, startX should be > endX, adjust
        startX = Math.min(startX, previewBounds.width);
        if (startX > previewBounds.width) startX = previewBounds.width;
        if (startY < 0) {
          startY = 0;
          endY = startY + s;
        }
        // recompute using endX as left edge
        startX = endX + s > previewBounds.width ? previewBounds.width : endX + s;
        // correct positions
        startX = Math.max(0, Math.min(previewBounds.width, startX));
        endX = startX - s;
        if (endX < 0) {
          s = startX;
          endX = 0;
          startX = s;
        }
        // ensure vertical fit
        if (endY > previewBounds.height) {
          s = Math.min(s, previewBounds.height - startY);
          startX = endX + s;
          startY = endY - s;
        }
      } else if (toRight && !toBottom) {
        endX = px;
        endY = py;
        startX = endX - s;
        startY = endY + s;
        if (startY > previewBounds.height) startY = previewBounds.height;
        if (startX < 0) {
          startX = 0;
          endX = startX + s;
        }
        endY = startY - s;
        if (endY < 0) {
          s = startY;
          endY = 0;
          startY = s;
        }
      } else {
        // pointer is top-left relative to start
        endX = px;
        endY = py;
        startX = endX + s;
        startY = endY + s;
        if (startX > previewBounds.width) startX = previewBounds.width;
        if (startY > previewBounds.height) startY = previewBounds.height;
        endX = startX - s;
        endY = startY - s;
        if (endX < 0) {
          s = startX;
          endX = 0;
          startX = s;
        }
        if (endY < 0) {
          s = startY;
          endY = 0;
          startY = s;
        }
      }

      // final clamp
      startX = clamp(startX, 0, previewBounds.width);
      startY = clamp(startY, 0, previewBounds.height);
      endX = clamp(endX, 0, previewBounds.width);
      endY = clamp(endY, 0, previewBounds.height);

      return { startX, startY, endX, endY };
    });
  }

  function handlePreviewPointerUp(event) {
    if (!cropDraft) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // finalize crop using helpers in crop module
    const square = computeSquareDraft(cropDraft.startX, cropDraft.startY, cropDraft.endX, cropDraft.endY, previewBounds);
    if (!square) {
      setStatus("ドラッグして残したい範囲を選択してください。");
      setCropDraft(null);
      return;
    }

    const { startX, startY, endX, endY } = square;
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width < 12 || height < 12) {
      setStatus("ドラッグして残したい範囲を選択してください。");
      setCropDraft(null);
      return;
    }

    const percent = computeCropPercentFromSquare(startX, startY, endX, endY, previewBounds);
    const nextCrop = normalizeCropInput(percent);
    pushUndoSnapshot();
    setCrop(nextCrop);
    setCropDraft(null);
    setIsCropSelecting(false);
    setIsCropPreviewLocked(false);
    setErrorText("");
    setStatus("プレビューで crop 範囲を更新しました。");
  }

  async function loadSource(result) {
    if (!result?.filePath) {
      stopLoadingOverlay();
      setErrorText("読み込み対象の動画ファイルが見つかりません。");
      setStatus("読み込みに失敗しました。");
      return;
    }

    if (!editorApi) {
      stopLoadingOverlay();
      setErrorText("Electron 上で起動してください。");
      setStatus("読み込みに失敗しました。");
      return;
    }

    setErrorText("");
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("ファイル選択中...");
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      setLoadingProgress(10);
      setLoadingMessage("動画情報を読み込み中...");
      setLoadingIndeterminate(true);
      const info = result.info || (await editorApi.probeVideo(result.filePath));
      
      setLoadingProgress(40);
      setLoadingMessage("メタデータを処理中...");
      setLoadingIndeterminate(false);
      
      setSourcePath(result.filePath);
      setSourceUrl(result.fileUrl);
      setSourceName(result.fileName || result.filePath.split(/[\\/]/).pop() || "video");
      
      setLoadingProgress(70);
      setLoadingMessage("タイムラインを構築中...");
      
      setMetadata(info);
      setSegments(createFullTimeline(info.duration));
      setSelectionStart(0);
      setSelectionEnd(info.duration);
      setPlayheadWithPreview(0);
      setClipboard([]);
      setOutputPath("");
      setCrop(emptyCrop);
      setUndoStack([]);
      resetCropSelection();
      
      setLoadingProgress(100);
      setLoadingMessage("完了！");

      clearLoadCompletionTimeout();
      loadCompletionTimeoutRef.current = setTimeout(() => {
        stopLoadingOverlay();
        setStatus("動画を読み込みました。切り取り範囲と crop を調整してください。");
      }, 500);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      setErrorText(error?.message || "動画の読み込みに失敗しました。");
      setStatus("読み込みに失敗しました。");
    }
  }

  async function handleChooseSource() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage("ファイルダイアログを開いています...");
    setLoadingIndeterminate(true);
    loadStartTimeRef.current = Date.now();

    try {
      const result = await editorApi.selectSource();
      if (!result) {
        stopLoadingOverlay();
        setStatus("動画の選択をキャンセルしました。");
        return;
      }

      await loadSource(result);
    } catch (error) {
      stopLoadingOverlay();
      setLoadingProgress(0);
      setErrorText(error?.message || "動画ファイルの選択に失敗しました。");
      setStatus("読み込みを開始できませんでした。");
    }
  }

  async function handleChooseOutput() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }
    const result = await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" });
    if (!result) {
      return;
    }
    setOutputPath(result.filePath);
    setStatus(`出力先を設定しました: ${result.filePath}`);
  }

  function handleOpenExportConfirm() {
    if (!sourcePath || !segments.length) {
      setErrorText("出力する動画を先に読み込んでください。");
      return;
    }

    setErrorText("");
    setIsExportConfirmOpen(true);
  }

  function handleCloseExportConfirm() {
    if (isExporting) {
      return;
    }

    setIsExportConfirmOpen(false);
  }

  function handleResetTimeline() {
    if (!metadata.duration) {
      return;
    }
    pushUndoSnapshot();
    setSegments(createFullTimeline(metadata.duration));
    setSelectionStart(0);
    setSelectionEnd(metadata.duration);
    setPlayheadWithPreview(0);
    setClipboard([]);
    setStatus("タイムラインを初期状態に戻しました。");
    setErrorText("");
  }

  function handleCopy() {
    const copied = extractRange(segments, selectedRange.start, selectedRange.end);
    if (!copied.length) {
      setErrorText("コピーする範囲がありません。");
      return;
    }
    setClipboard(copied);
    setPlayheadWithPreview(selectedRange.end);
    setStatus(`範囲をコピーしました。長さ ${formatVideoTime(timelineDuration(copied))}`);
    setErrorText("");
  }

  function handleDelete() {
    if (selectedDuration === 0) {
      setErrorText("削除する範囲を指定してください。");
      return;
    }
    pushUndoSnapshot();
    setSegments(removeRange(segments, selectedRange.start, selectedRange.end));
    setSelectionEnd(selectedRange.start);
    setPlayheadWithPreview(selectedRange.start);
    setStatus("選択範囲を削除しました。");
    setErrorText("");
  }

  function handleDeleteSegment(index) {
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
    setStatus(`パーツ ${index + 1} を削除しました。`);
    setErrorText("");
  }

  function handleCut() {
    const splitTime = clamp(Number(playhead) || 0, 0, totalDuration);
    if (splitTime <= 0 || splitTime >= totalDuration) {
      setErrorText("先頭または末尾では切り取りできません。中間の位置で押してください。");
      return;
    }

    const next = splitSegmentsAtTimelinePositions(segments, [splitTime]);
    if (!next) {
      setErrorText("現在の位置では切り取りできません。");
      return;
    }

    if (next.length === segments.length && next.every((segment, index) => segment.start === segments[index]?.start && segment.end === segments[index]?.end)) {
      setErrorText("この位置はすでに切り取り済みです。別の位置で押してください。");
      return;
    }

    pushUndoSnapshot();
    setSegments(next);
    setCutMarkers((current) => [...current.slice(-99), splitTime]);

    setSelectionStart(splitTime);
    setSelectionEnd(splitTime);
    setPlayheadWithPreview(splitTime);
    setStatus(`${formatVideoTime(splitTime)} でタイムラインを分割しました。`);
    setErrorText("");
  }

  function handlePaste() {
    if (!clipboard.length) {
      setErrorText("貼り付けるクリップがありません。先にコピーまたは切り取りを行ってください。");
      return;
    }

    pushUndoSnapshot();
    const nextSegments = insertSegmentsAt(segments, playhead, clipboard);
    setSegments(nextSegments);
    const insertedDuration = timelineDuration(clipboard);
    setSelectionStart(playhead);
    setSelectionEnd(playhead + insertedDuration);
    setPlayheadWithPreview(playhead + insertedDuration);
    setStatus(`貼り付けました。長さ ${formatVideoTime(insertedDuration)} を挿入しました。`);
    setErrorText("");
  }

  async function handleExport() {
    if (!editorApi) {
      setErrorText("Electron 上で起動してください。");
      return;
    }

    if (!sourcePath || !segments.length) {
      setErrorText("出力する動画を先に読み込んでください。");
      return;
    }

    const safeSegments = segments.filter((segment) => segmentDuration(segment) > 0);
    if (!safeSegments.length) {
      setErrorText("出力できるセグメントがありません。");
      return;
    }

    const chosenOutput = outputPath || (await editorApi.selectOutput({ suggestedName: sourceName || "edited-video.mp4" }))?.filePath;
    if (!chosenOutput) {
      return;
    }

    setOutputPath(chosenOutput);
    setIsExporting(true);
    setIsExportConfirmOpen(false);
    setExportProgress(0);
    setExportMessage("出力準備中...");
    setExportIndeterminate(true);
    exportStartTimeRef.current = Date.now();
    setErrorText("");
    setStatus("動画を出力中...");

    try {
      const result = await editorApi.exportVideo({
        sourcePath,
        outputPath: chosenOutput,
        segments: safeSegments,
        crop: normalizeCropInput(crop)
      });
      const outputPaths = Array.isArray(result?.outputPaths) && result.outputPaths.length
        ? result.outputPaths
        : [chosenOutput];
      setStatus(`${outputPaths.length} 個のファイルを出力しました。`);

      await editorApi.revealInFolder(outputPaths[0]);
    } catch (error) {
      setErrorText(error?.message || "動画の出力に失敗しました。");

      setStatus("エラー: 動画の出力に失敗しました。");
    } finally {
      setIsExporting(false);
      resetExportOverlay();
    }
  }

  if (!editorApi) {
    return (
      <main className="editor-shell editor-shell--no-api">
        <section className="hero card">
          <p className="eyebrow">Video Editing</p>
          <h1>Electron で起動してください</h1>
          <p>このアプリはローカルの FFmpeg 実行を使うため、ブラウザ単体では動きません。</p>
        </section>
      </main>
    );
  }
  return (
    <>
      <LoadingIndicator
        isVisible={isLoading || isExporting}
        message={isExporting ? exportMessage || "動画を出力中..." : loadingMessage}
        progress={isExporting ? exportProgress : loadingProgress}
        indeterminate={isExporting ? exportIndeterminate : loadingIndeterminate}
        segments={isExporting ? exportSegments : null}
        startTime={isExporting ? exportStartTimeRef.current : loadStartTimeRef.current}
      />
    <main className="editor-shell">
      <section className="hero card">
        <div className="hero-head">
          <div>
            <p className="eyebrow">Video Editing Studio</p>
            <h1>Video Editor</h1>
            <p>{status}</p>
          </div>

          <div className="hero-actions" style={{ marginRight: 12 }}>
            <button type="button" onClick={handleChooseSource}>動画を選択</button>
          </div>
        </div>

        <div className="status-strip">
          <div>
            <span>ソース</span>
            <strong>{sourceName || "未選択"}</strong>
          </div>
          <div>
            <span>動画時間</span>
            <strong>{formatVideoTime(metadata.duration) || "-"}</strong>
          </div>
          <div>
            <span>解像度</span>
            <strong>{metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : "-"}</strong>
          </div>
        </div>
      </section>

      <section className="editor-grid">
        <article className="panel panel--preview card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                <h2>Preview</h2>
              </p>
            </div>
          </div>

          <div
            ref={previewStageRef}
            className={`preview-stage${isCropSelecting ? " preview-stage--crop-mode" : ""}`}
            onPointerDown={handlePreviewPointerDown}
            onPointerMove={handlePreviewPointerMove}
            onPointerUp={handlePreviewPointerUp}
            onPointerCancel={() => setCropDraft(null)}
          >
            {sourceUrl ? (
              <>
                <div
                  className={`preview-video-viewport${isCropPreviewLocked && hasCrop ? " preview-video-viewport--cropped" : ""}`}
                  style={previewViewportStyle}
                >
                  <video
                    key={sourceUrl}
                    ref={previewVideoRef}
                    className="preview-video"
                    src={sourceUrl}
                    style={previewVideoStyle}
                    playsInline
                    onTimeUpdate={handlePreviewTimeUpdate}
                    onSeeked={handlePreviewTimeUpdate}
                    onPlay={() => setIsPreviewPlaying(true)}
                    onPause={() => setIsPreviewPlaying(false)}
                    onEnded={() => setIsPreviewPlaying(false)}
                    onLoadStart={handlePreviewVideoLoadStart}
                    onLoadedMetadata={handlePreviewVideoReady}
                    onLoadedData={handlePreviewVideoReady}
                    onCanPlay={handlePreviewVideoReady}
                    onCanPlayThrough={handlePreviewVideoReady}
                    onProgress={handlePreviewVideoProgress}
                    onWaiting={handlePreviewVideoWaiting}
                    onError={handlePreviewVideoError}
                  />
                </div>
                {previewBounds && !isCropPreviewLocked ? (
                  <div
                    className={`preview-crop-overlay${isCropSelecting ? " preview-crop-overlay--interactive" : ""}`}
                    style={{
                      left: `${previewBounds.left}px`,
                      top: `${previewBounds.top}px`,
                      width: `${previewBounds.width}px`,
                      height: `${previewBounds.height}px`
                    }}
                  >
                    {hasCrop && !cropDraft && currentCropBoxStyle ? (
                      <div className="preview-crop-selection" style={currentCropBoxStyle}>
                        <span className="preview-crop-selection__label">現在の crop</span>
                      </div>
                    ) : null}
                    {cropDraft && draftCropBoxStyle ? (
                      <div className="preview-crop-selection preview-crop-selection--draft" style={draftCropBoxStyle}>
                        <span className="preview-crop-selection__label">選択中</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="preview-empty">動画を読み込むとここにプレビューが表示されます。</div>
            )}
          </div>

          {sourceUrl ? (
            <div className="preview-transport">
              <button type="button" className="secondary-button" onClick={handleTogglePreviewPlayback} disabled={!isPreviewReady}>
                {isPreviewPlaying ? "停止" : "再生"}
              </button>
              <button
                type="button"
                className={previewPlaybackRate === 1 ? "ghost-button" : "secondary-button"}
                onClick={handleTogglePreviewSpeed}
                disabled={!isPreviewReady}
              >
                {previewPlaybackRate === 1 ? "低速" : "通常"}
              </button>
              <span className="preview-transport__time">{formatVideoTime(previewCurrentTime)} / {formatVideoTime(metadata.duration)}</span>
              <span className="preview-transport__hint">再生位置の変更は下のタイムラインで行います。</span>
            </div>
          ) : null}
          
          
          <TimelineVisualizer
        playhead={playhead}
        selectionStart={selectedRange.start}
        selectionEnd={selectedRange.end}
        totalDuration={totalDuration}
        segments={segments}
        markers={cutMarkers}
        onPlayheadChange={setPlayheadWithPreview}
        onSelectionStartChange={setSelectionStart}
        onSelectionEndChange={setSelectionEnd}
      />

      <div className="action-row action-row--secondary preview-crop-actions">
        <div className="action-row action-row--tools">
          <button type="button" className="secondary-button" onClick={handleCopy} disabled={!segments.length || isExporting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">⧉</span><span>コピー</span></span>
          </button>
          <button type="button" onClick={handleCut} disabled={!segments.length || isExporting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">✂</span><span>カット</span></span>
          </button>
          <button type="button" className="danger-button" onClick={handleDelete} disabled={!segments.length || isExporting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">⌦</span><span>削除</span></span>
          </button>
          <button type="button" className="secondary-button" onClick={handlePaste} disabled={!clipboard.length || isExporting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">↳</span><span>貼る</span></span>
          </button>
        </div>

        <div className="action-row" style={{ marginTop: 8 }}>
          <button type="button" className="ghost-button" onClick={handleUndo} disabled={!undoStack.length || isExporting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">↶</span><span>戻す</span></span>
          </button>
        </div>

        <div className="action-row" style={{ marginTop: 8 }}>
          <button type="button" className={isCropSelecting ? "secondary-button" : "ghost-button"} onClick={handleStartCropSelection} disabled={!sourceUrl || !previewBounds}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">▣</span><span>{isCropSelecting ? "選択中" : "crop"}</span></span>
          </button>
          <button type="button" className={isCropPreviewLocked ? "secondary-button" : "ghost-button"} onClick={handleToggleCropPreviewLock} disabled={!sourceUrl || !hasCrop || isCropSelecting}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">◫</span><span>{isCropPreviewLocked ? "表示を戻す" : "crop完了"}</span></span>
          </button>
          <button type="button" className="ghost-button" onClick={handleClearCrop} disabled={!sourceUrl || !hasCrop}>
            <span className="button-content"><span className="button-icon" aria-hidden="true">□</span><span>解除</span></span>
          </button>
        </div>

      </div>
    </article>
      <aside className="panel card panel--side">
          <section className="side-section timeline-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Composition</p>
                <h2>現在のタイムライン</h2>
              </div>
              <div className="panel-head-meta">
                <span>順序どおりに export されます</span>
              </div>
            </div>

            <div className="timeline-list">
              {segments.length ? (
                segments.map((segment, index) => {
                  const duration = segmentDuration(segment);
                  return (
                    <div className="timeline-item" key={`${segment.start}-${segment.end}-${index}`}>
                      <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{formatVideoTime(segment.start)} - {formatVideoTime(segment.end)}</strong>
                        <p>長さ {formatVideoTime(duration)}</p>
                      </div>
                      <div className="timeline-badge">{duration.toFixed(2)}s</div>
                      <button type="button" className="ghost-button timeline-item-delete" onClick={() => handleDeleteSegment(index)} disabled={isExporting}>削除</button>
                    </div>
                  );
                })
              ) : (
                <div className="timeline-empty">まだセグメントがありません。</div>
              )}
            </div>
          </section>

          <section className="side-section export-panel">
            <div>
              <p className="eyebrow">Export</p>
              <h2>動画出力</h2>
              <p className="subtle">右側のボタンから出力確認を開きます。</p>
            </div>

            <div className="action-row export-actions">
              <button type="button" onClick={handleOpenExportConfirm} disabled={isExporting || !segments.length || !sourcePath}>
                {isExporting ? "出力中..." : "動画出力"}
              </button>
            </div>

            {errorText ? <p className="error-message">{errorText}</p> : null}
          </section>
        </aside>
      </section>

      {isExportConfirmOpen ? (
        <div className="export-confirm-overlay" role="dialog" aria-modal="true" aria-label="動画出力の確認">
          <div className="export-confirm-dialog card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Export Confirmation</p>
                <h2>動画出力の確認</h2>
              </div>
              <div className="panel-head-meta">
                <span>確認後に出力を開始します</span>
              </div>
            </div>

            <div className="export-confirm-body">
              <div className="export-meta">
                <span>ソース: {sourceName || "未選択"}</span>
                <span>セグメント数: {segments.length}</span>
                <span>出力映像長: {formatVideoTime(totalDuration)}</span>
                <span>現在の crop: {formatCrop(crop)}</span>
                <span>音声: {metadata.hasAudio ? "あり" : "なし"}</span>
              </div>

              <div className="export-meta">
                <span>出力先: {outputPath || "未設定"}</span>
              </div>
            </div>

            <div className="action-row export-confirm-actions">
              <button type="button" className="secondary-button" onClick={handleChooseOutput} disabled={isExporting}>
                {outputPath ? "出力先を変更" : "出力先を選ぶ"}
              </button>
              <button type="button" className="ghost-button" onClick={handleCloseExportConfirm} disabled={isExporting}>
                キャンセル
              </button>
              <button type="button" onClick={handleExport} disabled={isExporting || !sourcePath || !segments.length}>
                {isExporting ? "出力中..." : "この内容で出力"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
    </>
  );
}
